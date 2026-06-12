import { NextRequest, NextResponse } from "next/server";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import type { UpdateProductionOrderInput } from "@/lib/services/production-order.service";
import { OrderPriority } from "@/app/generated/prisma";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await ProductionOrderService.getStatus(id);

    if (!result) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Production order with id "${id}" does not exist` },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const errors: Record<string, string[]> = {};

    if (body.items && Array.isArray(body.items)) {
      for (const item of body.items) {
        if (item.priority !== undefined && !Object.values(OrderPriority).includes(item.priority)) {
          errors.priority = ["priority must be one of: urgent, normal, low"];
          break;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Invalid input", details: errors },
        { status: 400 }
      );
    }

    const input: UpdateProductionOrderInput = {};

    if (body.customerName !== undefined) input.customerName = body.customerName;
    if (body.items !== undefined) input.items = body.items;

    const order = await ProductionOrderService.update(id, input);

    revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
    revalidateTag(CACHE_TAGS.productionOrder(id), "max");

    return NextResponse.json(order);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist")) {
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
