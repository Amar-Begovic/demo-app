import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

export interface BasicImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: BasicImportError[];
}

export interface BasicImportError {
  row: number;
  articleCode: string | null;
  message: string;
}

export interface ParsedBasicArticleRow {
  rowNumber: number;
  naziv: string;
  sifra: string;
  modeli: string | null;
  opis: string | null;
  vrsta: string | null;
  grupa: string | null;
  vezaniArtikliSifra: string | null;
}

const REQUIRED_COLUMNS = ["Sifra", "Naziv"];

/**
 * Strip the group letter (M/D) from article names.
 * Pattern: "MODEL M 160X200 rest" → "MODEL 160X200 rest"
 * The M (Metalni) or D (Drveni) is redundant since we have the GRUPA column.
 * Only removes a standalone M or D that appears directly before dimensions.
 */
function cleanArticleName(name: string): string {
  return name.replace(/\s+[MD]\s+(?=\d+[Xx×]\d+)/, " ");
}

export const BasicExcelImportService = {
  async parseExcel(buffer: Buffer): Promise<ParsedBasicArticleRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error("Excel datoteka ne sadrži nijedan radni list");
    }

    // Find header row dynamically (may not be row 1 if file has title rows)
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
      if (cells.has("sifra") && cells.has("naziv")) {
        headerRowNumber = rowNumber;
        cells.forEach((col, key) => columnMap.set(key, col));
      }
    });

    if (headerRowNumber === 0) {
      throw new Error(
        `Nedostaju obavezne kolone: ${REQUIRED_COLUMNS.join(", ")}`
      );
    }

    const sifraCol = columnMap.get("sifra")!;
    const nazivCol = columnMap.get("naziv")!;
    const opisCol = columnMap.get("opis sadrzaj");
    const vrstaCol = columnMap.get("vrsta");
    const grupaCol = columnMap.get("grupa");
    const modeliCol = columnMap.get("modeli");
    const vezaniArtikliSifraCol = columnMap.get("vezani artikli sifra");

    const rows: ParsedBasicArticleRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const sifra = String(row.getCell(sifraCol).value ?? "").trim();
      const naziv = String(row.getCell(nazivCol).value ?? "").trim();

      if (!sifra || !naziv) return;

      rows.push({
        rowNumber,
        sifra,
        naziv,
        modeli: modeliCol ? String(row.getCell(modeliCol).value ?? "").trim() || null : null,
        opis: opisCol ? String(row.getCell(opisCol).value ?? "").trim() || null : null,
        vrsta: vrstaCol ? String(row.getCell(vrstaCol).value ?? "").trim() || null : null,
        grupa: grupaCol ? String(row.getCell(grupaCol).value ?? "").trim() || null : null,
        vezaniArtikliSifra: vezaniArtikliSifraCol ? String(row.getCell(vezaniArtikliSifraCol).value ?? "").trim() || null : null,
      });
    });

    return rows;
  },

  async importArticles(buffer: Buffer): Promise<BasicImportResult> {
    const rows = await this.parseExcel(buffer);

    // Deduplicate by Sifra — keep first occurrence
    const uniqueRows = new Map<string, ParsedBasicArticleRow>();
    for (const row of rows) {
      if (!uniqueRows.has(row.sifra.toLowerCase())) {
        uniqueRows.set(row.sifra.toLowerCase(), row);
      }
    }

    const codes = Array.from(uniqueRows.keys());

    // Batch query existing articles with their ids for update
    const existingArticles = await prisma.article.findMany({
      where: { code: { in: codes, mode: "insensitive" } },
      select: { id: true, code: true },
    });
    const existingArticleMap = new Map(
      existingArticles.map((a) => [a.code?.toLowerCase(), a.id])
    );

    // Split rows into creates and updates
    const rowsToCreate: ParsedBasicArticleRow[] = [];
    const rowsToUpdate: { row: ParsedBasicArticleRow; existingId: string }[] = [];

    for (const [code, row] of uniqueRows) {
      const existingId = existingArticleMap.get(code);
      if (existingId) {
        rowsToUpdate.push({ row, existingId });
      } else {
        rowsToCreate.push(row);
      }
    }

    let created = 0;
    let updated = 0;
    const skipped = 0;
    const errors: BasicImportError[] = [];

    // Batch creates using transaction with per-row error isolation
    if (rowsToCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const row of rowsToCreate) {
          try {
            await tx.article.create({
              data: {
                name: cleanArticleName(row.naziv),
                code: row.sifra,
                model: row.modeli,
                description: row.opis,
                type: row.vrsta,
                articleGroup: row.grupa,
                relatedArticleCode: row.vezaniArtikliSifra,
              },
            });
            created++;
          } catch (error) {
            errors.push({
              row: row.rowNumber,
              articleCode: row.sifra,
              message:
                error instanceof Error
                  ? error.message
                  : "Nepoznata greška pri kreiranju artikla",
            });
          }
        }
      });
    }

    // Batch updates using transaction with per-row error isolation
    if (rowsToUpdate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const { row, existingId } of rowsToUpdate) {
          try {
            await tx.article.update({
              where: { id: existingId },
              data: {
                name: cleanArticleName(row.naziv),
                model: row.modeli,
                description: row.opis,
                type: row.vrsta,
                articleGroup: row.grupa,
                relatedArticleCode: row.vezaniArtikliSifra,
              },
            });
            updated++;
          } catch (error) {
            errors.push({
              row: row.rowNumber,
              articleCode: row.sifra,
              message:
                error instanceof Error
                  ? error.message
                  : "Nepoznata greška pri ažuriranju artikla",
            });
          }
        }
      });
    }

    return { created, updated, skipped, errors };
  },
};
