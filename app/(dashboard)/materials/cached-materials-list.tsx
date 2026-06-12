"use cache";

import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaterialService } from "@/lib/services/material.service";
import { CACHE_TAGS } from "@/lib/cache/config";
import { PaginationControls } from "../components/pagination-controls";
import { EditMaterialDialog } from "./components/edit-material-dialog";

interface CachedMaterialsListProps {
  page: number;
  pageSize: number;
  search: string;
}

export async function CachedMaterialsList({ page, pageSize, search }: CachedMaterialsListProps) {
  cacheLife("days");
  cacheTag(CACHE_TAGS.MATERIALS);

  const { data, total } = await MaterialService.getAllPaginated({
    page,
    pageSize,
    search,
  });

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Šifra</TableHead>
              <TableHead>Naziv</TableHead>
              <TableHead>Jedinica</TableHead>
              <TableHead>Cijena</TableHead>
              <TableHead>Količina</TableHead>
              <TableHead>Minimum</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Akcije</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground py-8"
                >
                  {search
                    ? "Nema rezultata pretrage"
                    : "Nema materijala. Dodajte prvi materijal."}
                </TableCell>
              </TableRow>
            ) : (
              data.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="text-muted-foreground">
                    {material.code ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/materials/${material.id}`}
                      className="hover:underline"
                    >
                      {material.name}
                    </Link>
                  </TableCell>
                  <TableCell>{material.unit}</TableCell>
                  <TableCell>
                    {material.price != null
                      ? `${material.price.toFixed(2)} BAM`
                      : "—"}
                  </TableCell>
                  <TableCell>{material.currentQuantity}</TableCell>
                  <TableCell>{material.minimumQuantity}</TableCell>
                  <TableCell>
                    {material.currentQuantity < material.minimumQuantity ? (
                      <Badge variant="destructive">Niske zalihe</Badge>
                    ) : (
                      <Badge variant="secondary">U redu</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <EditMaterialDialog material={material} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationControls page={page} total={total} pageSize={pageSize} />
    </>
  );
}
