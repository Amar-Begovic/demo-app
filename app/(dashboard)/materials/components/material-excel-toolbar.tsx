"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Upload, Loader2 } from "lucide-react";
import type { BasicMaterialImportResult } from "@/lib/services/basic-material-import.service";

type DialogState =
  | { type: "confirm-basic"; file: File }
  | { type: "importing" }
  | { type: "result-basic"; result: BasicMaterialImportResult }
  | { type: "error"; message: string };

export function MaterialExcelToolbar() {
  const router = useRouter();
  const basicFileRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingKalk, setIsExportingKalk] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);

  const busy = isExporting || isExportingKalk || (dialogOpen && (dialogState?.type === "importing" || dialogState?.type?.startsWith("confirm")));

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch("/api/materials/excel/export");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Greška pri izvozu");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+?)"?$/);
      a.download = match?.[1] ?? `materijali-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDialogOpen(true);
      setDialogState({ type: "error", message: e instanceof Error ? e.message : "Greška pri izvozu" });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportKalkulacije() {
    setIsExportingKalk(true);
    try {
      const res = await fetch("/api/materials/kalkulacije/export");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Greška pri izvozu kalkulacija");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+?)"?$/);
      a.download = match?.[1] ?? `kalkulacije-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDialogOpen(true);
      setDialogState({ type: "error", message: e instanceof Error ? e.message : "Greška pri izvozu kalkulacija" });
    } finally {
      setIsExportingKalk(false);
    }
  }

  function handleBasicFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setDialogOpen(true);
    setDialogState({ type: "confirm-basic", file });
  }

  async function handleConfirmBasicImport() {
    if (dialogState?.type !== "confirm-basic") return;
    const file = dialogState.file;
    setDialogState({ type: "importing" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/materials/basic-excel/import", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "Greška pri uvozu");
      setDialogState({ type: "result-basic", result: body as BasicMaterialImportResult });
      router.refresh();
    } catch (e) {
      setDialogState({ type: "error", message: e instanceof Error ? e.message : "Greška pri uvozu" });
    }
  }

  function handleDialogClose(open: boolean) {
    if (!open && dialogState?.type !== "importing") {
      setDialogOpen(false);
      setDialogState(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Izvoz
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportKalkulacije} disabled={busy}>
          {isExportingKalk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Izvoz kalkulacija
        </Button>
        <Button variant="outline" size="sm" onClick={() => basicFileRef.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" />
          Uvoz materijala
        </Button>
        <input ref={basicFileRef} type="file" accept=".xlsx" className="hidden" onChange={handleBasicFileChange} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          {/* Confirm basic import */}
          {dialogState?.type === "confirm-basic" && (
            <>
              <DialogHeader>
                <DialogTitle>Uvoz materijala</DialogTitle>
                <DialogDescription>
                  Osnovni uvoz materijala iz Excel datoteke. Kreira nove materijale sa šifrom, nazivom, jedinicom mjere, cijenom, količinom i minimalnom količinom.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 text-sm">
                Datoteka: <span className="font-medium">{dialogState.file.name}</span>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)}>Odustani</Button>
                <Button onClick={handleConfirmBasicImport}>Uvezi</Button>
              </DialogFooter>
            </>
          )}

          {/* Importing */}
          {dialogState?.type === "importing" && (
            <>
              <DialogHeader>
                <DialogTitle>Uvoz u toku...</DialogTitle>
                <DialogDescription>Molimo sačekajte dok se datoteka procesira.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Procesiranje Excel datoteke...</p>
              </div>
            </>
          )}

          {/* Error */}
          {dialogState?.type === "error" && (
            <>
              <DialogHeader>
                <DialogTitle>Greška</DialogTitle>
              </DialogHeader>
              <div className="py-4"><p className="text-sm text-destructive">{dialogState.message}</p></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)}>Zatvori</Button>
              </DialogFooter>
            </>
          )}

          {/* Result basic */}
          {dialogState?.type === "result-basic" && (
            <>
              <DialogHeader>
                <DialogTitle>Rezultat uvoza materijala</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-green-600">{dialogState.result.created}</p>
                  <p className="text-xs text-muted-foreground">Kreirani</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-blue-600">{dialogState.result.skipped}</p>
                  <p className="text-xs text-muted-foreground">Preskočeni</p>
                </div>
              </div>
              {dialogState.result.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{dialogState.result.errors.length}</p>
                    <p className="text-xs text-muted-foreground">Grešaka</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">Red</th>
                          <th className="px-3 py-1.5 text-left font-medium">Šifra</th>
                          <th className="px-3 py-1.5 text-left font-medium">Greška</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dialogState.result.errors.map((err, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5 tabular-nums">{err.row}</td>
                            <td className="px-3 py-1.5">{err.materialCode ?? "—"}</td>
                            <td className="px-3 py-1.5">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)}>Zatvori</Button>
              </DialogFooter>
            </>
          )}

        </DialogContent>
      </Dialog>
    </>
  );
}
