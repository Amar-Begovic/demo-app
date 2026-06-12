import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Clock, Package } from "lucide-react";
import { PurchaseOrderService } from "@/lib/services/purchase-order.service";
import { PurchaseOrderStatus } from "@/app/generated/prisma";
import { PaginationControls } from "../components/pagination-controls";
import { PurchaseStatusFilter } from "./components/purchase-status-filter";
import { PurchaseActions, SupplierCell } from "./components/purchase-actions";
import { CreatePurchaseDialog } from "./components/create-purchase-dialog";
import { prisma } from "@/lib/db";

const statusLabels: Record<string, string> = {
  pending: "Čeka",
  ordered: "Naručeno",
  received: "Primljeno",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  ordered: "default",
  received: "secondary",
};

const validStatuses = new Set(Object.values(PurchaseOrderStatus));

interface PageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function PurchaseOrdersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = 20;
  const statusParam = params.status;
  const status = statusParam && validStatuses.has(statusParam as PurchaseOrderStatus)
    ? (statusParam as PurchaseOrderStatus)
    : undefined;

  const [{ data, total }, materials, suppliers] = await Promise.all([
    PurchaseOrderService.getAllPaginated(
      { page, pageSize },
      status ? { status } : undefined
    ),
    prisma.material.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, code: true },
    }),
    prisma.supplier.findMany({
      where: { partnerType: { in: ["dobavljac", "oba"] } },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
  ]);

  const pendingCount = data.filter((o) => o.status === "pending").length;
  const orderedCount = data.filter((o) => o.status === "ordered").length;
  const receivedCount = data.filter((o) => o.status === "received").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nabavka</h1>
          <p className="text-muted-foreground">
            Upravljanje nalozima za nabavku materijala
          </p>
        </div>
        <CreatePurchaseDialog materials={materials} suppliers={suppliers} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Čeka</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Naručeno</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Primljeno</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receivedCount}</div>
          </CardContent>
        </Card>
      </div>

      <PurchaseStatusFilter />

      <Card>
        <CardHeader>
          <CardTitle>Nalozi za nabavku</CardTitle>
          <CardDescription>Lista svih naloga za nabavku materijala</CardDescription>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nema naloga za nabavku
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Materijal</TableHead>
                  <TableHead>Količina</TableHead>
                  <TableHead>Dobavljač</TableHead>
                  <TableHead>Proizvodni nalog</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kreirano</TableHead>
                  <TableHead>Primljeno</TableHead>
                  <TableHead className="w-[120px]">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.material.name}</TableCell>
                    <TableCell>
                      {po.requiredQuantity} {po.material.unit}
                    </TableCell>
                    <TableCell>
                      <SupplierCell order={po} />
                    </TableCell>
                    <TableCell>
                      {po.productionOrder ? (
                        <Link
                          href={`/production/${po.productionOrder.id}`}
                          className="text-primary hover:underline"
                        >
                          Pogledaj nalog
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">Ručna nabavka</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[po.status] ?? "secondary"}>
                        {statusLabels[po.status] ?? po.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(po.createdAt).toLocaleDateString("bs")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {po.receivedAt ? new Date(po.receivedAt).toLocaleDateString("bs") : "—"}
                    </TableCell>
                    <TableCell>
                      <PurchaseActions order={po} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaginationControls page={page} total={total} pageSize={pageSize} />
    </div>
  );
}
