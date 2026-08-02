/* eslint-disable */
/**
 * SERIAL TRACKING — the overlay that gives serialized equipment a life story.
 *
 * Two populations live in this module and they behave differently:
 *
 *   1. Serials Stock Inquiry already knows about (STOCK_SERIALS). They belong
 *      to master SKUs, sit on a shelf, and Serial Tracking must agree with
 *      Stock Inquiry about where they are and what state they are in. Serial
 *      Tracking reads them; it never rewrites them.
 *
 *   2. Serialized equipment — X-ray units, chairs, autoclaves. The product
 *      master is a consumables catalogue and carries none of it, so the models
 *      below are declared here. Equipment that has been delivered, installed,
 *      returned or scrapped legitimately has no stock position, which is why a
 *      declared catalogue is the honest way to carry it.
 *
 * Nothing in this module edits a serial. Corrections and holds leave as a
 * Stock Adjustment draft, the same handoff Cycle Count and Lot Tracking use.
 */

/* ---------- Vocabularies ---------- */

export const LIFECYCLE_STATUSES = [
  "Received",
  "Pending QC",
  "QC Hold",
  "QC Passed",
  "Available",
  "Reserved",
  "Picked",
  "Packed",
  "Shipped",
  "Delivered",
  "Installed",
  "In Use",
  "Returned",
  "Return Hold",
  "Under Inspection",
  "Under Repair",
  "Repaired",
  "Replacement Pending",
  "Replaced",
  "Supplier Claim",
  "Blocked",
  "Damaged",
  "Scrapped",
  "Lost",
  "Corrected",
  "Closed",
] as const;

export const PHYSICAL_STATUSES = [
  "Available",
  "Reserved",
  "QC Hold",
  "Return Hold",
  "Damaged",
  "Blocked",
  "In Transit",
  "Service Hold",
  "Scrap Hold",
  "Sold / Customer Possession",
] as const;

export const OWNER_TYPES = [
  "A-Factory Warehouse",
  "In Transit",
  "Customer",
  "Service Center",
  "Supplier",
  "Scrapped / Closed",
] as const;

export const WARRANTY_STATUSES = [
  "Not Started",
  "Active",
  "Expiring Soon",
  "Expired",
  "Void",
  "Suspended",
  "Under Claim",
] as const;

export const WARRANTY_TYPES = [
  "Standard Manufacturer Warranty",
  "Extended Warranty",
  "Supplier Warranty",
  "Service Contract",
  "No Warranty",
] as const;

export const INSTALL_STATUSES = [
  "Not Required",
  "Pending",
  "Scheduled",
  "Completed",
  "Failed",
  "Revisit Required",
] as const;

export const SERVICE_TYPES = [
  "Installation",
  "Preventive Maintenance",
  "Repair",
  "Inspection",
  "Calibration",
  "Warranty Service",
  "Customer Complaint",
] as const;

export const SERVICE_STATUSES = [
  "Open",
  "Scheduled",
  "In Progress",
  "Waiting Parts",
  "Completed",
  "Closed",
  "Cancelled",
] as const;

export const EXCEPTION_TYPES = [
  "Duplicate Serial",
  "Missing Serial",
  "Unexpected Serial",
  "Wrong Product",
  "Wrong Warehouse",
  "Wrong Location",
  "Status Conflict",
  "Ownership Conflict",
  "Reserved by Multiple Orders",
  "In Multiple Open Transfers",
  "Shipped Without Reservation",
  "Returned Without Shipment",
  "Warranty Date Missing",
  "Unknown Serial",
  "Other",
] as const;

export const EXCEPTION_SEVERITY = ["Low", "Medium", "High", "Critical"] as const;

export const EXCEPTION_STATUSES = [
  "Open",
  "Under Investigation",
  "Pending Adjustment",
  "Escalated",
  "Resolved",
  "Closed",
] as const;

export const RETURN_DISPOSITIONS = [
  "Returned to Available",
  "Under Repair",
  "Supplier Claim",
  "Scrapped",
  "Replacement Issued",
  "Pending Inspection",
] as const;

export const OWNERSHIP_STATUSES = [
  "Delivered",
  "Installed",
  "Returned",
  "Replaced",
  "Loaned",
  "Demo Use",
] as const;

/** A warranty inside this many days reads as Expiring Soon. */
export const WARRANTY_EXPIRING_DAYS = 60;

/* ---------- Suppliers ---------- */

export interface SerialSupplier {
  supplier: string;
  supplierCode: string;
  manufacturer: string;
  country: string;
  contact: string;
  /** Months of supplier-side cover, which outlives the customer warranty. */
  supplierWarrantyMonths: number;
}

export const SERIAL_SUPPLIERS: SerialSupplier[] = [
  { supplier: "Medical Imaging Global Co., Ltd.", supplierCode: "SUP-MI01", manufacturer: "Medical Imaging Global", country: "Japan", contact: "02-700-1101", supplierWarrantyMonths: 36 },
  { supplier: "VeRay Technology Ltd.", supplierCode: "SUP-VR02", manufacturer: "VeRay Technology", country: "Taiwan", contact: "02-700-1102", supplierWarrantyMonths: 30 },
  { supplier: "DentEquip Asia Co., Ltd.", supplierCode: "SUP-DE03", manufacturer: "DentEquip Manufacturing", country: "Thailand", contact: "02-700-1103", supplierWarrantyMonths: 24 },
  { supplier: "Apex Instruments Co., Ltd.", supplierCode: "SUP-AI04", manufacturer: "Apex Instruments", country: "South Korea", contact: "02-700-1104", supplierWarrantyMonths: 24 },
  { supplier: "NSK Precision Trading", supplierCode: "SUP-NP05", manufacturer: "NSK Precision", country: "Japan", contact: "02-700-1105", supplierWarrantyMonths: 24 },
  { supplier: "Bangkok Dental Machinery", supplierCode: "SUP-BM06", manufacturer: "BDM Works", country: "Thailand", contact: "02-700-1106", supplierWarrantyMonths: 18 },
  { supplier: "Sterile Systems Co., Ltd.", supplierCode: "SUP-SS07", manufacturer: "Sterile Systems", country: "Italy", contact: "02-700-1107", supplierWarrantyMonths: 36 },
  { supplier: "OptiCam Medical Ltd.", supplierCode: "SUP-OC08", manufacturer: "OptiCam Medical", country: "China", contact: "02-700-1108", supplierWarrantyMonths: 12 },
  { supplier: "Siam Dental Equipment", supplierCode: "SUP-SD09", manufacturer: "Siam Dental Works", country: "Thailand", contact: "02-700-1109", supplierWarrantyMonths: 24 },
  { supplier: "EuroDent Technik GmbH", supplierCode: "SUP-ED10", manufacturer: "EuroDent Technik", country: "Germany", contact: "02-700-1110", supplierWarrantyMonths: 36 },
  { supplier: "Pacific Medical Devices", supplierCode: "SUP-PM11", manufacturer: "Pacific Devices", country: "Singapore", contact: "02-700-1111", supplierWarrantyMonths: 24 },
  { supplier: "Andaman Medical", supplierCode: "SUP-0031", manufacturer: "Andaman Manufacturing", country: "Thailand", contact: "02-700-1112", supplierWarrantyMonths: 18 },
  { supplier: "HDX WILL Co., Ltd.", supplierCode: "SUP-0012", manufacturer: "HDX WILL", country: "South Korea", contact: "02-700-1113", supplierWarrantyMonths: 30 },
  { supplier: "Thai Medical Instrument", supplierCode: "SUP-TM14", manufacturer: "TMI Factory", country: "Thailand", contact: "02-700-1114", supplierWarrantyMonths: 12 },
  { supplier: "Global Dental Trading", supplierCode: "SUP-GD15", manufacturer: "Global Dental Works", country: "Malaysia", contact: "02-700-1115", supplierWarrantyMonths: 24 },
];

/* ---------- Serialized equipment catalogue ---------- */

export interface SerialModel {
  /** Product code as the operational documents write it. */
  code: string;
  name: string;
  prefix: string;
  brand: string;
  cat: string;
  model: string;
  unit: string;
  icon: string;
  barcode: string;
  price: number;
  /** Customer warranty length in months. */
  warrantyMonths: number;
  supplierIndex: number;
  installRequired: boolean;
}

export const SERIAL_MODELS: SerialModel[] = [
  { code: "XRY-GT1", name: "Portable X-Ray GT1", prefix: "GT1-TH-", brand: "GT Medical", cat: "Imaging Equipment", model: "GT1", unit: "Unit", icon: "🩻", barcode: "8859000010013", price: 285000, warrantyMonths: 24, supplierIndex: 0, installRequired: true },
  { code: "XRY-VER", name: "VeRay Portable X-Ray", prefix: "VER-TH-", brand: "VeRay", cat: "Imaging Equipment", model: "VR-Port II", unit: "Unit", icon: "🩻", barcode: "8859000010020", price: 245000, warrantyMonths: 24, supplierIndex: 1, installRequired: true },
  { code: "APX-LOC", name: "Apex Locator", prefix: "APL-TH-", brand: "Apex", cat: "Endodontic Equipment", model: "AL-300", unit: "Unit", icon: "📟", barcode: "8859000010037", price: 32000, warrantyMonths: 12, supplierIndex: 3, installRequired: false },
  { code: "END-MTR", name: "Endo Motor", prefix: "END-TH-", brand: "Apex", cat: "Endodontic Equipment", model: "EM-500", unit: "Unit", icon: "🔧", barcode: "8859000010044", price: 58000, warrantyMonths: 18, supplierIndex: 3, installRequired: false },
  { code: "HPC-HS1", name: "Dental Handpiece", prefix: "HPC-TH-", brand: "NSK", cat: "Handpiece", model: "HS-1 High Speed", unit: "Unit", icon: "🦷", barcode: "8859000010051", price: 18500, warrantyMonths: 12, supplierIndex: 4, installRequired: false },
  { code: "AIR-POL", name: "Air Polisher", prefix: "APO-TH-", brand: "NSK", cat: "Prophylaxis Equipment", model: "AP-200", unit: "Unit", icon: "💨", barcode: "8859000010068", price: 42000, warrantyMonths: 12, supplierIndex: 4, installRequired: false },
  { code: "USC-SCL", name: "Ultrasonic Scaler", prefix: "USC-TH-", brand: "Siam Dental", cat: "Prophylaxis Equipment", model: "US-120", unit: "Unit", icon: "🔊", barcode: "8859000010075", price: 36000, warrantyMonths: 18, supplierIndex: 8, installRequired: false },
  { code: "DCH-U1", name: "Dental Chair", prefix: "DCH-TH-", brand: "EuroDent", cat: "Dental Unit", model: "Unit One", unit: "Set", icon: "🪑", barcode: "8859000010082", price: 480000, warrantyMonths: 36, supplierIndex: 9, installRequired: true },
  { code: "ACL-23L", name: "Autoclave", prefix: "ACL-TH-", brand: "Sterile Systems", cat: "Sterilization Equipment", model: "SS-23L Class B", unit: "Unit", icon: "♨️", barcode: "8859000010099", price: 165000, warrantyMonths: 24, supplierIndex: 6, installRequired: true },
  { code: "IOC-CAM", name: "Intraoral Camera", prefix: "IOC-TH-", brand: "OptiCam", cat: "Imaging Equipment", model: "IC-Pro", unit: "Unit", icon: "📷", barcode: "8859000010105", price: 26000, warrantyMonths: 12, supplierIndex: 7, installRequired: false },
  { code: "CUR-LGT", name: "Curing Light", prefix: "CUR-TH-", brand: "Andaman", cat: "Restorative Equipment", model: "CL-90", unit: "Unit", icon: "💡", barcode: "8859000010112", price: 14500, warrantyMonths: 12, supplierIndex: 11, installRequired: false },
  { code: "SUC-MTR", name: "Suction Motor", prefix: "SUC-TH-", brand: "BDM", cat: "Dental Unit", model: "SM-3", unit: "Unit", icon: "🌀", barcode: "8859000010129", price: 72000, warrantyMonths: 24, supplierIndex: 5, installRequired: true },
];

export const getModel = (code: string) => SERIAL_MODELS.find((m) => m.code === code);

/* ---------- Customers ---------- */

export interface SerialCustomer {
  code: string;
  name: string;
  type: string;
  contact: string;
  phone: string;
  email: string;
  rep: string;
  site: string;
}

/**
 * The first ten are the customer codes the Shipment module already uses, so a
 * serial delivered on SHP-2026-0000xx names the same customer on both screens.
 * The last five buy equipment only and are declared here.
 */
export const SERIAL_CUSTOMERS: SerialCustomer[] = [
  { code: "CUST-00001", name: "KCMH Hospital", type: "Hospital", contact: "คุณสมชาย ว.", phone: "02-256-4000", email: "purchase@kcmh.example", rep: "Thanapol S.", site: "อาคารทันตกรรม ชั้น 4" },
  { code: "CUST-00002", name: "Bangkok Dental Center", type: "Dental Clinic", contact: "คุณปรีชา ท.", phone: "02-661-8899", email: "admin@bdc.example", rep: "Thanapol S.", site: "สาขาสุขุมวิท ห้อง 3" },
  { code: "CUST-00003", name: "Smile Gallery Dental Clinic", type: "Dental Clinic", contact: "คุณนภา ส.", phone: "02-712-3344", email: "info@smilegallery.example", rep: "Warin S.", site: "ชั้น 2 ห้องหัตถการ 1" },
  { code: "CUST-00004", name: "BIDC", type: "Dental Hospital", contact: "คุณอนันต์ ก.", phone: "02-692-4433", email: "procurement@bidc.example", rep: "Warin S.", site: "อาคาร A ชั้น 5" },
  { code: "CUST-00005", name: "SAJ Dental", type: "Dental Clinic", contact: "คุณสุจิตรา จ.", phone: "02-539-1122", email: "saj@dental.example", rep: "Nattapong K.", site: "ห้องตรวจ 2" },
  { code: "CUST-00006", name: "Rajavithi Hospital", type: "Hospital", contact: "คุณวิไล ร.", phone: "02-354-8108", email: "supply@rajavithi.example", rep: "Nattapong K.", site: "ตึกทันตกรรม ชั้น 3" },
  { code: "CUST-00007", name: "Chiang Mai Dental Hospital", type: "Dental Hospital", contact: "คุณกิตติ ช.", phone: "053-944-400", email: "cmdh@example", rep: "Suda R.", site: "อาคารผู้ป่วยนอก ชั้น 2" },
  { code: "CUST-00008", name: "Phuket Dental Center", type: "Dental Clinic", contact: "คุณอารีย์ ภ.", phone: "076-249-800", email: "phuket@dental.example", rep: "Suda R.", site: "ห้องหัตถการหลัก" },
  { code: "CUST-00009", name: "Dental Vision Clinic", type: "Dental Clinic", contact: "คุณธนกร ว.", phone: "02-118-7700", email: "vision@dental.example", rep: "Thanapol S.", site: "ชั้น 1 ห้อง 4" },
  { code: "CUST-00010", name: "Central Dental Care", type: "Dental Clinic", contact: "คุณพิมพ์ใจ ค.", phone: "02-635-9911", email: "central@dental.example", rep: "Warin S.", site: "สาขาสีลม" },
  { code: "CUST-00011", name: "Songkhla Dental Hospital", type: "Dental Hospital", contact: "คุณมานพ ส.", phone: "074-445-100", email: "sdh@example", rep: "Nattapong K.", site: "อาคารทันตกรรม ชั้น 1" },
  { code: "CUST-00012", name: "Khon Kaen University Dental", type: "University", contact: "อ.ดร. สุรชัย ข.", phone: "043-202-405", email: "kku.dent@example", rep: "Suda R.", site: "คลินิกนักศึกษา ชั้น 3" },
  { code: "CUST-00013", name: "Perfect Smile Clinic", type: "Dental Clinic", contact: "คุณชนิดา พ.", phone: "02-981-4455", email: "perfect@smile.example", rep: "Thanapol S.", site: "ห้องตรวจ 1" },
  { code: "CUST-00014", name: "Andaman Dental Group", type: "Dental Group", contact: "คุณรัตนา อ.", phone: "076-388-220", email: "group@andaman.example", rep: "Suda R.", site: "สาขาป่าตอง" },
  { code: "CUST-00015", name: "Nakhon Ratchasima Hospital", type: "Hospital", contact: "คุณประยูร น.", phone: "044-235-000", email: "korat@hospital.example", rep: "Nattapong K.", site: "ตึกทันตกรรม ชั้น 2" },
];

export const getSerialCustomer = (code: string) =>
  SERIAL_CUSTOMERS.find((c) => c.code === code);

/* ---------- Warehouse bins used by equipment ---------- */

export interface SerialBin {
  warehouse: string;
  whName: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
}

/** Twenty locations across the four warehouses Stock Inquiry already uses. */
export const SERIAL_BINS: SerialBin[] = [
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-A", rack: "RACK-01", shelf: "SHELF-01", bin: "BIN-A01" },
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-A", rack: "RACK-01", shelf: "SHELF-02", bin: "BIN-A02" },
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-A", rack: "RACK-02", shelf: "SHELF-01", bin: "BIN-A03" },
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-B", rack: "RACK-01", shelf: "SHELF-01", bin: "BIN-B01" },
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-B", rack: "RACK-02", shelf: "SHELF-01", bin: "BIN-B02" },
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-B", rack: "RACK-02", shelf: "SHELF-02", bin: "BIN-B03" },
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-EQ", rack: "RACK-01", shelf: "FLOOR", bin: "BAY-01" },
  { warehouse: "WH-BKK", whName: "Bangkok Main Warehouse", zone: "ZONE-EQ", rack: "RACK-02", shelf: "FLOOR", bin: "BAY-02" },
  { warehouse: "WH-CNX", whName: "Chiang Mai Warehouse", zone: "ZONE-A", rack: "RACK-01", shelf: "SHELF-01", bin: "BIN-C01" },
  { warehouse: "WH-CNX", whName: "Chiang Mai Warehouse", zone: "ZONE-A", rack: "RACK-01", shelf: "SHELF-02", bin: "BIN-C02" },
  { warehouse: "WH-CNX", whName: "Chiang Mai Warehouse", zone: "ZONE-B", rack: "RACK-01", shelf: "SHELF-01", bin: "BIN-C03" },
  { warehouse: "WH-CNX", whName: "Chiang Mai Warehouse", zone: "ZONE-EQ", rack: "RACK-01", shelf: "FLOOR", bin: "BAY-C1" },
  { warehouse: "WH-HKT", whName: "Phuket Warehouse", zone: "ZONE-A", rack: "RACK-01", shelf: "SHELF-01", bin: "BIN-P01" },
  { warehouse: "WH-HKT", whName: "Phuket Warehouse", zone: "ZONE-A", rack: "RACK-02", shelf: "SHELF-01", bin: "BIN-P02" },
  { warehouse: "WH-HKT", whName: "Phuket Warehouse", zone: "ZONE-B", rack: "RACK-01", shelf: "SHELF-01", bin: "BIN-P03" },
  { warehouse: "WH-HKT", whName: "Phuket Warehouse", zone: "ZONE-EQ", rack: "RACK-01", shelf: "FLOOR", bin: "BAY-P1" },
  { warehouse: "WH-QTY", whName: "Quarantine Warehouse", zone: "ZONE-Q", rack: "RACK-01", shelf: "SHELF-01", bin: "QC-01" },
  { warehouse: "WH-QTY", whName: "Quarantine Warehouse", zone: "ZONE-Q", rack: "RACK-01", shelf: "SHELF-02", bin: "QC-02" },
  { warehouse: "WH-QTY", whName: "Quarantine Warehouse", zone: "ZONE-R", rack: "RACK-01", shelf: "SHELF-01", bin: "RET-01" },
  { warehouse: "WH-QTY", whName: "Quarantine Warehouse", zone: "ZONE-S", rack: "RACK-01", shelf: "FLOOR", bin: "SCRAP-01" },
];

/* ---------- How the generated population is shaped ---------- */

/**
 * Lifecycle mix for the generated equipment serials. Every state the module
 * has to render has to exist in the data, or a tab is never exercised.
 */
export const LIFECYCLE_PLAN: { lifecycle: string; count: number }[] = [
  { lifecycle: "Available", count: 22 },
  { lifecycle: "Reserved", count: 8 },
  { lifecycle: "Pending QC", count: 3 },
  { lifecycle: "QC Hold", count: 3 },
  { lifecycle: "Received", count: 3 },
  { lifecycle: "Picked", count: 3 },
  { lifecycle: "Packed", count: 2 },
  { lifecycle: "Shipped", count: 5 },
  { lifecycle: "Delivered", count: 10 },
  { lifecycle: "Installed", count: 8 },
  { lifecycle: "In Use", count: 6 },
  { lifecycle: "Returned", count: 3 },
  { lifecycle: "Return Hold", count: 2 },
  { lifecycle: "Under Repair", count: 4 },
  { lifecycle: "Repaired", count: 2 },
  { lifecycle: "Replaced", count: 2 },
  { lifecycle: "Blocked", count: 2 },
  { lifecycle: "Damaged", count: 2 },
  { lifecycle: "Scrapped", count: 3 },
  { lifecycle: "Lost", count: 1 },
  { lifecycle: "Corrected", count: 2 },
  { lifecycle: "Closed", count: 2 },
];

/* ---------- Declared serials ---------- */

export interface DeclaredSerial {
  serial: string;
  model: string;
  lifecycle: string;
  mfrSerial?: string;
  warehouse?: string;
  bin?: string;
  customerCode?: string;
  soRef?: string;
  shipRef?: string;
  invRef?: string;
  poRef?: string;
  grRef?: string;
  qcRef?: string;
  qcResult?: string;
  receivedDate?: string;
  deliveryDate?: string;
  installRef?: string;
  installDate?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  warrantyStatusOverride?: string;
  serviceJob?: string;
  returnRef?: string;
  replacedBy?: string;
  replacementOf?: string;
  claimRef?: string;
  correctedFrom?: string;
  correctedTo?: string;
  note?: string;
  /** Deliberate data conflict so the validation panel has something to catch. */
  conflict?: boolean;
}

/**
 * Hand-written serials. These carry the stories the generated population
 * cannot: the two spec examples, the replacement pair, the ownership conflict
 * and the duplicate the exception review has to report.
 */
export const DECLARED_SERIALS: DeclaredSerial[] = [
  {
    serial: "GT1-TH-000128",
    model: "XRY-GT1",
    lifecycle: "Delivered",
    mfrSerial: "MIG-GT1-2026-4471",
    customerCode: "CUST-00001",
    soRef: "SO2506-0001",
    shipRef: "SHP-2026-000031",
    invRef: "INV-2026-000023",
    poRef: "PO2506124",
    grRef: "GR25060001",
    qcRef: "QC25060032",
    qcResult: "Passed",
    receivedDate: "12/06/2026",
    deliveryDate: "01/08/2026",
    warrantyStart: "01/08/2026",
    warrantyEnd: "31/07/2028",
    note: "เครื่องเอกซเรย์พกพาส่งมอบพร้อมชุดขาตั้ง",
  },
  {
    serial: "APL-TH-000089",
    model: "APX-LOC",
    lifecycle: "Available",
    mfrSerial: "APX-AL300-88921",
    warehouse: "WH-BKK",
    bin: "BIN-A01",
    poRef: "PO2506123",
    grRef: "GR25060002",
    qcRef: "QC25060031",
    qcResult: "Passed",
    receivedDate: "04/07/2026",
  },
  {
    serial: "VER-TH-000041",
    model: "XRY-VER",
    lifecycle: "Under Repair",
    mfrSerial: "VR-PORT-II-1041",
    customerCode: "CUST-00002",
    soRef: "SO2506-0002",
    shipRef: "SHP-2026-000032",
    invRef: "INV-2026-000024",
    poRef: "PO2506122",
    grRef: "GR25060003",
    qcRef: "QC25060030",
    qcResult: "Passed",
    receivedDate: "18/03/2026",
    deliveryDate: "02/04/2026",
    installRef: "INS-2026-000006",
    installDate: "03/04/2026",
    warrantyStart: "03/04/2026",
    warrantyEnd: "02/04/2028",
    serviceJob: "SRV-2026-000014",
    note: "ลูกค้าแจ้งภาพเบลอ ส่งเข้าศูนย์บริการ",
  },
  {
    serial: "DCH-TH-000016",
    model: "DCH-U1",
    lifecycle: "Replaced",
    mfrSerial: "EDT-U1-2025-0016",
    customerCode: "CUST-00004",
    soRef: "SO2506-0003",
    shipRef: "SHP-2026-000034",
    invRef: "INV-2026-000019",
    poRef: "PO2506121",
    grRef: "GR25060004",
    qcRef: "QC25060029",
    qcResult: "Passed",
    receivedDate: "20/11/2025",
    deliveryDate: "14/01/2026",
    installRef: "INS-2026-000002",
    installDate: "16/01/2026",
    warrantyStart: "16/01/2026",
    warrantyEnd: "15/01/2029",
    returnRef: "RTN-2026-000026",
    replacedBy: "DCH-TH-000029",
    claimRef: "CLM-2026-000002",
    note: "ระบบไฮดรอลิกรั่วซ้ำ เปลี่ยนเครื่องใหม่ให้ลูกค้า",
  },
  {
    serial: "DCH-TH-000029",
    model: "DCH-U1",
    lifecycle: "Installed",
    mfrSerial: "EDT-U1-2026-0029",
    customerCode: "CUST-00004",
    soRef: "SO2506-0004",
    shipRef: "SHP-2026-000044",
    invRef: "INV-2026-000041",
    poRef: "PO2506120",
    grRef: "GR25060005",
    qcRef: "QC25060028",
    qcResult: "Passed",
    receivedDate: "10/06/2026",
    deliveryDate: "26/06/2026",
    installRef: "INS-2026-000009",
    installDate: "28/06/2026",
    warrantyStart: "28/06/2026",
    warrantyEnd: "27/06/2029",
    replacementOf: "DCH-TH-000016",
    note: "เครื่องทดแทนตามการเคลมของ DCH-TH-000016",
  },
  {
    serial: "ACL-TH-000073",
    model: "ACL-23L",
    lifecycle: "Delivered",
    mfrSerial: "SS-23L-73001",
    customerCode: "CUST-00006",
    soRef: "SO2506-0005",
    shipRef: "SHP-2026-000035",
    invRef: "INV-2026-000030",
    poRef: "PO2506119",
    grRef: "GR25060001",
    qcRef: "QC25060027",
    qcResult: "Passed",
    receivedDate: "22/05/2026",
    deliveryDate: "18/07/2026",
    warehouse: "WH-BKK",
    bin: "BAY-01",
    conflict: true,
    note: "ข้อมูลขัดแย้ง: ระบุทั้งลูกค้าและตำแหน่งในคลังพร้อมกัน",
  },
  {
    serial: "HPC-TH-000204",
    model: "HPC-HS1",
    lifecycle: "Available",
    mfrSerial: "NSK-HS1-204",
    warehouse: "WH-BKK",
    bin: "BIN-A02",
    poRef: "PO2506118",
    grRef: "GR25060002",
    qcRef: "QC25060026",
    qcResult: "Passed",
    receivedDate: "09/07/2026",
    note: "หมายเลขนี้ซ้ำกับเครื่องที่คลังเชียงใหม่ — อยู่ระหว่างตรวจสอบ",
  },
  {
    serial: "HPC-TH-000204",
    model: "HPC-HS1",
    lifecycle: "Available",
    mfrSerial: "NSK-HS1-204B",
    warehouse: "WH-CNX",
    bin: "BIN-C01",
    poRef: "PO2506117",
    grRef: "GR25060003",
    qcRef: "QC25060025",
    qcResult: "Passed",
    receivedDate: "11/07/2026",
    note: "หมายเลขซ้ำ — ต้องแก้ผ่าน Serial Correction",
  },
  {
    serial: "IOC-TH-000112",
    model: "IOC-CAM",
    lifecycle: "Corrected",
    mfrSerial: "OC-IC-112",
    warehouse: "WH-BKK",
    bin: "BIN-B01",
    poRef: "PO2506116",
    grRef: "GR25060004",
    qcRef: "QC25060032",
    qcResult: "Passed",
    receivedDate: "28/06/2026",
    correctedTo: "IOC-TH-000121",
    note: "คีย์หมายเลขผิดตอนรับเข้า แก้เป็น IOC-TH-000121",
  },
  {
    serial: "IOC-TH-000121",
    model: "IOC-CAM",
    lifecycle: "Available",
    mfrSerial: "OC-IC-121",
    warehouse: "WH-BKK",
    bin: "BIN-B01",
    poRef: "PO2506116",
    grRef: "GR25060004",
    qcRef: "QC25060032",
    qcResult: "Passed",
    receivedDate: "28/06/2026",
    correctedFrom: "IOC-TH-000112",
    note: "หมายเลขที่ถูกต้องหลังการแก้ไข",
  },
  {
    serial: "USC-TH-000067",
    model: "USC-SCL",
    lifecycle: "Lost",
    mfrSerial: "SD-US120-67",
    warehouse: "WH-CNX",
    bin: "BIN-C02",
    poRef: "PO2506115",
    grRef: "GR25060005",
    qcRef: "QC25060031",
    qcResult: "Passed",
    receivedDate: "02/04/2026",
    note: "นับรอบไม่พบตัวเครื่อง ตั้งเรื่องสอบสวนไว้",
  },
  /* Older installations, so every warranty band is represented. */
  {
    serial: "GT1-TH-000101",
    model: "XRY-GT1",
    lifecycle: "Installed",
    mfrSerial: "MIG-GT1-2024-3301",
    customerCode: "CUST-00001",
    soRef: "SO2506-0001",
    shipRef: "SHP-2026-000041",
    invRef: "INV-2026-000012",
    poRef: "PO2506118",
    grRef: "GR25060002",
    qcRef: "QC25060026",
    qcResult: "Passed",
    receivedDate: "20/12/2024",
    deliveryDate: "08/01/2026",
    installRef: "INS-2026-000001",
    installDate: "09/01/2026",
    warrantyStart: "09/01/2026",
    warrantyEnd: "20/08/2026",
    note: "รับประกันเหลือน้อยกว่า 60 วัน ต้องเสนอสัญญาบริการต่อ",
  },
  {
    serial: "ACL-TH-000031",
    model: "ACL-23L",
    lifecycle: "In Use",
    mfrSerial: "SS-23L-31007",
    customerCode: "CUST-00007",
    soRef: "SO2506-0002",
    shipRef: "SHP-2026-000036",
    invRef: "INV-2026-000014",
    poRef: "PO2506117",
    grRef: "GR25060003",
    qcRef: "QC25060025",
    qcResult: "Passed",
    receivedDate: "05/01/2024",
    deliveryDate: "18/02/2026",
    installRef: "INS-2026-000003",
    installDate: "20/02/2026",
    warrantyStart: "20/02/2026",
    warrantyEnd: "10/09/2026",
    note: "อยู่ในรอบสอบเทียบประจำปี",
  },
  {
    serial: "GT1-TH-000117",
    model: "XRY-GT1",
    lifecycle: "In Use",
    mfrSerial: "MIG-GT1-2025-3917",
    customerCode: "CUST-00012",
    soRef: "SO2506-0003",
    shipRef: "SHP-2026-000037",
    invRef: "INV-2026-000015",
    poRef: "PO2506116",
    grRef: "GR25060004",
    qcRef: "QC25060027",
    qcResult: "Passed",
    receivedDate: "14/02/2025",
    deliveryDate: "17/03/2026",
    installRef: "INS-2026-000005",
    installDate: "19/03/2026",
    warrantyStart: "19/03/2026",
    warrantyEnd: "25/09/2026",
    note: "",
  },
  {
    serial: "SUC-TH-000019",
    model: "SUC-MTR",
    lifecycle: "In Use",
    mfrSerial: "BDM-SM3-019",
    customerCode: "CUST-00002",
    soRef: "SO2506-0004",
    shipRef: "SHP-2026-000042",
    invRef: "INV-2026-000016",
    poRef: "PO2506115",
    grRef: "GR25060005",
    qcRef: "QC25060028",
    qcResult: "Passed",
    receivedDate: "18/11/2023",
    deliveryDate: "04/03/2026",
    installRef: "INS-2026-000004",
    installDate: "06/03/2026",
    warrantyStart: "06/03/2024",
    warrantyEnd: "05/03/2026",
    note: "หมดประกันแล้ว งานซ่อมคิดค่าใช้จ่าย",
  },
  {
    serial: "USC-TH-000045",
    model: "USC-SCL",
    lifecycle: "Under Repair",
    mfrSerial: "SD-US120-45",
    customerCode: "CUST-00003",
    soRef: "SO2506-0005",
    shipRef: "SHP-2026-000033",
    invRef: "INV-2026-000017",
    poRef: "PO2506119",
    grRef: "GR25060001",
    qcRef: "QC25060029",
    qcResult: "Passed",
    receivedDate: "22/09/2024",
    deliveryDate: "12/10/2024",
    warrantyStart: "12/10/2024",
    warrantyEnd: "11/04/2026",
    returnRef: "RTN-2026-000027",
    serviceJob: "SRV-2026-000019",
    claimRef: "CLM-2026-000004",
    note: "หมดประกันลูกค้าแล้ว แต่ยังอยู่ในประกันผู้ขาย",
  },
  {
    serial: "END-TH-000072",
    model: "END-MTR",
    lifecycle: "Under Repair",
    mfrSerial: "APX-EM500-72",
    customerCode: "CUST-00009",
    soRef: "SO2506-0001",
    shipRef: "SHP-2026-000039",
    invRef: "INV-2026-000018",
    poRef: "PO2506120",
    grRef: "GR25060002",
    qcRef: "QC25060030",
    qcResult: "Passed",
    receivedDate: "08/01/2025",
    deliveryDate: "02/02/2025",
    warrantyStart: "02/02/2025",
    warrantyEnd: "01/01/2026",
    returnRef: "RTN-2026-000032",
    serviceJob: "SRV-2026-000023",
    note: "หมดประกันตั้งแต่ต้นปี",
  },
  {
    serial: "END-TH-000055",
    model: "END-MTR",
    lifecycle: "Supplier Claim",
    mfrSerial: "APX-EM500-55",
    poRef: "PO2506124",
    grRef: "GR25060001",
    qcRef: "QC25060030",
    qcResult: "Failed",
    receivedDate: "26/03/2026",
    claimRef: "CLM-2026-000001",
    note: "มอเตอร์เสียตั้งแต่รับเข้า เคลมกับผู้ขาย",
  },
];

/* ---------- Installations ---------- */

export interface Installation {
  code: string;
  serial: string;
  product: string;
  customerCode: string;
  status: string;
  scheduled: string;
  completed: string;
  installedBy: string;
  site: string;
  siteContact: string;
  acceptance: string;
  note: string;
}

export const SERIAL_INSTALLS: Installation[] = [
  { code: "INS-2026-000001", serial: "GT1-TH-000101", product: "XRY-GT1", customerCode: "CUST-00001", status: "Completed", scheduled: "08/01/2026", completed: "09/01/2026", installedBy: "ช่างวิชัย ป.", site: "อาคารทันตกรรม ชั้น 4", siteContact: "คุณสมชาย ว.", acceptance: "Accepted", note: "อบรมการใช้งานให้ทีมทันตแพทย์แล้ว" },
  { code: "INS-2026-000002", serial: "DCH-TH-000016", product: "DCH-U1", customerCode: "CUST-00004", status: "Completed", scheduled: "15/01/2026", completed: "16/01/2026", installedBy: "ช่างสมพงษ์ ก.", site: "อาคาร A ชั้น 5", siteContact: "คุณอนันต์ ก.", acceptance: "Accepted", note: "ติดตั้งพร้อมระบบน้ำและลม" },
  { code: "INS-2026-000003", serial: "ACL-TH-000031", product: "ACL-23L", customerCode: "CUST-00007", status: "Completed", scheduled: "20/02/2026", completed: "20/02/2026", installedBy: "ช่างวิชัย ป.", site: "อาคารผู้ป่วยนอก ชั้น 2", siteContact: "คุณกิตติ ช.", acceptance: "Accepted", note: "" },
  { code: "INS-2026-000004", serial: "SUC-TH-000019", product: "SUC-MTR", customerCode: "CUST-00002", status: "Completed", scheduled: "05/03/2026", completed: "06/03/2026", installedBy: "ช่างสมพงษ์ ก.", site: "สาขาสุขุมวิท ห้อง 3", siteContact: "คุณปรีชา ท.", acceptance: "Accepted with Note", note: "ต้องเดินท่อระบายใหม่ในรอบถัดไป" },
  { code: "INS-2026-000005", serial: "GT1-TH-000117", product: "XRY-GT1", customerCode: "CUST-00012", status: "Completed", scheduled: "18/03/2026", completed: "19/03/2026", installedBy: "ช่างธีระ ม.", site: "คลินิกนักศึกษา ชั้น 3", siteContact: "อ.ดร. สุรชัย ข.", acceptance: "Accepted", note: "" },
  { code: "INS-2026-000006", serial: "VER-TH-000041", product: "XRY-VER", customerCode: "CUST-00002", status: "Completed", scheduled: "03/04/2026", completed: "03/04/2026", installedBy: "ช่างวิชัย ป.", site: "สาขาสุขุมวิท ห้อง 3", siteContact: "คุณปรีชา ท.", acceptance: "Accepted", note: "" },
  { code: "INS-2026-000007", serial: "ACL-TH-000058", product: "ACL-23L", customerCode: "CUST-00011", status: "Scheduled", scheduled: "12/08/2026", completed: "", installedBy: "ช่างธีระ ม.", site: "อาคารทันตกรรม ชั้น 1", siteContact: "คุณมานพ ส.", acceptance: "Pending", note: "รอลูกค้าเตรียมจุดติดตั้ง" },
  { code: "INS-2026-000008", serial: "DCH-TH-000024", product: "DCH-U1", customerCode: "CUST-00015", status: "Revisit Required", scheduled: "10/07/2026", completed: "", installedBy: "ช่างสมพงษ์ ก.", site: "ตึกทันตกรรม ชั้น 2", siteContact: "คุณประยูร น.", acceptance: "Rejected", note: "พื้นไม่ได้ระดับ ต้องกลับไปติดตั้งใหม่" },
  { code: "INS-2026-000009", serial: "DCH-TH-000029", product: "DCH-U1", customerCode: "CUST-00004", status: "Completed", scheduled: "27/06/2026", completed: "28/06/2026", installedBy: "ช่างสมพงษ์ ก.", site: "อาคาร A ชั้น 5", siteContact: "คุณอนันต์ ก.", acceptance: "Accepted", note: "เครื่องทดแทนตามการเคลม" },
  { code: "INS-2026-000010", serial: "SUC-TH-000033", product: "SUC-MTR", customerCode: "CUST-00014", status: "Pending", scheduled: "", completed: "", installedBy: "", site: "สาขาป่าตอง", siteContact: "คุณรัตนา อ.", acceptance: "Pending", note: "รอนัดหมายกับลูกค้า" },
];

/* ---------- Service jobs ---------- */

export interface ServiceJob {
  code: string;
  serial: string;
  product: string;
  type: string;
  opened: string;
  closed: string;
  customerCode: string;
  problem: string;
  diagnosis: string;
  action: string;
  parts: string;
  technician: string;
  underWarranty: boolean;
  status: string;
}

export const SERVICE_JOBS: ServiceJob[] = [
  { code: "SRV-2026-000014", serial: "VER-TH-000041", product: "XRY-VER", type: "Repair", opened: "18/07/2026", closed: "", customerCode: "CUST-00002", problem: "ภาพเอกซเรย์เบลอและมีสัญญาณรบกวน", diagnosis: "เซ็นเซอร์รับภาพเสื่อม", action: "รออะไหล่เซ็นเซอร์จากผู้ผลิต", parts: "Sensor Module VR-S2", technician: "ช่างวิชัย ป.", underWarranty: true, status: "Waiting Parts" },
  { code: "SRV-2026-000009", serial: "DCH-TH-000016", product: "DCH-U1", type: "Repair", opened: "02/05/2026", closed: "12/05/2026", customerCode: "CUST-00004", problem: "ระบบไฮดรอลิกรั่ว", diagnosis: "ซีลกระบอกไฮดรอลิกชำรุด", action: "เปลี่ยนซีลและทดสอบการทำงาน", parts: "Hydraulic Seal Kit", technician: "ช่างสมพงษ์ ก.", underWarranty: true, status: "Closed" },
  { code: "SRV-2026-000011", serial: "DCH-TH-000016", product: "DCH-U1", type: "Customer Complaint", opened: "01/06/2026", closed: "20/06/2026", customerCode: "CUST-00004", problem: "ไฮดรอลิกรั่วซ้ำหลังซ่อม", diagnosis: "โครงสร้างกระบอกมีตำหนิจากโรงงาน", action: "เสนอเปลี่ยนเครื่องใหม่และเปิดเคลมผู้ขาย", parts: "", technician: "ช่างสมพงษ์ ก.", underWarranty: true, status: "Closed" },
  { code: "SRV-2026-000003", serial: "GT1-TH-000101", product: "XRY-GT1", type: "Installation", opened: "09/01/2026", closed: "09/01/2026", customerCode: "CUST-00001", problem: "ติดตั้งและอบรมการใช้งาน", diagnosis: "—", action: "ติดตั้งพร้อมสอบเทียบเบื้องต้น", parts: "", technician: "ช่างวิชัย ป.", underWarranty: true, status: "Closed" },
  { code: "SRV-2026-000006", serial: "ACL-TH-000031", product: "ACL-23L", type: "Preventive Maintenance", opened: "15/05/2026", closed: "15/05/2026", customerCode: "CUST-00007", problem: "บำรุงรักษาตามรอบ 6 เดือน", diagnosis: "สภาพปกติ", action: "เปลี่ยนไส้กรองและทดสอบรอบฆ่าเชื้อ", parts: "Filter Set", technician: "ช่างธีระ ม.", underWarranty: true, status: "Closed" },
  { code: "SRV-2026-000017", serial: "ACL-TH-000031", product: "ACL-23L", type: "Calibration", opened: "24/07/2026", closed: "", customerCode: "CUST-00007", problem: "อุณหภูมิไม่คงที่ระหว่างรอบ", diagnosis: "อยู่ระหว่างตรวจสอบเซ็นเซอร์อุณหภูมิ", action: "นัดสอบเทียบที่หน้างาน", parts: "", technician: "ช่างธีระ ม.", underWarranty: true, status: "Scheduled" },
  { code: "SRV-2026-000021", serial: "SUC-TH-000019", product: "SUC-MTR", type: "Repair", opened: "28/07/2026", closed: "", customerCode: "CUST-00002", problem: "แรงดูดตก", diagnosis: "ใบพัดสึก", action: "สั่งอะไหล่ใบพัด", parts: "Impeller SM-3", technician: "ช่างสมพงษ์ ก.", underWarranty: false, status: "In Progress" },
  { code: "SRV-2026-000008", serial: "GT1-TH-000117", product: "XRY-GT1", type: "Inspection", opened: "22/04/2026", closed: "23/04/2026", customerCode: "CUST-00012", problem: "ตรวจสภาพประจำปีตามข้อกำหนด", diagnosis: "ปกติ", action: "ออกใบรับรองการตรวจสภาพ", parts: "", technician: "ช่างวิชัย ป.", underWarranty: true, status: "Closed" },
  { code: "SRV-2026-000019", serial: "USC-TH-000045", product: "USC-SCL", type: "Warranty Service", opened: "10/07/2026", closed: "17/07/2026", customerCode: "CUST-00003", problem: "หัวขูดสั่นไม่สม่ำเสมอ", diagnosis: "ชุดกำเนิดคลื่นเสื่อม", action: "เปลี่ยนชุดกำเนิดคลื่นภายใต้การรับประกัน", parts: "Generator US-120", technician: "ช่างธีระ ม.", underWarranty: true, status: "Closed" },
  { code: "SRV-2026-000023", serial: "END-TH-000072", product: "END-MTR", type: "Repair", opened: "30/07/2026", closed: "", customerCode: "CUST-00009", problem: "มอเตอร์หยุดกลางคัน", diagnosis: "อยู่ระหว่างตรวจสอบ", action: "รับเครื่องเข้าศูนย์บริการ", parts: "", technician: "ช่างวิชัย ป.", underWarranty: true, status: "Open" },
];

/* ---------- Returns and replacements ---------- */

export interface SerialReturnRec {
  code: string;
  serial: string;
  product: string;
  returnDate: string;
  customerCode: string;
  reason: string;
  condition: string;
  qcResult: string;
  disposition: string;
  creditNote: string;
  replacementSo: string;
  replacementSerial: string;
  status: string;
}

export const SERIAL_RETURNS: SerialReturnRec[] = [
  { code: "RTN-2026-000026", serial: "DCH-TH-000016", product: "DCH-U1", returnDate: "18/06/2026", customerCode: "CUST-00004", reason: "ชำรุดจากการผลิต", condition: "Damaged", qcResult: "Failed", disposition: "Replacement Issued", creditNote: "CN-2026-000026", replacementSo: "SO2506-0004", replacementSerial: "DCH-TH-000029", status: "Closed" },
  { code: "RTN-2026-000027", serial: "USC-TH-000045", product: "USC-SCL", returnDate: "06/07/2026", customerCode: "CUST-00003", reason: "ทำงานผิดปกติ", condition: "Used - Good", qcResult: "Passed", disposition: "Under Repair", creditNote: "", replacementSo: "", replacementSerial: "", status: "In Progress" },
  { code: "RTN-2026-000028", serial: "CUR-TH-000088", product: "CUR-LGT", returnDate: "14/07/2026", customerCode: "CUST-00005", reason: "ส่งผิดรุ่น", condition: "New - Unopened", qcResult: "Passed", disposition: "Returned to Available", creditNote: "CN-2026-000028", replacementSo: "", replacementSerial: "", status: "Closed" },
  { code: "RTN-2026-000029", serial: "IOC-TH-000095", product: "IOC-CAM", returnDate: "21/07/2026", customerCode: "CUST-00008", reason: "ภาพไม่ชัด", condition: "Used - Fair", qcResult: "Failed", disposition: "Supplier Claim", creditNote: "", replacementSo: "", replacementSerial: "", status: "In Progress" },
  { code: "RTN-2026-000030", serial: "APO-TH-000037", product: "AIR-POL", returnDate: "24/07/2026", customerCode: "CUST-00010", reason: "ลูกค้ายกเลิกการสั่งซื้อ", condition: "New - Opened", qcResult: "Passed", disposition: "Returned to Available", creditNote: "CN-2026-000030", replacementSo: "", replacementSerial: "", status: "Closed" },
  { code: "RTN-2026-000031", serial: "HPC-TH-000151", product: "HPC-HS1", returnDate: "27/07/2026", customerCode: "CUST-00013", reason: "เสียงดังผิดปกติ", condition: "Used - Good", qcResult: "Pending", disposition: "Pending Inspection", creditNote: "", replacementSo: "", replacementSerial: "", status: "Open" },
  { code: "RTN-2026-000032", serial: "END-TH-000072", product: "END-MTR", returnDate: "29/07/2026", customerCode: "CUST-00009", reason: "มอเตอร์หยุดทำงาน", condition: "Used - Poor", qcResult: "Pending", disposition: "Under Repair", creditNote: "", replacementSo: "", replacementSerial: "", status: "Open" },
  { code: "RTN-2026-000033", serial: "GT1-TH-000133", product: "XRY-GT1", returnDate: "31/07/2026", customerCode: "CUST-00015", reason: "สเปกไม่ตรงกับที่สั่ง", condition: "New - Unopened", qcResult: "Passed", disposition: "Replacement Issued", creditNote: "", replacementSo: "SO2506-0005", replacementSerial: "GT1-TH-000140", status: "In Progress" },
];

export interface Replacement {
  code: string;
  returnedSerial: string;
  replacementSerial: string;
  product: string;
  customerCode: string;
  date: string;
  reason: string;
  document: string;
  status: string;
}

export const REPLACEMENTS: Replacement[] = [
  { code: "RPL-2026-000001", returnedSerial: "DCH-TH-000016", replacementSerial: "DCH-TH-000029", product: "DCH-U1", customerCode: "CUST-00004", date: "26/06/2026", reason: "ระบบไฮดรอลิกชำรุดซ้ำ", document: "SO2506-0004", status: "Completed" },
  { code: "RPL-2026-000002", returnedSerial: "GT1-TH-000133", replacementSerial: "GT1-TH-000140", product: "XRY-GT1", customerCode: "CUST-00015", date: "31/07/2026", reason: "ส่งผิดสเปก", document: "SO2506-0005", status: "Pending" },
  { code: "RPL-2026-000003", returnedSerial: "IOC-TH-000095", replacementSerial: "IOC-TH-000121", product: "IOC-CAM", customerCode: "CUST-00008", date: "26/07/2026", reason: "คุณภาพภาพไม่ผ่านเกณฑ์", document: "SO2506-0004", status: "Pending" },
  { code: "RPL-2026-000004", returnedSerial: "USC-TH-000045", replacementSerial: "USC-TH-000061", product: "USC-SCL", customerCode: "CUST-00003", date: "17/07/2026", reason: "เปลี่ยนเครื่องระหว่างซ่อม", document: "SO2506-0003", status: "Completed" },
  { code: "RPL-2026-000005", returnedSerial: "APO-TH-000037", replacementSerial: "APO-TH-000052", product: "AIR-POL", customerCode: "CUST-00010", date: "25/07/2026", reason: "ลูกค้าขอเปลี่ยนรุ่น", document: "SO2506-0002", status: "Cancelled" },
];

/* ---------- Supplier claims ---------- */

export interface SupplierClaim {
  code: string;
  serial: string;
  supplierCode: string;
  claimDate: string;
  reason: string;
  relatedReturn: string;
  relatedQc: string;
  status: string;
  replacementSerial: string;
  creditRef: string;
}

export const SUPPLIER_CLAIMS: SupplierClaim[] = [
  { code: "CLM-2026-000001", serial: "END-TH-000055", supplierCode: "SUP-AI04", claimDate: "28/03/2026", reason: "มอเตอร์ชำรุดตั้งแต่รับเข้า ไม่ผ่าน QC", relatedReturn: "", relatedQc: "QC25060030", status: "Approved", replacementSerial: "END-TH-000063", creditRef: "—" },
  { code: "CLM-2026-000002", serial: "DCH-TH-000016", supplierCode: "SUP-ED10", claimDate: "22/06/2026", reason: "ตำหนิจากการผลิตของกระบอกไฮดรอลิก", relatedReturn: "RTN-2026-000026", relatedQc: "", status: "Under Review", replacementSerial: "", creditRef: "—" },
  { code: "CLM-2026-000003", serial: "IOC-TH-000095", supplierCode: "SUP-OC08", claimDate: "23/07/2026", reason: "คุณภาพเซ็นเซอร์ภาพต่ำกว่าสเปก", relatedReturn: "RTN-2026-000029", relatedQc: "", status: "Submitted", replacementSerial: "", creditRef: "—" },
  { code: "CLM-2026-000004", serial: "USC-TH-000045", supplierCode: "SUP-SD09", claimDate: "12/07/2026", reason: "ชุดกำเนิดคลื่นเสียหายภายในระยะรับประกันผู้ขาย", relatedReturn: "RTN-2026-000027", relatedQc: "", status: "Approved", replacementSerial: "", creditRef: "—" },
];

/* ---------- Serial corrections ---------- */

export interface SerialCorrection {
  code: string;
  date: string;
  wrongSerial: string;
  correctSerial: string;
  product: string;
  warehouse: string;
  location: string;
  reason: string;
  approvedBy: string;
  status: string;
}

/**
 * Corrections are recorded, never applied here — each one names the Stock
 * Adjustment that actually moved the serial.
 */
export const SERIAL_CORRECTIONS: SerialCorrection[] = [
  { code: "ADJ-2026-000031", date: "29/06/2026", wrongSerial: "IOC-TH-000112", correctSerial: "IOC-TH-000121", product: "IOC-CAM", warehouse: "WH-BKK", location: "ZONE-B-RACK-01-BIN-B01", reason: "คีย์หมายเลขผิดตอนรับเข้า", approvedBy: "Patcharin T.", status: "Posted" },
  { code: "ADJ-2026-000034", date: "05/07/2026", wrongSerial: "APL-TH-000079", correctSerial: "APL-TH-000097", product: "APX-LOC", warehouse: "WH-BKK", location: "ZONE-A-RACK-01-BIN-A01", reason: "สลับหมายเลขกับเครื่องข้างเคียง", approvedBy: "Patcharin T.", status: "Posted" },
  { code: "ADJ-2026-000038", date: "16/07/2026", wrongSerial: "CUR-TH-000061", correctSerial: "CUR-TH-000160", product: "CUR-LGT", warehouse: "WH-CNX", location: "ZONE-A-RACK-01-BIN-C01", reason: "อ่านบาร์โค้ดผิดตอนนับรอบ", approvedBy: "Suda R.", status: "Posted" },
  { code: "ADJ-2026-000041", date: "26/07/2026", wrongSerial: "SUC-TH-000028", correctSerial: "SUC-TH-000082", product: "SUC-MTR", warehouse: "WH-HKT", location: "ZONE-EQ-RACK-01-BAY-P1", reason: "ป้ายหมายเลขหลุดและติดใหม่ผิดเครื่อง", approvedBy: "Warin S.", status: "Pending Approval" },
];

/* ---------- Exception review ---------- */

export interface SerialException {
  code: string;
  serial: string;
  product: string;
  type: string;
  severity: string;
  expected: string;
  actual: string;
  description: string;
  responsible: string;
  evidence: string;
  resolution: string;
  followUp: string;
  status: string;
  raisedBy: string;
  raisedDate: string;
  /** Set once the fix has been handed to Stock Adjustment. */
  adjustmentRef: string;
  notes: { note: string; by: string; when: string }[];
}

export const SERIAL_EXCEPTIONS: SerialException[] = [
  {
    code: "SEX-2026-000001",
    serial: "HPC-TH-000204",
    product: "HPC-HS1",
    type: "Duplicate Serial",
    severity: "High",
    expected: "หมายเลขเครื่องต้องไม่ซ้ำภายในสินค้าเดียวกัน",
    actual: "พบ HPC-TH-000204 ทั้งที่ WH-BKK และ WH-CNX",
    description: "รับเข้าสองใบจากผู้ขายเดียวกันและได้หมายเลขซ้ำ ต้องแก้หมายเลขหนึ่งในสองเครื่อง",
    responsible: "Warehouse Team",
    evidence: "ภาพถ่ายป้ายหมายเลขทั้งสองเครื่อง",
    resolution: "",
    followUp: "08/08/2026",
    status: "Under Investigation",
    raisedBy: "Suda R.",
    raisedDate: "12/07/2026",
    adjustmentRef: "",
    notes: [{ note: "ยืนยันจากภาพถ่ายว่าเป็นคนละเครื่องจริง", by: "Suda R.", when: "12/07/2026 14:20" }],
  },
  {
    code: "SEX-2026-000002",
    serial: "USC-TH-000067",
    product: "USC-SCL",
    type: "Missing Serial",
    severity: "High",
    expected: "อยู่ที่ WH-CNX ZONE-A BIN-C02",
    actual: "นับรอบสองครั้งไม่พบตัวเครื่อง",
    description: "เครื่องหายจากตำแหน่งที่ระบบระบุ ต้องตั้งใบปรับปรุงสต๊อกหลังการสอบสวน",
    responsible: "Chiang Mai Warehouse",
    evidence: "ใบนับรอบ CNT-2026-000012",
    resolution: "",
    followUp: "10/08/2026",
    status: "Pending Adjustment",
    raisedBy: "Warin S.",
    raisedDate: "20/07/2026",
    adjustmentRef: "",
    notes: [{ note: "ค้นซ้ำทั้งโซน A แล้วยังไม่พบ", by: "Warin S.", when: "22/07/2026 09:15" }],
  },
  {
    code: "SEX-2026-000003",
    serial: "ACL-TH-000073",
    product: "ACL-23L",
    type: "Ownership Conflict",
    severity: "Critical",
    expected: "เครื่องที่ส่งมอบแล้วต้องไม่มีตำแหน่งในคลัง",
    actual: "ระบุลูกค้า CUST-00006 พร้อมตำแหน่ง WH-BKK BAY-01",
    description: "ข้อมูลความเป็นเจ้าของขัดแย้งกัน ต้องตรวจว่าเครื่องถูกส่งจริงหรือยังอยู่ที่คลัง",
    responsible: "Inventory Manager",
    evidence: "ใบส่งของ SHP-2026-000035",
    resolution: "",
    followUp: "05/08/2026",
    status: "Open",
    raisedBy: "Patcharin T.",
    raisedDate: "28/07/2026",
    adjustmentRef: "",
    notes: [],
  },
  {
    code: "SEX-2026-000004",
    serial: "SUC-TH-000028",
    product: "SUC-MTR",
    type: "Wrong Location",
    severity: "Medium",
    expected: "WH-HKT ZONE-EQ BAY-P1",
    actual: "พบจริงที่ ZONE-B BIN-P03",
    description: "ป้ายหมายเลขหลุดและถูกติดใหม่ผิดเครื่อง แก้ผ่าน Serial Correction แล้ว",
    responsible: "Phuket Warehouse",
    evidence: "ใบปรับปรุง ADJ-2026-000041",
    resolution: "แก้หมายเลขเป็น SUC-TH-000082 และย้ายกลับตำแหน่งเดิม",
    followUp: "",
    status: "Resolved",
    raisedBy: "Warin S.",
    raisedDate: "24/07/2026",
    adjustmentRef: "ADJ-2026-000041",
    notes: [{ note: "ปิดหลังใบปรับปรุงผ่านการอนุมัติ", by: "Warin S.", when: "26/07/2026 16:40" }],
  },
  {
    code: "SEX-2026-000005",
    serial: "END-TH-000055",
    product: "END-MTR",
    type: "Warranty Date Missing",
    severity: "Low",
    expected: "เครื่องที่รับเข้าแล้วต้องมีวันเริ่มรับประกันของผู้ขาย",
    actual: "ไม่มีวันเริ่มรับประกันในเอกสารรับเข้า",
    description: "ผู้ขายยังไม่ส่งใบรับประกัน ต้องติดตามก่อนปิดการเคลม",
    responsible: "Purchasing",
    evidence: "ใบเคลม CLM-2026-000001",
    resolution: "",
    followUp: "15/08/2026",
    status: "Open",
    raisedBy: "Nattapong K.",
    raisedDate: "30/03/2026",
    adjustmentRef: "",
    notes: [],
  },
];

let exceptionSeq = SERIAL_EXCEPTIONS.length;

export function nextExceptionCode(): string {
  exceptionSeq += 1;
  return `SEX-2026-${String(exceptionSeq).padStart(6, "0")}`;
}
