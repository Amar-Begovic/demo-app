"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Printer } from "lucide-react";
import {
  getPresetDateRange,
  isValidDateRange,
  type PresetKey,
} from "@/lib/utils/filter-helpers";
import type { PackagingCompletionStatus } from "@/lib/utils/packaging-filter-helpers";

export interface PackagingFilters {
  dateFrom: string;
  dateTo: string;
  datePreset: PresetKey | null;
  customerName: string;
  orderNumber: string;
  completionStatus: PackagingCompletionStatus;
  componentTypes: string[];
}

export interface PackagingFilterBarProps {
  filters: PackagingFilters;
  onFiltersChange: (filters: PackagingFilters) => void;
  availableComponentTypes: string[];
  hasActiveFilters: boolean;
  onReset: () => void;
}

const datePresets: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Danas" },
  { key: "this_week", label: "Ova sedmica" },
  { key: "this_month", label: "Ovaj mjesec" },
  { key: "last_30_days", label: "Zadnjih 30 dana" },
];

const completionStatusOptions: {
  value: PackagingCompletionStatus;
  label: string;
}[] = [
  { value: "all", label: "Sve" },
  { value: "fully_packed", label: "Zapakovano" },
  { value: "partially_packed", label: "Djelimično" },
  { value: "not_started", label: "Nije započeto" },
];

export function PackagingFilterBar({
  filters,
  onFiltersChange,
  availableComponentTypes,
  hasActiveFilters,
  onReset,
}: PackagingFilterBarProps) {
  const [customerInput, setCustomerInput] = useState(filters.customerName);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local customer input when filters reset externally
  useEffect(() => {
    setCustomerInput(filters.customerName);
  }, [filters.customerName]);

  const handleCustomerChange = useCallback(
    (value: string) => {
      setCustomerInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange({ ...filters, customerName: value });
      }, 300);
    },
    [filters, onFiltersChange]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const dateError = !isValidDateRange(
    filters.dateFrom || undefined,
    filters.dateTo || undefined
  );

  function handlePresetClick(key: PresetKey) {
    const range = getPresetDateRange(key);
    onFiltersChange({
      ...filters,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      datePreset: key,
    });
  }

  function handleDateFromChange(value: string) {
    onFiltersChange({ ...filters, dateFrom: value, datePreset: null });
  }

  function handleDateToChange(value: string) {
    onFiltersChange({ ...filters, dateTo: value, datePreset: null });
  }

  function handleOrderNumberChange(value: string) {
    onFiltersChange({ ...filters, orderNumber: value });
  }

  function handleCompletionStatusChange(value: string) {
    onFiltersChange({
      ...filters,
      completionStatus: value as PackagingCompletionStatus,
    });
  }

  function handleComponentTypeToggle(componentType: string) {
    const current = filters.componentTypes;
    const next = current.includes(componentType)
      ? current.filter((t) => t !== componentType)
      : [...current, componentType];
    onFiltersChange({ ...filters, componentTypes: next });
  }

  return (
    <div className="packaging-filter-controls flex flex-col gap-4">
      {/* Date range presets */}
      <div className="flex flex-wrap items-center gap-2">
        {datePresets.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={filters.datePreset === p.key ? "default" : "outline"}
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label htmlFor="pkg-date-from" className="text-sm font-medium">
            Od
          </label>
          <input
            id="pkg-date-from"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className={`h-9 rounded-md border px-3 text-sm ${
              dateError ? "border-destructive" : "border-input"
            } bg-transparent`}
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label htmlFor="pkg-date-to" className="text-sm font-medium">
            Do
          </label>
          <input
            id="pkg-date-to"
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className={`h-9 rounded-md border px-3 text-sm ${
              dateError ? "border-destructive" : "border-input"
            } bg-transparent`}
          />
        </div>

        {/* Customer name */}
        <div className="flex flex-col gap-1">
          <label htmlFor="pkg-customer" className="text-sm font-medium">
            Kupac
          </label>
          <Input
            id="pkg-customer"
            type="text"
            value={customerInput}
            onChange={(e) => handleCustomerChange(e.target.value)}
            placeholder="Pretraži kupca..."
            className="w-[200px]"
            aria-label="Filter po kupcu"
          />
        </div>

        {/* Order number */}
        <div className="flex flex-col gap-1">
          <label htmlFor="pkg-order-number" className="text-sm font-medium">
            Broj naloga
          </label>
          <Input
            id="pkg-order-number"
            type="text"
            value={filters.orderNumber}
            onChange={(e) => handleOrderNumberChange(e.target.value)}
            placeholder="Broj naloga..."
            className="w-[160px]"
            aria-label="Filter po broju naloga"
          />
        </div>

        {/* Completion status */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Status pakovanja</label>
          <Select
            value={filters.completionStatus}
            onValueChange={handleCompletionStatusChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status pakovanja" />
            </SelectTrigger>
            <SelectContent>
              {completionStatusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Component types multi-select */}
        {availableComponentTypes.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Tip komponente</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[200px] justify-start">
                  {filters.componentTypes.length > 0
                    ? `${filters.componentTypes.length} odabrano`
                    : "Sve komponente"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-2" align="start">
                <div className="flex flex-col gap-2">
                  {availableComponentTypes.map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={filters.componentTypes.includes(type)}
                        onCheckedChange={() => handleComponentTypeToggle(type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Reset button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="packaging-reset-button text-muted-foreground"
          >
            Resetuj filtere
          </Button>
        )}

        {/* Print button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="packaging-print-button ml-auto"
        >
          <Printer className="h-4 w-4 mr-2" />
          Štampaj
        </Button>
      </div>

      {/* Date validation error */}
      {dateError && (
        <p className="text-sm text-destructive">
          Datum &apos;Od&apos; ne može biti nakon datuma &apos;Do&apos;
        </p>
      )}
    </div>
  );
}
