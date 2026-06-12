import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

export const BASIC_EXCEL_COLUMNS = [
  "RB",
  "Modeli",
  "Naziv",
  "Sifra",
  "opis sadrzaj",
  "VRSTA",
  "GRUPA",
  "Vezani artikli sifra",
] as const;

export const BasicExcelExportService = {
  async exportToBuffer(ids?: string[]): Promise<Buffer> {
    const where = ids && ids.length > 0 ? { id: { in: ids } } : {};

    const articles = await prisma.article.findMany({
      where,
      select: {
        name: true,
        code: true,
        model: true,
        description: true,
        type: true,
        articleGroup: true,
        relatedArticleCode: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Artikli");

    // Add header row
    worksheet.addRow([...BASIC_EXCEL_COLUMNS]);

    // Add data rows with auto-generated RB
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      worksheet.addRow([
        i + 1,
        article.model ?? null,
        article.name ?? null,
        article.code ?? null,
        article.description ?? null,
        article.type ?? null,
        article.articleGroup ?? null,
        article.relatedArticleCode ?? null,
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },
};
