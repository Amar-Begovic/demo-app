import { prisma } from "@/lib/db";
import PrintButton from "@/app/(dashboard)/production/[id]/print/print-button";

function round(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function formatPrice(n: number | null): string {
  if (n == null) return "\u2014";
  return n.toFixed(2);
}

interface MaterialRow {
  materialCode: string | null;
  materialName: string;
  unit: string;
  quantity: number;
  pieces: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  isEdgebanded: boolean | null;
  price: number | null;
  value: number | null;
}

interface StepBlock {
  departmentName: string;
  materials: MaterialRow[];
}

interface ArticleBlock {
  articleName: string;
  articleCode: string | null;
  parts: Array<{
    partName: string;
    steps: StepBlock[];
  }>;
  totalValue: number;
  normativeVersion: number | null;
}

export default async function ArticlesPlanUtroskaPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; bom?: string; ids?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const bom = params.bom || "all";
  const idsParam = params.ids || "";

  const conditions: any[] = [];

  // If specific IDs are provided, filter by those
  if (idsParam) {
    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length > 0) {
      conditions.push({ id: { in: ids } });
    }
  } else {
    // Otherwise use search/bom filters
    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search, mode: "insensitive" as const } },
          { model: { contains: search, mode: "insensitive" as const } },
        ],
      });
    }
    if (bom === "has") conditions.push({ parts: { some: {} } });
    else if (bom === "empty") conditions.push({ parts: { none: {} } });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const articles = await prisma.article.findMany({
    where,
    include: {
      parts: {
        include: {
          productionSteps: {
            include: {
              department: true,
              materials: { include: { material: true } },
            },
            orderBy: { sequenceOrder: "asc" as const },
          },
        },
      },
      normativeVersions: {
        where: { isActive: true },
        select: { versionNumber: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  // Build article blocks
  const blocks: ArticleBlock[] = [];

  for (const article of articles) {
    if (article.parts.length === 0) continue;

    let articleTotal = 0;
    const parts: ArticleBlock["parts"] = [];

    for (const part of article.parts) {
      const steps: StepBlock[] = [];
      for (const step of part.productionSteps) {
        if (step.materials.length === 0) continue;
        const materials: MaterialRow[] = step.materials.map((sm) => {
          const price = sm.material.price ?? null;
          const value = price != null ? price * sm.quantity : null;
          if (value != null) articleTotal += value;

          return {
            materialCode: sm.material.code,
            materialName: sm.material.name,
            unit: sm.material.unit,
            quantity: sm.quantity,
            pieces: sm.pieces ?? null,
            length: sm.length ?? null,
            width: sm.width ?? null,
            height: sm.height ?? null,
            isEdgebanded: sm.isEdgebanded ?? null,
            price,
            value,
          };
        });
        steps.push({ departmentName: step.department.name, materials });
      }
      if (steps.length > 0) parts.push({ partName: part.partName, steps });
    }

    if (parts.length > 0) {
      blocks.push({
        articleName: article.name,
        articleCode: article.code,
        parts,
        totalValue: articleTotal,
        normativeVersion: article.normativeVersions[0]?.versionNumber ?? null,
      });
    }
  }

  return (
    <>
      <style>{`
        @media print {
          body { font-size: 8pt; }
          @page { margin: 6mm; }
          .no-print { display: none !important; }
          .article-block { page-break-before: auto; }
          .article-header { page-break-after: avoid; }
          .step-block { page-break-inside: avoid; }
          .step-block + .step-block { page-break-before: always; }
          .step-header { display: block !important; }
        }
        @media screen {
          .print-wrap { max-width: 1200px; margin: 0 auto; background: #fff; min-height: 100vh; }
        }
        .pu-table { border-collapse: collapse; width: 100%; table-layout: fixed; margin-bottom: 16px; }
        .pu-table th, .pu-table td { border: 1px solid #000; padding: 2px 4px; font-size: 7.5pt; vertical-align: top; overflow: hidden; word-wrap: break-word; }
        .pu-table th { background: #eee; font-weight: bold; text-align: center; font-size: 7pt; }
        .price-col { background: #f0fff0; }
      `}</style>

      <div className="print-wrap">
        <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            {"\u0160"}tampa utro{"\u0161"}ka materijala {"\u2014"} Artikli
            {search && <span className="text-muted-foreground font-normal text-base ml-2">({search})</span>}
          </h1>
          <PrintButton />
        </div>

        <div className="p-4" style={{ fontFamily: "Arial, sans-serif" }}>
          {/* Company header */}
          <div style={{ fontSize: "8pt", lineHeight: 1.3, marginBottom: 4 }}>
            <div>Demo Company d.o.o.</div>
            <div>Adresa bb, Grad</div>
            <div>JIB: 0000000000000 &nbsp; PDV: 000000000000</div>
          </div>

          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span style={{ border: "2px solid #000", padding: "3px 16px", fontWeight: "bold", fontSize: "12pt" }}>
              PLAN UTRO{"\u0160"}KA MATERIJALA {"\u2014"} ARTIKLI
            </span>
          </div>

          {blocks.map((block, blockIdx) => (
            <div key={blockIdx} className="article-block" style={{ marginBottom: 16 }}>
              <div className="article-header" style={{ fontSize: "9pt", fontWeight: "bold", marginBottom: 4, borderBottom: "1px solid #000", paddingBottom: 2 }}>
                {block.articleCode && <span>[{block.articleCode}] </span>}
                {block.articleName}
                {block.normativeVersion != null && <span style={{ marginLeft: 12, fontWeight: "normal", fontSize: "8pt" }}>(Normativ v{block.normativeVersion})</span>}
                <span style={{ float: "right", fontSize: "8pt" }}>Ukupno: {formatPrice(block.totalValue)} KM</span>
              </div>

              {block.parts.map((part, partIdx) => (
                <div key={partIdx} className="part-block">
                  {block.parts.length > 1 && (
                    <div style={{ fontSize: "7.5pt", fontWeight: "bold", marginTop: 4, marginBottom: 2 }}>
                      {part.partName}
                    </div>
                  )}
                  {part.steps.map((step, stepIdx) => (
                    <div key={stepIdx} className="step-block">
                      <div className="step-header" style={{ fontSize: "8pt", fontWeight: "bold", marginBottom: 2, display: "none" }}>
                        {block.articleCode && <span>[{block.articleCode}] </span>}
                        {block.articleName}
                        {block.parts.length > 1 && <span> — {part.partName}</span>}
                      </div>
                    <table className="pu-table">
                      <colgroup>
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "12%" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Odjel</th>
                          <th>{"\u0160"}ifra</th>
                          <th>Naziv sirovine</th>
                          <th>JM</th>
                          <th>Koli{"\u010D"}ina</th>
                          <th>Du{"\u017E"}ina</th>
                          <th>{"\u0160"}irina</th>
                          <th>Visina</th>
                          <th>Kom.</th>
                          <th className="price-col">Cijena</th>
                          <th className="price-col">Vrijednost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {step.materials.map((mat, matIdx) => (
                          <tr key={matIdx}>
                            {matIdx === 0 && (
                              <td rowSpan={step.materials.length} style={{ textAlign: "center", fontWeight: "bold", fontSize: "7pt" }}>
                                {step.departmentName}
                              </td>
                            )}
                            <td style={{ textAlign: "center" }}>{mat.materialCode}</td>
                            <td>{mat.materialName}</td>
                            <td style={{ textAlign: "center" }}>{mat.unit}</td>
                            <td style={{ textAlign: "right" }}>{round(mat.quantity)}</td>
                            <td style={{ textAlign: "right" }}>{mat.length != null ? round(mat.length) : ""}</td>
                            <td style={{ textAlign: "right" }}>{mat.width != null ? round(mat.width) : ""}</td>
                            <td style={{ textAlign: "right" }}>{mat.height != null ? round(mat.height) : ""}</td>
                            <td style={{ textAlign: "right" }}>{mat.pieces != null ? round(mat.pieces) : ""}</td>
                            <td style={{ textAlign: "right" }} className="price-col">{formatPrice(mat.price)}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }} className="price-col">{formatPrice(mat.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
