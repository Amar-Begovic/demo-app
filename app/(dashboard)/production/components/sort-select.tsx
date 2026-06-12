"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const sortOptions = [
  { value: "createdAt", label: "Datum kreiranja" },
  { value: "deadline", label: "Rok isporuke" },
];

export function SortSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "createdAt";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "createdAt") {
      params.set("sort", value);
    } else {
      params.delete("sort");
    }
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Sortiraj po" />
      </SelectTrigger>
      <SelectContent>
        {sortOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
