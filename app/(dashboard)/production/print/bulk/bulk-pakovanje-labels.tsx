"use client";

import { useState } from "react";
import type { LabelGroup } from "./page";

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

export interface BulkPakovanjeBundle {
  orderId: string;
  labelGroups: LabelGroup[];
}

interface BulkPakovanjeLabelsProps {
  bundles: BulkPakovanjeBundle[];
}

export function BulkPakovanjeLabels({ bundles }: BulkPakovanjeLabelsProps) {
  // Intentionally initialized to empty string — packaging labels must not auto-populate
  // notes from the order. Users enter notes manually before printing.
  const [notesMap, setNotesMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    bundles.forEach((bundle, oIdx) => {
      bundle.labelGroups.forEach((_g, gIdx) => {
        initial[`${oIdx}-${gIdx}`] = "";
      });
    });
    return initial;
  });

  function handleNotesChange(key: string, value: string) {
    setNotesMap((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div style={{ padding: "20px" }}>
      {bundles.map((bundle, oIdx) =>
        bundle.labelGroups.map((group, gIdx) => {
          const key = `${oIdx}-${gIdx}`;
          const currentNotes = notesMap[key] ?? "";
          return group.componentLabels.map((comp, cIdx) => (
            <div key={`cb-${bundle.orderId}-${gIdx}-${cIdx}`} className="item-group">
              <div className="label-large">
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
                    onChange={(e) => handleNotesChange(key, e.target.value)}
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
                <div className="footer-row" style={{ justifyContent: "center" }}>
                  <span style={{ fontWeight: "bold", fontSize: "14pt", textTransform: "uppercase" }}>{comp.componentName}</span>
                </div>
              </div>
            </div>
          ));
        })
      )}
    </div>
  );
}
