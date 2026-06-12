import { NextRequest, NextResponse } from "next/server";
import { WorkOrderService } from "@/lib/services/work-order.service";
import { getHighestPriority } from "@/lib/utils/calculations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workOrders = await WorkOrderService.getByDepartment(id);

    const enriched = await Promise.all(
      workOrders.map(async (wo) => {
        const canStart =
          wo.status === "pending" && wo.productionStepId
            ? (await WorkOrderService.canStartWorkOrder(wo)).allowed
            : wo.status === "pending"
              ? true
              : null;

        // Derive priority from production order items (priority moved from order to items)
        const woAny = wo as Record<string, unknown>;
        const po = woAny.productionOrder as { id: string; items?: Array<{ priority: string }> } | undefined;
        const items = po?.items ?? [];
        const priority = getHighestPriority(items);

        return {
          ...wo,
          canStart,
          productionOrder: {
            id: (po?.id ?? (wo as { productionOrderId: string }).productionOrderId),
            priority,
          },
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
