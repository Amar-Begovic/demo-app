import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

export interface BasicMaterialImportResult {
  created: number;
  skipped: number;
  errors: BasicMaterialImportError[];
}

export interface BasicMaterialImportError {
  row: number;
  materialCode: string | null;
  message: string;
}

const REQUIRED_COLUMNS = ["ArtikalSifra", "ArtikalNaziv"];

export const BasicMaterialImportService = {
  async parseAndImport(buffer: Buffer): Promise<BasicMaterialImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error("Excel datoteka ne sadrži nijedan radni list");
    }

    // Find header row dynamically (case-insensitive)
    let headerRowNumber = 0;
    const columnMap = new Map<string, number>();

    worksheet.eachRow((row, rowNumber) => {
      if (headerRowNumber > 0) return;
      const cells = new Map<string, number>();
      row.eachCell((cell, colNumber) => {
        const value = String(cell.value ?? "").trim();
        if (value) cells.set(value.toLowerCase(), colNumber);
      });
      if (cells.has("artikalsifra") && cells.has("artikalnaziv")) {
        headerRowNumber = rowNumber;
        cells.forEach((col, key) => columnMap.set(key, col));
      }
    });

    if (headerRowNumber === 0) {
      throw new Error(`Nedostaju obavezne kolone: ${REQUIRED_COLUMNS.join(", ")}`);
    }

    const artikalNazivCol = columnMap.get("artikalnaziv")!;
    const artikalSifraCol = columnMap.get("artikalsifra")!;
    const jedinicaMjereCol = columnMap.get("jedinicamjere");
    const fakturnaCijenaCol = columnMap.get("fakturnacijena");
    const trenutnaKolicinaCol = columnMap.get("trenutnakolicina");
    const minimalnaKolicinaCol = columnMap.get("minimalnakolicina");

    // Parse rows
    interface ParsedRow {
      rowNumber: number;
      artikalNaziv: string;
      artikalSifra: string;
      jedinicaMjere: string | null;
      fakturnaCijena: number | null;
      trenutnaKolicina: number | null;
      minimalnaKolicina: number | null;
    }

    const rows: ParsedRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;
      const sifra = String(row.getCell(artikalSifraCol).value ?? "").trim();
      const naziv = String(row.getCell(artikalNazivCol).value ?? "").trim();
      if (!sifra || !naziv) return;

      const parseNum = (col: number | undefined): number | null => {
        if (!col) return null;
        const v = row.getCell(col).value;
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      };

      rows.push({
        rowNumber,
        artikalNaziv: naziv,
        artikalSifra: sifra,
        jedinicaMjere: jedinicaMjereCol ? String(row.getCell(jedinicaMjereCol).value ?? "").trim() || null : null,
        fakturnaCijena: parseNum(fakturnaCijenaCol),
        trenutnaKolicina: parseNum(trenutnaKolicinaCol),
        minimalnaKolicina: parseNum(minimalnaKolicinaCol),
      });
    });

    if (rows.length === 0) {
      throw new Error("Datoteka ne sadrži podatke za uvoz");
    }

    // Deduplicate by code (case-insensitive, keep first)
    const unique = new Map<string, ParsedRow>();
    for (const row of rows) {
      const key = row.artikalSifra.toLowerCase();
      if (!unique.has(key)) unique.set(key, row);
    }

    const codes = Array.from(unique.keys());
    const existing = await prisma.material.findMany({
      where: { code: { in: Array.from(unique.values()).map((r) => r.artikalSifra), mode: "insensitive" } },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((m) => m.code?.toLowerCase()));

    let created = 0;
    let skipped = 0;
    const errors: BasicMaterialImportError[] = [];

    for (const [key, row] of unique) {
      if (existingCodes.has(key)) {
        skipped++;
        continue;
      }
      try {
        await prisma.material.create({
          data: {
            name: row.artikalNaziv,
            code: row.artikalSifra,
            unit: row.jedinicaMjere || "kom",
            price: row.fakturnaCijena,
            currentQuantity: row.trenutnaKolicina ?? 0,
            minimumQuantity: row.minimalnaKolicina ?? 0,
            hasDimensions: false,
            isEdgebanded: false,
          },
        });
        created++;
      } catch (error) {
        errors.push({
          row: row.rowNumber,
          materialCode: row.artikalSifra,
          message: error instanceof Error ? error.message : "Nepoznata greška",
        });
      }
    }

    return { created, skipped, errors };
  },
};
