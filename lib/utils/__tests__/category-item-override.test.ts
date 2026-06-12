import { describe, expect, it } from "vitest";
import {
  detectPlaceholder,
  applyCategoryItemOverrides,
  type NormativeMaterial,
  type CategorySelections,
  type CategoryItemSelection,
} from "@/lib/utils/category-item-override";

// ─── Helpers ─────────────────────────────────────────────

function makeMaterial(overrides: Partial<NormativeMaterial> = {}): NormativeMaterial {
  return {
    materialId: "mat-placeholder-id",
    materialName: "Some Material",
    materialCode: "MAT-001",
    quantity: 2.5,
    pieces: null,
    unit: "m",
    price: null,
    length: null,
    width: null,
    height: null,
    isEdgebanded: null,
    ...overrides,
  };
}

function makeSelection(overrides: Partial<CategoryItemSelection> = {}): CategoryItemSelection {
  return {
    id: "sel-1",
    name: "Test Item",
    materialId: "linked-mat-id",
    materialName: "Linked Material",
    materialCode: "LM-001",
    materialUnit: "kom",
    ...overrides,
  };
}

function makeSelections(overrides: Partial<CategorySelections> = {}): CategorySelections {
  return {
    paspul: null,
    rucka: null,
    nogice1: null,
    nogice2: null,
    ...overrides,
  };
}

// ─── detectPlaceholder ───────────────────────────────────

describe("detectPlaceholder", () => {
  it("detects 'Paspul za sve' as paspul", () => {
    expect(detectPlaceholder("Paspul za sve")).toBe("paspul");
  });

  it("detects 'paspul za sve' (lowercase) as paspul", () => {
    expect(detectPlaceholder("paspul za sve")).toBe("paspul");
  });

  it("detects 'PASPUL ZA SVE' (uppercase) as paspul", () => {
    expect(detectPlaceholder("PASPUL ZA SVE")).toBe("paspul");
  });

  it("detects 'Traka za sve' as paspul (equivalent)", () => {
    expect(detectPlaceholder("Traka za sve")).toBe("paspul");
  });

  it("detects 'Ručka za sve' as rucka", () => {
    expect(detectPlaceholder("Ručka za sve")).toBe("rucka");
  });

  it("detects 'ručka za sve' (lowercase) as rucka", () => {
    expect(detectPlaceholder("ručka za sve")).toBe("rucka");
  });

  it("detects 'Nogice za sve' as nogice", () => {
    expect(detectPlaceholder("Nogice za sve")).toBe("nogice");
  });

  it("handles leading/trailing whitespace", () => {
    expect(detectPlaceholder("  Paspul za sve  ")).toBe("paspul");
    expect(detectPlaceholder("\tRučka za sve\n")).toBe("rucka");
  });

  it("returns null for non-placeholder names", () => {
    expect(detectPlaceholder("Regular Material")).toBeNull();
    expect(detectPlaceholder("Paspul")).toBeNull();
    expect(detectPlaceholder("za sve")).toBeNull();
    expect(detectPlaceholder("")).toBeNull();
  });

  it("returns null for partial matches", () => {
    expect(detectPlaceholder("Paspul za sve extra")).toBeNull();
    expect(detectPlaceholder("prefix Paspul za sve")).toBeNull();
  });
});

// ─── applyCategoryItemOverrides ──────────────────────────

describe("applyCategoryItemOverrides", () => {
  describe("non-placeholder materials", () => {
    it("passes through non-placeholder materials unchanged", () => {
      const materials = [makeMaterial({ materialName: "Regular Material" })];
      const selections = makeSelections();

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].materialName).toBe("Regular Material");
      expect(result.materials[0].isOverridden).toBe(false);
      expect(result.materials[0].originalMaterialName).toBeNull();
      expect(result.consumedCategories.size).toBe(0);
    });
  });

  describe("paspul override", () => {
    it("replaces paspul placeholder with linked material", () => {
      const materials = [makeMaterial({ materialName: "Paspul za sve", quantity: 3 })];
      const selections = makeSelections({
        paspul: makeSelection({
          materialId: "paspul-mat-id",
          materialName: "Blue Paspul",
          materialCode: "BP-01",
          materialUnit: "m",
        }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].materialId).toBe("paspul-mat-id");
      expect(result.materials[0].materialName).toBe("Blue Paspul");
      expect(result.materials[0].materialCode).toBe("BP-01");
      expect(result.materials[0].unit).toBe("m");
      expect(result.materials[0].quantity).toBe(3); // preserved
      expect(result.materials[0].isOverridden).toBe(true);
      expect(result.materials[0].originalMaterialName).toBe("Paspul za sve");
      expect(result.consumedCategories.has("paspul")).toBe(true);
    });

    it("treats 'Traka za sve' same as 'Paspul za sve'", () => {
      const materials = [makeMaterial({ materialName: "Traka za sve", quantity: 1.5 })];
      const selections = makeSelections({
        paspul: makeSelection({ materialId: "paspul-mat-id", materialName: "Red Traka" }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials[0].materialId).toBe("paspul-mat-id");
      expect(result.materials[0].materialName).toBe("Red Traka");
      expect(result.materials[0].quantity).toBe(1.5);
      expect(result.materials[0].isOverridden).toBe(true);
      expect(result.consumedCategories.has("paspul")).toBe(true);
    });

    it("retains placeholder when paspul selection is null", () => {
      const materials = [makeMaterial({ materialName: "Paspul za sve" })];
      const selections = makeSelections({ paspul: null });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials[0].materialName).toBe("Paspul za sve");
      expect(result.materials[0].isOverridden).toBe(false);
      expect(result.consumedCategories.size).toBe(0);
    });

    it("retains placeholder when paspul has no linked material", () => {
      const materials = [makeMaterial({ materialName: "Paspul za sve" })];
      const selections = makeSelections({
        paspul: makeSelection({ materialId: null, materialName: null }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials[0].materialName).toBe("Paspul za sve");
      expect(result.materials[0].isOverridden).toBe(false);
      expect(result.consumedCategories.size).toBe(0);
    });
  });

  describe("rucka override", () => {
    it("replaces ručka placeholder with linked material", () => {
      const materials = [makeMaterial({ materialName: "Ručka za sve", quantity: 4 })];
      const selections = makeSelections({
        rucka: makeSelection({
          materialId: "rucka-mat-id",
          materialName: "Chrome Handle",
          materialCode: "CH-01",
          materialUnit: "kom",
        }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials[0].materialId).toBe("rucka-mat-id");
      expect(result.materials[0].materialName).toBe("Chrome Handle");
      expect(result.materials[0].quantity).toBe(4);
      expect(result.materials[0].isOverridden).toBe(true);
      expect(result.materials[0].originalMaterialName).toBe("Ručka za sve");
      expect(result.consumedCategories.has("rucka")).toBe(true);
    });

    it("retains placeholder when rucka selection is null", () => {
      const materials = [makeMaterial({ materialName: "Ručka za sve" })];
      const selections = makeSelections({ rucka: null });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials[0].materialName).toBe("Ručka za sve");
      expect(result.materials[0].isOverridden).toBe(false);
    });
  });

  describe("nogice override", () => {
    it("produces 2 rows when both nogice1 and nogice2 are selected", () => {
      const materials = [makeMaterial({ materialName: "Nogice za sve", quantity: 2 })];
      const selections = makeSelections({
        nogice1: makeSelection({ materialId: "nog1-id", materialName: "Leg Type A" }),
        nogice2: makeSelection({ materialId: "nog2-id", materialName: "Leg Type B" }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(2);
      expect(result.materials[0].materialId).toBe("nog1-id");
      expect(result.materials[0].materialName).toBe("Leg Type A");
      expect(result.materials[0].quantity).toBe(2);
      expect(result.materials[0].isOverridden).toBe(true);
      expect(result.materials[0].originalMaterialName).toBe("Nogice za sve");
      expect(result.materials[1].materialId).toBe("nog2-id");
      expect(result.materials[1].materialName).toBe("Leg Type B");
      expect(result.materials[1].quantity).toBe(2);
      expect(result.materials[1].isOverridden).toBe(true);
      expect(result.consumedCategories.has("nogice")).toBe(true);
    });

    it("produces 1 row when only nogice1 is selected", () => {
      const materials = [makeMaterial({ materialName: "Nogice za sve", quantity: 5 })];
      const selections = makeSelections({
        nogice1: makeSelection({ materialId: "nog1-id", materialName: "Leg A" }),
        nogice2: null,
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].materialId).toBe("nog1-id");
      expect(result.materials[0].quantity).toBe(5);
      expect(result.consumedCategories.has("nogice")).toBe(true);
    });

    it("produces 1 row when only nogice2 is selected", () => {
      const materials = [makeMaterial({ materialName: "Nogice za sve", quantity: 3 })];
      const selections = makeSelections({
        nogice1: null,
        nogice2: makeSelection({ materialId: "nog2-id", materialName: "Leg B" }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].materialId).toBe("nog2-id");
      expect(result.materials[0].materialName).toBe("Leg B");
      expect(result.materials[0].quantity).toBe(3);
      expect(result.consumedCategories.has("nogice")).toBe(true);
    });

    it("retains placeholder when neither nogice is selected", () => {
      const materials = [makeMaterial({ materialName: "Nogice za sve" })];
      const selections = makeSelections({ nogice1: null, nogice2: null });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].materialName).toBe("Nogice za sve");
      expect(result.materials[0].isOverridden).toBe(false);
      expect(result.consumedCategories.size).toBe(0);
    });

    it("retains placeholder when nogice selections have no linked material", () => {
      const materials = [makeMaterial({ materialName: "Nogice za sve" })];
      const selections = makeSelections({
        nogice1: makeSelection({ materialId: null }),
        nogice2: makeSelection({ materialId: null }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].materialName).toBe("Nogice za sve");
      expect(result.materials[0].isOverridden).toBe(false);
      expect(result.consumedCategories.size).toBe(0);
    });

    it("produces 1 row when nogice1 has linked material but nogice2 does not", () => {
      const materials = [makeMaterial({ materialName: "Nogice za sve", quantity: 2 })];
      const selections = makeSelections({
        nogice1: makeSelection({ materialId: "nog1-id", materialName: "Leg A" }),
        nogice2: makeSelection({ materialId: null }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].materialId).toBe("nog1-id");
      expect(result.materials[0].quantity).toBe(2);
      expect(result.consumedCategories.has("nogice")).toBe(true);
    });
  });

  describe("mixed materials", () => {
    it("handles a mix of placeholders and regular materials", () => {
      const materials = [
        makeMaterial({ materialName: "Wood Panel", materialId: "wood-1" }),
        makeMaterial({ materialName: "Paspul za sve", materialId: "placeholder-p" }),
        makeMaterial({ materialName: "Screw", materialId: "screw-1" }),
        makeMaterial({ materialName: "Ručka za sve", materialId: "placeholder-r" }),
      ];
      const selections = makeSelections({
        paspul: makeSelection({ materialId: "real-paspul", materialName: "Real Paspul" }),
        rucka: makeSelection({ materialId: "real-rucka", materialName: "Real Ručka" }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials).toHaveLength(4);
      // Wood Panel — unchanged
      expect(result.materials[0].materialId).toBe("wood-1");
      expect(result.materials[0].isOverridden).toBe(false);
      // Paspul — overridden
      expect(result.materials[1].materialId).toBe("real-paspul");
      expect(result.materials[1].isOverridden).toBe(true);
      // Screw — unchanged
      expect(result.materials[2].materialId).toBe("screw-1");
      expect(result.materials[2].isOverridden).toBe(false);
      // Ručka — overridden
      expect(result.materials[3].materialId).toBe("real-rucka");
      expect(result.materials[3].isOverridden).toBe(true);

      expect(result.consumedCategories.has("paspul")).toBe(true);
      expect(result.consumedCategories.has("rucka")).toBe(true);
    });

    it("preserves all original fields (pieces, price, dimensions) on override", () => {
      const materials = [
        makeMaterial({
          materialName: "Paspul za sve",
          quantity: 7,
          pieces: 3,
          price: 12.5,
          length: 100,
          width: 50,
          height: 10,
          isEdgebanded: true,
        }),
      ];
      const selections = makeSelections({
        paspul: makeSelection({ materialId: "p-id", materialName: "P", materialUnit: "m" }),
      });

      const result = applyCategoryItemOverrides(materials, selections);

      expect(result.materials[0].quantity).toBe(7);
      expect(result.materials[0].pieces).toBe(3);
      expect(result.materials[0].price).toBe(12.5);
      expect(result.materials[0].length).toBe(100);
      expect(result.materials[0].width).toBe(50);
      expect(result.materials[0].height).toBe(10);
      expect(result.materials[0].isEdgebanded).toBe(true);
    });
  });

  describe("empty inputs", () => {
    it("returns empty materials for empty input", () => {
      const result = applyCategoryItemOverrides([], makeSelections());

      expect(result.materials).toHaveLength(0);
      expect(result.consumedCategories.size).toBe(0);
    });
  });
});
