"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

export function MaterialSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  function handleChange(term: string) {
    setValue(term);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) {
        params.set("search", term);
      } else {
        params.delete("search");
      }
      params.delete("page");
      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pretraži materijale..."
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="pl-8"
        />
      </div>
    </div>
  );
}
