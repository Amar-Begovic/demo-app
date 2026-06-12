/**
 * Skripta za čišćenje svih proizvodnih podataka iz sandbox okruženja.
 * 
 * UPOZORENJE: Ova skripta briše SVE proizvodne naloge i sve povezane podatke!
 * Koristi samo u development/sandbox okruženju!
 * 
 * Pokretanje:
 * npx tsx scripts/clean-production-data.ts
 */

import { PrismaClient } from "../app/generated/prisma/index.js";

const prisma = new PrismaClient();

async function cleanProductionData() {
  console.log("🧹 Započinjem čišćenje proizvodnih podataka...\n");

  try {
    // 1. Brisanje barkodova (moraju se obrisati prije radnih naloga)
    console.log("📦 Brišem barkodove...");
    const deletedBarcodes = await prisma.barcode.deleteMany({
      where: {
        OR: [
          { workOrderId: { not: null } },
          { productionOrderId: { not: null } },
        ],
      },
    });
    console.log(`   ✓ Obrisano ${deletedBarcodes.count} barkodova\n`);

    // 2. Brisanje radnih naloga
    console.log("👷 Brišem radne naloge...");
    const deletedWorkOrders = await prisma.workOrder.deleteMany({});
    console.log(`   ✓ Obrisano ${deletedWorkOrders.count} radnih naloga\n`);

    // 3. Brisanje naloga za nabavku
    console.log("🛒 Brišem naloge za nabavku...");
    const deletedPurchaseOrders = await prisma.purchaseOrder.deleteMany({});
    console.log(`   ✓ Obrisano ${deletedPurchaseOrders.count} naloga za nabavku\n`);

    // 4. Brisanje stavki proizvodnih naloga (ProductionOrderItem)
    console.log("📋 Brišem stavke proizvodnih naloga...");
    const deletedItems = await prisma.productionOrderItem.deleteMany({});
    console.log(`   ✓ Obrisano ${deletedItems.count} stavki\n`);

    // 5. Brisanje proizvodnih naloga
    console.log("🏭 Brišem proizvodne naloge...");
    const deletedProductionOrders = await prisma.productionOrder.deleteMany({});
    console.log(`   ✓ Obrisano ${deletedProductionOrders.count} proizvodnih naloga\n`);

    // 6. Brisanje audit log zapisa vezanih za proizvodnju
    console.log("📝 Brišem audit log zapise...");
    const deletedAuditLogs = await prisma.auditLog.deleteMany({
      where: {
        entityType: {
          in: ["production_order", "work_order", "purchase_order", "barcode"],
        },
      },
    });
    console.log(`   ✓ Obrisano ${deletedAuditLogs.count} audit log zapisa\n`);

    // 7. Resetovanje historije zaliha (opciono - zakomentiraj ako želiš zadržati)
    console.log("📊 Brišem historiju zaliha...");
    const deletedStockHistory = await prisma.stockHistory.deleteMany({
      where: {
        referenceType: {
          in: ["production_order", "purchase_order"],
        },
      },
    });
    console.log(`   ✓ Obrisano ${deletedStockHistory.count} zapisa historije zaliha\n`);

    console.log("✅ Čišćenje uspješno završeno!\n");
    console.log("📊 Sažetak:");
    console.log(`   • Barkodovi: ${deletedBarcodes.count}`);
    console.log(`   • Radni nalozi: ${deletedWorkOrders.count}`);
    console.log(`   • Nalozi za nabavku: ${deletedPurchaseOrders.count}`);
    console.log(`   • Stavke naloga: ${deletedItems.count}`);
    console.log(`   • Proizvodni nalozi: ${deletedProductionOrders.count}`);
    console.log(`   • Audit log zapisi: ${deletedAuditLogs.count}`);
    console.log(`   • Historija zaliha: ${deletedStockHistory.count}`);
  } catch (error) {
    console.error("❌ Greška pri čišćenju:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Potvrda prije pokretanja
console.log("⚠️  UPOZORENJE: Ova skripta će obrisati SVE proizvodne podatke!");
console.log("⚠️  Koristi samo u development/sandbox okruženju!\n");

cleanProductionData()
  .then(() => {
    console.log("\n🎉 Sandbox je očišćen i spreman za testiranje!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Čišćenje nije uspjelo:", error);
    process.exit(1);
  });
