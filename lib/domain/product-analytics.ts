import { PURCHASE_ORDERS } from "./purchase";
import { GOODS_RECEIPTS } from "./inbound";
import type { ProductRow } from "./product";
import { beYear, ceYear } from "@/lib/format";

/* ============================================================
   PRODUCT ANALYTICS — what has been bought, of this product.

   This lives ABOVE the product module rather than inside it.
   lib/domain/inbound.ts already imports product.ts (a goods
   receipt needs its product), so product.ts importing inbound
   back would close a cycle. Anything that reads a product AND
   the documents about it belongs here — the same reason
   partner-analytics.ts exists.

   Unlike the supplier side of the partner module, this join is
   exact: purchase order and goods receipt lines both carry the
   product CODE, so every figure below is live.
   ============================================================ */

/** dd/mm/yyyy → millis, accepting both eras the modules mix. */
function dateTs(v: string): number {
  const [d, m, y] = String(v ?? "").split("/").map(Number);
  if (!d || !m || !y) return 0;
  return new Date(ceYear(y), m - 1, d).getTime();
}

export interface ProductPurchaseLine {
  doc: string;
  date: string;
  ts: number;
  supplier: string;
  buyer: string;
  qty: number;
  unit: string;
  price: number;
  amount: number;
  /** Quantity already received against this line. */
  received: number;
  status: string;
}

/**
 * Every purchase order line that ordered this product, newest first.
 *
 * The line is the unit of interest, not the order: the same product can
 * appear once per order, and what a buyer wants to see is the price they
 * paid each time.
 */
export function productPurchaseOrders(p: ProductRow): ProductPurchaseLine[] {
  const rows: ProductPurchaseLine[] = [];

  for (const po of PURCHASE_ORDERS) {
    for (const it of po.items ?? []) {
      if (it.code !== p.code) continue;
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const disc = Number(it.disc) || 0;
      rows.push({
        doc: po.code,
        date: po.orderDate,
        ts: dateTs(po.orderDate),
        supplier: po.supplier,
        buyer: po.buyer,
        qty,
        unit: it.unit,
        price,
        /* Net of the line discount, so the figure matches the order total. */
        amount: Math.round(qty * price * (1 - disc / 100) * 100) / 100,
        received: Number(it.recv) || 0,
        status: po.status,
      });
    }
  }

  return rows.sort((a, b) => b.ts - a.ts);
}

export interface ProductReceiptLine {
  doc: string;
  date: string;
  ts: number;
  supplier: string;
  warehouse: string;
  location: string;
  accepted: number;
  rejected: number;
  status: string;
}

/** Every goods receipt line that received this product, newest first. */
export function productGoodsReceipts(p: ProductRow): ProductReceiptLine[] {
  const rows: ProductReceiptLine[] = [];

  for (const gr of GOODS_RECEIPTS) {
    for (const it of gr.items ?? []) {
      if (it.code !== p.code) continue;
      rows.push({
        doc: gr.code,
        date: gr.receiptDate,
        ts: dateTs(gr.receiptDate),
        supplier: gr.supplier,
        warehouse: it.warehouse || gr.warehouse,
        location: it.location,
        accepted: Number(it.accepted) || 0,
        rejected: Number(it.rejected) || 0,
        status: gr.status,
      });
    }
  }

  return rows.sort((a, b) => b.ts - a.ts);
}

export interface ProductPurchaseKpi {
  orders: number;
  qty: number;
  spend: number;
  /** Spend ÷ quantity — what the product actually cost on average. */
  avgPrice: number;
  lastDate: string;
  lastPrice: number;
  lastSupplier: string;
  receipts: number;
  receivedQty: number;
  rejectedQty: number;
  suppliers: number;
}

export function productPurchaseKpi(p: ProductRow): ProductPurchaseKpi {
  const lines = productPurchaseOrders(p);
  const receipts = productGoodsReceipts(p);

  const qty = lines.reduce((t, l) => t + l.qty, 0);
  const spend = lines.reduce((t, l) => t + l.amount, 0);
  const last = lines[0];

  return {
    orders: lines.length,
    qty,
    spend: Math.round(spend * 100) / 100,
    /* Weighted by quantity, not a mean of unit prices — a large order at a
       low price should move this figure more than a small one. */
    avgPrice: qty ? Math.round((spend / qty) * 100) / 100 : 0,
    lastDate: last?.date ?? "",
    lastPrice: last?.price ?? 0,
    lastSupplier: last?.supplier ?? "",
    receipts: receipts.length,
    receivedQty: receipts.reduce((t, r) => t + r.accepted, 0),
    rejectedQty: receipts.reduce((t, r) => t + r.rejected, 0),
    suppliers: new Set(lines.map((l) => l.supplier)).size,
  };
}

export interface ProductPurchaseYear {
  /** Buddhist year, as every document in the app displays it. */
  year: number;
  orders: number;
  qty: number;
  spend: number;
}

/** Purchase totals for this product grouped by year, newest first. */
export function productPurchaseByYear(p: ProductRow): ProductPurchaseYear[] {
  const byYear = new Map<number, ProductPurchaseYear>();

  for (const l of productPurchaseOrders(p)) {
    const raw = Number(String(l.date).split("/")[2]);
    if (!raw) continue;
    const year = beYear(raw);
    const slot = byYear.get(year) ?? { year, orders: 0, qty: 0, spend: 0 };
    slot.orders += 1;
    slot.qty += l.qty;
    slot.spend += l.amount;
    byYear.set(year, slot);
  }

  return [...byYear.values()]
    .map((y) => ({ ...y, spend: Math.round(y.spend * 100) / 100 }))
    .sort((a, b) => b.year - a.year);
}
