"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  Ban,
  CircleCheckBig,
  ClipboardCheck,
  Camera,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CameraScanner } from "@/app/(dashboard)/scan/components/camera-scanner";
import { SessionTimer } from "@/app/(dashboard)/scan/components/session-timer";
import {
  determineFeedbackState,
  buildScanRequestBody,
} from "@/lib/utils/scan-helpers";
import { vibrateSuccess, vibrateError } from "@/lib/utils/vibration";

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
      materials: { material: { name: string; unit: string }; quantity: number }[];
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
    article: { name: string };
  };
  stepName?: string;
  stepSequence?: number;
  totalSteps?: number;
  currentStep?: number;
  departmentName?: string;
  instructions?: string | null;
  estimatedTime?: number | null;
  stepsProgress?: {
    stepName: string;
    stepSequence: number | null;
    departmentName: string;
    status: string;
  }[];
  action:
    | "started"
    | "completed"
    | "needs_confirmation"
    | "blocked"
    | "none"
    | "all_completed"
    | "wrong_department";
  reason?: string;
  partName?: string;
  dimensions?: string | null;
  productionOrderRef?: string;
  blockingStep?: {
    stepName: string;
    stepSequence: number;
    departmentName: string;
  };
  expectedDepartment?: { id: string; name: string };
  incompleteSteps?: {
    stepName: string;
    stepSequence: number | null;
    departmentName: string;
    status: string;
  }[];
}

interface MobileScannerClientProps {
  departmentId: string;
  departmentName: string;
}

export default function MobileScannerClient({
  departmentId,
  departmentName,
}: MobileScannerClientProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [scanPaused, setScanPaused] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastActionRef = useRef<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  // Auto-activate camera on mount
  useEffect(() => {
    setCameraActive(true);
    setSessionStartTime(new Date());
  }, []);

  // Auto-resume scanning after feedback animation (1.2s delay)
  useEffect(() => {
    if (feedbackState === "idle") return;
    const timer = setTimeout(() => {
      setFeedbackState("idle");
      if (lastActionRef.current !== "needs_confirmation") {
        setScanPaused(false);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [feedbackState]);

  const handleScan = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      setLoading(true);
      setScanPaused(true);
      setError(null);
      setResult(null);

      try {
        const body = buildScanRequestBody(trimmed, departmentId);
        const res = await fetch("/api/barcodes/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "Greška pri skeniranju");
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
      }
    },
    [departmentId]
  );

  async function handleConfirmComplete(workOrderId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await res.json();
        setResult((prev) =>
          prev ? { ...prev, workOrder: updated, action: "completed" } : null
        );
        vibrateSuccess();
        setFeedbackState("success");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Greška pri završavanju");
        vibrateError();
      }
    } catch {
      setError("Greška pri završavanju radnog naloga");
      vibrateError();
    } finally {
      setLoading(false);
      setScanPaused(false);
      setFeedbackState("idle");
    }
  }

  function handleCancelConfirmation() {
    setResult(null);
    setScanPaused(false);
    setFeedbackState("idle");
  }

  function handleCloseCamera() {
    setCameraActive(false);
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-green-600 text-white">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{departmentName}</h1>
        </div>
        <SessionTimer startTime={sessionStartTime} isActive={cameraActive} />
      </div>

      {/* Camera area */}
      <div className="flex-1 relative min-h-0">
        {cameraActive ? (
          <CameraScanner
            onScan={handleScan}
            paused={scanPaused}
            feedbackState={feedbackState}
            onClose={handleCloseCamera}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
            <p className="text-sm text-muted-foreground text-center">
              Kamera je zatvorena. Unesite barkod ručno ili ponovo otvorite kameru.
            </p>
            <form
              className="w-full max-w-sm flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manualCode.trim()) {
                  handleScan(manualCode.trim());
                  setManualCode("");
                }
              }}
            >
              <Input
                type="text"
                placeholder="Unesite barkod..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 min-h-[44px]"
                autoFocus
              />
              <Button type="submit" disabled={loading || !manualCode.trim()} className="min-h-[44px]">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setCameraActive(true)}
            >
              <Camera className="h-4 w-4 mr-2" />
              Otvori kameru
            </Button>
          </div>
        )}
      </div>

      {/* Result area */}
      <div className="shrink-0 px-3 py-2 space-y-2 max-h-[40dvh] overflow-y-auto">
        {loading && (
          <p className="text-sm text-muted-foreground text-center">
            Učitavanje...
          </p>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        {result && <ResultCard result={result} loading={loading} onConfirm={handleConfirmComplete} onCancel={handleCancelConfirmation} />}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  loading,
  onConfirm,
  onCancel,
}: {
  result: ScanResult;
  loading: boolean;
  onConfirm: (workOrderId: string) => void;
  onCancel: () => void;
}) {
  switch (result.action) {
    case "started":
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 text-green-700">
            <Play className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Korak {result.currentStep ?? result.stepSequence} od{" "}
              {result.totalSteps} pokrenut:{" "}
              {result.stepName ??
                result.workOrder?.productionStep?.stepName ??
                ""}
            </p>
          </div>
        </div>
      );

    case "completed":
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">Radni nalog završen</p>
          </div>
        </div>
      );

    case "needs_confirmation":
      if (!result.workOrder) return null;
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
          <div className="flex items-center gap-2 text-amber-800">
            <ClipboardCheck className="h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">Potvrda završetka</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-white p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dio:</span>
              <span className="font-medium">
                {result.workOrder.articlePart.partName}
              </span>
            </div>
            {result.workOrder.articlePart.dimensions && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dimenzije:</span>
                <span className="font-medium">
                  {result.workOrder.articlePart.dimensions}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Odjel:</span>
              <span className="font-medium">
                {result.workOrder.department.name}
              </span>
            </div>
            {(result.stepName ||
              result.workOrder.productionStep?.stepName) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Korak:</span>
                <span className="font-medium">
                  {result.stepSequence ?? result.currentStep} od{" "}
                  {result.totalSteps}:{" "}
                  {result.stepName ??
                    result.workOrder.productionStep?.stepName}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onConfirm(result.workOrder!.id)}
              disabled={loading}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Potvrdi završetak
            </Button>
            <Button
              variant="outline"
              className="flex-1 min-h-[44px]"
              onClick={onCancel}
              disabled={loading}
            >
              Otkaži
            </Button>
          </div>
        </div>
      );

    case "blocked":
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              {result.blockingStep
                ? `Blokirano: korak "${result.blockingStep.stepName}" (${result.blockingStep.stepSequence}) u odjelu ${result.blockingStep.departmentName} mora biti završen`
                : result.reason || "Prethodni korak nije završen"}
            </p>
          </div>
        </div>
      );

    case "wrong_department":
      return (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
          <div className="flex items-center gap-2 text-orange-700">
            <Ban className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Ovaj korak se radi u odjelu{" "}
              {result.expectedDepartment?.name ?? "nepoznat"}
            </p>
          </div>
        </div>
      );

    case "all_completed":
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 text-green-700">
            <CircleCheckBig className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">Svi koraci završeni</p>
          </div>
        </div>
      );

    default:
      return null;
  }
}
