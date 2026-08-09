import { QUOTATIONS as RAW_QT, type Quotation } from "@/data/quotations";
import { SALES_REQUESTS as RAW_SR, type SalesRequest } from "@/data/sales-requests";
import { SALES_ORDERS as RAW_SO, type SalesOrder } from "@/data/sales-orders";
import { PICKING_TASKS as RAW_PK, type PickingTask } from "@/data/picking";
import { PACKING_TASKS as RAW_PACK, type PackingTask } from "@/data/packing";
import { DELIVERY_ORDERS as RAW_DO, type DeliveryOrder } from "@/data/delivery-orders";
import { BP_SELLABLE_STATUS } from "@/data/partners";
import { BUSINESS_PARTNERS } from "./partner";
import { SALES_REPRESENTATIVES } from "./sales";
import { PRODUCTS, productStock } from "./product";
import { WAREHOUSES } from "./warehouse";
import { docGrandTotal, pctOf } from "./lines";
import { recordTotals } from "./lines";
import { DASH, daysUntil } from "@/lib/format";

/* ============================================================
   OUTBOUND — the sell side, mirroring the purchase chain:

     Sales Request → Sales Order → Picking → Packing → Delivery

   Every document resolves its customer, sales rep, warehouse and
   products against the same masters the buy side uses, so a rename
   in Business Partner shows up everywhere at once.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/* ---------- Shared master-data lookups ---------- */

/** Partners we may sell to — customers and dealers, never suppliers-only. */
export const outboundCustomers = () =>
  BUSINESS_PARTNERS.filter((b) => b.roles?.customer || b.roles?.dealer);

export const customerOptions = () =>
  outboundCustomers().map((b) => `${b.code} - ${b.nameTh}`);

/** "BP000123 - บริษัท ..." → the partner record. Accepts a bare code too. */
export const getCustomer = (label: string) => {
  const code = String(label ?? "").split(" - ")[0].trim();
  return BUSINESS_PARTNERS.find((b) => b.code === code) ?? null;
};

export const salesRepOptions = () =>
  SALES_REPRESENTATIVES.filter((r) => r.status === "Active").map(
    (r) => `${r.code} - ${r.first} ${r.last}`,
  );

export const getSalesRep = (label: string) => {
  const code = String(label ?? "").split(" - ")[0].trim();
  return SALES_REPRESENTATIVES.find((r) => r.code === code) ?? null;
};

export const warehouseOptions = () => WAREHOUSES.map((w) => `${w.code} ${w.name}`);

/** Ship-to choices come from the customer's own address book. */
export function shipToOptions(customerLabel: string): string[] {
  const bp = getCustomer(customerLabel);
  if (!bp) return [];
  return (bp.addresses ?? [])
    .filter((a) => a.active)
    .map((a) => [a.l1, a.sub, a.dist, a.prov, a.zip].filter(Boolean).join(" "));
}

/**
 * Credit position for a customer, with this order's value applied on top.
 * `limit === 0` means the customer trades on cash terms only.
 */
export function creditCheck(customerLabel: string, orderValue: number) {
  const bp = getCustomer(customerLabel);
  const limit = num(bp?.credit?.limit);
  const outstanding = num(bp?.credit?.outstanding);
  const projected = outstanding + orderValue;
  const available = Math.max(0, limit - outstanding);

  return {
    found: Boolean(bp),
    limit,
    outstanding,
    available,
    projected,
    /** Cash-only customers never block; everyone else must stay inside the limit. */
    withinLimit: limit === 0 || projected <= limit,
    cashOnly: limit === 0,
    status: bp?.credit?.status ?? "Not Applicable",
    overBy: Math.max(0, projected - limit),
  };
}

/** Can the warehouse actually serve this line today? */
export function availabilityFor(code: string, qty: number) {
  const st = productStock(code);
  if (!st) return null;
  return { ...st, shortBy: Math.max(0, qty - st.available), enough: st.available >= qty };
}

export const productOptions = () => PRODUCTS.map((p) => p.code);

const nextSeq = (codes: string[], prefix: string, pad: number) => {
  const n = codes.reduce((m, c) => {
    const digits = String(c).replace(/\D/g, "").slice(-4);
    return Math.max(m, parseInt(digits, 10) || 0);
  }, 0);
  return `${prefix}${String(n + 1).padStart(pad, "0")}`;
};

/* ============================================================
   QUOTATION — optional, and the only outbound document that
   carries a price validity window.
   ============================================================ */

export interface QtRow extends Quotation {
  amount: number;
  itemCount: number;
  name: string;
  icon: string;
  daysLeft: number | null;
  isExpiring: boolean;
  isExpired: boolean;
}

export const QUOTATIONS = RAW_QT as QtRow[];

/**
 * What the list column and the KPI tiles show — the same figure as the sheet.
 *
 * `docGrandTotal` sums the lines only. Once a quotation could carry freight
 * and a header discount, that stopped being the amount the customer is asked
 * for, and a list showing one number beside a document showing another is the
 * same fault as the two print paths disagreeing, one screen further out.
 */
export const qtTotal = (qt: Parameters<typeof recordTotals>[0]) =>
  recordTotals(qt).grandTotal;

export function decorateQuotations() {
  for (const qt of QUOTATIONS) {
    qt.amount = qtTotal(qt);
    qt.itemCount = qt.items?.length ?? 0;
    qt.name = qt.code;
    qt.icon = "📝";
    qt.daysLeft = daysUntil(qt.validUntil);
    /* Only a quote still awaiting an answer can expire. */
    const open = ["Draft", "Sent", "Accepted"].includes(qt.status);
    qt.isExpired = open && qt.daysLeft !== null && qt.daysLeft < 0;
    qt.isExpiring = open && qt.daysLeft !== null && qt.daysLeft >= 0 && qt.daysLeft <= 7;
  }
}

decorateQuotations();

export const getQT = (code: string) => QUOTATIONS.find((q) => q.code === code) ?? null;

export const nextQuotationCode = () =>
  nextSeq(QUOTATIONS.map((q) => q.code), "QT2507-", 4);

/**
 * Quotes the customer accepted that have not been converted yet — by either
 * route. Checking only `srRef` would offer a quote that already became an
 * order straight from here.
 */
export const convertibleQuotations = () =>
  QUOTATIONS.filter((q) => q.status === "Accepted" && !q.srRef && !q.soRef);

/* ============================================================
   SALES REQUEST — required, internal, and deliberately free of
   any stock reservation. Availability shown against a request is
   indicative; the Sales Order is what commits inventory.
   ============================================================ */

export interface SrRow extends SalesRequest {
  amount: number;
  itemCount: number;
  name: string;
  icon: string;
  /** Days until the customer needs the goods; negative once overdue. */
  daysToRequired: number | null;
  isUrgent: boolean;
  awaitingApproval: boolean;
  isConvertible: boolean;
}

export const SALES_REQUESTS = RAW_SR as SrRow[];

/** Same one figure as the sheet — see qtTotal. */
export const srTotal = (sr: Parameters<typeof recordTotals>[0]) =>
  recordTotals(sr).grandTotal;

export function decorateSalesRequests() {
  for (const sr of SALES_REQUESTS) {
    sr.amount = srTotal(sr);
    sr.itemCount = sr.items?.length ?? 0;
    sr.name = sr.code;
    sr.icon = "📄";
    sr.daysToRequired = daysUntil(sr.requiredDate);
    const open = ["Draft", "Submitted", "Approved"].includes(sr.status);
    sr.isUrgent = open && sr.daysToRequired !== null && sr.daysToRequired <= 3;
    sr.awaitingApproval = sr.status === "Submitted";
    sr.isConvertible = sr.status === "Approved" && !sr.soRef;
  }
}

decorateSalesRequests();

export const getSR = (code: string) => SALES_REQUESTS.find((s) => s.code === code) ?? null;

/** Named in full — `nextSRCode` already belongs to the Sales Rep master. */
export const nextSalesRequestCode = () =>
  nextSeq(SALES_REQUESTS.map((s) => s.code), "SR2507-", 4);

/** Approved requests waiting to become an order. */
export const convertibleRequests = () => SALES_REQUESTS.filter((s) => s.isConvertible);

/* ============================================================
   SALES ORDER
   ============================================================ */

export interface SoRow extends SalesOrder {
  total: number;
  itemCount: number;
  name: string;
  icon: string;
  orderedQty: number;
  pickedQty: number;
  deliveredQty: number;
  pickPct: number;
  deliverPct: number;
  outstandingQty: number;
  isOverdue: boolean;
  /**
   * Set when this order bills differently from the document it was created
   * from. Null when they agree, or when there is no source to compare with.
   */
  billTypeDrift: BillTypeDrift | null;
}

/* ============================================================
   BILLING THAT CHANGED ON THE WAY DOWN

   Changing VAT ⇄ Non VAT mid-chain is allowed — a customer may
   register for VAT between the quotation and the order — but it
   must never happen quietly, because it moves the money.

   The comparison is always against the document THIS one was
   created from, not the top of the chain. What somebody needs to
   know standing in front of an order is "does this differ from
   the paper it came from", and a legitimate change made once at
   the quotation would otherwise flag every document downstream of
   it for the rest of the chain's life.
   ============================================================ */

export interface BillTypeDrift {
  /** The document this one was created from. */
  code: string;
  /** How that document is named in Thai — for a badge, not a lookup. */
  label: string;
  /** What the source bills as. */
  billType: string;
  /** What this document bills as. */
  own: string;
}

/* ============================================================
   A PARTNER NOBODY HAS CHECKED YET

   A salesperson can raise a partner and quote against it the
   same afternoon — waiting on an administrator to confirm a
   record before a price can be offered is how people end up
   keeping customers in a spreadsheet.

   A Sales Order is different: it is the document that binds the
   company, and it feeds picking, delivery and an invoice with a
   tax ID nobody has verified. So quotations and sales requests
   are open to a Draft partner and orders are not.
   ============================================================ */

/**
 * Why this partner cannot be sold to, or null when they can be.
 *
 * Returns the message rather than a boolean because every caller has to say
 * the same thing, and the thing worth saying is what the salesperson can do
 * instead — not merely that the door is shut.
 */
export function blockedForDraftPartner(customerCode: string): string | null {
  const bp = BUSINESS_PARTNERS.find((b) => b.code === customerCode);
  if (!bp) return null;
  if (BP_SELLABLE_STATUS.includes(bp.status)) return null;

  if (bp.status === "Draft") {
    return `${bp.code} ${bp.nameTh || bp.nameEn} รอการยืนยันจากผู้ดูแล — เปิดใบเสนอราคาหรือคำขอขายได้ แต่ยังเปิดใบสั่งขายไม่ได้`;
  }
  return `${bp.code} ${bp.nameTh || bp.nameEn} อยู่ในสถานะ ${bp.status} — เปิดใบสั่งขายไม่ได้`;
}

/** Compare against the immediate source. Null when they agree. */
export function billTypeDrift(
  own: string,
  source: { code: string; label: string; billType: string } | null,
): BillTypeDrift | null {
  if (!source || !source.billType || !own) return null;
  if (source.billType === own) return null;
  return { code: source.code, label: source.label, billType: source.billType, own };
}

export const SALES_ORDERS = RAW_SO as SoRow[];

/** Same one figure as the sheet — see qtTotal. */
export const soTotal = (so: Parameters<typeof recordTotals>[0]) => recordTotals(so).grandTotal;

const sumBy = (items: SalesOrder["items"] | undefined, pick: (it: SalesOrder["items"][number]) => number) =>
  (items ?? []).reduce((t, it) => t + pick(it), 0);

export const soOrderedQty = (so: { items?: SalesOrder["items"] }) =>
  sumBy(so.items, (it) => num(it.qty));
export const soPickedQty = (so: { items?: SalesOrder["items"] }) =>
  sumBy(so.items, (it) => num(it.picked));
export const soDeliveredQty = (so: { items?: SalesOrder["items"] }) =>
  sumBy(so.items, (it) => num(it.delivered));

/** What still has to leave the building. */
export const soOutstandingQty = (so: { items?: SalesOrder["items"] }) =>
  (so.items ?? []).reduce((t, it) => t + Math.max(0, num(it.qty) - num(it.delivered)), 0);

export function decorateSOs() {
  for (const so of SALES_ORDERS) {
    so.total = soTotal(so);
    so.itemCount = so.items?.length ?? 0;
    so.name = so.code;
    so.icon = "🧾";
    so.orderedQty = soOrderedQty(so);
    so.pickedQty = soPickedQty(so);
    so.deliveredQty = soDeliveredQty(so);
    so.pickPct = pctOf(so.pickedQty, so.orderedQty);
    so.deliverPct = pctOf(so.deliveredQty, so.orderedQty);
    so.outstandingQty = soOutstandingQty(so);

    /* The document that produced this order. Every new order comes from a
       sales request, so that is read first; `quotationRef` is only set on the
       orders raised during the spell when an accepted quote became an order
       directly, and those must still compare against the paper they actually
       came from. Never both. */
    const sr = so.srRef ? SALES_REQUESTS.find((r) => r.code === so.srRef) : null;
    const qt = !sr && so.quotationRef ? QUOTATIONS.find((q) => q.code === so.quotationRef) : null;
    so.billTypeDrift = billTypeDrift(
      so.billType,
      sr
        ? { code: sr.code, label: "คำขอขาย", billType: sr.billType }
        : qt
          ? { code: qt.code, label: "ใบเสนอราคา", billType: qt.billType }
          : null,
    );

    const d = daysUntil(so.deliveryDate);
    so.isOverdue =
      d !== null &&
      d < 0 &&
      so.deliverPct < 100 &&
      ["Confirmed", "Picking", "Partially Delivered", "On Hold"].includes(so.status);
  }
}

decorateSOs();

export const getSO = (code: string) => SALES_ORDERS.find((s) => s.code === code) ?? null;

export const nextSOCode = () => nextSeq(SALES_ORDERS.map((s) => s.code), "SO2507-", 4);

/** Open orders are the only ones worth generating warehouse work from. */
export const openSalesOrders = () =>
  SALES_ORDERS.filter((s) => ["Confirmed", "Picking", "Partially Delivered"].includes(s.status));

/* ============================================================
   CLOSING AN ORDER

   An order closes when the goods are with the customer and not
   before. Partial deliveries are ordinary here — the warehouse
   sends what it has and the rest follows — so what keeps the
   order open is the outstanding quantity, never the number of
   documents raised against it. A delivery note that shipped half
   the line still leaves half a line owed.

   Written as "why not", not as a boolean, because every caller
   has to tell somebody what is still missing.
   ============================================================ */

/** Why this order cannot be closed yet, or null when it can. */
export function soCloseBlocked(so: {
  status: string;
  items?: SalesOrder["items"];
}): string | null {
  if (so.status === "Completed") return "ใบสั่งขายนี้ปิดไปแล้ว";
  if (so.status === "Cancelled") return "ใบสั่งขายนี้ถูกยกเลิกแล้ว";
  const outstanding = soOutstandingQty(so);
  if (outstanding > 0)
    return `ยังส่งมอบไม่ครบ คงเหลืออีก ${outstanding} หน่วย — ปิดใบสั่งขายได้เมื่อส่งครบเท่านั้น`;
  return null;
}

/* ============================================================
   PICKING
   ============================================================ */

export interface PickRow extends PickingTask {
  name: string;
  icon: string;
  itemCount: number;
  orderedQty: number;
  pickedQty: number;
  pct: number;
  shortCount: number;
  headProduct: string;
  /** Of what is still to be picked, how much the warehouse can cover today. */
  readyQty: number;
  /** And how much of it is waiting on goods that have not arrived. */
  waitQty: number;
  /** Lines carrying any of that wait — the ones somebody has to chase. */
  waitLines: number;
}

export const PICKING_TASKS = RAW_PK as PickRow[];

export const pickOrderedQty = (t: { items?: PickingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.ordered), 0);
export const pickPickedQty = (t: { items?: PickingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.picked), 0);
/** Lines where the picker could not find everything the order asked for. */
export const pickShortLines = (t: { items?: PickingTask["items"] }) =>
  (t.items ?? []).filter((it) => num(it.picked) < num(it.ordered));

/* ============================================================
   WHAT CAN GO TODAY, AND WHAT HAS TO WAIT

   A picking task carries every line the order still owes, which
   is the point of it — one sheet, the whole order. What it could
   not say until now is which of those lines the warehouse can
   actually serve this morning.

   Read live off the stock master rather than stored on the task:
   the task may have been raised yesterday, and another order may
   have taken the same stock since. A number frozen at creation
   time would send a picker to an empty bin.

   Nothing here reserves anything. It answers "is it there", so
   the pick can be completed for what exists and the remainder
   follows as a back order — a partial delivery note, and an
   invoice for what was actually sent.
   ============================================================ */

export interface PickLineAvailability {
  /** Still to come off the shelf for this line. */
  remaining: number;
  /** Free stock right now. Null when the product is not in the master. */
  available: number | null;
  /** How much of `remaining` the warehouse can cover. */
  readyQty: number;
  /** How much of it is waiting on goods. */
  waitQty: number;
  /** True once nothing on this line is outstanding. */
  done: boolean;
}

export function pickLineAvailability(it: {
  code: string;
  ordered?: number;
  picked?: number;
}): PickLineAvailability {
  const picked = num(it.picked);
  const remaining = Math.max(0, num(it.ordered) - picked);
  const st = productStock(it.code);
  /* An unknown product is not "zero in stock" — nobody has said either way.
     Treated as coverable so an unmapped code shows up as a pick to attempt
     rather than as a phantom back order the buyer would go chasing. */
  const available = st ? st.available : null;
  /* Net of what this task has already taken. The stock figure is what was on
     the shelf before the picker started, so counting it again against the
     lines they have already picked would report the same units twice — and
     "รอของ" would shrink every time somebody picked, which is backwards. */
  const readyQty =
    available === null ? remaining : Math.max(0, Math.min(remaining, available - picked));
  return {
    remaining,
    available,
    readyQty,
    waitQty: remaining - readyQty,
    done: remaining === 0,
  };
}

/** Every line of a task with its availability worked out — what the sheet shows. */
export const pickLineViews = (t: { items?: PickingTask["items"] }) =>
  (t.items ?? []).map((it) => ({ ...it, ...pickLineAvailability(it) }));

export function decoratePicks() {
  for (const t of PICKING_TASKS) {
    t.name = t.code;
    t.icon = "📤";
    t.itemCount = t.items?.length ?? 0;
    t.orderedQty = pickOrderedQty(t);
    t.pickedQty = pickPickedQty(t);
    t.pct = pctOf(t.pickedQty, t.orderedQty);
    t.shortCount = pickShortLines(t).length;
    t.headProduct = t.items?.[0]?.name ?? DASH;

    const views = pickLineViews(t);
    t.readyQty = views.reduce((s, v) => s + v.readyQty, 0);
    t.waitQty = views.reduce((s, v) => s + v.waitQty, 0);
    t.waitLines = views.filter((v) => v.waitQty > 0).length;
  }
}

decoratePicks();

export const getPick = (code: string) => PICKING_TASKS.find((t) => t.code === code) ?? null;

export const nextPickCode = () =>
  nextSeq(PICKING_TASKS.map((t) => t.code), "PK2507-", 4);

/* ============================================================
   PACKING
   ============================================================ */

export interface PackRow extends PackingTask {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  packedQty: number;
  pct: number;
  boxCount: number;
  totalWeight: number;
  /** Total the warehouse says can ship. Zero until it has been confirmed. */
  confirmedQty: number;
  /** True once every line carries a confirmed figure. */
  isConfirmed: boolean;
  /** Confirmed below what the order asked for — the rest becomes back order. */
  shipsShort: boolean;
}

export const PACKING_TASKS = RAW_PACK as PackRow[];

export const packTotalQty = (t: { items?: PackingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.qty), 0);
export const packPackedQty = (t: { items?: PackingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.packedQty), 0);
export const packWeight = (t: { packages?: PackingTask["packages"] }) =>
  Math.round((t.packages ?? []).reduce((s, b) => s + num(b.weight), 0) * 100) / 100;

/**
 * Confirmed only when EVERY line has been answered.
 *
 * `undefined` and `0` are different answers — see the field comment on
 * `PackLine.confirmedQty` — so this tests for the property being present
 * rather than for a truthy number. A task where one line was confirmed as
 * "none of it ships" is confirmed; a task where one line was never looked at
 * is not, and must not produce a delivery note.
 */
export const packIsConfirmed = (t: { items?: PackingTask["items"] }) =>
  (t.items ?? []).length > 0 && (t.items ?? []).every((it) => it.confirmedQty !== undefined);

export const packConfirmedQty = (t: { items?: PackingTask["items"] }) =>
  (t.items ?? []).reduce((s, it) => s + num(it.confirmedQty), 0);

export function decoratePacks() {
  for (const t of PACKING_TASKS) {
    t.name = t.code;
    t.icon = "📦";
    t.itemCount = t.items?.length ?? 0;
    t.totalQty = packTotalQty(t);
    t.packedQty = packPackedQty(t);
    t.pct = pctOf(t.packedQty, t.totalQty);
    t.boxCount = t.packages?.length ?? 0;
    t.totalWeight = packWeight(t);
    t.isConfirmed = packIsConfirmed(t);
    t.confirmedQty = packConfirmedQty(t);
    t.shipsShort = t.isConfirmed && confirmLines(t).some((l) => l.confirmed < l.ordered);
  }
}

/* ============================================================
   WHAT THE WAREHOUSE IS BEING ASKED TO CONFIRM

   Three numbers per line, from three different documents, and
   keeping them straight is the whole point of the screen:

     ordered   what the customer asked for      — sales order
     picked    what came off the shelf          — pack line `qty`
     confirmed what will actually go today      — the answer

   `ordered` is matched against the sales order by product code
   rather than carried through the pick and pack tasks, for the
   same reason `packCreateDelivery` does it: warehouse lines get
   filtered, split across boxes and renumbered, so a line that
   travelled through them cannot be trusted to still line up
   with the order line it came from.
   ============================================================ */

export interface ConfirmLine {
  code: string;
  name: string;
  unit: string;
  /** From the sales order. Falls back to what picking handed over. */
  ordered: number;
  /** What picking handed over — the ceiling for `confirmed`. */
  picked: number;
  confirmed: number;
  /** Whether anybody has answered this line yet. */
  answered: boolean;
  shortReason: string;
}

export function confirmLines(t: {
  soRef?: string;
  items?: PackingTask["items"];
}): ConfirmLine[] {
  const so = SALES_ORDERS.find((s) => s.code === t.soRef);
  return (t.items ?? []).map((it) => {
    const src = (so?.items ?? []).find((l) => l.code === it.code);
    const picked = num(it.qty);
    return {
      code: it.code,
      name: it.name,
      unit: it.unit,
      ordered: src ? num(src.qty) : picked,
      picked,
      confirmed: it.confirmedQty === undefined ? picked : num(it.confirmedQty),
      answered: it.confirmedQty !== undefined,
      shortReason: it.shortReason ?? "",
    };
  });
}

/**
 * Every reason this set of answers may not be written.
 *
 * Lives here rather than in the modal so the workflow can call it on the way
 * to the write — a check that only runs while a form is open is a check that
 * a stale page, a keyboard path or the API this becomes later walks straight
 * past. The modal calls the same function to show the message early.
 */
export function checkConfirmLines(
  lines: readonly ConfirmLine[],
  answers: Readonly<Record<string, { qty: number; reason: string }>>,
): string[] {
  const problems: string[] = [];
  for (const l of lines) {
    const a = answers[l.code];
    if (!a) {
      problems.push(`${l.code} — ยังไม่ได้ระบุจำนวนที่ยืนยันส่ง`);
      continue;
    }
    if (!Number.isFinite(a.qty) || a.qty < 0) {
      problems.push(`${l.code} — จำนวนที่ยืนยันต้องเป็นตัวเลขไม่ติดลบ`);
      continue;
    }
    /* The ceiling is what picking handed over, not what was ordered: the
       warehouse cannot promise to ship stock it does not hold. */
    if (a.qty > l.picked) {
      problems.push(
        `${l.code} — ยืนยัน ${a.qty} เกินจำนวนที่หยิบได้ ${l.picked} ${l.unit}`,
      );
      continue;
    }
    /* Short of the order is allowed, but never silently: somebody has to say
       why, because this is the number the customer is billed from. */
    if (a.qty < l.ordered && !a.reason.trim()) {
      problems.push(`${l.code} — ส่งไม่ครบตามที่สั่ง ต้องระบุเหตุผล`);
    }
  }
  return problems;
}

decoratePacks();

export const getPack = (code: string) => PACKING_TASKS.find((t) => t.code === code) ?? null;

export const nextPackCode = () =>
  nextSeq(PACKING_TASKS.map((t) => t.code), "PACK2507-", 4);

/** Picking tasks that finished and have not been packed yet. */
export const packablePicks = () =>
  PICKING_TASKS.filter((t) => t.status === "Completed" && !t.packRef);

/* ============================================================
   DELIVERY ORDER
   ============================================================ */

export interface DoRow extends DeliveryOrder {
  name: string;
  icon: string;
  itemCount: number;
  totalQty: number;
  deliveredTotal: number;
  pct: number;
  isLate: boolean;
  shortDelivery: boolean;
}

export const DELIVERY_ORDERS = RAW_DO as DoRow[];

export const doTotalQty = (d: { items?: DeliveryOrder["items"] }) =>
  (d.items ?? []).reduce((s, it) => s + num(it.qty), 0);
export const doDeliveredQty = (d: { items?: DeliveryOrder["items"] }) =>
  (d.items ?? []).reduce((s, it) => s + num(it.delivered), 0);

export function decorateDOs() {
  for (const d of DELIVERY_ORDERS) {
    d.name = d.code;
    d.icon = "🚚";
    d.itemCount = d.items?.length ?? 0;
    d.totalQty = doTotalQty(d);
    d.deliveredTotal = doDeliveredQty(d);
    d.pct = pctOf(d.deliveredTotal, d.totalQty);
    d.shortDelivery = d.status === "Delivered" && d.deliveredTotal < d.totalQty;

    const days = daysUntil(d.deliveryDate);
    d.isLate =
      days !== null && days < 0 && ["Draft", "Ready", "Shipped", "Failed"].includes(d.status);
  }
}

decorateDOs();

export const getDO = (code: string) => DELIVERY_ORDERS.find((d) => d.code === code) ?? null;

export const nextDOCode = () =>
  nextSeq(DELIVERY_ORDERS.map((d) => d.code), "DO2507-", 4);

/** Packing tasks that finished and have not been shipped yet. */
export const shippablePacks = () =>
  PACKING_TASKS.filter((t) => t.status === "Completed" && !t.doRef);

/* ---------- Cross-document rollups ---------- */

/** Every warehouse and shipping document raised against one sales order. */
export function soLinkedDocs(code: string) {
  return {
    picks: PICKING_TASKS.filter((t) => t.soRef === code),
    packs: PACKING_TASKS.filter((t) => t.soRef === code),
    deliveries: DELIVERY_ORDERS.filter((d) => d.soRef === code),
  };
}

/** Re-run every decorator — used after a workflow touches several documents. */
export function decorateOutbound() {
  decorateQuotations();
  decorateSalesRequests();
  decorateSOs();
  decoratePicks();
  decoratePacks();
  decorateDOs();
}
