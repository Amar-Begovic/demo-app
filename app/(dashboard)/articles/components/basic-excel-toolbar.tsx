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
import { useArticleSelection } from "./article-selection-context";

interface BasicImportError {
  row: number;
  articleCode: string | null;
  message: string;
}

interface BasicImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: BasicImportError[];
}

type DialogState =
  | { type: "importing" }
  | { type: "result"; result: BasicImportResult }
  | { type: "error"; message: string };

export function BasicExcelToolbar() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const { selectedIds, count: selectedCount } = useArticleSelection();

  const busy = isExporting || (dialogOpen && dialogState?.type === "importing");

  async function handleExport() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedCount > 0) {
        params.set("ids", Array.from(selectedIds).join(","));
      }
      const exportUrl = `/api/articles/basic-excel/export${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(exportUrl);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Greška pri izvozu");
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+?)"?$/);
      a.download = match?.[1] ?? `artikli-osnovni-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.href = blobUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setDialogOpen(true);
      setDialogState({ type: "error", message: e instanceof Error ? e.message : "Greška pri izvozu" });
    } finally {
      setIsExporting(false);
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setDialogOpen(true);
    setDialogState({ type: "importing" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/articles/basic-excel/import", {
        method: "POST",
        body: formData,
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message ?? "Greška pri uvozu");
      }

      setDialogState({ type: "result", result: body as BasicImportResult });
      router.refresh();
    } catch (e) {
      setDialogState({ type: "error", message: e instanceof Error ? e.message : "Greška pri uvozu" });
    }
  }

  function handleDialogClose(open: boolean) {
    if (!open) {
      setDialogOpen(false);
      setDialogState(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {selectedCount > 0 ? `Izvoz (${selectedCount})` : "Izvoz artikala"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={busy}>
          {dialogState?.type === "importing"
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Upload className="h-4 w-4" />}
          Uvoz artikala
        </Button>
        <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
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
                <DialogDescription>Došlo je do greške tokom operacije.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-sm text-destructive">{dialogState.message}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)}>Zatvori</Button>
              </DialogFooter>
            </>
          )}

          {/* Result */}
          {dialogState?.type === "result" && (
            <>
              <DialogHeader>
                <DialogTitle>Rezultat uvoza</DialogTitle>
                <DialogDescription>Pregled rezultata uvoza Excel datoteke.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-green-600">{dialogState.result.created}</p>
                    <p className="text-xs text-muted-foreground">Kreirano</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-amber-600">{dialogState.result.updated}</p>
                    <p className="text-xs text-muted-foreground">Ažurirano</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-blue-600">{dialogState.result.skipped}</p>
                    <p className="text-xs text-muted-foreground">Preskočeno</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-red-600">{dialogState.result.errors.length}</p>
                    <p className="text-xs text-muted-foreground">Grešaka</p>
                  </div>
                </div>
                {dialogState.result.errors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Greške:</p>
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
                              <td className="px-3 py-1.5">{err.articleCode ?? "—"}</td>
                              <td className="px-3 py-1.5">{err.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
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
