/**
 * Integration test for Purchase CSV Parser with real sample file
 */

import { describe, it, expect } from "vitest";
import { parsePurchaseCSV } from "../purchase-csv-parser.service";
import fs from "fs";
import path from "path";

describe("parsePurchaseCSV - Integration with sample file", () => {
  it("should parse the real sample CSV file", () => {
    const samplePath = path.join(
      process.cwd(),
      "imports",
      "KALKULACIJE ULAZI ZA PERIOD 1.1.2026-10.4.2026 IZ NEMANJINOG PROGRAMA ANALITIKA.xlsx - expdata (1).csv"
    );

    const csvContent = fs.readFileSync(samplePath, "utf-8");
    const result = parsePurchaseCSV(csvContent);

    // Should have parsed rows
    expect(result.rows.length).toBeGreaterThan(0);
    console.log(`Parsed ${result.rows.length} rows`);
    console.log(`Errors: ${result.errors.length}`);

    // Check first row structure
    const firstRow = result.rows[0];
    expect(firstRow).toBeDefined();
    expect(firstRow.documentType).toBe("6");
    expect(firstRow.date).toBeInstanceOf(Date);
    expect(firstRow.date.getFullYear()).toBe(2026);
    expect(firstRow.date.getMonth()).toBe(0); // January
    expect(firstRow.date.getDate()).toBe(1);
    expect(firstRow.supplierName).toBe("Demo Company d.o.o.");
    expect(firstRow.supplierCode).toBe("1");
    expect(firstRow.materialName).toBe("ADHESIVE 15/1 KG - LJEPILO ZA SPUŽVU");
    expect(firstRow.materialCode).toBe("937");
    expect(firstRow.unit).toBe("kg");
    expect(firstRow.quantity).toBe(23);

    // Log any errors for debugging
    if (result.errors.length > 0) {
      console.log("Errors found:");
      result.errors.forEach((error) => {
        console.log(`  Row ${error.row}: ${error.message}`);
      });
    }

    // Sample a few more rows to verify parsing
    if (result.rows.length > 5) {
      const row5 = result.rows[4];
      expect(row5.materialName).toBeDefined();
      expect(row5.supplierName).toBeDefined();
      expect(row5.date).toBeDefined();
    }
  });
});
