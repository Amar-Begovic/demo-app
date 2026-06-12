import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { MaterialService } from "@/lib/services/material.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await MaterialService.getById(id);

    if (!existing) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Material with id "${id}" not found` },
        { status: 404 }
      );
    }

    const body = await request.json();

    if (typeof body.quantityChange !== "number") {
      return NextResponse.json(
        {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { quantityChange: ["quantityChange must be a number"] },
        },
        { status: 400 }
      );
    }

    const material = await MaterialService.updateStock(id, body.quantityChange, {
      referenceType: body.referenceType,
      referenceId: body.referenceId,
      notes: body.notes,
      changeType: body.changeType,
    });

    revalidateTag(CACHE_TAGS.MATERIALS, "max");
    revalidateTag(CACHE_TAGS.material(id), "max");

    return NextResponse.json(material);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
