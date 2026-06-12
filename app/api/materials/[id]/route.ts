import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { MaterialService } from "@/lib/services/material.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const material = await MaterialService.getById(id);

    if (!material) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Material with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(material);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const material = await MaterialService.update(id, {
      name: body.name,
      unit: body.unit,
      code: body.code !== undefined ? (body.code ? String(body.code).trim() : null) : undefined,
      price: body.price !== undefined ? (body.price !== null ? parseFloat(body.price) : null) : undefined,
      currentQuantity: body.currentQuantity,
      minimumQuantity: body.minimumQuantity,
    });

    revalidateTag(CACHE_TAGS.MATERIALS, "max");
    revalidateTag(CACHE_TAGS.material(id), "max");

    return NextResponse.json(material);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("Šifra materijala već postoji")) {
      return NextResponse.json(
        { status: 409, code: "DUPLICATE_CODE", message },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
