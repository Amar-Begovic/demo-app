import { CreateMaterialDialog } from "./components/create-material-dialog";
import { MaterialExcelToolbar } from "./components/material-excel-toolbar";
import { MaterialSearch } from "./components/material-search";
import { CachedMaterialsList } from "./cached-materials-list";
import { ImportPurchaseHistoryDialog } from "./components/import-purchase-history-dialog";

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function MaterialsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 20;
  const search = params.search || "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Materijali</h1>
          <p className="text-muted-foreground">
            Upravljanje materijalima i zalihama
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MaterialExcelToolbar />
          <ImportPurchaseHistoryDialog />
          <CreateMaterialDialog />
        </div>
      </div>

      <MaterialSearch />

      <CachedMaterialsList page={page} pageSize={pageSize} search={search} />
    </div>
  );
}
