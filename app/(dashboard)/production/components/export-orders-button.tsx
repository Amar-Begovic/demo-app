"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { OrderRow } from "./selectable-order-table";

interface ExportOrdersButtonProps {
  orders: OrderRow[];
}

const CSV_HEADERS = [
  "Br. naloga",
  "Artikal",
  "Kupac",
  "Količina",
  "Prioritet",
  "Rok isporuke",
  "Status",
  "Br. utovara",
  "Ser. broj",
  "Kreirano",
];

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Hitan",
  normal: "Normalan",
  low: "Nizak",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Nacrt",
  waiting_material: "Čeka materijal",
  ready: "Spreman",
  in_progress: "U izradi",
  completed: "Završen",
};

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getArticleNames(order: OrderRow): string {
  if (order.items.length === 0) return "";
  return order.items.map((i) => i.article.name).join(", ");
}

function getTotalQuantity(order: OrderRow): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function getHighestPriority(items: OrderRow["items"]): string {
  for (const item of items) {
    if (item.priority === "urgent") return "urgent";
  }
  for (const item of items) {
    if (item.priority === "normal") return "normal";
  }
  return items.length > 0 ? "low" : "normal";
}

function getEarliestDeadline(items: OrderRow["items"]): string {
  let earliest: string | null = null;
  for (const item of items) {
    if (item.deliveryDeadline !== null) {
      if (earliest === null || item.deliveryDeadline < earliest) {
        earliest = item.deliveryDeadline;
      }
    }
  }
  return earliest ? new Date(earliest).toLocaleDateString("bs") : "";
}

function getLoadingNumber(items: OrderRow["items"]): string {
  return items.find((i) => i.loadingNumber != null)?.loadingNumber ?? "";
}

function getCustomerOrderNumber(items: OrderRow["items"]): string {
  return items.find((i) => i.customerOrderNumber != null)?.customerOrderNumber ?? "";
}

export function ExportOrdersButton({ orders }: ExportOrdersButtonProps) {
  const handleExport = useCallback(() => {
    const rows = orders.map((order) => [
      `#${order.orderNumber}`,
      getArticleNames(order),
      order.customerName ?? "",
      String(getTotalQuantity(order)),
      PRIORITY_LABELS[getHighestPriority(order.items)] ?? "",
      getEarliestDeadline(order.items),
      STATUS_LABELS[order.status] ?? order.status,
      getLoadingNumber(order.items),
      getCustomerOrderNumber(order.items),
      new Date(order.createdAt).toLocaleDateString("bs"),
    ]);

    const csvContent = [
      CSV_HEADERS.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // UTF-8 BOM for proper encoding in Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nalozi-export.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [orders]);

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4 mr-1" />
      Izvoz CSV
    </Button>
  );
}
