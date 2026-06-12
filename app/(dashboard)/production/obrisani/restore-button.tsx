"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArchiveRestore } from "lucide-react";
import { restoreProductionOrder } from "@/app/actions/production-orders";

interface RestoreButtonProps {
  orderId: string;
}

export function RestoreButton({ orderId }: RestoreButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRestore() {
    setLoading(true);
    try {
      const result = await restoreProductionOrder(orderId);
      if (result.success) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleRestore}
      disabled={loading}
      aria-label="Vrati nalog"
      title="Vrati"
    >
      <ArchiveRestore className="h-4 w-4" />
    </Button>
  );
}
