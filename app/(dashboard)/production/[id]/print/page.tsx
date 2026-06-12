import { notFound } from "next/navigation";
import { getPrintData } from "@/lib/utils/print-helpers";
import type { PrintData } from "@/lib/utils/print-helpers";
import PrintButton from "./print-button";
import { prisma } from "@/lib/db";
import bwipjs from "bwip-js/node";
import { getHighestPriority, getEarliestDeadline, anyItemHasNotes } from "@/lib/utils/calculations";

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Hitan",
  normal: "Normalan",
  low: "Nizak",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("bs", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

async function generateBarcodeImage(value: string): Promise<string> {
  const pngBuffer = await bwipjs.toBuffer({
    bcid: "code128",
    text: value,
    scale: 4,
    height: 60,
    includetext: true,
    textxalign: "center",
    paddingwidth: 10,
    paddingheight: 10,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
  });
  return pngBuffer.toString("base64");
}

interface StepWithBarcode {
  stepId: string;
  stepName: string;
  sequenceOrder: number;
  estimatedTime: number | null;
  instructions: string | null;
  articleName: string;
  partName: string;
  partDimensions: string | null;
  fabricName: string | null;
  quantity: number;
  materials: Array<{
    materialName: string;
    quantity: number;
    unit: string;
    length: number | null;
    width: number | null;
    height: number | null;
  }>;
  barcodeValue: string;
  barcodeImage: string;
}

interface DepartmentData {
  departmentId: string;
  departmentName: string;
  steps: StepWithBarcode[];
  totalMaterials: Map<string, { name: string; quantity: number; unit: string }>;
}

export default async function PrintDepartmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPrintData(id);

  if (!data) {
    notFound();
  }

  // Get all work orders with barcodes for this production order
  const workOrders = await prisma.workOrder.findMany({
    where: { productionOrderId: id },
    include: {
      barcode: true,
      articlePart: true,
      department: true,
      productionStep: true,
    },
    orderBy: [
      { articlePartId: "asc" },
      { itemIndex: "asc" },
      { stepSequence: "asc" },
    ],
  });

  // Get all part_identifier barcodes for this production order
  const partIdentifierBarcodes = await prisma.barcode.findMany({
    where: {
      productionOrderId: id,
      type: "part_identifier",
    },
  });

  // Build a lookup map: `${articlePartId}-${itemIndex}` -> barcode value
  const partBarcodeMap = new Map<string, string>();
  for (const bc of partIdentifierBarcodes) {
    if (bc.articlePartId && bc.itemIndex != null) {
      partBarcodeMap.set(`${bc.articlePartId}-${bc.itemIndex}`, bc.value);
    }
  }

  // Build department data with steps and barcodes
  const departmentMap = new Map<string, DepartmentData>();

  // Collect all barcode generation tasks first, then run in parallel
  const barcodeJobs: Array<{ deptId: string; deptName: string; step: typeof data.items[0]["parts"][0]["steps"][0]; part: typeof data.items[0]["parts"][0]; item: typeof data.items[0]; itemIdx: number; barcodeText: string }> = [];

  for (const item of data.items) {
    for (const part of item.parts) {
      for (const step of part.steps) {
        for (let itemIdx = 0; itemIdx < item.quantity; itemIdx++) {
          const barcodeText = partBarcodeMap.get(`${part.partId}-${itemIdx}`) 
            ?? `${id.slice(0,6)}-${step.stepId.slice(0,4)}-${itemIdx}`;
          barcodeJobs.push({
            deptId: step.departmentId,
            deptName: step.departmentName,
            step,
            part,
            item,
            itemIdx,
            barcodeText,
          });
        }
      }
    }
  }

  // Generate all barcodes in parallel
  const barcodeImages = await Promise.all(
    barcodeJobs.map(async (job) => {
      try {
        return await generateBarcodeImage(job.barcodeText);
      } catch {
        return "";
      }
    })
  );

  // Build department map from results
  for (let i = 0; i < barcodeJobs.length; i++) {
    const job = barcodeJobs[i];
    const barcodeImage = barcodeImages[i];

    if (!departmentMap.has(job.deptId)) {
      departmentMap.set(job.deptId, {
        departmentId: job.deptId,
        departmentName: job.deptName,
        steps: [],
        totalMaterials: new Map(),
      });
    }

    const dept = departmentMap.get(job.deptId)!;

    dept.steps.push({
      stepId: job.step.stepId,
      stepName: job.step.stepName,
      sequenceOrder: job.step.sequenceOrder,
      estimatedTime: job.step.estimatedTime,
      instructions: job.step.instructions,
      articleName: job.item.articleName,
      partName: job.part.partName,
      partDimensions: job.part.dimensions,
      fabricName: job.item.fabric?.name ?? null,
      quantity: 1,
      materials: job.step.materials.map(m => ({
        materialName: m.materialName,
        quantity: m.quantity,
        unit: m.unit,
        length: m.length,
        width: m.width,
        height: m.height,
      })),
      barcodeValue: job.barcodeText,
      barcodeImage,
    });

    // Accumulate total materials
    for (const mat of job.step.materials) {
      const existing = dept.totalMaterials.get(mat.materialName);
      if (existing) {
        existing.quantity += mat.quantity;
      } else {
        dept.totalMaterials.set(mat.materialName, {
          name: mat.materialName,
          quantity: mat.quantity,
          unit: mat.unit,
        });
      }
    }
  }

  // Sort steps within each department
  for (const dept of departmentMap.values()) {
    dept.steps.sort((a, b) => {
      if (a.articleName !== b.articleName) return a.articleName.localeCompare(b.articleName);
      if (a.partName !== b.partName) return a.partName.localeCompare(b.partName);
      return a.sequenceOrder - b.sequenceOrder;
    });
  }

  const departments = Array.from(departmentMap.values());

  return (
    <>
      <style>{`
        @media print {
          body { font-size: 9pt; }
          .dept-section { page-break-after: always; }
          .dept-section:last-child { page-break-after: auto; }
          .step-card { page-break-inside: avoid; }
        }
        @media screen {
          .print-container { background: #f5f5f5; min-height: 100vh; }
          .dept-section { background: #fff; margin-bottom: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        }
      `}</style>

      <div className="print-container">
        {/* Print button */}
        <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Print za odjele - Nalog #{data.orderNumber}</h1>
          <PrintButton />
        </div>

        {/* Each department section */}
        {departments.map((dept) => (
          <div key={dept.departmentId} className="dept-section">
            {/* Department header with order info */}
            <div className="bg-black text-white px-3 py-2">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-bold">{dept.departmentName}</h1>
                  <p className="text-gray-400 text-[10px]">Proizvodni nalog</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold text-base">#{data.orderNumber}</p>
                  <p className="text-gray-300">{formatDate(data.workOrderDate ?? data.createdAt)}</p>
                  {(() => {
                    const aggregatePriority = getHighestPriority(data.items);
                    return (
                      <p>
                        Prioritet: <span className={aggregatePriority === 'urgent' ? 'font-bold underline' : ''}>
                          {PRIORITY_LABELS[aggregatePriority]}
                        </span>
                      </p>
                    );
                  })()}
                </div>
              </div>
              
              {/* Customer/deadline row */}
              <div className="mt-1 pt-1 border-t border-gray-600 flex gap-4 text-xs">
                {data.customerName && (
                  <div>
                    <span className="text-gray-400">Kupac: </span>
                    <span className="font-semibold">{data.customerName}</span>
                  </div>
                )}
                {(() => {
                  const earliestDeadline = getEarliestDeadline(data.items);
                  return earliestDeadline && (
                    <div>
                      <span className="text-gray-400">Rok: </span>
                      <span className="font-bold underline">{formatDate(earliestDeadline)}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="p-2">
              {/* Total materials for this department */}
              {dept.totalMaterials.size > 0 && (
                <div className="mb-2 border border-black rounded p-2">
                  <h3 className="font-bold mb-1 text-[10px]">UKUPNO MATERIJALA ZA OVAJ ODJEL</h3>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px]">
                    {Array.from(dept.totalMaterials.values()).map((mat, idx) => (
                      <div key={idx} className="flex justify-between border-b border-gray-200 py-px">
                        <span className="truncate">{mat.name}</span>
                        <span className="font-bold shrink-0 ml-1">{mat.quantity} {mat.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps grouped by article and part */}
              {(() => {
                // Group steps by article -> part
                const groupedByArticle = new Map<string, Map<string, StepWithBarcode[]>>();
                
                for (const step of dept.steps) {
                  if (!groupedByArticle.has(step.articleName)) {
                    groupedByArticle.set(step.articleName, new Map());
                  }
                  const articleGroup = groupedByArticle.get(step.articleName)!;
                  
                  const partKey = `${step.partName}|${step.partDimensions ?? ''}`;
                  if (!articleGroup.has(partKey)) {
                    articleGroup.set(partKey, []);
                  }
                  articleGroup.get(partKey)!.push(step);
                }

                return Array.from(groupedByArticle.entries()).map(([articleName, partsMap]) => (
                  <div key={articleName} className="mb-3">
                    {/* Article header */}
                    <div className="bg-gray-200 border border-black px-2 py-1 mb-1">
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-sm font-bold">ARTIKAL: {articleName}</h2>
                        {(() => {
                          const firstStep = Array.from(partsMap.values())[0]?.[0];
                          return firstStep?.fabricName && (
                            <span className="text-xs text-gray-600">Stof: {firstStep.fabricName}</span>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Parts */}
                    {Array.from(partsMap.entries()).map(([partKey, steps]) => {
                      const [partName, partDimensions] = partKey.split('|');
                      
                      return (
                        <div key={partKey} className="mb-2 border border-black rounded overflow-hidden">
                          {/* Part header */}
                          <div className="bg-gray-100 px-2 py-0.5 border-b border-black flex items-baseline gap-2">
                            <h3 className="text-xs font-bold">DIO: {partName}</h3>
                            {partDimensions && (
                              <span className="text-[10px] text-gray-600">{partDimensions}</span>
                            )}
                          </div>

                          {/* Steps with barcodes */}
                          <div className="p-1 space-y-1">
                            {steps.map((step, stepIdx) => (
                              <div key={stepIdx} className="step-card border border-gray-300 rounded px-1.5 py-1 flex gap-2 items-center">
                                {/* Left: Step info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="bg-black text-white text-[9px] px-1 py-px rounded font-bold shrink-0">
                                      {step.sequenceOrder}
                                    </span>
                                    <span className="text-xs font-bold">{step.stepName}</span>
                                    {step.estimatedTime && (
                                      <span className="text-[9px] text-gray-500">({step.estimatedTime}min)</span>
                                    )}
                                  </div>

                                  {/* Instructions */}
                                  {step.instructions && (
                                    <p className="text-[9px] text-gray-600 mt-0.5 leading-tight">
                                      {step.instructions}
                                    </p>
                                  )}

                                  {/* Materials */}
                                  {step.materials.length > 0 && (
                                    <p className="text-[9px] text-gray-600 mt-0.5 leading-tight">
                                      {step.materials.map((m, i) => (
                                        <span key={i}>
                                          {i > 0 && ", "}
                                          {m.materialName} ({m.quantity} {m.unit}
                                          {(m.length || m.width || m.height) && (
                                            <> — {[m.length, m.width, m.height].filter(Boolean).join("x")}</>
                                          )}
                                          )
                                        </span>
                                      ))}
                                    </p>
                                  )}
                                </div>

                                {/* Right: Barcode */}
                                <div className="shrink-0 text-center">
                                  {step.barcodeImage ? (
                                    <>
                                      <img
                                        src={`data:image/png;base64,${step.barcodeImage}`}
                                        alt={step.barcodeValue}
                                        className="h-8 w-auto"
                                      />
                                      <p className="text-[7px] text-gray-500 mt-0.5 leading-tight">{step.articleName}</p>
                                      <p className="text-[7px] text-gray-500 leading-tight">{step.partName}</p>
                                    </>
                                  ) : (
                                    <div className="h-8 w-16 bg-gray-200 flex items-center justify-center text-[8px]">
                                      —
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}

              {/* Notes from items */}
              {dept === departments[departments.length - 1] && anyItemHasNotes(data.items) && (
                <div className="mt-4 border-2 border-black rounded p-3">
                  <h3 className="font-bold text-sm mb-1">BILJEŠKE</h3>
                  {data.items.filter(item => item.notes).map((item, idx) => (
                    <p key={idx} className="whitespace-pre-wrap text-sm">
                      <span className="font-semibold">{item.articleName}: </span>
                      {item.notes}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
