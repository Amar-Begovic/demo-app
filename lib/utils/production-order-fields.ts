/**
 * Status-based field editability for production order items.
 *
 * Determines which item fields can be edited based on the
 * current status of the parent production order.
 */

export interface EditableFields {
  articleId: boolean;
  quantity: boolean;
  fabricId: boolean;
  ruckaId: boolean;
  paspulId: boolean;
  nogice1Id: boolean;
  nogice2Id: boolean;
  priority: boolean;
  deliveryDeadline: boolean;
  notes: boolean;
  customerOrderNumber: boolean;
  loadingNumber: boolean;
  loadingSequence: boolean;
  serialNumber: boolean;
  step: boolean;
}

const ALL_EDITABLE: EditableFields = {
  articleId: true,
  quantity: true,
  fabricId: true,
  ruckaId: true,
  paspulId: true,
  nogice1Id: true,
  nogice2Id: true,
  priority: true,
  deliveryDeadline: true,
  notes: true,
  customerOrderNumber: true,
  loadingNumber: true,
  loadingSequence: true,
  serialNumber: true,
  step: true,
};

const RESTRICTED: EditableFields = {
  articleId: true,
  quantity: true,
  fabricId: true,
  ruckaId: true,
  paspulId: true,
  nogice1Id: true,
  nogice2Id: true,
  priority: false,
  deliveryDeadline: true,
  notes: true,
  customerOrderNumber: true,
  loadingNumber: true,
  loadingSequence: true,
  serialNumber: true,
  step: true,
};

const NONE_EDITABLE: EditableFields = {
  articleId: false,
  quantity: false,
  fabricId: false,
  ruckaId: false,
  paspulId: false,
  nogice1Id: false,
  nogice2Id: false,
  priority: false,
  deliveryDeadline: false,
  notes: false,
  customerOrderNumber: false,
  loadingNumber: false,
  loadingSequence: false,
  serialNumber: false,
  step: false,
};

/**
 * Mapping from production order status to editable fields.
 *
 * - draft / waiting_material → all fields editable
 * - ready / in_progress → category fields (fabricId, ruckaId, paspulId, nogice1Id, nogice2Id, step),
 *   deliveryDeadline, notes, customerOrderNumber, loadingNumber, loadingSequence, serialNumber
 *   (articleId, quantity, and priority remain read-only)
 * - completed / unknown → no fields editable
 */
export const EDITABLE_FIELDS_BY_STATUS: Record<string, EditableFields> = {
  draft: ALL_EDITABLE,
  waiting_material: ALL_EDITABLE,
  ready: RESTRICTED,
  in_progress: RESTRICTED,
  completed: NONE_EDITABLE,
};

/**
 * Returns which fields are editable for a given production order status.
 * Unknown statuses default to no fields editable.
 */
export function getEditableFields(status: string): EditableFields {
  return EDITABLE_FIELDS_BY_STATUS[status] ?? NONE_EDITABLE;
}
