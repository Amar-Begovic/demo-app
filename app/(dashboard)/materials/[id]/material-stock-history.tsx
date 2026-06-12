"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, TrendingUp } from "lucide-react";
import { StockHistoryTable } from "../components/stock-history-table";
import { StockHistoryChart } from "../components/stock-history-chart";

interface MaterialStockHistoryProps {
  materialId: string;
}

export function MaterialStockHistory({ materialId }: MaterialStockHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historija zaliha</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table" className="gap-1.5">
              <History className="h-4 w-4" />
              Tabela
            </TabsTrigger>
            <TabsTrigger value="chart" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              Grafikon
            </TabsTrigger>
          </TabsList>
          <TabsContent value="table" className="mt-4">
            <StockHistoryTable materialId={materialId} />
          </TabsContent>
          <TabsContent value="chart" className="mt-4">
            <StockHistoryChart materialId={materialId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
