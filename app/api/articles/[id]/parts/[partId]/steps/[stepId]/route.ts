import { NextRequest, NextResponse } from "next/server";
import { ProductionStepService } from "@/lib/services/production-step.service";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

function mapErrorToStatus(message: string): { status: number; code: string } {
  if (message === "Dio artikla nije pronađen" || message === "Odjel nije pronađen" || message === "Korak nije pronađen") {
    return { status: 404, code: "NOT_FOUND" };
  }
  if (message === "Redni broj koraka već postoji za ovaj dio") {
    return { status: 409, code: "CONFLICT" };
  }
  if (message.startsWith("Polje")) {
    return { status: 400, code: "VALIDATION_ERROR" };
  }
  if (message.startsWith("Nije moguće obrisati")) {
    return { status: 422, code: "BUSINESS_LOGIC_ERROR" };
  }
  return { status: 500, code: "INTERNAL_ERROR" };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string; stepId: string }> }
) {
  try {
    const { id, stepId } = await params;
    const body = await request.json();

    const step = await ProductionStepService.updateStep(stepId, {
      stepName: body.stepName,
      sequenceOrder: body.sequenceOrder,
      departmentId: body.departmentId,
      estimatedTime: body.estimatedTime,
      instructions: body.instructions,
    });

    revalidateTag(CACHE_TAGS.ARTICLES, "max");
    revalidateTag(CACHE_TAGS.article(id), "max");

    return NextResponse.json(step);
  } catch (error) {
    const message = (error as Error).message;
    const { status, code } = mapErrorToStatus(message);
    return NextResponse.json({ status, code, message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string; stepId: string }> }
) {
  try {
    const { id, stepId } = await params;
    await ProductionStepService.deleteStep(stepId);

    revalidateTag(CACHE_TAGS.ARTICLES, "max");
    revalidateTag(CACHE_TAGS.article(id), "max");

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = (error as Error).message;
    const { status, code } = mapErrorToStatus(message);
    return NextResponse.json({ status, code, message }, { status });
  }
}
