"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload } from "lucide-react";
import {
  parseExcelBuffer,
  type ParsedExcelRow,
  type ParseExcelResult,
} from "@/lib/services/production-order-excel.service";
import { bulkUpdateFromExcel } from "@/app/actions/production-orders";
import type { OrderRow, OrderItem } from "./selectable-order-table";

interface ImportOrdersExcelButtonProps {
  orders: OrderRow[];
}

/** Fields we compare between parsed row and existing item */
type EditableField =
  | "quantity"
  | "priority"
  | "deliveryDeadline"
  | "notes"
  | "serialNumber"
  | "customerOrderNumber"
  | "loadingNumber"
  | "loadingSequence";

interface ItemChange {
  itemId: string;
  orderId: string;
  fields: Partial<Record<EditableField, unknown>>;
}

interface OrderFields {
  workOrderNumber?: string | null;
  workOrderDate?: Date | null;
}

interface PreviewData {
  changes: ItemChange[];
  orderFields: Map<string, OrderFields>;
  skippedCount: number;
  warnings: ParseExcelResult["warnings"];
}

/** Convert a Date or ISO string to YYYY-MM-DD for comparison */
function toDateString(val: Date | string | null | undefined): string {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Build a lookup map: itemId → { item, orderId } */
function buildItemLookup(orders: OrderRow[]): Map<string, { item: OrderItem; orderId: string }> {
  const map = new Map<string, { item: OrderItem; orderId: string }>();
  for (const order of orders) {
    for (const item of order.items) {
      map.set(item.id, { item, orderId: order.id });
    }
  }
  return map;
}

/** Compare a parsed row against the existing item and return only changed fields */
function computeItemChanges(
  parsed: ParsedExcelRow,
  existing: OrderItem,
): Partial<Record<EditableField, unknown>> | null {
  const changes: Partial<Record<EditableField, unknown>> = {};

  if (parsed.quantity !== null && parsed.quantity !== existing.quantity) {
    changes.quantity = parsed.quantity;
  }
  if (parsed.priority !== null && parsed.priority !== existing.priority) {
    changes.priority = parsed.priority;
  }
  if (parsed.deliveryDeadline !== null) {
    const parsedDate = toDateString(parsed.deliveryDeadline);
    const existingDate = toDateString(existing.deliveryDeadline);
    if (parsedDate !== existingDate) {
      changes.deliveryDeadline = parsed.deliveryDeadline;
    }
  }
  if (parsed.notes !== null && parsed.notes !== (existing.notes ?? "")) {
    changes.notes = parsed.notes;
  }
  if (
    parsed.serialNumber !== null &&
    parsed.serialNumber !== (existing.serialNumber ?? "")
  ) {
    changes.serialNumber = parsed.serialNumber;
  }
  if (
    parsed.loadingNumber !== null &&
    parsed.loadingNumber !== (existing.loadingNumber ?? "")
  ) {
    changes.loadingNumber = parsed.loadingNumber;
  }

  if (
    parsed.loadingSequence !== null &&
    parsed.loadingSequence !== (existing.loadingSequence ?? null)
  ) {
    changes.loadingSequence = parsed.loadingSequence;
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export function ImportOrdersExcelButton({ orders }: ImportOrdersExcelButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!file) return;

      // Validate extension
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        setError("Molimo odaberite datoteku u .xlsx formatu");
        setDialogOpen(true);
        return;
      }

      // Validate size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("Datoteka je prevelika. Maksimalna veličina je 10MB");
        setDialogOpen(true);
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const result: ParseExcelResult = await parseExcelBuffer(buffer);

        // Build lookup and compute diff
        const lookup = buildItemLookup(orders);
        const changes: ItemChange[] = [];
        const orderFields = new Map<string, OrderFields>();
        let skippedCount = 0;

        for (const row of result.rows) {
          const entry = lookup.get(row.itemId);
          if (!entry) {
            skippedCount++;
            continue;
          }

          // Collect order-level fields (first occurrence per order wins)
          if (!orderFields.has(entry.orderId)) {
            const of: OrderFields = {};
            if (row.workOrderNumber != null) of.workOrderNumber = row.workOrderNumber;
            if (row.workOrderDate != null) of.workOrderDate = row.workOrderDate;
            if (Object.keys(of).length > 0) orderFields.set(entry.orderId, of);
          }

          const fieldChanges = computeItemChanges(row, entry.item);
          if (fieldChanges) {
            changes.push({
              itemId: row.itemId,
              orderId: entry.orderId,
              fields: fieldChanges,
            });
          }
        }

        if (changes.length === 0 && orderFields.size === 0) {
          setError("Nema izmjena za uvoz");
          setDialogOpen(true);
          return;
        }

        setError(null);
        setPreview({ changes, orderFields, skippedCount, warnings: result.warnings });
        setDialogOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Greška pri parsiranju datoteke");
        setDialogOpen(true);
      }
    },
    [orders],
  );

  const handleConfirm = useCallback(async () => {
    if (!preview) return;

    setApplying(true);

    // Group changes by orderId
    const grouped = new Map<string, Array<{ id: string } & Record<string, unknown>>>();
    for (const change of preview.changes) {
      if (!grouped.has(change.orderId)) {
        grouped.set(change.orderId, []);
      }
      grouped.get(change.orderId)!.push({ id: change.itemId, ...change.fields });
    }

    // Ensure all orders with orderFields are included even without item changes
    for (const orderId of preview.orderFields.keys()) {
      if (!grouped.has(orderId)) grouped.set(orderId, []);
    }

    const updates = Array.from(grouped.entries()).map(([orderId, items]) => ({
      orderId,
      ...preview.orderFields.get(orderId),
      items,
    }));

    setProgress({ current: 0, total: updates.length });

    try {
      // Process in a single bulk call
      const result = await bulkUpdateFromExcel({ updates });

      setProgress({ current: updates.length, total: updates.length });

      if (!result.success) {
        const failedCount = result.results.filter((r) => !r.success).length;
        setError(`Ažuriranje djelomično uspjelo. ${failedCount} nalog(a) nije ažurirano.`);
      }

      // Refresh page data
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri primjeni izmjena");
    } finally {
      setApplying(false);
      setPreview(null);
      setDialogOpen(false);
    }
  }, [preview, router]);

  const handleClose = useCallback(() => {
    if (applying) return;
    setDialogOpen(false);
    setPreview(null);
    setError(null);
  }, [applying]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button variant="outline" size="sm" onClick={handleButtonClick}>
        <Upload className="h-4 w-4 mr-1" />
        Uvoz izmjena
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {error && !preview ? "Greška" : "Pregled izmjena"}
            </DialogTitle>
            <DialogDescription>
              {error && !preview
                ? error
                : "Pregledajte izmjene prije primjene"}
            </DialogDescription>
          </DialogHeader>

          {/* Error-only state */}
          {error && !preview && (
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Zatvori
              </Button>
            </DialogFooter>
          )}

          {/* Preview state */}
          {preview && !applying && (
            <>
              <div className="space-y-2 text-sm">
                <p>{preview.changes.length} stavki za ažuriranje</p>
                {preview.skippedCount > 0 && (
                  <p className="text-muted-foreground">
                    {preview.skippedCount} stavki preskočeno (stavka nije pronađena)
                  </p>
                )}
                {preview.warnings.length > 0 && (
                  <div>
                    <p className="font-medium text-amber-600">Upozorenja:</p>
                    <ul className="list-disc pl-4 text-muted-foreground max-h-40 overflow-y-auto">
                      {preview.warnings.map((w, i) => (
                        <li key={i}>
                          Red {w.row}: {w.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  Odustani
                </Button>
                <Button onClick={handleConfirm}>Potvrdi</Button>
              </DialogFooter>
            </>
          )}

          {/* Applying state */}
          {applying && (
            <div className="py-4 text-sm text-muted-foreground">
              Obrađeno {progress.current} od {progress.total} naloga...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
