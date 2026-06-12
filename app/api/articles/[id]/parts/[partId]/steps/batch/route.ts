import { NextRequest, NextResponse } from "next/server";
import { ProductionStepService } from "@/lib/services/production-step.service";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

function mapErrorToStatus(message: string): { status: number; code: string } {
  if (
    message === "Dio artikla nije pronađen" ||
    message === "Odjel nije pronađen" ||
    message === "Jedan ili više odjela nije pronađeno" ||
    message === "Jedan ili više materijala nije pronađeno"
  ) {
    return { status: 404, code: "NOT_FOUND" };
  }
  if (
    message === "Naziv koraka je obavezan" ||
    message === "Količina materijala mora biti veća od 0"
  ) {
    return { status: 400, code: "VALIDATION_ERROR" };
  }
  return { status: 500, code: "INTERNAL_ERROR" };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string }> }
) {
  try {
    const { id, partId } = await params;
    const body = await request.json();

    if (!Array.isArray(body.steps)) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Polje steps je obavezno i mora biti niz" },
        { status: 400 }
      );
    }

    for (const step of body.steps) {
      if (!step.stepName || typeof step.stepName !== "string" || !step.stepName.trim()) {
        return NextResponse.json(
          { status: 400, code: "VALIDATION_ERROR", message: "Svaki korak mora imati stepName" },
          { status: 400 }
        );
      }
      if (!step.departmentId || typeof step.departmentId !== "string") {
        return NextResponse.json(
          { status: 400, code: "VALIDATION_ERROR", message: "Svaki korak mora imati departmentId" },
          { status: 400 }
        );
      }
    }

    const steps = await ProductionStepService.batchSaveSteps(partId, body.steps);

    revalidateTag(CACHE_TAGS.ARTICLES, "max");
    revalidateTag(CACHE_TAGS.article(id), "max");

    return NextResponse.json(steps);
  } catch (error) {
    const message = (error as Error).message;
    const { status, code } = mapErrorToStatus(message);
    return NextResponse.json({ status, code, message }, { status });
  }
}
