import type { BadgeTone } from "./types";

/** Status → tone maps. One place to change how a state reads across the app. */

export const STATUS_TONE: Record<string, BadgeTone> = {
  Active: "success",
  Draft: "warning",
  Inactive: "neutral",
};

export const REG_TONE: Record<string, BadgeTone> = {
  Active: "success",
  Expiring: "warning",
  Expired: "danger",
  Pending: "info",
};

export const BP_TONE: Record<string, BadgeTone> = {
  Active: "success",
  Inactive: "neutral",
  "On Hold": "warning",
  Blocked: "danger",
  Draft: "warning",
};

export const CREDIT_TONE: Record<string, BadgeTone> = {
  Normal: "success",
  "Near Limit": "warning",
  "Over Limit": "danger",
  "Credit Hold": "danger",
  "Not Applicable": "neutral",
};

export const WH_TYPE_TONE: Record<string, BadgeTone> = {
  "Main Warehouse": "info",
  "Cold Storage": "info",
  Returns: "warning",
  Quarantine: "danger",
  Transit: "neutral",
  "Branch Warehouse": "neutral",
  Service: "neutral",
  Consignment: "neutral",
  Manufacturing: "neutral",
  Other: "neutral",
};

export const PR_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  "Pending Approval": "warning",
  Approved: "success",
  Rejected: "danger",
  Converted: "info",
  Cancelled: "neutral",
};

export const PRIORITY_TONE: Record<string, BadgeTone> = {
  Low: "neutral",
  Normal: "neutral",
  Medium: "warning",
  High: "warning",
  Critical: "danger",
};

export const PO_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Open: "info",
  "Partial Received": "warning",
  Completed: "success",
  Cancelled: "neutral",
  Closed: "neutral",
  Overdue: "danger",
};

export const GR_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Waiting: "info",
  Partial: "warning",
  "Pending QC": "warning",
  "Ready for Put Away": "info",
  Completed: "success",
  Cancelled: "neutral",
};

export const GR_QC_TONE: Record<string, BadgeTone> = {
  "Not Required": "neutral",
  Pending: "warning",
  "In Inspection": "info",
  Passed: "success",
  Failed: "danger",
  "Partial Pass": "warning",
};

export const QC_TONE: Record<string, BadgeTone> = {
  Waiting: "info",
  "In Progress": "warning",
  Hold: "neutral",
  Completed: "success",
  Cancelled: "neutral",
};

export const QC_RESULT_TONE: Record<string, BadgeTone> = {
  Pending: "neutral",
  Pass: "success",
  "Partial Pass": "warning",
  Fail: "danger",
};

export const PA_TONE: Record<string, BadgeTone> = {
  Waiting: "info",
  Assigned: "warning",
  "In Progress": "warning",
  Completed: "success",
  Cancelled: "neutral",
};

export const SR_TONE: Record<string, BadgeTone> = {
  Active: "success",
  Inactive: "neutral",
  "On Leave": "warning",
  Resigned: "danger",
};

/* ---------- Outbound ---------- */

/** Quotation — the optional price offer sent to the customer. */
export const QT_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Sent: "info",
  Accepted: "success",
  Rejected: "danger",
  Expired: "danger",
  Converted: "info",
  Cancelled: "neutral",
};

/** Sales Request — internal approval. Named SRQ so it never reads as Sales Rep. */
export const SRQ_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Submitted: "warning",
  Approved: "success",
  Rejected: "danger",
  Converted: "info",
  Cancelled: "neutral",
};

export const SO_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Confirmed: "info",
  "On Hold": "danger",
  Picking: "warning",
  "Partially Delivered": "warning",
  Completed: "success",
  Cancelled: "neutral",
};

export const PICK_TONE: Record<string, BadgeTone> = {
  Waiting: "info",
  Assigned: "warning",
  "In Progress": "warning",
  Completed: "success",
  Cancelled: "neutral",
};

export const PICK_LINE_TONE: Record<string, BadgeTone> = {
  Pending: "neutral",
  Picked: "success",
  Short: "warning",
  Substituted: "info",
};

export const PACK_TONE: Record<string, BadgeTone> = {
  Waiting: "info",
  "In Progress": "warning",
  Completed: "success",
  Cancelled: "neutral",
};

/** Sales Return document status. */
export const RTN_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Submitted: "info",
  "Pending Approval": "warning",
  Approved: "success",
  "Partially Approved": "warning",
  Authorized: "info",
  "Waiting Return": "info",
  "Partially Received": "warning",
  Received: "success",
  "Pending QC": "warning",
  "QC Completed": "success",
  "Disposition Pending": "warning",
  "Disposition Completed": "success",
  "Credit Note Pending": "warning",
  Credited: "success",
  Closed: "neutral",
  Rejected: "danger",
  Cancelled: "neutral",
};

/** Approval / receiving / QC / disposition / credit — the five side dimensions. */
export const RTN_APPROVAL_TONE: Record<string, BadgeTone> = {
  "Not Submitted": "neutral",
  "Pending Approval": "warning",
  Approved: "success",
  "Partially Approved": "warning",
  Rejected: "danger",
  "Revision Requested": "warning",
};

export const RTN_RECEIVING_TONE: Record<string, BadgeTone> = {
  "Not Applicable": "neutral",
  "Waiting Return": "info",
  "Partially Received": "warning",
  Received: "success",
};

export const RTN_QC_TONE: Record<string, BadgeTone> = {
  "Not Applicable": "neutral",
  "Pending QC": "warning",
  "In Progress": "warning",
  "QC Completed": "success",
};

export const RTN_DISPOSITION_TONE: Record<string, BadgeTone> = {
  "Not Applicable": "neutral",
  "Disposition Pending": "warning",
  "Disposition Completed": "success",
};

export const RTN_CREDIT_TONE: Record<string, BadgeTone> = {
  "Not Applicable": "neutral",
  "Not Required": "neutral",
  Pending: "warning",
  Credited: "success",
};

/** Shipment document status. */
export const SHP_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  "Ready to Dispatch": "info",
  Dispatched: "warning",
  "In Transit": "warning",
  "Out for Delivery": "warning",
  Delivered: "success",
  "Partially Delivered": "warning",
  "Delivery Failed": "danger",
  Rescheduled: "warning",
  Returned: "danger",
  Cancelled: "neutral",
  Exception: "danger",
};

/** Delivery status is tracked separately from the shipment document status. */
export const DLV_TONE: Record<string, BadgeTone> = {
  Pending: "neutral",
  Ready: "info",
  Dispatched: "warning",
  "In Transit": "warning",
  "Out for Delivery": "warning",
  Delivered: "success",
  "Partially Delivered": "warning",
  Failed: "danger",
  Rescheduled: "warning",
  Returned: "danger",
  Cancelled: "neutral",
};

/** Sales Invoice document status. */
export const INV_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  "Pending Review": "warning",
  Approved: "info",
  Issued: "success",
  "Partially Paid": "warning",
  Paid: "success",
  Overdue: "danger",
  Cancelled: "neutral",
  Void: "danger",
  Credited: "info",
};

/** Payment status is derived from paid amount against the total. */
export const PAY_TONE: Record<string, BadgeTone> = {
  Unpaid: "warning",
  "Partially Paid": "info",
  Paid: "success",
  Overdue: "danger",
  "Written Off": "neutral",
};

export const DO_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Ready: "info",
  Shipped: "warning",
  Delivered: "success",
  Failed: "danger",
  Cancelled: "neutral",
};

export const PL_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Active: "success",
  Inactive: "neutral",
  Expired: "danger",
};

export const PL_TYPE_TONE: Record<string, BadgeTone> = {
  Standard: "neutral",
  Clinic: "info",
  Dealer: "info",
  Government: "info",
  "Chain Clinic": "info",
  Promotion: "warning",
  Tender: "warning",
  Contract: "success",
  Custom: "neutral",
};

/** Safe lookup — an unmapped status still renders, just neutrally. */
export const tone = (map: Record<string, BadgeTone>, key: string): BadgeTone =>
  map[key] ?? "neutral";
