"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
import { Calendar, Pencil, Trash2, Check, X } from "lucide-react";
import {
  getPurchaseHistoryAction,
  updatePurchaseHistoryAction,
  deletePurchaseHistoryAction,
  type PurchaseHistoryQuery,
} from "@/app/actions/get-purchase-history";
import type { MaterialPurchaseHistory } from "@/app/generated/prisma";

interface PurchaseHistoryProps {
  materialId: string;
}

type SortField = "purchaseDate" | "quantity" | "purchasePrice" | "totalValue";
type SortOrder = "asc" | "desc";

interface EditState {
  purchaseDate: string;
  quantity: string;
  purchasePrice: string;
  unit: string;
  supplierId: string;
}

export function PurchaseHistory({ materialId }: PurchaseHistoryProps) {
  const [data, setData] = useState<MaterialPurchaseHistory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const [sortBy, setSortBy] = useState<SortField>("purchaseDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ purchaseDate: "", quantity: "", purchasePrice: "", unit: "", supplierId: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSuppliers() {
      const result = await getPurchaseHistoryAction({ materialId, page: 1, pageSize: 1000 });
      if (result.success && result.data) {
        const uniqueSuppliers = new Map<string, string>();
        result.data.data.forEach((record: any) => {
          if (record.supplier) uniqueSuppliers.set(record.supplier.id, record.supplier.companyName);
        });
        setSuppliers(Array.from(uniqueSuppliers.entries()).map(([id, name]) => ({ id, name })));
      }
    }
    fetchSuppliers();
  }, [materialId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query: PurchaseHistoryQuery = { materialId, page, pageSize, sortBy, sortOrder };
    if (dateFrom) query.dateFrom = dateFrom;
    if (dateTo) query.dateTo = dateTo;
    if (supplierId) query.supplierId = supplierId;

    const result = await getPurchaseHistoryAction(query);
    if (result.success && result.data) {
      setData(result.data.data);
      setTotal(result.data.total);
    } else {
      setError(result.success ? "No data returned" : result.error);
    }
    setLoading(false);
  }, [materialId, page, pageSize, dateFrom, dateTo, supplierId, sortBy, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const handleFilterChange = () => setPage(1);

  const startEdit = (record: any) => {
    const d = new Date(record.purchaseDate);
    setEditingId(record.id);
    setEditState({
      purchaseDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      quantity: String(record.quantity),
      purchasePrice: String(record.purchasePrice),
      unit: record.unit,
      supplierId: record.supplierId ?? "",
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const result = await updatePurchaseHistoryAction(editingId, {
      purchaseDate: editState.purchaseDate,
      supplierId: editState.supplierId || null,
      quantity: parseFloat(editState.quantity),
      purchasePrice: parseFloat(editState.purchasePrice),
      unit: editState.unit,
    });
    setSaving(false);
    if (result.success) {
      setEditingId(null);
      fetchData();
    } else {
      setError(result.error);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deletePurchaseHistoryAction(id);
    if (result.success) {
      fetchData();
    } else {
      setError(result.error);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading && data.length === 0) {
    return <div className="text-center py-8">Učitavanje...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-destructive">Greška: {error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="dateFrom" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Datum od
          </Label>
          <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); handleFilterChange(); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateTo" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Datum do
          </Label>
          <Input id="dateTo" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); handleFilterChange(); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier">Dobavljač</Label>
          <Select value={supplierId || "all"} onValueChange={(value) => { setSupplierId(value === "all" ? "" : value); handleFilterChange(); }}>
            <SelectTrigger id="supplier"><SelectValue placeholder="Svi dobavljači" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi dobavljači</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pageSize">Stavki po stranici</Label>
          <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
            <SelectTrigger id="pageSize"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleSort("purchaseDate")}>
                  Datum{sortBy === "purchaseDate" && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </Button>
              </TableHead>
              <TableHead>Dobavljač</TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleSort("quantity")}>
                  Količina{sortBy === "quantity" && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </Button>
              </TableHead>
              <TableHead>Jedinica</TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleSort("purchasePrice")}>
                  Nabavna cijena{sortBy === "purchasePrice" && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleSort("totalValue")}>
                  Ukupna vrijednost{sortBy === "totalValue" && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </Button>
              </TableHead>
              <TableHead className="w-20">Akcije</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">Nema podataka o nabavkama</TableCell>
              </TableRow>
            ) : (
              data.map((record: any) => {
                const isEditing = editingId === record.id;

                if (isEditing) {
                  return (
                    <TableRow key={record.id} className="bg-muted/50">
                      <TableCell>
                        <Input type="date" value={editState.purchaseDate} onChange={(e) => setEditState((s) => ({ ...s, purchaseDate: e.target.value }))} className="w-36 h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Select value={editState.supplierId || "none"} onValueChange={(v) => setEditState((s) => ({ ...s, supplierId: v === "none" ? "" : v }))}>
                          <SelectTrigger className="h-8 text-sm w-48"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={editState.quantity} onChange={(e) => setEditState((s) => ({ ...s, quantity: e.target.value }))} className="w-24 h-8 text-sm text-right" />
                      </TableCell>
                      <TableCell>
                        <Input value={editState.unit} onChange={(e) => setEditState((s) => ({ ...s, unit: e.target.value }))} className="w-16 h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={editState.purchasePrice} onChange={(e) => setEditState((s) => ({ ...s, purchasePrice: e.target.value }))} className="w-28 h-8 text-sm text-right" />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {(parseFloat(editState.quantity || "0") * parseFloat(editState.purchasePrice || "0")).toFixed(2)} BAM
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit} disabled={saving}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} disabled={saving}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={record.id}>
                    <TableCell>
                      {new Date(record.purchaseDate).toLocaleDateString("bs", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </TableCell>
                    <TableCell>{record.supplier?.companyName || "—"}</TableCell>
                    <TableCell className="text-right">{record.quantity.toFixed(2)}</TableCell>
                    <TableCell>{record.unit}</TableCell>
                    <TableCell className="text-right">{record.purchasePrice.toFixed(2)} BAM</TableCell>
                    <TableCell className="text-right">{record.totalValue.toFixed(2)} BAM</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(record)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Obrisati nabavku?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ova akcija se ne može poništiti. Zapis o nabavci će biti trajno obrisan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Odustani</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(record.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Obriši
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Ukupno {total} nabavki</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>Prethodna</Button>
            <span className="text-sm text-muted-foreground">Stranica {page} od {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Sljedeća</Button>
          </div>
        </div>
      )}
    </div>
  );
}
