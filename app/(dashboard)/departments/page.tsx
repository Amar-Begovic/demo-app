import { CreateDepartmentDialog } from "./components/create-department-dialog";
import { CachedDepartmentsList } from "./cached-departments-list";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function DepartmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 20;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Odjeli</h1>
          <p className="text-muted-foreground">
            Upravljanje proizvodnim odjelima
          </p>
        </div>
        <CreateDepartmentDialog />
      </div>

      <CachedDepartmentsList page={page} pageSize={pageSize} />
    </div>
  );
}
