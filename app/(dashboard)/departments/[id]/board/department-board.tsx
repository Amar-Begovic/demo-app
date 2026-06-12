"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

type OrderPriority = "urgent" | "normal" | "low";

interface BoardWorkOrder {
  id: string;
  status: "pending" | "in_progress" | "completed";
  itemIndex: number;
  stepSequence: number | null;
  canStart: boolean | null;
  articlePart: {
    partName: string;
    dimensions: string | null;
  };
  productionOrder: {
    id: string;
    priority: OrderPriority;
  };
  productionStep?: {
    stepName: string;
    department: { name: string };
  } | null;
  department: { name: string };
}

interface Department {
  id: string;
  name: string;
  description: string | null;
}

interface BoardColumns {
  todo: BoardWorkOrder[];
  inProgress: BoardWorkOrder[];
  done: BoardWorkOrder[];
}

const REFRESH_INTERVAL = 10_000; // 10 seconds

const PRIORITY_ORDER: Record<OrderPriority, number> = {
  urgent: 0,
  normal: 1,
  low: 2,
};

function sortByPriority(workOrders: BoardWorkOrder[]): BoardWorkOrder[] {
  return [...workOrders].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.productionOrder.priority] ?? 1) -
      (PRIORITY_ORDER[b.productionOrder.priority] ?? 1)
  );
}

function groupByStatus(workOrders: BoardWorkOrder[]): BoardColumns {
  return {
    todo: sortByPriority(workOrders.filter((wo) => wo.status === "pending")),
    inProgress: sortByPriority(workOrders.filter((wo) => wo.status === "in_progress")),
    done: sortByPriority(workOrders.filter((wo) => wo.status === "completed")),
  };
}

const PRIORITY_BORDER: Record<OrderPriority, string> = {
  urgent: "border-l-4 border-l-red-500",
  normal: "",
  low: "border-l-4 border-l-blue-400",
};

const PRIORITY_LABEL: Record<OrderPriority, string> = {
  urgent: "Hitan",
  normal: "Normalan",
  low: "Nizak",
};

const PRIORITY_BADGE_CLASS: Record<OrderPriority, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  normal: "bg-gray-100 text-gray-600 border-gray-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

function WorkOrderCard({ wo }: { wo: BoardWorkOrder }) {
  const statusBg = {
    pending: "!bg-gray-50 border-gray-200",
    in_progress: "!bg-blue-50 border-blue-200",
    completed: "!bg-green-50 border-green-200",
  };

  const priority = wo.productionOrder.priority ?? "normal";

  return (
    <Card className={`py-3 gap-2 ${statusBg[wo.status] ?? ""} ${PRIORITY_BORDER[priority]}`}>
      <CardContent className="px-3 py-0 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm truncate">
            {wo.articlePart.partName}
          </span>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {priority === "urgent" && (
              <AlertTriangle className="h-3 w-3 text-red-500" />
            )}
            <Badge variant="outline" className="text-[10px]">
              #{wo.itemIndex + 1}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {wo.productionStep?.stepName ?? "—"}
        </p>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-mono">
            {wo.productionOrder.id.substring(0, 8)}
          </span>
          <div className="flex items-center gap-1.5">
            {priority !== "normal" && (
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 leading-tight ${PRIORITY_BADGE_CLASS[priority]}`}
              >
                {PRIORITY_LABEL[priority]}
              </Badge>
            )}
            {wo.articlePart.dimensions && (
              <span className="truncate">{wo.articlePart.dimensions}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function BoardColumn({
  title,
  icon,
  count,
  workOrders,
  colorClass,
  bgClass,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  workOrders: BoardWorkOrder[];
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className={`flex flex-col min-w-[280px] flex-1 rounded-lg p-3 ${bgClass}`}>
      <div className={`flex items-center gap-2 mb-3 px-1 ${colorClass}`}>
        {icon}
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="secondary" className="ml-auto">
          {count}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
        {workOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nema radnih naloga
          </p>
        ) : (
          workOrders.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)
        )}
      </div>
    </div>
  );
}

export default function DepartmentBoardPage({ id }: { id: string }) {
  const [department, setDepartment] = useState<Department | null>(null);
  const [workOrders, setWorkOrders] = useState<BoardWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

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
      if (isInitial) setError("Greška pri učitavanju");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Auto-refresh polling
  useEffect(() => {
    const interval = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    return () => clearInterval(interval);
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

  const columns = groupByStatus(workOrders);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/departments/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Nazad
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {department.name} — Tabla
            </h1>
            {department.description && (
              <p className="text-sm text-muted-foreground">
                {department.description}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(false)}
          aria-label="Osvježi"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Osvježi
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto">
        <BoardColumn
          title="To Do"
          icon={<Clock className="h-4 w-4" />}
          count={columns.todo.length}
          workOrders={columns.todo}
          colorClass="text-muted-foreground"
          bgClass="bg-gray-50/50"
        />
        <BoardColumn
          title="In Progress"
          icon={<Loader2 className="h-4 w-4" />}
          count={columns.inProgress.length}
          workOrders={columns.inProgress}
          colorClass="text-blue-600"
          bgClass="bg-blue-50/50"
        />
        <BoardColumn
          title="Done"
          icon={<CheckCircle2 className="h-4 w-4" />}
          count={columns.done.length}
          workOrders={columns.done}
          colorClass="text-green-600"
          bgClass="bg-green-50/50"
        />
      </div>
    </div>
  );
}
