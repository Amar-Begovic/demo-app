import { NextRequest, NextResponse } from "next/server";
import { BasicExcelExportService } from "@/lib/services/basic-excel-export.service";

export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

    const buffer = await BasicExcelExportService.exportToBuffer(ids);

    const today = new Date().toISOString().slice(0, 10);
    const filename = ids
      ? `artikli-odabrani-${today}.xlsx`
      : `artikli-osnovni-export-${today}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Greška pri generisanju Excel datoteke",
      },
      { status: 500 }
    );
  }
}
