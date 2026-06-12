/**
 * Purchase Import Service
 * 
 * Handles material and supplier matching logic for purchase history import.
 * Implements case-insensitive matching strategies with fallback to creation.
 */

import { prisma } from '@/lib/db';
import type { ParseResult } from './purchase-csv-parser.service';
import { CATEGORY_KEYWORDS } from '@/lib/constants/category-keywords';
import { updateTag } from 'next/cache';

/**
 * Result of material matching operation
 */
export interface MaterialMatchResult {
  id: string;
  created: boolean;
}

/**
 * Match material by code or name, creating new material if no match found
 * 
 * Matching strategy:
 * 1. Try exact match by code (case-insensitive)
 * 2. Fall back to exact match by name (case-insensitive)
 * 3. Create new material if no match found
 * 
 * @param materialCode - Material code from CSV (can be null)
 * @param materialName - Material name from CSV (required)
 * @param unit - Unit of measure from CSV (JedinicaMjere)
 * @param price - Purchase price from CSV (NabavnaCijena)
 * @returns Material ID and whether it was newly created
 */
export async function matchMaterial(
  materialCode: string | null,
  materialName: string,
  unit: string,
  price: number
): Promise<MaterialMatchResult> {
  // 1. Try exact match by code (case-insensitive)
  if (materialCode) {
    const byCode = await prisma.material.findFirst({
      where: { code: { equals: materialCode, mode: 'insensitive' } }
    });
    if (byCode) {
      // Update unit from kalkulacija if different
      if (unit && byCode.unit !== unit) {
        await prisma.material.update({
          where: { id: byCode.id },
          data: { unit },
        });
      }
      return { id: byCode.id, created: false };
    }
  }

  // 2. Try exact match by name (case-insensitive)
  const byName = await prisma.material.findFirst({
    where: { name: { equals: materialName, mode: 'insensitive' } }
  });
  if (byName) {
    // Update unit from kalkulacija if different
    if (unit && byName.unit !== unit) {
      await prisma.material.update({
        where: { id: byName.id },
        data: { unit },
      });
    }
    return { id: byName.id, created: false };
  }

  // 3. Create new material with CSV field mapping
  // Set material price to NabavnaCijena from CSV (Requirement 3.4)
  // Set material unit to JedinicaMjere from CSV (Requirement 3.5)
  // Set currentQuantity to 0 and minimumQuantity to 0
  const newMaterial = await prisma.material.create({
    data: {
      code: materialCode,
      name: materialName,
      unit: unit,
      price: price,
      currentQuantity: 0,
      minimumQuantity: 0,
    }
  });
  
  return { id: newMaterial.id, created: true };
}

/**
 * Result of supplier matching operation
 */
export interface SupplierMatchResult {
  id: string;
  created: boolean;
}

/**
 * Match supplier by code or company name, creating new supplier if no match found
 * 
 * Matching strategy:
 * 1. Try exact match by code (case-insensitive)
 * 2. Fall back to exact match by company name (case-insensitive)
 * 3. Create new supplier if no match found
 * 
 * @param supplierCode - Supplier code from CSV (can be null)
 * @param supplierName - Supplier company name from CSV (required)
 * @returns Supplier ID and whether it was newly created, or null if creation fails
 */
export async function matchSupplier(
  supplierCode: string | null,
  supplierName: string
): Promise<SupplierMatchResult | null> {
  // 1. Try exact match by code (case-insensitive)
  if (supplierCode) {
    const byCode = await prisma.supplier.findFirst({
      where: { code: { equals: supplierCode, mode: 'insensitive' } }
    });
    if (byCode) {
      return { id: byCode.id, created: false };
    }
  }

  // 2. Try exact match by company name (case-insensitive)
  const byName = await prisma.supplier.findFirst({
    where: { companyName: { equals: supplierName, mode: 'insensitive' } }
  });
  if (byName) {
    return { id: byName.id, created: false };
  }

  // 3. Create new supplier
  // Note: Full CSV field mapping will be implemented in task 5.3
  // For now, just implement the matching logic
  const newSupplier = await prisma.supplier.create({
    data: {
      code: supplierCode,
      companyName: supplierName,
    }
  });
  
  return { id: newSupplier.id, created: true };
}

/**
 * Options for import operation
 */
export interface ImportOptions {
  updateMaterialPrices: boolean;  // Default: true
}

/**
 * Result of import operation
 */
export interface ImportResult {
  success: boolean;
  summary: {
    totalRows: number;
    imported: number;
    skipped: number;
    duplicatesSkipped: number;
    materialsCreated: number;
    suppliersCreated: number;
    pricesUpdated: number;
  };
  errors: Array<{ row: number; message: string }>;
}

/**
 * Import purchase history from CSV content
 * 
 * This function orchestrates the entire import process:
 * 1. Parse CSV using CSV parser service
 * 2. Wrap all database operations in Prisma transaction
 * 3. Process each row (validation, matching, record creation)
 * 4. Implement rollback on critical errors
 * 5. Return comprehensive import result
 * 
 * @param parseResult - Parsed purchase data (rows and errors)
 * @param options - Import options (updateMaterialPrices)
 * @returns ImportResult with success status, summary, and errors
 */
export async function importPurchaseHistory(
  parseResult: ParseResult,
  options: ImportOptions = { updateMaterialPrices: true }
): Promise<ImportResult> {
  // Initialize result structure
  const result: ImportResult = {
    success: false,
    summary: {
      totalRows: 0,
      imported: 0,
      skipped: 0,
      duplicatesSkipped: 0,
      materialsCreated: 0,
      suppliersCreated: 0,
      pricesUpdated: 0,
    },
    errors: [],
  };

  try {
    // Add parse errors to result
    result.errors.push(...parseResult.errors);
    result.summary.totalRows = parseResult.rows.length + parseResult.errors.length;
    result.summary.skipped = parseResult.errors.length;

    // If no valid rows, return early
    if (parseResult.rows.length === 0) {
      result.success = parseResult.errors.length === 0;
      return result;
    }

    // Track which category sections were affected for cache invalidation
    const affectedSections = new Set<string>();

    // Step 2: Wrap all database operations in Prisma transaction
    // This ensures atomicity - either all operations succeed or all are rolled back
    // Timeout set to 60 seconds for large imports
    await prisma.$transaction(async (tx) => {
      // Process each parsed row
      for (let i = 0; i < parseResult.rows.length; i++) {
        const row = parseResult.rows[i];
        const rowNumber = i + 2; // +2 because: +1 for 1-based indexing, +1 for header row
        
        try {
          // Task 6.2: Row processing with validation
          
          // Validate purchase date is valid date
          if (!row.date || isNaN(row.date.getTime())) {
            result.errors.push({
              row: rowNumber,
              message: 'Invalid purchase date'
            });
            result.summary.skipped++;
            continue;
          }
          
          // Validate quantity is a number
          if (typeof row.quantity !== 'number' || isNaN(row.quantity)) {
            result.errors.push({
              row: rowNumber,
              message: 'Quantity must be a valid number'
            });
            result.summary.skipped++;
            continue;
          }
          
          // Validate purchase price is a number (allow zero for free samples/internal transfers)
          if (typeof row.purchasePrice !== 'number' || isNaN(row.purchasePrice) || row.purchasePrice < 0) {
            result.errors.push({
              row: rowNumber,
              message: 'Purchase price must be a non-negative number'
            });
            result.summary.skipped++;
            continue;
          }
          
          // Task 6.5: MaterialPurchaseHistory record creation
          
          // Match material using matchMaterial function
          const materialMatch = await matchMaterial(
            row.materialCode,
            row.materialName,
            row.unit,
            row.purchasePrice
          );
          
          if (materialMatch.created) {
            result.summary.materialsCreated++;
            
            // Link new material to category sections based on keyword matching
            const nameLower = row.materialName.toLowerCase();
            
            if (nameLower.includes(CATEGORY_KEYWORDS.nogice)) {
              try {
                await tx.nogica.create({
                  data: {
                    name: row.materialName,
                    code: row.materialCode,
                    materialId: materialMatch.id,
                  },
                });
                affectedSections.add("nogice");
              } catch {
                // Skip if code already exists (unique constraint violation)
              }
            }
            
            if (nameLower.includes(CATEGORY_KEYWORDS.rucke)) {
              try {
                await tx.rucka.create({
                  data: {
                    name: row.materialName,
                    code: row.materialCode,
                    materialId: materialMatch.id,
                  },
                });
                affectedSections.add("rucke");
              } catch {
                // Skip if code already exists (unique constraint violation)
              }
            }
            
            if (nameLower.includes(CATEGORY_KEYWORDS.paspul)) {
              try {
                await tx.paspul.create({
                  data: {
                    name: row.materialName,
                    code: row.materialCode,
                    materialId: materialMatch.id,
                  },
                });
                affectedSections.add("paspul");
              } catch {
                // Skip if code already exists (unique constraint violation)
              }
            }
          }
          
          // Match supplier using matchSupplier function
          const supplierMatch = await matchSupplier(
            row.supplierCode,
            row.supplierName
          );
          
          if (supplierMatch && supplierMatch.created) {
            result.summary.suppliersCreated++;
          }
          
          // Calculate totalValue as quantity * purchasePrice
          const totalValue = row.quantity * row.purchasePrice;
          
          // Check for duplicate: same material, supplier, date, quantity, price
          const existing = await tx.materialPurchaseHistory.findFirst({
            where: {
              materialId: materialMatch.id,
              supplierId: supplierMatch?.id || null,
              purchaseDate: row.date,
              quantity: row.quantity,
              purchasePrice: row.purchasePrice,
            },
          });
          
          if (existing) {
            result.summary.duplicatesSkipped++;
            result.summary.skipped++;
            continue;
          }
          
          // Create MaterialPurchaseHistory record with all fields
          await tx.materialPurchaseHistory.create({
            data: {
              materialId: materialMatch.id,
              supplierId: supplierMatch?.id || null,
              purchaseDate: row.date,
              quantity: row.quantity,
              purchasePrice: row.purchasePrice,
              totalValue: totalValue,
              unit: row.unit,
              invoiceNumber: null, // Not provided in CSV
            }
          });

          // Update material stock quantity
          await tx.material.update({
            where: { id: materialMatch.id },
            data: {
              currentQuantity: { increment: row.quantity },
            },
          });
          
          // Task 6.8: Implement material price update logic
          
          // Check updateMaterialPrices option
          if (options.updateMaterialPrices) {
            // Update material price to NabavnaCijena if enabled
            await tx.material.update({
              where: { id: materialMatch.id },
              data: { price: row.purchasePrice }
            });
            
            // Track number of prices updated in summary
            result.summary.pricesUpdated++;
          }
          
          // Task 6.10: Track imported count
          result.summary.imported++;
          
        } catch (error) {
          // Skip invalid rows and add to error report
          result.errors.push({
            row: rowNumber,
            message: `Error processing row: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
          result.summary.skipped++;
          // Continue processing after validation errors
        }
      }
    }, {
      timeout: 60000, // 60 seconds timeout for large imports
    });

    // If transaction succeeds, mark as successful
    result.success = true;

    // Invalidate cache tags for any affected category sections
    for (const section of affectedSections) {
      updateTag(section);
    }

  } catch (error) {
    // Critical error occurred - transaction was rolled back
    result.success = false;
    result.errors.push({
      row: 0,
      message: `Critical error during import: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }

  return result;
}
