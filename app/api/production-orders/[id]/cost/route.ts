import { NextRequest, NextResponse } from "next/server";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import { calculateOrderCost } from "@/lib/utils/calculations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await ProductionOrderService.getById(id);
    if (!order) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Production order with id "${id}" does not exist` },
        { status: 404 }
      );
    }

    // Build items from new multi-item or legacy single-article
    const items = order.items && order.items.length > 0
      ? order.items.map((item) => ({
          articleId: item.articleId,
          articleName: item.article.name,
          quantity: item.quantity,
          sellingPrice: item.article.priceWithoutVAT ?? null,
          parts: item.article.parts.map((part) => ({
            steps: part.productionSteps.map((step) => ({
              materials: step.materials.map((sm) => ({
                materialId: sm.materialId,
                materialName: sm.material.name,
                quantity: sm.quantity,
                price: sm.material.price ?? null,
              })),
            })),
          })),
        }))
      : order.article
        ? [{
            articleId: order.article.id,
            articleName: order.article.name,
            quantity: order.quantity ?? 1,
            sellingPrice: order.article.priceWithoutVAT ?? null,
            parts: order.article.parts.map((part) => ({
              steps: part.productionSteps.map((step) => ({
                materials: (step as unknown as { materials: Array<{ materialId: string; material: { name: string; price: number | null }; quantity: number }> }).materials?.map((sm) => ({
                  materialId: sm.materialId,
                  materialName: sm.material.name,
                  quantity: sm.quantity,
                  price: sm.material.price ?? null,
                })) ?? [],
              })),
            })),
          }]
        : [];

    const costBreakdown = calculateOrderCost(items);
    return NextResponse.json(costBreakdown);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
