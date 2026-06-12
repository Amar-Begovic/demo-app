import { Suspense } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { ProductionOrderService } from "@/lib/services/production-order.service";
import { MaterialService } from "@/lib/services/material.service";
import { classifyDeadline, getEarliestDeadline } from "@/lib/utils/calculations";
import { getOrderItems } from "@/lib/utils/order-items";

const statusLabels: Record<string, string> = {
  draft: "Nacrt",
  waiting_material: "Čeka materijal",
  ready: "Spreman",
  in_progress: "U izradi",
  completed: "Završen",
};

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  waiting_material: "destructive",
  ready: "outline",
  in_progress: "default",
  completed: "secondary",
};

function StatsCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-20 mt-1" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrdersTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <div className="border-b">
            <div className="flex items-center h-12 px-4 gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center h-14 px-4 gap-4 border-b last:border-b-0">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-2 w-24 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OverdueOrdersSkeleton() {
  return (
    <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-4 w-64 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center h-14 px-4 gap-4 border-b last:border-b-0">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getProgress(order: { workOrders: { id: string; status: string }[] }) {
  const total = order.workOrders.length;
  if (total === 0) return 0;
  const done = order.workOrders.filter((wo) => wo.status === "completed").length;
  return Math.round((done / total) * 100);
}

async function DashboardStats() {
  const [orders, lowStockMaterials] = await Promise.all([
    ProductionOrderService.getAll(),
    MaterialService.checkLowStock(),
  ]);

  const activeOrders = orders.filter((o) => o.status !== "completed");
  const completedOrders = orders.filter((o) => o.status === "completed");
  const inProgressOrders = orders.filter((o) => o.status === "in_progress");

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ukupno naloga</CardTitle>
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{orders.length}</div>
          <p className="text-xs text-muted-foreground">
            {activeOrders.length} aktivnih
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">U izradi</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{inProgressOrders.length}</div>
          <p className="text-xs text-muted-foreground">proizvodnih naloga</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Završeno</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{completedOrders.length}</div>
          <p className="text-xs text-muted-foreground">proizvodnih naloga</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Niske zalihe</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{lowStockMaterials.length}</div>
          <p className="text-xs text-muted-foreground">
            materijala ispod minimuma
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

async function OverdueOrdersSection() {
  const orders = await ProductionOrderService.getAll();
  const now = new Date();

  const overdueOrders = orders.filter(
    (order) => {
      const deadline = getEarliestDeadline(order.items);
      return classifyDeadline(deadline, order.status, now) === "overdue";
    }
  );

  if (overdueOrders.length === 0) {
    return null;
  }

  return (
    <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
          <CardTitle className="text-red-700 dark:text-red-400">
            Zakašnjeli nalozi ({overdueOrders.length})
          </CardTitle>
        </div>
        <CardDescription className="text-red-600/70 dark:text-red-400/70">
          Proizvodni nalozi kojima je prošao rok isporuke
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artikal</TableHead>
              <TableHead>Kupac</TableHead>
              <TableHead>Rok isporuke</TableHead>
              <TableHead>Kašnjenje</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overdueOrders.map((order) => {
              const items = getOrderItems(order);
              const articleNames = items.map((i) => i.article.name).join(", ");
              const deadline = getEarliestDeadline(order.items)!;
              const daysOverdue = Math.floor(
                (now.getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/production/${order.id}`}
                      className="font-medium hover:underline"
                    >
                      {articleNames || "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.customerName || "—"}
                  </TableCell>
                  <TableCell className="text-red-600 dark:text-red-400 font-medium">
                    {new Date(deadline).toLocaleDateString("bs")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">
                      {daysOverdue} {daysOverdue === 1 ? "dan" : "dana"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[order.status] ?? "secondary"}>
                      {statusLabels[order.status] ?? order.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

async function ActiveOrdersTable() {
  const orders = await ProductionOrderService.getAll();
  const activeOrders = orders.filter((o) => o.status !== "completed");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivni proizvodni nalozi</CardTitle>
        <CardDescription>
          Nalozi koji su trenutno u procesu proizvodnje
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activeOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nema aktivnih proizvodnih naloga
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikal</TableHead>
                <TableHead>Količina</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progres</TableHead>
                <TableHead>Kreirano</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeOrders.map((order) => {
                const items = getOrderItems(order);
                const articleNames = items.map((i) => i.article.name).join(", ");
                const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/production/${order.id}`}
                        className="font-medium hover:underline"
                      >
                        {articleNames || order.article?.name || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{totalQuantity || order.quantity}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[order.status] ?? "secondary"}>
                        {statusLabels[order.status] ?? order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-secondary">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${getProgress(order)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {getProgress(order)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString("bs")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pregled</h1>
        <p className="text-muted-foreground">
          Pregled stanja proizvodnje i zaliha
        </p>
      </div>

      <Suspense fallback={<StatsCardsSkeleton />}>
        <DashboardStats />
      </Suspense>

      <Suspense fallback={<OverdueOrdersSkeleton />}>
        <OverdueOrdersSection />
      </Suspense>

      <Suspense fallback={<OrdersTableSkeleton />}>
        <ActiveOrdersTable />
      </Suspense>
    </div>
  );
}
