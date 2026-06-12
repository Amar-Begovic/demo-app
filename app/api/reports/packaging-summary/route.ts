import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDateParam, buildDateFilter } from "@/lib/utils/filter-helpers";

export async function GET(request: NextRequest) {
  try {
    const now = new Date();

    // Parse optional date filter params
    const dateFromStr = request.nextUrl.searchParams.get("dateFrom");
    const dateToStr = request.nextUrl.searchParams.get("dateTo");
    const dateFromParsed = parseDateParam(dateFromStr);
    const dateToParsed = parseDateParam(dateToStr);
    const dateFilter = buildDateFilter(
      dateFromParsed ? dateFromStr : null,
      dateToParsed ? dateToStr : null
    );
    const hasDateFilter = dateFilter !== null;

    // Today: start of day
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // This week: Monday start
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    // This month: 1st of month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Count scanned components per period
    const [todayScans, weekScans, monthScans, totalScans] = await Promise.all([
      prisma.packagingScan.count({ where: { scannedAt: { gte: todayStart } } }),
      prisma.packagingScan.count({ where: { scannedAt: { gte: weekStart } } }),
      prisma.packagingScan.count({ where: { scannedAt: { gte: monthStart } } }),
      prisma.packagingScan.count(),
    ]);

    // Count filtered scans when date params are provided
    let filteredScans: number | undefined;
    if (hasDateFilter) {
      filteredScans = await prisma.packagingScan.count({
        where: { scannedAt: dateFilter },
      });
    }

    // Count fully packed items (all components scanned) per period
    // A "fully packed item" = a (productionOrderId, itemIndex) where ALL component barcodes have a scan
    const allComponentBarcodes = await prisma.componentBarcode.findMany({
      select: {
        productionOrderId: true,
        itemIndex: true,
        packagingScan: { select: { scannedAt: true } },
      },
    });

    // Group by productionOrderId+itemIndex
    const itemGroups = new Map<string, { scannedAts: (Date | null)[] }>();
    for (const cb of allComponentBarcodes) {
      const key = `${cb.productionOrderId}-${cb.itemIndex}`;
      if (!itemGroups.has(key)) itemGroups.set(key, { scannedAts: [] });
      itemGroups.get(key)!.scannedAts.push(cb.packagingScan?.scannedAt ?? null);
    }

    // A fully packed item: all components have scannedAt, completion time = max scannedAt
    let todayPacked = 0;
    let weekPacked = 0;
    let monthPacked = 0;
    let totalPacked = 0;
    let filteredPacked: number | undefined;
    if (hasDateFilter) filteredPacked = 0;

    for (const [, group] of itemGroups) {
      if (group.scannedAts.length === 0) continue;
      if (group.scannedAts.some((s) => s === null)) continue;

      // All scanned — find when the last component was scanned (= completion time)
      const completedAt = new Date(Math.max(...group.scannedAts.map((s) => s!.getTime())));
      totalPacked++;
      if (completedAt >= todayStart) todayPacked++;
      if (completedAt >= weekStart) weekPacked++;
      if (completedAt >= monthStart) monthPacked++;

      // Check if completion falls within the custom date range
      if (hasDateFilter && filteredPacked !== undefined) {
        let inRange = true;
        if (dateFilter!.gte && completedAt < dateFilter!.gte) inRange = false;
        if (dateFilter!.lte && completedAt > dateFilter!.lte) inRange = false;
        if (inRange) filteredPacked++;
      }
    }

    // Per-component-type breakdown (e.g. Lijeva Baza, Desna Baza, Nogice, Madrac, Uzglavlje)
    const scannedComponents = await prisma.packagingScan.findMany({
      select: {
        scannedAt: true,
        componentBarcode: { select: { componentName: true } },
      },
    });

    const byComponent: Record<string, { today: number; week: number; month: number; total: number; filtered?: number }> = {};
    for (const scan of scannedComponents) {
      const name = scan.componentBarcode.componentName;
      if (!byComponent[name]) {
        byComponent[name] = { today: 0, week: 0, month: 0, total: 0 };
        if (hasDateFilter) byComponent[name].filtered = 0;
      }
      byComponent[name].total++;
      if (scan.scannedAt >= monthStart) byComponent[name].month++;
      if (scan.scannedAt >= weekStart) byComponent[name].week++;
      if (scan.scannedAt >= todayStart) byComponent[name].today++;

      // Check if scan falls within the custom date range
      if (hasDateFilter) {
        let inRange = true;
        if (dateFilter!.gte && scan.scannedAt < dateFilter!.gte) inRange = false;
        if (dateFilter!.lte && scan.scannedAt > dateFilter!.lte) inRange = false;
        if (inRange) byComponent[name].filtered = (byComponent[name].filtered ?? 0) + 1;
      }
    }

    const components: Record<string, number> = {
      today: todayScans,
      week: weekScans,
      month: monthScans,
      total: totalScans,
    };
    if (hasDateFilter && filteredScans !== undefined) {
      components.filtered = filteredScans;
    }

    const items: Record<string, number> = {
      today: todayPacked,
      week: weekPacked,
      month: monthPacked,
      total: totalPacked,
    };
    if (hasDateFilter && filteredPacked !== undefined) {
      items.filtered = filteredPacked;
    }

    return NextResponse.json({
      components,
      items,
      byComponent,
    });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
