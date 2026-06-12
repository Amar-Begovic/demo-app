"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CategoryConfig } from "@/lib/types/category-config";
import { CreateCategoryItemDialog } from "./create-category-item-dialog";
import { EditCategoryItemDialog } from "./edit-category-item-dialog";

export interface CategoryItem {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  materialId: string | null;
  material: {
    id: string;
    name: string;
    code: string | null;
    unit: string;
    currentQuantity: number;
    minimumQuantity: number;
  } | null;
}

interface CategoryItemsListProps {
  items: CategoryItem[];
  config: CategoryConfig;
  createAction: (input: any) => Promise<any>;
  updateAction: (id: string, input: any) => Promise<any>;
  deleteAction: (id: string) => Promise<any>;
}

export function CategoryItemsList({
  items,
  config,
  createAction,
  updateAction,
  deleteAction,
}: CategoryItemsListProps) {
  const router = useRouter();
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm(config.deleteConfirmMessage)) return;
    setDeleting(id);
    try {
      await deleteAction(id);
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <CreateCategoryItemDialog
            config={config}
            createAction={createAction}
          />
        </div>
        <div className="text-center py-12 text-muted-foreground">
          {config.emptyStateMessage}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <CreateCategoryItemDialog
          config={config}
          createAction={createAction}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Naziv</TableHead>
            <TableHead>Šifra</TableHead>
            <TableHead>Opis</TableHead>
            <TableHead>Materijal / Zalihe</TableHead>
            <TableHead className="w-[100px]">Akcije</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{item.code || "-"}</TableCell>
              <TableCell className="max-w-[200px] truncate">
                {item.description || "-"}
              </TableCell>
              <TableCell>
                {item.material ? (
                  <div className="flex flex-col gap-1">
                    <span>
                      {item.material.name}{" "}
                      <span className="text-muted-foreground">
                        {item.material.currentQuantity} {item.material.unit}
                      </span>
                    </span>
                    {item.material.currentQuantity < item.material.minimumQuantity && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Niske zalihe
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Nema praćenja zaliha</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingItem(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingItem && (
        <EditCategoryItemDialog
          config={config}
          updateAction={updateAction}
          item={editingItem}
          open={!!editingItem}
          onOpenChange={(open) => !open && setEditingItem(null)}
        />
      )}
    </>
  );
}


