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
       who sells it and at what price. Category, Product Pricing and Unit of
       Measure are supporting masters and trail the five. */
    items: [
      { label: "Business Partner", href: "/m/business-partner", icon: "partner" },
      { label: "Product", href: "/m/product", icon: "product" },
      { label: "Warehouse", href: "/m/warehouse", icon: "warehouse" },
      { label: "Sales Rep", href: "/m/sales-rep", icon: "salesRep" },
      { label: "Price List", href: "/m/price-list", icon: "priceList" },
      { label: "Category", href: "/m/category", icon: "category" },
      { label: "Product Pricing", href: "/pricing", icon: "pricing" },
      {
        label: "Unit of Measure",
        href: "/soon?m=Unit%20of%20Measure",
        icon: "uom",
        soon: true,
      },
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
      { label: "QC Inspection", href: "/m/qc-inspection", icon: "qc" },
      { label: "Put Away", href: "/m/put-away", icon: "putAway" },
      {
        label: "Supplier Claim",
        href: "/soon?m=Supplier%20Claim",
        icon: "shield",
        soon: true,
      },
    ],
  },
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
      { label: "Promotion", href: "/soon?m=Promotion", icon: "promotion", soon: true },
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
    label: "Settings",
    items: [
      {
        label: "Company Profile",
        href: "/soon?m=Company%20Profile",
        icon: "company",
        soon: true,
      },
      { label: "User & Role", href: "/soon?m=User%20%26%20Role", icon: "users", soon: true },
      {
        label: "System Settings",
        href: "/soon?m=System%20Settings",
        icon: "settings",
        soon: true,
      },
    ],
  },
];

/** Flat lookup for breadcrumbs and workspace deep links. */
export const NAV_INDEX = NAV.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.label })),
);

export const findNav = (href: string) =>
  NAV_INDEX.find((i) => i.href === href || href.startsWith(i.href + "/"));
