import { notFound } from "next/navigation";
import { getPrintData } from "@/lib/utils/print-helpers";
import { readPrintParams } from "@/lib/utils/print-applicability";
import PrintButton from "../print-button";

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Hitan",
  normal: "Normalan",
  low: "Nizak",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Nacrt",
  waiting_material: "Čeka materijal",
  ready: "Spreman",
  in_progress: "U toku",
  completed: "Završen",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("bs", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default async function PrintOrderSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Matrix row for "order" is empty — this call explicitly confirms that
  // any filter/sort query params are silently ignored (Req 9.3).
  void readPrintParams("order", sp);
  const data = await getPrintData(id);

  if (!data) {
    notFound();
  }

  return (
    <>
      <style>{`
        @media print {
          body { font-size: 11pt; }
        }
        @media screen {
          .print-container { max-width: 800px; margin: 0 auto; background: #fff; }
        }
      `}</style>

      <div className="print-container">
        {/* Print button */}
        <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Pregled naloga</h1>
          <PrintButton />
        </div>

        <div className="p-8">
          {/* Header */}
          <header className="border-b-2 border-neutral-800 pb-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold">NokTrack</h1>
                <p className="text-neutral-600">Proizvodni nalog</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">#{data.orderNumber}</p>
                <p className="text-sm text-neutral-600">Datum: {formatDate(data.workOrderDate ?? data.createdAt)}</p>
              </div>
            </div>
          </header>

          {/* Order info grid */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              {data.customerName && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase">Kupac</p>
                  <p className="text-lg font-bold">{data.customerName}</p>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {data.documentNumber && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase">Broj dokumenta</p>
                  <p className="text-lg font-medium">{data.documentNumber}</p>
                </div>
              )}
            </div>
          </div>

          {/* Articles and parts */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-neutral-300">
              Artikli i dijelovi
            </h2>
            
            {data.items.map((item) => (
              <div key={item.articleId} className="mb-6 border border-neutral-200 rounded-lg overflow-hidden">
                {/* Article header */}
                <div className="bg-neutral-100 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{item.articleName}</h3>
                    {item.articleCode && (
                      <p className="text-sm text-neutral-600">Šifra: {item.articleCode}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{item.quantity}x</p>
                    {item.fabric && (
                      <p className="text-sm flex items-center gap-1 justify-end">
                        Stof:
                        {item.fabric.color && (
                          <span
                            className="w-3 h-3 rounded-full border inline-block"
                            style={{ backgroundColor: item.fabric.color }}
                          />
                        )}
                        <span className="font-medium">{item.fabric.name}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Per-item details */}
                <div className="px-4 py-3 border-b border-neutral-200 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase">Prioritet</p>
                    <p className={`font-medium ${item.priority === "urgent" ? "text-red-600" : ""}`}>
                      {PRIORITY_LABELS[item.priority] ?? item.priority}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase">Rok isporuke</p>
                    <p className={`font-medium ${item.deliveryDeadline ? "text-red-600" : "text-neutral-400"}`}>
                      {item.deliveryDeadline ? formatDate(item.deliveryDeadline) : "—"}
                    </p>
                  </div>
                  {item.customerOrderNumber && (
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Ser. broj kupca</p>
                      <p className="font-medium">{item.customerOrderNumber}</p>
                    </div>
                  )}
                </div>

                {/* Per-item notes */}
                {item.notes && (
                  <div className="px-4 py-3 border-b border-neutral-200 bg-amber-50">
                    <p className="text-xs font-semibold text-amber-800 uppercase mb-1">📝 Bilješke</p>
                    <p className="text-sm whitespace-pre-wrap text-amber-900">{item.notes}</p>
                  </div>
                )}
                
                {/* Parts list */}
                <div className="p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left py-2 font-semibold">Dio</th>
                        <th className="text-left py-2 font-semibold">Dimenzije</th>
                        <th className="text-right py-2 font-semibold">Koraka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.parts.map((part) => (
                        <tr key={part.partId} className="border-b border-neutral-100">
                          <td className="py-2 font-medium">{part.partName}</td>
                          <td className="py-2 text-neutral-600">{part.dimensions || "-"}</td>
                          <td className="py-2 text-right">{part.steps.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
