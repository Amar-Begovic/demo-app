/**
 * Edge case tests for Purchase CSV Parser based on real data patterns
 */

import { describe, it, expect } from "vitest";
import { parsePurchaseCSV } from "../purchase-csv-parser.service";

describe("parsePurchaseCSV - Edge cases from real data", () => {
  const validHeader = "VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %";

  it("should handle negative quantities", () => {
    const csv = `${validHeader}
6,0,01.01.26,"Demo Company d.o.o.",1,Bukova daska 25 mm L,11,m3,-0.0041225,442.9000,-1.8259,0.0000,442.9000,-1.8259,`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].quantity).toBeCloseTo(-0.0041225, 7);
    expect(result.rows[0].invoiceValue).toBeCloseTo(-1.8259, 4);
  });

  it("should handle numbers with comma as decimal separator", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,937,kg,23,51.2820,"1,179.4860",0.0000,51.2820,"1,179.4860",`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].invoiceValue).toBeCloseTo(1179.486, 3);
    expect(result.rows[0].purchaseValue).toBeCloseTo(1179.486, 3);
  });

  it("should handle numbers with dot as thousand separator", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,937,kg,23,51.2820,"1.179,4860",0.0000,51.2820,"1.179,4860",`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].invoiceValue).toBeCloseTo(1179.486, 3);
  });

  it("should handle empty cost percentage field", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,937,kg,23,51.2820,"1,179.4860",0.0000,51.2820,"1,179.4860",`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].costPercentage).toBe(0);
  });

  it("should handle material names with special characters", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,"Iver vijak 5,0x30 cink T",328,kom,1000,0.0103,10.3000,0.0000,0.0103,10.3000,`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].materialName).toBe("Iver vijak 5,0x30 cink T");
  });

  it("should handle supplier names with commas and special characters", () => {
    const csv = `${validHeader}
6,0,01.01.26,"Demo Company d.o.o.",1,Material,937,kg,23,51.28,1179.49,0.00,51.28,1179.49,5.5`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].supplierName).toBe("Demo Company d.o.o.");
  });

  it("should handle very small decimal quantities", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,809,m3,0.002099999997,2.2801,0.0048,0.0000,2.2801,0.0048,`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].quantity).toBeCloseTo(0.002099999997, 12);
  });

  it("should handle zero values", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,56,kg,0,6.6515,0.0000,0.0000,6.6515,0.0000,`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].quantity).toBe(0);
    expect(result.rows[0].invoiceValue).toBe(0);
  });

  it("should handle material names with parentheses and slashes", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,"Folija (3800x0,08) RE NP",85,kg,210,3.0900,567.0000,0.0000,3.0900,567.0000,`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].materialName).toBe("Folija (3800x0,08) RE NP");
  });

  it("should handle large quantities", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,386,kom,10000,0.0618,617.8155,0.0000,0.0618,617.8155,`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].quantity).toBe(10000);
  });

  it("should handle decimal quantities with many decimal places", () => {
    const csv = `${validHeader}
6,0,01.01.26,Supplier,1,Material,897,m2,999.995,5.2210,"5,220.9830",0.0000,5.2210,"5,220.9830",`;

    const result = parsePurchaseCSV(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].quantity).toBeCloseTo(999.995, 3);
  });
});
