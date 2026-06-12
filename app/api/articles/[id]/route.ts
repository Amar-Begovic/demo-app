import { NextRequest, NextResponse } from "next/server";
import { ArticleService } from "@/lib/services/article.service";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const article = await ArticleService.getById(id);

    if (!article) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Article with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(article);
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

    const article = await ArticleService.update(id, {
      name: body.name.trim(),
      description: body.description,
      dimensions: body.dimensions,
      code: body.code,
      model: body.model,
      type: body.type,
      articleGroup: body.articleGroup,
      unit: body.unit,
      inactive: body.inactive,
      currency: body.currency,
      priceWithoutVAT: body.priceWithoutVAT,
      taxPercentage: body.taxPercentage,
      relatedArticleCode: body.relatedArticleCode,
      parts: body.parts,
    });

    revalidateTag(CACHE_TAGS.ARTICLES, "max");
    revalidateTag(CACHE_TAGS.article(id), "max");

    return NextResponse.json(article);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist") || message.includes("not found")) {
      const status = message.includes("does not exist") ? 404 : 422;
      return NextResponse.json(
        { status, code: status === 404 ? "NOT_FOUND" : "BUSINESS_LOGIC_ERROR", message },
        { status }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
