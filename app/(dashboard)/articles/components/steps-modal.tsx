"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Save,
  Package,
  Loader2,
} from "lucide-react";
import { batchSaveSteps } from "@/app/actions/production-steps";
import { cn } from "@/lib/utils";

// --- Interfaces ---

export interface StepMaterialDraft {
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

export interface StepDraft {
  id?: string;
  stepName: string;
  sequenceOrder: number;
  departmentId: string;
  estimatedTime: number | null;
  instructions: string;
  materials: StepMaterialDraft[];
}

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

interface StepsModalProps {
  partId: string;
  partName: string;
  articleId: string;
  allMaterials: MaterialOption[];
  allDepartments: DepartmentOption[];
  initialSteps: StepDraft[];
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StepsModal({
  partId,
  partName,
  articleId,
  allMaterials,
  allDepartments,
  initialSteps,
  onSaved,
  open,
  onOpenChange,
}: StepsModalProps) {
  const [draftSteps, setDraftSteps] = useState<StepDraft[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 6.3 & 6.10: Clone initialSteps into draft on open, reset on close
  useEffect(() => {
    if (open) {
      setDraftSteps(
        initialSteps.map((s) => ({
          ...s,
          materials: s.materials.map((m) => {
            const matData = allMaterials.find((am) => am.id === m.materialId);
            return { ...m, price: matData?.price ?? null };
          }),
        }))
      );
      setExpandedSteps({});
      setError(null);
    }
  }, [open, initialSteps, allMaterials]);

  // --- Step operations ---

  // 6.4: Add new step row
  const addStep = useCallback(() => {
    setDraftSteps((prev) => {
      const maxOrder = prev.length > 0 ? Math.max(...prev.map((s) => s.sequenceOrder)) : 0;
      return [
        ...prev,
        {
          stepName: "",
          sequenceOrder: maxOrder + 1,
          departmentId: "",
          estimatedTime: null,
          instructions: "",
          materials: [],
        },
      ];
    });
  }, []);

  // 6.5: Inline editing of step fields
  const updateStep = useCallback(
    (index: number, field: keyof StepDraft, value: string | number | null) => {
      setDraftSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
      );
    },
    []
  );

  // 6.6: Delete step row
  const deleteStep = useCallback((index: number) => {
    if (!window.confirm("Jeste li sigurni da želite obrisati ovaj korak?")) return;
    setDraftSteps((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, sequenceOrder: i + 1 }));
    });
  }, []);

  // 6.7: Reorder steps
  const moveStep = useCallback((index: number, direction: "up" | "down") => {
    setDraftSteps((prev) => {
      const swapIdx = direction === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next.map((s, i) => ({ ...s, sequenceOrder: i + 1 }));
    });
  }, []);

  // Toggle materials expand/collapse per step
  const toggleExpanded = useCallback((index: number) => {
    setExpandedSteps((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  // --- Material operations per step ---

  const addMaterial = useCallback((stepIndex: number) => {
    setDraftSteps((prev) =>
      prev.map((s, i) =>
        i === stepIndex
          ? {
              ...s,
              materials: [
                ...s.materials,
                {
                  materialId: "",
                  materialName: "",
                  materialUnit: "",
                  quantity: 0,
                  length: null,
                  width: null,
                  height: null,
                  isEdgebanded: null,
                  hasDimensions: false,
                  materialIsEdgebanded: false,
                  price: null,
                },
              ],
            }
          : s
      )
    );
  }, []);

  const removeMaterial = useCallback((stepIndex: number, matIndex: number) => {
    setDraftSteps((prev) =>
      prev.map((s, i) =>
        i === stepIndex
          ? { ...s, materials: s.materials.filter((_, mi) => mi !== matIndex) }
          : s
      )
    );
  }, []);

  const updateMaterial = useCallback(
    (stepIndex: number, matIndex: number, field: keyof StepMaterialDraft, value: string | number | boolean | null) => {
      setDraftSteps((prev) =>
        prev.map((s, i) =>
          i === stepIndex
            ? {
                ...s,
                materials: s.materials.map((m, mi) =>
                  mi === matIndex ? { ...m, [field]: value } : m
                ),
              }
            : s
        )
      );
    },
    []
  );

  const selectMaterial = useCallback(
    (stepIndex: number, matIndex: number, materialId: string) => {
      const mat = allMaterials.find((m) => m.id === materialId);
      if (!mat) return;
      setDraftSteps((prev) =>
        prev.map((s, i) =>
          i === stepIndex
            ? {
                ...s,
                materials: s.materials.map((m, mi) =>
                  mi === matIndex
                    ? {
                        ...m,
                        materialId: mat.id,
                        materialName: mat.name,
                        materialUnit: mat.unit,
                        hasDimensions: mat.hasDimensions,
                        materialIsEdgebanded: mat.isEdgebanded,
                        // Reset dimension/edgebanding fields when material changes
                        length: null,
                        width: null,
                        height: null,
                        isEdgebanded: mat.isEdgebanded ? false : null,
                        price: mat.price,
                      }
                    : m
                ),
              }
            : s
        )
      );
    },
    [allMaterials]
  );

  // 6.9: Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    const payload = draftSteps.map((s, i) => ({
      id: s.id,
      stepName: s.stepName,
      departmentId: s.departmentId,
      estimatedTime: s.estimatedTime,
      instructions: s.instructions || null,
      materials: s.materials
        .filter((m) => m.materialId)
        .map((m) => ({
          materialId: m.materialId,
          quantity: m.quantity,
          length: m.length,
          width: m.width,
          height: m.height,
          isEdgebanded: m.isEdgebanded,
        })),
    }));

    try {
      const result = await batchSaveSteps(articleId, partId, payload);
      if (result.success) {
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error ?? "Greška pri spremanju koraka");
      }
    } catch {
      setError("Greška pri spremanju koraka");
    } finally {
      setSaving(false);
    }
  }, [draftSteps, articleId, partId, onSaved, onOpenChange]);

  // 6.10: Discard on close
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Reset draft to initial when closing without save
        setDraftSteps(
          initialSteps.map((s) => ({
            ...s,
            materials: s.materials.map((m) => {
            const matData = allMaterials.find((am) => am.id === m.materialId);
            return { ...m, price: matData?.price ?? null };
          }),
          }))
        );
        setError(null);
      }
      onOpenChange(nextOpen);
    },
    [initialSteps, onOpenChange]
  );

  // Material options for SearchableSelect
  const materialOptions = allMaterials.map((m) => ({
    value: m.id,
    label: m.code ? `${m.name} (${m.code})` : m.name,
  }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-none max-h-[90vh] overflow-y-auto"
        style={{ minWidth: "900px" }}
      >
        <DialogHeader>
          <DialogTitle>Proizvodni koraci — {partName}</DialogTitle>
          <DialogDescription>
            Uredite proizvodne korake i materijale za ovaj dio artikla.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="min-w-[180px]">Naziv koraka</TableHead>
                <TableHead className="min-w-[160px]">Odjel</TableHead>
                <TableHead className="w-[140px]">Procijenjeno vrijeme (min)</TableHead>
                <TableHead className="min-w-[180px]">Instrukcije</TableHead>
                <TableHead className="w-[120px]">Akcije</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftSteps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nema koraka. Kliknite &quot;Dodaj korak&quot; za početak.
                  </TableCell>
                </TableRow>
              )}
              {draftSteps.map((step, idx) => (
                <StepRow
                  key={idx}
                  step={step}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === draftSteps.length - 1}
                  allDepartments={allDepartments}
                  materialOptions={materialOptions}
                  allMaterials={allMaterials}
                  expanded={!!expandedSteps[idx]}
                  onToggleExpanded={() => toggleExpanded(idx)}
                  onUpdateStep={updateStep}
                  onDeleteStep={deleteStep}
                  onMoveStep={moveStep}
                  onAddMaterial={addMaterial}
                  onRemoveMaterial={removeMaterial}
                  onUpdateMaterial={updateMaterial}
                  onSelectMaterial={selectMaterial}
                />
              ))}
            </TableBody>
          </Table>

          <Button variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-4 w-4" />
            Dodaj korak
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Odustani
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Spremanje..." : "Spremi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- StepRow sub-component ---

interface StepRowProps {
  step: StepDraft;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  allDepartments: DepartmentOption[];
  materialOptions: Array<{ value: string; label: string }>;
  allMaterials: MaterialOption[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdateStep: (index: number, field: keyof StepDraft, value: string | number | null) => void;
  onDeleteStep: (index: number) => void;
  onMoveStep: (index: number, direction: "up" | "down") => void;
  onAddMaterial: (stepIndex: number) => void;
  onRemoveMaterial: (stepIndex: number, matIndex: number) => void;
  onUpdateMaterial: (stepIndex: number, matIndex: number, field: keyof StepMaterialDraft, value: string | number | boolean | null) => void;
  onSelectMaterial: (stepIndex: number, matIndex: number, materialId: string) => void;
}

function StepRow({
  step,
  index,
  isFirst,
  isLast,
  allDepartments,
  materialOptions,
  allMaterials,
  expanded,
  onToggleExpanded,
  onUpdateStep,
  onDeleteStep,
  onMoveStep,
  onAddMaterial,
  onRemoveMaterial,
  onUpdateMaterial,
  onSelectMaterial,
}: StepRowProps) {
  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleExpanded}
              className="p-0.5 hover:bg-accent rounded"
              aria-label={expanded ? "Sakrij materijale" : "Prikaži materijale"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <span>{step.sequenceOrder}</span>
          </div>
        </TableCell>
        <TableCell>
          <Input
            value={step.stepName}
            onChange={(e) => onUpdateStep(index, "stepName", e.target.value)}
            placeholder="Naziv koraka"
            className="h-8 text-sm"
          />
        </TableCell>
        <TableCell>
          <Select
            value={step.departmentId}
            onValueChange={(val) => onUpdateStep(index, "departmentId", val)}
          >
            <SelectTrigger className="h-8 text-sm w-full">
              <SelectValue placeholder="Odaberi odjel" />
            </SelectTrigger>
            <SelectContent>
              {allDepartments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <Input
            type="number"
            value={step.estimatedTime ?? ""}
            onChange={(e) =>
              onUpdateStep(
                index,
                "estimatedTime",
                e.target.value ? parseInt(e.target.value) : null
              )
            }
            placeholder="min"
            className="h-8 text-sm w-24"
          />
        </TableCell>
        <TableCell>
          <Input
            value={step.instructions}
            onChange={(e) => onUpdateStep(index, "instructions", e.target.value)}
            placeholder="Instrukcije"
            className="h-8 text-sm"
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {!isFirst && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onMoveStep(index, "up")}
                aria-label="Pomjeri gore"
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
            )}
            {!isLast && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onMoveStep(index, "down")}
                aria-label="Pomjeri dolje"
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDeleteStep(index)}
              aria-label="Obriši korak"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* 6.8: Materials sub-section */}
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={6} className="p-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Package className="h-4 w-4" />
                  Materijali ({step.materials.length})
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onAddMaterial(index)}
                >
                  <Plus className="h-3 w-3" />
                  Dodaj materijal
                </Button>
              </div>

              {step.materials.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nema materijala za ovaj korak.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1 px-1 font-medium">Materijal</th>
                      <th className="text-left py-1 px-1 font-medium w-20">Količina</th>
                      <th className="text-left py-1 px-1 font-medium w-10">Jed.</th>
                      <th className="text-left py-1 px-1 font-medium w-16">Dužina</th>
                      <th className="text-left py-1 px-1 font-medium w-16">Širina</th>
                      <th className="text-left py-1 px-1 font-medium w-16">Visina</th>
                      <th className="text-left py-1 px-1 font-medium w-24">Kantovana</th>
                      <th className="text-right py-1 px-1 font-medium w-20">Cijena</th>
                      <th className="text-right py-1 px-1 font-medium w-20">Vrijednost</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.materials.map((mat, matIdx) => (
                      <MaterialRow
                        key={matIdx}
                        mat={mat}
                        stepIndex={index}
                        matIndex={matIdx}
                        materialOptions={materialOptions}
                        onSelectMaterial={onSelectMaterial}
                        onUpdateMaterial={onUpdateMaterial}
                        onRemoveMaterial={onRemoveMaterial}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// --- MaterialRow sub-component ---

interface MaterialRowProps {
  mat: StepMaterialDraft;
  stepIndex: number;
  matIndex: number;
  materialOptions: Array<{ value: string; label: string }>;
  onSelectMaterial: (stepIndex: number, matIndex: number, materialId: string) => void;
  onUpdateMaterial: (stepIndex: number, matIndex: number, field: keyof StepMaterialDraft, value: string | number | boolean | null) => void;
  onRemoveMaterial: (stepIndex: number, matIndex: number) => void;
}

function MaterialRow({
  mat,
  stepIndex,
  matIndex,
  materialOptions,
  onSelectMaterial,
  onUpdateMaterial,
  onRemoveMaterial,
}: MaterialRowProps) {
  return (
    <tr className="border-b border-muted/50 last:border-0">
      <td className="py-1 px-1">
        <SearchableSelect
          options={materialOptions}
          value={mat.materialId}
          onValueChange={(val) => onSelectMaterial(stepIndex, matIndex, val)}
          placeholder="Odaberi materijal"
        />
      </td>
      <td className="py-1 px-1">
        <Input
          type="number"
          value={mat.quantity || ""}
          onChange={(e) =>
            onUpdateMaterial(
              stepIndex,
              matIndex,
              "quantity",
              e.target.value ? parseFloat(e.target.value) : 0
            )
          }
          placeholder="Kol."
          className="h-8 text-xs w-20"
          min={0}
          step="any"
        />
      </td>
      <td className="py-1 px-1 text-muted-foreground whitespace-nowrap">
        {mat.materialUnit || "—"}
      </td>
      <td className="py-1 px-1">
        {mat.hasDimensions ? (
          <Input
            type="number"
            value={mat.length ?? ""}
            onChange={(e) =>
              onUpdateMaterial(stepIndex, matIndex, "length", e.target.value ? parseFloat(e.target.value) : null)
            }
            placeholder="—"
            className="h-8 text-xs w-16"
            min={0}
            step="any"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-1 px-1">
        {mat.hasDimensions ? (
          <Input
            type="number"
            value={mat.width ?? ""}
            onChange={(e) =>
              onUpdateMaterial(stepIndex, matIndex, "width", e.target.value ? parseFloat(e.target.value) : null)
            }
            placeholder="—"
            className="h-8 text-xs w-16"
            min={0}
            step="any"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-1 px-1">
        {mat.hasDimensions ? (
          <Input
            type="number"
            value={mat.height ?? ""}
            onChange={(e) =>
              onUpdateMaterial(stepIndex, matIndex, "height", e.target.value ? parseFloat(e.target.value) : null)
            }
            placeholder="—"
            className="h-8 text-xs w-16"
            min={0}
            step="any"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-1 px-1">
        {mat.materialIsEdgebanded ? (
          <div className="flex items-center gap-1.5">
            <Switch
              id={`edgeband-${stepIndex}-${matIndex}`}
              checked={mat.isEdgebanded === true}
              onCheckedChange={(checked) =>
                onUpdateMaterial(stepIndex, matIndex, "isEdgebanded", checked)
              }
            />
            <Label
              htmlFor={`edgeband-${stepIndex}-${matIndex}`}
              className="text-xs cursor-pointer whitespace-nowrap"
            >
              Da
            </Label>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-1 px-1 text-right text-muted-foreground whitespace-nowrap">
        {mat.price != null ? mat.price.toFixed(2) : "—"}
      </td>
      <td className="py-1 px-1 text-right font-medium whitespace-nowrap">
        {mat.price != null && mat.quantity > 0
          ? (mat.price * mat.quantity).toFixed(2)
          : "—"}
      </td>
      <td className="py-1 px-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onRemoveMaterial(stepIndex, matIndex)}
          aria-label="Ukloni materijal"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}
