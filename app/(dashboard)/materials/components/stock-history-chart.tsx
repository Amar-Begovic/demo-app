"use client";

import { useState, useEffect } from "react";

interface StockHistoryEntry {
  id: string;
  changeType: "inflow" | "outflow" | "adjustment";
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  createdAt: string;
}

interface StockHistoryChartProps {
  materialId: string;
}

export function StockHistoryChart({ materialId }: StockHistoryChartProps) {
  const [entries, setEntries] = useState<StockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/materials/${materialId}/history`);
        if (res.ok) {
          const data: StockHistoryEntry[] = await res.json();
          setEntries(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [materialId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        Učitavanje grafikona…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        Nema podataka za prikaz grafikona
      </div>
    );
  }

  // Entries come sorted newest-first from API; reverse for chronological order
  const chronological = [...entries].reverse();

  // Build data points: start with the first entry's previousQuantity, then each newQuantity
  const points: { date: string; value: number }[] = [];
  if (chronological.length > 0) {
    points.push({
      date: chronological[0].createdAt,
      value: chronological[0].previousQuantity,
    });
  }
  for (const entry of chronological) {
    points.push({
      date: entry.createdAt,
      value: entry.newQuantity,
    });
  }

  // SVG dimensions
  const width = 700;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  function scaleX(i: number) {
    return padding.left + (points.length <= 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
  }

  function scaleY(val: number) {
    return padding.top + chartH - ((val - minVal) / range) * chartH;
  }

  // Build SVG path
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(p.value).toFixed(1)}`)
    .join(" ");

  // Area fill path
  const areaD = `${pathD} L ${scaleX(points.length - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${scaleX(0).toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

  // Y-axis ticks (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range * i) / 4;
    return { val, y: scaleY(val) };
  });

  // X-axis labels (show up to 5 evenly spaced dates)
  const labelCount = Math.min(5, points.length);
  const xLabels = Array.from({ length: labelCount }, (_, i) => {
    const idx = points.length <= 1 ? 0 : Math.round((i / (labelCount - 1)) * (points.length - 1));
    return {
      x: scaleX(idx),
      label: new Date(points[idx].date).toLocaleDateString("bs", {
        day: "2-digit",
        month: "2-digit",
      }),
    };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-[700px]"
        role="img"
        aria-label="Grafikon kretanja zaliha"
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={tick.y}
            x2={width - padding.right}
            y2={tick.y}
            className="stroke-muted"
            strokeWidth={0.5}
          />
        ))}

        {/* Area fill */}
        <path d={areaD} className="fill-primary/10" />

        {/* Line */}
        <path d={pathD} className="stroke-primary" strokeWidth={2} fill="none" />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={scaleX(i)}
            cy={scaleY(p.value)}
            r={3}
            className="fill-primary"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={i}
            x={padding.left - 8}
            y={tick.y + 4}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {tick.val % 1 === 0 ? tick.val : tick.val.toFixed(1)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={height - 5}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {label.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
