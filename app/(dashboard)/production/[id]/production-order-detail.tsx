"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ShoppingCart,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Package,
  Printer,
  Building2,
  DollarSign,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CostBreakdown } from "@/lib/utils/calculations";
import { archiveProductionOrder, updateProductionOrder } from "@/app/actions/production-orders";
import { getEditableFields } from "@/lib/utils/production-order-fields";
import { PrintFilterModal } from "@/app/(dashboard)/production/components/print-filter-modal";

import { SearchableSelect } from "@/components/ui/searchable-select";

interface MaterialRequirement {
  materialId: string;
  materialName: string;
  requiredQuantity: number;
  availableQuantity: number;
  deficit: number;
}

interface MaterialCheckResult {
  allAvailable: boolean;
  requirements: MaterialRequirement[];
}

interface ProductionOrderProgress {
  totalWorkOrders: number;
  completedWorkOrders: number;
  percentage: number;
}

interface WorkOrder {
  id: string;
  itemIndex: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  articlePart: {
    id: string;
    partName: string;
    dimensions: string | null;
  };
  department: {
    id: string;
    name: string;
  };
  barcode: {
    id: string;
    value: string;
  } | null;
}

interface PurchaseOrder {
  id: string;
  requiredQuantity: number;
  status: string;
  createdAt: string;
  receivedAt: string | null;
  material: { id: string; name: string; unit: string };
  supplier: { id: string; companyName: string } | null;
}

interface ArticlePart {
  id: string;
  partName: string;
  dimensions: string | null;
  department: { id: string; name: string };
  materials: {
    materialId: string;
    quantity: number;
    material: { id: string; name: string; unit: string };
  }[];
}

interface OrderItem {
  id: string;
  articleId: string;
  quantity: number;
  deliveryDeadline: string | null;
  priority: string;
  notes: string | null;
  customerOrderNumber: string | null;
  loadingNumber: string | null;
  loadingSequence: number | null;
  serialNumber: string | null;
  step: string | null;
  article: {
    id: string;
    name: string;
    description: string | null;
    articleGroup: string | null;
    parts: ArticlePart[];
  };
  fabric: { id: string; name: string } | null;
  rucka: { id: string; name: string } | null;
  paspul: { id: string; name: string } | null;
  nogice1: { id: string; name: string } | null;
  nogice2: { id: string; name: string } | null;
}

interface ProductionOrderDetail {
  order: {
    id: string;
    quantity: number | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    customerName: string | null;
    article: {
      id: string;
      name: string;
      description: string | null;
      articleGroup: string | null;
      parts: ArticlePart[];
    } | null;
    items: OrderItem[];
    workOrders: WorkOrder[];
    purchaseOrders: PurchaseOrder[];
  };
  progress: ProductionOrderProgress;
  materialCheck: MaterialCheckResult;
}

const statusLabels: Record<string, string> = {
  draft: "Nacrt",
  waiting_material: "Čeka materijal",
  ready: "Spreman",
  in_progress: "U izradi",
  completed: "Završen",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  waiting_material: "destructive",
  ready: "outline",
  in_progress: "default",
  completed: "secondary",
};

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

const poStatusLabels: Record<string, string> = {
  pending: "Čeka",
  ordered: "Naručeno",
  received: "Primljeno",
};

const priorityLabels: Record<string, string> = {
  urgent: "Hitan",
  normal: "Normalan",
  low: "Nizak",
};

type BarcodeRecord = Record<string, {
  value: string;
  imageBase64: string;
  partName: string;
  dimensions: string | null;
  productionOrderId: string;
  customerName: string | null;
  articleName: string;
  articleId: string;
  partIndex: string;
}>;

/**
 * Get display items from order — supports both new multi-item and legacy single-article format.
 */
function getDisplayItems(order: ProductionOrderDetail["order"] | undefined): Array<{ id: string; articleId: string; quantity: number; deliveryDeadline: string | null; priority: string; notes: string | null; customerOrderNumber: string | null; loadingNumber: string | null; loadingSequence: number | null; serialNumber: string | null; step: string | null; article: NonNullable<ProductionOrderDetail["order"]["article"]>; fabric: { id: string; name: string } | null; rucka: { id: string; name: string } | null; paspul: { id: string; name: string } | null; nogice1: { id: string; name: string } | null; nogice2: { id: string; name: string } | null }> {
  if (!order) return [];
  if (order.items && order.items.length > 0) {
    return order.items.map((item) => ({
      id: item.id,
      articleId: item.articleId,
      quantity: item.quantity,
      deliveryDeadline: item.deliveryDeadline,
      priority: item.priority,
      notes: item.notes,
      customerOrderNumber: item.customerOrderNumber,
      loadingNumber: item.loadingNumber,
      loadingSequence: item.loadingSequence ?? null,
      serialNumber: item.serialNumber ?? null,
      step: item.step ?? null,
      article: item.article,
      fabric: item.fabric ?? null,
      rucka: item.rucka ?? null,
      paspul: item.paspul ?? null,
      nogice1: item.nogice1 ?? null,
      nogice2: item.nogice2 ?? null,
    }));
  }
  if (order.article && order.quantity) {
    return [{ id: "", articleId: order.article.id, quantity: order.quantity, deliveryDeadline: null, priority: "normal", notes: null, customerOrderNumber: null, loadingNumber: null, loadingSequence: null, serialNumber: null, step: null, article: order.article, fabric: null, rucka: null, paspul: null, nogice1: null, nogice2: null }];
  }
  return [];
}

/**
 * Classify deadline status for color coding.
 */
function classifyDeadlineStatus(deadline: string | null, status: string): "overdue" | "warning" | "ok" {
  if (!deadline || status === "completed") return "ok";
  const deadlineTime = new Date(deadline).getTime();
  const now = Date.now();
  if (deadlineTime < now) return "overdue";
  if (deadlineTime - now <= 3 * 24 * 60 * 60 * 1000) return "warning";
  return "ok";
}

export default function ProductionOrderDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProductionOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [barcodes, setBarcodes] = useState<BarcodeRecord>({});
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [costData, setCostData] = useState<CostBreakdown | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  // Dropdown data for inline editing of article/fabric/rucka/paspul/nogice
  interface DropdownData {
    articles: { id: string; name: string; code?: string | null }[];
    fabrics: { id: string; name: string; color?: string | null; code?: string | null }[];
    rucke: { id: string; name: string }[];
    paspuli: { id: string; name: string }[];
    nogice: { id: string; name: string }[];
  }
  const [dropdownData, setDropdownData] = useState<DropdownData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/production-orders/${id}`);
      if (res.ok) {
        const result: ProductionOrderDetail = await res.json();
        setData(result);

        // Load existing barcodes from work orders
        const existingBarcodes: BarcodeRecord = {};
        const items = getDisplayItems(result.order);
        const firstArticle = items[0]?.article;
        const totalParts = firstArticle?.parts.length ?? 0;
        let hasAnyBarcode = false;

        for (const wo of result.order.workOrders) {
          if (wo.barcode) {
            hasAnyBarcode = true;
            const partIdx = firstArticle?.parts.findIndex(p => p.id === wo.articlePart.id) ?? -1;
            try {
              const bcRes = await fetch(`/api/barcodes/${wo.barcode.value}`);
              if (bcRes.ok) {
                const bcData = await bcRes.json();
                existingBarcodes[wo.id] = {
                  value: wo.barcode.value,
                  imageBase64: bcData.barcode.imageBase64,
                  partName: wo.articlePart.partName,
                  dimensions: wo.articlePart.dimensions,
                  productionOrderId: result.order.id,
                  customerName: result.order.customerName,
                  articleName: firstArticle?.name ?? "",
                  articleId: firstArticle?.id ?? "",
                  partIndex: `${partIdx + 1}/${totalParts}`,
                };
              }
            } catch {
              // Skip if barcode image fetch fails
            }
          }
        }

        if (hasAnyBarcode) {
          setBarcodes(existingBarcodes);
        }
      } else {
        setError("Nalog nije pronađen");
      }
    } catch {
      setError("Greška pri učitavanju");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchCost = useCallback(async () => {
    setCostLoading(true);
    try {
      const res = await fetch(`/api/production-orders/${id}/cost`);
      if (res.ok) {
        const result: CostBreakdown = await res.json();
        setCostData(result);
      }
    } catch {
      // Cost fetch is non-critical
    } finally {
      setCostLoading(false);
    }
  }, [id]);

  async function handleArchive() {
    setArchiveLoading(true);
    setError(null);
    try {
      const result = await archiveProductionOrder(id);
      if (result.success) {
        router.push("/production");
      } else {
        setError(result.error ?? "Greška pri arhiviranju naloga");
      }
    } catch {
      setError("Greška pri arhiviranju naloga");
    } finally {
      setArchiveLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    fetchCost();
    // Fetch dropdown data for inline editing
    fetch("/api/production-orders/dialog-data")
      .then((res) => res.ok ? res.json() : null)
      .then((d) => { if (d) setDropdownData(d); })
      .catch(() => {});
  }, [fetchData, fetchCost]);

  async function handleGeneratePurchaseOrders() {
    setActionLoading("purchase");
    setError(null);
    try {
      const res = await fetch(`/api/production-orders/${id}/generate-purchase-orders`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || "Greška");
        return;
      }
      fetchData();
    } catch {
      setError("Greška pri generisanju naloga za nabavku");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleGenerateWorkOrders() {
    setActionLoading("work");
    setError(null);
    try {
      const res = await fetch(`/api/production-orders/${id}/generate-work-orders`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || "Greška");
        return;
      }
      fetchData();
    } catch {
      setError("Greška pri generisanju radnih naloga");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefreshMaterials() {
    setRefreshLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/production-orders/${id}/refresh-materials`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || "Greška pri ažuriranju materijala. Pokušajte ponovo.");
        return;
      }
      fetchData();
    } catch {
      setError("Greška pri ažuriranju materijala. Pokušajte ponovo.");
    } finally {
      setRefreshLoading(false);
    }
  }

  async function handleGenerateBarcodes() {
    if (!data) return;
    setBarcodeLoading(true);
    setError(null);
    try {
      const newBarcodes: typeof barcodes = {};
      const items = getDisplayItems(data.order);
      const firstArticle = items[0]?.article;
      const totalParts = firstArticle?.parts.length ?? 0;

      for (const wo of data.order.workOrders) {
        const res = await fetch(`/api/work-orders/${wo.id}/barcode`, { method: "POST" });
        if (res.ok) {
          const bc = await res.json();
          const partIdx = firstArticle?.parts.findIndex(p => p.id === wo.articlePart.id) ?? -1;
          newBarcodes[wo.id] = {
            value: bc.value,
            imageBase64: bc.imageBase64,
            partName: wo.articlePart.partName,
            dimensions: wo.articlePart.dimensions,
            productionOrderId: data.order.id,
            customerName: data.order.customerName,
            articleName: firstArticle?.name ?? "",
            articleId: firstArticle?.id ?? "",
            partIndex: `${partIdx + 1}/${totalParts}`,
          };
        }
      }
      setBarcodes(newBarcodes);
    } catch {
      setError("Greška pri generisanju barkodova");
    } finally {
      setBarcodeLoading(false);
    }
  }

  function handlePrintAllBarcodes() {
    const entries = Object.values(barcodes);
    if (entries.length === 0) return;

    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) return;

    const labelsHtml = entries.map((bc) => `
      <div class="label">
        <img src="data:image/png;base64,${bc.imageBase64}" alt="Barkod" />
        <div class="info">
          <strong>${bc.articleName}</strong>
          <span>Dio: ${bc.partName} (${bc.partIndex})</span><br/>
          ${bc.dimensions ? `<span>${bc.dimensions}</span><br/>` : ""}
          ${bc.customerName ? `<span>Kupac: ${bc.customerName}</span><br/>` : ""}
          <span class="mono">ID: ${bc.articleId.substring(0, 8)}</span>
        </div>
      </div>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barkodovi - ${data ? getDisplayItems(data.order)[0]?.article.name ?? "" : ""}</title>
          <style>
            body { margin: 0; padding: 16px; font-family: sans-serif; }
            .labels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
            .label { text-align: center; padding: 12px; border: 1px solid #ccc; break-inside: avoid; }
            .label img { max-width: 100%; height: auto; }
            .info { margin-top: 8px; font-size: 11px; line-height: 1.5; }
            .info strong { display: block; font-size: 13px; margin-bottom: 2px; }
            .mono { font-family: monospace; font-size: 10px; }
            @media print {
              .labels { grid-template-columns: repeat(3, 1fr); }
              .label { border: 1px solid #999; }
            }
          </style>
        </head>
        <body>
          <div class="labels">${labelsHtml}</div>
          <script>
            window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function handlePrintSingleBarcode(woId: string) {
    const bc = barcodes[woId];
    if (!bc) return;

    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barkod - ${bc.value}</title>
          <style>
            body { margin: 0; padding: 16px; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; }
            .label { text-align: center; padding: 12px; border: 1px solid #ccc; max-width: 300px; }
            .label img { max-width: 100%; height: auto; }
            .info { margin-top: 8px; font-size: 12px; line-height: 1.5; }
            .info strong { display: block; font-size: 14px; margin-bottom: 2px; }
            .mono { font-family: monospace; font-size: 10px; }
            @media print { body { padding: 0; } .label { border: none; } }
          </style>
        </head>
        <body>
          <div class="label">
            <img src="data:image/png;base64,${bc.imageBase64}" alt="Barkod" />
            <div class="info">
              <strong>${bc.articleName}</strong>
              <span>Dio: ${bc.partName} (${bc.partIndex})</span><br/>
              ${bc.dimensions ? `<span>${bc.dimensions}</span><br/>` : ""}
              ${bc.customerName ? `<span>Kupac: ${bc.customerName}</span><br/>` : ""}
              <span class="mono">ID: ${bc.articleId.substring(0, 8)}</span>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Učitavanje...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/production">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Nazad
          </Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { order, progress, materialCheck } = data;
  const displayItems = getDisplayItems(order);
  const primaryArticleName = displayItems[0]?.article.name ?? "Nalog";
  const editableFields = getEditableFields(order.status);

  // Group work orders by department
  const workOrdersByDept = order.workOrders.reduce<Record<string, WorkOrder[]>>((acc, wo) => {
    const deptName = wo.department.name;
    if (!acc[deptName]) acc[deptName] = [];
    acc[deptName].push(wo);
    return acc;
  }, {});

  // Group work orders by part for timeline
  const workOrdersByPart = order.workOrders.reduce<Record<string, WorkOrder[]>>((acc, wo) => {
    const partName = wo.articlePart.partName;
    if (!acc[partName]) acc[partName] = [];
    acc[partName].push(wo);
    return acc;
  }, {});

  const hasMissingMaterials = !materialCheck.allAvailable;
  const canGeneratePurchaseOrders = hasMissingMaterials && (order.status === "waiting_material" || order.status === "ready");
  const canGenerateWorkOrders = order.status === "ready" || order.status === "waiting_material";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/production">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Nazad
          </Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Header with title and status */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {displayItems.length === 1 ? primaryArticleName : `Nalog — ${displayItems.length} artikala`}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {order.customerName && <span>Kupac: {order.customerName} — </span>}
            Kreirano: {new Date(order.createdAt).toLocaleDateString("bs")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={archiveLoading}>
                <Trash2 className="h-4 w-4 mr-2" />
                {archiveLoading ? "Arhiviranje..." : "Arhiviraj"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arhiviraj nalog</AlertDialogTitle>
                <AlertDialogDescription>
                  {order.status === "in_progress"
                    ? "Nalog je u izradi. Jeste li sigurni da želite arhivirati?"
                    : "Jeste li sigurni da želite arhivirati ovaj nalog?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Odustani</AlertDialogCancel>
                <AlertDialogAction onClick={handleArchive}>
                  Arhiviraj
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Badge variant={statusVariant[order.status] ?? "secondary"} className="text-base px-3 py-1">
            {statusLabels[order.status] ?? order.status}
          </Badge>
        </div>
      </div>

      {/* Print navigation */}
      <PrintFilterModal
        orderIds={[order.id]}
        trigger={
          <Button variant="default" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Štampaj
          </Button>
        }
      />

      {/* Articles / Items list - Editing handled by EditProductionOrderView in page.tsx */}
      {false && displayItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Artikli u nalogu
            </CardTitle>
            <CardDescription>
              {displayItems.length === 1
                ? "1 artikal"
                : `${displayItems.length} artikala`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artikal</TableHead>
                  <TableHead>Količina</TableHead>
                  <TableHead>Rok isporuke</TableHead>
                  <TableHead>Prioritet</TableHead>
                  <TableHead>Štof</TableHead>
                  <TableHead>Štep</TableHead>
                  <TableHead>Ručka</TableHead>
                  <TableHead>Paspul</TableHead>
                  <TableHead>Nogice 1</TableHead>
                  <TableHead>Nogice 2</TableHead>
                  <TableHead>Bilješke</TableHead>
                  <TableHead>Serijski broj</TableHead>
                  <TableHead>Br. utovara</TableHead>
                  <TableHead>Dijelovi</TableHead>
                  <TableHead>R.b. iz naloga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayItems.map((item) => {
                  const itemDeadlineStatus = classifyDeadlineStatus(item.deliveryDeadline, order.status);
                  const deadlineValue = item.deliveryDeadline
                    ? new Date(item.deliveryDeadline).toISOString().split("T")[0]
                    : "";
                  return (
                    <TableRow key={item.id || item.articleId}>
                      <TableCell className="font-medium">
                        {editableFields.articleId && item.id && dropdownData ? (
                          <SearchableSelect
                            options={dropdownData.articles.map((a) => ({
                              value: a.id,
                              label: a.code ? `${a.name} (${a.code})` : a.name,
                            }))}
                            value={item.articleId}
                            onValueChange={async (newArticleId) => {
                              if (newArticleId !== item.articleId) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, articleId: newArticleId }],
                                });
                                fetchData();
                              }
                            }}
                            placeholder="Odaberi artikal"
                            searchPlaceholder="Pretraži artikle..."
                            emptyText="Nema artikala."
                            className="w-48"
                          />
                        ) : (
                          <>
                            <Link href={`/articles/${item.articleId}`} className="hover:underline">
                              {item.article.name}
                            </Link>
                            {item.article.articleGroup && (
                              <Badge variant="outline" className="ml-2">
                                {item.article.articleGroup}
                              </Badge>
                            )}
                            {item.article.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.article.description}</p>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        {editableFields.quantity && item.id ? (
                          <input
                            type="number"
                            min="1"
                            defaultValue={item.quantity}
                            className="border rounded px-2 py-1 text-sm w-20"
                            onBlur={async (e) => {
                              const newValue = parseInt(e.target.value, 10);
                              if (!isNaN(newValue) && newValue >= 1 && newValue !== item.quantity) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, quantity: newValue }],
                                });
                                fetchData();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span>{item.quantity}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editableFields.deliveryDeadline && item.id ? (
                          <input
                            type="date"
                            defaultValue={deadlineValue}
                            className={cn(
                              "border rounded px-2 py-1 text-sm w-36",
                              itemDeadlineStatus === "overdue" && "border-red-500 text-red-600",
                              itemDeadlineStatus === "warning" && "border-amber-500 text-amber-600",
                            )}
                            onChange={async (e) => {
                              const newDate = e.target.value;
                              await updateProductionOrder(order.id, {
                                items: [{
                                  id: item.id,
                                  deliveryDeadline: newDate ? new Date(newDate) : null,
                                }],
                              });
                              fetchData();
                            }}
                          />
                        ) : item.deliveryDeadline ? (
                          <span className={cn(
                            itemDeadlineStatus === "overdue" && "font-medium text-red-600 dark:text-red-400",
                            itemDeadlineStatus === "warning" && "font-medium text-amber-600 dark:text-amber-400",
                          )}>
                            {new Date(item.deliveryDeadline).toLocaleDateString("bs")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editableFields.priority && item.id ? (
                          <select
                            defaultValue={item.priority}
                            className="border rounded px-2 py-1 text-sm"
                            onChange={async (e) => {
                              const newValue = e.target.value;
                              if (newValue !== item.priority) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, priority: newValue as "urgent" | "normal" | "low" }],
                                });
                                fetchData();
                              }
                            }}
                          >
                            <option value="urgent">Hitan</option>
                            <option value="normal">Normalan</option>
                            <option value="low">Nizak</option>
                          </select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              item.priority === "urgent" && "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
                              item.priority === "normal" && "border-gray-400 bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-400",
                              item.priority === "low" && "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
                            )}
                          >
                            {priorityLabels[item.priority] ?? item.priority}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.fabricId && item.id && dropdownData ? (
                          <SearchableSelect
                            options={[
                              { value: "__none__", label: "— Bez štofa —" },
                              ...dropdownData.fabrics.map((f) => ({
                                value: f.id,
                                label: f.code ? `${f.name} (${f.code})` : f.name,
                              })),
                            ]}
                            value={item.fabric?.id ?? "__none__"}
                            onValueChange={async (newFabricId) => {
                              const actualId = newFabricId === "__none__" ? null : newFabricId;
                              if (actualId !== (item.fabric?.id ?? null)) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, fabricId: actualId }],
                                });
                                fetchData();
                              }
                            }}
                            placeholder="Odaberi štof"
                            searchPlaceholder="Pretraži štofove..."
                            emptyText="Nema štofova."
                            className="w-36"
                          />
                        ) : (
                          <span>{item.fabric?.name ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.step && item.id ? (
                          <input
                            type="text"
                            defaultValue={item.step ?? ""}
                            maxLength={200}
                            placeholder="—"
                            className="border rounded px-2 py-1 text-sm w-32"
                            onBlur={async (e) => {
                              const newValue = e.target.value;
                              if (newValue !== (item.step ?? "")) {
                                try {
                                  const result = await updateProductionOrder(order.id, {
                                    items: [{ id: item.id, step: newValue || null }],
                                  });
                                  if (result.success) {
                                    fetchData();
                                  } else {
                                    e.target.value = item.step ?? "";
                                    setError(result.error ?? "Greška pri spremanju štep polja");
                                  }
                                } catch {
                                  e.target.value = item.step ?? "";
                                  setError("Greška pri spremanju štep polja");
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span>{item.step ?? ""}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.ruckaId && item.id && dropdownData ? (
                          <SearchableSelect
                            options={[
                              { value: "__none__", label: "— Bez ručke —" },
                              ...dropdownData.rucke.map((r) => ({
                                value: r.id,
                                label: r.name,
                              })),
                            ]}
                            value={item.rucka?.id ?? "__none__"}
                            onValueChange={async (newId) => {
                              const actualId = newId === "__none__" ? null : newId;
                              if (actualId !== (item.rucka?.id ?? null)) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, ruckaId: actualId }],
                                });
                                fetchData();
                              }
                            }}
                            placeholder="Odaberi ručku"
                            searchPlaceholder="Pretraži..."
                            emptyText="Nema ručki."
                            className="w-32"
                          />
                        ) : (
                          <span>{item.rucka?.name ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.paspulId && item.id && dropdownData ? (
                          <SearchableSelect
                            options={[
                              { value: "__none__", label: "— Bez paspula —" },
                              ...dropdownData.paspuli.map((p) => ({
                                value: p.id,
                                label: p.name,
                              })),
                            ]}
                            value={item.paspul?.id ?? "__none__"}
                            onValueChange={async (newId) => {
                              const actualId = newId === "__none__" ? null : newId;
                              if (actualId !== (item.paspul?.id ?? null)) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, paspulId: actualId }],
                                });
                                fetchData();
                              }
                            }}
                            placeholder="Odaberi paspul"
                            searchPlaceholder="Pretraži..."
                            emptyText="Nema paspula."
                            className="w-32"
                          />
                        ) : (
                          <span>{item.paspul?.name ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.nogice1Id && item.id && dropdownData ? (
                          <SearchableSelect
                            options={[
                              { value: "__none__", label: "— Bez nogica —" },
                              ...dropdownData.nogice.map((n) => ({
                                value: n.id,
                                label: n.name,
                              })),
                            ]}
                            value={item.nogice1?.id ?? "__none__"}
                            onValueChange={async (newId) => {
                              const actualId = newId === "__none__" ? null : newId;
                              if (actualId !== (item.nogice1?.id ?? null)) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, nogice1Id: actualId }],
                                });
                                fetchData();
                              }
                            }}
                            placeholder="Odaberi nogice"
                            searchPlaceholder="Pretraži..."
                            emptyText="Nema nogica."
                            className="w-32"
                          />
                        ) : (
                          <span>{item.nogice1?.name ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.nogice2Id && item.id && dropdownData ? (
                          <SearchableSelect
                            options={[
                              { value: "__none__", label: "— Bez nogica —" },
                              ...dropdownData.nogice.map((n) => ({
                                value: n.id,
                                label: n.name,
                              })),
                            ]}
                            value={item.nogice2?.id ?? "__none__"}
                            onValueChange={async (newId) => {
                              const actualId = newId === "__none__" ? null : newId;
                              if (actualId !== (item.nogice2?.id ?? null)) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, nogice2Id: actualId }],
                                });
                                fetchData();
                              }
                            }}
                            placeholder="Odaberi nogice"
                            searchPlaceholder="Pretraži..."
                            emptyText="Nema nogica."
                            className="w-32"
                          />
                        ) : (
                          <span>{item.nogice2?.name ?? "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.notes && item.id ? (
                          <input
                            type="text"
                            defaultValue={item.notes ?? ""}
                            placeholder="—"
                            className="border rounded px-2 py-1 text-sm w-32"
                            onBlur={async (e) => {
                              const newValue = e.target.value;
                              if (newValue !== (item.notes ?? "")) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, notes: newValue || null }],
                                });
                                fetchData();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span className="whitespace-pre-wrap">{item.notes ?? ""}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.serialNumber && item.id ? (
                          <input
                            type="text"
                            defaultValue={item.serialNumber ?? ""}
                            placeholder="—"
                            className="border rounded px-2 py-1 text-sm w-28"
                            onBlur={async (e) => {
                              const newValue = e.target.value;
                              if (newValue !== (item.serialNumber ?? "")) {
                                await updateProductionOrder(order.id, {
                                  items: [{ id: item.id, serialNumber: newValue || null }],
                                });
                                fetchData();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span>{item.serialNumber ?? ""}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.loadingNumber && item.id ? (
                          <input
                            type="text"
                            defaultValue={item.loadingNumber ?? ""}
                            placeholder="—"
                            className="border rounded px-2 py-1 text-sm w-24"
                            onBlur={async (e) => {
                              const newValue = e.target.value;
                              if (newValue !== (item.loadingNumber ?? "")) {
                                await updateProductionOrder(order.id, {
                                  items: [{
                                    id: item.id,
                                    loadingNumber: newValue || null,
                                  }],
                                });
                                fetchData();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        ) : (
                          <span>{item.loadingNumber ?? ""}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.article.parts.length} {item.article.parts.length === 1 ? "dio" : "dijelova"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {editableFields.loadingSequence && item.id ? (
                          <input
                            type="number"
                            defaultValue={item.loadingSequence ?? ""}
                            placeholder="—"
                            className="border rounded px-2 py-1 text-sm w-20"
                            onBlur={async (e) => {
                              const newValue = e.target.value ? parseInt(e.target.value, 10) : null;
                              if (newValue !== (item.loadingSequence ?? null)) {
                                await updateProductionOrder(order.id, {
                                  items: [{
                                    id: item.id,
                                    loadingSequence: newValue,
                                  }],
                                });
                                fetchData();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        ) : (
                          <span>{item.loadingSequence ?? ""}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Progress bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Progres proizvodnje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{progress.completedWorkOrders} od {progress.totalWorkOrders} radnih naloga završeno</span>
              <span className="font-medium">{progress.percentage}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-secondary">
              <div
                className="h-3 rounded-full bg-primary transition-all"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost breakdown section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Kalkulacija troškova
          </CardTitle>
          {costData && !costData.isComplete && (
            <CardDescription className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Nepotpuna kalkulacija — neki materijali nemaju unesenu cijenu
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {costLoading ? (
            <p className="text-sm text-muted-foreground">Učitavanje kalkulacije...</p>
          ) : !costData ? (
            <p className="text-sm text-muted-foreground">Kalkulacija nije dostupna</p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artikal</TableHead>
                    <TableHead>Količina</TableHead>
                    <TableHead>Trošak/kom</TableHead>
                    <TableHead>Ukupni trošak</TableHead>
                    <TableHead>Prodajna cijena</TableHead>
                    <TableHead>Marža/kom</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costData.articleCosts.map((ac) => (
                    <TableRow key={ac.articleId}>
                      <TableCell className="font-medium">{ac.articleName}</TableCell>
                      <TableCell>{ac.quantity}</TableCell>
                      <TableCell>{ac.materialCostPerUnit.toFixed(2)} BAM</TableCell>
                      <TableCell>{ac.totalMaterialCost.toFixed(2)} BAM</TableCell>
                      <TableCell>
                        {ac.sellingPrice !== null ? `${ac.sellingPrice.toFixed(2)} BAM` : "—"}
                      </TableCell>
                      <TableCell>
                        {ac.margin !== null ? (
                          <span className={cn(ac.margin >= 0 ? "text-green-600" : "text-red-600")}>
                            {ac.margin.toFixed(2)} BAM
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {ac.incomplete ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">
                            Nepotpuno
                          </Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals row */}
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="font-medium">Ukupno</span>
                <div className="flex gap-6">
                  <span>Trošak: <span className="font-medium">{costData.totalMaterialCost.toFixed(2)} BAM</span></span>
                  {costData.totalSellingPrice !== null && (
                    <span>Prodaja: <span className="font-medium">{costData.totalSellingPrice.toFixed(2)} BAM</span></span>
                  )}
                  {costData.totalMargin !== null && (
                    <span>Marža: <span className={cn("font-medium", costData.totalMargin >= 0 ? "text-green-600" : "text-red-600")}>
                      {costData.totalMargin.toFixed(2)} BAM
                    </span></span>
                  )}
                </div>
              </div>

              {/* Missing price materials warning */}
              {!costData.isComplete && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Materijali bez cijene:
                  </p>
                  <ul className="text-sm text-amber-700 dark:text-amber-400 list-disc list-inside">
                    {costData.articleCosts
                      .flatMap((ac) => ac.missingPriceMaterials)
                      .filter((name, i, arr) => arr.indexOf(name) === i)
                      .map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Material status + actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {materialCheck.allAvailable ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                Materijali
              </CardTitle>
              <CardDescription>
                {materialCheck.allAvailable
                  ? "Svi materijali su dostupni"
                  : "Neki materijali nedostaju"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {(order.status === "draft" || order.status === "waiting_material" || order.status === "ready") && (
                <Button
                  onClick={handleRefreshMaterials}
                  disabled={refreshLoading}
                  variant="outline"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", refreshLoading && "animate-spin")} />
                  {refreshLoading ? "Ažuriranje..." : "Ažuriraj materijale"}
                </Button>
              )}
              {canGeneratePurchaseOrders && (
                <Button
                  onClick={handleGeneratePurchaseOrders}
                  disabled={actionLoading === "purchase"}
                  variant="outline"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {actionLoading === "purchase" ? "Generisanje..." : "Generiši naloge za nabavku"}
                </Button>
              )}
              {canGenerateWorkOrders && (
                <Button
                  onClick={handleGenerateWorkOrders}
                  disabled={actionLoading === "work"}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {actionLoading === "work" ? "Generisanje..." : "Pokreni proizvodnju"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {materialCheck.requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema zahtjeva za materijalima</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Materijal</TableHead>
                  <TableHead>Potrebno</TableHead>
                  <TableHead>Dostupno</TableHead>
                  <TableHead>Deficit</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialCheck.requirements.map((req) => (
                  <TableRow key={req.materialId}>
                    <TableCell className="font-medium">{req.materialName}</TableCell>
                    <TableCell>{req.requiredQuantity}</TableCell>
                    <TableCell>{req.availableQuantity}</TableCell>
                    <TableCell>{req.deficit > 0 ? req.deficit : "—"}</TableCell>
                    <TableCell>
                      {req.deficit > 0 ? (
                        <Badge variant="destructive">Nedostaje</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Purchase orders */}
      {order.purchaseOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Nalozi za nabavku
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Materijal</TableHead>
                  <TableHead>Količina</TableHead>
                  <TableHead>Dobavljač</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Primljeno</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.purchaseOrders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.material.name}</TableCell>
                    <TableCell>{po.requiredQuantity} {po.material.unit}</TableCell>
                    <TableCell>{po.supplier?.companyName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={po.status === "received" ? "secondary" : "outline"}>
                        {poStatusLabels[po.status] ?? po.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {po.receivedAt ? new Date(po.receivedAt).toLocaleDateString("bs") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Work orders by department */}
      {order.workOrders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Radni nalozi po odjelima
              </CardTitle>
              {order.workOrders.length > 0 && (
                <div className="flex gap-2">
                  {Object.keys(barcodes).length > 0 && (
                    <Button variant="outline" size="sm" onClick={handlePrintAllBarcodes}>
                      <Printer className="h-4 w-4 mr-2" />
                      Štampaj sve barkodove
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(workOrdersByDept).map(([deptName, wos]) => {
              const deptCompleted = wos.filter((w) => w.status === "completed").length;
              const deptTotal = wos.length;
              return (
                <div key={deptName} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{deptName}</h3>
                    <span className="text-sm text-muted-foreground">
                      {deptCompleted}/{deptTotal} završeno
                    </span>
                  </div>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[25%]">Dio</TableHead>
                        <TableHead className="w-[8%]">Stavka #</TableHead>
                        <TableHead className="w-[12%]">Status</TableHead>
                        <TableHead className="w-[22%]">Započeto</TableHead>
                        <TableHead className="w-[22%]">Završeno</TableHead>
                        <TableHead className="w-[11%]">Barkod</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wos.map((wo) => (
                        <TableRow key={wo.id}>
                          <TableCell className="font-medium">{wo.articlePart.partName}</TableCell>
                          <TableCell>{wo.itemIndex + 1}</TableCell>
                          <TableCell>
                            <Badge variant={woStatusVariant[wo.status] ?? "secondary"}>
                              {woStatusLabels[wo.status] ?? wo.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {wo.startedAt ? new Date(wo.startedAt).toLocaleString("bs") : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {wo.completedAt ? new Date(wo.completedAt).toLocaleString("bs") : "—"}
                          </TableCell>
                          <TableCell>
                            {barcodes[wo.id] ? (
                              <Button variant="ghost" size="sm" onClick={() => handlePrintSingleBarcode(wo.id)}>
                                <Printer className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Timeline view by parts */}
      {order.workOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline — Progres po dijelovima</CardTitle>
            <CardDescription>Pregled napretka proizvodnje za svaki dio artikla</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(workOrdersByPart).map(([partName, wos]) => {
              const partCompleted = wos.filter((w) => w.status === "completed").length;
              const partTotal = wos.length;
              const partPercent = partTotal > 0 ? Math.round((partCompleted / partTotal) * 100) : 0;
              return (
                <div key={partName} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{partName}</span>
                    <span className="text-muted-foreground">
                      {partCompleted}/{partTotal} ({partPercent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${partPercent}%` }}
                    />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {wos.map((wo) => (
                      <div
                        key={wo.id}
                        className={`h-6 w-6 rounded text-xs flex items-center justify-center ${
                          wo.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : wo.status === "in_progress"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                        title={`Stavka ${wo.itemIndex + 1}: ${woStatusLabels[wo.status] ?? wo.status}`}
                      >
                        {wo.itemIndex + 1}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
