"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, FileSpreadsheet } from "lucide-react";
import { getEditableFields } from "@/lib/utils/production-order-fields";
import { updateProductionOrder, autoCreateMissingEntities } from "@/app/actions/production-orders";
import { parseProductionOrderExcel, mapParsedItemsToOrderItems, type ImportWarning } from "@/lib/services/production-order-excel-parser";
import type { OrderPriority } from "@/app/generated/prisma";

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

interface OrderItem {
  id: string;
  articleId: string;
  quantity: number;
  fabricId?: string | null;
  ruckaId?: string | null;
  paspulId?: string | null;
  nogice1Id?: string | null;
  nogice2Id?: string | null;
  withLegs: boolean;
  deliveryDeadline?: string | null;
  priority: string;
  notes?: string | null;
  customerOrderNumber?: string | null;
  loadingNumber?: string | null;
  loadingSequence?: number | null;
  serialNumber?: string | null;
  step?: string | null;
  article: { id: string; name: string };
  fabric?: { id: string; name: string } | null;
  rucka?: { id: string; name: string } | null;
  paspul?: { id: string; name: string } | null;
  nogice1?: { id: string; name: string } | null;
  nogice2?: { id: string; name: string } | null;
}

interface ProductionOrderWithItems {
  id: string;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  documentNumber?: string | null;
  deliveryLocation?: string | null;
  receivedBy?: string | null;
  items: OrderItem[];
}

interface EditProductionOrderViewProps {
  order: ProductionOrderWithItems;
  articles: Article[];
  fabrics: Fabric[];
  partners: Partner[];
  rucke: CategoryItem[];
  paspuli: CategoryItem[];
  nogice: CategoryItem[];
}

interface EditFormItem {
  id?: string;
  tempId?: string;
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

function orderItemToFormItem(item: OrderItem): EditFormItem {
  return {
    id: item.id,
    articleId: item.articleId,
    quantity: item.quantity,
    fabricId: item.fabricId ?? "",
    ruckaId: item.ruckaId ?? "",
    paspulId: item.paspulId ?? "",
    nogice1Id: item.nogice1Id ?? "",
    nogice2Id: item.nogice2Id ?? "",
    withLegs: item.withLegs,
    deliveryDeadline: item.deliveryDeadline ?? "",
    priority: item.priority ?? "normal",
    notes: item.notes ?? "",
    customerOrderNumber: item.customerOrderNumber ?? "",
    loadingNumber: item.loadingNumber ?? "",
    loadingSequence: item.loadingSequence ?? null,
    serialNumber: item.serialNumber ?? "",
    step: item.step ?? "",
  };
}

export function EditProductionOrderView({
  order,
  articles,
  fabrics,
  partners,
  rucke,
  paspuli,
  nogice,
}: EditProductionOrderViewProps) {
  const editableFields = getEditableFields(order.status);

  // Order-level fields are editable when item-level fields like articleId are editable
  // (i.e., draft and waiting_material statuses)
  const orderFieldsEditable = editableFields.articleId;

  // Add/delete items is allowed in draft, waiting_material, ready, and in_progress
  const canAddDeleteItems = order.status !== "completed";

  // Order-level form state
  const [customerName, setCustomerName] = useState(order.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone ?? "");
  const [documentNumber, setDocumentNumber] = useState(order.documentNumber ?? "");
  const [deliveryLocation, setDeliveryLocation] = useState(order.deliveryLocation ?? "");
  const [receivedBy, setReceivedBy] = useState(order.receivedBy ?? "");

  // Items form state
  const [items, setItems] = useState<EditFormItem[]>(
    order.items.map(orderItemToFormItem)
  );

  // Tracked removals
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);



  // Save-related state
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Excel import state
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  const [importSummary, setImportSummary] = useState<{ total: number; warnings: number } | null>(null);
  const [autoCreatedItems, setAutoCreatedItems] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Whether the save button should be visible:
  // Hidden for completed (nothing editable), shown otherwise
  const showSaveButton = order.status !== "completed";

  // Find the partner matching the current customerName
  const matchedPartnerId =
    partners.find((p) => p.companyName === customerName)?.id ?? "";

  function updateItem(index: number, field: keyof EditFormItem, value: string | number | boolean | null) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
    // Remove auto-created highlight when user edits a field on the item
    if (autoCreatedItems.has(index)) {
      setAutoCreatedItems((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }



  function addItem() {
    const newItem: EditFormItem = {
      tempId: crypto.randomUUID(),
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
    setItems((prev) => [...prev, newItem]);
  }

  function removeItem(index: number) {
    const item = items[index];
    // If the item has a persisted id, track it for deletion on save
    if (item.id) {
      setDeletedItemIds((prev) => [...prev, item.id!]);
    }
    // Remove from local items state
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so same file can be re-selected
    e.target.value = "";

    // Validate format
    if (!file.name.endsWith(".xlsx")) {
      setValidationError("Molimo uploadujte datoteku u .xlsx formatu");
      return;
    }

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setValidationError("Datoteka je prevelika. Maksimalna veličina je 10MB");
      return;
    }

    setImporting(true);
    setValidationError(null);
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
          // Offset by existing items count since we're appending
          const existingCount = items.length;
          const highlighted = new Set<number>();
          mappedItems.forEach((item, idx) => {
            if (autoCreatedArticleIds.has(item.articleId) || autoCreatedFabricIds.has(item.fabricId)) {
              highlighted.add(existingCount + idx);
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

      // Convert mapped items to EditFormItem format and APPEND to existing items
      const newFormItems: EditFormItem[] = mappedItems.map((item) => ({
        tempId: crypto.randomUUID(),
        articleId: item.articleId || "",
        quantity: item.quantity || 1,
        fabricId: item.fabricId || "",
        ruckaId: item.ruckaId || "",
        paspulId: item.paspulId || "",
        nogice1Id: item.nogice1Id || "",
        nogice2Id: item.nogice2Id || "",
        withLegs: item.withLegs || false,
        deliveryDeadline: item.deliveryDeadline || "",
        priority: item.priority || "normal",
        notes: item.notes || "",
        customerOrderNumber: item.customerOrderNumber || "",
        loadingNumber: item.loadingNumber || "",
        loadingSequence: item.loadingSequence ?? null,
        serialNumber: item.serialNumber || "",
        step: item.step || "",
      }));

      // Append to existing items (preserve existing)
      setItems((prev) => [...prev, ...newFormItems]);
      setImportWarnings(warnings);
      setImportSummary({ total: newFormItems.length, warnings: warnings.length });
    } catch {
      setValidationError("Greška pri čitanju Excel datoteke");
    } finally {
      setImporting(false);
    }
  }

  // Helper to get display name for read-only fields
  function getArticleName(articleId: string): string {
    return articles.find((a) => a.id === articleId)?.name ?? "—";
  }

  function getFabricName(fabricId: string): string {
    if (!fabricId) return "—";
    return fabrics.find((f) => f.id === fabricId)?.name ?? "—";
  }

  function getCategoryName(items: CategoryItem[], id: string): string {
    if (!id) return "—";
    return items.find((item) => item.id === id)?.name ?? "—";
  }

  function getPriorityLabel(priority: string): string {
    switch (priority) {
      case "urgent":
        return "Hitan";
      case "high":
        return "Visok";
      case "normal":
        return "Normalan";
      case "low":
        return "Nizak";
      default:
        return priority || "—";
    }
  }

  async function handleSave() {
    // Clear previous messages
    setValidationError(null);
    setSuccessMessage(null);

    // Client-side validation
    const hasArticle = items.some((i) => i.articleId);
    if (!hasArticle) {
      setValidationError("Barem jedna stavka mora imati odabran artikal");
      return;
    }

    const invalidQuantity = items.find(
      (i) => i.articleId && i.quantity < 1
    );
    if (invalidQuantity) {
      setValidationError("Količina mora biti najmanje 1");
      return;
    }

    // Check that all new items have an articleId selected
    const newItemsMissingArticle = items.filter((i) => !i.id && i.tempId && !i.articleId);
    if (newItemsMissingArticle.length > 0) {
      setValidationError(`${newItemsMissingArticle.length} nova stavka nema odabran artikal. Odaberite artikal za sve nove stavke.`);
      return;
    }

    setIsSaving(true);

    // Save a backup of items and deletedItemIds in case of failure
    const itemsBackup = [...items];
    const deletedIdsBackup = [...deletedItemIds];

    try {
      const payload = {
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        documentNumber: documentNumber || null,
        deliveryLocation: deliveryLocation || null,
        receivedBy: receivedBy || null,
        items: items
          .filter((i) => i.id)
          .map((i) => ({
            id: i.id!,
            articleId: i.articleId,
            quantity: i.quantity,
            fabricId: i.fabricId || null,
            ruckaId: i.ruckaId || null,
            paspulId: i.paspulId || null,
            nogice1Id: i.nogice1Id || null,
            nogice2Id: i.nogice2Id || null,
            withLegs: i.withLegs,
            deliveryDeadline: i.deliveryDeadline
              ? new Date(i.deliveryDeadline)
              : null,
            priority: i.priority as OrderPriority,
            notes: i.notes || null,
            customerOrderNumber: i.customerOrderNumber || "",
            loadingNumber: i.loadingNumber || null,
            loadingSequence: i.loadingSequence,
            serialNumber: i.serialNumber || null,
            step: i.step || null,
          })),
        newItems: items
          .filter((i) => !i.id && i.tempId)
          .map((i) => ({
            articleId: i.articleId,
            quantity: i.quantity,
            fabricId: i.fabricId || null,
            ruckaId: i.ruckaId || null,
            paspulId: i.paspulId || null,
            nogice1Id: i.nogice1Id || null,
            nogice2Id: i.nogice2Id || null,
            withLegs: i.withLegs,
            deliveryDeadline: i.deliveryDeadline
              ? new Date(i.deliveryDeadline)
              : null,
            priority: i.priority as OrderPriority,
            notes: i.notes || null,
            customerOrderNumber: i.customerOrderNumber || "",
            loadingNumber: i.loadingNumber || null,
            loadingSequence: i.loadingSequence,
            serialNumber: i.serialNumber || null,
            step: i.step || null,
          })),
        deleteItemIds: deletedItemIds,
      };

      const result = await updateProductionOrder(order.id, payload);

      if (result.success && result.data) {
        // Success: update local state with saved values
        const savedItems = (result.data.items as unknown as OrderItem[]).map(
          (item) => orderItemToFormItem(item)
        );
        setItems(savedItems);
        setDeletedItemIds([]);
        setSuccessMessage("Promjene su spremljene");

        // Auto-clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        // Failure: display error, preserve form, restore removed items
        setValidationError(
          result.error || "Greška pri spremanju. Pokušajte ponovo."
        );

        // Restore removed items if any were pending deletion
        if (deletedIdsBackup.length > 0) {
          setItems(itemsBackup);
          setDeletedItemIds(deletedIdsBackup);
        }
      }
    } catch {
      setValidationError("Greška pri spremanju. Pokušajte ponovo.");

      // Restore state on network/unexpected error
      if (deletedIdsBackup.length > 0) {
        setItems(itemsBackup);
        setDeletedItemIds(deletedIdsBackup);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Order-level fields */}
      <div className="space-y-4">
        {/* Customer / Partner selection */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">Kupac</label>
          {orderFieldsEditable ? (
            partners.length > 0 ? (
              <SearchableSelect
                options={partners.map((p) => ({
                  value: p.id,
                  label: p.city
                    ? `${p.companyName} — ${p.city}`
                    : p.companyName,
                }))}
                value={matchedPartnerId}
                onValueChange={(partnerId) => {
                  const partner = partners.find((p) => p.id === partnerId);
                  if (partner) {
                    setCustomerName(partner.companyName);
                    if (partner.phone && !customerPhone)
                      setCustomerPhone(partner.phone);
                    if (partner.address && !deliveryLocation)
                      setDeliveryLocation(partner.address);
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
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              {customerName || "—"}
            </p>
          )}
        </div>

        {/* Customer phone & Document number */}
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Telefon</label>
            {orderFieldsEditable ? (
              <Input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Telefon kupca (opcionalno)"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {customerPhone || "—"}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Broj dokumenta</label>
            {orderFieldsEditable ? (
              <Input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="npr. 6316/2936 (opcionalno)"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {documentNumber || "—"}
              </p>
            )}
          </div>
        </div>

        {/* Delivery location & Received by */}
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Mjesto isporuke</label>
            {orderFieldsEditable ? (
              <Input
                type="text"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                placeholder="Mjesto isporuke (opcionalno)"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {deliveryLocation || "—"}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Narudžbu primio</label>
            {orderFieldsEditable ? (
              <Input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Ime osobe (opcionalno)"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {receivedBy || "—"}
              </p>
            )}
          </div>
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
          {editableFields.articleId && (
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
          )}
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
                // Group warnings by type+code to avoid repeating the same warning many times
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
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id ?? item.tempId ?? index} className={`rounded-md border p-3 space-y-2 ${!item.id ? "border-l-4 border-l-blue-400 bg-blue-50/30" : ""} ${autoCreatedItems.has(index) ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30" : ""}`}>
              {/* Primary row: article, fabric, withLegs, quantity, ručka, paspul, nogice1, nogice2, delete */}
              <div className="flex items-center gap-2 flex-wrap">
                {(editableFields.articleId || (!item.id && item.tempId)) ? (
                  <SearchableSelect
                    options={articles.map((a) => ({ value: a.id, label: a.name }))}
                    value={item.articleId}
                    onValueChange={(val) => updateItem(index, "articleId", val)}
                    placeholder="Artikal"
                    searchPlaceholder="Pretraži artikle..."
                    emptyText="Nema artikala."
                    className="min-w-[160px] flex-1"
                  />
                ) : (
                  <span className="min-w-[160px] flex-1 text-sm">{getArticleName(item.articleId)}</span>
                )}

                {editableFields.fabricId ? (
                  fabrics.length > 0 && (
                    <SearchableSelect
                      options={fabrics.map((f) => ({ value: f.id, label: f.name, color: f.color }))}
                      value={item.fabricId}
                      onValueChange={(val) => updateItem(index, "fabricId", val)}
                      placeholder="Stof"
                      searchPlaceholder="Pretraži štofove..."
                      emptyText="Nema štofova."
                      className="w-36"
                    />
                  )
                ) : (
                  <span className="w-36 text-sm text-muted-foreground">{getFabricName(item.fabricId)}</span>
                )}

                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <Checkbox
                    checked={item.withLegs}
                    onCheckedChange={(checked) =>
                      updateItem(index, "withLegs", checked === true)
                    }
                    disabled={!editableFields.articleId && !(!item.id && item.tempId)}
                  />
                  Nog.
                </label>

                {(editableFields.quantity || (!item.id && item.tempId)) ? (
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, "quantity", parseInt(e.target.value) || 1)
                    }
                    className="w-20"
                    placeholder="Kol."
                  />
                ) : (
                  <span className="w-20 text-sm text-muted-foreground">{item.quantity}</span>
                )}

                {editableFields.ruckaId ? (
                  <SearchableSelect
                    options={rucke.map((r) => ({ value: r.id, label: r.name }))}
                    value={item.ruckaId}
                    onValueChange={(val) => updateItem(index, "ruckaId", val === item.ruckaId ? "" : val)}
                    placeholder="Ručka"
                    searchPlaceholder="Pretraži ručke..."
                    emptyText="Nema ručki."
                    className="w-32"
                  />
                ) : (
                  <span className="w-32 text-sm text-muted-foreground">{getCategoryName(rucke, item.ruckaId)}</span>
                )}

                {editableFields.paspulId ? (
                  <SearchableSelect
                    options={paspuli.map((p) => ({ value: p.id, label: p.name }))}
                    value={item.paspulId}
                    onValueChange={(val) => updateItem(index, "paspulId", val === item.paspulId ? "" : val)}
                    placeholder="Paspul"
                    searchPlaceholder="Pretraži paspule..."
                    emptyText="Nema paspula."
                    className="w-32"
                  />
                ) : (
                  <span className="w-32 text-sm text-muted-foreground">{getCategoryName(paspuli, item.paspulId)}</span>
                )}

                {editableFields.nogice1Id ? (
                  <SearchableSelect
                    options={nogice.map((n) => ({ value: n.id, label: n.name }))}
                    value={item.nogice1Id}
                    onValueChange={(val) => updateItem(index, "nogice1Id", val === item.nogice1Id ? "" : val)}
                    placeholder="Nogice 1"
                    searchPlaceholder="Pretraži nogice..."
                    emptyText="Nema nogica."
                    className="w-32"
                  />
                ) : (
                  <span className="w-32 text-sm text-muted-foreground">{getCategoryName(nogice, item.nogice1Id)}</span>
                )}

                {editableFields.nogice2Id ? (
                  <SearchableSelect
                    options={nogice.map((n) => ({ value: n.id, label: n.name }))}
                    value={item.nogice2Id}
                    onValueChange={(val) => updateItem(index, "nogice2Id", val === item.nogice2Id ? "" : val)}
                    placeholder="Nogice 2"
                    searchPlaceholder="Pretraži nogice..."
                    emptyText="Nema nogica."
                    className="w-32"
                  />
                ) : (
                  <span className="w-32 text-sm text-muted-foreground">{getCategoryName(nogice, item.nogice2Id)}</span>
                )}

                {canAddDeleteItems && items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                    className="shrink-0 text-destructive hover:text-destructive"
                    aria-label="Ukloni stavku"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Secondary row: deadline, priority, notes, customerOrderNumber, loadingNumber, loadingSequence, serialNumber, step */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  {editableFields.deliveryDeadline ? (
                    <Input
                      type="date"
                      value={item.deliveryDeadline}
                      onChange={(e) => updateItem(index, "deliveryDeadline", e.target.value)}
                      className="h-8 text-xs"
                      title="Rok isporuke"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{item.deliveryDeadline || "—"}</p>
                  )}
                </div>
                <div>
                  {editableFields.priority ? (
                    <Select
                      value={item.priority}
                      onValueChange={(val) => updateItem(index, "priority", val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Prioritet" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normalan</SelectItem>
                        <SelectItem value="high">Visok</SelectItem>
                        <SelectItem value="urgent">Hitan</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{getPriorityLabel(item.priority)}</p>
                  )}
                </div>
                <div>
                  {editableFields.notes ? (
                    <Input
                      type="text"
                      value={item.notes}
                      onChange={(e) => updateItem(index, "notes", e.target.value)}
                      placeholder="Bilješke"
                      className="h-8 text-xs"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{item.notes || "—"}</p>
                  )}
                </div>
                <div>
                  {editableFields.customerOrderNumber ? (
                    <Input
                      type="text"
                      value={item.customerOrderNumber}
                      onChange={(e) => updateItem(index, "customerOrderNumber", e.target.value)}
                      placeholder="Br. narudžbe"
                      className="h-8 text-xs"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{item.customerOrderNumber || "—"}</p>
                  )}
                </div>
                <div>
                  {editableFields.loadingNumber ? (
                    <Input
                      type="text"
                      value={item.loadingNumber}
                      onChange={(e) => updateItem(index, "loadingNumber", e.target.value)}
                      placeholder="Br. utovara"
                      className="h-8 text-xs"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{item.loadingNumber || "—"}</p>
                  )}
                </div>
                <div>
                  {editableFields.loadingSequence ? (
                    <Input
                      type="number"
                      value={item.loadingSequence ?? ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "loadingSequence",
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                      placeholder="Red. utovara"
                      className="h-8 text-xs"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{item.loadingSequence ?? "—"}</p>
                  )}
                </div>
                <div>
                  {editableFields.serialNumber ? (
                    <Input
                      type="text"
                      value={item.serialNumber}
                      onChange={(e) => updateItem(index, "serialNumber", e.target.value)}
                      placeholder="Ser. broj"
                      className="h-8 text-xs"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{item.serialNumber || "—"}</p>
                  )}
                </div>
                <div>
                  {editableFields.step ? (
                    <Input
                      type="text"
                      value={item.step}
                      onChange={(e) => updateItem(index, "step", e.target.value)}
                      placeholder="Štep"
                      className="h-8 text-xs"
                      maxLength={200}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground h-8 flex items-center">{item.step || "—"}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Item button - visible when not completed and under 200 items */}
        {canAddDeleteItems && items.length < 200 && (
          <Button
            type="button"
            variant="outline"
            onClick={addItem}
            className="w-full mt-2"
          >
            <Plus className="h-4 w-4 mr-2" />
            Dodaj stavku
          </Button>
        )}
      </div>

      {/* Validation error message */}
      {validationError && (
        <p className="text-sm text-destructive" role="alert">
          {validationError}
        </p>
      )}

      {/* Success message */}
      {successMessage && (
        <p className="text-sm text-green-600" role="status">
          {successMessage}
        </p>
      )}

      {/* Save button - hidden for completed status */}
      {showSaveButton && (
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? "Spremanje..." : "Spremi"}
        </Button>
      )}
    </div>
  );
}
