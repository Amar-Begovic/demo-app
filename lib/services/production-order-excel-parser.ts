/** Zaglavlje parsirano iz reda 1 Excel datoteke */
export interface ParsedHeader {
  orderNumber: string | null; // Red 1, kolona B
  customerName: string | null; // Red 1, kolona C
  deliveryLocation: string | null; // Red 1, kolona G
}

/** Jedna parsirana stavka iz reda podataka (red 3+) */
export interface ParsedItem {
  rowNumber: number;
  articleCode: string | null; // Ekstraktovano iz NAZIV kolone (C)
  articleName: string | null; // Puni tekst iz NAZIV kolone (bez šifre)
  fabricCode: string | null; // Kolona G: šifra štofa
  fabricName: string | null; // Kolona F: puni tekst štofa
  ruckaName: string | null; // Ručka kolona (po header imenu)
  paspulName: string | null; // Paspul kolona (po header imenu)
  nogice1Name: string | null; // Nogice 1 kolona (po header imenu)
  nogice2Name: string | null; // Nogice 2 kolona (po header imenu)
  stepText: string | null; // Štep kolona (slobodan tekst, po header imenu)
  quantity: number;
  serialNumber: string | null; // Kolona B: SERISKI BROJ
  deliveryDeadline: Date | null; // Kolona J: DATUM UTOVARA
  notes: string | null; // Kolona I: NAPOMENA
  content: string | null; // Kolona E: SADRZAJ
  loadingSequence: number | null; // Kolona A: RB (redni broj iz naloga)
}

/** Greška parsiranja za jednu stavku */
export interface ParseError {
  rowNumber: number;
  field: string;
  message: string;
}

/** Rezultat parsiranja cijele Excel datoteke */
export interface ParsedProductionOrder {
  header: ParsedHeader;
  items: ParsedItem[];
  errors: ParseError[];
}

/** Upozorenje pri mapiranju šifri na ID-jeve */
export interface ImportWarning {
  rowNumber: number;
  type: "unknown_article" | "unknown_fabric" | "unknown_rucka" | "unknown_paspul" | "unknown_nogice1" | "unknown_nogice2" | "parse_error";
  code: string | null;
  name: string | null;
  message: string;
}

/**
 * Ekstraktuje šifru artikla iz NAZIV kolone.
 *
 * Format: `IME ARTIKLA / | kom | ŠIFRA`
 * Primjeri:
 *   "BAREL 160X200 baza + uzglavlje / | kom | 641" → "641"
 *   "NORMA 160X200 krevet + madrac-NOVO | kom | 1310" → "1310"
 */
export function extractArticleCode(nazivValue: string): string | null {
  const separatorPattern = /\|\s*kom\s*\|/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = separatorPattern.exec(nazivValue)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return null;

  const afterSeparator = nazivValue.slice(lastMatch.index + lastMatch[0].length);
  const code = afterSeparator.replace(/\s*\/\s*$/, "").trim();
  return code.length > 0 ? code : null;
}

/**
 * Ekstraktuje šifru štofa iz STOF kolone.
 *
 * Format: `Ime štofa | m | ŠIFRA`
 * Primjeri:
 *   "Štof Matt Velvet 08 | m | 217" → "217"
 *   "|  |" → null
 */
export function extractFabricCode(stofValue: string): string | null {
  if (/^\|\s*\|$/.test(stofValue.trim())) return null;

  const separator = "| m |";
  const lastIndex = stofValue.lastIndexOf(separator);
  if (lastIndex === -1) return null;

  const code = stofValue.slice(lastIndex + separator.length).trim();
  return code.length > 0 ? code : null;
}

/**
 * Parsira datum iz Excel ćelije.
 */
export function parseExcelDate(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);

      if (month < 1 || month > 12 || day < 1 || day > 31) return null;

      const date = new Date(year, month - 1, day);
      if (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      ) {
        return date;
      }
      return null;
    }

    const numValue = Number(trimmed);
    if (!isNaN(numValue) && numValue > 0) {
      return excelSerialToDate(numValue);
    }
  }

  return null;
}

function excelSerialToDate(serial: number): Date | null {
  if (serial < 1) return null;

  const days = Math.floor(serial);
  const msPerDay = 24 * 60 * 60 * 1000;

  let adjustedDays = days;
  if (days >= 60) {
    adjustedDays = days - 1;
  }

  const baseMs = Date.UTC(1900, 0, 1);
  const date = new Date(baseMs + (adjustedDays - 1) * msPerDay);
  return isNaN(date.getTime())
    ? null
    : new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getCellString(cell: import("exceljs").Cell): string | null {
  const v = cell.value;
  if (v == null) return null;

  if (typeof v === "object" && "richText" in v && Array.isArray(v.richText)) {
    const text = v.richText.map((r: { text: string }) => r.text).join("");
    return text.length > 0 ? text : null;
  }

  if (typeof v === "object" && "text" in v && typeof v.text === "string") {
    return v.text.length > 0 ? v.text : null;
  }

  if (typeof v === "object" && "formula" in v) {
    const result = (v as { formula: string; result?: unknown }).result;
    if (result == null) return null;
    return String(result);
  }

  if (v instanceof Date) {
    return v.toString();
  }

  const str = String(v).trim();
  return str.length > 0 ? str : null;
}

function extractArticleName(nazivValue: string): string | null {
  const separatorPattern = /\|\s*kom\s*\|/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = separatorPattern.exec(nazivValue)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return nazivValue.trim() || null;

  const name = nazivValue.slice(0, lastMatch.index).replace(/\s*\/\s*$/, "").trim();
  return name.length > 0 ? name : null;
}

function extractFabricName(stofValue: string): string | null {
  if (/^\|\s*\|$/.test(stofValue.trim())) return null;

  const separator = "| m |";
  const lastIndex = stofValue.lastIndexOf(separator);
  if (lastIndex === -1) return stofValue.trim() || null;

  const name = stofValue.slice(0, lastIndex).trim();
  return name.length > 0 ? name : null;
}

/** Indeksi kolona za kategorije (null ako kolona ne postoji u fajlu) */
interface CategoryColumnMap {
  rucka: number | null;
  paspul: number | null;
  nogice1: number | null;
  nogice2: number | null;
  step: number | null;
}

/**
 * Skenira redove 1-4 za zaglavlja kategorija po imenu.
 * Traži "Ručka", "Paspul", "Nogice 1", "Nogice 2", "Štep" (case-insensitive).
 */
function findCategoryColumns(worksheet: import("exceljs").Worksheet): CategoryColumnMap {
  const result: CategoryColumnMap = { rucka: null, paspul: null, nogice1: null, nogice2: null, step: null };

  // Scan first few rows for header names (typically row 2 or row 4)
  const rowsToScan = [2, 1, 3, 4];
  for (const rowIdx of rowsToScan) {
    const row = worksheet.getRow(rowIdx);
    if (!row) continue;

    const colCount = worksheet.columnCount;
    for (let col = 1; col <= colCount; col++) {
      const cellValue = getCellString(row.getCell(col));
      if (!cellValue) continue;

      const normalized = cellValue.trim().toLowerCase();
      if (normalized === "ručka" || normalized === "rucka") {
        result.rucka = col;
      } else if (normalized === "paspul") {
        result.paspul = col;
      } else if (normalized === "nogice 1") {
        result.nogice1 = col;
      } else if (normalized === "nogice 2") {
        result.nogice2 = col;
      } else if (normalized === "štep" || normalized === "step") {
        result.step = col;
      }
    }

    // If we found at least one category column in this row, stop scanning
    if (result.rucka !== null || result.paspul !== null || result.nogice1 !== null || result.nogice2 !== null || result.step !== null) {
      break;
    }
  }

  return result;
}

/**
 * Parsira Excel datoteku u format proizvodnog naloga.
 *
 * Zaglavlje: red 1 (B=broj naloga, C=kupac, G=lokacija)
 * Red 2: nazivi kolona (skeniramo za kategorije)
 * Stavke: red 3+
 * Kolone: A=RB, B=serijski, C=naziv, D=količina, E=sadržaj,
 *         F=štof(ime), G=šifra štofa, H=nogice(ignorišemo), I=napomena,
 *         J=datum utovara, K=barkod(ignorišemo)
 * Kategorije (Ručka, Paspul, Nogice 1, Nogice 2) se traže po imenu zaglavlja.
 */
export async function parseProductionOrderExcel(
  buffer: ArrayBuffer
): Promise<ParsedProductionOrder> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error("Neispravan Excel fajl — nije moguće učitati datoteku");
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Datoteka ne sadrži podatke");
  }

  // --- Parse header from row 1 ---
  const headerRow = worksheet.getRow(1);
  const orderNumber = getCellString(headerRow.getCell(2)); // Column B
  const customerName = getCellString(headerRow.getCell(3)); // Column C
  const deliveryLocation = getCellString(headerRow.getCell(7)); // Column G

  const header: ParsedHeader = {
    orderNumber,
    customerName,
    deliveryLocation,
  };

  // --- Scan header row (row 2) for category item columns by name ---
  const categoryColumnMap = findCategoryColumns(worksheet);

  // --- Parse data rows from row 3 onwards ---
  const items: ParsedItem[] = [];
  const errors: ParseError[] = [];

  const rowCount = worksheet.rowCount;

  for (let rowIdx = 3; rowIdx <= rowCount; rowIdx++) {
    const row = worksheet.getRow(rowIdx);

    const rbValue = getCellString(row.getCell(1)); // Column A: RB
    const nazivValue = getCellString(row.getCell(3)); // Column C: NAZIV

    if (!rbValue && !nazivValue) continue;
    if (!rbValue) continue;

    const rowNumber = rowIdx;

    // Column B: SERISKI BROJ
    const serialNumber = getCellString(row.getCell(2));

    // Column C: NAZIV → articleCode + articleName
    let articleCode: string | null = null;
    let articleName: string | null = null;
    if (nazivValue) {
      articleCode = extractArticleCode(nazivValue);
      articleName = extractArticleName(nazivValue);
      if (!articleCode) {
        errors.push({
          rowNumber,
          field: "NAZIV",
          message: `Nije pronađen separator "| kom |" u NAZIV koloni: "${nazivValue}"`,
        });
      }
    }

    // Column D: KOLICINA
    const kolicinaCell = row.getCell(4);
    let quantity = 1;
    const kolicinaValue = kolicinaCell.value;
    if (kolicinaValue != null) {
      if (typeof kolicinaValue === "number") {
        quantity = Math.floor(kolicinaValue);
        if (isNaN(quantity) || quantity < 1) quantity = 1;
      } else {
        const parsed = parseInt(String(kolicinaValue), 10);
        quantity = isNaN(parsed) ? 1 : parsed;
      }
    }

    // Column E: SADRZAJ
    const content = getCellString(row.getCell(5));

    // Column F: STOF → fabricName (full text)
    const stofValue = getCellString(row.getCell(6));
    const fabricName = stofValue ? extractFabricName(stofValue) : null;

    // Column G: ŠIFRA ŠTOFA
    const fabricCode = getCellString(row.getCell(7));

    // Category item columns (by header name)
    const ruckaName = categoryColumnMap.rucka !== null
      ? getCellString(row.getCell(categoryColumnMap.rucka))
      : null;
    const paspulName = categoryColumnMap.paspul !== null
      ? getCellString(row.getCell(categoryColumnMap.paspul))
      : null;
    const nogice1Name = categoryColumnMap.nogice1 !== null
      ? getCellString(row.getCell(categoryColumnMap.nogice1))
      : null;
    const nogice2Name = categoryColumnMap.nogice2 !== null
      ? getCellString(row.getCell(categoryColumnMap.nogice2))
      : null;

    // Štep column (free text, by header name)
    const stepRaw = categoryColumnMap.step !== null
      ? getCellString(row.getCell(categoryColumnMap.step))
      : null;
    const stepText = stepRaw && stepRaw.trim().length > 0 ? stepRaw.trim() : null;

    // Column I: NAPOMENA
    const notes = getCellString(row.getCell(9));

    // Column J: DATUM UTOVARA
    const datumCell = row.getCell(10);
    const deliveryDeadline = parseExcelDate(datumCell.value);

    items.push({
      rowNumber,
      articleCode,
      articleName,
      fabricCode,
      fabricName,
      ruckaName: ruckaName ? ruckaName.trim() : null,
      paspulName: paspulName ? paspulName.trim() : null,
      nogice1Name: nogice1Name ? nogice1Name.trim() : null,
      nogice2Name: nogice2Name ? nogice2Name.trim() : null,
      stepText,
      quantity,
      serialNumber,
      deliveryDeadline,
      notes,
      content,
      loadingSequence: null, // RB from Excel is ignored on import; set manually later
    });
  }

  return { header, items, errors };
}

/** Mapirana stavka spremna za OrderItem format dijaloga */
export interface MappedOrderItem {
  articleId: string;
  quantity: number;
  fabricId: string;
  ruckaId: string;
  paspulId: string;
  nogice1Id: string;
  nogice2Id: string;
  withLegs: boolean;
  deliveryDeadline: string;
  priority: string;
  notes: string;
  customerOrderNumber: string;
  loadingNumber: string;
  loadingSequence: number | null;
  serialNumber: string;
  step: string;
}

/**
 * Mapira parsirane Excel stavke na OrderItem format korišten u dijalogu.
 */
export function mapParsedItemsToOrderItems(
  items: ParsedItem[],
  articles: Array<{ id: string; name: string; code?: string | null }>,
  fabrics: Array<{ id: string; name: string; code?: string | null }>,
  categoryItems?: {
    rucke?: Array<{ id: string; name: string }>;
    paspuli?: Array<{ id: string; name: string }>;
    nogice?: Array<{ id: string; name: string }>;
  }
): { mappedItems: MappedOrderItem[]; warnings: ImportWarning[] } {
  const mappedItems: MappedOrderItem[] = [];
  const warnings: ImportWarning[] = [];

  const rucke = categoryItems?.rucke ?? [];
  const paspuli = categoryItems?.paspuli ?? [];
  const nogice = categoryItems?.nogice ?? [];

  for (const item of items) {
    let articleId = "";
    if (item.articleCode != null) {
      const normalizedCode = item.articleCode.trim().toLowerCase();
      const found = articles.find(
        (a) => a.code != null && a.code.trim().toLowerCase() === normalizedCode
      );
      if (found) {
        articleId = found.id;
      } else {
        warnings.push({
          rowNumber: item.rowNumber,
          type: "unknown_article",
          code: item.articleCode,
          name: item.articleName,
          message: `Nepoznat artikal: šifra "${item.articleCode}"${item.articleName ? ` (${item.articleName})` : ""}`,
        });
      }
    }

    let fabricId = "";
    if (item.fabricCode != null) {
      const normalizedCode = item.fabricCode.trim().toLowerCase();
      const found = fabrics.find(
        (f) => f.code != null && f.code.trim().toLowerCase() === normalizedCode
      );
      if (found) {
        fabricId = found.id;
      } else {
        warnings.push({
          rowNumber: item.rowNumber,
          type: "unknown_fabric",
          code: item.fabricCode,
          name: item.fabricName,
          message: `Nepoznat štof: šifra "${item.fabricCode}"${item.fabricName ? ` (${item.fabricName})` : ""}`,
        });
      }
    }

    // Category item matching by name (case-insensitive, trimmed)
    let ruckaId = "";
    if (item.ruckaName != null && item.ruckaName.trim().length > 0) {
      const normalizedName = item.ruckaName.trim().toLowerCase();
      const found = rucke.find((r) => r.name.trim().toLowerCase() === normalizedName);
      if (found) {
        ruckaId = found.id;
      } else {
        warnings.push({
          rowNumber: item.rowNumber,
          type: "unknown_rucka",
          code: null,
          name: item.ruckaName.trim(),
          message: `Nepoznata ručka: "${item.ruckaName.trim()}" (red ${item.rowNumber}, kolona "Ručka")`,
        });
      }
    }

    let paspulId = "";
    if (item.paspulName != null && item.paspulName.trim().length > 0) {
      const normalizedName = item.paspulName.trim().toLowerCase();
      const found = paspuli.find((p) => p.name.trim().toLowerCase() === normalizedName);
      if (found) {
        paspulId = found.id;
      } else {
        warnings.push({
          rowNumber: item.rowNumber,
          type: "unknown_paspul",
          code: null,
          name: item.paspulName.trim(),
          message: `Nepoznat paspul: "${item.paspulName.trim()}" (red ${item.rowNumber}, kolona "Paspul")`,
        });
      }
    }

    let nogice1Id = "";
    if (item.nogice1Name != null && item.nogice1Name.trim().length > 0) {
      const normalizedName = item.nogice1Name.trim().toLowerCase();
      const found = nogice.find((n) => n.name.trim().toLowerCase() === normalizedName);
      if (found) {
        nogice1Id = found.id;
      } else {
        warnings.push({
          rowNumber: item.rowNumber,
          type: "unknown_nogice1",
          code: null,
          name: item.nogice1Name.trim(),
          message: `Nepoznate nogice 1: "${item.nogice1Name.trim()}" (red ${item.rowNumber}, kolona "Nogice 1")`,
        });
      }
    }

    let nogice2Id = "";
    if (item.nogice2Name != null && item.nogice2Name.trim().length > 0) {
      const normalizedName = item.nogice2Name.trim().toLowerCase();
      const found = nogice.find((n) => n.name.trim().toLowerCase() === normalizedName);
      if (found) {
        nogice2Id = found.id;
      } else {
        warnings.push({
          rowNumber: item.rowNumber,
          type: "unknown_nogice2",
          code: null,
          name: item.nogice2Name.trim(),
          message: `Nepoznate nogice 2: "${item.nogice2Name.trim()}" (red ${item.rowNumber}, kolona "Nogice 2")`,
        });
      }
    }

    let deliveryDeadline = "";
    if (item.deliveryDeadline != null) {
      const d = item.deliveryDeadline;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      deliveryDeadline = `${year}-${month}-${day}`;
    }

    mappedItems.push({
      articleId,
      quantity: item.quantity,
      fabricId,
      ruckaId,
      paspulId,
      nogice1Id,
      nogice2Id,
      withLegs: false,
      deliveryDeadline,
      priority: "normal",
      notes: item.notes ?? "",
      customerOrderNumber: "",
      loadingNumber: "",
      loadingSequence: item.loadingSequence,
      serialNumber: item.serialNumber ?? "",
      step: item.stepText ?? "",
    });
  }

  return { mappedItems, warnings };
}
