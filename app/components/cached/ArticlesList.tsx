"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { ArticleService } from "@/lib/services/article.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function ArticlesList() {
  cacheLife("days");
  cacheTag(CACHE_TAGS.ARTICLES);

  const articles = await ArticleService.getAll();

  return (
    <div className="space-y-4">
      {articles.map((article) => (
        <div key={article.id} className="border rounded-lg p-4">
          <h3 className="font-semibold text-lg">{article.name}</h3>
          {article.description && (
            <p className="text-sm text-gray-600 mt-1">{article.description}</p>
          )}
          {article.code && (
            <p className="text-xs text-gray-500 mt-1">Code: {article.code}</p>
          )}
        </div>
      ))}
    </div>
  );
}
