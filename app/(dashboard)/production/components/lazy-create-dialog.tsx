"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { CreateProductionOrderDialog } from "./create-production-order-dialog";

interface Article {
  id: string;
  name: string;
  code?: string | null;
}

interface Fabric {
  id: string;
  name: string;
  color?: string | null;
  code?: string | null;
}

interface Partner {
  id: string;
  companyName: string;
  city?: string | null;
  phone?: string | null;
  address?: string | null;
}

interface CategoryItem {
  id: string;
  name: string;
}

interface DialogData {
  articles: Article[];
  fabrics: Fabric[];
  partners: Partner[];
  rucke: CategoryItem[];
  paspuli: CategoryItem[];
  nogice: CategoryItem[];
}

/**
 * Lazy-loading wrapper for CreateProductionOrderDialog.
 * Fetches articles/fabrics/partners only when the user clicks "Novi nalog",
 * avoiding heavy queries on initial page load.
 */
export function LazyCreateDialog() {
  const [data, setData] = useState<DialogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const handleClick = useCallback(async () => {
    if (data) {
      // Already loaded — just show the dialog
      setReady(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/production-orders/dialog-data");
      if (!res.ok) throw new Error("Failed to fetch dialog data");
      const json = await res.json();
      setData(json);
      setReady(true);
    } catch (err) {
      console.error("Error loading dialog data:", err);
    } finally {
      setLoading(false);
    }
  }, [data]);

  if (ready && data) {
    return (
      <CreateProductionOrderDialog
        articles={data.articles}
        fabrics={data.fabrics}
        partners={data.partners}
        rucke={data.rucke}
        paspuli={data.paspuli}
        nogice={data.nogice}
      />
    );
  }

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      Novi nalog
    </Button>
  );
}
