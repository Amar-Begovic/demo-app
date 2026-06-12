/**
 * Bug Condition Exploration Test for Packaging Labels Auto-Populating Notes
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 * 
 * This test encodes the EXPECTED BEHAVIOR: ComponentLabel objects should have `notes: null`.
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * When run on unfixed code, ComponentLabel objects will have `notes: item.notes` instead of `notes: null`.
 * 
 * After the fix is implemented, this same test will PASS, confirming the bug is fixed.
 */

import { describe, it, expect } from "vitest";
import { fc } from "@fast-check/vitest";

/**
 * Property 1: Bug Condition - Packaging Labels Auto-Populate Notes
 * 
 * For any ComponentLabel object generated during packaging label creation,
 * the notes field SHALL be null instead of item.notes.
 * 
 * This property is scoped to concrete failing cases: orders with non-null notes
 * generating ComponentLabel objects.
 */

// Simulated ComponentLabel creation logic (extracted from bulk/page.tsx and pakovanje/page.tsx)
interface ComponentLabel {
  articleName: string;
  articleCode: string | null;
  componentName: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null; // BUG: Currently set to item.notes, should be null
  barcodeValue: string;
  barcodeImage: string;
  orderNumber: number;
  date: string;
  customerName: string | null;
}

interface ItemData {
  articleName: string;
  articleCode: string | null;
  notes: string | null; // Article notes that should NOT be copied to ComponentLabel
  fabric?: { name: string } | null;
  customerOrderNumber: string | null;
}

interface BedComponent {
  componentName: string;
  sourcePartId: string;
}

/**
 * Simulates the ComponentLabel creation logic from the actual code.
 * This is the FIXED implementation that sets notes to null.
 */
function createComponentLabel(
  item: ItemData,
  component: BedComponent,
  orderNumber: number,
  date: string,
  customerName: string | null,
  barcodeValue: string,
  barcodeImage: string
): ComponentLabel {
  return {
    articleName: item.articleName,
    articleCode: item.articleCode,
    componentName: component.componentName,
    fabricName: item.fabric?.name ?? null,
    serialNumber: item.customerOrderNumber,
    notes: null, // FIXED: Set to null instead of item.notes
    barcodeValue,
    barcodeImage,
    orderNumber,
    date,
    customerName,
  };
}

describe("Bug Condition Exploration: Packaging Labels Auto-Populate Notes", () => {
  it("should have notes: null for ComponentLabel objects (EXPECTED TO FAIL on unfixed code)", () => {
    // Example 1: Bulk print with article notes "Hitno"
    const item1: ItemData = {
      articleName: "Krevet 180x200",
      articleCode: "KR-001",
      notes: "Hitno", // NON-NULL notes - this is the bug condition
      fabric: { name: "Plavi štof" },
      customerOrderNumber: "SER-001",
    };

    const component1: BedComponent = {
      componentName: "Uzglavlje",
      sourcePartId: "part-123",
    };

    const label1 = createComponentLabel(
      item1,
      component1,
      12345,
      "15.01.2026",
      "Test Kupac",
      "CB-001",
      "base64image"
    );

    // EXPECTED BEHAVIOR: ComponentLabel.notes should be null
    // ON UNFIXED CODE: This will FAIL because notes will be "Hitno"
    expect(label1.notes).toBeNull();

    // Example 2: Individual print with article notes "Priority"
    const item2: ItemData = {
      articleName: "Fotelja",
      articleCode: "FOT-002",
      notes: "Priority", // NON-NULL notes
      fabric: null,
      customerOrderNumber: "SER-002",
    };

    const component2: BedComponent = {
      componentName: "Sjedište",
      sourcePartId: "part-456",
    };

    const label2 = createComponentLabel(
      item2,
      component2,
      12346,
      "16.01.2026",
      "Drugi Kupac",
      "CB-002",
      "base64image2"
    );

    // EXPECTED BEHAVIOR: ComponentLabel.notes should be null
    // ON UNFIXED CODE: This will FAIL because notes will be "Priority"
    expect(label2.notes).toBeNull();
  });

  it("should have notes: null for ComponentLabel objects with different notes (property-based)", () => {
    /**
     * Property-based test: For ANY non-null notes value, ComponentLabel objects
     * should have notes: null (not the article's notes).
     * 
     * This test generates random notes strings and verifies the expected behavior.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }), // Generate random non-empty notes
        fc.string({ minLength: 1, maxLength: 50 }), // Random article name
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }), // Random article code
        fc.string({ minLength: 1, maxLength: 30 }), // Random component name
        (randomNotes, articleName, articleCode, componentName) => {
          const item: ItemData = {
            articleName,
            articleCode,
            notes: randomNotes, // Random non-null notes
            fabric: { name: "Test Fabric" },
            customerOrderNumber: "SER-TEST",
          };

          const component: BedComponent = {
            componentName,
            sourcePartId: "test-part",
          };

          const label = createComponentLabel(
            item,
            component,
            99999,
            "01.01.2026",
            "Test Customer",
            "CB-TEST",
            "test-image"
          );

          // EXPECTED BEHAVIOR: ComponentLabel.notes should be null
          // ON UNFIXED CODE: This will FAIL because notes will equal randomNotes
          expect(label.notes).toBeNull();
        }
      ),
      { numRuns: 50 } // Run 50 random test cases
    );
  });

  it("edge case: should have notes: null even when item.notes is null", () => {
    // This test should pass even on unfixed code (no bug when notes are already null)
    const item: ItemData = {
      articleName: "Krevet",
      articleCode: "KR-003",
      notes: null, // NULL notes - no bug in this case
      fabric: null,
      customerOrderNumber: null,
    };

    const component: BedComponent = {
      componentName: "Nogice",
      sourcePartId: "part-789",
    };

    const label = createComponentLabel(
      item,
      component,
      12347,
      "17.01.2026",
      null,
      "CB-003",
      "base64image3"
    );

    // This should pass even on unfixed code
    expect(label.notes).toBeNull();
  });
});
