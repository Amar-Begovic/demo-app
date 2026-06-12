import { CachedArchivedList } from "./cached-archived-list";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ObrisaniPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 20;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Obrisani nalozi</h1>
        <p className="text-muted-foreground">
          Pregled arhiviranih proizvodnih naloga
        </p>
      </div>

      <CachedArchivedList page={page} pageSize={pageSize} />
    </div>
  );
}
