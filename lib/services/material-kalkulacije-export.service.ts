import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

const KALKULACIJE_COLUMNS = [
  "RedniBroj",
  "Datum",
  "DobavljacNaziv",
  "DobavljacSifra",
  "ArtikalNaziv",
  "ArtikalSifra",
  "JedinicaMjere",
  "Kolicina",
  "FakturnaCijena",
  "FakturnaVrijednost",
  "NabavnaCijena",
  "NabavnaVrijednost",
] as const;

function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

export const MaterialKalkulacijeExportService = {
  async exportToBuffer(): Promise<Buffer> {
    // Load all stock history with material and try to find supplier via SupplierMaterial
    const records = await prisma.stockHistory.findMany({
      where: { referenceType: "kalkulacija_import" },
      include: {
        material: {
          include: {
            suppliers: {
              include: { supplier: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Kalkulacije");
    worksheet.addRow([...KALKULACIJE_COLUMNS]);

    for (const record of records) {
      const mat = record.material;
      const supplier = mat.suppliers[0]?.supplier;
      const qty = record.changeType === "outflow" ? -record.quantity : record.quantity;
      const price = mat.price ?? 0;
      const value = qty * price;

      worksheet.addRow([
        0,
        formatDate(record.createdAt),
        supplier?.companyName ?? "",
        supplier?.code ?? "",
        mat.name,
        mat.code ?? "",
        mat.unit,
        qty,
        price,
        value,
        price,
        value,
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },
};
