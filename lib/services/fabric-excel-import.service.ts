import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

export interface FabricImportResult {
  fabricsCreated: number;
  fabricsUpdated: number;
  errors: FabricImportError[];
}

export interface FabricImportError {
  row: number;
  fabricCode: string | null;
  message: string;
}

export interface ParsedFabricRow {
  rowNumber: number;
  naziv: string;
  sifra: string;
  opis: string | null;
  boja: string | null;
  materijalSifra: string | null;
}

export interface ParseExcelResult {
  rows: ParsedFabricRow[];
  errors: FabricImportError[];
}

export const REQUIRED_COLUMNS = ["Naziv", "Šifra"];

export const FabricExcelImportService = {
  async importFabrics(buffer: Buffer): Promise<FabricImportResult> {
    const { rows, errors: parseErrors } = await this.parseExcel(buffer);

    const result: FabricImportResult = {
      fabricsCreated: 0,
      fabricsUpdated: 0,
      errors: [...parseErrors],
    };

    if (rows.length === 0 && parseErrors.length === 0) {
      throw new Error("Datoteka ne sadrži podatke za uvoz");
    }

    // Pre-fetch all materials → build Map<lowercaseCode, materialId> for O(1) lookup
    const allMaterials = await prisma.material.findMany({
      select: { id: true, code: true },
    });
    const materialCodeToId = new Map<string, string>();
    for (const m of allMaterials) {
      if (m.code) {
        materialCodeToId.set(m.code.toLowerCase(), m.id);
      }
    }

    // Pre-fetch existing fabrics by code to determine create vs update
    const fabricCodes = rows
      .map((r) => r.sifra)
      .filter((code): code is string => !!code);
    const existingFabrics = await prisma.fabric.findMany({
      where: { code: { in: fabricCodes } },
      select: { id: true, code: true },
    });
    const existingFabricMap = new Map<string, string>();
    for (const f of existingFabrics) {
      if (f.code) {
        existingFabricMap.set(f.code.toLowerCase(), f.id);
      }
    }

    // Process each row
    for (const row of rows) {
      // Resolve materijalSifra → materialId (case-insensitive)
      let materialId: string | null = null;
      if (row.materijalSifra) {
        const resolvedId = materialCodeToId.get(
          row.materijalSifra.toLowerCase()
        );
        if (resolvedId) {
          materialId = resolvedId;
        } else {
          result.errors.push({
            row: row.rowNumber,
            fabricCode: row.sifra,
            message: `Materijal sa šifrom "${row.materijalSifra}" nije pronađen`,
          });
          // materialId stays null, fabric still gets created/updated
        }
      }

      const existingFabricId = existingFabricMap.get(row.sifra.toLowerCase());

      try {
        if (existingFabricId) {
          // Update existing fabric
          await prisma.fabric.update({
            where: { id: existingFabricId },
            data: {
              name: row.naziv,
              description: row.opis,
              color: row.boja,
              materialId,
            },
          });
          result.fabricsUpdated++;
        } else {
          // Create new fabric
          await prisma.fabric.create({
            data: {
              name: row.naziv,
              code: row.sifra,
              description: row.opis,
              color: row.boja,
              materialId,
            },
          });
          result.fabricsCreated++;
          // Track newly created fabric for subsequent rows with same code
          existingFabricMap.set(row.sifra.toLowerCase(), "created");
        }
      } catch (error) {
        result.errors.push({
          row: row.rowNumber,
          fabricCode: row.sifra,
          message:
            error instanceof Error
              ? error.message
              : "Nepoznata greška pri uvozu tkanine",
        });
      }
    }

    return result;
  },

  async parseExcel(buffer: Buffer): Promise<ParseExcelResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error("Excel datoteka ne sadrži nijedan radni list");
    }

    // Find header row dynamically (case-insensitive search for "naziv" and "šifra")
    let headerRowNumber = 0;
    const columnMap = new Map<string, number>();

    worksheet.eachRow((row, rowNumber) => {
      if (headerRowNumber > 0) return;
      const cells = new Map<string, number>();
      row.eachCell((cell, colNumber) => {
        const value = String(cell.value ?? "").trim();
        if (value) {
          cells.set(value.toLowerCase(), colNumber);
        }
      });
      if (cells.has("naziv") && cells.has("šifra")) {
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
            const value = String(cell.value ?? "").trim().toLowerCase();
            if (value === col.toLowerCase()) {
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

    // Map recognized columns
    const nazivCol = columnMap.get("naziv")!;
    const sifraCol = columnMap.get("šifra")!;
    const opisCol = columnMap.get("opis");
    const bojaCol = columnMap.get("boja");
    const materijalSifraCol = columnMap.get("materijalnasifra");

    const rows: ParsedFabricRow[] = [];
    const errors: FabricImportError[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const naziv = String(row.getCell(nazivCol).value ?? "").trim();
      const sifra = String(row.getCell(sifraCol).value ?? "").trim();

      // Skip rows missing both required fields
      if (!naziv && !sifra) return;

      // Record error for rows missing one required field
      if (!naziv) {
        errors.push({
          row: rowNumber,
          fabricCode: sifra || null,
          message: "Nedostaje obavezno polje: Naziv",
        });
        return;
      }

      if (!sifra) {
        errors.push({
          row: rowNumber,
          fabricCode: null,
          message: "Nedostaje obavezno polje: Šifra",
        });
        return;
      }

      // Parse optional fields
      const opis = opisCol
        ? String(row.getCell(opisCol).value ?? "").trim() || null
        : null;

      const boja = bojaCol
        ? String(row.getCell(bojaCol).value ?? "").trim() || null
        : null;

      const materijalSifra = materijalSifraCol
        ? String(row.getCell(materijalSifraCol).value ?? "").trim() || null
        : null;

      rows.push({
        rowNumber,
        naziv,
        sifra,
        opis,
        boja,
        materijalSifra,
      });
    });

    return { rows, errors };
  },
};
