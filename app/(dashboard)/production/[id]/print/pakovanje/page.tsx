import { notFound } from "next/navigation";
import { getPrintData, filterItemsByArticle, sortPrintData, groupBySerialNumber, applySetNameOverrides } from "@/lib/utils/print-helpers";
import { readPrintParams } from "@/lib/utils/print-applicability";
import PrintButton from "../print-button";
import { expandPartsForContent, formatFooterComponents, getBedComponents, parseArticleWidth, filterBedComponents } from "@/lib/utils/bed-label-helpers";
import { BarcodeService } from "@/lib/services/barcode.service";
import { PakovanjeLabels, type LabelGroup } from "./pakovanje-labels";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("bs", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export default async function PakovanjeEtiketePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const applied = readPrintParams("pakovanje", sp);

  let data = await getPrintData(id);
  if (!data) notFound();

  // Pipeline order per design.md: article filter → sort → component filter (at label stage)
  if (applied.articles.size > 0) {
    data = filterItemsByArticle(data, new Set(applied.articles));
  }
  if (applied.sort.length > 0) {
    data = sortPrintData(data, [...applied.sort]);
  }

  // Empty-state: article filter removed all items
  if (applied.articles.size > 0 && data.items.length === 0) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
        <p style={{ color: "#666" }}>Nema artikala koji odgovaraju filteru.</p>
      </div>
    );
  }

  // Build groups: article label + component labels
  const groups: LabelGroup[] = [];
  let globalItemIndex = 0;

  for (const item of data.items) {
    const serialParts = item.serialNumber ? item.serialNumber.split(",") : [];
    for (let i = 0; i < item.quantity; i++) {
      const unitSerial = serialParts[i] ?? item.serialNumber;
      const partInfos = item.parts.map((p) => ({ partId: p.partId, partName: p.partName }));
      const articleDescription = item.articleDescription;
      const width = parseArticleWidth(item.articleDimensions, item.articleName);
      const labelOptions = { width, withLegs: item.withLegs };

      const article = {
        articleName: item.articleName,
        articleCode: item.articleCode,
        allParts: expandPartsForContent(partInfos, articleDescription, item.articleName, labelOptions).join("+"),
        footerComponents: formatFooterComponents(partInfos, articleDescription, item.articleName, labelOptions),
        fabricName: item.fabric?.name ?? null,
        serialNumber: unitSerial,
        notes: item.notes,
        orderNumber: data.orderNumber,
        date: formatDate(data.workOrderDate ?? data.createdAt),
        customerName: data.customerName,
      };

      const bedComponents = getBedComponents(partInfos, articleDescription, item.articleName, labelOptions);
      // Component filter (Req 4.6, 11.2): reduce to user-selected canonical names.
      // Keep `bedComponents` (unfiltered) for the barcode cleanup call below so that
      // reprints with a filter don't destroy barcodes for unselected components (Req 10.1, 11.3).
      const filteredBedComponents = filterBedComponents(bedComponents, applied.components);
      const componentResults = await Promise.all(
        filteredBedComponents.map(async (component) => {
          try {
            const bcData = await BarcodeService.generateComponentIdentifier(
              id, component.sourcePartId, component.componentName, globalItemIndex
            );
            return {
              articleName: item.articleName,
              articleCode: item.articleCode,
              componentName: bcData.componentName,
              fabricName: item.fabric?.name ?? null,
              serialNumber: unitSerial,
              notes: null,
              barcodeValue: bcData.value,
              barcodeImage: bcData.imageBase64,
              orderNumber: data.orderNumber,
              date: formatDate(data.workOrderDate ?? data.createdAt),
              customerName: data.customerName,
            };
          } catch { return null; }
        })
      );

      // Clean up orphaned component barcodes from previous prints with wrong component sets.
      // Use the UNFILTERED `bedComponents` so reprints with a filter don't destroy barcodes
      // for unselected components (Req 10.1, 11.3).
      await BarcodeService.cleanupOrphanedComponentBarcodes(
        id, globalItemIndex, bedComponents.map((c) => c.componentName)
      );

      groups.push({
        article,
        componentLabels: componentResults.filter((c): c is NonNullable<typeof c> => c !== null),
      });
      globalItemIndex++;
    }
  }

  // Component filter empty-result (Req 11.4): if the user selected a non-empty
  // component filter AND every item ended with zero component labels after
  // filtering, render the standardized empty-result message.
  if (
    applied.components.size > 0 &&
    groups.every((g) => g.componentLabels.length === 0)
  ) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
        <p style={{ color: "#666" }}>Nijedna komponenta pakovanja nije odabrana.</p>
      </div>
    );
  }

  // Apply serial number grouping so items with the same serial appear consecutively
  const groupedGroups = applySetNameOverrides(groupBySerialNumber(groups));

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          @page { margin: 5mm; }
          .no-print { display: none !important; }
          .item-group { page-break-after: always; }
          .item-group:last-child { page-break-after: auto; }
          .editable-notes { border-bottom: none !important; }
        }
        @media screen {
          .labels-container { max-width: 800px; margin: 0 auto; background: #fff; padding: 20px; }
        }
        * { box-sizing: border-box; }
        .label-large {
          width: 340px; height: 567px; border: 1px dashed #999;
          padding: 16px 20px; font-family: Arial, sans-serif; font-size: 10pt;
          display: flex; flex-direction: column; flex-shrink: 0;
          overflow: hidden;
        }
        .company-header { text-align: center; margin-bottom: 8px; }
        .company-header .brand { font-size: 22pt; font-weight: bold; letter-spacing: 6px; line-height: 1; }
        .company-header .brand-sub { font-size: 14pt; letter-spacing: 8px; margin-top: -2px; }
        .company-header .address { font-size: 7pt; color: #555; margin-top: 4px; }
        .barcode-section { text-align: center; margin: 6px 0; display: flex; justify-content: center; }
        .barcode-section img { max-width: 280px; height: auto; }
        .info-row { display: flex; gap: 4px; line-height: 1.4; }
        .info-row .lk { font-weight: bold; font-style: italic; min-width: 55px; flex-shrink: 0; }
        .footer-row { display: flex; justify-content: center; border-top: 1px solid #000; padding-top: 3px; margin-top: auto; }
        .item-group { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-bottom: 32px; }
      `}</style>

      <div className="labels-container">
        <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Etikete pakovanja — Nalog #{data.orderNumber}</h1>
          <PrintButton />
        </div>

        <PakovanjeLabels groups={groupedGroups} />
      </div>
    </>
  );
}
