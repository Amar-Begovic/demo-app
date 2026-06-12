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
import { deleteFabric } from "@/app/actions/fabrics";
import { EditFabricDialog } from "./edit-fabric-dialog";
import type { FabricWithMaterial } from "@/lib/services/fabric.service";

interface FabricsListProps {
  fabrics: FabricWithMaterial[];
}

export function FabricsList({ fabrics }: FabricsListProps) {
  const router = useRouter();
  const [editingFabric, setEditingFabric] = useState<FabricWithMaterial | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Jeste li sigurni da želite obrisati ovaj stof?")) return;
    setDeleting(id);
    try {
      await deleteFabric(id);
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (fabrics.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nema stofova. Dodajte prvi stof klikom na &quot;Novi stof&quot;.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Naziv</TableHead>
            <TableHead>Šifra</TableHead>
            <TableHead>Boja</TableHead>
            <TableHead>Opis</TableHead>
            <TableHead>Materijal / Zalihe</TableHead>
            <TableHead className="w-[100px]">Akcije</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fabrics.map((fabric) => (
            <TableRow key={fabric.id}>
              <TableCell className="font-medium">{fabric.name}</TableCell>
              <TableCell>{fabric.code || "-"}</TableCell>
              <TableCell>
                {fabric.color ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded border"
                      style={{ backgroundColor: fabric.color }}
                    />
                    {fabric.color}
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {fabric.description || "-"}
              </TableCell>
              <TableCell>
                {fabric.material ? (
                  <div className="flex flex-col gap-1">
                    <span>
                      {fabric.material.name}{" "}
                      <span className="text-muted-foreground">
                        {fabric.material.currentQuantity} {fabric.material.unit}
                      </span>
                    </span>
                    {fabric.material.currentQuantity < fabric.material.minimumQuantity && (
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
                    onClick={() => setEditingFabric(fabric)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(fabric.id)}
                    disabled={deleting === fabric.id}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingFabric && (
        <EditFabricDialog
          fabric={editingFabric}
          open={!!editingFabric}
          onOpenChange={(open) => !open && setEditingFabric(null)}
        />
      )}
    </>
  );
}
