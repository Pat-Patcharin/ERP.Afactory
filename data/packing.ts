/**
 * Packing — turn picked quantities into sealed, labelled boxes. Generated
 * from a completed Picking task; completing one feeds the Delivery Order.
 *
 * Waiting → In Progress → Completed
 *                       → Cancelled
 *
 * Mock dataset; mutating these arrays is how the prototype persists changes.
 */

export interface PackLine {
  line: number;
  code: string;
  name: string;
  unit: string;
  /** Quantity handed over by picking. */
  qty: number;
  packedQty: number;
  /**
   * What the warehouse says can actually go on the lorry.
   *
   * Undefined until somebody at the warehouse has confirmed it — which is not
   * the same as zero, and the difference matters: zero is a confirmed refusal
   * to ship this line, undefined is nobody having looked yet. The delivery
   * order refuses to be created while any line is still undefined.
   *
   * Never above `qty`. Picking hands over what it found; the warehouse cannot
   * confirm shipping more than it holds. Enforced in `checkConfirmLines()`,
   * which the workflow calls before writing, not in the form.
   */
  confirmedQty?: number;
  /** Why this line ships less than the order asked for. Required when short. */
  shortReason?: string;
  /** Which box on this task the line went into. */
  box: string;
  note: string;
  /** The name the customer was given, so the floor picks what was promised.
   *  Read it through displayName(), never directly. */
  customName?: string;
}

export interface PackBox {
  box: string;
  type: string;
  weight: number;
  dim: string;
  sealNo: string;
  note: string;
}

export interface PackingTask {
  code: string;
  pickRef: string;
  soRef: string;
  customer: string;
  customerCode: string;
  warehouse: string;
  packer: string;
  status: string;
  packDate: string;
  dueDate: string;
  priority: string;
  /** Fragile / cold chain handling the carrier must respect. */
  handling: string;
  remark: string;
  items: PackLine[];
  packages: PackBox[];
  /**
   * When the warehouse confirmed the shippable quantities, and who did it.
   *
   * Blank means it has not happened. The delivery order is refused until it
   * has, so that the paperwork the customer is billed from is built out of
   * what the warehouse said it could ship rather than what the order asked
   * for. Two fields rather than a boolean because "who said so" is the part
   * anybody investigating a short delivery actually wants.
   */
  confirmedAt?: string;
  confirmedBy?: string;
  doRef: string;
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const PACK_STATUS = ["Waiting", "In Progress", "Completed", "Cancelled"] as const;

export const PACK_PRIORITY = ["Low", "Normal", "High", "Critical"] as const;

export const PACK_STAFF = ["Pimlada P.", "Anan P.", "Warin S.", "Nattapong K."] as const;

export const PACK_BOX_TYPES = [
  "Carton S (30×20×15 cm)",
  "Carton M (40×30×25 cm)",
  "Carton L (60×40×40 cm)",
  "Pallet",
  "Cold Box",
  "Envelope",
] as const;

export const PACK_HANDLING = [
  "ปกติ",
  "เปราะบาง (Fragile)",
  "ควบคุมอุณหภูมิ",
  "ห้ามวางซ้อน",
  "วัตถุอันตราย",
] as const;

export const PACKING_TASKS: PackingTask[] = [
  {
    code: "PACK2506-0001",
    pickRef: "PK2506-0001",
    soRef: "SO2506-0001",
    customer: "บริษัท เดนทัล สมายล์ จำกัด",
    customerCode: "BP000123",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    packer: "Pimlada P.",
    status: "Completed",
    packDate: "30/06/2569",
    dueDate: "01/07/2569",
    priority: "High",
    handling: "เปราะบาง (Fragile)",
    remark: "แยกกล่อง A-FLEX ออกจาก A-ACRYLIC ตามคำขอลูกค้า",
    items: [
      { line: 1, code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 120, packedQty: 120, box: "BOX-01", note: "" },
      { line: 2, code: "AA-TH003-GR", name: "A-FLEX PU40 (Grey)", unit: "Tube", qty: 60, packedQty: 60, box: "BOX-01", note: "" },
      { line: 3, code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 40, packedQty: 40, box: "BOX-02", note: "" },
    ],
    packages: [
      { box: "BOX-01", type: "Carton L (60×40×40 cm)", weight: 12.4, dim: "60×40×40", sealNo: "SEAL-88231", note: "A-FLEX รวม 180 หลอด" },
      { box: "BOX-02", type: "Carton M (40×30×25 cm)", weight: 5.2, dim: "40×30×25", sealNo: "SEAL-88232", note: "A-ACRYLIC 40 หลอด" },
    ],
    doRef: "DO2507-0001",
    history: [
      { t: "Completed", d: "แพ็คครบ 220 หน่วย เป็น 2 กล่อง", u: "Pimlada P.", when: "30/06/2569 17:25", kind: "primary" },
      { t: "In progress", d: "เริ่มแพ็คสินค้า", u: "Pimlada P.", when: "30/06/2569 16:30", kind: "info" },
      { t: "Created from PK2506-0001", d: "สร้างงานแพ็คจากใบหยิบสินค้า", u: "Warin S.", when: "30/06/2569 16:10", kind: "" },
    ],
    created: "30/06/2569 16:10",
    createdBy: "Warin S.",
    updated: "30/06/2569 17:25",
    updatedBy: "Pimlada P.",
  },
  {
    code: "PACK2506-0002",
    pickRef: "PK2506-0003",
    soRef: "SO2506-0004",
    customer: "คลินิกทันตกรรม เอบีซี",
    customerCode: "BP000122",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    packer: "Nattapong K.",
    status: "Completed",
    packDate: "02/07/2569",
    dueDate: "02/07/2569",
    priority: "Normal",
    handling: "ปกติ",
    remark: "ลูกค้ามารับเอง ไม่ต้องติดใบปะหน้า",
    items: [
      { line: 1, code: "AB-AC001", name: "A-ACRYLIC 100% (White)", unit: "Tube", qty: 24, packedQty: 24, box: "BOX-01", note: "" },
      { line: 2, code: "AT-SL001", name: "A-SILICONE 300 (Clear)", unit: "Tube", qty: 12, packedQty: 12, box: "BOX-01", note: "" },
    ],
    packages: [
      { box: "BOX-01", type: "Carton M (40×30×25 cm)", weight: 3.1, dim: "40×30×25", sealNo: "SEAL-88240", note: "" },
    ],
    doRef: "DO2507-0002",
    history: [
      { t: "Completed", d: "แพ็คครบ 36 หน่วย เป็น 1 กล่อง", u: "Nattapong K.", when: "02/07/2569 10:40", kind: "primary" },
      { t: "Created from PK2506-0003", d: "สร้างงานแพ็คจากใบหยิบสินค้า", u: "Nattapong K.", when: "02/07/2569 10:05", kind: "" },
    ],
    created: "02/07/2569 10:05",
    createdBy: "Nattapong K.",
    updated: "02/07/2569 10:40",
    updatedBy: "Nattapong K.",
  },
  {
    code: "PACK2507-0003",
    pickRef: "PK2506-0002",
    soRef: "SO2506-0002",
    customer: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    customerCode: "BP000120",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    packer: "",
    status: "Waiting",
    packDate: "",
    dueDate: "04/07/2569",
    priority: "Normal",
    handling: "ห้ามวางซ้อน",
    remark: "รอฝ่ายหยิบสินค้าปิดงานก่อน",
    items: [
      { line: 1, code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 180, packedQty: 0, box: "", note: "หยิบได้ไม่ครบ รอเติมสต๊อก" },
    ],
    packages: [],
    doRef: "",
    history: [
      { t: "Created from PK2506-0002", d: "สร้างงานแพ็ครอไว้ ยังหยิบไม่ครบ", u: "Warin S.", when: "29/06/2569 11:45", kind: "" },
    ],
    created: "29/06/2569 11:45",
    createdBy: "Warin S.",
    updated: "29/06/2569 11:45",
    updatedBy: "Warin S.",
  },
];
