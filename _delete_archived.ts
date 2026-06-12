import { PrismaClient } from "./app/generated/prisma";

const prisma = new PrismaClient();

// The 25 article codes that have orders
const codes = [
  "1442","1111","1415","1233","716","717","1122","718","736","1120",
  "776","1403","708","737","1568","719","1113","956","1117","1374",
  "1119","957","831","1342","1381"
];

async function main() {
  // Get all 25 articles with their order item details
  const articles = await prisma.article.findMany({
    where: { code: { in: codes } },
    select: {
      id: true,
      code: true,
      name: true,
      productionOrderItems: {
        select: {
          id: true,
          productionOrderId: true,
          productionOrder: {
            select: {
              id: true,
              orderNumber: true,
              isArchived: true,
            },
          },
        },
      },
    },
  });

  // Determine which articles are ONLY in archived orders (safe to delete)
  // vs which have at least one active (non-archived) order
  const safeToDelete: typeof articles = [];
  const hasActiveOrders: typeof articles = [];

  for (const art of articles) {
    const hasActive = art.productionOrderItems.some(
      (item) => !item.productionOrder.isArchived
    );
    if (hasActive) {
      hasActiveOrders.push(art);
    } else {
      safeToDelete.push(art);
    }
  }

  console.log(`Artikli SAMO u arhiviranim nalozima (brisanje): ${safeToDelete.length}`);
  console.log(`Artikli u aktivnim nalozima (ostaju): ${hasActiveOrders.length}`);

  // Collect all archived production order IDs that reference these articles
  const archivedOrderIds = new Set<string>();
  for (const art of safeToDelete) {
    for (const item of art.productionOrderItems) {
      if (item.productionOrder.isArchived) {
        archivedOrderIds.add(item.productionOrder.id);
      }
    }
  }

  // Also collect archived orders from the "hasActiveOrders" articles
  // (we'll delete the archived orders but keep the article)
  const archivedOrderIdsFromMixed = new Set<string>();
  for (const art of hasActiveOrders) {
    for (const item of art.productionOrderItems) {
      if (item.productionOrder.isArchived) {
        archivedOrderIdsFromMixed.add(item.productionOrder.id);
      }
    }
  }

  // Delete archived production orders (cascade will handle items, work orders, barcodes, etc.)
  const allArchivedOrderIds = [...archivedOrderIds, ...archivedOrderIdsFromMixed];
  
  if (allArchivedOrderIds.length > 0) {
    // First delete work orders (no cascade from production order)
    const deletedWorkOrders = await prisma.workOrder.deleteMany({
      where: { productionOrderId: { in: allArchivedOrderIds } },
    });
    console.log(`  Obrisano radnih naloga: ${deletedWorkOrders.count}`);

    // Delete barcodes
    const deletedBarcodes = await prisma.barcode.deleteMany({
      where: { productionOrderId: { in: allArchivedOrderIds } },
    });
    console.log(`  Obrisano barkodova: ${deletedBarcodes.count}`);

    // Delete component barcodes (cascade handles packaging scans)
    const deletedComponentBarcodes = await prisma.componentBarcode.deleteMany({
      where: { productionOrderId: { in: allArchivedOrderIds } },
    });
    console.log(`  Obrisano component barkodova: ${deletedComponentBarcodes.count}`);

    // Delete purchase orders
    const deletedPurchaseOrders = await prisma.purchaseOrder.deleteMany({
      where: { productionOrderId: { in: allArchivedOrderIds } },
    });
    console.log(`  Obrisano nabavnih naloga: ${deletedPurchaseOrders.count}`);

    // Delete production order items
    const deletedItems = await prisma.productionOrderItem.deleteMany({
      where: { productionOrderId: { in: allArchivedOrderIds } },
    });
    console.log(`  Obrisano stavki naloga: ${deletedItems.count}`);

    // Delete production orders themselves
    const deletedOrders = await prisma.productionOrder.deleteMany({
      where: { id: { in: allArchivedOrderIds } },
    });
    console.log(`  Obrisano proizvodnih naloga: ${deletedOrders.count}`);
  }

  // Now delete articles that were ONLY in archived orders
  if (safeToDelete.length > 0) {
    const articleIds = safeToDelete.map((a) => a.id);
    const deleted = await prisma.article.deleteMany({
      where: { id: { in: articleIds } },
    });
    console.log(`\n=== OBRISANO ${deleted.count} artikala (bili samo u arhiviranim nalozima) ===`);
    safeToDelete.forEach((a) => console.log(`  - ${a.code} | ${a.name}`));
  }

  // Report remaining
  if (hasActiveOrders.length > 0) {
    console.log(`\n=== OSTALI (imaju aktivne naloge) - ${hasActiveOrders.length} artikala ===`);
    for (const art of hasActiveOrders) {
      const activeItems = art.productionOrderItems.filter(
        (item) => !item.productionOrder.isArchived
      );
      const orderNums = [...new Set(activeItems.map((i) => i.productionOrder.orderNumber))];
      console.log(`  - ${art.code} | ${art.name} | aktivni nalozi: #${orderNums.join(", #")}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
