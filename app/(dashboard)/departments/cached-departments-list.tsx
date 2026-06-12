"use cache";

import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, LayoutDashboard } from "lucide-react";
import { DepartmentService } from "@/lib/services/department.service";
import { CACHE_TAGS } from "@/lib/cache/config";
import { PaginationControls } from "../components/pagination-controls";

interface CachedDepartmentsListProps {
  page: number;
  pageSize: number;
}

export async function CachedDepartmentsList({ page, pageSize }: CachedDepartmentsListProps) {
  cacheLife("max");
  cacheTag(CACHE_TAGS.DEPARTMENTS);

  const { data, total } = await DepartmentService.getAllPaginated({ page, pageSize });

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naziv</TableHead>
              <TableHead>Opis</TableHead>
              <TableHead>Kreirano</TableHead>
              <TableHead className="w-[120px]">Akcije</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-8"
                >
                  Nema odjela. Dodajte prvi odjel.
                </TableCell>
              </TableRow>
            ) : (
              data.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {dept.description || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(dept.createdAt).toLocaleDateString("bs")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        asChild
                        aria-label={`Prikaži ${dept.name}`}
                      >
                        <Link href={`/departments/${dept.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        asChild
                        aria-label={`Board ${dept.name}`}
                      >
                        <Link href={`/departments/${dept.id}/board`}>
                          <LayoutDashboard className="h-4 w-4" />
                        </Link>
                      </Button>
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
