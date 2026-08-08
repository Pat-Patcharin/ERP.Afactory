import { describe, expect, it } from "vitest";
import { productSchemas, splitWarehouse } from "@/schemas/product";
import { PRODUCTS, getProduct } from "@/lib/domain/product";
import {
  productGoodsReceipts,
  productPurchaseByYear,
  productPurchaseKpi,
  productPurchaseOrders,
} from "@/lib/domain/product-analytics";
import { PURCHASE_ORDERS } from "@/lib/domain/purchase";
import type { ActionCtx, Block } from "@/lib/types";

/* ============================================================
   PRODUCT DETAIL regression suite.

   Product is the reference implementation every other master
   copies, so what its detail page shows — and no longer shows —
   is worth pinning down.
   ============================================================ */

const { detail } = productSchemas;

const ctx: ActionCtx = {
  goto: () => {},
  openEntity: () => {},
  toast: () => {},
  confirm: () => {},
  formModal: () => {},
  refresh: () => {},
  quickView: () => {},
  panel: () => {},
};

/** Block titles, flattened through grid nesting. */
const titlesOf = (blocks: Block[]): string[] =>
  blocks.filter(Boolean).flatMap((b) => {
    const block = b as { type?: string; title?: string; items?: Block[] };
    if (block.type === "grid") return titlesOf(block.items ?? []);
    return block.title ? [block.title] : [];
  });

const overview = (code: string) =>
  titlesOf(detail.tabs.find((t) => t.key === "overview")!.blocks(getProduct(code)!, ctx));

/** A product that has actually been ordered, so the history tab has rows. */
const ORDERED = PURCHASE_ORDERS.flatMap((p) => p.items ?? []).find((i) =>
  PRODUCTS.some((p) => p.code === i.code),
)!.code;

describe("Product detail — tabs", () => {
  it("no longer carries a Units & Barcode tab", () => {
    const keys = detail.tabs.map((t) => t.key);
    expect(keys).not.toContain("units");
    expect(detail.tabs.map((t) => t.label)).not.toContain("Units & Barcode");
  });

  it("renames History to Purchase History", () => {
    const tab = detail.tabs.find((t) => t.key === "history")!;
    expect(tab).toBeDefined();
    expect(tab.label).toBe("Purchase History");
  });
});

describe("Product detail — Overview", () => {
  it("absorbs the unit and barcode blocks", () => {
    /* Removing the tab must not lose what it held. */
    const titles = overview(ORDERED);
    for (const t of ["Base Unit", "Alternative Units", "Identification", "RFID"]) {
      expect(titles, t).toContain(t);
    }
  });

  it("drops Transaction Roles and System Information", () => {
    const titles = overview(ORDERED);
    expect(titles).not.toContain("Transaction Roles");
    expect(titles).not.toContain("System Information");
  });

  it("keeps the general and classification cards", () => {
    const titles = overview(ORDERED);
    expect(titles).toContain("General Information");
    expect(titles).toContain("Product Classification");
  });

  it("drops Expiry Date from the summary rail", () => {
    /* It belongs to the Registration & Warranty tab, which owns the action. */
    for (const p of PRODUCTS) {
      const aside = detail.tabs.find((t) => t.key === "overview")!.aside!(p, ctx);
      expect(aside.rows.map((r) => r.label), p.code).not.toContain("Expiry Date");
    }
  });

  it("keeps the rail facts that apply on every tab", () => {
    const aside = detail.tabs.find((t) => t.key === "overview")!.aside!(getProduct(ORDERED)!, ctx);
    const labels = aside.rows.map((r) => r.label);
    for (const l of ["Registration", "Main Warehouse", "Main Supplier", "Base Unit"]) {
      expect(labels, l).toContain(l);
    }
  });
});

describe("Product detail — Warehouse & Stock", () => {
  const stock = (code: string) =>
    detail.tabs.find((t) => t.key === "warehouse")!.blocks(getProduct(code)!, ctx);

  it("drops the Projected Balance block", () => {
    for (const p of PRODUCTS) {
      expect(titlesOf(stock(p.code)), p.code).not.toContain("Projected Balance");
    }
  });

  it("renders Stock Summary as a table of measures, not cards", () => {
    const summary = stock(ORDERED).find(
      (b) => b && (b as { title?: string }).title === "Stock Summary",
    ) as { type: string; rows: { metric: string }[] };

    expect(summary.type).toBe("table");
    expect(summary.rows.map((r) => r.metric)).toEqual([
      "Stock on Hand",
      "Reserved",
      "Back Order",
      "On Order",
      "Available",
      "Reorder Point",
      "Stock Status",
    ]);
  });

  it("computes Available as On Hand minus Reserved", () => {
    for (const p of PRODUCTS) {
      const summary = stock(p.code).find(
        (b) => b && (b as { title?: string }).title === "Stock Summary",
      ) as { rows: { metric: string; qty: number }[] };
      const by = (m: string) => summary.rows.find((r) => r.metric === m)!.qty;

      expect(by("Available"), p.code).toBe(by("Stock on Hand") - by("Reserved"));
      expect(by("Reorder Point"), p.code).toBe(p.lowLevel);
    }
  });

  it("carries the stock status as a badge row, not a quantity", () => {
    const summary = stock(ORDERED).find(
      (b) => b && (b as { title?: string }).title === "Stock Summary",
    ) as { rows: { metric: string; badge?: { text: string } }[] };

    const row = summary.rows.find((r) => r.metric === "Stock Status")!;
    expect(row.badge).toBeDefined();
    expect(row.badge!.text).toBeTruthy();
  });

  it("reduces Stock by Warehouse to where and how much", () => {
    const table = stock(ORDERED).find(
      (b) => b && (b as { title?: string }).title === "Stock by Warehouse",
    ) as { cols: { key: string; label: string }[] };

    expect(table.cols.map((c) => c.key)).toEqual(["code", "name", "loc", "onHand"]);
    expect(table.cols.map((c) => c.label)).toEqual([
      "Warehouse Code",
      "Warehouse Name",
      "Location",
      "Quantity",
    ]);
  });

  it("splits the warehouse string into a code and a name", () => {
    expect(splitWarehouse("WH-01 Samut Prakan")).toEqual({
      code: "WH-01",
      name: "Samut Prakan",
    });
    /* A warehouse with no name keeps the whole string rather than losing it. */
    expect(splitWarehouse("WH-09")).toEqual({ code: "WH-09", name: "" });
    expect(splitWarehouse("")).toEqual({ code: "", name: "" });
  });
});

describe("Product detail — purchase history", () => {
  it("joins purchase order lines on the product code", () => {
    const p = getProduct(ORDERED)!;
    const lines = productPurchaseOrders(p);
    expect(lines.length).toBeGreaterThan(0);

    /* Every line must trace back to a real order that really contains it. */
    for (const l of lines) {
      const po = PURCHASE_ORDERS.find((x) => x.code === l.doc)!;
      expect(po, l.doc).toBeDefined();
      expect(po.items!.some((i) => i.code === p.code)).toBe(true);
      expect(l.supplier).toBe(po.supplier);
      expect(l.buyer).toBe(po.buyer);
    }
  });

  it("orders lines newest first", () => {
    const ts = productPurchaseOrders(getProduct(ORDERED)!).map((l) => l.ts);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
  });

  it("weights the average cost by quantity, not by line", () => {
    const kpi = productPurchaseKpi(getProduct(ORDERED)!);
    expect(kpi.qty).toBeGreaterThan(0);
    /* A large order at a low price must move the average more than a small
       one — a mean of unit prices would not. */
    expect(kpi.avgPrice).toBeCloseTo(kpi.spend / kpi.qty, 1);
  });

  it("nets the line discount into the amount", () => {
    const p = getProduct(ORDERED)!;
    for (const l of productPurchaseOrders(p)) {
      const po = PURCHASE_ORDERS.find((x) => x.code === l.doc)!;
      const it = po.items!.find((i) => i.code === p.code)!;
      const gross = (Number(it.qty) || 0) * (Number(it.price) || 0);
      expect(l.amount, l.doc).toBeLessThanOrEqual(gross + 0.01);
    }
  });

  it("groups totals by year, newest first, in Gregorian years", () => {
    const years = productPurchaseByYear(getProduct(ORDERED)!);
    expect(years.length).toBeGreaterThan(0);
    expect(years.map((y) => y.year)).toEqual([...years.map((y) => y.year)].sort((a, b) => b - a));
    /* Was `> 2500` — Buddhist — until D4 settled the rule the other way:
       screens are Gregorian, paper is Buddhist, and a rollup label is a
       screen. Inverted because the rule changed. See docs/DATE-ERA.md. */
    for (const y of years) {
      expect(y.year).toBeLessThan(2400);
      expect(y.year).toBeGreaterThan(2000);
    }
  });

  it("renders the purchase summary and both document tables", () => {
    const titles = titlesOf(
      detail.tabs.find((t) => t.key === "history")!.blocks(getProduct(ORDERED)!, ctx),
    );
    expect(titles).toContain("Purchase Summary");
    expect(titles.some((t) => t.startsWith("Purchase Orders"))).toBe(true);
    expect(titles.some((t) => t.startsWith("Goods Receipts"))).toBe(true);
    /* The audit trail moved to Administration › Audit Log. */
    expect(titles).not.toContain("Audit Trail");
  });

  it("names the buyer on every purchase order row", () => {
    const table = detail.tabs
      .find((t) => t.key === "history")!
      .blocks(getProduct(ORDERED)!, ctx)
      .find((b) => b && (b as { title?: string }).title?.startsWith("Purchase Orders")) as {
      cols: { key: string; label: string }[];
    };
    expect(table.cols.map((c) => c.key)).toContain("buyer");
    expect(table.cols.find((c) => c.key === "buyer")!.label).toBe("ผู้สั่งซื้อ");
  });

  it("says so plainly when a product was never ordered", () => {
    const never = PRODUCTS.find((p) => productPurchaseOrders(p).length === 0 && productGoodsReceipts(p).length === 0);
    if (!never) return;

    const blocks = detail.tabs.find((t) => t.key === "history")!.blocks(never, ctx);
    const first = blocks.filter(Boolean)[0] as { type: string; heading?: string };
    expect(first.type).toBe("empty");
    expect(first.heading).toContain("ยังไม่มีประวัติการสั่งซื้อ");
  });

  it("builds every tab for every product without throwing", () => {
    for (const p of PRODUCTS) {
      for (const tab of detail.tabs) {
        if (tab.when && !tab.when(p)) continue;
        expect(() => tab.blocks(p, ctx), `${p.code} · ${tab.key}`).not.toThrow();
      }
    }
  });
});
