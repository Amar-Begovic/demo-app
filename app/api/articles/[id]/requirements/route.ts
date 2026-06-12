import { NextRequest, NextResponse } from "next/server";
import { ArticleService } from "@/lib/services/article.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quantityParam = request.nextUrl.searchParams.get("quantity");

    if (!quantityParam || isNaN(Number(quantityParam)) || Number(quantityParam) < 1) {
      return NextResponse.json(
        {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { quantity: ["quantity must be a positive integer"] },
        },
        { status: 400 }
      );
    }

    const quantity = parseInt(quantityParam, 10);
    const requirements = await ArticleService.calculateMaterialRequirements(id, quantity);

    return NextResponse.json(requirements);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist")) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
