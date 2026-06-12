"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { createSupplier } from "@/app/actions/suppliers";

const emptyForm = {
  companyName: "",
  code: "",
  type: "",
  vatStatus: "",
  vatNumber: "",
  registration: "",
  country: "Bosna i Hercegovina",
  city: "",
  postalCode: "",
  address: "",
  contactEmail: "",
  contactPhone: "",
};

export function CreateSupplierDialog() {
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
      const result = await createSupplier({
        companyName: form.companyName,
        code: form.code || undefined,
        type: form.type || undefined,
        vatStatus: form.vatStatus || undefined,
        vatNumber: form.vatNumber || undefined,
        registration: form.registration || undefined,
        country: form.country || undefined,
        city: form.city || undefined,
        postalCode: form.postalCode || undefined,
        address: form.address || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
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
          Novi dobavljač
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novi dobavljač</DialogTitle>
            <DialogDescription>
              Dodaj novog dobavljača materijala
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {/* Row 1: Naziv, Šifra, Vrsta */}
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label htmlFor="companyName" className="text-sm font-medium">
                  Naziv firme
                </label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, companyName: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="code" className="text-sm font-medium">
                  Šifra
                </label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="type" className="text-sm font-medium">
                  Vrsta
                </label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, type: value }))
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Odaberi..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pravno lice">Pravno lice</SelectItem>
                    <SelectItem value="Fizičko lice">Fizičko lice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Row 2: PDV status, PDV broj, Registracija */}
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label htmlFor="vatStatus" className="text-sm font-medium">
                  PDV status
                </label>
                <Select
                  value={form.vatStatus}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, vatStatus: value }))
                  }
                >
                  <SelectTrigger id="vatStatus">
                    <SelectValue placeholder="Odaberi..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Obveznik PDV">Obveznik PDV</SelectItem>
                    <SelectItem value="Nije obveznik PDV">Nije obveznik PDV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="vatNumber" className="text-sm font-medium">
                  PDV broj
                </label>
                <Input
                  id="vatNumber"
                  value={form.vatNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vatNumber: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="registration" className="text-sm font-medium">
                  Registracija
                </label>
                <Select
                  value={form.registration}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, registration: value }))
                  }
                >
                  <SelectTrigger id="registration">
                    <SelectValue placeholder="Odaberi..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Federacija BiH">Federacija BiH</SelectItem>
                    <SelectItem value="Republika Srpska">Republika Srpska</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Row 3: Država, Mjesto, Poštanski broj */}
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label htmlFor="country" className="text-sm font-medium">
                  Država
                </label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="city" className="text-sm font-medium">
                  Mjesto
                </label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="postalCode" className="text-sm font-medium">
                  Poštanski broj
                </label>
                <Input
                  id="postalCode"
                  value={form.postalCode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, postalCode: e.target.value }))
                  }
                />
              </div>
            </div>
            {/* Row 4: Adresa - full width */}
            <div className="grid gap-2">
              <label htmlFor="address" className="text-sm font-medium">
                Adresa
              </label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>
            {/* Row 5: Kontakt email, Kontakt telefon */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="contactEmail" className="text-sm font-medium">
                  Kontakt email
                </label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contactEmail: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="contactPhone" className="text-sm font-medium">
                  Kontakt telefon
                </label>
                <Input
                  id="contactPhone"
                  value={form.contactPhone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contactPhone: e.target.value }))
                  }
                />
              </div>
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
