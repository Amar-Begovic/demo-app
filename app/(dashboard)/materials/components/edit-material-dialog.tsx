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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateMaterial, adjustStock } from "@/app/actions/materials";

const UNIT_OPTIONS = [
  { value: "kom", label: "kom (komad)" },
  { value: "m", label: "m (metar)" },
  { value: "m2", label: "m² (kvadratni metar)" },
  { value: "m3", label: "m³ (kubni metar)" },
  { value: "kg", label: "kg (kilogram)" },
  { value: "g", label: "g (gram)" },
  { value: "l", label: "l (litar)" },
  { value: "rol", label: "rol (rolna)" },
  { value: "par", label: "par" },
  { value: "milla", label: "milla (hiljadu komada)" },
];

interface EditMaterialDialogProps {
  material: {
    id: string;
    name: string;
    unit: string;
    code: string | null;
    price: number | null;
    currentQuantity: number;
    minimumQuantity: number;
    hasDimensions: boolean;
    isEdgebanded: boolean;
  };
}

export function EditMaterialDialog({ material }: EditMaterialDialogProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: material.name,
    unit: material.unit,
    code: material.code ?? "",
    price: material.price ?? "",
    minimumQuantity: material.minimumQuantity,
    hasDimensions: material.hasDimensions,
    isEdgebanded: material.isEdgebanded,
  });
  const [stockAdjustment, setStockAdjustment] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setForm({
      name: material.name,
      unit: material.unit,
      code: material.code ?? "",
      price: material.price ?? "",
      minimumQuantity: material.minimumQuantity,
      hasDimensions: material.hasDimensions,
      isEdgebanded: material.isEdgebanded,
    });
    setStockAdjustment("");
    setError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await updateMaterial(material.id, {
        name: form.name.trim(),
        unit: form.unit,
        code: form.code.trim() || null,
        price: form.price !== "" ? Number(form.price) : null,
        minimumQuantity: Number(form.minimumQuantity),
        hasDimensions: form.hasDimensions,
        isEdgebanded: form.isEdgebanded,
      });

      if (!result.success) {
        setError(result.error ?? "Greška pri spremanju");
        return;
      }

      // Apply stock adjustment if entered
      const adj = parseFloat(stockAdjustment);
      if (stockAdjustment !== "" && !isNaN(adj) && adj !== 0) {
        const stockResult = await adjustStock(material.id, adj);
        if (!stockResult.success) {
          setError(stockResult.error ?? "Greška pri promjeni zalihe");
          return;
        }
      }

      setDialogOpen(false);
      router.refresh();
    } catch {
      setError("Greška pri spremanju");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={openEdit}
          aria-label={`Uredi ${material.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Uredi materijal</DialogTitle>
            <DialogDescription>
              Izmijeni podatke o materijalu
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="grid gap-2">
              <label htmlFor="edit-mat-name" className="text-sm font-medium">
                Naziv
              </label>
              <Input
                id="edit-mat-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="edit-mat-code" className="text-sm font-medium">
                  Šifra
                </label>
                <Input
                  id="edit-mat-code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="Opcionalno"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="edit-mat-price" className="text-sm font-medium">
                  Cijena (BAM)
                </label>
                <Input
                  id="edit-mat-price"
                  type="number"
                  step="any"
                  min="0"
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      price: e.target.value === "" ? "" : parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="Opcionalno"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="edit-mat-unit" className="text-sm font-medium">
                Jedinica mjere
              </label>
              <Select
                value={form.unit}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, unit: value }))
                }
              >
                <SelectTrigger id="edit-mat-unit">
                  <SelectValue placeholder="Odaberi jedinicu" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  Trenutna količina
                </label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
                  {material.currentQuantity} {material.unit}
                </div>
              </div>
              <div className="grid gap-2">
                <label htmlFor="edit-mat-adj" className="text-sm font-medium">
                  Promjena (+/-)
                </label>
                <Input
                  id="edit-mat-adj"
                  type="number"
                  step="any"
                  value={stockAdjustment}
                  onChange={(e) => setStockAdjustment(e.target.value)}
                  placeholder="npr. 10 ili -5"
                />
                {stockAdjustment !== "" && !isNaN(parseFloat(stockAdjustment)) && parseFloat(stockAdjustment) !== 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nova količina: {(material.currentQuantity + parseFloat(stockAdjustment)).toFixed(2)} {material.unit}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="edit-mat-min" className="text-sm font-medium">
                Minimalna količina
              </label>
              <Input
                id="edit-mat-min"
                type="number"
                step="any"
                min="0"
                value={form.minimumQuantity}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    minimumQuantity: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-mat-has-dimensions">Ima dimenzije</Label>
              <Switch
                id="edit-mat-has-dimensions"
                checked={form.hasDimensions}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, hasDimensions: checked === true }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-mat-is-edgebanded">Kantovana</Label>
              <Switch
                id="edit-mat-is-edgebanded"
                checked={form.isEdgebanded}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isEdgebanded: checked === true }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Spremanje..." : "Spremi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
