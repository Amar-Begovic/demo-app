import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

export interface MaterialImportResult {
  materialsCreated: number;
  materialsSkipped: number;
  suppliersCreated: number;
  suppliersSkipped: number;
  linksCreated: number;
  stockRecordsCreated: number;
  fabricsCreated: number;
  errors: MaterialImportError[];
}

export interface MaterialImportError {
  row: number;
  materialCode: string | null;
  message: string;
}

export interface MaterialImportOptions {
  importStock: boolean;
}

export interface ParsedMaterialRow {
  rowNumber: number;
  artikalNaziv: string;
  artikalSifra: string;
  jedinicaMjere: string | null;
  fakturnaCijena: number | null;
  kolicina: number | null;
  dobavljacNaziv: string | null;
  dobavljacSifra: string | null;
  datum: Date | null;
  fakturnaVrijednost: number | null;
  nabavnaCijena: number | null;
  nabavnaVrijednost: number | null;
  redniBroj: string | null;
}

export const REQUIRED_COLUMNS = ["ArtikalSifra", "ArtikalNaziv"];

/**
 * Normalize a column header for flexible matching:
 * - lowercase
 * - remove all whitespace
 * - replace diacritics (č→c, š→s, ž→z, ć→c, đ→d)
 */
function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d");
}

/**
 * Column alias map: maps alternative normalized header names to canonical names.
 * This allows importing files that use "partner" instead of "dobavljac", etc.
 */
const COLUMN_ALIASES: Record<string, string> = {
  // "partner naziv" → normalizes to "partnernaziv"
  partnernaziv: "dobavljacnaziv",
  // "partner šifra" → normalizes to "partnersifra"
  partnersifra: "dobavljacsifra",
  // "artikal naziv" → normalizes to "artikalnaziv" (already canonical)
  // "artikal šifra" → normalizes to "artikalsifra" (already canonical)
  // "jedinica mjere" → normalizes to "jedinicamjere" (already canonical)
  // "fakturna cijena" → normalizes to "fakturnacijena" (already canonical)
  // "kolicina" with diacritic "količina" → normalizes to "kolicina" (already canonical)
  // "fakturna vrijednost" → normalizes to "fakturnavrijednost" (already canonical)
  // "nabavna cijena" → normalizes to "nabavnacijena" (already canonical)
  // "nabavna vrijednost" → normalizes to "nabavnavrijednost" (already canonical)
  // "redni broj" → normalizes to "rednibroj" (already canonical)
};

/**
 * Resolve a normalized header to its canonical column name.
 */
function resolveColumnName(normalized: string): string {
  return COLUMN_ALIASES[normalized] ?? normalized;
}

/**
 * Parse a date value from an Excel cell.
 * Supports:
 * - JavaScript Date objects (ExcelJS returns these for date-formatted cells)
 * - Excel serial numbers (days since 1899-12-30, used when cell has date format)
 * - DD.MM.YY or DD.MM.YYYY (e.g. "01.01.26", "01.01.2026")
 * - D.M.YY or D.M.YYYY (e.g. "1.1.26", "1.1.2026")
 * - DD.MM.YYYY HH:mm (e.g. "01.01.2026 12:30")
 * - M/D/YY or M/D/YYYY with optional time (e.g. "1/1/26 0:00", "1/9/26")
 * - YYYY-MM-DD (ISO format, e.g. "2026-01-01")
 * - DD-MM-YY or DD-MM-YYYY (e.g. "01-01-26", "01-01-2026")
 */
function parseDatum(value: unknown): Date | null {
  // Handle Date objects directly (ExcelJS returns these for date-typed cells)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value;
  }

  if (value === null || value === undefined) return null;

  // Handle Excel serial numbers (numeric date values)
  // Excel dates are stored as number of days since 1899-12-30
  if (typeof value === "number") {
    if (value > 1 && value < 200000) {
      // Excel epoch: Jan 0, 1900 = serial 1 (with the Lotus 1-2-3 bug for Feb 29, 1900)
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Try DD.MM.YY or DD.MM.YYYY format (with optional time)
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+\d{1,2}[:.]\d{2})?$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10) - 1;
    let year = parseInt(dotMatch[3], 10);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  // Try M/D/YY or M/D/YYYY format (with optional time part like " 0:00")
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10) - 1;
    const day = parseInt(slashMatch[2], 10);
    let year = parseInt(slashMatch[3], 10);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  // Try YYYY-MM-DD (ISO format)
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(year, month, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  // Try DD-MM-YY or DD-MM-YYYY format
  const dashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1], 10);
    const month = parseInt(dashMatch[2], 10) - 1;
    let year = parseInt(dashMatch[3], 10);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  }

  return null;
}

/**
 * Parse a cell value as a number, handling string representations and negatives.
 * Returns null if the value cannot be parsed.
 */
function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const str = String(value).trim().replace(",", ".");
  if (str === "") return null;
  const num = Number(str);
  return isNaN(num) ? null : num;
}

export const MaterialExcelImportService = {
  async parseExcel(buffer: Buffer): Promise<ParsedMaterialRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error("Excel datoteka ne sadrži nijedan radni list");
    }

    // Find header row dynamically using normalized matching
    // Supports: spaces in names, diacritics, "partner" as alias for "dobavljac"
    let headerRowNumber = 0;
    const columnMap = new Map<string, number>();

    worksheet.eachRow((row, rowNumber) => {
      if (headerRowNumber > 0) return;
      const cells = new Map<string, number>();
      row.eachCell((cell, colNumber) => {
        const value = String(cell.value ?? "").trim();
        if (value) {
          const normalized = resolveColumnName(normalizeHeader(value));
          cells.set(normalized, colNumber);
        }
      });
      if (cells.has("artikalsifra") && cells.has("artikalnaziv")) {
        headerRowNumber = rowNumber;
        cells.forEach((col, key) => columnMap.set(key, col));
      }
    });

    if (headerRowNumber === 0) {
      // Determine which required columns are missing
      const missing = REQUIRED_COLUMNS.filter((col) => {
        let found = false;
        worksheet.eachRow((row) => {
          if (found) return;
          row.eachCell((cell) => {
            if (found) return;
            const value = String(cell.value ?? "").trim();
            const normalized = resolveColumnName(normalizeHeader(value));
            if (normalized === normalizeHeader(col)) {
              found = true;
            }
          });
        });
        return !found;
      });
      throw new Error(
        `Nedostaju obavezne kolone: ${missing.length > 0 ? missing.join(", ") : REQUIRED_COLUMNS.join(", ")}`
      );
    }

    // Map recognized columns (all keys are now normalized canonical names)
    const artikalNazivCol = columnMap.get("artikalnaziv")!;
    const artikalSifraCol = columnMap.get("artikalsifra")!;
    const jedinicaMjereCol = columnMap.get("jedinicamjere");
    const fakturnaCijenaCol = columnMap.get("fakturnacijena");
    const kolicinaCol = columnMap.get("kolicina");
    const dobavljacNazivCol = columnMap.get("dobavljacnaziv");
    const dobavljacSifraCol = columnMap.get("dobavljacsifra");
    const datumCol = columnMap.get("datum");
    const fakturnaVrijednostCol = columnMap.get("fakturnavrijednost");
    const nabavnaCijenaCol = columnMap.get("nabavnacijena");
    const nabavnaVrijednostCol = columnMap.get("nabavnavrijednost");
    const redniBrojCol = columnMap.get("rednibroj");

    const rows: ParsedMaterialRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const artikalSifra = String(row.getCell(artikalSifraCol).value ?? "").trim();
      const artikalNaziv = String(row.getCell(artikalNazivCol).value ?? "").trim();

      // Skip rows without required fields
      if (!artikalSifra || !artikalNaziv) return;

      // Parse optional fields
      const jedinicaMjere = jedinicaMjereCol
        ? String(row.getCell(jedinicaMjereCol).value ?? "").trim() || null
        : null;

      const fakturnaCijena = fakturnaCijenaCol
        ? parseNumeric(row.getCell(fakturnaCijenaCol).value)
        : null;

      const kolicina = kolicinaCol
        ? parseNumeric(row.getCell(kolicinaCol).value)
        : null;

      const dobavljacNaziv = dobavljacNazivCol
        ? String(row.getCell(dobavljacNazivCol).value ?? "").trim() || null
        : null;

      const dobavljacSifra = dobavljacSifraCol
        ? String(row.getCell(dobavljacSifraCol).value ?? "").trim() || null
        : null;

      const datumRaw = datumCol
        ? row.getCell(datumCol).value
        : null;
      const datum = datumRaw ? parseDatum(datumRaw) : null;

      const fakturnaVrijednost = fakturnaVrijednostCol
        ? parseNumeric(row.getCell(fakturnaVrijednostCol).value)
        : null;

      const nabavnaCijena = nabavnaCijenaCol
        ? parseNumeric(row.getCell(nabavnaCijenaCol).value)
        : null;

      const nabavnaVrijednost = nabavnaVrijednostCol
        ? parseNumeric(row.getCell(nabavnaVrijednostCol).value)
        : null;

      const redniBroj = redniBrojCol
        ? String(row.getCell(redniBrojCol).value ?? "").trim() || null
        : null;

      rows.push({
        rowNumber,
        artikalNaziv,
        artikalSifra,
        jedinicaMjere,
        fakturnaCijena,
        kolicina,
        dobavljacNaziv,
        dobavljacSifra,
        datum,
        fakturnaVrijednost,
        nabavnaCijena,
        nabavnaVrijednost,
        redniBroj,
      });
    });

    return rows;
  },

  async importMaterials(
    buffer: Buffer,
    options: MaterialImportOptions
  ): Promise<MaterialImportResult> {
    const rows = await this.parseExcel(buffer);

    const result: MaterialImportResult = {
      materialsCreated: 0,
      materialsSkipped: 0,
      suppliersCreated: 0,
      suppliersSkipped: 0,
      linksCreated: 0,
      stockRecordsCreated: 0,
      fabricsCreated: 0,
      errors: [],
    };

    if (rows.length === 0) {
      throw new Error("Datoteka ne sadrži podatke za uvoz");
    }

    // ── Phase 1 — Materials ──────────────────────────────
    // Deduplicate by ArtikalSifra, keep first occurrence
    const uniqueMaterials = new Map<string, ParsedMaterialRow>();
    for (const row of rows) {
      const key = row.artikalSifra.toLowerCase();
      if (!uniqueMaterials.has(key)) {
        uniqueMaterials.set(key, row);
      }
    }

    const materialCodes = Array.from(uniqueMaterials.keys());
    const existingMaterials = await prisma.material.findMany({
      where: { code: { in: materialCodes } },
      select: { id: true, code: true },
    });
    const existingMaterialCodes = new Set(existingMaterials.map((m) => m.code?.toLowerCase()));

    // Map code → id for all materials (existing + newly created)
    const materialCodeToId = new Map<string, string>();
    for (const m of existingMaterials) {
      if (m.code) materialCodeToId.set(m.code.toLowerCase(), m.id);
    }

    // Track newly created materials for Phase 1.5 (Fabric creation)
    const createdMaterials: { code: string; id: string; row: ParsedMaterialRow }[] = [];

    for (const [code, row] of uniqueMaterials) {
      if (existingMaterialCodes.has(code)) {
        result.materialsSkipped++;
        continue;
      }

      try {
        const created = await prisma.material.create({
          data: {
            name: row.artikalNaziv,
            code: row.artikalSifra,
            unit: row.jedinicaMjere || "kom",
            price: row.nabavnaCijena,
            currentQuantity: 0,
            minimumQuantity: 0,
            hasDimensions: false,
            isEdgebanded: false,
          },
        });
        materialCodeToId.set(code, created.id);
        createdMaterials.push({ code, id: created.id, row });
        result.materialsCreated++;
      } catch (error) {
        result.errors.push({
          row: row.rowNumber,
          materialCode: row.artikalSifra,
          message:
            error instanceof Error
              ? error.message
              : "Nepoznata greška pri kreiranju materijala",
        });
      }
    }

    // ── Phase 1.5 — Fabrics (for "Štof" materials) ──────
    for (const mat of createdMaterials) {
      if (!mat.row.artikalNaziv.toLowerCase().startsWith("štof")) continue;

      try {
        const existingFabric = await prisma.fabric.findUnique({
          where: { code: mat.row.artikalSifra },
        });

        if (existingFabric) continue;

        await prisma.fabric.create({
          data: {
            name: mat.row.artikalNaziv,
            code: mat.row.artikalSifra,
            materialId: mat.id,
          },
        });
        result.fabricsCreated++;
      } catch (error) {
        result.errors.push({
          row: mat.row.rowNumber,
          materialCode: mat.row.artikalSifra,
          message:
            error instanceof Error
              ? error.message
              : "Nepoznata greška pri kreiranju tkanine",
        });
      }
    }

    // ── Phase 2 — Suppliers ──────────────────────────────
    // Deduplicate by DobavljacSifra, keep first, skip rows without it
    const uniqueSuppliers = new Map<string, ParsedMaterialRow>();
    for (const row of rows) {
      if (row.dobavljacSifra && !uniqueSuppliers.has(row.dobavljacSifra.toLowerCase())) {
        uniqueSuppliers.set(row.dobavljacSifra.toLowerCase(), row);
      }
    }

    const supplierCodes = Array.from(uniqueSuppliers.keys());
    const existingSuppliers = supplierCodes.length > 0
      ? await prisma.supplier.findMany({
          where: { code: { in: supplierCodes } },
          select: { id: true, code: true },
        })
      : [];
    const existingSupplierCodes = new Set(existingSuppliers.map((s) => s.code?.toLowerCase()));

    // Map code → id for all suppliers (existing + newly created)
    const supplierCodeToId = new Map<string, string>();
    for (const s of existingSuppliers) {
      if (s.code) supplierCodeToId.set(s.code.toLowerCase(), s.id);
    }

    for (const [code, row] of uniqueSuppliers) {
      if (existingSupplierCodes.has(code)) {
        result.suppliersSkipped++;
        continue;
      }

      try {
        const created = await prisma.supplier.create({
          data: {
            companyName: row.dobavljacNaziv || code,
            code: code,
          },
        });
        supplierCodeToId.set(code, created.id);
        result.suppliersCreated++;
      } catch (error) {
        result.errors.push({
          row: row.rowNumber,
          materialCode: row.artikalSifra,
          message:
            error instanceof Error
              ? error.message
              : "Nepoznata greška pri kreiranju dobavljača",
        });
      }
    }

    // ── Phase 3 — Links (SupplierMaterial) ───────────────
    // Collect unique (materialCode, supplierCode) pairs from all rows
    const linkPairs = new Set<string>();
    const linkRows: { materialId: string; supplierId: string; row: ParsedMaterialRow }[] = [];

    for (const row of rows) {
      if (!row.artikalSifra || !row.dobavljacSifra) continue;
      const materialId = materialCodeToId.get(row.artikalSifra.toLowerCase());
      const supplierId = supplierCodeToId.get(row.dobavljacSifra.toLowerCase());
      if (!materialId || !supplierId) continue;

      const pairKey = `${materialId}:${supplierId}`;
      if (linkPairs.has(pairKey)) continue;
      linkPairs.add(pairKey);
      linkRows.push({ materialId, supplierId, row });
    }

    // Batch query existing links
    if (linkRows.length > 0) {
      const existingLinks = await prisma.supplierMaterial.findMany({
        where: {
          OR: linkRows.map((l) => ({
            supplierId: l.supplierId,
            materialId: l.materialId,
          })),
        },
        select: { supplierId: true, materialId: true },
      });
      const existingLinkSet = new Set(
        existingLinks.map((l) => `${l.materialId}:${l.supplierId}`)
      );

      for (const link of linkRows) {
        const key = `${link.materialId}:${link.supplierId}`;
        if (existingLinkSet.has(key)) continue;

        try {
          await prisma.supplierMaterial.create({
            data: {
              materialId: link.materialId,
              supplierId: link.supplierId,
            },
          });
          result.linksCreated++;
        } catch (error) {
          result.errors.push({
            row: link.row.rowNumber,
            materialCode: link.row.artikalSifra,
            message:
              error instanceof Error
                ? error.message
                : "Nepoznata greška pri kreiranju veze dobavljač-materijal",
          });
        }
      }
    }

    // ── Phase 4 — Stock History (optional) ───────────────
    if (options.importStock) {
      // Aggregate quantities per material for currentQuantity update
      const quantityAggregation = new Map<string, number>();

      for (const row of rows) {
        if (row.kolicina === null || row.kolicina === undefined) continue;

        const materialId = materialCodeToId.get(row.artikalSifra.toLowerCase());
        if (!materialId) continue;

        const changeType = row.kolicina >= 0 ? "inflow" : "outflow";
        const absQuantity = Math.abs(row.kolicina);

        // Build notes string
        const notesParts: string[] = [];
        if (row.datum) {
          const d = row.datum;
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const yy = String(d.getFullYear()).slice(-2);
          notesParts.push(`Kalkulacija ${dd}.${mm}.${yy}`);
        }
        if (row.redniBroj) {
          notesParts.push(`RB: ${row.redniBroj}`);
        }
        if (row.dobavljacNaziv) {
          notesParts.push(`Dobavljač: ${row.dobavljacNaziv}`);
        }
        const notes = notesParts.length > 0 ? notesParts.join(", ") : null;

        try {
          await prisma.stockHistory.create({
            data: {
              materialId,
              changeType: changeType as "inflow" | "outflow",
              quantity: absQuantity,
              previousQuantity: 0,
              newQuantity: 0,
              referenceType: "kalkulacija_import",
              notes,
              createdAt: row.datum || undefined,
            },
          });
          result.stockRecordsCreated++;

          // Aggregate quantity for material update
          const current = quantityAggregation.get(materialId) || 0;
          quantityAggregation.set(materialId, current + row.kolicina);
        } catch (error) {
          result.errors.push({
            row: row.rowNumber,
            materialCode: row.artikalSifra,
            message:
              error instanceof Error
                ? error.message
                : "Nepoznata greška pri kreiranju zapisa historije zaliha",
          });
        }
      }

      // Update currentQuantity for each material
      for (const [materialId, totalQuantity] of quantityAggregation) {
        try {
          await prisma.material.update({
            where: { id: materialId },
            data: {
              currentQuantity: {
                increment: totalQuantity,
              },
            },
          });
        } catch (error) {
          console.error(
            `Greška pri ažuriranju količine za materijal ${materialId}:`,
            error
          );
        }
      }
    }

    return result;
  },
};
