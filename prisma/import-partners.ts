import { PrismaClient } from "../app/generated/prisma";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  const csvPath = path.join(__dirname, "..", "prikaz - partneri po mjestima DEMO-PARTNERS.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  // Skip header lines (first 5 lines are company info + header row)
  // Find the header line with SIFRA,NAZIV,ADRESA,MJESTO,ID
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("SIFRA,")) {
      startIdx = i + 1;
      break;
    }
  }

  let imported = 0;
  let skipped = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Parse CSV with quoted fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const [sifra, naziv, adresa, mjesto, jib] = fields;

    if (!naziv) {
      skipped++;
      continue;
    }

    // Clean up multiline names (some have newlines encoded)
    const cleanName = naziv.replace(/\n/g, " ").trim();
    if (!cleanName) {
      skipped++;
      continue;
    }

    // Skip the company itself
    if (cleanName.includes("Demo Company") || cleanName.includes("DEMO COMPANY")) {
      skipped++;
      continue;
    }

    const code = sifra || null;
    const vatNumber = jib && jib !== "0000000000" && jib !== "00000000000" && jib !== "000000000000" && jib !== "0000000000000" && jib !== "00000000" && jib !== "000000000" && jib !== "0000000" ? jib : null;

    // Determine country from city/address
    const turkishCities = ["ISTANBUL", "KAYSERI", "BURSA"];
    const isTurkish = turkishCities.some((c) => (mjesto ?? "").toUpperCase().includes(c) || (adresa ?? "").toUpperCase().includes(c));
    const isSerbian = (mjesto ?? "").toUpperCase().includes("NOVI SAD");
    const isGerman = (mjesto ?? "").toUpperCase().includes("MUNCHEN");
    const isFrench = (adresa ?? "").toUpperCase().includes("FRANCUSKA");
    const isCroatian = (mjesto ?? "").toUpperCase().includes("IVANKOVO");

    let country = "Bosna i Hercegovina";
    if (isTurkish) country = "Turska";
    else if (isSerbian) country = "Srbija";
    else if (isGerman) country = "Njemačka";
    else if (isFrench) country = "Francuska";
    else if (isCroatian) country = "Hrvatska";

    try {
      // Check if already exists by code or name
      const existing = code
        ? await prisma.supplier.findFirst({ where: { OR: [{ code }, { companyName: cleanName }] } })
        : await prisma.supplier.findFirst({ where: { companyName: cleanName } });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.supplier.create({
        data: {
          companyName: cleanName,
          code: code,
          address: adresa || null,
          city: mjesto || null,
          vatNumber: vatNumber,
          country,
          partnerType: "oba",
        },
      });
      imported++;
    } catch (err) {
      console.error(`Error importing "${cleanName}":`, err);
      skipped++;
    }
  }

  console.log(`Imported: ${imported}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
