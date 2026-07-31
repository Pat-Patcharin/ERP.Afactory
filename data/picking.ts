/**
 * Picking — pull the ordered quantities out of the bins. Generated from a
 * confirmed Sales Order; completing one feeds Packing.
 *
 * Waiting → Assigned → In Progress → Completed
 *                                  → Cancelled
 *
 * Mock dataset; mutating these arrays is how the prototype persists changes.
 */

export interface PickLine {
  line: number;
  code: string;
  name: string;
  unit: string;
  lot: string;
  /** Quantity the sales order asked for. */
  ordered: number;
  /** Quantity actually taken off the shelf. */
  picked: number;
  bin: string;
  status: string;
  note: string;
}

export interface PickingTask {
  code: string;
  soRef: string;
  customer: string;
  customerCode: string;
  warehouse: string;
  assignedTo: string;
  priority: string;
  status: string;
  pickDate: string;
  dueDate: string;
  strategy: string;
  remark: string;
  items: PickLine[];
  packRef: string;
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const PICK_STATUS = [
  "Waiting",
  "Assigned",
  "In Progress",
  "Completed",
  "Cancelled",
] as const;

export const PICK_PRIORITY = ["Low", "Normal", "High", "Critical"] as const;

export const PICK_STAFF = ["Warin S.", "Somchai B.", "Nattapong K.", "Anan P."] as const;

/** How the picker is told to walk the warehouse. */
export const PICK_STRATEGIES = [
  "FEFO (หมดอายุก่อน หยิบก่อน)",
  "FIFO (เข้าก่อน หยิบก่อน)",
  "Bin Location Order",
  "Single Order Pick",
] as const;

export const PICK_LINE_STATUS = ["Pending", "Picked", "Short", "Substituted"] as const;

export const PICK_SHORT_REASONS = [
  "สต๊อกไม่พอ",
  "สินค้าเสียหาย",
  "หมดอายุ",
  "หาไม่พบในช่องเก็บ",
  "รอ Put Away",
] as const;

export const PICKING_TASKS: PickingTask[] = [
  {
    code: "PK2506-0001",
    soRef: "SO2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    assignedTo: "Warin S.",
    priority: "High",
    status: "Completed",
    pickDate: "30/06/2569",
    dueDate: "01/07/2569",
    strategy: "FEFO (หมดอายุก่อน หยิบก่อน)",
    remark: "",
    items: [
      { line: 1, code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", lot: "LOT-2506-A1", ordered: 120, picked: 120, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01", status: "Picked", note: "" },
      { line: 2, code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", lot: "LOT-2506-A2", ordered: 60, picked: 60, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A02", status: "Picked", note: "" },
      { line: 3, code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", lot: "LOT-2505-C7", ordered: 40, picked: 40, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-02/BIN-A04", status: "Picked", note: "" },
    ],
    packRef: "PACK2506-0001",
    history: [
      { t: "Completed", d: "หยิบครบ 220 หน่วย ส่งต่อฝ่ายแพ็ค", u: "Warin S.", when: "30/06/2569 16:10", kind: "primary" },
      { t: "In progress", d: "เริ่มหยิบสินค้า", u: "Warin S.", when: "30/06/2569 14:30", kind: "info" },
      { t: "Assigned", d: "มอบหมายให้ Warin S.", u: "Somchai B.", when: "30/06/2569 09:00", kind: "info" },
      { t: "Created from SO2506-0001", d: "สร้างใบหยิบสินค้าจากใบสั่งขาย", u: "Patcharin T.", when: "29/06/2569 17:00", kind: "" },
    ],
    created: "29/06/2569 17:00",
    createdBy: "Patcharin T.",
    updated: "30/06/2569 16:10",
    updatedBy: "Warin S.",
  },
  {
    code: "PK2506-0002",
    soRef: "SO2506-0002",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    assignedTo: "Warin S.",
    priority: "Normal",
    status: "In Progress",
    pickDate: "29/06/2569",
    dueDate: "04/07/2569",
    strategy: "Bin Location Order",
    remark: "แยกกล่องตามสาขาปลายทาง",
    items: [
      { line: 1, code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", lot: "LOT-2506-A1", ordered: 240, picked: 180, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01", status: "Short", note: "สต๊อกในช่องเหลือ 180" },
      { line: 2, code: "AA-TH004-BK", name: "A-FLEX PU50 (Black)", unit: "Tube", lot: "LOT-2506-B3", ordered: 120, picked: 0, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A03", status: "Pending", note: "" },
      { line: 3, code: "AT-GL001", name: "A-GLASS IONOMER (Universal)", unit: "Set", lot: "LOT-2505-G2", ordered: 30, picked: 0, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-02/BIN-A04", status: "Pending", note: "" },
    ],
    packRef: "",
    history: [
      { t: "Short pick recorded", d: "AA-TH003-WL หยิบได้ 180 จาก 240", u: "Warin S.", when: "29/06/2569 11:40", kind: "warn" },
      { t: "In progress", d: "เริ่มหยิบสินค้า", u: "Warin S.", when: "29/06/2569 09:20", kind: "info" },
      { t: "Assigned", d: "มอบหมายให้ Warin S.", u: "Somchai B.", when: "29/06/2569 09:00", kind: "info" },
      { t: "Created from SO2506-0002", d: "สร้างใบหยิบสินค้าจากใบสั่งขาย", u: "Somchai S.", when: "28/06/2569 10:00", kind: "" },
    ],
    created: "28/06/2569 10:00",
    createdBy: "Somchai S.",
    updated: "29/06/2569 11:40",
    updatedBy: "Warin S.",
  },
  {
    code: "PK2506-0003",
    soRef: "SO2506-0004",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    assignedTo: "Nattapong K.",
    priority: "Normal",
    status: "Completed",
    pickDate: "02/07/2569",
    dueDate: "02/07/2569",
    strategy: "Single Order Pick",
    remark: "ลูกค้ามารับเอง",
    items: [
      { line: 1, code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", lot: "LOT-2505-C7", ordered: 24, picked: 24, bin: "WH-CNX/ZONE-A/RACK-01/SHELF-01/BIN-C01", status: "Picked", note: "" },
      { line: 2, code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", lot: "LOT-2506-S5", ordered: 12, picked: 12, bin: "WH-CNX/ZONE-A/RACK-01/SHELF-01/BIN-C02", status: "Picked", note: "" },
    ],
    packRef: "PACK2506-0002",
    history: [
      { t: "Completed", d: "หยิบครบ 36 หน่วย", u: "Nattapong K.", when: "02/07/2569 10:05", kind: "primary" },
      { t: "Assigned", d: "มอบหมายให้ Nattapong K.", u: "Supavita Y.", when: "02/07/2569 09:10", kind: "info" },
      { t: "Created from SO2506-0004", d: "สร้างใบหยิบสินค้าจากใบสั่งขาย", u: "Supavita Y.", when: "01/07/2569 08:30", kind: "" },
    ],
    created: "01/07/2569 08:30",
    createdBy: "Supavita Y.",
    updated: "02/07/2569 10:05",
    updatedBy: "Nattapong K.",
  },
  {
    code: "PK2507-0004",
    soRef: "SO2506-0005",
    customer: "ร้านทันตภัณฑ์ ก้าวหน้า",
    customerCode: "BP000118",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    assignedTo: "",
    priority: "Normal",
    status: "Waiting",
    pickDate: "",
    dueDate: "08/07/2569",
    strategy: "FEFO (หมดอายุก่อน หยิบก่อน)",
    remark: "",
    items: [
      { line: 1, code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", lot: "", ordered: 48, picked: 0, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A02", status: "Pending", note: "" },
      { line: 2, code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", lot: "", ordered: 36, picked: 0, bin: "WH-BKK/ZONE-A/RACK-01/SHELF-02/BIN-A04", status: "Pending", note: "" },
    ],
    packRef: "",
    history: [
      { t: "Created from SO2506-0005", d: "สร้างใบหยิบสินค้าจากใบสั่งขาย รอมอบหมาย", u: "Somchai S.", when: "01/07/2569 09:20", kind: "" },
    ],
    created: "01/07/2569 09:20",
    createdBy: "Somchai S.",
    updated: "01/07/2569 09:20",
    updatedBy: "Somchai S.",
  },
];
