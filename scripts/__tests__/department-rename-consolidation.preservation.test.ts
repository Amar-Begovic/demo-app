/**
 * Preservation Tests for Department Rename & Consolidation Migration
 *
 * This test suite verifies that departments NOT in the affected set
 * {"BRVARI", "MOTAŽA", "ŠTEPANJE", "KROJENJE", "ŠIVENJE", "ŠTEPANJE/KROJENJE/ŠIVENJE"}
 * remain completely unchanged after running the migration.
 *
 * Tests verify:
 * - Unaffected departments retain their name, ID, and description
 * - WorkOrder/ProductionStep/NormativeVersionStep references to unaffected departments are preserved
 * - Property-based tests with random department names confirm preservation across the input space
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import * as fc from "fast-check";
import { PrismaClient } from "@/app/generated/prisma";
import { execSync } from "child_process";
import path from "path";

const prisma = new PrismaClient();

/** The set of department names affected by the migration */
const AFFECTED_NAMES = new Set([
  "BRVARI",
  "MOTAŽA",
  "ŠTEPANJE",
  "KROJENJE",
  "ŠIVENJE",
  "ŠTEPANJE/KROJENJE/ŠIVENJE",
]);

/** Check if a name matches any affected name (case-insensitive) */
function isAffectedName(name: string): boolean {
  const upper = name.toUpperCase();
  return AFFECTED_NAMES.has(upper);
}

/** Run the migration script as a subprocess */
function runMigration(): void {
  const scriptPath = path.resolve(__dirname, "../migrate-department-rename-consolidation.ts");
  execSync(`npx tsx "${scriptPath}"`, {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env },
    stdio: "pipe",
  });
}

describe("Preservation: Department Rename & Consolidation Migration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("5.2 - Unaffected departments remain unchanged after migration", () => {
    const testDepartments = [
      { name: "TAPACIRANJE", description: "Tapaciranje department" },
      { name: "LAKIRNICA", description: "Lakirnica department" },
    ];
    let createdDeptIds: string[] = [];

    beforeEach(async () => {
      createdDeptIds = [];
      for (const dept of testDepartments) {
        const created = await prisma.department.create({
          data: { name: dept.name, description: dept.description },
        });
        createdDeptIds.push(created.id);
      }
    });

    afterEach(async () => {
      // Clean up test departments
      await prisma.department.deleteMany({
        where: { id: { in: createdDeptIds } },
      });
    });

    it("should preserve unaffected department name, ID, and description after migration", async () => {
      // Capture state before migration
      const before = await prisma.department.findMany({
        where: { id: { in: createdDeptIds } },
        orderBy: { name: "asc" },
      });

      // Run migration
      runMigration();

      // Capture state after migration
      const after = await prisma.department.findMany({
        where: { id: { in: createdDeptIds } },
        orderBy: { name: "asc" },
      });

      // Assert nothing changed
      expect(after).toHaveLength(before.length);
      for (let i = 0; i < before.length; i++) {
        expect(after[i].id).toBe(before[i].id);
        expect(after[i].name).toBe(before[i].name);
        expect(after[i].description).toBe(before[i].description);
      }
    });
  });

  describe("5.3 - WorkOrder/ProductionStep/NormativeVersionStep references to unaffected departments are preserved", () => {
    let deptId: string;
    let articleId: string;
    let articlePartId: string;
    let productionOrderId: string;
    let normativeVersionId: string;
    let normativeVersionPartId: string;
    let workOrderId: string;
    let productionStepId: string;
    let normativeVersionStepId: string;

    beforeEach(async () => {
      // Create an unaffected department
      const dept = await prisma.department.create({
        data: { name: "TESTNI_UNAFFECTED_DEPT", description: "Test dept" },
      });
      deptId = dept.id;

      // Create an article
      const article = await prisma.article.create({
        data: { name: "Test Article for Preservation" },
      });
      articleId = article.id;

      // Create an article part
      const articlePart = await prisma.articlePart.create({
        data: { articleId: article.id, partName: "Test Part" },
      });
      articlePartId = articlePart.id;

      // Create a production order
      const productionOrder = await prisma.productionOrder.create({
        data: { articleId: article.id, status: "draft" },
      });
      productionOrderId = productionOrder.id;

      // Create a production step referencing the unaffected department
      const productionStep = await prisma.productionStep.create({
        data: {
          articlePartId: articlePart.id,
          stepName: "Test Step",
          sequenceOrder: 1,
          departmentId: dept.id,
        },
      });
      productionStepId = productionStep.id;

      // Create a work order referencing the unaffected department
      const workOrder = await prisma.workOrder.create({
        data: {
          productionOrderId: productionOrder.id,
          articlePartId: articlePart.id,
          departmentId: dept.id,
          itemIndex: 1,
          status: "pending",
        },
      });
      workOrderId = workOrder.id;

      // Create normative version and part for NormativeVersionStep
      const normativeVersion = await prisma.normativeVersion.create({
        data: {
          articleId: article.id,
          versionNumber: 999,
          isActive: true,
        },
      });
      normativeVersionId = normativeVersion.id;

      const normativeVersionPart = await prisma.normativeVersionPart.create({
        data: {
          normativeVersionId: normativeVersion.id,
          partName: "Test NV Part",
        },
      });
      normativeVersionPartId = normativeVersionPart.id;

      // Create a normative version step referencing the unaffected department
      const normativeVersionStep = await prisma.normativeVersionStep.create({
        data: {
          normativeVersionPartId: normativeVersionPart.id,
          stepName: "Test NV Step",
          sequenceOrder: 1,
          departmentId: dept.id,
        },
      });
      normativeVersionStepId = normativeVersionStep.id;
    });

    afterEach(async () => {
      // Clean up in reverse order of dependencies
      await prisma.workOrder.deleteMany({ where: { id: workOrderId } });
      await prisma.normativeVersionStep.deleteMany({ where: { id: normativeVersionStepId } });
      await prisma.normativeVersionPart.deleteMany({ where: { id: normativeVersionPartId } });
      await prisma.normativeVersion.deleteMany({ where: { id: normativeVersionId } });
      await prisma.productionStep.deleteMany({ where: { id: productionStepId } });
      await prisma.productionOrder.deleteMany({ where: { id: productionOrderId } });
      await prisma.articlePart.deleteMany({ where: { id: articlePartId } });
      await prisma.article.deleteMany({ where: { id: articleId } });
      await prisma.department.deleteMany({ where: { id: deptId } });
    });

    it("should preserve departmentId on WorkOrder, ProductionStep, and NormativeVersionStep after migration", async () => {
      // Run migration
      runMigration();

      // Verify WorkOrder still references the unaffected department
      const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
      expect(workOrder).not.toBeNull();
      expect(workOrder!.departmentId).toBe(deptId);

      // Verify ProductionStep still references the unaffected department
      const productionStep = await prisma.productionStep.findUnique({ where: { id: productionStepId } });
      expect(productionStep).not.toBeNull();
      expect(productionStep!.departmentId).toBe(deptId);

      // Verify NormativeVersionStep still references the unaffected department
      const normativeVersionStep = await prisma.normativeVersionStep.findUnique({ where: { id: normativeVersionStepId } });
      expect(normativeVersionStep).not.toBeNull();
      expect(normativeVersionStep!.departmentId).toBe(deptId);
    });
  });

  describe("5.4 - Property-based test: random unaffected department names survive migration unchanged", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * Generate random department names (excluding the affected set),
     * seed them into the database, run migration, and assert all survive unchanged.
     */

    // Generator for Croatian-compatible department names that are NOT in the affected set
    const unaffectedDeptNameArb = fc
      .stringMatching(/^[A-Za-z0-9ČčĆćŽžŠšĐđ _\-]{1,30}$/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !isAffectedName(s));

    fcTest.prop([fc.array(unaffectedDeptNameArb, { minLength: 1, maxLength: 5 })], { numRuns: 5 })(
      "all randomly-generated unaffected departments survive migration unchanged",
      async (deptNames) => {
        // Deduplicate names (case-insensitive) to avoid unique constraint issues
        const uniqueNames = [...new Set(deptNames.map((n: string) => n.toUpperCase()))].map(
          (upper) => deptNames.find((n: string) => n.toUpperCase() === upper)!
        );

        // Seed departments
        const createdDepts: { id: string; name: string; description: string | null }[] = [];
        for (const name of uniqueNames) {
          const dept = await prisma.department.create({
            data: { name, description: `PBT-generated: ${name}` },
          });
          createdDepts.push({ id: dept.id, name: dept.name, description: dept.description });
        }

        try {
          // Run migration
          runMigration();

          // Verify all departments are unchanged
          for (const original of createdDepts) {
            const afterMigration = await prisma.department.findUnique({
              where: { id: original.id },
            });
            expect(afterMigration).not.toBeNull();
            expect(afterMigration!.id).toBe(original.id);
            expect(afterMigration!.name).toBe(original.name);
            expect(afterMigration!.description).toBe(original.description);
          }
        } finally {
          // Clean up
          await prisma.department.deleteMany({
            where: { id: { in: createdDepts.map((d) => d.id) } },
          });
        }
      }
    );
  });

  describe("5.5 - Property-based test: random WorkOrder references to unaffected departments are preserved", () => {
    /**
     * **Validates: Requirements 3.2, 3.3, 3.4**
     *
     * Generate random WorkOrder references to unaffected departments,
     * run migration, and assert departmentId is preserved.
     */

    const unaffectedDeptNameArb = fc
      .stringMatching(/^[A-Za-z0-9ČčĆćŽžŠšĐđ _\-]{1,20}$/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !isAffectedName(s));

    // Generate a count of work orders per department (1 to 3)
    const workOrderCountArb = fc.integer({ min: 1, max: 3 });

    fcTest.prop([unaffectedDeptNameArb, workOrderCountArb], { numRuns: 5 })(
      "WorkOrder references to randomly-generated unaffected departments are preserved after migration",
      async (deptName, workOrderCount) => {
        // Create the unaffected department
        const dept = await prisma.department.create({
          data: { name: deptName, description: `PBT WorkOrder test: ${deptName}` },
        });

        // Create supporting article and production order
        const article = await prisma.article.create({
          data: { name: `PBT Article ${deptName}` },
        });

        const articlePart = await prisma.articlePart.create({
          data: { articleId: article.id, partName: `PBT Part ${deptName}` },
        });

        const productionOrder = await prisma.productionOrder.create({
          data: { articleId: article.id, status: "draft" },
        });

        // Create work orders referencing the unaffected department
        const workOrderIds: string[] = [];
        for (let i = 0; i < workOrderCount; i++) {
          const wo = await prisma.workOrder.create({
            data: {
              productionOrderId: productionOrder.id,
              articlePartId: articlePart.id,
              departmentId: dept.id,
              itemIndex: i + 1,
              status: "pending",
            },
          });
          workOrderIds.push(wo.id);
        }

        try {
          // Run migration
          runMigration();

          // Verify all work orders still reference the unaffected department
          for (const woId of workOrderIds) {
            const wo = await prisma.workOrder.findUnique({ where: { id: woId } });
            expect(wo).not.toBeNull();
            expect(wo!.departmentId).toBe(dept.id);
          }
        } finally {
          // Clean up in reverse dependency order
          await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
          await prisma.productionOrder.deleteMany({ where: { id: productionOrder.id } });
          await prisma.articlePart.deleteMany({ where: { id: articlePart.id } });
          await prisma.article.deleteMany({ where: { id: article.id } });
          await prisma.department.deleteMany({ where: { id: dept.id } });
        }
      }
    );
  });
});
