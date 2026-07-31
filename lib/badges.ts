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

/** Sales Request (quotation). Named SRQ so it never reads as Sales Rep. */
export const SRQ_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Sent: "info",
  Accepted: "success",
  Rejected: "danger",
  Expired: "danger",
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
