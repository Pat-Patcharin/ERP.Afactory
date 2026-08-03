/* eslint-disable */
/**
 * BARCODE LOOKUP — the overlay that makes every code in the ERP scannable.
 *
 * The module invents almost no data. A product barcode, a lot number, a
 * serial, a bin, a package and a document number all already exist in the
 * modules that own them; Barcode Lookup only declares the pieces those
 * modules never wrote down:
 *
 *   1. Pack-level barcodes. A product master carries one GTIN, but a
 *      warehouse scans the carton and the pallet too. The levels below
 *      derive a GTIN per packing level from the product's own barcode.
 *   2. Legacy aliases — codes reprinted on old labels that now collide with
 *      something else. They are the reason the multiple-match screen exists.
 *   3. The scan log, which is a record of looking, not of doing.
 *
 * Nothing here changes stock. The module is a magnifying glass.
 */

/* ---------- Vocabularies ---------- */

export const SYMBOLOGIES = [
  "EAN-13",
  "EAN-8",
  "UPC-A",
  "Code 128",
  "Code 39",
  "QR Code",
  "Data Matrix",
  "GS1-128",
  "GS1 DataMatrix",
  "Internal A-Factory Barcode",
] as const;

export const CODE_TYPES = [
  "Product Barcode",
  "Product Code",
  "Lot Number",
  "Serial Number",
  "Location Code",
  "Package Number",
  "Shipment Tracking",
  "Document Number",
  "GS1 Composite Code",
  "Unknown Code",
] as const;

export const ENTITY_TYPES = [
  "Product",
  "Lot",
  "Serial",
  "Location",
  "Package",
  "Document",
] as const;

export const SCAN_SOURCES = [
  "Manual Entry",
  "USB Scanner",
  "Mobile Camera Placeholder",
  "Bluetooth Scanner Placeholder",
  "Imported Code",
  "Clipboard Paste",
] as const;

export const SCANNER_MODES = [
  "Universal Lookup",
  "Product",
  "Lot",
  "Serial",
  "Location",
  "Package",
  "Document",
] as const;

export const SCAN_OUTCOMES = [
  "Found",
  "Multiple Matches",
  "Not Found",
  "Invalid",
  "Restricted",
  "Error Placeholder",
] as const;

export const LABEL_SIZES = [
  "50 × 25 mm",
  "70 × 40 mm",
  "100 × 50 mm",
  "A5 Shipping Label",
] as const;

export const WAREHOUSE_CONTEXTS = [
  "WH-BKK",
  "WH-CNX",
  "WH-QTY",
  "WH-RET",
  "WH-SVC",
] as const;

export const SCAN_USERS = [
  "Warehouse Staff",
  "Suda R.",
  "Warin S.",
  "Nattapong K.",
  "Patcharin T.",
] as const;

/* ---------- GS1 application identifiers ---------- */

export interface Gs1Ai {
  ai: string;
  label: string;
  /** Fixed length of the value, or 0 when variable. */
  len: number;
  kind: "gtin" | "text" | "date" | "number";
}

/** The handful of AIs Phase 1 recognises. Not a compliance engine. */
export const GS1_AIS: Gs1Ai[] = [
  { ai: "01", label: "GTIN", len: 14, kind: "gtin" },
  { ai: "10", label: "Lot Number", len: 0, kind: "text" },
  { ai: "17", label: "Expiry Date", len: 6, kind: "date" },
  { ai: "21", label: "Serial Number", len: 0, kind: "text" },
  { ai: "30", label: "Quantity", len: 0, kind: "number" },
  { ai: "37", label: "Count of Trade Items", len: 0, kind: "number" },
];

export const getAi = (ai: string) => GS1_AIS.find((x) => x.ai === ai);

/* ---------- Pack levels ---------- */

export interface PackLevel {
  /** GS1 indicator digit that opens the packaging-level GTIN. */
  indicator: string;
  unit: string;
  label: string;
  packSize: number;
}

/**
 * One product, five scannable codes. The indicator digit is how GS1 tells a
 * carton from a single unit, so a scan can answer "how many did I just pick up".
 */
export const PACK_LEVELS: PackLevel[] = [
  { indicator: "0", unit: "EA", label: "Each", packSize: 1 },
  { indicator: "1", unit: "BOX", label: "Inner Box", packSize: 12 },
  { indicator: "2", unit: "CTN", label: "Carton", packSize: 72 },
  { indicator: "3", unit: "CS", label: "Case", packSize: 144 },
  { indicator: "4", unit: "PLT", label: "Pallet", packSize: 1440 },
];

/* ---------- Legacy aliases ---------- */

export interface CodeAlias {
  code: string;
  kind: "product" | "lot" | "serial" | "location" | "package" | "document";
  /** The entity key the alias resolves to. */
  target: string;
  note: string;
}

/**
 * Codes reprinted on older labels. Two rows sharing a code is exactly the
 * situation the multiple-match screen has to handle, so the collisions here
 * are deliberate.
 */
export const CODE_ALIASES: CodeAlias[] = [
  {
    code: "A01-01-05",
    kind: "location",
    target: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01",
    note: "รหัสตำแหน่งแบบเก่าก่อนเปลี่ยนมาใช้ WH-ZONE-RACK-BIN",
  },
  {
    code: "A01-01-05",
    kind: "product",
    target: "AA-TH003-WL",
    note: "รหัสสินค้าเดิมของ A-FLEX PU40 (White) ที่เลิกใช้แล้ว",
  },
  {
    code: "AFX-40W",
    kind: "product",
    target: "AA-TH003-WL",
    note: "รหัสย่อที่ทีมขายยังใช้เรียก",
  },
  {
    code: "GT1-128",
    kind: "serial",
    target: "XRY-GT1|GT1-TH-000128",
    note: "หมายเลขย่อบนป้ายเครื่องรุ่นแรก",
  },
  {
    code: "TRK-AF260801001",
    kind: "package",
    target: "SHP-2026-000031|PKG-01",
    note: "เลขติดตามที่พิมพ์บนกล่องรอบแรก",
  },
];

/* ---------- Codes that do not resolve ---------- */

export interface UnknownExample {
  code: string;
  note: string;
}

/** Real scans that found nothing — worn labels, foreign goods, typos. */
export const UNKNOWN_CODES: UnknownExample[] = [
  { code: "9999999999999", note: "บาร์โค้ดต่างประเทศที่ยังไม่ได้ขึ้นทะเบียน" },
  { code: "LOT-99999", note: "หมายเลขล็อตที่ไม่มีในระบบ" },
  { code: "SN-XXXX-0000", note: "หมายเลขเครื่องที่พิมพ์ผิดจากป้ายเดิม" },
  { code: "WH-XXX/ZONE-Z/RACK-99/BIN-Z99", note: "ตำแหน่งที่ถูกยกเลิกไปแล้ว" },
  { code: "PKG-SHP-259999-01", note: "กล่องจากใบส่งของที่ไม่มีในระบบ" },
  { code: "PO-2020-000001", note: "ใบสั่งซื้อเก่าก่อนย้ายระบบ" },
  { code: "TEMP-LABEL-01", note: "ป้ายชั่วคราวที่ยังไม่ได้ผูกกับสินค้า" },
  { code: "0000000000000", note: "ป้ายเปล่าจากเครื่องพิมพ์" },
  { code: "XYZ-ABC-123", note: "สติกเกอร์ของผู้ขายที่ไม่ใช่รหัสของเรา" },
  { code: "SCAN-ERROR-0001", note: "อ่านไม่ติดจากป้ายที่ชำรุด" },
];

export interface InvalidExample {
  code: string;
  format: string;
  issue: string;
  suggestion: string;
}

/** Codes that are malformed rather than merely absent. */
export const INVALID_CODES: InvalidExample[] = [
  {
    code: "(01)0885123400013(17)261399",
    format: "GS1 Composite Code",
    issue: "วันหมดอายุใน AI (17) ไม่ถูกต้อง — เดือน 13 ไม่มีอยู่จริง",
    suggestion: "ตรวจสอบรูปแบบ YYMMDD เช่น 261231",
  },
  {
    code: "(10)",
    format: "GS1 Composite Code",
    issue: "AI (10) ไม่มีค่าตามหลัง",
    suggestion: "สแกนใหม่ให้ครบทั้งสตริง",
  },
  {
    code: "(99)1234567890",
    format: "GS1 Composite Code",
    issue: "AI (99) ยังไม่รองรับในเฟสนี้",
    suggestion: "รองรับ (01) (10) (17) (21) (30) (37)",
  },
  {
    code: "885123400013",
    format: "UPC-A",
    issue: "ความยาว 12 หลักไม่ตรงกับบาร์โค้ดสินค้าในระบบซึ่งเป็น EAN-13",
    suggestion: "เติมเลขนำหน้าให้ครบ 13 หลัก",
  },
  {
    code: "88512340001",
    format: "Unknown Code",
    issue: "ความยาว 11 หลักไม่ตรงกับรูปแบบใดที่รองรับ",
    suggestion: "สแกนใหม่หรือพิมพ์รหัสด้วยมือ",
  },
  {
    code: "885123#00013!",
    format: "Unknown Code",
    issue: "พบอักขระที่ไม่ใช่รหัส — น่าจะอ่านผิดจากป้ายที่ชำรุด",
    suggestion: "ทำความสะอาดป้ายแล้วสแกนใหม่",
  },
  {
    code: "LOT 26001",
    format: "Lot Number",
    issue: "มีช่องว่างคั่นกลาง",
    suggestion: "ลองค้นใหม่โดยตัดช่องว่างออกเป็น LOT26001",
  },
  {
    code: "(01)123",
    format: "GS1 Composite Code",
    issue: "GTIN ใน AI (01) ต้องมี 14 หลัก",
    suggestion: "สแกนบาร์โค้ด GS1 ใหม่ทั้งชุด",
  },
  {
    code: "(17)260631",
    format: "GS1 Composite Code",
    issue: "วันที่ 31 มิถุนายน ไม่มีอยู่จริง",
    suggestion: "ตรวจสอบวันหมดอายุบนป้าย",
  },
  {
    code: "WH-BKK//BIN-A01",
    format: "Location Code",
    issue: "รูปแบบตำแหน่งไม่ครบระดับ — ขาด Zone และ Rack",
    suggestion: "ใช้รูปแบบ WH/ZONE/RACK/SHELF/BIN",
  },
];

/* ---------- GS1 samples ---------- */

export interface Gs1Example {
  code: string;
  note: string;
}

export const GS1_EXAMPLES: Gs1Example[] = [
  {
    code: "(01)08851234000131(10)LOT-26001(17)280630(21)GT1-TH-000128",
    note: "ป้ายรวมสินค้า ล็อต วันหมดอายุ และหมายเลขเครื่อง",
  },
  { code: "(01)08851234000148(10)LOT-26002(17)270930", note: "ป้ายกล่องพร้อมล็อตและวันหมดอายุ" },
  { code: "(01)08859000010013(21)GT1-TH-000128", note: "ป้ายเครื่องมือแพทย์พร้อมหมายเลขเครื่อง" },
  { code: "(01)08851234000155(30)72", note: "ป้ายลังพร้อมจำนวนบรรจุ" },
  { code: "(01)08851234000162(10)LOT-26004(37)12", note: "ป้ายพาเลทพร้อมจำนวนกล่อง" },
];

/* ---------- Scan log ---------- */

export interface ScanRecord {
  id: string;
  code: string;
  codeType: string;
  entity: string;
  resultCode: string;
  resultName: string;
  resultStatus: string;
  source: string;
  warehouse: string;
  user: string;
  when: string;
  outcome: string;
  /** Key the result router reopens the scan with. */
  key: string;
}

/**
 * Seeded scan history. Every outcome appears, because the Scan History filters
 * have to have something to filter.
 */
export const SCAN_SEED: [string, string, string, string, string, string, string, string, string, string][] = [
  /* code, codeType, entity, resultCode, resultName, status, source, warehouse, user, outcome */
  ["8851234000131", "Product Barcode", "Product", "AA-TH003-WL", "A-FLEX PU40 (White)", "Active", "USB Scanner", "WH-BKK", "Warehouse Staff", "Found"],
  ["GT1-TH-000128", "Serial Number", "Serial", "GT1-TH-000128", "Portable X-Ray GT1", "Delivered", "USB Scanner", "WH-BKK", "Warehouse Staff", "Found"],
  ["LOT-26001", "Lot Number", "Lot", "LOT-26001", "A-FLEX PU40 (White)", "Active", "Manual Entry", "WH-BKK", "Suda R.", "Found"],
  ["WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01", "Location Code", "Location", "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01", "Bangkok Main Warehouse", "Active", "USB Scanner", "WH-BKK", "Warehouse Staff", "Found"],
  ["PKG-SHP-260031-01", "Package Number", "Package", "PKG-01", "SHP-2026-000031", "Loaded", "Mobile Camera Placeholder", "WH-BKK", "Warin S.", "Found"],
  ["INV-2026-000021", "Document Number", "Document", "INV-2026-000021", "Sales Invoice", "Issued", "Manual Entry", "WH-BKK", "Nattapong K.", "Found"],
  ["SHP-2026-000031", "Document Number", "Document", "SHP-2026-000031", "Shipment", "Out for Delivery", "Manual Entry", "WH-BKK", "Warin S.", "Found"],
  ["LOT-26010", "Lot Number", "", "", "", "", "USB Scanner", "WH-CNX", "Suda R.", "Multiple Matches"],
  ["A01-01-05", "Product Code", "", "", "", "", "Manual Entry", "WH-BKK", "Warehouse Staff", "Multiple Matches"],
  ["9999999999999", "Product Barcode", "", "", "", "", "USB Scanner", "WH-BKK", "Warehouse Staff", "Not Found"],
  ["(01)0885123400013(17)261399", "GS1 Composite Code", "", "", "", "", "USB Scanner", "WH-BKK", "Warin S.", "Invalid"],
  ["AA-TH004-BK", "Product Code", "Product", "AA-TH004-BK", "A-FLEX PU50 (Black)", "Active", "Manual Entry", "WH-BKK", "Suda R.", "Found"],
  ["APL-TH-000089", "Serial Number", "Serial", "APL-TH-000089", "Apex Locator", "Available", "USB Scanner", "WH-BKK", "Warehouse Staff", "Found"],
  ["LOT-26002", "Lot Number", "Lot", "LOT-26002", "A-FLEX PU40 (Grey)", "Active", "USB Scanner", "WH-BKK", "Warehouse Staff", "Found"],
  ["GR25060001", "Document Number", "Document", "GR25060001", "Goods Receipt", "Completed", "Manual Entry", "WH-BKK", "Nattapong K.", "Found"],
  ["TRF-2026-000021", "Document Number", "Document", "TRF-2026-000021", "Stock Transfer", "Completed", "Manual Entry", "WH-CNX", "Warin S.", "Found"],
  ["CNT-2026-000021", "Document Number", "Document", "CNT-2026-000021", "Cycle Count", "Completed", "Manual Entry", "WH-BKK", "Suda R.", "Found"],
  ["ADJ-2026-000021", "Document Number", "Document", "ADJ-2026-000021", "Stock Adjustment", "Posted", "Manual Entry", "WH-BKK", "Patcharin T.", "Found"],
  ["SN-XXXX-0000", "Serial Number", "", "", "", "", "USB Scanner", "WH-CNX", "Warin S.", "Not Found"],
  ["LOT 26001", "Lot Number", "", "", "", "", "Clipboard Paste", "WH-BKK", "Suda R.", "Invalid"],
  ["(01)08851234000131(10)LOT-26001(17)280630(21)GT1-TH-000128", "GS1 Composite Code", "Product", "AA-TH003-WL", "A-FLEX PU40 (White)", "Active", "Imported Code", "WH-BKK", "Warehouse Staff", "Found"],
  ["8851234000148", "Product Barcode", "Product", "AA-TH003-GR", "A-FLEX PU40 (Grey)", "Active", "USB Scanner", "WH-BKK", "Warehouse Staff", "Found"],
  ["PKG-01", "Package Number", "", "", "", "", "USB Scanner", "WH-BKK", "Warin S.", "Multiple Matches"],
  ["DCH-TH-000016", "Serial Number", "Serial", "DCH-TH-000016", "Dental Chair", "Replaced", "Manual Entry", "WH-BKK", "Patcharin T.", "Found"],
  ["RTN-2026-000026", "Document Number", "Document", "RTN-2026-000026", "Sales Return", "Completed", "Manual Entry", "WH-RET", "Nattapong K.", "Found"],
  ["TEMP-LABEL-01", "Unknown Code", "", "", "", "", "Manual Entry", "WH-BKK", "Warehouse Staff", "Not Found"],
  ["USC-TH-000067", "Serial Number", "Serial", "USC-TH-000067", "Ultrasonic Scaler", "Lost", "USB Scanner", "WH-CNX", "Suda R.", "Found"],
  ["WH-CNX/ZONE-A/RACK-01/SHELF-01/BIN-C01", "Location Code", "Location", "WH-CNX/ZONE-A/RACK-01/SHELF-01/BIN-C01", "Chiangmai Branch", "Active", "USB Scanner", "WH-CNX", "Warin S.", "Found"],
  ["885123#00013!", "Unknown Code", "", "", "", "", "USB Scanner", "WH-BKK", "Warehouse Staff", "Invalid"],
  ["PO2506124", "Document Number", "Document", "PO2506124", "Purchase Order", "Approved", "Manual Entry", "WH-BKK", "Nattapong K.", "Found"],
];

/** Timestamps for the seeded log, newest first. */
export const SCAN_STAMPS: string[] = [
  "02/08/2026 09:41", "02/08/2026 09:38", "02/08/2026 09:30", "02/08/2026 09:12",
  "02/08/2026 08:58", "02/08/2026 08:47", "02/08/2026 08:35", "01/08/2026 17:22",
  "01/08/2026 16:58", "01/08/2026 16:40", "01/08/2026 16:11", "01/08/2026 15:47",
  "01/08/2026 15:20", "01/08/2026 14:55", "01/08/2026 14:32", "01/08/2026 13:48",
  "01/08/2026 11:26", "01/08/2026 10:57", "01/08/2026 10:31", "01/08/2026 09:44",
  "31/07/2026 17:05", "31/07/2026 16:22", "31/07/2026 15:38", "31/07/2026 14:19",
  "31/07/2026 13:40", "31/07/2026 11:52", "31/07/2026 11:03", "31/07/2026 10:14",
  "31/07/2026 09:36", "31/07/2026 08:52",
];

let scanSeq = 1000;

export function nextScanId(): string {
  scanSeq += 1;
  return `SCN-${scanSeq}`;
}

/** The live log. Seeded on first read by the domain layer. */
export const SCAN_LOG: ScanRecord[] = [];
