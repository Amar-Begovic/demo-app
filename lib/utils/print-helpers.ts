import { prisma } from "@/lib/db";
import {
  applyCategoryItemOverrides,
  CategoryItemSelection,
  CategorySelections,
  CategoryType,
  NormativeMaterial,
} from "@/lib/utils/category-item-override";

/**
 * Category item data included in print output.
 * Contains the item's identity and optionally its linked material info.
 */
export interface CategoryItemPrintData {
  id: string;
  name: string;
  materialId: string | null;
  materialName: string | null;
  materialCode: string | null;
  materialUnit: string | null;
}

/**
 * Shape of print data returned by getPrintData().
 * Contains the full order with all articles, parts, steps, and materials.
 */
export interface PrintData {
  orderId: string;
  orderNumber: number;
  customerName: string | null;
  customerPhone: string | null;
  documentNumber: string | null;
  deliveryLocation: string | null;
  receivedBy: string | null;
  createdAt: Date;
  workOrderDate: Date | null;
  items: Array<{
    articleId: string;
    articleName: string;
    articleCode: string | null;
    articleDescription: string | null;
    articleGroup: string | null;
    priceWithoutVAT: number | null;
    quantity: number;
    deliveryDeadline: Date | null;
    priority: string;
    notes: string | null;
    customerOrderNumber: string | null;
    loadingNumber: string | null;
    serialNumber: string | null;
    articleDimensions: string | null;
    loadingSequence: number | null;
    withLegs: boolean;
    fabric: { id: string; name: string; color: string | null } | null;
    step: string | null;
    rucka: CategoryItemPrintData | null;
    paspul: CategoryItemPrintData | null;
    nogice1: CategoryItemPrintData | null;
    nogice2: CategoryItemPrintData | null;
    /** Category types consumed by placeholder override (should not be added additively) */
    consumedCategories?: Set<CategoryType>;
    parts: Array<{
      partId: string;
      partName: string;
      dimensions: string | null;
      steps: Array<{
        stepId: string;
        stepName: string;
        sequenceOrder: number;
        departmentId: string;
        departmentName: string;
        estimatedTime: number | null;
        instructions: string | null;
        materials: Array<{
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
          isOverridden: boolean;
          originalMaterialName: string | null;
        }>;
      }>;
    }>;
  }>;
}

// ─── Category Item Override Helpers ───────────────────────

/**
 * Map CategoryItemPrintData to CategoryItemSelection interface
 * used by the override service.
 */
function mapCategoryItemPrintDataToSelection(ci: CategoryItemPrintData): CategoryItemSelection {
  return {
    id: ci.id,
    name: ci.name,
    materialId: ci.materialId,
    materialName: ci.materialName,
    materialCode: ci.materialCode,
    materialUnit: ci.materialUnit,
  };
}

/**
 * Build the final materials array after category item override processing.
 * Preserves fabric override metadata for materials that were not overridden
 * by category items. Handles Nogice expansion (1 input → 2 outputs).
 *
 * Strategy: Walk through the override result. The override service processes
 * materials in order, so we track position in the original fabric-overridden
 * array. When a material is NOT overridden by category items, we use the
 * original fabric-overridden entry (preserving its isOverridden/originalMaterialName).
 * When it IS overridden by category items, we use the override result.
 * For Nogice expansion, one input produces multiple outputs — all marked as overridden.
 */
function buildFinalMaterials(
  fabricOverridden: Array<{
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
    isOverridden: boolean;
    originalMaterialName: string | null;
  }>,
  overrideResults: Array<{
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
    isOverridden: boolean;
    originalMaterialName: string | null;
  }>
): Array<{
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
  isOverridden: boolean;
  originalMaterialName: string | null;
}> {
  // The override service may expand (Nogice) or pass through materials.
  // We need to correlate override results back to the original fabric-overridden list.
  // The override service processes materials in order, so we walk through both arrays.
  //
  // Key insight: the override service's output length >= input length (due to Nogice expansion).
  // For non-expanded materials, there's a 1:1 correspondence by position.
  // For expanded materials (Nogice), one input produces multiple consecutive outputs.
  //
  // We detect expansion by checking if consecutive override results share the same
  // originalMaterialName as a Nogice placeholder from the input.

  const result: typeof fabricOverridden = [];
  let inputIdx = 0;

  for (let outIdx = 0; outIdx < overrideResults.length; outIdx++) {
    const overrideMat = overrideResults[outIdx];

    if (overrideMat.isOverridden) {
      // Category item override was applied — use override result directly
      result.push({
        materialId: overrideMat.materialId,
        materialName: overrideMat.materialName,
        materialCode: overrideMat.materialCode,
        quantity: overrideMat.quantity,
        pieces: overrideMat.pieces,
        unit: overrideMat.unit,
        price: overrideMat.price,
        length: overrideMat.length,
        width: overrideMat.width,
        height: overrideMat.height,
        isEdgebanded: overrideMat.isEdgebanded,
        isOverridden: true,
        originalMaterialName: overrideMat.originalMaterialName,
      });

      // Check if the next override result is also from the same input (Nogice expansion)
      // If the next result also has the same originalMaterialName and is overridden,
      // it's part of the expansion — don't advance inputIdx yet
      const nextOut = overrideResults[outIdx + 1];
      if (
        nextOut &&
        nextOut.isOverridden &&
        nextOut.originalMaterialName === overrideMat.originalMaterialName
      ) {
        // Nogice expansion: don't advance inputIdx, next iteration handles the second row
      } else {
        inputIdx++;
      }
    } else {
      // Not overridden by category items — use original fabric-overridden entry
      // to preserve fabric override metadata
      if (inputIdx < fabricOverridden.length) {
        result.push(fabricOverridden[inputIdx]);
      } else {
        // Fallback (shouldn't happen)
        result.push({
          materialId: overrideMat.materialId,
          materialName: overrideMat.materialName,
          materialCode: overrideMat.materialCode,
          quantity: overrideMat.quantity,
          pieces: overrideMat.pieces,
          unit: overrideMat.unit,
          price: overrideMat.price,
          length: overrideMat.length,
          width: overrideMat.width,
          height: overrideMat.height,
          isEdgebanded: overrideMat.isEdgebanded,
          isOverridden: false,
          originalMaterialName: null,
        });
      }
      inputIdx++;
    }
  }

  return result;
}

/**
 * Fetch full order data for print, including all articles, parts, steps, and materials.
 */
export async function getPrintData(orderId: string): Promise<PrintData | null> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          article: {
            include: {
              parts: {
                include: {
                  productionSteps: {
                    include: {
                      department: true,
                      materials: {
                        include: { material: true },
                      },
                    },
                    orderBy: { sequenceOrder: "asc" },
                  },
                },
              },
            },
          },
          fabric: {
            include: {
              material: {
                select: { id: true, name: true, code: true, unit: true, currentQuantity: true, minimumQuantity: true }
              }
            }
          },
          rucka: {
            select: { id: true, name: true, materialId: true, material: { select: { name: true, code: true, unit: true } } }
          },
          paspul: {
            select: { id: true, name: true, materialId: true, material: { select: { name: true, code: true, unit: true } } }
          },
          nogice1: {
            select: { id: true, name: true, materialId: true, material: { select: { name: true, code: true, unit: true } } }
          },
          nogice2: {
            select: { id: true, name: true, materialId: true, material: { select: { name: true, code: true, unit: true } } }
          },
        },
      },
      article: {
        include: {
          parts: {
            include: {
              productionSteps: {
                include: {
                  department: true,
                  materials: {
                    include: { material: true },
                  },
                },
                orderBy: { sequenceOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  // Build items from new-style items or legacy article
  const rawItems =
    order.items.length > 0
      ? order.items
      : order.article && order.articleId && order.quantity
        ? [
            {
              articleId: order.articleId,
              quantity: order.quantity,
              article: order.article,
              fabric: null,
              deliveryDeadline: null as Date | null,
              priority: "normal" as string,
              notes: null as string | null,
              customerOrderNumber: null as string | null,
              loadingNumber: null as string | null,
              withLegs: false as boolean,
              loadingSequence: null as number | null,
              serialNumber: null as string | null,
              step: null as string | null,
            },
          ]
        : [];

  const items: PrintData["items"] = rawItems.map((item) => {
    const fabric = item.fabric;

    // Build category selections for override processing
    const ruckaData: CategoryItemPrintData | null = 'rucka' in item && item.rucka ? {
      id: item.rucka.id,
      name: item.rucka.name,
      materialId: item.rucka.materialId,
      materialName: item.rucka.materialId && item.rucka.material ? item.rucka.material.name : null,
      materialCode: item.rucka.materialId && item.rucka.material ? item.rucka.material.code : null,
      materialUnit: item.rucka.materialId && item.rucka.material ? item.rucka.material.unit : null,
    } : null;
    const paspulData: CategoryItemPrintData | null = 'paspul' in item && item.paspul ? {
      id: item.paspul.id,
      name: item.paspul.name,
      materialId: item.paspul.materialId,
      materialName: item.paspul.materialId && item.paspul.material ? item.paspul.material.name : null,
      materialCode: item.paspul.materialId && item.paspul.material ? item.paspul.material.code : null,
      materialUnit: item.paspul.materialId && item.paspul.material ? item.paspul.material.unit : null,
    } : null;
    const nogice1Data: CategoryItemPrintData | null = 'nogice1' in item && item.nogice1 ? {
      id: item.nogice1.id,
      name: item.nogice1.name,
      materialId: item.nogice1.materialId,
      materialName: item.nogice1.materialId && item.nogice1.material ? item.nogice1.material.name : null,
      materialCode: item.nogice1.materialId && item.nogice1.material ? item.nogice1.material.code : null,
      materialUnit: item.nogice1.materialId && item.nogice1.material ? item.nogice1.material.unit : null,
    } : null;
    const nogice2Data: CategoryItemPrintData | null = 'nogice2' in item && item.nogice2 ? {
      id: item.nogice2.id,
      name: item.nogice2.name,
      materialId: item.nogice2.materialId,
      materialName: item.nogice2.materialId && item.nogice2.material ? item.nogice2.material.name : null,
      materialCode: item.nogice2.materialId && item.nogice2.material ? item.nogice2.material.code : null,
      materialUnit: item.nogice2.materialId && item.nogice2.material ? item.nogice2.material.unit : null,
    } : null;

    const categorySelections: CategorySelections = {
      paspul: paspulData ? mapCategoryItemPrintDataToSelection(paspulData) : null,
      rucka: ruckaData ? mapCategoryItemPrintDataToSelection(ruckaData) : null,
      nogice1: nogice1Data ? mapCategoryItemPrintDataToSelection(nogice1Data) : null,
      nogice2: nogice2Data ? mapCategoryItemPrintDataToSelection(nogice2Data) : null,
    };

    // Track consumed categories across all steps for this item
    const itemConsumedCategories = new Set<CategoryType>();

    const parts = item.article.parts.map((part) => ({
      partId: part.id,
      partName: part.partName,
      dimensions: part.dimensions ?? null,
      steps: part.productionSteps.map((step) => {
        // First apply fabric override
        const fabricOverriddenMaterials = step.materials.map((sm) => {
          // Fabric override applies ONLY to the "Štof za sve" placeholder material.
          // Other non-dimensional materials (CO2, ljepilo, etc.) and other category
          // placeholders (Ručka za sve, Paspul za sve, Nogice za sve) must NOT be touched.
          const isFabricPlaceholder = sm.material.name.trim().toLowerCase() === "štof za sve";
          if (fabric && isFabricPlaceholder) {
            // When fabric has a linked material, use the material's data
            const useMaterial = fabric.materialId && fabric.material;
            return {
              materialId: useMaterial ? fabric.materialId! : `fabric:${fabric.id}`,
              materialName: useMaterial ? fabric.material!.name : fabric.name,
              materialCode: useMaterial ? (fabric.material!.code ?? null) : (fabric.code ?? null),
              quantity: sm.quantity,
              pieces: sm.pieces ?? null,
              unit: sm.material.unit,
              price: sm.material.price ?? null,
              length: sm.length ?? null,
              width: sm.width ?? null,
              height: sm.height ?? null,
              isEdgebanded: sm.isEdgebanded ?? null,
              isOverridden: true,
              originalMaterialName: sm.material.name,
            };
          }
          return {
            materialId: sm.materialId,
            materialName: sm.material.name,
            materialCode: sm.material.code ?? null,
            quantity: sm.quantity,
            pieces: sm.pieces ?? null,
            unit: sm.material.unit,
            price: sm.material.price ?? null,
            length: sm.length ?? null,
            width: sm.width ?? null,
            height: sm.height ?? null,
            isEdgebanded: sm.isEdgebanded ?? null,
            isOverridden: false,
            originalMaterialName: null,
          };
        });

        // Then apply category item overrides on the post-fabric materials.
        // Fabric override changes the material name away from placeholder patterns,
        // so category item override won't match fabric-overridden materials (Req 7.3, 7.4).
        const normativeMaterials: NormativeMaterial[] = fabricOverriddenMaterials.map((m) => ({
          materialId: m.materialId,
          materialName: m.materialName,
          materialCode: m.materialCode,
          quantity: m.quantity,
          pieces: m.pieces,
          unit: m.unit,
          price: m.price,
          length: m.length,
          width: m.width,
          height: m.height,
          isEdgebanded: m.isEdgebanded,
        }));

        const overrideResult = applyCategoryItemOverrides(normativeMaterials, categorySelections);

        // Merge consumed categories from this step
        for (const cat of overrideResult.consumedCategories) {
          itemConsumedCategories.add(cat);
        }

        // Build final materials array, preserving fabric override metadata.
        // The override result may have more items than input (Nogice expansion).
        const materials = buildFinalMaterials(fabricOverriddenMaterials, overrideResult.materials);

        return {
          stepId: step.id,
          stepName: step.stepName,
          sequenceOrder: step.sequenceOrder,
          departmentId: step.departmentId,
          departmentName: step.department.name,
          estimatedTime: step.estimatedTime ?? null,
          instructions: step.instructions ?? null,
          materials,
        };
      }),
    }));

    return {
      articleId: item.articleId,
      articleName: item.article.name,
      articleCode: item.article.code ?? null,
      articleDescription: item.article.description ?? null,
      articleGroup: item.article.articleGroup ?? null,
      priceWithoutVAT: item.article.priceWithoutVAT ?? null,
      quantity: item.quantity,
      deliveryDeadline: item.deliveryDeadline ?? null,
      priority: item.priority ?? "normal",
      notes: item.notes ?? null,
      customerOrderNumber: item.customerOrderNumber ?? null,
      loadingNumber: item.loadingNumber ?? null,
      articleDimensions: item.article.dimensions ?? null,
      loadingSequence: ('loadingSequence' in item ? (item.loadingSequence as number | null) : null) ?? null,
      serialNumber: ('serialNumber' in item ? item.serialNumber : null) ?? null,
      withLegs: 'withLegs' in item ? (item.withLegs ?? false) : false,
      fabric: fabric ? { id: fabric.id, name: fabric.name, color: fabric.color } : null,
      step: ('step' in item ? item.step : null) ?? null,
      rucka: ruckaData,
      paspul: paspulData,
      nogice1: nogice1Data,
      nogice2: nogice2Data,
      consumedCategories: itemConsumedCategories,
      parts,
    };
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    documentNumber: order.documentNumber,
    deliveryLocation: order.deliveryLocation,
    receivedBy: order.receivedBy,
    createdAt: order.createdAt,
    workOrderDate: order.workOrderDate ?? null,
    items,
  };
}


/**
 * Deduplicated article info with total quantity summed across all orders.
 */
export interface ArticleInfo {
  name: string;
  totalQuantity: number;
}

/**
 * Aggregate article information across multiple orders.
 * Returns a deduplicated list of article names with total quantities
 * summed across all orders.
 */
export function aggregateArticleInfo(ordersData: PrintData[]): ArticleInfo[] {
  const map = new Map<string, number>();

  for (const order of ordersData) {
    for (const item of order.items) {
      const current = map.get(item.articleName) ?? 0;
      map.set(item.articleName, current + item.quantity);
    }
  }

  return Array.from(map.entries()).map(([name, totalQuantity]) => ({
    name,
    totalQuantity,
  }));
}

/**
 * Filter PrintData items by article name.
 * When articleNames is empty, returns data unchanged (identity).
 * When articleNames is non-empty, returns a new PrintData with only items
 * whose articleName is in the set.
 */
export function filterItemsByArticle(
  data: PrintData,
  articleNames: Set<string>
): PrintData {
  if (articleNames.size === 0) return data;
  return {
    ...data,
    items: data.items.filter((item) => articleNames.has(item.articleName)),
  };
}

/**
 * Bed type values used for filtering articles by frame type.
 * "all" means no filtering (show both wooden and metal beds).
 */
export type BedType = "all" | "Drveni" | "Metalni";

/**
 * Filter items by articleGroup (bed type: Drveni or Metalni).
 * When bedType is "all", returns data unchanged.
 */
export function filterItemsByBedType(
  data: PrintData,
  bedType: BedType
): PrintData {
  if (bedType === "all") return data;
  return {
    ...data,
    items: data.items.filter((item) => item.articleGroup === bedType),
  };
}

/**
 * Filter items by delivery deadline (datum utovara) date range.
 * When both dateFrom and dateTo are empty, returns data unchanged.
 * Only includes items whose deliveryDeadline falls within the range.
 * Items without a deliveryDeadline are excluded when a date range is active.
 */
export function filterItemsByDateRange(
  data: PrintData,
  dateFrom: string,
  dateTo: string
): PrintData {
  if (!dateFrom && !dateTo) return data;
  const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
  const to = dateTo ? new Date(dateTo + "T23:59:59.999") : null;
  return {
    ...data,
    items: data.items.filter((item) => {
      if (!item.deliveryDeadline) return false;
      const d = new Date(item.deliveryDeadline);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }),
  };
}

/** A step from PrintData, used by filter/calculation helpers. */
export type PrintStep = PrintData["items"][number]["parts"][number]["steps"][number];

/**
 * Filter steps from print data to only include those belonging to a specific department.
 * Returns a flat array of steps across all items and parts.
 */
export function filterDepartmentSteps(
  printData: PrintData,
  departmentId: string
): PrintStep[] {
  const result: PrintStep[] = [];

  for (const item of printData.items) {
    for (const part of item.parts) {
      for (const step of part.steps) {
        if (step.departmentId === departmentId) {
          result.push(step);
        }
      }
    }
  }

  return result;
}

/**
 * Calculate total material quantities needed for a set of department steps,
 * multiplied by the given order quantity.
 *
 * Returns a map of materialId → { materialName, unit, totalQuantity }.
 */
export function calculateDepartmentMaterials(
  departmentSteps: PrintStep[],
  quantity: number
): Array<{
  materialId: string;
  materialName: string;
  unit: string;
  totalQuantity: number;
}> {
  const materialMap = new Map<
    string,
    { materialName: string; unit: string; totalQuantity: number }
  >();

  for (const step of departmentSteps) {
    for (const mat of step.materials) {
      const existing = materialMap.get(mat.materialId);
      const additionalQty = mat.quantity * quantity;

      if (existing) {
        existing.totalQuantity += additionalQty;
      } else {
        materialMap.set(mat.materialId, {
          materialName: mat.materialName,
          unit: mat.unit,
          totalQuantity: additionalQty,
        });
      }
    }
  }

  return Array.from(materialMap.entries()).map(([materialId, data]) => ({
    materialId,
    ...data,
  }));
}

/**
 * Row shape for radni nalog (work order) table.
 * Pure data — no barcode images (those require async generation).
 */
export interface RadniNalogRowData {
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
  loadingSequence: number | null;
  notes: string | null;
}

/**
 * Build radni nalog rows from PrintData (pure, synchronous).
 * Each item is expanded by its quantity — one row per unit.
 * Row numbers (rb) are assigned sequentially starting at 1.
 */
export function buildRadniNalogRows(data: PrintData): RadniNalogRowData[] {
  const rows: RadniNalogRowData[] = [];
  let rb = 0;

  for (const item of data.items) {
    for (let i = 0; i < item.quantity; i++) {
      rb++;
      rows.push({
        rb,
        articleName: `${item.articleName}${item.articleCode ? ` / ${item.articleCode}` : ""}`,
        articleCode: item.articleCode,
        articleDescription: item.articleDescription,
        quantity: 1,
        parts: item.parts.map((p) => p.partName).join("+"),
        fabricName: item.fabric?.name ?? null,
        deadline: item.deliveryDeadline,
        customerOrderNumber: item.customerOrderNumber,
        loadingNumber: item.loadingNumber,
        loadingSequence: item.loadingSequence,
        notes: item.notes,
      });
    }
  }

  return rows;
}

// ─── Shared LabelGroup types ─────────────────────────────

/** Article label data for pakovanje labels. */
export interface PakovanjeArticleLabel {
  articleName: string;
  articleCode: string | null;
  allParts: string;
  footerComponents: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null;
  orderNumber: number;
  date: string;
  customerName: string | null;
  /** Only present in bulk page labels (has barcode data). */
  barcodeValue?: string | null;
  barcodeImage?: string | null;
}

/** Component label data for pakovanje labels. */
export interface PakovanjeComponentLabel {
  articleName: string;
  articleCode: string | null;
  componentName: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null;
  barcodeValue: string;
  barcodeImage: string;
  orderNumber: number;
  date: string;
  customerName: string | null;
}

/**
 * A group of labels for a single article unit in pakovanje printing.
 * Contains the article label and its component (CB) labels.
 */
export interface PakovanjeLabelGroup {
  article: PakovanjeArticleLabel;
  componentLabels: PakovanjeComponentLabel[];
}

// ─── Serial number grouping ─────────────────────────────

/**
 * Group LabelGroup items by serial number so that items sharing the same
 * serial number appear consecutively. Items with null/empty serial numbers
 * are left in their current position (not grouped with each other).
 * Preserves relative order within each serial number group.
 *
 * Algorithm:
 * 1. Iterate through the groups in order
 * 2. For each group with a non-null, non-empty serial number, collect it
 *    into a map keyed by serial number (preserving insertion order)
 * 3. Items with null/empty serial numbers are treated as unique (not grouped)
 * 4. Rebuild the output array: when encountering the first item of a serial
 *    number group, emit all items in that group, then skip subsequent occurrences
 */
export function groupBySerialNumber<T extends { article: { serialNumber: string | null } }>(
  groups: T[]
): T[] {
  // Collect items by serial number, preserving order within each group
  const serialMap = new Map<string, T[]>();
  for (const group of groups) {
    const sn = group.article.serialNumber;
    if (sn != null && sn !== "") {
      if (!serialMap.has(sn)) {
        serialMap.set(sn, []);
      }
      serialMap.get(sn)!.push(group);
    }
  }

  // Track which serial numbers have already been emitted
  const emitted = new Set<string>();
  const result: T[] = [];

  for (const group of groups) {
    const sn = group.article.serialNumber;
    if (sn == null || sn === "") {
      // Null/empty serial numbers pass through in place
      result.push(group);
    } else if (!emitted.has(sn)) {
      // First occurrence of this serial number: emit all items in the group
      emitted.add(sn);
      const serialGroup = serialMap.get(sn)!;
      for (const item of serialGroup) {
        result.push(item);
      }
    }
    // Subsequent occurrences are skipped (already emitted with the first)
  }

  return result;
}

// ─── Plan utroška types & builder ────────────────────────

export interface MaterialRow {
  materialCode: string | null;
  materialName: string;
  unit: string;
  quantity: number;
  pieces: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  isEdgebanded: boolean | null;
  isOverridden: boolean;
  originalMaterialName: string | null;
  totalQuantity: number;
  totalPieces: number | null;
}

export interface ArticleBlock {
  rb: number;
  articleCode: string | null;
  articleName: string;
  unit: string | null;
  orderQuantity: number;
  partName: string;
  fabricName: string | null;
  nogice1Name: string | null;
  nogice2Name: string | null;
  ruckaName: string | null;
  paspulName: string | null;
  stepName: string | null;
  customerOrderNumber: string | null;
  notes: string | null;
  materials: MaterialRow[];
}

export interface DeptSection {
  departmentId: string;
  departmentName: string;
  articles: ArticleBlock[];
  recap: Array<{
    materialCode: string | null;
    materialName: string;
    unit: string;
    totalQuantity: number;
    totalPieces: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    isEdgebanded: boolean | null;
    isOverridden: boolean;
    originalMaterialName: string | null;
  }>;
}

// ─── Recap grouping key helper ───────────────────────────

/**
 * Build the grouping key for recap entries.
 * For fabric overrides (originalMaterialName === "Štof za sve"), dimensions are
 * excluded from the key so all fabric usages with the same code/name are summed
 * into a single recap row regardless of dimensions.
 * For all other materials, the dimension-aware key is preserved.
 */
function buildRecapKey(
  materialCode: string | null,
  materialName: string,
  length: number | null,
  width: number | null,
  height: number | null,
  originalMaterialName: string | null,
): string {
  const isFabric = originalMaterialName?.trim().toLowerCase() === "štof za sve";
  if (isFabric) {
    return `${materialCode ?? materialName}::fabric`;
  }
  const dimPart = [length ?? "", width ?? "", height ?? ""].join("|");
  return `${materialCode ?? materialName}::${dimPart}`;
}

// ─── Combined recap types ────────────────────────────────

export interface CombinedRecapEntry {
  materialCode: string | null;
  materialName: string;
  unit: string;
  totalQuantity: number;
  totalPieces: number | null;
  /** Total number of articles (beds) that use this material. */
  articleQuantity: number;
  length: number | null;
  width: number | null;
  height: number | null;
  isEdgebanded: boolean | null;
  isOverridden: boolean;
  originalMaterialName: string | null;
}

export interface CombinedDeptRecap {
  departmentId: string;
  departmentName: string;
  recap: CombinedRecapEntry[];
}

/**
 * Combine recap entries from multiple orders' DeptSections into a single
 * combined recap per department. Uses dimension-aware Material_Key for grouping.
 *
 * @param orderDeptSections - Array of DeptSection arrays, one per order (in order-processing sequence)
 * @returns Array of CombinedDeptRecap, one per unique department across all orders
 */
export function combineRecaps(orderDeptSections: DeptSection[][]): CombinedDeptRecap[] {
  const deptMap = new Map<string, { name: string; recapMap: Map<string, CombinedRecapEntry> }>();

  for (const sections of orderDeptSections) {
    for (const section of sections) {
      if (!deptMap.has(section.departmentId)) {
        deptMap.set(section.departmentId, { name: section.departmentName, recapMap: new Map() });
      }
      const dept = deptMap.get(section.departmentId)!;

      // Build a map of material key → total article quantity from the articles array
      const materialArticleQty = new Map<string, number>();
      for (const article of section.articles) {
        for (const mat of article.materials) {
          const key = buildRecapKey(mat.materialCode, mat.materialName, mat.length, mat.width, mat.height, mat.originalMaterialName);
          materialArticleQty.set(key, (materialArticleQty.get(key) ?? 0) + article.orderQuantity);
        }
      }

      for (const entry of section.recap) {
        const key = buildRecapKey(entry.materialCode, entry.materialName, entry.length, entry.width, entry.height, entry.originalMaterialName);

        const existing = dept.recapMap.get(key);
        if (existing) {
          existing.totalQuantity += entry.totalQuantity;
          existing.articleQuantity += materialArticleQty.get(key) ?? 0;
          if (existing.totalPieces === null && entry.totalPieces === null) {
            // remain null
          } else {
            existing.totalPieces = (existing.totalPieces ?? 0) + (entry.totalPieces ?? 0);
          }
        } else {
          dept.recapMap.set(key, {
            materialCode: entry.materialCode,
            materialName: entry.materialName,
            unit: entry.unit,
            totalQuantity: entry.totalQuantity,
            totalPieces: entry.totalPieces,
            articleQuantity: materialArticleQty.get(key) ?? 0,
            length: entry.length,
            width: entry.width,
            height: entry.height,
            isEdgebanded: entry.isEdgebanded,
            isOverridden: entry.isOverridden,
            originalMaterialName: entry.originalMaterialName,
          });
        }
      }
    }
  }

  const result: CombinedDeptRecap[] = [];
  for (const [departmentId, dept] of deptMap) {
    const recap = Array.from(dept.recapMap.values());
    if (recap.length === 0) continue;
    result.push({ departmentId, departmentName: dept.name, recap });
  }

  return result;
}

/**
 * Combine recap entries from multiple orders' DeptSections into a single
 * flat list of materials (ignoring department grouping), sorted by materialName.
 * Uses dimension-aware Material_Key for grouping identical materials.
 *
 * @param orderDeptSections - Array of DeptSection arrays, one per order
 * @returns Flat array of CombinedRecapEntry sorted by materialName
 */
export function combineRecapsFlat(orderDeptSections: DeptSection[][], articleQuantities?: Map<string, number>): CombinedRecapEntry[] {
  const recapMap = new Map<string, CombinedRecapEntry>();
  // Track which article names have already been counted for each material key.
  // This prevents double-counting when the same article uses the same material
  // in multiple departments/steps.
  const countedArticles = new Map<string, Set<string>>();

  for (const sections of orderDeptSections) {
    for (const section of sections) {
      // Build a map of material key → list of {articleName, orderQuantity} from articles
      const materialArticles = new Map<string, Array<{ articleName: string; qty: number }>>();
      for (const article of section.articles) {
        for (const mat of article.materials) {
          const key = buildRecapKey(mat.materialCode, mat.materialName, mat.length, mat.width, mat.height, mat.originalMaterialName);
          if (!materialArticles.has(key)) materialArticles.set(key, []);
          materialArticles.get(key)!.push({ articleName: article.articleName, qty: article.orderQuantity });
        }
      }

      for (const entry of section.recap) {
        const key = buildRecapKey(entry.materialCode, entry.materialName, entry.length, entry.width, entry.height, entry.originalMaterialName);

        if (!countedArticles.has(key)) countedArticles.set(key, new Set());
        const seen = countedArticles.get(key)!;

        // Sum article quantity only for article names not yet counted for this material
        let newArticleQty = 0;
        const articles = materialArticles.get(key) ?? [];
        for (const { articleName, qty } of articles) {
          if (!seen.has(articleName)) {
            seen.add(articleName);
            // Use the authoritative quantity from articleQuantities map if provided
            newArticleQty += articleQuantities ? (articleQuantities.get(articleName) ?? qty) : qty;
          }
        }

        const existing = recapMap.get(key);
        if (existing) {
          existing.totalQuantity += entry.totalQuantity;
          existing.articleQuantity += newArticleQty;
          if (existing.totalPieces === null && entry.totalPieces === null) {
            // remain null
          } else {
            existing.totalPieces = (existing.totalPieces ?? 0) + (entry.totalPieces ?? 0);
          }
        } else {
          recapMap.set(key, {
            materialCode: entry.materialCode,
            materialName: entry.materialName,
            unit: entry.unit,
            totalQuantity: entry.totalQuantity,
            totalPieces: entry.totalPieces,
            articleQuantity: newArticleQty,
            length: entry.length,
            width: entry.width,
            height: entry.height,
            isEdgebanded: entry.isEdgebanded,
            isOverridden: entry.isOverridden,
            originalMaterialName: entry.originalMaterialName,
          });
        }
      }
    }
  }

  return Array.from(recapMap.values()).sort((a, b) =>
    a.materialName.localeCompare(b.materialName, "bs")
  );
}

// ─── Grouped recap by article (bed) name ─────────────────

export interface ArticleRecapGroup {
  articleName: string;
  totalOrderQuantity: number;
  materials: CombinedRecapEntry[];
}

/**
 * Flat recap entry that includes the article (bed) name alongside the material.
 * Used when groupByBed is enabled to show which materials belong to which bed
 * in a single flat table with an extra "NAZIV KREVETA" column.
 */
export interface ArticleMaterialRecapEntry extends CombinedRecapEntry {
  /** The article/bed name this material belongs to */
  articleName: string;
  /** Total order quantity for this article */
  articleOrderQuantity: number;
}

/**
 * Combine recap entries from multiple orders' DeptSections into a flat list
 * where each material row is tagged with its article (bed) name.
 * Sorted primarily by material name, then by article name within the same material.
 *
 * This produces a single flat table where you can see for each material
 * which bed it belongs to and how many of that bed are ordered.
 *
 * @param orderDeptSections - Array of DeptSection arrays, one per order
 * @param articleQuantities - Map of articleName → total order quantity (from PrintData items)
 * @returns Flat array of ArticleMaterialRecapEntry sorted by materialName then articleName
 */
export function combineRecapsByArticle(
  orderDeptSections: DeptSection[][],
  articleQuantities: Map<string, number>,
): ArticleMaterialRecapEntry[] {
  // Composite key: articleName + materialKey
  const entryMap = new Map<string, ArticleMaterialRecapEntry>();

  for (const sections of orderDeptSections) {
    for (const section of sections) {
      for (const article of section.articles) {
        const { articleName, materials } = article;

        for (const mat of materials) {
          const materialKey = buildRecapKey(mat.materialCode, mat.materialName, mat.length, mat.width, mat.height, mat.originalMaterialName);
          const compositeKey = `${articleName}::${materialKey}`;

          const existing = entryMap.get(compositeKey);
          if (existing) {
            existing.totalQuantity += mat.totalQuantity;
            if (existing.totalPieces === null && mat.totalPieces === null) {
              // remain null
            } else {
              existing.totalPieces = (existing.totalPieces ?? 0) + (mat.totalPieces ?? 0);
            }
          } else {
            entryMap.set(compositeKey, {
              materialCode: mat.materialCode,
              materialName: mat.materialName,
              unit: mat.unit,
              totalQuantity: mat.totalQuantity,
              totalPieces: mat.totalPieces,
              articleQuantity: articleQuantities.get(articleName) ?? 0,
              length: mat.length,
              width: mat.width,
              height: mat.height,
              isEdgebanded: mat.isEdgebanded,
              isOverridden: mat.isOverridden,
              originalMaterialName: mat.originalMaterialName,
              articleName,
              articleOrderQuantity: articleQuantities.get(articleName) ?? 0,
            });
          }
        }
      }
    }
  }

  const result = Array.from(entryMap.values());

  // Sort by materialName first, then articleName within same material
  return result.sort((a, b) => {
    const matCmp = a.materialName.localeCompare(b.materialName, "bs");
    if (matCmp !== 0) return matCmp;
    return a.articleName.localeCompare(b.articleName, "bs");
  });
}

/**
 * Build category item material rows for a given item.
 * Returns MaterialRow[] for category items (rucka, paspul, nogice1, nogice2).
 * - Items with linked material: use material name, code, unit; quantity = 1 × item quantity
 * - Items without linked material: use category item name, empty code, "kom" unit
 */
function buildCategoryItemMaterialRows(
  item: PrintData["items"][number],
  consumedCategories: Set<CategoryType> = new Set()
): MaterialRow[] {
  const rows: MaterialRow[] = [];

  // Map each category item to its CategoryType for filtering
  const categoryEntries: { ci: CategoryItemPrintData | null; type: CategoryType }[] = [
    { ci: item.rucka, type: "rucka" },
    { ci: item.paspul, type: "paspul" },
    { ci: item.nogice1, type: "nogice" },
    { ci: item.nogice2, type: "nogice" },
  ];

  for (const { ci, type } of categoryEntries) {
    if (!ci) continue;
    // Skip category items whose type was consumed by placeholder override
    if (consumedCategories.has(type)) continue;
    const hasLinkedMaterial = ci.materialId != null;
    rows.push({
      materialCode: hasLinkedMaterial ? (ci.materialCode ?? null) : null,
      materialName: hasLinkedMaterial ? (ci.materialName ?? ci.name) : ci.name,
      unit: hasLinkedMaterial ? (ci.materialUnit ?? "kom") : "kom",
      quantity: 1,
      pieces: null,
      length: null,
      width: null,
      height: null,
      isEdgebanded: null,
      isOverridden: false,
      originalMaterialName: null,
      totalQuantity: 1 * item.quantity,
      totalPieces: null,
    });
  }

  return rows;
}

/**
 * Build department sections using dimension-aware Material_Key for recap grouping.
 * Key format: `${materialCode ?? materialName}::${length ?? ""}|${width ?? ""}|${height ?? ""}`
 *
 * This is the same logic as the local buildDeptSections in the plan-utroska page,
 * extracted to be reusable by the combined recap feature.
 *
 * Category item materials (rucka, paspul, nogice1, nogice2) are appended after
 * BOM material rows for each article block and included in the rekapitulacija.
 */
export function buildDeptSectionsWithDimensions(data: PrintData): DeptSection[] {
  const deptMap = new Map<string, {
    name: string;
    articles: ArticleBlock[];
    recapMap: Map<string, {
      code: string | null; name: string; unit: string; qty: number; pcs: number | null;
      length: number | null; width: number | null; height: number | null;
      isEdgebanded: boolean | null;
      isOverridden: boolean; originalMaterialName: string | null;
    }>;
  }>();

  type DeptEntry = {
    name: string;
    articles: ArticleBlock[];
    recapMap: Map<string, {
      code: string | null; name: string; unit: string; qty: number; pcs: number | null;
      length: number | null; width: number | null; height: number | null;
      isEdgebanded: boolean | null;
      isOverridden: boolean; originalMaterialName: string | null;
    }>;
  };

  let rb = 0;
  for (const item of data.items) {
    // Track the last article block created for this item (to append category items)
    let lastBlockForItem: ArticleBlock | null = null;
    let lastDeptForItem: DeptEntry | null = null;

    for (const part of item.parts) {
      for (const step of part.steps) {
        const deptKey = step.departmentId;
        if (!deptMap.has(deptKey)) {
          deptMap.set(deptKey, { name: step.departmentName, articles: [], recapMap: new Map() });
        }
        const dept = deptMap.get(deptKey)!;
        if (step.materials.length === 0) continue;

        rb++;
        const materials: MaterialRow[] = step.materials.map((m) => ({
          materialCode: m.materialCode,
          materialName: m.materialName,
          unit: m.unit,
          quantity: m.quantity,
          pieces: m.pieces,
          length: m.length,
          width: m.width,
          height: m.height,
          isEdgebanded: m.isEdgebanded,
          isOverridden: m.isOverridden,
          originalMaterialName: m.originalMaterialName,
          totalQuantity: m.quantity * item.quantity,
          totalPieces: m.pieces != null ? m.pieces * item.quantity : null,
        }));

        const block: ArticleBlock = {
          rb,
          articleCode: item.articleCode,
          articleName: item.articleName,
          unit: "kom",
          orderQuantity: item.quantity,
          partName: part.partName,
          fabricName: item.fabric?.name ?? null,
          nogice1Name: item.nogice1?.name ?? null,
          nogice2Name: item.nogice2?.name ?? null,
          ruckaName: item.rucka?.name ?? null,
          paspulName: item.paspul?.name ?? null,
          stepName: step.stepName ?? null,
          customerOrderNumber: item.customerOrderNumber ?? null,
          notes: item.notes ?? null,
          materials,
        };
        dept.articles.push(block);
        lastBlockForItem = block;
        lastDeptForItem = dept;

        // Accumulate recap – dimension-aware key (fabrics grouped without dimensions)
        for (const m of materials) {
          const key = buildRecapKey(m.materialCode, m.materialName, m.length, m.width, m.height, m.originalMaterialName);
          const existing = dept.recapMap.get(key);
          if (existing) {
            existing.qty += m.totalQuantity;
            if (m.totalPieces != null) existing.pcs = (existing.pcs ?? 0) + m.totalPieces;
            // When merging fabric entries with different dimensions, clear dimensions
            const isFabric = m.originalMaterialName?.trim().toLowerCase() === "štof za sve";
            if (isFabric) {
              if (existing.length !== m.length || existing.width !== m.width || existing.height !== m.height) {
                existing.length = null;
                existing.width = null;
                existing.height = null;
              }
            }
          } else {
            dept.recapMap.set(key, {
              code: m.materialCode, name: m.materialName, unit: m.unit,
              qty: m.totalQuantity, pcs: m.totalPieces,
              length: m.length, width: m.width, height: m.height,
              isEdgebanded: m.isEdgebanded,
              isOverridden: m.isOverridden, originalMaterialName: m.originalMaterialName,
            });
          }
        }
      }
    }

    // Append category item materials to the last article block for this item
    if (lastBlockForItem && lastDeptForItem) {
      const categoryMaterials = buildCategoryItemMaterialRows(item, item.consumedCategories ?? new Set());
      if (categoryMaterials.length > 0) {
        lastBlockForItem.materials.push(...categoryMaterials);

        // Also add category item materials to the recap of that department
        for (const m of categoryMaterials) {
          const key = buildRecapKey(m.materialCode, m.materialName, m.length, m.width, m.height, m.originalMaterialName);
          const existing = lastDeptForItem.recapMap.get(key);
          if (existing) {
            existing.qty += m.totalQuantity;
            if (m.totalPieces != null) existing.pcs = (existing.pcs ?? 0) + m.totalPieces;
            const isFabric = m.originalMaterialName?.trim().toLowerCase() === "štof za sve";
            if (isFabric) {
              if (existing.length !== m.length || existing.width !== m.width || existing.height !== m.height) {
                existing.length = null;
                existing.width = null;
                existing.height = null;
              }
            }
          } else {
            lastDeptForItem.recapMap.set(key, {
              code: m.materialCode, name: m.materialName, unit: m.unit,
              qty: m.totalQuantity, pcs: m.totalPieces,
              length: m.length, width: m.width, height: m.height,
              isEdgebanded: m.isEdgebanded,
              isOverridden: m.isOverridden, originalMaterialName: m.originalMaterialName,
            });
          }
        }
      }
    }
  }

  return Array.from(deptMap.entries()).map(([deptId, d]) => ({
    departmentId: deptId,
    departmentName: d.name,
    articles: d.articles,
    recap: Array.from(d.recapMap.values()).map((r) => ({
      materialCode: r.code, materialName: r.name, unit: r.unit,
      totalQuantity: r.qty, totalPieces: r.pcs,
      length: r.length, width: r.width, height: r.height,
      isEdgebanded: r.isEdgebanded,
      isOverridden: r.isOverridden, originalMaterialName: r.originalMaterialName,
    })),
  }));
}

/**
 * Build department sections from PrintData for the plan utroška materijala.
 * Groups steps by department, builds article blocks with material rows,
 * and computes a recap (rekapitulacija) of total material quantities per department.
 * Note: This version uses materialCode/materialName only as the recap key (no dimensions).
 *
 * Category item materials (rucka, paspul, nogice1, nogice2) are appended after
 * BOM material rows for each article block and included in the rekapitulacija.
 */
export function buildDeptSections(data: PrintData): DeptSection[] {
  const deptMap = new Map<string, {
    name: string;
    articles: ArticleBlock[];
    recapMap: Map<string, {
      code: string | null; name: string; unit: string; qty: number; pcs: number | null;
      length: number | null; width: number | null; height: number | null;
      isEdgebanded: boolean | null;
      isOverridden: boolean; originalMaterialName: string | null;
    }>;
  }>();

  type DeptEntry = {
    name: string;
    articles: ArticleBlock[];
    recapMap: Map<string, {
      code: string | null; name: string; unit: string; qty: number; pcs: number | null;
      length: number | null; width: number | null; height: number | null;
      isEdgebanded: boolean | null;
      isOverridden: boolean; originalMaterialName: string | null;
    }>;
  };

  let rb = 0;
  for (const item of data.items) {
    // Track the last article block created for this item (to append category items)
    let lastBlockForItem: ArticleBlock | null = null;
    let lastDeptForItem: DeptEntry | null = null;

    for (const part of item.parts) {
      for (const step of part.steps) {
        const deptKey = step.departmentId;
        if (!deptMap.has(deptKey)) {
          deptMap.set(deptKey, { name: step.departmentName, articles: [], recapMap: new Map() });
        }
        const dept = deptMap.get(deptKey)!;
        if (step.materials.length === 0) continue;

        rb++;
        const materials: MaterialRow[] = step.materials.map((m) => ({
          materialCode: m.materialCode,
          materialName: m.materialName,
          unit: m.unit,
          quantity: m.quantity,
          pieces: m.pieces,
          length: m.length,
          width: m.width,
          height: m.height,
          isEdgebanded: m.isEdgebanded,
          isOverridden: m.isOverridden,
          originalMaterialName: m.originalMaterialName,
          totalQuantity: m.quantity * item.quantity,
          totalPieces: m.pieces != null ? m.pieces * item.quantity : null,
        }));

        const block: ArticleBlock = {
          rb,
          articleCode: item.articleCode,
          articleName: item.articleName,
          unit: "kom",
          orderQuantity: item.quantity,
          partName: part.partName,
          fabricName: item.fabric?.name ?? null,
          nogice1Name: item.nogice1?.name ?? null,
          nogice2Name: item.nogice2?.name ?? null,
          ruckaName: item.rucka?.name ?? null,
          paspulName: item.paspul?.name ?? null,
          stepName: step.stepName ?? null,
          customerOrderNumber: item.customerOrderNumber ?? null,
          notes: item.notes ?? null,
          materials,
        };
        dept.articles.push(block);
        lastBlockForItem = block;
        lastDeptForItem = dept;

        for (const m of materials) {
          const key = m.materialCode ?? m.materialName;
          const existing = dept.recapMap.get(key);
          if (existing) {
            existing.qty += m.totalQuantity;
            if (m.totalPieces != null) existing.pcs = (existing.pcs ?? 0) + m.totalPieces;
          } else {
            dept.recapMap.set(key, {
              code: m.materialCode, name: m.materialName, unit: m.unit,
              qty: m.totalQuantity, pcs: m.totalPieces,
              length: m.length, width: m.width, height: m.height,
              isEdgebanded: m.isEdgebanded,
              isOverridden: m.isOverridden, originalMaterialName: m.originalMaterialName,
            });
          }
        }
      }
    }

    // Append category item materials to the last article block for this item
    if (lastBlockForItem && lastDeptForItem) {
      const categoryMaterials = buildCategoryItemMaterialRows(item, item.consumedCategories ?? new Set());
      if (categoryMaterials.length > 0) {
        lastBlockForItem.materials.push(...categoryMaterials);

        // Also add category item materials to the recap of that department
        for (const m of categoryMaterials) {
          const key = m.materialCode ?? m.materialName;
          const existing = lastDeptForItem.recapMap.get(key);
          if (existing) {
            existing.qty += m.totalQuantity;
            if (m.totalPieces != null) existing.pcs = (existing.pcs ?? 0) + m.totalPieces;
          } else {
            lastDeptForItem.recapMap.set(key, {
              code: m.materialCode, name: m.materialName, unit: m.unit,
              qty: m.totalQuantity, pcs: m.totalPieces,
              length: m.length, width: m.width, height: m.height,
              isEdgebanded: m.isEdgebanded,
              isOverridden: m.isOverridden, originalMaterialName: m.originalMaterialName,
            });
          }
        }
      }
    }
  }

  return Array.from(deptMap.entries()).map(([deptId, d]) => ({
    departmentId: deptId,
    departmentName: d.name,
    articles: d.articles,
    recap: Array.from(d.recapMap.values()).map((r) => ({
      materialCode: r.code, materialName: r.name, unit: r.unit,
      totalQuantity: r.qty, totalPieces: r.pcs,
      length: r.length, width: r.width, height: r.height,
      isEdgebanded: r.isEdgebanded,
      isOverridden: r.isOverridden, originalMaterialName: r.originalMaterialName,
    })),
  }));
}

// ─── Article name helpers ────────────────────────────────

/**
 * Extract short article name: model + dimensions (+ optional variant suffix).
 * Strips content type suffixes like "baza + uzglavlje", "madrac", "krevet + madrac", "L+D SANDUK" etc.
 * Keeps variant letters like "M" in "CARMEN 180X200 M baza + uzglavlje" → "CARMEN 180X200 M"
 *
 * Falls back to the full name (minus trailing "-NOVO"/"NOVO") if no keyword is found.
 */
export function shortArticleName(name: string): string {
  const pattern = /\s+(?:baza|uzglavlje|madrac|krevet|sanduk|l\+d|l\s*\+\s*d)(?:\b|\s|[+\-])/i;
  const idx = name.search(pattern);
  if (idx > 0) return name.slice(0, idx).trim();
  return name.replace(/[\s\-]*NOVO\s*$/i, '').trim();
}

// ─── Sort helpers ────────────────────────────────────────

export type SortKey = "loadingNumber" | "loadingSequence" | "serialNumber" | "rb" | "deliveryDate" | "abc";

/**
 * Parse sort parameter from URL: comma-separated sort keys.
 * Example: "loadingNumber,rb" → ["loadingNumber", "rb"]
 */
export function parseSortParam(param: string | undefined): SortKey[] {
  if (!param) return [];
  const valid = new Set<SortKey>(["loadingNumber", "loadingSequence", "serialNumber", "rb", "deliveryDate", "abc"]);
  return param.split(",").filter((k): k is SortKey => valid.has(k as SortKey));
}

/**
 * Minimal shape required by `compareItemsBySortKeys`. Any row-like object
 * that exposes these fields can participate in hierarchical sorting — both
 * `PrintData.items` (via an adapter that maps `deliveryDeadline → deadline`)
 * and `SummaryRow` (which already uses `deadline`) are compatible.
 */
export interface ComparableItem {
  articleName: string;
  loadingNumber: string | null;
  serialNumber: string | null;
  loadingSequence: number | null;
  deadline: Date | null;
}

/**
 * Shared hierarchical comparator used by `sortPrintData` (for individual
 * work orders) and `buildSummaryRows` (for summary / zbirni work orders).
 *
 * Semantics per key mirror the original in-line comparator in `sortPrintData`:
 *   - `abc`            → `articleName.localeCompare(…, "bs")`
 *   - `loadingNumber`  → `localeCompare(…, "bs", { numeric: true })`, `null` → `""`
 *   - `serialNumber`   → `localeCompare(…, "bs", { numeric: true })`, `null` → `""`
 *   - `deliveryDate`   → `deadline.getTime()` ascending; `null`/`NaN` → end
 *   - `loadingSequence`→ numeric ascending; `null` → end
 *   - `rb`             → no-op (relies on `Array.prototype.sort` stability)
 *
 * Returns 0 when all provided keys yield equality, which lets the stable
 * sort implementation preserve the incoming order as the final tie-breaker.
 */
export function compareItemsBySortKeys(
  a: ComparableItem,
  b: ComparableItem,
  keys: SortKey[]
): number {
  for (const key of keys) {
    let cmp = 0;
    switch (key) {
      case "abc":
        cmp = a.articleName.localeCompare(b.articleName, "bs");
        break;
      case "loadingNumber": {
        const aVal = a.loadingNumber ?? "";
        const bVal = b.loadingNumber ?? "";
        cmp = aVal.localeCompare(bVal, "bs", { numeric: true });
        break;
      }
      case "serialNumber": {
        const aS = a.serialNumber ?? "";
        const bS = b.serialNumber ?? "";
        cmp = aS.localeCompare(bS, "bs", { numeric: true });
        break;
      }
      case "deliveryDate": {
        const aRaw = a.deadline?.getTime();
        const bRaw = b.deadline?.getTime();
        const aTime = aRaw != null && !Number.isNaN(aRaw) ? aRaw : null;
        const bTime = bRaw != null && !Number.isNaN(bRaw) ? bRaw : null;
        if (aTime == null && bTime == null) cmp = 0;
        else if (aTime == null) cmp = 1;
        else if (bTime == null) cmp = -1;
        else cmp = aTime - bTime;
        break;
      }
      case "loadingSequence": {
        const aSeq = a.loadingSequence;
        const bSeq = b.loadingSequence;
        if (aSeq == null && bSeq == null) cmp = 0;
        else if (aSeq == null) cmp = 1;
        else if (bSeq == null) cmp = -1;
        else cmp = aSeq - bSeq;
        break;
      }
      case "rb":
        // no-op: relies on stability of Array.prototype.sort
        break;
    }
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Sort PrintData items in-place by the given sort keys (hierarchical).
 * Returns a new PrintData with sorted items.
 *
 * Delegates the per-pair comparison to `compareItemsBySortKeys`. The only
 * adaptation is field naming: `PrintData.items` exposes `deliveryDeadline`
 * while the shared comparator reads `deadline`, so we map inside the sort
 * callback without mutating the original items.
 */
export function sortPrintData(data: PrintData, keys: SortKey[]): PrintData {
  if (keys.length === 0) return data;
  const sorted = [...data.items].sort((a, b) => {
    const aComparable: ComparableItem = {
      articleName: a.articleName,
      loadingNumber: a.loadingNumber,
      serialNumber: a.serialNumber,
      loadingSequence: a.loadingSequence,
      deadline: a.deliveryDeadline,
    };
    const bComparable: ComparableItem = {
      articleName: b.articleName,
      loadingNumber: b.loadingNumber,
      serialNumber: b.serialNumber,
      loadingSequence: b.loadingSequence,
      deadline: b.deliveryDeadline,
    };
    return compareItemsBySortKeys(aComparable, bComparable, keys);
  });
  return { ...data, items: sorted };
}

/**
 * Aggregate PrintData items by articleId + fabricId, summing quantities.
 * Used for "saberi artikle" mode on plan utroška.
 */
export function aggregatePrintData(data: PrintData): PrintData {
  const map = new Map<string, PrintData["items"][0]>();
  for (const item of data.items) {
    const key = `${item.articleId}::${item.fabric?.id ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return { ...data, items: Array.from(map.values()) };
}


// ─── Set Count Helpers ───────────────────────────────────

/**
 * Row type classification for set counting.
 * - 'kombinirani': row contains both "krevet" and "madrac"
 * - 'krevet': row contains only "krevet"
 * - 'madrac': row contains only "madrac"
 * - 'none': row contains neither
 */
export type SetRowType = 'kombinirani' | 'krevet' | 'madrac' | 'none';

/**
 * Classify a row based on keyword presence in its combined text.
 * Combines articleName, articleDescription, and parts into a single
 * search string, then checks for "krevet" and "madrac" (case-insensitive).
 */
export function classifyRowForSet(row: {
  articleName: string;
  articleDescription: string | null;
  parts: string;
}): SetRowType {
  const combined = `${row.articleName} ${row.articleDescription ?? ""} ${row.parts}`.toLowerCase();
  const hasKrevet = combined.includes("krevet");
  const hasMadrac = combined.includes("madrac");

  if (hasKrevet && hasMadrac) return 'kombinirani';
  if (hasKrevet) return 'krevet';
  if (hasMadrac) return 'madrac';
  return 'none';
}

/**
 * Calculate the total set count from an array of rows.
 * A "set" is a bed+mattress pair. Each row is classified and contributes:
 * - kombinirani: 1 bed + 1 mattress
 * - krevet: 1 bed + 0 mattresses
 * - madrac: 0 beds + 1 mattress
 * - none: 0 beds + 0 mattresses
 * Returns (totalBeds + totalMattresses) / 2.
 */
export function calculateSetCount(rows: Array<{
  articleName: string;
  articleDescription: string | null;
  parts: string;
}>): number {
  let totalBeds = 0;
  let totalMattresses = 0;

  for (const row of rows) {
    const type = classifyRowForSet(row);
    if (type === 'kombinirani') {
      totalBeds += 1;
      totalMattresses += 1;
    } else if (type === 'krevet') {
      totalBeds += 1;
    } else if (type === 'madrac') {
      totalMattresses += 1;
    }
  }

  return (totalBeds + totalMattresses) / 2;
}

/**
 * Format the set count for display.
 * Whole numbers display without decimals (e.g. "8"),
 * non-whole numbers display with one decimal place (e.g. "7.5").
 */
export function formatSetCount(count: number): string {
  if (Number.isInteger(count)) {
    return count.toFixed(0);
  }
  return count.toFixed(1);
}

// ─── Articles Without BOM (Normativ) ────────────────────

/**
 * Entry representing an article that has no materials defined
 * across any of its parts/steps (no normativ/BOM).
 */
export interface ArticleWithoutBom {
  articleName: string;
  articleCode: string | null;
  quantity: number;
}

/**
 * Find articles in PrintData that have zero materials across all parts/steps.
 * Also considers category items (rucka, paspul, nogice1, nogice2) — if none
 * of them are set AND no BOM materials exist, the article is "bez normativa".
 *
 * Returns deduplicated list (by articleName) with summed quantities.
 */
export function getArticlesWithoutBom(data: PrintData): ArticleWithoutBom[] {
  const map = new Map<string, ArticleWithoutBom>();

  for (const item of data.items) {
    // Check if any part/step has materials
    let hasMaterials = false;
    for (const part of item.parts) {
      for (const step of part.steps) {
        if (step.materials.length > 0) {
          hasMaterials = true;
          break;
        }
      }
      if (hasMaterials) break;
    }

    // Also check category items
    if (!hasMaterials) {
      const hasCategoryItems = !!(item.rucka || item.paspul || item.nogice1 || item.nogice2);
      if (hasCategoryItems) hasMaterials = true;
    }

    if (!hasMaterials) {
      const existing = map.get(item.articleName);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        map.set(item.articleName, {
          articleName: item.articleName,
          articleCode: item.articleCode,
          quantity: item.quantity,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.articleName.localeCompare(b.articleName, "bs"));
}


// ─── Set name override for pakovanje labels ──────────────

/**
 * For sets (krevet + madrac sharing the same serial number), override the
 * madrac's label "Naziv" field with the krevet's article name, and store
 * the madrac's original name so it can be displayed below the "Napomena"
 * field on the label.
 *
 * Detects krevet vs madrac using the article name / description
 * (same heuristic as radni nalog merge logic).
 *
 * Works on any array of groups that have an `article.serialNumber` and
 * `componentLabels` with `articleName` and optional `originalArticleName`.
 */
export function applySetNameOverrides<
  T extends {
    article: { serialNumber: string | null; articleName?: string };
    componentLabels: Array<{
      articleName: string;
      originalArticleName?: string | null;
    }>;
  }
>(groups: T[]): T[] {
  // Group by serial number
  const serialMap = new Map<string, T[]>();
  for (const group of groups) {
    const sn = group.article.serialNumber;
    if (sn != null && sn !== "") {
      if (!serialMap.has(sn)) serialMap.set(sn, []);
      serialMap.get(sn)!.push(group);
    }
  }

  // For each serial group with more than one item, find krevet and override madrac
  for (const [, serialGroups] of serialMap) {
    if (serialGroups.length <= 1) continue;

    // Identify madrac items — anything with "madrac" in the name that is NOT also a krevet+madrac set article
    function isMadrac(g: T): boolean {
      const name = (g.article.articleName ?? "").toLowerCase();
      // Pure madrac: contains "madrac" but NOT "krevet" and NOT "baza"
      return name.includes("madrac") && !name.includes("krevet") && !name.includes("baza");
    }

    // The "krevet" (bed frame / set owner) is any item that is NOT the madrac
    // In a serial group, the non-madrac item is the set owner whose name should appear on madrac labels
    const krevetGroup = serialGroups.find((g) => !isMadrac(g));
    if (!krevetGroup) continue;

    const krevetName = krevetGroup.article.articleName ?? krevetGroup.componentLabels[0]?.articleName ?? "";

    // Helper: extract model/base name by stripping keywords and dimensions suffix
    function baseName(name: string): string {
      return name
        .toLowerCase()
        .replace(/\s*\d+\s*[xX×]\s*\d+.*$/, "") // strip dimensions and everything after
        .replace(/krevet/g, "")
        .replace(/madrac/g, "")
        .replace(/baza\s*\+?\s*uzglavlje/g, "")
        .replace(/baza/g, "")
        .replace(/[/+]/g, "")
        .trim();
    }

    // Override madrac labels to use krevet's name — only when names are DIFFERENT
    for (const group of serialGroups) {
      if (group === krevetGroup) continue;
      if (!isMadrac(group)) continue;

      const madracName = group.article.articleName ?? group.componentLabels[0]?.articleName ?? "";

      // Compare base names: if they're the same model, no override needed
      const krevetBase = baseName(krevetName);
      const madracBase = baseName(madracName);
      if (krevetBase === madracBase) continue;

      for (const cl of group.componentLabels) {
        // Store original madrac article name
        cl.originalArticleName = cl.articleName;
        // Replace with krevet name
        cl.articleName = krevetName;
      }
    }
  }

  return groups;
}
