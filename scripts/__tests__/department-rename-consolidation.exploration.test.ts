/**
 * Bug Condition Exploration Test for Department Rename & Consolidation
 *
 * This test suite verifies that the bugs exist in the production database
 * BEFORE implementing the fix. Tests connect to the real database and
 * confirm the presence of:
 * 1. Typo departments: "BRVARI" (should be "BRAVARI") and "MOTAŽA" (should be "MONTAŽA")
 * 2. Wrong-order duplicate: "štepanje/krojenje/šivenje" exists as a separate record
 *    alongside the correct "KROJENJE/ŠIVENJE/ŠTEPANJE" (should be consolidated into one)
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 *
 * CRITICAL: These tests are expected to PASS on unfixed data (confirming bugs exist).
 * After the migration fix is applied, these tests would FAIL (because the bugs are resolved).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@/app/generated/prisma";

const prisma = new PrismaClient();

describe("Bug Condition Exploration: Department Rename & Consolidation", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should find department with typo name 'BRVARI' (confirming typo bug exists)", async () => {
    const department = await prisma.department.findFirst({
      where: {
        name: {
          equals: "BRVARI",
          mode: "insensitive",
        },
      },
    });

    expect(department).not.toBeNull();
  });

  it("should find department with typo name 'MOTAŽA' (confirming typo bug exists)", async () => {
    const department = await prisma.department.findFirst({
      where: {
        name: {
          equals: "MOTAŽA",
          mode: "insensitive",
        },
      },
    });

    expect(department).not.toBeNull();
  });

  it("should find 'ŠTEPANJE/KROJENJE/ŠIVENJE' (wrong-order) as a separate record from 'KROJENJE/ŠIVENJE/ŠTEPANJE' (confirming wrong-order duplication bug)", async () => {
    // The correct consolidated department
    const correctOrder = await prisma.department.findFirst({
      where: {
        name: {
          equals: "KROJENJE/ŠIVENJE/ŠTEPANJE",
          mode: "insensitive",
        },
      },
    });

    // The wrong-order duplicate department
    const wrongOrder = await prisma.department.findFirst({
      where: {
        name: {
          equals: "ŠTEPANJE/KROJENJE/ŠIVENJE",
          mode: "insensitive",
        },
      },
    });

    // Both should exist — confirming wrong-order duplication bug
    expect(correctOrder).not.toBeNull();
    expect(wrongOrder).not.toBeNull();

    // They should be distinct records (different IDs) — confirming duplication
    expect(correctOrder!.id).not.toBe(wrongOrder!.id);
  });

  it("should find WorkOrder, ProductionStep, or NormativeVersionStep records referencing the wrong-order department (confirming data references need migration)", async () => {
    // Find the wrong-order department
    const wrongOrderDept = await prisma.department.findFirst({
      where: {
        name: {
          equals: "ŠTEPANJE/KROJENJE/ŠIVENJE",
          mode: "insensitive",
        },
      },
    });

    expect(wrongOrderDept).not.toBeNull();
    const deptId = wrongOrderDept!.id;

    // Query all three referencing tables for records pointing to the wrong-order department
    const [workOrderCount, productionStepCount, normativeVersionStepCount] =
      await Promise.all([
        prisma.workOrder.count({
          where: { departmentId: deptId },
        }),
        prisma.productionStep.count({
          where: { departmentId: deptId },
        }),
        prisma.normativeVersionStep.count({
          where: { departmentId: deptId },
        }),
      ]);

    const totalReferences =
      workOrderCount + productionStepCount + normativeVersionStepCount;

    // At least some records should reference the wrong-order department,
    // confirming that actual data needs to be migrated
    expect(totalReferences).toBeGreaterThan(0);
  });
});
