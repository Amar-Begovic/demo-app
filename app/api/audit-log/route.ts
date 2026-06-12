import { NextRequest, NextResponse } from "next/server";
import { AuditLogService } from "@/lib/services/audit-log.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const entityType = searchParams.get("entityType") ?? undefined;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

    const result = await AuditLogService.getAll({
      entityType,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: isNaN(page) || page < 1 ? 1 : page,
      pageSize: isNaN(pageSize) || pageSize < 1 ? 20 : pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
