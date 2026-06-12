"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { ArticleService } from "@/lib/services/article.service";
import { CACHE_TAGS } from "@/lib/cache/config";
import { PaginationControls } from "../components/pagination-controls";
import { ArticlesTable } from "./components/articles-table";

interface CachedArticlesListProps {
  page: number;
  pageSize: number;
  search?: string;
  bom?: string;
}

export async function CachedArticlesList({ page, pageSize, search, bom }: CachedArticlesListProps) {
  cacheLife("days");
  cacheTag(CACHE_TAGS.ARTICLES);

  const { data, total } = await ArticleService.getAllPaginated({ page, pageSize }, search, bom);

  // Serialize dates for client component
  const serializedData = data.map((article) => ({
    ...article,
    createdAt: article.createdAt.toISOString(),
  }));

  return (
    <>
      <ArticlesTable data={serializedData} />
      <PaginationControls page={page} total={total} pageSize={pageSize} />
    </>
  );
}
