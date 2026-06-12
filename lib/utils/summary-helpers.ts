import type { PrintData } from "@/lib/utils/print-helpers";
import { compareItemsBySortKeys, type SortKey } from "@/lib/utils/print-helpers";

// ─── Types ───────────────────────────────────────────────

/**
 * A bundle containing PrintData for a single order.
 * Used by buildSummaryRows to combine items from multiple orders.
 */
export interface OrderPrintBundle {
  data: PrintData;
}

/**
 * A single row in the zbirni radni nalog (summary work order).
 */
export interface SummaryRow {
  rb: number;
  articleName: string;
  articleCode: string | null;
  articleDescription: string | null;
  quantity: number;
  parts: string;
  fabricName: string | null;
  customerOrderNumber: string | null;
  notes: string | null;
  loadingNumber: string | null;
  loadingSequence: number | null;
  serialNumber: string | null;
  sourceOrderNumbers: number[];
  deadline: Date | null;
}

// ─── Builder ─────────────────────────────────────────────

/**
 * Build summary rows from multiple order bundles.
 *
 * - **Separate mode** (`aggregate=false`): Flattens all items from all bundles
 *   into individual rows, each tagged with its source order number.
 *   Sorted by order number ascending, then article name ascending.
 *
 * - **Aggregation mode** (`aggregate=true`): Groups items by
 *   `(articleName, articleCode, fabricName)` key. Sums quantities.
 *   Combines non-null/non-empty notes with " | " delimiter.
 *   Collects unique source order numbers.
 */
export function buildSummaryRows(
  bundles: OrderPrintBundle[],
  aggregate: boolean,
  sortKeys: SortKey[] = []
): SummaryRow[] {
  if (!aggregate) {
    return buildSeparateRows(bundles, sortKeys);
  }
  return buildAggregatedRows(bundles, sortKeys);
}

// ─── Separate mode ───────────────────────────────────────

/**
 * Helper: extract short article name (model + dimensions).
 */
function shortName(name: string): string {
  const match = name.match(/^(.+?\s*\d+[Xx×]\d+)/);
  return match ? match[1].trim() : name;
}

/** Sort within serial group: krevet first, madrac second, others last. */
function serialGroupOrder(row: { articleName: string; articleDescription?: string | null; parts?: string }): number {
  const text = `${row.articleName} ${row.articleDescription ?? ""} ${row.parts ?? ""}`.toLowerCase();
  if (text.includes("krevet")) return 0;
  if (text.includes("madrac")) return 1;
  return 2;
}

/**
 * After sorting, regroup items that share the same non-null serial number so
 * they appear consecutively. Within each serial group, order is krevet first,
 * madrac second, others last. Items without a serial number (or with a unique
 * serial) pass through in their sorted position.
 *
 * Algorithm: iterate through the sorted array. On first encounter of a serial
 * number, emit all items with that serial (sorted by serialGroupOrder). Skip
 * subsequent encounters (already emitted).
 */
function regroupBySerial<T extends { serialNumber: string | null; articleName: string; articleDescription?: string | null; parts?: string }>(
  rows: T[]
): T[] {
  // Collect items by serial number
  const serialMap = new Map<string, T[]>();
  for (const row of rows) {
    if (row.serialNumber) {
      if (!serialMap.has(row.serialNumber)) {
        serialMap.set(row.serialNumber, []);
      }
      serialMap.get(row.serialNumber)!.push(row);
    }
  }

  // Sort each serial group internally: krevet first, madrac second
  for (const [, group] of serialMap) {
    if (group.length > 1) {
      group.sort((a, b) => serialGroupOrder(a) - serialGroupOrder(b));
    }
  }

  // Rebuild: on first encounter of a serial, emit the whole group
  const emitted = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (!row.serialNumber) {
      result.push(row);
    } else if (!emitted.has(row.serialNumber)) {
      emitted.add(row.serialNumber);
      const group = serialMap.get(row.serialNumber)!;
      for (const item of group) {
        result.push(item);
      }
    }
    // else: already emitted with the first occurrence
  }
  return result;
}

function buildSeparateRows(bundles: OrderPrintBundle[], sortKeys: SortKey[]): SummaryRow[] {
  // Expand each item into per-unit rows (same logic as buildRadniNalogRows)
  interface PendingRow {
    originalOrder: number;
    articleName: string;
    articleCode: string | null;
    articleDescription: string | null;
    parts: string;
    fabricName: string | null;
    customerOrderNumber: string | null;
    notes: string | null;
    loadingNumber: string | null;
    loadingSequence: number | null;
    serialNumber: string | null;
    sourceOrderNumbers: number[];
    deadline: Date | null;
  }

  const pendingRows: PendingRow[] = [];

  for (const bundle of bundles) {
    const orderNumber = bundle.data.orderNumber;
    for (const item of bundle.data.items) {
      const serialParts = item.serialNumber ? item.serialNumber.split(",") : [];
      for (let i = 0; i < item.quantity; i++) {
        pendingRows.push({
          originalOrder: orderNumber,
          articleName: shortName(item.articleName),
          articleCode: item.articleCode,
          articleDescription: item.articleDescription,
          parts: item.parts.map((p) => p.partName).join("+"),
          fabricName: item.fabric?.name ?? null,
          customerOrderNumber: item.customerOrderNumber ?? null,
          notes: item.notes ?? null,
          loadingNumber: item.loadingNumber ?? null,
          loadingSequence: item.loadingSequence ?? null,
          serialNumber: serialParts[i] ?? item.serialNumber,
          sourceOrderNumbers: [orderNumber],
          deadline: item.deliveryDeadline ?? null,
        });
      }
    }
  }

  // Merge rows that share the same serial number (complementary sets like krevet + madrac)
  // BUT: if rows in the same serial group have different notes, keep them separate
  // (still consecutive, still sharing the serial number).
  const mergedRows: Array<Omit<SummaryRow, "rb">> = [];
  const serialGroups = new Map<string, PendingRow[]>();
  const serialOrder: string[] = []; // preserve first-seen order
  for (const row of pendingRows) {
    if (row.serialNumber) {
      if (!serialGroups.has(row.serialNumber)) {
        serialGroups.set(row.serialNumber, []);
        serialOrder.push(row.serialNumber);
      }
      serialGroups.get(row.serialNumber)!.push(row);
    } else {
      mergedRows.push({ ...row, quantity: 1 });
    }
  }

  /** Check if all rows in a group share the same notes (null/empty treated as equal). */
  function allSameNotes(rows: PendingRow[]): boolean {
    const norm = (n: string | null) => (n == null || n === "" ? null : n);
    const first = norm(rows[0].notes);
    return rows.every((r) => norm(r.notes) === first);
  }

  for (const serial of serialOrder) {
    const groupRows = serialGroups.get(serial)!;
    // Sort: krevet first, madrac second
    groupRows.sort((a, b) => serialGroupOrder(a) - serialGroupOrder(b));
    if (groupRows.length === 1) {
      mergedRows.push({ ...groupRows[0], quantity: 1 });
    } else if (!allSameNotes(groupRows)) {
      // Different notes → don't merge, but keep them consecutive with the shared serial
      // (krevet first, madrac second — already sorted above)
      for (const r of groupRows) {
        mergedRows.push({ ...r, quantity: 1 });
      }
    } else {
      // Same notes → merge into one set row with combined name/code/description
      const first = groupRows[0];
      const allNames = groupRows.map((r) => r.articleName);
      const uniqueNames = [...new Set(allNames)];
      const allCodes = groupRows.map((r) => r.articleCode).filter((c): c is string => c != null);
      const uniqueCodes = [...new Set(allCodes)];
      const allDescriptions = groupRows.map((r) => r.articleDescription ?? r.parts);
      const combinedContent = [...new Set(allDescriptions)].join("\n");
      // Collect all unique source order numbers from the group
      const allOrderNumbers = new Set<number>();
      for (const r of groupRows) {
        for (const on of r.sourceOrderNumbers) allOrderNumbers.add(on);
      }
      mergedRows.push({
        ...first,
        articleName: uniqueNames.length > 1 ? uniqueNames.join("\n") : first.articleName,
        articleCode: uniqueCodes.length > 1 ? uniqueCodes.join("-") : (uniqueCodes[0] ?? first.articleCode),
        articleDescription: combinedContent,
        quantity: 1,
        sourceOrderNumbers: Array.from(allOrderNumbers).sort((a, b) => a - b),
      });
    }
  }

  if (sortKeys.length > 0) {
    // User-selected hierarchical sort (honors Print filter choice).
    mergedRows.sort((a, b) => {
      const cmp = compareItemsBySortKeys(a, b, sortKeys);
      if (cmp !== 0) return cmp;
      // Same sort keys and same non-null serial → preserve krevet-before-madrac order
      if (a.serialNumber && a.serialNumber === b.serialNumber) {
        return serialGroupOrder(a) - serialGroupOrder(b);
      }
      return 0;
    });
  } else {
    // Legacy fallback: sort by source order number ascending, then serial
    // number (keeps split sets together), then krevet-before-madrac within same serial, then article name.
    mergedRows.sort((a, b) => {
      const orderDiff = a.sourceOrderNumbers[0] - b.sourceOrderNumbers[0];
      if (orderDiff !== 0) return orderDiff;
      const aSerial = a.serialNumber ?? "";
      const bSerial = b.serialNumber ?? "";
      if (aSerial !== bSerial) return aSerial.localeCompare(bSerial, "bs", { numeric: true });
      // Same non-null serial → krevet before madrac
      if (a.serialNumber && a.serialNumber === b.serialNumber) {
        const groupCmp = serialGroupOrder(a) - serialGroupOrder(b);
        if (groupCmp !== 0) return groupCmp;
      }
      return a.articleName.localeCompare(b.articleName);
    });
  }

  // Post-sort: ensure items sharing the same non-null serial number are
  // consecutive (krevet before madrac). After any sort key (abc, deliveryDate,
  // etc.) items with the same serial may end up separated. We pull them
  // together at the position of the first occurrence.
  const grouped = regroupBySerial(mergedRows);

  // Assign sequential row numbers (after whichever branch sorted the rows).
  return grouped.map((row, idx) => ({ rb: idx + 1, ...row }));
}

// ─── Aggregation mode ────────────────────────────────────

/**
 * Build the aggregation key for a merged set row.
 * Uses articleName + articleCode + fabricName + loadingNumber.
 * For set rows (merged by serial), articleName and articleCode are already combined.
 */
function makeAggKey(
  articleName: string,
  articleCode: string | null,
  fabricName: string | null,
  loadingNumber: string | null
): string {
  return `${articleName}\0${articleCode ?? ""}\0${fabricName ?? ""}\0${loadingNumber ?? ""}`;
}

interface AggBucket {
  articleName: string;
  articleCode: string | null;
  articleDescription: string | null;
  fabricName: string | null;
  quantity: number;
  parts: string[];
  customerOrderNumbers: string[];
  notes: string[];
  loadingNumbers: string[];
  sourceOrderNumbers: Set<number>;
  loadingSequence: number | null;
  deadline: Date | null;
}

/**
 * Intermediate row after per-unit expansion and serial-number merging,
 * before aggregation grouping.
 */
interface PreAggRow {
  articleName: string;
  articleCode: string | null;
  articleDescription: string | null;
  parts: string;
  fabricName: string | null;
  customerOrderNumber: string | null;
  notes: string | null;
  loadingNumber: string | null;
  loadingSequence: number | null;
  sourceOrderNumbers: number[];
  deadline: Date | null;
}

/**
 * Phase 1: expand items per-unit, merge by serial number into set rows.
 * Returns one row per unit (or per set for complementary items sharing a serial).
 */
function expandAndMergeSets(bundles: OrderPrintBundle[]): PreAggRow[] {
  interface PendingRow extends PreAggRow {
    serialNumber: string | null;
  }

  const pendingRows: PendingRow[] = [];

  for (const bundle of bundles) {
    const orderNumber = bundle.data.orderNumber;
    for (const item of bundle.data.items) {
      const serialParts = item.serialNumber ? item.serialNumber.split(",") : [];
      for (let i = 0; i < item.quantity; i++) {
        pendingRows.push({
          articleName: shortName(item.articleName),
          articleCode: item.articleCode,
          articleDescription: item.articleDescription,
          parts: item.parts.map((p) => p.partName).join("+"),
          fabricName: item.fabric?.name ?? null,
          customerOrderNumber: item.customerOrderNumber ?? null,
          notes: item.notes ?? null,
          loadingNumber: item.loadingNumber ?? null,
          loadingSequence: item.loadingSequence ?? null,
          serialNumber: serialParts[i] ?? item.serialNumber,
          sourceOrderNumbers: [orderNumber],
          deadline: item.deliveryDeadline ?? null,
        });
      }
    }
  }

  // Merge rows sharing the same serial number into set rows.
  // BUT: if rows in the same serial group have different notes, keep them separate.
  const result: PreAggRow[] = [];
  const serialGroups = new Map<string, PendingRow[]>();
  for (const row of pendingRows) {
    if (row.serialNumber) {
      if (!serialGroups.has(row.serialNumber)) serialGroups.set(row.serialNumber, []);
      serialGroups.get(row.serialNumber)!.push(row);
    } else {
      result.push(row);
    }
  }

  /** Check if all rows in a group share the same notes (null/empty treated as equal). */
  function allSameNotes(rows: PendingRow[]): boolean {
    const norm = (n: string | null) => (n == null || n === "" ? null : n);
    const first = norm(rows[0].notes);
    return rows.every((r) => norm(r.notes) === first);
  }

  for (const [, groupRows] of serialGroups) {
    // Sort: krevet first, madrac second
    groupRows.sort((a, b) => serialGroupOrder(a) - serialGroupOrder(b));
    if (groupRows.length === 1) {
      result.push(groupRows[0]);
    } else if (!allSameNotes(groupRows)) {
      // Different notes → don't merge, pass rows through unchanged so aggregation
      // groups them by their individual article name/code/etc.
      for (const r of groupRows) result.push(r);
    } else {
      // Merge complementary set: combine names, codes, descriptions
      const first = groupRows[0];
      const allNames = groupRows.map((r) => r.articleName);
      const uniqueNames = [...new Set(allNames)];
      const allCodes = groupRows.map((r) => r.articleCode).filter((c): c is string => c != null);
      const uniqueCodes = [...new Set(allCodes)];
      const allDescriptions = groupRows.map((r) => r.articleDescription ?? r.parts);
      const combinedContent = [...new Set(allDescriptions)].join("\n");
      const allOrderNumbers = new Set<number>();
      for (const r of groupRows) {
        for (const on of r.sourceOrderNumbers) allOrderNumbers.add(on);
      }
      result.push({
        articleName: uniqueNames.length > 1 ? uniqueNames.join("\n") : first.articleName,
        articleCode: uniqueCodes.length > 1 ? uniqueCodes.join("-") : (uniqueCodes[0] ?? first.articleCode),
        articleDescription: combinedContent,
        parts: first.parts,
        fabricName: first.fabricName,
        customerOrderNumber: first.customerOrderNumber,
        notes: first.notes,
        loadingNumber: first.loadingNumber,
        loadingSequence: first.loadingSequence,
        sourceOrderNumbers: Array.from(allOrderNumbers).sort((a, b) => a - b),
        deadline: first.deadline,
      });
    }
  }

  return result;
}

function buildAggregatedRows(bundles: OrderPrintBundle[], sortKeys: SortKey[]): SummaryRow[] {
  // First: expand per-unit and merge complementary sets by serial number
  const setRows = expandAndMergeSets(bundles);

  // Then: aggregate identical set rows by (articleName, articleCode, fabricName, loadingNumber)
  const buckets = new Map<string, AggBucket>();

  for (const row of setRows) {
    const key = makeAggKey(row.articleName, row.articleCode, row.fabricName, row.loadingNumber);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        articleName: row.articleName,
        articleCode: row.articleCode,
        articleDescription: row.articleDescription,
        fabricName: row.fabricName,
        quantity: 0,
        parts: [],
        customerOrderNumbers: [],
        notes: [],
        loadingNumbers: [],
        loadingSequence: null,
        sourceOrderNumbers: new Set(),
        deadline: null,
      };
      buckets.set(key, bucket);
    }

    bucket.quantity += 1; // Each set row = 1 unit

    if (row.parts && !bucket.parts.includes(row.parts)) {
      bucket.parts.push(row.parts);
    }

    if (row.customerOrderNumber && !bucket.customerOrderNumbers.includes(row.customerOrderNumber)) {
      bucket.customerOrderNumbers.push(row.customerOrderNumber);
    }

    if (row.notes != null && row.notes !== "") {
      bucket.notes.push(row.notes);
    }

    if (row.loadingNumber && !bucket.loadingNumbers.includes(row.loadingNumber)) {
      bucket.loadingNumbers.push(row.loadingNumber);
    }

    if (row.loadingSequence != null && bucket.loadingSequence == null) {
      bucket.loadingSequence = row.loadingSequence;
    }

    for (const on of row.sourceOrderNumbers) {
      bucket.sourceOrderNumbers.add(on);
    }

    // Keep the latest deadline
    if (row.deadline != null) {
      if (bucket.deadline == null || row.deadline > bucket.deadline) {
        bucket.deadline = row.deadline;
      }
    }
  }

  // Convert buckets to rows. `rb` is assigned as 0 here and reassigned after
  // the (optional) sort step so that the final numbering matches the final
  // row order.
  const rows: SummaryRow[] = [];
  for (const bucket of buckets.values()) {
    rows.push({
      rb: 0,
      articleName: bucket.articleName,
      articleCode: bucket.articleCode,
      articleDescription: bucket.articleDescription,
      quantity: bucket.quantity,
      parts: bucket.parts.join(", "),
      fabricName: bucket.fabricName,
      customerOrderNumber: bucket.customerOrderNumbers.join(", ") || null,
      notes: bucket.notes.length > 0 ? [...new Set(bucket.notes)].join(" | ") : null,
      loadingNumber: bucket.loadingNumbers.join(", ") || null,
      serialNumber: null,
      sourceOrderNumbers: Array.from(bucket.sourceOrderNumbers).sort((a, b) => a - b),
      loadingSequence: bucket.loadingSequence,
      deadline: bucket.deadline,
    });
  }

  if (sortKeys.length > 0) {
    // User-selected hierarchical sort (honors Print filter choice).
    // `SummaryRow` objects already carry every field the comparator needs.
    // Note: in aggregated mode `serialNumber` is always null, so
    // `sort=serialNumber` acts as a no-op (documented in design.md under
    // "Field Mapping").
    rows.sort((a, b) => compareItemsBySortKeys(a, b, sortKeys));
  }
  // When `sortKeys` is empty, keep Map insertion order (legacy behavior).

  // Assign sequential row numbers matching the final row order.
  rows.forEach((row, idx) => {
    row.rb = idx + 1;
  });

  return rows;
}
