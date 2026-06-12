import { NextRequest, NextResponse } from "next/server";
import { StockHistoryService } from "@/lib/services/stock-history.service";
import { StockChangeType } from "@/app/generated/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;

    const changeTypeParam = searchParams.get("changeType");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const filters: {
      changeType?: StockChangeType;
      from?: Date;
      to?: Date;
    } = {};

    if (changeTypeParam && Object.values(StockChangeType).includes(changeTypeParam as StockChangeType)) {
      filters.changeType = changeTypeParam as StockChangeType;
    }

    if (from) filters.from = new Date(from);
    if (to) filters.to = new Date(to);

    const history = await StockHistoryService.getByMaterial(id, filters);
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
