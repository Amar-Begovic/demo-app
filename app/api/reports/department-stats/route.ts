import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WorkOrderStatus } from "@/app/generated/prisma";
import { buildDateFilter } from "@/lib/utils/filter-helpers";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Validate date format if parameters are present
    if (dateFrom && !DATE_REGEX.test(dateFrom)) {
      return NextResponse.json(
        { status: 400, code: "INVALID_DATE", message: "Neispravan format datuma. Koristite YYYY-MM-DD." },
        { status: 400 }
      );
    }
    if (dateTo && !DATE_REGEX.test(dateTo)) {
      return NextResponse.json(
        { status: 400, code: "INVALID_DATE", message: "Neispravan format datuma. Koristite YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const dateFilter = buildDateFilter(dateFrom, dateTo);

    const departments = await prisma.department.findMany({
      include: {
        workOrders: dateFilter ? { where: { createdAt: dateFilter } } : true,
      },
      orderBy: { name: "asc" },
    });

    const stats = departments.map((dept) => {
      const total = dept.workOrders.length;
      const pending = dept.workOrders.filter((wo) => wo.status === WorkOrderStatus.pending).length;
      const inProgress = dept.workOrders.filter((wo) => wo.status === WorkOrderStatus.in_progress).length;
      const completed = dept.workOrders.filter((wo) => wo.status === WorkOrderStatus.completed).length;

      const completedWithTimes = dept.workOrders.filter(
        (wo) => wo.status === WorkOrderStatus.completed && wo.startedAt && wo.completedAt
      );
      const avgTime = completedWithTimes.length > 0
        ? Math.round(
            completedWithTimes.reduce(
              (sum, wo) => sum + (new Date(wo.completedAt!).getTime() - new Date(wo.startedAt!).getTime()),
              0
            ) / completedWithTimes.length
          )
        : 0;

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        totalWorkOrders: total,
        pendingWorkOrders: pending,
        inProgressWorkOrders: inProgress,
        completedWorkOrders: completed,
        averageProductionTimeMs: avgTime,
      };
    });

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
