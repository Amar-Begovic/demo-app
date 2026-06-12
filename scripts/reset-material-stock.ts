import { PrismaClient } from "../app/generated/prisma";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Prebrojavam kalkulacije i materijale...");

  const stockHistoryCount = await prisma.stockHistory.count();
  const purchaseHistoryCount = await prisma.materialPurchaseHistory.count();
  const materialsCount = await prisma.material.count();

  console.log(`   Stock historija zapisa za brisanje: ${stockHistoryCount}`);
  console.log(`   Historija nabavki za brisanje: ${purchaseHistoryCount}`);
  console.log(`   Materijala za reset: ${materialsCount}`);

  // 1. Obriši SVU stock historiju
  const deletedStock = await prisma.stockHistory.deleteMany();
  console.log(`✅ Obrisano ${deletedStock.count} zapisa iz stock historije`);

  // 2. Obriši SVU historiju nabavki
  const deletedPurchase = await prisma.materialPurchaseHistory.deleteMany();
  console.log(`✅ Obrisano ${deletedPurchase.count} zapisa iz historije nabavki`);

  // 3. Resetuj currentQuantity na 0 za sve materijale
  const updated = await prisma.material.updateMany({
    data: { currentQuantity: 0 },
  });
  console.log(`✅ Resetovano stanje na 0 za ${updated.count} materijala`);

  console.log("\n🎉 Gotovo!");
}

main()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
