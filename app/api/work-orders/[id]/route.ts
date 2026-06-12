import { NextRequest, NextResponse } from "next/server";
import { WorkOrderService } from "@/lib/services/work-order.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workOrder = await WorkOrderService.getById(id);

    if (!workOrder) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Work order with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(workOrder);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
