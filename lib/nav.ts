import type { IconName } from "./icons";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Module not built yet — routes to the placeholder page. */
  soon?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Sidebar structure. Built modules point at a real route; the rest route to
 * /soon, which names the module rather than dead-ending on a 404.
 */
export const NAV: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }],
  },
  {
    label: "Master Data",
    /* Ordered by how often the business opens them, not alphabetically:
       partners first, then the item master, then where stock lives, then
       who sells it.

       Category has no screen of its own — a category is picked while
       creating a product, and a master list for a plain option set was
       more navigation than it was worth. */
    items: [
      { label: "Business Partner", href: "/m/business-partner", icon: "partner" },
      { label: "Product", href: "/m/product", icon: "product" },
      { label: "Warehouse", href: "/m/warehouse", icon: "warehouse" },
      { label: "Sales Rep", href: "/m/sales-rep", icon: "salesRep" },
      /* The four pricing masters are HIDDEN, not removed.

         Price Policy, Price List Master, Product Pricing and Unit of Measure
         are parked until they are wanted. Everything behind them still runs:
         the price master still resolves what a customer pays, the tier rules
         still decide it, and every document that quotes a price still reads
         the same source. What is gone is the way in from the sidebar.

         Same treatment as the Inventory group below — put these four lines
         back and nothing else has to change.

      { label: "Price Policy", href: "/m/price-list", icon: "priceList" },
      { label: "Price List Master", href: "/m/price-list-master", icon: "pricing" },
      { label: "Product Pricing", href: "/pricing", icon: "pricing" },
      {
        label: "Unit of Measure",
        href: "/soon?m=Unit%20of%20Measure",
        icon: "uom",
        soon: true,
      },
      */
    ],
  },
  {
    label: "Purchase",
    items: [
      { label: "Purchase Workspace", href: "/purchase", icon: "workspace" },
      {
        label: "Purchase Request",
        href: "/m/purchase-request",
        icon: "purchaseRequest",
      },
      { label: "Purchase Order", href: "/m/purchase-order", icon: "purchaseOrder" },
      { label: "Goods Receipt", href: "/m/goods-receipt", icon: "goodsReceipt" },
      /* QC Inspection and Supplier Claim are HIDDEN, not removed.

         Both are still wired: a receipt whose lines need inspection still
         goes to Pending QC, and the QC decision is still taken from the
         Goods Receipt screen. What is gone is the menu entry, until the two
         are wanted on the sidebar again — put these lines back and nothing
         else has to change. */
      /* No Put Away.

         It asked which bin each line went into, and a warehouse in this
         system has no bins to answer with — the master stopped asking for a
         Zone › Rack › Shelf › Bin layout, so the suggestion was always blank
         and the step was data entry with nothing downstream reading it.
         Receiving now ends at the goods receipt: what is received is
         available. The module and its history are still in the codebase;
         putting the entry back here is what turns it on again. */
    ],
  },
  /* The whole INVENTORY group is HIDDEN, not removed.

     Nine screens that are built and working, parked while the inbound and
     outbound flows are being walked. Every route still resolves, every
     figure they produce is still computed, and the dashboard still reports
     them — what is gone is the way in from the sidebar.

     To bring it back, restore the group below. Nothing else has to change.

  {
    label: "Inventory",
    items: [
      { label: "Inventory Workspace", href: "/inventory", icon: "warehouse" },
      { label: "Stock Inquiry", href: "/m/stock-inquiry", icon: "search" },
      { label: "Stock Card", href: "/m/stock-card", icon: "file" },
      { label: "Stock Transfer", href: "/m/stock-transfer", icon: "truck" },
      { label: "Stock Adjustment", href: "/m/stock-adjustment", icon: "sliders" },
      { label: "Cycle Count", href: "/m/cycle-count", icon: "checkCircle" },
      { label: "Lot Tracking", href: "/m/lot-tracking", icon: "layers" },
      { label: "Serial Tracking", href: "/m/serial-tracking", icon: "barcode" },
      { label: "Barcode Lookup", href: "/barcode", icon: "barcode" },
    ],
  },
  */
  {
    label: "Outbound",
    items: [
      { label: "Outbound Workspace", href: "/outbound", icon: "outbound" },
      { label: "Quotation", href: "/m/quotation", icon: "quotation" },
      { label: "Sales Request", href: "/m/sales-request", icon: "salesRequest" },
      { label: "Sales Order", href: "/m/sales-order", icon: "salesOrder" },
      { label: "Picking", href: "/m/picking", icon: "picking" },
      { label: "Packing", href: "/m/packing", icon: "packing" },
      { label: "Delivery Order", href: "/m/delivery-order", icon: "delivery" },
      { label: "Sales Invoice", href: "/m/sales-invoice", icon: "invoice" },
      { label: "Shipment", href: "/m/shipment", icon: "truck" },
      { label: "Sales Return", href: "/m/sales-return", icon: "return" },
      { label: "Credit Note", href: "/m/credit-note", icon: "creditNote" },
      /* The list, now that there is one. The type chooser sits at
         /promotion/new and the list's Create button is what opens it —
         picking a kind is the first step of creating one, not a
         destination somebody navigates to on its own. */
      { label: "Promotion", href: "/m/promotion", icon: "promotion" },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Accounts Receivable",
        href: "/soon?m=Accounts%20Receivable",
        icon: "invoice",
        soon: true,
      },
      {
        label: "Accounts Payable",
        href: "/soon?m=Accounts%20Payable",
        icon: "creditNote",
        soon: true,
      },
      {
        label: "Payment Receipt",
        href: "/soon?m=Payment%20Receipt",
        icon: "pricing",
        soon: true,
      },
      {
        label: "General Ledger",
        href: "/soon?m=General%20Ledger",
        icon: "file",
        soon: true,
      },
    ],
  },
  {
    label: "Service",
    items: [
      {
        label: "Service Request",
        href: "/soon?m=Service%20Request",
        icon: "file",
        soon: true,
      },
      {
        label: "Repair Order",
        href: "/soon?m=Repair%20Order",
        icon: "sliders",
        soon: true,
      },
      {
        label: "Warranty Claim",
        href: "/soon?m=Warranty%20Claim",
        icon: "shield",
        soon: true,
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        label: "Inventory Reports",
        href: "/soon?m=Inventory%20Reports",
        icon: "reports",
        soon: true,
      },
      {
        label: "Sales Reports",
        href: "/soon?m=Sales%20Reports",
        icon: "reports",
        soon: true,
      },
      {
        label: "Purchase Reports",
        href: "/soon?m=Purchase%20Reports",
        icon: "reports",
        soon: true,
      },
    ],
  },
  {
    label: "Administration",
    /* The system configuration centre. Company Profile, User & Role and
       System Settings used to be `soon` placeholders under Settings — they
       are these screens now, so the placeholder group is gone. */
    items: [
      { label: "Administration Workspace", href: "/admin", icon: "workspace" },
      { label: "User Management", href: "/m/admin-user", icon: "users" },
      { label: "Role Management", href: "/m/admin-role", icon: "shield" },
      { label: "Permission Matrix", href: "/admin/permissions", icon: "grid" },
      { label: "Data Scope", href: "/m/admin-scope", icon: "lock" },
      { label: "Approval Workflow", href: "/m/admin-workflow", icon: "checkCircle" },
      { label: "Number Series", href: "/m/admin-series", icon: "tag" },
      { label: "Company Settings", href: "/admin/company", icon: "company" },
      { label: "Notification Settings", href: "/admin/notifications", icon: "bell" },
      { label: "Document Templates", href: "/admin/templates", icon: "printer" },
      { label: "Audit Log", href: "/m/admin-audit", icon: "file" },
    ],
  },
];

/** Flat lookup for breadcrumbs and workspace deep links. */
export const NAV_INDEX = NAV.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.label })),
);

export const findNav = (href: string) =>
  NAV_INDEX.find((i) => i.href === href || href.startsWith(i.href + "/"));

/** Every section that can be folded away — the unlabelled first group cannot. */
export const NAV_GROUP_LABELS = NAV.map((g) => g.label).filter(
  (l): l is string => Boolean(l),
);

/* ============================================================
   SECTIONS SOMEBODY HAS FOLDED AWAY

   Nine sections and sixty destinations is a long scroll for a
   warehouse clerk who opens four of them. Which ones are folded
   is a preference about this person's day, so it outlives the
   page — and it is stored by label rather than by index, so
   adding a section to NAV does not silently fold a different one.

   Best-effort, like the form drafts: private mode and a full
   quota both degrade to "everything open", which is the state
   the sidebar had before this existed.
   ============================================================ */

const NAV_COLLAPSED_KEY = "afactory:nav:collapsed";

export function readCollapsedGroups(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NAV_COLLAPSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    /* Labels that no longer exist are dropped rather than kept as dead
       entries — a renamed section reappears open, which is the safe way
       round. */
    return parsed.filter((l): l is string => typeof l === "string" && NAV_GROUP_LABELS.includes(l));
  } catch {
    return [];
  }
}

export function writeCollapsedGroups(labels: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify(labels));
  } catch {
    /* storage unavailable — the preference was best-effort anyway */
  }
}
