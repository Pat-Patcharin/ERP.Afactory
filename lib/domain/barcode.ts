import {
  CODE_ALIASES,
  GS1_AIS,
  INVALID_CODES,
  PACK_LEVELS,
  SCAN_LOG,
  SCAN_SEED,
  SCAN_STAMPS,
  getAi,
  nextScanId,
  type PackLevel,
  type ScanRecord,
} from "@/data/barcodes";
import type { BadgeTone, RecordBase } from "@/lib/types";
import { PRODUCTS, getProduct } from "./product";
import { STOCK_POSITIONS } from "./stock";
import { movementRows } from "./movement";
import { lotRows } from "./lot";
import { serialRows } from "./serial";
import { SERIAL_BINS, SERIAL_MODELS } from "@/data/serials";
import { GOODS_RECEIPTS, PUTAWAY_TASKS, QC_INSPECTIONS } from "./inbound";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  SALES_ORDERS,
} from "./outbound";
import { SHIPMENTS } from "./shipment";
import { SALES_RETURNS } from "./sales-return";
import { CREDIT_NOTES } from "./credit-note";
import { PURCHASE_ORDERS } from "./purchase";
import { SALES_INVOICES } from "./invoice";
import { TRANSFER_ROWS } from "./transfer";
import { ADJUSTMENT_ROWS } from "./adjustment";
import { COUNT_ROWS } from "./count";
import { WAREHOUSES } from "./warehouse";

/* ============================================================
   BARCODE LOOKUP — one input, every entity in the ERP.

   The engine below never guesses from a regex alone. A pattern
   narrows the search; the answer always comes from the module that
   owns the entity, so a code that looks like a lot but is not one
   reports Not Found rather than a plausible lie.

   Nothing here writes stock. The only thing the module records is
   that somebody looked.
   ============================================================ */

const pad = (n: number, w: number) => String(n).padStart(w, "0");

/* ---------- GTIN ---------- */

/** Standard GS1 mod-10 check digit over the body of a GTIN. */
export function checkDigit(body: string): number {
  const digits = [...body].map(Number).reverse();
  let sum = 0;
  digits.forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10;
}

/**
 * Advisory only. The seeded barcodes are mock digits and do not carry valid
 * check digits, so a failure here is reported, never used to reject a code
 * that resolves to a real product.
 */
export const checkDigitValid = (code: string): boolean =>
  /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code) &&
  checkDigit(code.slice(0, -1)) === Number(code.slice(-1));

/* ---------- Product barcode catalogue ---------- */

export interface ProductBarcode {
  barcode: string;
  product: string;
  productName: string;
  level: PackLevel;
  /** The literal barcode the product master prints. */
  primary: boolean;
}

interface CatalogProduct {
  code: string;
  name: string;
  barcode: string;
  icon: string;
  brand: string;
  cat: string;
  unit: string;
  equipment: boolean;
}

/** Master SKUs plus the serialised equipment models, which carry GTINs too. */
function catalogProducts(): CatalogProduct[] {
  return [
    ...PRODUCTS.map((p) => ({
      code: p.code,
      name: p.name,
      barcode: p.barcode ?? "",
      icon: p.icon ?? "📦",
      brand: p.brand ?? "",
      cat: p.cat ?? "",
      unit: p.unit ?? "",
      equipment: false,
    })),
    ...SERIAL_MODELS.map((m) => ({
      code: m.code,
      name: m.name,
      barcode: m.barcode,
      icon: m.icon,
      brand: m.brand,
      cat: m.cat,
      unit: m.unit,
      equipment: true,
    })),
  ];
}

/**
 * A product master carries one barcode; a warehouse scans the box, the carton
 * and the pallet as well. Each packing level gets its own GTIN-14 built from
 * the product's own body digits, which is how GS1 separates them.
 */
function buildProductBarcodes(): ProductBarcode[] {
  const out: ProductBarcode[] = [];
  for (const p of catalogProducts()) {
    if (!p.barcode) continue;
    const body = p.barcode.slice(0, 12);
    for (const level of PACK_LEVELS) {
      const primary = level.indicator === "0";
      const gtin = primary
        ? p.barcode
        : `${level.indicator}${body}${checkDigit(level.indicator + body)}`;
      out.push({ barcode: gtin, product: p.code, productName: p.name, level, primary });
    }
  }
  return out;
}

let barcodeCache: ProductBarcode[] | null = null;
export const productBarcodes = (): ProductBarcode[] => (barcodeCache ??= buildProductBarcodes());

export const findProductBarcode = (code: string) =>
  productBarcodes().find((b) => b.barcode === code) ?? null;

/* ---------- Location catalogue ---------- */

export interface LocationRow {
  key: string;
  warehouse: string;
  whName: string;
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  status: string;
}

const locKey = (wh: string, zone: string, rack: string, shelf: string, bin: string) =>
  `${wh}/${zone}/${rack}/${shelf}/${bin}`;

function buildLocations(): LocationRow[] {
  const seen = new Map<string, LocationRow>();
  for (const p of STOCK_POSITIONS) {
    const key = locKey(p.warehouse, p.zone, p.rack, p.shelf, p.bin);
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      warehouse: p.warehouse,
      whName: p.whName,
      zone: p.zone,
      rack: p.rack,
      shelf: p.shelf,
      bin: p.bin,
      status: p.blocked ? "Blocked" : "Active",
    });
  }
  /* Equipment bays are declared by Serial Tracking and carry no position
     until something is put in them, but they are still scannable. */
  for (const b of SERIAL_BINS) {
    const key = locKey(b.warehouse, b.zone, b.rack, b.shelf, b.bin);
    if (seen.has(key)) continue;
    seen.set(key, { key, warehouse: b.warehouse, whName: b.whName, zone: b.zone, rack: b.rack, shelf: b.shelf, bin: b.bin, status: "Active" });
  }
  return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
}

let locationCache: LocationRow[] | null = null;
export const locations = (): LocationRow[] => (locationCache ??= buildLocations());

export const findLocation = (key: string) =>
  locations().find((l) => l.key === key) ?? null;

/** Positions standing at one location. */
export const locationStock = (key: string) =>
  STOCK_POSITIONS.filter((p) => locKey(p.warehouse, p.zone, p.rack, p.shelf, p.bin) === key);

/* ---------- Package catalogue ---------- */

export interface PackageRow {
  key: string;
  /** Scannable label code, e.g. PKG-SHP-260031-01. */
  barcode: string;
  no: string;
  shipment: string;
  customer: string;
  customerCode: string;
  carrier: string;
  tracking: string;
  status: string;
  boxType: string;
  weight: number;
  dims: string;
  dispatch: string;
  expected: string;
  deliveryStatus: string;
  doRef: string;
}

/** SHP-2026-000031 + PKG-01 → PKG-SHP-260031-01, the code on the box. */
export function packageBarcode(shipment: string, no: string): string {
  const m = shipment.match(/^SHP-(\d{4})-0*(\d+)$/);
  const short = m ? `SHP-${m[1].slice(2)}${pad(Number(m[2]), 4)}` : shipment;
  return `PKG-${short}-${no.replace(/^PKG-/, "")}`;
}

function buildPackages(): PackageRow[] {
  const out: PackageRow[] = [];
  for (const s of SHIPMENTS) {
    for (const p of s.packages ?? []) {
      out.push({
        key: `${s.code}|${p.no}`,
        barcode: packageBarcode(s.code, p.no),
        no: p.no,
        shipment: s.code,
        customer: s.customer,
        customerCode: s.customerCode,
        carrier: s.carrier,
        tracking: p.trackingNo,
        status: p.status,
        boxType: p.boxType,
        weight: p.weight,
        dims: `${p.length} × ${p.width} × ${p.height} cm`,
        dispatch: s.dispatchDate || s.shipmentDate,
        expected: s.expectedDelivery,
        deliveryStatus: s.deliveryStatus,
        doRef: s.doRef,
      });
    }
  }
  return out;
}

let packageCache: PackageRow[] | null = null;
export const packages = (): PackageRow[] => (packageCache ??= buildPackages());

export const findPackage = (key: string) => packages().find((p) => p.key === key) ?? null;

/** Lines packed into one box. */
export function packageItems(pkg: PackageRow) {
  const s = SHIPMENTS.find((x) => x.code === pkg.shipment);
  return (s?.items ?? []).filter((i) => i.packageNo === pkg.no);
}

/* ---------- Document catalogue ---------- */

export interface DocumentRow {
  code: string;
  entity: string;
  type: string;
  status: string;
  date: string;
  party: string;
  warehouse: string;
  items: number;
  qty: number;
  amount: number;
  createdBy: string;
  updated: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

const docRow = (
  d: AnyDoc,
  entity: string,
  type: string,
  opts: { date?: string; party?: string; wh?: string; amount?: number } = {},
): DocumentRow => {
  const items = (d.items ?? []) as AnyDoc[];
  return {
    code: d.code,
    entity,
    type,
    status: d.status ?? "—",
    date: opts.date ?? d.docDate ?? d.created?.split(" ")[0] ?? "",
    party: opts.party ?? d.customer ?? d.supplier ?? "—",
    warehouse: opts.wh ?? d.warehouse ?? "—",
    items: items.length,
    qty: items.reduce(
      (t, i) => t + (i.qty ?? i.shipmentQty ?? i.receiveNow ?? i.ordered ?? i.orderedQty ?? 0),
      0,
    ),
    amount: opts.amount ?? d.grandTotal ?? d.total ?? 0,
    createdBy: d.createdBy ?? d.buyer ?? d.requestedBy ?? "—",
    updated: d.updated ?? "",
  };
};

function buildDocuments(): DocumentRow[] {
  return [
    ...PURCHASE_ORDERS.map((d) => docRow(d, "purchase-order", "Purchase Order", { date: d.orderDate })),
    ...GOODS_RECEIPTS.map((d) => docRow(d, "goods-receipt", "Goods Receipt", { date: d.receiptDate })),
    ...QC_INSPECTIONS.map((d) => docRow(d, "qc-inspection", "QC Inspection", { date: d.inspectionDate })),
    ...PUTAWAY_TASKS.map((d) => docRow(d, "put-away", "Put Away")),
    ...SALES_ORDERS.map((d) => docRow(d, "sales-order", "Sales Order", { date: d.orderDate })),
    ...PICKING_TASKS.map((d) => docRow(d, "picking", "Picking", { date: d.pickDate })),
    ...PACKING_TASKS.map((d) => docRow(d, "packing", "Packing")),
    ...DELIVERY_ORDERS.map((d) => docRow(d, "delivery-order", "Delivery Order")),
    ...SALES_INVOICES.map((d) => docRow(d, "sales-invoice", "Sales Invoice", { date: d.invoiceDate })),
    ...SHIPMENTS.map((d) => docRow(d, "shipment", "Shipment", { date: d.shipmentDate })),
    ...SALES_RETURNS.map((d) => docRow(d, "sales-return", "Sales Return")),
    ...CREDIT_NOTES.map((d) => docRow(d, "credit-note", "Credit Note")),
    ...TRANSFER_ROWS.map((d) => docRow(d, "stock-transfer", "Stock Transfer", { date: d.transferDate })),
    ...ADJUSTMENT_ROWS.map((d) => docRow(d, "stock-adjustment", "Stock Adjustment", { date: d.adjDate })),
    ...COUNT_ROWS.map((d) => docRow(d, "cycle-count", "Cycle Count", { date: d.countDate })),
  ];
}

let docCache: DocumentRow[] | null = null;
export const documents = (): DocumentRow[] => (docCache ??= buildDocuments());

export const findDocument = (code: string) =>
  documents().find((d) => d.code === code) ?? null;

/** Prefix → module, the routing table the spec spells out. */
export const DOC_PREFIXES: { prefix: string; type: string; entity: string }[] = [
  { prefix: "PO", type: "Purchase Order", entity: "purchase-order" },
  { prefix: "GR", type: "Goods Receipt", entity: "goods-receipt" },
  { prefix: "QC", type: "QC Inspection", entity: "qc-inspection" },
  { prefix: "PA", type: "Put Away", entity: "put-away" },
  { prefix: "SO", type: "Sales Order", entity: "sales-order" },
  { prefix: "PK", type: "Picking", entity: "picking" },
  { prefix: "PACK", type: "Packing", entity: "packing" },
  { prefix: "DO", type: "Delivery Order", entity: "delivery-order" },
  { prefix: "INV", type: "Sales Invoice", entity: "sales-invoice" },
  { prefix: "SHP", type: "Shipment", entity: "shipment" },
  { prefix: "RTN", type: "Sales Return", entity: "sales-return" },
  { prefix: "CN", type: "Credit Note", entity: "credit-note" },
  { prefix: "TRF", type: "Stock Transfer", entity: "stock-transfer" },
  { prefix: "ADJ", type: "Stock Adjustment", entity: "stock-adjustment" },
  { prefix: "CNT", type: "Cycle Count", entity: "cycle-count" },
];

export const docPrefixOf = (code: string) =>
  DOC_PREFIXES.filter((p) => code.toUpperCase().startsWith(p.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0] ?? null;

/* ---------- GS1 parsing ---------- */

export interface Gs1Field {
  ai: string;
  label: string;
  value: string;
  display: string;
}

export interface Gs1Parse {
  ok: boolean;
  fields: Gs1Field[];
  issues: string[];
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** YYMMDD → 30 Jun 2028, or an issue when the date cannot exist. */
function gs1Date(v: string): { display: string; issue?: string } {
  if (!/^\d{6}$/.test(v)) return { display: v, issue: `วันที่ ${v} ไม่ใช่รูปแบบ YYMMDD` };
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12) return { display: v, issue: `เดือน ${mm} ไม่ถูกต้อง` };
  const max = MONTH_DAYS[mm - 1];
  if (dd < 1 || dd > max) return { display: v, issue: `วันที่ ${dd} ไม่มีในเดือน ${mm}` };
  return { display: `${pad(dd, 2)}/${pad(mm, 2)}/${2000 + yy}` };
}

/**
 * Phase 1 GS1 parsing. Bracketed AIs only — the concatenated form needs the
 * FNC1 separator a real scanner supplies, which a typed input cannot carry.
 */
export function parseGS1(raw: string): Gs1Parse {
  const fields: Gs1Field[] = [];
  const issues: string[] = [];
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(raw))) {
    const [, ai, value] = m;
    const def = getAi(ai);
    if (!def) {
      issues.push(`AI (${ai}) ยังไม่รองรับในเฟสนี้`);
      continue;
    }
    if (!value) {
      issues.push(`AI (${ai}) ไม่มีค่าตามหลัง`);
      continue;
    }
    if (def.kind === "gtin" && value.length !== 14) {
      issues.push(`GTIN ใน AI (${ai}) ต้องมี 14 หลัก`);
      continue;
    }
    if (def.kind === "date") {
      const d = gs1Date(value);
      if (d.issue) {
        issues.push(d.issue);
        continue;
      }
      fields.push({ ai, label: def.label, value, display: d.display });
      continue;
    }
    fields.push({ ai, label: def.label, value, display: value });
  }

  if (!fields.length && !issues.length) issues.push("ไม่พบ Application Identifier ที่รองรับ");
  return { ok: issues.length === 0 && fields.length > 0, fields, issues };
}

export const isGs1 = (raw: string) => /\(\d{2,4}\)/.test(raw);

/** A GTIN-14 from a GS1 label maps back to the 13-digit barcode we print. */
export const gtinToBarcode = (gtin: string) =>
  gtin.length === 14 && gtin.startsWith("0") ? gtin.slice(1) : gtin;

/* ---------- Matches ---------- */

export type EntityKind = "product" | "lot" | "serial" | "location" | "package" | "document";

export interface Match {
  kind: EntityKind;
  typeLabel: string;
  /** Key the result router reopens the match with. */
  key: string;
  code: string;
  name: string;
  status: string;
  tone: BadgeTone;
  place: string;
  updated: string;
  icon: string;
  /** How the code was matched, shown on the multiple-match screen. */
  via: string;
}

export const KIND_LABEL: Record<EntityKind, string> = {
  product: "Product",
  lot: "Lot",
  serial: "Serial",
  location: "Location",
  package: "Package",
  document: "Document",
};

const productMatch = (code: string, via: string): Match | null => {
  const p = catalogProducts().find((x) => x.code === code);
  if (!p) return null;
  return {
    kind: "product",
    typeLabel: "Product",
    key: p.code,
    code: p.code,
    name: p.name,
    status: p.equipment ? "Serialised Equipment" : "Active",
    tone: "success",
    place: p.cat || "—",
    updated: "",
    icon: p.icon,
    via,
  };
};

const lotMatch = (code: string, via: string): Match[] =>
  lotRows()
    .filter((l) => l.aliases.includes(code))
    .map((l) => ({
      kind: "lot" as const,
      typeLabel: "Lot",
      key: l.code,
      code: l.lot,
      name: l.productName,
      status: l.lotStatus,
      tone: "info" as BadgeTone,
      place: l.warehouses.join(", ") || "ไม่มีสต๊อกคงเหลือ",
      updated: l.lastMovement,
      icon: l.icon,
      via,
    }));

const serialMatch = (code: string, via: string): Match[] =>
  serialRows()
    .filter((s) => s.serial === code)
    .map((s) => ({
      kind: "serial" as const,
      typeLabel: "Serial",
      key: s.code,
      code: s.serial,
      name: s.productName,
      status: s.lifecycle,
      tone: "primary" as BadgeTone,
      place: s.warehouse || s.customer || s.owner,
      updated: s.lastMovement,
      icon: s.icon,
      via,
    }));

const locationMatch = (key: string, via: string): Match | null => {
  const l = findLocation(key);
  if (!l) return null;
  return {
    kind: "location",
    typeLabel: "Location",
    key: l.key,
    code: `${l.zone}-${l.rack}-${l.bin}`,
    name: l.whName,
    status: l.status,
    tone: l.status === "Blocked" ? "danger" : "success",
    place: l.warehouse,
    updated: "",
    icon: "🏷️",
    via,
  };
};

const packageMatch = (code: string, via: string): Match[] =>
  packages()
    .filter((p) => p.barcode === code || p.no === code || p.tracking === code || p.key === code)
    .map((p) => ({
      kind: "package" as const,
      typeLabel: "Package",
      key: p.key,
      code: p.barcode,
      name: p.shipment,
      status: p.status,
      tone: "info" as BadgeTone,
      place: p.customer,
      updated: p.dispatch,
      icon: "📦",
      via,
    }));

const documentMatch = (code: string, via: string): Match | null => {
  const d = findDocument(code);
  if (!d) return null;
  return {
    kind: "document",
    typeLabel: "Document",
    key: d.code,
    code: d.code,
    name: d.type,
    status: d.status,
    tone: "neutral",
    place: d.party,
    updated: d.updated,
    icon: "📄",
    via,
  };
};

/* ---------- Recognition ---------- */

export type Outcome = "Found" | "Multiple Matches" | "Not Found" | "Invalid";

export interface Recognition {
  raw: string;
  normalized: string;
  /** Semantic type — what the code means. */
  codeType: string;
  /** Symbology — how the code was printed, where it can be told. */
  symbology: string;
  outcome: Outcome;
  matches: Match[];
  gs1?: Gs1Parse;
  issue?: string;
  suggestion?: string;
  checkDigitOk?: boolean;
}

/**
 * Trim, collapse the slash and hyphen forms of a location path, and upper-case
 * everything except a GS1 payload, where case can be significant.
 */
export function normalize(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  return isGs1(t) ? t : t.toUpperCase();
}

const LOC_RE = /^WH-[A-Z]+(-[A-Z]+)?[/-]ZONE/i;

/** Accepts both the slash path the ERP stores and the hyphen form on labels. */
function locationKeyOf(code: string): string | null {
  const slashed = code.replace(/-(?=ZONE|RACK|SHELF|BIN)/gi, "/");
  const direct = findLocation(slashed);
  if (direct) return direct.key;
  /* A four-part code without the shelf still identifies one bin. */
  const parts = slashed.split("/");
  if (parts.length === 4) {
    const hit = locations().find(
      (l) => l.warehouse === parts[0] && l.zone === parts[1] && l.rack === parts[2] && l.bin === parts[3],
    );
    return hit?.key ?? null;
  }
  return null;
}

const ALIAS_TYPE: Record<string, string> = {
  product: "Product Code",
  lot: "Lot Number",
  serial: "Serial Number",
  location: "Location Code",
  package: "Package Number",
  document: "Document Number",
};

/**
 * What the code looked like, for a scan that matched nothing. Telling a user
 * "this is a lot number we do not have" beats "unknown code".
 */
function guessType(code: string): string {
  if (isGs1(code)) return "GS1 Composite Code";
  if (/^\d{13}$/.test(code) || /^\d{14}$/.test(code)) return "Product Barcode";
  if (/^LOT[-\s]?/i.test(code)) return "Lot Number";
  if (/^(PKG|BOX)-/i.test(code)) return "Package Number";
  if (/^WH-[A-Z]/i.test(code) && /(ZONE|RACK|BIN)/i.test(code)) return "Location Code";
  if (docPrefixOf(code)) return "Document Number";
  if (/^(SN|[A-Z]{3})-[A-Z]{2}-\d{4,}$/i.test(code)) return "Serial Number";
  if (/^[A-Z0-9]+(-[A-Z0-9]+){1,3}$/i.test(code)) return "Product Code";
  return "Unknown Code";
}

function symbologyOf(code: string): string {
  if (isGs1(code)) return "GS1-128";
  if (/^\d{13}$/.test(code)) return "EAN-13";
  if (/^\d{12}$/.test(code)) return "UPC-A";
  if (/^\d{8}$/.test(code)) return "EAN-8";
  if (/^\d{14}$/.test(code)) return "GS1 DataMatrix";
  if (/^[A-Z0-9\-./ ]+$/.test(code)) return "Code 128";
  return "Internal A-Factory Barcode";
}

function declaredInvalid(code: string) {
  return INVALID_CODES.find((x) => x.code.toUpperCase() === code.toUpperCase()) ?? null;
}

/**
 * The lookup order the spec lays out: exact barcode, serial, lot, location,
 * package, document, product code — then, only if nothing hit, a partial
 * search. Every candidate is confirmed against the owning module.
 */
export function recognize(raw: string): Recognition {
  const normalized = normalize(raw);
  const base: Recognition = {
    raw,
    normalized,
    codeType: "Unknown Code",
    symbology: symbologyOf(normalized),
    outcome: "Not Found",
    matches: [],
  };

  if (!normalized) {
    return { ...base, outcome: "Invalid", issue: "ยังไม่ได้ใส่รหัส", suggestion: "สแกนหรือพิมพ์รหัสก่อน" };
  }

  /* 0. Malformed input never reaches the catalogues. */
  const declared = declaredInvalid(normalized);
  if (declared) {
    return {
      ...base,
      codeType: declared.format,
      outcome: "Invalid",
      issue: declared.issue,
      suggestion: declared.suggestion,
      gs1: isGs1(normalized) ? parseGS1(normalized) : undefined,
    };
  }
  if (/[^\w\-./() ]/.test(normalized)) {
    return {
      ...base,
      outcome: "Invalid",
      issue: "พบอักขระที่ไม่ใช่รหัส — น่าจะอ่านผิดจากป้ายที่ชำรุด",
      suggestion: "ทำความสะอาดป้ายแล้วสแกนใหม่",
    };
  }

  /* 1. GS1 composite: parse it, then look the payload up. */
  if (isGs1(normalized)) {
    const gs1 = parseGS1(normalized);
    if (!gs1.ok) {
      return {
        ...base,
        codeType: "GS1 Composite Code",
        outcome: "Invalid",
        gs1,
        issue: gs1.issues[0],
        suggestion: "รองรับ (01) (10) (17) (21) (30) (37)",
      };
    }
    const matches: Match[] = [];
    const serial = gs1.fields.find((f) => f.ai === "21")?.value;
    const lot = gs1.fields.find((f) => f.ai === "10")?.value;
    const gtin = gs1.fields.find((f) => f.ai === "01")?.value;

    if (serial) matches.push(...serialMatch(serial, "GS1 (21) Serial"));
    if (lot) matches.push(...lotMatch(lot, "GS1 (10) Lot"));
    if (gtin) {
      const hit = findProductBarcode(gtinToBarcode(gtin));
      const p = hit && productMatch(hit.product, "GS1 (01) GTIN");
      if (p) matches.push(p);
    }
    return {
      ...base,
      codeType: "GS1 Composite Code",
      gs1,
      matches,
      outcome: matches.length === 0 ? "Not Found" : matches.length === 1 ? "Found" : "Multiple Matches",
    };
  }

  const matches: Match[] = [];
  let codeType = "Unknown Code";

  /* 2. Exact product barcode. */
  const bc = findProductBarcode(normalized);
  if (bc) {
    codeType = "Product Barcode";
    const p = productMatch(bc.product, `${bc.level.label} barcode`);
    if (p) matches.push(p);
  }

  /* 3. Exact serial. */
  const serials = serialMatch(normalized, "Serial number");
  if (serials.length) {
    codeType = "Serial Number";
    matches.push(...serials);
  }

  /* 4. Exact lot. */
  const lots = lotMatch(normalized, "Lot number");
  if (lots.length) {
    if (codeType === "Unknown Code") codeType = "Lot Number";
    matches.push(...lots);
  }

  /* 5. Exact location. */
  const locKeyHit = locationKeyOf(normalized);
  if (locKeyHit) {
    if (codeType === "Unknown Code") codeType = "Location Code";
    const l = locationMatch(locKeyHit, "Location code");
    if (l) matches.push(l);
  }

  /* 6. Package or tracking number. */
  const pkgs = packageMatch(normalized, "Package label");
  if (pkgs.length) {
    if (codeType === "Unknown Code") {
      const byTracking = packages().some((p) => p.tracking === normalized);
      codeType = byTracking ? "Shipment Tracking" : "Package Number";
    }
    matches.push(...pkgs);
  }

  /* 7. Document number. */
  const doc = documentMatch(normalized, "Document number");
  if (doc) {
    if (codeType === "Unknown Code") codeType = "Document Number";
    matches.push(doc);
  }

  /* 8. Product code. */
  const byCode = productMatch(normalized, "Product code");
  if (byCode) {
    if (codeType === "Unknown Code") codeType = "Product Code";
    matches.push(byCode);
  }

  /* 9. Legacy aliases — the reason two entities can answer to one code. */
  for (const a of CODE_ALIASES.filter((x) => x.code.toUpperCase() === normalized)) {
    const via = `Legacy alias — ${a.note}`;
    const hit =
      a.kind === "product"
        ? productMatch(a.target, via)
        : a.kind === "location"
          ? locationMatch(a.target, via)
          : a.kind === "document"
            ? documentMatch(a.target, via)
            : null;
    if (hit) matches.push(hit);
    if (a.kind === "serial") {
      const s = serialRows().find((x) => x.code === a.target);
      if (s) matches.push(...serialMatch(s.serial, via));
    }
    if (a.kind === "lot") {
      const l = lotRows().find((x) => x.code === a.target);
      if (l) matches.push(...lotMatch(l.lot, via));
    }
    if (a.kind === "package") {
      const p = findPackage(a.target);
      if (p) matches.push(...packageMatch(p.barcode, via));
    }
    if (codeType === "Unknown Code") codeType = ALIAS_TYPE[a.kind];
  }

  const unique = matches.filter(
    (m, i) => matches.findIndex((x) => x.kind === m.kind && x.key === m.key) === i,
  );

  return {
    ...base,
    codeType: codeType === "Unknown Code" ? guessType(normalized) : codeType,
    matches: unique,
    checkDigitOk: /^\d{8,14}$/.test(normalized) ? checkDigitValid(normalized) : undefined,
    outcome: unique.length === 0 ? "Not Found" : unique.length === 1 ? "Found" : "Multiple Matches",
  };
}

/** Fallback when nothing matched exactly — a contains search over the catalogues. */
export function partialSearch(raw: string, limit = 12): Match[] {
  const q = normalize(raw);
  if (q.length < 2) return [];
  const out: Match[] = [];
  const has = (v: string) => v.toUpperCase().includes(q);

  for (const p of catalogProducts()) {
    if (has(p.code) || has(p.name) || has(p.barcode)) {
      const m = productMatch(p.code, "Partial match");
      if (m) out.push(m);
    }
  }
  for (const l of lotRows()) if (has(l.lot)) out.push(...lotMatch(l.lot, "Partial match"));
  for (const s of serialRows()) if (has(s.serial)) out.push(...serialMatch(s.serial, "Partial match"));
  for (const l of locations()) {
    if (has(l.key)) {
      const m = locationMatch(l.key, "Partial match");
      if (m) out.push(m);
    }
  }
  for (const p of packages()) if (has(p.barcode) || has(p.tracking)) out.push(...packageMatch(p.barcode, "Partial match"));
  for (const d of documents()) {
    if (has(d.code)) {
      const m = documentMatch(d.code, "Partial match");
      if (m) out.push(m);
    }
  }

  return out
    .filter((m, i) => out.findIndex((x) => x.kind === m.kind && x.key === m.key) === i)
    .slice(0, limit);
}

/* ---------- Scan log ---------- */

export interface ScanRow extends Omit<ScanRecord, "code">, RecordBase {
  /** The scan id. */
  code: string;
  /** What was actually scanned. */
  scanned: string;
}

function seedLog() {
  if (SCAN_LOG.length) return;
  SCAN_SEED.forEach((s, i) => {
    const [code, codeType, entity, resultCode, resultName, resultStatus, source, warehouse, user, outcome] = s;
    SCAN_LOG.push({
      id: `SCN-${pad(1000 - i, 4)}`,
      code,
      codeType,
      entity,
      resultCode,
      resultName,
      resultStatus,
      source,
      warehouse,
      user,
      when: SCAN_STAMPS[i] ?? SCAN_STAMPS[SCAN_STAMPS.length - 1],
      outcome,
      key: resultCode,
    });
  });
}

export function scanRows(): ScanRow[] {
  seedLog();
  return SCAN_LOG.map((s) => ({ ...s, code: s.code, ...({ code: s.code } as object) })) as ScanRow[];
}

/** Registry rows need `code`; the scan id is the addressable key. */
/** Registry rows are addressed by `code`, so the scan id becomes the code. */
export function scanHistory(): ScanRow[] {
  seedLog();
  return SCAN_LOG.map((s) => ({ ...s, code: s.id, scanned: s.code }));
}

export const recentScans = (n = 20) => scanHistory().slice(0, n);

/** Records that somebody looked. It changes nothing else. */
export function logScan(
  rec: Recognition,
  opts: { source: string; warehouse: string; user: string; when: string },
): ScanRecord {
  seedLog();
  const hit = rec.outcome === "Found" ? rec.matches[0] : undefined;
  const entry: ScanRecord = {
    id: nextScanId(),
    code: rec.raw,
    codeType: rec.codeType,
    entity: hit ? hit.typeLabel : "",
    resultCode: hit?.code ?? "",
    resultName: hit?.name ?? "",
    resultStatus: hit?.status ?? "",
    source: opts.source,
    warehouse: opts.warehouse,
    user: opts.user,
    when: opts.when,
    outcome: rec.outcome,
    key: hit ? `${hit.kind}|${hit.key}` : "",
  };
  SCAN_LOG.unshift(entry);
  return entry;
}

export function removeScan(id: string) {
  const i = SCAN_LOG.findIndex((s) => s.id === id);
  if (i >= 0) SCAN_LOG.splice(i, 1);
}

export function invalidateBarcodes() {
  barcodeCache = null;
  locationCache = null;
  packageCache = null;
  docCache = null;
}

/* ---------- Summary ---------- */

export interface BarcodeSummary {
  productBarcodes: number;
  lots: number;
  serials: number;
  locations: number;
  packages: number;
  documents: number;
  scans: number;
  notFound: number;
}

export function barcodeSummary(): BarcodeSummary {
  const log = scanHistory();
  return {
    productBarcodes: productBarcodes().length,
    lots: lotRows().length,
    serials: serialRows().length,
    locations: locations().length,
    packages: packages().length,
    documents: documents().length,
    scans: log.length,
    notFound: log.filter((s) => s.outcome === "Not Found" || s.outcome === "Invalid").length,
  };
}

/* ---------- Shared lookups the result views need ---------- */

export const productStock = (code: string) => STOCK_POSITIONS.filter((p) => p.product === code);

export const productMovements = (code: string, n = 10) =>
  movementRows()
    .filter((m) => m.product === code)
    .slice(0, n);

export const warehouseName = (code: string) =>
  WAREHOUSES.find((w) => w.code === code)?.name ?? code;

export const getCatalogProduct = (code: string) =>
  catalogProducts().find((p) => p.code === code) ?? null;

export const productMaster = (code: string) => getProduct(code);

export { GS1_AIS };
