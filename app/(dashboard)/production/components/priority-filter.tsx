"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const priorityOptions = [
  { value: "all", label: "Svi prioriteti" },
  { value: "urgent", label: "Hitan" },
  { value: "normal", label: "Normalan" },
  { value: "low", label: "Nizak" },
];

export function PriorityFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("priority") ?? "all";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("priority", value);
    } else {
      params.delete("priority");
    }
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Filtriraj po prioritetu" />
      </SelectTrigger>
      <SelectContent>
        {priorityOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
