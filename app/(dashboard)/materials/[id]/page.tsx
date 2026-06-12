import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MaterialService } from "@/lib/services/material.service";
import { PurchaseHistory } from "@/app/(dashboard)/materials/[id]/purchase-history";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MaterialDetailPage({ params }: PageProps) {
  const { id } = await params;
  const material = await MaterialService.getById(id);

  if (!material) {
    notFound();
  }

  const isLowStock = material.currentQuantity < material.minimumQuantity;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/materials" aria-label="Nazad na listu materijala">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{material.name}</h1>
          <p className="text-muted-foreground">
            {material.code ? `Šifra: ${material.code}` : "Detalji materijala"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Trenutna količina
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Number(material.currentQuantity.toFixed(4))} {material.unit}
            </div>
            {isLowStock && (
              <Badge variant="destructive" className="mt-1">Niske zalihe</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Minimalna količina
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Number(material.minimumQuantity.toFixed(4))} {material.unit}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cijena
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {material.price != null ? `${material.price.toFixed(2)} BAM` : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Jedinica mjere
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{material.unit}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historija nabavki</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseHistory materialId={material.id} />
        </CardContent>
      </Card>
    </div>
  );
}
