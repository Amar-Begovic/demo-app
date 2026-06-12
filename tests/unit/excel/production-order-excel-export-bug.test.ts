/**
 * Bug Condition Exploration Test
 *
 * Property 1: Bug Condition - Incorrect Column Mapping for Serial Number,
 * Article Code, and Fabric Code
 *
 * This test encodes the EXPECTED (correct) behavior. It is designed to FAIL
 * on unfixed code, confirming the three mapping bugs exist:
 *   - Column Q contains `customerOrderNumber` instead of `serialNumber`
 *   - Column E contains UUID (`articleId`) instead of `article.code`
 *   - `fabric.code` does not appear anywhere in the exported file
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

import { describe, expect } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import ExcelJS from "exceljs";
import {
  generateExcelBuffer,
  EXCEL_HEADERS,
} from "@/lib/services/production-order-excel.service";
import type { OrderRow } from "@/app/(dashboard)/production/components/selectable-order-table";

// ─── Helpers ─────────────────────────────────────────────

/**
 * Generate an arbitrary non-empty alphanumeric string to use as codes/IDs.
 */
function arbCode(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[A-Z0-9]{2,10}$/);
}

/**
 * Generate a serial number string like "SN-XXXX".
 */
function arbSerialNumber(): fc.Arbitrary<string> {
  return fc.stringMatching(/^SN-[0-9]{3,6}$/);
}

/**
 * Generate a UUID-like string for articleId.
 */
function arbUUID(): fc.Arbitrary<string> {
  return fc.uuid();
}

/**
 * Build an OrderRow with items that have known serialNumber, article.code,
 * and fabric.code values. We cast to OrderRow because the current interface
 * doesn't have all these fields — the test encodes the expected structure
 * after the fix.
 */
function arbOrderRowWithKnownValues(): fc.Arbitrary<{
  orderRow: OrderRow;
  expectedSerialNumber: string;
  expectedArticleCode: string;
  expectedFabricCode: string;
  actualArticleId: string;
  actualCustomerOrderNumber: string;
}> {
  return fc
    .tuple(
      arbUUID(), // order id
      fc.nat({ max: 9999 }), // order number
      arbUUID(), // item id
      arbUUID(), // articleId (UUID)
      arbCode(), // article.code
      fc.string({ minLength: 1, maxLength: 20 }), // article.name
      arbCode(), // fabric.code
      fc.string({ minLength: 1, maxLength: 20 }), // fabric.name
      arbUUID(), // fabric.id
      arbSerialNumber(), // serialNumber
      fc.string({ minLength: 1, maxLength: 20 }) // customerOrderNumber
    )
    .map(
      ([
        orderId,
        orderNum,
        itemId,
        articleId,
        articleCode,
        articleName,
        fabricCode,
        fabricName,
        fabricId,
        serialNumber,
        customerOrderNumber,
      ]) => {
        // Construct the OrderRow with ALL fields (including ones the fix will add)
        const orderRow = {
          id: orderId,
          orderNumber: orderNum,
          workOrderNumber: null,
          workOrderDate: null,
          quantity: 1,
          status: "in_progress",
          customerName: "Test Customer",
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
              customerOrderNumber,
              loadingNumber: null,
              loadingSequence: null,
              fabric: { id: fabricId, name: fabricName, code: fabricCode },
              rucka: null,
              paspul: null,
              nogice1: null,
              nogice2: null,
              article: { id: articleId, name: articleName, code: articleCode },
              serialNumber,
            },
          ],
          _count: { workOrders: 0 },
          workOrders: [],
        } as unknown as OrderRow;

        return {
          orderRow,
          expectedSerialNumber: serialNumber,
          expectedArticleCode: articleCode,
          expectedFabricCode: fabricCode,
          actualArticleId: articleId,
          actualCustomerOrderNumber: customerOrderNumber,
        };
      }
    );
}

/**
 * Parse the Excel buffer back into a workbook and return the first data row cells.
 */
async function parseExcelRow(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("No worksheet found");

  // Row 1 is headers, row 2 is first data row
  const headerRow = ws.getRow(1);
  const dataRow = ws.getRow(2);

  // Collect all header values
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "");
  });

  // Get all cell values from the data row
  const cells: string[] = [];
  dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cells[colNumber - 1] = String(cell.value ?? "");
  });

  return { headers, cells };
}

// ─── Property-Based Tests ────────────────────────────────

describe("Bug Condition Exploration: Column Mapping Bugs", () => {
  /**
   * Property 1.1: Column Q ("Serijski broj") should contain item.serialNumber
   *
   * EXPECTED TO FAIL on unfixed code because column Q currently maps
   * `item.customerOrderNumber` instead of `item.serialNumber`.
   *
   * **Validates: Requirements 1.1**
   */
  fcTest.prop([arbOrderRowWithKnownValues()])(
    "Column Q (Serijski broj) contains serialNumber, not customerOrderNumber",
    async ({ orderRow, expectedSerialNumber, actualCustomerOrderNumber }) => {
      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      // Find "Serijski broj" column index
      const serialColIndex = headers.indexOf("Serijski broj");
      expect(serialColIndex).toBeGreaterThanOrEqual(0);

      const cellValue = cells[serialColIndex];
      // The cell should contain the serialNumber, NOT the customerOrderNumber
      expect(cellValue).toBe(expectedSerialNumber);
    }
  );

  /**
   * Property 1.2: Column E ("Šifra artikla") should contain item.article.code
   *
   * EXPECTED TO FAIL on unfixed code because column E currently maps
   * `item.articleId` (a UUID) instead of `item.article.code`.
   *
   * **Validates: Requirements 1.2**
   */
  fcTest.prop([arbOrderRowWithKnownValues()])(
    "Column E (Šifra artikla) contains article.code, not articleId UUID",
    async ({ orderRow, expectedArticleCode, actualArticleId }) => {
      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      // Find "Šifra artikla" column index
      const articleCodeColIndex = headers.indexOf("Šifra artikla");
      expect(articleCodeColIndex).toBeGreaterThanOrEqual(0);

      const cellValue = cells[articleCodeColIndex];
      // The cell should contain article.code, NOT the UUID articleId
      expect(cellValue).toBe(expectedArticleCode);
      expect(cellValue).not.toBe(actualArticleId);
    }
  );

  /**
   * Property 1.3: A "Šifra štofa" column should exist containing item.fabric.code
   *
   * EXPECTED TO FAIL on unfixed code because no "Šifra štofa" column exists
   * in the current export.
   *
   * **Validates: Requirements 1.3**
   */
  fcTest.prop([arbOrderRowWithKnownValues()])(
    "A 'Šifra štofa' column exists and contains fabric.code",
    async ({ orderRow, expectedFabricCode }) => {
      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      // There should be a "Šifra štofa" header
      const fabricCodeColIndex = headers.indexOf("Šifra štofa");
      expect(fabricCodeColIndex).toBeGreaterThanOrEqual(0);

      // The cell under that header should contain fabric.code
      const cellValue = cells[fabricCodeColIndex];
      expect(cellValue).toBe(expectedFabricCode);
    }
  );

  /**
   * Property 1.4: Null/undefined values produce empty strings
   *
   * When serialNumber, article.code, or fabric.code are null/undefined,
   * the corresponding cells should contain empty strings.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  fcTest.prop([arbUUID(), fc.nat({ max: 9999 }), arbUUID(), arbUUID()])(
    "Null serialNumber, article.code, and fabric produce empty strings",
    async (orderId, orderNum, itemId, articleId) => {
      const orderRow = {
        id: orderId,
        orderNumber: orderNum,
        workOrderNumber: null,
        workOrderDate: null,
        quantity: 1,
        status: "in_progress",
        customerName: null,
        createdAt: new Date().toISOString(),
        article: { id: articleId, name: "Test Article" },
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
            article: { id: articleId, name: "Test Article", code: null },
            serialNumber: null,
          },
        ],
        _count: { workOrders: 0 },
        workOrders: [],
      } as unknown as OrderRow;

      const buffer = await generateExcelBuffer([orderRow]);
      const { headers, cells } = await parseExcelRow(buffer);

      // Serijski broj column should be empty string
      const serialColIndex = headers.indexOf("Serijski broj");
      expect(serialColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[serialColIndex]).toBe("");

      // Šifra artikla column should be empty string (not UUID)
      const articleCodeColIndex = headers.indexOf("Šifra artikla");
      expect(articleCodeColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[articleCodeColIndex]).toBe("");

      // Šifra štofa column should exist and be empty string
      const fabricCodeColIndex = headers.indexOf("Šifra štofa");
      expect(fabricCodeColIndex).toBeGreaterThanOrEqual(0);
      expect(cells[fabricCodeColIndex]).toBe("");
    }
  );
});
