import { prisma } from "@/lib/db";
import type { PurchaseOrder } from "@/app/generated/prisma";
import { PurchaseOrderStatus } from "@/app/generated/prisma";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import { AuditLogService } from "@/lib/services/audit-log.service";
import type { PaginationParams, PaginatedResponse } from "@/lib/types/pagination";

export interface PurchaseOrderFilters {
  status?: PurchaseOrderStatus;
  productionOrderId?: string;
}

const purchaseOrderInclude = {
  material: true,
  supplier: true,
  productionOrder: true,
} as const;

export const PurchaseOrderService = {
  /**
   * Get all purchase orders with optional filters.
   */
  async getAll(filters?: PurchaseOrderFilters): Promise<PurchaseOrder[]> {
    const where: Record<string, unknown> = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.productionOrderId) {
      where.productionOrderId = filters.productionOrderId;
    }

    return prisma.purchaseOrder.findMany({
      where,
      include: purchaseOrderInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  async getAllPaginated({ page, pageSize }: PaginationParams, filters?: PurchaseOrderFilters): Promise<PaginatedResponse<{
    id: string;
    requiredQuantity: number;
    status: PurchaseOrderStatus;
    createdAt: Date;
    receivedAt: Date | null;
    material: { id: string; name: string; unit: string };
    supplier: { id: string; companyName: string } | null;
    productionOrder: { id: string; customerName: string | null } | null;
  }>> {
    const skip = (page - 1) * pageSize;
    const where: Record<string, unknown> = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        select: {
          id: true,
          requiredQuantity: true,
          status: true,
          createdAt: true,
          receivedAt: true,
          material: { select: { id: true, name: true, unit: true } },
          supplier: { select: { id: true, companyName: true } },
          productionOrder: { select: { id: true, customerName: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total, page, pageSize };
  },

  /**
   * Get a single purchase order by ID.
   */
  async getById(id: string): Promise<PurchaseOrder | null> {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderInclude,
    });
  },

  /**
   * Get available suppliers for a material from SupplierMaterial relation.
   */
  async getAvailableSuppliers(materialId: string) {
    const supplierLinks = await prisma.supplierMaterial.findMany({
      where: { materialId },
      include: { supplier: true },
    });
    return supplierLinks.map((sl) => sl.supplier);
  },

  /**
   * Create a manual purchase order (not tied to a production order).
   */
  async createManual(data: {
    materialId: string;
    supplierId?: string | null;
    requiredQuantity: number;
    productionOrderId?: string | null;
  }): Promise<PurchaseOrder> {
    return prisma.purchaseOrder.create({
      data: {
        materialId: data.materialId,
        supplierId: data.supplierId ?? null,
        requiredQuantity: data.requiredQuantity,
        productionOrderId: data.productionOrderId ?? null,
      },
      include: purchaseOrderInclude,
    });
  },

  /**
   * Create a purchase order with a specific supplier.
   * supplierId can be null if no supplier is available.
   */
  async createWithSupplier(
    orderId: string,
    materialId: string,
    supplierId: string | null,
    quantity: number
  ): Promise<PurchaseOrder> {
    return prisma.purchaseOrder.create({
      data: {
        productionOrderId: orderId,
        materialId,
        supplierId,
        requiredQuantity: quantity,
      },
      include: purchaseOrderInclude,
    });
  },

  /**
   * Update the supplier on a purchase order.
   * Only allowed on pending POs — rejects for ordered/received.
   */
  async updateSupplier(
    purchaseOrderId: string,
    supplierId: string | null
  ): Promise<PurchaseOrder> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
    });
    if (!po) {
      throw new Error(`Purchase order with id "${purchaseOrderId}" does not exist`);
    }
    if (po.status !== PurchaseOrderStatus.pending) {
      throw new Error("Dobavljač se može promijeniti samo na nalozima u statusu čekanja");
    }
    return prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { supplierId },
      include: purchaseOrderInclude,
    });
  },

  /**
   * Generate an email template for a purchase order.
   * Returns { to, subject, body } where to is null if supplier has no contactEmail.
   */
  async generateEmailTemplate(purchaseOrderId: string): Promise<{
    to: string | null;
    subject: string;
    body: string;
  }> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        material: true,
        supplier: true,
        productionOrder: {
          include: { article: true },
        },
      },
    });

    if (!po) {
      throw new Error(`Purchase order with id "${purchaseOrderId}" does not exist`);
    }

    const material = po.material;
    const supplier = po.supplier;
    const productionOrder = po.productionOrder;

    return {
      to: supplier?.contactEmail ?? null,
      subject: `Narudžba materijala - ${material.name}${productionOrder ? ` - PO:${productionOrder.id.substring(0, 8)}` : ""}`,
      body: [
        `Poštovani,`,
        ``,
        `Molimo Vas za isporuku sljedećeg materijala:`,
        ``,
        `Materijal: ${material.name}`,
        `Količina: ${po.requiredQuantity} ${material.unit}`,
        ...(productionOrder ? [
          `Referenca: PO-${productionOrder.id.substring(0, 8)}`,
          `Artikal: ${productionOrder.article?.name ?? 'N/A'}`,
        ] : []),
        ``,
        `S poštovanjem,`,
        `ProTrack`,
      ].join('\n'),
    };
  },

  /**
   * Mark a purchase order as received:
   * 1. Update PO status to received + set receivedAt
   * 2. Increase material stock by the required quantity
   * 3. Re-evaluate the linked production order status
   */
  async markReceived(id: string): Promise<PurchaseOrder> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderInclude,
    });
    if (!po) {
      throw new Error(`Purchase order with id "${id}" does not exist`);
    }

    if (po.status === PurchaseOrderStatus.received) {
      throw new Error(`Purchase order "${id}" is already received`);
    }

    // Update PO status
    const oldStatus = po.status;
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.received,
        receivedAt: new Date(),
      },
      include: purchaseOrderInclude,
    });

    try {
      await AuditLogService.log({
        entityType: "purchase_order",
        entityId: id,
        action: "status_change",
        details: { oldStatus, newStatus: PurchaseOrderStatus.received },
      });
    } catch (e) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", e);
    }

    // Update material stock
    await prisma.material.update({
      where: { id: po.materialId },
      data: {
        currentQuantity: { increment: po.requiredQuantity },
      },
    });

    // Re-evaluate the linked production order (if any)
    if (po.productionOrderId) {
      await ProductionOrderService.checkMaterialAvailability(po.productionOrderId);
    }

    return updatedPO;
  },
};
