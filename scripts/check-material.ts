import { PrismaClient } from "../app/generated/prisma";
import "dotenv/config";

const prisma = new PrismaClient();
const ID = "ac4da761-3abb-40fd-bb41-1d50d96a1767";

async function main() {
  const material = await prisma.material.findUnique({
    where: { id: ID },
    select: { name: true, currentQuantity: true, code: true },
  });
  console.log("Material:", JSON.stringify(material, null, 2));

  const stockHistory = await prisma.stockHistory.findMany({
    where: { materialId: ID },
    orderBy: { createdAt: "desc" },
  });
  console.log("StockHistory count:", stockHistory.length);
  console.log("StockHistory:", JSON.stringify(stockHistory, null, 2));

  const purchaseHistory = await prisma.materialPurchaseHistory.findMany({
    where: { materialId: ID },
    orderBy: { purchaseDate: "desc" },
  });
  console.log("PurchaseHistory count:", purchaseHistory.length);
  console.log("PurchaseHistory:", JSON.stringify(purchaseHistory, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
