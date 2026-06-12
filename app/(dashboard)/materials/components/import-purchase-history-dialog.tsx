"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Loader2, Download } from "lucide-react";
import { importPurchaseHistoryAction } from "@/app/actions/purchase-history-import";
import type { ImportResult } from "@/lib/services/purchase-import.service";

type DialogState =
  | { type: "idle" }
  | { type: "confirm"; file: File }
  | { type: "importing" }
  | { type: "result"; result: ImportResult }
  | { type: "error"; message: string };

export function ImportPurchaseHistoryDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({ type: "idle" });
  const [updateMaterialPrices, setUpdateMaterialPrices] = useState(true);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Reset file input
    e.target.value = "";
    
    // Validate file type
    if (!file.name.endsWith(".xlsx")) {
      setDialogState({ type: "error", message: "Molimo odaberite Excel (.xlsx) datoteku" });
      setDialogOpen(true);
      return;
    }
    
    // Show confirmation dialog
    setDialogState({ type: "confirm", file });
    setDialogOpen(true);
  }

  async function handleConfirmImport() {
    if (dialogState.type !== "confirm") return;
    
    const file = dialogState.file;
    setDialogState({ type: "importing" });
    
    try {
      // Prepare FormData
      const formData = new FormData();
      formData.append("file", file);
      formData.append("updateMaterialPrices", String(updateMaterialPrices));
      
      // Call server action
      const result = await importPurchaseHistoryAction(formData);
      
      if (!result.success) {
        setDialogState({ 
          type: "error", 
          message: result.error ?? "Greška pri uvozu kalkulacija" 
        });
        return;
      }
      
      // Show results
      setDialogState({ type: "result", result: result.data! });
      
      // Refresh page data
      router.refresh();
      
    } catch (error) {
      setDialogState({ 
        type: "error", 
        message: error instanceof Error ? error.message : "Greška pri uvozu kalkulacija" 
      });
    }
  }

  function handleDialogClose(open: boolean) {
    // Prevent closing during import
    if (!open && dialogState.type === "importing") {
      return;
    }
    
    setDialogOpen(open);
    
    // Reset state when closing
    if (!open) {
      setDialogState({ type: "idle" });
      setUpdateMaterialPrices(true);
    }
  }

  function handleDownloadErrorReport() {
    if (dialogState.type !== "result") return;
    
    const result = dialogState.result;
    
    // Generate CSV content
    const csvRows = [
      ["Red", "Poruka greške"].join(","),
      ...result.errors.map(err => [err.row, `"${err.message}"`].join(","))
    ];
    const csvContent = csvRows.join("\n");
    
    // Create download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `greske-uvoza-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => fileInputRef.current?.click()}
        disabled={dialogState.type === "importing"}
      >
        <FileSpreadsheet className="h-4 w-4" />
        Uvoz kalkulacija
      </Button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          {/* Confirm import */}
          {dialogState.type === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>Uvoz kalkulacija</DialogTitle>
                <DialogDescription>
                  Uvoz kalkulacija materijala iz Excel datoteke. Sistem će automatski povezati materijale i dobavljače.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-2 text-sm">
                Datoteka: <span className="font-medium">{dialogState.file.name}</span>
              </div>
              
              <div className="flex items-center gap-2 pb-2">
                <Checkbox 
                  id="update-prices" 
                  checked={updateMaterialPrices} 
                  onCheckedChange={(checked) => setUpdateMaterialPrices(checked === true)} 
                />
                <label htmlFor="update-prices" className="text-sm cursor-pointer select-none">
                  Ažuriraj cijene materijala
                </label>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)}>
                  Odustani
                </Button>
                <Button onClick={handleConfirmImport}>
                  Uvezi
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Importing */}
          {dialogState.type === "importing" && (
            <>
              <DialogHeader>
                <DialogTitle>Uvoz u toku...</DialogTitle>
                <DialogDescription>
                  Molimo sačekajte dok se datoteka procesira.
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Procesiranje Excel datoteke...</p>
              </div>
            </>
          )}

          {/* Error */}
          {dialogState.type === "error" && (
            <>
              <DialogHeader>
                <DialogTitle>Greška</DialogTitle>
              </DialogHeader>
              
              <div className="py-4">
                <p className="text-sm text-destructive">{dialogState.message}</p>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)}>
                  Zatvori
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Result */}
          {dialogState.type === "result" && (
            <>
              <DialogHeader>
                <DialogTitle>Rezultat uvoza kalkulacija</DialogTitle>
              </DialogHeader>
              
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-green-600">
                    {dialogState.result.summary.imported}
                  </p>
                  <p className="text-xs text-muted-foreground">Uvezeno</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-blue-600">
                    {dialogState.result.summary.skipped}
                  </p>
                  <p className="text-xs text-muted-foreground">Preskočeno</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-gray-600">
                    {dialogState.result.summary.totalRows}
                  </p>
                  <p className="text-xs text-muted-foreground">Ukupno redova</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-green-600">
                    {dialogState.result.summary.materialsCreated}
                  </p>
                  <p className="text-xs text-muted-foreground">Materijali kreirani</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-green-600">
                    {dialogState.result.summary.suppliersCreated}
                  </p>
                  <p className="text-xs text-muted-foreground">Dobavljači kreirani</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-bold text-blue-600">
                    {dialogState.result.summary.pricesUpdated}
                  </p>
                  <p className="text-xs text-muted-foreground">Cijene ažurirane</p>
                </div>
                {dialogState.result.summary.duplicatesSkipped > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-amber-600">
                      {dialogState.result.summary.duplicatesSkipped}
                    </p>
                    <p className="text-xs text-muted-foreground">Duplikata preskočeno</p>
                  </div>
                )}
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
                          <th className="px-3 py-1.5 text-left font-medium">Red</th>
                          <th className="px-3 py-1.5 text-left font-medium">Greška</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dialogState.result.errors.map((err, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5 tabular-nums">{err.row}</td>
                            <td className="px-3 py-1.5">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleDownloadErrorReport}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Preuzmi izvještaj o greškama
                  </Button>
                </div>
              )}
              
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)}>
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
