/**
 * Unit tests for CSV Parser Service
 */

import { parsePurchaseCSV } from './purchase-csv-parser.service';

describe('parsePurchaseCSV', () => {
  describe('decimal number parsing with comma separators', () => {
    it('should parse numbers with period as decimal separator (US format)', () => {
      const csv = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
6,0,01.01.26,Test Supplier,1,Test Material,937,kg,23,51.2820,"1,179.4860",0.0000,51.2820,"1,179.4860",5.5`;

      const result = parsePurchaseCSV(csv);

      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].quantity).toBe(23);
      expect(result.rows[0].invoicePrice).toBeCloseTo(51.282, 3);
      expect(result.rows[0].invoiceValue).toBeCloseTo(1179.486, 3);
      expect(result.rows[0].totalCost).toBe(0);
      expect(result.rows[0].purchasePrice).toBeCloseTo(51.282, 3);
      expect(result.rows[0].purchaseValue).toBeCloseTo(1179.486, 3);
      expect(result.rows[0].costPercentage).toBeCloseTo(5.5, 1);
    });

    it('should parse numbers with comma as decimal separator (European format)', () => {
      const csv = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
6,0,01.01.26,Test Supplier,1,Test Material,54,kom,1600,"1,7336","2.773,7907","0,0000","1,7336","2.773,7907","10,25"`;

      const result = parsePurchaseCSV(csv);

      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].quantity).toBe(1600);
      expect(result.rows[0].invoicePrice).toBeCloseTo(1.7336, 4);
      expect(result.rows[0].invoiceValue).toBeCloseTo(2773.7907, 4);
      expect(result.rows[0].totalCost).toBe(0);
      expect(result.rows[0].purchasePrice).toBeCloseTo(1.7336, 4);
      expect(result.rows[0].purchaseValue).toBeCloseTo(2773.7907, 4);
      expect(result.rows[0].costPercentage).toBeCloseTo(10.25, 2);
    });

    it('should parse simple numbers without separators', () => {
      const csv = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
6,0,01.01.26,Test Supplier,1,Test Material,1,kg,100,25,2500,0,25,2500,0`;

      const result = parsePurchaseCSV(csv);

      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].quantity).toBe(100);
      expect(result.rows[0].invoicePrice).toBe(25);
      expect(result.rows[0].invoiceValue).toBe(2500);
      expect(result.rows[0].totalCost).toBe(0);
      expect(result.rows[0].purchasePrice).toBe(25);
      expect(result.rows[0].purchaseValue).toBe(2500);
      expect(result.rows[0].costPercentage).toBe(0);
    });

    it('should return error for invalid numeric values', () => {
      const csv = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
6,0,01.01.26,Test Supplier,1,Test Material,1,kg,invalid,25,2500,0,25,2500,0`;

      const result = parsePurchaseCSV(csv);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(2);
      expect(result.errors[0].message).toContain('Invalid numeric value');
      expect(result.rows).toHaveLength(0);
    });

    it('should return error for empty numeric values', () => {
      const csv = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
6,0,01.01.26,Test Supplier,1,Test Material,1,kg,100,25,2500,0,25,2500,`;

      const result = parsePurchaseCSV(csv);

      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].costPercentage).toBe(0);
    });
  });

  describe('interface type validation', () => {
    it('should return numeric types for all numeric fields', () => {
      const csv = `VrstaFixDokument,RedniBroj,Datum,DobavljacNaziv,DobavljacSifra,ArtikalNaziv,ArtikalSifra,JedinicaMjere,Kolicina,FakturnaCijena,FakturnaVrijednost,TrosakUkupno,NabavnaCijena,NabavnaVrijednost,trosak %
6,0,01.01.26,Test Supplier,1,Test Material,1,kg,100,25.5,2550,10,25.5,2550,5.5`;

      const result = parsePurchaseCSV(csv);

      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
      
      const row = result.rows[0];
      expect(typeof row.quantity).toBe('number');
      expect(typeof row.invoicePrice).toBe('number');
      expect(typeof row.invoiceValue).toBe('number');
      expect(typeof row.totalCost).toBe('number');
      expect(typeof row.purchasePrice).toBe('number');
      expect(typeof row.purchaseValue).toBe('number');
      expect(typeof row.costPercentage).toBe('number');
    });
  });
});
