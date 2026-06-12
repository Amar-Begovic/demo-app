import { PrismaClient } from "./app/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // Pronađi materijale za brisanje
  const materials = await prisma.material.findMany({
    where: {
      AND: [
        {
          name: {
            in: ["E2E Test Material", "Elektrostatična farba u prahu"],
          },
        },
        {
          NOT: { code: "522" },
        },
      ],
    },
    select: { id: true, name: true, code: true },
  });

  console.log(`Pronađeno ${materials.length} materijala za brisanje:`);
  materials.forEach((m) => {
    console.log(`  - ${m.name} (šifra: ${m.code ?? "nema"})`);
  });

  if (materials.length === 0) {
    console.log("Nema materijala za brisanje.");
    return;
  }

  const ids = materials.map((m) => m.id);

  // Obriši povezane zapise prvo (zbog foreign key constrainta)
  const deletedStepMaterials = await prisma.stepMaterial.deleteMany({
    where: { materialId: { in: ids } },
  });
  console.log(`Obrisano ${deletedStepMaterials.count} step materijala`);

  const deletedNormMaterials =
    await prisma.normativeVersionMaterial.deleteMany({
      where: { materialId: { in: ids } },
    });
  console.log(
    `Obrisano ${deletedNormMaterials.count} normative version materijala`
  );

  const deletedPurchaseHistory =
    await prisma.materialPurchaseHistory.deleteMany({
      where: { materialId: { in: ids } },
    });
  console.log(
    `Obrisano ${deletedPurchaseHistory.count} purchase history zapisa`
  );

  const deletedStockHistory = await prisma.stockHistory.deleteMany({
    where: { materialId: { in: ids } },
  });
  console.log(`Obrisano ${deletedStockHistory.count} stock history zapisa`);

  const deletedSupplierMaterials = await prisma.supplierMaterial.deleteMany({
    where: { materialId: { in: ids } },
  });
  console.log(
    `Obrisano ${deletedSupplierMaterials.count} supplier-material veza`
  );

  const deletedPurchaseOrders = await prisma.purchaseOrder.deleteMany({
    where: { materialId: { in: ids } },
  });
  console.log(`Obrisano ${deletedPurchaseOrders.count} purchase ordera`);

  // Obriši same materijale
  const deleted = await prisma.material.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`\n✅ Obrisano ${deleted.count} materijala.`);
}

main()
  .catch((e) => {
    console.error("Greška:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
