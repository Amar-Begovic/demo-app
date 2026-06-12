"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { archiveProductionOrder } from "@/app/actions/production-orders";

interface ArchiveButtonProps {
  orderId: string;
  orderStatus: string;
}

export function ArchiveButton({ orderId, orderStatus }: ArchiveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleArchive() {
    setLoading(true);
    try {
      await archiveProductionOrder(orderId);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={loading}
          aria-label="Arhiviraj nalog"
          title="Arhiviraj"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arhiviraj nalog</AlertDialogTitle>
          <AlertDialogDescription>
            {orderStatus === "in_progress"
              ? "Nalog je u izradi. Jeste li sigurni da želite arhivirati?"
              : "Jeste li sigurni da želite arhivirati ovaj nalog?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Odustani</AlertDialogCancel>
          <AlertDialogAction onClick={handleArchive}>
            Arhiviraj
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
