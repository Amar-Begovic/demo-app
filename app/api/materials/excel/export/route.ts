import { NextResponse } from "next/server";
import { MaterialExcelExportService } from "@/lib/services/material-excel-export.service";

export async function GET() {
  try {
    const buffer = await MaterialExcelExportService.exportToBuffer();

    const today = new Date().toISOString().slice(0, 10);
    const filename = `materijali-export-${today}.xlsx`;

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
