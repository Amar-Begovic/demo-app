"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { isValidDateRange } from "@/lib/utils/filter-helpers";

export function DateRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const hasError = !isValidDateRange(dateFrom || undefined, dateTo || undefined);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => updateParam("dateFrom", e.target.value)}
        className={`h-9 rounded-md border px-3 text-sm ${hasError ? "border-red-500" : "border-input"} bg-transparent`}
        aria-label="Datum od"
      />
      <span className="text-sm text-muted-foreground">—</span>
      <input
        type="date"
        value={dateTo}
        onChange={(e) => updateParam("dateTo", e.target.value)}
        className={`h-9 rounded-md border px-3 text-sm ${hasError ? "border-red-500" : "border-input"} bg-transparent`}
        aria-label="Datum do"
      />
    </div>
  );
}
