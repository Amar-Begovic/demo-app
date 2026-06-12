import { describe, it, expect } from "vitest";
import {
  extractArticleCode,
  extractFabricCode,
  parseExcelDate,
} from "@/lib/services/production-order-excel-parser";

describe("extractArticleCode", () => {
  it("extracts code from standard NAZIV format", () => {
    expect(
      extractArticleCode("BAREL 160X200 baza + uzglavlje / | kom | 641")
    ).toBe("641");
  });

  it("extracts code from NAZIV without trailing slash", () => {
    expect(
      extractArticleCode("NORMA 160X200 krevet + madrac-NOVO | kom | 1310")
    ).toBe("1310");
  });

  it("returns null when separator is missing", () => {
    expect(extractArticleCode("Some random text without separator")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractArticleCode("")).toBeNull();
  });

  it("handles extra whitespace around code", () => {
    expect(extractArticleCode("Article name | kom |  123  ")).toBe("123");
  });

  it("handles trailing / with spaces", () => {
    expect(extractArticleCode("Article name / | kom | 456 /")).toBe("456");
  });

  it("uses last separator when multiple exist", () => {
    expect(
      extractArticleCode("Name | kom | first | kom | 999")
    ).toBe("999");
  });
});

describe("extractFabricCode", () => {
  it("extracts code from standard STOF format", () => {
    expect(extractFabricCode("Štof Matt Velvet 08 | m | 217")).toBe("217");
  });

  it("returns null for empty fabric pattern |  |", () => {
    expect(extractFabricCode("|  |")).toBeNull();
  });

  it("returns null for empty fabric with extra spaces", () => {
    expect(extractFabricCode("|    |")).toBeNull();
  });

  it("returns null when separator is missing", () => {
    expect(extractFabricCode("Some text without separator")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractFabricCode("")).toBeNull();
  });

  it("handles extra whitespace around code", () => {
    expect(extractFabricCode("Fabric name | m |  300  ")).toBe("300");
  });

  it("uses last separator when multiple exist", () => {
    expect(extractFabricCode("Name | m | first | m | 555")).toBe("555");
  });
});

describe("parseExcelDate", () => {
  it("parses M/DD/YYYY format", () => {
    const result = parseExcelDate("3/24/2026");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(2); // March = 2
    expect(result!.getDate()).toBe(24);
  });

  it("parses MM/DD/YYYY format", () => {
    const result = parseExcelDate("12/05/2025");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(11); // December = 11
    expect(result!.getDate()).toBe(5);
  });

  it("returns null for null", () => {
    expect(parseExcelDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseExcelDate(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseExcelDate("")).toBeNull();
  });

  it("returns null for unrecognizable string", () => {
    expect(parseExcelDate("not-a-date")).toBeNull();
  });

  it("parses Excel serial number (e.g., 46157 = 2026-05-15)", () => {
    // Excel serial 46157 = May 15, 2026
    const result = parseExcelDate(46157);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(4); // May = 4
    expect(result!.getDate()).toBe(15);
  });

  it("handles Excel serial number 1 (Jan 1, 1900)", () => {
    const result = parseExcelDate(1);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(1900);
    expect(result!.getMonth()).toBe(0);
    expect(result!.getDate()).toBe(1);
  });

  it("handles Date objects", () => {
    const input = new Date(2025, 5, 15);
    const result = parseExcelDate(input);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(5);
    expect(result!.getDate()).toBe(15);
  });

  it("returns null for invalid date string format", () => {
    expect(parseExcelDate("2026-03-24")).toBeNull();
  });

  it("returns null for negative serial number", () => {
    expect(parseExcelDate(-1)).toBeNull();
  });

  it("returns null for zero serial number", () => {
    expect(parseExcelDate(0)).toBeNull();
  });
});

import { parseProductionOrderExcel } from "@/lib/services/production-order-excel-parser";
import ExcelJS from "exceljs";

/**
 * Helper: creates an Excel ArrayBuffer with the "Radni nalog" format.
 */
async function createTestExcel(options: {
  header?: { orderNumber?: string; customerName?: string; deliveryLocation?: string };
  items?: Array<{
    rb?: string | number;
    seriskiBroj?: string;
    naziv?: string;
    kolicina?: number;
    sadrzaj?: string;
    stof?: string;
    nogice?: string;
    napomena?: string;
    datumUtovara?: string | number | Date;
    barKod?: string;
  }>;
}): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Sheet1");

  // Row 1: Header
  const h = options.header ?? {};
  ws.getCell("A1").value = "RADNI NALOG";
  ws.getCell("C1").value = h.orderNumber ?? null;
  ws.getCell("D1").value = h.customerName ?? null;
  ws.getCell("G1").value = h.deliveryLocation ?? null;

  // Row 2: RN
  ws.getCell("A2").value = "RN";

  // Row 3: Empty

  // Row 4: Column names
  const colNames = ["RB", "SERISKI BROJ", "NAZIV", "KOLICINA", "SADRZAJ", "STOF", "NOGICE", "NAPOMENA", "DATUM UTOVARA", "BAR KOD"];
  colNames.forEach((name, idx) => {
    ws.getCell(4, idx + 1).value = name;
  });

  // Row 5+: Data
  const items = options.items ?? [];
  items.forEach((item, idx) => {
    const rowIdx = 5 + idx;
    if (item.rb !== undefined) ws.getCell(rowIdx, 1).value = item.rb;
    if (item.seriskiBroj !== undefined) ws.getCell(rowIdx, 2).value = item.seriskiBroj;
    if (item.naziv !== undefined) ws.getCell(rowIdx, 3).value = item.naziv;
    if (item.kolicina !== undefined) ws.getCell(rowIdx, 4).value = item.kolicina;
    if (item.sadrzaj !== undefined) ws.getCell(rowIdx, 5).value = item.sadrzaj;
    if (item.stof !== undefined) ws.getCell(rowIdx, 6).value = item.stof;
    if (item.nogice !== undefined) ws.getCell(rowIdx, 7).value = item.nogice;
    if (item.napomena !== undefined) ws.getCell(rowIdx, 8).value = item.napomena;
    if (item.datumUtovara !== undefined) ws.getCell(rowIdx, 9).value = item.datumUtovara as ExcelJS.CellValue;
    if (item.barKod !== undefined) ws.getCell(rowIdx, 10).value = item.barKod;
  });

  const nodeBuffer = await workbook.xlsx.writeBuffer();
  // Convert to ArrayBuffer
  const ab = new ArrayBuffer(nodeBuffer.byteLength);
  const view = new Uint8Array(ab);
  const src = new Uint8Array(nodeBuffer as ArrayBuffer);
  view.set(src);
  return ab;
}

describe("parseProductionOrderExcel", () => {
  it("parses header fields from row 1", async () => {
    const buffer = await createTestExcel({
      header: { orderNumber: "RN-2025-001", customerName: "Kupac d.o.o.", deliveryLocation: "Sarajevo" },
    });

    const result = await parseProductionOrderExcel(buffer);

    expect(result.header.orderNumber).toBe("RN-2025-001");
    expect(result.header.customerName).toBe("Kupac d.o.o.");
    expect(result.header.deliveryLocation).toBe("Sarajevo");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("parses data rows from row 5 onwards", async () => {
    const buffer = await createTestExcel({
      header: { orderNumber: "RN-001", customerName: "Test", deliveryLocation: "Loc" },
      items: [
        {
          rb: "1",
          seriskiBroj: "SB-100",
          naziv: "BAREL 160X200 baza + uzglavlje / | kom | 641",
          kolicina: 3,
          sadrzaj: "Sadržaj 1",
          stof: "Štof Matt Velvet 08 | m | 217",
          napomena: "Hitno",
          datumUtovara: "3/24/2026",
        },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.rowNumber).toBe(5);
    expect(item.customerOrderNumber).toBe("SB-100");
    expect(item.articleCode).toBe("641");
    expect(item.articleName).toBe("BAREL 160X200 baza + uzglavlje");
    expect(item.fabricCode).toBe("217");
    expect(item.fabricName).toBe("Štof Matt Velvet 08");
    expect(item.quantity).toBe(3);
    expect(item.content).toBe("Sadržaj 1");
    expect(item.notes).toBe("Hitno");
    expect(item.deliveryDeadline).not.toBeNull();
    expect(item.deliveryDeadline!.getFullYear()).toBe(2026);
    expect(item.deliveryDeadline!.getMonth()).toBe(2);
    expect(item.deliveryDeadline!.getDate()).toBe(24);
    expect(result.errors).toHaveLength(0);
  });

  it("skips rows where RB (column A) is empty", async () => {
    const buffer = await createTestExcel({
      header: { orderNumber: "RN-001" },
      items: [
        { rb: "1", naziv: "Article A | kom | 100", kolicina: 1 },
        { naziv: "Article B | kom | 200", kolicina: 2 }, // No RB → skip
        { rb: "3", naziv: "Article C | kom | 300", kolicina: 3 },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].articleCode).toBe("100");
    expect(result.items[1].articleCode).toBe("300");
  });

  it("defaults quantity to 1 when KOLICINA is not a number", async () => {
    const buffer = await createTestExcel({
      items: [
        { rb: "1", naziv: "Article | kom | 100" },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items[0].quantity).toBe(1);
  });

  it("accumulates parse errors for missing NAZIV separator", async () => {
    const buffer = await createTestExcel({
      items: [
        { rb: "1", naziv: "Article without separator", kolicina: 1 },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].articleCode).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe("NAZIV");
    expect(result.errors[0].rowNumber).toBe(5);
  });

  it("handles empty fabric pattern |  | without error", async () => {
    const buffer = await createTestExcel({
      items: [
        { rb: "1", naziv: "Article | kom | 100", stof: "|  |", kolicina: 1 },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items[0].fabricCode).toBeNull();
    expect(result.items[0].fabricName).toBeNull();
    expect(result.errors.filter(e => e.field === "STOF")).toHaveLength(0);
  });

  it("throws for invalid Excel data", async () => {
    const invalidBuffer = new ArrayBuffer(10);
    await expect(parseProductionOrderExcel(invalidBuffer)).rejects.toThrow();
  });

  it("throws when workbook has no worksheets", async () => {
    const workbook = new ExcelJS.Workbook();
    const nodeBuffer = await workbook.xlsx.writeBuffer();
    const ab = new ArrayBuffer(nodeBuffer.byteLength);
    new Uint8Array(ab).set(new Uint8Array(nodeBuffer as ArrayBuffer));

    await expect(parseProductionOrderExcel(ab)).rejects.toThrow("Datoteka ne sadrži podatke");
  });

  it("handles multiple data rows correctly", async () => {
    const buffer = await createTestExcel({
      header: { orderNumber: "RN-005", customerName: "Multi Kupac", deliveryLocation: "Tuzla" },
      items: [
        { rb: "1", seriskiBroj: "SB-1", naziv: "Art A | kom | 10", kolicina: 2, stof: "Fabric A | m | 20", napomena: "Note 1" },
        { rb: "2", seriskiBroj: "SB-2", naziv: "Art B | kom | 30", kolicina: 5, stof: "Fabric B | m | 40", napomena: "Note 2" },
        { rb: "3", seriskiBroj: "SB-3", naziv: "Art C | kom | 50", kolicina: 1, stof: "|  |" },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.header.orderNumber).toBe("RN-005");
    expect(result.header.customerName).toBe("Multi Kupac");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].articleCode).toBe("10");
    expect(result.items[0].fabricCode).toBe("20");
    expect(result.items[1].articleCode).toBe("30");
    expect(result.items[1].fabricCode).toBe("40");
    expect(result.items[2].articleCode).toBe("50");
    expect(result.items[2].fabricCode).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it("returns null header fields when row 1 cells are empty", async () => {
    const buffer = await createTestExcel({ header: {} });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.header.orderNumber).toBeNull();
    expect(result.header.customerName).toBeNull();
    expect(result.header.deliveryLocation).toBeNull();
  });
});

import {
  mapParsedItemsToOrderItems,
  type ParsedItem,
} from "@/lib/services/production-order-excel-parser";

describe("mapParsedItemsToOrderItems", () => {
  const articles = [
    { id: "art-1", name: "Article A", code: "100" },
    { id: "art-2", name: "Article B", code: "200" },
    { id: "art-3", name: "Article C", code: "300" },
  ];

  const fabrics = [
    { id: "fab-1", name: "Fabric X", code: "10" },
    { id: "fab-2", name: "Fabric Y", code: "20" },
  ];

  function makeParsedItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
    return {
      rowNumber: 5,
      articleCode: "100",
      articleName: "Article A",
      fabricCode: "10",
      fabricName: "Fabric X",
      ruckaName: null,
      paspulName: null,
      nogice1Name: null,
      nogice2Name: null,
      stepText: null,
      quantity: 2,
      customerOrderNumber: "SB-001",
      serialNumber: null,
      deliveryDeadline: new Date(2026, 2, 24),
      notes: "Test note",
      content: null,
      loadingSequence: null,
      ...overrides,
    };
  }

  it("maps article and fabric codes to IDs", () => {
    const items = [makeParsedItem()];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems).toHaveLength(1);
    expect(mappedItems[0].articleId).toBe("art-1");
    expect(mappedItems[0].fabricId).toBe("fab-1");
    expect(warnings).toHaveLength(0);
  });

  it("preserves quantity, notes, and customerOrderNumber", () => {
    const items = [makeParsedItem({ quantity: 5, notes: "Hitno", customerOrderNumber: "SB-999" })];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].quantity).toBe(5);
    expect(mappedItems[0].notes).toBe("Hitno");
    expect(mappedItems[0].customerOrderNumber).toBe("SB-999");
  });

  it("formats deliveryDeadline as YYYY-MM-DD", () => {
    const items = [makeParsedItem({ deliveryDeadline: new Date(2026, 2, 24) })];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].deliveryDeadline).toBe("2026-03-24");
  });

  it("sets deliveryDeadline to empty string when null", () => {
    const items = [makeParsedItem({ deliveryDeadline: null })];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].deliveryDeadline).toBe("");
  });

  it("sets priority to 'normal' by default", () => {
    const items = [makeParsedItem()];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].priority).toBe("normal");
  });

  it("sets notes to empty string when null", () => {
    const items = [makeParsedItem({ notes: null })];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].notes).toBe("");
  });

  it("sets customerOrderNumber to empty string when null", () => {
    const items = [makeParsedItem({ customerOrderNumber: null })];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].customerOrderNumber).toBe("");
  });

  it("adds unknown_article warning when article code not found", () => {
    const items = [makeParsedItem({ articleCode: "999", articleName: "Unknown Art" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].articleId).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("unknown_article");
    expect(warnings[0].code).toBe("999");
    expect(warnings[0].name).toBe("Unknown Art");
  });

  it("adds unknown_fabric warning when fabric code not found", () => {
    const items = [makeParsedItem({ fabricCode: "999", fabricName: "Unknown Fab" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].fabricId).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("unknown_fabric");
    expect(warnings[0].code).toBe("999");
    expect(warnings[0].name).toBe("Unknown Fab");
  });

  it("does NOT add unknown_fabric warning when fabricCode is null", () => {
    const items = [makeParsedItem({ fabricCode: null, fabricName: null })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].fabricId).toBe("");
    expect(warnings).toHaveLength(0);
  });

  it("performs case-insensitive matching for article codes", () => {
    const articlesWithCase = [{ id: "art-1", name: "A", code: "ABC" }];
    const items = [makeParsedItem({ articleCode: "abc" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articlesWithCase, []);

    expect(mappedItems[0].articleId).toBe("art-1");
    expect(warnings.filter(w => w.type === "unknown_article")).toHaveLength(0);
  });

  it("performs case-insensitive matching for fabric codes", () => {
    const fabricsWithCase = [{ id: "fab-1", name: "F", code: "XYZ" }];
    const items = [makeParsedItem({ fabricCode: "xyz" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, [], fabricsWithCase);

    expect(mappedItems[0].fabricId).toBe("fab-1");
    expect(warnings.filter(w => w.type === "unknown_fabric")).toHaveLength(0);
  });

  it("trims whitespace when matching codes", () => {
    const items = [makeParsedItem({ articleCode: " 100 ", fabricCode: " 10 " })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].articleId).toBe("art-1");
    expect(mappedItems[0].fabricId).toBe("fab-1");
    expect(warnings).toHaveLength(0);
  });

  it("maps multiple items correctly", () => {
    const items = [
      makeParsedItem({ rowNumber: 5, articleCode: "100", fabricCode: "10" }),
      makeParsedItem({ rowNumber: 6, articleCode: "200", fabricCode: "20" }),
      makeParsedItem({ rowNumber: 7, articleCode: "300", fabricCode: null }),
    ];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems).toHaveLength(3);
    expect(mappedItems[0].articleId).toBe("art-1");
    expect(mappedItems[1].articleId).toBe("art-2");
    expect(mappedItems[2].articleId).toBe("art-3");
    expect(mappedItems[2].fabricId).toBe("");
    expect(warnings).toHaveLength(0);
  });

  it("handles empty items array", () => {
    const { mappedItems, warnings } = mapParsedItemsToOrderItems([], articles, fabrics);

    expect(mappedItems).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("handles empty articles and fabrics arrays", () => {
    const items = [makeParsedItem({ articleCode: "100", fabricCode: "10" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, [], []);

    // Items without valid articleId are kept for display but won't be submitted
    const noArticle = mappedItems.filter(i => i.articleId === "");
    expect(noArticle).toHaveLength(1);
    expect(noArticle[0].fabricId).toBe("");
    expect(warnings).toHaveLength(2);
    expect(warnings[0].type).toBe("unknown_article");
    expect(warnings[1].type).toBe("unknown_fabric");
  });

  it("sets articleId to empty string when articleCode is null", () => {
    const items = [makeParsedItem({ articleCode: null })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    // Items without articleCode get empty articleId
    const noArticle = mappedItems.filter(i => i.articleId === "");
    expect(noArticle).toHaveLength(1);
    expect(warnings.filter(w => w.type === "unknown_article")).toHaveLength(0);
  });

  it("aggregates duplicate articleId+fabricId by summing quantities", () => {
    const items = [
      makeParsedItem({ rowNumber: 5, articleCode: "100", fabricCode: "10", quantity: 3 }),
      makeParsedItem({ rowNumber: 6, articleCode: "100", fabricCode: "10", quantity: 5 }),
      makeParsedItem({ rowNumber: 7, articleCode: "100", fabricCode: "10", quantity: 2 }),
    ];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    const validItems = mappedItems.filter(i => i.articleId !== "");
    expect(validItems).toHaveLength(1);
    expect(validItems[0].articleId).toBe("art-1");
    expect(validItems[0].quantity).toBe(10); // 3 + 5 + 2
  });

  it("keeps separate items when same article has different fabric", () => {
    const items = [
      makeParsedItem({ rowNumber: 5, articleCode: "100", fabricCode: "10", quantity: 3 }),
      makeParsedItem({ rowNumber: 6, articleCode: "100", fabricCode: "20", quantity: 5 }),
    ];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    const validItems = mappedItems.filter(i => i.articleId !== "");
    expect(validItems).toHaveLength(2);
    expect(validItems[0].fabricId).toBe("fab-1");
    expect(validItems[0].quantity).toBe(3);
    expect(validItems[1].fabricId).toBe("fab-2");
    expect(validItems[1].quantity).toBe(5);
  });

  it("keeps earliest deadline when aggregating", () => {
    const items = [
      makeParsedItem({ articleCode: "100", deliveryDeadline: new Date(2026, 5, 15) }),
      makeParsedItem({ articleCode: "100", deliveryDeadline: new Date(2026, 2, 1) }),
      makeParsedItem({ articleCode: "100", deliveryDeadline: new Date(2026, 8, 20) }),
    ];
    const { mappedItems } = mapParsedItemsToOrderItems(items, articles, fabrics);

    const validItems = mappedItems.filter(i => i.articleId !== "");
    expect(validItems).toHaveLength(1);
    expect(validItems[0].deliveryDeadline).toBe("2026-03-01");
  });
});

describe("parseProductionOrderExcel - category item columns", () => {
  async function createTestExcelWithCategories(options: {
    headerRow?: Record<string, string>;
    columnNames?: string[];
    items?: Array<Record<number, string | number>>;
  }): Promise<ArrayBuffer> {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Sheet1");

    // Row 1: Header
    if (options.headerRow) {
      Object.entries(options.headerRow).forEach(([cell, value]) => {
        ws.getCell(cell).value = value;
      });
    }

    // Row 2: Column names
    const colNames = options.columnNames ?? ["RB", "SERISKI BROJ", "NAZIV", "KOLICINA", "SADRZAJ", "STOF", "SIFRA STOFA", "NOGICE", "NAPOMENA", "DATUM UTOVARA", "BAR KOD", "Ručka", "Paspul", "Nogice 1", "Nogice 2"];
    colNames.forEach((name, idx) => {
      ws.getCell(2, idx + 1).value = name;
    });

    // Row 3+: Data
    const items = options.items ?? [];
    items.forEach((item, idx) => {
      const rowIdx = 3 + idx;
      Object.entries(item).forEach(([col, value]) => {
        ws.getCell(rowIdx, Number(col)).value = value as ExcelJS.CellValue;
      });
    });

    const nodeBuffer = await workbook.xlsx.writeBuffer();
    const ab = new ArrayBuffer(nodeBuffer.byteLength);
    new Uint8Array(ab).set(new Uint8Array(nodeBuffer as ArrayBuffer));
    return ab;
  }

  it("reads category item columns by header name", async () => {
    const buffer = await createTestExcelWithCategories({
      headerRow: { B1: "RN-001", C1: "Kupac" },
      items: [
        { 1: "1", 3: "Article | kom | 100", 4: 2, 12: "Ručka A", 13: "Paspul B", 14: "Nogica X", 15: "Nogica Y" },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].ruckaName).toBe("Ručka A");
    expect(result.items[0].paspulName).toBe("Paspul B");
    expect(result.items[0].nogice1Name).toBe("Nogica X");
    expect(result.items[0].nogice2Name).toBe("Nogica Y");
  });

  it("trims whitespace from category item cell values", async () => {
    const buffer = await createTestExcelWithCategories({
      items: [
        { 1: "1", 3: "Article | kom | 100", 4: 1, 12: "  Ručka A  ", 13: "  Paspul B  ", 14: "  Nogica X  ", 15: "  Nogica Y  " },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items[0].ruckaName).toBe("Ručka A");
    expect(result.items[0].paspulName).toBe("Paspul B");
    expect(result.items[0].nogice1Name).toBe("Nogica X");
    expect(result.items[0].nogice2Name).toBe("Nogica Y");
  });

  it("returns null for empty category item cells", async () => {
    const buffer = await createTestExcelWithCategories({
      items: [
        { 1: "1", 3: "Article | kom | 100", 4: 1 },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items[0].ruckaName).toBeNull();
    expect(result.items[0].paspulName).toBeNull();
    expect(result.items[0].nogice1Name).toBeNull();
    expect(result.items[0].nogice2Name).toBeNull();
  });

  it("returns null for all category fields when columns are missing from file", async () => {
    const buffer = await createTestExcelWithCategories({
      columnNames: ["RB", "SERISKI BROJ", "NAZIV", "KOLICINA", "SADRZAJ", "STOF", "SIFRA STOFA", "NAPOMENA"],
      items: [
        { 1: "1", 3: "Article | kom | 100", 4: 1 },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items[0].ruckaName).toBeNull();
    expect(result.items[0].paspulName).toBeNull();
    expect(result.items[0].nogice1Name).toBeNull();
    expect(result.items[0].nogice2Name).toBeNull();
  });

  it("handles partial category columns (only some present)", async () => {
    const buffer = await createTestExcelWithCategories({
      columnNames: ["RB", "SERISKI BROJ", "NAZIV", "KOLICINA", "SADRZAJ", "STOF", "SIFRA STOFA", "Ručka", "Nogice 2"],
      items: [
        { 1: "1", 3: "Article | kom | 100", 4: 1, 8: "Handle A", 9: "Leg B" },
      ],
    });

    const result = await parseProductionOrderExcel(buffer);
    expect(result.items[0].ruckaName).toBe("Handle A");
    expect(result.items[0].paspulName).toBeNull();
    expect(result.items[0].nogice1Name).toBeNull();
    expect(result.items[0].nogice2Name).toBe("Leg B");
  });
});

describe("mapParsedItemsToOrderItems - category items", () => {
  const articles = [
    { id: "art-1", name: "Article A", code: "100" },
  ];
  const fabrics = [
    { id: "fab-1", name: "Fabric X", code: "10" },
  ];
  const rucke = [
    { id: "rucka-1", name: "Ručka A" },
    { id: "rucka-2", name: "Ručka B" },
  ];
  const paspuli = [
    { id: "paspul-1", name: "Paspul X" },
    { id: "paspul-2", name: "Paspul Y" },
  ];
  const nogice = [
    { id: "nogica-1", name: "Nogica 1" },
    { id: "nogica-2", name: "Nogica 2" },
    { id: "nogica-3", name: "Nogica 3" },
  ];

  function makeParsedItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
    return {
      rowNumber: 5,
      articleCode: "100",
      articleName: "Article A",
      fabricCode: "10",
      fabricName: "Fabric X",
      ruckaName: null,
      paspulName: null,
      nogice1Name: null,
      nogice2Name: null,
      stepText: null,
      quantity: 1,
      serialNumber: null,
      deliveryDeadline: null,
      notes: null,
      content: null,
      loadingSequence: null,
      ...overrides,
    };
  }

  it("matches category items by name case-insensitively", () => {
    const items = [makeParsedItem({ ruckaName: "ručka a", paspulName: "PASPUL X", nogice1Name: "nogica 1", nogice2Name: "NOGICA 3" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics, { rucke, paspuli, nogice });

    expect(mappedItems[0].ruckaId).toBe("rucka-1");
    expect(mappedItems[0].paspulId).toBe("paspul-1");
    expect(mappedItems[0].nogice1Id).toBe("nogica-1");
    expect(mappedItems[0].nogice2Id).toBe("nogica-3");
    expect(warnings).toHaveLength(0);
  });

  it("trims whitespace before matching category items", () => {
    const items = [makeParsedItem({ ruckaName: "  Ručka A  ", paspulName: "  Paspul X  " })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics, { rucke, paspuli, nogice });

    expect(mappedItems[0].ruckaId).toBe("rucka-1");
    expect(mappedItems[0].paspulId).toBe("paspul-1");
    expect(warnings).toHaveLength(0);
  });

  it("generates warning for unrecognized category item name", () => {
    const items = [makeParsedItem({ ruckaName: "Unknown Handle", paspulName: "Unknown Piping" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics, { rucke, paspuli, nogice });

    expect(mappedItems[0].ruckaId).toBe("");
    expect(mappedItems[0].paspulId).toBe("");
    expect(warnings).toHaveLength(2);
    expect(warnings[0].type).toBe("unknown_rucka");
    expect(warnings[0].name).toBe("Unknown Handle");
    expect(warnings[0].rowNumber).toBe(5);
    expect(warnings[0].message).toContain("Unknown Handle");
    expect(warnings[0].message).toContain("Ručka");
    expect(warnings[1].type).toBe("unknown_paspul");
    expect(warnings[1].name).toBe("Unknown Piping");
    expect(warnings[1].message).toContain("Paspul");
  });

  it("generates warning for unrecognized nogice names", () => {
    const items = [makeParsedItem({ nogice1Name: "Bad Leg", nogice2Name: "Another Bad" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics, { rucke, paspuli, nogice });

    expect(mappedItems[0].nogice1Id).toBe("");
    expect(mappedItems[0].nogice2Id).toBe("");
    expect(warnings).toHaveLength(2);
    expect(warnings[0].type).toBe("unknown_nogice1");
    expect(warnings[0].message).toContain("Nogice 1");
    expect(warnings[1].type).toBe("unknown_nogice2");
    expect(warnings[1].message).toContain("Nogice 2");
  });

  it("leaves category fields empty for null/empty names without warning", () => {
    const items = [makeParsedItem({ ruckaName: null, paspulName: "", nogice1Name: "   ", nogice2Name: null })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics, { rucke, paspuli, nogice });

    expect(mappedItems[0].ruckaId).toBe("");
    expect(mappedItems[0].paspulId).toBe("");
    expect(mappedItems[0].nogice1Id).toBe("");
    expect(mappedItems[0].nogice2Id).toBe("");
    expect(warnings).toHaveLength(0);
  });

  it("works without categoryItems parameter (backward compatible)", () => {
    const items = [makeParsedItem({ ruckaName: "Ručka A" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics);

    expect(mappedItems[0].ruckaId).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("unknown_rucka");
  });

  it("works with empty category item lists", () => {
    const items = [makeParsedItem({ ruckaName: "Ručka A" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics, { rucke: [], paspuli: [], nogice: [] });

    expect(mappedItems[0].ruckaId).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("unknown_rucka");
  });

  it("allows nogice1 and nogice2 to reference the same record", () => {
    const items = [makeParsedItem({ nogice1Name: "Nogica 1", nogice2Name: "Nogica 1" })];
    const { mappedItems, warnings } = mapParsedItemsToOrderItems(items, articles, fabrics, { rucke, paspuli, nogice });

    expect(mappedItems[0].nogice1Id).toBe("nogica-1");
    expect(mappedItems[0].nogice2Id).toBe("nogica-1");
    expect(warnings).toHaveLength(0);
  });
});
