import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { BasicExcelImportService } from "@/lib/services/basic-excel-import.service";
import { CACHE_TAGS } from "@/lib/cache/config";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { status: 400, code: "NO_FILE", message: "Datoteka nije uploadovana" },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        {
          status: 400,
          code: "INVALID_FORMAT",
          message: "Molimo uploadujte datoteku u .xlsx formatu",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          status: 400,
          code: "FILE_TOO_LARGE",
          message: "Datoteka je prevelika. Maksimalna veličina je 50MB.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await BasicExcelImportService.importArticles(buffer);

    revalidateTag(CACHE_TAGS.ARTICLES, "days");

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 500,
        code: "IMPORT_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Greška pri uvozu artikala",
      },
      { status: 500 }
    );
  }
}
