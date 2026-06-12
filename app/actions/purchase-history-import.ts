"use server";

import { cookies } from "next/headers";
import { importPurchaseHistory, type ImportResult } from "@/lib/services/purchase-import.service";
import type { ActionResult } from "@/lib/types/actions";
import { parsePurchaseXLSX } from "@/lib/services/purchase-csv-parser.service";

/**
 * Server Action: Import purchase history from XLSX file
 * 
 * This action handles the upload and processing of XLSX files containing
 * material purchase history (kalkulacije) data. It validates authentication,
 * extracts the XLSX content from FormData, and delegates to the import service.
 * 
 * @param formData - FormData containing the XLSX file and options
 * @returns ActionResult with ImportResult data or error message
 */
export async function importPurchaseHistoryAction(
  formData: FormData
): Promise<ActionResult<ImportResult>> {
  try {
    // Verify user is authenticated by checking session cookie
    const cookieStore = await cookies();
    const session = cookieStore.get("ProTrack-session");
    
    if (!session?.value) {
      return {
        success: false,
        error: "Unauthorized: User must be authenticated to import purchase history",
      };
    }
    
    // Extract file from formData
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return {
        success: false,
        error: "No file provided",
      };
    }
    
    // Validate file type
    if (!file.name.endsWith(".xlsx")) {
      return {
        success: false,
        error: "Invalid file type. Only Excel (.xlsx) files are accepted.",
      };
    }
    
    // Extract updateMaterialPrices option (default: true)
    const updateMaterialPrices = formData.get("updateMaterialPrices") === "true";
    
    // Read file as ArrayBuffer and parse XLSX
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parseResult = await parsePurchaseXLSX(buffer);
    
    // Call importPurchaseHistory service with parsed rows
    const result = await importPurchaseHistory(parseResult, {
      updateMaterialPrices,
    });
    
    // Return ImportResult to client
    if (result.success) {
      return {
        success: true,
        data: result,
      };
    } else {
      return {
        success: false,
        error: result.errors.length > 0 
          ? `Import failed: ${result.errors[0].message}` 
          : "Import failed",
      };
    }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to import purchase history",
    };
  }
}
