import { PrismaClient } from "../app/generated/prisma";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  // Sumiraj količine iz historije nabavki po materijalu
  const totals = await prisma.materialPurchaseHistory.groupBy({
    by: ["materialId"],
    _sum: { quantity: true },
  });

  console.log(`🔍 Pronađeno ${totals.length} materijala sa historijom nabavki\n`);

  let updated = 0;
  for (const entry of totals) {
    const total = entry._sum.quantity ?? 0;
    await prisma.material.update({
      where: { id: entry.materialId },
      data: { currentQuantity: total },
    });
    updated++;
  }

  console.log(`✅ Ažurirano stanje za ${updated} materijala`);
  console.log("\n🎉 Gotovo!");
}

main()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
