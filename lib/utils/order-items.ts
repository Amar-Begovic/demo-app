import type { Article } from "@/app/generated/prisma";

/**
 * Represents an order with either new-style items or legacy articleId/quantity fields.
 * Used by getOrderItems() for backward-compatible item extraction.
 */
export interface OrderWithItems {
  items?: Array<{
    id?: string; // Prisma auto-generated ID (optional for compatibility)
    articleId: string;
    quantity: number;
    article: { id: string; name: string } | Article;
  }>;
  articleId?: string | null;
  quantity?: number | null;
  article?: { id: string; name: string } | Article | null;
}

/**
 * Extract order items from a production order, supporting both new multi-item
 * format and legacy single-article format.
 *
 * Returns items from ProductionOrderItem[] if present, otherwise falls back
 * to legacy articleId/quantity fields on the order itself.
 */
export function getOrderItems(
  order: OrderWithItems
): Array<{ articleId: string; quantity: number; article: { id: string; name: string } | Article }> {
  if (order.items && order.items.length > 0) {
    return order.items.map((item) => ({
      articleId: item.articleId,
      quantity: item.quantity,
      article: item.article,
    }));
  }

  // Fallback for legacy orders
  if (order.articleId && order.quantity && order.article) {
    return [
      {
        articleId: order.articleId,
        quantity: order.quantity,
        article: order.article,
      },
    ];
  }

  return [];
}
