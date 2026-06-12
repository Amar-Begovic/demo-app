"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  total: number;
  pageSize: number;
}

export function PaginationControls({ page, total, pageSize }: PaginationControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  function navigate(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  }

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Ukupno {total} stavki
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(page - 1)}
          disabled={page <= 1}
        >
          Prethodna
        </Button>
        <span className="text-sm text-muted-foreground">
          Stranica {page} od {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(page + 1)}
          disabled={page >= totalPages}
        >
          Sljedeća
        </Button>
      </div>
    </div>
  );
}
