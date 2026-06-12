"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ArrowLeft, Clock, CheckCircle2, Loader2 } from "lucide-react";

interface WorkOrder {
  id: string;
  itemIndex: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  stepSequence: number | null;
  productionStepId: string | null;
  productionStep?: {
    stepName: string;
    sequenceOrder: number;
    department: { name: string };
  } | null;
  canStart?: boolean | null;
  articlePart: {
    partName: string;
    dimensions: string | null;
  };
  productionOrder: {
    id: string;
  };
  barcode?: {
    value: string;
  } | null;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
}

const woStatusLabels: Record<string, string> = {
  pending: "Čeka",
  in_progress: "U izradi",
  completed: "Završen",
};

const woStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  in_progress: "default",
  completed: "secondary",
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${totalMinutes}min`;
}

export default function DepartmentDetailPage({ id }: { id: string }) {
  const [department, setDepartment] = useState<Department | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [deptRes, woRes] = await Promise.all([
        fetch(`/api/departments/${id}`),
        fetch(`/api/departments/${id}/work-orders`),
      ]);

      if (!deptRes.ok) {
        setError("Odjel nije pronađen");
        return;
      }

      setDepartment(await deptRes.json());

      if (woRes.ok) {
        setWorkOrders(await woRes.json());
      }
    } catch {
      setError("Greška pri učitavanju");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Učitavanje...
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/departments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Nazad
          </Link>
        </Button>
        <p className="text-destructive">{error || "Odjel nije pronađen"}</p>
      </div>
    );
  }

  const pendingOrders = workOrders
    .filter((wo) => wo.status === "pending")
    .sort((a, b) => {
      // Spremni (canStart=true) prije blokiranih (canStart=false)
      const aReady = a.canStart !== false ? 1 : 0;
      const bReady = b.canStart !== false ? 1 : 0;
      return bReady - aReady;
    });
  const inProgressOrders = workOrders.filter((wo) => wo.status === "in_progress");
  const completedOrders = workOrders.filter((wo) => wo.status === "completed");

  // Calculate average production time for completed orders
  const completedWithTimes = completedOrders.filter(
    (wo) => wo.startedAt && wo.completedAt
  );
  const avgTimeMs =
    completedWithTimes.length > 0
      ? completedWithTimes.reduce(
          (sum, wo) =>
            sum +
            (new Date(wo.completedAt!).getTime() -
              new Date(wo.startedAt!).getTime()),
          0
        ) / completedWithTimes.length
      : 0;
  const avgMinutes = Math.round(avgTimeMs / 60000);

  function renderWorkOrderTable(orders: WorkOrder[], showTimes: boolean, showReadiness: boolean = false) {
    if (orders.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nema radnih naloga
        </p>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dio</TableHead>
            <TableHead>Korak</TableHead>
            <TableHead>Dimenzije</TableHead>
            <TableHead>Stavka #</TableHead>
            <TableHead>Nalog</TableHead>
            <TableHead>Status</TableHead>
            {showReadiness && <TableHead>Spremnost</TableHead>}
            {showTimes && <TableHead>Započeto</TableHead>}
            {showTimes && <TableHead>Završeno</TableHead>}
            {showTimes && <TableHead>Trajanje</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((wo) => (
            <TableRow key={wo.id}>
              <TableCell className="font-medium">
                {wo.articlePart.partName}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {wo.productionStep
                  ? `${wo.productionStep.sequenceOrder}. ${wo.productionStep.stepName}`
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {wo.articlePart.dimensions || "—"}
              </TableCell>
              <TableCell>{wo.itemIndex + 1}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {wo.productionOrder.id.substring(0, 8)}
              </TableCell>
              <TableCell>
                <Badge variant={woStatusVariant[wo.status] ?? "secondary"}>
                  {woStatusLabels[wo.status] ?? wo.status}
                </Badge>
              </TableCell>
              {showReadiness && (
                <TableCell>
                  {wo.canStart === true && (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      Spreman
                    </Badge>
                  )}
                  {wo.canStart === false && (
                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                      Blokiran
                    </Badge>
                  )}
                </TableCell>
              )}
              {showTimes && (
                <TableCell className="text-muted-foreground">
                  {wo.startedAt
                    ? new Date(wo.startedAt).toLocaleString("bs")
                    : "—"}
                </TableCell>
              )}
              {showTimes && (
                <TableCell className="text-muted-foreground">
                  {wo.completedAt
                    ? new Date(wo.completedAt).toLocaleString("bs")
                    : "—"}
                </TableCell>
              )}
              {showTimes && (
                <TableCell className="font-medium">
                  {formatDuration(wo.startedAt, wo.completedAt)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/departments">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Nazad
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{department.name}</h1>
        {department.description && (
          <p className="text-muted-foreground">{department.description}</p>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Čeka</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">U izradi</CardTitle>
            <Loader2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Završeno</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prosj. vrijeme</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgMinutes > 0 ? `${avgMinutes} min` : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Work orders tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Radni nalozi</CardTitle>
          <CardDescription>
            Svi radni nalozi dodijeljeni ovom odjelu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">
                Čeka ({pendingOrders.length})
              </TabsTrigger>
              <TabsTrigger value="in_progress">
                U izradi ({inProgressOrders.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                Završeno ({completedOrders.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              {renderWorkOrderTable(pendingOrders, false, true)}
            </TabsContent>
            <TabsContent value="in_progress">
              {renderWorkOrderTable(inProgressOrders, true)}
            </TabsContent>
            <TabsContent value="completed">
              {renderWorkOrderTable(completedOrders, true)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
