"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SupplierService } from "@/lib/services/supplier.service";
import { CACHE_TAGS } from "@/lib/cache/config";
import { PaginationControls } from "../components/pagination-controls";

interface CachedSuppliersListProps {
  page: number;
  pageSize: number;
}

export async function CachedSuppliersList({ page, pageSize }: CachedSuppliersListProps) {
  cacheLife("max");
  cacheTag(CACHE_TAGS.SUPPLIERS);

  const { data, total } = await SupplierService.getAllPaginated({ page, pageSize });

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naziv firme</TableHead>
              <TableHead>Šifra</TableHead>
              <TableHead>Mjesto</TableHead>
              <TableHead>Država</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Materijali</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  Nema dobavljača. Dodajte prvog dobavljača.
                </TableCell>
              </TableRow>
            ) : (
              data.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">
                    {supplier.companyName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.code || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.city || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.country || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.contactEmail || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.contactPhone || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {supplier.materials.length === 0 ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        supplier.materials.map((sm) => (
                          <Badge key={sm.material.id} variant="secondary">
                            {sm.material.name}
                          </Badge>
                        ))
                      )}
                    </div>
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
