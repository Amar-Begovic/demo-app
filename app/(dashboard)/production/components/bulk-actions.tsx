"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Play, Printer, AlertCircle } from "lucide-react";
import { bulkGenerateWorkOrders } from "@/app/actions/production-orders";
import { serializeIds } from "@/lib/utils/filter-helpers";
import type { OrderRow } from "./selectable-order-table";

interface BulkActionsProps {
  selectedIds: Set<string>;
  orders: OrderRow[];
  onComplete: (successIds?: string[]) => void;
}

interface BulkProgress {
  isRunning: boolean;
  completed: number;
  total: number;
}

interface BulkResult {
  orderId: string;
  orderNumber: number;
  articleName: string;
  success: boolean;
  error?: string;
}

export function BulkActions({ selectedIds, orders, onComplete }: BulkActionsProps) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [isPending, startTransition] = useTransition();

  if (selectedIds.size === 0) return null;

  const selectedOrders = orders.filter((o) => selectedIds.has(o.id));

  function getArticleName(order: OrderRow): string {
    if (order.items.length === 0) return "—";
    if (order.items.length === 1) return order.items[0].article.name;
    return `${order.items[0].article.name} (+${order.items.length - 1})`;
  }

  async function handleConfirm() {
    const ids = selectedOrders.map((o) => o.id);
    setProgress({ isRunning: true, completed: 0, total: ids.length });
    setResults(null);

    try {
      // Call bulk action — server processes sequentially
      const response = await bulkGenerateWorkOrders(ids);

      // Map results with order metadata
      const mapped: BulkResult[] = response.results.map((r) => {
        const order = selectedOrders.find((o) => o.id === r.orderId);
        return {
          orderId: r.orderId,
          orderNumber: order?.orderNumber ?? 0,
          articleName: order ? getArticleName(order) : "—",
          success: r.success,
          error: r.error,
        };
      });

      setProgress({ isRunning: false, completed: ids.length, total: ids.length });
      setResults(mapped);

      // If all succeeded, trigger refresh after a short delay so user sees the result
      if (response.success) {
        // Keep dialog open to show print link
      }
    } catch {
      setProgress(null);
      setResults([
        {
          orderId: "",
          orderNumber: 0,
          articleName: "",
          success: false,
          error: "Greška pri komunikaciji sa serverom",
        },
      ]);
    }
  }

  function handleClose() {
    setOpen(false);
    setProgress(null);
    if (results) {
      const ids = results.filter((r) => r.success).map((r) => r.orderId);
      setResults(null);
      onComplete(ids.length > 0 ? ids : undefined);
    }
  }

  const successIds = results?.filter((r) => r.success).map((r) => r.orderId) ?? [];
  const failures = results?.filter((r) => !r.success) ?? [];
  const isRunning = progress?.isRunning ?? false;
  const isDone = results !== null && !isRunning;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!isRunning) { if (!v) handleClose(); else setOpen(true); } }}>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={isPending || isRunning} onClick={() => setOpen(true)}>
          <Play className="h-4 w-4 mr-1" />
          Pokreni proizvodnju ({selectedIds.size})
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDone ? "Rezultat pokretanja" : "Pokreni proizvodnju"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              {/* Confirmation list */}
              {!progress && !results && (
                <>
                  <p className="mb-2">
                    Pokrenuti proizvodnju za {selectedOrders.length} nalog{selectedOrders.length === 1 ? "" : "a"}?
                  </p>
                  <ul className="max-h-48 overflow-y-auto space-y-1 text-sm">
                    {selectedOrders.map((o) => (
                      <li key={o.id} className="flex gap-2">
                        <span className="font-medium">#{o.orderNumber}</span>
                        <span className="text-muted-foreground">{getArticleName(o)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Progress */}
              {isRunning && progress && (
                <div className="space-y-2">
                  <p>Pokretanje u toku...</p>
                  <div className="h-2 w-full rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {progress.completed} / {progress.total}
                  </p>
                </div>
              )}

              {/* Results */}
              {isDone && (
                <div className="space-y-3">
                  {successIds.length > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Uspješno pokrenuto: {successIds.length} nalog{successIds.length === 1 ? "" : "a"}
                    </p>
                  )}
                  {failures.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        Greške ({failures.length}):
                      </p>
                      <ul className="max-h-32 overflow-y-auto space-y-1 text-xs">
                        {failures.map((f) => (
                          <li key={f.orderId} className="text-red-600 dark:text-red-400">
                            #{f.orderNumber} {f.articleName}: {f.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {successIds.length > 0 && (
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link href={`/production/print/bulk?ids=${serializeIds(successIds)}`}>
                        <Printer className="h-4 w-4 mr-1" />
                        Otvori kombinovani print ({successIds.length})
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!isDone && (
            <AlertDialogCancel disabled={isRunning}>Odustani</AlertDialogCancel>
          )}
          {!progress && !results && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                startTransition(() => { handleConfirm(); });
              }}
            >
              Pokreni
            </AlertDialogAction>
          )}
          {isDone && (
            <Button onClick={handleClose}>Zatvori</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
