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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftRight,
  Package,
  ScanBarcode,
  Plus,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  timestamp: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, unknown>;
  performedBy: string | null;
}

interface PaginatedResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  work_order: "Radni nalog",
  production_order: "Proizvodni nalog",
  material: "Materijal",
  purchase_order: "Nalog nabavke",
  barcode: "Barkod",
};

const ACTION_LABELS: Record<string, string> = {
  status_change: "Promjena statusa",
  stock_change: "Promjena zaliha",
  barcode_scan: "Skeniranje barkoda",
  created: "Kreiran",
  updated: "Ažuriran",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  status_change: <ArrowLeftRight className="h-4 w-4" />,
  stock_change: <Package className="h-4 w-4" />,
  barcode_scan: <ScanBarcode className="h-4 w-4" />,
  created: <Plus className="h-4 w-4" />,
  updated: <Pencil className="h-4 w-4" />,
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  status_change: "default",
  stock_change: "secondary",
  barcode_scan: "outline",
  created: "default",
  updated: "secondary",
};

const PAGE_SIZE = 20;

export function AuditLogViewer() {
  const [response, setResponse] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityType !== "all") params.set("entityType", entityType);
      if (fromDate) params.set("from", new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
      }
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const res = await fetch(`/api/audit-log?${params.toString()}`);
      if (res.ok) {
        const data: PaginatedResponse = await res.json();
        setResponse(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [entityType, fromDate, toDate, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [entityType, fromDate, toDate]);

  const totalPages = response ? Math.ceil(response.total / PAGE_SIZE) : 0;

  function formatTimestamp(dateStr: string) {
    return new Date(dateStr).toLocaleString("bs", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatDetails(details: Record<string, unknown>): string {
    if (!details || typeof details !== "object") return "—";
    const entries = Object.entries(details);
    if (entries.length === 0) return "—";
    return entries
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join(", ");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="audit-entity-type" className="text-sm font-medium">
            Tip entiteta
          </label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger id="audit-entity-type" className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi</SelectItem>
              <SelectItem value="work_order">Radni nalog</SelectItem>
              <SelectItem value="production_order">Proizvodni nalog</SelectItem>
              <SelectItem value="material">Materijal</SelectItem>
              <SelectItem value="purchase_order">Nalog nabavke</SelectItem>
              <SelectItem value="barcode">Barkod</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="audit-from" className="text-sm font-medium">
            Od datuma
          </label>
          <Input
            id="audit-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="audit-to" className="text-sm font-medium">
            Do datuma
          </label>
          <Input
            id="audit-to"
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
              <TableHead>Vrijeme</TableHead>
              <TableHead>Tip entiteta</TableHead>
              <TableHead>ID entiteta</TableHead>
              <TableHead>Akcija</TableHead>
              <TableHead>Detalji</TableHead>
              <TableHead>Izvršio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Učitavanje…
                </TableCell>
              </TableRow>
            ) : !response || response.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nema zapisa u revizijskom dnevniku
                </TableCell>
              </TableRow>
            ) : (
              response.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {entry.entityId.slice(0, 8)}…
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {ACTION_ICONS[entry.action]}
                      <Badge variant={ACTION_VARIANTS[entry.action] ?? "outline"}>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                    {formatDetails(entry.details)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.performedBy ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Ukupno {response?.total ?? 0} zapisa
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prethodna
            </Button>
            <span className="text-sm text-muted-foreground">
              Stranica {page} od {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Sljedeća
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}