"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import {
  markReceived,
  changeSupplier,
  getAvailableSuppliers,
  generateEmailTemplate,
} from "@/app/actions/purchase-orders";

interface PurchaseOrderRow {
  id: string;
  requiredQuantity: number;
  status: string;
  material: { id: string; name: string; unit: string };
  supplier: { id: string; companyName: string } | null;
}

interface PurchaseActionsProps {
  order: PurchaseOrderRow;
}

export function PurchaseActions({ order }: PurchaseActionsProps) {
  const router = useRouter();
  const [receivingId, setReceivingId] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMarkReceived() {
    setReceivingId(true);
    setError(null);
    const result = await markReceived(order.id);
    if (!result.success) {
      setError(result.error);
    }
    router.refresh();
    setReceivingId(false);
  }

  async function handleSendEmail() {
    const result = await generateEmailTemplate(order.id);
    if (!result.success) return;
    const { to, subject, body } = result.data;
    const mailto = `mailto:${to ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_self");
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-1">
        {order.supplier && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSendEmail}
            title="Pošalji email dobavljaču"
          >
            <Mail className="h-4 w-4" />
          </Button>
        )}
        {order.status !== "received" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkReceived}
            disabled={receivingId}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {receivingId ? "..." : "Primljeno"}
          </Button>
        )}
      </div>
    </div>
  );
}

interface SupplierCellProps {
  order: PurchaseOrderRow;
}

export function SupplierCell({ order }: SupplierCellProps) {
  const router = useRouter();
  const [availableSuppliers, setAvailableSuppliers] = useState<
    { id: string; companyName: string }[] | null
  >(null);
  const [changing, setChanging] = useState(false);

  // Non-pending orders: just show supplier name or warning
  if (order.status !== "pending") {
    if (!order.supplier) {
      return (
        <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
          <AlertTriangle className="h-3 w-3" />
          Nema dobavljača
        </span>
      );
    }
    return <>{order.supplier.companyName}</>;
  }

  async function fetchSuppliers() {
    if (availableSuppliers !== null) return;
    const result = await getAvailableSuppliers(order.material.id);
    if (result.success) {
      setAvailableSuppliers(result.data);
    }
  }

  async function handleChange(value: string) {
    setChanging(true);
    await changeSupplier(order.id, value === "none" ? null : value);
    router.refresh();
    setChanging(false);
  }

  // If fetched and no suppliers available
  if (availableSuppliers && availableSuppliers.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
        <AlertTriangle className="h-3 w-3" />
        Nema dobavljača
      </span>
    );
  }

  // If fetched, only one supplier, and it's already selected
  if (
    availableSuppliers &&
    availableSuppliers.length === 1 &&
    order.supplier?.id === availableSuppliers[0].id
  ) {
    return <>{order.supplier.companyName}</>;
  }

  return (
    <Select
      value={order.supplier?.id ?? "none"}
      onValueChange={handleChange}
      onOpenChange={(open) => {
        if (open) fetchSuppliers();
      }}
      disabled={changing}
    >
      <SelectTrigger className="h-8 text-xs w-[180px]">
        <SelectValue placeholder="Odaberi dobavljača" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Bez dobavljača</SelectItem>
        {(availableSuppliers ?? []).map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.companyName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
