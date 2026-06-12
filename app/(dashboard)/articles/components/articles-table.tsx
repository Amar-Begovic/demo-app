"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye } from "lucide-react";
import { useArticleSelection } from "./article-selection-context";

interface ArticleRow {
  id: string;
  name: string;
  model: string | null;
  description: string | null;
  createdAt: string;
  _count: { parts: number };
}

interface ArticlesTableProps {
  data: ArticleRow[];
}

export function ArticlesTable({ data }: ArticlesTableProps) {
  const { toggle, toggleAll, isSelected, allSelected } = useArticleSelection();

  const allIds = data.map((a) => a.id);
  const allChecked = allSelected(allIds);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={allChecked}
                onCheckedChange={() => toggleAll(allIds)}
                aria-label="Odaberi sve"
              />
            </TableHead>
            <TableHead>Naziv</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Opis</TableHead>
            <TableHead>Dijelovi</TableHead>
            <TableHead>Kreirano</TableHead>
            <TableHead className="w-[80px]">Akcije</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-muted-foreground py-8"
              >
                Nema artikala. Dodajte prvi artikal.
              </TableCell>
            </TableRow>
          ) : (
            data.map((article) => (
              <TableRow key={article.id} data-state={isSelected(article.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={isSelected(article.id)}
                    onCheckedChange={() => toggle(article.id)}
                    aria-label={`Odaberi ${article.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{article.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {article.model || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {article.description || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {article._count.parts} {article._count.parts === 1 ? "dio" : "dijelova"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(article.createdAt).toLocaleDateString("bs")}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    asChild
                    aria-label={`Pogledaj ${article.name}`}
                  >
                    <Link href={`/articles/${article.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
