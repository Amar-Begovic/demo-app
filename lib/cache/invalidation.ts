import { updateTag, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "./config";

export class CacheInvalidator {
  /**
   * Immediate invalidation - use in Server Actions for read-your-own-writes
   * Uses updateTag() which is the Next.js 16 Server Action-only API
   */
  static async invalidateImmediate(tags: string[]): Promise<void> {
    for (const tag of tags) {
      updateTag(tag);
    }
  }

  /**
   * Background invalidation - use for batch operations
   * Uses revalidateTag(tag, profile) which invalidates in the background
   */
  static async invalidateBackground(tags: string[], profile: string = "hours"): Promise<void> {
    for (const tag of tags) {
      revalidateTag(tag, profile);
    }
  }

  static async invalidateArticle(articleId: string): Promise<void> {
    await this.invalidateImmediate([
      CACHE_TAGS.ARTICLES,
      CACHE_TAGS.article(articleId),
    ]);
  }

  static async invalidateMaterial(materialId: string): Promise<void> {
    await this.invalidateImmediate([
      CACHE_TAGS.MATERIALS,
      CACHE_TAGS.material(materialId),
    ]);
  }

  static async invalidateProductionOrder(orderId: string): Promise<void> {
    await this.invalidateImmediate([
      CACHE_TAGS.PRODUCTION_ORDERS,
      CACHE_TAGS.productionOrder(orderId),
    ]);
  }

  static async invalidateWorkOrder(orderId: string): Promise<void> {
    await this.invalidateImmediate([
      CACHE_TAGS.WORK_ORDERS,
      CACHE_TAGS.workOrder(orderId),
    ]);
  }

  static async invalidateDepartment(departmentId: string): Promise<void> {
    await this.invalidateImmediate([
      CACHE_TAGS.DEPARTMENTS,
      CACHE_TAGS.department(departmentId),
    ]);
  }

  static async invalidateSupplier(supplierId: string): Promise<void> {
    await this.invalidateImmediate([
      CACHE_TAGS.SUPPLIERS,
      CACHE_TAGS.supplier(supplierId),
    ]);
  }

  static async invalidateBatch(resourceType: string, ids: string[]): Promise<void> {
    const tags: string[] = [];

    const globalTag = CACHE_TAGS[resourceType.toUpperCase() as keyof typeof CACHE_TAGS];
    if (typeof globalTag === "string") {
      tags.push(globalTag);
    }

    const tagGenerator = CACHE_TAGS[resourceType as keyof typeof CACHE_TAGS];
    if (typeof tagGenerator === "function") {
      tags.push(...ids.map(id => tagGenerator(id)));
    }

    await this.invalidateBackground(tags);
  }
}
