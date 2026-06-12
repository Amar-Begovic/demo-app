import type { BarcodeType } from "@/app/generated/prisma";

export interface MaterialRequirement {
  materialId: string;
  materialName: string;
  requiredQuantity: number;
  availableQuantity: number;
  deficit: number;
}

export interface MaterialCheckResult {
  allAvailable: boolean;
  requirements: MaterialRequirement[];
}

export interface BarcodeData {
  id: string;
  value: string;
  type: BarcodeType;
  imageBase64: string;
}

export interface PartIdentifierData {
  id: string;
  value: string;
  type: BarcodeType;
  imageBase64: string;
  productionOrderId: string;
  articlePartId: string;
  itemIndex: number;
}

export interface StepInfo {
  stepId: string;
  stepName: string;
  sequenceOrder: number;
  departmentId: string;
  estimatedTime: number | null;
  instructions: string | null;
  isVersioned?: boolean;
}

export interface CanStartResult {
  allowed: boolean;
  reason?: string;
  activeStep?: any;
}

export interface StepProgress {
  stepName: string;
  stepSequence: number | null;
  departmentName: string;
  status: "pending" | "in_progress" | "completed";
}

export interface PartScanResult {
  barcode: PartIdentifierData;
  action: "started" | "needs_confirmation" | "blocked" | "all_completed" | "wrong_department";
  workOrder?: any;
  blockingStep?: { stepName: string; stepSequence: number; departmentName: string };
  expectedDepartment?: { id: string; name: string };
  stepsProgress: StepProgress[];
  totalSteps: number;
  currentStep: number;
  partName: string;
  dimensions?: string | null;
  productionOrderRef: string;
}

export interface BarcodeInfo {
  barcode: BarcodeData;
  workOrder?: unknown;
  productionOrder?: unknown;
  articlePart?: unknown;
  stepName?: string;
  stepSequence?: number | null;
  totalSteps?: number;
  departmentName?: string;
  instructions?: string | null;
  estimatedTime?: number | null;
  stepsProgress?: StepProgress[];
  // part_identifier specific fields
  articlePartId?: string;
  itemIndex?: number;
  partName?: string;
  dimensions?: string | null;
  productionOrderRef?: string;
  action?: "started" | "needs_confirmation" | "blocked" | "all_completed" | "wrong_department";
  blockingStep?: { stepName: string; stepSequence: number; departmentName: string };
  expectedDepartment?: { id: string; name: string };
  currentStep?: number;
}

export interface ProductionOrderProgress {
  totalWorkOrders: number;
  completedWorkOrders: number;
  percentage: number;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, string[]>;
}


// ─── Production system enhancement types ─────────────────

/** Deadline classification for production orders. */
export type DeadlineStatus = "overdue" | "warning" | "ok";

/**
 * Re-export CostBreakdown from calculations for convenience.
 * The canonical definition lives in lib/utils/calculations.ts.
 */
export type { CostBreakdown } from "@/lib/utils/calculations";
