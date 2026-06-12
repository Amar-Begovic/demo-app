/**
 * Preservation Property Tests
 *
 * Property 2: Preservation - Unchanged Columns and Import Compatibility
 *
 * These tests verify that non-buggy columns in the production order Excel export
 * produce correct output on the CURRENT (unfixed) code. They serve as regression
 * tests to ensure the fix does not break existing correct behavior.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import { describe, expect } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import ExcelJS from "exceljs";
import {
  generateExcelBuffer,
  parseExcelBuffer,
  EXCEL_HEADERS,
  translatePriorityToBS,
  STATUS_ENUM_TO_BS,
} from "@/lib/services/production-order-excel.service";
import type { OrderRow } from "@/app/(dashboard)/production/components/selectable-order-table";

// ─── Arbitraries ─────────────────────────────────────────

/** Generate a non-empty article name. */
function arbArticleName(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
}

/** Generate a non-empty fabric name. */
function arbFabricName(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
}

/** Generate a UUID string. */
function arbUUID(): fc.Arbitrary<string> {
  return fc.uuid();
}

/** Generate a valid priority value. */
function arbPriority(): fc.Arbitrary<string> {
  return fc.constantFrom("urgent", "normal", "low");
}

/** Generate a valid status value. */
function arbStatus(): fc.Arbitrary<string> {
  return fc.constantFrom(
    "draft",
    "waiting_material",
    "ready",
    "in_progress",
    "completed"
  );
}

/** Generate a valid ISO date string. */
function arbISODate(): fc.Arbitrary<string> {
  // Generate date components directly to avoid Invalid Date issues
  return fc
    .tuple(
      fc.integer({ min: 2020, max: 2030 }), // year
      fc.integer({ min: 0, max: 11 }), // month (0-indexed)
      fc.integer({ min: 1, max: 28 }) // day (safe range for all months)
    )
    .map(([year, month, day]) => new Date(year, month, day).toISOString());
}

/** Generate a quantity (positive integer). */
function arbQuantity(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 9999 });
}

/** Generate optional notes. */
function arbNotes(): fc.Arbitrary<string | null> {
  return fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
  );
}

/** Generate optional loading number. */
function arbLoadingNumber(): fc.Arbitrary<string | null> {
  return fc.oneof(
    fc.constant(null),
    fc.stringMatching(/^[A-Z0-9]{2,8}$/)
  );
}

/** Generate optional loading sequence. */
function arbLoadingSequence(): fc.Arbitrary<number | null> {
  return fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 100 }));
}

/** Generate optional customer name. */
function arbCustomerName(): fc.Arbitrary<string | null> {
  return fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0)
  );
}

/** Generate optional customerOrderNumber. */
function arbCustomerOrderNumber(): fc.Arbitrary<string | null> {
  return fc.oneof(
    fc.constant(null),
    fc.stringMatching(/^CO-[0-9]{3,6}$/)
  );
}

/** Generate optional serialNumber. */
function arbSerialNumber(): fc.Arbitrary<string | null> {
  return fc.oneof(
    fc.constant(null),
    fc.stringMatching(/^SN-[0-9]{3,6}$/)
  );
}

/** Generate an optional category-like object (rucka, paspul, nogice). */
function arbCategoryItem(): fc.Arbitrary<{ id: string; name: string } | null> {
  return fc.oneof(
    fc.constant(null),
    fc.tuple(arbUUID(), fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0)).map(
      ([id, name]) => ({ id, name })
    )
  );
}

/**
 * Build a complete OrderRow with known values for preservation testing.
 * Includes all fields the current export uses.
 */
function arbOrderRow(): fc.Arbitrary<OrderRow> {
  return fc
    .tuple(
      arbUUID(), // order id
      fc.integer({ min: 1, max: 99999 }), // order number
      arbUUID(), // item id
      arbUUID(), // articleId
      arbArticleName(), // article.name
      fc.oneof(fc.constant(null), fc.tuple(arbUUID(), arbFabricName()).map(([id, name]) => ({ id, name }))), // fabric
      arbCategoryItem(), // rucka
      arbCategoryItem(), // paspul
      arbCategoryItem(), // nogice1
      arbCategoryItem(), // nogice2
      arbCustomerName(), // customerName
      arbStatus(), // status
      arbQuantity(), // quantity
      arbPriority(), // priority
      fc.oneof(fc.constant(null), arbISODate()), // deliveryDeadline
      arbNotes(), // notes
      arbCustomerOrderNumber(), // customerOrderNumber
      arbLoadingNumber(), // loadingNumber
      arbLoadingSequence(), // loadingSequence
      fc.oneof(fc.constant(null), fc.stringMatching(/^RN-[0-9]{3,6}$/)), // workOrderNumber
      fc.oneof(fc.constant(null), arbISODate()), // workOrderDate
      arbSerialNumber() // serialNumber
    )
    .map(
      ([
        orderId,
        orderNumber,
        itemId,
        articleId,
        articleName,
        fabric,
        rucka,
        paspul,
        nogice1,
        nogice2,
        customerName,
        status,
        quantity,
        priority,
        deliveryDeadline,
        notes,
        customerOrderNumber,
        loadingNumber,
        loadingSequence,
        workOrderNumber,
        workOrderDate,
        serialNumber,
      ]) => {
        return {
          id: orderId,
          orderNumber,
          workOrderNumber,
          workOrderDate,
          quantity,
          status,
          customerName,
          createdAt: new Date().toISOString(),
          article: { id: articleId, name: articleName },
          items: [
            {
              id: itemId,
              articleId,
              quantity,
              deliveryDeadline,
              priority,
              notes,
              customerOrderNumber,
              serialNumber,
              loadingNumber,
              loadingSequence,
              fabric,
              rucka,
              paspul,
              nogice1,
              nogice2,
              article: { id: articleId, name: articleName },
            },
          ],
          _count: { workOrders: 0 },
          workOrders: [],
        } as unknown as OrderRow;
      }
    );
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Parse the Excel buffer and return headers and first data row cell values.
 */
async function parseExcelRow(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("No worksheet found");

  const headerRow = ws.getRow(1);
  const dataRow = ws.getRow(2);

  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "");
  });

  const cells: string[] = [];
  dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cells[colNumber - 1] = String(cell.value ?? "");
  });

  return { headers, cells };
}

/**
 * Format an ISO date string as DD.MM.YYYY, matching the service's formatting.
 */
function formatDateDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// ─── Property-Based Tests ────────────────────────────────

describe("Preservation Property: Unchanged Columns and Import Compatibility", () => {
  /**
   * Property 2.1: Column D "Artikal" displays article.name correctly
   *
   * For any OrderRow with article.name, column D equals article.name.
   *
   * **Validates: Requirements 3.1**
   */
  fcTest.prop([arbOrderRow()])(
    "Column D (Artikal) always contains item.article.name",
    async (orderRow) => {
      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      const artikalColIndex = headers.indexOf("Artikal");
      expect(artikalColIndex).toBeGreaterThanOrEqual(0);

      const expectedName = orderRow.items[0].article.name;
      expect(cells[artikalColIndex]).toBe(expectedName);
    }
  );

  /**
   * Property 2.2: Column F "Štof" displays fabric.name correctly
   *
   * For any OrderRow with fabric.name, the Štof column equals fabric.name.
   * For null fabric, it equals empty string.
   *
   * **Validates: Requirements 3.2**
   */
  fcTest.prop([arbOrderRow()])(
    "Column F (Štof) always contains item.fabric.name or empty string",
    async (orderRow) => {
      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      const stofColIndex = headers.indexOf("Štof");
      expect(stofColIndex).toBeGreaterThanOrEqual(0);

      const expectedName = orderRow.items[0].fabric?.name ?? "";
      expect(cells[stofColIndex]).toBe(expectedName);
    }
  );

  /**
   * Property 2.3: Columns for quantity, priority, delivery date, notes,
   * loading number, and other fields remain unchanged.
   *
   * For any OrderRow, the non-buggy data columns produce the expected values.
   *
   * **Validates: Requirements 3.3**
   */
  fcTest.prop([arbOrderRow()])(
    "Columns for quantity, priority, delivery date, notes, loading number contain correct values",
    async (orderRow) => {
      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      const item = orderRow.items[0];

      // Column M: Količina
      const quantityColIndex = headers.indexOf("Količina");
      expect(quantityColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[quantityColIndex]).toBe(String(item.quantity));

      // Column N: Prioritet (translated to Bosnian)
      const priorityColIndex = headers.indexOf("Prioritet");
      expect(priorityColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[priorityColIndex]).toBe(translatePriorityToBS(item.priority));

      // Column O: Rok isporuke (DD.MM.YYYY format)
      const deadlineColIndex = headers.indexOf("Rok isporuke");
      expect(deadlineColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[deadlineColIndex]).toBe(formatDateDDMMYYYY(item.deliveryDeadline));

      // Column P: Bilješke
      const notesColIndex = headers.indexOf("Bilješke");
      expect(notesColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[notesColIndex]).toBe(item.notes ?? "");

      // Column R: Br. utovara
      const loadingColIndex = headers.indexOf("Br. utovara");
      expect(loadingColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[loadingColIndex]).toBe(item.loadingNumber ?? "");

      // Column K: Kupac
      const customerColIndex = headers.indexOf("Kupac");
      expect(customerColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[customerColIndex]).toBe(orderRow.customerName ?? "");

      // Column L: Status (translated to Bosnian)
      const statusColIndex = headers.indexOf("Status");
      expect(statusColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[statusColIndex]).toBe(
        STATUS_ENUM_TO_BS[orderRow.status] ?? orderRow.status
      );

      // Column C: Br. naloga
      const orderNumColIndex = headers.indexOf("Br. naloga");
      expect(orderNumColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[orderNumColIndex]).toBe(String(orderRow.orderNumber));

      // Column G: Ručka
      const ruckaColIndex = headers.indexOf("Ručka");
      expect(ruckaColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[ruckaColIndex]).toBe(item.rucka?.name ?? "");

      // Column H: Paspul
      const paspulColIndex = headers.indexOf("Paspul");
      expect(paspulColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[paspulColIndex]).toBe(item.paspul?.name ?? "");

      // Column I: Nogice 1
      const nogice1ColIndex = headers.indexOf("Nogice 1");
      expect(nogice1ColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[nogice1ColIndex]).toBe(item.nogice1?.name ?? "");

      // Column J: Nogice 2
      const nogice2ColIndex = headers.indexOf("Nogice 2");
      expect(nogice2ColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[nogice2ColIndex]).toBe(item.nogice2?.name ?? "");
    }
  );

  /**
   * Property 2.4: Export→Import roundtrip preserves all editable fields
   *
   * parseExcelBuffer correctly parses exported files and preserves
   * quantity, priority, delivery date, notes, loading number, and loading sequence.
   *
   * **Validates: Requirements 3.4**
   */
  fcTest.prop([arbOrderRow()])(
    "Export→Import roundtrip preserves all editable fields",
    async (orderRow) => {
      const buffer = await generateExcelBuffer([orderRow]);
      const result = await parseExcelBuffer(buffer);

      expect(result.rows.length).toBe(1);
      const parsed = result.rows[0];
      const item = orderRow.items[0];

      // Item ID preserved
      expect(parsed.itemId).toBe(item.id);

      // Order ID preserved
      expect(parsed.orderId).toBe(orderRow.id);

      // Quantity preserved
      expect(parsed.quantity).toBe(item.quantity);

      // Priority preserved (enum value roundtrip: enum → BS → enum)
      expect(parsed.priority).toBe(item.priority);

      // Delivery deadline preserved (ISO → DD.MM.YYYY → Date comparison)
      if (item.deliveryDeadline) {
        expect(parsed.deliveryDeadline).not.toBeNull();
        // Compare day/month/year (ignoring time)
        const original = new Date(item.deliveryDeadline);
        const roundtripped = parsed.deliveryDeadline!;
        expect(roundtripped.getFullYear()).toBe(original.getFullYear());
        expect(roundtripped.getMonth()).toBe(original.getMonth());
        expect(roundtripped.getDate()).toBe(original.getDate());
      } else {
        expect(parsed.deliveryDeadline).toBeNull();
      }

      // Notes preserved (parseExcelBuffer trims strings via cellToString)
      if (item.notes) {
        const trimmedNotes = item.notes.trim();
        expect(parsed.notes).toBe(trimmedNotes || null);
      } else {
        expect(parsed.notes).toBeNull();
      }

      // Serial number preserved (column R now maps serialNumber, stored in customerOrderNumber field)
      // parseExcelBuffer trims strings via cellToString
      if ((item as any).serialNumber) {
        const trimmedSN = String((item as any).serialNumber).trim();
        expect(parsed.customerOrderNumber).toBe(trimmedSN || null);
      } else {
        expect(parsed.customerOrderNumber).toBeNull();
      }

      // Loading number preserved (parseExcelBuffer trims strings)
      if (item.loadingNumber) {
        const trimmedLN = item.loadingNumber.trim();
        expect(parsed.loadingNumber).toBe(trimmedLN || null);
      } else {
        expect(parsed.loadingNumber).toBeNull();
      }

      // Loading sequence preserved
      if (item.loadingSequence != null) {
        expect(parsed.loadingSequence).toBe(item.loadingSequence);
      } else {
        expect(parsed.loadingSequence).toBeNull();
      }
    }
  );

  /**
   * Property 2.5: Null/undefined values produce empty strings without errors
   *
   * When fabric, rucka, paspul, nogice, notes, etc. are null, the
   * export produces empty strings and does not throw.
   *
   * **Validates: Requirements 3.5**
   */
  fcTest.prop([arbUUID(), fc.integer({ min: 1, max: 99999 }), arbUUID(), arbUUID(), arbArticleName()])(
    "Null/undefined values produce empty strings without errors",
    async (orderId, orderNumber, itemId, articleId, articleName) => {
      // Construct an OrderRow with all optional fields set to null
      const orderRow = {
        id: orderId,
        orderNumber,
        workOrderNumber: null,
        workOrderDate: null,
        quantity: 1,
        status: "in_progress",
        customerName: null,
        createdAt: new Date().toISOString(),
        article: { id: articleId, name: articleName },
        items: [
          {
            id: itemId,
            articleId,
            quantity: 1,
            deliveryDeadline: null,
            priority: "normal",
            notes: null,
            customerOrderNumber: null,
            loadingNumber: null,
            loadingSequence: null,
            fabric: null,
            rucka: null,
            paspul: null,
            nogice1: null,
            nogice2: null,
            article: { id: articleId, name: articleName },
          },
        ],
        _count: { workOrders: 0 },
        workOrders: [],
      } as unknown as OrderRow;

      // Should not throw
      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      // Fabric name → empty string
      const stofColIndex = headers.indexOf("Štof");
      expect(cells[stofColIndex]).toBe("");

      // Rucka → empty string
      const ruckaColIndex = headers.indexOf("Ručka");
      expect(cells[ruckaColIndex]).toBe("");

      // Paspul → empty string
      const paspulColIndex = headers.indexOf("Paspul");
      expect(cells[paspulColIndex]).toBe("");

      // Nogice 1 → empty string
      const nogice1ColIndex = headers.indexOf("Nogice 1");
      expect(cells[nogice1ColIndex]).toBe("");

      // Nogice 2 → empty string
      const nogice2ColIndex = headers.indexOf("Nogice 2");
      expect(cells[nogice2ColIndex]).toBe("");

      // Notes → empty string
      const notesColIndex = headers.indexOf("Bilješke");
      expect(cells[notesColIndex]).toBe("");

      // Loading number → empty string
      const loadingColIndex = headers.indexOf("Br. utovara");
      expect(cells[loadingColIndex]).toBe("");

      // CustomerName → empty string
      const customerColIndex = headers.indexOf("Kupac");
      expect(cells[customerColIndex]).toBe("");

      // Delivery deadline → empty string
      const deadlineColIndex = headers.indexOf("Rok isporuke");
      expect(cells[deadlineColIndex]).toBe("");

      // Work order number → empty string
      const wonColIndex = headers.indexOf("Broj radnog naloga");
      expect(cells[wonColIndex]).toBe("");

      // Work order date → empty string
      const wodColIndex = headers.indexOf("Datum radnog naloga");
      expect(cells[wodColIndex]).toBe("");

      // parseExcelBuffer should also succeed without errors
      const result = await parseExcelBuffer(buffer);
      expect(result.rows.length).toBe(1);
      expect(result.warnings.length).toBe(0);
    }
  );
});
