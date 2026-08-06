/* ============================================================
   ADMINISTRATION — the system configuration dataset.

   This is the only file that names roles, users and defaults.
   The framework in lib/domain/admin.ts reads it and answers
   every "may I?" question the rest of the ERP asks; no module
   ever names a role.

   The five roles below are DEFAULTS, not a fixed set — a
   deployment adds "Regional Sales Manager" or "QC Inspector"
   the same way, and nothing in the engine changes.
   ============================================================ */

/* ---------- Layer 1: what can be permissioned ---------- */

/** Every verb the matrix can grant. Order is the column order. */
export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "import",
  "print",
] as const;

export type Action = (typeof ACTIONS)[number];

export interface ModuleDef {
  key: string;
  label: string;
  group: string;
  /** Registry entity or route this module governs, for nav filtering. */
  href?: string;
  /** Read-only screens have nothing to create, approve or import. */
  actions?: Action[];
}

const RO: Action[] = ["view", "export", "print"];

/**
 * The permission targets. One row per screen a role can be granted or
 * denied — the matrix is this list crossed with ROLES.
 */
export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", group: "General", href: "/dashboard", actions: ["view"] },

  { key: "product", label: "Product", group: "Master Data", href: "/m/product" },
  { key: "business-partner", label: "Business Partner", group: "Master Data", href: "/m/business-partner" },
  { key: "warehouse", label: "Warehouse", group: "Master Data", href: "/m/warehouse" },
  { key: "sales-rep", label: "Sales Rep", group: "Master Data", href: "/m/sales-rep" },
  { key: "price-list", label: "Price Policy", group: "Master Data", href: "/m/price-list" },
  { key: "price-list-master", label: "Price List Master", group: "Master Data", href: "/m/price-list-master", actions: ["view"] },
  { key: "pricing", label: "Product Pricing", group: "Master Data", href: "/pricing" },

  { key: "purchase-workspace", label: "Purchase Workspace", group: "Purchase", href: "/purchase", actions: ["view"] },
  { key: "purchase-request", label: "Purchase Request", group: "Purchase", href: "/m/purchase-request" },
  { key: "purchase-order", label: "Purchase Order", group: "Purchase", href: "/m/purchase-order" },
  { key: "goods-receipt", label: "Goods Receipt", group: "Purchase", href: "/m/goods-receipt" },
  { key: "qc-inspection", label: "QC Inspection", group: "Purchase", href: "/m/qc-inspection" },
  { key: "put-away", label: "Put Away", group: "Purchase", href: "/m/put-away" },

  { key: "inventory-workspace", label: "Inventory Workspace", group: "Inventory", href: "/inventory", actions: ["view"] },
  { key: "stock-inquiry", label: "Stock Inquiry", group: "Inventory", href: "/m/stock-inquiry", actions: RO },
  { key: "stock-card", label: "Stock Card", group: "Inventory", href: "/m/stock-card", actions: RO },
  { key: "stock-transfer", label: "Stock Transfer", group: "Inventory", href: "/m/stock-transfer" },
  { key: "stock-adjustment", label: "Stock Adjustment", group: "Inventory", href: "/m/stock-adjustment" },
  { key: "cycle-count", label: "Cycle Count", group: "Inventory", href: "/m/cycle-count" },
  { key: "lot-tracking", label: "Lot Tracking", group: "Inventory", href: "/m/lot-tracking", actions: RO },
  { key: "serial-tracking", label: "Serial Tracking", group: "Inventory", href: "/m/serial-tracking", actions: RO },
  { key: "barcode", label: "Barcode Lookup", group: "Inventory", href: "/barcode", actions: ["view"] },

  { key: "outbound-workspace", label: "Outbound Workspace", group: "Outbound", href: "/outbound", actions: ["view"] },
  { key: "quotation", label: "Quotation", group: "Outbound", href: "/m/quotation" },
  { key: "sales-request", label: "Sales Request", group: "Outbound", href: "/m/sales-request" },
  { key: "sales-order", label: "Sales Order", group: "Outbound", href: "/m/sales-order" },
  { key: "picking", label: "Picking", group: "Outbound", href: "/m/picking" },
  { key: "packing", label: "Packing", group: "Outbound", href: "/m/packing" },
  { key: "delivery-order", label: "Delivery Order", group: "Outbound", href: "/m/delivery-order" },
  { key: "sales-invoice", label: "Sales Invoice", group: "Outbound", href: "/m/sales-invoice" },
  { key: "shipment", label: "Shipment", group: "Outbound", href: "/m/shipment" },
  { key: "sales-return", label: "Sales Return", group: "Outbound", href: "/m/sales-return" },
  { key: "credit-note", label: "Credit Note", group: "Outbound", href: "/m/credit-note" },

  { key: "finance", label: "Finance", group: "Finance", actions: ["view", "approve", "export", "print"] },
  { key: "reports", label: "Reports", group: "Reports", actions: RO },

  { key: "admin-user", label: "User Management", group: "Administration", href: "/m/admin-user" },
  { key: "admin-role", label: "Role Management", group: "Administration", href: "/m/admin-role" },
  { key: "admin-permission", label: "Permission Matrix", group: "Administration", href: "/admin/permissions", actions: ["view", "edit"] },
  { key: "admin-scope", label: "Data Scope", group: "Administration", href: "/m/admin-scope" },
  { key: "admin-workflow", label: "Approval Workflow", group: "Administration", href: "/m/admin-workflow" },
  { key: "admin-series", label: "Number Series", group: "Administration", href: "/m/admin-series" },
  { key: "admin-company", label: "Company Settings", group: "Administration", href: "/admin/company", actions: ["view", "edit"] },
  { key: "admin-notification", label: "Notification Settings", group: "Administration", href: "/admin/notifications", actions: ["view", "edit"] },
  { key: "admin-template", label: "Document Templates", group: "Administration", href: "/admin/templates", actions: ["view", "edit"] },
  { key: "admin-audit", label: "Audit Log", group: "Administration", href: "/m/admin-audit", actions: RO },
];

export const MODULE_GROUPS = [...new Set(MODULES.map((m) => m.group))];

/* ---------- Layer 2: field-level permissions ---------- */

export interface FieldDef {
  key: string;
  label: string;
  desc: string;
}

/**
 * Commercially sensitive values. A role that lacks one of these does not see
 * the field greyed out — the schema never renders it. That is the difference
 * between "you cannot change this" and "this is none of your business".
 */
export const FIELDS: FieldDef[] = [
  { key: "cost", label: "Cost", desc: "ราคาทุน ราคาซื้อล่าสุด ต้นทุนเฉลี่ย" },
  { key: "margin", label: "Margin", desc: "กำไรขั้นต้นต่อรายการ" },
  { key: "profit", label: "Profit", desc: "กำไรรวมระดับเอกสาร" },
  { key: "supplierCost", label: "Supplier Cost", desc: "ราคาที่ผู้ขายเสนอ" },
  { key: "inventoryValue", label: "Inventory Value", desc: "มูลค่าสินค้าคงคลัง" },
  { key: "credit", label: "Credit", desc: "วงเงินและยอดค้างชำระของลูกค้า" },
  { key: "bank", label: "Bank Account", desc: "เลขบัญชีธนาคารแบบเต็ม" },
  { key: "salary", label: "Payroll", desc: "ข้อมูลค่าตอบแทนพนักงาน" },
];

export const FIELD_KEYS = FIELDS.map((f) => f.key);

/* ---------- Layer 3: data scope ---------- */

export interface ScopeDef {
  code: string;
  label: string;
  desc: string;
  /** How wide it reaches — used to sort and to compare two scopes. */
  rank: number;
}

export const SCOPES: ScopeDef[] = [
  { code: "own", label: "Own Records", desc: "เฉพาะเอกสารที่ตนเองสร้าง", rank: 1 },
  { code: "ownCustomers", label: "Own Customers", desc: "เฉพาะลูกค้าที่ตนเองดูแล", rank: 2 },
  { code: "ownWarehouse", label: "Own Warehouse", desc: "เฉพาะคลังที่ได้รับมอบหมาย", rank: 2 },
  { code: "ownTeam", label: "Own Team", desc: "ลูกค้าและเอกสารของทีมตนเอง", rank: 3 },
  { code: "department", label: "Department", desc: "ทั้งแผนกของตนเอง", rank: 4 },
  { code: "company", label: "Entire Company", desc: "ทั้งบริษัท ไม่จำกัด", rank: 5 },
];

export const DEPARTMENTS = [
  "Management",
  "Sales",
  "Purchasing",
  "Warehouse",
  "Finance",
  "QC",
  "Service",
  "Administration",
] as const;

/* ---------- Roles ---------- */

export interface RoleDef {
  code: string;
  name: string;
  desc: string;
  department: string;
  /** Default data scope for users carrying this role. */
  scope: string;
  status: string;
  /** System roles cannot be deleted — deleting Super Admin locks everyone out. */
  system: boolean;
  /** Module key → the actions granted. Absent key = No Access. */
  perms: Record<string, Action[]>;
  /** Field keys this role may see. Absent = not rendered. */
  fields: string[];
  /** Wildcard: every module, every action. Only Super Admin has it. */
  all?: boolean;
  created: string;
  createdBy: string;
}

const ALL: Action[] = [...ACTIONS];
const VIEW_ONLY: Action[] = ["view", "export", "print"];
const OPERATE: Action[] = ["view", "create", "edit", "export", "print"];

const modulesIn = (...groups: string[]) => MODULES.filter((m) => groups.includes(m.group));

/** Grant the same action set across a whole group, minus the exceptions. */
function grant(actions: Action[], groups: string[], except: string[] = []) {
  const out: Record<string, Action[]> = {};
  for (const m of modulesIn(...groups)) {
    if (except.includes(m.key)) continue;
    /* Never grant an action the module does not offer. */
    const offered = m.actions ?? ALL;
    out[m.key] = actions.filter((a) => offered.includes(a));
  }
  return out;
}

export const ROLES: RoleDef[] = [
  {
    code: "SUPER_ADMIN",
    name: "Super Admin",
    desc: "ดูแลระบบทั้งหมด ตั้งค่าสิทธิ์ ผู้ใช้ และการทำงานของระบบ",
    department: "Administration",
    scope: "company",
    status: "Active",
    system: true,
    all: true,
    perms: {},
    fields: [...FIELD_KEYS],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "MANAGEMENT",
    name: "Management",
    desc: "ผู้บริหาร เห็นทุกโมดูลธุรกิจและตัวเลขกำไร แต่แก้ไขการตั้งค่าระบบไม่ได้",
    department: "Management",
    scope: "company",
    status: "Active",
    system: true,
    perms: {
      ...grant(ALL, ["General", "Master Data", "Purchase", "Inventory", "Outbound", "Finance", "Reports"]),
      /* Administration is visible but read-only — an owner may audit the
         configuration without being able to grant themselves more. */
      "admin-user": VIEW_ONLY,
      "admin-role": VIEW_ONLY,
      "admin-audit": VIEW_ONLY,
    },
    fields: ["cost", "margin", "profit", "supplierCost", "inventoryValue", "credit", "bank"],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "SALES_MANAGER",
    name: "Sales Manager",
    desc: "หัวหน้าฝ่ายขาย อนุมัติงานขายในทีม เห็นกำไรขั้นต้น",
    department: "Sales",
    scope: "ownTeam",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      ...grant(ALL, ["Outbound"]),
      ...grant(VIEW_ONLY, ["Master Data"], ["pricing"]),
      pricing: ["view", "edit", "export", "print"],
      "stock-inquiry": VIEW_ONLY,
      "lot-tracking": VIEW_ONLY,
      "serial-tracking": VIEW_ONLY,
      reports: VIEW_ONLY,
    },
    fields: ["margin", "credit"],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    /* ============================================================
       THE DESK BETWEEN THE REP AND THE MANAGER

       Every outbound approval used to need a manager, because the
       only roles holding `approve` on a quotation were the sales
       manager, management and the super admin. So the person who
       actually runs the paperwork all day — checks the order, signs
       off the ordinary price, confirms the partner, pushes it to
       the warehouse — had to interrupt a manager to do any of it.

       This role is that desk. It signs everything routine. What it
       deliberately does NOT get is the manager's signature on a
       price below `price_last`: it is absent from MANAGER_ROLES in
       workflows-outbound.tsx, so `maySignAt("manager")` refuses it
       and says who to send it to. That refusal is the whole reason
       the role exists as a separate one rather than as a wider
       SALES_REP.

       No cost, no margin, no profit — `fields: []`. Running the
       paperwork does not require knowing what the company makes on
       it, and this role is held by the most people.
       ============================================================ */
    code: "SALES_ADMIN",
    name: "Sales Admin",
    desc: "แอดมินฝ่ายขาย รับออเดอร์ อนุมัติเอกสารขายราคาปกติ คุมงานส่งของและวางบิล ไม่เห็นต้นทุนและกำไร",
    department: "Sales",
    scope: "department",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      /* The whole sell side, including picking, packing, delivery,
         invoicing and credit notes — those are this desk's daily work. */
      ...grant(ALL, ["Outbound"]),
      /* Confirming a partner the rep raised is part of taking the order;
         deleting one is not. */
      "business-partner": ["view", "create", "edit", "approve", "export", "print"],
      ...grant(VIEW_ONLY, ["Master Data"], ["business-partner"]),
      "stock-inquiry": VIEW_ONLY,
      "lot-tracking": VIEW_ONLY,
      "serial-tracking": VIEW_ONLY,
      reports: VIEW_ONLY,
    },
    fields: [],
    created: "01/08/2569",
    createdBy: "พิมพกา สุขใจ",
  },
  {
    code: "PURCHASE_MANAGER",
    name: "Purchase Manager",
    desc: "หัวหน้าฝ่ายจัดซื้อ อนุมัติใบขอซื้อและใบสั่งซื้อ เห็นราคาทุน",
    department: "Purchasing",
    scope: "department",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      ...grant(ALL, ["Purchase"]),
      ...grant(VIEW_ONLY, ["Master Data"]),
      "business-partner": OPERATE,
      "stock-inquiry": VIEW_ONLY,
      "inventory-workspace": ["view"],
      reports: VIEW_ONLY,
    },
    fields: ["cost", "supplierCost", "inventoryValue"],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "WAREHOUSE_MANAGER",
    name: "Warehouse Manager",
    desc: "หัวหน้าคลัง อนุมัติการโอนย้ายและปรับปรุงยอด เห็นมูลค่าสต๊อก",
    department: "Warehouse",
    scope: "ownWarehouse",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      ...grant(ALL, ["Inventory"]),
      "goods-receipt": ALL,
      "qc-inspection": OPERATE,
      "put-away": ALL,
      picking: OPERATE,
      packing: OPERATE,
      shipment: OPERATE,
      product: VIEW_ONLY,
      warehouse: VIEW_ONLY,
      reports: VIEW_ONLY,
    },
    fields: ["inventoryValue"],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "FINANCE_MANAGER",
    name: "Finance Manager",
    desc: "หัวหน้าฝ่ายการเงิน อนุมัติการชำระเงินและวงเงินเครดิต เห็นข้อมูลทั้งบริษัท",
    department: "Finance",
    scope: "company",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      finance: ["view", "approve", "export", "print"],
      "sales-invoice": ALL,
      "credit-note": ALL,
      "sales-return": VIEW_ONLY,
      "sales-order": VIEW_ONLY,
      "purchase-order": VIEW_ONLY,
      "goods-receipt": VIEW_ONLY,
      "business-partner": OPERATE,
      reports: VIEW_ONLY,
      "admin-audit": VIEW_ONLY,
    },
    fields: ["cost", "margin", "profit", "credit", "bank", "inventoryValue"],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "PURCHASE_STAFF",
    name: "Purchasing Staff",
    desc: "เจ้าหน้าที่จัดซื้อ ออกใบขอซื้อและใบสั่งซื้อ แต่อนุมัติเองไม่ได้",
    department: "Purchasing",
    scope: "department",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      "purchase-workspace": ["view"],
      "purchase-request": OPERATE,
      "purchase-order": OPERATE,
      "goods-receipt": OPERATE,
      "business-partner": VIEW_ONLY,
      product: VIEW_ONLY,
      "stock-inquiry": VIEW_ONLY,
    },
    fields: ["cost", "supplierCost"],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "WAREHOUSE_STAFF",
    name: "Warehouse Staff",
    desc: "เจ้าหน้าที่คลัง รับเข้า จัดเก็บ จัดของ แต่ปรับยอดเองไม่ได้",
    department: "Warehouse",
    scope: "ownWarehouse",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      "inventory-workspace": ["view"],
      "goods-receipt": OPERATE,
      "put-away": OPERATE,
      picking: OPERATE,
      packing: OPERATE,
      "cycle-count": OPERATE,
      "stock-transfer": OPERATE,
      "stock-inquiry": VIEW_ONLY,
      "stock-card": VIEW_ONLY,
      "lot-tracking": VIEW_ONLY,
      "serial-tracking": VIEW_ONLY,
      barcode: ["view"],
      product: VIEW_ONLY,
    },
    fields: [],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "SALES_REP",
    name: "Sales Representative",
    desc: "พนักงานขาย เห็นเฉพาะลูกค้าของตนเอง ไม่เห็นต้นทุนและกำไร",
    department: "Sales",
    scope: "ownCustomers",
    status: "Active",
    system: true,
    perms: {
      dashboard: ["view"],
      "outbound-workspace": ["view"],
      quotation: OPERATE,
      "sales-request": OPERATE,
      "sales-order": OPERATE,
      shipment: VIEW_ONLY,
      "sales-invoice": VIEW_ONLY,
      "business-partner": OPERATE,
      /* Availability yes, valuation no — see the fields list. */
      "stock-inquiry": ["view"],
      "price-list": VIEW_ONLY,
      pricing: ["view"],
      product: VIEW_ONLY,
    },
    fields: [],
    created: "01/01/2567",
    createdBy: "System",
  },
  {
    code: "QC_INSPECTOR",
    name: "QC Inspector",
    desc: "ตรวจสอบคุณภาพสินค้ารับเข้า ตัวอย่างบทบาทที่สร้างเพิ่มได้เอง",
    department: "QC",
    scope: "ownWarehouse",
    status: "Active",
    system: false,
    perms: {
      dashboard: ["view"],
      "qc-inspection": ALL,
      "goods-receipt": VIEW_ONLY,
      "lot-tracking": VIEW_ONLY,
      "serial-tracking": VIEW_ONLY,
      product: VIEW_ONLY,
    },
    fields: [],
    created: "12/03/2568",
    createdBy: "คุณพิมพกา",
  },
  {
    code: "EXTERNAL_AUDITOR",
    name: "External Auditor",
    desc: "ผู้ตรวจสอบภายนอก อ่านได้อย่างเดียวทั้งระบบ",
    department: "Administration",
    scope: "company",
    status: "Inactive",
    system: false,
    perms: {
      ...grant(VIEW_ONLY, ["Master Data", "Purchase", "Inventory", "Outbound", "Reports"]),
      "admin-audit": VIEW_ONLY,
    },
    fields: ["cost", "inventoryValue"],
    created: "02/07/2569",
    createdBy: "คุณพิมพกา",
  },
];

/* ---------- Users ---------- */

export interface UserDef {
  code: string;
  username: string;
  name: string;
  email: string;
  department: string;
  roleCode: string;
  /** Overrides the role default when set. */
  scope: string;
  warehouse: string;
  salesRep: string;
  status: string;
  lastLogin: string;
  created: string;
  createdBy: string;
  /** Team a manager owns, for the ownTeam scope. */
  team: string;
  phone: string;
  note: string;
}

export const USERS: UserDef[] = [
  {
    code: "EMP001",
    username: "pimpaka.s",
    name: "พิมพกา สุขใจ",
    email: "pimpaka.s@afactory.co.th",
    department: "Administration",
    roleCode: "SUPER_ADMIN",
    scope: "company",
    warehouse: "",
    salesRep: "",
    status: "Active",
    lastLogin: "03/08/2569 08:42",
    created: "01/01/2567",
    createdBy: "System",
    team: "",
    phone: "081-111-1111",
    note: "ผู้ดูแลระบบหลัก",
  },
  {
    code: "EMP002",
    username: "somsak.k",
    name: "สมศักดิ์ กิจเจริญ",
    email: "somsak.k@afactory.co.th",
    department: "Management",
    roleCode: "MANAGEMENT",
    scope: "company",
    warehouse: "",
    salesRep: "",
    status: "Active",
    lastLogin: "03/08/2569 07:55",
    created: "01/01/2567",
    createdBy: "System",
    team: "",
    phone: "081-222-2222",
    note: "กรรมการผู้จัดการ",
  },
  {
    code: "EMP003",
    username: "somchai.j",
    name: "สมชาย ใจดี",
    email: "somchai.j@afactory.co.th",
    department: "Sales",
    roleCode: "SALES_MANAGER",
    scope: "ownTeam",
    warehouse: "",
    salesRep: "SRE001 - สมชาย ใจดี",
    status: "Active",
    lastLogin: "02/08/2569 17:20",
    created: "15/02/2567",
    createdBy: "พิมพกา สุขใจ",
    team: "Sales Team A",
    phone: "081-333-3333",
    note: "",
  },
  {
    code: "EMP004",
    username: "supavita.y",
    name: "สุภาวิตา โยธะพันธ์",
    email: "supavita.y@afactory.co.th",
    department: "Sales",
    roleCode: "SALES_REP",
    scope: "ownCustomers",
    warehouse: "",
    salesRep: "SRE002 - สุภาวิตา โยธะพันธ์",
    status: "Active",
    lastLogin: "02/08/2569 16:10",
    created: "01/03/2567",
    createdBy: "สมชาย ใจดี",
    team: "Sales Team A",
    phone: "081-444-4444",
    note: "",
  },
  {
    code: "EMP005",
    username: "nattapon.w",
    name: "ณัฐพล วงศ์ดี",
    email: "nattapon.w@afactory.co.th",
    department: "Purchasing",
    roleCode: "PURCHASE_MANAGER",
    scope: "department",
    warehouse: "",
    salesRep: "",
    status: "Active",
    lastLogin: "03/08/2569 09:05",
    created: "01/03/2567",
    createdBy: "พิมพกา สุขใจ",
    team: "",
    phone: "081-555-5555",
    note: "",
  },
  {
    code: "EMP006",
    username: "piyanart.c",
    name: "ปิยนารถ เจริญทอง",
    email: "piyanart.c@afactory.co.th",
    department: "Warehouse",
    roleCode: "WAREHOUSE_MANAGER",
    scope: "ownWarehouse",
    warehouse: "WH-BKK",
    salesRep: "",
    status: "Active",
    lastLogin: "03/08/2569 08:00",
    created: "01/04/2567",
    createdBy: "พิมพกา สุขใจ",
    team: "",
    phone: "081-666-6666",
    note: "",
  },
  {
    code: "EMP007",
    username: "kanda.p",
    name: "กานดา ประเสริฐ",
    email: "kanda.p@afactory.co.th",
    department: "Finance",
    roleCode: "FINANCE_MANAGER",
    scope: "company",
    warehouse: "",
    salesRep: "",
    status: "Active",
    lastLogin: "02/08/2569 18:40",
    created: "01/04/2567",
    createdBy: "พิมพกา สุขใจ",
    team: "",
    phone: "081-777-7777",
    note: "",
  },
  {
    code: "EMP008",
    username: "wirat.t",
    name: "วิรัตน์ ตั้งมั่น",
    email: "wirat.t@afactory.co.th",
    department: "Warehouse",
    roleCode: "WAREHOUSE_STAFF",
    scope: "ownWarehouse",
    warehouse: "WH-BKK",
    salesRep: "",
    status: "Active",
    lastLogin: "03/08/2569 08:15",
    created: "10/06/2567",
    createdBy: "ปิยนารถ เจริญทอง",
    team: "",
    phone: "081-888-8888",
    note: "",
  },
  {
    code: "EMP009",
    username: "arisa.m",
    name: "อาริสา มณีวงศ์",
    email: "arisa.m@afactory.co.th",
    department: "Purchasing",
    roleCode: "PURCHASE_STAFF",
    scope: "department",
    warehouse: "",
    salesRep: "",
    status: "Active",
    lastLogin: "01/08/2569 15:30",
    created: "10/06/2567",
    createdBy: "ณัฐพล วงศ์ดี",
    team: "",
    phone: "081-999-9999",
    note: "",
  },
  {
    code: "EMP010",
    username: "thanapon.s",
    name: "ธนพล ศรีสุข",
    email: "thanapon.s@afactory.co.th",
    department: "QC",
    roleCode: "QC_INSPECTOR",
    scope: "ownWarehouse",
    warehouse: "WH-QTY",
    salesRep: "",
    status: "Active",
    lastLogin: "02/08/2569 11:00",
    created: "12/03/2568",
    createdBy: "พิมพกา สุขใจ",
    team: "",
    phone: "082-111-2222",
    note: "",
  },
  {
    code: "EMP011",
    username: "chidtima.k",
    name: "จิตติมา แก้วใส",
    email: "chidtima.k@afactory.co.th",
    department: "Sales",
    roleCode: "SALES_REP",
    scope: "ownCustomers",
    warehouse: "",
    salesRep: "SRE004 - ปิยนารถ เจริญทอง",
    status: "Suspended",
    lastLogin: "12/06/2569 09:20",
    created: "01/09/2567",
    createdBy: "สมชาย ใจดี",
    team: "Sales Team B",
    phone: "082-333-4444",
    note: "ระงับชั่วคราว — ลาออกระหว่างพิจารณา",
  },
  {
    /* The third chair in the sales story — see DEMO_ACCOUNTS. The rep
       (EMP004) and the sales manager (EMP003) were already seeded. */
    code: "EMP013",
    username: "nicha.p",
    name: "ณิชา พงษ์เจริญ",
    email: "nicha.p@afactory.co.th",
    department: "Sales",
    roleCode: "SALES_ADMIN",
    scope: "department",
    warehouse: "",
    salesRep: "",
    status: "Active",
    lastLogin: "03/08/2569 08:30",
    created: "01/08/2569",
    createdBy: "พิมพกา สุขใจ",
    team: "Sales Support",
    phone: "082-555-6666",
    note: "แอดมินฝ่ายขาย รับออเดอร์และเดินเอกสารต่อจนถึงวางบิล",
  },
  {
    code: "EMP012",
    username: "auditor.ext",
    name: "External Auditor",
    email: "audit@partner-firm.co.th",
    department: "Administration",
    roleCode: "EXTERNAL_AUDITOR",
    scope: "company",
    warehouse: "",
    salesRep: "",
    status: "Inactive",
    lastLogin: "—",
    created: "02/07/2569",
    createdBy: "พิมพกา สุขใจ",
    team: "",
    phone: "",
    note: "เปิดใช้เฉพาะช่วงตรวจสอบประจำปี",
  },
];

export const USER_STATUS = ["Active", "Suspended", "Inactive"] as const;

/* ---------- Approval workflow ---------- */

export interface WorkflowStep {
  seq: number;
  name: string;
  roleCode: string;
  /** Approval needed only above this document value; 0 = always. */
  threshold: number;
  /** Anyone in the role may approve, or all of them must. */
  mode: string;
  slaHours: number;
}

export interface WorkflowDef {
  code: string;
  name: string;
  module: string;
  /** Which document field the thresholds compare against. */
  amountField: string;
  status: string;
  steps: WorkflowStep[];
  created: string;
  createdBy: string;
  note: string;
}

export const WORKFLOW_MODES = ["Any approver", "All approvers"] as const;

export const WORKFLOWS: WorkflowDef[] = [
  {
    code: "WF-PR-001",
    name: "Purchase Request Approval",
    module: "purchase-request",
    amountField: "amount",
    status: "Active",
    created: "01/01/2567",
    createdBy: "System",
    note: "ใบขอซื้อเกิน 100,000 ต้องผ่านผู้บริหาร",
    steps: [
      { seq: 1, name: "หัวหน้าฝ่ายจัดซื้อ", roleCode: "PURCHASE_MANAGER", threshold: 0, mode: "Any approver", slaHours: 24 },
      { seq: 2, name: "ผู้บริหาร", roleCode: "MANAGEMENT", threshold: 100_000, mode: "Any approver", slaHours: 48 },
    ],
  },
  {
    code: "WF-PO-001",
    name: "Purchase Order Approval",
    module: "purchase-order",
    amountField: "total",
    status: "Active",
    created: "01/01/2567",
    createdBy: "System",
    note: "",
    steps: [
      { seq: 1, name: "หัวหน้าฝ่ายจัดซื้อ", roleCode: "PURCHASE_MANAGER", threshold: 0, mode: "Any approver", slaHours: 24 },
      { seq: 2, name: "การเงิน", roleCode: "FINANCE_MANAGER", threshold: 200_000, mode: "Any approver", slaHours: 24 },
      { seq: 3, name: "ผู้บริหาร", roleCode: "MANAGEMENT", threshold: 500_000, mode: "Any approver", slaHours: 72 },
    ],
  },
  {
    code: "WF-SO-001",
    name: "Sales Order Approval",
    module: "sales-order",
    amountField: "total",
    status: "Active",
    created: "01/01/2567",
    createdBy: "System",
    note: "เกินวงเงินเครดิตต้องผ่านการเงิน",
    steps: [
      { seq: 1, name: "หัวหน้าฝ่ายขาย", roleCode: "SALES_MANAGER", threshold: 0, mode: "Any approver", slaHours: 8 },
      { seq: 2, name: "การเงิน (ตรวจเครดิต)", roleCode: "FINANCE_MANAGER", threshold: 300_000, mode: "Any approver", slaHours: 24 },
    ],
  },
  {
    code: "WF-CN-001",
    name: "Credit Note Approval",
    module: "credit-note",
    amountField: "totalCredit",
    status: "Active",
    created: "01/01/2567",
    createdBy: "System",
    note: "",
    steps: [
      { seq: 1, name: "หัวหน้าฝ่ายขาย", roleCode: "SALES_MANAGER", threshold: 0, mode: "Any approver", slaHours: 24 },
      { seq: 2, name: "การเงิน", roleCode: "FINANCE_MANAGER", threshold: 0, mode: "Any approver", slaHours: 24 },
    ],
  },
  {
    code: "WF-ADJ-001",
    name: "Stock Adjustment Approval",
    module: "stock-adjustment",
    amountField: "valueImpact",
    status: "Active",
    created: "01/01/2567",
    createdBy: "System",
    note: "ปรับยอดมูลค่าสูงต้องผ่านการเงินด้วย",
    steps: [
      { seq: 1, name: "หัวหน้าคลัง", roleCode: "WAREHOUSE_MANAGER", threshold: 0, mode: "Any approver", slaHours: 12 },
      { seq: 2, name: "การเงิน", roleCode: "FINANCE_MANAGER", threshold: 20_000, mode: "Any approver", slaHours: 24 },
    ],
  },
  {
    code: "WF-TRF-001",
    name: "Stock Transfer Approval",
    module: "stock-transfer",
    amountField: "requestedQty",
    status: "Active",
    created: "01/01/2567",
    createdBy: "System",
    note: "โอนเกิน 100 ชิ้นต้องอนุมัติ",
    steps: [
      { seq: 1, name: "หัวหน้าคลัง", roleCode: "WAREHOUSE_MANAGER", threshold: 100, mode: "Any approver", slaHours: 12 },
    ],
  },
  {
    code: "WF-CNT-001",
    name: "Cycle Count Approval",
    module: "cycle-count",
    amountField: "varianceValue",
    status: "Draft",
    created: "20/07/2569",
    createdBy: "พิมพกา สุขใจ",
    note: "ยังไม่เปิดใช้ — รอสรุปเกณฑ์ผลต่าง",
    steps: [
      { seq: 1, name: "หัวหน้าคลัง", roleCode: "WAREHOUSE_MANAGER", threshold: 0, mode: "Any approver", slaHours: 24 },
    ],
  },
];

/* ---------- Number series ---------- */

export interface SeriesDef {
  code: string;
  module: string;
  label: string;
  prefix: string;
  /**
   * AD | BE | None — which era the year segment is stamped in.
   *
   * Every series already issued in this dataset uses AD: PR2506-0124 was
   * raised in June 2025, not 2506 BE. The BE option exists because Thai
   * deployments commonly want it, not because anything here uses it.
   */
  yearMode: string;
  /** 2 for PR2506, 4 for INV-2026. Ignored when yearMode is None. */
  yearDigits: number;
  /**
   * Whether the separator also sits between the prefix and the year.
   * PR2506-0124 does not; INV-2026-000025 does. Both are in use, so this
   * is configured rather than guessed from the year width.
   */
  separatorAfterPrefix: boolean;
  /** Include the two-digit month. */
  useMonth: boolean;
  padding: number;
  next: number;
  /** Reset to 1 each year / month / never. */
  resetCycle: string;
  separator: string;
  status: string;
  lastIssued: string;
  updated: string;
  updatedBy: string;
}

export const YEAR_MODES = ["BE", "AD", "None"] as const;
export const RESET_CYCLES = ["Yearly", "Monthly", "Never"] as const;

export const NUMBER_SERIES: SeriesDef[] = [
  { code: "NS-PR", module: "purchase-request", label: "Purchase Request", prefix: "PR", yearMode: "AD", yearDigits: 2, separatorAfterPrefix: false, useMonth: true, padding: 4, next: 125, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "PR2506-0124", updated: "26/07/2569 10:40", updatedBy: "System" },
  { code: "NS-PO", module: "purchase-order", label: "Purchase Order", prefix: "PO", yearMode: "AD", yearDigits: 2, separatorAfterPrefix: false, useMonth: true, padding: 3, next: 125, resetCycle: "Yearly", separator: "", status: "Active", lastIssued: "PO2506124", updated: "12/06/2568 09:10", updatedBy: "System" },
  { code: "NS-GR", module: "goods-receipt", label: "Goods Receipt", prefix: "GR", yearMode: "AD", yearDigits: 2, separatorAfterPrefix: false, useMonth: true, padding: 4, next: 6, resetCycle: "Yearly", separator: "", status: "Active", lastIssued: "GR25060005", updated: "15/06/2568 16:05", updatedBy: "System" },
  { code: "NS-QC", module: "qc-inspection", label: "QC Inspection", prefix: "QC", yearMode: "AD", yearDigits: 2, separatorAfterPrefix: false, useMonth: true, padding: 4, next: 9, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "QC2506-0008", updated: "15/06/2568 16:30", updatedBy: "System" },
  { code: "NS-SO", module: "sales-order", label: "Sales Order", prefix: "SO", yearMode: "AD", yearDigits: 2, separatorAfterPrefix: false, useMonth: true, padding: 4, next: 6, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "SO2507-0005", updated: "01/07/2569 14:00", updatedBy: "System" },
  { code: "NS-INV", module: "sales-invoice", label: "Sales Invoice", prefix: "INV", yearMode: "AD", yearDigits: 4, separatorAfterPrefix: true, useMonth: false, padding: 6, next: 26, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "INV-2026-000025", updated: "28/07/2569 11:00", updatedBy: "System" },
  { code: "NS-SHP", module: "shipment", label: "Shipment", prefix: "SHP", yearMode: "AD", yearDigits: 4, separatorAfterPrefix: true, useMonth: false, padding: 6, next: 46, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "SHP-2026-000045", updated: "01/08/2569 10:15", updatedBy: "System" },
  { code: "NS-RTN", module: "sales-return", label: "Sales Return", prefix: "RTN", yearMode: "AD", yearDigits: 4, separatorAfterPrefix: true, useMonth: false, padding: 6, next: 21, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "RTN-2026-000020", updated: "22/07/2569 09:00", updatedBy: "System" },
  { code: "NS-CN", module: "credit-note", label: "Credit Note", prefix: "CN", yearMode: "AD", yearDigits: 4, separatorAfterPrefix: true, useMonth: false, padding: 6, next: 23, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "CN-2026-000022", updated: "30/05/2569 16:20", updatedBy: "System" },
  { code: "NS-TRF", module: "stock-transfer", label: "Stock Transfer", prefix: "TRF", yearMode: "AD", yearDigits: 4, separatorAfterPrefix: true, useMonth: false, padding: 6, next: 46, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "TRF-2026-000045", updated: "23/07/2569 13:00", updatedBy: "System" },
  { code: "NS-ADJ", module: "stock-adjustment", label: "Stock Adjustment", prefix: "ADJ", yearMode: "AD", yearDigits: 4, separatorAfterPrefix: true, useMonth: false, padding: 6, next: 46, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "ADJ-2026-000045", updated: "11/06/2569 10:00", updatedBy: "System" },
  { code: "NS-CNT", module: "cycle-count", label: "Cycle Count", prefix: "CNT", yearMode: "AD", yearDigits: 4, separatorAfterPrefix: true, useMonth: false, padding: 6, next: 46, resetCycle: "Yearly", separator: "-", status: "Active", lastIssued: "CNT-2026-000045", updated: "22/06/2569 15:00", updatedBy: "System" },
  { code: "NS-BP", module: "business-partner", label: "Business Partner", prefix: "BP", yearMode: "None", yearDigits: 0, separatorAfterPrefix: false, useMonth: false, padding: 6, next: 124, resetCycle: "Never", separator: "", status: "Active", lastIssued: "BP000123", updated: "22/07/2569 11:20", updatedBy: "System" },
];

/* ---------- Company settings ---------- */

export const COMPANY = {
  nameTh: "บริษัท เอ-แฟคทอรี่ จำกัด",
  nameEn: "A-Factory Co., Ltd.",
  /* Registered details, taken from the company's own letterhead artwork. */
  taxId: "0115562015713",
  branch: "สำนักงานใหญ่",
  branchNo: "00000",
  address:
    "11/20 หมู่ที่ 2 ซ.หนามแดง-บางพลี ถ.ศรีนครินทร์ ต.บางแก้ว อ.บางพลี จ.สมุทรปราการ 10540",
  phone: "099 201 0100",
  email: "contact@afactory.co.th",
  website: "www.afactory.co.th",
  line: "@afactory",
  facebook: "AFactoryCompany",
  tagline: "ALL IN · ONE",
  logo: "🏭",
  /**
   * Official logo file, served from /public — e.g. "/logo-afactory.svg".
   * Empty falls back to the built-in vector mark. This is the ONLY place to
   * change: every printed page draws its logo through it.
   */
  logoUrl: "",
  /**
   * Authorised signature and company seal, served from /public the same way
   * the logo is — e.g. "/signature-md.png", "/stamp-afactory.png".
   *
   * These belong to the company, not to a user account and not to a print
   * template: the same signature and seal appear on every document that
   * carries them, so changing them here must change all of them at once. That
   * is the same reason COMPANY_BANKS lives beside this rather than inside the
   * print config.
   *
   * Empty is a supported state, and the default one: the printed sheet falls
   * back to a blank box to sign by hand. Nothing may require these to be set.
   */
  signatureUrl: "",
  stampUrl: "",
  fiscalYearStart: "01/01",
  baseCurrency: "THB",
  vatRate: 7,
  whtRate: 3,
  timezone: "Asia/Bangkok (UTC+7)",
  dateFormat: "dd/mm/yyyy",
  yearEra: "พ.ศ. (BE)",
  decimals: 2,
  language: "ไทย / English",
};

/**
 * Company bank accounts. Printed documents quote the default one, so this
 * belongs to Company Settings rather than to any print template — changing
 * the account must change every document at once.
 */
export interface CompanyBank {
  code: string;
  bank: string;
  branch: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  currency: string;
  isDefault: boolean;
  status: string;
}

export const COMPANY_BANKS: CompanyBank[] = [
  {
    code: "CB-01",
    bank: "ธนาคารกสิกรไทย",
    branch: "สาขาบางเสาธง",
    accountNo: "064-1-36363-5",
    accountName: "บริษัท เอ-แฟคทอรี่ จำกัด",
    accountType: "กระแสรายวัน",
    currency: "THB",
    isDefault: true,
    status: "Active",
  },
  {
    code: "CB-02",
    bank: "ธนาคารกรุงเทพ",
    branch: "สาขาบางเสาธง",
    accountNo: "268-0-04714-2",
    accountName: "บริษัท เอ-แฟคทอรี่ จำกัด",
    accountType: "กระแสรายวัน",
    currency: "THB",
    isDefault: false,
    status: "Active",
  },
];

/* ---------- Notification settings ---------- */

export interface NotificationDef {
  code: string;
  label: string;
  desc: string;
  group: string;
  inApp: boolean;
  email: boolean;
  /** Roles that receive it. */
  roles: string[];
  /** Fires when the figure crosses this; 0 = event-driven. */
  threshold: number;
  unit: string;
  status: string;
}

export const NOTIFICATIONS: NotificationDef[] = [
  { code: "NT-APPROVAL", label: "Approval Request", desc: "มีเอกสารรอการอนุมัติของคุณ", group: "Approval", inApp: true, email: true, roles: ["PURCHASE_MANAGER", "SALES_MANAGER", "FINANCE_MANAGER", "WAREHOUSE_MANAGER", "MANAGEMENT"], threshold: 0, unit: "", status: "Active" },
  { code: "NT-APPROVED", label: "Approval Result", desc: "เอกสารของคุณได้รับการอนุมัติหรือถูกปฏิเสธ", group: "Approval", inApp: true, email: false, roles: [], threshold: 0, unit: "", status: "Active" },
  { code: "NT-SLA", label: "Approval Overdue", desc: "เอกสารค้างอนุมัติเกิน SLA", group: "Approval", inApp: true, email: true, roles: ["MANAGEMENT"], threshold: 24, unit: "ชั่วโมง", status: "Active" },
  { code: "NT-LOWSTOCK", label: "Low Stock", desc: "สินค้าต่ำกว่าจุดสั่งซื้อ", group: "Inventory", inApp: true, email: true, roles: ["PURCHASE_MANAGER", "WAREHOUSE_MANAGER"], threshold: 0, unit: "", status: "Active" },
  { code: "NT-EXPIRY", label: "Near Expiry", desc: "Lot ใกล้หมดอายุ", group: "Inventory", inApp: true, email: true, roles: ["WAREHOUSE_MANAGER", "QC_INSPECTOR"], threshold: 90, unit: "วัน", status: "Active" },
  { code: "NT-QCFAIL", label: "QC Failed", desc: "ผลตรวจ QC ไม่ผ่าน", group: "Inventory", inApp: true, email: true, roles: ["QC_INSPECTOR", "PURCHASE_MANAGER"], threshold: 0, unit: "", status: "Active" },
  { code: "NT-CREDIT", label: "Credit Limit Exceeded", desc: "ลูกค้าใช้เครดิตเกินวงเงิน", group: "Finance", inApp: true, email: true, roles: ["FINANCE_MANAGER", "SALES_MANAGER"], threshold: 0, unit: "", status: "Active" },
  { code: "NT-OVERDUE", label: "Overdue Invoice", desc: "ใบแจ้งหนี้เกินกำหนดชำระ", group: "Finance", inApp: true, email: true, roles: ["FINANCE_MANAGER"], threshold: 7, unit: "วัน", status: "Active" },
  { code: "NT-LATESHIP", label: "Late Shipment", desc: "การจัดส่งล่าช้ากว่ากำหนด", group: "Outbound", inApp: true, email: false, roles: ["SALES_MANAGER", "WAREHOUSE_MANAGER"], threshold: 0, unit: "", status: "Active" },
  { code: "NT-LOGIN", label: "Failed Login", desc: "พยายามเข้าสู่ระบบไม่สำเร็จหลายครั้ง", group: "Security", inApp: true, email: true, roles: ["SUPER_ADMIN"], threshold: 5, unit: "ครั้ง", status: "Active" },
];

/* ---------- Audit log ---------- */

export const AUDIT_EVENTS = [
  "Login",
  "Logout",
  "Login Failed",
  "Create",
  "Update",
  "Delete",
  "Approve",
  "Reject",
  "Print",
  "Import",
  "Export",
  "Permission Change",
] as const;

export interface AuditEntry {
  code: string;
  when: string;
  event: string;
  user: string;
  userCode: string;
  role: string;
  module: string;
  /** The record acted on, when there is one. */
  ref: string;
  detail: string;
  ip: string;
  result: string;
}

export const AUDIT_LOG: AuditEntry[] = [
  { code: "LOG-000120", when: "03/08/2569 09:05", event: "Login", user: "ณัฐพล วงศ์ดี", userCode: "EMP005", role: "Purchase Manager", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "10.0.1.24", result: "Success" },
  { code: "LOG-000119", when: "03/08/2569 08:58", event: "Approve", user: "ณัฐพล วงศ์ดี", userCode: "EMP005", role: "Purchase Manager", module: "purchase-request", ref: "PR2506-0124", detail: "อนุมัติขั้นที่ 1 — 20,550 THB", ip: "10.0.1.24", result: "Success" },
  { code: "LOG-000118", when: "03/08/2569 08:42", event: "Login", user: "พิมพกา สุขใจ", userCode: "EMP001", role: "Super Admin", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "10.0.1.10", result: "Success" },
  { code: "LOG-000117", when: "03/08/2569 08:31", event: "Login Failed", user: "chidtima.k", userCode: "EMP011", role: "Sales Representative", module: "—", ref: "", detail: "รหัสผ่านไม่ถูกต้อง (ครั้งที่ 3)", ip: "203.150.11.8", result: "Failed" },
  { code: "LOG-000116", when: "03/08/2569 08:15", event: "Login", user: "วิรัตน์ ตั้งมั่น", userCode: "EMP008", role: "Warehouse Staff", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "10.0.2.31", result: "Success" },
  { code: "LOG-000115", when: "03/08/2569 08:02", event: "Update", user: "วิรัตน์ ตั้งมั่น", userCode: "EMP008", role: "Warehouse Staff", module: "put-away", ref: "PA25060004", detail: "อัปเดตสถานะเป็น In Progress", ip: "10.0.2.31", result: "Success" },
  { code: "LOG-000114", when: "03/08/2569 07:55", event: "Login", user: "สมศักดิ์ กิจเจริญ", userCode: "EMP002", role: "Management", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "58.11.20.7", result: "Success" },
  { code: "LOG-000113", when: "02/08/2569 18:40", event: "Export", user: "กานดา ประเสริฐ", userCode: "EMP007", role: "Finance Manager", module: "sales-invoice", ref: "", detail: "ส่งออกใบแจ้งหนี้ 16 รายการ เป็น Excel", ip: "10.0.3.12", result: "Success" },
  { code: "LOG-000112", when: "02/08/2569 17:22", event: "Permission Change", user: "พิมพกา สุขใจ", userCode: "EMP001", role: "Super Admin", module: "admin-role", ref: "QC_INSPECTOR", detail: "เพิ่มสิทธิ์ approve ใน QC Inspection", ip: "10.0.1.10", result: "Success" },
  { code: "LOG-000111", when: "02/08/2569 17:20", event: "Login", user: "สมชาย ใจดี", userCode: "EMP003", role: "Sales Manager", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "10.0.4.5", result: "Success" },
  { code: "LOG-000110", when: "02/08/2569 16:45", event: "Create", user: "สุภาวิตา โยธะพันธ์", userCode: "EMP004", role: "Sales Representative", module: "sales-order", ref: "SO2507-0005", detail: "สร้างใบสั่งขาย 12,900 THB", ip: "10.0.4.9", result: "Success" },
  { code: "LOG-000109", when: "02/08/2569 16:10", event: "Login", user: "สุภาวิตา โยธะพันธ์", userCode: "EMP004", role: "Sales Representative", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "10.0.4.9", result: "Success" },
  { code: "LOG-000108", when: "02/08/2569 15:02", event: "Reject", user: "กานดา ประเสริฐ", userCode: "EMP007", role: "Finance Manager", module: "credit-note", ref: "CN-2026-000022", detail: "ปฏิเสธ — เอกสารอ้างอิงไม่ครบ", ip: "10.0.3.12", result: "Success" },
  { code: "LOG-000107", when: "02/08/2569 11:00", event: "Login", user: "ธนพล ศรีสุข", userCode: "EMP010", role: "QC Inspector", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "10.0.5.2", result: "Success" },
  { code: "LOG-000106", when: "02/08/2569 10:48", event: "Update", user: "ธนพล ศรีสุข", userCode: "EMP010", role: "QC Inspector", module: "qc-inspection", ref: "QC2506-0008", detail: "บันทึกผลตรวจ Pass 480 / Fail 20", ip: "10.0.5.2", result: "Success" },
  { code: "LOG-000105", when: "02/08/2569 09:30", event: "Print", user: "วิรัตน์ ตั้งมั่น", userCode: "EMP008", role: "Warehouse Staff", module: "picking", ref: "PK2507-0003", detail: "พิมพ์ใบจัดของ", ip: "10.0.2.31", result: "Success" },
  { code: "LOG-000104", when: "01/08/2569 15:30", event: "Login", user: "อาริสา มณีวงศ์", userCode: "EMP009", role: "Purchasing Staff", module: "—", ref: "", detail: "เข้าสู่ระบบสำเร็จ", ip: "10.0.1.44", result: "Success" },
  { code: "LOG-000103", when: "01/08/2569 15:12", event: "Import", user: "พิมพกา สุขใจ", userCode: "EMP001", role: "Super Admin", module: "business-partner", ref: "", detail: "นำเข้าคู่ค้า 30 รายการจาก Excel", ip: "10.0.1.10", result: "Success" },
  { code: "LOG-000102", when: "01/08/2569 10:15", event: "Create", user: "ปิยนารถ เจริญทอง", userCode: "EMP006", role: "Warehouse Manager", module: "shipment", ref: "SHP-2026-000045", detail: "สร้างใบจัดส่ง", ip: "10.0.2.8", result: "Success" },
  { code: "LOG-000101", when: "31/07/2569 17:50", event: "Logout", user: "สมชาย ใจดี", userCode: "EMP003", role: "Sales Manager", module: "—", ref: "", detail: "ออกจากระบบ", ip: "10.0.4.5", result: "Success" },
];

/* ---------- Placeholders the roadmap owns ---------- */

export const ADMIN_PLACEHOLDERS = {
  apiKeys: 0,
  backups: { last: "02/08/2569 23:00", size: "412 MB", retention: "30 วัน" },
  failedLogins24h: AUDIT_LOG.filter((l) => l.event === "Login Failed").length,
  passwordPolicy: "อย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวเลขและตัวอักษรพิมพ์ใหญ่",
  sessionTimeoutMinutes: 60,
  twoFactor: false,
};
