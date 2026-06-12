/**
 * Fix Verification Tests for Department Rename & Consolidation
 *
 * This test suite verifies that the migration script correctly:
 * 1. Renames typo departments ("BRVARI" → "BRAVARI", "MOTAŽA" → "MONTAŽA") preserving IDs
 * 2. Consolidates the wrong-order department "ŠTEPANJE/KROJENJE/ŠIVENJE" into "KROJENJE/ŠIVENJE/ŠTEPANJE"
 * 3. Reassigns all WorkOrder references from wrong-order department to consolidated
 * 4. Deletes the wrong-order department after migration
 * 5. Is idempotent (running twice produces no errors and same result)
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@/app/generated/prisma";
import { migrateDepartments } from "../migrate-department-rename-consolidation";

const prisma = new PrismaClient();

// Track IDs for cleanup
let createdDepartmentIds: string[] = [];
let createdArticleIds: string[] = [];
let createdArticlePartIds: string[] = [];
let createdProductionOrderIds: string[] = [];
let createdWorkOrderIds: string[] = [];

describe("Fix Verification: Department Rename & Consolidation", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up test data in reverse order of dependencies
    if (createdWorkOrderIds.length > 0) {
      await prisma.workOrder.deleteMany({
        where: { id: { in: createdWorkOrderIds } },
      });
    }
    if (createdProductionOrderIds.length > 0) {
      await prisma.productionOrder.deleteMany({
        where: { id: { in: createdProductionOrderIds } },
      });
    }
    if (createdArticlePartIds.length > 0) {
      await prisma.articlePart.deleteMany({
        where: { id: { in: createdArticlePartIds } },
      });
    }
    if (createdArticleIds.length > 0) {
      await prisma.article.deleteMany({
        where: { id: { in: createdArticleIds } },
      });
    }
    if (createdDepartmentIds.length > 0) {
      await prisma.department.deleteMany({
        where: { id: { in: createdDepartmentIds } },
      });
    }

    // Reset tracking arrays
    createdDepartmentIds = [];
    createdArticleIds = [];
    createdArticlePartIds = [];
    createdProductionOrderIds = [];
    createdWorkOrderIds = [];
  });

  it("should rename 'BRVARI' to 'BRAVARI' and 'MOTAŽA' to 'MONTAŽA' preserving their IDs", async () => {
    // Seed typo departments
    const brvari = await prisma.department.create({
      data: { name: "BRVARI" },
    });
    createdDepartmentIds.push(brvari.id);

    const motaza = await prisma.department.create({
      data: { name: "MOTAŽA" },
    });
    createdDepartmentIds.push(motaza.id);

    // Also seed the consolidated department so migration doesn't fail
    // when it looks for wrong-order dept (not needed for this test, but keeps migration clean)
    const consolidated = await prisma.department.findFirst({
      where: { name: { equals: "KROJENJE/ŠIVENJE/ŠTEPANJE", mode: "insensitive" } },
    });
    if (!consolidated) {
      const created = await prisma.department.create({
        data: { name: "KROJENJE/ŠIVENJE/ŠTEPANJE" },
      });
      createdDepartmentIds.push(created.id);
    }

    // Run migration
    await migrateDepartments();

    // Assert BRVARI was renamed to BRAVARI with same ID
    const renamedBravari = await prisma.department.findUnique({
      where: { id: brvari.id },
    });
    expect(renamedBravari).not.toBeNull();
    expect(renamedBravari!.name).toBe("BRAVARI");
    expect(renamedBravari!.id).toBe(brvari.id);

    // Assert MOTAŽA was renamed to MONTAŽA with same ID
    const renamedMontaza = await prisma.department.findUnique({
      where: { id: motaza.id },
    });
    expect(renamedMontaza).not.toBeNull();
    expect(renamedMontaza!.name).toBe("MONTAŽA");
    expect(renamedMontaza!.id).toBe(motaza.id);

    // Update tracked IDs for cleanup (names changed but IDs are same)
  });

  it("should reassign all WorkOrder departmentId values from wrong-order department to consolidated department", async () => {
    // Create consolidated department (or find existing)
    let consolidated = await prisma.department.findFirst({
      where: { name: { equals: "KROJENJE/ŠIVENJE/ŠTEPANJE", mode: "insensitive" } },
    });
    if (!consolidated) {
      consolidated = await prisma.department.create({
        data: { name: "KROJENJE/ŠIVENJE/ŠTEPANJE" },
      });
      createdDepartmentIds.push(consolidated.id);
    }

    // Create the wrong-order department
    const wrongOrder = await prisma.department.create({
      data: { name: "ŠTEPANJE/KROJENJE/ŠIVENJE" },
    });
    createdDepartmentIds.push(wrongOrder.id);

    // Create supporting data for WorkOrder: Article, ArticlePart, ProductionOrder
    const article = await prisma.article.create({
      data: { name: "Test Article for Fix Verification" },
    });
    createdArticleIds.push(article.id);

    const articlePart = await prisma.articlePart.create({
      data: { articleId: article.id, partName: "Test Part" },
    });
    createdArticlePartIds.push(articlePart.id);

    const productionOrder = await prisma.productionOrder.create({
      data: { status: "draft" },
    });
    createdProductionOrderIds.push(productionOrder.id);

    // Create WorkOrders referencing the wrong-order department
    const workOrder1 = await prisma.workOrder.create({
      data: {
        productionOrderId: productionOrder.id,
        articlePartId: articlePart.id,
        departmentId: wrongOrder.id,
        itemIndex: 1,
      },
    });
    createdWorkOrderIds.push(workOrder1.id);

    const workOrder2 = await prisma.workOrder.create({
      data: {
        productionOrderId: productionOrder.id,
        articlePartId: articlePart.id,
        departmentId: wrongOrder.id,
        itemIndex: 2,
      },
    });
    createdWorkOrderIds.push(workOrder2.id);

    // Run migration
    await migrateDepartments();

    // Assert all WorkOrders now point to the consolidated department
    const updatedWorkOrder1 = await prisma.workOrder.findUnique({
      where: { id: workOrder1.id },
    });
    expect(updatedWorkOrder1).not.toBeNull();
    expect(updatedWorkOrder1!.departmentId).toBe(consolidated.id);

    const updatedWorkOrder2 = await prisma.workOrder.findUnique({
      where: { id: workOrder2.id },
    });
    expect(updatedWorkOrder2).not.toBeNull();
    expect(updatedWorkOrder2!.departmentId).toBe(consolidated.id);

    // Remove wrong-order dept from cleanup list since migration already deleted it
    createdDepartmentIds = createdDepartmentIds.filter((id) => id !== wrongOrder.id);
  });

  it("should delete the wrong-order department and ensure consolidated department exists after migration", async () => {
    // Create consolidated department (or find existing)
    let consolidated = await prisma.department.findFirst({
      where: { name: { equals: "KROJENJE/ŠIVENJE/ŠTEPANJE", mode: "insensitive" } },
    });
    if (!consolidated) {
      consolidated = await prisma.department.create({
        data: { name: "KROJENJE/ŠIVENJE/ŠTEPANJE" },
      });
      createdDepartmentIds.push(consolidated.id);
    }

    // Create the wrong-order department
    const wrongOrder = await prisma.department.create({
      data: { name: "ŠTEPANJE/KROJENJE/ŠIVENJE" },
    });
    createdDepartmentIds.push(wrongOrder.id);

    // Run migration
    await migrateDepartments();

    // Assert wrong-order department no longer exists
    const deletedDept = await prisma.department.findUnique({
      where: { id: wrongOrder.id },
    });
    expect(deletedDept).toBeNull();

    // Assert wrong-order department name doesn't exist at all
    const wrongOrderByName = await prisma.department.findFirst({
      where: { name: { equals: "ŠTEPANJE/KROJENJE/ŠIVENJE", mode: "insensitive" } },
    });
    expect(wrongOrderByName).toBeNull();

    // Assert consolidated department exists
    const consolidatedDept = await prisma.department.findFirst({
      where: { name: { equals: "KROJENJE/ŠIVENJE/ŠTEPANJE", mode: "insensitive" } },
    });
    expect(consolidatedDept).not.toBeNull();
    expect(consolidatedDept!.name).toBe("KROJENJE/ŠIVENJE/ŠTEPANJE");

    // Remove wrong-order dept from cleanup list since migration already deleted it
    createdDepartmentIds = createdDepartmentIds.filter((id) => id !== wrongOrder.id);
  });

  it("should be idempotent: running migration twice produces no errors and same result", async () => {
    // Seed typo departments
    const brvari = await prisma.department.create({
      data: { name: "BRVARI" },
    });
    createdDepartmentIds.push(brvari.id);

    const motaza = await prisma.department.create({
      data: { name: "MOTAŽA" },
    });
    createdDepartmentIds.push(motaza.id);

    // Create consolidated department (or find existing)
    let consolidated = await prisma.department.findFirst({
      where: { name: { equals: "KROJENJE/ŠIVENJE/ŠTEPANJE", mode: "insensitive" } },
    });
    if (!consolidated) {
      consolidated = await prisma.department.create({
        data: { name: "KROJENJE/ŠIVENJE/ŠTEPANJE" },
      });
      createdDepartmentIds.push(consolidated.id);
    }

    // Create wrong-order department with WorkOrder reference
    const wrongOrder = await prisma.department.create({
      data: { name: "ŠTEPANJE/KROJENJE/ŠIVENJE" },
    });
    createdDepartmentIds.push(wrongOrder.id);

    const article = await prisma.article.create({
      data: { name: "Test Article for Idempotency" },
    });
    createdArticleIds.push(article.id);

    const articlePart = await prisma.articlePart.create({
      data: { articleId: article.id, partName: "Test Part Idempotency" },
    });
    createdArticlePartIds.push(articlePart.id);

    const productionOrder = await prisma.productionOrder.create({
      data: { status: "draft" },
    });
    createdProductionOrderIds.push(productionOrder.id);

    const workOrder = await prisma.workOrder.create({
      data: {
        productionOrderId: productionOrder.id,
        articlePartId: articlePart.id,
        departmentId: wrongOrder.id,
        itemIndex: 1,
      },
    });
    createdWorkOrderIds.push(workOrder.id);

    // First migration run
    const stats1 = await migrateDepartments();

    // Capture state after first run
    const bravariAfterFirst = await prisma.department.findUnique({ where: { id: brvari.id } });
    const montazaAfterFirst = await prisma.department.findUnique({ where: { id: motaza.id } });
    const consolidatedAfterFirst = await prisma.department.findFirst({
      where: { name: { equals: "KROJENJE/ŠIVENJE/ŠTEPANJE", mode: "insensitive" } },
    });
    const workOrderAfterFirst = await prisma.workOrder.findUnique({ where: { id: workOrder.id } });

    // Second migration run — should not throw
    const stats2 = await migrateDepartments();

    // Capture state after second run
    const bravariAfterSecond = await prisma.department.findUnique({ where: { id: brvari.id } });
    const montazaAfterSecond = await prisma.department.findUnique({ where: { id: motaza.id } });
    const consolidatedAfterSecond = await prisma.department.findFirst({
      where: { name: { equals: "KROJENJE/ŠIVENJE/ŠTEPANJE", mode: "insensitive" } },
    });
    const workOrderAfterSecond = await prisma.workOrder.findUnique({ where: { id: workOrder.id } });

    // Assert state is the same after both runs
    expect(bravariAfterSecond!.name).toBe(bravariAfterFirst!.name);
    expect(montazaAfterSecond!.name).toBe(montazaAfterFirst!.name);
    expect(consolidatedAfterSecond!.id).toBe(consolidatedAfterFirst!.id);
    expect(workOrderAfterSecond!.departmentId).toBe(workOrderAfterFirst!.departmentId);

    // Second run should have 0 changes (everything already migrated)
    expect(stats2.renamedDepartments).toBe(0);
    expect(stats2.reassignedWorkOrders).toBe(0);
    expect(stats2.reassignedProductionSteps).toBe(0);
    expect(stats2.reassignedNormativeVersionSteps).toBe(0);
    expect(stats2.deletedDepartments).toBe(0);

    // Remove wrong-order dept from cleanup list since migration already deleted it
    createdDepartmentIds = createdDepartmentIds.filter((id) => id !== wrongOrder.id);
  });
});
