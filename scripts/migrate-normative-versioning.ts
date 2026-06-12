import { prisma } from "@/lib/db";
import { NormativeVersionService } from "@/lib/services/normative-version.service";

/**
 * Migration script for normative versioning system
 * 
 * This script:
 * 1. Finds all articles that have production orders
 * 2. Creates initial normative versions for each article
 * 3. Associates existing production orders with created versions
 * 4. Updates work orders to reference versioned steps
 * 5. Validates data consistency
 */

interface MigrationStats {
  articlesProcessed: number;
  versionsCreated: number;
  ordersUpdated: number;
  workOrdersUpdated: number;
  errors: Array<{ articleCode: string; error: string }>;
}

async function migrateNormativeVersioning(): Promise<MigrationStats> {
  console.log("=".repeat(60));
  console.log("Starting normative versioning migration...");
  console.log("=".repeat(60));

  const stats: MigrationStats = {
    articlesProcessed: 0,
    versionsCreated: 0,
    ordersUpdated: 0,
    workOrdersUpdated: 0,
    errors: [],
  };

  // Get all articles that have production orders (either direct or via items)
  const articlesWithOrders = await prisma.article.findMany({
    where: {
      OR: [
        { productionOrders: { some: {} } },
        { productionOrderItems: { some: {} } },
      ],
    },
    include: {
      parts: {
        include: {
          productionSteps: {
            include: {
              materials: true,
            },
            orderBy: {
              sequenceOrder: 'asc',
            },
          },
        },
      },
      productionOrders: {
        select: {
          id: true,
          orderNumber: true,
        },
      },
      productionOrderItems: {
        select: {
          productionOrderId: true,
          productionOrder: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
      },
    },
  });

  console.log(`\nFound ${articlesWithOrders.length} articles with production orders\n`);

  // Process each article
  for (const article of articlesWithOrders) {
    try {
      console.log(`Processing article: ${article.code || article.name} (${article.id})`);

      // Skip if article has no parts (nothing to version)
      if (article.parts.length === 0) {
        console.log(`  ⚠️  Skipping - no parts defined`);
        stats.articlesProcessed++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // Create initial normative version for this article
        console.log(`  Creating normative version...`);
        const versionId = await NormativeVersionService.createSnapshot(article.id, tx);
        stats.versionsCreated++;
        console.log(`  ✓ Created version: ${versionId}`);

        // Get all production orders for this article (both direct and via items)
        const directOrderIds = article.productionOrders.map((o) => o.id);
        const itemOrderIds = article.productionOrderItems.map((i) => i.productionOrderId);
        const allOrderIds = [...new Set([...directOrderIds, ...itemOrderIds])];

        if (allOrderIds.length === 0) {
          console.log(`  ⚠️  No production orders to associate`);
          stats.articlesProcessed++;
          return;
        }

        // Associate all existing production orders with this version
        console.log(`  Associating ${allOrderIds.length} production orders with version...`);
        const updateResult = await tx.productionOrder.updateMany({
          where: { id: { in: allOrderIds } },
          data: { normativeVersionId: versionId },
        });
        stats.ordersUpdated += updateResult.count;
        console.log(`  ✓ Updated ${updateResult.count} production orders`);

        // Update work orders to reference versioned steps
        console.log(`  Updating work orders to reference versioned steps...`);
        let workOrdersUpdated = 0;

        for (const orderId of allOrderIds) {
          // Get all work orders for this production order
          const workOrders = await tx.workOrder.findMany({
            where: { productionOrderId: orderId },
            include: {
              productionStep: {
                include: {
                  articlePart: true,
                },
              },
              articlePart: true,
            },
          });

          for (const wo of workOrders) {
            // Skip if work order doesn't have a production step reference
            if (!wo.productionStepId || !wo.productionStep) {
              continue;
            }

            // Find the corresponding versioned step
            // Match by part name and sequence order
            const partName = wo.productionStep.articlePart?.partName || wo.articlePart.partName;
            const sequenceOrder = wo.productionStep.sequenceOrder;

            const versionedStep = await tx.normativeVersionStep.findFirst({
              where: {
                part: {
                  normativeVersionId: versionId,
                  partName: partName,
                },
                sequenceOrder: sequenceOrder,
              },
            });

            if (versionedStep) {
              // Update work order to reference versioned step
              await tx.workOrder.update({
                where: { id: wo.id },
                data: {
                  normativeVersionStepId: versionedStep.id,
                  productionStepId: null, // Clear the old reference
                },
              });
              workOrdersUpdated++;
            } else {
              console.log(
                `  ⚠️  Could not find versioned step for work order ${wo.id} ` +
                `(part: ${partName}, sequence: ${sequenceOrder})`
              );
            }
          }
        }

        stats.workOrdersUpdated += workOrdersUpdated;
        console.log(`  ✓ Updated ${workOrdersUpdated} work orders`);
      });

      stats.articlesProcessed++;
      console.log(`  ✅ Successfully migrated article\n`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Error migrating article ${article.code || article.name}:`, errorMessage);
      stats.errors.push({
        articleCode: article.code || article.name,
        error: errorMessage,
      });
      console.log(); // Empty line for readability
    }
  }

  return stats;
}

async function validateMigration(): Promise<{
  valid: boolean;
  issues: string[];
}> {
  console.log("=".repeat(60));
  console.log("Validating migration...");
  console.log("=".repeat(60));

  const issues: string[] = [];

  // Check 1: Production orders without version that should have one
  const ordersWithoutVersion = await prisma.productionOrder.findMany({
    where: {
      normativeVersionId: null,
      OR: [
        { article: { isNot: null } },
        { items: { some: {} } },
      ],
    },
    include: {
      article: { select: { code: true, name: true } },
      items: { select: { article: { select: { code: true, name: true } } } },
    },
  });

  if (ordersWithoutVersion.length > 0) {
    issues.push(
      `Found ${ordersWithoutVersion.length} production orders without normative version:`
    );
    for (const order of ordersWithoutVersion.slice(0, 5)) {
      const articleInfo = order.article
        ? `${order.article.code || order.article.name}`
        : order.items[0]?.article
          ? `${order.items[0].article.code || order.items[0].article.name}`
          : "unknown";
      issues.push(`  - Order #${order.orderNumber} (article: ${articleInfo})`);
    }
    if (ordersWithoutVersion.length > 5) {
      issues.push(`  ... and ${ordersWithoutVersion.length - 5} more`);
    }
  }

  // Check 2: Orphaned work orders (no step reference)
  const orphanedWorkOrders = await prisma.workOrder.findMany({
    where: {
      productionStepId: null,
      normativeVersionStepId: null,
    },
    include: {
      productionOrder: { select: { orderNumber: true } },
      articlePart: { select: { partName: true } },
    },
  });

  if (orphanedWorkOrders.length > 0) {
    issues.push(
      `Found ${orphanedWorkOrders.length} orphaned work orders (no step reference):`
    );
    for (const wo of orphanedWorkOrders.slice(0, 5)) {
      issues.push(
        `  - Work order ${wo.id} (order #${wo.productionOrder.orderNumber}, ` +
        `part: ${wo.articlePart.partName})`
      );
    }
    if (orphanedWorkOrders.length > 5) {
      issues.push(`  ... and ${orphanedWorkOrders.length - 5} more`);
    }
  }

  // Check 3: Work orders with both step references (should not happen)
  const duplicateReferences = await prisma.workOrder.count({
    where: {
      productionStepId: { not: null },
      normativeVersionStepId: { not: null },
    },
  });

  if (duplicateReferences > 0) {
    issues.push(
      `Found ${duplicateReferences} work orders with both productionStepId and normativeVersionStepId set`
    );
  }

  const valid = issues.length === 0;

  if (valid) {
    console.log("✅ Migration validation passed - no issues found\n");
  } else {
    console.log("❌ Migration validation found issues:\n");
    for (const issue of issues) {
      console.log(issue);
    }
    console.log();
  }

  return { valid, issues };
}

async function printSummary(stats: MigrationStats, validation: { valid: boolean; issues: string[] }) {
  console.log("=".repeat(60));
  console.log("Migration Summary");
  console.log("=".repeat(60));
  console.log(`Articles processed:    ${stats.articlesProcessed}`);
  console.log(`Versions created:      ${stats.versionsCreated}`);
  console.log(`Orders updated:        ${stats.ordersUpdated}`);
  console.log(`Work orders updated:   ${stats.workOrdersUpdated}`);
  console.log(`Errors:                ${stats.errors.length}`);
  console.log();

  if (stats.errors.length > 0) {
    console.log("Errors encountered:");
    for (const error of stats.errors) {
      console.log(`  - ${error.articleCode}: ${error.error}`);
    }
    console.log();
  }

  console.log(`Validation: ${validation.valid ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("=".repeat(60));
}

// Main execution
async function main() {
  try {
    const stats = await migrateNormativeVersioning();
    const validation = await validateMigration();
    await printSummary(stats, validation);

    if (!validation.valid) {
      console.error("\n⚠️  Migration completed with validation issues");
      process.exit(1);
    }

    if (stats.errors.length > 0) {
      console.error("\n⚠️  Migration completed with errors");
      process.exit(1);
    }

    console.log("\n✅ Migration completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed with fatal error:", error);
    process.exit(1);
  }
}

main();
