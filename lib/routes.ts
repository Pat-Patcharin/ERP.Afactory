import { NAV_INDEX } from "./nav";

/**
 * Workspace data refers to destinations by their human page name
 * ("Purchase Request", "Approval Center"). This resolves those to a route,
 * falling back to the named placeholder for modules the roadmap still covers.
 */
const EXTRA: Record<string, string> = {
  "Sales Representative": "/m/sales-rep",
  "Product Pricing": "/pricing",
  "Purchase Workspace": "/purchase",
  "Outbound Workspace": "/outbound",
};

export function pageHref(page: string): string {
  if (EXTRA[page]) return EXTRA[page];
  const hit = NAV_INDEX.find((n) => n.label === page);
  if (hit && !hit.soon) return hit.href;
  return `/soon?m=${encodeURIComponent(page)}`;
}
