/* eslint-disable */
/**
 * Price List master — pricing POLICY (scope, validity, priority rules).
 * The actual per-product prices live in pricing.ts.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface PriorityLevel {
  rank: number;
  key: string;
  desc: string;
  tone: string;
}

export interface PriceList {
  code: string;
  name: string;
  desc: string;
  type: string;
  currency: string;
  status: string;
  priority: number;
  effective: string;
  expiry: string;
  custGroup: string;
  channel: string;
  area: string;
  scope: string[];
  priorityKey: string;
  rule: {
    ruleType: string;
    value: number;
    allowOverride: boolean;
    minMargin: number;
    maxDiscount: number;
    formula: string;
    rulePriority: number;
  };
  productsCount: number;
  history: {
    t: string;
    d: string;
    u: string;
    when: string;
    kind: string;
  }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const PL_TYPES = [
  "Standard",
  "Clinic",
  "Dealer",
  "Government",
  "Chain Clinic",
  "Promotion",
  "Tender",
  "Contract",
  "Custom",
] as const;

export const PL_STATUS = ["Draft", "Active", "Inactive", "Expired"] as const;

export const PL_CUSTOMER_SCOPE = ["Clinic", "Hospital", "Dealer", "Government", "Chain Clinic", "VIP", "Specific Customer"] as const;

export const PL_CHANNELS = ["Retail", "Dealer", "Government", "Tender", "Online"] as const;

export const PL_RULE_TYPES = ["Fixed Price", "Markup", "Markdown", "Discount %", "Margin %", "Formula"] as const;

export const PL_AREAS = ["All Areas", "Bangkok", "Central", "North", "Northeast", "South", "East", "West"] as const;

export const PL_PRIORITY_ENGINE: PriorityLevel[] = [
  {
    rank: 1,
    key: "Contract",
    desc: "ราคาตามสัญญาเฉพาะลูกค้า — สูงสุด",
    tone: "success",
  },
  {
    rank: 2,
    key: "Promotion",
    desc: "ราคาโปรโมชันตามช่วงเวลา",
    tone: "warning",
  },
  {
    rank: 3,
    key: "Customer Price",
    desc: "ราคาเฉพาะลูกค้ารายนั้น",
    tone: "info",
  },
  {
    rank: 4,
    key: "Customer Group Price",
    desc: "ราคาตามกลุ่มลูกค้า",
    tone: "info",
  },
  {
    rank: 5,
    key: "Price List",
    desc: "ราคาตาม Price List ที่ผูกไว้",
    tone: "neutral",
  },
  {
    rank: 6,
    key: "Standard Price",
    desc: "ราคามาตรฐาน — ต่ำสุด (fallback)",
    tone: "neutral",
  },
];

export const PRICE_LISTS: PriceList[] = [
  {
    code: "PL-STD-2026",
    name: "Standard Price",
    desc: "ราคามาตรฐานสำหรับลูกค้าทั่วไป ใช้เป็นฐานอ้างอิงของทุก Price List",
    type: "Standard",
    currency: "THB",
    status: "Active",
    priority: 100,
    effective: "01/01/2026",
    expiry: "31/12/2026",
    custGroup: "Clinic",
    channel: "Retail",
    area: "All Areas",
    scope: ["Clinic", "Hospital"],
    priorityKey: "Standard Price",
    rule: {
      ruleType: "Fixed Price",
      value: 0,
      allowOverride: true,
      minMargin: 15,
      maxDiscount: 10,
      formula: "",
      rulePriority: 6,
    },
    productsCount: 1248,
    history: [
      {
        t: "Activated",
        d: "เปิดใช้งานราคามาตรฐานปี 2026",
        u: "Pimpaka S.",
        when: "01/01/2026 09:00",
        kind: "primary",
      },
      {
        t: "Created",
        d: "สร้าง Price List",
        u: "Pimpaka S.",
        when: "20/12/2025 14:00",
        kind: "",
      },
    ],
    created: "20/12/2025 14:00",
    createdBy: "Pimpaka S.",
    updated: "01/01/2026 09:00",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "PL-CLINIC-2026",
    name: "Clinic Price",
    desc: "ราคาสำหรับคลินิกทันตกรรมที่เป็นสมาชิก ส่วนลดจากราคามาตรฐาน",
    type: "Clinic",
    currency: "THB",
    status: "Active",
    priority: 80,
    effective: "01/01/2026",
    expiry: "31/12/2026",
    custGroup: "Clinic",
    channel: "Retail",
    area: "All Areas",
    scope: ["Clinic", "Chain Clinic"],
    priorityKey: "Customer Group Price",
    rule: {
      ruleType: "Discount %",
      value: 8,
      allowOverride: true,
      minMargin: 12,
      maxDiscount: 15,
      formula: "",
      rulePriority: 4,
    },
    productsCount: 960,
    history: [
      {
        t: "Activated",
        d: "เปิดใช้งานราคาคลินิก",
        u: "Patcharin T.",
        when: "01/01/2026 09:30",
        kind: "primary",
      },
      {
        t: "Created",
        d: "สร้าง Price List",
        u: "Patcharin T.",
        when: "22/12/2025 10:00",
        kind: "",
      },
    ],
    created: "22/12/2025 10:00",
    createdBy: "Patcharin T.",
    updated: "01/01/2026 09:30",
    updatedBy: "Patcharin T.",
  },
  {
    code: "PL-DEALER-2026",
    name: "Dealer Price",
    desc: "ราคาตัวแทนจำหน่าย มีส่วนลดสูงกว่าคลินิก แลกกับยอดสั่งซื้อขั้นต่ำ",
    type: "Dealer",
    currency: "THB",
    status: "Active",
    priority: 70,
    effective: "01/01/2026",
    expiry: "31/12/2026",
    custGroup: "Dealer",
    channel: "Dealer",
    area: "All Areas",
    scope: ["Dealer"],
    priorityKey: "Customer Group Price",
    rule: {
      ruleType: "Markdown",
      value: 18,
      allowOverride: false,
      minMargin: 8,
      maxDiscount: 25,
      formula: "",
      rulePriority: 4,
    },
    productsCount: 1120,
    history: [
      {
        t: "Activated",
        d: "เปิดใช้งานราคาตัวแทน",
        u: "Somchai S.",
        when: "01/01/2026 10:00",
        kind: "primary",
      },
      {
        t: "Created",
        d: "สร้าง Price List",
        u: "Somchai S.",
        when: "23/12/2025 11:00",
        kind: "",
      },
    ],
    created: "23/12/2025 11:00",
    createdBy: "Somchai S.",
    updated: "01/01/2026 10:00",
    updatedBy: "Somchai S.",
  },
  {
    code: "PL-GOV-2026",
    name: "Government Price",
    desc: "ราคาสำหรับหน่วยงานราชการและโรงพยาบาลรัฐ ตามระเบียบจัดซื้อจัดจ้าง",
    type: "Government",
    currency: "THB",
    status: "Active",
    priority: 75,
    effective: "01/01/2026",
    expiry: "31/12/2026",
    custGroup: "Government",
    channel: "Government",
    area: "All Areas",
    scope: ["Government", "Hospital"],
    priorityKey: "Contract",
    rule: {
      ruleType: "Fixed Price",
      value: 0,
      allowOverride: false,
      minMargin: 10,
      maxDiscount: 0,
      formula: "",
      rulePriority: 1,
    },
    productsCount: 540,
    history: [
      {
        t: "Activated",
        d: "เปิดใช้งานราคาราชการ",
        u: "Pimpaka S.",
        when: "01/01/2026 10:30",
        kind: "primary",
      },
      {
        t: "Created",
        d: "สร้าง Price List",
        u: "Pimpaka S.",
        when: "24/12/2025 09:00",
        kind: "",
      },
    ],
    created: "24/12/2025 09:00",
    createdBy: "Pimpaka S.",
    updated: "01/01/2026 10:30",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "PL-PROMO-SEP",
    name: "Promotion September",
    desc: "โปรโมชันเดือนกันยายน ส่วนลดพิเศษสินค้ากลุ่ม VinciSmile และวัสดุสิ้นเปลือง",
    type: "Promotion",
    currency: "THB",
    status: "Draft",
    priority: 90,
    effective: "01/09/2026",
    expiry: "30/09/2026",
    custGroup: "Clinic",
    channel: "Retail",
    area: "All Areas",
    scope: ["Clinic", "Chain Clinic", "VIP"],
    priorityKey: "Promotion",
    rule: {
      ruleType: "Discount %",
      value: 12,
      allowOverride: false,
      minMargin: 10,
      maxDiscount: 20,
      formula: "",
      rulePriority: 2,
    },
    productsCount: 180,
    history: [
      {
        t: "Created",
        d: "ร่างโปรโมชันเดือนกันยายน",
        u: "Patcharin T.",
        when: "15/07/2026 15:00",
        kind: "",
      },
    ],
    created: "15/07/2026 15:00",
    createdBy: "Patcharin T.",
    updated: "15/07/2026 15:00",
    updatedBy: "Patcharin T.",
  },
];
