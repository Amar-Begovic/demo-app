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

    const completedOrders = await prisma.workOrder.findMany({
      where: {
        status: WorkOrderStatus.completed,
        startedAt: { not: null },
        completedAt: {
          not: null,
          ...(dateFilter ?? {}),
        },
      },
      include: {
        department: true,
        articlePart: true,
      },
    });

    // Group by department
    const byDepartment = new Map<string, { name: string; times: number[] }>();
    // Group by part type
    const byPartType = new Map<string, { name: string; times: number[] }>();

    for (const wo of completedOrders) {
      const elapsed = new Date(wo.completedAt!).getTime() - new Date(wo.startedAt!).getTime();

      const deptKey = wo.departmentId;
      if (!byDepartment.has(deptKey)) {
        byDepartment.set(deptKey, { name: wo.department.name, times: [] });
      }
      byDepartment.get(deptKey)!.times.push(elapsed);

      const partKey = wo.articlePart.partName;
      if (!byPartType.has(partKey)) {
        byPartType.set(partKey, { name: partKey, times: [] });
      }
      byPartType.get(partKey)!.times.push(elapsed);
    }

    const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

    const departmentStats = Array.from(byDepartment.entries()).map(([id, data]) => ({
      departmentId: id,
      departmentName: data.name,
      averageTimeMs: Math.round(avg(data.times)),
      completedCount: data.times.length,
    }));

    const partTypeStats = Array.from(byPartType.entries()).map(([name, data]) => ({
      partName: name,
      averageTimeMs: Math.round(avg(data.times)),
      completedCount: data.times.length,
    }));

    return NextResponse.json({ departmentStats, partTypeStats });
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
