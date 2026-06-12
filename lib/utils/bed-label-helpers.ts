/**
 * Extracts the numeric width from a dimension string or article name.
 * Looks for patterns like "120x200", "90X190" (case-insensitive).
 *
 * @param dimensions - Article.dimensions field (e.g., "120x200")
 * @param articleName - Article.name field as fallback (e.g., "ADORA 120X200 krevet")
 * @returns The width as a number, or null if no valid pattern found
 */
export function parseArticleWidth(
  dimensions: string | null | undefined,
  articleName?: string | null
): number | null {
  const dimPattern = /^(\d+)\s*[xX]\s*(\d+)/;
  const namePattern = /(\d+)\s*[xX]\s*(\d+)/;

  // 1. Try dimensions field first
  if (dimensions != null && dimensions !== "") {
    const match = dimensions.match(dimPattern);
    if (match) {
      return Number(match[1]);
    }
  }

  // 2. Fall back to article name
  if (articleName != null && articleName !== "") {
    const match = articleName.match(namePattern);
    if (match) {
      return Number(match[1]);
    }
  }

  // 3. No valid pattern found
  return null;
}

/** Expansion mapping for "Baza" part into individual bed components */
export const BAZA_EXPANSION = ["Lijeva Baza", "Desna Baza", "Nogice"] as const;

/** Parts that generate separate large component labels */
export const BED_COMPONENT_PARTS = ["Baza", "Uzglavlje", "Madrac"] as const;

export interface PartInfo {
  partId: string;
  partName: string;
}

export interface BedComponent {
  componentName: string;
  sourcePartId: string;
  sourcePartName: string;
}

/** All 5 standard bed packaging components */
export const ALL_BED_COMPONENTS = ["Lijeva Baza", "Desna Baza", "Nogice", "Uzglavlje", "Madrac"] as const;

/** Krevet components (without madrac) */
const KREVET_COMPONENTS = ["Lijeva Baza", "Desna Baza", "Nogice", "Uzglavlje"] as const;

/** Baza-only components */
const BAZA_COMPONENTS = ["Lijeva Baza", "Desna Baza", "Nogice"] as const;

/** Madrac-only components */
const MADRAC_COMPONENTS = ["Madrac"] as const;

/** Narrow baza components (single baza, with nogice) */
const NARROW_BAZA_COMPONENTS = ["Baza", "Nogice"] as const;

/** Narrow krevet components (single baza + uzglavlje, with nogice) */
const NARROW_KREVET_COMPONENTS = ["Baza", "Nogice", "Uzglavlje"] as const;

/** All narrow bed components (single baza + nogice + uzglavlje + madrac) */
const ALL_NARROW_BED_COMPONENTS = ["Baza", "Nogice", "Uzglavlje", "Madrac"] as const;

/**
 * Determines which packaging components to generate based on article description or name.
 * Checks description first, falls back to article name.
 * - "KREVET+MADRAC" or "KREVET + MADRAC" → all 5 (krevet + madrac)
 * - "BAZA+UZGLAVLJE+MADRAC" → all 5 (same as krevet+madrac)
 * - "BAZA+UZGLAVLJE" (without madrac) → 4 (baza L, baza D, nogice, uzglavlje)
 * - "KREVET" (without madrac) → 4 (baza L, baza D, nogice, uzglavlje)
 * - "MADRAC" → 1 (only madrac)
 * - "BAZA" (without uzglavlje) → 3 (baza L, baza D, nogice)
 * - Default (no match) → all 5
 *
 * Options:
 * - width: When a number ≤ 120, replaces "Lijeva Baza"/"Desna Baza" with single "Baza".
 *          When null or > 120, keeps the split (current behavior).
 * - withLegs: When explicitly false, removes "Nogice" from the component set.
 *             When true or undefined, keeps "Nogice" (current behavior).
 */
export function getComponentsForDescription(
  description: string | null | undefined,
  articleName?: string | null,
  options?: { width?: number | null; withLegs?: boolean }
): readonly string[] {
  const isNarrow = typeof options?.width === "number" && options.width <= 120;

  // Try description first, then fall back to article name
  const text = description || articleName;
  if (!text) {
    // Default: all components
    let components: readonly string[] = isNarrow ? ALL_NARROW_BED_COMPONENTS : ALL_BED_COMPONENTS;
    if (options?.withLegs === false) {
      components = components.filter((c) => c !== "Nogice");
    }
    return components;
  }

  const desc = text.toUpperCase().replace(/\s+/g, "");

  let components: readonly string[];

  // Check for KREVET+MADRAC first (most specific)
  if (desc.includes("KREVET") && desc.includes("MADRAC")) {
    components = isNarrow ? ALL_NARROW_BED_COMPONENTS : ALL_BED_COMPONENTS;
  }
  // Check for BAZA+UZGLAVLJE+MADRAC (all three without KREVET keyword)
  else if (desc.includes("BAZA") && desc.includes("UZGLAVLJE") && desc.includes("MADRAC")) {
    components = isNarrow ? ALL_NARROW_BED_COMPONENTS : ALL_BED_COMPONENTS;
  }
  // Check for BAZA+UZGLAVLJE (without MADRAC) — krevet-like set
  else if (desc.includes("BAZA") && desc.includes("UZGLAVLJE") && !desc.includes("MADRAC")) {
    components = isNarrow ? NARROW_KREVET_COMPONENTS : KREVET_COMPONENTS;
  }
  // Check for just MADRAC (before KREVET, since KREVET check is broader)
  else if (desc.includes("MADRAC") && !desc.includes("KREVET")) {
    components = MADRAC_COMPONENTS;
  }
  // Check for just KREVET (without MADRAC)
  else if (desc.includes("KREVET") && !desc.includes("MADRAC")) {
    components = isNarrow ? NARROW_KREVET_COMPONENTS : KREVET_COMPONENTS;
  }
  // Check for BAZA (without UZGLAVLJE)
  else if (desc.includes("BAZA")) {
    components = isNarrow ? NARROW_BAZA_COMPONENTS : BAZA_COMPONENTS;
  }
  // Default: all components
  else {
    components = isNarrow ? ALL_NARROW_BED_COMPONENTS : ALL_BED_COMPONENTS;
  }

  // Post-process: remove "Nogice" when withLegs is explicitly false
  if (options?.withLegs === false) {
    components = components.filter((c) => c !== "Nogice");
  }

  return components;
}

/**
 * Expands parts list into names for the "Sadržaj" field,
 * filtered by article description.
 */
export function expandPartsForContent(
  _parts: PartInfo[],
  description?: string | null,
  articleName?: string | null,
  options?: { width?: number | null; withLegs?: boolean }
): string[] {
  const components = getComponentsForDescription(description, articleName, options);
  return [...components];
}

/**
 * Returns bed packaging components for an article, filtered by description.
 * Each component is linked to the best matching source part, or the first part as fallback.
 */
export function getBedComponents(
  parts: PartInfo[],
  description?: string | null,
  articleName?: string | null,
  options?: { width?: number | null; withLegs?: boolean }
): BedComponent[] {
  const components = getComponentsForDescription(description, articleName, options);

  // If no parts defined, use a dummy fallback part ID
  const fallbackPart: PartInfo = parts[0] ?? { partId: "no-part", partName: "Artikal" };

  // Build a lookup for source part IDs
  const bazaPart = parts.find((p) => p.partName === "Baza");
  const uzgavljePart = parts.find((p) => p.partName === "Uzglavlje");
  const madracPart = parts.find((p) => p.partName === "Madrac");

  return components.map((name) => {
    let sourcePart: PartInfo;
    if (name === "Lijeva Baza" || name === "Desna Baza" || name === "Baza" || name === "Nogice") {
      sourcePart = bazaPart ?? fallbackPart;
    } else if (name === "Uzglavlje") {
      sourcePart = uzgavljePart ?? fallbackPart;
    } else {
      sourcePart = madracPart ?? fallbackPart;
    }
    return {
      componentName: name,
      sourcePartId: sourcePart.partId,
      sourcePartName: sourcePart.partName,
    };
  });
}

/**
 * Formats bed components for the label footer using " / " separator,
 * filtered by article description.
 */
export function formatFooterComponents(
  _parts: PartInfo[],
  description?: string | null,
  articleName?: string | null,
  options?: { width?: number | null; withLegs?: boolean }
): string {
  const components = getComponentsForDescription(description, articleName, options);
  return components.join(" / ");
}

/**
 * Filter bed components by the selected set of canonical component names.
 * Empty selection → identity (returns input unchanged, per Req 11.3).
 * Comparison is case-sensitive on canonical names from ALL_BED_COMPONENTS:
 *   "Lijeva Baza" | "Desna Baza" | "Baza" | "Nogice" | "Uzglavlje" | "Madrac".
 */
export function filterBedComponents(
  components: BedComponent[],
  selected: ReadonlySet<string>
): BedComponent[] {
  if (selected.size === 0) return components;
  return components.filter((c) => selected.has(c.componentName));
}
