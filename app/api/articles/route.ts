import { NextRequest, NextResponse } from "next/server";
import { ArticleService } from "@/lib/services/article.service";

export async function GET() {
  try {
    const articles = await ArticleService.getAll();
    return NextResponse.json(articles);
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
    if (!Array.isArray(body.parts)) {
      errors.parts = ["Parts must be an array"];
    }

    // Validate pieces field in materials
    if (Array.isArray(body.parts)) {
      body.parts.forEach((part: any, partIdx: number) => {
        if (Array.isArray(part.materials)) {
          part.materials.forEach((mat: any, matIdx: number) => {
            if (mat.pieces !== undefined) {
              if (!Number.isInteger(mat.pieces) || mat.pieces < 1) {
                errors[`parts[${partIdx}].materials[${matIdx}].pieces`] = [
                  "Pieces must be a positive integer (>= 1)"
                ];
              }
            }
          });
        }
      });
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Invalid input", details: errors },
        { status: 400 }
      );
    }

    const article = await ArticleService.create({
      name: body.name.trim(),
      description: body.description,
      dimensions: body.dimensions,
      code: body.code,
      type: body.type,
      unit: body.unit,
      inactive: body.inactive,
      currency: body.currency,
      priceWithoutVAT: body.priceWithoutVAT,
      taxPercentage: body.taxPercentage,
      parts: body.parts,
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("not found")) {
      return NextResponse.json(
        { status: 422, code: "BUSINESS_LOGIC_ERROR", message },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
