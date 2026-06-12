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
  DialogTrigger,
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
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMaterialsForLinking } from "@/app/actions/materials";
import type { CategoryConfig } from "@/lib/types/category-config";
import type { CreateCategoryItemInput } from "@/lib/services/nogica.service";
import type { ActionResult } from "@/lib/types/actions";

interface CreateCategoryItemDialogProps {
  config: CategoryConfig;
  createAction: (input: CreateCategoryItemInput) => Promise<ActionResult<any>>;
}

const emptyForm = {
  name: "",
  code: "",
  description: "",
};

type MaterialOption = { id: string; name: string; code: string | null };

export function CreateCategoryItemDialog({
  config,
  createAction,
}: CreateCategoryItemDialogProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load materials when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    setMaterialsLoading(true);
    getMaterialsForLinking()
      .then((result) => {
        if (result.success && result.data) {
          setMaterials(result.data);
        }
      })
      .finally(() => setMaterialsLoading(false));
  }, [dialogOpen]);

  function openCreate() {
    setForm(emptyForm);
    setMaterialId(null);
    setError(null);
    setDialogOpen(true);
  }

  const selectedMaterial = materials.find((m) => m.id === materialId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await createAction({
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        materialId: materialId,
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
          {config.createButtonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{config.createDialogTitle}</DialogTitle>
            <DialogDescription>{config.createDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid gap-2">
              <label htmlFor="cat-name" className="text-sm font-medium">
                Naziv
              </label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Unesite naziv"
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="cat-code" className="text-sm font-medium">
                Šifra
              </label>
              <Input
                id="cat-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="Opcionalna šifra"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="cat-desc" className="text-sm font-medium">
                Opis
              </label>
              <Input
                id="cat-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Opcionalni opis"
              />
            </div>

            {/* Material link section */}
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
              {saving ? "Spremanje..." : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
