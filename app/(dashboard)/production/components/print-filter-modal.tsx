"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type ArticleInfo, aggregateArticleInfo, type SortKey } from "@/lib/utils/print-helpers";
import {
  type PrintType,
  type Selections,
  EMPTY_SELECTIONS,
  APPLICABILITY_MATRIX,
  pruneNonApplicable,
  buildPrintUrl,
  primaryActionLabel,
} from "@/lib/utils/print-applicability";
import {
  Loader2,
  FileText,
  Printer,
  ScanBarcode,
  Package,
  ClipboardList,
  Layers,
  ArrowUpDown,
  type LucideIcon,
} from "lucide-react";

interface Department {
  id: string;
  name: string;
}

interface PrintFilterModalProps {
  orderIds: string[];
  trigger: ReactNode;
}

/**
 * Human-readable label for each Print_Type, used both as the label on the
 * Step 1 picker button and as the heading ("Filteri za: ...") on Step 2.
 */
const TYPE_DISPLAY_NAMES: Record<PrintType, string> = {
  "radni-nalog": "Radni nalog",
  order: "Pregled naloga",
  "plan-utroska": "Plan utroška",
  "plan-utroska-rekapitulacija": "Rekapitulacija",
  etikete: "Sve etikete",
  pakovanje: "Etikete pakovanja",
  "zbirni-radni-nalog": "Zbirni radni nalog",
  "print-za-odjele": "Štampaj za odjele",
};

/** Icon shown next to each Print_Type button in Step 1. */
const TYPE_ICONS: Record<PrintType, LucideIcon> = {
  "radni-nalog": FileText,
  order: ClipboardList,
  "plan-utroska": FileText,
  "plan-utroska-rekapitulacija": FileText,
  etikete: ScanBarcode,
  pakovanje: Package,
  "zbirni-radni-nalog": Layers,
  "print-za-odjele": Printer,
};

/**
 * Order of Print_Type buttons in the Step 1 grid. Also serves as the set of
 * options enumerated by the picker.
 */
const PRINT_TYPE_ORDER: readonly PrintType[] = [
  "radni-nalog",
  "order",
  "plan-utroska",
  "plan-utroska-rekapitulacija",
  "etikete",
  "pakovanje",
  "zbirni-radni-nalog",
  "print-za-odjele",
];

/**
 * The six canonical packaging component names the modal offers when
 * `pakovanje` is selected (Req 11.1). Kept local so the list matches
 * `readPrintParams`'s `CANONICAL_COMPONENT_NAMES` (which has all 6),
 * rather than `ALL_BED_COMPONENTS` in `bed-label-helpers.ts` (which has 5).
 */
const ALL_COMPONENT_CHOICES = [
  "Lijeva Baza",
  "Desna Baza",
  "Baza",
  "Nogice",
  "Uzglavlje",
  "Madrac",
] as const;

/** Sort keys offered by the modal, paired with their Bosnian labels. */
const SORT_OPTIONS: readonly (readonly [SortKey, string])[] = [
  ["deliveryDate", "Po datumu utovara"],
  ["loadingNumber", "Po broju utovara"],
  ["serialNumber", "Po rednom broju utovara"],
  ["abc", "Po abecedi (naziv artikla)"],
  ["loadingSequence", "Po rednom broju iz utovara"],
];

/** Short labels used in the "Sortiranje: …" summary under the sort list. */
const SORT_SHORT_LABELS: Record<SortKey, string> = {
  deliveryDate: "datum",
  loadingNumber: "br. utovara",
  serialNumber: "r.b. utovara",
  abc: "abeceda",
  loadingSequence: "r.b. iz utovara",
  rb: "rb",
};

type Step = "pick-type" | "configure";

/** Construct a fresh `Selections` with empty slots. */
function freshSelections(): Selections {
  return {
    articles: new Set<string>(),
    parts: new Set<string>(),
    departments: new Set<string>(),
    components: new Set<string>(),
    sort: [],
    aggregate: false,
    groupByBed: false,
  };
}

export function PrintFilterModal({ orderIds, trigger }: PrintFilterModalProps) {
  const [open, setOpen] = useState(false);

  // Step 1 / Step 2 state
  const [step, setStep] = useState<Step>("pick-type");
  const [type, setType] = useState<PrintType | null>(null);
  const [selections, setSelections] = useState<Selections>(() => freshSelections());

  // Available options fetched from the API (not the user's selections).
  const [departments, setDepartments] = useState<Department[]>([]);
  const [partNames, setPartNames] = useState<string[]>([]);
  const [articleNames, setArticleNames] = useState<ArticleInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const isBulk = orderIds.length > 1;

  // Reset to Step 1 and re-fetch available options every time the modal
  // opens or the set of selected orders changes.
  useEffect(() => {
    if (!open) return;

    setStep("pick-type");
    setType(null);
    setSelections(freshSelections());
    setLoading(true);

    const orderFetches = orderIds.map((id) =>
      fetch(`/api/production-orders/${id}`).then((r) => (r.ok ? r.json() : null))
    );

    Promise.all([
      fetch("/api/departments").then((r) => (r.ok ? r.json() : [])),
      ...orderFetches,
    ])
      .then(([depts, ...ordersData]: [Department[], ...any[]]) => {
        setDepartments(depts);

        // Collect all unique part names across selected orders.
        const allPartNames = new Set<string>();
        for (const od of ordersData) {
          if (!od?.order?.items) continue;
          for (const item of od.order.items) {
            if (item.article?.parts) {
              for (const part of item.article.parts) {
                allPartNames.add(part.partName);
              }
            }
          }
        }
        setPartNames(Array.from(allPartNames).sort((a, b) => a.localeCompare(b, "bs")));

        // Aggregate article info across all orders.
        const allOrdersPrintData = ordersData
          .filter((od: any) => od?.order?.items)
          .map((od: any) => ({
            orderId: od.order.id as string,
            orderNumber: od.order.orderNumber as number,
            customerName: od.order.customerName as string | null,
            customerPhone: od.order.customerPhone as string | null,
            documentNumber: od.order.documentNumber as string | null,
            deliveryLocation: od.order.deliveryLocation as string | null,
            receivedBy: od.order.receivedBy as string | null,
            createdAt: od.order.createdAt as Date,
            items: od.order.items.map((item: any) => ({
              articleName: item.article?.name ?? "",
              quantity: item.quantity ?? 0,
            })),
          }));

        const articles = aggregateArticleInfo(allOrdersPrintData as any);
        setArticleNames(articles.sort((a, b) => a.name.localeCompare(b.name, "bs")));
      })
      .catch(() => {
        setDepartments([]);
      })
      .finally(() => setLoading(false));
  }, [open, orderIds]);

  // Step 1 → Step 2 transition. Preserves selections applicable to both
  // the old and the new Print_Type; clears the rest (Req 1.3, 1.4, 11.5).
  function handleSelectType(next: PrintType) {
    setType(next);
    setSelections((s) => pruneNonApplicable(s, next));
    setStep("configure");
  }

  function handleBackToPicker() {
    setStep("pick-type");
  }

  function handleToggleArticle(name: string) {
    setSelections((s) => {
      const next = new Set(s.articles);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...s, articles: next };
    });
  }

  function handleTogglePart(name: string) {
    setSelections((s) => {
      const next = new Set(s.parts);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...s, parts: next };
    });
  }

  function handleToggleDepartment(deptId: string) {
    setSelections((s) => {
      const next = new Set(s.departments);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return { ...s, departments: next };
    });
  }

  function handleToggleComponent(name: string) {
    setSelections((s) => {
      const next = new Set(s.components);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...s, components: next };
    });
  }

  function handleToggleSort(key: SortKey) {
    setSelections((s) => ({
      ...s,
      sort: s.sort.includes(key) ? s.sort.filter((k) => k !== key) : [...s.sort, key],
    }));
  }

  function handleToggleAggregate(checked: boolean) {
    setSelections((s) => ({ ...s, aggregate: checked }));
  }

  // Single primary action — only invoked from Step 2, so `type` is guaranteed
  // non-null. Route selection and query serialization are delegated to
  // `buildPrintUrl`, which enforces the matrix contract (Req 2.3, 2.4, 9.2).
  function handleConfirm() {
    if (!type) return;
    const url = buildPrintUrl(type, selections, {
      orderIds,
      summary: type === "zbirni-radni-nalog",
    });
    window.open(url, "_blank");
    setOpen(false);
  }

  const applicable = type ? APPLICABILITY_MATRIX[type] : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opcije štampe</DialogTitle>
          <DialogDescription>
            {isBulk
              ? `Odaberite šta želite štampati za ${orderIds.length} naloga`
              : "Odaberite šta želite štampati"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Učitavanje podataka...
          </div>
        ) : step === "pick-type" ? (
          // ─── Step 1: Print_Type picker ──────────────────────────────
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Tip dokumenta</Label>
            <p className="text-xs text-muted-foreground">
              Odaberite tip dokumenta da biste vidjeli dostupne filtere.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PRINT_TYPE_ORDER.map((t) => {
                const Icon = TYPE_ICONS[t];
                return (
                  <Button
                    key={t}
                    type="button"
                    variant="outline"
                    className="justify-start h-auto py-3"
                    onClick={() => handleSelectType(t)}
                  >
                    <Icon className="h-4 w-4 mr-2 shrink-0" />
                    <span className="text-left text-sm">{TYPE_DISPLAY_NAMES[t]}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          // ─── Step 2: Applicable_Controls for the selected Print_Type ─
          type &&
          applicable && (
            <div className="space-y-2 py-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Filteri za: {TYPE_DISPLAY_NAMES[type]}
                </h3>
                <button
                  type="button"
                  onClick={handleBackToPicker}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  ← Promijeni tip dokumenta
                </button>
              </div>

              {/* Article filter */}
              {applicable.has("articles") && (
                <div className="space-y-2 py-2 border-t">
                  <Label className="text-sm font-medium">Filter po artiklu</Label>
                  <p className="text-xs text-muted-foreground">
                    Ako ništa nije odabrano, štampaju se svi artikli.
                  </p>
                  {articleNames.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nema dostupnih artikala</p>
                  ) : (
                    <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                      {articleNames.map((article) => (
                        <label
                          key={article.name}
                          className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                        >
                          <Checkbox
                            checked={selections.articles.has(article.name)}
                            onCheckedChange={() => handleToggleArticle(article.name)}
                          />
                          <span className="text-sm flex-1">{article.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({article.totalQuantity})
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {selections.articles.size > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Odabrano: {selections.articles.size} od {articleNames.length} artikala
                    </p>
                  )}
                </div>
              )}

              {/* Part filter — for etikete */}
              {applicable.has("parts") && (
                <div className="space-y-2 py-2 border-t">
                  <Label className="text-sm font-medium">Filter po dijelu</Label>
                  <p className="text-xs text-muted-foreground">
                    Ako ništa nije odabrano, štampaju se svi dijelovi.
                  </p>
                  {partNames.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nema dostupnih dijelova</p>
                  ) : (
                    <div className="grid gap-1.5 max-h-36 overflow-y-auto">
                      {partNames.map((name) => (
                        <label
                          key={name}
                          className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                        >
                          <Checkbox
                            checked={selections.parts.has(name)}
                            onCheckedChange={() => handleTogglePart(name)}
                          />
                          <span className="text-sm">{name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Department filter — rendered inline, no separate button */}
              {applicable.has("departments") && (
                <div className="space-y-2 py-2 border-t">
                  <Label className="text-sm font-medium">Filter po odjelu</Label>
                  <p className="text-xs text-muted-foreground">
                    Ako ništa nije odabrano, štampaju se svi odjeli.
                  </p>
                  {departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nema dostupnih odjela</p>
                  ) : (
                    <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                      {departments.map((dept) => (
                        <label
                          key={dept.id}
                          className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                        >
                          <Checkbox
                            checked={selections.departments.has(dept.id)}
                            onCheckedChange={() => handleToggleDepartment(dept.id)}
                          />
                          <span className="text-sm">{dept.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Packaging component filter — for pakovanje */}
              {applicable.has("components") && (
                <div className="space-y-2 py-2 border-t">
                  <Label className="text-sm font-medium">Filter po komponenti pakovanja</Label>
                  <p className="text-xs text-muted-foreground">
                    Ako ništa nije odabrano, štampaju se sve komponente.
                  </p>
                  <div className="grid gap-1.5">
                    {ALL_COMPONENT_CHOICES.map((name) => (
                      <label
                        key={name}
                        className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                      >
                        <Checkbox
                          checked={selections.components.has(name)}
                          onCheckedChange={() => handleToggleComponent(name)}
                        />
                        <span className="text-sm">{name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Sort options */}
              {applicable.has("sort") && (
                <div className="space-y-2 py-2 border-t">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Sortiranje stavki
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Redoslijed odabira određuje prioritet sortiranja.
                  </p>
                  <div className="grid gap-1.5">
                    {SORT_OPTIONS.map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                      >
                        <Checkbox
                          checked={selections.sort.includes(key)}
                          onCheckedChange={() => handleToggleSort(key)}
                        />
                        <span className="text-sm flex-1">{label}</span>
                        {selections.sort.includes(key) && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {selections.sort.indexOf(key) + 1}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  {selections.sort.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Sortiranje: {selections.sort.map((k) => SORT_SHORT_LABELS[k]).join(" → ")}
                    </p>
                  )}
                </div>
              )}

              {/* Group by bed name — only for plan-utroska-rekapitulacija */}
              {applicable.has("groupByBed") && (
                <div className="space-y-2 py-2 border-t">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selections.groupByBed}
                      onCheckedChange={(checked) =>
                        setSelections((s) => ({ ...s, groupByBed: checked === true }))
                      }
                    />
                    <span className="text-sm">Grupiši po nazivu kreveta</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Grupiše materijale pod zaglavljima naziva kreveta/artikla.
                  </p>
                </div>
              )}

              {/* Aggregate option — only for zbirni radni nalog */}
              {applicable.has("aggregate") && (
                <div className="space-y-2 py-2 border-t">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selections.aggregate}
                      onCheckedChange={(checked) => handleToggleAggregate(checked === true)}
                    />
                    <span className="text-sm">Saberi iste artikle</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Sabira stavke s istim artiklom u jedan red sa zbirnom količinom.
                  </p>
                </div>
              )}
            </div>
          )
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Zatvori
          </Button>
          {step === "configure" && type && (
            <Button type="button" onClick={handleConfirm} disabled={loading}>
              <Printer className="h-4 w-4 mr-2" />
              {primaryActionLabel(type)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
