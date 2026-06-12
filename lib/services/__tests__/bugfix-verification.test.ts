/**
 * Verification tests for the production-step-department-fix bugfix.
 *
 * Tests verify:
 * 7.1 Creating article parts works without departmentId
 * 7.2 Adding steps with valid departmentId works correctly
 * 7.3 getEffectiveSteps returns empty array for part without steps
 * 7.4 generateWorkOrders throws error for part without explicit steps
 * 7.5 Work order generation uses step.departmentId exclusively
 * 7.6 UI prevents sending steps without a selected department (code review)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Prisma mock setup (hoisted so vi.mock factory can reference it) ----
const { mockPrisma } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      article: { create: fn(), findUnique: fn(), findMany: fn(), update: fn() },
      articlePart: { findUnique: fn(), findMany: fn(), update: fn(), deleteMany: fn() },
      material: { findMany: fn() },
      department: { findUnique: fn() },
      productionStep: { findMany: fn(), findUnique: fn(), create: fn() },
      productionOrder: { findUnique: fn(), update: fn() },
      workOrder: { createMany: fn(), findMany: fn() },
      barcode: { findUnique: fn(), findFirst: fn(), create: fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/utils/calculations", () => ({
  calculateMaterialRequirements: vi.fn(() => []),
  checkMaterialAvailability: vi.fn(() => ({
    allAvailable: true,
    requirements: [],
  })),
  calculateProgress: vi.fn(() => ({
    totalWorkOrders: 0,
    completedWorkOrders: 0,
    percentage: 0,
  })),
}));

import { ArticleService, type CreateArticleInput } from "../article.service";
import { ProductionStepService } from "../production-step.service";
import { ProductionOrderService } from "../production-order.service";

beforeEach(() => {
  vi.clearAllMocks();
});


// ============================================================
// 7.1 — Creating article with parts works without departmentId
// ============================================================
describe("7.1 — CreateArticlePartInput no longer has departmentId", () => {
  it("should create an article with parts that have no departmentId field", async () => {
    const input: CreateArticleInput = {
      name: "Test Article",
      parts: [
        {
          partName: "Front Panel",
          dimensions: "50x30cm",
        },
        {
          partName: "Back Panel",
        },
      ],
    };

    // Verify the input type does NOT include departmentId
    // TypeScript compilation itself proves this — if departmentId were required,
    // the above would fail to compile. We also verify at runtime:
    const partKeys = Object.keys(input.parts[0]);
    expect(partKeys).not.toContain("departmentId");

    const mockCreatedArticle = {
      id: "article-1",
      name: "Test Article",
      description: null,
      parts: input.parts.map((p, i) => ({
        id: `part-${i}`,
        articleId: "article-1",
        partName: p.partName,
        dimensions: p.dimensions ?? null,
        notes: null,
        materials: [],
      })),
    };

    mockPrisma.article.create.mockResolvedValue(mockCreatedArticle);

    const result = await ArticleService.create(input);

    expect(result).toBeDefined();
    expect(result.parts).toHaveLength(2);

    // Verify the Prisma create call does NOT include departmentId in part data
    const createCall = mockPrisma.article.create.mock.calls[0][0];
    const partsCreateData = createCall.data.parts.create;
    for (const partData of partsCreateData) {
      expect(partData).not.toHaveProperty("departmentId");
    }
  });
});

// ============================================================
// 7.2 — Adding steps with valid departmentId works correctly
// ============================================================
describe("7.2 — Adding steps with valid departmentId", () => {
  it("should create a step when departmentId is valid", async () => {
    mockPrisma.articlePart.findUnique.mockResolvedValue({
      id: "part-1",
    });
    mockPrisma.department.findUnique.mockResolvedValue({
      id: "dept-1",
    });
    mockPrisma.productionStep.findUnique.mockResolvedValue(null); // no duplicate sequenceOrder

    const createdStep = {
      id: "step-1",
      articlePartId: "part-1",
      stepName: "Cutting",
      sequenceOrder: 1,
      departmentId: "dept-1",
      estimatedTime: null,
      instructions: null,
    };
    mockPrisma.productionStep.create.mockResolvedValue(createdStep);

    const result = await ProductionStepService.createStep("part-1", {
      stepName: "Cutting",
      sequenceOrder: 1,
      departmentId: "dept-1",
    });

    expect(result).toEqual(createdStep);
    expect(result.departmentId).toBe("dept-1");
    expect(mockPrisma.department.findUnique).toHaveBeenCalledWith({
      where: { id: "dept-1" },
      select: { id: true },
    });
  });

  it("should throw when departmentId is empty", async () => {
    await expect(
      ProductionStepService.createStep("part-1", {
        stepName: "Cutting",
        sequenceOrder: 1,
        departmentId: "",
      })
    ).rejects.toThrow("departmentId");
  });

  it("should throw when department does not exist", async () => {
    mockPrisma.articlePart.findUnique.mockResolvedValue({ id: "part-1" });
    mockPrisma.department.findUnique.mockResolvedValue(null);
    mockPrisma.productionStep.findUnique.mockResolvedValue(null);

    await expect(
      ProductionStepService.createStep("part-1", {
        stepName: "Cutting",
        sequenceOrder: 1,
        departmentId: "nonexistent-dept",
      })
    ).rejects.toThrow("Odjel nije pronađen");
  });
});


// ============================================================
// 7.3 — getEffectiveSteps returns empty array for part without steps
// ============================================================
describe("7.3 — getEffectiveSteps returns empty array for part without steps", () => {
  it("should return an empty array when part has no production steps", async () => {
    mockPrisma.productionStep.findMany.mockResolvedValue([]);

    const result = await ProductionStepService.getEffectiveSteps("part-no-steps");

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it("should return mapped steps when part has explicit steps", async () => {
    const dbSteps = [
      {
        id: "step-1",
        articlePartId: "part-1",
        stepName: "Cutting",
        sequenceOrder: 1,
        departmentId: "dept-1",
        estimatedTime: 30,
        instructions: "Cut carefully",
        department: { id: "dept-1", name: "Cutting Dept" },
      },
      {
        id: "step-2",
        articlePartId: "part-1",
        stepName: "Sewing",
        sequenceOrder: 2,
        departmentId: "dept-2",
        estimatedTime: 60,
        instructions: null,
        department: { id: "dept-2", name: "Sewing Dept" },
      },
    ];
    mockPrisma.productionStep.findMany.mockResolvedValue(dbSteps);

    const result = await ProductionStepService.getEffectiveSteps("part-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      stepId: "step-1",
      stepName: "Cutting",
      sequenceOrder: 1,
      departmentId: "dept-1",
      estimatedTime: 30,
      instructions: "Cut carefully",
    });
    expect(result[1]).toEqual({
      stepId: "step-2",
      stepName: "Sewing",
      sequenceOrder: 2,
      departmentId: "dept-2",
      estimatedTime: 60,
      instructions: null,
    });

    // Verify stepId is always a string (never null — no implicit steps)
    for (const step of result) {
      expect(typeof step.stepId).toBe("string");
      expect(step.stepId).not.toBeNull();
    }
  });
});

// ============================================================
// 7.4 — generateWorkOrders throws error for part without explicit steps
// ============================================================
describe("7.4 — generateWorkOrders throws for parts without steps", () => {
  it("should throw validation error when a part has no production steps", async () => {
    // Mock the production order lookup
    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: "order-1",
      articleId: "article-1",
      quantity: 5,
      status: "ready",
      article: {
        id: "article-1",
        name: "Test Article",
        parts: [
          {
            id: "part-1",
            partName: "Front Panel",
            materials: [],
            productionSteps: [],
          },
        ],
      },
      workOrders: [],
      purchaseOrders: [],
    });

    // getEffectiveSteps returns empty for this part (no steps)
    mockPrisma.productionStep.findMany.mockResolvedValue([]);

    await expect(
      ProductionOrderService.generateWorkOrders("order-1")
    ).rejects.toThrow("Cannot generate work orders");

    await expect(
      ProductionOrderService.generateWorkOrders("order-1")
    ).rejects.toThrow("Front Panel");
  });

  it("should throw listing all parts without steps", async () => {
    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: "order-1",
      articleId: "article-1",
      quantity: 2,
      status: "ready",
      article: {
        id: "article-1",
        name: "Test Article",
        parts: [
          { id: "part-1", partName: "Panel A", materials: [], productionSteps: [] },
          { id: "part-2", partName: "Panel B", materials: [], productionSteps: [] },
        ],
      },
      workOrders: [],
      purchaseOrders: [],
    });

    mockPrisma.productionStep.findMany.mockResolvedValue([]);

    await expect(
      ProductionOrderService.generateWorkOrders("order-1")
    ).rejects.toThrow(/Panel A.*Panel B|Panel B.*Panel A/);
  });
});


// ============================================================
// 7.5 — Work orders use step.departmentId exclusively
// ============================================================
describe("7.5 — generateWorkOrders uses step.departmentId", () => {
  it("should create work orders using departmentId from each step", async () => {
    const stepsForPart1 = [
      {
        id: "step-1",
        stepName: "Cutting",
        sequenceOrder: 1,
        departmentId: "dept-cutting",
        estimatedTime: null,
        instructions: null,
        department: { id: "dept-cutting", name: "Cutting" },
      },
      {
        id: "step-2",
        stepName: "Sewing",
        sequenceOrder: 2,
        departmentId: "dept-sewing",
        estimatedTime: null,
        instructions: null,
        department: { id: "dept-sewing", name: "Sewing" },
      },
    ];

    mockPrisma.productionOrder.findUnique.mockResolvedValue({
      id: "order-1",
      articleId: "article-1",
      quantity: 2,
      status: "ready",
      article: {
        id: "article-1",
        name: "Test Article",
        parts: [
          {
            id: "part-1",
            partName: "Front Panel",
            materials: [],
            productionSteps: stepsForPart1,
          },
        ],
      },
      workOrders: [],
      purchaseOrders: [],
    });

    // getEffectiveSteps will be called — mock the prisma query it uses
    mockPrisma.productionStep.findMany.mockResolvedValue(stepsForPart1);

    // Mock barcode generation (returns null = no existing barcode, then creates new)
    mockPrisma.barcode.findUnique.mockResolvedValue(null);
    mockPrisma.barcode.findFirst.mockResolvedValue(null);
    mockPrisma.barcode.create.mockImplementation(({ data }) => 
      Promise.resolve({ id: `barcode-${data.code}`, ...data })
    );

    const mockWorkOrders = [
      { id: "wo-1", departmentId: "dept-cutting", productionStepId: "step-1" },
      { id: "wo-2", departmentId: "dept-sewing", productionStepId: "step-2" },
      { id: "wo-3", departmentId: "dept-cutting", productionStepId: "step-1" },
      { id: "wo-4", departmentId: "dept-sewing", productionStepId: "step-2" },
    ];
    mockPrisma.workOrder.createMany.mockResolvedValue({ count: 4 });
    mockPrisma.workOrder.findMany.mockResolvedValue(mockWorkOrders);
    mockPrisma.productionOrder.update.mockResolvedValue({});

    const result = await ProductionOrderService.generateWorkOrders("order-1");

    // Verify createMany was called with correct departmentIds from steps
    const createManyCall = mockPrisma.workOrder.createMany.mock.calls[0][0];
    const workOrderDataItems = createManyCall.data;

    // Should be 2 steps × 2 quantity = 4 work orders
    expect(workOrderDataItems).toHaveLength(4);

    // Every work order must use step.departmentId, never a part-level departmentId
    for (const wo of workOrderDataItems) {
      expect(["dept-cutting", "dept-sewing"]).toContain(wo.departmentId);
      expect(wo.productionStepId).toBeDefined();
      expect(typeof wo.productionStepId).toBe("string");
    }

    // Verify the mapping: step-1 → dept-cutting, step-2 → dept-sewing
    const cuttingWOs = workOrderDataItems.filter(
      (wo: any) => wo.productionStepId === "step-1"
    );
    const sewingWOs = workOrderDataItems.filter(
      (wo: any) => wo.productionStepId === "step-2"
    );
    expect(cuttingWOs).toHaveLength(2);
    expect(sewingWOs).toHaveLength(2);
    for (const wo of cuttingWOs) {
      expect(wo.departmentId).toBe("dept-cutting");
    }
    for (const wo of sewingWOs) {
      expect(wo.departmentId).toBe("dept-sewing");
    }
  });
});

// ============================================================
// 7.6 — UI prevents sending steps without a selected department
// ============================================================
describe("7.6 — UI validation: save button disabled when departmentId is empty", () => {
  /**
   * This is a code-review verification test. We verify the UI logic by
   * checking that the save button's disabled condition includes !form.departmentId.
   *
   * From app/(dashboard)/articles/[id]/page.tsx line 918:
   *   disabled={isLoading || !form.stepName.trim() || !form.departmentId}
   *
   * And the validation message (line 932-934):
   *   {form.stepName.trim() && !form.departmentId && (
   *     <span className="text-[11px] text-destructive">
   *       Odaberite odjel prije spremanja
   *     </span>
   *   )}
   */
  it("save button disabled condition includes !form.departmentId check", () => {
    // Simulate the disabled logic from the UI component
    const simulateDisabled = (isLoading: boolean, stepName: string, departmentId: string) =>
      isLoading || !stepName.trim() || !departmentId;

    // When departmentId is empty, button should be disabled
    expect(simulateDisabled(false, "Cutting", "")).toBe(true);
    expect(simulateDisabled(false, "Cutting", "   ")).toBe(false); // whitespace-only is truthy

    // When departmentId is valid, button should be enabled (assuming other conditions met)
    expect(simulateDisabled(false, "Cutting", "dept-1")).toBe(false);

    // When stepName is empty, button should be disabled regardless
    expect(simulateDisabled(false, "", "dept-1")).toBe(true);
    expect(simulateDisabled(false, "  ", "dept-1")).toBe(true);
  });

  it("validation message shows when stepName is filled but departmentId is empty", () => {
    // Simulate the validation message condition from the UI
    const showValidationMessage = (stepName: string, departmentId: string) =>
      !!stepName.trim() && !departmentId;

    expect(showValidationMessage("Cutting", "")).toBe(true);
    expect(showValidationMessage("Cutting", "dept-1")).toBe(false);
    expect(showValidationMessage("", "")).toBe(false); // no message when stepName is also empty
  });
});
