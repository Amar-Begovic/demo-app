import { ProductionOrderStatus, OrderPriority } from "@/app/generated/prisma";
import { parseDateParam } from "@/lib/utils/filter-helpers";
import { LazyCreateDialog } from "./components/lazy-create-dialog";
import { StatusFilter } from "./components/status-filter";
import { PriorityFilter } from "./components/priority-filter";
import { SortSelect } from "./components/sort-select";
import { DateRangeFilter } from "./components/date-range-filter";
import { CustomerFilter } from "./components/customer-filter";
import { CachedProductionList } from "./cached-production-list";

const validStatuses = new Set(Object.values(ProductionOrderStatus));
const validPriorities = new Set(Object.values(OrderPriority));
const validSorts = new Set(["createdAt", "deadline"]);

interface PageProps {
  searchParams: Promise<{ page?: string; status?: string; priority?: string; sort?: string; dateFrom?: string; dateTo?: string; customer?: string }>;
}

export default async function ProductionOrdersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 20;

  const statusParam = params.status;
  const status = statusParam && validStatuses.has(statusParam as ProductionOrderStatus)
    ? (statusParam as ProductionOrderStatus)
    : undefined;

  const priorityParam = params.priority;
  const priority = priorityParam && validPriorities.has(priorityParam as OrderPriority)
    ? (priorityParam as OrderPriority)
    : undefined;

  const sortParam = params.sort;
  const sort = sortParam && validSorts.has(sortParam)
    ? (sortParam as "createdAt" | "deadline")
    : undefined;

  // Validate dateFrom/dateTo — ignore invalid ISO dates
  const dateFrom = parseDateParam(params.dateFrom) ? params.dateFrom : undefined;
  const dateTo = parseDateParam(params.dateTo) ? params.dateTo : undefined;
  const customer = params.customer || undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proizvodni nalozi</h1>
          <p className="text-muted-foreground">
            Upravljanje proizvodnim nalozima i praćenje statusa
          </p>
        </div>
        <LazyCreateDialog />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusFilter />
        <PriorityFilter />
        <SortSelect />
        <DateRangeFilter />
        <CustomerFilter />
      </div>

      <CachedProductionList page={page} pageSize={pageSize} status={status} priority={priority} sort={sort} dateFrom={dateFrom} dateTo={dateTo} customer={customer} />
    </div>
  );
}
