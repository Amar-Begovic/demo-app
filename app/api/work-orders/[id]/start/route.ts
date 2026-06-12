import { NextRequest, NextResponse } from "next/server";
import { WorkOrderService } from "@/lib/services/work-order.service";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workOrder = await WorkOrderService.startWork(id);
    revalidateTag(CACHE_TAGS.WORK_ORDERS, "max");
    revalidateTag(CACHE_TAGS.workOrder(id), "max");
    revalidateTag(CACHE_TAGS.PRODUCTION_ORDERS, "max");
    return NextResponse.json(workOrder);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist")) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message },
        { status: 404 }
      );
    }
    if (message.includes("Cannot start")) {
      return NextResponse.json(
        { status: 422, code: "BUSINESS_LOGIC_ERROR", message },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
