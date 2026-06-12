"use cache";

import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
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
import { ProductionOrderService } from "@/lib/services/production-order.service";
import { CACHE_TAGS } from "@/lib/cache/config";
import { PaginationControls } from "../../components/pagination-controls";
import { getOrderItems } from "@/lib/utils/order-items";
import { RestoreButton } from "./restore-button";

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

interface CachedArchivedListProps {
  page: number;
  pageSize: number;
}

export async function CachedArchivedList({ page, pageSize }: CachedArchivedListProps) {
  cacheLife("hours");
  cacheTag(CACHE_TAGS.PRODUCTION_ORDERS);

  const { data, total } = await ProductionOrderService.getAllPaginated(
    { page, pageSize },
    { isArchived: true }
  );

  function getArticleNames(order: typeof data[number]): string {
    const items = getOrderItems(order as any);
    if (items.length === 0) return "—";
    if (items.length === 1) return items[0].article.name;
    return `${items[0].article.name} (+${items.length - 1})`;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Arhivirani nalozi</CardTitle>
          <CardDescription>
            Ukupno {total} arhiviranih naloga
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nema arhiviranih naloga
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Br.</TableHead>
                  <TableHead>Artikal</TableHead>
                  <TableHead>Kupac</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kreirano</TableHead>
                  <TableHead className="w-[100px]">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-bold text-primary">
                      <Link href={`/production/${order.id}`} className="hover:underline">
                        #{order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/production/${order.id}`} className="hover:underline">
                        {getArticleNames(order)}
                      </Link>
                    </TableCell>
                    <TableCell>{order.customerName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[order.status] ?? "secondary"}>
                        {statusLabels[order.status] ?? order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString("bs")}
                    </TableCell>
                    <TableCell>
                      <RestoreButton orderId={order.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaginationControls page={page} total={total} pageSize={pageSize} />
    </>
  );
}
