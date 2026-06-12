"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useArticleSelection } from "./article-selection-context";

interface PrintButtonProps {
  baseUrl: string;
}

export function ArticlePrintButton({ baseUrl }: PrintButtonProps) {
  const { selectedIds, count } = useArticleSelection();

  function handleClick() {
    let url = baseUrl;
    if (count > 0) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}ids=${Array.from(selectedIds).join(",")}`;
    }
    window.open(url, "_blank");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <Printer className="h-4 w-4 mr-1" />
      {count > 0 ? `Štampa utroška (${count})` : "Štampa utroška"}
    </Button>
  );
}
