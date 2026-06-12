/**
 * Pure utility functions for filtering packaging order reports,
 * computing packaging progress, and extracting component types.
 */

export type PackagingCompletionStatus =
  | "all"
  | "fully_packed"
  | "partially_packed"
  | "not_started";

export interface PackagingFilterParams {
  customerName?: string;
  orderNumber?: string;
  completionStatus?: PackagingCompletionStatus;
  componentTypes?: string[];
}

export interface PackagingOrderReport {
  orderId: string;
  orderNumber: number;
  status: string;
  customerName: string | null;
  createdAt: string;
  totalItems: number;
  packedItems: number;
  isFullyPacked: boolean;
  items: Array<{
    itemIndex: number;
    articleName: string;
    articleCode: string | null;
    serialNumber: string | null;
    components: Array<{
      name: string;
      scanned: boolean;
      scannedAt: string | null;
    }>;
    allComponentsScanned: boolean;
    itemCompleted: boolean;
    hasProductBarcode: boolean;
  }>;
}

/**
 * Filter packaging orders using AND logic across all active filter criteria.
 *
 * - customerName: case-insensitive partial match; orders with null customerName
 *   are excluded when this filter is active
 * - orderNumber: string-contains match on the order number
 * - completionStatus: classifies orders as fully_packed, partially_packed, or not_started
 * - componentTypes: includes orders that have at least one item with a matching component name
 */
export function filterPackagingOrders(
  orders: PackagingOrderReport[],
  params: PackagingFilterParams
): PackagingOrderReport[] {
  const { customerName, orderNumber, completionStatus, componentTypes } = params;

  return orders.filter((order) => {
    // Customer name filter: case-insensitive partial match
    if (customerName && customerName.length > 0) {
      if (order.customerName === null) return false;
      if (!order.customerName.toLowerCase().includes(customerName.toLowerCase())) {
        return false;
      }
    }

    // Order number filter: string-contains match
    if (orderNumber && orderNumber.length > 0) {
      if (!order.orderNumber.toString().includes(orderNumber)) {
        return false;
      }
    }

    // Completion status filter
    if (completionStatus && completionStatus !== "all") {
      if (completionStatus === "fully_packed" && !order.isFullyPacked) {
        return false;
      }
      if (
        completionStatus === "partially_packed" &&
        !(order.packedItems > 0 && !order.isFullyPacked)
      ) {
        return false;
      }
      if (completionStatus === "not_started" && order.packedItems !== 0) {
        return false;
      }
    }

    // Component types filter: at least one item has a matching component name
    if (componentTypes && componentTypes.length > 0) {
      const hasMatch = order.items.some((item) =>
        item.components.some((comp) => componentTypes.includes(comp.name))
      );
      if (!hasMatch) return false;
    }

    return true;
  });
}

/**
 * Compute overall packaging progress across the given orders.
 * Returns totalItems, packedItems, and percentage (rounded to nearest integer).
 * Percentage is 0 when totalItems is 0.
 */
export function computePackagingProgress(orders: PackagingOrderReport[]): {
  totalItems: number;
  packedItems: number;
  percentage: number;
} {
  let totalItems = 0;
  let packedItems = 0;

  for (const order of orders) {
    totalItems += order.totalItems;
    packedItems += order.packedItems;
  }

  const percentage =
    totalItems === 0 ? 0 : Math.round((packedItems / totalItems) * 100);

  return { totalItems, packedItems, percentage };
}

/**
 * Extract unique, sorted component names from all orders' items' components.
 */
export function getAvailableComponentTypes(
  orders: PackagingOrderReport[]
): string[] {
  const names = new Set<string>();

  for (const order of orders) {
    for (const item of order.items) {
      for (const comp of item.components) {
        names.add(comp.name);
      }
    }
  }

  return Array.from(names).sort();
}
