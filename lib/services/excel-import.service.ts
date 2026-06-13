import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { NormativeVersionService } from "@/lib/services/normative-version.service";

// ─── Interfaces ──────────────────────────────────────────

export interface ImportResult {
  created: number;
  updated: number;
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  articleCode: string | null;
  message: string;
}

export interface ImportPreview {
  totalArticles: number;
  totalRows: number;
  unknownMaterials: { code: string; name: string | null }[];
}

export interface ParsedArticleRow {
  rowNumber: number;
  // Article fields
  sifraProizvoda: string;
  nazivProizvoda: string;
  opis: string | null;
  dimenzije: string | null;
  tip: string | null;
  grupaArtikla: string | null;
  jedinicaMjere: string | null;
  neaktivan: boolean | null;
  valuta: string | null;
  cijenaBezPDV: number | null;
  procenatPDV: number | null;
  // ArticlePart fields
  dio: string | null;
  dimenzijeDijela: string | null;
  napomeneDijela: string | null;
  // ProductionStep fields
  nazivKoraka: string | null;
  odjel: string | null;
  procijenenoVrijeme: number | null;
  instrukcije: string | null;
  // StepMaterial fields
  sifraSirovine: string | null;
  nazivSirovine: string | null;
  kolicina: number | null;
  komada: number | null;
  duzina: number | null;
  sirina: number | null;
  visina: number | null;
  kantiranje: boolean | null;
}

export interface ArticleGroup {
  code: string;
  name: string;
  description: string | null;
  dimensions: string | null;
  type: string | null;
  articleGroup: string | null;
  unit: string | null;
  inactive: boolean;
  currency: string | null;
  priceWithoutVAT: number | null;
  taxPercentage: number | null;
  parts: Map<string, PartGroup>;
}

export interface PartGroup {
  partName: string;
  dimensions: string | null;
  notes: string | null;
  steps: Map<string, StepGroup>;
}

export interface StepGroup {
  stepName: string | null;
  sequenceOrder: number | null;
  departmentName: string;  estimatedTime: number | null;
  instructions: string | null;
  materials: MaterialEntry[];
}

export interface MaterialEntry {
  materialCode: string | null;
  materialName: string | null;
  quantity: number | null;
  pieces: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  isEdgebanded: boolean | null;
}

// ─── Department Name Aliases ─────────────────────────────

/**
 * Maps old/fragmented department names to the correct consolidated name.
 * Used to prevent re-creation of fragment departments during Excel import.
 */
const DEPARTMENT_NAME_ALIASES: Record<string, string> = {
  "ŠTEPANJE": "KROJENJE/ŠIVENJE/ŠTEPANJE",
  "KROJENJE": "KROJENJE/ŠIVENJE/ŠTEPANJE",
  "ŠIVENJE": "KROJENJE/ŠIVENJE/ŠTEPANJE",
  "ŠTEPANJE/KROJENJE/ŠIVENJE": "KROJENJE/ŠIVENJE/ŠTEPANJE",
};

/**
 * Normalize a department name by checking it against the alias map (case-insensitive).
 * Returns the consolidated name if the input matches an alias, otherwise returns the original.
 */
function normalizeDepartmentName(name: string): string {
  const upperName = name.toUpperCase();
  for (const [alias, normalized] of Object.entries(DEPARTMENT_NAME_ALIASES)) {
    if (alias.toUpperCase() === upperName) {
      return normalized;
    }
  }
  return name;
}

// ─── Helpers ─────────────────────────────────────────────

function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

function cellToNumber(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function cellToBoolean(value: ExcelJS.CellValue): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const str = String(value).trim().toLowerCase();
  if (str === "true" || str === "1" || str === "da") return true;
  if (str === "false" || str === "0" || str === "ne" || str === "") return false;
  return null;
}


/**
 * Deduplicate materials by materialId + dimensions, summing quantities for exact duplicates.
 * Materials with the same materialId but different dimensions are kept as separate entries.
 */
function deduplicateMaterials(
  materials: { materialId: string; quantity: number; pieces: number | null; length: number | null; width: number | null; height: number | null; isEdgebanded: boolean | null }[]
) {
  const map = new Map<string, typeof materials[number]>();
  for (const m of materials) {
    const key = `${m.materialId}::${m.length ?? ""}::${m.width ?? ""}::${m.height ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += m.quantity;
      if (m.pieces != null) existing.pieces = (existing.pieces ?? 0) + m.pieces;
    } else {
      map.set(key, { ...m });
    }
  }
  return Array.from(map.values());
}

// ─── Service ─────────────────────────────────────────────

export const ExcelImportService = {
  /**
   * Parse an Excel buffer into typed rows. Reads each row directly — all rows
   * are expected to be fully populated. Skips rows with empty sifra proizvoda.
   */
  async parseExcel(buffer: Buffer): Promise<ParsedArticleRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new Error("Excel datoteka ne sadrži nijedan radni list");
    }

    // Find header row dynamically (may not be row 1 if file has title rows)
    let headerRowNumber = 0;
    const columnMap = new Map<string, number>();
    const requiredColumns = ["sifra proizvoda", "naziv proizvoda"];

    worksheet.eachRow((row, rowNumber) => {
      if (headerRowNumber > 0) return;
      const cells = new Map<string, number>();
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const name = cellToString(cell.value);
        if (name) {
          cells.set(name.toLowerCase(), colNumber);
        }
      });
      if (requiredColumns.every((col) => cells.has(col))) {
        headerRowNumber = rowNumber;
        cells.forEach((col, key) => columnMap.set(key, col));
      }
    });

    if (headerRowNumber === 0) {
      throw new Error(
        `Nedostaju obavezne kolone: ${requiredColumns.join(", ")}`
      );
    }

    // Helper to get cell value by column name
    const getCell = (row: ExcelJS.Row, colName: string): ExcelJS.CellValue => {
      const colIdx = columnMap.get(colName.toLowerCase());
      if (!colIdx) return null;
      return row.getCell(colIdx).value;
    };

    // Parse data rows (everything after header)
    const rows: ParsedArticleRow[] = [];
    const rowCount = worksheet.rowCount;

    for (let rowNum = headerRowNumber + 1; rowNum <= rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);

      const sifra = cellToString(getCell(row, "sifra proizvoda"));
      if (!sifra) continue;

      const naziv = cellToString(getCell(row, "naziv proizvoda"));
      if (!naziv) continue;

      rows.push({
        rowNumber: rowNum,
        sifraProizvoda: sifra,
        nazivProizvoda: naziv,
        opis: cellToString(getCell(row, "opis")),
        dimenzije: cellToString(getCell(row, "dimenzije")),
        tip: cellToString(getCell(row, "tip")),
        grupaArtikla: cellToString(getCell(row, "grupa artikla")),
        jedinicaMjere: cellToString(getCell(row, "jedinica mjere")),
        neaktivan: cellToBoolean(getCell(row, "neaktivan")),
        valuta: cellToString(getCell(row, "valuta")),
        cijenaBezPDV: cellToNumber(getCell(row, "cijena bez pdv")),
        procenatPDV: cellToNumber(getCell(row, "procenat pdv")),
        dio: cellToString(getCell(row, "dio")),
        dimenzijeDijela: cellToString(getCell(row, "dimenzije dijela")),
        napomeneDijela: cellToString(getCell(row, "napomene dijela")),
        nazivKoraka: cellToString(getCell(row, "naziv koraka")),
        odjel: cellToString(getCell(row, "odjel")),
        procijenenoVrijeme: cellToNumber(getCell(row, "procijenjeno vrijeme")),
        instrukcije: cellToString(getCell(row, "instrukcije")),
        sifraSirovine: cellToString(getCell(row, "sifra sirovine")),
        nazivSirovine: cellToString(getCell(row, "naziv sirovine")),
        kolicina: cellToNumber(getCell(row, "količina")),
        komada: cellToNumber(getCell(row, "komada")),
        duzina: cellToNumber(getCell(row, "duzina")),
        sirina: cellToNumber(getCell(row, "sirina")),
        visina: cellToNumber(getCell(row, "visina")),
        kantiranje: cellToBoolean(getCell(row, "kantiranje")),
      });
    }

    return rows;
  },

  /**
   * Group parsed rows by article code, then by part, then by step key (dept+stepName).
   * All map keys are lowercased for case-insensitive matching.
   */
  groupByArticle(rows: ParsedArticleRow[]): Map<string, ArticleGroup> {
    const groups = new Map<string, ArticleGroup>();

    for (const row of rows) {
      const articleKey = row.sifraProizvoda.toLowerCase();
      let articleGroup = groups.get(articleKey);
      if (!articleGroup) {
        articleGroup = {
          code: row.sifraProizvoda,
          name: row.nazivProizvoda,
          description: row.opis,
          dimensions: row.dimenzije,
          type: row.tip,
          articleGroup: row.grupaArtikla,
          unit: row.jedinicaMjere,
          inactive: row.neaktivan ?? false,
          currency: row.valuta,
          priceWithoutVAT: row.cijenaBezPDV,
          taxPercentage: row.procenatPDV,
          parts: new Map(),
        };
        groups.set(articleKey, articleGroup);
      }

      // If no part name, use "Ostalo" as default
      const partName = row.dio ?? "Ostalo";
      const partKey = partName.toLowerCase();

      let partGroup = articleGroup.parts.get(partKey);
      if (!partGroup) {
        partGroup = {
          partName,
          dimensions: row.dimenzijeDijela,
          notes: row.napomeneDijela,
          steps: new Map(),
        };
        articleGroup.parts.set(partKey, partGroup);
      }

      // If no department, use "Ostalo" as default
      const deptName = row.odjel ?? "Ostalo";

      // Use dept+stepName as key to allow multiple steps per department (lowercased)
      const stepKey = `${deptName.toLowerCase()}::${(row.nazivKoraka ?? deptName).toLowerCase()}`;
      let stepGroup = partGroup.steps.get(stepKey);
      if (!stepGroup) {
        stepGroup = {
          stepName: row.nazivKoraka,
          sequenceOrder: null,
          departmentName: deptName,
          estimatedTime: row.procijenenoVrijeme,
          instructions: row.instrukcije,
          materials: [],
        };
        partGroup.steps.set(stepKey, stepGroup);
      }

      // Add material entry if there's material data
      if (row.sifraSirovine || row.nazivSirovine) {
        stepGroup.materials.push({
          materialCode: row.sifraSirovine,
          materialName: row.nazivSirovine,
          quantity: row.kolicina,
          pieces: row.komada,
          length: row.duzina,
          width: row.sirina,
          height: row.visina,
          isEdgebanded: row.kantiranje,
        });
      }
    }

    return groups;
  },

  /**
   * Preview import: parse Excel, check for unknown materials, return preview info.
   * Does NOT write anything to the database.
   */
  async previewImport(buffer: Buffer): Promise<ImportPreview> {
    const rows = await this.parseExcel(buffer);
    const articleGroups = this.groupByArticle(rows);

    // Collect all unique material codes from the Excel
    const materialCodes = new Set<string>();
    for (const [, group] of articleGroups) {
      for (const [, part] of group.parts) {
        for (const [, step] of part.steps) {
          for (const mat of step.materials) {
            if (mat.materialCode) {
              materialCodes.add(mat.materialCode);
            }
          }
        }
      }
    }

    // Check which materials exist in the database (case-insensitive)
    const existingMaterials = materialCodes.size > 0
      ? await prisma.material.findMany({
          where: { code: { in: Array.from(materialCodes), mode: "insensitive" } },
          select: { code: true },
        })
      : [];

    const existingCodes = new Set(existingMaterials.map((m) => m.code?.toLowerCase()).filter(Boolean));

    // Find unknown materials with their names from the Excel
    const unknownMaterials: { code: string; name: string | null }[] = [];
    const seenCodes = new Set<string>();
    for (const [, group] of articleGroups) {
      for (const [, part] of group.parts) {
        for (const [, step] of part.steps) {
          for (const mat of step.materials) {
            const matLower = mat.materialCode?.toLowerCase();
            if (mat.materialCode && matLower && !existingCodes.has(matLower) && !seenCodes.has(matLower)) {
              seenCodes.add(matLower);
              unknownMaterials.push({
                code: mat.materialCode,
                name: mat.materialName,
              });
            }
          }
        }
      }
    }

    return {
      totalArticles: articleGroups.size,
      totalRows: rows.length,
      unknownMaterials,
    };
  },

  /**
   * Full import pipeline: parse Excel → group by article → upsert each article in its own transaction.
   * If createNewMaterials is false, rows with unknown materials are skipped.
   */
  async importArticles(buffer: Buffer, createNewMaterials = true): Promise<ImportResult> {
    const rows = await this.parseExcel(buffer);
    const articleGroups = this.groupByArticle(rows);

    const result: ImportResult = {
      created: 0,
      updated: 0,
      errors: [],
    };

    for (const [code, group] of articleGroups) {
      try {
        const existed = await this.upsertArticle(group, createNewMaterials);
        if (existed) {
          result.updated++;
        } else {
          result.created++;
        }
      } catch (err) {
        const firstRow = rows.find((r) => r.sifraProizvoda.toLowerCase() === code);
        result.errors.push({
          row: firstRow?.rowNumber ?? 0,
          articleCode: code,
          message:
            err instanceof Error
              ? err.message
              : "Nepoznata greška pri uvozu artikla",
        });
      }
    }

    return result;
  },

  /**
   * Upsert a single article with its full BOM structure inside a Prisma transaction.
   * Returns true if the article already existed (update), false if newly created.
   */
  async upsertArticle(group: ArticleGroup, createNewMaterials = true): Promise<boolean> {
    return prisma.$transaction(
      async (tx) => {
      // 1. Check if article exists (case-insensitive)
      const existing = await tx.article.findFirst({
        where: { code: { equals: group.code, mode: "insensitive" } },
        select: { id: true },
      });


      const isUpdate = !!existing;

      // 2. If updating, check for active production orders (both direct and via items)
      if (existing) {
        const activeOrders = await tx.productionOrder.count({
          where: {
            isArchived: false,
            status: { in: ["waiting_material", "ready", "in_progress"] },
            OR: [
              { articleId: existing.id },
              { items: { some: { articleId: existing.id } } },
            ],
          },
        });

        if (activeOrders > 0) {
          // Create snapshot before updating article with active orders
          try {
            await NormativeVersionService.createSnapshot(existing.id, tx);
          } catch (error) {
            throw new Error(
              `Artikal "${group.code}" ima ${activeOrders} aktivnih proizvodnih naloga. ` +
              `Greška pri kreiranju verzije normativa: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      // 3. Resolve departments and materials first (needed for both create and update)
      const departmentCache = new Map<string, string>();
      const materialCache = new Map<string, string>();

      for (const [, part] of group.parts) {
        for (const [, step] of part.steps) {
          const normalizedDeptName = normalizeDepartmentName(step.departmentName);
          const deptKey = normalizedDeptName.toLowerCase();
          if (!departmentCache.has(deptKey)) {
            const dept = await tx.department.findFirst({
              where: { name: { equals: normalizedDeptName, mode: "insensitive" } },
              select: { id: true },
            });
            if (dept) {
              departmentCache.set(deptKey, dept.id);
            } else {
              const newDept = await tx.department.create({
                data: { name: normalizedDeptName },
                select: { id: true },
              });
              departmentCache.set(deptKey, newDept.id);
            }
          }

          for (const mat of step.materials) {
            const matKey = mat.materialCode?.toLowerCase();
            if (mat.materialCode && matKey && !materialCache.has(matKey)) {
              const existingMat = await tx.material.findFirst({
                where: { code: { equals: mat.materialCode, mode: "insensitive" } },
                select: { id: true },
              });
              if (existingMat) {
                materialCache.set(matKey, existingMat.id);
              } else if (createNewMaterials) {
                const newMat = await tx.material.create({
                  data: {
                    code: mat.materialCode,
                    name: mat.materialName ?? mat.materialCode,
                    unit: "kom",
                  },
                  select: { id: true },
                });
                materialCache.set(matKey, newMat.id);
              }
            }
          }
        }
      }

      // 3. Build nested parts structure for creation
      const buildPartsData = () =>
        Array.from(group.parts.values()).map((part) => {
          let autoSequence = 0;
          const stepsData = Array.from(part.steps.values()).map((step) => {
            autoSequence++;
            const departmentId = departmentCache.get(normalizeDepartmentName(step.departmentName).toLowerCase())!;
            const rawMaterials = step.materials
              .filter((m) => m.materialCode && materialCache.has(m.materialCode.toLowerCase()))
              .map((m) => ({
                materialId: materialCache.get(m.materialCode!.toLowerCase())!,
                quantity: m.quantity ?? 0,
                pieces: m.pieces,
                length: m.length,
                width: m.width,
                height: m.height,
                isEdgebanded: m.isEdgebanded,
              }));
            const materialsData = deduplicateMaterials(rawMaterials);

            return {
              stepName: step.stepName ?? step.departmentName,
              sequenceOrder: step.sequenceOrder ?? autoSequence,
              departmentId,
              estimatedTime: step.estimatedTime,
              instructions: step.instructions,
              materials: { create: materialsData },
            };
          });

          return {
            partName: part.partName,
            dimensions: part.dimensions,
            notes: part.notes,
            productionSteps: { create: stepsData },
          };
        });

      // 4. Article-level data (for new articles)
      const articleFields = {
        name: group.name,
        description: group.description,
        dimensions: group.dimensions,
        type: group.type,
        articleGroup: group.articleGroup,
        unit: group.unit,
        inactive: group.inactive,
        currency: group.currency,
        priceWithoutVAT: group.priceWithoutVAT,
        taxPercentage: group.taxPercentage,
      };

      // For existing articles, don't overwrite protected fields
      // name, description, type, articleGroup — ZAŠTIĆENA, ne ažuriraju se
      const updateFields = {
        dimensions: group.dimensions,
        unit: group.unit,
        inactive: group.inactive,
        currency: group.currency,
        priceWithoutVAT: group.priceWithoutVAT,
        taxPercentage: group.taxPercentage,
      };

      if (existing) {
        // 5a. Update: only delete parts that have NO work orders
        const existingParts = await tx.articlePart.findMany({
          where: { articleId: existing.id },
          select: {
            id: true,
            partName: true,
            _count: { select: { workOrders: true } },
          },
        });

        const safeParts = existingParts.filter((p) => p._count.workOrders === 0);
        const protectedParts = existingParts.filter((p) => p._count.workOrders > 0);

        // Delete parts without work orders (safe to remove)
        if (safeParts.length > 0) {
          await tx.articlePart.deleteMany({
            where: { id: { in: safeParts.map((p) => p.id) } },
          });
        }

        // For protected parts: update in-place if matching part exists in import data
        const newPartsMap = new Map(group.parts);
        for (const protectedPart of protectedParts) {
          const matchingNew = newPartsMap.get(protectedPart.partName.toLowerCase());
          if (matchingNew) {
            // Disconnect work orders from production steps before deleting
            // (productionStepId is nullable, so this is safe)
            await tx.workOrder.updateMany({
              where: {
                productionStep: { articlePartId: protectedPart.id },
              },
              data: { productionStepId: null },
            });

            // Delete existing production steps (they cascade-delete step materials)
            await tx.productionStep.deleteMany({
              where: { articlePartId: protectedPart.id },
            });

            // Rebuild steps for this part
            let autoSeq = 0;
            for (const [, step] of matchingNew.steps) {
              autoSeq++;
              const departmentId = departmentCache.get(normalizeDepartmentName(step.departmentName).toLowerCase())!;
              const rawMaterials = step.materials
                .filter((m) => m.materialCode && materialCache.has(m.materialCode.toLowerCase()))
                .map((m) => ({
                  materialId: materialCache.get(m.materialCode!.toLowerCase())!,
                  quantity: m.quantity ?? 0,
                  pieces: m.pieces,
                  length: m.length,
                  width: m.width,
                  height: m.height,
                  isEdgebanded: m.isEdgebanded,
                }));
              const materialsData = deduplicateMaterials(rawMaterials);

              await tx.productionStep.create({
                data: {
                  articlePartId: protectedPart.id,
                  stepName: step.stepName ?? step.departmentName,
                  sequenceOrder: step.sequenceOrder ?? autoSeq,
                  departmentId,
                  estimatedTime: step.estimatedTime,
                  instructions: step.instructions,
                  materials: { create: materialsData },
                },
              });
            }

            // Update part fields
            await tx.articlePart.update({
              where: { id: protectedPart.id },
              data: {
                partName: matchingNew.partName,
                dimensions: matchingNew.dimensions,
                notes: matchingNew.notes,
              },
            });

            // Remove from map so we don't create it again
            newPartsMap.delete(protectedPart.partName.toLowerCase());
          } else {
            // Unmatched protected part: disconnect work orders and remove
            // First disconnect productionStepId from work orders linked via steps
            await tx.workOrder.updateMany({
              where: { productionStep: { articlePartId: protectedPart.id } },
              data: { productionStepId: null },
            });

            // Delete production steps (cascades to step materials)
            await tx.productionStep.deleteMany({
              where: { articlePartId: protectedPart.id },
            });

            // Delete barcodes that reference work orders of this part
            const workOrderIds = await tx.workOrder.findMany({
              where: { articlePartId: protectedPart.id },
              select: { id: true },
            });
            if (workOrderIds.length > 0) {
              await tx.barcode.deleteMany({
                where: { workOrderId: { in: workOrderIds.map((wo) => wo.id) } },
              });
            }

            // Delete barcodes that directly reference this articlePart
            await tx.barcode.deleteMany({
              where: { articlePartId: protectedPart.id },
            });

            // Delete work orders that directly reference this articlePart
            await tx.workOrder.deleteMany({
              where: { articlePartId: protectedPart.id },
            });

            // Now safe to delete the part itself
            await tx.articlePart.delete({
              where: { id: protectedPart.id },
            });
          }
        }

        // Create remaining new parts
        const remainingPartsData = Array.from(newPartsMap.values()).map((part) => {
          let autoSequence = 0;
          const stepsData = Array.from(part.steps.values()).map((step) => {
            autoSequence++;
            const departmentId = departmentCache.get(normalizeDepartmentName(step.departmentName).toLowerCase())!;
            const rawMaterials = step.materials
              .filter((m) => m.materialCode && materialCache.has(m.materialCode.toLowerCase()))
              .map((m) => ({
                materialId: materialCache.get(m.materialCode!.toLowerCase())!,
                quantity: m.quantity ?? 0,
                pieces: m.pieces,
                length: m.length,
                width: m.width,
                height: m.height,
                isEdgebanded: m.isEdgebanded,
              }));
            const materialsData = deduplicateMaterials(rawMaterials);

            return {
              stepName: step.stepName ?? step.departmentName,
              sequenceOrder: step.sequenceOrder ?? autoSequence,
              departmentId,
              estimatedTime: step.estimatedTime,
              instructions: step.instructions,
              materials: { create: materialsData },
            };
          });

          return {
            partName: part.partName,
            dimensions: part.dimensions,
            notes: part.notes,
            productionSteps: { create: stepsData },
          };
        });

        await tx.article.update({
          where: { id: existing.id },
          data: {
            ...updateFields,
            parts: remainingPartsData.length > 0 ? { create: remainingPartsData } : undefined,
          },
        });
      } else {
        // 5b. Create new article with all parts
        await tx.article.create({
          data: {
            code: group.code,
            ...articleFields,
            parts: { create: buildPartsData() },
          },
        });
      }

      return isUpdate;
    },
      { maxWait: 60000, timeout: 60000 }
    );
  },
};
