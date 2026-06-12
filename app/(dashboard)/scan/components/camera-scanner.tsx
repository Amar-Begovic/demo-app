"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScanFeedback } from "./scan-feedback";

interface CameraScannerProps {
  onScan: (barcodeValue: string) => void;
  paused: boolean;
  feedbackState: "idle" | "success" | "error";
  onClose: () => void;
}

export function CameraScanner({
  onScan,
  paused,
  feedbackState,
  onClose,
}: CameraScannerProps) {
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const startScanner = useCallback(async () => {
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("camera-scanner-container", {
        formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 300, height: 150 } },
        (decodedText: string) => {
          if (!pausedRef.current) {
            onScanRef.current(decodedText);
          }
        },
        () => {
          // ignore scan failures — library keeps trying
        }
      );
      setReady(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Pristup kameri je odbijen. Molimo dozvolite pristup u postavkama preglednika."
          : "Vaš preglednik ne podržava pristup kameri";
      setError(message);
    }
  }, []);

  useEffect(() => {
    startScanner();

    return () => {
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [startScanner]);

  const handleClose = useCallback(() => {
    const scanner = scannerRef.current;
    if (scanner) {
      scanner.stop().catch(() => {});
      scannerRef.current = null;
    }
    onClose();
  }, [onClose]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
        <Camera className="mx-auto h-10 w-10 text-destructive mb-3" />
        <p className="text-destructive font-medium">{error}</p>
        <Button variant="outline" className="mt-4" onClick={onClose}>
          Zatvori
        </Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div id="camera-scanner-container" className="relative overflow-hidden rounded-lg" />
      {ready && <ScanFeedback state={feedbackState} onAnimationComplete={() => {}} />}
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-2 right-2 z-20 h-8 w-8 rounded-full"
        onClick={handleClose}
        aria-label="Zatvori kameru"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
