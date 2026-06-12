"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ScanBarcode,
  CheckCircle2,
  Play,
  Clock,
  Package,
  AlertTriangle,
  ClipboardCheck,
  ListOrdered,
  Ban,
  CircleCheckBig,
  Camera,
  Settings,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { BarcodeLabel } from "@/components/barcode/barcode-label";
import { CameraScanner } from "./components/camera-scanner";
import { SessionTimer } from "./components/session-timer";
import {
  determineFeedbackState,
  shouldActivateCamera,
  buildScanRequestBody,
} from "@/lib/utils/scan-helpers";
import { vibrateSuccess, vibrateError } from "@/lib/utils/vibration";

// --- Scanner prefix configuration types ---
interface PrefixMapping {
  prefix: string;
  departmentId: string;
}

interface Department {
  id: string;
  name: string;
}

const STORAGE_KEY = "scanner-prefix-config";

function loadPrefixMappings(): PrefixMapping[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePrefixMappings(mappings: PrefixMapping[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
}

/**
 * Match scanned value against configured prefixes.
 * Checks longest prefix first to avoid partial matches.
 */
function matchPrefix(
  value: string,
  mappings: PrefixMapping[]
): { actualBarcode: string; departmentId: string; prefix: string } | null {
  const sorted = [...mappings]
    .filter((m) => m.prefix.length > 0)
    .sort((a, b) => b.prefix.length - a.prefix.length);
  for (const mapping of sorted) {
    if (value.startsWith(mapping.prefix)) {
      return {
        actualBarcode: value.slice(mapping.prefix.length),
        departmentId: mapping.departmentId,
        prefix: mapping.prefix,
      };
    }
  }
  return null;
}

interface ScanResult {
  barcode: {
    id: string;
    value: string;
    type: string;
    imageBase64: string;
    productionOrderId?: string;
    articlePartId?: string;
    itemIndex?: number;
  };
  workOrder?: {
    id: string;
    itemIndex: number;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    stepSequence?: number | null;
    articlePart: {
      partName: string;
      dimensions: string | null;
      notes: string | null;
      department: { name: string };
      materials: {
        material: { name: string; unit: string };
        quantity: number;
      }[];
    };
    department: { name: string };
    productionOrder: { id: string };
    productionStep?: {
      stepName: string;
      instructions: string | null;
      estimatedTime: number | null;
    };
  };
  productionOrder?: {
    id: string;
    quantity: number;
    status: string;
    article: { name: string } | null;
  };
  stepName?: string;
  stepSequence?: number;
  totalSteps?: number;
  currentStep?: number;
  departmentName?: string;
  instructions?: string | null;
  estimatedTime?: number | null;
  stepsProgress?: { stepName: string; stepSequence: number | null; departmentName: string; status: string }[];
  action: "started" | "completed" | "needs_confirmation" | "blocked" | "none" | "all_completed" | "wrong_department" | "packaging_scan" | "packaging_completed";
  reason?: string;
  // part_identifier specific fields
  partName?: string;
  dimensions?: string | null;
  productionOrderRef?: string;
  blockingStep?: { stepName: string; stepSequence: number; departmentName: string };
  expectedDepartment?: { id: string; name: string };
  incompleteSteps?: { stepName: string; stepSequence: number | null; departmentName: string; status: string }[];
  // packaging_scan specific fields
  componentName?: string;
  alreadyScanned?: boolean;
  allComponents?: { name: string; scanned: boolean; scannedAt?: string }[];
  isComplete?: boolean;
  // PR barcode packaging status (non-blocking)
  packagingStatus?: {
    allScanned: boolean;
    missing: string[];
    allComponents: { name: string; scanned: boolean }[];
  } | null;
  orderCompleted?: boolean;
}

const woStatusLabels: Record<string, string> = {
  pending: "Čeka",
  in_progress: "U izradi",
  completed: "Završen",
};

const woStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  in_progress: "default",
  completed: "secondary",
};

const actionMessages: Record<string, { text: string; icon: typeof Play }> = {
  started: { text: "Radni nalog pokrenut", icon: Play },
  completed: { text: "Radni nalog završen", icon: CheckCircle2 },
  none: { text: "Nema promjene statusa", icon: Clock },
};

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Učitavanje...</div>}>
      <ScanPageContent />
    </Suspense>
  );
}

// --- Scanner prefix configuration component ---
function ScannerPrefixConfig({
  mappings,
  onMappingsChange,
  departments,
}: {
  mappings: PrefixMapping[];
  onMappingsChange: (mappings: PrefixMapping[]) => void;
  departments: Department[];
}) {
  const [open, setOpen] = useState(false);

  function addMapping() {
    const updated = [...mappings, { prefix: "", departmentId: "" }];
    onMappingsChange(updated);
    if (!open) setOpen(true);
  }

  function removeMapping(index: number) {
    const updated = mappings.filter((_, i) => i !== index);
    onMappingsChange(updated);
  }

  function updateMapping(index: number, field: keyof PrefixMapping, value: string) {
    const updated = mappings.map((m, i) => (i === index ? { ...m, [field]: value } : m));
    onMappingsChange(updated);
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings className="h-4 w-4" />
          Konfiguracija skenera
          {open ? (
            <ChevronDown className="h-4 w-4 ml-auto" />
          ) : (
            <ChevronRight className="h-4 w-4 ml-auto" />
          )}
          {mappings.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {mappings.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Mapiranje prefiksa WiFi skenera na odjele
        </CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {mappings.length > 0 && (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Prefiks</th>
                    <th className="px-3 py-2 text-left font-medium">Odjel</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <Input
                          value={mapping.prefix}
                          onChange={(e) => updateMapping(index, "prefix", e.target.value)}
                          placeholder="npr. T-"
                          className="h-8 w-32 font-mono"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={mapping.departmentId}
                          onValueChange={(val) => updateMapping(index, "departmentId", val)}
                        >
                          <SelectTrigger className="h-8 w-48">
                            <SelectValue placeholder="Odaberi odjel" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeMapping(index)}
                          aria-label="Obriši mapiranje"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={addMapping}>
            <Plus className="h-4 w-4 mr-1" />
            Dodaj
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

function ScanPageContent() {
  const searchParams = useSearchParams();
  const deptParam = searchParams.get("dept");
  const departmentParam = searchParams.get("department");
  const departmentId = deptParam ?? departmentParam ?? undefined;

  const inputRef = useRef<HTMLInputElement>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Camera scanning state
  const [cameraActive, setCameraActive] = useState(false);
  const [feedbackState, setFeedbackState] = useState<"idle" | "success" | "error">("idle");
  const [scanPaused, setScanPaused] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<Date | null>(null);
  // Track the last action to handle needs_confirmation resume logic
  const lastActionRef = useRef<string | null>(null);

  // Scanner prefix configuration state
  const [prefixMappings, setPrefixMappings] = useState<PrefixMapping[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [detectedDepartment, setDetectedDepartment] = useState<string | null>(null);

  // Load prefix mappings from localStorage on mount
  useEffect(() => {
    setPrefixMappings(loadPrefixMappings());
  }, []);

  // Fetch departments on mount
  useEffect(() => {
    fetch("/api/departments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Department[]) => setDepartments(data))
      .catch(() => {});
  }, []);

  function handleMappingsChange(mappings: PrefixMapping[]) {
    setPrefixMappings(mappings);
    savePrefixMappings(mappings);
  }

  // Auto-activate camera if dept/department param present
  useEffect(() => {
    if (shouldActivateCamera(deptParam, departmentParam)) {
      setCameraActive(true);
      setSessionStartTime(new Date());
    }
  }, [deptParam, departmentParam]);

  // Auto-focus input when camera is not active
  useEffect(() => {
    if (!cameraActive) {
      inputRef.current?.focus();
    }
  }, [cameraActive]);

  const handleFeedbackComplete = useCallback(() => {
    setFeedbackState("idle");
    // Only resume if the action was NOT needs_confirmation
    if (lastActionRef.current !== "needs_confirmation") {
      setScanPaused(false);
    }
  }, []);

  const handleScan = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    setScanPaused(true);
    setError(null);
    setResult(null);
    setDetectedDepartment(null);

    // Check for prefix match
    const prefixMatch = matchPrefix(trimmed, prefixMappings);
    const actualBarcode = prefixMatch ? prefixMatch.actualBarcode : trimmed;
    const effectiveDeptId = prefixMatch ? prefixMatch.departmentId : departmentId;

    if (prefixMatch) {
      const dept = departments.find((d) => d.id === prefixMatch.departmentId);
      setDetectedDepartment(dept?.name ?? null);
    }

    try {
      const body = buildScanRequestBody(actualBarcode, effectiveDeptId);
      const res = await fetch("/api/barcodes/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Barkod nije pronađen");
        const fb = determineFeedbackState("", res.status);
        setFeedbackState(fb);
        if (fb === "error") vibrateError();
        lastActionRef.current = null;
        return;
      }

      const data: ScanResult = await res.json();
      setResult(data);
      const fb = determineFeedbackState(data.action);
      setFeedbackState(fb);
      lastActionRef.current = data.action;
      if (fb === "success") vibrateSuccess();
      else if (fb === "error") vibrateError();
    } catch {
      setError("Greška pri skeniranju");
      setFeedbackState("error");
      vibrateError();
      lastActionRef.current = null;
    } finally {
      setLoading(false);
      setBarcodeValue("");
      if (!cameraActive) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [departmentId, cameraActive, prefixMappings, departments]);

  // Global keyboard listener — captures barcode scanner input even when input is not focused
  useEffect(() => {
    if (cameraActive) return;

    function handleGlobalKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.target === inputRef.current) return;

      if (e.key === "Enter") {
        e.preventDefault();
        const val = inputRef.current?.value ?? "";
        if (val.trim()) {
          handleScan(val);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      }
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [cameraActive, handleScan]);

  // Re-focus input when user clicks anywhere on the page
  useEffect(() => {
    if (cameraActive) return;

    function handleClick(e: MouseEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "BUTTON" || tag === "SELECT" || tag === "A" || tag === "LABEL") return;
      const closest = (e.target as HTMLElement)?.closest?.("button, select, a, [role=dialog], [data-radix-collection-item]");
      if (closest) return;
      setTimeout(() => inputRef.current?.focus(), 50);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [cameraActive]);

  async function handleConfirmComplete(workOrderId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await res.json();
        setResult((prev) => prev ? { ...prev, workOrder: updated, action: "completed" } : null);
      } else {
        const data = await res.json();
        setError(data.message || "Greška pri završavanju");
      }
    } catch {
      setError("Greška pri završavanju radnog naloga");
    } finally {
      setLoading(false);
      setScanPaused(false);
      setFeedbackState("idle");
      if (!cameraActive) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }

  function handleCancelConfirmation() {
    setResult(null);
    setScanPaused(false);
    setFeedbackState("idle");
    if (!cameraActive) {
      inputRef.current?.focus();
    }
  }

  function handleOpenCamera() {
    setCameraActive(true);
    setSessionStartTime(new Date());
    setSessionEndTime(null);
  }

  function handleCloseCamera() {
    setCameraActive(false);
    setSessionEndTime(new Date());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(barcodeValue);
    }
  }

  function formatDuration(startedAt: string | null, completedAt: string | null): string {
    if (!startedAt || !completedAt) return "—";
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) return `${hours}h ${remainingMinutes}min`;
    return `${minutes}min`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Skeniranje</h1>
        <p className="text-muted-foreground">
          Skenirajte barkod za prikaz detalja i automatsku promjenu statusa
        </p>
      </div>

      {/* Scanner prefix configuration */}
      <ScannerPrefixConfig
        mappings={prefixMappings}
        onMappingsChange={handleMappingsChange}
        departments={departments}
      />

      {/* Session timer */}
      {sessionStartTime && (
        <SessionTimer startTime={sessionStartTime} isActive={cameraActive} />
      )}

      {/* Camera scanner */}
      {cameraActive && (
        <CameraScanner
          onScan={handleScan}
          paused={scanPaused}
          feedbackState={feedbackState}
          onClose={handleCloseCamera}
        />
      )}

      {/* Manual barcode input (shown when camera is not active) */}
      {!cameraActive && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanBarcode className="h-5 w-5" />
              Barkod unos
            </CardTitle>
            <CardDescription>
              Skenirajte barkod ili unesite vrijednost ručno i pritisnite Enter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 max-w-md">
              <Input
                ref={inputRef}
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Skenirajte ili unesite barkod..."
                disabled={loading}
                aria-label="Barkod unos"
                autoFocus
              />
            </div>
            {loading && (
              <p className="text-sm text-muted-foreground mt-2">Učitavanje...</p>
            )}
            <Button
              variant="outline"
              className="mt-4"
              onClick={handleOpenCamera}
            >
              <Camera className="h-4 w-4 mr-2" />
              Otvori kameru
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Detected department from prefix */}
      {detectedDepartment && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm px-3 py-1">
            Odjel: {detectedDepartment}
          </Badge>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan result */}
      {result && (
        <div className="space-y-4">
          {/* Wrong department */}
          {result.action === "wrong_department" && result.expectedDepartment && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-orange-700">
                  <Ban className="h-5 w-5" />
                  <p className="font-medium">
                    Ovaj korak se radi u odjelu {result.expectedDepartment.name}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* All completed */}
          {result.action === "all_completed" && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700">
                  <CircleCheckBig className="h-5 w-5" />
                  <p className="font-medium">
                    {result.barcode.type === "product"
                      ? "Svi koraci završeni — proizvod spreman za utovar ✓"
                      : "Svi koraci za ovaj dio su završeni"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Packaging status warning for PR barcodes */}
          {result.action === "all_completed" && result.packagingStatus && !result.packagingStatus.allScanned && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  <p className="font-medium">
                    Pakovanje nepotpuno — {result.packagingStatus.missing.length} komponenta nedostaje
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {result.packagingStatus.allComponents.map((comp) => (
                    <span
                      key={comp.name}
                      className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                        comp.scanned
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800 font-medium"
                      }`}
                    >
                      {comp.scanned ? "✓" : "✗"} {comp.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.action === "all_completed" && result.packagingStatus?.allScanned && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700">
                  <Package className="h-5 w-5" />
                  <p className="font-medium">Pakovanje kompletno — svi dijelovi skenirani ✓</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Packaging completed via PR barcode */}
          {result.action === "packaging_completed" && (
            <Card className={result.orderCompleted ? "border-green-200 bg-green-50" : "border-green-200 bg-green-50"}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <Package className="h-5 w-5" />
                  <p className="font-medium">
                    Artikal završen ✓
                    {result.orderCompleted && " — Cijeli nalog završen!"}
                  </p>
                </div>
                {result.packagingStatus?.allComponents && (
                  <div className="flex gap-1.5 flex-wrap">
                    {result.packagingStatus.allComponents.map((comp) => (
                      <span
                        key={comp.name}
                        className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                          comp.scanned
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {comp.scanned ? "✓" : "⚠"} {comp.name}
                      </span>
                    ))}
                  </div>
                )}
                {result.packagingStatus && !result.packagingStatus.allScanned && (
                  <p className="text-xs text-amber-600">
                    {result.packagingStatus.missing.length} dio(va) nije skeniran pojedinačno
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Started action */}
          {result.action === "started" && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700">
                  <Play className="h-5 w-5" />
                  <p className="font-medium">
                    {result.barcode.type === "part_identifier"
                      ? `Korak ${result.currentStep ?? result.stepSequence} od ${result.totalSteps} pokrenut: ${result.stepName ?? result.workOrder?.productionStep?.stepName ?? ""}`
                      : actionMessages.started.text}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Completed action */}
          {result.action === "completed" && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="font-medium">{actionMessages.completed.text}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* None action (no status change) */}
          {result.action === "none" && (
            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="h-5 w-5" />
                  <p className="font-medium">{actionMessages.none.text}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Blocked state */}
          {result.action === "blocked" && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  <p className="font-medium">
                    {result.barcode.type === "part_identifier" && result.blockingStep
                      ? `Blokirano: korak "${result.blockingStep.stepName}" (${result.blockingStep.stepSequence}) u odjelu ${result.blockingStep.departmentName} mora biti završen`
                      : result.reason || "Prethodni korak nije završen"}
                  </p>
                </div>
                {result.barcode.type !== "part_identifier" && result.stepName && (
                  <p className="text-sm text-red-600 mt-2">
                    Trenutni korak: {result.stepSequence} od {result.totalSteps} — {result.stepName}
                  </p>
                )}
                {result.barcode.type === "product" && result.incompleteSteps && result.incompleteSteps.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-medium text-red-700">Nedovršeni koraci:</p>
                    {result.incompleteSteps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                        <span className="bg-red-200 text-red-800 text-xs px-1.5 py-0.5 rounded font-mono">
                          {step.stepSequence ?? "—"}
                        </span>
                        <span>{step.stepName}</span>
                        <span className="text-red-400">— {step.departmentName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Confirmation checklist */}
          {result.action === "needs_confirmation" && result.workOrder && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <ClipboardCheck className="h-5 w-5" />
                  Potvrda završetka
                </CardTitle>
                <CardDescription className="text-amber-700">
                  Provjerite specifikacije prije nego označite radni nalog kao završen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-white p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dio:</span>
                    <span className="font-medium">{result.workOrder.articlePart.partName}</span>
                  </div>
                  {result.workOrder.articlePart.dimensions && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dimenzije:</span>
                      <span className="font-medium">{result.workOrder.articlePart.dimensions}</span>
                    </div>
                  )}
                  {result.workOrder.articlePart.notes && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Napomene:</span>
                      <span className="font-medium italic">{result.workOrder.articlePart.notes}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Odjel:</span>
                    <span className="font-medium">{result.workOrder.department.name}</span>
                  </div>
                  {(result.stepName || result.workOrder.productionStep?.stepName) && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Korak:</span>
                      <span className="font-medium">
                        {result.stepSequence ?? result.currentStep} od {result.totalSteps}: {result.stepName ?? result.workOrder.productionStep?.stepName}
                      </span>
                    </div>
                  )}
                  {(result.instructions || result.workOrder.productionStep?.instructions) && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Instrukcije:</span>
                      <span className="font-medium italic">{result.instructions ?? result.workOrder.productionStep?.instructions}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleConfirmComplete(result.workOrder!.id)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Potvrdi završetak
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancelConfirmation}
                  >
                    Otkaži
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Packaging scan result */}
          {result.action === "packaging_scan" && result.allComponents && (
            <>
              {result.isComplete && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <p className="font-medium">Pakovanje kompletno — sve komponente skenirane ✓</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {result.alreadyScanned && result.componentName && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                      <p className="font-medium">Komponenta &quot;{result.componentName}&quot; već skenirana</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {!result.alreadyScanned && result.componentName && !result.isComplete && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-green-700">
                      <Package className="h-5 w-5" />
                      <p className="font-medium">Komponenta &quot;{result.componentName}&quot; skenirana ✓</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Komponente pakovanja
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.allComponents.map((comp) => (
                      <li key={comp.name} className="flex items-center justify-between rounded-md border px-4 py-3">
                        <span className="text-sm font-medium">{comp.name}</span>
                        {comp.scanned ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">✓ Skenirano</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">○ Čeka</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}

          {/* Part identifier details */}
          {result.barcode.type === "part_identifier" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Detalji dijela
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {result.partName && (
                    <div>
                      <dt className="text-muted-foreground">Naziv dijela</dt>
                      <dd className="font-medium">{result.partName}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Dimenzije</dt>
                    <dd className="font-medium">{result.dimensions || "—"}</dd>
                  </div>
                  {result.productionOrderRef && (
                    <div>
                      <dt className="text-muted-foreground">PO referenca</dt>
                      <dd className="font-medium font-mono text-xs">
                        {result.productionOrderRef.substring(0, 8)}
                      </dd>
                    </div>
                  )}
                  {result.barcode.itemIndex != null && (
                    <div>
                      <dt className="text-muted-foreground">Stavka #</dt>
                      <dd className="font-medium">{result.barcode.itemIndex + 1}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Barkod</dt>
                    <dd className="font-medium font-mono text-xs">{result.barcode.value}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Work order details (for work_order type) */}
          {result.barcode.type === "work_order" && result.workOrder && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Radni nalog
                  </CardTitle>
                  <Badge variant={woStatusVariant[result.workOrder.status] ?? "secondary"}>
                    {woStatusLabels[result.workOrder.status] ?? result.workOrder.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Dio</dt>
                    <dd className="font-medium">{result.workOrder.articlePart.partName}</dd>
                  </div>
                  {result.stepName && (
                    <div>
                      <dt className="text-muted-foreground">Korak</dt>
                      <dd className="font-medium">
                        {result.stepSequence} od {result.totalSteps}: {result.stepName}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Dimenzije</dt>
                    <dd className="font-medium">
                      {result.workOrder.articlePart.dimensions || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Odjel</dt>
                    <dd className="font-medium">{result.workOrder.department.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stavka #</dt>
                    <dd className="font-medium">{result.workOrder.itemIndex + 1}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Proizvodni nalog</dt>
                    <dd className="font-medium font-mono text-xs">
                      {result.workOrder.productionOrder.id.substring(0, 8)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Barkod</dt>
                    <dd className="font-medium font-mono text-xs">{result.barcode.value}</dd>
                  </div>
                  {result.instructions && (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Instrukcije</dt>
                      <dd className="font-medium italic">{result.instructions}</dd>
                    </div>
                  )}
                  {result.estimatedTime && (
                    <div>
                      <dt className="text-muted-foreground">Procijenjeno vrijeme</dt>
                      <dd className="font-medium">{result.estimatedTime} min</dd>
                    </div>
                  )}
                  {result.workOrder.startedAt && (
                    <div>
                      <dt className="text-muted-foreground">Započeto</dt>
                      <dd className="font-medium">
                        {new Date(result.workOrder.startedAt).toLocaleString("bs")}
                      </dd>
                    </div>
                  )}
                  {result.workOrder.completedAt && (
                    <div>
                      <dt className="text-muted-foreground">Završeno</dt>
                      <dd className="font-medium">
                        {new Date(result.workOrder.completedAt).toLocaleString("bs")}
                      </dd>
                    </div>
                  )}
                  {result.workOrder.startedAt && result.workOrder.completedAt && (
                    <div>
                      <dt className="text-muted-foreground">Trajanje</dt>
                      <dd className="font-medium">
                        {formatDuration(result.workOrder.startedAt, result.workOrder.completedAt)}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Step progress visualization */}
          {result.stepsProgress && result.stepsProgress.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListOrdered className="h-4 w-4" />
                  Progres koraka
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {result.stepsProgress.map((step, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                        step.status === 'completed' ? 'bg-green-500' :
                        step.status === 'in_progress' ? 'bg-blue-500' :
                        'bg-gray-300'
                      }`}>
                        {step.stepSequence}
                      </div>
                      <span className="text-[10px] text-center text-muted-foreground leading-tight">
                        {step.stepName}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Product details */}
          {result.barcode.type === "product" && result.productionOrder && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Gotov proizvod
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Artikal</dt>
                    <dd className="font-medium">{result.productionOrder.article?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Proizvodni nalog</dt>
                    <dd className="font-medium font-mono text-xs">
                      {result.productionOrder.id.substring(0, 8)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Barkod</dt>
                    <dd className="font-medium font-mono text-xs">{result.barcode.value}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status naloga</dt>
                    <dd className="font-medium">{result.productionOrder.status}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Barcode label with print */}
          {result.barcode.imageBase64 && (
            <BarcodeLabel
              barcodeValue={result.barcode.value}
              imageBase64={result.barcode.imageBase64}
              type={result.barcode.type as "work_order" | "product" | "part_identifier"}
              partName={result.partName ?? result.workOrder?.articlePart.partName}
              dimensions={result.dimensions ?? result.workOrder?.articlePart.dimensions}
              notes={result.workOrder?.articlePart.notes}
              productionOrderId={
                result.productionOrderRef ?? result.workOrder?.productionOrder.id ?? result.productionOrder?.id
              }
              articleName={result.productionOrder?.article?.name}
            />
          )}
        </div>
      )}
    </div>
  );
}
