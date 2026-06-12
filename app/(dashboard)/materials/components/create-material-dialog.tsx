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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { createMaterial } from "@/app/actions/materials";

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

const emptyForm = {
  name: "",
  code: "",
  unit: "",
  price: "" as string | number,
  currentQuantity: 0,
  minimumQuantity: 0,
  hasDimensions: false,
  isEdgebanded: false,
};

export function CreateMaterialDialog() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await createMaterial({
        name: form.name.trim(),
        unit: form.unit,
        code: form.code.trim() || undefined,
        price: form.price !== "" ? Number(form.price) : undefined,
        currentQuantity: Number(form.currentQuantity),
        minimumQuantity: Number(form.minimumQuantity),
        hasDimensions: form.hasDimensions,
        isEdgebanded: form.isEdgebanded,
      });

      if (!result.success) {
        setError(result.error ?? "Greška pri spremanju");
        return;
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
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novi materijal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novi materijal</DialogTitle>
            <DialogDescription>
              Dodaj novi materijal u sistem
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="grid gap-2">
              <label htmlFor="mat-name" className="text-sm font-medium">
                Naziv
              </label>
              <Input
                id="mat-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="mat-code" className="text-sm font-medium">
                  Šifra
                </label>
                <Input
                  id="mat-code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="Opcionalno"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="mat-price" className="text-sm font-medium">
                  Cijena (BAM)
                </label>
                <Input
                  id="mat-price"
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
              <label htmlFor="mat-unit" className="text-sm font-medium">
                Jedinica mjere
              </label>
              <Select
                value={form.unit}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, unit: value }))
                }
              >
                <SelectTrigger id="mat-unit">
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
                <label htmlFor="mat-qty" className="text-sm font-medium">
                  Trenutna količina
                </label>
                <Input
                  id="mat-qty"
                  type="number"
                  step="any"
                  min="0"
                  value={form.currentQuantity}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      currentQuantity: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="mat-min" className="text-sm font-medium">
                  Minimalna količina
                </label>
                <Input
                  id="mat-min"
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
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="mat-has-dimensions">Ima dimenzije</Label>
              <Switch
                id="mat-has-dimensions"
                checked={form.hasDimensions}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, hasDimensions: checked === true }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="mat-is-edgebanded">Kantovana</Label>
              <Switch
                id="mat-is-edgebanded"
                checked={form.isEdgebanded}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isEdgebanded: checked === true }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Spremanje..." : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
