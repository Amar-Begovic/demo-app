"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export function ArticleSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const bomFilter = searchParams.get("bom") ?? "all";
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  function navigate(params: URLSearchParams) {
    params.delete("page");
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function doSearch(term: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (term) {
      params.set("search", term);
    } else {
      params.delete("search");
    }
    navigate(params);
  }

  function setBomFilter(filter: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") {
      params.delete("bom");
    } else {
      params.set("bom", filter);
    }
    navigate(params);
  }

  function handleChange(term: string) {
    setValue(term);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => doSearch(term), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      doSearch(value);
    }
  }

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pretraži artikle..."
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-8"
        />
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant={bomFilter === "all" ? "default" : "outline"} onClick={() => setBomFilter("all")}>
          Svi
        </Button>
        <Button size="sm" variant={bomFilter === "has" ? "default" : "outline"} onClick={() => setBomFilter("has")}>
          Sa BOM
        </Button>
        <Button size="sm" variant={bomFilter === "empty" ? "default" : "outline"} onClick={() => setBomFilter("empty")}>
          Bez BOM
        </Button>
      </div>
    </div>
  );
}
