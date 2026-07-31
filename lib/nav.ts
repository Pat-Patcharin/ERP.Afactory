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
    items: [
      { label: "Product", href: "/m/product", icon: "product" },
      { label: "Category", href: "/m/category", icon: "category" },
      { label: "Business Partner", href: "/m/business-partner", icon: "partner" },
      { label: "Warehouse", href: "/m/warehouse", icon: "warehouse" },
      { label: "Sales Rep", href: "/m/sales-rep", icon: "salesRep" },
      { label: "Price List", href: "/m/price-list", icon: "priceList" },
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
    ],
  },
  {
    label: "Outbound",
    items: [
      { label: "Outbound Workspace", href: "/outbound", icon: "outbound" },
      {
        label: "Sales Request",
        href: "/soon?m=Sales%20Request",
        icon: "salesRequest",
        soon: true,
      },
      { label: "Sales Order", href: "/soon?m=Sales%20Order", icon: "salesOrder", soon: true },
      { label: "Picking", href: "/soon?m=Picking", icon: "picking", soon: true },
      { label: "Packing", href: "/soon?m=Packing", icon: "packing", soon: true },
      {
        label: "Delivery Order",
        href: "/soon?m=Delivery%20Order",
        icon: "delivery",
        soon: true,
      },
      { label: "Invoice", href: "/soon?m=Invoice", icon: "invoice", soon: true },
      { label: "Return", href: "/soon?m=Return", icon: "return", soon: true },
      {
        label: "Credit Note",
        href: "/soon?m=Credit%20Note",
        icon: "creditNote",
        soon: true,
      },
    ],
  },
  {
    label: "Other",
    items: [
      { label: "Promotion", href: "/soon?m=Promotion", icon: "promotion", soon: true },
      { label: "Reports", href: "/soon?m=Reports", icon: "reports", soon: true },
      { label: "Settings", href: "/soon?m=Settings", icon: "settings", soon: true },
    ],
  },
];

/** Flat lookup for breadcrumbs and workspace deep links. */
export const NAV_INDEX = NAV.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.label })),
);

export const findNav = (href: string) =>
  NAV_INDEX.find((i) => i.href === href || href.startsWith(i.href + "/"));
