"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface ScanFeedbackProps {
  state: "idle" | "success" | "error";
  onAnimationComplete: () => void;
}

export function ScanFeedback({ state, onAnimationComplete }: ScanFeedbackProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state === "idle") {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onAnimationComplete();
    }, 1000);

    return () => clearTimeout(timer);
  }, [state, onAnimationComplete]);

  if (state === "idle") return null;

  const bgColor = state === "success"
    ? "bg-green-500/40"
    : "bg-red-500/40";

  const Icon = state === "success" ? CheckCircle2 : XCircle;
  const iconColor = state === "success" ? "text-green-100" : "text-red-100";

  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300 ${bgColor} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
      role="status"
    >
      <Icon className={`h-16 w-16 ${iconColor}`} />
    </div>
  );
}
