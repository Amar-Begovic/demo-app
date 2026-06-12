import { prisma } from "@/lib/db";
import type { ProductionOrder, PurchaseOrder, Supplier, WorkOrder } from "@/app/generated/prisma";
import { Prisma } from "@/app/generated/prisma";
import type { OrderPriority } from "@/app/generated/prisma";
import { ProductionOrderStatus, WorkOrderStatus, BarcodeType } from "@/app/generated/prisma";
import { ArticleService } from "@/lib/services/article.service";
import { AuditLogService } from "@/lib/services/audit-log.service";
import {
  checkMaterialAvailability,
  calculateProgress,
  getEarliestDeadline,
} from "@/lib/utils/calculations";
import { ProductionStepService } from "@/lib/services/production-step.service";
import { BarcodeService } from "@/lib/services/barcode.service";
import { getEditableFields } from "@/lib/utils/production-order-fields";
import type {
  MaterialCheckResult,
  MaterialRequirement,
  ProductionOrderProgress,
} from "@/lib/types";
import type { PaginationParams, PaginatedResponse } from "@/lib/types/pagination";
import { NormativeVersionService } from "@/lib/services/normative-version.service";
import { areComplementary } from "@/lib/services/complementary-set";
import {
  applyCategoryItemOverrides,
  detectPlaceholder,
  type CategorySelections,
  type CategoryItemSelection,
  type NormativeMaterial,
  type CategoryType,
} from "@/lib/utils/category-item-override";

/**
 * Normalize a step value: trim whitespace, return null if empty/whitespace-only.
 * Throws if the trimmed value exceeds 100 characters.
 */
function normalizeStep(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 100) {
    throw new Error("Štep ne smije biti duži od 100 znakova");
  }
  return trimmed;
}

export interface MissingMaterialWithSuppliers {
  materialId: string;
  materialName: string;
  deficit: number;
  availableSuppliers: Supplier[];
}

export interface OrderFilters {
  status?: ProductionOrderStatus;
  priority?: OrderPriority;
  sort?: "createdAt" | "deadline";
  isArchived?: boolean;
  dateFrom?: string; // ISO date YYYY-MM-DD
  dateTo?: string;   // ISO date YYYY-MM-DD
  customer?: string; // case-insensitive partial match
}

export interface CreateProductionOrderInput {
  items: Array<{
    articleId: string;
    quantity: number;
    fabricId?: string;
    ruckaId?: string;
    paspulId?: string;
    nogice1Id?: string;
    nogice2Id?: string;
    deliveryDeadline?: Date;
    priority?: OrderPriority;
    notes?: string;
    customerOrderNumber?: string;
    loadingNumber?: string;
    loadingSequence?: number;
    serialNumber?: string;
    withLegs?: boolean;
    step?: string;
  }>;
  customerName?: string;
  customerPhone?: string;
  documentNumber?: string;
  deliveryLocation?: string;
  receivedBy?: string;
}

export interface UpdateProductionOrderInput {
  customerName?: string | null;
  customerPhone?: string | null;
  documentNumber?: string | null;
  deliveryLocation?: string | null;
  receivedBy?: string | null;
  workOrderNumber?: string | null;
  workOrderDate?: Date | null;
  items?: Array<{
    id: string;
    articleId?: string;
    quantity?: number;
    fabricId?: string | null;
    ruckaId?: string | null;
    paspulId?: string | null;
    nogice1Id?: string | null;
    nogice2Id?: string | null;
    withLegs?: boolean;
    deliveryDeadline?: Date | null;
    priority?: OrderPriority;
    notes?: string | null;
    customerOrderNumber?: string | null;
    loadingNumber?: string | null;
    loadingSequence?: number | null;
    serialNumber?: string | null;
    step?: string | null;
  }>;
  newItems?: Array<{
    articleId: string;
    quantity: number;
    fabricId?: string | null;
    ruckaId?: string | null;
    paspulId?: string | null;
    nogice1Id?: string | null;
    nogice2Id?: string | null;
    withLegs?: boolean;
    deliveryDeadline?: Date | null;
    priority?: OrderPriority;
    notes?: string | null;
    customerOrderNumber?: string | null;
    loadingNumber?: string | null;
    loadingSequence?: number | null;
    serialNumber?: string | null;
    step?: string | null;
  }>;
  deleteItemIds?: string[];
}

const productionOrderInclude = {
  article: {
    include: {
      parts: {
        include: {
          productionSteps: { 
            include: { department: true, materials: { include: { material: true } } }, 
            orderBy: { sequenceOrder: 'asc' as const } 
          },
        },
      },
    },
  },
  items: {
    include: {
      article: {
        include: {
          parts: {
            include: {
              productionSteps: {
                include: { department: true, materials: { include: { material: true } } },
                orderBy: { sequenceOrder: 'asc' as const },
              },
            },
          },
        },
      },
      fabric: true,
      rucka: { select: { id: true, name: true } },
      paspul: { select: { id: true, name: true } },
      nogice1: { select: { id: true, name: true } },
      nogice2: { select: { id: true, name: true } },
    },
  },
  workOrders: {
    include: {
      articlePart: true,
      department: true,
      barcode: true,
    },
  },
  purchaseOrders: { include: { material: true, supplier: true } },
} as const;

type ProductionOrderWithRelations = Prisma.ProductionOrderGetPayload<{ include: typeof productionOrderInclude }>;

export const ProductionOrderService = {
  /**
   * Create a production order with multiple article items.
   * Uses a transaction to create the order and all items together.
   */
  async create(input: CreateProductionOrderInput): Promise<ProductionOrderWithRelations> {
    // Validate at least one item
    if (!input.items || input.items.length === 0) {
      throw new Error("Nalog mora sadržavati barem jednu stavku");
    }

    // Validate all articles exist
    const articleIds = input.items.map((item) => item.articleId);
    const articles = await prisma.article.findMany({
      where: { id: { in: articleIds } },
      select: { id: true },
    });
    const foundIds = new Set(articles.map((a) => a.id));
    const missingIds = articleIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Artikal nije pronađen: ${missingIds.join(", ")}`);
    }

    // Pre-fetch all fabrics referenced by items in one query
    const fabricIds = [...new Set(input.items.map(i => i.fabricId).filter(Boolean))] as string[];
    const fabrics = fabricIds.length > 0
      ? await prisma.fabric.findMany({ where: { id: { in: fabricIds } } })
      : [];
    const fabricMap = new Map(fabrics.map(f => [f.id, f]));

    // Pre-fetch all category items referenced by items
    const ruckaIds = [...new Set(input.items.map(i => i.ruckaId).filter((id): id is string => !!id))];
    const paspulIds = [...new Set(input.items.map(i => i.paspulId).filter((id): id is string => !!id))];
    const nogice1Ids = [...new Set(input.items.map(i => i.nogice1Id).filter((id): id is string => !!id))];
    const nogice2Ids = [...new Set(input.items.map(i => i.nogice2Id).filter((id): id is string => !!id))];
    const allNogiceIds = [...new Set([...nogice1Ids, ...nogice2Ids])];

    const rucke = ruckaIds.length > 0
      ? await prisma.rucka.findMany({ where: { id: { in: ruckaIds } }, include: { material: true } })
      : [];
    const paspuli = paspulIds.length > 0
      ? await prisma.paspul.findMany({ where: { id: { in: paspulIds } }, include: { material: true } })
      : [];
    const nogice = allNogiceIds.length > 0
      ? await prisma.nogica.findMany({ where: { id: { in: allNogiceIds } }, include: { material: true } })
      : [];

    const ruckaMap = new Map(rucke.map(r => [r.id, r]));
    const paspulMap = new Map(paspuli.map(p => [p.id, p]));
    const nogicaMap = new Map(nogice.map(n => [n.id, n]));

    // Validate all referenced category item IDs exist
    const missingRuckaIds = ruckaIds.filter(id => !ruckaMap.has(id));
    const missingPaspulIds = paspulIds.filter(id => !paspulMap.has(id));
    const missingNogiceIds = allNogiceIds.filter(id => !nogicaMap.has(id));

    if (missingRuckaIds.length > 0 || missingPaspulIds.length > 0 || missingNogiceIds.length > 0) {
      const parts: string[] = [];
      if (missingRuckaIds.length > 0) parts.push(`Ručka: ${missingRuckaIds.join(", ")}`);
      if (missingPaspulIds.length > 0) parts.push(`Paspul: ${missingPaspulIds.join(", ")}`);
      if (missingNogiceIds.length > 0) parts.push(`Nogice: ${missingNogiceIds.join(", ")}`);
      throw new Error(`Referencirani zapis kategorije ne postoji: ${parts.join("; ")}`);
    }

    // Calculate material requirements across all items (with fabric override when available)
    const allRequirements: MaterialRequirement[] = [];
    for (const item of input.items) {
      let fabricOverride: { fabricId: string; fabricName: string; materialId?: string } | undefined;
      if (item.fabricId) {
        const fabric = fabricMap.get(item.fabricId);
        if (fabric) {
          fabricOverride = fabric.materialId
            ? { fabricId: fabric.id, fabricName: fabric.name, materialId: fabric.materialId }
            : { fabricId: fabric.id, fabricName: fabric.name };
        }
      }

      const requirements = await ArticleService.calculateMaterialRequirements(item.articleId, item.quantity, fabricOverride);
      for (const req of requirements) {
        const existing = allRequirements.find((r) => r.materialId === req.materialId);
        if (existing) {
          existing.requiredQuantity += req.requiredQuantity;
        } else {
          allRequirements.push({ ...req });
        }
      }

      // Gather category item material requirements
      const categoryItemEntries: Array<{ id: string | undefined; map: Map<string, { materialId: string | null; material: { id: string; name: string } | null }> }> = [
        { id: item.ruckaId, map: ruckaMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }> },
        { id: item.paspulId, map: paspulMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }> },
        { id: item.nogice1Id, map: nogicaMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }> },
        { id: item.nogice2Id, map: nogicaMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }> },
      ];

      for (const entry of categoryItemEntries) {
        if (!entry.id) continue;
        const categoryItem = entry.map.get(entry.id);
        if (!categoryItem || !categoryItem.materialId || !categoryItem.material) continue;

        const existing = allRequirements.find((r) => r.materialId === categoryItem.materialId);
        if (existing) {
          existing.requiredQuantity += item.quantity;
        } else {
          allRequirements.push({
            materialId: categoryItem.materialId,
            materialName: categoryItem.material.name,
            requiredQuantity: item.quantity,
            availableQuantity: 0,
            deficit: 0,
          });
        }
      }
    }

    // Check material availability
    const materialIds = allRequirements.map((r) => r.materialId);
    const materials = materialIds.length > 0
      ? await prisma.material.findMany({ where: { id: { in: materialIds } } })
      : [];
    const stockList = materials.map((m) => ({
      materialId: m.id,
      materialName: m.name,
      currentQuantity: m.currentQuantity,
    }));
    const availability = checkMaterialAvailability(allRequirements, stockList);
    const status = availability.allAvailable
      ? ProductionOrderStatus.ready
      : ProductionOrderStatus.waiting_material;

    // Auto-assign serial numbers: group complementary items by relatedArticleCode+fabric+deadline.
    // Items in a complementary pair (bidirectional relatedArticleCode references)
    // get paired 1:1 per unit, each pair sharing one serial number.
    const needsSerial = input.items.some((item) => !item.serialNumber);
    if (needsSerial) {
      const allArticleIds = [...new Set(input.items.map((i) => i.articleId))];
      const articlesForSerial = await prisma.article.findMany({
        where: { id: { in: allArticleIds } },
        select: { id: true, name: true, model: true, dimensions: true, code: true, relatedArticleCode: true },
      });
      const articleMap = new Map(articlesForSerial.map((a) => [a.id, a]));

      const maxResult = await prisma.$queryRaw<[{ max: string | null }]>`
        SELECT MAX(CAST(SUBSTRING("serialNumber" FROM 3) AS INTEGER)) as max
        FROM "ProductionOrderItem"
        WHERE "serialNumber" ~ '^P-[0-9]+$'
      `;
      let nextSerial = (maxResult[0]?.max ? parseInt(maxResult[0].max, 10) : 0) + 1;

      // Build complementary pairs map
      const complementaryPairs = new Map<string, string>(); // articleId -> paired articleId
      const uniqueArticleIds_arr = [...new Set(input.items.filter(i => !i.serialNumber).map(i => i.articleId))];
      for (let i = 0; i < uniqueArticleIds_arr.length; i++) {
        for (let j = i + 1; j < uniqueArticleIds_arr.length; j++) {
          const artA = articleMap.get(uniqueArticleIds_arr[i]);
          const artB = articleMap.get(uniqueArticleIds_arr[j]);
          if (artA && artB && areComplementary(artA, artB)) {
            complementaryPairs.set(artA.id, artB.id);
            complementaryPairs.set(artB.id, artA.id);
          }
        }
      }

      // Group items: complementary pairs with same fabric + deadline → same group
      // Non-paired items → independent (each gets own serials)
      const groups = new Map<string, typeof input.items>();
      for (const item of input.items) {
        if (item.serialNumber) continue;

        const pairedArticleId = complementaryPairs.get(item.articleId);
        if (pairedArticleId) {
          // Create group key from the sorted pair of articleIds + fabric + deadline
          const pairKey = [item.articleId, pairedArticleId].sort().join("|");
          const dl = item.deliveryDeadline?.toISOString() ?? "";
          const groupKey = pairKey + "|" + (item.fabricId ?? "") + "|" + dl;
          if (!groups.has(groupKey)) groups.set(groupKey, []);
          groups.get(groupKey)!.push(item);
        } else {
          // Independent item — unique group key
          const independentKey = `independent-${item.articleId}-${item.fabricId ?? ""}-${item.deliveryDeadline?.toISOString() ?? ""}-${Math.random()}`;
          groups.set(independentKey, [item]);
        }
      }

      // For each group, pair items 1:1 per unit
      for (const items of groups.values()) {
        const uniqueArticleIds = new Set(items.map((i) => i.articleId));

        // Check if this group contains a complementary pair
        let isComplementarySet = false;
        if (uniqueArticleIds.size > 1) {
          const articleIds = [...uniqueArticleIds];
          for (let i = 0; i < articleIds.length && !isComplementarySet; i++) {
            for (let j = i + 1; j < articleIds.length && !isComplementarySet; j++) {
              const artA = articleMap.get(articleIds[i]);
              const artB = articleMap.get(articleIds[j]);
              if (artA && artB && areComplementary(artA, artB)) {
                isComplementarySet = true;
              }
            }
          }
        }
        
        if (isComplementarySet) {
          // Group items by articleId for cursor-based assignment
          const itemsByArticle = new Map<string, typeof items>();
          for (const item of items) {
            if (!itemsByArticle.has(item.articleId)) itemsByArticle.set(item.articleId, []);
            itemsByArticle.get(item.articleId)!.push(item);
          }

          // Sum quantities per article type, take max as number of serials
          const maxQty = Math.max(
            ...[...itemsByArticle.values()].map(
              (articleItems) => articleItems.reduce((sum, i) => sum + i.quantity, 0)
            )
          );

          // For each unit/serial, assign to one item per article type using cursors
          const articleCursors = new Map<string, { items: typeof items; itemIdx: number; unitIdx: number }>();
          for (const [artId, artItems] of itemsByArticle) {
            articleCursors.set(artId, { items: artItems, itemIdx: 0, unitIdx: 0 });
          }

          for (let unit = 0; unit < maxQty; unit++) {
            const serial = `P-${String(nextSerial++).padStart(3, "0")}`;
            for (const cursor of articleCursors.values()) {
              if (cursor.itemIdx >= cursor.items.length) continue;
              const item = cursor.items[cursor.itemIdx];
              item.serialNumber = item.serialNumber ? item.serialNumber + "," + serial : serial;
              cursor.unitIdx++;
              if (cursor.unitIdx >= item.quantity) {
                cursor.itemIdx++;
                cursor.unitIdx = 0;
              }
            }
          }
        } else {
          // Same article or same content type — each item gets its own serial per unit
          for (const item of items) {
            for (let unit = 0; unit < item.quantity; unit++) {
              const serial = `P-${String(nextSerial++).padStart(3, "0")}`;
              item.serialNumber = item.serialNumber ? item.serialNumber + "," + serial : serial;
            }
          }
        }
      }
    }

    // Create order and items in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.productionOrder.create({
        data: {
          status,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          documentNumber: input.documentNumber ?? null,
          deliveryLocation: input.deliveryLocation ?? null,
          receivedBy: input.receivedBy ?? null,
          normativeVersionId: null,
          items: {
            create: input.items.map((item) => ({
              articleId: item.articleId,
              quantity: item.quantity,
              fabricId: item.fabricId ?? null,
              ruckaId: item.ruckaId ?? null,
              paspulId: item.paspulId ?? null,
              nogice1Id: item.nogice1Id ?? null,
              nogice2Id: item.nogice2Id ?? null,
              deliveryDeadline: item.deliveryDeadline ?? null,
              priority: item.priority ?? "normal",
              notes: item.notes ?? null,
              customerOrderNumber: item.customerOrderNumber ?? "",
              loadingNumber: item.loadingNumber ?? null,
              loadingSequence: item.loadingSequence ?? null,
              serialNumber: item.serialNumber ?? null,
              withLegs: item.withLegs ?? false,
              step: normalizeStep(item.step),
            })),
          },
        },
        include: productionOrderInclude,
      });
      return created;
    });

    // Fire-and-forget audit log
    try {
      await AuditLogService.log({
        entityType: "production_order",
        entityId: order.id,
        action: "created",
        details: {
          items: input.items,
          customerName: input.customerName ?? null,
        },
      });
    } catch (e) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
    }

    return order;
  },

  /**
   * Update production order fields and/or individual items.
   * Supports creating new items, deleting existing items, and updating existing items.
   * All changes are persisted in a single transaction with status-based access control.
   */
  async update(id: string, input: UpdateProductionOrderInput): Promise<ProductionOrderWithRelations> {
    const existing = await prisma.productionOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) {
      throw new Error(`Production order with id "${id}" does not exist`);
    }

    // Reject entirely if order status is completed
    if (existing.status === ProductionOrderStatus.completed) {
      throw new Error("Nalog je završen i ne može se uređivati");
    }

    const editableFields = getEditableFields(existing.status);

    // Check if status is known/editable — unknown statuses should reject
    const knownStatuses: string[] = ["draft", "waiting_material", "ready", "in_progress", "completed"];
    if (!knownStatuses.includes(existing.status)) {
      throw new Error("Nalog u ovom statusu ne može se uređivati");
    }

    // Validate order-level field lengths (≤ 255 characters)
    const lengthCheckedFields: Array<{ key: string; value: string | null | undefined }> = [
      { key: "customerName", value: input.customerName },
      { key: "customerPhone", value: input.customerPhone },
      { key: "documentNumber", value: input.documentNumber },
      { key: "deliveryLocation", value: input.deliveryLocation },
      { key: "receivedBy", value: input.receivedBy },
    ];
    for (const field of lengthCheckedFields) {
      if (field.value !== undefined && field.value !== null && field.value.length > 255) {
        throw new Error(`Polje '${field.key}' ne smije prelaziti 255 znakova`);
      }
    }

    // For ready/in_progress: restricted field editing (articleId, quantity, priority are read-only)
    // but adding new items and deleting items is allowed
    const isRestricted = existing.status === "ready" || existing.status === "in_progress";

    // Validate deleteItemIds: each must belong to this order
    if (input.deleteItemIds && input.deleteItemIds.length > 0) {
      const existingItemIds = new Set(existing.items.map((i) => i.id));
      for (const deleteId of input.deleteItemIds) {
        if (!existingItemIds.has(deleteId)) {
          throw new Error(`Stavka s id '${deleteId}' nije pronađena u nalogu '${id}'`);
        }
      }
    }

    // Validate newItems: each must have non-empty articleId and quantity >= 1
    if (input.newItems && input.newItems.length > 0) {
      for (const newItem of input.newItems) {
        if (!newItem.articleId || newItem.articleId.trim() === "") {
          throw new Error("Artikal je obavezan za svaku stavku");
        }
        if (newItem.quantity < 1) {
          throw new Error("Količina mora biti najmanje 1");
        }
      }
    }

    // Auto-assign serial numbers for new items that don't have one (same logic as create)
    if (input.newItems && input.newItems.length > 0) {
      const needsSerial = input.newItems.some((item) => !item.serialNumber);
      if (needsSerial) {
        const allArticleIds = [...new Set(input.newItems.map((i) => i.articleId))];
        const articlesForSerial = await prisma.article.findMany({
          where: { id: { in: allArticleIds } },
          select: { id: true, name: true, model: true, dimensions: true, code: true, relatedArticleCode: true },
        });
        const articleMap = new Map(articlesForSerial.map((a) => [a.id, a]));

        const maxResult = await prisma.$queryRaw<[{ max: string | null }]>`
          SELECT MAX(CAST(SUBSTRING("serialNumber" FROM 3) AS INTEGER)) as max
          FROM "ProductionOrderItem"
          WHERE "serialNumber" ~ '^P-[0-9]+$'
        `;
        let nextSerial = (maxResult[0]?.max ? parseInt(maxResult[0].max, 10) : 0) + 1;

        // Build complementary pairs map
        const complementaryPairs = new Map<string, string>();
        const uniqueArticleIds_arr = [...new Set(input.newItems.filter(i => !i.serialNumber).map(i => i.articleId))];
        for (let i = 0; i < uniqueArticleIds_arr.length; i++) {
          for (let j = i + 1; j < uniqueArticleIds_arr.length; j++) {
            const artA = articleMap.get(uniqueArticleIds_arr[i]);
            const artB = articleMap.get(uniqueArticleIds_arr[j]);
            if (artA && artB && areComplementary(artA, artB)) {
              complementaryPairs.set(artA.id, artB.id);
              complementaryPairs.set(artB.id, artA.id);
            }
          }
        }

        // Group items by complementary pairing + fabric + deadline
        const groups = new Map<string, typeof input.newItems>();
        for (const item of input.newItems) {
          if (item.serialNumber) continue;

          const pairedArticleId = complementaryPairs.get(item.articleId);
          if (pairedArticleId) {
            const pairKey = [item.articleId, pairedArticleId].sort().join("|");
            const dl = item.deliveryDeadline?.toISOString() ?? "";
            const groupKey = pairKey + "|" + (item.fabricId ?? "") + "|" + dl;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey)!.push(item);
          } else {
            const independentKey = `independent-${item.articleId}-${item.fabricId ?? ""}-${item.deliveryDeadline?.toISOString() ?? ""}-${Math.random()}`;
            groups.set(independentKey, [item]);
          }
        }

        // Assign serials per group
        for (const items of groups.values()) {
          const uniqueArticleIds = new Set(items.map((i) => i.articleId));

          let isComplementarySet = false;
          if (uniqueArticleIds.size > 1) {
            const articleIds = [...uniqueArticleIds];
            for (let i = 0; i < articleIds.length && !isComplementarySet; i++) {
              for (let j = i + 1; j < articleIds.length && !isComplementarySet; j++) {
                const artA = articleMap.get(articleIds[i]);
                const artB = articleMap.get(articleIds[j]);
                if (artA && artB && areComplementary(artA, artB)) {
                  isComplementarySet = true;
                }
              }
            }
          }

          if (isComplementarySet) {
            const itemsByArticle = new Map<string, typeof items>();
            for (const item of items) {
              if (!itemsByArticle.has(item.articleId)) itemsByArticle.set(item.articleId, []);
              itemsByArticle.get(item.articleId)!.push(item);
            }
            const maxQty = Math.max(
              ...[...itemsByArticle.values()].map(
                (articleItems) => articleItems.reduce((sum, i) => sum + i.quantity, 0)
              )
            );
            const articleCursors = new Map<string, { items: typeof items; itemIdx: number; unitIdx: number }>();
            for (const [artId, artItems] of itemsByArticle) {
              articleCursors.set(artId, { items: artItems, itemIdx: 0, unitIdx: 0 });
            }
            for (let unit = 0; unit < maxQty; unit++) {
              const serial = `P-${String(nextSerial++).padStart(3, "0")}`;
              for (const cursor of articleCursors.values()) {
                if (cursor.itemIdx >= cursor.items.length) continue;
                const item = cursor.items[cursor.itemIdx];
                item.serialNumber = item.serialNumber ? item.serialNumber + "," + serial : serial;
                cursor.unitIdx++;
                if (cursor.unitIdx >= item.quantity) {
                  cursor.itemIdx++;
                  cursor.unitIdx = 0;
                }
              }
            }
          } else {
            for (const item of items) {
              for (let unit = 0; unit < item.quantity; unit++) {
                const serial = `P-${String(nextSerial++).padStart(3, "0")}`;
                item.serialNumber = item.serialNumber ? item.serialNumber + "," + serial : serial;
              }
            }
          }
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      // Update root-level fields
      const orderData: Record<string, unknown> = {};
      if (input.customerName !== undefined) orderData.customerName = input.customerName;
      if (input.customerPhone !== undefined) orderData.customerPhone = input.customerPhone;
      if (input.documentNumber !== undefined) orderData.documentNumber = input.documentNumber;
      if (input.deliveryLocation !== undefined) orderData.deliveryLocation = input.deliveryLocation;
      if (input.receivedBy !== undefined) orderData.receivedBy = input.receivedBy;
      if (input.workOrderNumber !== undefined) orderData.workOrderNumber = input.workOrderNumber;
      if (input.workOrderDate !== undefined) orderData.workOrderDate = input.workOrderDate;
      if (Object.keys(orderData).length > 0) {
        await tx.productionOrder.update({ where: { id }, data: orderData });
      }

      // Delete items by ID
      if (input.deleteItemIds && input.deleteItemIds.length > 0) {
        await tx.productionOrderItem.deleteMany({
          where: {
            id: { in: input.deleteItemIds },
            productionOrderId: id,
          },
        });
      }

      // Create new items
      if (input.newItems && input.newItems.length > 0) {
        for (const newItem of input.newItems) {
          await tx.productionOrderItem.create({
            data: {
              productionOrderId: id,
              articleId: newItem.articleId,
              quantity: newItem.quantity,
              fabricId: newItem.fabricId ?? null,
              ruckaId: newItem.ruckaId ?? null,
              paspulId: newItem.paspulId ?? null,
              nogice1Id: newItem.nogice1Id ?? null,
              nogice2Id: newItem.nogice2Id ?? null,
              withLegs: newItem.withLegs ?? false,
              deliveryDeadline: newItem.deliveryDeadline ?? null,
              priority: newItem.priority ?? "normal",
              notes: newItem.notes ?? null,
              customerOrderNumber: newItem.customerOrderNumber ?? "",
              loadingNumber: newItem.loadingNumber ?? null,
              loadingSequence: newItem.loadingSequence ?? null,
              serialNumber: newItem.serialNumber ?? null,
              step: normalizeStep(newItem.step),
            },
          });
        }
      }

      // Update individual items
      if (input.items) {
        for (const itemUpdate of input.items) {
          const existingItem = existing.items.find((i) => i.id === itemUpdate.id);
          if (!existingItem) {
            throw new Error(`Stavka s id '${itemUpdate.id}' nije pronađena u nalogu '${id}'`);
          }

          // Validate quantity when provided
          if (itemUpdate.quantity !== undefined && itemUpdate.quantity < 1) {
            throw new Error("Količina mora biti najmanje 1");
          }

          // Build data object with only provided AND allowed fields
          const data: Record<string, unknown> = {};
          if (itemUpdate.deliveryDeadline !== undefined && editableFields.deliveryDeadline) {
            data.deliveryDeadline = itemUpdate.deliveryDeadline;
          }
          if (itemUpdate.priority !== undefined && editableFields.priority) {
            data.priority = itemUpdate.priority;
          }
          if (itemUpdate.notes !== undefined && editableFields.notes) {
            data.notes = itemUpdate.notes;
          }
          if (itemUpdate.customerOrderNumber !== undefined && editableFields.customerOrderNumber) {
            data.customerOrderNumber = itemUpdate.customerOrderNumber;
          }
          if (itemUpdate.loadingNumber !== undefined && editableFields.loadingNumber) {
            data.loadingNumber = itemUpdate.loadingNumber;
          }
          if (itemUpdate.loadingSequence !== undefined && editableFields.loadingSequence) {
            data.loadingSequence = itemUpdate.loadingSequence;
          }
          if (itemUpdate.serialNumber !== undefined && editableFields.serialNumber) {
            data.serialNumber = itemUpdate.serialNumber;
          }
          if (itemUpdate.quantity !== undefined && editableFields.quantity) {
            data.quantity = itemUpdate.quantity;
          }
          if (itemUpdate.articleId !== undefined && editableFields.articleId) {
            data.articleId = itemUpdate.articleId;
          }
          if (itemUpdate.fabricId !== undefined && editableFields.fabricId) {
            data.fabricId = itemUpdate.fabricId;
          }
          if (itemUpdate.ruckaId !== undefined && editableFields.ruckaId) {
            data.ruckaId = itemUpdate.ruckaId;
          }
          if (itemUpdate.paspulId !== undefined && editableFields.paspulId) {
            data.paspulId = itemUpdate.paspulId;
          }
          if (itemUpdate.nogice1Id !== undefined && editableFields.nogice1Id) {
            data.nogice1Id = itemUpdate.nogice1Id;
          }
          if (itemUpdate.nogice2Id !== undefined && editableFields.nogice2Id) {
            data.nogice2Id = itemUpdate.nogice2Id;
          }
          if (itemUpdate.step !== undefined && editableFields.step) {
            data.step = normalizeStep(itemUpdate.step);
          }

          if (Object.keys(data).length > 0) {
            await tx.productionOrderItem.update({
              where: { id: itemUpdate.id },
              data,
            });
          }

          // Build changes record for audit log (old/new values for each changed field)
          const changes: Record<string, { old: unknown; new: unknown }> = {};
          for (const [field, newValue] of Object.entries(data)) {
            const oldValue = (existingItem as Record<string, unknown>)[field];
            if (oldValue !== newValue) {
              changes[field] = { old: oldValue, new: newValue };
            }
          }

          if (Object.keys(changes).length > 0) {
            try {
              await AuditLogService.log({
                entityType: "ProductionOrderItem",
                entityId: itemUpdate.id,
                action: "update",
                details: {
                  productionOrderId: id,
                  changes,
                },
              });
            } catch (e) {
              console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
            }
          }
        }
      }

      return tx.productionOrder.findUniqueOrThrow({
        where: { id },
        include: productionOrderInclude,
      });
    });
  },

  /**
   * Check material availability for a production order.
   * Supports both new multi-item orders and legacy single-article orders.
   */
  async checkMaterialAvailability(orderId: string): Promise<MaterialCheckResult> {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new Error(`Production order with id "${orderId}" does not exist`);
    }

    const allRequirements = await this._calculateAllMaterialRequirements(order);

    const materialIds = allRequirements.map((r) => r.materialId);
    const materials = materialIds.length > 0
      ? await prisma.material.findMany({ where: { id: { in: materialIds } } })
      : [];
    const stockList = materials.map((m) => ({
      materialId: m.id,
      materialName: m.name,
      currentQuantity: m.currentQuantity,
    }));

    const result = checkMaterialAvailability(allRequirements, stockList);

    // Update order status based on availability
    const newStatus = result.allAvailable
      ? ProductionOrderStatus.ready
      : ProductionOrderStatus.waiting_material;

    if (order.status !== ProductionOrderStatus.completed && order.status !== ProductionOrderStatus.in_progress) {
      await prisma.productionOrder.update({
        where: { id: orderId },
        data: { status: newStatus },
      });
    }

    return result;
  },

  /**
   * Generate purchase orders for missing materials.
   * Auto-creates POs for materials with 0 or 1 supplier.
   * Returns materials with multiple suppliers for user selection.
   */
  async generatePurchaseOrders(orderId: string): Promise<{
    autoCreated: PurchaseOrder[];
    needsSelection: MissingMaterialWithSuppliers[];
  }> {
    const availability = await this.checkMaterialAvailability(orderId);

    const missingMaterials = availability.requirements.filter(
      (r) => r.deficit > 0 && !r.materialId.startsWith("fabric:")
    );
    if (missingMaterials.length === 0) {
      return { autoCreated: [], needsSelection: [] };
    }

    // Batch lookup suppliers for all missing materials
    const missingMaterialIds = missingMaterials.map((m) => m.materialId);
    const supplierLinks = await prisma.supplierMaterial.findMany({
      where: { materialId: { in: missingMaterialIds } },
      include: { supplier: true },
    });

    // Group suppliers by materialId
    const suppliersByMaterial = new Map<string, Supplier[]>();
    for (const sl of supplierLinks) {
      const existing = suppliersByMaterial.get(sl.materialId) ?? [];
      existing.push(sl.supplier);
      suppliersByMaterial.set(sl.materialId, existing);
    }

    const autoCreated: PurchaseOrder[] = [];
    const needsSelection: MissingMaterialWithSuppliers[] = [];

    for (const missing of missingMaterials) {
      const suppliers = suppliersByMaterial.get(missing.materialId) ?? [];

      if (suppliers.length === 0) {
        const po = await prisma.purchaseOrder.create({
          data: {
            productionOrderId: orderId,
            materialId: missing.materialId,
            supplierId: null,
            requiredQuantity: missing.deficit,
          },
          include: { material: true, supplier: true, productionOrder: true },
        });
        autoCreated.push(po);
      } else if (suppliers.length === 1) {
        const po = await prisma.purchaseOrder.create({
          data: {
            productionOrderId: orderId,
            materialId: missing.materialId,
            supplierId: suppliers[0].id,
            requiredQuantity: missing.deficit,
          },
          include: { material: true, supplier: true, productionOrder: true },
        });
        autoCreated.push(po);
      } else {
        needsSelection.push({
          materialId: missing.materialId,
          materialName: missing.materialName,
          deficit: missing.deficit,
          availableSuppliers: suppliers,
        });
      }
    }

    return { autoCreated, needsSelection };
  },

  /**
   * Generate work orders for each part * quantity across all items.
   * Also transitions the production order to in_progress.
   */
  async generateWorkOrders(orderId: string): Promise<WorkOrder[]> {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        ...productionOrderInclude,
        normativeVersion: true,
      },
    });
    if (!order) {
      throw new Error(`Production order with id "${orderId}" does not exist`);
    }

    if (order.status !== ProductionOrderStatus.ready && order.status !== ProductionOrderStatus.waiting_material) {
      throw new Error(
        `Cannot generate work orders for production order in status "${order.status}". Must be "ready" or "waiting_material".`
      );
    }

    // Get items — support both new multi-item and legacy single-article
    const orderItems = this._getOrderItems(order);
    if (orderItems.length === 0) {
      throw new Error("Production order has no items or article");
    }

    // Always use default production steps for validation and work order generation
    // Validate that every part across all items has at least one production step
    const partsWithoutSteps: string[] = [];
    for (const item of orderItems) {
      for (const part of item.parts) {
        const steps = await ProductionStepService.getEffectiveSteps(part.id);
        if (steps.length === 0) {
          const articleLabel = item.articleCode
            ? `${item.articleName} (${item.articleCode})`
            : item.articleName;
          partsWithoutSteps.push(`${part.partName} [${articleLabel}]`);
        }
      }
    }
    if (partsWithoutSteps.length > 0) {
      throw new Error(
        `Cannot generate work orders: the following parts have no production steps:\n${partsWithoutSteps.join("\n")}`
      );
    }

    const workOrderData: Array<{
      productionOrderId: string;
      articlePartId: string;
      departmentId: string;
      productionStepId?: string;
      stepSequence: number;
      itemIndex: number;
      status: WorkOrderStatus;
    }> = [];

    let globalItemIndex = 0;
    for (const item of orderItems) {
      for (const part of item.parts) {
        const steps = await ProductionStepService.getEffectiveSteps(part.id);
        for (let i = 0; i < item.quantity; i++) {
          for (const step of steps) {
            workOrderData.push({
              productionOrderId: orderId,
              articlePartId: part.id,
              departmentId: step.departmentId,
              productionStepId: step.stepId,
              stepSequence: step.sequenceOrder,
              itemIndex: globalItemIndex + i,
              status: WorkOrderStatus.pending,
            });
          }
        }
      }
      globalItemIndex += item.quantity;
    }

    await prisma.workOrder.createMany({ data: workOrderData });

    // Generate barcodes for unique (ArticlePart, itemIndex) combinations
    globalItemIndex = 0;
    for (const item of orderItems) {
      for (const part of item.parts) {
        for (let i = 0; i < item.quantity; i++) {
          await BarcodeService.generatePartIdentifier(orderId, part.id, globalItemIndex + i);
        }
      }
      globalItemIndex += item.quantity;
    }

    // Create normative version snapshots for each unique article (freeze current BOM)
    const uniqueArticleIds = [...new Set(orderItems.map(i => i.articleId))];
    let firstVersionId: string | null = null;
    for (const articleId of uniqueArticleIds) {
      try {
        const versionId = await NormativeVersionService.createSnapshot(articleId);
        if (!firstVersionId) firstVersionId = versionId;
      } catch (e) {
        // If snapshot fails (e.g. article was deleted), log and continue
        console.error(`Failed to create normative snapshot for article ${articleId}:`, e);
      }
    }

    // Transition to in_progress and save the version reference
    const oldStatus = order.status;
    await prisma.productionOrder.update({
      where: { id: orderId },
      data: {
        status: ProductionOrderStatus.in_progress,
        normativeVersionId: firstVersionId,
      },
    });

    // Fire-and-forget audit log for status change
    try {
      await AuditLogService.log({
        entityType: "production_order",
        entityId: orderId,
        action: "status_change",
        details: { oldStatus, newStatus: ProductionOrderStatus.in_progress },
      });
    } catch (e) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
    }

    return prisma.workOrder.findMany({
      where: { productionOrderId: orderId },
    });
  },

  /**
   * Get production order status with progress calculation.
   * Supports both new multi-item and legacy single-article orders.
   */
  async getStatus(orderId: string): Promise<{
    order: ProductionOrderWithRelations;
    progress: ProductionOrderProgress;
    materialCheck: MaterialCheckResult;
  }> {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: productionOrderInclude,
    });
    if (!order) {
      throw new Error(`Production order with id "${orderId}" does not exist`);
    }

    const totalWorkOrders = order.workOrders.length;
    const completedWorkOrders = order.workOrders.filter(
      (wo) => wo.status === WorkOrderStatus.completed
    ).length;

    const progress = calculateProgress(totalWorkOrders, completedWorkOrders);

    const allRequirements = await this._calculateAllMaterialRequirements(order);
    const materialIds = allRequirements.map((r) => r.materialId);
    const materials = materialIds.length > 0
      ? await prisma.material.findMany({ where: { id: { in: materialIds } } })
      : [];
    const stockList = materials.map((m) => ({
      materialId: m.id,
      materialName: m.name,
      currentQuantity: m.currentQuantity,
    }));
    const materialCheck = checkMaterialAvailability(allRequirements, stockList);

    return { order, progress, materialCheck };
  },

  /**
   * Get all production orders with optional status filter.
   */
  async getAll(filters?: OrderFilters): Promise<ProductionOrderWithRelations[]> {
    const where: Record<string, unknown> = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    where.isArchived = filters?.isArchived !== undefined ? filters.isArchived : false;

    // Date range filters
    const createdAtCondition: Record<string, Date> = {};
    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!isNaN(from.getTime())) {
        createdAtCondition.gte = from;
      }
    }
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo);
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        createdAtCondition.lte = to;
      }
    }
    if (Object.keys(createdAtCondition).length > 0) {
      where.createdAt = createdAtCondition;
    }

    // Customer name filter (case-insensitive partial match)
    if (filters?.customer) {
      where.customerName = { contains: filters.customer, mode: 'insensitive' };
    }

    return prisma.productionOrder.findMany({
      where,
      include: productionOrderInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  async getAllPaginated({ page, pageSize }: PaginationParams, filters?: OrderFilters): Promise<PaginatedResponse<{
    id: string;
    orderNumber: number;
    quantity: number | null;
    status: ProductionOrderStatus;
    customerName: string | null;
    workOrderNumber: string | null;
    workOrderDate: Date | null;
    createdAt: Date;
    article: { id: string; name: string } | null;
    items: { id: string; articleId: string; quantity: number; deliveryDeadline: Date | null; priority: OrderPriority; notes: string | null; customerOrderNumber: string | null; serialNumber: string | null; loadingNumber: string | null; loadingSequence: number | null; article: { id: string; name: string; code: string | null }; fabric: { id: string; name: string; code: string | null } | null; rucka: { id: string; name: string } | null; paspul: { id: string; name: string } | null; nogice1: { id: string; name: string } | null; nogice2: { id: string; name: string } | null }[];
    _count: { workOrders: number };
    workOrders: { id: string; status: WorkOrderStatus }[];
  }>> {
    const skip = (page - 1) * pageSize;
    const where: Record<string, unknown> = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.priority) {
      where.items = { some: { priority: filters.priority } };
    }
    where.isArchived = filters?.isArchived !== undefined ? filters.isArchived : false;

    // Date range filters
    const createdAtCondition: Record<string, Date> = {};
    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!isNaN(from.getTime())) {
        createdAtCondition.gte = from;
      }
    }
    if (filters?.dateTo) {
      const to = new Date(filters.dateTo);
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        createdAtCondition.lte = to;
      }
    }
    if (Object.keys(createdAtCondition).length > 0) {
      where.createdAt = createdAtCondition;
    }

    // Customer name filter (case-insensitive partial match)
    if (filters?.customer) {
      where.customerName = { contains: filters.customer, mode: 'insensitive' };
    }

    // When sorting by deadline, we use DB-level sort with raw SQL
    const sortByDeadline = filters?.sort === "deadline";
    const isArchived = filters?.isArchived !== undefined ? filters.isArchived : false;
    const orderBy = { createdAt: "desc" as const };

    const selectFields = {
      id: true,
      orderNumber: true,
      quantity: true,
      status: true,
      customerName: true,
      createdAt: true,
      workOrderNumber: true,
      workOrderDate: true,
      article: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          articleId: true,
          quantity: true,
          deliveryDeadline: true,
          priority: true,
          notes: true,
          customerOrderNumber: true,
          serialNumber: true,
          loadingNumber: true,
          loadingSequence: true,
          article: { select: { id: true, name: true, code: true } },
          fabric: { select: { id: true, name: true, code: true } },
          rucka: { select: { id: true, name: true } },
          paspul: { select: { id: true, name: true } },
          nogice1: { select: { id: true, name: true } },
          nogice2: { select: { id: true, name: true } },
        },
      },
      _count: { select: { workOrders: true } },
      workOrders: { select: { id: true, status: true } },
    } as const;

    if (sortByDeadline) {
      // Build SQL WHERE conditions to replicate all existing filters
      const conditions: Prisma.Sql[] = [
        Prisma.sql`po."isArchived" = ${isArchived}`,
      ];

      if (filters?.status) {
        conditions.push(Prisma.sql`po."status" = ${filters.status}::"ProductionOrderStatus"`);
      }

      if (filters?.priority) {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM "ProductionOrderItem" pf
          WHERE pf."productionOrderId" = po.id
          AND pf."priority" = ${filters.priority}::"OrderPriority"
        )`);
      }

      if (filters?.dateFrom) {
        const from = new Date(filters.dateFrom);
        if (!isNaN(from.getTime())) {
          conditions.push(Prisma.sql`po."createdAt" >= ${from}`);
        }
      }
      if (filters?.dateTo) {
        const to = new Date(filters.dateTo);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          conditions.push(Prisma.sql`po."createdAt" <= ${to}`);
        }
      }

      if (filters?.customer) {
        conditions.push(Prisma.sql`po."customerName" ILIKE ${`%${filters.customer}%`}`);
      }

      const whereClause = Prisma.join(conditions, " AND ");

      // Use raw SQL to get ordered IDs with DB-level deadline sort
      const orderedIds = await prisma.$queryRaw<{ id: string }[]>`
        SELECT po.id
        FROM "ProductionOrder" po
        LEFT JOIN LATERAL (
          SELECT MIN("deliveryDeadline") as earliest
          FROM "ProductionOrderItem" poi
          WHERE poi."productionOrderId" = po.id
        ) d ON true
        WHERE ${whereClause}
        ORDER BY d.earliest ASC NULLS LAST
        LIMIT ${pageSize} OFFSET ${skip}
      `;

      // Get total count with the same filters
      const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM "ProductionOrder" po
        WHERE ${whereClause}
      `;
      const total = Number(countResult[0].count);

      if (orderedIds.length === 0) {
        return { data: [], total, page, pageSize };
      }

      // Fetch full data for those IDs
      const data = await prisma.productionOrder.findMany({
        where: { id: { in: orderedIds.map(r => r.id) } },
        select: selectFields,
      });

      // Preserve the sort order from the raw query
      const idOrder = new Map(orderedIds.map((r, i) => [r.id, i]));
      data.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

      return { data, total, page, pageSize };
    }

    const [data, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        select: selectFields,
        skip,
        take: pageSize,
        orderBy,
      }),
      prisma.productionOrder.count({ where }),
    ]);
    return { data, total, page, pageSize };
  },

  /**
   * Get a single production order by ID with items and article relations.
   */
  async getById(id: string): Promise<ProductionOrderWithRelations | null> {
    return prisma.productionOrder.findUnique({
      where: { id },
      include: productionOrderInclude,
    });
  },

  /**
   * Check if all work orders are completed and auto-complete the production order.
   */
  async checkAutoCompletion(orderId: string): Promise<ProductionOrder> {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: { workOrders: true },
    });
    if (!order) {
      throw new Error(`Production order with id "${orderId}" does not exist`);
    }

    if (order.workOrders.length === 0) {
      return order;
    }

    const allCompleted = order.workOrders.every(
      (wo) => wo.status === WorkOrderStatus.completed
    );

    if (allCompleted && order.status !== ProductionOrderStatus.completed) {
      const oldStatus = order.status;
      const updated = await prisma.productionOrder.update({
        where: { id: orderId },
        data: { status: ProductionOrderStatus.completed },
      });

      // Fire-and-forget audit log for status change
      try {
        await AuditLogService.log({
          entityType: "production_order",
          entityId: orderId,
          action: "status_change",
          details: { oldStatus, newStatus: ProductionOrderStatus.completed },
        });
      } catch (e) {
        console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
      }

      return updated;
    }

    return order;
  },

  /**
   * Soft-delete a production order by setting isArchived = true.
   * Logs the action via AuditLogService.
   */
  async archive(id: string): Promise<ProductionOrder> {
    const order = await prisma.productionOrder.findUnique({ where: { id } });
    if (!order) {
      throw new Error(`Production order with id "${id}" does not exist`);
    }
    if (order.isArchived) {
      throw new Error("Nalog je već arhiviran");
    }

    const updated = await prisma.productionOrder.update({
      where: { id },
      data: { isArchived: true },
    });

    await AuditLogService.log({
      entityType: "production_order",
      entityId: id,
      action: "archived",
      details: { status: order.status },
    });

    return updated;
  },

  /**
   * Restore a soft-deleted production order by setting isArchived = false.
   * Logs the action via AuditLogService.
   */
  async restore(id: string): Promise<ProductionOrder> {
    const order = await prisma.productionOrder.findUnique({ where: { id } });
    if (!order) {
      throw new Error(`Production order with id "${id}" does not exist`);
    }
    if (!order.isArchived) {
      throw new Error("Nalog nije arhiviran");
    }

    const updated = await prisma.productionOrder.update({
      where: { id },
      data: { isArchived: false },
    });

    await AuditLogService.log({
      entityType: "production_order",
      entityId: id,
      action: "restored",
      details: { status: order.status },
    });

    return updated;
  },

  /**
   * Internal: Calculate material requirements across all items (or legacy article).
   * When an item has a fabricId, looks up the Fabric entity and passes the override
   * to ArticleService.calculateMaterialRequirements so fabric-type materials are substituted.
   * Also includes material requirements from category items (rucka, paspul, nogice1, nogice2).
   * 
   * Category item override logic:
   * - Fetches raw BOM materials to detect placeholder materials (e.g. "Paspul za sve")
   * - Applies applyCategoryItemOverrides to determine which categories are consumed by overrides
   * - For consumed categories: the replacement material's requirement is calculated as
   *   normative quantity per unit × item quantity (already included via override)
   * - For non-consumed categories: retains additive behavior (quantity = 1 × item quantity)
   * - Aggregates all material requirements by materialId (sums quantities for same material)
   */
  async _calculateAllMaterialRequirements(
    order: { articleId: string | null; quantity: number | null; items?: Array<{ articleId: string; quantity: number; fabricId?: string | null; ruckaId?: string | null; paspulId?: string | null; nogice1Id?: string | null; nogice2Id?: string | null }> }
  ): Promise<MaterialRequirement[]> {
    const allRequirements: MaterialRequirement[] = [];

    // Use items if available, otherwise fall back to legacy articleId/quantity
    const items = (order.items && order.items.length > 0)
      ? order.items
      : (order.articleId && order.quantity)
        ? [{ articleId: order.articleId, quantity: order.quantity }]
        : [];

    // Pre-fetch all fabrics referenced by items in one query
    const fabricIds = [...new Set(
      items
        .filter((item): item is typeof item & { fabricId: string } => 'fabricId' in item && !!item.fabricId)
        .map(item => item.fabricId)
    )];
    const fabrics = fabricIds.length > 0
      ? await prisma.fabric.findMany({ where: { id: { in: fabricIds } } })
      : [];
    const fabricMap = new Map(fabrics.map(f => [f.id, f]));

    // Pre-fetch all category items referenced by items in one query each
    const ruckaIds = [...new Set(items.map(i => 'ruckaId' in i ? i.ruckaId : null).filter((id): id is string => !!id))];
    const paspulIds = [...new Set(items.map(i => 'paspulId' in i ? i.paspulId : null).filter((id): id is string => !!id))];
    const nogice1Ids = [...new Set(items.map(i => 'nogice1Id' in i ? i.nogice1Id : null).filter((id): id is string => !!id))];
    const nogice2Ids = [...new Set(items.map(i => 'nogice2Id' in i ? i.nogice2Id : null).filter((id): id is string => !!id))];
    const allNogiceIds = [...new Set([...nogice1Ids, ...nogice2Ids])];

    const rucke = ruckaIds.length > 0
      ? await prisma.rucka.findMany({ where: { id: { in: ruckaIds } }, include: { material: true } })
      : [];
    const paspuli = paspulIds.length > 0
      ? await prisma.paspul.findMany({ where: { id: { in: paspulIds } }, include: { material: true } })
      : [];
    const nogice = allNogiceIds.length > 0
      ? await prisma.nogica.findMany({ where: { id: { in: allNogiceIds } }, include: { material: true } })
      : [];

    const ruckaMap = new Map(rucke.map(r => [r.id, r]));
    const paspulMap = new Map(paspuli.map(p => [p.id, p]));
    const nogicaMap = new Map(nogice.map(n => [n.id, n]));

    for (const item of items) {
      // Build fabric override if the item has a fabricId
      let fabricOverride: { fabricId: string; fabricName: string; materialId?: string } | undefined;
      if ('fabricId' in item && item.fabricId) {
        const fabric = fabricMap.get(item.fabricId);
        if (fabric) {
          fabricOverride = fabric.materialId
            ? { fabricId: fabric.id, fabricName: fabric.name, materialId: fabric.materialId }
            : { fabricId: fabric.id, fabricName: fabric.name };
        }
      }

      // Get BOM requirements (with fabric override applied)
      const requirements = await ArticleService.calculateMaterialRequirements(item.articleId, item.quantity, fabricOverride);

      // Fetch raw BOM to detect placeholder materials for category item overrides
      const bom = await ArticleService.getBOM(item.articleId);

      // Collect all normative materials across all steps (for placeholder detection)
      const normativeMaterials: NormativeMaterial[] = [];
      for (const part of bom) {
        for (const step of part.steps) {
          for (const mat of step.materials) {
            normativeMaterials.push({
              materialId: mat.materialId,
              materialName: mat.materialName,
              materialCode: null,
              quantity: mat.quantity,
              pieces: null,
              unit: mat.unit,
              price: null,
              length: null,
              width: null,
              height: null,
              isEdgebanded: null,
            });
          }
        }
      }

      // Build category selections for override processing
      const ruckaItem = ('ruckaId' in item && item.ruckaId) ? ruckaMap.get(item.ruckaId) : null;
      const paspulItem = ('paspulId' in item && item.paspulId) ? paspulMap.get(item.paspulId) : null;
      const nogice1Item = ('nogice1Id' in item && item.nogice1Id) ? nogicaMap.get(item.nogice1Id) : null;
      const nogice2Item = ('nogice2Id' in item && item.nogice2Id) ? nogicaMap.get(item.nogice2Id) : null;

      const categorySelections: CategorySelections = {
        paspul: paspulItem ? {
          id: paspulItem.id,
          name: paspulItem.name,
          materialId: paspulItem.materialId ?? null,
          materialName: paspulItem.material?.name ?? null,
          materialCode: null,
          materialUnit: paspulItem.material ? null : null,
        } : null,
        rucka: ruckaItem ? {
          id: ruckaItem.id,
          name: ruckaItem.name,
          materialId: ruckaItem.materialId ?? null,
          materialName: ruckaItem.material?.name ?? null,
          materialCode: null,
          materialUnit: null,
        } : null,
        nogice1: nogice1Item ? {
          id: nogice1Item.id,
          name: nogice1Item.name,
          materialId: nogice1Item.materialId ?? null,
          materialName: nogice1Item.material?.name ?? null,
          materialCode: null,
          materialUnit: null,
        } : null,
        nogice2: nogice2Item ? {
          id: nogice2Item.id,
          name: nogice2Item.name,
          materialId: nogice2Item.materialId ?? null,
          materialName: nogice2Item.material?.name ?? null,
          materialCode: null,
          materialUnit: null,
        } : null,
      };

      // Apply category item overrides to detect placeholders and determine consumed categories
      const overrideResult = applyCategoryItemOverrides(normativeMaterials, categorySelections);
      const { consumedCategories } = overrideResult;

      // Build material requirements from the override result
      // First, collect placeholder materialIds from the original normative (to exclude from BOM requirements)
      const placeholderMaterialIds = new Set<string>();
      for (const mat of normativeMaterials) {
        if (detectPlaceholder(mat.materialName) !== null) {
          placeholderMaterialIds.add(mat.materialId);
        }
      }

      // Add BOM requirements, excluding placeholder materials that were consumed by overrides
      for (const req of requirements) {
        // If this material is a placeholder and its category was consumed, skip it
        // (it will be replaced by the override material below)
        if (placeholderMaterialIds.has(req.materialId) && consumedCategories.size > 0) {
          // Check if this specific placeholder's category was consumed
          const placeholderMat = normativeMaterials.find(m => m.materialId === req.materialId);
          if (placeholderMat) {
            const catType = detectPlaceholder(placeholderMat.materialName);
            if (catType && consumedCategories.has(catType)) {
              continue; // Skip — will be replaced by override material
            }
          }
        }

        const existing = allRequirements.find((r) => r.materialId === req.materialId);
        if (existing) {
          existing.requiredQuantity += req.requiredQuantity;
        } else {
          allRequirements.push({ ...req });
        }
      }

      // Add material requirements from overridden materials (replacement materials)
      for (const overriddenMat of overrideResult.materials) {
        if (!overriddenMat.isOverridden) continue;

        // Quantity for stock: normative quantity per unit × item quantity
        const requiredQuantity = overriddenMat.quantity * item.quantity;

        const existing = allRequirements.find((r) => r.materialId === overriddenMat.materialId);
        if (existing) {
          existing.requiredQuantity += requiredQuantity;
        } else {
          allRequirements.push({
            materialId: overriddenMat.materialId,
            materialName: overriddenMat.materialName,
            requiredQuantity,
            availableQuantity: 0,
            deficit: 0,
          });
        }
      }

      // Gather category item material requirements (additive) — only for non-consumed categories
      const categoryItemEntries: Array<{ id: string | null | undefined; map: Map<string, { materialId: string | null; material: { id: string; name: string } | null }>; categoryType: CategoryType }> = [
        { id: 'ruckaId' in item ? item.ruckaId : null, map: ruckaMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }>, categoryType: "rucka" },
        { id: 'paspulId' in item ? item.paspulId : null, map: paspulMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }>, categoryType: "paspul" },
        { id: 'nogice1Id' in item ? item.nogice1Id : null, map: nogicaMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }>, categoryType: "nogice" },
        { id: 'nogice2Id' in item ? item.nogice2Id : null, map: nogicaMap as Map<string, { materialId: string | null; material: { id: string; name: string } | null }>, categoryType: "nogice" },
      ];

      for (const entry of categoryItemEntries) {
        if (!entry.id) continue;
        // Skip additive behavior for consumed categories (already handled by override)
        if (consumedCategories.has(entry.categoryType)) continue;

        const categoryItem = entry.map.get(entry.id);
        if (!categoryItem || !categoryItem.materialId || !categoryItem.material) continue;

        const existing = allRequirements.find((r) => r.materialId === categoryItem.materialId);
        if (existing) {
          existing.requiredQuantity += item.quantity;
        } else {
          allRequirements.push({
            materialId: categoryItem.materialId,
            materialName: categoryItem.material.name,
            requiredQuantity: item.quantity,
            availableQuantity: 0,
            deficit: 0,
          });
        }
      }
    }

    return allRequirements;
  },

  /**
   * Refresh materials for a production order: recalculate material requirements from
   * the latest normative/BOM data, regenerate work orders and barcodes, and update status.
   * All operations are performed within a single transaction for atomicity.
   */
  async refreshMaterials(orderId: string): Promise<{
    materialCheck: MaterialCheckResult;
    workOrderCount: number;
    barcodeCount: number;
  }> {
    // 1. Fetch order with items, validate existence
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        ...productionOrderInclude,
        normativeVersion: true,
      },
    });
    if (!order) {
      const err = new Error("Proizvodni nalog nije pronađen");
      (err as any).statusCode = 404;
      throw err;
    }

    // 2. Validate status is not in_progress or completed
    if (order.status === ProductionOrderStatus.in_progress) {
      const err = new Error("Nije moguće ažurirati materijale — nalog je već pokrenut");
      (err as any).statusCode = 409;
      throw err;
    }
    if (order.status === ProductionOrderStatus.completed) {
      const err = new Error("Nije moguće ažurirati materijale — nalog je završen");
      (err as any).statusCode = 409;
      throw err;
    }

    // 3. Perform all operations within a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 3a. Delete barcodes of type work_order and part_identifier for this order
      await tx.barcode.deleteMany({
        where: {
          productionOrderId: orderId,
          type: { in: [BarcodeType.work_order, BarcodeType.part_identifier] },
        },
      });

      // 3b. Delete all work orders for this order
      await tx.workOrder.deleteMany({
        where: { productionOrderId: orderId },
      });

      // 3c. Recalculate material requirements
      const allRequirements = await this._calculateAllMaterialRequirements(order);

      // 3d. Check material availability and determine new status
      const materialIds = allRequirements.map((r) => r.materialId);
      const materials = materialIds.length > 0
        ? await tx.material.findMany({ where: { id: { in: materialIds } } })
        : [];
      const stockList = materials.map((m) => ({
        materialId: m.id,
        materialName: m.name,
        currentQuantity: m.currentQuantity,
      }));
      const materialCheck = checkMaterialAvailability(allRequirements, stockList);

      // 3e. Update order status based on material availability
      const newStatus = materialCheck.allAvailable
        ? ProductionOrderStatus.ready
        : ProductionOrderStatus.waiting_material;

      await tx.productionOrder.update({
        where: { id: orderId },
        data: { status: newStatus },
      });

      // 3f. Generate new work orders (same logic as generateWorkOrders but without transitioning to in_progress)
      const orderItems = this._getOrderItems(order);

      // Always use default production steps (latest BOM)
      const workOrderData: Array<{
        productionOrderId: string;
        articlePartId: string;
        departmentId: string;
        productionStepId?: string;
        stepSequence: number;
        itemIndex: number;
        status: WorkOrderStatus;
      }> = [];

      let globalItemIndex = 0;
      for (const item of orderItems) {
        for (const part of item.parts) {
          const steps = await ProductionStepService.getEffectiveSteps(part.id);

          // Parts without steps simply produce no work orders
          if (steps.length === 0) {
            continue;
          }

          for (let i = 0; i < item.quantity; i++) {
            for (const step of steps) {
              workOrderData.push({
                productionOrderId: orderId,
                articlePartId: part.id,
                departmentId: step.departmentId,
                productionStepId: step.stepId,
                stepSequence: step.sequenceOrder,
                itemIndex: globalItemIndex + i,
                status: WorkOrderStatus.pending,
              });
            }
          }
        }
        globalItemIndex += item.quantity;
      }

      await tx.workOrder.createMany({ data: workOrderData });

      // 3g. Generate new part_identifier barcodes
      let barcodeCount = 0;
      globalItemIndex = 0;
      for (const item of orderItems) {
        for (const part of item.parts) {
          for (let i = 0; i < item.quantity; i++) {
            await BarcodeService.generatePartIdentifier(orderId, part.id, globalItemIndex + i);
            barcodeCount++;
          }
        }
        globalItemIndex += item.quantity;
      }

      return { materialCheck, workOrderCount: workOrderData.length, barcodeCount };
    });

    return result;
  },

  /**
   * Internal: Get order items from either new items[] or legacy article relation.
   */
  _getOrderItems(order: ProductionOrderWithRelations): Array<{
    articleId: string;
    articleName: string;
    articleCode: string;
    quantity: number;
    parts: Array<{ id: string; partName: string }>;
  }> {
    if (order.items && order.items.length > 0) {
      return order.items.map((item) => ({
        articleId: item.articleId,
        articleName: item.article.name,
        articleCode: item.article.code ?? "",
        quantity: item.quantity,
        parts: item.article.parts,
      }));
    }
    // Fallback for legacy orders
    if (order.articleId && order.quantity && order.article) {
      return [{
        articleId: order.articleId,
        articleName: order.article.name,
        articleCode: order.article.code ?? "",
        quantity: order.quantity,
        parts: order.article.parts,
      }];
    }
    return [];
  },
};
