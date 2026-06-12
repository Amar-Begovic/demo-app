"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statusOptions = [
  { value: "all", label: "Svi statusi" },
  { value: "pending", label: "Čeka" },
  { value: "ordered", label: "Naručeno" },
  { value: "received", label: "Primljeno" },
];

export function PurchaseStatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "all";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    // Reset page when filter changes
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={current} onValueChange={handleChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Filtriraj po statusu" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
