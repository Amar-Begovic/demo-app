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
import { Download, Upload, Loader2, AlertTriangle } from "lucide-react";
import { useArticleSelection } from "./article-selection-context";

interface ImportError {
  row: number;
  articleCode: string | null;
  message: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: ImportError[];
}

interface ImportPreview {
  totalArticles: number;
  totalRows: number;
  unknownMaterials: { code: string; name: string | null }[];
}

type DialogState =
  | { type: "loading" }
  | { type: "preview"; preview: ImportPreview; file: File }
  | { type: "importing" }
  | { type: "result"; result: ImportResult }
  | { type: "error"; message: string };

export function ExcelToolbar() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const { selectedIds, count: selectedCount } = useArticleSelection();

  const busy = isExporting || (dialogOpen && dialogState?.type !== "result" && dialogState?.type !== "error");

  async function handleExport() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedCount > 0) {
        params.set("ids", Array.from(selectedIds).join(","));
      }
      const exportUrl = `/api/articles/excel/export${params.toString() ? `?${params}` : ""}`;
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
      a.download = match?.[1] ?? `artikli-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
    setDialogState({ type: "loading" });

    try {
      // Step 1: Preview — check for unknown materials
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "preview");

      const res = await fetch("/api/articles/excel/import", {
        method: "POST",
        body: formData,
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message ?? "Greška pri analizi datoteke");
      }

      const preview = body as ImportPreview;

      if (preview.unknownMaterials.length > 0) {
        // Show confirmation modal for new materials
        setDialogState({ type: "preview", preview, file });
      } else {
        // No unknown materials — proceed directly
        await executeImport(file, true);
      }
    } catch (e) {
      setDialogState({ type: "error", message: e instanceof Error ? e.message : "Greška pri uvozu" });
    }
  }

  async function executeImport(file: File, createNewMaterials: boolean) {
    setDialogState({ type: "importing" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "import");
      formData.append("createNewMaterials", String(createNewMaterials));

      const res = await fetch("/api/articles/excel/import", {
        method: "POST",
        body: formData,
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message ?? "Greška pri uvozu");
      }

      setDialogState({ type: "result", result: body as ImportResult });
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
          {selectedCount > 0 ? `Preuzmi Excel (${selectedCount})` : "Preuzmi Excel"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={busy}>
          {dialogState?.type === "loading" || dialogState?.type === "importing"
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Upload className="h-4 w-4" />}
          Upload Excel
        </Button>
        <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          {/* Loading / analyzing */}
          {dialogState?.type === "loading" && (
            <>
              <DialogHeader>
                <DialogTitle>Analiza datoteke...</DialogTitle>
                <DialogDescription>Molimo sačekajte dok se datoteka analizira.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Provjera materijala...</p>
              </div>
            </>
          )}

          {/* Preview — unknown materials confirmation */}
          {dialogState?.type === "preview" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Novi materijali
                </DialogTitle>
                <DialogDescription>
                  Pronađeno je {dialogState.preview.unknownMaterials.length} materijala koji ne postoje u bazi.
                  Želite li ih automatski kreirati?
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ukupno artikala: {dialogState.preview.totalArticles} · Ukupno redova: {dialogState.preview.totalRows}
                </p>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Šifra</th>
                        <th className="px-3 py-1.5 text-left font-medium">Naziv</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dialogState.preview.unknownMaterials.map((mat, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-xs">{mat.code}</td>
                          <td className="px-3 py-1.5">{mat.name ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => executeImport(dialogState.file, false)}>
                  Preskoči nove materijale
                </Button>
                <Button onClick={() => executeImport(dialogState.file, true)}>
                  Kreiraj i nastavi
                </Button>
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
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
                </div>
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
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-green-600">{dialogState.result.created}</p>
                    <p className="text-xs text-muted-foreground">Kreirano</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-blue-600">{dialogState.result.updated}</p>
                    <p className="text-xs text-muted-foreground">Ažurirano</p>
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
