"use client";

import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Printer } from "lucide-react";

interface BarcodeLabelProps {
  barcodeValue: string;
  imageBase64: string;
  partName?: string;
  dimensions?: string | null;
  notes?: string | null;
  materials?: string[];
  productionOrderId?: string;
  articleName?: string;
  customerName?: string | null;
  partIndex?: string;
  type: "work_order" | "product" | "part_identifier";
}

export function BarcodeLabel({
  barcodeValue,
  imageBase64,
  partName,
  dimensions,
  notes,
  materials,
  productionOrderId,
  articleName,
  customerName,
  partIndex,
  type,
}: BarcodeLabelProps) {
  const labelRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    if (!labelRef.current) return;

    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow) return;

    const orderRef = productionOrderId ? productionOrderId.substring(0, 8) : "";

    const materialsHtml = materials && materials.length > 0
      ? `<div class="materials"><strong>Materijali:</strong>${materials.map((m) => `<span>${m}</span>`).join("")}</div>`
      : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barkod - ${barcodeValue}</title>
          <style>
            body {
              margin: 0;
              padding: 16px;
              font-family: sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .label {
              text-align: center;
              padding: 12px;
              border: 1px solid #ccc;
              max-width: 300px;
            }
            .label img {
              max-width: 100%;
              height: auto;
            }
            .info {
              margin-top: 8px;
              font-size: 12px;
              line-height: 1.4;
            }
            .info strong {
              display: block;
              font-size: 14px;
            }
            .notes {
              font-style: italic;
              color: #666;
              margin-top: 4px;
            }
            .materials {
              margin-top: 6px;
              text-align: left;
            }
            .materials strong {
              font-size: 12px;
              margin-bottom: 2px;
            }
            .materials span {
              display: block;
              color: #666;
            }
            .meta {
              color: #666;
              margin-top: 2px;
            }
            @media print {
              body { padding: 0; }
              .label { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="label">
            <img src="data:image/png;base64,${imageBase64}" alt="Barkod" />
            <div class="info">
              ${type === "work_order" && partName ? `<strong>${partName}</strong>` : ""}
              ${type === "product" && articleName ? `<strong>${articleName}</strong>` : ""}
              ${dimensions ? `<span>${dimensions}</span><br/>` : ""}
              ${notes ? `<div class="notes">${notes}</div>` : ""}
              ${materialsHtml}
              ${customerName ? `<div class="meta">Kupac: ${customerName}</div>` : ""}
              ${partIndex ? `<div class="meta">Dio: ${partIndex}</div>` : ""}
              ${orderRef ? `<span>PO: ${orderRef}</span>` : ""}
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }, [barcodeValue, imageBase64, partName, dimensions, notes, materials, productionOrderId, articleName, customerName, partIndex, type]);

  const orderRef = productionOrderId ? productionOrderId.substring(0, 8) : "";

  return (
    <Card>
      <CardContent className="pt-6">
        <div ref={labelRef} className="flex flex-col items-center gap-3">
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt={`Barkod ${barcodeValue}`}
            className="max-w-[250px]"
          />
          <div className="text-center text-sm space-y-0.5">
            {type === "work_order" && partName && (
              <p className="font-medium">{partName}</p>
            )}
            {type === "product" && articleName && (
              <p className="font-medium">{articleName}</p>
            )}
            {dimensions && (
              <p className="text-muted-foreground">{dimensions}</p>
            )}
            {notes && (
              <p className="text-muted-foreground text-xs italic">{notes}</p>
            )}
            {materials && materials.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Materijali:</p>
                {materials.map((m, i) => (
                  <p key={i}>{m}</p>
                ))}
              </div>
            )}
            {customerName && (
              <p className="text-muted-foreground text-xs">Kupac: {customerName}</p>
            )}
            {partIndex && (
              <p className="text-muted-foreground text-xs">Dio: {partIndex}</p>
            )}
            {orderRef && (
              <p className="text-muted-foreground font-mono text-xs">
                PO: {orderRef}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Štampaj labelu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
