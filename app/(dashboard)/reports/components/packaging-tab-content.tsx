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
import { BarChart3, CheckCircle2, Loader2, Package } from "lucide-react";
import {
  getPresetDateRange,
  isValidDateRange,
  type PresetKey,
} from "@/lib/utils/filter-helpers";
import {
  filterPackagingOrders,
  computePackagingProgress,
  getAvailableComponentTypes,
  type PackagingOrderReport,
} from "@/lib/utils/packaging-filter-helpers";
import {
  PackagingFilterBar,
  type PackagingFilters,
} from "./packaging-filter-bar";

export interface PackagingTabContentProps {
  globalDateFrom: string;
  globalDateTo: string;
}

const completionStatusLabels: Record<string, string> = {
  fully_packed: "Zapakovano",
  partially_packed: "Djelimično",
  not_started: "Nije započeto",
};

const ORDERS_PAGE_SIZE = 10;

function buildFilterSummary(filters: PackagingFilters): string {
  const parts: string[] = [];
  if (filters.customerName) parts.push(`Kupac: ${filters.customerName}`);
  if (filters.orderNumber) parts.push(`Nalog: ${filters.orderNumber}`);
  if (filters.completionStatus !== "all") {
    parts.push(`Status: ${completionStatusLabels[filters.completionStatus] ?? filters.completionStatus}`);
  }
  if (filters.componentTypes.length > 0) {
    parts.push(`Komponente: ${filters.componentTypes.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(", ") : "Bez filtera";
}

function formatDateLocal(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

interface PackagingSummary {
  components: { today: number; week: number; month: number; total: number; filtered?: number };
  items: { today: number; week: number; month: number; total: number; filtered?: number };
  byComponent: Record<string, { today: number; week: number; month: number; total: number; filtered?: number }>;
}

function getDefaultFilters(dateFrom: string, dateTo: string): PackagingFilters {
  return {
    dateFrom,
    dateTo,
    datePreset: null,
    customerName: "",
    orderNumber: "",
    completionStatus: "all",
    componentTypes: [],
  };
}

export function PackagingTabContent({
  globalDateFrom,
  globalDateTo,
}: PackagingTabContentProps) {
  const [filters, setFilters] = useState<PackagingFilters>(() =>
    getDefaultFilters(globalDateFrom, globalDateTo)
  );
  const [packagingReport, setPackagingReport] = useState<PackagingOrderReport[]>([]);
  const [packagingSummary, setPackagingSummary] = useState<PackagingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Sync date range when global props change
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      dateFrom: globalDateFrom,
      dateTo: globalDateTo,
      datePreset: null,
    }));
  }, [globalDateFrom, globalDateTo]);

  // Fetch data when date range in filters changes
  const fetchData = useCallback(
    async (isInitial: boolean) => {
      if (!isValidDateRange(filters.dateFrom || undefined, filters.dateTo || undefined)) return;

      if (isInitial) {
        setLoading(true);
      } else {
        setIsRefetching(true);
      }

      try {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        const qs = params.toString();

        const [packagingRes, summaryRes] = await Promise.all([
          fetch(`/api/reports/packaging-status${qs ? `?${qs}` : ""}`),
          fetch(`/api/reports/packaging-summary${qs ? `?${qs}` : ""}`),
        ]);

        if (packagingRes.ok) {
          setPackagingReport(await packagingRes.json());
        }
        if (summaryRes.ok) {
          setPackagingSummary(await summaryRes.json());
        }
      } catch {
        // silently fail — reports are informational
      } finally {
        setLoading(false);
        setIsRefetching(false);
      }
    },
    [filters.dateFrom, filters.dateTo]
  );

  useEffect(() => {
    fetchData(loading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // Client-side filtering
  const filteredOrders = useMemo(
    () =>
      filterPackagingOrders(packagingReport, {
        customerName: filters.customerName,
        orderNumber: filters.orderNumber,
        completionStatus: filters.completionStatus,
        componentTypes: filters.componentTypes,
      }),
    [packagingReport, filters.customerName, filters.orderNumber, filters.completionStatus, filters.componentTypes]
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters.customerName, filters.orderNumber, filters.completionStatus, filters.componentTypes, packagingReport]);

  // Derive available component types from raw data
  const availableComponentTypes = useMemo(
    () => getAvailableComponentTypes(packagingReport),
    [packagingReport]
  );

  // Compute progress on filtered data
  const progress = useMemo(
    () => computePackagingProgress(filteredOrders),
    [filteredOrders]
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
  const paginatedOrders = useMemo(
    () => filteredOrders.slice((currentPage - 1) * ORDERS_PAGE_SIZE, currentPage * ORDERS_PAGE_SIZE),
    [filteredOrders, currentPage]
  );

  // Check if any non-date filter differs from defaults
  const hasActiveFilters =
    filters.customerName !== "" ||
    filters.orderNumber !== "" ||
    filters.completionStatus !== "all" ||
    filters.componentTypes.length > 0;

  function handleFiltersChange(newFilters: PackagingFilters) {
    setFilters(newFilters);
  }

  function handleReset() {
    setFilters(getDefaultFilters(filters.dateFrom, filters.dateTo));
  }

  // Filter byComponent breakdown by selected component types
  const filteredByComponent = useMemo(() => {
    if (!packagingSummary) return {};
    if (filters.componentTypes.length === 0) return packagingSummary.byComponent;
    const result: typeof packagingSummary.byComponent = {};
    for (const [name, counts] of Object.entries(packagingSummary.byComponent)) {
      if (filters.componentTypes.includes(name)) {
        result[name] = counts;
      }
    }
    return result;
  }, [packagingSummary, filters.componentTypes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Učitavanje...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PackagingFilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        availableComponentTypes={availableComponentTypes}
        hasActiveFilters={hasActiveFilters}
        onReset={handleReset}
      />

      {/* Print-only content — hidden on screen, visible in print */}
      <div className="print-only" style={{ display: "none" }}>
        <h1 style={{ fontSize: "16pt", fontWeight: "bold", marginBottom: "4px" }}>
          Izvještaj pakovanja
        </h1>
        <p style={{ fontSize: "10pt", color: "#555", marginBottom: "2px" }}>
          Datum: {formatDateLocal(new Date())}
          {filters.dateFrom && filters.dateTo && (
            <> | Period: {filters.dateFrom} — {filters.dateTo}</>
          )}
        </p>
        <p style={{ fontSize: "10pt", color: "#555", marginBottom: "2px" }}>
          {buildFilterSummary(filters)}
        </p>
        <p style={{ fontSize: "10pt", fontWeight: 600, marginBottom: "12px" }}>
          Napredak: {progress.percentage}% ({progress.packedItems}/{progress.totalItems} komada)
        </p>

        {/* Print table: component breakdown */}
        {Object.keys(filteredByComponent).length > 0 && (
          <>
            <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginBottom: "6px" }}>
              Pakovanje po tipu komponente
            </h2>
            <table style={{ marginBottom: "20px" }}>
              <thead>
                <tr>
                  <th>Komponenta</th>
                  <th style={{ textAlign: "right" }}>Danas</th>
                  <th style={{ textAlign: "right" }}>Sedmica</th>
                  <th style={{ textAlign: "right" }}>Mjesec</th>
                  <th style={{ textAlign: "right" }}>Ukupno</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(filteredByComponent)
                  .sort(([a], [b]) => a.localeCompare(b, "bs"))
                  .map(([name, counts]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td style={{ textAlign: "right" }}>{counts.today}</td>
                      <td style={{ textAlign: "right" }}>{counts.week}</td>
                      <td style={{ textAlign: "right" }}>{counts.month}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>{counts.total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}

        {/* Print table: per-order packaging status */}
        {filteredOrders.length > 0 && (
          <>
            <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginBottom: "6px" }}>
              Status pakovanja po nalozima
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Nalog</th>
                  <th>Kupac</th>
                  <th>Artikal</th>
                  <th>Komponenta</th>
                  <th style={{ textAlign: "center" }}>Skenirano</th>
                  <th style={{ textAlign: "right" }}>Zapakovano</th>
                  <th style={{ textAlign: "right" }}>Ukupno</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) =>
                  order.items.map((item, itemIdx) =>
                    item.components.map((comp, compIdx) => (
                      <tr key={`${order.orderId}-${item.itemIndex}-${comp.name}`}>
                        {itemIdx === 0 && compIdx === 0 && (
                          <>
                            <td
                              rowSpan={order.items.reduce((sum, i) => sum + i.components.length, 0)}
                              style={{ verticalAlign: "top", fontWeight: "bold" }}
                            >
                              #{order.orderNumber}
                            </td>
                            <td
                              rowSpan={order.items.reduce((sum, i) => sum + i.components.length, 0)}
                              style={{ verticalAlign: "top" }}
                            >
                              {order.customerName ?? "—"}
                            </td>
                          </>
                        )}
                        {compIdx === 0 && (
                          <td
                            rowSpan={item.components.length}
                            style={{ verticalAlign: "top" }}
                          >
                            {item.articleName}
                            {item.articleCode ? ` (${item.articleCode})` : ""}
                            {item.serialNumber ? ` — S/N: ${item.serialNumber}` : ""}
                          </td>
                        )}
                        <td>{comp.name}</td>
                        <td style={{ textAlign: "center" }}>
                          {comp.scanned ? "✓" : "—"}
                        </td>
                        {itemIdx === 0 && compIdx === 0 && (
                          <>
                            <td
                              rowSpan={order.items.reduce((sum, i) => sum + i.components.length, 0)}
                              style={{ textAlign: "right", verticalAlign: "top", fontWeight: "bold" }}
                            >
                              {order.packedItems}
                            </td>
                            <td
                              rowSpan={order.items.reduce((sum, i) => sum + i.components.length, 0)}
                              style={{ textAlign: "right", verticalAlign: "top" }}
                            >
                              {order.totalItems}
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="relative space-y-6 packaging-screen-only">
        {isRefetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Overall progress bar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Ukupan napredak pakovanja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold">{progress.percentage}%</div>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-green-500 transition-all"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {progress.packedItems}/{progress.totalItems} komada
              </div>
            </div>
            {hasActiveFilters && (
              <p className="text-sm text-muted-foreground mt-2">
                Filtrirano: {filteredOrders.length} od {packagingReport.length} naloga
              </p>
            )}
          </CardContent>
        </Card>

        {/* Empty state when filters produce no results */}
        {filteredOrders.length === 0 && packagingReport.length > 0 && hasActiveFilters ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-sm text-muted-foreground text-center">
                Nema podataka koji odgovaraju filterima
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Packaging summary cards */}
            {packagingSummary && (
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Danas</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{packagingSummary.items.today}</div>
                    <p className="text-xs text-muted-foreground">
                      {packagingSummary.components.today} komponenti skenirano
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ova sedmica</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{packagingSummary.items.week}</div>
                    <p className="text-xs text-muted-foreground">
                      {packagingSummary.components.week} komponenti skenirano
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ovaj mjesec</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{packagingSummary.items.month}</div>
                    <p className="text-xs text-muted-foreground">
                      {packagingSummary.components.month} komponenti skenirano
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ukupno</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{packagingSummary.items.total}</div>
                    <p className="text-xs text-muted-foreground">
                      {packagingSummary.components.total} komponenti skenirano
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Component-type breakdown table */}
            {Object.keys(filteredByComponent).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Pakovanje po tipu komponente
                  </CardTitle>
                  <CardDescription>Koliko je svake komponente zapakovano</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Komponenta</TableHead>
                        <TableHead className="text-right">Danas</TableHead>
                        <TableHead className="text-right">Sedmica</TableHead>
                        <TableHead className="text-right">Mjesec</TableHead>
                        <TableHead className="text-right">Ukupno</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(filteredByComponent)
                        .sort(([a], [b]) => a.localeCompare(b, "bs"))
                        .map(([name, counts]) => (
                          <TableRow key={name}>
                            <TableCell className="font-medium">{name}</TableCell>
                            <TableCell className="text-right">{counts.today}</TableCell>
                            <TableCell className="text-right">{counts.week}</TableCell>
                            <TableCell className="text-right">{counts.month}</TableCell>
                            <TableCell className="text-right font-medium">{counts.total}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Per-order packaging status list */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Status pakovanja po nalozima
                </CardTitle>
                <CardDescription>
                  Pregled koji su komadi zapakovani i koji nalozi su kompletni
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nema podataka o pakovanju za odabrani period
                  </p>
                ) : (
                  <>
                  <div className="space-y-4">
                    {paginatedOrders.map((order) => (
                      <div key={order.orderId} className="border rounded-lg overflow-hidden order-status-card">
                        <div
                          className={`px-4 py-3 flex items-center justify-between ${
                            order.isFullyPacked ? "bg-green-50" : "bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {order.isFullyPacked ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : (
                              <Package className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <span className="font-medium">Nalog #{order.orderNumber}</span>
                              {order.customerName && (
                                <span className="text-sm text-muted-foreground ml-2">
                                  — {order.customerName}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium ${
                                order.isFullyPacked ? "text-green-700" : "text-muted-foreground"
                              }`}
                            >
                              {order.packedItems}/{order.totalItems} zapakovano
                            </span>
                            <div className="h-2 w-24 rounded-full bg-secondary">
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
                          </div>
                        </div>
                        <div className="px-4 py-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Artikal</TableHead>
                                <TableHead>Komponente</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {order.items.map((item) => (
                                <TableRow key={item.itemIndex}>
                                  <TableCell className="text-muted-foreground">
                                    {item.itemIndex + 1}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {item.articleName}
                                    {item.articleCode && (
                                      <span className="text-muted-foreground text-xs ml-1">
                                        ({item.articleCode})
                                      </span>
                                    )}
                                    {item.serialNumber && (
                                      <span className="text-muted-foreground text-xs ml-1">
                                        — S/N: {item.serialNumber}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1 flex-wrap">
                                      {item.components.map((comp) => (
                                        <span
                                          key={comp.name}
                                          className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full ${
                                            comp.scanned
                                              ? "bg-green-100 text-green-800"
                                              : item.itemCompleted
                                                ? "bg-amber-100 text-amber-800"
                                                : "bg-gray-100 text-gray-600"
                                          }`}
                                        >
                                          {comp.scanned ? "✓" : item.itemCompleted ? "⚠" : "○"}{" "}
                                          {comp.name}
                                        </span>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.allComponentsScanned && item.itemCompleted ? (
                                      <span className="text-green-700 font-medium text-sm">
                                        Zapakovano ✓
                                      </span>
                                    ) : item.itemCompleted && !item.allComponentsScanned ? (
                                      <span className="text-amber-600 font-medium text-sm">
                                        Završeno ⚠
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-sm">Čeka</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-muted-foreground">
                        Ukupno {filteredOrders.length} naloga
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                        >
                          Prethodna
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Stranica {currentPage} od {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage >= totalPages}
                        >
                          Sljedeća
                        </Button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
