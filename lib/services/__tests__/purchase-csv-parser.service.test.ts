/**
 * Unit tests for Purchase CSV Parser Service
 * 
 * Tests verify:
 * - CSV parsing with all 15 columns
 * - Quoted field handling with commas
 * - Header row skipping
 * - Required field validation
 * - Error reporting with row numbers
 */

import { describe, it, expect } from "vitest";
import { parsePurchaseCSV } from "../purchase-csv-parser.service";

describe("parsePurchaseCSV", () => {
  const validHeader = "VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %";

  it("should parse a valid CSV row with all fields", () => {
    const csv = `${validHeader}
6,0,01.01.26,"Demo Company d.o.o.",1,ADHESIVE 15/1 KG - LJEPILO ZA SPUŽVU,937,kg,23,51.2820,"1,179.4860",0.0000,51.2820,"1,179.4860",0`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    
    const row = result.rows[0];
    expect(row.documentType).toBe("6");
    expect(row.sequenceNumber).toBe("0");
    expect(row.date).toBeInstanceOf(Date);
    expect(row.date.getFullYear()).toBe(2026);
    expect(row.date.getMonth()).toBe(0); // January (0-indexed)
    expect(row.date.getDate()).toBe(1);
    expect(row.supplierName).toBe("Demo Company d.o.o.");
    expect(row.supplierCode).toBe("1");
    expect(row.materialName).toBe("ADHESIVE 15/1 KG - LJEPILO ZA SPUŽVU");
    expect(row.materialCode).toBe("937");
    expect(row.unit).toBe("kg");
    expect(row.quantity).toBe(23);
    expect(row.invoicePrice).toBeCloseTo(51.282, 3);
    expect(row.invoiceValue).toBeCloseTo(1179.486, 3);
    expect(row.totalCost).toBe(0);
    expect(row.purchasePrice).toBeCloseTo(51.282, 3);
    expect(row.purchaseValue).toBeCloseTo(1179.486, 3);
    expect(row.costPercentage).toBe(0);
  });

  it("should handle quoted fields with commas correctly", () => {
    const csv = `${validHeader}
6,0,01.01.26,"Supplier, Inc.",1,"Material, Type A",937,kg,23,51.28,"1,179.49",0.00,51.28,"1,179.49",5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].supplierName).toBe("Supplier, Inc.");
    expect(result.rows[0].materialName).toBe("Material, Type A");
  });

  it("should skip header row automatically", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5
6,0,02.01.26,Supplier2,2,Material2,938,kom,10,25.00,250.00,0.00,25.00,250.00,3.0`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].date).toBeInstanceOf(Date);
    expect(result.rows[0].date.getDate()).toBe(1);
    expect(result.rows[1].date).toBeInstanceOf(Date);
    expect(result.rows[1].date.getDate()).toBe(2);
  });

  it("should handle empty optional fields (supplierCode, materialCode)", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,,Material,,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].supplierCode).toBeNull();
    expect(result.rows[0].materialCode).toBeNull();
  });

  it("should return error for missing required field (materialName)", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Material name");
  });

  it("should return error for missing required field (supplierName)", () => {
    const csv = `${validHeader}
6,0,01.01.26,,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Supplier name");
  });

  it("should return error for missing required field (date)", () => {
    const csv = `${validHeader}
6,0,,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Date");
  });

  it("should return error for missing required field (unit)", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,937,,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Unit");
  });

  it("should return error for incorrect number of columns", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,937,kg,23`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Expected 15 columns");
  });

  it("should handle empty CSV file", () => {
    const csv = "";

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(0);
    expect(result.errors[0].message).toContain("empty");
  });

  it("should parse multiple valid rows", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier1,1,Material1,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5
6,0,02.01.26,Supplier2,2,Material2,938,kom,10,25.00,250.00,0.00,25.00,250.00,3.0
6,0,03.01.26,Supplier3,3,Material3,939,m,5,100.00,500.00,0.00,100.00,500.00,2.0`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].materialName).toBe("Material1");
    expect(result.rows[1].materialName).toBe("Material2");
    expect(result.rows[2].materialName).toBe("Material3");
  });

  it("should continue parsing after encountering an error", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier1,1,Material1,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5
6,0,02.01.26,,2,Material2,938,kom,10,25.00,250.00,0.00,25.00,250.00,3.0
6,0,03.01.26,Supplier3,3,Material3,939,m,5,100.00,500.00,0.00,100.00,500.00,2.0`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.rows[0].materialName).toBe("Material1");
    expect(result.rows[1].materialName).toBe("Material3");
  });

  it("should handle different line endings (CRLF and LF)", () => {
    const csvCRLF = `${validHeader}\r\n6,0,01.01.26,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;
    const csvLF = `${validHeader}\n6,0,01.01.26,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const resultCRLF = parsePurchaseCSV(csvCRLF);
    const resultLF = parsePurchaseCSV(csvLF);

    expect(resultCRLF.errors).toHaveLength(0);
    expect(resultCRLF.rows).toHaveLength(1);
    expect(resultLF.errors).toHaveLength(0);
    expect(resultLF.rows).toHaveLength(1);
  });

  it("should trim whitespace from fields", () => {
    const csv = `${validHeader}
6 , 0 , 01.01.26 , Supplier , 1 , Material , 937 , kg , 23 , 51.28 , 1179.49 , 0.00 , 51.28 , 1179.49 , 5.5 `;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].documentType).toBe("6");
    expect(result.rows[0].supplierName).toBe("Supplier");
    expect(result.rows[0].materialName).toBe("Material");
  });

  it("should parse dates in DD.MM.YY format with two-digit year conversion", () => {
    const csv = `${validHeader}
6,0,01.01.00,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5
6,0,15.06.26,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5
6,0,31.12.99,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
    
    // 01.01.00 → 2000-01-01
    expect(result.rows[0].date.getFullYear()).toBe(2000);
    expect(result.rows[0].date.getMonth()).toBe(0);
    expect(result.rows[0].date.getDate()).toBe(1);
    
    // 15.06.26 → 2026-06-15
    expect(result.rows[1].date.getFullYear()).toBe(2026);
    expect(result.rows[1].date.getMonth()).toBe(5);
    expect(result.rows[1].date.getDate()).toBe(15);
    
    // 31.12.99 → 2099-12-31
    expect(result.rows[2].date.getFullYear()).toBe(2099);
    expect(result.rows[2].date.getMonth()).toBe(11);
    expect(result.rows[2].date.getDate()).toBe(31);
  });

  it("should return error for invalid date format", () => {
    const csv = `${validHeader}
6,0,2026-01-01,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Invalid date format");
  });

  it("should return error for invalid date values", () => {
    const csv = `${validHeader}
6,0,31.02.26,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("should return error for non-numeric date parts", () => {
    const csv = `${validHeader}
6,0,01.XX.26,Supplier,1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("Invalid date format");
  });
});
