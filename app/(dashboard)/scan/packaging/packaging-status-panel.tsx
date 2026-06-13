"use client";

import { useEffect, useState, useCallback } from "react";
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
import type { PackagingOrderReport } from "@/lib/utils/packaging-filter-helpers";

interface PackagingStatusPanelProps {
  /** Order number to highlight/scroll to after a scan */
  highlightOrderNumber: number | null;
  /** Production order ID to fetch and display */
  activeOrderId: string | null;
  /** Incremented after each scan to trigger a refresh */
  refreshKey: number;
}

export function PackagingStatusPanel({
  highlightOrderNumber,
  activeOrderId,
  refreshKey,
}: PackagingStatusPanelProps) {
  const [order, setOrder] = useState<PackagingOrderReport | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrder = useCallback(async (orderId: string) => {
    setLoading(true);
    try {
      // Use packaging-status report API without date filter, then find our order
      const res = await fetch(`/api/reports/packaging-status?orderId=${orderId}`);
      if (res.ok) {
        const data = await res.json();
        // API may return array or single order
        if (Array.isArray(data) && data.length > 0) {
          setOrder(data[0]);
        } else if (!Array.isArray(data) && data.orderId) {
          setOrder(data);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when activeOrderId changes or after each scan
  useEffect(() => {
    if (activeOrderId) {
      fetchOrder(activeOrderId);
    }
  }, [activeOrderId, refreshKey, fetchOrder]);

  if (!activeOrderId) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Izvještaj pakovanja
          </CardTitle>
          <CardDescription className="text-xs">
            Skenirajte komponentu da vidite status naloga
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            Čeka skeniranje...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading && !order) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Učitavanje...
      </div>
    );
  }

  if (!order) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Izvještaj pakovanja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nema podataka za ovaj nalog
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Nalog #{order.orderNumber}
            {order.customerName && (
              <span className="text-xs font-normal text-muted-foreground">
                — {order.customerName}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => fetchOrder(activeOrderId)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="text-xs">
          <span className="flex items-center gap-2">
            {order.isFullyPacked ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-700 font-medium">Kompletno zapakovano</span>
              </>
            ) : (
              <>
                Zapakovano {order.packedItems}/{order.totalItems} stavki
              </>
            )}
          </span>
        </CardDescription>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-secondary mt-2">
          <div
            className={`h-2 rounded-full transition-all ${
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
      </CardHeader>
      <CardContent>
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
                <TableCell className="text-xs text-muted-foreground py-1.5">
                  {item.itemIndex + 1}
                </TableCell>
                <TableCell className="text-xs py-1.5">
                  {item.articleName}
                  {item.serialNumber && (
                    <span className="text-muted-foreground ml-1">
                      S/N: {item.serialNumber}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-1.5">
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
      </CardContent>
    </Card>
  );
}
