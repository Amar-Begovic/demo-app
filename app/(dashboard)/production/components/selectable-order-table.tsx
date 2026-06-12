"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, StickyNote, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOrderSelectable } from "@/lib/utils/filter-helpers";
import { ArchiveButton } from "./archive-button";
import { BulkActions } from "./bulk-actions";
import { ExportOrdersButton } from "./export-orders-button";
import { ExportOrdersExcelButton } from "./export-orders-excel-button";
import { ImportOrdersExcelButton } from "./import-orders-excel-button";
import { PrintFilterModal } from "./print-filter-modal";

// ─── Types ───────────────────────────────────────────────

export interface OrderItem {
  id: string;
  articleId: string;
  quantity: number;
  deliveryDeadline: string | null;
  priority: string;
  notes: string | null;
  customerOrderNumber: string | null;
  serialNumber: string | null;
  loadingNumber: string | null;
  fabric: { id: string; name: string; code: string | null } | null;
  rucka: { id: string; name: string } | null;
  paspul: { id: string; name: string } | null;
  nogice1: { id: string; name: string } | null;
  nogice2: { id: string; name: string } | null;
  loadingSequence: number | null;
  article: { id: string; name: string; code: string | null };
}

export interface OrderWorkOrder {
  id: string;
  status: string;
}

export interface OrderRow {
  id: string;
  orderNumber: number;
  workOrderNumber: string | null;
  workOrderDate: string | null;
  quantity: number | null;
  status: string;
  customerName: string | null;
  createdAt: string;
  article: { id: string; name: string } | null;
  items: OrderItem[];
  _count: { workOrders: number };
  workOrders: OrderWorkOrder[];
}

interface SelectableOrderTableProps {
  orders: OrderRow[];
  statusLabels: Record<string, string>;
  statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline">;
  priorityLabels: Record<string, string>;
}

// ─── Helper functions ────────────────────────────────────

function getArticleNames(order: OrderRow): string {
  const items = order.items;
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0].article.name;
  return `${items[0].article.name} (+${items.length - 1})`;
}

function getTotalQuantity(order: OrderRow): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function getProgress(workOrders: OrderWorkOrder[]): number {
  const total = workOrders.length;
  if (total === 0) return 0;
  const done = workOrders.filter((wo) => wo.status === "completed").length;
  return Math.round((done / total) * 100);
}

function getHighestPriority(items: OrderItem[]): string {
  if (items.length === 0) return "normal";
  for (const item of items) {
    if (item.priority === "urgent") return "urgent";
  }
  for (const item of items) {
    if (item.priority === "normal") return "normal";
  }
  return "low";
}

function getEarliestDeadline(items: OrderItem[]): string | null {
  let earliest: string | null = null;
  for (const item of items) {
    if (item.deliveryDeadline !== null) {
      if (earliest === null || item.deliveryDeadline < earliest) {
        earliest = item.deliveryDeadline;
      }
    }
  }
  return earliest;
}

function anyItemHasNotes(items: OrderItem[]): boolean {
  return items.some((item) => item.notes !== null && item.notes !== "");
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function classifyDeadline(deadline: string | null, status: string): string {
  if (!deadline || status === "completed") return "ok";
  const deadlineTime = new Date(deadline).getTime();
  const nowTime = Date.now();
  if (deadlineTime < nowTime) return "overdue";
  if (deadlineTime - nowTime <= THREE_DAYS_MS) return "warning";
  return "ok";
}

// ─── Sub-components ──────────────────────────────────────

function PriorityBadge({ priority, priorityLabels }: { priority: string; priorityLabels: Record<string, string> }) {
  const label = priorityLabels[priority] ?? priority;
  return (
    <Badge
      variant="outline"
      className={cn(
        priority === "urgent" && "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
        priority === "normal" && "border-gray-400 bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-400",
        priority === "low" && "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
      )}
    >
      {label}
    </Badge>
  );
}

function DeadlineCell({ deadline, status }: { deadline: string | null; status: string }) {
  if (!deadline) return <span className="text-muted-foreground">—</span>;
  const formatted = new Date(deadline).toLocaleDateString("bs");
  return (
    <span
      className={cn(
        "text-sm",
        status === "overdue" && "font-medium text-red-600 dark:text-red-400",
        status === "warning" && "font-medium text-amber-600 dark:text-amber-400",
      )}
    >
      {formatted}
      {status === "overdue" && " ⚠"}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────

export function SelectableOrderTable({
  orders,
  statusLabels,
  statusVariant,
  priorityLabels,
}: SelectableOrderTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  const selectableOrders = useMemo(
    () => orders.filter((o) => isOrderSelectable(o.status)),
    [orders]
  );

  const allSelectableSelected = useMemo(
    () => selectableOrders.length > 0 && selectableOrders.every((o) => selectedIds.has(o.id)),
    [selectableOrders, selectedIds]
  );

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (allSelectableSelected) {
        // Deselect all
        return new Set();
      }
      // Select all selectable
      return new Set(selectableOrders.map((o) => o.id));
    });
  }, [allSelectableSelected, selectableOrders]);

  const handleToggleRow = useCallback((orderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  const handleBulkComplete = useCallback(() => {
    setSelectedIds(new Set());
    router.refresh();
  }, [router]);

  // In-progress orders for print button
  const inProgressOrders = useMemo(
    () => orders.filter((o) => o.status === "in_progress"),
    [orders]
  );

  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nema proizvodnih naloga
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {selectedIds.size > 0 && (
          <>
            <span className="text-sm text-muted-foreground">
              Označeno naloga: <span className="font-medium text-foreground">{selectedIds.size}</span>
            </span>
            <BulkActions
              selectedIds={selectedIds}
              orders={orders}
              onComplete={handleBulkComplete}
            />
            <PrintFilterModal
              orderIds={Array.from(selectedIds)}
              trigger={
                <Button variant="outline" size="sm">
                  <Printer className="h-4 w-4 mr-1" />
                  Štampaj ({selectedIds.size})
                </Button>
              }
            />
          </>
        )}
        {selectedIds.size === 0 && inProgressOrders.length > 0 && (
          <PrintFilterModal
            orderIds={inProgressOrders.map((o) => o.id)}
            trigger={
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-1" />
                Štampaj ({inProgressOrders.length})
              </Button>
            }
          />
        )}
        <div className="flex items-center gap-1 ml-auto">
          <ExportOrdersButton orders={orders} />
          <ExportOrdersExcelButton orders={orders} selectedIds={selectedIds} />
          <ImportOrdersExcelButton orders={orders} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={allSelectableSelected}
                onCheckedChange={handleToggleAll}
                aria-label="Označi sve naloge"
                disabled={selectableOrders.length === 0}
              />
            </TableHead>
            <TableHead>Br.</TableHead>
            <TableHead>Artikal</TableHead>
            <TableHead>Kupac</TableHead>
            <TableHead>Ser. broj</TableHead>
            <TableHead>Količina</TableHead>
            <TableHead>Prioritet</TableHead>
            <TableHead>Rok isporuke</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progres</TableHead>
            <TableHead>Kreirano</TableHead>
            <TableHead className="w-[80px]">Akcije</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const selectable = isOrderSelectable(order.status);
            const progress = getProgress(order.workOrders);
            const aggregateDeadline = getEarliestDeadline(order.items);
            const deadlineStatus = classifyDeadline(aggregateDeadline, order.status);
            const aggregatePriority = getHighestPriority(order.items);
            const orderHasNotes = anyItemHasNotes(order.items);
            const firstCustomerOrderNumber =
              order.items.find((i) => i.customerOrderNumber != null)?.customerOrderNumber ?? "—";

            return (
              <TableRow key={order.id} data-state={selectedIds.has(order.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(order.id)}
                    onCheckedChange={() => handleToggleRow(order.id)}
                    disabled={!selectable}
                    aria-label={`Označi nalog #${order.orderNumber}`}
                  />
                </TableCell>
                <TableCell className="font-bold text-primary">#{order.orderNumber}</TableCell>
                <TableCell className="font-medium">{getArticleNames(order)}</TableCell>
                <TableCell>{order.customerName ?? "—"}</TableCell>
                <TableCell>{firstCustomerOrderNumber}</TableCell>
                <TableCell>{getTotalQuantity(order)}</TableCell>
                <TableCell>
                  <PriorityBadge priority={aggregatePriority} priorityLabels={priorityLabels} />
                </TableCell>
                <TableCell>
                  <DeadlineCell deadline={aggregateDeadline} status={deadlineStatus} />
                </TableCell>
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
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{progress}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString("bs")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {orderHasNotes && (
                      <StickyNote className="h-4 w-4 text-amber-500" aria-label="Ima bilješke" />
                    )}
                    <Button variant="ghost" size="icon-sm" asChild aria-label="Pogledaj detalje">
                      <Link href={`/production/${order.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <ArchiveButton orderId={order.id} orderStatus={order.status} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
