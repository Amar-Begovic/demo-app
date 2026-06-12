"use client";

import { useState } from "react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus } from "lucide-react";
import { createPurchaseOrder } from "@/app/actions/purchase-orders";

interface MaterialOption {
  id: string;
  name: string;
  unit: string;
  code: string | null;
}

interface SupplierOption {
  id: string;
  companyName: string;
}

interface CreatePurchaseDialogProps {
  materials: MaterialOption[];
  suppliers: SupplierOption[];
}

export function CreatePurchaseDialog({ materials, suppliers }: CreatePurchaseDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMaterialId("");
    setSupplierId("");
    setQuantity("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId) {
      setError("Odaberite materijal");
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setError("Unesite validnu količinu");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await createPurchaseOrder({
        materialId,
        supplierId: supplierId || null,
        requiredQuantity: qty,
      });

      if (!result.success) {
        setError(result.error ?? "Greška pri kreiranju nabavke");
        return;
      }

      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Greška pri kreiranju nabavke");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Nova nabavka
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova nabavka</DialogTitle>
            <DialogDescription>
              Kreirajte ručni nalog za nabavku materijala
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Materijal</label>
              <SearchableSelect
                options={materials.map((m) => ({
                  value: m.id,
                  label: m.code ? `${m.name} [${m.code}]` : m.name,
                }))}
                value={materialId}
                onValueChange={setMaterialId}
                placeholder="Odaberite materijal"
                searchPlaceholder="Pretraži materijale..."
                emptyText="Nema materijala."
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Količina</label>
              <Input
                type="number"
                step="any"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Potrebna količina"
                required
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Dobavljač (opcionalno)</label>
              <SearchableSelect
                options={suppliers.map((s) => ({
                  value: s.id,
                  label: s.companyName,
                }))}
                value={supplierId}
                onValueChange={setSupplierId}
                placeholder="Odaberite dobavljača"
                searchPlaceholder="Pretraži dobavljače..."
                emptyText="Nema dobavljača."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !materialId}>
              {saving ? "Kreiranje..." : "Kreiraj nabavku"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
