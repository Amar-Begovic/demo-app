"use client";

import { Button } from "@/components/ui/button";
import {
  getPresetDateRange,
  isValidDateRange,
  type DateRange,
  type PresetKey,
} from "@/lib/utils/filter-helpers";

interface ReportsDateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  activePreset: PresetKey | null;
  onRangeChange: (range: DateRange & { preset: PresetKey | null }) => void;
}

const presets: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Danas" },
  { key: "this_week", label: "Ova sedmica" },
  { key: "this_month", label: "Ovaj mjesec" },
  { key: "last_30_days", label: "Zadnjih 30 dana" },
];

export function ReportsDateRangeFilter({
  dateFrom,
  dateTo,
  activePreset,
  onRangeChange,
}: ReportsDateRangeFilterProps) {
  const hasError = !isValidDateRange(dateFrom || undefined, dateTo || undefined);

  function handlePresetClick(key: PresetKey) {
    const range = getPresetDateRange(key);
    onRangeChange({ ...range, preset: key });
  }

  function handleDateFromChange(value: string) {
    onRangeChange({ dateFrom: value, dateTo, preset: null });
  }

  function handleDateToChange(value: string) {
    onRangeChange({ dateFrom, dateTo: value, preset: null });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={activePreset === p.key ? "default" : "outline"}
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-date-from" className="text-sm font-medium">
            Od
          </label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className={`h-9 rounded-md border px-3 text-sm ${
              hasError ? "border-destructive" : "border-input"
            } bg-transparent`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-date-to" className="text-sm font-medium">
            Do
          </label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className={`h-9 rounded-md border px-3 text-sm ${
              hasError ? "border-destructive" : "border-input"
            } bg-transparent`}
          />
        </div>
      </div>

      {hasError && (
        <p className="text-sm text-destructive">
          Datum &apos;Od&apos; ne može biti nakon datuma &apos;Do&apos;
        </p>
      )}
    </div>
  );
}
