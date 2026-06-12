import { notFound } from "next/navigation";
import { getPrintData, sortPrintData, filterItemsByArticle } from "@/lib/utils/print-helpers";
import { readPrintParams } from "@/lib/utils/print-applicability";
import PrintButton from "../print-button";
import { prisma } from "@/lib/db";
import { BarcodeType } from "@/app/generated/prisma";
import bwipjs from "bwip-js/node";
import { expandPartsForContent, formatFooterComponents, getBedComponents, parseArticleWidth } from "@/lib/utils/bed-label-helpers";
import { BarcodeService } from "@/lib/services/barcode.service";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("bs", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

async function generateBarcodeImage(value: string, small = false): Promise<string> {
  const pngBuffer = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 4,
    height: small ? 45 : 60,
    includetext: true,
    textxalign: "center",
    paddingwidth: 10,
    paddingheight: small ? 6 : 10,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return pngBuffer.toString("base64");
}

interface ArticleLabel {
  articleName: string;
  articleCode: string | null;
  allParts: string;
  footerComponents: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null;
  orderNumber: number;
  date: string;
  customerName: string | null;
  withLegs: boolean;
}

interface PartLabel {
  articleName: string;
  articleCode: string | null;
  partName: string;
  departmentName: string;
  steps: string;
  fabricName: string | null;
  serialNumber: string | null;
  barcodeValue: string | null;
  barcodeImage: string | null;
  orderNumber: number;
  date: string;
  withLegs: boolean;
}

interface ComponentLabel {
  articleName: string;
  articleCode: string | null;
  componentName: string;
  fabricName: string | null;
  serialNumber: string | null;
  notes: string | null;
  barcodeValue: string;
  barcodeImage: string;
  orderNumber: number;
  date: string;
  customerName: string | null;
  withLegs: boolean;
}

export default async function EtiketePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const applied = readPrintParams("etikete", sp);
  // The existing part filter logic does a case-insensitive comparison. To keep that
  // behavior, lowercase the selected part names from `applied.parts` into a separate
  // Set. If `applied.parts` is empty, the part filter is inactive (null).
  const filterPartsSet =
    applied.parts.size > 0
      ? new Set(Array.from(applied.parts).map((p) => p.toLowerCase()))
      : null;
  let data = await getPrintData(id);
  if (!data) notFound();
  // Pipeline order per design.md: article filter → sort → part filter (at label stage)
  if (applied.articles.size > 0) {
    data = filterItemsByArticle(data, new Set(applied.articles));
  }
  if (applied.sort.length > 0) {
    data = sortPrintData(data, [...applied.sort]);
  }

  // Fetch all product barcodes
  const productBarcodes = await prisma.barcode.findMany({
    where: { productionOrderId: id, type: BarcodeType.product },
    orderBy: { itemIndex: "asc" },
  });
  const barcodeByItemIndex = new Map<number, string>();
  for (const bc of productBarcodes) {
    if (bc.itemIndex != null) barcodeByItemIndex.set(bc.itemIndex, bc.value);
  }

  // Fetch all part_identifier barcodes
  const partBarcodes = await prisma.barcode.findMany({
    where: { productionOrderId: id, type: BarcodeType.part_identifier },
  });
  const partBarcodeMap = new Map<string, string>();
  for (const bc of partBarcodes) {
    if (bc.articlePartId && bc.itemIndex != null) {
      partBarcodeMap.set(`${bc.articlePartId}-${bc.itemIndex}`, bc.value);
    }
  }

  // Build groups: one article label + component labels + N part labels per quantity item
  // First pass: collect all data without generating barcodes
  interface PendingGroup {
    item: typeof data.items[0];
    itemIdx: number;
    globalIdx: number;
    articleBcValue: string | null;
    partInfos: Array<{ partId: string; partName: string }>;
    bedComponents: ReturnType<typeof getBedComponents>;
    labelOptions: { width: number | null; withLegs: boolean };
  }

  const pendingGroups: PendingGroup[] = [];
  let globalItemIndex = 0;

  for (const item of data.items) {
    for (let i = 0; i < item.quantity; i++) {
      const articleBcValue = barcodeByItemIndex.get(globalItemIndex) ?? null;
      const partInfos = item.parts.map((p) => ({ partId: p.partId, partName: p.partName }));
      const width = parseArticleWidth(item.articleDimensions, item.articleName);
      const labelOptions = { width, withLegs: item.withLegs };
      const bedComponents = getBedComponents(partInfos, item.articleDescription, item.articleName, labelOptions);
      pendingGroups.push({ item, itemIdx: i, globalIdx: globalItemIndex, articleBcValue, partInfos, bedComponents, labelOptions });
      globalItemIndex++;
    }
  }

  // Collect all barcode generation tasks
  type BcTask = { type: "part" | "component"; groupIdx: number; subIdx: number; value: string; small: boolean };
  const bcTasks: BcTask[] = [];

  for (let g = 0; g < pendingGroups.length; g++) {
    const pg = pendingGroups[g];
    for (let p = 0; p < pg.item.parts.length; p++) {
      // Skip parts not in filter
      if (filterPartsSet && !filterPartsSet.has(pg.item.parts[p].partName.toLowerCase())) continue;
      const partBcValue = partBarcodeMap.get(`${pg.item.parts[p].partId}-${pg.globalIdx}`) ?? pg.articleBcValue;
      if (partBcValue) {
        bcTasks.push({ type: "part", groupIdx: g, subIdx: p, value: partBcValue, small: true });
      }
    }
  }

  // Generate all barcodes in parallel
  const bcResults = await Promise.all(
    bcTasks.map(async (task) => {
      try {
        return await generateBarcodeImage(task.value, task.small);
      } catch {
        return null;
      }
    })
  );

  // Build lookup: "type-groupIdx-subIdx" -> image
  const bcLookup = new Map<string, string | null>();
  for (let i = 0; i < bcTasks.length; i++) {
    const t = bcTasks[i];
    bcLookup.set(`${t.type}-${t.groupIdx}-${t.subIdx}`, bcResults[i]);
  }

  // Second pass: build groups using pre-generated barcodes
  const groups: Array<{ article: ArticleLabel; componentLabels: ComponentLabel[]; parts: PartLabel[] }> = [];

  for (let g = 0; g < pendingGroups.length; g++) {
    const pg = pendingGroups[g];
    const item = pg.item;
    const serialParts = item.serialNumber ? item.serialNumber.split(",") : [];
    const unitSerial = serialParts[pg.itemIdx] ?? item.serialNumber;

    const articleLabel: ArticleLabel = {
      articleName: item.articleName,
      articleCode: item.articleCode,
      allParts: expandPartsForContent(pg.partInfos, item.articleDescription, item.articleName, pg.labelOptions).join("+"),
      footerComponents: formatFooterComponents(pg.partInfos, item.articleDescription, item.articleName, pg.labelOptions),
      fabricName: item.fabric?.name ?? null,
      serialNumber: unitSerial,
      notes: item.notes,
      orderNumber: data.orderNumber,
      date: formatDate(data.workOrderDate ?? data.createdAt),
      customerName: data.customerName,
      withLegs: item.withLegs,
    };

    const partLabels: PartLabel[] = [];

    // Generate component labels (these use BarcodeService which does its own generation)
    const componentLabels: ComponentLabel[] = [];
    // Filter bed components by part filter
    const filteredBedComponents = filterPartsSet
      ? pg.bedComponents.filter((c) => filterPartsSet.has(c.sourcePartName.toLowerCase()))
      : pg.bedComponents;
    const componentPromises = filteredBedComponents.map(async (component) => {
      try {
        const bcData = await BarcodeService.generateComponentIdentifier(
          id,
          component.sourcePartId,
          component.componentName,
          pg.globalIdx
        );
        return {
          articleName: item.articleName,
          articleCode: item.articleCode,
          componentName: bcData.componentName,
          fabricName: item.fabric?.name ?? null,
          serialNumber: unitSerial,
          notes: item.notes,
          barcodeValue: bcData.value,
          barcodeImage: bcData.imageBase64,
          orderNumber: data.orderNumber,
          date: formatDate(data.workOrderDate ?? data.createdAt),
          customerName: data.customerName,
          withLegs: item.withLegs,
        } as ComponentLabel;
      } catch {
        return null;
      }
    });
    const componentResults = await Promise.all(componentPromises);
    for (const cl of componentResults) {
      if (cl) componentLabels.push(cl);
    }

    // Clean up orphaned component barcodes from previous prints with wrong component sets
    await BarcodeService.cleanupOrphanedComponentBarcodes(
      id, pg.globalIdx, pg.bedComponents.map((c) => c.componentName)
    );

    for (let p = 0; p < item.parts.length; p++) {
      const part = item.parts[p];
      // Skip parts not in filter
      if (filterPartsSet && !filterPartsSet.has(part.partName.toLowerCase())) continue;
      const partBcValue = partBarcodeMap.get(`${part.partId}-${pg.globalIdx}`) ?? pg.articleBcValue;
      const partBcImage = bcLookup.get(`part-${g}-${p}`) ?? null;
      const stepNames = part.steps.map((s) => s.stepName).join(" → ");
      const firstDeptName = part.steps[0]?.departmentName ?? "";
      partLabels.push({
        articleName: item.articleName,
        articleCode: item.articleCode,
        partName: part.partName,
        departmentName: firstDeptName,
        steps: stepNames,
        fabricName: item.fabric?.name ?? null,
        serialNumber: unitSerial,
        barcodeValue: partBcValue,
        barcodeImage: partBcImage,
        orderNumber: data.orderNumber,
        date: formatDate(data.workOrderDate ?? data.createdAt),
        withLegs: item.withLegs,
      });
    }

    // Sort parts by partName then departmentName
    partLabels.sort((a, b) => {
      const partCmp = a.partName.localeCompare(b.partName, "bs");
      if (partCmp !== 0) return partCmp;
      return a.departmentName.localeCompare(b.departmentName, "bs");
    });

    groups.push({ article: articleLabel, componentLabels, parts: partLabels });
  }

  if (groups.length === 0) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
        <p style={{ color: "#666" }}>Nijedna etiketa ne odgovara odabranim filterima.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          @page { margin: 5mm; }
          .no-print { display: none !important; }
          .item-group { page-break-after: always; }
          .item-group:last-child { page-break-after: auto; }
        }
        @media screen {
          .labels-container { max-width: 1200px; margin: 0 auto; background: #fff; padding: 20px; }
        }
        * { box-sizing: border-box; }

        .label-large {
          width: 340px;
          min-height: 567px;
          border: 1px dashed #999;
          padding: 16px 20px;
          font-family: Arial, sans-serif;
          font-size: 10pt;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
        .label-small {
          width: 340px;
          border: 1px dashed #999;
          padding: 10px 16px;
          font-family: Arial, sans-serif;
          font-size: 8pt;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .label-small .info-block {
          width: 100%;
        }

        .company-header {
          text-align: center;
          margin-bottom: 8px;
        }
        .company-header .brand {
          font-size: 22pt;
          font-weight: bold;
          letter-spacing: 6px;
          line-height: 1;
        }
        .company-header .brand-sub {
          font-size: 14pt;
          letter-spacing: 8px;
          margin-top: -2px;
        }
        .company-header .address {
          font-size: 7pt;
          color: #555;
          margin-top: 4px;
        }

        .barcode-section {
          text-align: center;
          margin: 6px 0;
        }
        .barcode-section img {
          max-width: 280px;
          height: auto;
        }
        .barcode-small img {
          max-width: 260px;
          height: auto;
        }

        .info-row {
          display: flex;
          gap: 4px;
          line-height: 1.4;
        }
        .info-row .lk {
          font-weight: bold;
          font-style: italic;
          min-width: 55px;
          flex-shrink: 0;
        }

        .footer-row {
          display: flex;
          justify-content: space-between;
          border-top: 1px solid #000;
          padding-top: 3px;
          margin-top: auto;
          font-size: 8pt;
        }

        .item-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
        }
        .parts-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .step-badge {
          display: inline-block;
          background: #000;
          color: #fff;
          font-size: 7pt;
          font-weight: bold;
          padding: 1px 6px;
          border-radius: 2px;
          margin-bottom: 3px;
        }
      `}</style>

      <div className="labels-container">
        <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Etikete — Nalog #{data.orderNumber}</h1>
          <PrintButton />
        </div>

        <div style={{ padding: "20px" }}>
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="item-group">
              {/* VELIKA ETIKETA — za pakovanje artikla */}
              <div className="label-large">
                <div className="company-header">
                  <div className="brand">PRO</div>
                  <div className="brand-sub">TRACK</div>
                  <div className="address">Demo Company d.o.o. Brod bb Brčko</div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9pt" }}>
                  <span>Broj naloga {group.article.orderNumber}</span>
                  <span>{group.article.date}</span>
                </div>

                <div style={{ textAlign: "center", margin: "8px 0" }}>
                  <div style={{ fontStyle: "italic", fontSize: "9pt" }}>Naziv klijenta:</div>
                  <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{group.article.customerName ?? "—"}</div>
                </div>

                <div>
                  <div className="info-row"><span className="lk">Naziv:</span><span>{group.article.articleName}{group.article.articleCode ? ` / ${group.article.articleCode}` : ""}</span></div>
                  <div className="info-row"><span className="lk">Sadržaj:</span><span>{group.article.allParts}</span></div>
                  <div className="info-row"><span className="lk">Nogice:</span><span>{group.article.withLegs ? "" : "Bez nogica"}</span></div>
                  <div className="info-row"><span className="lk">Štof:</span><span>{group.article.fabricName ?? ""}</span></div>
                  <div className="info-row"><span className="lk">Serija:</span><span>{group.article.serialNumber ? `- ${group.article.serialNumber}` : ""}</span></div>
                </div>

                <div style={{ textAlign: "center", fontStyle: "italic", fontWeight: "bold", margin: "6px 0 2px" }}>Napomena:</div>
                <div style={{ textAlign: "center", fontSize: "9pt", minHeight: "14px" }}>{group.article.notes ?? ""}</div>

                <div className="footer-row">
                  <span>{group.article.footerComponents}</span>
                </div>
              </div>

              {/* ETIKETE KOMPONENTI — velike etikete za bed komponente */}
              {group.componentLabels.map((comp, cIdx) => (
                <div key={`comp-${cIdx}`} className="label-large">
                  <div className="company-header">
                    <div className="brand">PRO</div>
                    <div className="brand-sub">TRACK</div>
                    <div className="address">Demo Company d.o.o. Brod bb Brčko</div>
                  </div>

                  <div className="barcode-section">
                    <img src={`data:image/png;base64,${comp.barcodeImage}`} alt="Barkod" />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9pt" }}>
                    <span>Broj naloga {comp.orderNumber}</span>
                    <span>{comp.date}</span>
                  </div>

                  <div style={{ textAlign: "center", margin: "8px 0" }}>
                    <div style={{ fontStyle: "italic", fontSize: "9pt" }}>Naziv klijenta:</div>
                    <div style={{ fontWeight: "bold", fontSize: "11pt" }}>{comp.customerName ?? "—"}</div>
                  </div>

                  <div>
                    <div className="info-row"><span className="lk">Naziv:</span><span>{comp.articleName}{comp.articleCode ? ` / ${comp.articleCode}` : ""}</span></div>
                    <div className="info-row"><span className="lk">Sadržaj:</span><span>{comp.componentName}</span></div>
                    <div className="info-row"><span className="lk">Nogice:</span><span>{comp.withLegs ? "" : "Bez nogica"}</span></div>
                    <div className="info-row"><span className="lk">Štof:</span><span>{comp.fabricName ?? ""}</span></div>
                    <div className="info-row"><span className="lk">Serija:</span><span>{comp.serialNumber ? `- ${comp.serialNumber}` : ""}</span></div>
                  </div>

                  <div style={{ textAlign: "center", fontStyle: "italic", fontWeight: "bold", margin: "6px 0 2px" }}>Napomena:</div>
                  <div style={{ textAlign: "center", fontSize: "9pt", minHeight: "14px" }}>{comp.notes ?? ""}</div>

                  <div className="footer-row" style={{ justifyContent: "center" }}>
                    <span style={{ fontWeight: "bold", fontSize: "14pt", textTransform: "uppercase" }}>{comp.componentName}</span>
                  </div>
                </div>
              ))}

              {/* MALE ETIKETE — jedna po dijelu */}
              <div className="parts-column">
                {group.parts.map((part, pIdx) => (
                  <div key={pIdx} className="label-small">
                    <div className="step-badge">{part.steps}</div>
                    <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "13pt", margin: "4px 0" }}>
                      {part.partName}
                    </div>
                    <div className="info-block">
                      <div className="info-row"><span className="lk">Naziv:</span><span>{part.articleName}{part.articleCode ? ` / ${part.articleCode}` : ""}</span></div>
                      <div className="info-row"><span className="lk">Odjel:</span><span>{part.departmentName}</span></div>
                      <div className="info-row"><span className="lk">Nogice:</span><span>{part.withLegs ? "" : "Bez nogica"}</span></div>
                      <div className="info-row"><span className="lk">Štof:</span><span>{part.fabricName ?? ""}</span></div>
                      <div className="info-row"><span className="lk">Serija:</span><span>{part.serialNumber ? `- ${part.serialNumber}` : ""}</span></div>
                    </div>
                    <div style={{ textAlign: "center", fontStyle: "italic", fontWeight: "bold", fontSize: "7pt", marginTop: "2px" }}>Napomena:</div>
                    {part.barcodeImage && (
                      <div className="barcode-section barcode-small" style={{ margin: "4px 0" }}>
                        <img src={`data:image/png;base64,${part.barcodeImage}`} alt="Barkod" />
                      </div>
                    )}
                    <div className="footer-row" style={{ width: "100%" }}>
                      <span>Broj naloga {part.orderNumber}</span>
                      <span>{part.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
