import { notFound } from "next/navigation";
import {
  getPrintData,
  aggregatePrintData,
  filterItemsByArticle,
  sortPrintData,
  buildDeptSectionsWithDimensions,
  getArticlesWithoutBom,
} from "@/lib/utils/print-helpers";
import { readPrintParams } from "@/lib/utils/print-applicability";
import PrintButton from "../print-button";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("bs", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function round(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export default async function PlanUtroskaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const applied = readPrintParams("plan-utroska", sp);
  let data = await getPrintData(id);
  if (!data) notFound();

  // Pipeline order per design.md: article filter → sort → aggregate → dept filter
  if (applied.articles.size > 0) data = filterItemsByArticle(data, new Set(applied.articles));
  if (applied.sort.length > 0) data = sortPrintData(data, [...applied.sort]);
  // Note: plan-utroska always applies aggregatePrintData (existing behavior). The
  // matrix row for plan-utroska does NOT include `aggregate`, so the user-selected
  // aggregate option is ignored and the existing always-aggregate behavior remains.
  const allSections = buildDeptSectionsWithDimensions(aggregatePrintData(data));
  const sections =
    applied.departments.size > 0
      ? allSections.filter((s) => applied.departments.has(s.departmentId))
      : allSections;

  // Find articles without any materials (no normativ/BOM)
  const articlesWithoutBom = getArticlesWithoutBom(data);

  if (sections.length === 0) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
        <p style={{ color: "#666" }}>Nijedan odjel ne sadrži stavke za odabrane filtere.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body { font-size: 12pt; }
          .dept-page { page-break-after: always; }
          .dept-page:last-child { page-break-after: auto; }
          @page { margin: 6mm; }
          .no-print { display: none !important; }
        }
        @media screen {
          .print-wrap { max-width: 1200px; margin: 0 auto; background: #f5f5f5; min-height: 100vh; }
          .dept-page { background: #fff; margin-bottom: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        }
        .pu-table { border-collapse: collapse; width: 100%; }
        .pu-table th, .pu-table td { border: 1px solid #000; padding: 1px 4px; font-size: 12pt; vertical-align: top; }
        .pu-table th { background: #eee; font-weight: bold; text-align: center; font-size: 12pt; }
        .recap-table { border-collapse: collapse; width: 100%; margin-top: 12px; }
        .recap-table th, .recap-table td { border: 1px solid #000; padding: 1px 4px; font-size: 12pt; }
        .recap-table th { background: #eee; font-weight: bold; font-size: 12pt; }
        .highlight { background: #ffff00; }
      `}</style>

      <div className="print-wrap">
        <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Plan utroška materijala - Nalog #{data.orderNumber}</h1>
          <PrintButton />
        </div>

        {sections.map((dept, deptIdx) => (
          <div key={deptIdx} className="dept-page p-4" style={{ fontFamily: "Arial, sans-serif" }}>
            {/* Company header */}
            <div style={{ fontSize: "12pt", lineHeight: 1.3, marginBottom: 4 }}>
              <div>Demo Company d.o.o.</div>
              <div>76100 Brčko, Brod bb</div>
              <div>JIB: 4600471110010 &nbsp; PDV: 600471110002</div>
              <div>žiro-račun:</div>
            </div>

            {/* Title row */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ border: "2px solid #000", padding: "3px 16px", fontWeight: "bold", fontSize: "12pt" }}>
                RADNI NALOG
              </span>
              <span style={{ border: "2px solid #000", padding: "3px 16px", fontWeight: "bold", fontSize: "12pt" }}>
                PLAN UTROŠKA MATERIJALA
              </span>
            </div>

            {/* Info row */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12pt", marginBottom: 4 }}>
              <div>
                <span>broj naloga: <b>{data.orderNumber}</b></span>
                <span style={{ marginLeft: 24 }}>datum: <b>{formatDate(data.workOrderDate ?? data.createdAt)}</b></span>
              </div>
              <div>
                <span>kupac: <b>{data.customerName ?? ""}</b></span>
                <span style={{ marginLeft: 16 }}>telefon: {data.customerPhone ?? ""}</span>
              </div>
            </div>

            {/* Department + subtitle */}
            <div style={{ fontSize: "12pt", marginBottom: 8 }}>
              <span>Print za odjele - Nalog #{data.orderNumber} &nbsp;&nbsp;</span>
              <b style={{ border: "1px solid #000", padding: "1px 8px" }}>{dept.departmentName}</b>
              <span style={{ marginLeft: 16 }}>UKUPNO MATERIJALA ZA OVAJ ODJEL</span>
            </div>

            {/* Main table */}
            <table className="pu-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: 20 }}>RB</th>
                  <th rowSpan={2} style={{ width: 40 }}>ŠIFRA</th>
                  <th rowSpan={2}>NAZIV PROIZVODA</th>
                  <th rowSpan={2} style={{ width: 25 }}>JM</th>
                  <th rowSpan={2} style={{ width: 30 }}>KOL</th>
                  <th rowSpan={2} style={{ width: 40 }}>ŠIFRA SIR.</th>
                  <th rowSpan={2}>NAZIV SIROVINE</th>
                  <th rowSpan={2} style={{ width: 25 }}>JM</th>
                  <th colSpan={6} style={{ textAlign: "center" }}>PO NORMATIVU ZA JEDAN KOMAD</th>
                  <th colSpan={2} style={{ textAlign: "center" }} className="highlight">PO NARUDŽBI</th>
                </tr>
                <tr>
                  <th>količina</th>
                  <th>Dužina</th>
                  <th>Širina</th>
                  <th>Visina</th>
                  <th>komada</th>
                  <th>Kant.</th>
                  <th className="highlight">količina</th>
                  <th className="highlight">komada</th>
                </tr>
              </thead>
              <tbody>
                {dept.articles.map((block) => (
                  block.materials.map((mat, matIdx) => (
                    <tr key={`${block.rb}-${matIdx}`}>
                      {matIdx === 0 && (
                        <>
                          <td rowSpan={block.materials.length} style={{ textAlign: "center", fontWeight: "bold" }}>{block.rb}</td>
                          <td rowSpan={block.materials.length} style={{ textAlign: "center" }}>{block.articleCode}</td>
                          <td rowSpan={block.materials.length}>
                            <div style={{ fontWeight: "bold" }}>{block.articleName}</div>
                            <div style={{ fontSize: "10pt", color: "#666" }}>
                              {block.partName}
                              {block.fabricName && <> · Štof: {block.fabricName}</>}
                              {block.nogice1Name && <> · Nogice: {block.nogice1Name}</>}
                              {block.nogice2Name && <> · Nogice 2: {block.nogice2Name}</>}
                              {block.paspulName && <> · Paspul: {block.paspulName}</>}
                              {block.ruckaName && <> · Ručka: {block.ruckaName}</>}
                              {block.stepName && <> · Korak: {block.stepName}</>}
                            </div>
                            {block.customerOrderNumber && (
                              <div style={{ fontSize: "10pt", color: "#666" }}>Serija: {block.customerOrderNumber}</div>
                            )}
                            {block.notes && (
                              <div style={{ fontSize: "10pt", color: "red", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>Napomena: {block.notes}</div>
                            )}
                          </td>
                          <td rowSpan={block.materials.length} style={{ textAlign: "center" }}>{block.unit}</td>
                          <td rowSpan={block.materials.length} style={{ textAlign: "center", fontWeight: "bold" }}>{block.orderQuantity}</td>
                        </>
                      )}
                      <td style={{ textAlign: "center" }}>{mat.materialCode}</td>
                      <td>
                        {mat.isOverridden ? (
                          <span style={{ fontStyle: "italic", color: "#1a5276" }}>
                            {mat.materialName}
                            {mat.originalMaterialName && (
                              <span style={{ fontSize: "10pt", color: "#888", fontStyle: "normal" }}>
                                {" "}(zamjena za: {mat.originalMaterialName})
                              </span>
                            )}
                          </span>
                        ) : (
                          mat.materialName
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>{mat.unit || ""}</td>
                      <td style={{ textAlign: "right" }}>{round(mat.quantity)}</td>
                      <td style={{ textAlign: "right" }}>{mat.length != null ? round(mat.length) : ""}</td>
                      <td style={{ textAlign: "right" }}>{mat.width != null ? round(mat.width) : ""}</td>
                      <td style={{ textAlign: "right" }}>{mat.height != null ? round(mat.height) : ""}</td>
                      <td style={{ textAlign: "right" }}>{mat.pieces != null ? round(mat.pieces) : ""}</td>
                      <td style={{ textAlign: "center" }}>{mat.isEdgebanded ? "DA" : ""}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{round(mat.totalQuantity)}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{mat.totalPieces != null ? round(mat.totalPieces) : ""}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>

            {/* Rekapitulacija */}
            <div style={{ marginTop: 16, fontSize: "12pt" }}>
              <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: "12pt", borderBottom: "1px solid #000", paddingBottom: 2 }}>
                REKAPITULACIJA NALOGA BROJ {data.orderNumber} - UKUPAN UTROŠAK SIROVINA ZA ODJEL: {dept.departmentName}
              </div>
              <table className="recap-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>ŠIFRA SIR.</th>
                    <th>NAZIV SIROVINE</th>
                    <th style={{ width: 40 }}>JM</th>
                    <th style={{ width: 30 }}>Dužina</th>
                    <th style={{ width: 30 }}>Širina</th>
                    <th style={{ width: 30 }}>Visina</th>
                    <th style={{ width: 30 }}>Kant.</th>
                    <th style={{ width: 50 }}>količina</th>
                    <th style={{ width: 50 }} className="highlight">komada</th>
                  </tr>
                </thead>
                <tbody>
                  {dept.recap.map((r, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "center" }}>{r.materialCode}</td>
                      <td>
                        {r.isOverridden ? (
                          <span style={{ fontStyle: "italic", color: "#1a5276" }}>
                            {r.materialName}
                            {r.originalMaterialName && (
                              <span style={{ fontSize: "10pt", color: "#888", fontStyle: "normal" }}>
                                {" "}(zamjena za: {r.originalMaterialName})
                              </span>
                            )}
                          </span>
                        ) : (
                          r.materialName
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>{r.unit}</td>
                      <td style={{ textAlign: "right" }}>{r.length != null ? round(r.length) : ""}</td>
                      <td style={{ textAlign: "right" }}>{r.width != null ? round(r.width) : ""}</td>
                      <td style={{ textAlign: "right" }}>{r.height != null ? round(r.height) : ""}</td>
                      <td style={{ textAlign: "center" }}>{r.isEdgebanded ? "DA" : ""}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>{round(r.totalQuantity)}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }} className="highlight">{r.totalPieces != null ? round(r.totalPieces) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Artikli bez normativa */}
        {articlesWithoutBom.length > 0 && (
          <div style={{ fontFamily: "Arial, sans-serif", padding: "12px 0", marginTop: 24 }}>
            <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: "12pt", borderBottom: "1px solid #000", paddingBottom: 2 }}>
              ARTIKLI BEZ NORMATIVA - NALOG BROJ {data.orderNumber}
            </div>
            <table className="recap-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>RB</th>
                  <th style={{ width: 60 }}>ŠIFRA</th>
                  <th>NAZIV ARTIKLA</th>
                  <th style={{ width: 50 }}>KOLIČINA</th>
                </tr>
              </thead>
              <tbody>
                {articlesWithoutBom.map((a, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                    <td style={{ textAlign: "center" }}>{a.articleCode ?? ""}</td>
                    <td>{a.articleName}</td>
                    <td style={{ textAlign: "center", fontWeight: "bold" }}>{a.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
