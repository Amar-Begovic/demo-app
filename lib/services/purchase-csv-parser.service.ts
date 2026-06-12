/**
 * CSV Parser for Material Purchase History Import
 * 
 * Parses CSV files containing purchase calculation data with 15 columns.
 * Handles quoted fields with commas and returns structured data.
 */

export interface ParsedPurchaseRow {
  documentType: string;        // VrstaFixDokument
  sequenceNumber: string;       // RedniBroj
  date: Date;                   // Datum (DD.MM.YY)
  supplierName: string;         // DobavljacNaziv
  supplierCode: string | null;  // DobavljacSifra
  materialName: string;         // ArtikalNaziv
  materialCode: string | null;  // ArtikalSifra
  unit: string;                 // JedinicaMjere
  quantity: number;             // Kolicina
  invoicePrice: number;         // FakturnaCijena
  invoiceValue: number;         // FakturnaVrijednost
  totalCost: number;            // TrosakUkupno
  purchasePrice: number;        // NabavnaCijena
  purchaseValue: number;        // NabavnaVrijednost
  costPercentage: number;       // trosak %
}

export interface ParseError {
  row: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedPurchaseRow[];
  errors: ParseError[];
}

// ---------------------------------------------------------------------------
// Internal format detection types and canonical column names
//
// These are intentionally not exported. They support automatic detection of
// Legacy_Format vs Partner_Format based on the header row of the input file.
// Canonical column names are lowercase and whitespace-trimmed (Requirement 1.6).
// ---------------------------------------------------------------------------

type PurchaseFormat = 'legacy' | 'partner';

interface FormatDescriptor {
  format: PurchaseFormat;
  columns: Map<string, number>; // canonical name -> column index / colNumber
  headerRowNumber: number;      // 0-based index for CSV, 1-based row number for XLSX
}

type DetectResult =
  | { ok: true; descriptor: FormatDescriptor }
  | { ok: false; error: ParseError };

/**
 * Canonical column names for Legacy_Format (15 columns).
 * The `'trosak %'` entry is the canonical spelling; the detector also tolerates
 * `'trosak%'` (no space) when matching against the actual header row.
 */
const LEGACY_COLUMNS = [
  'vrstafixdokument',
  'rednibroj',
  'datum',
  'dobavljacnaziv',
  'dobavljacsifra',
  'artikalnaziv',
  'artikalsifra',
  'jedinicamjere',
  'kolicina',
  'fakturnacijena',
  'fakturnavrijednost',
  'trosakukupno',
  'nabavnacijena',
  'nabavnavrijednost',
  'trosak %',
] as const;

/**
 * Canonical column names for Partner_Format (15 columns).
 * Partner_Format replaces `DobavljacNaziv`/`DobavljacSifra` with
 * `PartnerNaziv`/`PartnerSifra`, replaces `TrosakUkupno` with the pair
 * `DokumentVrijednost` + `DokumentTrosak`, and omits `trosak %`.
 */
const PARTNER_COLUMNS = [
  'vrstafixdokument',
  'rednibroj',
  'datum',
  'partnernaziv',
  'partnersifra',
  'artikalnaziv',
  'artikalsifra',
  'jedinicamjere',
  'kolicina',
  'fakturnacijena',
  'fakturnavrijednost',
  'dokumentvrijednost',
  'dokumenttrosak',
  'nabavnacijena',
  'nabavnavrijednost',
] as const;

// ---------------------------------------------------------------------------
// Internal Format_Detector
//
// Shared between CSV and XLSX parsers. Given rows of "candidate header" cells,
// finds the first row that looks like a purchase-import header and classifies
// it as Legacy_Format or Partner_Format, returning a FormatDescriptor with a
// canonical-name -> column-index map.
//
// Column indices follow the caller's convention: CSV passes 0-based positions,
// XLSX passes 1-based ExcelJS colNumbers. The detector is agnostic to which.
//
// Validates Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6.
// ---------------------------------------------------------------------------

/**
 * One cell within a candidate header row, paired with its column index/colNumber.
 * Callers shape their row data into this tuple regardless of 0- or 1-based indexing.
 */
interface HeaderCell {
  value: unknown;
  index: number;
}

/**
 * A candidate header row: a row number plus its cells.
 * `rowNumber` uses caller's convention (0-based line index for CSV, 1-based row
 * number for XLSX) and is carried into FormatDescriptor.headerRowNumber.
 */
interface HeaderCandidateRow {
  rowNumber: number;
  cells: Iterable<HeaderCell>;
}

/**
 * Normalize a raw cell value to canonical column name form.
 *
 * Rules (Requirement 1.6):
 *   - Coerce to string, trim surrounding whitespace, lowercase.
 *   - Handle ExcelJS formula objects (extract .result) and rich text.
 *   - Tolerate the spelling `trosak%` (no space) and normalize it to the
 *     canonical `trosak %` (with space) so downstream lookups need only one key.
 */
function normalizeColumnName(value: unknown): string {
  // Resolve formula objects and rich text before converting to string
  let resolved = value;
  if (typeof resolved === 'object' && resolved !== null) {
    if ('result' in (resolved as Record<string, unknown>)) {
      resolved = (resolved as Record<string, unknown>).result;
    } else if ('richText' in (resolved as Record<string, unknown>)) {
      const parts = (resolved as { richText: Array<{ text: string }> }).richText;
      resolved = parts.map(p => p.text).join('');
    }
  }
  const raw = String(resolved ?? '').trim().toLowerCase();
  if (raw === 'trosak%') return 'trosak %';
  return raw;
}

/**
 * Check whether a normalized-names map looks like a purchase-import header row.
 * A candidate must contain `artikalnaziv` and at least one of `dobavljacnaziv`
 * or `partnernaziv` (Requirement 1.1).
 */
function isHeaderCandidate(normalizedNames: Map<string, number>): boolean {
  if (!normalizedNames.has('artikalnaziv')) return false;
  return normalizedNames.has('dobavljacnaziv') || normalizedNames.has('partnernaziv');
}

/**
 * Classify an already-normalized header row into a FormatDescriptor.
 *
 * Rules:
 *   - `dobavljacnaziv` present (with or without `partnernaziv`) → `legacy`
 *     (Requirements 1.2, 1.4)
 *   - `partnernaziv` present and `dobavljacnaziv` absent → `partner`
 *     (Requirement 1.3)
 *   - neither present → format-level ParseError with row 0 and the standard
 *     Bosnian message (Requirement 1.5)
 *
 * The returned descriptor's `columns` map is a defensive copy so callers may
 * mutate their own working map without affecting the descriptor.
 */
function classifyFormat(
  normalizedNames: Map<string, number>,
  headerRowNumber: number,
): DetectResult {
  const hasDobavljac = normalizedNames.has('dobavljacnaziv');
  const hasPartner = normalizedNames.has('partnernaziv');

  if (!hasDobavljac && !hasPartner) {
    return {
      ok: false,
      error: {
        row: 0,
        message: 'Nepoznat format datoteke: nedostaje kolona DobavljacNaziv ili PartnerNaziv',
      },
    };
  }

  const format: PurchaseFormat = hasDobavljac ? 'legacy' : 'partner';

  return {
    ok: true,
    descriptor: {
      format,
      columns: new Map(normalizedNames),
      headerRowNumber,
    },
  };
}

/**
 * Scan candidate rows in order and return a FormatDescriptor for the first row
 * that qualifies as a header. If no row qualifies, return the standard
 * format-level ParseError (Requirement 1.5).
 *
 * Each row's cells are normalized via {@link normalizeColumnName}; empty values
 * are skipped, and duplicate normalized names within a row keep the first
 * occurrence (stable against repeated blank cells).
 *
 * Validates Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6.
 */
function detectFormatFromRows(rows: Iterable<HeaderCandidateRow>): DetectResult {
  for (const { rowNumber, cells } of rows) {
    const normalized = new Map<string, number>();
    for (const { value, index } of cells) {
      const name = normalizeColumnName(value);
      if (!name) continue;
      if (!normalized.has(name)) {
        normalized.set(name, index);
      }
    }
    if (isHeaderCandidate(normalized)) {
      return classifyFormat(normalized, rowNumber);
    }
  }

  return {
    ok: false,
    error: {
      row: 0,
      message: 'Nepoznat format datoteke: nedostaje kolona DobavljacNaziv ili PartnerNaziv',
    },
  };
}

/**
 * Parse date from DD.MM.YY format to Date object
 * Handles two-digit year conversion (00-99 → 2000-2099)
 * 
 * @param dateStr - Date string in DD.MM.YY format
 * @returns Date object or throws error if invalid
 */
function parseDateDDMMYY(dateStr: string): Date {
  const parts = dateStr.trim().split('.');
  
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: expected DD.MM.YY, got "${dateStr}"`);
  }
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    throw new Error(`Invalid date format: non-numeric values in "${dateStr}"`);
  }
  
  // Convert two-digit year to four-digit year (00-99 → 2000-2099)
  const fullYear = year < 100 ? 2000 + year : year;
  
  // Create date object (month is 0-indexed in JavaScript)
  const date = new Date(fullYear, month - 1, day);
  
  // Validate the date is valid (e.g., not 31st of February)
  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== fullYear
  ) {
    throw new Error(`Invalid date: "${dateStr}" does not represent a valid calendar date`);
  }
  
  return date;
}

/**
 * Parse decimal number with flexible separator handling
 * Automatically detects format:
 * - European format: "1.234,56" → 1234.56 (dot as thousand, comma as decimal)
 * - US/English format: "1,234.56" → 1234.56 (comma as thousand, dot as decimal)
 * - Simple format: "1234.56" or "1234,56"
 * - Empty values: "" → 0
 * 
 * @param numStr - Number string with separators
 * @param columnName - Optional column name included in error messages (Requirement 7.5)
 * @returns Parsed number or throws error if invalid
 */
function parseDecimalWithComma(numStr: string, columnName?: string): number {
  const trimmed = numStr.trim();
  
  // Handle empty values as 0
  if (trimmed === '') {
    return 0;
  }
  
  if (trimmed === '-') {
    const colInfo = columnName ? ` (column: ${columnName})` : '';
    throw new Error(`Invalid numeric value: empty or invalid value "${numStr}"${colInfo}`);
  }
  
  // Detect format by checking which separator appears last
  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  
  let normalized: string;
  
  if (lastComma === -1 && lastDot === -1) {
    // No separators, parse as-is
    normalized = trimmed;
  } else if (lastComma > lastDot) {
    // Comma appears after dot, so comma is decimal separator (European format)
    // e.g., "1.234,56" → "1234.56"
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else {
    // Dot appears after comma (or no comma), so dot is decimal separator (US format)
    // e.g., "1,234.56" → "1234.56"
    normalized = trimmed.replace(/,/g, '');
  }
  
  const parsed = parseFloat(normalized);
  
  if (isNaN(parsed)) {
    const colInfo = columnName ? ` (column: ${columnName})` : '';
    throw new Error(`Invalid numeric value: "${numStr}" could not be parsed as a number${colInfo}`);
  }
  
  return parsed;
}

/**
 * Parse a single CSV row, handling quoted fields with commas
 */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  // Push the last field
  fields.push(currentField.trim());
  
  return fields;
}

// ---------------------------------------------------------------------------
// Unified row mapper (shared between CSV and XLSX parsers)
//
// Validates required fields, parses dates and numbers, applies format-specific
// derivations (totalCost, costPercentage, documentType "null" normalization).
//
// Validates Requirements 2.1–2.9, 3.1–3.7, 5.1, 7.1–7.5.
// ---------------------------------------------------------------------------

/**
 * Map a single data row to ParsedPurchaseRow using the detected format.
 *
 * @param getCellString - Retrieve a trimmed string value by canonical column name
 * @param getCellRaw - Retrieve the raw cell value (for XLSX Date detection)
 * @param format - Detected format ('legacy' | 'partner')
 * @param rowNumber - Row number for error reporting
 * @returns Either a parsed row or a parse error (first error wins per row)
 */
function mapRowToParsedPurchase(
  getCellString: (canonicalName: string) => string,
  getCellRaw: (canonicalName: string) => unknown,
  format: PurchaseFormat,
  rowNumber: number,
): { row?: ParsedPurchaseRow; error?: ParseError } {
  // --- Validate required string fields (order per design: materialName, supplier, date, unit) ---

  const materialName = getCellString('artikalnaziv');
  if (!materialName) {
    return { error: { row: rowNumber, message: 'Material name (ArtikalNaziv) is required' } };
  }

  const supplierColName = format === 'legacy' ? 'dobavljacnaziv' : 'partnernaziv';
  const supplierDisplayName = format === 'legacy' ? 'DobavljacNaziv' : 'PartnerNaziv';
  const supplierName = getCellString(supplierColName);
  if (!supplierName) {
    return { error: { row: rowNumber, message: `Supplier name (${supplierDisplayName}) is required` } };
  }

  // --- Date ---
  let parsedDate: Date | null = null;

  // First check if the raw value is already a Date object (XLSX path — ExcelJS
  // returns Date instances for date-formatted cells)
  const rawDate = getCellRaw('datum');
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    parsedDate = rawDate;
  }

  // If not a Date object, try parsing the string representation
  if (!parsedDate) {
    const dateStr = getCellString('datum');
    if (dateStr) {
      try {
        parsedDate = parseDateDDMMYY(dateStr);
      } catch (e) {
        return { error: { row: rowNumber, message: `Invalid date format: ${e instanceof Error ? e.message : 'Unknown error'}` } };
      }
    }
  }

  if (!parsedDate) {
    return { error: { row: rowNumber, message: 'Date (Datum) is required' } };
  }

  // --- Unit ---
  const unit = getCellString('jedinicamjere');
  if (!unit) {
    return { error: { row: rowNumber, message: 'Unit (JedinicaMjere) is required' } };
  }

  // --- Numeric fields ---
  try {
    const parsedQuantity = parseDecimalWithComma(getCellString('kolicina'), 'Kolicina');
    const parsedInvoicePrice = parseDecimalWithComma(getCellString('fakturnacijena'), 'FakturnaCijena');
    const parsedInvoiceValue = parseDecimalWithComma(getCellString('fakturnavrijednost'), 'FakturnaVrijednost');
    const parsedNabavnaCijena = parseDecimalWithComma(getCellString('nabavnacijena'), 'NabavnaCijena');
    const parsedNabavnaVrijednost = parseDecimalWithComma(getCellString('nabavnavrijednost'), 'NabavnaVrijednost');

    let parsedTotalCost: number;
    let parsedCostPercentage: number;

    if (format === 'legacy') {
      // TrosakUkupno and trosak % are not used by the import service — skip strict parsing.
      // They often contain formula objects in XLSX that can't be parsed as numbers.
      const trosakUkupnoStr = getCellString('trosakukupno');
      try { parsedTotalCost = parseDecimalWithComma(trosakUkupnoStr, 'TrosakUkupno'); } catch { parsedTotalCost = 0; }
      parsedCostPercentage = 0; // never used downstream
    } else {
      // Partner_Format: parse DokumentVrijednost and DokumentTrosak for validation only (Req 7.5)
      parseDecimalWithComma(getCellString('dokumentvrijednost'), 'DokumentVrijednost');
      parseDecimalWithComma(getCellString('dokumenttrosak'), 'DokumentTrosak');
      // Derivations (Req 3.1, 3.2)
      parsedTotalCost = parsedNabavnaVrijednost - parsedInvoiceValue;
      parsedCostPercentage = 0;
    }

    // --- documentType normalization ---
    let documentType = getCellString('vrstafixdokument');
    if (format === 'partner' && documentType.toLowerCase() === 'null') {
      documentType = '';
    }

    // --- supplierCode / materialCode ---
    const supplierCodeCol = format === 'legacy' ? 'dobavljacsifra' : 'partnersifra';
    const supplierCodeStr = getCellString(supplierCodeCol);
    const materialCodeStr = getCellString('artikalsifra');

    return {
      row: {
        documentType,
        sequenceNumber: getCellString('rednibroj'),
        date: parsedDate,
        supplierName,
        supplierCode: supplierCodeStr || null,
        materialName,
        materialCode: materialCodeStr || null,
        unit,
        quantity: parsedQuantity,
        invoicePrice: parsedInvoicePrice,
        invoiceValue: parsedInvoiceValue,
        totalCost: parsedTotalCost,
        purchasePrice: parsedNabavnaCijena,
        purchaseValue: parsedNabavnaVrijednost,
        costPercentage: parsedCostPercentage,
      },
    };
  } catch (error) {
    return {
      error: {
        row: rowNumber,
        message: `Invalid numeric value: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    };
  }
}

/**
 * Parse CSV content into structured purchase rows.
 * Supports both Legacy_Format and Partner_Format via automatic header detection.
 * 
 * @param content - Raw CSV file content as string
 * @returns ParseResult with parsed rows and any errors encountered
 */
export function parsePurchaseCSV(content: string): ParseResult {
  const rows: ParsedPurchaseRow[] = [];
  const errors: ParseError[] = [];
  
  // Split into lines (keep all lines; we skip empty ones during header search)
  const lines = content.split(/\r?\n/);
  
  // Filter to non-empty lines for processing
  const nonEmptyLines: { lineIndex: number; line: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      nonEmptyLines.push({ lineIndex: i, line: lines[i] });
    }
  }

  if (nonEmptyLines.length === 0) {
    errors.push({ row: 0, message: 'CSV file is empty' });
    return { rows, errors };
  }

  // --- Detect format from header row ---
  // Build candidate rows for the detector (each non-empty line is a candidate)
  const candidateRows: HeaderCandidateRow[] = nonEmptyLines.map(({ lineIndex, line }) => {
    const fields = parseCSVRow(line);
    return {
      rowNumber: lineIndex, // 0-based line index
      cells: fields.map((field, idx) => ({ value: field, index: idx })),
    };
  });

  const detection = detectFormatFromRows(candidateRows);

  if (!detection.ok) {
    return { rows: [], errors: [detection.error] };
  }

  const { format, columns, headerRowNumber } = detection.descriptor;

  // --- Process data rows (all non-empty lines after the header line) ---
  const dataEntries = nonEmptyLines.filter(({ lineIndex }) => lineIndex > headerRowNumber);

  for (const { lineIndex, line } of dataEntries) {
    const rowNumber = lineIndex + 1; // 1-based for user-facing error messages

    try {
      const fields = parseCSVRow(line);

      // Validate column count (Requirement 4.1, 4.2, 4.3)
      if (fields.length !== 15) {
        errors.push({
          row: rowNumber,
          message: `Expected 15 columns but found ${fields.length}`,
        });
        continue;
      }

      // Build cell accessors using the column map
      const getCellString = (canonicalName: string): string => {
        const idx = columns.get(canonicalName);
        if (idx === undefined) return '';
        return (fields[idx] ?? '').trim();
      };
      const getCellRaw = (canonicalName: string): unknown => {
        const idx = columns.get(canonicalName);
        if (idx === undefined) return undefined;
        return fields[idx];
      };

      const result = mapRowToParsedPurchase(getCellString, getCellRaw, format, rowNumber);

      if (result.error) {
        errors.push(result.error);
      } else if (result.row) {
        rows.push(result.row);
      }
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Unknown parsing error',
      });
    }
  }
  
  return { rows, errors };
}


/**
 * Parse XLSX file buffer into structured purchase rows.
 * Supports both Legacy_Format and Partner_Format via automatic header detection.
 * Uses ExcelJS to read the workbook and extract data from the first worksheet.
 * 
 * @param buffer - XLSX file content as Buffer
 * @returns ParseResult with parsed rows and any errors encountered
 */
export async function parsePurchaseXLSX(buffer: Buffer): Promise<ParseResult> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const rows: ParsedPurchaseRow[] = [];
  const errors: ParseError[] = [];

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    errors.push({ row: 0, message: 'Excel datoteka ne sadrži nijedan radni list' });
    return { rows, errors };
  }

  // --- Detect format using Format_Detector ---
  // Build candidate rows from the worksheet for the detector
  const candidateRows: HeaderCandidateRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    const cells: HeaderCell[] = [];
    row.eachCell((cell, colNumber) => {
      cells.push({ value: cell.value, index: colNumber });
    });
    candidateRows.push({ rowNumber, cells });
  });

  const detection = detectFormatFromRows(candidateRows);

  if (!detection.ok) {
    return { rows: [], errors: [detection.error] };
  }

  const { format, columns, headerRowNumber } = detection.descriptor;

  // Extra columns beyond the expected 15 are silently ignored — the format
  // detector already mapped recognized columns by name, so extra columns
  // (like "dokument vrijednost", "dokument trošak") won't cause issues.

  // --- Process data rows ---
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    try {
      // Helper to resolve ExcelJS cell value (handles formula objects, rich text, etc.)
      const resolveValue = (val: unknown): unknown => {
        if (val === null || val === undefined) return null;
        // Formula cells: { formula: '...', result: <value> }
        if (typeof val === 'object' && val !== null && 'result' in (val as Record<string, unknown>)) {
          return (val as Record<string, unknown>).result;
        }
        // Rich text cells: { richText: [...] }
        if (typeof val === 'object' && val !== null && 'richText' in (val as Record<string, unknown>)) {
          const parts = (val as { richText: Array<{ text: string }> }).richText;
          return parts.map(p => p.text).join('');
        }
        return val;
      };

      // Build cell accessors using the column map
      const getCellString = (canonicalName: string): string => {
        const colNum = columns.get(canonicalName);
        if (!colNum) return '';
        const raw = row.getCell(colNum).value;
        const val = resolveValue(raw);
        if (val === null || val === undefined) return '';
        return String(val).trim();
      };

      const getCellRaw = (canonicalName: string): unknown => {
        const colNum = columns.get(canonicalName);
        if (!colNum) return undefined;
        const raw = row.getCell(colNum).value;
        return resolveValue(raw);
      };

      // Skip completely empty rows
      const materialName = getCellString('artikalnaziv');
      const supplierCol = format === 'legacy' ? 'dobavljacnaziv' : 'partnernaziv';
      const supplierName = getCellString(supplierCol);
      if (!materialName && !supplierName) return;

      const result = mapRowToParsedPurchase(getCellString, getCellRaw, format, rowNumber);

      if (result.error) {
        errors.push(result.error);
      } else if (result.row) {
        rows.push(result.row);
      }
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Unknown parsing error',
      });
    }
  });

  return { rows, errors };
}
