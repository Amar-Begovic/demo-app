"use client";

import { useArticleSelection } from "./article-selection-context";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function SelectionToolbar() {
  const { count, clear } = useArticleSelection();

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
      <span className="text-sm font-medium">
        Odabrano: {count}
      </span>
      <Button variant="ghost" size="sm" onClick={clear}>
        <X className="h-4 w-4 mr-1" />
        Poništi
      </Button>
    </div>
  );
}
