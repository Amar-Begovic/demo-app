import { PrismaClient } from "../app/generated/prisma";
import * as fs from "fs";

const prisma = new PrismaClient();

function parseQuantity(value: string): number {
  if (!value || value.trim() === "") return 0;
  // Remove quotes and trim
  let cleaned = value.replace(/"/g, "").trim();
  // Handle format like "4,722.00" -> remove comma (thousand separator), keep dot (decimal)
  // But also handle "-1,301.08" 
  cleaned = cleaned.replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function importInventory() {
  console.log("📦 Uvozim inventuru...\n");

  const csvContent = fs.readFileSync("prikaz - inventura MATERIJALI 2.3.26.csv", "utf-8");
  const lines = csvContent.split("\n");

  const materials: { code: string; name: string; unit: string; quantity: number }[] = [];
  const fabrics: { code: string; name: string }[] = [];

  for (const line of lines) {
    const cols = parseCsvLine(line);
    
    // Skip header and empty lines
    if (cols.length < 7) continue;
    const code = cols[3]?.trim();
    const name = cols[4]?.trim();
    const unit = cols[5]?.trim();
    const quantity = cols[6];

    // Skip if no code or name
    if (!code || !name || code === "Sifra") continue;

    // Check if it's a fabric (Štof)
    if (name.startsWith("Štof ")) {
      fabrics.push({
        code,
        name: name.replace("Štof ", ""), // Remove "Štof " prefix for cleaner name
      });
    } else {
      materials.push({
        code,
        name,
        unit: unit || "kom",
        quantity: parseQuantity(quantity),
      });
    }
  }

  console.log(`📋 Pronađeno ${materials.length} materijala i ${fabrics.length} štofova\n`);

  // Import materials
  let materialCount = 0;
  for (const mat of materials) {
    try {
      await prisma.material.create({
        data: {
          code: mat.code,
          name: mat.name,
          unit: mat.unit,
          currentQuantity: mat.quantity,
        },
      });
      materialCount++;
    } catch (e: any) {
      if (e.code === "P2002") {
        console.log(`⚠️  Materijal već postoji: ${mat.code} - ${mat.name}`);
      } else {
        console.error(`❌ Greška za materijal ${mat.name}:`, e.message);
      }
    }
  }

  // Import fabrics
  let fabricCount = 0;
  for (const fab of fabrics) {
    try {
      await prisma.fabric.create({
        data: {
          code: fab.code,
          name: fab.name,
        },
      });
      fabricCount++;
    } catch (e: any) {
      if (e.code === "P2002") {
        console.log(`⚠️  Štof već postoji: ${fab.code} - ${fab.name}`);
      } else {
        console.error(`❌ Greška za štof ${fab.name}:`, e.message);
      }
    }
  }

  console.log(`\n✅ Uvezeno:`);
  console.log(`   Materijali: ${materialCount}`);
  console.log(`   Štofovi: ${fabricCount}`);
}

importInventory()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
