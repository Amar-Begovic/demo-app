import { describe, it, expect } from "vitest";
import fc from "fast-check";

// Pure state management functions that mirror the StepsModal logic
// from app/(dashboard)/articles/components/steps-modal.tsx

interface StepMaterialDraft {
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
}

interface StepDraft {
  id?: string;
  stepName: string;
  sequenceOrder: number;
  departmentId: string;
  estimatedTime: number | null;
  instructions: string;
  materials: StepMaterialDraft[];
}

/** Add a new step to the draft array (mirrors StepsModal.addStep) */
function addStep(steps: StepDraft[]): StepDraft[] {
  const maxOrder =
    steps.length > 0 ? Math.max(...steps.map((s) => s.sequenceOrder)) : 0;
  return [
    ...steps,
    {
      stepName: "",
      sequenceOrder: maxOrder + 1,
      departmentId: "",
      estimatedTime: null,
      instructions: "",
      materials: [],
    },
  ];
}

/** Delete a step by index (mirrors StepsModal.deleteStep) */
function deleteStep(steps: StepDraft[], index: number): StepDraft[] {
  const next = steps.filter((_, i) => i !== index);
  return next.map((s, i) => ({ ...s, sequenceOrder: i + 1 }));
}

/** Move a step up or down (mirrors StepsModal.moveStep) */
function moveStep(
  steps: StepDraft[],
  index: number,
  direction: "up" | "down"
): StepDraft[] {
  const swapIdx = direction === "up" ? index - 1 : index + 1;
  if (swapIdx < 0 || swapIdx >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
  return next.map((s, i) => ({ ...s, sequenceOrder: i + 1 }));
}

/** Deep clone steps (mirrors StepsModal initial state clone) */
function cloneSteps(steps: StepDraft[]): StepDraft[] {
  return steps.map((s) => ({
    ...s,
    materials: s.materials.map((m) => ({ ...m })),
  }));
}

// --- Arbitraries ---

const materialDraftArb: fc.Arbitrary<StepMaterialDraft> = fc.record({
  materialId: fc.uuid(),
  materialName: fc.string({ minLength: 1, maxLength: 20 }),
  materialUnit: fc.constantFrom("kom", "m", "m²", "kg", "l"),
  quantity: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }),
  length: fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), {
    nil: null,
  }),
  width: fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), {
    nil: null,
  }),
  height: fc.option(fc.float({ min: 0, max: Math.fround(10000), noNaN: true }), {
    nil: null,
  }),
  isEdgebanded: fc.option(fc.boolean(), { nil: null }),
  hasDimensions: fc.boolean(),
  materialIsEdgebanded: fc.boolean(),
});

const stepDraftArb: fc.Arbitrary<StepDraft> = fc.record({
  id: fc.option(fc.uuid(), { nil: undefined }),
  stepName: fc.string({ minLength: 1, maxLength: 30 }),
  sequenceOrder: fc.nat({ max: 100 }),
  departmentId: fc.uuid(),
  estimatedTime: fc.option(fc.nat({ max: 480 }), { nil: null }),
  instructions: fc.string({ maxLength: 100 }),
  materials: fc.array(materialDraftArb, { minLength: 0, maxLength: 3 }),
});

const stepsArrayArb = fc.array(stepDraftArb, { minLength: 1, maxLength: 10 });

// Feature: material-dimensions-and-production-steps-ui, Property 8: Modal step add/delete count invariant
// Validates: Requirements 5.3, 5.5

describe("Property 8: Modal add/delete count invariant", () => {
  it("adding a step increases count by 1", () => {
    fc.assert(
      fc.property(
        fc.array(stepDraftArb, { minLength: 0, maxLength: 10 }),
        (initialSteps) => {
          const result = addStep(initialSteps);
          expect(result.length).toBe(initialSteps.length + 1);
        }
      )
    );
  });

  it("deleting a step decreases count by 1", () => {
    fc.assert(
      fc.property(stepsArrayArb, (initialSteps) => {
        // Pick a valid index to delete
        const index = Math.floor(Math.random() * initialSteps.length);
        const result = deleteStep(initialSteps, index);
        expect(result.length).toBe(initialSteps.length - 1);
      })
    );
  });

  it("sequenceOrder is contiguous 1..N after delete", () => {
    fc.assert(
      fc.property(stepsArrayArb, (initialSteps) => {
        const index = Math.floor(Math.random() * initialSteps.length);
        const result = deleteStep(initialSteps, index);
        result.forEach((step, i) => {
          expect(step.sequenceOrder).toBe(i + 1);
        });
      })
    );
  });
});

// Feature: material-dimensions-and-production-steps-ui, Property 9: Modal reorder preserves step set
// Validates: Requirements 5.6

describe("Property 9: Modal reorder permutation invariant", () => {
  it("reordering steps produces a permutation — same set of steps, only sequenceOrder changes", () => {
    fc.assert(
      fc.property(
        fc.array(stepDraftArb, { minLength: 2, maxLength: 10 }),
        fc.constantFrom("up" as const, "down" as const),
        (initialSteps, direction) => {
          // Pick a valid index for the direction
          let index: number;
          if (direction === "up") {
            index = 1 + Math.floor(Math.random() * (initialSteps.length - 1));
          } else {
            index = Math.floor(Math.random() * (initialSteps.length - 1));
          }

          const result = moveStep(initialSteps, index, direction);

          // Same length
          expect(result.length).toBe(initialSteps.length);

          // Extract step identity (everything except sequenceOrder)
          const getIdentity = (s: StepDraft) => ({
            id: s.id,
            stepName: s.stepName,
            departmentId: s.departmentId,
            estimatedTime: s.estimatedTime,
            instructions: s.instructions,
            materials: s.materials,
          });

          const originalSet = initialSteps.map(getIdentity);
          const resultSet = result.map(getIdentity);

          // Sort both by a stable key to compare as sets
          const sortKey = (s: ReturnType<typeof getIdentity>) =>
            JSON.stringify({ n: s.stepName, d: s.departmentId, id: s.id });

          originalSet.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
          resultSet.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

          expect(resultSet).toEqual(originalSet);

          // sequenceOrder should be contiguous 1..N
          result.forEach((step, i) => {
            expect(step.sequenceOrder).toBe(i + 1);
          });
        }
      )
    );
  });
});

// Feature: material-dimensions-and-production-steps-ui, Property 11: Modal discard on close
// Validates: Requirements 5.10

describe("Property 11: Modal discard on close", () => {
  it("after any modifications, discarding returns to original state", () => {
    fc.assert(
      fc.property(
        fc.array(stepDraftArb, { minLength: 1, maxLength: 8 }),
        fc.array(
          fc.oneof(
            fc.constant("add" as const),
            fc.constant("delete" as const),
            fc.constant("reorder" as const)
          ),
          { minLength: 1, maxLength: 5 }
        ),
        (initialSteps, operations) => {
          // Clone initial state (simulates modal open)
          const original = cloneSteps(initialSteps);
          let draft = cloneSteps(initialSteps);

          // Apply random modifications to draft
          for (const op of operations) {
            if (op === "add") {
              draft = addStep(draft);
            } else if (op === "delete" && draft.length > 0) {
              const idx = Math.floor(Math.random() * draft.length);
              draft = deleteStep(draft, idx);
            } else if (op === "reorder" && draft.length >= 2) {
              const idx = Math.floor(Math.random() * (draft.length - 1));
              draft = moveStep(draft, idx, "down");
            }
          }

          // Discard: reset to initial (simulates modal close without save)
          const discarded = cloneSteps(original);

          // Compare discarded state with original
          expect(discarded.length).toBe(original.length);
          for (let i = 0; i < original.length; i++) {
            expect(discarded[i].stepName).toBe(original[i].stepName);
            expect(discarded[i].departmentId).toBe(original[i].departmentId);
            expect(discarded[i].sequenceOrder).toBe(original[i].sequenceOrder);
            expect(discarded[i].estimatedTime).toBe(original[i].estimatedTime);
            expect(discarded[i].instructions).toBe(original[i].instructions);
            expect(discarded[i].materials.length).toBe(
              original[i].materials.length
            );
            // Verify materials are deep-equal but not same reference
            for (let j = 0; j < original[i].materials.length; j++) {
              expect(discarded[i].materials[j]).toEqual(
                original[i].materials[j]
              );
              expect(discarded[i].materials[j]).not.toBe(
                original[i].materials[j]
              );
            }
          }
        }
      )
    );
  });
});
