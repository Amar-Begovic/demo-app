import { PrismaClient } from "../app/generated/prisma";
import "dotenv/config";

const prisma = new PrismaClient();

const CATEGORY_KEYWORDS = {
  nogice: "nogic",
  rucke: "ručk",
  paspul: "paspul",
} as const;

interface SeedResult {
  created: number;
  skipped: number;
}

async function seedNogice(): Promise<SeedResult> {
  const materials = await prisma.material.findMany({
    where: { name: { contains: CATEGORY_KEYWORDS.nogice, mode: "insensitive" } },
  });

  let created = 0;
  let skipped = 0;

  for (const material of materials) {
    try {
      await prisma.nogica.create({
        data: {
          name: material.name,
          code: material.code ?? null,
          materialId: material.id,
        },
      });
      created++;
    } catch (error: any) {
      // Skip if unique constraint violation (code already exists)
      if (error?.code === "P2002") {
        skipped++;
      } else {
        throw error;
      }
    }
  }

  return { created, skipped };
}

async function seedRucke(): Promise<SeedResult> {
  const materials = await prisma.material.findMany({
    where: { name: { contains: CATEGORY_KEYWORDS.rucke, mode: "insensitive" } },
  });

  let created = 0;
  let skipped = 0;

  for (const material of materials) {
    try {
      await prisma.rucka.create({
        data: {
          name: material.name,
          code: material.code ?? null,
          materialId: material.id,
        },
      });
      created++;
    } catch (error: any) {
      // Skip if unique constraint violation (code already exists)
      if (error?.code === "P2002") {
        skipped++;
      } else {
        throw error;
      }
    }
  }

  return { created, skipped };
}

async function seedPaspul(): Promise<SeedResult> {
  const materials = await prisma.material.findMany({
    where: { name: { contains: CATEGORY_KEYWORDS.paspul, mode: "insensitive" } },
  });

  let created = 0;
  let skipped = 0;

  for (const material of materials) {
    try {
      await prisma.paspul.create({
        data: {
          name: material.name,
          code: material.code ?? null,
          materialId: material.id,
        },
      });
      created++;
    } catch (error: any) {
      // Skip if unique constraint violation (code already exists)
      if (error?.code === "P2002") {
        skipped++;
      } else {
        throw error;
      }
    }
  }

  return { created, skipped };
}

async function main() {
  console.log("🌱 Seeding category items from existing materials...\n");

  const nogiceResult = await seedNogice();
  const ruckeResult = await seedRucke();
  const paspulResult = await seedPaspul();

  console.log(`Nogice: ${nogiceResult.created} created, ${nogiceResult.skipped} skipped`);
  console.log(`Ručke: ${ruckeResult.created} created, ${ruckeResult.skipped} skipped`);
  console.log(`Paspul: ${paspulResult.created} created, ${paspulResult.skipped} skipped`);

  console.log("\n🎉 Gotovo!");
}

main()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
