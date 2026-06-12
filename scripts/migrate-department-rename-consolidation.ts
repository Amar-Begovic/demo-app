import { prisma } from "@/lib/db";

/**
 * Migration script for department rename & consolidation
 *
 * This script:
 * 1. Renames typo departments: "BRVARI" → "BRAVARI", "MOTAŽA" → "MONTAŽA"
 * 2. Finds or creates the consolidated department "KROJENJE/ŠIVENJE/ŠTEPANJE"
 * 3. Reassigns all references from "ŠTEPANJE/KROJENJE/ŠIVENJE" (wrong order) to the consolidated department
 * 4. Deletes the wrong-order department after all references are reassigned
 * 5. Validates the migration results
 */

interface MigrationStats {
  renamedDepartments: number;
  reassignedWorkOrders: number;
  reassignedProductionSteps: number;
  reassignedNormativeVersionSteps: number;
  deletedDepartments: number;
}

export async function migrateDepartments(): Promise<MigrationStats> {
  console.log("=".repeat(60));
  console.log("Starting department rename & consolidation migration...");
  console.log("=".repeat(60));

  const stats: MigrationStats = {
    renamedDepartments: 0,
    reassignedWorkOrders: 0,
    reassignedProductionSteps: 0,
    reassignedNormativeVersionSteps: 0,
    deletedDepartments: 0,
  };

  await prisma.$transaction(async (tx) => {
    // Step 1: Rename "BRVARI" → "BRAVARI" (preserve ID)
    console.log("\n📝 Renaming typo departments...");

    const brvariResult = await tx.department.updateMany({
      where: {
        name: {
          equals: "BRVARI",
          mode: "insensitive",
        },
      },
      data: {
        name: "BRAVARI",
      },
    });
    if (brvariResult.count > 0) {
      console.log(`  ✓ Renamed "BRVARI" → "BRAVARI" (${brvariResult.count} record(s))`);
      stats.renamedDepartments += brvariResult.count;
    } else {
      console.log(`  ⚠️  "BRVARI" not found — may have already been renamed`);
    }

    // Step 2: Rename "MOTAŽA" → "MONTAŽA" (preserve ID)
    const motazaResult = await tx.department.updateMany({
      where: {
        name: {
          equals: "MOTAŽA",
          mode: "insensitive",
        },
      },
      data: {
        name: "MONTAŽA",
      },
    });
    if (motazaResult.count > 0) {
      console.log(`  ✓ Renamed "MOTAŽA" → "MONTAŽA" (${motazaResult.count} record(s))`);
      stats.renamedDepartments += motazaResult.count;
    } else {
      console.log(`  ⚠️  "MOTAŽA" not found — may have already been renamed`);
    }

    // Step 3: Find or create the consolidated department "KROJENJE/ŠIVENJE/ŠTEPANJE"
    console.log("\n🔗 Finding or creating consolidated department...");

    let consolidatedDept = await tx.department.findFirst({
      where: {
        name: {
          equals: "KROJENJE/ŠIVENJE/ŠTEPANJE",
          mode: "insensitive",
        },
      },
    });

    if (consolidatedDept) {
      console.log(`  ✓ Found existing consolidated department: "${consolidatedDept.name}" (${consolidatedDept.id})`);
    } else {
      consolidatedDept = await tx.department.create({
        data: {
          name: "KROJENJE/ŠIVENJE/ŠTEPANJE",
        },
      });
      console.log(`  ✓ Created consolidated department: "${consolidatedDept.name}" (${consolidatedDept.id})`);
    }

    // Step 4: Find the wrong-order department and reassign all references
    console.log("\n🔄 Reassigning references from wrong-order department...");

    const wrongOrderDept = await tx.department.findFirst({
      where: {
        name: {
          equals: "ŠTEPANJE/KROJENJE/ŠIVENJE",
          mode: "insensitive",
        },
      },
    });

    if (wrongOrderDept) {
      console.log(`  Found wrong-order department: "${wrongOrderDept.name}" (${wrongOrderDept.id})`);

      // Reassign WorkOrder references
      const workOrderResult = await tx.workOrder.updateMany({
        where: { departmentId: wrongOrderDept.id },
        data: { departmentId: consolidatedDept.id },
      });
      stats.reassignedWorkOrders += workOrderResult.count;
      console.log(`  ✓ Reassigned ${workOrderResult.count} WorkOrder(s)`);

      // Reassign ProductionStep references
      const productionStepResult = await tx.productionStep.updateMany({
        where: { departmentId: wrongOrderDept.id },
        data: { departmentId: consolidatedDept.id },
      });
      stats.reassignedProductionSteps += productionStepResult.count;
      console.log(`  ✓ Reassigned ${productionStepResult.count} ProductionStep(s)`);

      // Reassign NormativeVersionStep references
      const normativeVersionStepResult = await tx.normativeVersionStep.updateMany({
        where: { departmentId: wrongOrderDept.id },
        data: { departmentId: consolidatedDept.id },
      });
      stats.reassignedNormativeVersionSteps += normativeVersionStepResult.count;
      console.log(`  ✓ Reassigned ${normativeVersionStepResult.count} NormativeVersionStep(s)`);

      // Step 5: Delete the wrong-order department after all references are reassigned
      console.log("\n🗑️  Deleting wrong-order department...");

      await tx.department.delete({
        where: { id: wrongOrderDept.id },
      });
      stats.deletedDepartments += 1;
      console.log(`  ✓ Deleted department: "${wrongOrderDept.name}" (${wrongOrderDept.id})`);
    } else {
      console.log(`  ⚠️  "ŠTEPANJE/KROJENJE/ŠIVENJE" not found — may have already been migrated`);
    }
  });

  return stats;
}

export async function validateMigration(): Promise<{
  valid: boolean;
  issues: string[];
}> {
  console.log("\n" + "=".repeat(60));
  console.log("Validating migration...");
  console.log("=".repeat(60));

  const issues: string[] = [];

  // Check 1: No records should reference the deleted wrong-order department
  const wrongOrderDept = await prisma.department.findFirst({
    where: {
      name: {
        equals: "ŠTEPANJE/KROJENJE/ŠIVENJE",
        mode: "insensitive",
      },
    },
  });

  if (wrongOrderDept) {
    issues.push(`Wrong-order department "ŠTEPANJE/KROJENJE/ŠIVENJE" still exists (id: ${wrongOrderDept.id})`);
  }

  // Check 2: Consolidated department should exist
  const consolidatedDept = await prisma.department.findFirst({
    where: {
      name: {
        equals: "KROJENJE/ŠIVENJE/ŠTEPANJE",
        mode: "insensitive",
      },
    },
  });

  if (!consolidatedDept) {
    issues.push(`Consolidated department "KROJENJE/ŠIVENJE/ŠTEPANJE" does not exist`);
  }

  // Check 3: Renamed departments should have correct names
  const bravari = await prisma.department.findFirst({
    where: {
      name: {
        equals: "BRAVARI",
        mode: "insensitive",
      },
    },
  });

  if (!bravari) {
    issues.push(`Department "BRAVARI" not found — rename from "BRVARI" may have failed`);
  }

  const montaza = await prisma.department.findFirst({
    where: {
      name: {
        equals: "MONTAŽA",
        mode: "insensitive",
      },
    },
  });

  if (!montaza) {
    issues.push(`Department "MONTAŽA" not found — rename from "MOTAŽA" may have failed`);
  }

  // Check 4: No orphaned references to deleted department IDs
  // Since we deleted the wrong-order department, any FK referencing it would
  // cause a DB constraint error. But let's verify no WorkOrders/Steps reference non-existent depts.
  const allDeptIds = (await prisma.department.findMany({ select: { id: true } })).map((d) => d.id);

  const orphanedWorkOrders = await prisma.workOrder.count({
    where: {
      departmentId: { notIn: allDeptIds },
    },
  });

  if (orphanedWorkOrders > 0) {
    issues.push(`Found ${orphanedWorkOrders} WorkOrder(s) referencing non-existent departments`);
  }

  const orphanedProductionSteps = await prisma.productionStep.count({
    where: {
      departmentId: { notIn: allDeptIds },
    },
  });

  if (orphanedProductionSteps > 0) {
    issues.push(`Found ${orphanedProductionSteps} ProductionStep(s) referencing non-existent departments`);
  }

  const orphanedNormativeVersionSteps = await prisma.normativeVersionStep.count({
    where: {
      departmentId: { notIn: allDeptIds },
    },
  });

  if (orphanedNormativeVersionSteps > 0) {
    issues.push(`Found ${orphanedNormativeVersionSteps} NormativeVersionStep(s) referencing non-existent departments`);
  }

  const valid = issues.length === 0;

  if (valid) {
    console.log("✅ Migration validation passed — no issues found\n");
  } else {
    console.log("❌ Migration validation found issues:\n");
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
    console.log();
  }

  return { valid, issues };
}

async function printSummary(stats: MigrationStats, validation: { valid: boolean; issues: string[] }) {
  console.log("=".repeat(60));
  console.log("Migration Summary");
  console.log("=".repeat(60));
  console.log(`Departments renamed:              ${stats.renamedDepartments}`);
  console.log(`WorkOrders reassigned:            ${stats.reassignedWorkOrders}`);
  console.log(`ProductionSteps reassigned:       ${stats.reassignedProductionSteps}`);
  console.log(`NormativeVersionSteps reassigned: ${stats.reassignedNormativeVersionSteps}`);
  console.log(`Departments deleted:              ${stats.deletedDepartments}`);
  console.log();
  console.log(`Validation: ${validation.valid ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("=".repeat(60));
}

// Main execution — only runs when script is executed directly, not when imported
async function main() {
  try {
    const stats = await migrateDepartments();
    const validation = await validateMigration();
    await printSummary(stats, validation);

    if (!validation.valid) {
      console.error("\n⚠️  Migration completed with validation issues");
      process.exit(1);
    }

    console.log("\n✅ Migration completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed with fatal error:", error);
    process.exit(1);
  }
}

// Only run main when executed directly (not when imported for testing)
if (process.env.VITEST === undefined) {
  main();
}
