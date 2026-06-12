"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CostBreakdown } from "@/lib/utils/calculations";

interface CostBreakdownProps {
  data: CostBreakdown;
}

export default function CostBreakdownDisplay({ data }: CostBreakdownProps) {
  // Collect all unique missing-price material names across articles
  const allMissingMaterials = data.articleCosts
    .flatMap((ac) => ac.missingPriceMaterials)
    .filter((name, i, arr) => arr.indexOf(name) === i);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Kalkulacija troškova
        </CardTitle>
        {!data.isComplete && (
          <CardDescription className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Nepotpuna kalkulacija — neki materijali nemaju unesenu cijenu
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikal</TableHead>
                <TableHead>Količina</TableHead>
                <TableHead>Trošak/kom</TableHead>
                <TableHead>Ukupni trošak</TableHead>
                <TableHead>Prodajna cijena</TableHead>
                <TableHead>Marža/kom</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.articleCosts.map((ac) => (
                <TableRow key={ac.articleId}>
                  <TableCell className="font-medium">{ac.articleName}</TableCell>
                  <TableCell>{ac.quantity}</TableCell>
                  <TableCell>{ac.materialCostPerUnit.toFixed(2)} BAM</TableCell>
                  <TableCell>{ac.totalMaterialCost.toFixed(2)} BAM</TableCell>
                  <TableCell>
                    {ac.sellingPrice !== null
                      ? `${ac.sellingPrice.toFixed(2)} BAM`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {ac.margin !== null ? (
                      <span
                        className={cn(
                          ac.margin >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        )}
                      >
                        {ac.margin.toFixed(2)} BAM
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {ac.incomplete ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500 text-amber-600 dark:text-amber-400"
                      >
                        Nepotpuno
                      </Badge>
                    ) : (
                      <Badge variant="secondary">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Totals row */}
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="font-medium">Ukupno</span>
            <div className="flex gap-6">
              <span>
                Trošak:{" "}
                <span className="font-medium">
                  {data.totalMaterialCost.toFixed(2)} BAM
                </span>
              </span>
              {data.totalSellingPrice !== null && (
                <span>
                  Prodaja:{" "}
                  <span className="font-medium">
                    {data.totalSellingPrice.toFixed(2)} BAM
                  </span>
                </span>
              )}
              {data.totalMargin !== null && (
                <span>
                  Marža:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      data.totalMargin >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {data.totalMargin.toFixed(2)} BAM
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Missing price materials warning */}
          {!data.isComplete && allMissingMaterials.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                Materijali bez cijene:
              </p>
              <ul className="text-sm text-amber-700 dark:text-amber-400 list-disc list-inside">
                {allMissingMaterials.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
