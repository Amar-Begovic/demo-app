import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// Feature: material-dimensions-and-production-steps-ui, Property 1: Material boolean field defaults
// Validates: Requirements 1.1, 2.1

// We mock Prisma to capture what data the service passes to prisma.material.create
const mockPrismaCreate = vi.fn();
const mockStepMaterialCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    material: {
      create: (...args: unknown[]) => mockPrismaCreate(...args),
      update: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    stepMaterial: {
      create: (...args: unknown[]) => mockStepMaterialCreate(...args),
    },
    articlePart: {
      findUnique: vi.fn().mockResolvedValue({ id: "part-1" }),
    },
    department: {
      findUnique: vi.fn().mockResolvedValue({ id: "dept-1" }),
    },
    productionStep: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { MaterialService } from "@/lib/services/material.service";
import { ProductionStepService } from "@/lib/services/production-step.service";

describe("Property 1: Material boolean field defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "mat-1",
      ...args.data,
    }));
  });

  it("hasDimensions and isEdgebanded default to false for any material created without setting them", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        async (name, unit) => {
          mockPrismaCreate.mockClear();
          mockPrismaCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: "mat-1",
            ...args.data,
          }));

          const result = await MaterialService.create({ name, unit });

          // Verify the data passed to Prisma includes false defaults
          const createCall = mockPrismaCreate.mock.calls[0][0];
          expect(createCall.data.hasDimensions).toBe(false);
          expect(createCall.data.isEdgebanded).toBe(false);

          // Verify the returned object also has false
          expect(result.hasDimensions).toBe(false);
          expect(result.isEdgebanded).toBe(false);
        }
      )
    );
  });
});

// Feature: material-dimensions-and-production-steps-ui, Property 2: StepMaterial dimension and edgebanding field defaults
// Validates: Requirements 3.1, 3.2

describe("Property 2: StepMaterial field defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("length, width, height, and isEdgebanded default to null when not provided", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        async (stepId, materialId, quantity) => {
          mockStepMaterialCreate.mockClear();
          mockStepMaterialCreate.mockImplementation(
            async (args: { data: Record<string, unknown> }) => ({
              id: "sm-1",
              ...args.data,
              material: { id: args.data.materialId, name: "Test", unit: "kom" },
            })
          );

          await ProductionStepService.addMaterial(stepId, materialId, quantity);

          const createCall = mockStepMaterialCreate.mock.calls[0][0];
          expect(createCall.data.length).toBeNull();
          expect(createCall.data.width).toBeNull();
          expect(createCall.data.height).toBeNull();
          expect(createCall.data.isEdgebanded).toBeNull();
        }
      )
    );
  });
});

// Feature: material-dimensions-and-production-steps-ui, Property 5: StepMaterial persistence round-trip
// Validates: Requirements 3.6, 3.7

describe("Property 5: StepMaterial persistence round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persisting a StepMaterial with random dimensions and re-fetching returns identical values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), { nil: null }),
        fc.option(fc.boolean(), { nil: null }),
        async (stepId, materialId, quantity, length, width, height, isEdgebanded) => {
          mockStepMaterialCreate.mockClear();
          // Mock create to capture data and return it back (simulating round-trip)
          mockStepMaterialCreate.mockImplementation(
            async (args: { data: Record<string, unknown> }) => ({
              id: "sm-round-trip",
              ...args.data,
              material: { id: args.data.materialId, name: "Test", unit: "kom" },
            })
          );

          const result = await ProductionStepService.addMaterial(
            stepId,
            materialId,
            quantity,
            { length, width, height, isEdgebanded }
          );

          // Verify round-trip: returned values match input
          expect(result.length).toBe(length);
          expect(result.width).toBe(width);
          expect(result.height).toBe(height);
          expect(result.isEdgebanded).toBe(isEdgebanded);
        }
      )
    );
  });
});
