import Link from "next/link";
import { getPrintData, filterItemsByArticle, filterItemsByDateRange, filterItemsByBedType, buildDeptSections, buildDeptSectionsWithDimensions, parseSortParam, sortPrintData, aggregatePrintData, groupBySerialNumber, combineRecapsFlat, combineRecapsByArticle, getArticlesWithoutBom, applySetNameOverrides } from "@/lib/utils/print-helpers";
import type { PrintData, DeptSection, SortKey, CombinedRecapEntry, ArticleMaterialRecapEntry, ArticleWithoutBom } from "@/lib/utils/print-helpers";
import { parseIds, buildDateFilter } from "@/lib/utils/filter-helpers";
import { readPrintParams, type PrintType } from "@/lib/utils/print-applicability";
import { prisma } from "@/lib/db";
import { BarcodeType, ProductionOrderStatus } from "@/app/generated/prisma";
import bwipjs from "bwip-js/node";
import PrintButton from "../../[id]/print/print-button";
import { BulkPakovanjeLabels } from "./bulk-pakovanje-labels";
import { expandPartsForContent, formatFooterComponents, getBedComponents, parseArticleWidth, filterBedComponents } from "@/lib/utils/bed-label-helpers";
import { BarcodeService } from "@/lib/services/barcode.service";
import { buildSummaryRows } from "@/lib/utils/summary-helpers";
import type { SummaryRow } from "@/lib/utils/summary-helpers";

// ─── Helpers ─────────────────────────────────────────────

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("bs", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("bs", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

async function generateBarcodeImage(value: string, small = false): Promise<string> {
  const pngBuffer = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 4,
    height: small ? 45 : 60,
    includetext: true,
    textxalign: "center",
    paddingwidth: 10,
    paddingheight: small ? 6 : 10,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return pngBuffer.toString("base64");
}

function round(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

// ─── Barcode data types ──────────────────────────────────

export interface ArticleLabel {
  articleName: string;
  articleCode: string | null;
  allParts: string;
  footerComponents: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null;
  barcodeValue: string | null;
  barcodeImage: string | null;
  orderNumber: number;
  date: string;
  customerName: string | null;
}

interface PartLabel {
  articleName: string;
  articleCode: string | null;
  partName: string;
  steps: string;
  fabricName: string | null;
  serialNumber: string | null;
  barcodeValue: string | null;
  barcodeImage: string | null;
  orderNumber: number;
  date: string;
}

export interface ComponentLabel {
  articleName: string;
  articleCode: string | null;
  componentName: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null;
  barcodeValue: string;
  barcodeImage: string;
  orderNumber: number;
  date: string;
  customerName: string | null;
  /** When this label is part of a set (same serial as krevet), stores the madrac's own article name */
  originalArticleName?: string | null;
}

export interface LabelGroup {
  article: ArticleLabel;
  componentLabels: ComponentLabel[];
  parts: PartLabel[];
}

async function buildLabelGroups(
  data: PrintData,
  orderId: string,
  deptFilter: Set<string> | null = null,
  partFilter: Set<string> | null = null,
  componentFilter: ReadonlySet<string> | null = null,
): Promise<LabelGroup[]> {
  const productBarcodes = await prisma.barcode.findMany({
    where: { productionOrderId: orderId, type: BarcodeType.product },
    orderBy: { itemIndex: "asc" },
  });
  const barcodeByItemIndex = new Map<number, string>();
  for (const bc of productBarcodes) {
    if (bc.itemIndex != null) barcodeByItemIndex.set(bc.itemIndex, bc.value);
  }

  const partBarcodes = await prisma.barcode.findMany({
    where: { productionOrderId: orderId, type: BarcodeType.part_identifier },
  });
  const partBarcodeMap = new Map<string, string>();
  for (const bc of partBarcodes) {
    if (bc.articlePartId && bc.itemIndex != null) {
      partBarcodeMap.set(`${bc.articlePartId}-${bc.itemIndex}`, bc.value);
    }
  }

  const groups: LabelGroup[] = [];
  let globalItemIndex = 0;

  for (const item of data.items) {
    const serialParts = item.serialNumber ? item.serialNumber.split(",") : [];
    for (let i = 0; i < item.quantity; i++) {
      const unitSerial = serialParts[i] ?? item.serialNumber;
      const articleBcValue = barcodeByItemIndex.get(globalItemIndex) ?? null;
      let articleBcImage: string | null = null;
      if (articleBcValue) {
        try { articleBcImage = await generateBarcodeImage(articleBcValue); } catch { /* skip */ }
      }

      const partInfos = item.parts.map((p) => ({ partId: p.partId, partName: p.partName }));
      const articleDescription = item.articleDescription;
      const width = parseArticleWidth(item.articleDimensions, item.articleName);
      const labelOptions = { width, withLegs: item.withLegs };

      const articleLabel: ArticleLabel = {
        articleName: item.articleName,
        articleCode: item.articleCode,
        allParts: expandPartsForContent(partInfos, articleDescription, item.articleName, labelOptions).join("+"),
        footerComponents: formatFooterComponents(partInfos, articleDescription, item.articleName, labelOptions),
        fabricName: item.fabric?.name ?? null,
        serialNumber: unitSerial,
        notes: item.notes,
        barcodeValue: articleBcValue,
        barcodeImage: articleBcImage,
        orderNumber: data.orderNumber,
        date: formatDateLong(data.workOrderDate ?? data.createdAt),
        customerName: data.customerName,
      };

      // Generate component labels (CB) in parallel
      const bedComponents = getBedComponents(partInfos, articleDescription, item.articleName, labelOptions);
      // Apply component filter (Req 4.6, 11.2): reduce to user-selected canonical names.
      // Keep `bedComponents` unfiltered for the cleanup call below so reprints with a
      // filter don't destroy barcodes for unselected components (Req 10.1, 11.3).
      const filteredBedComponents = componentFilter && componentFilter.size > 0
        ? filterBedComponents(bedComponents, componentFilter)
        : bedComponents;
      const componentResults = await Promise.all(
        filteredBedComponents.map(async (component) => {
          try {
            const bcData = await BarcodeService.generateComponentIdentifier(
              orderId, component.sourcePartId, component.componentName, globalItemIndex
            );
            return {
              articleName: item.articleName,
              articleCode: item.articleCode,
              componentName: bcData.componentName,
              fabricName: item.fabric?.name ?? null,
              serialNumber: unitSerial,
              notes: null,
              barcodeValue: bcData.value,
              barcodeImage: bcData.imageBase64,
              orderNumber: data.orderNumber,
              date: formatDateLong(data.workOrderDate ?? data.createdAt),
              customerName: data.customerName,
            } as ComponentLabel;
          } catch { return null; }
        })
      );
      const componentLabels = componentResults.filter((c): c is ComponentLabel => c !== null);

      // Clean up orphaned component barcodes from previous prints with wrong component sets
      await BarcodeService.cleanupOrphanedComponentBarcodes(
        orderId, globalItemIndex, bedComponents.map((c) => c.componentName)
      );

      const partLabels: PartLabel[] = [];
      for (const part of item.parts) {
        // Apply part-name filter (Req 4.4): case-insensitive match against
        // `applied.parts` lowercased. When partFilter is null the filter is
        // inactive and all parts pass.
        if (partFilter && !partFilter.has(part.partName.toLowerCase())) continue;
        // When department filter is active, only show steps from selected departments
        const filteredSteps = deptFilter
          ? part.steps.filter((s) => deptFilter.has(s.departmentId))
          : part.steps;
        // Skip this part label entirely if no steps match the filter
        if (deptFilter && filteredSteps.length === 0) continue;

        const partBcValue = partBarcodeMap.get(`${part.partId}-${globalItemIndex}`) ?? articleBcValue;
        let partBcImage: string | null = null;
        if (partBcValue) {
          try { partBcImage = await generateBarcodeImage(partBcValue, true); } catch { /* skip */ }
        }
        const stepNames = filteredSteps.map((s) => s.stepName).join(" → ");
        partLabels.push({
          articleName: item.articleName,
          articleCode: item.articleCode,
          partName: part.partName,
          steps: stepNames,
          fabricName: item.fabric?.name ?? null,
          serialNumber: unitSerial,
          barcodeValue: partBcValue,
          barcodeImage: partBcImage,
          orderNumber: data.orderNumber,
          date: formatDateLong(data.workOrderDate ?? data.createdAt),
        });
      }

      groups.push({ article: articleLabel, componentLabels, parts: partLabels });
      globalItemIndex++;
    }
  }

  return groups;
}

// ─── Radni nalog row type ────────────────────────────────

interface RadniNalogRow {
  rb: number;
  articleName: string;
  articleCode: string | null;
  articleDescription: string | null;
  quantity: number;
  parts: string;
  fabricName: string | null;
  deadline: Date | null;
  customerOrderNumber: string | null;
  loadingNumber: string | null;
  loadingSequence: number | null;
  serialNumber: string | null;
  notes: string | null;
  barcodeImage: string | null;
}

async function buildRadniNalogRows(data: PrintData, orderId: string): Promise<RadniNalogRow[]> {
  const productBarcodes = await prisma.barcode.findMany({
    where: { productionOrderId: orderId, type: BarcodeType.product },
    orderBy: { itemIndex: "asc" },
  });
  const barcodeByItemIndex = new Map<number, string>();
  for (const bc of productBarcodes) {
    if (bc.itemIndex != null) barcodeByItemIndex.set(bc.itemIndex, bc.value);
  }

  // Helper: extract model + dimensions from article name (e.g. "NATURAL LUXURY 180X200 madrac /" → "NATURAL LUXURY 180X200")
  function shortName(name: string): string {
    const match = name.match(/^(.+?\s*\d+[Xx×]\d+)/);
    return match ? match[1].trim() : name;
  }

  const pendingRows: RadniNalogRow[] = [];
  let rb = 0;
  let globalItemIndex = 0;

  for (const item of data.items) {
    const serialParts = item.serialNumber ? item.serialNumber.split(",") : [];
    for (let i = 0; i < item.quantity; i++) {
      rb++;
      const bcValue = barcodeByItemIndex.get(globalItemIndex);
      let barcodeImage: string | null = null;
      if (bcValue) {
        try { barcodeImage = await generateBarcodeImage(bcValue); } catch { /* skip */ }
      }
      pendingRows.push({
        rb,
        articleName: shortName(item.articleName),
        articleCode: item.articleCode,
        articleDescription: item.articleDescription,
        quantity: 1,
        parts: item.parts.map((p) => p.partName).join("+"),
        fabricName: item.fabric?.name ?? null,
        deadline: item.deliveryDeadline,
        customerOrderNumber: item.customerOrderNumber,
        loadingNumber: item.loadingNumber,
        serialNumber: serialParts[i] ?? item.serialNumber,
        loadingSequence: item.loadingSequence,
        notes: item.notes,
        barcodeImage,
      });
      globalItemIndex++;
    }
  }

  // Merge rows that share the same serial number (complementary sets)
  // BUT: if rows in the same serial group have different notes, keep them separate
  // (still consecutive, still sharing the serial number).
  const mergedRows: RadniNalogRow[] = [];
  const serialGroups = new Map<string, RadniNalogRow[]>();
  const serialOrder: string[] = [];
  for (const row of pendingRows) {
    if (row.serialNumber) {
      if (!serialGroups.has(row.serialNumber)) {
        serialGroups.set(row.serialNumber, []);
        serialOrder.push(row.serialNumber);
      }
      serialGroups.get(row.serialNumber)!.push(row);
    } else {
      mergedRows.push(row);
    }
  }

  /** Sort within serial group: krevet first, madrac second, others last. */
  function serialGroupOrder(row: RadniNalogRow): number {
    const text = `${row.articleName} ${row.articleDescription ?? ""} ${row.parts}`.toLowerCase();
    if (text.includes("krevet")) return 0;
    if (text.includes("madrac")) return 1;
    return 2;
  }

  /** Check if all rows in a group share the same notes (null/empty treated as equal). */
  function allSameNotes(rows: RadniNalogRow[]): boolean {
    const norm = (n: string | null) => (n == null || n === "" ? null : n);
    const first = norm(rows[0].notes);
    return rows.every((r) => norm(r.notes) === first);
  }

  for (const serial of serialOrder) {
    const groupRows = serialGroups.get(serial)!;
    // Sort: krevet first, madrac second
    groupRows.sort((a, b) => serialGroupOrder(a) - serialGroupOrder(b));
    if (groupRows.length === 1) {
      mergedRows.push(groupRows[0]);
    } else if (!allSameNotes(groupRows)) {
      // Different notes → don't merge, keep consecutive rows sharing the serial
      // Assign the same rb (min from group) so they stay together after final sort
      const groupRb = Math.min(...groupRows.map((r) => r.rb));
      for (const r of groupRows) { r.rb = groupRb; mergedRows.push(r); }
    } else {
      const first = groupRows[0];
      const allNames = groupRows.map((r) => r.articleName);
      const uniqueNames = [...new Set(allNames)];
      const allDescriptions = groupRows.map((r) => r.articleDescription ?? r.parts);
      const combinedContent = [...new Set(allDescriptions)].join("\n");
      mergedRows.push({
        ...first,
        articleName: uniqueNames.length > 1 ? uniqueNames.join("\n") : first.articleName,
        articleDescription: combinedContent,
        quantity: 1,
      });
    }
  }
  mergedRows.sort((a, b) => a.rb - b.rb);
  mergedRows.forEach((row, idx) => { row.rb = idx + 1; });

  return mergedRows;
}

// ─── Prepared data per order ─────────────────────────────

interface OrderPrintBundle {
  data: PrintData;
  radniNalogRows: RadniNalogRow[];
  labelGroups: LabelGroup[];
  deptSections: DeptSection[];
  articlesWithoutBom: ArticleWithoutBom[];
}

// ─── Page Component ──────────────────────────────────────

export default async function BulkPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const idsParam = typeof sp.ids === "string" ? sp.ids : undefined;
  const ids = parseIds(idsParam);

  // Parse summary and section routing params up front so we can pick the
  // applicable PrintType for `readPrintParams`.
  const summaryParam = typeof sp.summary === "string" ? sp.summary : undefined;
  const showSummary = summaryParam === "1";
  const sectionParam = typeof sp.section === "string" ? sp.section : undefined;
  const showRadniNalog = !sectionParam || sectionParam === "radni-nalog";
  const showEtikete = !sectionParam || sectionParam === "etikete";
  const showPakovanje = !sectionParam || sectionParam === "pakovanje";
  const showPlanUtroska = !sectionParam || sectionParam === "plan-utroska";
  const showPlanUtroskaRecap = sectionParam === "plan-utroska-rekapitulacija";

  // Determine which PrintType (if any) is active for this render. Summary takes
  // precedence over section; an unknown section (including `order`, which the
  // bulk route does not render on its own) falls back to the legacy
  // "show all sections" path with no readPrintParams (Req 9.3 semantics still
  // hold because we keep ad-hoc parsing for that branch).
  const KNOWN_PRINT_TYPES = new Set<PrintType>([
    "radni-nalog", "order", "plan-utroska", "plan-utroska-rekapitulacija", "etikete", "pakovanje",
    "zbirni-radni-nalog", "print-za-odjele",
  ]);
  const activeType: PrintType | null = showSummary
    ? "zbirni-radni-nalog"
    : sectionParam && KNOWN_PRINT_TYPES.has(sectionParam as PrintType)
      ? (sectionParam as PrintType)
      : null;
  const applied = activeType ? readPrintParams(activeType, sp) : null;

  // Departments — honored only when the PrintType's matrix row lists it;
  // otherwise falls back to the legacy ad-hoc parsing for the "no section"
  // path so existing bookmarks keep working.
  const filterDeptIds = applied
    ? Array.from(applied.departments)
    : parseIds(typeof sp.departments === "string" ? sp.departments : undefined);
  const hasDeptFilter = filterDeptIds.length > 0;
  const deptIdSet = new Set(filterDeptIds);

  // Articles — matrix row contains `articles` for every non-empty row, so the
  // applied set is the source of truth when activeType is set.
  const articleNamesSet: Set<string> = applied
    ? new Set(applied.articles)
    : new Set(
        typeof sp.articles === "string"
          ? decodeURIComponent(sp.articles).split(",").filter((name) => name.length > 0)
          : []
      );
  const hasArticleFilter = articleNamesSet.size > 0;

  // Aggregate — only honored by the summary (matrix row for
  // `zbirni-radni-nalog` contains `aggregate`); falls back to ad-hoc parsing
  // for the legacy no-section path.
  const aggregateMode = applied
    ? applied.aggregate
    : typeof sp.aggregate === "string" && sp.aggregate === "1";

  const rawSortKeys = applied
    ? [...applied.sort]
    : parseSortParam(typeof sp.sort === "string" ? sp.sort : undefined);
  // Default sort by serial number when no explicit sort is specified
  const sortKeys = rawSortKeys.length > 0 ? rawSortKeys : (["serialNumber"] as SortKey[]);

  // Parts — only honored for `section=etikete` (matrix row for `etikete`
  // contains `parts`). Lowercased to match the existing case-insensitive
  // part-name comparison used on the single-order etikete route.
  const partFilterSet: Set<string> | null =
    applied && applied.parts.size > 0
      ? new Set(Array.from(applied.parts).map((p) => p.toLowerCase()))
      : null;

  // Components — only honored for `section=pakovanje` (matrix row for
  // `pakovanje` contains `components`). Canonical names from
  // readPrintParams.
  const componentFilterSet: ReadonlySet<string> = applied
    ? applied.components
    : new Set<string>();

  // GroupByBed — only honored for `plan-utroska-rekapitulacija`
  const groupByBed = applied?.groupByBed ?? false;

  // Parse status and date filter params (routing / cross-cutting, not in matrix)
  const statusesParam = typeof sp.statuses === "string" ? sp.statuses : undefined;
  const filterStatuses = statusesParam ? statusesParam.split(",").filter(s => s.length > 0) : [];
  const dateFromParam = typeof sp.dateFrom === "string" ? sp.dateFrom : undefined;
  const dateToParam = typeof sp.dateTo === "string" ? sp.dateTo : undefined;
  const dateFilter = buildDateFilter(dateFromParam ?? null, dateToParam ?? null);

  // Filter IDs via Prisma when status/date filters are active
  const hasOrderFilters = filterStatuses.length > 0 || dateFilter !== null;
  let finalIds = ids;
  if (hasOrderFilters && ids.length > 0) {
    const filteredOrders = await prisma.productionOrder.findMany({
      where: {
        id: { in: ids },
        ...(filterStatuses.length > 0 ? { status: { in: filterStatuses as ProductionOrderStatus[] } } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: { id: true },
    });
    finalIds = filteredOrders.map(o => o.id);
  }

  // Empty ids → show message
  if (finalIds.length === 0) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema naloga za prikaz</h1>
        <Link href="/production" style={{ color: "#2563eb", textDecoration: "underline" }}>
          ← Nazad na listu naloga
        </Link>
      </div>
    );
  }

  // Fetch data for each order, skip invalid ones
  const bundles: OrderPrintBundle[] = [];
  const skippedIds: string[] = [];

  for (const id of finalIds) {
    const data = await getPrintData(id);
    if (!data) {
      skippedIds.push(id);
      continue;
    }
    // Skip orders with no items
    if (data.items.length === 0) {
      skippedIds.push(id);
      continue;
    }

    // Apply article filter and date range filter before building print structures
    let filteredData = hasArticleFilter ? filterItemsByArticle(data, articleNamesSet) : data;
    const bedType = applied?.bedType ?? "all";
    if (bedType !== "all") {
      filteredData = filterItemsByBedType(filteredData, bedType);
    }
    const itemDateFrom = applied?.dateFrom ?? "";
    const itemDateTo = applied?.dateTo ?? "";
    if (itemDateFrom || itemDateTo) {
      filteredData = filterItemsByDateRange(filteredData, itemDateFrom, itemDateTo);
    }
    filteredData = sortPrintData(filteredData, sortKeys);

    const [radniNalogRows, rawLabelGroups] = await Promise.all([
      buildRadniNalogRows(filteredData, id),
      buildLabelGroups(
        filteredData,
        id,
        hasDeptFilter ? deptIdSet : null,
        partFilterSet,
        componentFilterSet.size > 0 ? componentFilterSet : null,
      ),
    ]);
    // Apply serial number grouping so items with the same serial appear consecutively
    const labelGroups = applySetNameOverrides(groupBySerialNumber(rawLabelGroups));
    const allDeptSections = buildDeptSections(aggregateMode ? aggregatePrintData(filteredData) : filteredData);
    const deptSections = hasDeptFilter
      ? allDeptSections.filter((d) => deptIdSet.has(d.departmentId))
      : allDeptSections;

    bundles.push({ data: filteredData, radniNalogRows, labelGroups, deptSections, articlesWithoutBom: getArticlesWithoutBom(filteredData) });
  }

  if (bundles.length === 0) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema naloga za prikaz</h1>
        {skippedIds.length > 0 && (
          <p style={{ color: "#666", marginBottom: 16 }}>
            Preskočeno naloga: {skippedIds.length} (ne postoje ili nemaju stavke)
          </p>
        )}
        <Link href="/production" style={{ color: "#2563eb", textDecoration: "underline" }}>
          ← Nazad na listu naloga
        </Link>
      </div>
    );
  }

  // Check if article filter removed all items from every order
  if (hasArticleFilter && bundles.every((b) => b.data.items.length === 0)) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema artikala koji odgovaraju filteru</h1>
        <Link href="/production" style={{ color: "#2563eb", textDecoration: "underline" }}>
          ← Nazad na listu naloga
        </Link>
      </div>
    );
  }

  // Component-filter empty-result (Req 11.4): when section=pakovanje and the
  // user selected a non-empty component filter, but every bundle ends with
  // zero component labels after filtering, render the standardized
  // empty-result message instead of an otherwise-empty document.
  if (
    showPakovanje &&
    !showSummary &&
    componentFilterSet.size > 0 &&
    bundles.every((b) => b.labelGroups.every((g) => g.componentLabels.length === 0))
  ) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
        <p style={{ color: "#666" }}>Nijedna komponenta pakovanja nije odabrana.</p>
      </div>
    );
  }

  // Build summary rows when summary mode is active
  const summaryRows: SummaryRow[] = showSummary
    ? buildSummaryRows(bundles, aggregateMode, sortKeys)
    : [];

  // ─── Combined recap pipeline (plan-utroska-rekapitulacija) ─────────
  let flatRecap: CombinedRecapEntry[] = [];
  let groupedRecap: ArticleMaterialRecapEntry[] = [];
  if (showPlanUtroskaRecap && bundles.length > 0) {
    // Build article quantities from the original PrintData items (source of truth)
    const articleQuantities = new Map<string, number>();
    for (const bundle of bundles) {
      for (const item of bundle.data.items) {
        articleQuantities.set(item.articleName, (articleQuantities.get(item.articleName) ?? 0) + item.quantity);
      }
    }

    // Build filtered sections (shared by both flat and grouped paths)
    const filteredSections: DeptSection[][] = hasDeptFilter
      ? bundles.map((b) =>
          buildDeptSectionsWithDimensions(aggregatePrintData(b.data)).filter((s) => deptIdSet.has(s.departmentId))
        )
      : bundles.map((b) => buildDeptSectionsWithDimensions(aggregatePrintData(b.data)));

    if (groupByBed) {
      groupedRecap = combineRecapsByArticle(filteredSections, articleQuantities);
    } else {
      flatRecap = combineRecapsFlat(filteredSections, articleQuantities);
    }
  }

  // Collect info for summary header
  const summaryOrderNumbers = bundles.map((b) => b.data.orderNumber);
  const summaryCustomerNames = Array.from(
    new Set(bundles.map((b) => b.data.customerName).filter((n): n is string => n != null))
  );

  return (
    <>
      <style>{bulkPrintStyles}</style>

      <div className="bulk-print-wrap">
        {/* Top bar with print button */}
        <div className="no-print" style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "#fff", borderBottom: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h1 style={{ fontSize: "16pt", fontWeight: "bold", margin: 0 }}>
              {showPakovanje && !showEtikete ? "Etikete pakovanja" : `Kombinovani print`} — {bundles.length} nalog{bundles.length === 1 ? "" : "a"}
            </h1>
            {skippedIds.length > 0 && (
              <p style={{ fontSize: "9pt", color: "#dc2626", margin: "4px 0 0" }}>
                ⚠ Preskočeno {skippedIds.length} nalog{skippedIds.length === 1 ? "" : "a"} (ne postoje ili nemaju radne naloge)
              </p>
            )}
          </div>
          <PrintButton />
        </div>

        {/* ═══════════════ SECTION 1: RADNI NALOZI ═══════════════ */}
        {!showSummary && showRadniNalog && (
        <div style={{ padding: "0 24px" }}>
          <div className="section-header no-print">
            <h2>RADNI NALOZI</h2>
          </div>

          {bundles.map((bundle, bIdx) => (
            <div key={`rn-${bundle.data.orderId}`} style={bIdx > 0 ? { pageBreakBefore: "always" } : undefined}>
              {/* Separator */}
              <div className="order-separator">
                <span>Nalog #{bundle.data.orderNumber}</span>
                <span>{bundle.data.customerName ?? "—"}</span>
                <span>{formatDate(bundle.data.workOrderDate ?? bundle.data.createdAt)}</span>
              </div>

              {/* Radni nalog content — same as radni-nalog/page.tsx */}
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: "9pt", padding: "12px 0", position: "relative" }}>
                {/* Sort indicator - top right corner */}
                <div style={{ position: "absolute", top: "12px", right: "0", fontSize: "8pt", color: "#555", textAlign: "right" }}>
                  sortirano po: <strong>{sortKeys.map((k) => ({ serialNumber: "serijski broj", loadingNumber: "br. utovara", loadingSequence: "r.b. utovara", deliveryDate: "datum isporuke", abc: "naziv artikla", rb: "redni broj" }[k] ?? k)).join(", ")}</strong>
                </div>

                <div style={{ marginBottom: 4, fontSize: "9pt", lineHeight: 1.3 }}>
                  <div>Pella Erwa EU d.o.o., PJ.1 NOKTA SLEEP</div>
                  <div>76100 Brčko, Brod bb</div>
                  <div>JIB: 4600471110010 &nbsp; PDV: 600471110002</div>
                  <div>žiro-račun:</div>
                </div>

                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: "12pt", fontWeight: "bold", marginBottom: 4 }}>PLAN PROIZVODNJE</div>
                  <span style={{ border: "2px solid #000", padding: "4px 24px", fontSize: "14pt", fontWeight: "bold" }}>
                    RADNI NALOG
                  </span>
                </div>

                <div style={{ display: "flex", gap: 40, marginBottom: 16, fontSize: "9pt" }}>
                  <div style={{ lineHeight: 1.6 }}>
                    <div>broj naloga: <b>{bundle.data.orderNumber}</b></div>
                    {bundle.data.documentNumber && <div>dokument: <b>{bundle.data.documentNumber}</b></div>}
                    <div>datum: <b>{formatDate(bundle.data.workOrderDate ?? bundle.data.createdAt)}</b></div>
                  </div>
                  <div style={{ lineHeight: 1.6 }}>
                    {bundle.data.customerName && <div>kupac: <b>{bundle.data.customerName}</b></div>}
                    <div>telefon: {bundle.data.customerPhone ?? ""}</div>
                    {bundle.data.deliveryLocation && <div>mjesto isporuke: <b>{bundle.data.deliveryLocation}</b></div>}
                    {bundle.data.receivedBy && <div>narudžbu primio: {bundle.data.receivedBy}</div>}
                  </div>
                </div>

                <table className="rn-table">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>r.b.</th>
                      <th style={{ width: 60 }}>serijski broj</th>
                      <th style={{ minWidth: 180, whiteSpace: "nowrap" }}>naziv</th>
                      <th style={{ width: 55 }}>količina</th>
                      <th>sadržaj</th>
                      <th>štof</th>
                      <th style={{ width: 60 }}>nogice</th>
                      <th>napomena</th>
                      <th style={{ width: 60 }}>br.utovara</th>
                      <th style={{ width: 60 }}>datum</th>
                      <th style={{ width: 40 }}>r.b.</th>
                      <th style={{ width: 100 }}>barkod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.radniNalogRows.map((row) => (
                      <tr key={row.rb}>
                        <td>{row.rb}</td>
                        <td>{row.serialNumber ?? ""}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{row.articleName.includes("\n") ? row.articleName.split("\n").map((line, i) => <div key={i}>{line}</div>) : row.articleName}</td>
                        <td>{row.quantity}</td>
                        <td>{(row.articleDescription ?? row.parts).includes("\n") ? (row.articleDescription ?? row.parts).split("\n").map((line, i) => <div key={i}>{line}</div>) : (row.articleDescription ?? row.parts)}</td>
                        <td>{row.fabricName ?? ""}</td>
                        <td></td>
                        <td style={{ color: "#dc2626" }}>{row.notes ?? ""}</td>
                        <td style={{ textAlign: "center" }}>{row.loadingNumber ?? ""}</td>
                        <td style={{ textAlign: "center" }}>{row.deadline ? formatDate(row.deadline) : ""}</td>
                        <td style={{ textAlign: "center" }}>{row.loadingSequence ?? ""}</td>
                        <td style={{ textAlign: "center" }}>
                          {row.barcodeImage ? (
                            <img src={`data:image/png;base64,${row.barcodeImage}`} alt="Barkod" style={{ height: 32, width: "auto", margin: "0 auto" }} />
                          ) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot style={{ display: "table-row-group" }}>
                    <tr>
                      <td colSpan={3} style={{ textAlign: "right", fontWeight: "bold" }}>Ukupno:</td>
                      <td style={{ fontWeight: "bold" }}>{bundle.radniNalogRows.length}</td>
                      <td colSpan={7}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
        )}

        {/* ═══════════════ SECTION 2: BARKODOVI / ETIKETE ═══════════════ */}
        {!showSummary && showPakovanje && !showEtikete && (
          <BulkPakovanjeLabels
            bundles={bundles.map((b) => ({
              orderId: b.data.orderId,
              labelGroups: b.labelGroups,
            }))}
          />
        )}

        {!showSummary && showEtikete && (
        <div style={{ padding: "0 24px" }}>
          <div className="section-header" style={{ pageBreakBefore: "always" }}>
            <h2>BARKODOVI / ETIKETE</h2>
          </div>

          {bundles.map((bundle, bIdx) => (
            <div key={`et-${bundle.data.orderId}`} style={bIdx > 0 ? { pageBreakBefore: "always" } : undefined}>
              {/* Separator */}
              <div className="order-separator">
                <span>Nalog #{bundle.data.orderNumber}</span>
                <span>{bundle.data.customerName ?? "—"}</span>
              </div>

              {/* Etikete content */}
              <div style={{ padding: "12px 0" }}>
                {bundle.labelGroups.map((group, gIdx) => (
                  <div key={gIdx} className="item-group">
                    {/* Large label — article */}
                    <div className="label-large">
                      <div className="company-header">
                        <div className="brand">NOKTA</div>
                        <div className="brand-sub">SLEEP</div>
                        <div className="address">Pella Erwa EU d.o.o., PJ.1 NOKTA SLEEP Brod bb Brčko</div>
                      </div>

                      {group.article.barcodeImage && (
                        <div className="barcode-section">
                          <img src={`data:image/png;base64,${group.article.barcodeImage}`} alt="Barkod" />
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9pt" }}>
                        <span>Broj naloga {group.article.orderNumber}</span>
                        <span>{group.article.date}</span>
                      </div>

                      <div style={{ textAlign: "center", margin: "8px 0" }}>
                        <div style={{ fontStyle: "italic", fontSize: "9pt" }}>Naziv klijenta:</div>
                        <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{group.article.customerName ?? "—"}</div>
                      </div>

                      <div>
                        <div className="info-row"><span className="lk">Naziv:</span><span>{group.article.articleName}{group.article.articleCode ? ` / ${group.article.articleCode}` : ""}</span></div>
                        <div className="info-row"><span className="lk">Sadržaj:</span><span>{group.article.allParts}</span></div>
                        <div className="info-row"><span className="lk">Nogice:</span><span></span></div>
                        <div className="info-row"><span className="lk">Štof:</span><span>{group.article.fabricName ?? ""}</span></div>
                        <div className="info-row"><span className="lk">Serija:</span><span>{group.article.serialNumber ? `- ${group.article.serialNumber}` : ""}</span></div>
                      </div>

                      <div style={{ textAlign: "center", fontStyle: "italic", fontWeight: "bold", margin: "6px 0 2px" }}>Napomena:</div>
                      <div style={{ textAlign: "center", fontSize: "9pt", minHeight: 14 }}>{group.article.notes ?? ""}</div>

                      <div className="footer-row">
                        <span>{group.article.footerComponents}</span>
                      </div>
                    </div>

                    {/* Component labels — CB barcodes for packaging */}
                    {group.componentLabels.map((comp, cIdx) => (
                      <div key={`comp-${cIdx}`} className="label-large">
                        <div className="company-header">
                          <div className="brand">NOKTA</div>
                          <div className="brand-sub">SLEEP</div>
                          <div className="address">Pella Erwa EU d.o.o., PJ.1 NOKTA SLEEP Brod bb Brčko</div>
                        </div>
                        <div className="barcode-section">
                          <img src={`data:image/png;base64,${comp.barcodeImage}`} alt="Barkod" />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9pt" }}>
                          <span>Broj naloga {comp.orderNumber}</span>
                          <span>{comp.date}</span>
                        </div>
                        <div style={{ textAlign: "center", margin: "8px 0" }}>
                          <div style={{ fontStyle: "italic", fontSize: "9pt" }}>Naziv klijenta:</div>
                          <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{comp.customerName ?? "—"}</div>
                        </div>
                        <div>
                          <div className="info-row"><span className="lk">Naziv:</span><span>{comp.articleName}{comp.articleCode ? ` / ${comp.articleCode}` : ""}</span></div>
                          <div className="info-row"><span className="lk">Sadržaj:</span><span>{comp.componentName}</span></div>
                          <div className="info-row"><span className="lk">Nogice:</span><span></span></div>
                          <div className="info-row"><span className="lk">Štof:</span><span>{comp.fabricName ?? ""}</span></div>
                          <div className="info-row"><span className="lk">Serija:</span><span>{comp.serialNumber ? `- ${comp.serialNumber}` : ""}</span></div>
                        </div>
                        <div style={{ textAlign: "center", fontStyle: "italic", fontWeight: "bold", margin: "6px 0 2px" }}>Napomena:</div>
                        <div style={{ textAlign: "center", fontSize: "9pt", minHeight: 14 }}>{comp.notes ?? ""}</div>
                        <div className="footer-row" style={{ justifyContent: "center" }}>
                          <span style={{ fontWeight: "bold", fontSize: "14pt", textTransform: "uppercase" }}>{comp.componentName}</span>
                        </div>
                      </div>
                    ))}

                    {/* Small labels — parts */}
                    <div className="parts-column">
                      {group.parts.map((part, pIdx) => (
                        <div key={pIdx} className="label-small">
                          <div className="step-badge">{part.steps}</div>
                          <div className="info-block">
                            <div className="info-row"><span className="lk">Naziv:</span><span>{part.articleName}{part.articleCode ? ` / ${part.articleCode}` : ""}</span></div>
                            <div className="info-row"><span className="lk">Sadržaj:</span><span>{part.partName}</span></div>
                            <div className="info-row"><span className="lk">Nogice:</span><span></span></div>
                            <div className="info-row"><span className="lk">Štof:</span><span>{part.fabricName ?? ""}</span></div>
                            <div className="info-row"><span className="lk">Serija:</span><span>{part.serialNumber ? `- ${part.serialNumber}` : ""}</span></div>
                          </div>
                          <div style={{ textAlign: "center", fontStyle: "italic", fontWeight: "bold", fontSize: "7pt", marginTop: 2 }}>Napomena:</div>
                          {part.barcodeImage && (
                            <div className="barcode-section barcode-small" style={{ margin: "4px 0" }}>
                              <img src={`data:image/png;base64,${part.barcodeImage}`} alt="Barkod" />
                            </div>
                          )}
                          <div className="footer-row" style={{ width: "100%" }}>
                            <span>Broj naloga {part.orderNumber}</span>
                            <span>{part.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        )}

        {/* ═══════════════ SECTION 3: PLAN UTROŠKA MATERIJALA ═══════════════ */}
        {!showSummary && showPlanUtroska && (
        <div style={{ padding: "0 24px" }}>
          <div className="section-header" style={{ pageBreakBefore: "always" }}>
            <h2>PLAN UTROŠKA MATERIJALA</h2>
          </div>

          {bundles.map((bundle, bIdx) => (
            <div key={`pu-${bundle.data.orderId}`} style={bIdx > 0 ? { pageBreakBefore: "always" } : undefined}>
              {/* Separator */}
              <div className="order-separator">
                <span>Nalog #{bundle.data.orderNumber}</span>
                <span>{bundle.data.customerName ?? "—"}</span>
              </div>

              {/* Plan utroška content — one page per department */}
              {bundle.deptSections.map((dept, deptIdx) => (
                <div key={deptIdx} className="dept-page" style={{ fontFamily: "Arial, sans-serif", padding: "12px 0" }}>
                  <div style={{ fontSize: "8pt", lineHeight: 1.3, marginBottom: 4 }}>
                    <div>Pella Erwa EU d.o.o., PJ.1 NOKTA SLEEP</div>
                    <div>76100 Brčko, Brod bb</div>
                    <div>JIB: 4600471110010 &nbsp; PDV: 600471110002</div>
                    <div>žiro-račun:</div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ border: "2px solid #000", padding: "3px 16px", fontWeight: "bold", fontSize: "12pt" }}>RADNI NALOG</span>
                    <span style={{ border: "2px solid #000", padding: "3px 16px", fontWeight: "bold", fontSize: "12pt" }}>PLAN UTROŠKA MATERIJALA</span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8pt", marginBottom: 4 }}>
                    <div>
                      <span>broj naloga: <b>{bundle.data.orderNumber}</b></span>
                      <span style={{ marginLeft: 24 }}>datum: <b>{formatDate(bundle.data.workOrderDate ?? bundle.data.createdAt)}</b></span>
                    </div>
                    <div>
                      <span>kupac: <b>{bundle.data.customerName ?? ""}</b></span>
                      <span style={{ marginLeft: 16 }}>telefon: {bundle.data.customerPhone ?? ""}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: "8pt", marginBottom: 8 }}>
                    <span>Print za odjele - Nalog #{bundle.data.orderNumber} &nbsp;&nbsp;</span>
                    <b style={{ border: "1px solid #000", padding: "1px 8px" }}>{dept.departmentName}</b>
                    <span style={{ marginLeft: 16 }}>UKUPNO MATERIJALA ZA OVAJ ODJEL</span>
                  </div>

                  <table className="pu-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ width: 20 }}>RB</th>
                        <th rowSpan={2} style={{ width: 40 }}>ŠIFRA</th>
                        <th rowSpan={2}>NAZIV PROIZVODA</th>
                        <th rowSpan={2} style={{ width: 25 }}>JM</th>
                        <th rowSpan={2} style={{ width: 30 }}>KOL</th>
                        <th rowSpan={2} style={{ width: 40 }}>ŠIFRA SIR.</th>
                        <th rowSpan={2}>NAZIV SIROVINE</th>
                        <th colSpan={6} style={{ textAlign: "center" }}>PO NORMATIVU</th>
                        <th colSpan={2} style={{ textAlign: "center" }} className="highlight">PO NARUDŽBI</th>
                      </tr>
                      <tr>
                        <th>količina</th>
                        <th>Dužina</th>
                        <th>Širina</th>
                        <th>Visina</th>
                        <th>komada</th>
                        <th>Kant.</th>
                        <th className="highlight">količina</th>
                        <th className="highlight">komada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dept.articles.map((block) =>
                        block.materials.map((mat, matIdx) => (
                          <tr key={`${block.rb}-${matIdx}`}>
                            {matIdx === 0 && (
                              <>
                                <td rowSpan={block.materials.length} style={{ textAlign: "center", fontWeight: "bold" }}>{block.rb}</td>
                                <td rowSpan={block.materials.length} style={{ textAlign: "center" }}>{block.articleCode}</td>
                                <td rowSpan={block.materials.length}>
                                  <div style={{ fontWeight: "bold" }}>{block.articleName}</div>
                                  <div style={{ fontSize: "6.5pt", color: "#666" }}>
                                    {block.partName}
                                    {block.fabricName && <> · Štof: {block.fabricName}</>}
                                    {block.nogice1Name && <> · Nogice: {block.nogice1Name}</>}
                                    {block.nogice2Name && <> · Nogice 2: {block.nogice2Name}</>}
                                    {block.paspulName && <> · Paspul: {block.paspulName}</>}
                                    {block.ruckaName && <> · Ručka: {block.ruckaName}</>}
                                  </div>
                                  {block.customerOrderNumber && (
                                    <div style={{ fontSize: "6.5pt", color: "#666" }}>Serija: {block.customerOrderNumber}</div>
                                  )}
                                  {block.notes && (
                                    <div style={{ fontSize: "6.5pt", color: "#666" }}>Napomena: {block.notes}</div>
                                  )}
                                </td>
                                <td rowSpan={block.materials.length} style={{ textAlign: "center" }}>{block.unit}</td>
                                <td rowSpan={block.materials.length} style={{ textAlign: "center", fontWeight: "bold" }}>{block.orderQuantity}</td>
                              </>
                            )}
                            <td style={{ textAlign: "center" }}>{mat.materialCode}</td>
                            <td>
                              {mat.isOverridden ? (
                                <span style={{ fontStyle: "italic", color: "#1a5276" }}>
                                  {mat.materialName}
                                  {mat.originalMaterialName && (
                                    <span style={{ fontSize: "6.5pt", color: "#888", fontStyle: "normal" }}>
                                      {" "}(zamjena za: {mat.originalMaterialName})
                                    </span>
                                  )}
                                </span>
                              ) : mat.materialName}
                            </td>
                            <td style={{ textAlign: "right" }}>{round(mat.quantity)}</td>
                            <td style={{ textAlign: "right" }}>{mat.length != null ? round(mat.length) : ""}</td>
                            <td style={{ textAlign: "right" }}>{mat.width != null ? round(mat.width) : ""}</td>
                            <td style={{ textAlign: "right" }}>{mat.height != null ? round(mat.height) : ""}</td>
                            <td style={{ textAlign: "right" }}>{mat.pieces != null ? round(mat.pieces) : ""}</td>
                            <td style={{ textAlign: "center" }}>{mat.isEdgebanded ? "DA" : ""}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{round(mat.totalQuantity)}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{mat.totalPieces != null ? round(mat.totalPieces) : ""}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {/* Rekapitulacija */}
                  <div style={{ marginTop: 16, fontSize: "7.5pt" }}>
                    <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: "8pt", borderBottom: "1px solid #000", paddingBottom: 2 }}>
                      REKAPITULACIJA NALOGA BROJ {bundle.data.orderNumber} - UKUPAN UTROŠAK SIROVINA ZA ODJEL: {dept.departmentName}
                    </div>
                    <table className="recap-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>ŠIFRA SIR.</th>
                          <th>NAZIV SIROVINE</th>
                          <th style={{ width: 40 }}>JM</th>
                          <th style={{ width: 30 }}>Dužina</th>
                          <th style={{ width: 30 }}>Širina</th>
                          <th style={{ width: 30 }}>Visina</th>
                          <th style={{ width: 30 }}>Kant.</th>
                          <th style={{ width: 50 }}>količina</th>
                          <th style={{ width: 50 }} className="highlight">komada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dept.recap.map((r, i) => (
                          <tr key={i}>
                            <td style={{ textAlign: "center" }}>{r.materialCode}</td>
                            <td>
                              {r.isOverridden ? (
                                <span style={{ fontStyle: "italic", color: "#1a5276" }}>
                                  {r.materialName}
                                  {r.originalMaterialName && (
                                    <span style={{ fontSize: "6.5pt", color: "#888", fontStyle: "normal" }}>
                                      {" "}(zamjena za: {r.originalMaterialName})
                                    </span>
                                  )}
                                </span>
                              ) : r.materialName}
                            </td>
                            <td style={{ textAlign: "center" }}>{r.unit}</td>
                            <td style={{ textAlign: "right" }}>{r.length != null ? round(r.length) : ""}</td>
                            <td style={{ textAlign: "right" }}>{r.width != null ? round(r.width) : ""}</td>
                            <td style={{ textAlign: "right" }}>{r.height != null ? round(r.height) : ""}</td>
                            <td style={{ textAlign: "center" }}>{r.isEdgebanded ? "DA" : ""}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>{round(r.totalQuantity)}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{r.totalPieces != null ? round(r.totalPieces) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Artikli bez normativa */}
              {bundle.articlesWithoutBom.length > 0 && (
                <div style={{ fontFamily: "Arial, sans-serif", padding: "12px 0", marginTop: 24 }}>
                  <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: "8pt", borderBottom: "1px solid #000", paddingBottom: 2 }}>
                    ARTIKLI BEZ NORMATIVA - NALOG BROJ {bundle.data.orderNumber}
                  </div>
                  <table className="recap-table">
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}>RB</th>
                        <th style={{ width: 60 }}>ŠIFRA</th>
                        <th>NAZIV ARTIKLA</th>
                        <th style={{ width: 50 }}>KOLIČINA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.articlesWithoutBom.map((a, i) => (
                        <tr key={i}>
                          <td style={{ textAlign: "center" }}>{i + 1}</td>
                          <td style={{ textAlign: "center" }}>{a.articleCode ?? ""}</td>
                          <td>{a.articleName}</td>
                          <td style={{ textAlign: "center", fontWeight: "bold" }}>{a.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
        )}

        {/* ═══════════════ SECTION: PLAN UTROŠKA REKAPITULACIJA (COMBINED) ═══════════════ */}
        {!showSummary && showPlanUtroskaRecap && !groupByBed && flatRecap.length > 0 && (
        <div className="recap-combined-section" style={{ padding: "0 24px", fontFamily: "Arial, sans-serif", fontSize: "10pt" }}>
          {/* Company header */}
          <div style={{ fontSize: "9pt", lineHeight: 1.3, marginBottom: 4 }}>
            <div>Pella Erwa EU d.o.o., PJ.1 NOKTA SLEEP</div>
            <div>76100 Brčko, Brod bb</div>
            <div>JIB: 4600471110010 &nbsp; PDV: 600471110002</div>
            <div>žiro-račun:</div>
          </div>

          {/* Centered title */}
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: "12pt", fontWeight: "bold" }}>PLAN UTROŠKA MATERIJALA - REKAPITULACIJA</div>
          </div>

          {/* Order numbers list */}
          <div style={{ fontSize: "9pt", marginBottom: 16 }}>
            {bundles.length === 1
              ? `Nalog: ${bundles[0].data.orderNumber}`
              : `Nalozi: ${bundles.map((b) => b.data.orderNumber).join(", ")}`
            }
          </div>

          {/* Section header */}
          <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: "8pt", borderBottom: "1px solid #000", paddingBottom: 2 }}>
            {bundles.length === 1
              ? `REKAPITULACIJA NALOGA BROJ ${bundles[0].data.orderNumber} - UKUPAN UTROŠAK SIROVINA`
              : `REKAPITULACIJA NALOGA ${bundles.map((b) => b.data.orderNumber).join(", ")} - UKUPAN UTROŠAK SIROVINA`
            }
          </div>

          {/* Single flat recap table sorted by material name */}
          <table className="recap-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>ŠIFRA SIR.</th>
                <th>NAZIV SIROVINE</th>
                <th style={{ width: 40 }}>KOM. KREVETA</th>
                <th style={{ width: 40 }}>JM</th>
                <th style={{ width: 30 }}>Dužina</th>
                <th style={{ width: 30 }}>Širina</th>
                <th style={{ width: 30 }}>Visina</th>
                <th style={{ width: 30 }}>Kant.</th>
                <th style={{ width: 50 }}>norm. kol.</th>
                <th style={{ width: 50 }}>norm. kom.</th>
                <th style={{ width: 50 }} className="highlight">količina</th>
                <th style={{ width: 50 }} className="highlight">komada</th>
              </tr>
            </thead>
            <tbody>
              {flatRecap.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "center" }}>{r.materialCode}</td>
                  <td>
                    {r.isOverridden ? (
                      <span style={{ fontStyle: "italic", color: "#1a5276" }}>
                        {r.materialName}
                        {r.originalMaterialName && (
                          <span style={{ fontSize: "6.5pt", color: "#888", fontStyle: "normal" }}>
                            {" "}(zamjena za: {r.originalMaterialName})
                          </span>
                        )}
                      </span>
                    ) : r.materialName}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: "bold" }}>{r.articleQuantity}</td>
                  <td style={{ textAlign: "center" }}>{r.unit}</td>
                  <td style={{ textAlign: "right" }}>{r.length != null ? round(r.length) : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.width != null ? round(r.width) : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.height != null ? round(r.height) : ""}</td>
                  <td style={{ textAlign: "center" }}>{r.isEdgebanded ? "DA" : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.articleQuantity > 0 ? round(r.totalQuantity / r.articleQuantity) : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.articleQuantity > 0 && r.totalPieces != null ? round(r.totalPieces / r.articleQuantity) : ""}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{round(r.totalQuantity)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{r.totalPieces != null ? round(r.totalPieces) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* ═══════════════ SECTION: PLAN UTROŠKA REKAPITULACIJA (GROUPED BY ARTICLE) ═══════════════ */}
        {!showSummary && showPlanUtroskaRecap && groupByBed && groupedRecap.length > 0 && (
        <div className="recap-combined-section" style={{ padding: "0 24px", fontFamily: "Arial, sans-serif", fontSize: "10pt" }}>
          {/* Company header */}
          <div style={{ fontSize: "9pt", lineHeight: 1.3, marginBottom: 4 }}>
            <div>Pella Erwa EU d.o.o., PJ.1 NOKTA SLEEP</div>
            <div>76100 Brčko, Brod bb</div>
            <div>JIB: 4600471110010 &nbsp; PDV: 600471110002</div>
            <div>žiro-račun:</div>
          </div>

          {/* Centered title */}
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: "12pt", fontWeight: "bold" }}>PLAN UTROŠKA MATERIJALA - REKAPITULACIJA (PO NAZIVU KREVETA)</div>
          </div>

          {/* Order numbers list */}
          <div style={{ fontSize: "9pt", marginBottom: 16 }}>
            {bundles.length === 1
              ? `Nalog: ${bundles[0].data.orderNumber}`
              : `Nalozi: ${bundles.map((b) => b.data.orderNumber).join(", ")}`
            }
          </div>

          {/* Single flat table with article name column */}
          <table className="recap-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>ŠIFRA SIR.</th>
                <th>NAZIV SIROVINE</th>
                <th>NAZIV KREVETA</th>
                <th style={{ width: 40 }}>KOL.</th>
                <th style={{ width: 40 }}>JM</th>
                <th style={{ width: 30 }}>Dužina</th>
                <th style={{ width: 30 }}>Širina</th>
                <th style={{ width: 30 }}>Visina</th>
                <th style={{ width: 30 }}>Kant.</th>
                <th style={{ width: 50 }}>norm. kol.</th>
                <th style={{ width: 50 }}>norm. kom.</th>
                <th style={{ width: 50 }} className="highlight">količina</th>
                <th style={{ width: 50 }} className="highlight">komada</th>
              </tr>
            </thead>
            <tbody>
              {groupedRecap.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "center" }}>{r.materialCode}</td>
                  <td>
                    {r.isOverridden ? (
                      <span style={{ fontStyle: "italic", color: "#1a5276" }}>
                        {r.materialName}
                        {r.originalMaterialName && (
                          <span style={{ fontSize: "6.5pt", color: "#888", fontStyle: "normal" }}>
                            {" "}(zamjena za: {r.originalMaterialName})
                          </span>
                        )}
                      </span>
                    ) : r.materialName}
                  </td>
                  <td>{r.articleName}</td>
                  <td style={{ textAlign: "center", fontWeight: "bold" }}>{r.articleOrderQuantity}</td>
                  <td style={{ textAlign: "center" }}>{r.unit}</td>
                  <td style={{ textAlign: "right" }}>{r.length != null ? round(r.length) : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.width != null ? round(r.width) : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.height != null ? round(r.height) : ""}</td>
                  <td style={{ textAlign: "center" }}>{r.isEdgebanded ? "DA" : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.articleOrderQuantity > 0 ? round(r.totalQuantity / r.articleOrderQuantity) : ""}</td>
                  <td style={{ textAlign: "right" }}>{r.articleOrderQuantity > 0 && r.totalPieces != null ? round(r.totalPieces / r.articleOrderQuantity) : ""}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{round(r.totalQuantity)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{r.totalPieces != null ? round(r.totalPieces) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* Empty state for combined recap when filters produce no results */}
        {!showSummary && showPlanUtroskaRecap && !groupByBed && flatRecap.length === 0 && bundles.length > 0 && (
        <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
          <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
          <p style={{ color: "#666" }}>Nijedan odjel ne sadrži stavke za odabrane filtere.</p>
        </div>
        )}

        {/* Empty state for grouped recap when filters produce no results */}
        {!showSummary && showPlanUtroskaRecap && groupByBed && groupedRecap.length === 0 && bundles.length > 0 && (
        <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
          <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
          <p style={{ color: "#666" }}>Nijedan odjel ne sadrži stavke za odabrane filtere.</p>
        </div>
        )}

        {/* Artikli bez normativa — combined across all orders (shown on rekapitulacija) */}
        {!showSummary && showPlanUtroskaRecap && (() => {
          const combined = new Map<string, { articleName: string; articleCode: string | null; quantity: number }>();
          for (const b of bundles) {
            for (const a of b.articlesWithoutBom) {
              const existing = combined.get(a.articleName);
              if (existing) { existing.quantity += a.quantity; }
              else { combined.set(a.articleName, { ...a }); }
            }
          }
          const list = Array.from(combined.values()).sort((a, b) => a.articleName.localeCompare(b.articleName, "bs"));
          if (list.length === 0) return null;
          return (
            <div style={{ padding: "0 24px", fontFamily: "Arial, sans-serif", fontSize: "10pt", marginTop: 24 }}>
              <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: "12pt", borderBottom: "1px solid #000", paddingBottom: 2 }}>
                ARTIKLI BEZ NORMATIVA
              </div>
              <table className="recap-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>RB</th>
                    <th style={{ width: 60 }}>ŠIFRA</th>
                    <th>NAZIV ARTIKLA</th>
                    <th style={{ width: 50 }}>KOLIČINA</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "center" }}>{i + 1}</td>
                      <td style={{ textAlign: "center" }}>{a.articleCode ?? ""}</td>
                      <td>{a.articleName}</td>
                      <td style={{ textAlign: "center", fontWeight: "bold" }}>{a.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* ═══════════════ SECTION 4: ZBIRNI RADNI NALOG ═══════════════ */}
        {showSummary && summaryRows.length > 0 && (
          <div className="summary-section" style={{ padding: "0 24px" }}>
            <div className="section-header" style={{ pageBreakBefore: "always" }}>
              <h2>ZBIRNI RADNI NALOG</h2>
            </div>

            <div style={{ fontFamily: "Arial, sans-serif", fontSize: "9pt", padding: "12px 0", position: "relative" }}>
              {/* Sort indicator - top right corner */}
              <div style={{ position: "absolute", top: "12px", right: "0", fontSize: "8pt", color: "#555", textAlign: "right" }}>
                sortirano po: <strong>{sortKeys.map((k) => ({ serialNumber: "serijski broj", loadingNumber: "br. utovara", loadingSequence: "r.b. utovara", deliveryDate: "datum isporuke", abc: "naziv artikla", rb: "redni broj" }[k] ?? k)).join(", ")}</strong>
              </div>

              {/* Company header */}
              <div style={{ marginBottom: 4, fontSize: "9pt", lineHeight: 1.3 }}>
                <div>Pella Erwa EU d.o.o., PJ.1 NOKTA SLEEP</div>
                <div>76100 Brčko, Brod bb</div>
                <div>JIB: 4600471110010 &nbsp; PDV: 600471110002</div>
                <div>žiro-račun:</div>
              </div>

              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: "12pt", fontWeight: "bold", marginBottom: 4 }}>PLAN PROIZVODNJE</div>
                <span style={{ border: "2px solid #000", padding: "4px 24px", fontSize: "14pt", fontWeight: "bold" }}>
                  ZBIRNI RADNI NALOG
                </span>
              </div>

              {/* Summary header info */}
              <div style={{ display: "flex", gap: 40, marginBottom: 16, fontSize: "9pt" }}>
                <div style={{ lineHeight: 1.6 }}>
                  <div>nalozi: <b>{summaryOrderNumbers.join(", ")}</b></div>
                  <div>datum: <b>{formatDate(new Date())}</b></div>
                  {aggregateMode && <div>režim: <b>sabrani artikli</b></div>}
                </div>
              </div>

              {/* Summary table */}
              <table className="rn-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>r.b.</th>
                    <th style={{ width: 60 }}>serijski broj</th>
                    <th style={{ minWidth: 180, whiteSpace: "nowrap" }}>naziv</th>
                    <th style={{ width: 55 }}>količina</th>
                    <th>sadržaj</th>
                    <th>štof</th>
                    <th style={{ width: 60 }}>nogice</th>
                    <th>napomena</th>
                    <th style={{ width: 60 }}>br.utovara</th>
                      <th style={{ width: 60 }}>datum</th>
                    <th style={{ width: 40 }}>r.b.</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.rb}>
                      <td>{row.rb}</td>
                      <td>{row.serialNumber ?? ""}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {row.articleName.includes("\n") ? row.articleName.split("\n").map((line, i) => <div key={i}>{line}</div>) : <div>{row.articleName}</div>}
                        {aggregateMode && row.sourceOrderNumbers.length > 0 && (
                          <div style={{ fontSize: "7pt", color: "#666" }}>
                            Nalozi: {row.sourceOrderNumbers.join(", ")}
                          </div>
                        )}
                        {!aggregateMode && row.sourceOrderNumbers.length > 0 && (
                          <div style={{ fontSize: "7pt", color: "#666" }}>
                            Nalog: {row.sourceOrderNumbers[0]}
                          </div>
                        )}
                      </td>
                      <td>{row.quantity}</td>
                      <td>{(row.articleDescription ?? row.parts).includes("\n") ? (row.articleDescription ?? row.parts).split("\n").map((line, i) => <div key={i}>{line}</div>) : (row.articleDescription ?? row.parts)}</td>
                      <td>{row.fabricName ?? ""}</td>
                      <td></td>
                      <td style={{ color: "#dc2626" }}>{row.notes ?? ""}</td>
                      <td style={{ textAlign: "center" }}>{row.loadingNumber ?? ""}</td>
                        <td style={{ textAlign: "center" }}>{row.deadline ? formatDate(row.deadline) : ""}</td>
                      <td style={{ textAlign: "center" }}>{row.loadingSequence ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ display: "table-row-group" }}>
                  <tr>
                    <td colSpan={3} style={{ textAlign: "right", fontWeight: "bold" }}>Ukupno:</td>
                    <td style={{ fontWeight: "bold" }}>{summaryRows.reduce((sum, r) => sum + r.quantity, 0)}</td>
                    <td colSpan={7}></td>
                  </tr>
                </tfoot>
              </table>

              {/* Artikli bez normativa — combined across all orders */}
              {(() => {
                const combined = new Map<string, { articleName: string; articleCode: string | null; quantity: number }>();
                for (const b of bundles) {
                  for (const a of b.articlesWithoutBom) {
                    const existing = combined.get(a.articleName);
                    if (existing) { existing.quantity += a.quantity; }
                    else { combined.set(a.articleName, { ...a }); }
                  }
                }
                const list = Array.from(combined.values()).sort((a, b) => a.articleName.localeCompare(b.articleName, "bs"));
                if (list.length === 0) return null;
                return (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: "9pt", borderBottom: "1px solid #000", paddingBottom: 2 }}>
                      ARTIKLI BEZ NORMATIVA
                    </div>
                    <table className="rn-table">
                      <thead>
                        <tr>
                          <th style={{ width: 30 }}>RB</th>
                          <th style={{ width: 60 }}>ŠIFRA</th>
                          <th>NAZIV ARTIKLA</th>
                          <th style={{ width: 50 }}>KOLIČINA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((a, i) => (
                          <tr key={i}>
                            <td style={{ textAlign: "center" }}>{i + 1}</td>
                            <td style={{ textAlign: "center" }}>{a.articleCode ?? ""}</td>
                            <td>{a.articleName}</td>
                            <td style={{ textAlign: "center", fontWeight: "bold" }}>{a.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────

const bulkPrintStyles = `
  @media print {
    body { margin: 0; padding: 0; font-size: 8pt; }
    @page { margin: 6mm; size: A4 portrait; }
    .no-print { display: none !important; }
    .section-header { page-break-before: always; }
    .editable-notes { border-bottom: none !important; }
    .recap-combined-section tr { break-inside: avoid; }
  }
  @media screen {
    .bulk-print-wrap { max-width: 1200px; margin: 0 auto; background: #fff; min-height: 100vh; }
  }
  * { box-sizing: border-box; }

  /* Section headers */
  .section-header {
    text-align: center;
    padding: 24px 0 12px;
    border-bottom: 3px solid #000;
    margin-bottom: 16px;
  }
  .section-header h2 {
    font-size: 16pt;
    font-weight: bold;
    font-family: Arial, sans-serif;
    margin: 0;
    letter-spacing: 2px;
  }

  /* Order separator */
  .order-separator {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f0f0f0;
    border: 2px solid #333;
    padding: 6px 16px;
    margin: 12px 0;
    font-family: Arial, sans-serif;
    font-size: 10pt;
    font-weight: bold;
  }

  /* Radni nalog table */
  .rn-table { border-collapse: collapse; width: 100%; }
  .rn-table th, .rn-table td { border: 1px solid #000; padding: 3px 6px; text-align: left; font-size: 12pt; word-wrap: break-word; overflow-wrap: break-word; }
  .rn-table th { font-weight: bold; font-size: 10pt; }

  /* Plan utroška tables */
  .pu-table { border-collapse: collapse; width: 100%; }
  .pu-table th, .pu-table td { border: 1px solid #000; padding: 1px 4px; font-size: 7.5pt; vertical-align: top; }
  .pu-table th { background: #eee; font-weight: bold; text-align: center; font-size: 7pt; }
  .recap-table { border-collapse: collapse; width: 100%; margin-top: 12px; }
  .recap-table th, .recap-table td { border: 1px solid #000; padding: 1px 4px; font-size: 7.5pt; }
  .recap-table th { background: #eee; font-weight: bold; font-size: 7pt; }
  .highlight { background: #ffff00; }

  /* Combined recap section: 12pt base font for table text (Req 7.3) */
  .recap-combined-section .recap-table th,
  .recap-combined-section .recap-table td { font-size: 12pt; padding: 2px 4px; }
  .recap-combined-section .recap-table th { font-size: 12pt; }
  .dept-page { page-break-after: always; }
  .dept-page:last-child { page-break-after: auto; }

  /* Etikete styles */
  .label-large {
    width: 340px;
    min-height: 567px;
    border: 1px dashed #999;
    padding: 16px 20px;
    font-family: Arial, sans-serif;
    font-size: 10pt;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .label-small {
    width: 340px;
    border: 1px dashed #999;
    padding: 10px 16px;
    font-family: Arial, sans-serif;
    font-size: 8pt;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .label-small .info-block { width: 100%; }
  .company-header { text-align: center; margin-bottom: 8px; }
  .company-header .brand { font-size: 22pt; font-weight: bold; letter-spacing: 6px; line-height: 1; }
  .company-header .brand-sub { font-size: 14pt; letter-spacing: 8px; margin-top: -2px; }
  .company-header .address { font-size: 7pt; color: #555; margin-top: 4px; }
  .barcode-section { text-align: center; margin: 6px 0; }
  .barcode-section img { max-width: 280px; height: auto; }
  .barcode-small img { max-width: 260px; height: auto; }
  .info-row { display: flex; gap: 4px; line-height: 1.4; }
  .info-row .lk { font-weight: bold; font-style: italic; min-width: 55px; flex-shrink: 0; }
  .footer-row {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #000;
    padding-top: 3px;
    margin-top: auto;
    font-size: 8pt;
  }
  .item-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
  }
  .parts-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .step-badge {
    display: inline-block;
    background: #000;
    color: #fff;
    font-size: 7pt;
    font-weight: bold;
    padding: 1px 6px;
    border-radius: 2px;
    margin-bottom: 3px;
  }

  /* Summary section (Zbirni radni nalog) */
  .summary-section { page-break-before: always; }
  .summary-section .rn-table { margin-top: 8px; }
`;
