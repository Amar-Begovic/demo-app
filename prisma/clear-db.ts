import { PrismaClient } from "../app/generated/prisma";

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log("🗑️  Brišem sve podatke iz baze...\n");

  // Redoslijed je bitan zbog foreign key constraints
  // Prvo brišemo "leaf" tablice, pa onda parent tablice

  const deleted = {
    auditLog: await prisma.auditLog.deleteMany(),
    stockHistory: await prisma.stockHistory.deleteMany(),
    barcode: await prisma.barcode.deleteMany(),
    workOrder: await prisma.workOrder.deleteMany(),
    purchaseOrder: await prisma.purchaseOrder.deleteMany(),
    productionOrderItem: await prisma.productionOrderItem.deleteMany(),
    productionOrder: await prisma.productionOrder.deleteMany(),
    stepMaterial: await prisma.stepMaterial.deleteMany(),
    productionStep: await prisma.productionStep.deleteMany(),
    articlePart: await prisma.articlePart.deleteMany(),
    article: await prisma.article.deleteMany(),
    supplierMaterial: await prisma.supplierMaterial.deleteMany(),
    supplier: await prisma.supplier.deleteMany(),
    material: await prisma.material.deleteMany(),
    fabric: await prisma.fabric.deleteMany(),
    department: await prisma.department.deleteMany(),
  };

  console.log("✅ Obrisano:");
  for (const [table, result] of Object.entries(deleted)) {
    if (result.count > 0) {
      console.log(`   ${table}: ${result.count} zapisa`);
    }
  }

  console.log("\n🎉 Baza je sada prazna i spremna za produkciju!");
}

clearDatabase()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
