import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { MaterialService } from "@/lib/services/material.service";
import type { MaterialFilters } from "@/lib/services/material.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const filters: MaterialFilters = {};

    const search = searchParams.get("search");
    if (search) filters.search = search;

    const sortBy = searchParams.get("sortBy");
    if (sortBy === "name" || sortBy === "currentQuantity") {
      filters.sortBy = sortBy;
    }

    const sortOrder = searchParams.get("sortOrder");
    if (sortOrder === "asc" || sortOrder === "desc") {
      filters.sortOrder = sortOrder;
    }

    const materials = await MaterialService.getAll(filters);
    return NextResponse.json(materials);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const errors: Record<string, string[]> = {};
    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      errors.name = ["Name is required"];
    }
    if (!body.unit || typeof body.unit !== "string" || body.unit.trim() === "") {
      errors.unit = ["Unit is required"];
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Invalid input", details: errors },
        { status: 400 }
      );
    }

    const material = await MaterialService.create({
      name: body.name.trim(),
      unit: body.unit.trim(),
      code: body.code !== undefined ? (body.code ? String(body.code).trim() : null) : undefined,
      price: body.price !== undefined ? (body.price !== null ? parseFloat(body.price) : null) : undefined,
      currentQuantity: body.currentQuantity ?? 0,
      minimumQuantity: body.minimumQuantity ?? 0,
    });

    revalidateTag(CACHE_TAGS.MATERIALS, "max");

    return NextResponse.json(material, { status: 201 });
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
