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
import { Plus } from "lucide-react";
import { createDepartment } from "@/app/actions/departments";

const emptyForm = { name: "", description: "" };

export function CreateDepartmentDialog() {
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
      const result = await createDepartment({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
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
          Novi odjel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novi odjel</DialogTitle>
            <DialogDescription>
              Dodaj novi proizvodni odjel
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="grid gap-2">
              <label htmlFor="dept-name" className="text-sm font-medium">
                Naziv
              </label>
              <Input
                id="dept-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="dept-desc" className="text-sm font-medium">
                Opis
              </label>
              <Input
                id="dept-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Opcionalni opis odjela"
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
