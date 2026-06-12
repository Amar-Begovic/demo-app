import { NextRequest, NextResponse } from "next/server";
import { ExcelImportService } from "@/lib/services/excel-import.service";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function validateFile(file: FormDataEntryValue | null): { error: string } | { buffer: Buffer; valid: true } {
  if (!file || !(file instanceof File)) {
    return { error: "Molimo uploadujte datoteku" };
  }
  if (!file.name.endsWith(".xlsx")) {
    return { error: "Molimo uploadujte datoteku u .xlsx formatu" };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: "Datoteka je prevelika. Maksimalna veličina je 50MB" };
  }
  return { buffer: null as unknown as Buffer, valid: true };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = formData.get("mode")?.toString() ?? "import";
    const createNewMaterials = formData.get("createNewMaterials")?.toString() !== "false";

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Molimo uploadujte datoteku" },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Molimo uploadujte datoteku u .xlsx formatu" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Datoteka je prevelika. Maksimalna veličina je 50MB" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Preview mode: parse and check for unknown materials without writing to DB
    if (mode === "preview") {
      const preview = await ExcelImportService.previewImport(buffer);
      return NextResponse.json(preview, { status: 200 });
    }

    // Import mode: actually write to DB
    const result = await ExcelImportService.importArticles(buffer, createNewMaterials);

    revalidateTag(CACHE_TAGS.ARTICLES, "days");

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 400,
        code: "IMPORT_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Greška pri uvozu Excel datoteke",
      },
      { status: 400 }
    );
  }
}
