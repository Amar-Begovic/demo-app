"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";

interface StockHistoryEntry {
  id: string;
  materialId: string;
  changeType: "inflow" | "outflow" | "adjustment";
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  inflow: "Ulaz",
  outflow: "Izlaz",
  adjustment: "Korekcija",
};

const CHANGE_TYPE_ICONS: Record<string, React.ReactNode> = {
  inflow: <ArrowDownCircle className="h-4 w-4 text-green-600" />,
  outflow: <ArrowUpCircle className="h-4 w-4 text-red-600" />,
  adjustment: <RefreshCw className="h-4 w-4 text-blue-600" />,
};

const CHANGE_TYPE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  inflow: "default",
  outflow: "destructive",
  adjustment: "secondary",
};

interface StockHistoryTableProps {
  materialId: string;
}

export function StockHistoryTable({ materialId }: StockHistoryTableProps) {
  const [entries, setEntries] = useState<StockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [changeType, setChangeType] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (changeType !== "all") params.set("changeType", changeType);
      if (fromDate) params.set("from", new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
      }

      const res = await fetch(`/api/materials/${materialId}/history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [materialId, changeType, fromDate, toDate]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("bs", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatReference(type: string | null, id: string | null) {
    if (!type && !id) return "—";
    const labels: Record<string, string> = {
      purchase_order: "Nalog nabavke",
      production_order: "Proizvodni nalog",
    };
    const label = type ? (labels[type] ?? type) : "";
    return id ? `${label} ${id.slice(0, 8)}…` : label;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="filter-type" className="text-sm font-medium">
            Tip promjene
          </label>
          <Select value={changeType} onValueChange={setChangeType}>
            <SelectTrigger id="filter-type" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi</SelectItem>
              <SelectItem value="inflow">Ulaz</SelectItem>
              <SelectItem value="outflow">Izlaz</SelectItem>
              <SelectItem value="adjustment">Korekcija</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="filter-from" className="text-sm font-medium">
            Od datuma
          </label>
          <Input
            id="filter-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="filter-to" className="text-sm font-medium">
            Do datuma
          </label>
          <Input
            id="filter-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead className="text-right">Količina</TableHead>
              <TableHead className="text-right">Prethodno</TableHead>
              <TableHead className="text-right">Novo</TableHead>
              <TableHead>Referenca</TableHead>
              <TableHead>Bilješke</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Učitavanje…
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nema zapisa o promjenama zaliha
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(entry.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {CHANGE_TYPE_ICONS[entry.changeType]}
                      <Badge variant={CHANGE_TYPE_VARIANTS[entry.changeType]}>
                        {CHANGE_TYPE_LABELS[entry.changeType]}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.changeType === "outflow" ? "−" : "+"}{entry.quantity}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.previousQuantity}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.newQuantity}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatReference(entry.referenceType, entry.referenceId)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                    {entry.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
