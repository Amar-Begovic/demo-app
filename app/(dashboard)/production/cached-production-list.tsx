"use cache";

import { cacheLife, cacheTag } from "next/cache";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClipboardList, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import { CACHE_TAGS } from "@/lib/cache/config";
import { PaginationControls } from "../components/pagination-controls";
import type { ProductionOrderStatus, OrderPriority } from "@/app/generated/prisma";
import { SelectableOrderTable } from "./components/selectable-order-table";
import type { OrderRow } from "./components/selectable-order-table";

const statusLabels: Record<string, string> = {
  draft: "Nacrt",
  waiting_material: "Čeka materijal",
  ready: "Spreman",
  in_progress: "U izradi",
  completed: "Završen",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  waiting_material: "destructive",
  ready: "outline",
  in_progress: "default",
  completed: "secondary",
};

const priorityLabels: Record<string, string> = {
  urgent: "Hitan",
  normal: "Normalan",
  low: "Nizak",
};

interface CachedProductionListProps {
  page: number;
  pageSize: number;
  status?: ProductionOrderStatus;
  priority?: OrderPriority;
  sort?: "createdAt" | "deadline";
  dateFrom?: string;
  dateTo?: string;
  customer?: string;
}

export async function CachedProductionList({ page, pageSize, status, priority, sort, dateFrom, dateTo, customer }: CachedProductionListProps) {
  cacheLife("hours");
  cacheTag(CACHE_TAGS.PRODUCTION_ORDERS);

  const filters: { status?: ProductionOrderStatus; priority?: OrderPriority; sort?: "createdAt" | "deadline"; dateFrom?: string; dateTo?: string; customer?: string } = {};
  if (status) filters.status = status;
  if (priority) filters.priority = priority;
  if (sort) filters.sort = sort;
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  if (customer) filters.customer = customer;

  const { data, total } = await ProductionOrderService.getAllPaginated(
    { page, pageSize },
    Object.keys(filters).length > 0 ? filters : undefined
  );

  const activeCount = data.filter((o) => o.status !== "completed").length;
  const inProgressCount = data.filter((o) => o.status === "in_progress").length;
  const completedCount = data.filter((o) => o.status === "completed").length;
  const waitingCount = data.filter((o) => o.status === "waiting_material").length;

  // Serialize data for client component (Dates → ISO strings)
  const serializedOrders: OrderRow[] = data.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    quantity: order.quantity,
    status: order.status,
    customerName: order.customerName,
    createdAt: order.createdAt.toISOString(),
    workOrderNumber: order.workOrderNumber ?? null,
    workOrderDate: order.workOrderDate?.toISOString() ?? null,
    article: order.article,
    items: order.items.map((item) => ({
      id: item.id,
      articleId: item.articleId,
      quantity: item.quantity,
      deliveryDeadline: item.deliveryDeadline?.toISOString() ?? null,
      priority: item.priority,
      notes: item.notes,
      customerOrderNumber: item.customerOrderNumber,
      serialNumber: item.serialNumber ?? null,
      loadingNumber: item.loadingNumber,
      loadingSequence: item.loadingSequence,
      article: { id: item.article.id, name: item.article.name, code: item.article.code ?? null },
      fabric: item.fabric ? { id: item.fabric.id, name: item.fabric.name, code: item.fabric.code ?? null } : null,
      rucka: item.rucka ? { id: item.rucka.id, name: item.rucka.name } : null,
      paspul: item.paspul ? { id: item.paspul.id, name: item.paspul.name } : null,
      nogice1: item.nogice1 ? { id: item.nogice1.id, name: item.nogice1.name } : null,
      nogice2: item.nogice2 ? { id: item.nogice2.id, name: item.nogice2.name } : null,
    })),
    _count: order._count,
    workOrders: order.workOrders,
  }));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ukupno naloga</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">{activeCount} aktivnih na stranici</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">U izradi</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Završeno</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Čeka materijal</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{waitingCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proizvodni nalozi</CardTitle>
          <CardDescription>Lista svih proizvodnih naloga sa statusima</CardDescription>
        </CardHeader>
        <CardContent>
          <SelectableOrderTable
            orders={serializedOrders}
            statusLabels={statusLabels}
            statusVariant={statusVariant}
            priorityLabels={priorityLabels}
          />
        </CardContent>
      </Card>

      <PaginationControls page={page} total={total} pageSize={pageSize} />
    </>
  );
}
