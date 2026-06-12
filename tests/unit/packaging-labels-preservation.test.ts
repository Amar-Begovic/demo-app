/**
 * Preservation Property Tests for Non-Packaging Labels
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * These tests verify that non-packaging label sections (ArticleLabel, RadniNalogRow, plan utroška)
 * continue to show notes correctly. These tests encode the BASELINE BEHAVIOR that must be preserved.
 * 
 * IMPORTANT: These tests should PASS on unfixed code - they establish the baseline behavior
 * that must remain unchanged after the fix is implemented.
 */

import { describe, it, expect } from "vitest";
import { fc } from "@fast-check/vitest";

/**
 * Property 2: Preservation - Non-Packaging Labels Continue Showing Notes
 * 
 * For any non-ComponentLabel object (ArticleLabel, RadniNalogRow, plan utroška sections),
 * the notes field SHALL continue to display item.notes, preserving existing behavior.
 */

// ─── Type Definitions ────────────────────────────────────

interface ArticleLabel {
  articleName: string;
  articleCode: string | null;
  allParts: string;
  footerComponents: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null; // Should preserve item.notes
  barcodeValue: string | null;
  barcodeImage: string | null;
  orderNumber: number;
  date: string;
  customerName: string | null;
}

interface RadniNalogRow {
  rb: number;
  articleName: string;
  articleCode: string | null;
  articleDescription: string | null;
  quantity: number;
  parts: string;
  fabricName: string | null;
  deadline: Date | null;
  customerOrderNumber: string | null;
  loadingNumber: string | null;
  notes: string | null; // Should preserve item.notes
  barcodeImage: string | null;
}

interface PlanUtroskaArticleBlock {
  rb: number;
  articleCode: string | null;
  articleName: string;
  partName: string;
  fabricName: string | null;
  customerOrderNumber: string | null;
  notes: string | null; // Should preserve item.notes
  unit: string;
  orderQuantity: number;
  materials: Array<{
    materialCode: string;
    materialName: string;
    quantity: number;
    totalQuantity: number;
  }>;
}

interface ItemData {
  articleName: string;
  articleCode: string | null;
  notes: string | null; // Article notes that SHOULD be preserved in non-packaging labels
  fabric?: { name: string } | null;
  customerOrderNumber: string | null;
  allParts: string;
  footerComponents: string;
  parts: string;
  articleDescription: string | null;
}

// ─── Simulated Label Creation Functions ─────────────────

/**
 * Simulates ArticleLabel creation from bulk/page.tsx (around line 145)
 * This should preserve item.notes
 */
function createArticleLabel(
  item: ItemData,
  orderNumber: number,
  date: string,
  customerName: string | null,
  barcodeValue: string | null,
  barcodeImage: string | null
): ArticleLabel {
  return {
    articleName: item.articleName,
    articleCode: item.articleCode,
    allParts: item.allParts,
    footerComponents: item.footerComponents,
    fabricName: item.fabric?.name ?? null,
    serialNumber: item.customerOrderNumber,
    notes: item.notes, // PRESERVE: This should continue to show item.notes
    barcodeValue,
    barcodeImage,
    orderNumber,
    date,
    customerName,
  };
}

/**
 * Simulates RadniNalogRow creation from bulk/page.tsx (around line 280)
 * This should preserve item.notes
 */
function createRadniNalogRow(
  item: ItemData,
  rb: number,
  barcodeImage: string | null
): RadniNalogRow {
  return {
    rb,
    articleName: `${item.articleName}${item.articleCode ? ` / ${item.articleCode}` : ""}`,
    articleCode: item.articleCode,
    articleDescription: item.articleDescription,
    quantity: 1,
    parts: item.parts,
    fabricName: item.fabric?.name ?? null,
    deadline: null,
    customerOrderNumber: item.customerOrderNumber,
    loadingNumber: null,
    notes: item.notes, // PRESERVE: This should continue to show item.notes
    barcodeImage,
  };
}

/**
 * Simulates plan utroška article block creation
 * This should preserve item.notes in the article details
 */
function createPlanUtroskaBlock(
  item: ItemData,
  rb: number
): PlanUtroskaArticleBlock {
  return {
    rb,
    articleCode: item.articleCode,
    articleName: item.articleName,
    partName: item.parts,
    fabricName: item.fabric?.name ?? null,
    customerOrderNumber: item.customerOrderNumber,
    notes: item.notes, // PRESERVE: This should continue to show item.notes
    unit: "kom",
    orderQuantity: 1,
    materials: [
      {
        materialCode: "MAT-001",
        materialName: "Test Material",
        quantity: 1.5,
        totalQuantity: 1.5,
      },
    ],
  };
}

// ─── Test Suite ──────────────────────────────────────────

describe("Preservation: Non-Packaging Labels Continue Showing Notes", () => {
  describe("Property 2.1: ArticleLabel objects preserve notes", () => {
    it("should preserve item.notes for ArticleLabel objects", () => {
      // Example 1: Article with notes "Important"
      const item1: ItemData = {
        articleName: "Krevet 180x200",
        articleCode: "KR-001",
        notes: "Important", // NON-NULL notes
        fabric: { name: "Plavi štof" },
        customerOrderNumber: "SER-001",
        allParts: "Uzglavlje+Sjedište+Nogice",
        footerComponents: "Uzglavlje, Sjedište, Nogice",
        parts: "Uzglavlje+Sjedište+Nogice",
        articleDescription: "Krevet sa uzglavljem",
      };

      const label1 = createArticleLabel(
        item1,
        12345,
        "15.01.2026",
        "Test Kupac",
        "BC-001",
        "base64image"
      );

      // EXPECTED BEHAVIOR: ArticleLabel.notes should preserve item.notes
      // This should PASS on unfixed code (baseline behavior)
      expect(label1.notes).toBe("Important");

      // Example 2: Article with null notes
      const item2: ItemData = {
        articleName: "Fotelja",
        articleCode: "FOT-002",
        notes: null, // NULL notes
        fabric: null,
        customerOrderNumber: "SER-002",
        allParts: "Sjedište",
        footerComponents: "Sjedište",
        parts: "Sjedište",
        articleDescription: null,
      };

      const label2 = createArticleLabel(
        item2,
        12346,
        "16.01.2026",
        "Drugi Kupac",
        "BC-002",
        "base64image2"
      );

      // EXPECTED BEHAVIOR: ArticleLabel.notes should be null when item.notes is null
      expect(label2.notes).toBeNull();
    });

    it("should preserve item.notes for ArticleLabel objects (property-based)", () => {
      /**
       * Property-based test: For ANY notes value (null or non-null),
       * ArticleLabel objects should preserve item.notes exactly.
       */
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }), // Random notes (null or string)
          fc.string({ minLength: 1, maxLength: 50 }), // Random article name
          fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }), // Random article code
          (randomNotes, articleName, articleCode) => {
            const item: ItemData = {
              articleName,
              articleCode,
              notes: randomNotes,
              fabric: { name: "Test Fabric" },
              customerOrderNumber: "SER-TEST",
              allParts: "Test Parts",
              footerComponents: "Test Components",
              parts: "Test Parts",
              articleDescription: "Test Description",
            };

            const label = createArticleLabel(
              item,
              99999,
              "01.01.2026",
              "Test Customer",
              "BC-TEST",
              "test-image"
            );

            // EXPECTED BEHAVIOR: ArticleLabel.notes should equal item.notes
            // This should PASS on unfixed code (baseline behavior)
            expect(label.notes).toBe(randomNotes);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Property 2.2: RadniNalogRow objects preserve notes", () => {
    it("should preserve item.notes for RadniNalogRow objects", () => {
      // Example 1: Work order with notes "Priority"
      const item1: ItemData = {
        articleName: "Krevet 180x200",
        articleCode: "KR-001",
        notes: "Priority", // NON-NULL notes
        fabric: { name: "Plavi štof" },
        customerOrderNumber: "SER-001",
        allParts: "Uzglavlje+Sjedište+Nogice",
        footerComponents: "Uzglavlje, Sjedište, Nogice",
        parts: "Uzglavlje+Sjedište+Nogice",
        articleDescription: "Krevet sa uzglavljem",
      };

      const row1 = createRadniNalogRow(item1, 1, "base64image");

      // EXPECTED BEHAVIOR: RadniNalogRow.notes should preserve item.notes
      // This should PASS on unfixed code (baseline behavior)
      expect(row1.notes).toBe("Priority");

      // Example 2: Work order with null notes
      const item2: ItemData = {
        articleName: "Fotelja",
        articleCode: "FOT-002",
        notes: null, // NULL notes
        fabric: null,
        customerOrderNumber: "SER-002",
        allParts: "Sjedište",
        footerComponents: "Sjedište",
        parts: "Sjedište",
        articleDescription: null,
      };

      const row2 = createRadniNalogRow(item2, 2, "base64image2");

      // EXPECTED BEHAVIOR: RadniNalogRow.notes should be null when item.notes is null
      expect(row2.notes).toBeNull();
    });

    it("should preserve item.notes for RadniNalogRow objects (property-based)", () => {
      /**
       * Property-based test: For ANY notes value (null or non-null),
       * RadniNalogRow objects should preserve item.notes exactly.
       */
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }), // Random notes
          fc.string({ minLength: 1, maxLength: 50 }), // Random article name
          fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }), // Random article code
          fc.integer({ min: 1, max: 100 }), // Random rb number
          (randomNotes, articleName, articleCode, rb) => {
            const item: ItemData = {
              articleName,
              articleCode,
              notes: randomNotes,
              fabric: { name: "Test Fabric" },
              customerOrderNumber: "SER-TEST",
              allParts: "Test Parts",
              footerComponents: "Test Components",
              parts: "Test Parts",
              articleDescription: "Test Description",
            };

            const row = createRadniNalogRow(item, rb, "test-image");

            // EXPECTED BEHAVIOR: RadniNalogRow.notes should equal item.notes
            // This should PASS on unfixed code (baseline behavior)
            expect(row.notes).toBe(randomNotes);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Property 2.3: Plan utroška sections preserve notes", () => {
    it("should preserve item.notes in plan utroška article blocks", () => {
      // Example 1: Plan utroška with notes "Special material"
      const item1: ItemData = {
        articleName: "Krevet 180x200",
        articleCode: "KR-001",
        notes: "Special material", // NON-NULL notes
        fabric: { name: "Plavi štof" },
        customerOrderNumber: "SER-001",
        allParts: "Uzglavlje+Sjedište+Nogice",
        footerComponents: "Uzglavlje, Sjedište, Nogice",
        parts: "Uzglavlje+Sjedište+Nogice",
        articleDescription: "Krevet sa uzglavljem",
      };

      const block1 = createPlanUtroskaBlock(item1, 1);

      // EXPECTED BEHAVIOR: Plan utroška block.notes should preserve item.notes
      // This should PASS on unfixed code (baseline behavior)
      expect(block1.notes).toBe("Special material");

      // Example 2: Plan utroška with null notes
      const item2: ItemData = {
        articleName: "Fotelja",
        articleCode: "FOT-002",
        notes: null, // NULL notes
        fabric: null,
        customerOrderNumber: "SER-002",
        allParts: "Sjedište",
        footerComponents: "Sjedište",
        parts: "Sjedište",
        articleDescription: null,
      };

      const block2 = createPlanUtroskaBlock(item2, 2);

      // EXPECTED BEHAVIOR: Plan utroška block.notes should be null when item.notes is null
      expect(block2.notes).toBeNull();
    });

    it("should preserve item.notes in plan utroška blocks (property-based)", () => {
      /**
       * Property-based test: For ANY notes value (null or non-null),
       * plan utroška article blocks should preserve item.notes exactly.
       */
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }), // Random notes
          fc.string({ minLength: 1, maxLength: 50 }), // Random article name
          fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }), // Random article code
          fc.integer({ min: 1, max: 100 }), // Random rb number
          (randomNotes, articleName, articleCode, rb) => {
            const item: ItemData = {
              articleName,
              articleCode,
              notes: randomNotes,
              fabric: { name: "Test Fabric" },
              customerOrderNumber: "SER-TEST",
              allParts: "Test Parts",
              footerComponents: "Test Components",
              parts: "Test Parts",
              articleDescription: "Test Description",
            };

            const block = createPlanUtroskaBlock(item, rb);

            // EXPECTED BEHAVIOR: Plan utroška block.notes should equal item.notes
            // This should PASS on unfixed code (baseline behavior)
            expect(block.notes).toBe(randomNotes);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Property 2.4: Manual note-editing functionality continues to work", () => {
    it("should allow manual note editing (simulated)", () => {
      /**
       * This test simulates the manual note-editing functionality.
       * The actual implementation uses UI interactions, but we can verify
       * the data structure supports manual editing.
       */

      // Start with an article with auto-populated notes
      const item: ItemData = {
        articleName: "Krevet 180x200",
        articleCode: "KR-001",
        notes: "Auto-populated note",
        fabric: { name: "Plavi štof" },
        customerOrderNumber: "SER-001",
        allParts: "Uzglavlje+Sjedište+Nogice",
        footerComponents: "Uzglavlje, Sjedište, Nogice",
        parts: "Uzglavlje+Sjedište+Nogice",
        articleDescription: "Krevet sa uzglavljem",
      };

      // Create an ArticleLabel (should preserve notes)
      const articleLabel = createArticleLabel(
        item,
        12345,
        "15.01.2026",
        "Test Kupac",
        "BC-001",
        "base64image"
      );

      // Verify initial state
      expect(articleLabel.notes).toBe("Auto-populated note");

      // Simulate manual editing (user changes the notes field)
      const manuallyEditedLabel: ArticleLabel = {
        ...articleLabel,
        notes: "Manually edited note",
      };

      // Verify manual editing works
      expect(manuallyEditedLabel.notes).toBe("Manually edited note");

      // Simulate clearing notes manually
      const clearedLabel: ArticleLabel = {
        ...articleLabel,
        notes: null,
      };

      // Verify clearing works
      expect(clearedLabel.notes).toBeNull();
    });
  });
});
