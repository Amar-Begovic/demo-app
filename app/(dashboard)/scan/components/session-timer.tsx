"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatElapsedTime } from "@/lib/utils/scan-helpers";

interface SessionTimerProps {
  startTime: Date | null;
  isActive: boolean;
}

export function SessionTimer({ startTime, isActive }: SessionTimerProps) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!startTime || !isActive) return;

    const tick = () => setElapsed(formatElapsedTime(startTime, new Date()));
    tick();

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime, isActive]);

  if (!startTime) return null;

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      <span>Početak: {startTime.toLocaleTimeString("bs")}</span>
      {isActive && (
        <>
          <span className="text-muted-foreground/50">|</span>
          <span className="font-mono tabular-nums">{elapsed}</span>
        </>
      )}
    </div>
  );
}
