import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

export const FABRIC_EXPORT_COLUMNS = [
  "Naziv",
  "Šifra",
  "Opis",
  "Boja",
  "Materijal",
  "MaterijalnaSifra",
  "JedinicaMjere",
  "TrenutnaKolicina",
  "MinimalnaKolicina",
] as const;

export const FabricExcelExportService = {
  async exportToBuffer(): Promise<Buffer> {
    const fabrics = await prisma.fabric.findMany({
      orderBy: { name: "asc" },
      include: {
        material: {
          select: {
            name: true,
            code: true,
            unit: true,
            currentQuantity: true,
            minimumQuantity: true,
          },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Stofovi");

    // Add header row
    worksheet.addRow([...FABRIC_EXPORT_COLUMNS]);

    // Add data rows
    for (const fabric of fabrics) {
      worksheet.addRow([
        fabric.name,
        fabric.code ?? null,
        fabric.description ?? null,
        fabric.color ?? null,
        fabric.material?.name ?? null,
        fabric.material?.code ?? null,
        fabric.material?.unit ?? null,
        fabric.material?.currentQuantity ?? null,
        fabric.material?.minimumQuantity ?? null,
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },
};
