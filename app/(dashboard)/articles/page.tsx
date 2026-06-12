import { BasicExcelToolbar } from "./components/basic-excel-toolbar";
import { CreateArticleDialog } from "./components/create-article-dialog";
import { ExcelToolbar } from "./components/excel-toolbar";
import { ArticleSearch } from "./components/article-search";
import { CachedArticlesList } from "./cached-articles-list";
import { ArticleSelectionProvider } from "./components/article-selection-context";
import { SelectionToolbar } from "./components/selection-toolbar";
import { ArticlePrintButton } from "./components/print-button";

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; bom?: string }>;
}

export default async function ArticlesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 20;
  const search = params.search || "";
  const bom = params.bom || "all";

  const printParams = new URLSearchParams();
  if (search) printParams.set("search", search);
  if (bom && bom !== "all") printParams.set("bom", bom);
  const printUrl = `/articles/print/plan-utroska${printParams.toString() ? `?${printParams}` : ""}`;

  return (
    <ArticleSelectionProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Artikli</h1>
            <p className="text-muted-foreground">
              Upravljanje artiklima i sastavnicama (BOM)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ArticlePrintButton baseUrl={printUrl} />
            <div className="h-6 w-px bg-border" />
            <BasicExcelToolbar />
            <div className="h-6 w-px bg-border" />
            <ExcelToolbar />
            <CreateArticleDialog />
          </div>
        </div>

        <ArticleSearch />

        <SelectionToolbar />

        <CachedArticlesList page={page} pageSize={pageSize} search={search} bom={bom} />
      </div>
    </ArticleSelectionProvider>
  );
}
