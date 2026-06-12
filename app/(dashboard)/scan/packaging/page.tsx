"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ScanBarcode,
  CheckCircle2,
  AlertTriangle,
  Package,
} from "lucide-react";
import { PackagingStatusPanel } from "./packaging-status-panel";

interface ComponentStatus {
  name: string;
  scanned: boolean;
  scannedAt?: string;
}

interface ScanResponse {
  component: { name: string; scannedAt?: string };
  allComponents: ComponentStatus[];
  isComplete: boolean;
  alreadyScanned: boolean;
  orderCompleted?: boolean;
  orderNumber?: number | null;
}

export default function PackagingScanPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [components, setComponents] = useState<ComponentStatus[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [alreadyScanned, setAlreadyScanned] = useState(false);
  const [lastScannedName, setLastScannedName] = useState<string | null>(null);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For the status panel
  const [highlightOrderNumber, setHighlightOrderNumber] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleScan(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setAlreadyScanned(false);

    try {
      const res = await fetch("/api/packaging/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcodeValue: trimmed }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError("Nepoznat barkod — nije komponenta za pakovanje");
        } else {
          const data = await res.json().catch(() => null);
          setError(data?.message || "Greška pri skeniranju");
        }
        return;
      }

      const data: ScanResponse = await res.json();
      setComponents(data.allComponents);
      setIsComplete(data.isComplete);
      setAlreadyScanned(data.alreadyScanned);
      setLastScannedName(data.component.name);
      setOrderCompleted(data.orderCompleted ?? false);

      // Update status panel: highlight the scanned order and refresh data
      if (data.orderNumber) {
        setHighlightOrderNumber(data.orderNumber);
      }
      setRefreshKey((k) => k + 1);
    } catch {
      setError("Greška pri komunikaciji sa serverom");
    } finally {
      setLoading(false);
      setBarcodeValue("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(barcodeValue);
    }
  }

  return (
    <div className="flex gap-6">
      {/* Left side: scanner */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Skeniranje pakovanja
          </h1>
          <p className="text-muted-foreground">
            Skenirajte barkod komponente za verifikaciju pakovanja
          </p>
        </div>

        {/* Barcode input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanBarcode className="h-5 w-5" />
              Skenirajte barkod komponente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-md">
              <Input
                ref={inputRef}
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Skenirajte barkod..."
                disabled={loading}
                aria-label="Barkod komponente"
                autoFocus
              />
            </div>
            {loading && (
              <p className="text-sm text-muted-foreground mt-2">
                Učitavanje...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Error alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Duplicate scan warning */}
        {alreadyScanned && lastScannedName && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Komponenta &quot;{lastScannedName}&quot; već skenirana
            </AlertDescription>
          </Alert>
        )}

        {/* Success — all components scanned */}
        {isComplete && components.length > 0 && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="font-medium">
              Pakovanje kompletno — sve komponente skenirane ✓
            </AlertDescription>
          </Alert>
        )}

        {/* Order completed — all items fully packed */}
        {orderCompleted && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <Package className="h-4 w-4" />
            <AlertDescription className="font-medium">
              Nalog završen — svi artikli zapakovani ✓
            </AlertDescription>
          </Alert>
        )}

        {/* Component list */}
        {components.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Komponente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {components.map((comp) => (
                  <li
                    key={comp.name}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <span className="text-sm font-medium">{comp.name}</span>
                    {comp.scanned ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-800"
                      >
                        ✓ Skenirano
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        ○ Čeka
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right side: packaging status panel */}
      <div className="flex-1 min-w-0 hidden lg:block">
        <div className="sticky top-4">
          <PackagingStatusPanel
            highlightOrderNumber={highlightOrderNumber}
            refreshKey={refreshKey}
          />
        </div>
      </div>
    </div>
  );
}
