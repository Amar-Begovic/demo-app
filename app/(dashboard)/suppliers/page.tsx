import { CreateSupplierDialog } from "./components/create-supplier-dialog";
import { CachedSuppliersList } from "./cached-suppliers-list";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SuppliersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 20;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dobavljači</h1>
          <p className="text-muted-foreground">
            Upravljanje dobavljačima materijala
          </p>
        </div>
        <CreateSupplierDialog />
      </div>

      <CachedSuppliersList page={page} pageSize={pageSize} />
    </div>
  );
}
