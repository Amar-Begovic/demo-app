import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const dateFrom = request.nextUrl.searchParams.get("dateFrom");
    const dateTo = request.nextUrl.searchParams.get("dateTo");

    // Build date filter for production orders
    const createdAtFilter: Record<string, Date> = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) createdAtFilter.gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        createdAtFilter.lte = to;
      }
    }

    // Get production orders that have component barcodes (packaging-enabled)
    const orders = await prisma.productionOrder.findMany({
      where: {
        isArchived: false,
        status: { in: ["in_progress", "completed"] },
        ...(Object.keys(createdAtFilter).length > 0
          ? { createdAt: createdAtFilter }
          : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        customerName: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            serialNumber: true,
            article: { select: { id: true, name: true, code: true } },
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get all component barcodes with scan status for these orders
    const orderIds = orders.map((o) => o.id);
    const componentBarcodes = orderIds.length > 0
      ? await prisma.componentBarcode.findMany({
          where: { productionOrderId: { in: orderIds } },
          include: { packagingScan: true },
          orderBy: [{ productionOrderId: "asc" }, { itemIndex: "asc" }, { createdAt: "asc" }],
        })
      : [];

    // Get all product barcodes (PR) with scan info
    const productBarcodes = orderIds.length > 0
      ? await prisma.barcode.findMany({
          where: {
            productionOrderId: { in: orderIds },
            type: "product",
          },
          orderBy: [{ productionOrderId: "asc" }, { itemIndex: "asc" }],
        })
      : [];

    // Group component barcodes by order+itemIndex
    const cbByOrderItem = new Map<string, typeof componentBarcodes>();
    for (const cb of componentBarcodes) {
      const key = `${cb.productionOrderId}-${cb.itemIndex}`;
      if (!cbByOrderItem.has(key)) cbByOrderItem.set(key, []);
      cbByOrderItem.get(key)!.push(cb);
    }

    // Group product barcodes by order
    const prByOrder = new Map<string, typeof productBarcodes>();
    for (const pr of productBarcodes) {
      if (!pr.productionOrderId) continue;
      if (!prByOrder.has(pr.productionOrderId)) prByOrder.set(pr.productionOrderId, []);
      prByOrder.get(pr.productionOrderId)!.push(pr);
    }

    // Get all work orders to check completion status per item
    const workOrders = orderIds.length > 0
      ? await prisma.workOrder.findMany({
          where: { productionOrderId: { in: orderIds } },
          select: { productionOrderId: true, itemIndex: true, status: true },
        })
      : [];

    // Group work orders by order+itemIndex
    const woByOrderItem = new Map<string, typeof workOrders>();
    for (const wo of workOrders) {
      if (wo.itemIndex == null) continue;
      const key = `${wo.productionOrderId}-${wo.itemIndex}`;
      if (!woByOrderItem.has(key)) woByOrderItem.set(key, []);
      woByOrderItem.get(key)!.push(wo);
    }

    // Build report data
    const report = orders
      .filter((order) => {
        // Only include orders that have component barcodes
        return componentBarcodes.some((cb) => cb.productionOrderId === order.id);
      })
      .map((order) => {
        // Calculate total items across all order items
        let globalItemIndex = 0;
        const items: Array<{
          itemIndex: number;
          articleName: string;
          articleCode: string | null;
          serialNumber: string | null;
          components: Array<{ name: string; scanned: boolean; scannedAt: string | null }>;
          allComponentsScanned: boolean;
          itemCompleted: boolean;
          hasProductBarcode: boolean;
        }> = [];

        for (const orderItem of order.items) {
          for (let i = 0; i < orderItem.quantity; i++) {
            const key = `${order.id}-${globalItemIndex}`;
            const cbs = cbByOrderItem.get(key) ?? [];

            const components = cbs.map((cb) => ({
              name: cb.componentName,
              scanned: !!cb.packagingScan,
              scannedAt: cb.packagingScan?.scannedAt.toISOString() ?? null,
            }));

            const allComponentsScanned = cbs.length > 0 && cbs.every((cb) => !!cb.packagingScan);

            // Check if product barcode exists for this item
            const prs = prByOrder.get(order.id) ?? [];
            const hasProductBarcode = prs.some((pr) => pr.itemIndex === globalItemIndex);

            // Check if all work orders for this item are completed
            // If no work orders exist, check if the production order itself is completed
            const woKey = `${order.id}-${globalItemIndex}`;
            const itemWOs = woByOrderItem.get(woKey) ?? [];
            const itemCompleted = itemWOs.length > 0
              ? itemWOs.every((wo) => wo.status === "completed")
              : order.status === "completed";

            items.push({
              itemIndex: globalItemIndex,
              articleName: orderItem.article.name,
              articleCode: orderItem.article.code,
              serialNumber: orderItem.serialNumber ?? null,
              components,
              allComponentsScanned,
              itemCompleted,
              hasProductBarcode,
            });

            globalItemIndex++;
          }
        }

        const totalItems = items.length;
        const packedItems = items.filter((it) => it.allComponentsScanned || it.itemCompleted).length;

        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          customerName: order.customerName,
          createdAt: order.createdAt.toISOString(),
          totalItems,
          packedItems,
          isFullyPacked: totalItems > 0 && packedItems === totalItems,
          items,
        };
      });

    return NextResponse.json(report);
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
