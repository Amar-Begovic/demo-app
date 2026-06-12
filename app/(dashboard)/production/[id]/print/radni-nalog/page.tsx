import { notFound } from "next/navigation";
import { getPrintData, sortPrintData, filterItemsByArticle, calculateSetCount, formatSetCount } from "@/lib/utils/print-helpers";
import type { SortKey } from "@/lib/utils/print-helpers";
import { readPrintParams } from "@/lib/utils/print-applicability";
import PrintButton from "../print-button";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("bs", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}



export default async function RadniNalogPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const applied = readPrintParams("radni-nalog", sp);
  let data = await getPrintData(id);

  if (!data) {
    notFound();
  }

  if (applied.articles.size > 0) {
    data = filterItemsByArticle(data, new Set(applied.articles));
  }
  // Default sort by serial number when no explicit sort is specified
  // (matches zbirni radni nalog behavior)
  const sortKeys: SortKey[] = applied.sort.length > 0 ? [...applied.sort] : ["serialNumber"];
  data = sortPrintData(data, sortKeys);



  // Collect all rows first, then generate barcodes in parallel
  interface RowData {
    rb: number;
    articleName: string;
    articleCode: string | null;
    articleDescription: string | null;
    quantity: number;
    parts: string;
    fabricName: string | null;
    stepName: string | null;
    ruckaName: string | null;
    paspulName: string | null;
    nogice1Name: string | null;
    nogice2Name: string | null;
    deadline: Date | null;
    customerOrderNumber: string | null;
    loadingNumber: string | null;
    serialNumber: string | null;
    notes: string | null;
    loadingSequence: number | null;
  }

  // Helper: extract model + dimensions from article name (e.g. "NATURAL LUXURY 180X200 madrac /" → "NATURAL LUXURY 180X200")
  function shortName(name: string): string {
    const match = name.match(/^(.+?\s*\d+[Xx×]\d+)/);
    return match ? match[1].trim() : name;
  }

  const pendingRows: RowData[] = [];
  let rb = 0;
  for (const item of data.items) {
    const serialParts = item.serialNumber ? item.serialNumber.split(",") : [];
    for (let i = 0; i < item.quantity; i++) {
      rb++;
      pendingRows.push({
        rb,
        articleName: shortName(item.articleName),
        articleCode: item.articleCode,
        articleDescription: item.articleDescription,
        quantity: 1,
        parts: item.parts.map((p) => p.partName).join("+"),
        fabricName: item.fabric?.name ?? null,
        stepName: item.step ?? null,
        ruckaName: item.rucka?.name ?? null,
        paspulName: item.paspul?.name ?? null,
        nogice1Name: item.nogice1?.name ?? null,
        nogice2Name: item.nogice2?.name ?? null,
        deadline: item.deliveryDeadline,
        customerOrderNumber: item.customerOrderNumber,
        loadingNumber: item.loadingNumber,
        notes: item.notes,
        loadingSequence: item.loadingSequence,
        serialNumber: serialParts[i] ?? item.serialNumber,
      });
    }
  }

  // Merge rows that share the same serial number (complementary sets like krevet + madrac)
  // BUT: if rows in the same serial group have different notes, keep them separate
  // (still consecutive, still sharing the serial number).
  const mergedRows: RowData[] = [];
  const serialGroups = new Map<string, RowData[]>();
  const serialOrder: string[] = [];
  for (const row of pendingRows) {
    if (row.serialNumber) {
      if (!serialGroups.has(row.serialNumber)) {
        serialGroups.set(row.serialNumber, []);
        serialOrder.push(row.serialNumber);
      }
      serialGroups.get(row.serialNumber)!.push(row);
    } else {
      mergedRows.push(row);
    }
  }

  /** Sort within serial group: krevet first, madrac second, others last. */
  function serialGroupOrder(row: RowData): number {
    const text = `${row.articleName} ${row.articleDescription ?? ""} ${row.parts}`.toLowerCase();
    if (text.includes("krevet")) return 0;
    if (text.includes("madrac")) return 1;
    return 2;
  }

  /** Check if all rows in a group share the same notes (null/empty treated as equal). */
  function allSameNotes(rows: RowData[]): boolean {
    const norm = (n: string | null) => (n == null || n === "" ? null : n);
    const first = norm(rows[0].notes);
    return rows.every((r) => norm(r.notes) === first);
  }

  for (const serial of serialOrder) {
    const groupRows = serialGroups.get(serial)!;
    // Sort: krevet first, madrac second
    groupRows.sort((a, b) => serialGroupOrder(a) - serialGroupOrder(b));
    if (groupRows.length === 1) {
      mergedRows.push(groupRows[0]);
    } else if (!allSameNotes(groupRows)) {
      // Different notes → don't merge, keep consecutive rows sharing the serial
      // Assign the same rb (min from group) so they stay together after final sort
      const groupRb = Math.min(...groupRows.map((r) => r.rb));
      for (const r of groupRows) { r.rb = groupRb; mergedRows.push(r); }
    } else {
      // Merge: combine names and descriptions into separate lines for set display
      const first = groupRows[0];
      const allNames = groupRows.map((r) => r.articleName);
      const uniqueNames = [...new Set(allNames)];
      const allDescriptions = groupRows.map((r) => r.articleDescription ?? r.parts);
      const combinedContent = [...new Set(allDescriptions)].join("\n");
      mergedRows.push({
        ...first,
        articleName: uniqueNames.length > 1 ? uniqueNames.join("\n") : first.articleName,
        articleDescription: combinedContent,
        quantity: 1,
      });
    }
  }
  // Re-number and sort by original rb (keeps serial groups together)
  mergedRows.sort((a, b) => a.rb - b.rb);
  mergedRows.forEach((row, idx) => { row.rb = idx + 1; });

  const rows = mergedRows;

  const setCount = calculateSetCount(rows);
  const formattedSetCount = formatSetCount(setCount);

  if (rows.length === 0) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: "18pt", marginBottom: 16 }}>Nema sadržaja za odabrane filtere</h1>
        <p style={{ color: "#666" }}>Nijedan artikal nije prošao filter za ovaj radni nalog.</p>
      </div>
    );
  }

  // Sort key labels for display
  const sortKeyLabels: Record<string, string> = {
    serialNumber: "serijski broj",
    loadingNumber: "br. utovara",
    loadingSequence: "r.b. utovara",
    deliveryDate: "datum isporuke",
    abc: "naziv artikla",
    rb: "redni broj",
  };
  const sortLabel = sortKeys.map((k) => sortKeyLabels[k] ?? k).join(", ");

  return (
    <>
      <style>{`
        @media print {
          body { font-size: 9pt; }
          @page { margin: 8mm; }
        }
        @media screen {
          .print-page { max-width: 1100px; margin: 0 auto; background: #fff; }
        }
        .rn-table { border-collapse: collapse; width: 100%; }
        .rn-table th, .rn-table td { border: 1px solid #000; padding: 3px 6px; text-align: left; font-size: 12pt; word-wrap: break-word; overflow-wrap: break-word; }
        .rn-table th { font-weight: bold; font-size: 10pt; }
      `}</style>

      <div className="print-page">
        <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Radni nalog #{data.orderNumber}</h1>
          <PrintButton />
        </div>

        <div className="p-6" style={{ fontFamily: "Arial, sans-serif", fontSize: "9pt", position: "relative" }}>

          {/* Sort indicator - top right corner */}
          <div style={{ position: "absolute", top: "24px", right: "24px", fontSize: "8pt", color: "#555", textAlign: "right" }}>
            sortirano po: <strong>{sortLabel}</strong>
          </div>

          {/* Company header */}
          <div style={{ marginBottom: "4px", fontSize: "9pt", lineHeight: "1.3" }}>
            <div>Demo Company d.o.o.</div>
            <div>76100 Brčko, Brod bb</div>
            <div>JIB: 4600471110010 &nbsp; PDV: 600471110002</div>
            <div>žiro-račun:</div>
          </div>

          {/* Title */}
          <div style={{ textAlign: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "12pt", fontWeight: "bold", marginBottom: "4px" }}>
              PLAN PROIZVODNJE
            </div>
            <span style={{ border: "2px solid #000", padding: "4px 24px", fontSize: "14pt", fontWeight: "bold" }}>
              RADNI NALOG
            </span>
          </div>

          {/* Info grid - two columns */}
          <div style={{ display: "flex", gap: "40px", marginBottom: "16px", fontSize: "9pt" }}>
            {/* Left column */}
            <div style={{ lineHeight: "1.6" }}>
              <div>
                <span>broj naloga: </span>
                <span style={{ fontWeight: "bold" }}>{data.orderNumber}</span>
              </div>
              {data.documentNumber && (
                <div>
                  <span>dokument: </span>
                  <span style={{ fontWeight: "bold" }}>{data.documentNumber}</span>
                </div>
              )}
              <div>
                <span>datum: </span>
                <span style={{ fontWeight: "bold" }}>{formatDate(data.workOrderDate ?? data.createdAt)}</span>
              </div>
            </div>

            {/* Right column */}
            <div style={{ lineHeight: "1.6" }}>
              {data.customerName && (
                <div>
                  <span>kupac: </span>
                  <span style={{ fontWeight: "bold" }}>{data.customerName}</span>
                </div>
              )}
              <div>
                <span>telefon: </span>
                <span>{data.customerPhone ?? ""}</span>
              </div>
              {data.deliveryLocation && (
                <div>
                  <span>mjesto isporuke: </span>
                  <span style={{ fontWeight: "bold" }}>{data.deliveryLocation}</span>
                </div>
              )}
              {data.receivedBy && (
                <div>
                  <span>narudžbu primio: </span>
                  <span>{data.receivedBy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Main table */}
          <table className="rn-table">
            <thead>
              <tr>
                <th style={{ width: "30px" }}>r.b.</th>
                <th style={{ width: "60px" }}>serijski broj</th>
                <th style={{ minWidth: "180px", whiteSpace: "nowrap" }}>naziv</th>
                <th style={{ width: "28px" }}>kol.</th>
                <th style={{ width: "70px", maxWidth: "70px" }}>sadržaj</th>
                <th>štof</th>
                <th>štep</th>
                <th>ručka</th>
                <th>paspul</th>
                <th>nogice 1</th>
                <th>nogice 2</th>
                <th>napomena</th>
                <th style={{ width: "60px" }}>br.utovara</th>
                <th style={{ width: "60px" }}>datum</th>
                <th style={{ width: "40px" }}>r.b.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rb}>
                  <td>{row.rb}</td>
                  <td>{row.serialNumber ?? ""}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{row.articleName.includes("\n") ? row.articleName.split("\n").map((line, i) => <div key={i}>{line}</div>) : row.articleName}</td>
                  <td>{row.quantity}</td>
                  <td style={{ maxWidth: "70px", wordBreak: "break-word" }}>{(row.articleDescription ?? row.parts).includes("\n") ? (row.articleDescription ?? row.parts).split("\n").map((line, i) => <div key={i}>{line}</div>) : (row.articleDescription ?? row.parts)}</td>
                  <td>{row.fabricName ?? ""}</td>
                  <td>{row.stepName ?? ""}</td>
                  <td>{row.ruckaName ?? ""}</td>
                  <td>{row.paspulName ?? ""}</td>
                  <td>{row.nogice1Name ?? ""}</td>
                  <td>{row.nogice2Name ?? ""}</td>
                  <td style={{ color: "#dc2626" }}>{row.notes ?? ""}</td>
                  <td className="text-center">{row.loadingNumber ?? ""}</td>
                  <td className="text-center">{row.deadline ? formatDate(row.deadline) : ""}</td>
                  <td className="text-center">{row.loadingSequence ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ display: "table-row-group" }}>
              <tr>
                <td colSpan={3} style={{ textAlign: "right", fontWeight: "bold" }}>Ukupno:</td>
                <td style={{ fontWeight: "bold" }}>{rows.length}</td>
                <td colSpan={11} style={{ textAlign: "right", fontWeight: "bold", paddingRight: "12px" }}>Setova: {formattedSetCount}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
