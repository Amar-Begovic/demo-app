import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

export const MATERIAL_EXPORT_COLUMNS = [
  "ArtikalNaziv",
  "ArtikalSifra",
  "JedinicaMjere",
  "NabavnaCijena",
  "TrenutnaKolicina",
  "MinimalnaKolicina",
  "Dobavljaci",
] as const;

export const MaterialExcelExportService = {
  async exportToBuffer(): Promise<Buffer> {
    const materials = await prisma.material.findMany({
      include: {
        suppliers: {
          include: {
            supplier: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Materijali");

    // Add header row
    worksheet.addRow([...MATERIAL_EXPORT_COLUMNS]);

    // Add data rows
    for (const material of materials) {
      const supplierNames = material.suppliers
        .map((sm) => sm.supplier.companyName)
        .join(", ");

      worksheet.addRow([
        material.name,
        material.code ?? null,
        material.unit,
        material.price ?? null,
        material.currentQuantity,
        material.minimumQuantity,
        supplierNames,
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },
};
