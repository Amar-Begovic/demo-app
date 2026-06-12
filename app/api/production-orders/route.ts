import { NextRequest, NextResponse } from "next/server";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import type { CreateProductionOrderInput } from "@/lib/services/production-order.service";
import { ProductionOrderStatus, OrderPriority } from "@/app/generated/prisma";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function GET(request: NextRequest) {
  try {
    const statusParam = request.nextUrl.searchParams.get("status");
    const filters: { status?: ProductionOrderStatus } = {};

    if (statusParam && Object.values(ProductionOrderStatus).includes(statusParam as ProductionOrderStatus)) {
      filters.status = statusParam as ProductionOrderStatus;
    }

    const orders = await ProductionOrderService.getAll(filters);
    return NextResponse.json(orders);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const errors: Record<string, string[]> = {};

    // Validate items array
    if (!Array.isArray(body.items) || body.items.length === 0) {
      errors.items = ["At least one item is required"];
    } else {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        if (!item.articleId || typeof item.articleId !== "string") {
          errors[`items[${i}].articleId`] = ["articleId is required"];
        }
        if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
          errors[`items[${i}].quantity`] = ["quantity must be a positive integer"];
        }
      }
    }

    // Validate priority if provided at item level
    if (Array.isArray(body.items)) {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        if (item.priority && !Object.values(OrderPriority).includes(item.priority)) {
          errors[`items[${i}].priority`] = ["priority must be one of: urgent, normal, low"];
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Invalid input", details: errors },
        { status: 400 }
      );
    }

    const input: CreateProductionOrderInput = {
      items: body.items.map((item: { articleId: string; quantity: number; fabricId?: string; ruckaId?: string; paspulId?: string; nogice1Id?: string; nogice2Id?: string; deliveryDeadline?: string; priority?: string; notes?: string; customerOrderNumber?: string }) => ({
        articleId: item.articleId,
        quantity: item.quantity,
        fabricId: item.fabricId,
        ruckaId: item.ruckaId || undefined,
        paspulId: item.paspulId || undefined,
        nogice1Id: item.nogice1Id || undefined,
        nogice2Id: item.nogice2Id || undefined,
        deliveryDeadline: item.deliveryDeadline ? new Date(item.deliveryDeadline) : undefined,
        priority: item.priority as OrderPriority | undefined,
        notes: item.notes,
        customerOrderNumber: item.customerOrderNumber,
      })),
      customerName: body.customerName,
    };

    const order = await ProductionOrderService.create(input);
    revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("nije pronađen") || message.includes("does not exist")) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
