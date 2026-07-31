/* eslint-disable */
/**
 * Purchase Order. Belongs to exactly one supplier; receiving is
 * partial-aware: Draft -> Open -> Partial Received -> Completed.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export type SupplierInfoMap = Record<string, {
  rating: number;
  ratingLabel: string;
  lead: number;
  otd: number;
  lastPrice: number;
  lastDate: string;
  outstanding: number;
  icon: string;
}>;

export interface PurchaseOrder {
  code: string;
  supplier: string;
  buyer: string;
  orderDate: string;
  expectedDate: string;
  warehouse: string;
  currency: string;
  fx: number;
  payTerm: string;
  incoterm: string;
  status: string;
  remark: string;
  prRef: string;
  items: {
    code: string;
    name: string;
    unit: string;
    qty: number;
    price: number;
    disc: number;
    tax: number;
    recv: number;
  }[];
  receipts: {
    grn: string;
    date: string;
    warehouse: string;
    qty: number;
    receiver: string;
    status: string;
  }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
  overdue?: boolean;
}

export const PO_STATUS = ["Draft", "Open", "Partial Received", "Completed", "Cancelled", "Closed"] as const;

export const PO_CURRENCIES = ["THB", "USD", "EUR", "CNY", "JPY"] as const;

export const PO_INCOTERMS = ["EXW", "FOB", "CIF", "DDP", "DAP", "FCA"] as const;

export const PO_BUYERS = ["Pimlada P.", "Pimpaka S.", "Somchai B.", "Nattapong K."] as const;

export const PO_SUPPLIER_INFO: SupplierInfoMap = {
  "DentCare Co., Ltd.": {
    rating: 4.8,
    ratingLabel: "Excellent",
    lead: 5.2,
    otd: 95,
    lastPrice: 98.5,
    lastDate: "02/06/2025",
    outstanding: 125000,
    icon: "🦷",
  },
  "Siam Medical Supply": {
    rating: 4.6,
    ratingLabel: "Very Good",
    lead: 5.1,
    otd: 95,
    lastPrice: 210,
    lastDate: "28/06/2025",
    outstanding: 178000,
    icon: "💊",
  },
  "Perfect Supply Co., Ltd.": {
    rating: 4.4,
    ratingLabel: "Good",
    lead: 7,
    otd: 88,
    lastPrice: 95,
    lastDate: "05/07/2025",
    outstanding: 0,
    icon: "📦",
  },
  "BKK Dental Lab": {
    rating: 4.3,
    ratingLabel: "Good",
    lead: 6.3,
    otd: 93,
    lastPrice: 320,
    lastDate: "20/06/2025",
    outstanding: 52600,
    icon: "🔬",
  },
  "Mega Dental Supply": {
    rating: 4.6,
    ratingLabel: "Very Good",
    lead: 6,
    otd: 92,
    lastPrice: 150,
    lastDate: "11/06/2025",
    outstanding: 89750,
    icon: "🏭",
  },
  "Apex Dental Co., Ltd.": {
    rating: 4.7,
    ratingLabel: "Very Good",
    lead: 4.8,
    otd: 96,
    lastPrice: 68.5,
    lastDate: "10/06/2025",
    outstanding: 0,
    icon: "⚙️",
  },
};

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    code: "PO2506124",
    supplier: "DentCare Co., Ltd.",
    buyer: "Pimlada P.",
    orderDate: "12/06/2025",
    expectedDate: "18/06/2025",
    warehouse: "WH01 Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "30 Days",
    incoterm: "FOB",
    status: "Open",
    remark: "",
    prRef: "",
    items: [
      {
        code: "AA-TH003-WL",
        name: "A-FLEX PU40 (White)",
        unit: "Syringe",
        qty: 100,
        price: 120,
        disc: 0,
        tax: 7,
        recv: 0,
      },
      {
        code: "BOND-01",
        name: "Bonding Agent 5ml",
        unit: "Bottle",
        qty: 50,
        price: 145,
        disc: 5,
        tax: 7,
        recv: 0,
      },
    ],
    receipts: [],
    created: "12/06/2025 09:10",
    createdBy: "Pimlada P.",
    updated: "12/06/2025 09:10",
    updatedBy: "Pimlada P.",
  },
  {
    code: "PO2506123",
    supplier: "Mega Dental Supply",
    buyer: "Pimlada P.",
    orderDate: "11/06/2025",
    expectedDate: "16/06/2025",
    warehouse: "WH01 Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "30 Days",
    incoterm: "FOB",
    status: "Partial Received",
    remark: "",
    prRef: "",
    items: [
      {
        code: "IMP-01",
        name: "Impression Material",
        unit: "Set",
        qty: 100,
        price: 320,
        disc: 0,
        tax: 7,
        recv: 60,
      },
    ],
    receipts: [
      {
        grn: "GRN2506-041",
        date: "14/06/2025",
        warehouse: "WH01 Main Warehouse",
        qty: 60,
        receiver: "Somchai B.",
        status: "Received",
      },
    ],
    created: "11/06/2025 10:00",
    createdBy: "Pimlada P.",
    updated: "14/06/2025 15:30",
    updatedBy: "Somchai B.",
  },
  {
    code: "PO2506122",
    supplier: "Apex Dental Co., Ltd.",
    buyer: "Pimpaka S.",
    orderDate: "10/06/2025",
    expectedDate: "15/06/2025",
    warehouse: "WH02 Raw Material WH",
    currency: "THB",
    fx: 1,
    payTerm: "45 Days",
    incoterm: "CIF",
    status: "Completed",
    remark: "ครบตามจำนวน",
    prRef: "",
    items: [
      {
        code: "AA-TH003-WL",
        name: "A-FLEX PU40 (White)",
        unit: "Syringe",
        qty: 300,
        price: 68.5,
        disc: 0,
        tax: 7,
        recv: 300,
      },
      {
        code: "ETCH-01",
        name: "Etching Gel 37%",
        unit: "Syringe",
        qty: 200,
        price: 95,
        disc: 0,
        tax: 7,
        recv: 200,
      },
    ],
    receipts: [
      {
        grn: "GRN2506-038",
        date: "15/06/2025",
        warehouse: "WH02 Raw Material WH",
        qty: 500,
        receiver: "Warin S.",
        status: "Received",
      },
    ],
    created: "10/06/2025 11:20",
    createdBy: "Pimpaka S.",
    updated: "15/06/2025 16:00",
    updatedBy: "Warin S.",
  },
  {
    code: "PO2506121",
    supplier: "DentCare Co., Ltd.",
    buyer: "Pimlada P.",
    orderDate: "09/06/2025",
    expectedDate: "14/06/2025",
    warehouse: "WH01 Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "30 Days",
    incoterm: "FOB",
    status: "Open",
    remark: "",
    prRef: "",
    items: [
      {
        code: "CEM-001",
        name: "Cement Universal",
        unit: "Box",
        qty: 40,
        price: 210,
        disc: 0,
        tax: 7,
        recv: 10,
      },
    ],
    receipts: [
      {
        grn: "GRN2506-040",
        date: "12/06/2025",
        warehouse: "WH01 Main Warehouse",
        qty: 10,
        receiver: "Somchai B.",
        status: "Received",
      },
    ],
    created: "09/06/2025 14:00",
    createdBy: "Pimlada P.",
    updated: "12/06/2025 10:15",
    updatedBy: "Somchai B.",
  },
  {
    code: "PO2506120",
    supplier: "Global Dental Ltd.",
    buyer: "Somchai B.",
    orderDate: "09/06/2025",
    expectedDate: "13/06/2025",
    warehouse: "WH02 Raw Material WH",
    currency: "THB",
    fx: 1,
    payTerm: "60 Days",
    incoterm: "DDP",
    status: "Open",
    remark: "เลยกำหนดส่ง",
    prRef: "",
    overdue: true,
    items: [
      {
        code: "BOND-01",
        name: "Bonding Agent 5ml",
        unit: "Bottle",
        qty: 120,
        price: 145,
        disc: 0,
        tax: 7,
        recv: 0,
      },
    ],
    receipts: [],
    created: "09/06/2025 08:30",
    createdBy: "Somchai B.",
    updated: "09/06/2025 08:30",
    updatedBy: "Somchai B.",
  },
  {
    code: "PO2506118",
    supplier: "DentCare Co., Ltd.",
    buyer: "Pimlada P.",
    orderDate: "07/06/2025",
    expectedDate: "11/06/2025",
    warehouse: "WH01 Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "30 Days",
    incoterm: "FOB",
    status: "Partial Received",
    remark: "",
    prRef: "",
    items: [
      {
        code: "AA-TH003-GR",
        name: "A-FLEX PU40 (Grey)",
        unit: "Syringe",
        qty: 200,
        price: 120,
        disc: 0,
        tax: 7,
        recv: 160,
      },
    ],
    receipts: [
      {
        grn: "GRN2506-035",
        date: "10/06/2025",
        warehouse: "WH01 Main Warehouse",
        qty: 160,
        receiver: "Somchai B.",
        status: "Received",
      },
    ],
    created: "07/06/2025 13:40",
    createdBy: "Pimlada P.",
    updated: "10/06/2025 11:00",
    updatedBy: "Somchai B.",
  },
  {
    code: "PO2506117",
    supplier: "Apex Dental Co., Ltd.",
    buyer: "Pimpaka S.",
    orderDate: "06/06/2025",
    expectedDate: "10/06/2025",
    warehouse: "WH02 Raw Material WH",
    currency: "THB",
    fx: 1,
    payTerm: "45 Days",
    incoterm: "CIF",
    status: "Completed",
    remark: "",
    prRef: "",
    items: [
      {
        code: "ETCH-01",
        name: "Etching Gel 37%",
        unit: "Syringe",
        qty: 150,
        price: 95,
        disc: 0,
        tax: 7,
        recv: 150,
      },
    ],
    receipts: [
      {
        grn: "GRN2506-030",
        date: "10/06/2025",
        warehouse: "WH02 Raw Material WH",
        qty: 150,
        receiver: "Warin S.",
        status: "Received",
      },
    ],
    created: "06/06/2025 09:00",
    createdBy: "Pimpaka S.",
    updated: "10/06/2025 14:20",
    updatedBy: "Warin S.",
  },
  {
    code: "PO2506115",
    supplier: "Siam Medical Supply",
    buyer: "Somchai B.",
    orderDate: "04/06/2025",
    expectedDate: "09/06/2025",
    warehouse: "WH01 Main Warehouse",
    currency: "THB",
    fx: 1,
    payTerm: "30 Days",
    incoterm: "FOB",
    status: "Draft",
    remark: "ร่างเอกสาร รอตรวจสอบราคา",
    prRef: "",
    items: [
      {
        code: "CEM-001",
        name: "Cement Universal",
        unit: "Box",
        qty: 30,
        price: 225,
        disc: 0,
        tax: 7,
        recv: 0,
      },
    ],
    receipts: [],
    created: "04/06/2025 15:00",
    createdBy: "Somchai B.",
    updated: "04/06/2025 15:00",
    updatedBy: "Somchai B.",
  },
];
