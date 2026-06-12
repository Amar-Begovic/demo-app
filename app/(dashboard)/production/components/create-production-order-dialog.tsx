"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash2, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
import { createProductionOrder, autoCreateMissingEntities } from "@/app/actions/production-orders";
import { parseProductionOrderExcel, mapParsedItemsToOrderItems, type ImportWarning } from "@/lib/services/production-order-excel-parser";

interface Article {
  id: string;
  name: string;
  code?: string | null;
}

interface Fabric {
  id: string;
  name: string;
  color?: string | null;
  code?: string | null;
}

interface OrderItem {
  articleId: string;
  quantity: number;
  fabricId: string;
  ruckaId: string;
  paspulId: string;
  nogice1Id: string;
  nogice2Id: string;
  withLegs: boolean;
  deliveryDeadline: string;
  priority: string;
  notes: string;
  customerOrderNumber: string;
  loadingNumber: string;
  loadingSequence: number | null;
  serialNumber: string;
  step: string;
}

interface Partner {
  id: string;
  companyName: string;
  city?: string | null;
  phone?: string | null;
  address?: string | null;
}

interface CategoryItem {
  id: string;
  name: string;
}

interface CreateProductionOrderDialogProps {
  articles: Article[];
  fabrics?: Fabric[];
  partners?: Partner[];
  rucke?: CategoryItem[];
  paspuli?: CategoryItem[];
  nogice?: CategoryItem[];
}

const EMPTY_ITEM: OrderItem = {
  articleId: "",
  quantity: 1,
  fabricId: "",
  ruckaId: "",
  paspulId: "",
  nogice1Id: "",
  nogice2Id: "",
  withLegs: false,
  deliveryDeadline: "",
  priority: "normal",
  notes: "",
  customerOrderNumber: "",
  loadingNumber: "",
  loadingSequence: null,
  serialNumber: "",
  step: "",
};

export function CreateProductionOrderDialog({ articles, fabrics = [], partners = [], rucke = [], paspuli = [], nogice = [] }: CreateProductionOrderDialogProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([{ ...EMPTY_ITEM }]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  const [importSummary, setImportSummary] = useState<{ total: number; warnings: number } | null>(null);
  const [autoCreatedItems, setAutoCreatedItems] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setItems([{ ...EMPTY_ITEM }]);
    setCustomerName("");
    setCustomerPhone("");
    setDocumentNumber("");
    setDeliveryLocation("");
    setReceivedBy("");
    setError(null);
    setExpandedItems(new Set());
    setImportWarnings([]);
    setImportSummary(null);
    setAutoCreatedItems(new Set());
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setExpandedItems((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
    setAutoCreatedItems((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  }

  function updateItem(index: number, field: keyof OrderItem, value: string | number | boolean) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
    // Clear auto-created highlight when user manually edits
    setAutoCreatedItems((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }

  function toggleExpanded(index: number) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so same file can be re-selected
    e.target.value = "";

    // Validate format
    if (!file.name.endsWith(".xlsx")) {
      setError("Molimo uploadujte datoteku u .xlsx formatu");
      return;
    }

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Datoteka je prevelika. Maksimalna veličina je 10MB");
      return;
    }

    setImporting(true);
    setError(null);
    setImportWarnings([]);
    setImportSummary(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseProductionOrderExcel(buffer);

      // First pass: map with current articles/fabrics to find what's missing
      let currentArticles = [...articles];
      let currentFabrics = [...fabrics];
      const categoryItemsForImport = { rucke, paspuli, nogice };
      let { mappedItems, warnings } = mapParsedItemsToOrderItems(parsed.items, currentArticles, currentFabrics, categoryItemsForImport);

      // Auto-create missing articles and fabrics
      const unknownArticles = warnings
        .filter((w) => w.type === "unknown_article" && w.code)
        .reduce((acc, w) => {
          if (!acc.some((a) => a.code.toLowerCase() === w.code!.toLowerCase())) {
            acc.push({ code: w.code!, name: w.name });
          }
          return acc;
        }, [] as Array<{ code: string; name: string | null }>);

      const unknownFabrics = warnings
        .filter((w) => w.type === "unknown_fabric" && w.code)
        .reduce((acc, w) => {
          if (!acc.some((f) => f.code.toLowerCase() === w.code!.toLowerCase())) {
            acc.push({ code: w.code!, name: w.name });
          }
          return acc;
        }, [] as Array<{ code: string; name: string | null }>);

      if (unknownArticles.length > 0 || unknownFabrics.length > 0) {
        const result = await autoCreateMissingEntities({
          articles: unknownArticles,
          fabrics: unknownFabrics,
        });

        if (result.success && result.data) {
          // Track auto-created entity IDs to highlight affected items
          const autoCreatedArticleIds = new Set(result.data.createdArticles.map((a) => a.id));
          const autoCreatedFabricIds = new Set(result.data.createdFabrics.map((f) => f.id));

          // Merge newly created entities into the lists and re-map
          currentArticles = [
            ...currentArticles,
            ...result.data.createdArticles.map((a) => ({ id: a.id, name: a.name, code: a.code })),
          ];
          currentFabrics = [
            ...currentFabrics,
            ...result.data.createdFabrics.map((f) => ({ id: f.id, name: f.name, code: f.code })),
          ];

          // Re-map with the expanded lists
          const remap = mapParsedItemsToOrderItems(parsed.items, currentArticles, currentFabrics, categoryItemsForImport);
          mappedItems = remap.mappedItems;
          warnings = remap.warnings;

          // Mark items that use auto-created articles or fabrics
          const highlighted = new Set<number>();
          mappedItems.forEach((item, idx) => {
            if (autoCreatedArticleIds.has(item.articleId) || autoCreatedFabricIds.has(item.fabricId)) {
              highlighted.add(idx);
            }
          });
          setAutoCreatedItems(highlighted);
        }
      } else {
        setAutoCreatedItems(new Set());
      }

      // Populate header fields only if currently empty
      if (!customerName && parsed.header.customerName) {
        setCustomerName(parsed.header.customerName);
      }
      if (!deliveryLocation && parsed.header.deliveryLocation) {
        setDeliveryLocation(parsed.header.deliveryLocation);
      }
      if (!documentNumber && parsed.header.orderNumber) {
        setDocumentNumber(parsed.header.orderNumber);
      }

      // Replace existing items with mapped items
      setItems(mappedItems.length > 0 ? mappedItems.map((item) => ({ ...EMPTY_ITEM, ...item })) : [{ ...EMPTY_ITEM }]);
      setImportWarnings(warnings);
      setImportSummary({ total: mappedItems.length, warnings: warnings.length });
      setExpandedItems(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri čitanju Excel datoteke");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((item) => item.articleId !== "");
    if (validItems.length === 0) {
      setError("Morate dodati barem jednu stavku sa odabranim artiklom.");
      return;
    }

    setSaving(true);

    try {
      const result = await createProductionOrder({
        items: validItems.map((item) => ({
          articleId: item.articleId,
          quantity: Number(item.quantity),
          fabricId: item.fabricId || undefined,
          ruckaId: item.ruckaId || undefined,
          paspulId: item.paspulId || undefined,
          nogice1Id: item.nogice1Id || undefined,
          nogice2Id: item.nogice2Id || undefined,
          withLegs: item.withLegs,
          deliveryDeadline: item.deliveryDeadline ? new Date(item.deliveryDeadline) : undefined,
          priority: (item.priority as "urgent" | "normal" | "low") || undefined,
          notes: item.notes || undefined,
          customerOrderNumber: item.customerOrderNumber || "",
          loadingNumber: item.loadingNumber || undefined,
          loadingSequence: item.loadingSequence ?? undefined,
          serialNumber: item.serialNumber || undefined,
          step: item.step || undefined,
        })),
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        documentNumber: documentNumber || undefined,
        deliveryLocation: deliveryLocation || undefined,
        receivedBy: receivedBy || undefined,
      });

      if (!result.success) {
        setError(result.error ?? "Greška pri kreiranju naloga");
        return;
      }

      setDialogOpen(false);
      router.refresh();
    } catch {
      setError("Greška pri kreiranju naloga");
    } finally {
      setSaving(false);
    }
  }

  const hasValidItem = items.some((item) => item.articleId !== "");

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novi nalog
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden flex-1">
          <DialogHeader>
            <DialogTitle>Novi proizvodni nalog</DialogTitle>
            <DialogDescription>
              Dodajte artikle i količine za proizvodnju. Sistem će automatski provjeriti dostupnost materijala.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 min-h-0 pr-1">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Customer / Partner selection */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                Kupac
              </label>
              {partners.length > 0 ? (
                <SearchableSelect
                  options={partners.map((p) => ({
                    value: p.id,
                    label: p.city ? `${p.companyName} — ${p.city}` : p.companyName,
                  }))}
                  value={partners.find((p) => p.companyName === customerName)?.id ?? ""}
                  onValueChange={(partnerId) => {
                    const partner = partners.find((p) => p.id === partnerId);
                    if (partner) {
                      setCustomerName(partner.companyName);
                      if (partner.phone && !customerPhone) setCustomerPhone(partner.phone);
                      if (partner.address && !deliveryLocation) setDeliveryLocation(partner.address);
                    }
                  }}
                  placeholder="Odaberite kupca"
                  searchPlaceholder="Pretraži kupce..."
                  emptyText="Nema kupaca."
                />
              ) : (
                <Input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Naziv kupca (opcionalno)"
                />
              )}
            </div>

            {/* Customer phone & Document number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="po-phone" className="text-sm font-medium">
                  Telefon
                </label>
                <Input
                  id="po-phone"
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Telefon kupca (opcionalno)"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="po-doc-number" className="text-sm font-medium">
                  Broj dokumenta
                </label>
                <Input
                  id="po-doc-number"
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="npr. 6316/2936 (opcionalno)"
                />
              </div>
            </div>

            {/* Delivery location & Received by */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="po-delivery-loc" className="text-sm font-medium">
                  Mjesto isporuke
                </label>
                <Input
                  id="po-delivery-loc"
                  type="text"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  placeholder="Mjesto isporuke (opcionalno)"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="po-received-by" className="text-sm font-medium">
                  Narudžbu primio
                </label>
                <Input
                  id="po-received-by"
                  type="text"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Ime osobe (opcionalno)"
                />
              </div>
            </div>

            {/* Items section */}
            <div className="grid gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileImport}
                className="hidden"
                aria-label="Uvezi Excel datoteku"
              />
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Stavke naloga</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  {importing ? "Učitavanje..." : "Uvezi iz Excela"}
                </Button>
              </div>
              {importSummary && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
                  <p>Uvezeno {importSummary.total} stavki{importSummary.warnings > 0 ? `, ${importSummary.warnings} upozorenja` : ""}.</p>
                </div>
              )}
              {importWarnings.length > 0 && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm space-y-1 dark:border-yellow-800 dark:bg-yellow-950 max-h-40 overflow-y-auto">
                  <p className="font-medium sticky top-0 bg-yellow-50 dark:bg-yellow-950 pb-1">Upozorenja:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {(() => {
                      // Group warnings by type+code to avoid repeating the same warning 40 times
                      const grouped = new Map<string, { warning: typeof importWarnings[0]; rows: number[] }>();
                      for (const w of importWarnings) {
                        const key = `${w.type}:${w.code}`;
                        const existing = grouped.get(key);
                        if (existing) {
                          existing.rows.push(w.rowNumber);
                        } else {
                          grouped.set(key, { warning: w, rows: [w.rowNumber] });
                        }
                      }
                      return Array.from(grouped.values()).map(({ warning, rows }, i) => (
                        <li key={i} className="text-yellow-800 dark:text-yellow-200">
                          {warning.message}
                          {rows.length > 1
                            ? ` (${rows.length}x — redovi ${rows[0]}–${rows[rows.length - 1]})`
                            : ` (red ${rows[0]})`}
                        </li>
                      ));
                    })()}
                  </ul>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((i) => i.withLegs)}
                  onChange={(e) => setItems((prev) => prev.map((i) => ({ ...i, withLegs: e.target.checked })))}
                />
                Nogice za sve stavke
              </label>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className={`rounded-md border p-3 space-y-2 ${autoCreatedItems.has(index) ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30" : ""}`}>
                    <div className="flex items-center gap-2">
                      <SearchableSelect
                        options={articles.map((a) => ({ value: a.id, label: a.name }))}
                        value={item.articleId}
                        onValueChange={(val) => updateItem(index, "articleId", val)}
                        placeholder="Odaberite artikal"
                        searchPlaceholder="Pretraži artikle..."
                        emptyText="Nema artikala."
                        className="flex-1"
                      />
                      {fabrics.length > 0 && (
                        <SearchableSelect
                          options={fabrics.map((f) => ({ value: f.id, label: f.name, color: f.color }))}
                          value={item.fabricId}
                          onValueChange={(val) => updateItem(index, "fabricId", val)}
                          placeholder="Stof"
                          searchPlaceholder="Pretraži štofove..."
                          emptyText="Nema štofova."
                          className="w-48"
                        />
                      )}
                      <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={item.withLegs}
                          onChange={(e) => updateItem(index, "withLegs", e.target.checked)}
                        />
                        Nogice
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, "quantity", parseInt(e.target.value) || 1)
                        }
                        className="w-24"
                        placeholder="Kol."
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExpanded(index)}
                        className="shrink-0"
                        aria-label={expandedItems.has(index) ? "Sakrij detalje" : "Prikaži detalje"}
                      >
                        {expandedItems.has(index) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                          className="shrink-0"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>

                    {/* Category item selections */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <SearchableSelect
                        options={rucke.map((r) => ({ value: r.id, label: r.name }))}
                        value={item.ruckaId}
                        onValueChange={(val) => updateItem(index, "ruckaId", val === item.ruckaId ? "" : val)}
                        placeholder="Ručka"
                        searchPlaceholder="Pretraži ručke..."
                        emptyText="Nema dostupnih ručki."
                        className="w-40"
                      />
                      <SearchableSelect
                        options={paspuli.map((p) => ({ value: p.id, label: p.name }))}
                        value={item.paspulId}
                        onValueChange={(val) => updateItem(index, "paspulId", val === item.paspulId ? "" : val)}
                        placeholder="Paspul"
                        searchPlaceholder="Pretraži paspule..."
                        emptyText="Nema dostupnih paspula."
                        className="w-40"
                      />
                      <SearchableSelect
                        options={nogice.map((n) => ({ value: n.id, label: n.name }))}
                        value={item.nogice1Id}
                        onValueChange={(val) => updateItem(index, "nogice1Id", val === item.nogice1Id ? "" : val)}
                        placeholder="Nogice 1"
                        searchPlaceholder="Pretraži nogice..."
                        emptyText="Nema dostupnih nogica."
                        className="w-40"
                      />
                      <SearchableSelect
                        options={nogice.map((n) => ({ value: n.id, label: n.name }))}
                        value={item.nogice2Id}
                        onValueChange={(val) => updateItem(index, "nogice2Id", val === item.nogice2Id ? "" : val)}
                        placeholder="Nogice 2"
                        searchPlaceholder="Pretraži nogice..."
                        emptyText="Nema dostupnih nogica."
                        className="w-40"
                      />
                    </div>

                    {/* Expandable per-item details */}
                    {expandedItems.has(index) && (
                      <div className="grid gap-3 pt-2 border-t">
                        {/* Row 1: Deadline + Priority */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">
                              Rok isporuke
                            </label>
                            <Input
                              type="date"
                              value={item.deliveryDeadline}
                              onChange={(e) => updateItem(index, "deliveryDeadline", e.target.value)}
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">
                              Prioritet
                            </label>
                            <Select
                              value={item.priority}
                              onValueChange={(val) => updateItem(index, "priority", val)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="urgent">Hitan</SelectItem>
                                <SelectItem value="normal">Normalan</SelectItem>
                                <SelectItem value="low">Nizak</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {/* Row 2: Notes + Customer order number */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">
                              Bilješke
                            </label>
                            <textarea
                              value={item.notes}
                              onChange={(e) => updateItem(index, "notes", e.target.value)}
                              placeholder="Posebne upute (opcionalno)"
                              rows={2}
                              className="flex min-h-[40px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">
                              Serijski broj kupca
                            </label>
                            <Input
                              type="text"
                              value={item.customerOrderNumber}
                              onChange={(e) => updateItem(index, "customerOrderNumber", e.target.value)}
                              placeholder="Referentni broj (opcionalno)"
                            />
                          </div>
                        </div>
                        {/* Row 3: Loading number + Štep */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">
                              Br. utovara
                            </label>
                            <Input
                              type="text"
                              value={item.loadingNumber}
                              onChange={(e) => updateItem(index, "loadingNumber", e.target.value)}
                              placeholder="npr. U-1, U-2 (opcionalno)"
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">
                              Štep
                            </label>
                            <Input
                              type="text"
                              value={item.step}
                              onChange={(e) => updateItem(index, "step", e.target.value)}
                              placeholder="Uzorak štepanja (opcionalno)"
                              maxLength={200}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                className="w-fit"
              >
                <Plus className="h-4 w-4 mr-1" />
                Dodaj artikal
              </Button>
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-2">
            <Button type="submit" disabled={saving || !hasValidItem}>
              {saving ? "Kreiranje..." : "Kreiraj nalog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
