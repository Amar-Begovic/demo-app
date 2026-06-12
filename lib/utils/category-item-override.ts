/**
 * Category Item Material Override Service
 *
 * Pure function that detects placeholder materials in the normative (BOM)
 * and replaces them with the actual selected category item materials.
 * Handles Paspul, Ručka, and Nogice overrides with special duplication
 * logic for Nogice (1 placeholder → 1 or 2 output rows).
 */

// ─── Types ───────────────────────────────────────────────

export type CategoryType = "paspul" | "rucka" | "nogice";

/**
 * Input: a single normative material entry from a production step.
 */
export interface NormativeMaterial {
  materialId: string;
  materialName: string;
  materialCode: string | null;
  quantity: number;
  pieces: number | null;
  unit: string;
  price: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  isEdgebanded: boolean | null;
}

/**
 * Category item selection with optional linked material info.
 */
export interface CategoryItemSelection {
  id: string;
  name: string;
  materialId: string | null;
  materialName: string | null;
  materialCode: string | null;
  materialUnit: string | null;
}

/**
 * The selections available for override processing.
 */
export interface CategorySelections {
  paspul: CategoryItemSelection | null;
  rucka: CategoryItemSelection | null;
  nogice1: CategoryItemSelection | null;
  nogice2: CategoryItemSelection | null;
}

/**
 * Output: a material entry after override processing.
 * Extends NormativeMaterial with override metadata.
 */
export interface OverriddenMaterial extends NormativeMaterial {
  isOverridden: boolean;
  originalMaterialName: string | null;
}

/**
 * Result of applying overrides to a list of normative materials.
 */
export interface OverrideResult {
  /** Materials after override (replacements applied, placeholders removed/replaced) */
  materials: OverriddenMaterial[];
  /** Category types that were consumed by placeholder matching (should NOT be added additively) */
  consumedCategories: Set<CategoryType>;
}

// ─── Placeholder Patterns ────────────────────────────────

/**
 * Placeholder detection patterns.
 * Each entry maps a normalized pattern (lowercase, trimmed) to a category type.
 */
export const PLACEHOLDER_PATTERNS: Record<string, CategoryType> = {
  "paspul za sve": "paspul",
  "traka za sve": "paspul", // equivalent to "Paspul za sve"
  "ručka za sve": "rucka",
  "nogice za sve": "nogice",
};

// ─── Placeholder Detection ───────────────────────────────

/**
 * Detects if a material name matches a known placeholder pattern.
 * Trims whitespace and converts to lowercase before matching.
 *
 * @param materialName - The material name to check
 * @returns The category type if matched, or null if no match
 */
export function detectPlaceholder(materialName: string): CategoryType | null {
  const normalized = materialName.trim().toLowerCase();
  return PLACEHOLDER_PATTERNS[normalized] ?? null;
}

// ─── Override Application ────────────────────────────────

/**
 * Apply category item overrides to a list of normative materials.
 *
 * For each material:
 * 1. Check if it's a placeholder (by name pattern)
 * 2. If placeholder and corresponding category item is selected with linked material:
 *    - Replace material identity with linked material
 *    - Preserve original quantity
 *    - Mark as overridden
 * 3. If placeholder but no category item selected (or no linked material):
 *    - Retain placeholder unchanged
 * 4. If not a placeholder: pass through unchanged
 *
 * Special handling for Nogice:
 * - A single "Nogice za sve" placeholder can produce 1 or 2 output rows
 *   depending on whether Nogice 1 and/or Nogice 2 are selected
 * - When neither is selected, retain placeholder unchanged
 *
 * @param materials - Normative materials (post-fabric-override)
 * @param selections - Category item selections from the production order item
 * @returns OverrideResult with transformed materials and consumed categories
 */
export function applyCategoryItemOverrides(
  materials: NormativeMaterial[],
  selections: CategorySelections
): OverrideResult {
  const outputMaterials: OverriddenMaterial[] = [];
  const consumedCategories = new Set<CategoryType>();

  for (const material of materials) {
    const categoryType = detectPlaceholder(material.materialName);

    if (categoryType === null) {
      // Not a placeholder — pass through unchanged
      outputMaterials.push({
        ...material,
        isOverridden: false,
        originalMaterialName: null,
      });
      continue;
    }

    if (categoryType === "nogice") {
      // Special Nogice handling: can produce 0, 1, or 2 output rows
      const nogiceRows = buildNogiceOverrideRows(material, selections);

      if (nogiceRows.length === 0) {
        // Neither Nogice 1 nor Nogice 2 selected with linked material — retain placeholder
        outputMaterials.push({
          ...material,
          isOverridden: false,
          originalMaterialName: null,
        });
      } else {
        // At least one Nogice selected — consume the category and add override rows
        consumedCategories.add("nogice");
        outputMaterials.push(...nogiceRows);
      }
      continue;
    }

    // Paspul or Rucka handling
    const selection = categoryType === "paspul" ? selections.paspul : selections.rucka;

    if (selection === null || selection.materialId === null) {
      // No category item selected or no linked material — retain placeholder unchanged
      outputMaterials.push({
        ...material,
        isOverridden: false,
        originalMaterialName: null,
      });
      continue;
    }

    // Replace placeholder with linked material identity, preserving quantity
    consumedCategories.add(categoryType);
    outputMaterials.push({
      ...material,
      materialId: selection.materialId,
      materialName: selection.materialName ?? material.materialName,
      materialCode: selection.materialCode ?? null,
      unit: selection.materialUnit ?? material.unit,
      isOverridden: true,
      originalMaterialName: material.materialName,
    });
  }

  return {
    materials: outputMaterials,
    consumedCategories,
  };
}

// ─── Nogice Helper ───────────────────────────────────────

/**
 * Build override rows for a Nogice placeholder.
 * Returns 0 rows if neither Nogice 1 nor Nogice 2 has a linked material,
 * 1 row if only one is selected, or 2 rows if both are selected.
 */
function buildNogiceOverrideRows(
  material: NormativeMaterial,
  selections: CategorySelections
): OverriddenMaterial[] {
  const rows: OverriddenMaterial[] = [];

  const nogice1 = selections.nogice1;
  const nogice2 = selections.nogice2;

  if (nogice1 !== null && nogice1.materialId !== null) {
    rows.push({
      ...material,
      materialId: nogice1.materialId,
      materialName: nogice1.materialName ?? material.materialName,
      materialCode: nogice1.materialCode ?? null,
      unit: nogice1.materialUnit ?? material.unit,
      isOverridden: true,
      originalMaterialName: material.materialName,
    });
  }

  if (nogice2 !== null && nogice2.materialId !== null) {
    rows.push({
      ...material,
      materialId: nogice2.materialId,
      materialName: nogice2.materialName ?? material.materialName,
      materialCode: nogice2.materialCode ?? null,
      unit: nogice2.materialUnit ?? material.unit,
      isOverridden: true,
      originalMaterialName: material.materialName,
    });
  }

  return rows;
}
