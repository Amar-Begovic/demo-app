"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { generateExcelBuffer } from "@/lib/services/production-order-excel.service";
import type { OrderRow } from "./selectable-order-table";

/**
 * Computes the effective list of orders to export.
 * When selectedIds is provided and non-empty, only orders with matching IDs are returned.
 * Otherwise, all orders are returned unchanged.
 */
export function computeEffectiveOrders(
  orders: OrderRow[],
  selectedIds?: Set<string>
): OrderRow[] {
  if (selectedIds && selectedIds.size > 0) {
    return orders.filter(o => selectedIds.has(o.id));
  }
  return orders;
}

interface ExportOrdersExcelButtonProps {
  orders: OrderRow[];
  selectedIds?: Set<string>;
}

export function ExportOrdersExcelButton({ orders, selectedIds }: ExportOrdersExcelButtonProps) {
  const handleExport = useCallback(async () => {
    const effectiveOrders = computeEffectiveOrders(orders, selectedIds);

    if (effectiveOrders.length === 0) {
      alert("Nema podataka za izvoz");
      return;
    }

    const buffer = await generateExcelBuffer(effectiveOrders);
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nalozi-export.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [orders, selectedIds]);

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <FileSpreadsheet className="h-4 w-4 mr-1" />
      Izvoz Excel
    </Button>
  );
}
