/**
 * Shipment — physical dispatch and delivery tracking of outbound goods.
 * Raised after Picking, Packing and a Delivery Order have prepared the load.
 *
 *   Delivery Order → Sales Invoice → Shipment → Delivered
 *
 *   Draft → Ready to Dispatch → Dispatched → In Transit → Out for Delivery
 *         → Delivered / Partially Delivered / Delivery Failed / Rescheduled
 *         → Returned / Cancelled / Exception
 *
 * Shipment carries NO pricing and never touches invoice amounts. Stock movement
 * stays with the existing Delivery / Outbound rules.
 *
 * Mock dataset; mutating these arrays is how the prototype persists changes.
 */

export interface ShpLine {
  line: number;
  code: string;
  name: string;
  /** Line on the delivery order this came from. */
  doLine: number;
  orderedQty: number;
  prevShippedQty: number;
  shipmentQty: number;
  deliveredQty: number;
  unit: string;
  warehouse: string;
  bin: string;
  lot: string;
  serial: string;
  packageNo: string;
  deliveryStatus: string;
  note: string;
}

export interface ShpPackage {
  no: string;
  type: string;
  boxType: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  trackingNo: string;
  sealNo: string;
  status: string;
  note: string;
}

export interface TrackEvent {
  status: string;
  when: string;
  location: string;
  by: string;
  remark: string;
}

export interface ShpException {
  type: string;
  when: string;
  desc: string;
  severity: string;
  party: string;
  resolution: string;
  followUp: string;
  status: string;
}

export interface ProofOfDelivery {
  recipient: string;
  position: string;
  phone: string;
  date: string;
  time: string;
  result: string;
  /** Placeholders in Phase 1 — no real capture or upload. */
  signature: string;
  photo: string;
  gps: string;
  remark: string;
}

export interface Shipment {
  code: string;
  doRef: string;
  soRef: string;
  invRef: string;

  customer: string;
  customerCode: string;
  deliveryAddress: string;
  contactPerson: string;
  contactPhone: string;
  deliveryInstruction: string;
  customerRef: string;
  salesRep: string;

  status: string;
  deliveryStatus: string;
  priority: string;
  shippingMethod: string;

  warehouse: string;
  branch: string;
  loadingBay: string;
  dispatchTeam: string;

  carrier: string;
  carrierService: string;
  trackingNo: string;
  driver: string;
  driverPhone: string;
  vehicleType: string;
  vehicleNo: string;
  route: string;

  shipmentDate: string;
  dispatchDate: string;
  expectedDelivery: string;
  actualDelivery: string;
  pickupTime: string;
  specialInstructions: string;

  rescheduleReason: string;
  rescheduledFrom: string;
  cancelReason: string;
  returnRef: string;

  items: ShpLine[];
  packages: ShpPackage[];
  tracking: TrackEvent[];
  exceptions: ShpException[];
  pod: ProofOfDelivery | null;

  note: string;
  history: { t: string; d: string; u: string; when: string; kind: string }[];
  audit: { event: string; user: string; when: string; field: string; from: string; to: string; kind: string }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const SHP_STATUS = [
  "Draft",
  "Ready to Dispatch",
  "Dispatched",
  "In Transit",
  "Out for Delivery",
  "Delivered",
  "Partially Delivered",
  "Delivery Failed",
  "Rescheduled",
  "Returned",
  "Cancelled",
  "Exception",
] as const;

export const SHP_DELIVERY_STATUS = [
  "Pending",
  "Ready",
  "Dispatched",
  "In Transit",
  "Out for Delivery",
  "Delivered",
  "Partially Delivered",
  "Failed",
  "Rescheduled",
  "Returned",
  "Cancelled",
] as const;

export const SHP_PRIORITY = ["Low", "Normal", "High", "Critical"] as const;

export const SHP_SHIPPING_METHODS = [
  "Company Vehicle",
  "Courier",
  "Express Courier",
  "Postal Service",
  "Customer Pickup",
  "Third-Party Logistics",
  "Installation Delivery",
  "Government Delivery",
] as const;

export const SHP_CARRIERS = [
  "A-Factory Delivery",
  "Kerry Express",
  "Flash Express",
  "Thailand Post",
  "DHL",
  "FedEx",
  "Customer Pickup",
] as const;

/** Carriers we run ourselves — these need a driver and a vehicle. */
export const SHP_OWN_FLEET = ["A-Factory Delivery"] as const;

export const SHP_CARRIER_SERVICES = [
  "Standard",
  "Express",
  "Same Day",
  "Next Day",
  "Economy",
  "Cold Chain",
  "Self Pickup",
] as const;

export const SHP_DRIVERS = [
  "Mr. Anan",
  "Mr. Somchai",
  "Mr. Teerapat",
  "Mr. Wichai",
  "—",
] as const;

export const SHP_DRIVER_PHONE: Record<string, string> = {
  "Mr. Anan": "081-555-7788",
  "Mr. Somchai": "081-555-2211",
  "Mr. Teerapat": "089-441-9900",
  "Mr. Wichai": "086-220-3344",
};

export const SHP_VEHICLE_TYPES = [
  "Van",
  "Pickup Truck",
  "6-Wheel Truck",
  "Motorcycle",
  "Refrigerated Van",
] as const;

export const SHP_VEHICLES = ["AFD-01", "AFD-02", "AFD-03", "1กก-1234", "2ขข-5678", "—"] as const;

export const SHP_ROUTES = [
  "Bangkok Route 1",
  "Bangkok Route 2",
  "Bangkok Route 3",
  "Central Route",
  "Northern Route",
  "Southern Route",
  "Courier Handover",
] as const;

export const SHP_LOADING_BAYS = ["LB-01", "LB-02", "LB-03", "LB-04"] as const;

export const SHP_DISPATCH_TEAMS = ["Team A", "Team B", "Team C"] as const;

export const SHP_PACKAGE_TYPES = [
  "Carton",
  "Box",
  "Pallet",
  "Envelope",
  "Crate",
  "Cooler Box",
  "Custom",
] as const;

export const SHP_BOX_TYPES = [
  "Carton S (30×20×15 cm)",
  "Carton M (40×30×25 cm)",
  "Carton L (60×40×40 cm)",
  "Pallet EUR (120×80×15 cm)",
  "Cooler Box 20L",
  "Document Envelope",
] as const;

export const SHP_PACKAGE_STATUS = ["Packed", "Sealed", "Loaded", "Delivered", "Damaged"] as const;

export const SHP_TRACK_STATUS = [
  "Shipment Created",
  "Ready to Dispatch",
  "Picked Up",
  "Dispatched",
  "In Transit",
  "Arrived at Hub",
  "Out for Delivery",
  "Delivered",
  "Delivery Failed",
  "Rescheduled",
  "Returned",
] as const;

export const SHP_DELIVERY_RESULTS = [
  "Fully Delivered",
  "Partially Delivered",
  "Customer Rejected",
  "Address Not Found",
  "Customer Unavailable",
  "Damaged in Transit",
  "Other",
] as const;

export const SHP_EXCEPTION_TYPES = [
  "Customer Unavailable",
  "Incorrect Address",
  "Delivery Delayed",
  "Vehicle Problem",
  "Product Damaged",
  "Package Damaged",
  "Missing Package",
  "Wrong Product",
  "Customer Rejected",
  "Force Majeure",
  "Other",
] as const;

export const SHP_SEVERITY = ["Low", "Medium", "High", "Critical"] as const;

export const SHP_RESPONSIBLE = [
  "ลูกค้า",
  "ผู้ขนส่ง",
  "คลังสินค้า",
  "ฝ่ายขาย",
  "เหตุสุดวิสัย",
] as const;

export const SHP_RESCHEDULE_REASONS = [
  "ลูกค้าขอเลื่อนวันรับของ",
  "ไม่มีผู้รับที่ปลายทาง",
  "รถขนส่งมีปัญหา",
  "สภาพอากาศ / เหตุสุดวิสัย",
  "ที่อยู่จัดส่งไม่ถูกต้อง",
  "อื่น ๆ",
] as const;

export const SHP_CANCEL_REASONS = [
  "ลูกค้ายกเลิกคำสั่งซื้อ",
  "สร้างใบขนส่งซ้ำ",
  "รวมรอบส่งกับใบอื่น",
  "ของไม่พร้อมส่ง",
  "อื่น ๆ",
] as const;

/* ---------- Builders keeping the records readable ---------- */

const ln = (
  n: number,
  code: string,
  name: string,
  unit: string,
  qty: number,
  opts: Partial<ShpLine> = {},
): ShpLine => ({
  line: n,
  code,
  name,
  doLine: n,
  orderedQty: qty,
  prevShippedQty: 0,
  shipmentQty: qty,
  deliveredQty: 0,
  unit,
  warehouse: "WH-BKK Bangkok Main Warehouse",
  bin: "A-01-02",
  lot: "",
  serial: "",
  packageNo: "PKG-01",
  deliveryStatus: "Pending",
  note: "",
  ...opts,
});

const pkg = (
  no: string,
  boxType: string,
  weight: number,
  opts: Partial<ShpPackage> = {},
): ShpPackage => ({
  no,
  type: "Carton",
  boxType,
  length: 40,
  width: 30,
  height: 25,
  weight,
  trackingNo: "",
  sealNo: "",
  status: "Sealed",
  note: "",
  ...opts,
});

const ev = (status: string, when: string, location: string, by: string, remark = ""): TrackEvent => ({
  status,
  when,
  location,
  by,
  remark,
});

const hist = (t: string, d: string, u: string, when: string, kind = "primary") => ({ t, d, u, when, kind });

const CREATED = (when: string, u = "Warehouse Staff") =>
  hist("Shipment created", "สร้างใบขนส่ง", u, when, "");

export const SHIPMENTS: Shipment[] = [
  {
    code: "SHP-2026-000031",
    doRef: "DO-2026-000014",
    soRef: "SO-2026-000031",
    invRef: "INV-2026-000025",
    customer: "KCMH Hospital",
    customerCode: "CUST-00001",
    deliveryAddress: "187/1 Phetchaburi Rd., Ratchathewi, Bangkok 10400",
    contactPerson: "Khun Somchai",
    contactPhone: "02-123-4567",
    deliveryInstruction: "Deliver to receiving department (Building A)",
    customerRef: "PO-0526-014",
    salesRep: "Thanapol S.",
    status: "Out for Delivery",
    deliveryStatus: "Out for Delivery",
    priority: "High",
    shippingMethod: "Company Vehicle",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-02",
    dispatchTeam: "Team A",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "AF260801001",
    driver: "Mr. Anan",
    driverPhone: "081-555-7788",
    vehicleType: "Van",
    vehicleNo: "AFD-01",
    route: "Bangkok Route 2",
    shipmentDate: "31/07/2026",
    dispatchDate: "01/08/2026 09:30",
    expectedDelivery: "01/08/2026",
    actualDelivery: "",
    pickupTime: "01/08/2026 08:45",
    specialInstructions: "โทรแจ้งก่อนถึง 30 นาที",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "CMP-A3-001", "Composite A3", "Syringe", 10, { deliveredQty: 0, lot: "LOT-2607-A1" }),
      ln(2, "SCT-001", "Scaler Tip", "Box", 20, { packageNo: "PKG-02", deliveredQty: 0 }),
      ln(3, "BND-001", "Bonding Agent", "Bottle", 15, { packageNo: "PKG-03", deliveredQty: 0 }),
    ],
    packages: [
      pkg("PKG-01", "Carton M (40×30×25 cm)", 18.5, { sealNo: "SEAL-31001", status: "Loaded", trackingNo: "AF260801001-1" }),
      pkg("PKG-02", "Carton M (40×30×25 cm)", 24.0, { sealNo: "SEAL-31002", status: "Loaded", trackingNo: "AF260801001-2" }),
      pkg("PKG-03", "Carton S (30×20×15 cm)", 20.0, { sealNo: "SEAL-31003", status: "Loaded", trackingNo: "AF260801001-3" }),
    ],
    tracking: [
      ev("Out for Delivery", "01/08/2026 08:45", "Bangkok Route 2", "Mr. Anan", "On the way to customer"),
      ev("In Transit", "01/08/2026 07:30", "Bangkok DC", "Mr. Anan", "Departed from DC"),
      ev("Dispatched", "01/08/2026 09:30", "Head Office", "Mr. Anan", "Shipment dispatched"),
      ev("Ready to Dispatch", "31/07/2026 16:00", "Head Office", "Warehouse Staff", "Ready for dispatch"),
      ev("Shipment Created", "31/07/2026 10:20", "Head Office", "Warehouse Staff", "Shipment created"),
    ],
    exceptions: [],
    pod: null,
    note: "",
    history: [
      hist("Out for delivery", "รถออกจากศูนย์กระจายสินค้าแล้ว", "Mr. Anan", "01/08/2026 08:45", "info"),
      hist("Dispatched", "ออกจากคลัง 3 กล่อง", "Mr. Anan", "01/08/2026 09:30"),
      hist("Marked ready", "จัดของขึ้นรถเรียบร้อย", "Warehouse Staff", "31/07/2026 16:00", "info"),
      CREATED("31/07/2026 10:20"),
    ],
    audit: [
      { event: "Status changed", user: "Mr. Anan", when: "01/08/2026 08:45", field: "status", from: "In Transit", to: "Out for Delivery", kind: "info" },
      { event: "Shipment created", user: "Warehouse Staff", when: "31/07/2026 10:20", field: "—", from: "—", to: "Draft", kind: "" },
    ],
    created: "31/07/2026 10:20",
    createdBy: "Warehouse Staff",
    updated: "01/08/2026 08:45",
    updatedBy: "Mr. Anan",
  },
  {
    code: "SHP-2026-000032",
    doRef: "DO-2026-000015",
    soRef: "SO-2026-000032",
    invRef: "INV-2026-000024",
    customer: "Bangkok Dental Center",
    customerCode: "CUST-00002",
    deliveryAddress: "88/9 Sukhumvit 24, Khlong Toei, Bangkok 10110",
    contactPerson: "Khun Preecha T.",
    contactPhone: "02-661-8899",
    deliveryInstruction: "รับของหลัง 13:00 น.",
    customerRef: "BDC-PO-2244",
    salesRep: "Thanapol S.",
    status: "In Transit",
    deliveryStatus: "In Transit",
    priority: "Normal",
    shippingMethod: "Courier",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-01",
    dispatchTeam: "Team B",
    carrier: "Kerry Express",
    carrierService: "Standard",
    trackingNo: "KER260801002",
    driver: "—",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "—",
    route: "Courier Handover",
    shipmentDate: "31/07/2026",
    dispatchDate: "01/08/2026 10:15",
    expectedDelivery: "02/08/2026",
    actualDelivery: "",
    pickupTime: "01/08/2026 10:00",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "SCT-001", "Scaler Tip", "Box", 18),
      ln(2, "BND-001", "Bonding Agent", "Bottle", 10, { packageNo: "PKG-02" }),
    ],
    packages: [
      pkg("PKG-01", "Carton M (40×30×25 cm)", 15.0, { trackingNo: "KER260801002-1", status: "Loaded" }),
      pkg("PKG-02", "Carton S (30×20×15 cm)", 13.0, { trackingNo: "KER260801002-2", status: "Loaded" }),
    ],
    tracking: [
      ev("In Transit", "01/08/2026 14:20", "Kerry Bangkok Hub", "Kerry Express", "Arrived at sorting hub"),
      ev("Picked Up", "01/08/2026 10:15", "Head Office", "Kerry Express", "Courier collected"),
      ev("Ready to Dispatch", "31/07/2026 17:10", "Head Office", "Warehouse Staff", ""),
      ev("Shipment Created", "31/07/2026 11:00", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [],
    pod: null,
    note: "",
    history: [
      hist("In transit", "ถึงศูนย์คัดแยกของ Kerry", "Kerry Express", "01/08/2026 14:20", "info"),
      hist("Dispatched", "ส่งมอบให้ขนส่งแล้ว", "Warehouse Staff", "01/08/2026 10:15"),
      CREATED("31/07/2026 11:00"),
    ],
    audit: [
      { event: "Status changed", user: "Kerry Express", when: "01/08/2026 14:20", field: "status", from: "Dispatched", to: "In Transit", kind: "info" },
    ],
    created: "31/07/2026 11:00",
    createdBy: "Warehouse Staff",
    updated: "01/08/2026 14:20",
    updatedBy: "Kerry Express",
  },
  {
    code: "SHP-2026-000033",
    doRef: "DO-2026-000016",
    soRef: "SO-2026-000033",
    invRef: "INV-2026-000023",
    customer: "Smile Gallery Dental Clinic",
    customerCode: "CUST-00003",
    deliveryAddress: "45 Thonglor Soi 10, Watthana, Bangkok 10110",
    contactPerson: "Khun Nichada P.",
    contactPhone: "02-712-3300",
    deliveryInstruction: "",
    customerRef: "SG-PO-0091",
    salesRep: "Kanyarat P.",
    status: "Delivered",
    deliveryStatus: "Delivered",
    priority: "Normal",
    shippingMethod: "Courier",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-01",
    dispatchTeam: "Team B",
    carrier: "Flash Express",
    carrierService: "Express",
    trackingNo: "FLA260731005",
    driver: "—",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "—",
    route: "Courier Handover",
    shipmentDate: "30/07/2026",
    dispatchDate: "31/07/2026 09:00",
    expectedDelivery: "31/07/2026",
    actualDelivery: "31/07/2026 15:40",
    pickupTime: "31/07/2026 08:50",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "BND-001", "Bonding Agent", "Bottle", 50, { deliveredQty: 50, deliveryStatus: "Delivered" }),
      ln(2, "CMP-A3-001", "Composite A3", "Syringe", 5, { packageNo: "PKG-02", deliveredQty: 5, deliveryStatus: "Delivered" }),
    ],
    packages: [
      pkg("PKG-01", "Carton L (60×40×40 cm)", 22.0, { status: "Delivered", trackingNo: "FLA260731005-1" }),
      pkg("PKG-02", "Carton S (30×20×15 cm)", 8.0, { status: "Delivered", trackingNo: "FLA260731005-2" }),
    ],
    tracking: [
      ev("Delivered", "31/07/2026 15:40", "Thonglor, Bangkok", "Flash Express", "Signed by Khun Nichada P."),
      ev("Out for Delivery", "31/07/2026 12:30", "Flash Bangkok Hub", "Flash Express", ""),
      ev("In Transit", "31/07/2026 10:20", "Flash Bangkok Hub", "Flash Express", ""),
      ev("Picked Up", "31/07/2026 09:00", "Head Office", "Flash Express", ""),
      ev("Shipment Created", "30/07/2026 14:00", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [],
    pod: {
      recipient: "Khun Nichada P.",
      position: "Clinic Manager",
      phone: "02-712-3300",
      date: "31/07/2026",
      time: "15:40",
      result: "Fully Delivered",
      signature: "ลายเซ็นอิเล็กทรอนิกส์ (จำลอง)",
      photo: "pod-shp033.jpg",
      gps: "13.7300, 100.5820",
      remark: "Delivered in good condition.",
    },
    note: "",
    history: [
      hist("Delivered", "ผู้รับ: Khun Nichada P. — รับครบ 55 หน่วย", "Flash Express", "31/07/2026 15:40"),
      hist("Dispatched", "ส่งมอบให้ขนส่ง", "Warehouse Staff", "31/07/2026 09:00"),
      CREATED("30/07/2026 14:00"),
    ],
    audit: [
      { event: "Delivery confirmed", user: "Flash Express", when: "31/07/2026 15:40", field: "status", from: "Out for Delivery", to: "Delivered", kind: "primary" },
    ],
    created: "30/07/2026 14:00",
    createdBy: "Warehouse Staff",
    updated: "31/07/2026 15:40",
    updatedBy: "Flash Express",
  },
  {
    code: "SHP-2026-000034",
    doRef: "DO-2026-000017",
    soRef: "SO-2026-000034",
    invRef: "INV-2026-000022",
    customer: "BIDC",
    customerCode: "CUST-00004",
    deliveryAddress: "157 Sukhumvit 2, Khlong Toei, Bangkok 10110",
    contactPerson: "Khun Wanida K.",
    contactPhone: "02-251-0800",
    deliveryInstruction: "ติดต่อฝ่ายจัดซื้อชั้น 3",
    customerRef: "BIDC-PO-7781",
    salesRep: "Thanapol S.",
    status: "Delivery Failed",
    deliveryStatus: "Failed",
    priority: "Normal",
    shippingMethod: "Courier",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-01",
    dispatchTeam: "Team B",
    carrier: "Kerry Express",
    carrierService: "Standard",
    trackingNo: "KER260731003",
    driver: "—",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "—",
    route: "Courier Handover",
    shipmentDate: "30/07/2026",
    dispatchDate: "31/07/2026 08:30",
    expectedDelivery: "31/07/2026",
    actualDelivery: "",
    pickupTime: "31/07/2026 08:20",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [ln(1, "XRY-GT1", "Portable X-Ray GT1", "Set", 10, { packageNo: "PKG-01" })],
    packages: [pkg("PKG-01", "Pallet EUR (120×80×15 cm)", 120.0, { type: "Pallet", status: "Loaded", trackingNo: "KER260731003-1" })],
    tracking: [
      ev("Delivery Failed", "31/07/2026 16:10", "Khlong Toei, Bangkok", "Kerry Express", "Customer unavailable at delivery time"),
      ev("Out for Delivery", "31/07/2026 13:00", "Kerry Bangkok Hub", "Kerry Express", ""),
      ev("Dispatched", "31/07/2026 08:30", "Head Office", "Warehouse Staff", ""),
      ev("Shipment Created", "30/07/2026 15:30", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [
      {
        type: "Customer Unavailable",
        when: "31/07/2026 16:10",
        desc: "ไม่มีผู้รับที่ปลายทาง โทรติดต่อไม่ได้ 2 ครั้ง",
        severity: "Medium",
        party: "ลูกค้า",
        resolution: "นัดส่งใหม่วันที่ 03/08/2026",
        followUp: "03/08/2026",
        status: "Open",
      },
    ],
    pod: null,
    note: "รอยืนยันวันนัดส่งใหม่จากลูกค้า",
    history: [
      hist("Delivery failed", "เหตุผล: Customer Unavailable", "Kerry Express", "31/07/2026 16:10", "warn"),
      hist("Dispatched", "ส่งมอบให้ขนส่ง", "Warehouse Staff", "31/07/2026 08:30"),
      CREATED("30/07/2026 15:30"),
    ],
    audit: [
      { event: "Status changed", user: "Kerry Express", when: "31/07/2026 16:10", field: "status", from: "Out for Delivery", to: "Delivery Failed", kind: "warn" },
    ],
    created: "30/07/2026 15:30",
    createdBy: "Warehouse Staff",
    updated: "31/07/2026 16:10",
    updatedBy: "Kerry Express",
  },
  {
    code: "SHP-2026-000035",
    doRef: "DO-2026-000018",
    soRef: "SO-2026-000035",
    invRef: "INV-2026-000020",
    customer: "Rajavithi Hospital",
    customerCode: "CUST-00006",
    deliveryAddress: "2 Phaya Thai Rd., Ratchathewi, Bangkok 10400",
    contactPerson: "Khun Duangjai M.",
    contactPhone: "02-354-8108",
    deliveryInstruction: "ส่งที่คลังพัสดุกลาง อาคาร 2",
    customerRef: "RJV-2569-0881",
    salesRep: "Narin C.",
    status: "Partially Delivered",
    deliveryStatus: "Partially Delivered",
    priority: "Critical",
    shippingMethod: "Company Vehicle",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-03",
    dispatchTeam: "Team A",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "AF260731004",
    driver: "Mr. Somchai",
    driverPhone: "081-555-2211",
    vehicleType: "6-Wheel Truck",
    vehicleNo: "AFD-02",
    route: "Bangkok Route 1",
    shipmentDate: "30/07/2026",
    dispatchDate: "31/07/2026 07:45",
    expectedDelivery: "01/08/2026",
    actualDelivery: "31/07/2026 14:20",
    pickupTime: "31/07/2026 07:30",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "SCT-001", "Scaler Tip", "Box", 20, { deliveredQty: 20, deliveryStatus: "Delivered" }),
      ln(2, "BND-001", "Bonding Agent", "Bottle", 10, { packageNo: "PKG-02", deliveredQty: 4, deliveryStatus: "Partially Delivered", note: "ลูกค้ารับได้เพียง 4 ขวด พื้นที่จัดเก็บไม่พอ" }),
    ],
    packages: [
      pkg("PKG-01", "Carton M (40×30×25 cm)", 20.0, { status: "Delivered" }),
      pkg("PKG-02", "Carton S (30×20×15 cm)", 12.0, { status: "Loaded" }),
    ],
    tracking: [
      ev("Delivered", "31/07/2026 14:20", "Rajavithi Hospital", "Mr. Somchai", "Partially delivered — 24 of 30 units accepted"),
      ev("Out for Delivery", "31/07/2026 11:00", "Bangkok Route 1", "Mr. Somchai", ""),
      ev("Dispatched", "31/07/2026 07:45", "Head Office", "Mr. Somchai", ""),
      ev("Shipment Created", "30/07/2026 16:40", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [],
    pod: {
      recipient: "Khun Duangjai M.",
      position: "Storekeeper",
      phone: "02-354-8108",
      date: "31/07/2026",
      time: "14:20",
      result: "Partially Delivered",
      signature: "ลายเซ็นอิเล็กทรอนิกส์ (จำลอง)",
      photo: "pod-shp035.jpg",
      gps: "13.7650, 100.5370",
      remark: "รับได้บางส่วน ส่วนที่เหลือขอให้ส่งรอบถัดไป",
    },
    note: "คงเหลือ 6 ขวด ต้องเปิดใบขนส่งรอบใหม่",
    history: [
      hist("Partially delivered", "รับ 24 จาก 30 หน่วย — คงเหลือรอส่งรอบใหม่", "Mr. Somchai", "31/07/2026 14:20", "warn"),
      hist("Dispatched", "ออกจากคลัง", "Mr. Somchai", "31/07/2026 07:45"),
      CREATED("30/07/2026 16:40"),
    ],
    audit: [
      { event: "Delivery confirmed", user: "Mr. Somchai", when: "31/07/2026 14:20", field: "status", from: "Out for Delivery", to: "Partially Delivered", kind: "warn" },
    ],
    created: "30/07/2026 16:40",
    createdBy: "Warehouse Staff",
    updated: "31/07/2026 14:20",
    updatedBy: "Mr. Somchai",
  },
  {
    code: "SHP-2026-000036",
    doRef: "DO-2026-000019",
    soRef: "SO-2026-000036",
    invRef: "INV-2026-000019",
    customer: "Chiang Mai Dental Hospital",
    customerCode: "CUST-00007",
    deliveryAddress: "88 Suthep Rd., Mueang Chiang Mai, Chiang Mai 50200",
    contactPerson: "Khun Pimchanok W.",
    contactPhone: "053-944-400",
    deliveryInstruction: "",
    customerRef: "CMDH-PO-3312",
    salesRep: "Supavita Y.",
    status: "In Transit",
    deliveryStatus: "In Transit",
    priority: "Normal",
    shippingMethod: "Express Courier",
    warehouse: "WH-CNX Chiang Mai Warehouse",
    branch: "Chiang Mai Branch",
    loadingBay: "LB-01",
    dispatchTeam: "Team C",
    carrier: "DHL",
    carrierService: "Next Day",
    trackingNo: "DHL260730001",
    driver: "—",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "—",
    route: "Northern Route",
    shipmentDate: "29/07/2026",
    dispatchDate: "30/07/2026 09:20",
    expectedDelivery: "01/08/2026",
    actualDelivery: "",
    pickupTime: "30/07/2026 09:00",
    specialInstructions: "เอกสารกำกับต้องแนบไปกับกล่องที่ 1",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "CMP-A3-001", "Composite A3", "Syringe", 8, { warehouse: "WH-CNX Chiang Mai Warehouse", bin: "C-01-01" }),
      ln(2, "SCT-001", "Scaler Tip", "Box", 12, { packageNo: "PKG-02", warehouse: "WH-CNX Chiang Mai Warehouse", bin: "C-01-02" }),
      ln(3, "BND-001", "Bonding Agent", "Bottle", 10, { packageNo: "PKG-03", warehouse: "WH-CNX Chiang Mai Warehouse", bin: "C-02-01" }),
    ],
    packages: [
      pkg("PKG-01", "Carton S (30×20×15 cm)", 9.5, { trackingNo: "DHL260730001-1", status: "Loaded" }),
      pkg("PKG-02", "Carton M (40×30×25 cm)", 11.0, { trackingNo: "DHL260730001-2", status: "Loaded" }),
      pkg("PKG-03", "Carton S (30×20×15 cm)", 9.5, { trackingNo: "DHL260730001-3", status: "Loaded" }),
    ],
    tracking: [
      ev("In Transit", "31/07/2026 06:15", "DHL Chiang Mai Hub", "DHL", "Arrived at destination hub"),
      ev("Dispatched", "30/07/2026 09:20", "Chiang Mai Branch", "DHL", ""),
      ev("Shipment Created", "29/07/2026 15:10", "Chiang Mai Branch", "Warehouse Staff", ""),
    ],
    exceptions: [],
    pod: null,
    note: "",
    history: [
      hist("In transit", "ถึงศูนย์กระจายสินค้าเชียงใหม่", "DHL", "31/07/2026 06:15", "info"),
      CREATED("29/07/2026 15:10"),
    ],
    audit: [],
    created: "29/07/2026 15:10",
    createdBy: "Warehouse Staff",
    updated: "31/07/2026 06:15",
    updatedBy: "DHL",
  },
  {
    code: "SHP-2026-000037",
    doRef: "DO-2026-000020",
    soRef: "SO-2026-000037",
    invRef: "INV-2026-000018",
    customer: "Phuket Dental Center",
    customerCode: "CUST-00008",
    deliveryAddress: "12/5 Thepkrasattri Rd., Mueang Phuket, Phuket 83000",
    contactPerson: "Khun Arisa T.",
    contactPhone: "076-215-500",
    deliveryInstruction: "",
    customerRef: "PDC-0221",
    salesRep: "Somchai S.",
    status: "Ready to Dispatch",
    deliveryStatus: "Ready",
    priority: "High",
    shippingMethod: "Postal Service",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-04",
    dispatchTeam: "Team B",
    carrier: "Thailand Post",
    carrierService: "Economy",
    trackingNo: "THP260730002",
    driver: "—",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "—",
    route: "Southern Route",
    shipmentDate: "30/07/2026",
    dispatchDate: "",
    expectedDelivery: "02/08/2026",
    actualDelivery: "",
    pickupTime: "",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "BND-001", "Bonding Agent", "Bottle", 20),
      ln(2, "SCT-001", "Scaler Tip", "Box", 5, { packageNo: "PKG-01" }),
    ],
    packages: [pkg("PKG-01", "Carton M (40×30×25 cm)", 16.0, { sealNo: "SEAL-37001", status: "Sealed" })],
    tracking: [
      ev("Ready to Dispatch", "30/07/2026 17:20", "Head Office", "Warehouse Staff", "Packed and sealed"),
      ev("Shipment Created", "30/07/2026 14:05", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [],
    pod: null,
    note: "",
    history: [
      hist("Marked ready", "แพ็คและปิดผนึกเรียบร้อย", "Warehouse Staff", "30/07/2026 17:20", "info"),
      CREATED("30/07/2026 14:05"),
    ],
    audit: [],
    created: "30/07/2026 14:05",
    createdBy: "Warehouse Staff",
    updated: "30/07/2026 17:20",
    updatedBy: "Warehouse Staff",
  },
  {
    code: "SHP-2026-000038",
    doRef: "DO-2026-000021",
    soRef: "SO-2026-000038",
    invRef: "INV-2026-000021",
    customer: "SAJ Dental",
    customerCode: "CUST-00005",
    deliveryAddress: "9/1 Ratchadaphisek Rd., Din Daeng, Bangkok 10400",
    contactPerson: "Khun Sarocha J.",
    contactPhone: "02-641-2200",
    deliveryInstruction: "",
    customerRef: "SAJ-0455",
    salesRep: "Kanyarat P.",
    status: "Dispatched",
    deliveryStatus: "Dispatched",
    priority: "Normal",
    shippingMethod: "Courier",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-02",
    dispatchTeam: "Team B",
    carrier: "Flash Express",
    carrierService: "Standard",
    trackingNo: "FLA260729001",
    driver: "—",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "—",
    route: "Courier Handover",
    shipmentDate: "29/07/2026",
    dispatchDate: "31/07/2026 08:00",
    expectedDelivery: "31/07/2026",
    actualDelivery: "",
    pickupTime: "31/07/2026 07:50",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "CMP-A3-001", "Composite A3", "Syringe", 12),
      ln(2, "BND-001", "Bonding Agent", "Bottle", 9, { packageNo: "PKG-02" }),
    ],
    packages: [
      pkg("PKG-01", "Carton M (40×30×25 cm)", 14.0, { trackingNo: "FLA260729001-1", status: "Loaded" }),
      pkg("PKG-02", "Carton S (30×20×15 cm)", 7.0, { trackingNo: "FLA260729001-2", status: "Loaded" }),
    ],
    tracking: [
      ev("Dispatched", "31/07/2026 08:00", "Head Office", "Warehouse Staff", "Handed over to Flash Express"),
      ev("Ready to Dispatch", "30/07/2026 16:30", "Head Office", "Warehouse Staff", ""),
      ev("Shipment Created", "29/07/2026 13:20", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [],
    pod: null,
    note: "",
    history: [
      hist("Dispatched", "ส่งมอบให้ Flash Express", "Warehouse Staff", "31/07/2026 08:00"),
      CREATED("29/07/2026 13:20"),
    ],
    audit: [
      { event: "Status changed", user: "Warehouse Staff", when: "31/07/2026 08:00", field: "status", from: "Ready to Dispatch", to: "Dispatched", kind: "primary" },
    ],
    created: "29/07/2026 13:20",
    createdBy: "Warehouse Staff",
    updated: "31/07/2026 08:00",
    updatedBy: "Warehouse Staff",
  },
  {
    code: "SHP-2026-000039",
    doRef: "DO-2026-000022",
    soRef: "SO-2026-000039",
    invRef: "",
    customer: "Dental Vision Clinic",
    customerCode: "CUST-00009",
    deliveryAddress: "77/12 Ladprao 71, Wang Thonglang, Bangkok 10310",
    contactPerson: "Khun Voranuch S.",
    contactPhone: "02-514-7788",
    deliveryInstruction: "",
    customerRef: "DVC-0088",
    salesRep: "Thanapol S.",
    status: "Delivered",
    deliveryStatus: "Delivered",
    priority: "Normal",
    shippingMethod: "Company Vehicle",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-02",
    dispatchTeam: "Team A",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "AF260729002",
    driver: "Mr. Teerapat",
    driverPhone: "089-441-9900",
    vehicleType: "Pickup Truck",
    vehicleNo: "AFD-03",
    route: "Bangkok Route 3",
    shipmentDate: "29/07/2026",
    dispatchDate: "30/07/2026 08:30",
    expectedDelivery: "30/07/2026",
    actualDelivery: "30/07/2026 11:15",
    pickupTime: "30/07/2026 08:20",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [ln(1, "SCT-001", "Scaler Tip", "Box", 6, { deliveredQty: 6, deliveryStatus: "Delivered" })],
    packages: [pkg("PKG-01", "Carton S (30×20×15 cm)", 6.5, { status: "Delivered" })],
    tracking: [
      ev("Delivered", "30/07/2026 11:15", "Wang Thonglang, Bangkok", "Mr. Teerapat", "Received by clinic staff"),
      ev("Out for Delivery", "30/07/2026 09:40", "Bangkok Route 3", "Mr. Teerapat", ""),
      ev("Dispatched", "30/07/2026 08:30", "Head Office", "Mr. Teerapat", ""),
      ev("Shipment Created", "29/07/2026 10:00", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [],
    pod: {
      recipient: "Khun Voranuch S.",
      position: "Clinic Owner",
      phone: "02-514-7788",
      date: "30/07/2026",
      time: "11:15",
      result: "Fully Delivered",
      signature: "ลายเซ็นอิเล็กทรอนิกส์ (จำลอง)",
      photo: "pod-shp039.jpg",
      gps: "13.7900, 100.6050",
      remark: "",
    },
    note: "",
    history: [
      hist("Delivered", "ผู้รับ: Khun Voranuch S.", "Mr. Teerapat", "30/07/2026 11:15"),
      CREATED("29/07/2026 10:00"),
    ],
    audit: [],
    created: "29/07/2026 10:00",
    createdBy: "Warehouse Staff",
    updated: "30/07/2026 11:15",
    updatedBy: "Mr. Teerapat",
  },
  {
    code: "SHP-2026-000040",
    doRef: "DO-2026-000023",
    soRef: "SO-2026-000040",
    invRef: "",
    customer: "Central Dental Care",
    customerCode: "CUST-00010",
    deliveryAddress: "9 Rama IX Rd., Huai Khwang, Bangkok 10310",
    contactPerson: "Khun Natthapong R.",
    contactPhone: "02-245-6600",
    deliveryInstruction: "",
    customerRef: "",
    salesRep: "Kanyarat P.",
    status: "Cancelled",
    deliveryStatus: "Cancelled",
    priority: "Normal",
    shippingMethod: "Courier",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-01",
    dispatchTeam: "Team B",
    carrier: "Kerry Express",
    carrierService: "Standard",
    trackingNo: "KER260728001",
    driver: "—",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "—",
    route: "Courier Handover",
    shipmentDate: "28/07/2026",
    dispatchDate: "",
    expectedDelivery: "30/07/2026",
    actualDelivery: "",
    pickupTime: "",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "ลูกค้ายกเลิกคำสั่งซื้อ",
    returnRef: "",
    items: [ln(1, "BND-001", "Bonding Agent", "Bottle", 12)],
    packages: [],
    tracking: [ev("Shipment Created", "28/07/2026 11:40", "Head Office", "Warehouse Staff", "")],
    exceptions: [],
    pod: null,
    note: "",
    history: [
      hist("Cancelled", "เหตุผล: ลูกค้ายกเลิกคำสั่งซื้อ", "Sales Admin", "29/07/2026 09:15", "warn"),
      CREATED("28/07/2026 11:40"),
    ],
    audit: [
      { event: "Status changed", user: "Sales Admin", when: "29/07/2026 09:15", field: "status", from: "Draft", to: "Cancelled", kind: "warn" },
    ],
    created: "28/07/2026 11:40",
    createdBy: "Warehouse Staff",
    updated: "29/07/2026 09:15",
    updatedBy: "Sales Admin",
  },
  {
    code: "SHP-2026-000041",
    doRef: "DO-2026-000024",
    soRef: "SO-2026-000041",
    invRef: "",
    customer: "KCMH Hospital",
    customerCode: "CUST-00001",
    deliveryAddress: "187/1 Phetchaburi Rd., Ratchathewi, Bangkok 10400",
    contactPerson: "Khun Somchai",
    contactPhone: "02-123-4567",
    deliveryInstruction: "Deliver to receiving department (Building A)",
    customerRef: "PO-0526-015",
    salesRep: "Thanapol S.",
    status: "Draft",
    deliveryStatus: "Pending",
    priority: "Normal",
    shippingMethod: "Company Vehicle",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "",
    dispatchTeam: "",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "",
    driver: "",
    driverPhone: "",
    vehicleType: "Van",
    vehicleNo: "",
    route: "",
    shipmentDate: "31/07/2026",
    dispatchDate: "",
    expectedDelivery: "04/08/2026",
    actualDelivery: "",
    pickupTime: "",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "CMP-A3-001", "Composite A3", "Syringe", 6, { packageNo: "" }),
      ln(2, "XRY-GT1", "Portable X-Ray GT1", "Set", 1, { packageNo: "", serial: "" }),
    ],
    packages: [],
    tracking: [ev("Shipment Created", "31/07/2026 16:50", "Head Office", "Warehouse Staff", "")],
    exceptions: [],
    pod: null,
    note: "ร่างใบขนส่ง รอจัดกล่องและมอบหมายคนขับ",
    history: [CREATED("31/07/2026 16:50")],
    audit: [
      { event: "Shipment created", user: "Warehouse Staff", when: "31/07/2026 16:50", field: "—", from: "—", to: "Draft", kind: "" },
    ],
    created: "31/07/2026 16:50",
    createdBy: "Warehouse Staff",
    updated: "31/07/2026 16:50",
    updatedBy: "Warehouse Staff",
  },
  {
    code: "SHP-2026-000042",
    doRef: "DO-2026-000025",
    soRef: "SO-2026-000042",
    invRef: "",
    customer: "Bangkok Dental Center",
    customerCode: "CUST-00002",
    deliveryAddress: "88/9 Sukhumvit 24, Khlong Toei, Bangkok 10110",
    contactPerson: "Khun Preecha T.",
    contactPhone: "02-661-8899",
    deliveryInstruction: "",
    customerRef: "BDC-PO-2251",
    salesRep: "Thanapol S.",
    status: "Rescheduled",
    deliveryStatus: "Rescheduled",
    priority: "Normal",
    shippingMethod: "Company Vehicle",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-02",
    dispatchTeam: "Team A",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "AF260728003",
    driver: "Mr. Wichai",
    driverPhone: "086-220-3344",
    vehicleType: "Van",
    vehicleNo: "AFD-01",
    route: "Bangkok Route 2",
    shipmentDate: "28/07/2026",
    dispatchDate: "29/07/2026 08:15",
    expectedDelivery: "03/08/2026",
    actualDelivery: "",
    pickupTime: "29/07/2026 08:00",
    specialInstructions: "",
    rescheduleReason: "ลูกค้าขอเลื่อนวันรับของ",
    rescheduledFrom: "30/07/2026",
    cancelReason: "",
    returnRef: "",
    items: [ln(1, "SCT-001", "Scaler Tip", "Box", 15)],
    packages: [pkg("PKG-01", "Carton M (40×30×25 cm)", 13.5, { status: "Loaded" })],
    tracking: [
      ev("Rescheduled", "30/07/2026 10:30", "Bangkok Route 2", "Mr. Wichai", "Customer requested new date 03/08/2026"),
      ev("Out for Delivery", "30/07/2026 09:00", "Bangkok Route 2", "Mr. Wichai", ""),
      ev("Dispatched", "29/07/2026 08:15", "Head Office", "Mr. Wichai", ""),
      ev("Shipment Created", "28/07/2026 14:00", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [
      {
        type: "Delivery Delayed",
        when: "30/07/2026 10:30",
        desc: "ลูกค้าแจ้งเลื่อนวันรับของเป็น 03/08/2026",
        severity: "Low",
        party: "ลูกค้า",
        resolution: "เลื่อนกำหนดส่งและนำของกลับคลัง",
        followUp: "03/08/2026",
        status: "Resolved",
      },
    ],
    pod: null,
    note: "",
    history: [
      hist("Rescheduled", "เลื่อนจาก 30/07/2026 เป็น 03/08/2026 — ลูกค้าขอเลื่อนวันรับของ", "Mr. Wichai", "30/07/2026 10:30", "warn"),
      CREATED("28/07/2026 14:00"),
    ],
    audit: [
      { event: "Delivery rescheduled", user: "Mr. Wichai", when: "30/07/2026 10:30", field: "expectedDelivery", from: "30/07/2026", to: "03/08/2026", kind: "warn" },
    ],
    created: "28/07/2026 14:00",
    createdBy: "Warehouse Staff",
    updated: "30/07/2026 10:30",
    updatedBy: "Mr. Wichai",
  },
  {
    code: "SHP-2026-000043",
    doRef: "DO-2026-000026",
    soRef: "SO-2026-000043",
    invRef: "",
    customer: "Smile Gallery Dental Clinic",
    customerCode: "CUST-00003",
    deliveryAddress: "45 Thonglor Soi 10, Watthana, Bangkok 10110",
    contactPerson: "Khun Nichada P.",
    contactPhone: "02-712-3300",
    deliveryInstruction: "",
    customerRef: "SG-PO-0095",
    salesRep: "Kanyarat P.",
    status: "Returned",
    deliveryStatus: "Returned",
    priority: "Normal",
    shippingMethod: "Company Vehicle",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-02",
    dispatchTeam: "Team A",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "AF260727001",
    driver: "Mr. Anan",
    driverPhone: "081-555-7788",
    vehicleType: "Van",
    vehicleNo: "AFD-01",
    route: "Bangkok Route 2",
    shipmentDate: "27/07/2026",
    dispatchDate: "28/07/2026 08:00",
    expectedDelivery: "28/07/2026",
    actualDelivery: "",
    pickupTime: "28/07/2026 07:50",
    specialInstructions: "",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "RET-2026-000004",
    items: [ln(1, "CMP-A3-001", "Composite A3", "Syringe", 4, { note: "ลูกค้าปฏิเสธรับของ สินค้าไม่ตรงรุ่น" })],
    packages: [pkg("PKG-01", "Carton S (30×20×15 cm)", 5.0, { status: "Damaged" })],
    tracking: [
      ev("Returned", "28/07/2026 15:00", "Head Office", "Mr. Anan", "Goods returned to warehouse"),
      ev("Delivery Failed", "28/07/2026 11:20", "Thonglor, Bangkok", "Mr. Anan", "Customer rejected the goods"),
      ev("Out for Delivery", "28/07/2026 09:30", "Bangkok Route 2", "Mr. Anan", ""),
      ev("Dispatched", "28/07/2026 08:00", "Head Office", "Mr. Anan", ""),
      ev("Shipment Created", "27/07/2026 15:20", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [
      {
        type: "Customer Rejected",
        when: "28/07/2026 11:20",
        desc: "ลูกค้าแจ้งว่าสินค้าไม่ตรงรุ่นที่สั่ง ปฏิเสธรับของทั้งหมด",
        severity: "High",
        party: "ฝ่ายขาย",
        resolution: "นำของกลับคลัง และเปิดคำขอคืนสินค้า RET-2026-000004",
        followUp: "29/07/2026",
        status: "Resolved",
      },
    ],
    pod: null,
    note: "เปิดคำขอคืนสินค้าแล้ว",
    history: [
      hist("Returned to warehouse", "นำของกลับคลัง เปิดคำขอคืน RET-2026-000004", "Mr. Anan", "28/07/2026 15:00", "warn"),
      hist("Delivery failed", "ลูกค้าปฏิเสธรับของ", "Mr. Anan", "28/07/2026 11:20", "warn"),
      CREATED("27/07/2026 15:20"),
    ],
    audit: [
      { event: "Return request created", user: "Mr. Anan", when: "28/07/2026 15:00", field: "returnRef", from: "—", to: "RET-2026-000004", kind: "warn" },
    ],
    created: "27/07/2026 15:20",
    createdBy: "Warehouse Staff",
    updated: "28/07/2026 15:00",
    updatedBy: "Mr. Anan",
  },
  {
    code: "SHP-2026-000044",
    doRef: "DO-2026-000027",
    soRef: "SO-2026-000044",
    invRef: "",
    customer: "BIDC",
    customerCode: "CUST-00004",
    deliveryAddress: "157 Sukhumvit 2, Khlong Toei, Bangkok 10110",
    contactPerson: "Khun Wanida K.",
    contactPhone: "02-251-0800",
    deliveryInstruction: "",
    customerRef: "BIDC-PO-7790",
    salesRep: "Thanapol S.",
    status: "Exception",
    deliveryStatus: "In Transit",
    priority: "High",
    shippingMethod: "Third-Party Logistics",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "LB-03",
    dispatchTeam: "Team C",
    carrier: "FedEx",
    carrierService: "Express",
    trackingNo: "FDX260729004",
    driver: "—",
    driverPhone: "",
    vehicleType: "6-Wheel Truck",
    vehicleNo: "—",
    route: "Central Route",
    shipmentDate: "29/07/2026",
    dispatchDate: "30/07/2026 07:00",
    expectedDelivery: "31/07/2026",
    actualDelivery: "",
    pickupTime: "30/07/2026 06:50",
    specialInstructions: "สินค้าเปราะบาง ห้ามวางซ้อน",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [ln(1, "XRY-GT1", "Portable X-Ray GT1", "Set", 2, { serial: "XG1-2607-0011, XG1-2607-0012" })],
    packages: [pkg("PKG-01", "Crate", 85.0, { type: "Crate", status: "Damaged", note: "กล่องมีรอยบุบด้านข้าง" })],
    tracking: [
      ev("In Transit", "31/07/2026 09:10", "FedEx Bangkok Hub", "FedEx", "Package damage reported at hub"),
      ev("Dispatched", "30/07/2026 07:00", "Head Office", "Warehouse Staff", ""),
      ev("Shipment Created", "29/07/2026 16:30", "Head Office", "Warehouse Staff", ""),
    ],
    exceptions: [
      {
        type: "Package Damaged",
        when: "31/07/2026 09:10",
        desc: "ขนส่งแจ้งว่ากล่องมีรอยบุบระหว่างขนย้ายที่ศูนย์คัดแยก ต้องตรวจสภาพสินค้าก่อนส่งต่อ",
        severity: "Critical",
        party: "ผู้ขนส่ง",
        resolution: "",
        followUp: "01/08/2026",
        status: "Open",
      },
    ],
    pod: null,
    note: "รอผลตรวจสภาพสินค้าจากขนส่ง",
    history: [
      hist("Exception recorded", "Package Damaged — ระดับ Critical", "Logistics", "31/07/2026 09:10", "warn"),
      CREATED("29/07/2026 16:30"),
    ],
    audit: [
      { event: "Exception recorded", user: "Logistics", when: "31/07/2026 09:10", field: "exceptions", from: "0", to: "1", kind: "warn" },
    ],
    created: "29/07/2026 16:30",
    createdBy: "Warehouse Staff",
    updated: "31/07/2026 09:10",
    updatedBy: "Logistics",
  },
  {
    code: "SHP-2026-000045",
    doRef: "DO-2026-000028",
    soRef: "SO-2026-000045",
    invRef: "",
    customer: "Rajavithi Hospital",
    customerCode: "CUST-00006",
    deliveryAddress: "2 Phaya Thai Rd., Ratchathewi, Bangkok 10400",
    contactPerson: "Khun Duangjai M.",
    contactPhone: "02-354-8108",
    deliveryInstruction: "ส่งที่คลังพัสดุกลาง อาคาร 2",
    customerRef: "RJV-2569-0890",
    salesRep: "Narin C.",
    status: "Draft",
    deliveryStatus: "Pending",
    priority: "Normal",
    shippingMethod: "Government Delivery",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    branch: "Head Office",
    loadingBay: "",
    dispatchTeam: "",
    carrier: "A-Factory Delivery",
    carrierService: "Standard",
    trackingNo: "",
    driver: "",
    driverPhone: "",
    vehicleType: "6-Wheel Truck",
    vehicleNo: "",
    route: "",
    shipmentDate: "01/08/2026",
    dispatchDate: "",
    expectedDelivery: "05/08/2026",
    actualDelivery: "",
    pickupTime: "",
    specialInstructions: "ต้องมีเอกสารส่งมอบราชการแนบ",
    rescheduleReason: "",
    rescheduledFrom: "",
    cancelReason: "",
    returnRef: "",
    items: [
      ln(1, "BND-001", "Bonding Agent", "Bottle", 6, { packageNo: "", prevShippedQty: 4, orderedQty: 10 }),
    ],
    packages: [],
    tracking: [ev("Shipment Created", "01/08/2026 09:05", "Head Office", "Warehouse Staff", "Remaining from SHP-2026-000035")],
    exceptions: [],
    pod: null,
    note: "ส่วนที่เหลือจาก SHP-2026-000035 ที่ลูกค้ารับไม่ครบ",
    history: [CREATED("01/08/2026 09:05")],
    audit: [],
    created: "01/08/2026 09:05",
    createdBy: "Warehouse Staff",
    updated: "01/08/2026 09:05",
    updatedBy: "Warehouse Staff",
  },
];
