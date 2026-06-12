"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  Calculator,
  Pencil,
  Package,
} from "lucide-react";
import { StepsModal } from "@/app/(dashboard)/articles/components/steps-modal";
import type { StepDraft as StepsModalStepDraft } from "@/app/(dashboard)/articles/components/steps-modal";

// --- Types ---

interface MaterialOption {
  id: string;
  name: string;
  unit: string;
  code: string | null;
  currentQuantity: number;
  hasDimensions: boolean;
  isEdgebanded: boolean;
  price: number | null;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface PartDraft {
  key: string; // client-side key for React
  partName: string;
  dimensions: string;
  notes: string;
}

interface MaterialRequirement {
  materialId: string;
  materialName: string;
  requiredQuantity: number;
  availableQuantity: number;
  deficit: number;
}

interface StepMaterialData {
  materialId: string;
  materialName: string;
  materialUnit: string;
  quantity: number;
  length: number | null;
  width: number | null;
  height: number | null;
  isEdgebanded: boolean | null;
  hasDimensions: boolean;
  materialIsEdgebanded: boolean;
  price: number | null;
}

interface StepDraft {
  id?: string;
  stepName: string;
  sequenceOrder: number;
  departmentId: string;
  estimatedTime: number | null;
  instructions: string;
  materials: StepMaterialData[];
}

interface ArticleData {
  id: string;
  name: string;
  description: string | null;
  dimensions: string | null;
  code: string | null;
  model: string | null;
  type: string | null;
  articleGroup: string | null;
  unit: string | null;
  inactive: boolean;
  currency: string | null;
  priceWithoutVAT: number | null;
  taxPercentage: number | null;
  relatedArticleCode: string | null;
  parts: {
    id: string;
    partName: string;
    dimensions: string | null;
    notes: string | null;
  }[];
}

let keyCounter = 0;
function nextKey() {
  return `part-${++keyCounter}`;
}

export default function ArticleBOMPage({ id }: { id: string }) {
  const articleId = id;

  const [article, setArticle] = useState<ArticleData | null>(null);
  const [allMaterials, setAllMaterials] = useState<MaterialOption[]>([]);
  const [allDepartments, setAllDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [articleDimensions, setArticleDimensions] = useState("");
  const [code, setCode] = useState("");
  const [model, setModel] = useState("");
  const [type, setType] = useState("");
  const [articleGroup, setArticleGroup] = useState("");
  const [unit, setUnit] = useState("");
  const [inactive, setInactive] = useState(false);
  const [currency, setCurrency] = useState("BAM");
  const [priceWithoutVAT, setPriceWithoutVAT] = useState("");
  const [taxPercentage, setTaxPercentage] = useState("17");
  const [relatedArticleCode, setRelatedArticleCode] = useState("");
  const [parts, setParts] = useState<PartDraft[]>([]);

  // Requirements calculator
  const [calcQuantity, setCalcQuantity] = useState(1);
  const [requirements, setRequirements] = useState<MaterialRequirement[] | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Production steps state
  const [stepsByPart, setStepsByPart] = useState<Record<string, StepDraft[]>>({});
  const [openModalPartId, setOpenModalPartId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [artRes, matRes, deptRes] = await Promise.all([
        fetch(`/api/articles/${articleId}`),
        fetch("/api/materials"),
        fetch("/api/departments"),
      ]);

      if (!artRes.ok) {
        setError("Artikal nije pronađen");
        setLoading(false);
        return;
      }

      const artData: ArticleData = await artRes.json();
      setArticle(artData);
      setName(artData.name);
      setDescription(artData.description ?? "");
      setArticleDimensions(artData.dimensions ?? "");
      setCode(artData.code ?? "");
      setModel(artData.model ?? "");
      setType(artData.type ?? "");
      setArticleGroup(artData.articleGroup ?? "");
      setUnit(artData.unit ?? "");
      setInactive(artData.inactive ?? false);
      setCurrency(artData.currency ?? "BAM");
      setPriceWithoutVAT(artData.priceWithoutVAT != null ? String(artData.priceWithoutVAT) : "");
      setTaxPercentage(artData.taxPercentage != null ? String(artData.taxPercentage) : "17");
      setRelatedArticleCode(artData.relatedArticleCode ?? "");
      setParts(
        artData.parts.map((p) => ({
          key: nextKey(),
          partName: p.partName,
          dimensions: p.dimensions ?? "",
          notes: p.notes ?? "",
        }))
      );

      let matList: MaterialOption[] = [];
      if (matRes.ok) {
        matList = await matRes.json();
        setAllMaterials(matList);
      }
      if (deptRes.ok) setAllDepartments(await deptRes.json());

      // Fetch steps for each part
      const matMap = new Map(matList.map((m) => [m.id, m]));
      const stepsMap: Record<string, StepDraft[]> = {};
      for (const part of artData.parts) {
        try {
          const stepsRes = await fetch(`/api/articles/${articleId}/parts/${part.id}/steps`);
          if (stepsRes.ok) {
            const steps = await stepsRes.json();
            stepsMap[part.id] = steps.map((s: {
              id?: string;
              stepName: string;
              sequenceOrder: number;
              departmentId: string;
              estimatedTime: number | null;
              instructions: string | null;
              materials?: Array<{
                materialId: string;
                quantity: number;
                length?: number | null;
                width?: number | null;
                height?: number | null;
                isEdgebanded?: boolean | null;
                material: { id: string; name: string; unit: string; hasDimensions?: boolean; isEdgebanded?: boolean; price?: number | null };
              }>;
            }) => ({
              id: s.id,
              stepName: s.stepName,
              sequenceOrder: s.sequenceOrder,
              departmentId: s.departmentId,
              estimatedTime: s.estimatedTime,
              instructions: s.instructions ?? "",
              materials: (s.materials ?? []).map((m) => {
                const matInfo = matMap.get(m.materialId);
                return {
                  materialId: m.materialId,
                  materialName: m.material.name,
                  materialUnit: m.material.unit,
                  quantity: m.quantity,
                  length: m.length ?? null,
                  width: m.width ?? null,
                  height: m.height ?? null,
                  isEdgebanded: m.isEdgebanded ?? null,
                  hasDimensions: matInfo?.hasDimensions ?? m.material.hasDimensions ?? false,
                  materialIsEdgebanded: matInfo?.isEdgebanded ?? m.material.isEdgebanded ?? false,
                  price: m.material.price ?? null,
                };
              }),
            }));
          }
        } catch {
          // silent — steps will just be empty for this part
        }
      }
      setStepsByPart(stepsMap);
    } catch {
      setError("Greška pri učitavanju");
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Part operations ---

  function addPart() {
    setParts((prev) => [
      ...prev,
      { key: nextKey(), partName: "", dimensions: "", notes: "" },
    ]);
  }

  function removePart(key: string) {
    setParts((prev) => prev.filter((p) => p.key !== key));
  }

  function updatePart(key: string, field: keyof Omit<PartDraft, "key">, value: string) {
    setParts((prev) =>
      prev.map((p) => (p.key === key ? { ...p, [field]: value } : p))
    );
  }

  // --- Step operations ---

  function getPartId(partIdx: number): string | null {
    return article?.parts[partIdx]?.id ?? null;
  }

  function getDepartmentName(deptId: string): string {
    return allDepartments.find((d) => d.id === deptId)?.name ?? "—";
  }

  // Task 7.4: Refetch steps for a part after StepsModal saves
  async function fetchStepsForPart(partId: string) {
    try {
      const res = await fetch(`/api/articles/${articleId}/parts/${partId}/steps`);
      if (res.ok) {
        const steps = await res.json();
        const matMap = new Map(allMaterials.map((m) => [m.id, m]));
        setStepsByPart((prev) => ({
          ...prev,
          [partId]: steps.map((s: {
            id?: string;
            stepName: string;
            sequenceOrder: number;
            departmentId: string;
            estimatedTime: number | null;
            instructions: string | null;
            materials?: Array<{
              materialId: string;
              quantity: number;
              length?: number | null;
              width?: number | null;
              height?: number | null;
              isEdgebanded?: boolean | null;
              material: { id: string; name: string; unit: string; hasDimensions?: boolean; isEdgebanded?: boolean; price?: number | null };
            }>;
          }) => ({
            id: s.id,
            stepName: s.stepName,
            sequenceOrder: s.sequenceOrder,
            departmentId: s.departmentId,
            estimatedTime: s.estimatedTime,
            instructions: s.instructions ?? "",
            materials: (s.materials ?? []).map((m) => {
              const matInfo = matMap.get(m.materialId);
              return {
                materialId: m.materialId,
                materialName: m.material.name,
                materialUnit: m.material.unit,
                quantity: m.quantity,
                length: m.length ?? null,
                width: m.width ?? null,
                height: m.height ?? null,
                isEdgebanded: m.isEdgebanded ?? null,
                hasDimensions: matInfo?.hasDimensions ?? m.material.hasDimensions ?? false,
                materialIsEdgebanded: matInfo?.isEdgebanded ?? m.material.isEdgebanded ?? false,
                price: m.material.price ?? null,
              };
            }),
          })),
        }));
      }
    } catch {
      // silent
    }
  }

  // Map local StepDraft[] to StepsModal's StepDraft[] format
  function mapToModalSteps(steps: StepDraft[]): StepsModalStepDraft[] {
    return steps.map((s) => ({
      id: s.id,
      stepName: s.stepName,
      sequenceOrder: s.sequenceOrder,
      departmentId: s.departmentId,
      estimatedTime: s.estimatedTime,
      instructions: s.instructions,
      materials: s.materials.map((m) => ({
        materialId: m.materialId,
        materialName: m.materialName,
        materialUnit: m.materialUnit,
        quantity: m.quantity,
        length: m.length,
        width: m.width,
        height: m.height,
        isEdgebanded: m.isEdgebanded,
        hasDimensions: m.hasDimensions,
        materialIsEdgebanded: m.materialIsEdgebanded,
        price: m.price,
      })),
    }));
  }

  // --- Save ---

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/articles/${articleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          dimensions: articleDimensions.trim() || undefined,
          code: code.trim() || undefined,
          model: model.trim() || undefined,
          type: type || undefined,
          articleGroup: articleGroup || undefined,
          unit: unit || undefined,
          inactive: inactive,
          currency: currency || "BAM",
          priceWithoutVAT: priceWithoutVAT ? parseFloat(priceWithoutVAT) : undefined,
          taxPercentage: taxPercentage ? parseFloat(taxPercentage) : undefined,
          relatedArticleCode: relatedArticleCode.trim() || undefined,
          parts: parts.map((p) => ({
            partName: p.partName.trim(),
            dimensions: p.dimensions.trim() || undefined,
            notes: p.notes.trim() || undefined,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Greška pri spremanju");
        return;
      }

      const updated: ArticleData = await res.json();
      setArticle(updated);
      setSuccess("Artikal uspješno ažuriran");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Greška pri spremanju");
    } finally {
      setSaving(false);
    }
  }

  // --- Calculate requirements ---

  async function calculateRequirements() {
    setCalcLoading(true);
    setRequirements(null);

    try {
      const res = await fetch(
        `/api/articles/${articleId}/requirements?quantity=${calcQuantity}`
      );
      if (res.ok) {
        setRequirements(await res.json());
      }
    } catch {
      // silent
    } finally {
      setCalcLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Učitavanje...
      </div>
    );
  }

  if (!article) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error || "Artikal nije pronađen"}</p>
        <Button variant="outline" asChild>
          <Link href="/articles">
            <ArrowLeft className="h-4 w-4" />
            Nazad na artikle
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon-sm" asChild>
            <Link href="/articles" aria-label="Nazad na artikle">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{article.name}</h1>
            <p className="text-muted-foreground">BOM Editor — Sastavnica artikla</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Spremanje..." : "Spremi promjene"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle>Osnovni podaci</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Naziv, Šifra, Vrsta, Grupa */}
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="grid gap-2">
              <label htmlFor="art-name" className="text-sm font-medium">Naziv *</label>
              <Input
                id="art-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-code" className="text-sm font-medium">Šifra</label>
              <Input
                id="art-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SKU/Šifra artikla"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-model" className="text-sm font-medium">Model</label>
              <Input
                id="art-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="npr. PALERMO"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-type" className="text-sm font-medium">Vrsta</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="art-type">
                  <SelectValue placeholder="Odaberi vrstu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gotov proizvod">Gotov proizvod</SelectItem>
                  <SelectItem value="Poluproizvod">Poluproizvod</SelectItem>
                  <SelectItem value="Sirovina">Sirovina</SelectItem>
                  <SelectItem value="Usluga">Usluga</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-group" className="text-sm font-medium">Grupa</label>
              <Select value={articleGroup} onValueChange={setArticleGroup}>
                <SelectTrigger id="art-group">
                  <SelectValue placeholder="Odaberi grupu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Metalni">Metalni</SelectItem>
                  <SelectItem value="Drveni">Drveni</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Opis, Dimenzije, Jedinica mjere, Vezani artikal šifra */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2">
              <label htmlFor="art-desc" className="text-sm font-medium">Opis</label>
              <Input
                id="art-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcionalni opis"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-dims" className="text-sm font-medium">Dimenzije</label>
              <Input
                id="art-dims"
                value={articleDimensions}
                onChange={(e) => setArticleDimensions(e.target.value)}
                placeholder="npr. 120x200"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-unit" className="text-sm font-medium">Jedinica mjere</label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="art-unit">
                  <SelectValue placeholder="Odaberi jedinicu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kom">kom</SelectItem>
                  <SelectItem value="m">m</SelectItem>
                  <SelectItem value="m²">m²</SelectItem>
                  <SelectItem value="m³">m³</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="l">l</SelectItem>
                  <SelectItem value="rol">rol</SelectItem>
                  <SelectItem value="par">par</SelectItem>
                  <SelectItem value="milla">milla</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-related-code" className="text-sm font-medium">Vezani artikal šifra</label>
              <Input
                id="art-related-code"
                value={relatedArticleCode}
                onChange={(e) => setRelatedArticleCode(e.target.value)}
                placeholder="Šifra vezanog artikla"
              />
            </div>
          </div>

          {/* Row 3: Neaktivan toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="art-inactive"
              checked={inactive}
              onChange={(e) => setInactive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="art-inactive" className="text-sm font-medium cursor-pointer">
              Neaktivan artikal
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Pricing section */}
      <Card>
        <CardHeader>
          <CardTitle>Cijena</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2">
              <label htmlFor="art-currency" className="text-sm font-medium">Valuta</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="art-currency">
                  <SelectValue placeholder="Odaberi valutu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAM">BAM</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-price-no-vat" className="text-sm font-medium">Cijena bez PDV</label>
              <Input
                id="art-price-no-vat"
                type="number"
                step="0.01"
                min="0"
                value={priceWithoutVAT}
                onChange={(e) => setPriceWithoutVAT(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-tax" className="text-sm font-medium">Porez %</label>
              <Input
                id="art-tax"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxPercentage}
                onChange={(e) => setTaxPercentage(e.target.value)}
                placeholder="17.0"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="art-price-with-vat" className="text-sm font-medium">Cijena sa PDV</label>
              <Input
                id="art-price-with-vat"
                type="text"
                value={
                  priceWithoutVAT && taxPercentage
                    ? (parseFloat(priceWithoutVAT) * (1 + parseFloat(taxPercentage) / 100)).toFixed(2)
                    : ""
                }
                readOnly
                disabled
                placeholder="0.00"
                className="bg-muted"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parts / BOM */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Dijelovi (BOM)</CardTitle>
            <CardDescription>
              Definiši dijelove artikla i proizvodne korake sa materijalima
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addPart}>
            <Plus className="h-4 w-4" />
            Dodaj dio
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {parts.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              Nema dijelova. Kliknite &quot;Dodaj dio&quot; za početak.
            </p>
          )}
          {parts.map((part, partIdx) => (
            <div key={part.key} className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">
                    Dio {partIdx + 1}{part.partName ? `: ${part.partName}` : ""}
                  </h3>
                  {(() => {
                    const partId = getPartId(partIdx);
                    if (!partId) return null;
                    const steps = stepsByPart[partId] ?? [];
                    const uniqueDepts = [...new Set(steps.map((s) => s.departmentId).filter(Boolean))];
                    if (uniqueDepts.length === 0) return null;
                    return uniqueDepts.map((deptId) => (
                      <Badge key={deptId} variant="outline" className="text-[10px] px-1.5 py-0">
                        {getDepartmentName(deptId)}
                      </Badge>
                    ));
                  })()}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removePart(part.key)}
                  aria-label={`Ukloni dio ${partIdx + 1}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Naziv dijela</label>
                  <Input
                    value={part.partName}
                    onChange={(e) => updatePart(part.key, "partName", e.target.value)}
                    placeholder="npr. Metalna konstrukcija"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Dimenzije</label>
                  <Input
                    value={part.dimensions}
                    onChange={(e) => updatePart(part.key, "dimensions", e.target.value)}
                    placeholder="npr. 200x160x30 cm"
                  />
                </div>
                <div className="grid gap-1 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Napomene / Instrukcije</label>
                  <Input
                    value={part.notes}
                    onChange={(e) => updatePart(part.key, "notes", e.target.value)}
                    placeholder="npr. Koristiti bijelu tkaninu, dupli šav..."
                  />
                </div>
              </div>

              {/* Production Steps for this part */}
              {(() => {
                const partId = getPartId(partIdx);
                if (!partId) {
                  return (
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs text-muted-foreground italic">
                        Spremi artikal da bi mogao dodati korake
                      </p>
                    </div>
                  );
                }

                const steps = stepsByPart[partId] ?? [];
                const partName = part.partName || `Dio ${partIdx + 1}`;

                return (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Package className="h-3 w-3" />
                        Proizvodni koraci
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {steps.length}
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setOpenModalPartId(partId)}
                      >
                        <Pencil className="h-3 w-3" />
                        Uredi korake
                      </Button>
                    </div>

                    {steps.length > 0 && (
                      <div className="space-y-1">
                        {steps.map((step) => (
                          <div
                            key={step.id}
                            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
                          >
                            <span className="font-semibold text-muted-foreground w-5 shrink-0">
                              {step.sequenceOrder}.
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{step.stepName}</span>
                              <span className="text-muted-foreground ml-2">
                                — {getDepartmentName(step.departmentId)}
                              </span>
                              {step.estimatedTime != null && (
                                <span className="text-muted-foreground ml-2">
                                  ({step.estimatedTime} min)
                                </span>
                              )}
                            </div>
                            {step.materials.length > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {step.materials.length} mat.
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <StepsModal
                      open={openModalPartId === partId}
                      onOpenChange={(open) => {
                        if (!open) setOpenModalPartId(null);
                      }}
                      partId={partId}
                      partName={partName}
                      articleId={articleId}
                      allMaterials={allMaterials}
                      allDepartments={allDepartments}
                      initialSteps={mapToModalSteps(steps)}
                      onSaved={() => fetchStepsForPart(partId)}
                    />
                  </div>
                );
              })()}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Material Requirements Calculator */}
      <Card>
        <CardHeader>
          <CardTitle>Kalkulacija potreba materijala</CardTitle>
          <CardDescription>
            Izračunaj ukupne potrebe materijala za zadanu količinu artikala
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="grid gap-1">
              <label htmlFor="calc-qty" className="text-sm font-medium">
                Količina
              </label>
              <Input
                id="calc-qty"
                type="number"
                min="1"
                className="w-32"
                value={calcQuantity}
                onChange={(e) => setCalcQuantity(parseInt(e.target.value) || 1)}
              />
            </div>
            <Button variant="outline" onClick={calculateRequirements} disabled={calcLoading}>
              <Calculator className="h-4 w-4" />
              {calcLoading ? "Računam..." : "Izračunaj"}
            </Button>
          </div>

          {requirements && requirements.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Materijal</TableHead>
                    <TableHead>Potrebno</TableHead>
                    <TableHead>Na stanju</TableHead>
                    <TableHead>Deficit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requirements.map((req) => (
                    <TableRow key={req.materialId}>
                      <TableCell className="font-medium">{req.materialName}</TableCell>
                      <TableCell>{req.requiredQuantity}</TableCell>
                      <TableCell>{req.availableQuantity}</TableCell>
                      <TableCell>{req.deficit > 0 ? req.deficit : "—"}</TableCell>
                      <TableCell>
                        {req.deficit > 0 ? (
                          <Badge variant="destructive">Nedostaje</Badge>
                        ) : (
                          <Badge variant="secondary">Dovoljno</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {requirements && requirements.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nema materijala u sastavnici. Dodajte dijelove i materijale pa pokušajte ponovo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
