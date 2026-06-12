-- AddPiecesToArticlePartMaterial
ALTER TABLE "ArticlePartMaterial" ADD COLUMN "pieces" INTEGER NOT NULL DEFAULT 1;
