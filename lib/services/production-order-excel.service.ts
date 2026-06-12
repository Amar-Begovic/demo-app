/**
 * Excel service for production order import/export.
 *
 * Pure translation maps and helpers — no database or exceljs
 * dependency. Buffer generation and parsing are added in later tasks.
 */

import type { OrderPriority } from "@/app/generated/prisma";

// ─── Priority translation maps ──────────────────────────────

/** Bosnian label → enum value */
export const PRIORITY_BS_TO_ENUM: Record<string, OrderPriority> = {
  Hitan: "urgent",
  Normalan: "normal",
  Nizak: "low",
};

/** Enum value → Bosnian label */
export const PRIORITY_ENUM_TO_BS: Record<string, string> = {
  urgent: "Hitan",
  normal: "Normalan",
  low: "Nizak",
};

// ─── Status translation map ─────────────────────────────────

/** Enum value → Bosnian label */
export const STATUS_ENUM_TO_BS: Record<string, string> = {
  draft: "Nacrt",
  waiting_material: "Čeka materijal",
  ready: "Spreman",
  in_progress: "U izradi",
  completed: "Završen",
};

// ─── Translation helpers ────────────────────────────────────

/**
 * Translate an enum priority value to its Bosnian label.
 * Returns the original string when no mapping exists.
 */
export function translatePriorityToBS(enumVal: string): string {
  return PRIORITY_ENUM_TO_BS[enumVal] ?? enumVal;
}

/**
 * Translate a Bosnian priority label back to the enum value.
 * Returns `undefined` when the label is not recognised.
 */
export function translatePriorityToEnum(
  bsVal: string,
): OrderPriority | undefined {
  return PRIORITY_BS_TO_ENUM[bsVal];
}

// ─── Excel column headers (A → V) ─────────────────────────────

/** All column headers in Bosnian, ordered A → V. */
export const EXCEL_HEADERS: string[] = [
  "ID stavke",
  "ID naloga",
  "Br. naloga",
  "Artikal",
  "Šifra artikla",
  "Šifra štofa",
  "Štof",
  "Ručka",
  "Paspul",
  "Nogice 1",
  "Nogice 2",
  "Kupac",
  "Status",
  "Količina",
  "Prioritet",
  "Rok isporuke",
  "Bilješke",
  "Serijski broj",
  "Br. utovara",
  "Broj radnog naloga",
  "R.b. iz utovara",
  "Datum radnog naloga",
];

// ─── Excel buffer generation ────────────────────────────────

import type { OrderRow } from "@/app/(dashboard)/production/components/selectable-order-table";
import ExcelJS from "exceljs";

/**
 * Format an ISO date string as DD.MM.YYYY.
 * Returns an empty string when the input is null/undefined/empty.
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

/** Gray fill for read-only columns A-M and U-V */
const GRAY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF0F0F0" },
};

/** White fill for editable columns N-T */
const WHITE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFFFF" },
};

/**
 * Generate an Excel (.xlsx) buffer from an array of production orders.
 *
 * Each `OrderItem` within each order becomes one row. Columns A-M are
 * read-only identification columns (gray background), columns N-T are
 * editable (white background), columns U-V are read-only (gray).
 *
 * @param orders - Array of OrderRow objects (from the production list page)
 * @returns ArrayBuffer containing the .xlsx file
 */
export async function generateExcelBuffer(
  orders: OrderRow[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Nalozi");

  // ── Row 1: Headers ──────────────────────────────────────
  const headerRow = worksheet.addRow(EXCEL_HEADERS);

  // Style header cells
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = (colNumber <= 13 || colNumber >= 21) ? GRAY_FILL : WHITE_FILL;
  });

  // ── Row 2+: One row per item across all orders ─────────
  for (const order of orders) {
    for (const item of order.items) {
      const row = worksheet.addRow([
        /* A  */ item.id,
        /* B  */ order.id,
        /* C  */ order.orderNumber,
        /* D  */ item.article.name,
        /* E  */ item.article?.code ?? "",
        /* F  */ item.fabric?.code ?? "",
        /* G  */ item.fabric?.name ?? "",
        /* H  */ item.rucka?.name ?? "",
        /* I  */ item.paspul?.name ?? "",
        /* J  */ item.nogice1?.name ?? "",
        /* K  */ item.nogice2?.name ?? "",
        /* L  */ order.customerName ?? "",
        /* M  */ STATUS_ENUM_TO_BS[order.status] ?? order.status,
        /* N  */ item.quantity,
        /* O  */ translatePriorityToBS(item.priority),
        /* P  */ formatDateDDMMYYYY(item.deliveryDeadline),
        /* Q  */ item.notes ?? "",
        /* R  */ item.serialNumber ?? "",
        /* S  */ item.loadingNumber ?? "",
        /* T  */ item.loadingSequence ?? "",
        /* U  */ order.workOrderNumber ?? "",
        /* V  */ formatDateDDMMYYYY(order.workOrderDate),
      ]);

      // Apply background fills per column
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.fill = (colNumber <= 13 || colNumber >= 21) ? GRAY_FILL : WHITE_FILL;
      });

      // Column P (16): date format
      const dateCell = row.getCell(16);
      dateCell.numFmt = "@"; // text format to preserve DD.MM.YYYY string

      // Column O (15): data validation for priority
      const priorityCell = row.getCell(15);
      priorityCell.dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"Hitan,Normalan,Nizak"'],
        showErrorMessage: true,
        errorTitle: "Nevalidan prioritet",
        error: 'Odaberite jednu od vrijednosti: "Hitan", "Normalan", "Nizak"',
      };
    }
  }

  // ── Write buffer ────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

// ─── Excel buffer parsing ───────────────────────────────────

/** Result of parsing a single Excel data row. */
export interface ParsedExcelRow {
  itemId: string;
  orderId: string;
  quantity: number | null;
  priority: string | null;
  deliveryDeadline: Date | null;
  notes: string | null;
  serialNumber: string | null;
  workOrderNumber: string | null;
  workOrderDate: Date | null;
  loadingNumber: string | null;
  loadingSequence: number | null;
}

/** Result of parsing an entire Excel buffer. */
export interface ParseExcelResult {
  rows: ParsedExcelRow[];
  warnings: Array<{ row: number; field: string; message: string }>;
}

/**
 * Parse a DD.MM.YYYY string into a Date object.
 * Returns `null` when the input is empty or not in the expected format.
 */
function parseDateDDMMYYYY(value: string): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Read a cell value as a trimmed string. Returns empty string for null/undefined. */
function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) {
    const day = String(v.getDate()).padStart(2, "0");
    const month = String(v.getMonth() + 1).padStart(2, "0");
    const year = v.getFullYear();
    return `${day}.${month}.${year}`;
  }
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText
      .map((r) => r.text)
      .join("")
      .trim();
  }
  return String(v).trim();
}

/** Old 21-column headers (before "Šifra štofa" was added). Used for backward compatibility. */
const EXCEL_HEADERS_OLD: string[] = [
  "ID stavke",
  "ID naloga",
  "Br. naloga",
  "Artikal",
  "Šifra artikla",
  "Štof",
  "Ručka",
  "Paspul",
  "Nogice 1",
  "Nogice 2",
  "Kupac",
  "Status",
  "Količina",
  "Prioritet",
  "Rok isporuke",
  "Bilješke",
  "Serijski broj",
  "Br. utovara",
  "Broj radnog naloga",
  "R.b. iz utovara",
  "Datum radnog naloga",
];

/**
 * Detect whether the worksheet uses the new 22-column format (with "Šifra štofa")
 * or the old 21-column format. Returns the column offset to apply.
 *
 * - New format (22 cols): offset = 0 (columns are as defined in EXCEL_HEADERS)
 * - Old format (21 cols): offset = -1 (columns after E are shifted left by 1)
 */
function detectFormatAndValidate(
  headerRow: ExcelJS.Row,
): { isNewFormat: boolean } {
  // Check if the 6th column is "Šifra štofa" (new format) or "Štof" (old format)
  const col6Value = cellToString(headerRow.getCell(6));

  if (col6Value === "Šifra štofa") {
    // Validate full new 22-column format
    for (let col = 1; col <= 22; col++) {
      const actual = cellToString(headerRow.getCell(col));
      if (actual !== EXCEL_HEADERS[col - 1]) {
        throw new Error(
          "Datoteka nije u ispravnom formatu. Koristite datoteku generiranu putem Izvoz Excel funkcije",
        );
      }
    }
    return { isNewFormat: true };
  }

  if (col6Value === "Štof") {
    // Validate old 21-column format
    for (let col = 1; col <= 21; col++) {
      const actual = cellToString(headerRow.getCell(col));
      if (actual !== EXCEL_HEADERS_OLD[col - 1]) {
        throw new Error(
          "Datoteka nije u ispravnom formatu. Koristite datoteku generiranu putem Izvoz Excel funkcije",
        );
      }
    }
    return { isNewFormat: false };
  }

  throw new Error(
    "Datoteka nije u ispravnom formatu. Koristite datoteku generiranu putem Izvoz Excel funkcije",
  );
}

/**
 * Parse an Excel (.xlsx) buffer previously generated by `generateExcelBuffer`.
 *
 * Supports both the new 22-column format (with "Šifra štofa" at position F)
 * and the old 21-column format (without "Šifra štofa") for backward compatibility.
 *
 * Validates that the header row matches either `EXCEL_HEADERS` (new) or
 * `EXCEL_HEADERS_OLD` (old), then reads each data row into a `ParsedExcelRow`.
 * Rows with an empty item ID are skipped.
 * Invalid quantities and priorities produce warnings instead of errors.
 *
 * @param buffer - ArrayBuffer containing the .xlsx file
 * @returns Parsed rows and any warnings encountered
 */
export async function parseExcelBuffer(
  buffer: ArrayBuffer,
): Promise<ParseExcelResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(
      "Datoteka nije u ispravnom formatu. Koristite datoteku generiranu putem Izvoz Excel funkcije",
    );
  }

  // ── Detect format and validate header row ───────────────
  const headerRow = worksheet.getRow(1);
  const { isNewFormat } = detectFormatAndValidate(headerRow);

  // Column indices differ between new (22-col) and old (21-col) formats.
  // In the new format, "Šifra štofa" is inserted at position F (col 6),
  // shifting all subsequent columns by +1.
  const COL_ITEM_ID = 1;
  const COL_ORDER_ID = 2;
  const COL_QUANTITY = isNewFormat ? 14 : 13;
  const COL_PRIORITY = isNewFormat ? 15 : 14;
  const COL_DELIVERY_DEADLINE = isNewFormat ? 16 : 15;
  const COL_NOTES = isNewFormat ? 17 : 16;
  const COL_SERIAL_NUMBER = isNewFormat ? 18 : 17;
  const COL_LOADING_NUMBER = isNewFormat ? 19 : 18;
  const COL_LOADING_SEQUENCE = isNewFormat ? 20 : 19;
  const COL_WORK_ORDER_NUMBER = isNewFormat ? 21 : 20;
  const COL_WORK_ORDER_DATE = isNewFormat ? 22 : 21;

  // ── Parse data rows ─────────────────────────────────────
  const rows: ParsedExcelRow[] = [];
  const warnings: ParseExcelResult["warnings"] = [];

  const rowCount = worksheet.rowCount;
  for (let rowIdx = 2; rowIdx <= rowCount; rowIdx++) {
    const row = worksheet.getRow(rowIdx);

    // Column A (1): itemId
    const itemId = cellToString(row.getCell(COL_ITEM_ID));
    if (!itemId) continue; // skip rows with empty item ID

    // Column B (2): orderId
    const orderId = cellToString(row.getCell(COL_ORDER_ID));

    // Quantity
    let quantity: number | null = null;
    const rawQuantity = row.getCell(COL_QUANTITY).value;
    if (rawQuantity != null && rawQuantity !== "") {
      const parsed = Number(rawQuantity);
      if (isNaN(parsed) || parsed < 1) {
        warnings.push({
          row: rowIdx,
          field: "quantity",
          message: `Nevalidna količina: "${rawQuantity}"`,
        });
      } else {
        quantity = parsed;
      }
    }

    // Priority (BS → enum)
    let priority: string | null = null;
    const rawPriority = cellToString(row.getCell(COL_PRIORITY));
    if (rawPriority) {
      const enumVal = translatePriorityToEnum(rawPriority);
      if (enumVal) {
        priority = enumVal;
      } else {
        warnings.push({
          row: rowIdx,
          field: "priority",
          message: `Nevalidan prioritet: "${rawPriority}"`,
        });
      }
    }

    // Delivery deadline (DD.MM.YYYY → Date)
    const rawDate = cellToString(row.getCell(COL_DELIVERY_DEADLINE));
    const deliveryDeadline = parseDateDDMMYYYY(rawDate);

    // Notes
    const notesRaw = cellToString(row.getCell(COL_NOTES));
    const notes = notesRaw || null;

    // Serial number
    const snRaw = cellToString(row.getCell(COL_SERIAL_NUMBER));
    const serialNumber = snRaw || null;

    // Loading number
    const lnRaw = cellToString(row.getCell(COL_LOADING_NUMBER));
    const loadingNumber = lnRaw || null;

    // Loading sequence
    const lsRaw = row.getCell(COL_LOADING_SEQUENCE).value;
    const loadingSequence = (lsRaw != null && lsRaw !== "") ? (typeof lsRaw === 'number' ? Math.floor(lsRaw) : parseInt(String(lsRaw), 10)) : null;
    const validLoadingSequence = (loadingSequence != null && !isNaN(loadingSequence)) ? loadingSequence : null;

    // Work order number
    const wonRaw = cellToString(row.getCell(COL_WORK_ORDER_NUMBER));
    const workOrderNumber = wonRaw || null;

    // Work order date (DD.MM.YYYY → Date)
    const rawWorkOrderDate = cellToString(row.getCell(COL_WORK_ORDER_DATE));
    const workOrderDate = parseDateDDMMYYYY(rawWorkOrderDate);

    rows.push({
      itemId,
      orderId,
      quantity,
      priority,
      deliveryDeadline,
      notes,
      serialNumber,
      loadingNumber,
      loadingSequence: validLoadingSequence,
      workOrderNumber,
      workOrderDate,
    });
  }

  return { rows, warnings };
}
