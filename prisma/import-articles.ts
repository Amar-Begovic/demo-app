import { PrismaClient } from "../app/generated/prisma";
import * as fs from "fs";

const prisma = new PrismaClient();

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

async function importArticles() {
  console.log("📦 Uvozim artikle...\n");

  const csvContent = fs.readFileSync("prikaz - inventura artikala 2.3.26.csv", "utf-8");
  const lines = csvContent.split("\n");

  const articles: { code: string; name: string }[] = [];

  for (const line of lines) {
    const cols = parseCsvLine(line);
    
    // Skip header and empty lines
    if (cols.length < 5) continue;
    const code = cols[3]?.trim();
    const name = cols[4]?.trim();

    // Skip if no code or name, or if it's header
    if (!code || !name || code === "Sifra") continue;
    
    // Skip items with "?" in name (encoding issues)
    if (name.includes("?")) continue;

    articles.push({ code, name });
  }

  console.log(`📋 Pronađeno ${articles.length} artikala\n`);

  // Import articles
  let count = 0;
  let skipped = 0;
  for (const art of articles) {
    try {
      await prisma.article.create({
        data: {
          code: art.code,
          name: art.name,
          unit: "kom",
        },
      });
      count++;
    } catch (e: any) {
      if (e.code === "P2002") {
        skipped++;
      } else {
        console.error(`❌ Greška za artikal ${art.name}:`, e.message);
      }
    }
  }

  console.log(`\n✅ Uvezeno: ${count} artikala`);
  if (skipped > 0) {
    console.log(`⚠️  Preskočeno (već postoje): ${skipped}`);
  }
}

importArticles()
  .catch((e) => {
    console.error("❌ Greška:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
