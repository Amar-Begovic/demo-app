export interface ArticleWithRelation {
  id: string;
  code: string | null;
  relatedArticleCode: string | null;
}

/**
 * Determines if two articles form a complementary pair based on relatedArticleCode.
 * Returns true if A references B and B references A (bidirectional).
 */
export function areComplementary(
  a: ArticleWithRelation,
  b: ArticleWithRelation
): boolean {
  if (
    !a.code ||
    !b.code ||
    !a.relatedArticleCode ||
    !b.relatedArticleCode
  ) {
    return false;
  }
  return (
    a.relatedArticleCode === b.code && b.relatedArticleCode === a.code
  );
}
