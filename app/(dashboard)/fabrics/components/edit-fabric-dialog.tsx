"use client";

import { useState, useEffect } from "react";
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
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateFabric } from "@/app/actions/fabrics";
import { getMaterialsForLinking } from "@/app/actions/materials";
import type { FabricWithMaterial } from "@/lib/services/fabric.service";

interface EditFabricDialogProps {
  fabric: FabricWithMaterial;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MaterialOption = { id: string; name: string; code: string | null };

export function EditFabricDialog({ fabric, open, onOpenChange }: EditFabricDialogProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: fabric.name,
    code: fabric.code || "",
    color: fabric.color || "",
    description: fabric.description || "",
  });
  const [materialId, setMaterialId] = useState<string | null>(fabric.materialId ?? null);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load materials when dialog opens
  useEffect(() => {
    if (!open) return;
    setMaterialsLoading(true);
    getMaterialsForLinking()
      .then((result) => {
        if (result.success && result.data) {
          setMaterials(result.data);
        }
      })
      .finally(() => setMaterialsLoading(false));
  }, [open]);

  // Reset form when fabric prop changes
  useEffect(() => {
    setForm({
      name: fabric.name,
      code: fabric.code || "",
      color: fabric.color || "",
      description: fabric.description || "",
    });
    setMaterialId(fabric.materialId ?? null);
  }, [fabric]);

  const selectedMaterial = materials.find((m) => m.id === materialId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await updateFabric(fabric.id, {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        color: form.color.trim() || undefined,
        description: form.description.trim() || undefined,
        materialId: materialId,
      });

      if (!result.success) {
        setError(result.error ?? "Greška pri spremanju");
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch {
      setError("Greška pri spremanju");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Uredi stof</DialogTitle>
            <DialogDescription>Izmijeni podatke o stofu</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid gap-2">
              <label htmlFor="edit-fab-name" className="text-sm font-medium">
                Naziv
              </label>
              <Input
                id="edit-fab-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="edit-fab-code" className="text-sm font-medium">
                  Šifra
                </label>
                <Input
                  id="edit-fab-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="edit-fab-color" className="text-sm font-medium">
                  Boja
                </label>
                <Input
                  id="edit-fab-color"
                  type="color"
                  value={form.color || "#808080"}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 p-1"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="edit-fab-desc" className="text-sm font-medium">
                Opis
              </label>
              <Input
                id="edit-fab-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Material link/unlink section */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Povezani materijal</label>
              {materialId && selectedMaterial ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="flex-1 text-sm">
                    {selectedMaterial.name}
                    {selectedMaterial.code && (
                      <span className="ml-1 text-muted-foreground">
                        ({selectedMaterial.code})
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setMaterialId(null)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Ukloni vezu</span>
                  </Button>
                </div>
              ) : (
                <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboboxOpen}
                      className="justify-between font-normal"
                    >
                      {materialsLoading
                        ? "Učitavanje..."
                        : "Odaberi materijal..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Pretraži materijale..." />
                      <CommandList>
                        <CommandEmpty>Nema rezultata.</CommandEmpty>
                        <CommandGroup>
                          {materials.map((mat) => (
                            <CommandItem
                              key={mat.id}
                              value={`${mat.name} ${mat.code ?? ""}`}
                              onSelect={() => {
                                setMaterialId(mat.id);
                                setComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  materialId === mat.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span>{mat.name}</span>
                              {mat.code && (
                                <span className="ml-1 text-muted-foreground">
                                  ({mat.code})
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
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
