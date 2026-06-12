"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Package, RefreshCw } from "lucide-react";
import { getPresetDateRange } from "@/lib/utils/filter-helpers";
import type { PackagingOrderReport } from "@/lib/utils/packaging-filter-helpers";

const PAGE_SIZE = 5;

interface PackagingStatusPanelProps {
  /** Order number to highlight/scroll to after a scan */
  highlightOrderNumber: number | null;
  /** Incremented after each scan to trigger a refresh */
  refreshKey: number;
}

export function PackagingStatusPanel({
  highlightOrderNumber,
  refreshKey,
}: PackagingStatusPanelProps) {
  const [orders, setOrders] = useState<PackagingOrderReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    const range = getPresetDateRange("today");
    const params = new URLSearchParams();
    params.set("dateFrom", range.dateFrom);
    params.set("dateTo", range.dateTo);

    try {
      const res = await fetch(`/api/reports/packaging-status?${params}`);
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh after each scan
  useEffect(() => {
    if (refreshKey > 0) {
      fetchData();
    }
  }, [refreshKey, fetchData]);

  // When highlighted order changes, jump to its page
  useEffect(() => {
    if (highlightOrderNumber && orders.length > 0) {
      const idx = orders.findIndex((o) => o.orderNumber === highlightOrderNumber);
      if (idx >= 0) {
        setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1);
      }
    }
  }, [highlightOrderNumber, orders]);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const paginatedOrders = useMemo(
    () => orders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [orders, currentPage]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Učitavanje...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Status pakovanja — danas
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Pregled naloga i napretka pakovanja za danas
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nema naloga za pakovanje danas
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedOrders.map((order) => {
                const isHighlighted = order.orderNumber === highlightOrderNumber;
                return (
                  <div
                    key={order.orderId}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      isHighlighted ? "ring-2 ring-primary border-primary" : ""
                    }`}
                  >
                    <div
                      className={`px-3 py-2 flex items-center justify-between ${
                        order.isFullyPacked ? "bg-green-50" : "bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {order.isFullyPacked ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <span className="text-sm font-medium">#{order.orderNumber}</span>
                          {order.customerName && (
                            <span className="text-xs text-muted-foreground ml-1">
                              — {order.customerName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium ${
                            order.isFullyPacked ? "text-green-700" : "text-muted-foreground"
                          }`}
                        >
                          {order.packedItems}/{order.totalItems}
                        </span>
                        <div className="h-1.5 w-16 rounded-full bg-secondary">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              order.isFullyPacked ? "bg-green-500" : "bg-primary"
                            }`}
                            style={{
                              width: `${
                                order.totalItems > 0
                                  ? Math.round((order.packedItems / order.totalItems) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="px-2 py-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-8 py-1">#</TableHead>
                            <TableHead className="text-xs py-1">Artikal</TableHead>
                            <TableHead className="text-xs py-1">Komponente</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.items.map((item) => (
                            <TableRow key={item.itemIndex}>
                              <TableCell className="text-xs text-muted-foreground py-1">
                                {item.itemIndex + 1}
                              </TableCell>
                              <TableCell className="text-xs py-1">
                                {item.articleName}
                                {item.serialNumber && (
                                  <span className="text-muted-foreground ml-1">
                                    S/N: {item.serialNumber}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="flex gap-0.5 flex-wrap">
                                  {item.components.map((comp) => (
                                    <span
                                      key={comp.name}
                                      className={`inline-flex items-center text-[10px] px-1.5 py-0 rounded-full ${
                                        comp.scanned
                                          ? "bg-green-100 text-green-800"
                                          : "bg-gray-100 text-gray-600"
                                      }`}
                                    >
                                      {comp.scanned ? "✓" : "○"} {comp.name}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3">
                <p className="text-xs text-muted-foreground">
                  {orders.length} naloga
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    ←
                  </Button>
                  <span className="text-xs text-muted-foreground px-1">
                    {currentPage}/{totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
