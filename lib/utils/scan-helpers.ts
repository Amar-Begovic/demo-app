const SUCCESS_ACTIONS = ["started", "completed", "needs_confirmation", "all_completed", "packaging_scan", "packaging_completed"];
const ERROR_ACTIONS = ["blocked", "wrong_department"];

export function determineFeedbackState(
  action: string,
  httpStatus?: number
): "success" | "error" | "idle" {
  if (httpStatus && httpStatus >= 400) return "error";
  if (SUCCESS_ACTIONS.includes(action)) return "success";
  if (ERROR_ACTIONS.includes(action)) return "error";
  return "idle";
}

export function formatElapsedTime(startTime: Date, currentTime: Date): string {
  const diffMs = Math.max(0, currentTime.getTime() - startTime.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}

export function shouldActivateCamera(
  deptParam: string | null,
  departmentParam: string | null
): boolean {
  return !!(deptParam?.length || departmentParam?.length);
}

export function buildScanRequestBody(
  barcodeValue: string,
  departmentId: string | undefined
): { value: string; departmentId?: string } {
  const body: { value: string; departmentId?: string } = { value: barcodeValue };
  if (departmentId) {
    body.departmentId = departmentId;
  }
  return body;
}
