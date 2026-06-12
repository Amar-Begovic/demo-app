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
import type { FabricImportResult } from "@/lib/services/fabric-excel-import.service";

type DialogState =
  | { type: "confirm"; file: File }
  | { type: "importing" }
  | { type: "result"; result: FabricImportResult }
  | { type: "error"; message: string };

export function FabricExcelToolbar() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);

  const busy =
    isExporting ||
    (dialogOpen &&
      (dialogState?.type === "importing" || dialogState?.type === "confirm"));

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch("/api/fabrics/excel/export");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Greška pri izvozu");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+?)"?$/);
      a.download =
        match?.[1] ??
        `stofovi-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDialogOpen(true);
      setDialogState({
        type: "error",
        message: e instanceof Error ? e.message : "Greška pri izvozu",
      });
    } finally {
      setIsExporting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setDialogOpen(true);
    setDialogState({ type: "confirm", file });
  }

  async function handleConfirmImport() {
    if (dialogState?.type !== "confirm") return;
    const file = dialogState.file;
    setDialogState({ type: "importing" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/fabrics/excel/import", {
        method: "POST",
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "Greška pri uvozu");
      setDialogState({
        type: "result",
        result: body as FabricImportResult,
      });
      router.refresh();
    } catch (e) {
      setDialogState({
        type: "error",
        message: e instanceof Error ? e.message : "Greška pri uvozu",
      });
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={busy}
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Izvoz Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="h-4 w-4" />
          Uvoz Excel
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          {/* Confirm import */}
          {dialogState?.type === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>Uvoz stofova</DialogTitle>
                <DialogDescription>
                  Uvoz stofova iz Excel datoteke. Kreira nove ili ažurira
                  postojeće stofove na osnovu šifre.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 text-sm">
                Datoteka:{" "}
                <span className="font-medium">{dialogState.file.name}</span>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                >
                  Odustani
                </Button>
                <Button onClick={handleConfirmImport}>Uvezi</Button>
              </DialogFooter>
            </>
          )}

          {/* Importing */}
          {dialogState?.type === "importing" && (
            <>
              <DialogHeader>
                <DialogTitle>Uvoz u toku...</DialogTitle>
                <DialogDescription>
                  Molimo sačekajte dok se datoteka procesira.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Procesiranje Excel datoteke...
                </p>
              </div>
            </>
          )}

          {/* Error */}
          {dialogState?.type === "error" && (
            <>
              <DialogHeader>
                <DialogTitle>Greška</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-destructive">
                  {dialogState.message}
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                >
                  Zatvori
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Result */}
          {dialogState?.type === "result" && (
            <>
              <DialogHeader>
                <DialogTitle>Rezultat uvoza stofova</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-green-600">
                    {dialogState.result.fabricsCreated}
                  </p>
                  <p className="text-xs text-muted-foreground">Kreirano</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-blue-600">
                    {dialogState.result.fabricsUpdated}
                  </p>
                  <p className="text-xs text-muted-foreground">Ažurirano</p>
                </div>
              </div>
              {dialogState.result.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">
                      {dialogState.result.errors.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Grešaka</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">
                            Red
                          </th>
                          <th className="px-3 py-1.5 text-left font-medium">
                            Šifra
                          </th>
                          <th className="px-3 py-1.5 text-left font-medium">
                            Greška
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dialogState.result.errors.map((err, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5 tabular-nums">
                              {err.row}
                            </td>
                            <td className="px-3 py-1.5">
                              {err.fabricCode ?? "—"}
                            </td>
                            <td className="px-3 py-1.5">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                >
                  Zatvori
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
