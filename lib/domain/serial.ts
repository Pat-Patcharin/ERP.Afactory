import {
  DECLARED_SERIALS,
  LIFECYCLE_PLAN,
  REPLACEMENTS,
  SERIAL_BINS,
  SERIAL_CORRECTIONS,
  SERIAL_CUSTOMERS,
  SERIAL_EXCEPTIONS,
  SERIAL_INSTALLS,
  SERIAL_MODELS,
  SERIAL_RETURNS,
  SERIAL_SUPPLIERS,
  SERVICE_JOBS,
  SUPPLIER_CLAIMS,
  WARRANTY_EXPIRING_DAYS,
  getModel,
  getSerialCustomer,
  type DeclaredSerial,
  type SerialModel,
} from "@/data/serials";
import type { BadgeTone, RecordBase } from "@/lib/types";
import { getProduct } from "./product";
import { parseStamp } from "./inventory";
import { formatDate } from "@/lib/format";
import { STOCK_SERIALS } from "./stock";
import { movementRows } from "./movement";
import { GOODS_RECEIPTS, PUTAWAY_TASKS, QC_INSPECTIONS } from "./inbound";
import { DELIVERY_ORDERS, PICKING_TASKS, SALES_ORDERS } from "./outbound";
import { SHIPMENTS } from "./shipment";
import { SALES_RETURNS } from "./sales-return";
import { PURCHASE_ORDERS } from "./purchase";
import { SALES_INVOICES } from "./invoice";

/* ============================================================
   SERIAL TRACKING — one unit, followed from supplier to customer.

   Read-only by construction. Nothing here writes a serial, a
   position or a document; the only thing that leaves the module is
   a Stock Adjustment draft raised from an exception, the same
   handoff Cycle Count and Lot Tracking use.

   The master is the UNION of every serial the ERP mentions:
   Stock Inquiry's serial catalogue, the declared equipment models,
   and every serial named by an installation, service job, return,
   replacement, claim, correction or exception. A serial referenced
   anywhere therefore always resolves to a row.
   ============================================================ */

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const DAY = 86_400_000;

/* ---------- Dates ---------- */

/** dd/mm/yyyy → epoch, the format every mock document already uses. */
export const parseDate = (v: string): number | null => parseStamp(v);

/* `formatDate` from lib/format, not a local copy. See the note there. */
const fmtDate = formatDate;

export function addMonths(v: string, months: number): string {
  const t = parseDate(v);
  if (!t) return "";
  const d = new Date(t);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  /* Rolling 31 Jan by one month must not land in March. */
  if (d.getDate() < day) d.setDate(0);
  return fmtDate(d.getTime());
}

export const daysTo = (v: string): number | null => {
  const t = parseDate(v);
  return t === null ? null : Math.ceil((t - Date.now()) / DAY);
};

/* ---------- Warranty ---------- */

export function warrantyStatusOf(start: string, end: string, opts?: {
  claimOpen?: boolean;
  void?: boolean;
  suspended?: boolean;
}): string {
  if (opts?.void) return "Void";
  if (opts?.suspended) return "Suspended";
  if (opts?.claimOpen) return "Under Claim";
  if (!start || !end) return "Not Started";
  const left = daysTo(end);
  if (left === null) return "Not Started";
  if (left < 0) return "Expired";
  if (left <= WARRANTY_EXPIRING_DAYS) return "Expiring Soon";
  return "Active";
}

export const WARRANTY_TONE: Record<string, BadgeTone> = {
  "Not Started": "neutral",
  Active: "success",
  "Expiring Soon": "warning",
  Expired: "danger",
  Void: "danger",
  Suspended: "warning",
  "Under Claim": "warning",
};

export const LIFECYCLE_TONE: Record<string, BadgeTone> = {
  Received: "info",
  "Pending QC": "warning",
  "QC Hold": "warning",
  "QC Passed": "success",
  Available: "success",
  Reserved: "info",
  Picked: "info",
  Packed: "info",
  Shipped: "info",
  Delivered: "primary",
  Installed: "primary",
  "In Use": "primary",
  Returned: "warning",
  "Return Hold": "warning",
  "Under Inspection": "warning",
  "Under Repair": "warning",
  Repaired: "success",
  "Replacement Pending": "warning",
  Replaced: "neutral",
  "Supplier Claim": "warning",
  Blocked: "danger",
  Damaged: "danger",
  Scrapped: "danger",
  Lost: "danger",
  Corrected: "neutral",
  Closed: "neutral",
};

export const PHYSICAL_TONE: Record<string, BadgeTone> = {
  Available: "success",
  Reserved: "info",
  "QC Hold": "warning",
  "Return Hold": "warning",
  Damaged: "danger",
  Blocked: "danger",
  "In Transit": "info",
  "Service Hold": "warning",
  "Scrap Hold": "danger",
  "Sold / Customer Possession": "primary",
};

export const OWNER_TONE: Record<string, BadgeTone> = {
  "A-Factory Warehouse": "success",
  "In Transit": "info",
  Customer: "primary",
  "Service Center": "warning",
  Supplier: "warning",
  "Scrapped / Closed": "danger",
};

export const EXCEPTION_TONE: Record<string, BadgeTone> = {
  Open: "danger",
  "Under Investigation": "warning",
  "Pending Adjustment": "warning",
  Escalated: "danger",
  Resolved: "success",
  Closed: "neutral",
};

/* ---------- Lifecycle → derived state ---------- */

/** A serial has exactly one physical bucket; the lifecycle decides which. */
const PHYSICAL_OF: Record<string, string> = {
  Received: "QC Hold",
  "Pending QC": "QC Hold",
  "QC Hold": "QC Hold",
  "QC Passed": "Available",
  Available: "Available",
  Reserved: "Reserved",
  Picked: "Reserved",
  Packed: "Reserved",
  Shipped: "In Transit",
  Delivered: "Sold / Customer Possession",
  Installed: "Sold / Customer Possession",
  "In Use": "Sold / Customer Possession",
  Returned: "Return Hold",
  "Return Hold": "Return Hold",
  "Under Inspection": "QC Hold",
  "Under Repair": "Service Hold",
  Repaired: "Service Hold",
  "Replacement Pending": "Return Hold",
  Replaced: "Return Hold",
  "Supplier Claim": "Blocked",
  Blocked: "Blocked",
  Damaged: "Damaged",
  Scrapped: "Scrap Hold",
  Lost: "Blocked",
  Corrected: "Blocked",
  Closed: "Sold / Customer Possession",
};

const OWNER_OF: Record<string, string> = {
  Received: "A-Factory Warehouse",
  "Pending QC": "A-Factory Warehouse",
  "QC Hold": "A-Factory Warehouse",
  "QC Passed": "A-Factory Warehouse",
  Available: "A-Factory Warehouse",
  Reserved: "A-Factory Warehouse",
  Picked: "A-Factory Warehouse",
  Packed: "In Transit",
  Shipped: "In Transit",
  Delivered: "Customer",
  Installed: "Customer",
  "In Use": "Customer",
  Returned: "A-Factory Warehouse",
  "Return Hold": "A-Factory Warehouse",
  "Under Inspection": "A-Factory Warehouse",
  "Under Repair": "Service Center",
  Repaired: "Service Center",
  "Replacement Pending": "A-Factory Warehouse",
  Replaced: "A-Factory Warehouse",
  "Supplier Claim": "Supplier",
  Blocked: "A-Factory Warehouse",
  Damaged: "A-Factory Warehouse",
  Scrapped: "Scrapped / Closed",
  Lost: "Scrapped / Closed",
  Corrected: "A-Factory Warehouse",
  Closed: "Customer",
};

/** Lifecycles that still put the unit on an A-Factory shelf. */
const IN_WAREHOUSE = new Set(
  Object.entries(OWNER_OF)
    .filter(([, o]) => o === "A-Factory Warehouse")
    .map(([k]) => k),
);

/** Lifecycles a customer has already taken delivery of. */
const AT_CUSTOMER = new Set(["Delivered", "Installed", "In Use", "Closed"]);

/* ---------- Stock Inquiry's serial statuses ---------- */

/** Stock Inquiry's five-word vocabulary mapped onto the full lifecycle. */
const STOCK_LIFECYCLE: Record<string, string> = {
  "In Stock": "Available",
  Reserved: "Reserved",
  Issued: "Shipped",
  "In Service": "In Use",
  Returned: "Return Hold",
};

/* ---------- Deterministic picks ---------- */

/** Stable hash so a serial always draws the same documents. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = <T,>(list: T[], seed: number, salt = 0): T | undefined =>
  list.length ? list[(seed + salt) % list.length] : undefined;

/* ---------- Collecting every serial the ERP knows ---------- */

interface SerialKey {
  serial: string;
  product: string;
  lifecycle?: string;
  declared?: DeclaredSerial;
  /** Serials Stock Inquiry already lists, which must agree with it. */
  stock?: (typeof STOCK_SERIALS)[number];
}

/** The generated equipment population, numbered above the declared block. */
function plannedKeys(): SerialKey[] {
  const out: SerialKey[] = [];
  const counter = new Map<string, number>();
  let mi = 0;

  for (const p of LIFECYCLE_PLAN) {
    for (let i = 0; i < p.count; i++) {
      const m = SERIAL_MODELS[mi++ % SERIAL_MODELS.length];
      const n = (counter.get(m.code) ?? 300) + 1;
      counter.set(m.code, n);
      out.push({ serial: `${m.prefix}${pad(n, 6)}`, product: m.code, lifecycle: p.lifecycle });
    }
  }
  return out;
}

function collectKeys(): SerialKey[] {
  const seen = new Map<string, SerialKey>();
  const add = (key: SerialKey) => {
    if (!key.serial || !key.product) return;
    const id = `${key.product}|${key.serial}`;
    const prev = seen.get(id);
    if (!prev) {
      seen.set(id, key);
      return;
    }
    /* A key already present keeps its first record; the extra one is a
       duplicate the exception review has to report, not a second row. */
    prev.declared ??= key.declared;
    prev.stock ??= key.stock;
    prev.lifecycle ??= key.lifecycle;
  };

  for (const d of DECLARED_SERIALS) add({ serial: d.serial, product: d.model, declared: d });
  for (const k of plannedKeys()) add(k);
  for (const s of STOCK_SERIALS) add({ serial: s.serial, product: s.product, stock: s });

  /* Anything an operational record names has to resolve to a row. */
  for (const x of SERIAL_INSTALLS) add({ serial: x.serial, product: x.product });
  for (const x of SERVICE_JOBS) add({ serial: x.serial, product: x.product });
  for (const x of SERIAL_RETURNS) {
    add({ serial: x.serial, product: x.product });
    if (x.replacementSerial) add({ serial: x.replacementSerial, product: x.product });
  }
  for (const x of REPLACEMENTS) {
    add({ serial: x.returnedSerial, product: x.product });
    add({ serial: x.replacementSerial, product: x.product });
  }
  for (const x of SUPPLIER_CLAIMS) {
    const m = SERIAL_MODELS.find((mm) => x.serial.startsWith(mm.prefix));
    if (m) {
      add({ serial: x.serial, product: m.code });
      if (x.replacementSerial) add({ serial: x.replacementSerial, product: m.code });
    }
  }
  for (const x of SERIAL_CORRECTIONS) {
    add({ serial: x.wrongSerial, product: x.product });
    add({ serial: x.correctSerial, product: x.product });
  }
  for (const x of SERIAL_EXCEPTIONS) add({ serial: x.serial, product: x.product });

  return [...seen.values()];
}

/** Every declared record that claims the same product + serial. */
export const duplicateSources = (product: string, serial: string): DeclaredSerial[] =>
  DECLARED_SERIALS.filter((d) => d.model === product && d.serial === serial);

/* ---------- Row ---------- */

export interface SerialRow extends RecordBase {
  /** Registry key: product and serial together, the Phase 1 uniqueness scope. */
  code: string;
  serial: string;
  mfrSerial: string;

  product: string;
  productName: string;
  brand: string;
  cat: string;
  model: string;
  unit: string;
  icon: string;
  barcode: string;
  /** True for declared equipment, false for a serial Stock Inquiry carries. */
  isEquipment: boolean;

  lifecycle: string;
  physical: string;
  ownerType: string;
  owner: string;

  warehouse: string;
  whName: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  location: string;
  transitFrom: string;
  transitTo: string;
  lastCount: string;

  customerCode: string;
  customer: string;
  customerType: string;
  siteContact: string;
  soRef: string;
  invRef: string;
  shipRef: string;
  doRef: string;
  deliveryDate: string;
  salesRep: string;

  supplier: string;
  supplierCode: string;
  manufacturer: string;
  country: string;
  poRef: string;
  poLine: number;
  grRef: string;
  grLine: number;
  qcRef: string;
  qcResult: string;
  paRef: string;
  pickRef: string;
  receivedDate: string;
  receivedCondition: string;
  initialWarehouse: string;
  initialLocation: string;
  unitCost: number;

  installRequired: boolean;
  installStatus: string;
  installRef: string;
  installDate: string;
  installedBy: string;
  site: string;
  acceptance: string;
  installNote: string;

  warrantyType: string;
  warrantyBasis: string;
  warrantyStart: string;
  warrantyEnd: string;
  warrantyMonths: number;
  warrantyDays: number | null;
  warrantyStatus: string;
  supplierWarrantyEnd: string;
  claimCount: number;
  lastClaimDate: string;

  serviceCount: number;
  repairCount: number;
  lastServiceDate: string;
  serviceJob: string;
  returnCount: number;
  returnRef: string;

  replacementOf: string;
  replacedBy: string;
  replacementStatus: string;
  claimRef: string;

  correctedFrom: string;
  correctedTo: string;
  correctionCount: number;

  exceptionCount: number;
  exceptionRef: string;
  /** Two records claim the same product + serial. */
  duplicate: boolean;
  /** Warehouse position and customer possession asserted at the same time. */
  conflict: boolean;
  conflictReason: string;

  openReservation: string;
  openTransfer: string;
  openReturn: string;
  openServiceJob: string;
  openClaim: string;

  lastMovement: string;
  lastVerified: string;
  updated: string;
  note: string;
}

/** Where a serial's lifecycle comes from when nothing declares it. */
function deriveLifecycle(key: SerialKey): string {
  if (key.declared?.lifecycle) return key.declared.lifecycle;
  if (key.lifecycle) return key.lifecycle;
  if (key.stock) return STOCK_LIFECYCLE[key.stock.status] ?? "Available";

  const s = key.serial;
  const claim = SUPPLIER_CLAIMS.find((c) => c.serial === s);
  if (claim && claim.status !== "Closed") return "Supplier Claim";

  const replaced = REPLACEMENTS.find((r) => r.returnedSerial === s && r.status === "Completed");
  if (replaced) return "Replaced";

  const correction = SERIAL_CORRECTIONS.find((c) => c.wrongSerial === s);
  if (correction) return "Corrected";

  const ret = SERIAL_RETURNS.find((r) => r.serial === s);
  if (ret) {
    if (ret.disposition === "Under Repair") return "Under Repair";
    if (ret.disposition === "Scrapped") return "Scrapped";
    if (ret.disposition === "Supplier Claim") return "Supplier Claim";
    if (ret.disposition === "Returned to Available") return "Available";
    if (ret.disposition === "Replacement Issued") return "Replaced";
    return "Return Hold";
  }

  const job = SERVICE_JOBS.find((j) => j.serial === s && j.status !== "Closed");
  if (job) return "Under Repair";

  const install = SERIAL_INSTALLS.find((i) => i.serial === s);
  if (install) return install.status === "Completed" ? "Installed" : "Delivered";

  if (SERVICE_JOBS.some((j) => j.serial === s)) return "In Use";
  return "Available";
}

function build(key: SerialKey): SerialRow {
  const d = key.declared;
  const serial = key.serial;
  const seed = hash(`${key.product}|${serial}`);

  const equipModel: SerialModel | undefined = getModel(key.product);
  const masterProduct = getProduct(key.product);
  const isEquipment = Boolean(equipModel);

  const src =
    SERIAL_SUPPLIERS[
      (equipModel ? equipModel.supplierIndex : seed) % SERIAL_SUPPLIERS.length
    ];

  const lifecycle = deriveLifecycle(key);
  const physical = PHYSICAL_OF[lifecycle] ?? "Blocked";
  const ownerType = OWNER_OF[lifecycle] ?? "A-Factory Warehouse";

  /* Operational records that mention this serial. */
  const install = SERIAL_INSTALLS.find((i) => i.serial === serial);
  const jobs = SERVICE_JOBS.filter((j) => j.serial === serial);
  const returns = SERIAL_RETURNS.filter((r) => r.serial === serial);
  const replacedRec = REPLACEMENTS.find((r) => r.returnedSerial === serial);
  const replacementRec = REPLACEMENTS.find((r) => r.replacementSerial === serial);
  const claims = SUPPLIER_CLAIMS.filter((c) => c.serial === serial);
  const corrections = SERIAL_CORRECTIONS.filter(
    (c) => c.wrongSerial === serial || c.correctSerial === serial,
  );
  const exceptions = SERIAL_EXCEPTIONS.filter((e) => e.serial === serial);

  /* Where the unit sits. Stock Inquiry wins whenever it knows the serial. */
  const declaredBin = d?.bin
    ? SERIAL_BINS.find((b) => b.bin === d.bin && (!d.warehouse || b.warehouse === d.warehouse))
    : undefined;
  const bin =
    declaredBin ??
    (d?.warehouse ? SERIAL_BINS.find((b) => b.warehouse === d.warehouse) : undefined) ??
    pick(SERIAL_BINS, seed)!;

  /* A unit only has a warehouse position while it is in a warehouse. One that
     has left the building keeps its history, not its bin. The exception is a
     declared conflict, which exists precisely to be caught. */
  const inWarehouse = IN_WAREHOUSE.has(lifecycle);
  const placed = inWarehouse || Boolean(d?.conflict);
  const stockLoc = key.stock ? key.stock.location.split("-") : [];

  const warehouse = !placed ? "" : (key.stock?.warehouse ?? bin.warehouse);
  const whName = !warehouse ? "" : (key.stock?.whName ?? bin.whName);
  const zone = !warehouse ? "" : key.stock ? (stockLoc[0] ?? "") : bin.zone;
  const rack = !warehouse ? "" : key.stock ? (stockLoc[1] ?? "") : bin.rack;
  const shelf = !warehouse || key.stock ? "" : bin.shelf;
  const binCode = !warehouse ? "" : key.stock ? stockLoc.slice(2).join("-") : bin.bin;
  const location = !warehouse
    ? ""
    : key.stock
      ? key.stock.location
      : `${bin.zone}-${bin.rack}-${bin.bin}`;

  /* Who has it. */
  const custCode =
    d?.customerCode ??
    install?.customerCode ??
    returns[0]?.customerCode ??
    jobs[0]?.customerCode ??
    (AT_CUSTOMER.has(lifecycle) || lifecycle === "Shipped" || lifecycle === "Packed"
      ? pick(SERIAL_CUSTOMERS, seed, 3)!.code
      : "");
  const cust = custCode ? getSerialCustomer(custCode) : undefined;

  /* Documents. Declared references win; the rest draw a real document so
     every link on the trace opens something. */
  const po = d?.poRef ?? pick(PURCHASE_ORDERS, seed, 1)?.code ?? "";
  const gr = d?.grRef ?? pick(GOODS_RECEIPTS, seed, 2)?.code ?? "";
  const qc = d?.qcRef ?? pick(QC_INSPECTIONS, seed, 3)?.code ?? "";
  const pa = pick(PUTAWAY_TASKS, seed, 4)?.code ?? "";
  const outbound = custCode || !inWarehouse;
  const so = d?.soRef ?? (outbound ? (pick(SALES_ORDERS, seed, 5)?.code ?? "") : "");
  const pk = outbound ? (pick(PICKING_TASKS, seed, 6)?.code ?? "") : "";
  const shipment = d?.shipRef ?? (outbound ? (pick(SHIPMENTS, seed, 7)?.code ?? "") : "");
  const shp = shipment ? SHIPMENTS.find((s) => s.code === shipment) : undefined;
  const inv = d?.invRef ?? shp?.invRef ?? "";

  const received = d?.receivedDate ?? (pick(GOODS_RECEIPTS, seed, 2)?.receiptDate ?? "");
  const delivery =
    d?.deliveryDate ??
    (AT_CUSTOMER.has(lifecycle) ? (shp?.actualDelivery || shp?.shipmentDate || "") : "");

  /* Warranty starts when the customer takes the unit, not when it arrives. */
  const warrantyMonths = equipModel?.warrantyMonths ?? 12;
  const basis = install?.completed ? "Installation Date" : "Delivery Date";
  const warrantyStart = d?.warrantyStart ?? (install?.completed || delivery || "");
  const warrantyEnd =
    d?.warrantyEnd ?? (warrantyStart ? addMonths(warrantyStart, warrantyMonths) : "");
  const openClaim = claims.find((c) => c.status !== "Closed" && c.status !== "Rejected");
  const warrantyStatus =
    d?.warrantyStatusOverride ??
    warrantyStatusOf(warrantyStart, warrantyEnd, {
      claimOpen: Boolean(openClaim),
      void: lifecycle === "Scrapped" || lifecycle === "Lost",
      suspended: lifecycle === "Blocked",
    });

  const openReturn = returns.find((r) => r.status !== "Closed");
  const openJob = jobs.find((j) => j.status !== "Closed" && j.status !== "Cancelled");

  const unitCost =
    equipModel?.price ?? masterProduct?.pricing?.avgCost ?? masterProduct?.pricing?.lastCost ?? 0;

  const moves = movementRows().filter((m) => m.serial === serial);
  const conflict = ownerType === "Customer" && Boolean(warehouse);

  return {
    code: `${key.product}|${serial}`,
    serial,
    mfrSerial: d?.mfrSerial ?? `${(equipModel?.model ?? key.product).replace(/\s+/g, "")}-${pad(seed % 100000, 5)}`,

    product: key.product,
    productName: equipModel?.name ?? masterProduct?.name ?? key.product,
    brand: equipModel?.brand ?? masterProduct?.brand ?? "",
    cat: equipModel?.cat ?? masterProduct?.cat ?? "",
    model: equipModel?.model ?? "—",
    unit: equipModel?.unit ?? masterProduct?.unit ?? "Unit",
    icon: equipModel?.icon ?? masterProduct?.icon ?? "📦",
    barcode: equipModel?.barcode ?? masterProduct?.barcode ?? "",
    isEquipment,

    lifecycle,
    physical,
    ownerType,
    owner:
      ownerType === "Customer"
        ? (cust?.name ?? "ลูกค้า")
        : ownerType === "Service Center"
          ? "A-Factory Service Center"
          : ownerType === "Supplier"
            ? src.supplier
            : ownerType === "In Transit"
              ? (shp?.carrier ?? "ระหว่างขนส่ง")
              : whName || "A-Factory",

    warehouse,
    whName,
    zone,
    rack,
    shelf,
    bin: binCode,
    location,
    transitFrom: lifecycle === "Shipped" ? (shp?.warehouse ?? "") : "",
    transitTo: lifecycle === "Shipped" ? (cust?.name ?? "") : "",
    lastCount: inWarehouse ? (pick(["12/07/2026", "20/07/2026", "28/07/2026"], seed, 8) ?? "") : "",

    customerCode: custCode,
    customer: cust?.name ?? "",
    customerType: cust?.type ?? "",
    siteContact: cust?.contact ?? "",
    soRef: so,
    invRef: inv,
    shipRef: shipment,
    doRef: shp?.doRef ?? "",
    deliveryDate: delivery,
    salesRep: cust?.rep ?? shp?.salesRep ?? "",

    supplier: src.supplier,
    supplierCode: src.supplierCode,
    manufacturer: src.manufacturer,
    country: src.country,
    poRef: po,
    poLine: (seed % 3) + 1,
    grRef: gr,
    grLine: (seed % 4) + 1,
    qcRef: qc,
    qcResult: d?.qcResult ?? (lifecycle === "QC Hold" || lifecycle === "Pending QC" ? "Pending" : "Passed"),
    paRef: pa,
    pickRef: pk,
    receivedDate: received,
    receivedCondition: lifecycle === "Damaged" ? "Damaged on Arrival" : "Good",
    initialWarehouse: key.stock ? key.stock.warehouse : bin.warehouse,
    initialLocation: `${bin.zone}-${bin.rack}-${bin.bin}`,
    unitCost,

    installRequired: equipModel?.installRequired ?? false,
    installStatus: install?.status ?? (equipModel?.installRequired ? (AT_CUSTOMER.has(lifecycle) ? "Pending" : "Not Required") : "Not Required"),
    installRef: d?.installRef ?? install?.code ?? "",
    installDate: d?.installDate ?? install?.completed ?? "",
    installedBy: install?.installedBy ?? "",
    site: install?.site ?? cust?.site ?? "",
    acceptance: install?.acceptance ?? "—",
    installNote: install?.note ?? "",

    warrantyType: warrantyStart ? "Standard Manufacturer Warranty" : "No Warranty",
    warrantyBasis: basis,
    warrantyStart,
    warrantyEnd,
    warrantyMonths,
    warrantyDays: warrantyEnd ? daysTo(warrantyEnd) : null,
    warrantyStatus,
    supplierWarrantyEnd: received ? addMonths(received, src.supplierWarrantyMonths) : "",
    claimCount: claims.length,
    lastClaimDate: claims[0]?.claimDate ?? "",

    serviceCount: jobs.length,
    repairCount: jobs.filter((j) => j.type === "Repair" || j.type === "Warranty Service").length,
    lastServiceDate: jobs[0]?.opened ?? "",
    serviceJob: d?.serviceJob ?? openJob?.code ?? jobs[0]?.code ?? "",
    returnCount: returns.length,
    returnRef: d?.returnRef ?? returns[0]?.code ?? "",

    replacementOf: d?.replacementOf ?? replacementRec?.returnedSerial ?? "",
    replacedBy: d?.replacedBy ?? replacedRec?.replacementSerial ?? "",
    replacementStatus: replacedRec?.status ?? replacementRec?.status ?? "—",
    claimRef: d?.claimRef ?? claims[0]?.code ?? "",

    correctedFrom: d?.correctedFrom ?? corrections.find((c) => c.correctSerial === serial)?.wrongSerial ?? "",
    correctedTo: d?.correctedTo ?? corrections.find((c) => c.wrongSerial === serial)?.correctSerial ?? "",
    correctionCount: corrections.length,

    exceptionCount: exceptions.length,
    exceptionRef: exceptions[0]?.code ?? "",
    duplicate: duplicateSources(key.product, serial).length > 1,
    conflict,
    conflictReason: conflict
      ? `ระบุลูกค้า ${cust?.name ?? custCode} พร้อมตำแหน่ง ${warehouse} ${location}`
      : "",

    openReservation: lifecycle === "Reserved" ? so : "",
    openTransfer: "",
    openReturn: openReturn?.code ?? "",
    openServiceJob: openJob?.code ?? "",
    openClaim: openClaim?.code ?? "",

    lastMovement: moves[0]?.when ?? delivery ?? received,
    lastVerified: inWarehouse ? (pick(["12/07/2026", "20/07/2026", "28/07/2026"], seed, 8) ?? "") : delivery,
    updated: moves[0]?.when ?? `${delivery || received} 09:00`,
    note: d?.note ?? "",
  };
}

let cache: SerialRow[] | null = null;

function buildAll(): SerialRow[] {
  return collectKeys()
    .map(build)
    .sort((a, b) => a.serial.localeCompare(b.serial));
}

export const serialRows = (): SerialRow[] => (cache ??= buildAll());

export function invalidateSerials() {
  cache = null;
}

export const getSerial = (code: string) =>
  serialRows().find((s) => s.code === code) ?? null;

export const findSerial = (product: string, serial: string) =>
  serialRows().find((s) => s.product === product && s.serial === serial) ?? null;

/** Every row carrying this serial number, across products. */
export const serialsNamed = (serial: string) =>
  serialRows().filter((s) => s.serial === serial);

/* ---------- Current status ---------- */

export interface StatusIssue {
  title: string;
  detail: string;
}

/**
 * A serial has exactly one operational state. Anything that claims two at
 * once is a data fault, and the detail page has to say so rather than pick
 * a winner.
 */
export function statusIssues(r: SerialRow): StatusIssue[] {
  const out: StatusIssue[] = [];
  if (r.conflict) {
    out.push({ title: "Serial Ownership Conflict", detail: r.conflictReason });
  }
  if (r.duplicate) {
    const rows = duplicateSources(r.product, r.serial);
    out.push({
      title: "Duplicate Serial",
      detail: `พบ ${rows.length} รายการที่ใช้หมายเลขนี้กับสินค้าเดียวกัน (${rows
        .map((x) => x.warehouse || "ไม่ระบุคลัง")
        .join(", ")})`,
    });
  }
  if (r.physical === "Available" && r.customerCode && AT_CUSTOMER.has(r.lifecycle)) {
    out.push({
      title: "Status Conflict",
      detail: "สถานะสต๊อกเป็น Available ทั้งที่ลูกค้ารับเครื่องไปแล้ว",
    });
  }
  if (r.lifecycle === "Lost") {
    out.push({
      title: "Missing Serial",
      detail: "นับรอบไม่พบเครื่องนี้ ต้องตั้งใบปรับปรุงสต๊อกหลังการสอบสวน",
    });
  }
  return out;
}

/* ---------- Location history ---------- */

export interface LocationEvent {
  when: string;
  event: string;
  whFrom: string;
  locFrom: string;
  whTo: string;
  locTo: string;
  statusBefore: string;
  statusAfter: string;
  transfer: string;
  movement: string;
  doc: string;
  entity: string;
  user: string;
}

const USERS = ["Warehouse Staff", "QC Officer", "Picker A", "Mr. Anan", "Suda R."];

/**
 * The physical history of one unit. Every serial passes the same stations,
 * so the list is generated from the lifecycle it has reached rather than
 * stored — an immutable record derived from the documents that made it.
 */
export function serialLocationHistory(r: SerialRow): LocationEvent[] {
  const out: LocationEvent[] = [];
  const seed = hash(r.code);
  const movementFor = (doc: string) =>
    movementRows().find((m) => m.sourceDoc === doc && m.product === r.product)?.code ?? "";

  const push = (e: Partial<LocationEvent> & { when: string; event: string }) =>
    out.push({
      whFrom: "",
      locFrom: "",
      whTo: "",
      locTo: "",
      statusBefore: "",
      statusAfter: "",
      transfer: "",
      movement: "",
      doc: "",
      entity: "",
      user: USERS[(seed + out.length) % USERS.length],
      ...e,
    } as LocationEvent);

  const initial = r.initialLocation;
  const initialWh = r.initialWarehouse;

  push({
    when: r.receivedDate,
    event: "Received",
    whTo: initialWh,
    locTo: "RECEIVING",
    statusBefore: "—",
    statusAfter: "QC Hold",
    doc: r.grRef,
    entity: "goods-receipt",
    movement: movementFor(r.grRef),
  });

  if (r.qcRef) {
    push({
      when: r.receivedDate,
      event: r.qcResult === "Passed" ? "QC Released" : "QC Hold",
      whFrom: initialWh,
      locFrom: "RECEIVING",
      whTo: initialWh,
      locTo: r.qcResult === "Passed" ? initial : "QC-01",
      statusBefore: "QC Hold",
      statusAfter: r.qcResult === "Passed" ? "Available" : "QC Hold",
      doc: r.qcRef,
      entity: "qc-inspection",
    });
  }

  if (r.paRef && r.qcResult === "Passed") {
    push({
      when: r.receivedDate,
      event: "Put Away",
      whFrom: initialWh,
      locFrom: "RECEIVING",
      whTo: initialWh,
      locTo: initial,
      statusBefore: "Available",
      statusAfter: "Available",
      doc: r.paRef,
      entity: "put-away",
      movement: movementFor(r.paRef),
    });
  }

  if (r.warehouse && r.warehouse !== initialWh) {
    push({
      when: r.lastCount || r.receivedDate,
      event: "Warehouse Transfer",
      whFrom: initialWh,
      locFrom: initial,
      whTo: r.warehouse,
      locTo: r.location,
      statusBefore: "Available",
      statusAfter: "Available",
      transfer: "—",
    });
  }

  if (["Picked", "Packed", "Shipped", "Delivered", "Installed", "In Use", "Closed", "Replaced"].includes(r.lifecycle)) {
    push({
      when: r.deliveryDate || r.receivedDate,
      event: "Picked",
      whFrom: r.initialWarehouse,
      locFrom: initial,
      whTo: r.initialWarehouse,
      locTo: "STAGING",
      statusBefore: "Reserved",
      statusAfter: "Reserved",
      doc: r.pickRef,
      entity: "picking",
    });
  }

  if (["Shipped", "Delivered", "Installed", "In Use", "Closed", "Replaced"].includes(r.lifecycle)) {
    push({
      when: r.deliveryDate || r.receivedDate,
      event: "Shipped",
      whFrom: r.initialWarehouse,
      locFrom: "STAGING",
      whTo: "—",
      locTo: r.customer || "ลูกค้า",
      statusBefore: "Reserved",
      statusAfter: "In Transit",
      doc: r.shipRef,
      entity: "shipment",
      movement: movementFor(r.shipRef),
    });
  }

  for (const ret of SERIAL_RETURNS.filter((x) => x.serial === r.serial)) {
    push({
      when: ret.returnDate,
      event: "Return Received",
      whFrom: "—",
      locFrom: ret.customerCode,
      whTo: "WH-QTY",
      locTo: "RET-01",
      statusBefore: "Sold / Customer Possession",
      statusAfter: "Return Hold",
      doc: ret.code,
      entity: "sales-return",
    });
    if (ret.disposition === "Returned to Available") {
      push({
        when: ret.returnDate,
        event: "Returned to Stock",
        whFrom: "WH-QTY",
        locFrom: "RET-01",
        whTo: r.warehouse || r.initialWarehouse,
        locTo: r.location || initial,
        statusBefore: "Return Hold",
        statusAfter: "Available",
      });
    }
    if (ret.disposition === "Under Repair") {
      push({
        when: ret.returnDate,
        event: "Service Received",
        whFrom: "WH-QTY",
        locFrom: "RET-01",
        whTo: "SERVICE",
        locTo: "SERVICE-BENCH",
        statusBefore: "Return Hold",
        statusAfter: "Service Hold",
      });
    }
  }

  if (r.lifecycle === "Scrapped") {
    push({
      when: r.lastMovement || r.receivedDate,
      event: "Scrapped",
      whFrom: r.initialWarehouse,
      locFrom: initial,
      whTo: "WH-QTY",
      locTo: "SCRAP-01",
      statusBefore: "Blocked",
      statusAfter: "Scrap Hold",
    });
  }

  return out.filter((e) => e.when);
}

/* ---------- Movement history ---------- */

export interface SerialMovement {
  when: string;
  movement: string;
  type: string;
  doc: string;
  entity: string;
  warehouse: string;
  fromLoc: string;
  toLoc: string;
  statusBefore: string;
  statusAfter: string;
  qtyIn: number;
  qtyOut: number;
  balanceAfter: number;
  user: string;
  reference: string;
}

/** Quantity is always one unit; the balance can only be 1 or 0. */
export function serialMovements(r: SerialRow): SerialMovement[] {
  const history = serialLocationHistory(r);
  const IN = new Set(["Received", "Return Received", "Transfer Received", "Returned to Stock"]);
  const OUT = new Set(["Shipped", "Scrapped"]);

  let balance = 0;
  return history.map((e) => {
    const qtyIn = IN.has(e.event) ? 1 : 0;
    const qtyOut = OUT.has(e.event) ? 1 : 0;
    balance = balance + qtyIn - qtyOut;
    return {
      when: e.when,
      movement: e.movement,
      type: e.event,
      doc: e.doc,
      entity: e.entity,
      warehouse: e.whTo || e.whFrom,
      fromLoc: e.locFrom,
      toLoc: e.locTo,
      statusBefore: e.statusBefore,
      statusAfter: e.statusAfter,
      qtyIn,
      qtyOut,
      balanceAfter: balance,
      user: e.user,
      reference: r.serial,
    };
  });
}

/* ---------- Inbound trace ---------- */

export interface TraceStage {
  stage: string;
  doc: string;
  entity: string;
  date: string;
  status: string;
  place: string;
  result: string;
  user: string;
}

export function serialInbound(r: SerialRow): TraceStage[] {
  const gr = GOODS_RECEIPTS.find((g) => g.code === r.grRef);
  const qc = QC_INSPECTIONS.find((q) => q.code === r.qcRef);
  const po = PURCHASE_ORDERS.find((p) => p.code === r.poRef);
  const pa = PUTAWAY_TASKS.find((p) => p.code === r.paRef);

  const out: TraceStage[] = [
    {
      stage: "Supplier",
      doc: r.supplierCode,
      entity: "",
      date: "—",
      status: "Active",
      place: r.country,
      result: r.manufacturer,
      user: "—",
    },
  ];

  if (po) {
    out.push({
      stage: "Purchase Order",
      doc: po.code,
      entity: "purchase-order",
      date: po.orderDate ?? "",
      status: po.status ?? "",
      place: "—",
      result: `บรรทัดที่ ${r.poLine}`,
      user: po.buyer ?? "—",
    });
  }
  if (gr) {
    out.push({
      stage: "Goods Receipt",
      doc: gr.code,
      entity: "goods-receipt",
      date: gr.receiptDate ?? r.receivedDate,
      status: gr.status ?? "",
      place: r.initialWarehouse,
      result: r.receivedCondition,
      user: gr.receiver ?? "—",
    });
  }
  if (qc) {
    out.push({
      stage: "QC Inspection",
      doc: qc.code,
      entity: "qc-inspection",
      date: qc.inspectionDate ?? r.receivedDate,
      status: qc.status ?? "",
      place: r.initialWarehouse,
      result: r.qcResult,
      user: qc.inspector ?? "—",
    });
  }
  if (pa && r.qcResult === "Passed") {
    out.push({
      stage: "Put Away",
      doc: pa.code,
      entity: "put-away",
      date: pa.created?.split(" ")[0] ?? r.receivedDate,
      status: pa.status ?? "",
      place: r.initialLocation,
      result: "จัดเก็บแล้ว",
      user: pa.assignedTo ?? "—",
    });
  }

  out.push({
    stage: "Available Serial",
    doc: r.serial,
    entity: "",
    date: r.receivedDate,
    status: r.lifecycle,
    place: r.location || r.owner,
    result: r.physical,
    user: "—",
  });

  return out;
}

/* ---------- Outbound trace ---------- */

export function serialOutbound(r: SerialRow): TraceStage[] {
  if (!r.soRef && !r.shipRef) return [];

  const so = SALES_ORDERS.find((s) => s.code === r.soRef);
  const pk = PICKING_TASKS.find((p) => p.code === r.pickRef);
  const shp = SHIPMENTS.find((s) => s.code === r.shipRef);
  const inv = SALES_INVOICES.find((i) => i.code === r.invRef);
  const out: TraceStage[] = [];

  if (so) {
    out.push({
      stage: "Sales Order Reservation",
      doc: so.code,
      entity: "sales-order",
      date: so.orderDate ?? "",
      status: so.status ?? "",
      place: r.customer || so.customer || "—",
      result: "จองหมายเลขนี้",
      user: so.createdBy ?? "—",
    });
  }
  if (pk) {
    out.push({
      stage: "Picking",
      doc: pk.code,
      entity: "picking",
      date: pk.pickDate ?? "",
      status: pk.status ?? "",
      place: r.initialWarehouse,
      result: "หยิบแล้ว",
      user: pk.assignedTo ?? "—",
    });
  }
  if (shp) {
    out.push({
      stage: "Packing",
      doc: shp.packages?.[0]?.no || "—",
      entity: "",
      date: shp.shipmentDate ?? "",
      status: shp.status ?? "",
      place: shp.loadingBay ?? "—",
      result: "บรรจุแล้ว",
      user: shp.updatedBy ?? "—",
    });
    /* The shipment names a delivery order that predates the current
       document set. Link it only when it actually resolves. */
    const doExists = DELIVERY_ORDERS.some((x) => x.code === shp.doRef);
    if (shp.doRef) {
      out.push({
        stage: "Delivery Order",
        doc: shp.doRef,
        entity: doExists ? "delivery-order" : "",
        date: shp.shipmentDate ?? "",
        status: shp.deliveryStatus ?? "",
        place: r.customer,
        result: shp.shippingMethod ?? "—",
        user: shp.salesRep ?? "—",
      });
    }
  }
  if (inv) {
    out.push({
      stage: "Sales Invoice",
      doc: inv.code,
      entity: "sales-invoice",
      date: inv.invoiceDate ?? "",
      status: inv.status ?? "",
      place: r.customer,
      result: "ออกใบแจ้งหนี้แล้ว",
      user: inv.createdBy ?? "—",
    });
  }
  if (shp) {
    out.push({
      stage: "Shipment",
      doc: shp.code,
      entity: "shipment",
      date: shp.shipmentDate ?? "",
      status: shp.status ?? "",
      place: r.customer,
      result: shp.trackingNo || "—",
      user: shp.driver || shp.carrier || "—",
    });
  }
  if (r.deliveryDate) {
    out.push({
      stage: "Customer Delivery",
      doc: r.shipRef || "—",
      entity: r.shipRef ? "shipment" : "",
      date: r.deliveryDate,
      status: r.lifecycle,
      place: r.customer,
      result: r.siteContact || "—",
      user: r.salesRep || "—",
    });
  }

  return out;
}

/* ---------- Customer ownership ---------- */

export interface OwnershipRow {
  customerCode: string;
  customer: string;
  type: string;
  soRef: string;
  invRef: string;
  shipRef: string;
  deliveryDate: string;
  installDate: string;
  returnDate: string;
  status: string;
  rep: string;
}

/** Current owner first, then anyone who held the unit before a replacement. */
export function serialCustomers(r: SerialRow): OwnershipRow[] {
  const out: OwnershipRow[] = [];
  if (!r.customerCode) return out;

  const ret = SERIAL_RETURNS.find((x) => x.serial === r.serial);
  const status =
    r.lifecycle === "Replaced"
      ? "Replaced"
      : ret
        ? "Returned"
        : r.installDate
          ? "Installed"
          : "Delivered";

  out.push({
    customerCode: r.customerCode,
    customer: r.customer,
    type: r.customerType,
    soRef: r.soRef,
    invRef: r.invRef,
    shipRef: r.shipRef,
    deliveryDate: r.deliveryDate,
    installDate: r.installDate,
    returnDate: ret?.returnDate ?? "",
    status,
    rep: r.salesRep,
  });

  /* A replacement unit inherits the history of the one it replaced. */
  if (r.replacementOf) {
    const prev = serialsNamed(r.replacementOf)[0];
    if (prev && prev.customerCode) {
      out.push({
        customerCode: prev.customerCode,
        customer: prev.customer,
        type: prev.customerType,
        soRef: prev.soRef,
        invRef: prev.invRef,
        shipRef: prev.shipRef,
        deliveryDate: prev.deliveryDate,
        installDate: prev.installDate,
        returnDate: SERIAL_RETURNS.find((x) => x.serial === prev.serial)?.returnDate ?? "",
        status: "Replaced",
        rep: prev.salesRep,
      });
    }
  }

  return out;
}

/* ---------- Operational placeholders ---------- */

export const serialInstall = (r: SerialRow) =>
  SERIAL_INSTALLS.find((i) => i.serial === r.serial) ?? null;

export const serialService = (r: SerialRow) =>
  SERVICE_JOBS.filter((j) => j.serial === r.serial);

export const serialReturns = (r: SerialRow) =>
  SERIAL_RETURNS.filter((x) => x.serial === r.serial);

export const serialReplacements = (r: SerialRow) =>
  REPLACEMENTS.filter(
    (x) => x.returnedSerial === r.serial || x.replacementSerial === r.serial,
  );

export const serialClaims = (r: SerialRow) =>
  SUPPLIER_CLAIMS.filter((c) => c.serial === r.serial);

export const serialCorrections = (r: SerialRow) =>
  SERIAL_CORRECTIONS.filter(
    (c) => c.wrongSerial === r.serial || c.correctSerial === r.serial,
  );

export const serialExceptions = (r: SerialRow) =>
  SERIAL_EXCEPTIONS.filter((e) => e.serial === r.serial);

/**
 * A replacement chain must not fold back on itself. Mock data can drift, so
 * the link is checked rather than trusted.
 */
export function replacementValid(r: SerialRow): boolean {
  const seen = new Set<string>([r.serial]);
  let next = r.replacedBy;
  while (next) {
    if (seen.has(next)) return false;
    seen.add(next);
    next = serialsNamed(next)[0]?.replacedBy ?? "";
  }
  return true;
}

/* ---------- Timeline and documents ---------- */

export interface SerialEvent {
  title: string;
  detail: string;
  user: string;
  when: string;
  kind: string;
}

export function serialTimeline(r: SerialRow): SerialEvent[] {
  const out: SerialEvent[] = [];
  const add = (title: string, detail: string, when: string, kind = "") =>
    when && out.push({ title, detail, user: "System", when, kind });

  add("Serial Created", `สร้างจากใบรับสินค้า ${r.grRef}`, r.receivedDate, "primary");
  add("Received", `รับเข้า ${r.initialWarehouse}`, r.receivedDate, "primary");
  add("QC Started", `ตรวจสอบด้วย ${r.qcRef}`, r.receivedDate, "info");
  if (r.qcResult === "Passed") add("QC Passed", "ผ่านการตรวจสอบคุณภาพ", r.receivedDate, "info");
  if (r.paRef) add("Put Away", `จัดเก็บที่ ${r.initialLocation}`, r.receivedDate, "");
  if (r.openReservation) add("Reserved", `จองโดย ${r.openReservation}`, r.receivedDate, "info");
  if (r.pickRef) add("Picked", `หยิบตามใบ ${r.pickRef}`, r.deliveryDate || r.receivedDate, "");
  if (r.shipRef) add("Shipped", `ส่งออกด้วย ${r.shipRef}`, r.deliveryDate || r.receivedDate, "info");
  if (r.deliveryDate) add("Delivered", `ส่งมอบให้ ${r.customer}`, r.deliveryDate, "primary");
  if (r.installDate) add("Installed", `ติดตั้งตาม ${r.installRef}`, r.installDate, "primary");
  if (r.warrantyStart) add("Warranty Started", `รับประกันถึง ${r.warrantyEnd}`, r.warrantyStart, "info");

  for (const ret of serialReturns(r)) {
    add("Returned", `รับคืนตาม ${ret.code} — ${ret.reason}`, ret.returnDate, "warn");
    add("Return QC", `ผลตรวจ ${ret.qcResult} · ${ret.disposition}`, ret.returnDate, "warn");
  }
  for (const job of serialService(r)) {
    add("Under Repair", `${job.code} · ${job.problem}`, job.opened, "warn");
    if (job.closed) add("Repaired", `${job.code} · ${job.action}`, job.closed, "");
  }
  for (const rep of serialReplacements(r)) {
    add("Replacement Issued", `${rep.code} · ${rep.returnedSerial} → ${rep.replacementSerial}`, rep.date, "warn");
  }
  for (const c of serialClaims(r)) {
    add("Supplier Claim", `${c.code} · ${c.reason}`, c.claimDate, "warn");
  }
  for (const c of serialCorrections(r)) {
    add("Serial Corrected", `${c.code} · ${c.wrongSerial} → ${c.correctSerial}`, c.date, "warn");
  }
  if (r.lifecycle === "Blocked") add("Blocked", "ระงับการใช้งาน", r.lastMovement, "warn");
  if (r.lifecycle === "Scrapped") add("Scrapped", "ตัดออกจากบัญชี", r.lastMovement, "warn");
  if (r.lifecycle === "Closed") add("Closed", "ปิดประวัติหมายเลขเครื่อง", r.lastMovement, "");

  return out.sort((a, b) => (parseDate(a.when) ?? 0) - (parseDate(b.when) ?? 0));
}

export interface SerialDoc {
  name: string;
  type: string;
  status: string;
  date: string;
  party: string;
  user: string;
  entity: string;
}

export function serialDocs(r: SerialRow): SerialDoc[] {
  const out: SerialDoc[] = [];
  const add = (
    name: string,
    type: string,
    entity: string,
    status: string,
    date: string,
    party: string,
    user = "System",
  ) => name && out.push({ name, type, entity, status, date, party, user });

  add(r.poRef, "Purchase Order", "purchase-order", "Approved", r.receivedDate, r.supplier);
  add(r.grRef, "Goods Receipt", "goods-receipt", "Received", r.receivedDate, r.supplier);
  add(r.qcRef, "QC Inspection", "qc-inspection", r.qcResult, r.receivedDate, r.supplier);
  add(r.paRef, "Put Away", "put-away", "Completed", r.receivedDate, r.initialWarehouse);
  add(r.soRef, "Sales Order", "sales-order", "Confirmed", r.deliveryDate, r.customer);
  add(r.pickRef, "Picking", "picking", "Picked", r.deliveryDate, r.customer);
  add(r.invRef, "Sales Invoice", "sales-invoice", "Issued", r.deliveryDate, r.customer);
  add(r.shipRef, "Shipment", "shipment", "Delivered", r.deliveryDate, r.customer);
  add(r.installRef, "Installation", "", r.installStatus, r.installDate, r.customer);
  for (const j of serialService(r)) add(j.code, "Service Job", "", j.status, j.opened, r.customer, j.technician);
  for (const x of serialReturns(r)) add(x.code, "Sales Return", "sales-return", x.status, x.returnDate, r.customer);
  for (const x of serialReturns(r)) add(x.creditNote, "Credit Note", "credit-note", "Issued", x.returnDate, r.customer);
  for (const x of serialReplacements(r)) add(x.code, "Replacement", "", x.status, x.date, r.customer);
  for (const x of serialClaims(r)) add(x.code, "Supplier Claim", "", x.status, x.claimDate, r.supplier);
  for (const x of serialCorrections(r)) add(x.code, "Serial Correction", "stock-adjustment", x.status, x.date, x.warehouse, x.approvedBy);
  for (const x of serialExceptions(r)) add(x.code, "Exception Review", "", x.status, x.raisedDate, r.product, x.raisedBy);

  return out;
}

/* ---------- Summary ---------- */

export interface SerialSummary {
  total: number;
  available: number;
  reserved: number;
  inTransit: number;
  delivered: number;
  installed: number;
  returnHold: number;
  underRepair: number;
  warrantyActive: number;
  warrantyExpiring: number;
  blocked: number;
  scrapped: number;
  exceptions: number;
  conflicts: number;
}

export function serialSummary(): SerialSummary {
  const rows = serialRows();
  const by = (f: (r: SerialRow) => boolean) => rows.filter(f).length;

  return {
    total: rows.length,
    available: by((r) => r.physical === "Available"),
    reserved: by((r) => r.physical === "Reserved"),
    inTransit: by((r) => r.physical === "In Transit"),
    delivered: by((r) => r.lifecycle === "Delivered"),
    installed: by((r) => r.lifecycle === "Installed"),
    returnHold: by((r) => r.physical === "Return Hold"),
    underRepair: by((r) => r.lifecycle === "Under Repair"),
    warrantyActive: by((r) => r.warrantyStatus === "Active"),
    warrantyExpiring: by((r) => r.warrantyStatus === "Expiring Soon"),
    blocked: by((r) => r.lifecycle === "Blocked"),
    scrapped: by((r) => r.lifecycle === "Scrapped"),
    exceptions: by((r) => r.exceptionCount > 0 || r.conflict || r.duplicate),
    conflicts: by((r) => r.conflict),
  };
}

/* ---------- Role mockup ---------- */

export const SERIAL_ROLES = [
  "Warehouse User",
  "Sales User",
  "Purchasing User",
  "QC User",
  "Service User",
  "Inventory Manager",
  "Finance User",
  "Auditor",
  "Admin",
] as const;

/**
 * Phase 1 permission mockup. The module is read-only for everyone; the only
 * thing a role changes is whether cost figures are visible.
 */
let viewerRole: string = "Admin";

export const serialRole = () => viewerRole;
export const setSerialRole = (role: string) => {
  viewerRole = role;
};

const COST_BLIND = new Set(["Sales User", "Warehouse User", "QC User", "Service User"]);

export const canSeeCost = () => !COST_BLIND.has(viewerRole);

/** Serials whose warranty is inside the expiring window, soonest first. */
export const warrantyWatch = () =>
  serialRows()
    .filter((r) => r.warrantyStatus === "Expiring Soon" || r.warrantyStatus === "Expired")
    .sort((a, b) => (a.warrantyDays ?? 0) - (b.warrantyDays ?? 0));

/** Every open exception across the module, worst first. */
export const openExceptions = () =>
  SERIAL_EXCEPTIONS.filter((e) => e.status !== "Closed" && e.status !== "Resolved");
