/**
 * Pure utility functions for filter validation, date handling,
 * ID serialization, and order selection logic.
 */

export interface DateRange {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
}

export type PresetKey = "today" | "this_week" | "this_month" | "last_30_days";

/**
 * Returns the Monday of the week containing the given date.
 * Monday is day 1 in ISO weeks.
 */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Compute a DateRange for the given preset key.
 * Accepts an optional `now` parameter for testability.
 */
export function getPresetDateRange(preset: PresetKey, now?: Date): DateRange {
  const ref = now ?? new Date();
  switch (preset) {
    case "today":
      return { dateFrom: formatDateToISO(ref), dateTo: formatDateToISO(ref) };
    case "this_week": {
      const monday = getMonday(ref);
      return { dateFrom: formatDateToISO(monday), dateTo: formatDateToISO(ref) };
    }
    case "this_month": {
      const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
      return { dateFrom: formatDateToISO(first), dateTo: formatDateToISO(ref) };
    }
    case "last_30_days": {
      const past = new Date(ref);
      past.setDate(past.getDate() - 30);
      return { dateFrom: formatDateToISO(past), dateTo: formatDateToISO(ref) };
    }
  }
}

/**
 * Returns true if the date range is valid (from <= to), or if either is undefined.
 * Returns false only when both are defined and from is strictly after to.
 */
export function isValidDateRange(
  dateFrom: string | undefined,
  dateTo: string | undefined
): boolean {
  if (!dateFrom || !dateTo) return true;
  const from = parseDateParam(dateFrom);
  const to = parseDateParam(dateTo);
  if (!from || !to) return true; // invalid dates are ignored, not treated as error
  return from.getTime() <= to.getTime();
}

/**
 * Returns a YYYY-MM-DD string for the given Date.
 */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to a Date object.
 * Returns null if the input is undefined, null, empty, or not a valid date.
 * Validates that the parsed date matches the input (rejects e.g. Feb 30).
 */
export function parseDateParam(
  param: string | undefined | null
): Date | null {
  if (!param) return null;
  const trimmed = param.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(trimmed + "T00:00:00");
  if (isNaN(date.getTime())) return null;
  // Verify the date didn't roll over (e.g. Feb 30 → Mar 2)
  if (formatDateToISO(date) !== trimmed) return null;
  return date;
}

/**
 * Build a Prisma-compatible date filter from dateFrom/dateTo strings.
 * Returns null if both params are null/undefined.
 * gte uses start of day (T00:00:00), lte uses end of day (T23:59:59.999).
 */
export function buildDateFilter(
  dateFrom: string | null,
  dateTo: string | null
): { gte?: Date; lte?: Date } | null {
  if (!dateFrom && !dateTo) return null;
  const filter: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    filter.gte = new Date(dateFrom + "T00:00:00");
  }
  if (dateTo) {
    filter.lte = new Date(dateTo + "T23:59:59.999");
  }
  return filter;
}

/**
 * Join an array of IDs as a comma-separated string.
 */
export function serializeIds(ids: string[]): string {
  return ids.join(",");
}

/**
 * Split a comma-separated string into an array of IDs, filtering out empty strings.
 */
export function parseIds(param: string | undefined | null): string[] {
  if (!param) return [];
  return param.split(",").filter((id) => id.length > 0);
}

/**
 * Returns true if the order status allows selection for bulk actions.
 * All orders are selectable regardless of status.
 */
export function isOrderSelectable(_status: string): boolean {
  return true;
}

/**
 * Parameters for filtering production orders by status and/or date range.
 */
export interface OrderFilterParams {
  statuses?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
}

/**
 * Minimal shape required for an order to be filterable.
 */
export interface FilterableOrder {
  id: string;
  status: string;
  createdAt: Date | string;
}

/**
 * Filter orders by status and/or date range.
 * - Empty/undefined `statuses` → no status filter
 * - Empty/undefined dates → no date filter
 * - Filters combine with AND logic
 */
export function filterOrders<T extends FilterableOrder>(
  orders: T[],
  params: OrderFilterParams
): T[] {
  const { statuses, dateFrom, dateTo } = params;

  const hasStatusFilter = statuses && statuses.length > 0;
  const dateFilter = buildDateFilter(
    dateFrom ?? null,
    dateTo ?? null
  );

  return orders.filter((order) => {
    // Status filter
    if (hasStatusFilter && !statuses.includes(order.status)) {
      return false;
    }

    // Date filter
    if (dateFilter) {
      const orderDate =
        order.createdAt instanceof Date
          ? order.createdAt
          : new Date(order.createdAt);

      if (dateFilter.gte && orderDate < dateFilter.gte) {
        return false;
      }
      if (dateFilter.lte && orderDate > dateFilter.lte) {
        return false;
      }
    }

    return true;
  });
}
