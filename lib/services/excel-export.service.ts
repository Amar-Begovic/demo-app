import ExcelJS from "exceljs";
import { ArticleService } from "@/lib/services/article.service";

export const EXCEL_COLUMNS = [
  // Article fields
  "sifra proizvoda",
  "naziv proizvoda",
  "opis",
  "dimenzije",
  "tip",
  "grupa artikla",
  "jedinica mjere",
  "neaktivan",
  "valuta",
  // ArticlePart fields
  "dio",
  "dimenzije dijela",
  "napomene dijela",
  // ProductionStep fields
  "naziv koraka",
  "odjel",
  "procijenjeno vrijeme",
  "instrukcije",
  // StepMaterial fields
  "sifra sirovine",
  "naziv sirovine",
  "količina",
  "komada",
  "Duzina",
  "Sirina",
  "Visina",
  "kantiranje",
  // Price fields (at the end)
  "cijena bez PDV",
  "procenat PDV",
] as const;

export const ExcelExportService = {
  async exportToStream(ids?: string[]): Promise<Buffer> {
    const articles = ids && ids.length > 0
      ? await ArticleService.getByIds(ids)
      : await ArticleService.getAll();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Artikli");

    // Add header row
    worksheet.addRow(EXCEL_COLUMNS as unknown as string[]);

    for (const article of articles) {
      const a = article as any;
      let hasRows = false;

      for (const part of a.parts ?? []) {
        for (const step of part.productionSteps ?? []) {
          for (const sm of step.materials ?? []) {
            hasRows = true;
            worksheet.addRow([
              a.code ?? null,
              a.name ?? null,
              a.description ?? null,
              a.dimensions ?? null,
              a.type ?? null,
              a.articleGroup ?? null,
              a.unit ?? null,
              a.inactive ?? false,
              a.currency ?? null,
              part.partName || "Ostalo",
              part.dimensions ?? null,
              part.notes ?? null,
              step.stepName ?? null,
              step.department?.name || "Ostalo",
              step.estimatedTime ?? null,
              step.instructions ?? null,
              sm.material?.code ?? null,
              sm.material?.name ?? null,
              sm.quantity ?? null,
              sm.pieces ?? null,
              sm.length ?? null,
              sm.width ?? null,
              sm.height ?? null,
              sm.isEdgebanded ?? null,
              a.priceWithoutVAT ?? null,
              a.taxPercentage ?? null,
            ]);
          }
        }
      }

      // If article had no materials at all, still output one row with article info
      if (!hasRows) {
        const emptyRow: (string | number | boolean | null)[] = [
          a.code ?? null,
          a.name ?? null,
          a.description ?? null,
          a.dimensions ?? null,
          a.type ?? null,
          a.articleGroup ?? null,
          a.unit ?? null,
          a.inactive ?? false,
          a.currency ?? null,
        ];
        // Fill part/step/material columns with null
        for (let i = emptyRow.length; i < EXCEL_COLUMNS.length - 2; i++) {
          emptyRow.push(null);
        }
        // Price fields at the end
        emptyRow.push(a.priceWithoutVAT ?? null);
        emptyRow.push(a.taxPercentage ?? null);
        worksheet.addRow(emptyRow);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },
};
