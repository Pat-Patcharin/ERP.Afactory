import { SALES_ORDERS } from "./outbound";
import { SALES_INVOICES } from "./invoice";
import { PURCHASE_ORDERS } from "./purchase";
import { GOODS_RECEIPTS } from "./inbound";
import { bpActiveSupplierItems, bpAverageLeadTime } from "./partner";
import type { BusinessPartner } from "@/data/partners";

/* ============================================================
   PARTNER ANALYTICS — the Sales Report and Purchase History tabs.

   This lives ABOVE the partner module rather than inside it.
   lib/domain/outbound.ts already imports partner.ts (a sales order
   needs its customer), so partner.ts importing outbound.ts back
   would close a cycle. Anything that reads a partner AND the
   documents about it belongs here.

   Two linkage facts, stated rather than hidden:

     · Sales orders carry `customerCode`, so the sell side links to
       the BP master exactly and the figures below are live.

     · Purchase orders and goods receipts carry only a supplier
       NAME — the purchase modules predate the partner master and
       their suppliers are not in it. Matching is therefore by name
       and legitimately returns nothing for the seeded partners.
       The record's own `txn.po` is used as the reliable source and
       the name match supplements it. Giving those documents a
       supplier code is a master-data job, not a reporting one.
   ============================================================ */

export interface ProductTally {
  code: string;
  name: string;
  qty: number;
  amount: number;
  orders: number;
}

const norm = (s: string) => String(s ?? "").trim().toLowerCase();

/** Rank a tally map, biggest spend first. */
function rank(map: Map<string, ProductTally>, limit: number): ProductTally[] {
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/* ---------- Sell side ---------- */

/** Every sales order raised for this partner, newest first. */
export function bpSalesOrders(bp: BusinessPartner) {
  return SALES_ORDERS.filter(
    (s) => s.customerCode === bp.code || norm(s.customer) === norm(bp.nameTh),
  ).sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
}

export function bpInvoices(bp: BusinessPartner) {
  return SALES_INVOICES.filter(
    (i) => i.customerCode === bp.code || norm(i.customer) === norm(bp.nameTh),
  );
}

/** What this customer actually buys, by value. */
export function bpTopProducts(bp: BusinessPartner, limit = 5): ProductTally[] {
  const tally = new Map<string, ProductTally>();
  for (const so of bpSalesOrders(bp)) {
    for (const it of so.items ?? []) {
      const row = tally.get(it.code) ?? {
        code: it.code,
        name: it.name,
        qty: 0,
        amount: 0,
        orders: 0,
      };
      row.qty += Number(it.qty) || 0;
      row.amount += (Number(it.qty) || 0) * (Number(it.price) || 0);
      row.orders += 1;
      tally.set(it.code, row);
    }
  }
  return rank(tally, limit);
}

export interface CustomerKpi {
  orders: number;
  revenue: number;
  avgOrder: number;
  lastOrderDate: string;
  lastOrderAmount: number;
  openOrders: number;
  invoices: number;
  outstanding: number;
  /** How many invoices are past their due date and still owed. */
  overdue: number;
  /** And what that comes to in money — the figure somebody chases. */
  overdueAmount: number;
  /** Days past due on the oldest of them. 0 when nothing is overdue. */
  overdueDays: number;
  /** Owed but not late yet — so "nothing overdue" is not read as "owes nothing". */
  notYetDue: number;
  skus: number;
}

const CLOSED_SO = ["Completed", "Cancelled"];

export function bpCustomerKpi(bp: BusinessPartner): CustomerKpi {
  const orders = bpSalesOrders(bp);
  const invoices = bpInvoices(bp);
  const revenue = orders.reduce((t, s) => t + (s.total || 0), 0);
  const last = orders[0];

  /* Overdue is decided on the invoice, not here: `isOverdue` already means
     "still owed, past its due date, and on a document that is live" — a
     cancelled or voided invoice is not a debt however old it is. */
  const late = invoices.filter((i) => i.isOverdue);
  const overdueAmount = round2(late.reduce((t, i) => t + (i.outstanding || 0), 0));
  const outstanding = round2(invoices.reduce((t, i) => t + (i.outstanding || 0), 0));
  /* The recorded rows answer for a partner the invoice module has never met —
     and only then. See recordedArrears. */
  const arrears = invoices.length ? null : recordedArrears(bp);

  return {
    orders: orders.length,
    revenue,
    avgOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    lastOrderDate: last?.orderDate ?? "",
    lastOrderAmount: last?.total ?? 0,
    openOrders: orders.filter((s) => !CLOSED_SO.includes(s.status)).length,
    invoices: invoices.length,
    outstanding: arrears ? round2(arrears.amount + arrears.notYetDue) : outstanding,
    overdue: arrears ? arrears.count : late.length,
    /* What is unpaid on those invoices, not what they were worth: a customer
       who has paid half of a late invoice owes the half. */
    overdueAmount: arrears ? arrears.amount : overdueAmount,
    overdueDays: arrears ? arrears.days : late.reduce((m, i) => Math.max(m, i.daysOverdue ?? 0), 0),
    notYetDue: arrears ? arrears.notYetDue : round2(outstanding - overdueAmount),
    skus: bpTopProducts(bp, 999).length,
  };
}

/* ============================================================
   ARREARS ON A PARTNER THE INVOICE MODULE HAS NEVER MET

   Sales invoices carry their own customer register — `CUST-000x`
   codes and English clinic names — which the partner master does
   not appear in. That is the same seam the purchase side has, and
   giving those documents a BP code is a master-data job, not a
   reporting one.

   Until it happens, a partner still knows what it owes: the
   record carries its own invoice history, which is what the
   Customer Purchase History tab already falls back to. This reads
   the same rows so a KPI tile and the tab underneath it never
   disagree, and it is used ONLY when the live join found nothing
   overdue — a real invoice always wins.

   Those rows carry a status and a date but no due date, so the
   age is worked out the way the invoice would: issue date plus
   the customer's own credit term.
   ============================================================ */

interface Arrears {
  count: number;
  amount: number;
  days: number;
  notYetDue: number;
}

const DAY = 86_400_000;
/** Rows the partner record treats as still owed. Paid ones carry other words. */
const OWED = ["Overdue", "Unpaid", "Partially Paid"];

function recordedArrears(bp: BusinessPartner): Arrears | null {
  const owed = (bp.txn?.inv ?? []).filter((r) => OWED.includes(r.status));
  if (!owed.length) return null;

  const rows = owed.filter((r) => r.status === "Overdue");
  const term = Number(String(bp.creditTerm ?? "").replace(/\D/g, "")) || bp.credit?.days || 0;
  const days = rows.reduce((m, r) => {
    const issued = dateTs(r.date);
    if (!issued) return m;
    return Math.max(m, Math.floor((Date.now() - (issued + term * DAY)) / DAY));
  }, 0);

  const sum = (list: typeof owed) =>
    round2(list.reduce((t, r) => t + (Number(r.amount) || 0), 0));

  return {
    count: rows.length,
    amount: sum(rows),
    /* A row marked overdue that the term says is not yet due is still a debt
       somebody flagged; it is reported as overdue with an age of zero rather
       than as a negative number of days. */
    days: Math.max(0, days),
    notYetDue: sum(owed.filter((r) => r.status !== "Overdue")),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Buy side ---------- */

/**
 * Purchase orders raised on this supplier. Matched by name — see the module
 * note. Returns an empty list rather than pretending, and the tab says so.
 */
export function bpPurchaseOrders(bp: BusinessPartner) {
  const names = [bp.nameTh, bp.nameEn, bp.trade].filter(Boolean).map(norm);
  return PURCHASE_ORDERS.filter((p) => names.includes(norm(p.supplier))).sort((a, b) =>
    String(b.orderDate).localeCompare(String(a.orderDate)),
  );
}

export function bpGoodsReceipts(bp: BusinessPartner) {
  const names = [bp.nameTh, bp.nameEn, bp.trade].filter(Boolean).map(norm);
  return GOODS_RECEIPTS.filter((g) => names.includes(norm(g.supplier)));
}

/**
 * What we buy from this supplier. Purchase orders where they match; the
 * quoted item list otherwise, which is the supplier's own catalogue and
 * always present.
 */
export function bpTopPurchasedProducts(bp: BusinessPartner, limit = 5): ProductTally[] {
  const tally = new Map<string, ProductTally>();

  for (const po of bpPurchaseOrders(bp)) {
    for (const it of po.items ?? []) {
      const row = tally.get(it.code) ?? {
        code: it.code,
        name: it.name,
        qty: 0,
        amount: 0,
        orders: 0,
      };
      row.qty += Number(it.qty) || 0;
      row.amount += (Number(it.qty) || 0) * (Number(it.price) || 0);
      row.orders += 1;
      tally.set(it.code, row);
    }
  }
  if (tally.size) return rank(tally, limit);

  /* No matched orders — fall back to the catalogue, valued at MOQ. */
  for (const item of bpActiveSupplierItems(bp)) {
    tally.set(item.product, {
      code: item.product,
      name: item.productName || item.supName,
      qty: item.moq,
      amount: item.moq * item.price,
      orders: 0,
    });
  }
  return rank(tally, limit);
}

/* ---------- Last purchase ---------- */

export interface LastPurchase {
  /** dd/mm/yyyy as the document carries it, or "" when there is none. */
  date: string;
  amount: number;
  doc: string;
  /** Epoch millis for sorting; 0 when undated. Buddhist years included. */
  ts: number;
}

const EMPTY_PURCHASE: LastPurchase = { date: "", amount: 0, doc: "", ts: 0 };

/** dd/mm/yyyy → millis, accepting both eras the modules mix. */
function dateTs(v: string): number {
  const [d, m, y] = String(v ?? "").split("/").map(Number);
  if (!d || !m || !y) return 0;
  return new Date(y > 2400 ? y - 543 : y, m - 1, d).getTime();
}

/**
 * When this partner last transacted.
 *
 * A customer's last purchase is the last order they placed with us. A pure
 * supplier has no sales orders, so the equivalent question is the last order
 * WE placed with them — reported from the same field so one column answers
 * both without a second one that is blank half the time.
 */
export function bpLastPurchase(bp: BusinessPartner): LastPurchase {
  const so = bpSalesOrders(bp)[0];
  if (so) return { date: so.orderDate, amount: so.total, doc: so.code, ts: dateTs(so.orderDate) };

  /* Sales orders recorded on the partner itself, for records the join misses. */
  const recordedSo = (bp.txn?.so ?? [])[0];
  if (recordedSo) {
    return {
      date: recordedSo.date,
      amount: recordedSo.amount,
      doc: recordedSo.no,
      ts: dateTs(recordedSo.date),
    };
  }

  const po = bpPurchaseOrders(bp)[0];
  if (po) return { date: po.orderDate, amount: po.total, doc: po.code, ts: dateTs(po.orderDate) };

  const recordedPo = (bp.txn?.po ?? [])[0];
  if (recordedPo) {
    return {
      date: recordedPo.date,
      amount: recordedPo.amount,
      doc: recordedPo.no,
      ts: dateTs(recordedPo.date),
    };
  }

  return EMPTY_PURCHASE;
}

/* ---------- Yearly rollups ---------- */

/** The calendar year a dd/mm/yyyy date falls in, normalised to BE. */
function yearOf(v: string): number {
  const y = Number(String(v ?? "").split("/")[2]);
  if (!y) return 0;
  return y > 2400 ? y : y + 543;
}

/* ---------- Sales by year ---------- */

export interface SalesYear {
  /** Buddhist year, as every document in the app displays it. */
  year: number;
  orders: number;
  revenue: number;
  invoices: number;
}

/**
 * Sales totals grouped by year, newest first.
 *
 * Revenue and order count come from sales orders; the invoice count is
 * counted separately because an order and its invoice can fall on either
 * side of a year end.
 */
export function bpSalesByYear(bp: BusinessPartner): SalesYear[] {
  const matched = bpSalesOrders(bp);
  const orderRows = matched.length
    ? matched.map((s) => ({ date: s.orderDate, amount: s.total }))
    : (bp.txn?.so ?? []).map((s) => ({ date: s.date, amount: s.amount }));

  const matchedInv = bpInvoices(bp);
  const invoiceRows = matchedInv.length
    ? matchedInv.map((i) => ({ date: i.invoiceDate }))
    : (bp.txn?.inv ?? []).map((i) => ({ date: i.date }));

  const byYear = new Map<number, SalesYear>();
  const slot = (year: number) => {
    let s = byYear.get(year);
    if (!s) {
      s = { year, orders: 0, revenue: 0, invoices: 0 };
      byYear.set(year, s);
    }
    return s;
  };

  for (const r of orderRows) {
    const year = yearOf(r.date);
    if (!year) continue;
    const s = slot(year);
    s.orders += 1;
    s.revenue += r.amount || 0;
  }
  for (const r of invoiceRows) {
    const year = yearOf(r.date);
    if (!year) continue;
    slot(year).invoices += 1;
  }

  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

/** The most recent year the customer traded in. */
export const bpLatestSalesYear = (bp: BusinessPartner): SalesYear | null =>
  bpSalesByYear(bp)[0] ?? null;

/* ---------- Purchase by year ---------- */

export interface PurchaseYear {
  /** Buddhist year, as every document in the app displays it. */
  year: number;
  orders: number;
  spend: number;
}

/**
 * Purchase totals grouped by year, newest first.
 *
 * A lifetime total flatters an old supplier and hides a lapsed one — "how
 * much do we buy from them a year" is the figure a buyer negotiates on.
 */
export function bpPurchaseByYear(bp: BusinessPartner): PurchaseYear[] {
  const matched = bpPurchaseOrders(bp);
  const rows = matched.length
    ? matched.map((p) => ({ date: p.orderDate, amount: p.total }))
    : (bp.txn?.po ?? []).map((p) => ({ date: p.date, amount: p.amount }));

  const byYear = new Map<number, PurchaseYear>();
  for (const r of rows) {
    const year = yearOf(r.date);
    if (!year) continue;
    const slot = byYear.get(year);
    if (slot) {
      slot.orders += 1;
      slot.spend += r.amount || 0;
    } else {
      byYear.set(year, { year, orders: 1, spend: r.amount || 0 });
    }
  }

  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

/** The most recent year the partner was bought from. */
export const bpLatestPurchaseYear = (bp: BusinessPartner): PurchaseYear | null =>
  bpPurchaseByYear(bp)[0] ?? null;

export interface PurchaseKpi {
  orders: number;
  spend: number;
  avgOrder: number;
  lastOrderDate: string;
  lastOrderAmount: number;
  receipts: number;
  avgLeadTime: number;
  quotedItems: number;
  preferredItems: number;
  /** True when the figures come from the record rather than matched documents. */
  fromRecord: boolean;
}

export function bpPurchaseKpi(bp: BusinessPartner): PurchaseKpi {
  const matched = bpPurchaseOrders(bp);
  const recorded = bp.txn?.po ?? [];
  const fromRecord = matched.length === 0;

  const orders = fromRecord ? recorded.length : matched.length;
  const spend = fromRecord
    ? recorded.reduce((t, p) => t + (p.amount || 0), 0)
    : matched.reduce((t, p) => t + (p.total || 0), 0);
  const lastDate = fromRecord ? recorded[0]?.date ?? "" : matched[0]?.orderDate ?? "";
  const lastAmount = fromRecord ? recorded[0]?.amount ?? 0 : matched[0]?.total ?? 0;

  return {
    orders,
    spend,
    avgOrder: orders ? Math.round(spend / orders) : 0,
    lastOrderDate: lastDate,
    lastOrderAmount: lastAmount,
    receipts: bpGoodsReceipts(bp).length,
    avgLeadTime: bpAverageLeadTime(bp),
    quotedItems: (bp.supplierItems ?? []).length,
    preferredItems: bpActiveSupplierItems(bp).filter((i) => i.preferred).length,
    fromRecord,
  };
}
