import type { MaterialRequirement, MaterialCheckResult, ProductionOrderProgress } from "@/lib/types";

/**
 * Represents a part's material requirement for BOM calculation.
 */
export interface BOMPartMaterial {
  materialId: string;
  materialName: string;
  quantityPerUnit: number;
  pieces: number;
}

/**
 * Represents a part in the BOM for calculation purposes.
 */
export interface BOMPart {
  materials: BOMPartMaterial[];
}

/**
 * Represents current stock info for availability checking.
 */
export interface MaterialStock {
  materialId: string;
  materialName: string;
  currentQuantity: number;
}

/**
 * Calculate total material requirements for a given article BOM and production quantity.
 *
 * For each material used across all parts, sums up (quantityPerUnit * quantity).
 * Returns one MaterialRequirement per unique material (with availableQuantity and deficit set to 0).
 */
export function calculateMaterialRequirements(
  parts: BOMPart[],
  quantity: number
): MaterialRequirement[] {
  const requirementMap = new Map<string, MaterialRequirement>();

  for (const part of parts) {
    for (const mat of part.materials) {
      const existing = requirementMap.get(mat.materialId);
      const additionalQty = mat.pieces * mat.quantityPerUnit * quantity;

      if (existing) {
        existing.requiredQuantity += additionalQty;
      } else {
        requirementMap.set(mat.materialId, {
          materialId: mat.materialId,
          materialName: mat.materialName,
          requiredQuantity: additionalQty,
          availableQuantity: 0,
          deficit: 0,
        });
      }
    }
  }

  return Array.from(requirementMap.values());
}

/**
 * Check material availability against requirements.
 *
 * For each requirement, looks up current stock and computes deficit.
 * Returns allAvailable = true only if every material has sufficient stock.
 */
export function checkMaterialAvailability(
  requirements: MaterialRequirement[],
  stock: MaterialStock[]
): MaterialCheckResult {
  const stockMap = new Map<string, number>();
  for (const s of stock) {
    stockMap.set(s.materialId, s.currentQuantity);
  }

  let allAvailable = true;
  const enrichedRequirements: MaterialRequirement[] = requirements.map((req) => {
    const available = stockMap.get(req.materialId) ?? 0;
    const deficit = Math.max(0, req.requiredQuantity - available);
    if (deficit > 0) {
      allAvailable = false;
    }
    return {
      ...req,
      availableQuantity: available,
      deficit,
    };
  });

  return {
    allAvailable,
    requirements: enrichedRequirements,
  };
}

/**
 * Calculate production order progress based on work order completion.
 *
 * percentage = (completedWorkOrders / totalWorkOrders) * 100, or 0 if no work orders.
 */
export function calculateProgress(
  totalWorkOrders: number,
  completedWorkOrders: number
): ProductionOrderProgress {
  const percentage =
    totalWorkOrders > 0
      ? (completedWorkOrders / totalWorkOrders) * 100
      : 0;

  return {
    totalWorkOrders,
    completedWorkOrders,
    percentage,
  };
}

import type { DeadlineStatus } from "@/lib/types";
import type { OrderPriority } from "@/app/generated/prisma";

// ─── Step-based material requirements ────────────────────

/**
 * Calculate material requirements from production steps (StepMaterial).
 * Materials are attached to production steps, not directly to article parts.
 *
 * For each material across all steps of all parts, sums up (quantity × orderQuantity).
 * Returns one MaterialRequirement per unique material.
 */
export function calculateMaterialRequirementsFromSteps(
  parts: Array<{
    steps: Array<{
      materials: Array<{
        materialId: string;
        materialName: string;
        quantity: number;
        price: number | null;
      }>;
    }>;
  }>,
  quantity: number
): MaterialRequirement[] {
  const requirementMap = new Map<string, MaterialRequirement>();

  for (const part of parts) {
    for (const step of part.steps) {
      for (const mat of step.materials) {
        const existing = requirementMap.get(mat.materialId);
        const additionalQty = mat.quantity * quantity;

        if (existing) {
          existing.requiredQuantity += additionalQty;
        } else {
          requirementMap.set(mat.materialId, {
            materialId: mat.materialId,
            materialName: mat.materialName,
            requiredQuantity: additionalQty,
            availableQuantity: 0,
            deficit: 0,
          });
        }
      }
    }
  }

  return Array.from(requirementMap.values());
}

// ─── Cost calculation ────────────────────────────────────

export interface CostBreakdown {
  articleCosts: Array<{
    articleId: string;
    articleName: string;
    quantity: number;
    materialCostPerUnit: number;
    totalMaterialCost: number;
    sellingPrice: number | null;
    margin: number | null;
    incomplete: boolean;
    missingPriceMaterials: string[];
  }>;
  totalMaterialCost: number;
  totalSellingPrice: number | null;
  totalMargin: number | null;
  isComplete: boolean;
}

/**
 * Calculate cost breakdown for a production order.
 *
 * For each article item:
 *   materialCostPerUnit = sum(quantity × price) across all steps of all parts
 *   totalMaterialCost = materialCostPerUnit × item quantity
 *   margin = sellingPrice - materialCostPerUnit (only if complete and sellingPrice defined)
 *
 * If any material has price === null, that article is marked incomplete.
 * Total order cost = sum of all article totalMaterialCost values.
 */
export function calculateOrderCost(
  items: Array<{
    articleId: string;
    articleName: string;
    quantity: number;
    sellingPrice: number | null;
    parts: Array<{
      steps: Array<{
        materials: Array<{
          materialId: string;
          materialName: string;
          quantity: number;
          price: number | null;
        }>;
      }>;
    }>;
  }>
): CostBreakdown {
  const articleCosts: CostBreakdown["articleCosts"] = [];
  let totalMaterialCost = 0;
  let totalSellingPrice: number | null = 0;
  let isComplete = true;

  for (const item of items) {
    let materialCostPerUnit = 0;
    let incomplete = false;
    const missingPriceMaterials: string[] = [];

    for (const part of item.parts) {
      for (const step of part.steps) {
        for (const mat of step.materials) {
          if (mat.price === null) {
            incomplete = true;
            if (!missingPriceMaterials.includes(mat.materialName)) {
              missingPriceMaterials.push(mat.materialName);
            }
          } else {
            materialCostPerUnit += mat.quantity * mat.price;
          }
        }
      }
    }

    if (incomplete) {
      isComplete = false;
    }

    const totalArticleCost = materialCostPerUnit * item.quantity;
    totalMaterialCost += totalArticleCost;

    // Margin: only when article is complete and has a selling price
    let margin: number | null = null;
    if (!incomplete && item.sellingPrice !== null) {
      margin = item.sellingPrice - materialCostPerUnit;
    }

    // Track total selling price
    if (item.sellingPrice !== null) {
      if (totalSellingPrice !== null) {
        totalSellingPrice += item.sellingPrice * item.quantity;
      }
    } else {
      totalSellingPrice = null;
    }

    articleCosts.push({
      articleId: item.articleId,
      articleName: item.articleName,
      quantity: item.quantity,
      materialCostPerUnit,
      totalMaterialCost: totalArticleCost,
      sellingPrice: item.sellingPrice,
      margin,
      incomplete,
      missingPriceMaterials,
    });
  }

  // Total margin: only if all articles are complete and all have selling prices
  let totalMargin: number | null = null;
  if (isComplete && totalSellingPrice !== null) {
    totalMargin = totalSellingPrice - totalMaterialCost;
  }

  return {
    articleCosts,
    totalMaterialCost,
    totalSellingPrice,
    totalMargin,
    isComplete,
  };
}

// ─── Deadline classification ─────────────────────────────

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Classify a production order's deadline status.
 *
 * - "overdue": deadline has passed and order is not completed
 * - "warning": deadline is within 3 days and order is not completed
 * - "ok": order is completed, has no deadline, or deadline is more than 3 days away
 */
export function classifyDeadline(
  deadline: Date | null,
  status: string,
  now: Date = new Date()
): DeadlineStatus {
  if (!deadline || status === "completed") {
    return "ok";
  }

  const deadlineTime = deadline.getTime();
  const nowTime = now.getTime();

  if (deadlineTime < nowTime) {
    return "overdue";
  }

  if (deadlineTime - nowTime <= THREE_DAYS_MS) {
    return "warning";
  }

  return "ok";
}

// ─── Priority sorting and filtering ─────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  normal: 1,
  low: 2,
};

/**
 * Sort orders by priority: urgent first, then normal, then low.
 * Returns a new sorted array (does not mutate the input).
 */
export function sortByPriority<T extends { priority: OrderPriority }>(
  orders: T[]
): T[] {
  return [...orders].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  );
}

/**
 * Filter orders by a specific priority value.
 */
export function filterByPriority<T extends { priority: OrderPriority }>(
  orders: T[],
  priority: OrderPriority
): T[] {
  return orders.filter((order) => order.priority === priority);
}

// ─── Notes helper ────────────────────────────────────────

/**
 * Returns true if notes is not null and not an empty string.
 */
export function hasNotes(notes: string | null | undefined): boolean {
  return notes !== null && notes !== undefined && notes !== "";
}

// ─── Per-item aggregate functions ────────────────────────

/**
 * Returns the highest priority from all items.
 * Order: urgent > normal > low
 * Returns "normal" for an empty array.
 */
export function getHighestPriority(
  items: Array<{ priority: string }>
): string {
  if (items.length === 0) return "normal";

  for (const item of items) {
    if (item.priority === "urgent") return "urgent";
  }
  for (const item of items) {
    if (item.priority === "normal") return "normal";
  }
  return "low";
}

/**
 * Returns the earliest non-null deliveryDeadline from all items,
 * or null if all items have null deadline. Returns null for an empty array.
 */
export function getEarliestDeadline(
  items: Array<{ deliveryDeadline: Date | null }>
): Date | null {
  let earliest: Date | null = null;

  for (const item of items) {
    if (item.deliveryDeadline !== null) {
      if (earliest === null || item.deliveryDeadline.getTime() < earliest.getTime()) {
        earliest = item.deliveryDeadline;
      }
    }
  }

  return earliest;
}

/**
 * Returns true if any item has non-null and non-empty notes.
 */
export function anyItemHasNotes(
  items: Array<{ notes: string | null }>
): boolean {
  return items.some((item) => item.notes !== null && item.notes !== "");
}
