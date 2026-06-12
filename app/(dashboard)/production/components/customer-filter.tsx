"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

export function CustomerFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const initialValue = searchParams.get("customer") ?? "";
  const [value, setValue] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when URL param changes externally
  useEffect(() => {
    setValue(searchParams.get("customer") ?? "");
  }, [searchParams]);

  function handleChange(newValue: string) {
    setValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue.trim()) {
        params.set("customer", newValue.trim());
      } else {
        params.delete("customer");
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    }, 300);
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Pretraži kupca..."
      className="h-9 w-[200px] rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground"
      aria-label="Filter po kupcu"
    />
  );
}
