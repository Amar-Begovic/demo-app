"use server";

import { ArticleService } from "@/lib/services/article.service";
import type { CreateArticleInput } from "@/lib/services/article.service";
import type { ActionResult } from "@/lib/types/actions";
import { updateTag, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/config";

/**
 * Server Action: Create a new article
 * Uses updateTag for immediate read-your-own-writes semantics
 */
export async function createArticle(data: CreateArticleInput) {
  try {
    const article = await ArticleService.create(data);
    updateTag(CACHE_TAGS.ARTICLES);
    return { success: true, data: article };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create article",
    };
  }
}

/**
 * Server Action: Update an existing article
 * Invalidates both global articles cache and specific article cache
 */
export async function updateArticle(id: string, data: CreateArticleInput) {
  try {
    const article = await ArticleService.update(id, data);
    updateTag(CACHE_TAGS.ARTICLES);
    updateTag(CACHE_TAGS.article(id));
    return { success: true, data: article };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update article",
    };
  }
}

/**
 * Server Action: Delete an article
 */
export async function deleteArticle(id: string) {
  try {
    throw new Error("Delete functionality not yet implemented in ArticleService");
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete article",
    };
  }
}

/**
 * Server Action: Batch import articles
 * Uses revalidateTag for background invalidation (better for batch ops)
 */
export async function batchImportArticles(articles: CreateArticleInput[]) {
  try {
    const results = [];
    const errors = [];

    for (let i = 0; i < articles.length; i++) {
      try {
        const article = await ArticleService.create(articles[i]);
        results.push(article);
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    revalidateTag(CACHE_TAGS.ARTICLES, "days");

    return {
      success: true,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to batch import articles",
    };
  }
}
