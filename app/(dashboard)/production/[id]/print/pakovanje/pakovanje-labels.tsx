"use client";

import { useState } from "react";

/**
 * Extract short article name: model + dimensions (+ optional variant suffix).
 * Strips content type suffixes like "baza + uzglavlje", "madrac", "krevet + madrac", "L+D SANDUK" etc.
 * Keeps variant letters like "M" in "CARMEN 180X200 M baza + uzglavlje" → "CARMEN 180X200 M"
 */
function shortArticleName(name: string): string {
  const pattern = /\s+(?:baza|uzglavlje|madrac|krevet|sanduk|l\+d|l\s*\+\s*d)(?:\b|\s|[+\-])/i;
  const idx = name.search(pattern);
  if (idx > 0) return name.slice(0, idx).trim();
  return name.replace(/[\s\-]*NOVO\s*$/i, '').trim();
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
  /** When this label is part of a set (same serial as krevet), stores the madrac's own article name */
  originalArticleName?: string | null;
}

export interface LabelGroup {
  article: ArticleLabel;
  componentLabels: ComponentLabel[];
}

export function PakovanjeLabels({ groups }: { groups: LabelGroup[] }) {
  // Track editable notes per group index.
  // Intentionally initialized to empty string — packaging labels must not auto-populate
  // notes from the order. Users enter notes manually before printing.
  const [notesMap, setNotesMap] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    groups.forEach((_g, i) => { initial[i] = ""; });
    return initial;
  });

  function handleNotesChange(groupIdx: number, value: string) {
    setNotesMap((prev) => ({ ...prev, [groupIdx]: value }));
  }

  return (
    <div style={{ padding: "20px" }}>
      {groups.map((group, gIdx) => {
        const currentNotes = notesMap[gIdx] ?? "";
        // Skip groups with no component labels (avoids blank pages when filtered)
        if (group.componentLabels.length === 0) return null;
        return (
          <div key={gIdx} className="item-group">
            {/* CB ETIKETE — komponente pakovanja */}
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
                  <div className="info-row"><span className="lk">Naziv:</span><span>{shortArticleName(comp.articleName)}{comp.articleCode ? ` / ${comp.articleCode}` : ""}</span></div>
                  <div className="info-row"><span className="lk">Sadržaj:</span><span>{comp.componentName}</span></div>
                  <div className="info-row"><span className="lk">Nogice:</span><span></span></div>
                  <div className="info-row"><span className="lk">Štof:</span><span>{comp.fabricName ?? ""}</span></div>
                  <div className="info-row"><span className="lk">Serija:</span><span>{comp.serialNumber ? `- ${comp.serialNumber}` : ""}</span></div>
                </div>
                <div style={{ textAlign: "center", fontStyle: "italic", fontWeight: "bold", margin: "6px 0 2px" }}>Napomena:</div>
                <div style={{ textAlign: "center", fontSize: "9pt", minHeight: "14px" }}>
                  <input
                    type="text"
                    value={currentNotes}
                    onChange={(e) => handleNotesChange(gIdx, e.target.value)}
                    style={{
                      width: "100%", textAlign: "center", border: "none", borderBottom: "1px dashed #ccc",
                      outline: "none", fontSize: "9pt", fontFamily: "Arial, sans-serif", background: "transparent",
                    }}
                    className="editable-notes"
                    placeholder="Unesite napomenu..."
                  />
                </div>
                {comp.originalArticleName && (
                  <div style={{ textAlign: "center", fontSize: "9pt", marginTop: "2px", fontStyle: "italic" }}>
                    {shortArticleName(comp.originalArticleName)}
                  </div>
                )}
                <div className="footer-row">
                  <span style={{ fontWeight: "bold", fontSize: "14pt", textTransform: "uppercase" }}>{comp.componentName}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
