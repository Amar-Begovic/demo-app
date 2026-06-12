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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Clock, Loader2 } from "lucide-react";
import {
  getPresetDateRange,
  isValidDateRange,
  type DateRange,
  type PresetKey,
} from "@/lib/utils/filter-helpers";
import { ReportsDateRangeFilter } from "./components/reports-date-range-filter";
import { PackagingTabContent } from "./components/packaging-tab-content";

interface DepartmentTimeStat {
  departmentId: string;
  departmentName: string;
  averageTimeMs: number;
  completedCount: number;
}

interface PartTypeStat {
  partName: string;
  averageTimeMs: number;
  completedCount: number;
}

interface DepartmentOverviewStat {
  departmentId: string;
  departmentName: string;
  totalWorkOrders: number;
  pendingWorkOrders: number;
  inProgressWorkOrders: number;
  completedWorkOrders: number;
  averageProductionTimeMs: number;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (totalMinutes > 0) return `${totalMinutes}min`;
  const seconds = Math.round(ms / 1000);
  return `${seconds}s`;
}

export default function ReportsPage() {
  const [deptTimeStats, setDeptTimeStats] = useState<DepartmentTimeStat[]>([]);
  const [partTypeStats, setPartTypeStats] = useState<PartTypeStat[]>([]);
  const [deptOverview, setDeptOverview] = useState<DepartmentOverviewStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);

  // 5.1: Date filter state initialized with "today" preset
  const initialRange = getPresetDateRange("today");
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom);
  const [dateTo, setDateTo] = useState(initialRange.dateTo);
  const [activePreset, setActivePreset] = useState<PresetKey | null>("today");

  // 5.2: Handler for filter changes
  function handleRangeChange(range: DateRange & { preset: PresetKey | null }) {
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setActivePreset(range.preset);
  }

  // 5.3 & 5.4: Fetch data with date params, re-trigger on date change
  const fetchData = useCallback(async (isInitial: boolean) => {
    if (!isValidDateRange(dateFrom, dateTo)) return;

    if (isInitial) {
      setLoading(true);
    } else {
      setIsRefetching(true);
    }

    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const qs = params.toString();

      const [timeRes, statsRes] = await Promise.all([
        fetch(`/api/reports/production-time${qs ? `?${qs}` : ""}`),
        fetch(`/api/reports/department-stats${qs ? `?${qs}` : ""}`),
      ]);

      if (timeRes.ok) {
        const data = await timeRes.json();
        setDeptTimeStats(data.departmentStats ?? []);
        setPartTypeStats(data.partTypeStats ?? []);
      }

      if (statsRes.ok) {
        setDeptOverview(await statsRes.json());
      }
    } catch {
      // silently fail — reports are informational
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData(loading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // 5.1: Initial full-page loading spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Učitavanje...
      </div>
    );
  }

  const totalCompleted = deptOverview.reduce(
    (sum, d) => sum + d.completedWorkOrders,
    0
  );
  const allAvgTimes = deptTimeStats
    .filter((d) => d.averageTimeMs > 0)
    .map((d) => d.averageTimeMs);
  const overallAvgMs =
    allAvgTimes.length > 0
      ? Math.round(allAvgTimes.reduce((a, b) => a + b, 0) / allAvgTimes.length)
      : 0;

  return (
    <div className="space-y-8">
      <div className="no-print">
        <h1 className="text-3xl font-bold tracking-tight">Izvještaji</h1>
        <p className="text-muted-foreground">
          Prosječno vrijeme proizvodnje po odjelu i tipu dijela
        </p>
      </div>

      {/* 5.2: Filter rendered above summary cards, always interactive */}
      <div className="no-print">
        <ReportsDateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          activePreset={activePreset}
          onRangeChange={handleRangeChange}
        />
      </div>

      {/* 5.5: Data sections wrapper with loading overlay */}
      <div className="relative space-y-8">
        {isRefetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3 no-print">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ukupno završeno</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCompleted}</div>
              <p className="text-xs text-muted-foreground">radnih naloga</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prosječno vrijeme</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDuration(overallAvgMs)}</div>
              <p className="text-xs text-muted-foreground">svi odjeli</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktivni odjeli</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deptOverview.length}</div>
              <p className="text-xs text-muted-foreground">sa radnim nalozima</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="departments">
          <TabsList className="no-print">
            <TabsTrigger value="departments">Po odjelu</TabsTrigger>
            <TabsTrigger value="parts">Po tipu dijela</TabsTrigger>
            <TabsTrigger value="packaging">Pakovanje</TabsTrigger>
          </TabsList>

          <TabsContent value="departments" className="mt-4 no-print">
            <Card>
              <CardHeader>
                <CardTitle>Prosječno vrijeme po odjelu</CardTitle>
                <CardDescription>
                  Prosječno trajanje radnih naloga za svaki proizvodni odjel
                </CardDescription>
              </CardHeader>
              <CardContent>
                {deptTimeStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nema podataka za odabrani period
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Odjel</TableHead>
                        <TableHead className="text-right">Završeno naloga</TableHead>
                        <TableHead className="text-right">Prosječno vrijeme</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deptTimeStats.map((stat) => (
                        <TableRow key={stat.departmentId}>
                          <TableCell className="font-medium">
                            {stat.departmentName}
                          </TableCell>
                          <TableCell className="text-right">
                            {stat.completedCount}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatDuration(stat.averageTimeMs)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parts" className="mt-4 no-print">
            <Card>
              <CardHeader>
                <CardTitle>Prosječno vrijeme po tipu dijela</CardTitle>
                <CardDescription>
                  Prosječno trajanje proizvodnje za svaki tip dijela artikla
                </CardDescription>
              </CardHeader>
              <CardContent>
                {partTypeStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nema podataka za odabrani period
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tip dijela</TableHead>
                        <TableHead className="text-right">Završeno naloga</TableHead>
                        <TableHead className="text-right">Prosječno vrijeme</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partTypeStats.map((stat) => (
                        <TableRow key={stat.partName}>
                          <TableCell className="font-medium">
                            {stat.partName}
                          </TableCell>
                          <TableCell className="text-right">
                            {stat.completedCount}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatDuration(stat.averageTimeMs)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="packaging" className="mt-4">
            <PackagingTabContent globalDateFrom={dateFrom} globalDateTo={dateTo} />
          </TabsContent>
        </Tabs>

        {/* Department overview table */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Pregled odjela</CardTitle>
            <CardDescription>
              Ukupan broj radnih naloga po statusu za svaki odjel
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deptOverview.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nema podataka za odabrani period
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Odjel</TableHead>
                    <TableHead className="text-right">Ukupno</TableHead>
                    <TableHead className="text-right">Čeka</TableHead>
                    <TableHead className="text-right">U izradi</TableHead>
                    <TableHead className="text-right">Završeno</TableHead>
                    <TableHead className="text-right">Prosj. vrijeme</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptOverview.map((dept) => (
                    <TableRow key={dept.departmentId}>
                      <TableCell className="font-medium">
                        {dept.departmentName}
                      </TableCell>
                      <TableCell className="text-right">
                        {dept.totalWorkOrders}
                      </TableCell>
                      <TableCell className="text-right">
                        {dept.pendingWorkOrders}
                      </TableCell>
                      <TableCell className="text-right">
                        {dept.inProgressWorkOrders}
                      </TableCell>
                      <TableCell className="text-right">
                        {dept.completedWorkOrders}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatDuration(dept.averageProductionTimeMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
