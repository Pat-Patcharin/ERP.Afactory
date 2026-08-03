import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import {
  LOT_CORRECTIONS,
  LOT_GENEALOGY,
  LOT_LINKS,
  RECALL_REVIEWS,
  type RecallReview,
} from "@/data/lots";
import { ADJUSTMENTS, type Adjustment } from "@/data/adjustments";
import { PRODUCTS } from "@/lib/domain/product";
import { STOCK_POSITIONS } from "@/lib/domain/stock";
import { invalidateMovements, movementRows } from "@/lib/domain/movement";
import { decorateAdjustments } from "@/lib/domain/adjustment";
import {
  canonicalLot,
  expiryClass,
  findLot,
  invalidateLots,
  lotAliases,
  lotCorrections,
  lotCustomers,
  lotGenealogy,
  lotInbound,
  lotInventory,
  lotMovements,
  lotOutbound,
  lotRecall,
  lotReturns,
  lotRows,
  lotSummary,
  shelfLifePct,
  expiryWatch,
  type LotRow,
} from "@/lib/domain/lot";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { lotTrackingSchemas } from "@/schemas/lot-tracking";

const { list, detail } = lotTrackingSchemas;

const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );

const RECALL_SEED = JSON.parse(JSON.stringify(RECALL_REVIEWS)) as RecallReview[];
const ADJ_SEED = JSON.parse(JSON.stringify(ADJUSTMENTS)) as Adjustment[];

const restore = () => {
  RECALL_REVIEWS.length = 0;
  RECALL_REVIEWS.push(...(JSON.parse(JSON.stringify(RECALL_SEED)) as RecallReview[]));
  ADJUSTMENTS.length = 0;
  ADJUSTMENTS.push(...(JSON.parse(JSON.stringify(ADJ_SEED)) as Adjustment[]));
  decorateAdjustments();
  invalidateMovements();
  invalidateLots();
};

function stubCtx() {
  const calls = {
    toasts: [] as { title: string; tone?: string }[],
    confirmed: false,
    modal: null as null | { onConfirm?: () => boolean | void },
    goto: [] as string[],
    entities: [] as string[],
  };
  return {
    calls,
    ctx: {
      goto: (h: string) => calls.goto.push(h),
      openEntity: (e: string, c?: string) => calls.entities.push(`${e}/${c ?? ""}`),
      toast: (title: string, _m?: string, tone?: string) => calls.toasts.push({ title, tone }),
      confirm: (o: { onConfirm: () => void }) => {
        calls.confirmed = true;
        o.onConfirm();
      },
      formModal: (o: { onConfirm?: () => boolean | void }) => {
        calls.modal = o;
      },
      refresh: () => {},
      quickView: () => {},
    } as never,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  restore();
});

/* ============================================================
   LOT TRACKING regression suite.
   ============================================================ */

describe("Lot Tracking — lot master", () => {
  it("builds at least the thirty lots the module was specified with", () => {
    expect(lotRows().length).toBeGreaterThanOrEqual(30);
  });

  it("keys a lot by product and lot number together", () => {
    for (const r of lotRows()) {
      expect(r.code).toBe(`${r.product}|${r.lot}`);
    }
    /* The same lot number may exist for different products. */
    const byLot = new Map<string, number>();
    for (const r of lotRows()) byLot.set(r.lot, (byLot.get(r.lot) ?? 0) + 1);
    expect([...byLot.keys()].length).toBeGreaterThan(0);
  });

  it("never names a product that does not exist", () => {
    const products = new Set(PRODUCTS.map((p) => p.code));
    for (const r of lotRows()) expect(products.has(r.product), r.product).toBe(true);
  });

  it("resolves the lot numbers other modules wrote onto one batch", () => {
    for (const [canon, aliases] of Object.entries(LOT_LINKS)) {
      for (const a of aliases) expect(canonicalLot(a)).toBe(canon);
      expect(lotAliases(canon)).toEqual([canon, ...aliases]);
    }
    /* An unlinked lot is its own canonical form. */
    expect(canonicalLot("LOT-25001")).toBe("LOT-25001");
  });

  it("covers every lot situation the spec lists", () => {
    const rows = lotRows();
    expect(rows.some((r) => r.lotStatus === "Active")).toBe(true);
    expect(rows.some((r) => r.qcHold > 0)).toBe(true);
    expect(rows.some((r) => r.lotStatus === "Near Expiry")).toBe(true);
    expect(rows.some((r) => r.expiryClass === "Expired")).toBe(true);
    expect(rows.some((r) => r.lotStatus === "Recall Hold")).toBe(true);
    expect(rows.some((r) => r.lotStatus === "Under Investigation")).toBe(true);
    expect(rows.some((r) => r.lotStatus === "Depleted")).toBe(true);
    expect(rows.some((r) => r.warehouseCount > 1)).toBe(true);
    expect(rows.some((r) => r.customerCount > 1)).toBe(true);
    expect(rows.some((r) => r.returnedQty > 0)).toBe(true);
    expect(rows.some((r) => r.correctionCount > 0)).toBe(true);
    expect(rows.some((r) => !r.exp)).toBe(true);
  });
});

describe("Lot Tracking — expiry", () => {
  const inDays = (n: number) => {
    const d = new Date(Date.now() + n * 86_400_000);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  it("classifies every expiry band the spec lists", () => {
    expect(expiryClass(inDays(-10))).toBe("Expired");
    expect(expiryClass(inDays(20))).toBe("Expires within 30 days");
    expect(expiryClass(inDays(45))).toBe("Expires within 60 days");
    expect(expiryClass(inDays(75))).toBe("Expires within 90 days");
    expect(expiryClass(inDays(150))).toBe("Expires within 180 days");
    expect(expiryClass(inDays(400))).toBe("More than 180 days");
    expect(expiryClass("")).toBe("No Expiry Date");
  });

  it("computes shelf life remaining as a percentage", () => {
    const pct = shelfLifePct(inDays(-100), inDays(100));
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(40);
    expect(pct!).toBeLessThan(60);
    /* Already expired leaves nothing. */
    expect(shelfLifePct(inDays(-200), inDays(-10))).toBe(0);
    expect(shelfLifePct("", "")).toBeNull();
  });

  it("never counts expired stock as available", () => {
    for (const r of lotRows()) {
      if (r.expiryClass === "Expired") {
        expect(r.available, r.lot).toBe(0);
      }
    }
  });

  it("marks a near-expiry lot without expiring it", () => {
    const near = lotRows().find((r) => r.lotStatus === "Near Expiry")!;
    expect(near.daysToExpiry).toBeGreaterThanOrEqual(0);
    expect(near.daysToExpiry).toBeLessThanOrEqual(90);
    expect(near.expiryClass).not.toBe("Expired");
  });

  it("ranks FEFO by soonest expiry inside a product", () => {
    const ranked = lotRows().filter((r) => r.fefoRank > 0);
    expect(ranked.length).toBeGreaterThan(0);
    const byProduct = new Map<string, LotRow[]>();
    for (const r of ranked) {
      const list = byProduct.get(r.product) ?? [];
      list.push(r);
      byProduct.set(r.product, list);
    }
    for (const rows of byProduct.values()) {
      const sorted = [...rows].sort((a, b) => a.fefoRank - b.fefoRank);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].daysToExpiry ?? 1e9).toBeGreaterThanOrEqual(
          sorted[i - 1].daysToExpiry ?? 1e9,
        );
      }
    }
  });

  it("watches everything inside 180 days", () => {
    const watch = expiryWatch();
    expect(watch.length).toBeGreaterThan(0);
    for (const w of watch) {
      expect(w.expiryClass).not.toBe("More than 180 days");
      expect(["Low", "Medium", "High", "Critical"]).toContain(w.risk);
      expect(w.action).toBeTruthy();
    }
  });
});

describe("Lot Tracking — inventory reconciliation", () => {
  it("splits lot status from stock status", () => {
    const r = lotRows().find((x) => x.qcHold > 0)!;
    /* A lot can be Active while part of its quantity sits on QC hold. */
    expect(r.lotStatus).toBeTruthy();
    expect(r.qcHold).toBeGreaterThan(0);
    expect(list.filters.some((f) => f.id === "lotStatus")).toBe(true);
    expect(list.filters.some((f) => f.id === "stockStatus")).toBe(true);
  });

  it("reconciles every bucket against total on hand", () => {
    for (const r of lotRows()) {
      /* Same equation as Stock Card: Damaged and Blocked tag a position,
         they are not buckets, and In Transit sits outside. */
      const total = r.available + r.reserved + r.qcHold + r.returnHold + r.expiredQty + r.recallHold;
      expect(r.reconciled, `${r.lot}: ${total} vs ${r.onHand}`).toBe(total === r.onHand);
    }
    /* The seeded data must actually balance, or the module is reporting a lie. */
    expect(lotRows().every((r) => r.reconciled)).toBe(true);
  });

  it("reads the same positions Stock Inquiry reads", () => {
    const r = lotRows().find((x) => x.warehouseCount > 0)!;
    const rows = lotInventory(r);
    const positions = STOCK_POSITIONS.filter(
      (p) => p.product === r.product && r.aliases.includes(p.lot),
    );
    expect(rows.length).toBe(positions.length);
    expect(rows.reduce((t, x) => t + x.onHand, 0)).toBe(
      positions.reduce((t, p) => t + p.onHand, 0),
    );
  });

  it("groups a lot across warehouses and locations", () => {
    const spread = lotRows().find((r) => r.warehouseCount > 1)!;
    expect(spread.warehouses.length).toBeGreaterThan(1);
    expect(spread.locationCount).toBeGreaterThanOrEqual(spread.warehouseCount);
    const rows = lotInventory(spread);
    expect(new Set(rows.map((x) => x.warehouse)).size).toBe(spread.warehouseCount);
  });
});

describe("Lot Tracking — traceability", () => {
  const traced = lotRows().find((r) => lotOutbound(r).length > 0 && lotInbound(r).length > 0)!;

  it("traces backward to supplier, purchase order, receipt and QC", () => {
    const chain = lotInbound(traced);
    expect(chain.length).toBeGreaterThan(0);
    for (const d of chain) {
      expect(REGISTRY[d.entity], d.entity).toBeDefined();
      const rows = getSchemas(d.entity)!.list.source();
      expect(rows.some((x) => x.code === d.doc), `${d.entity}/${d.doc}`).toBe(true);
    }
  });

  it("traces forward to picking, shipment and customer", () => {
    const chain = lotOutbound(traced);
    expect(chain.length).toBeGreaterThan(0);
    for (const o of chain) {
      if (o.shipment) {
        const rows = getSchemas("shipment")!.list.source();
        expect(rows.some((x) => x.code === o.shipment), o.shipment).toBe(true);
      }
    }
  });

  it("lists every customer that received the lot with a net quantity", () => {
    const withCustomers = lotRows().find((r) => r.customerCount > 0)!;
    const customers = lotCustomers(withCustomers);
    expect(customers.length).toBe(withCustomers.customerCount);
    for (const c of customers) {
      expect(c.net).toBe(c.delivered - c.returned);
      expect(c.shipments.length).toBeGreaterThan(0);
    }
  });

  it("supports one lot shipped to more than one customer", () => {
    const many = lotRows().find((r) => r.customerCount > 1)!;
    expect(lotCustomers(many).length).toBeGreaterThan(1);
  });

  it("traces the supplier side of the lot", () => {
    const r = lotRows()[0];
    expect(r.supplier).toBeTruthy();
    expect(r.supplierCode).toMatch(/^SUP-/);
    expect(r.manufacturer).toBeTruthy();
    expect(r.country).toBeTruthy();
  });

  it("traces returns back to their source shipment", () => {
    const withReturns = lotRows().find((r) => lotReturns(r).length > 0)!;
    const returns = lotReturns(withReturns);
    expect(returns.length).toBeGreaterThan(0);
    for (const x of returns) {
      const rows = getSchemas("sales-return")!.list.source();
      expect(rows.some((r) => r.code === x.code)).toBe(true);
    }
  });

  it("shows movement history drawn from Stock Card", () => {
    const withMoves = lotRows().find((r) => lotMovements(r).length > 0)!;
    const moves = lotMovements(withMoves);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(withMoves.aliases).toContain(m.lot);
      expect(m.product).toBe(withMoves.product);
      /* Same ledger, same invariant. */
      expect(m.balanceAfter).toBe(m.balanceBefore + m.qtyIn - m.qtyOut);
    }
    expect(movementRows().length).toBeGreaterThan(0);
  });

  it("keeps corrections without erasing the original lot", () => {
    const corrected = lotRows().find((r) => r.correctionCount > 0)!;
    const corrections = lotCorrections(corrected);
    expect(corrections.length).toBeGreaterThan(0);
    for (const c of corrections) {
      expect(c.fromLot).toBeTruthy();
      expect(c.toLot).toBeTruthy();
      expect(c.fromLot).not.toBe(c.toLot);
      /* Both lots still exist in the master. */
      expect(lotRows().some((r) => r.aliases.includes(c.fromLot))).toBe(true);
    }
    expect(LOT_CORRECTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it("records parent and child lots as a placeholder", () => {
    expect(LOT_GENEALOGY.length).toBeGreaterThan(0);
    const withTree = lotRows().find((r) => lotGenealogy(r).length > 0)!;
    for (const g of lotGenealogy(withTree)) {
      expect(g.parent).not.toBe(g.child);
      expect(g.qty).toBeGreaterThan(0);
      expect(g.document).toBeTruthy();
    }
  });
});

describe("Lot Tracking — read-only", () => {
  it("offers no create, edit, delete or quantity action", () => {
    expect(list.hideCreate).toBe(true);
    expect(getSchemas("lot-tracking")!.form).toBeUndefined();

    const rec = lotRows()[0];
    const labels = [
      ...list.rowActions(rec, {} as never).map((a) => a.label ?? ""),
      ...(detail.actions?.(rec, {} as never) ?? []).map((a) => a.label ?? ""),
    ];
    for (const l of labels) {
      expect(l.toLowerCase()).not.toMatch(/edit|delete|แก้ไขล็อต|ลบ/);
    }
  });

  it("renders no create button on the list", () => {
    renderList();
    expect(screen.queryByRole("button", { name: /สร้าง|Create|New/ })).not.toBeInTheDocument();
  });

  it("never changes stock from the module itself", () => {
    const { ctx } = stubCtx();
    const before = STOCK_POSITIONS.map((p) => `${p.code}:${p.onHand}`).join("|");
    const rec = lotRows().find((r) => r.recallRef && r.available > 0);
    if (rec) {
      detail.actions!(rec, ctx).find((a) => a.label === "กันสต๊อกเข้า Recall Hold")!.run!(rec);
    }
    expect(STOCK_POSITIONS.map((p) => `${p.code}:${p.onHand}`).join("|")).toBe(before);
  });
});

describe("Lot Tracking — recall review", () => {
  const freshLot = () => lotRows().find((r) => !lotRecall(r) && r.available > 0)!;

  it("requires type, severity and reason to start a review", () => {
    const { ctx, calls } = stubCtx();
    const rec = freshLot();
    const before = RECALL_REVIEWS.length;

    detail.actions!(rec, ctx).find((a) => a.label === "เริ่มการตรวจสอบเรียกคืน")!.run!(rec);
    expect(calls.modal).not.toBeNull();
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(RECALL_REVIEWS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("refuses to start a second review for the same lot", () => {
    const { ctx, calls } = stubCtx();
    const rec = lotRows().find((r) => lotRecall(r))!;
    detail.actions!(rec, ctx).find((a) => a.label === "เริ่มการตรวจสอบเรียกคืน")!.run!(rec);
    expect(calls.modal).toBeNull();
    expect(calls.toasts.at(-1)!.title).toMatch(/มีการตรวจสอบอยู่แล้ว/);
  });

  it("refuses a recall hold before a review exists", () => {
    const { ctx, calls } = stubCtx();
    const rec = freshLot();
    const before = ADJUSTMENTS.length;

    const action = detail.actions!(rec, ctx).find((a) => a.label === "กันสต๊อกเข้า Recall Hold")!;
    expect(action.disabled).toBe(true);
    action.run!(rec);
    expect(ADJUSTMENTS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("hands a recall hold to Stock Adjustment as a status change", () => {
    const { ctx, calls } = stubCtx();
    const rec = lotRows().find((r) => r.recallRef && r.available > 0)!;
    const before = ADJUSTMENTS.length;

    detail.actions!(rec, ctx).find((a) => a.label === "กันสต๊อกเข้า Recall Hold")!.run!(rec);
    expect(calls.confirmed).toBe(true);
    expect(ADJUSTMENTS.length).toBe(before + 1);

    const adj = ADJUSTMENTS[0];
    expect(adj.type).toBe("Stock Status Adjustment");
    expect(adj.reason).toBe("Recall Hold");
    expect(adj.status).toBe("Draft");
    expect(adj.refDoc).toBe(rec.recallRef);
    expect(adj.items[0].action).toBe("Change Stock Status");
    expect(adj.items[0].statusFrom).toBe("Available");
    expect(adj.items[0].qty).toBe(rec.available);
    expect(adj.items[0].lot).toBe(rec.lot);
  });

  it("never creates a second adjustment for the same review", () => {
    const { ctx, calls } = stubCtx();
    const rec = lotRows().find((r) => r.recallRef && r.available > 0)!;
    detail.actions!(rec, ctx).find((a) => a.label === "กันสต๊อกเข้า Recall Hold")!.run!(rec);
    const after = ADJUSTMENTS.length;

    invalidateLots();
    const again = lotRows().find((r) => r.code === rec.code)!;
    detail.actions!(again, ctx).find((a) => a.label === "กันสต๊อกเข้า Recall Hold")!.run!(again);
    expect(ADJUSTMENTS.length).toBe(after);
    expect(calls.toasts.at(-1)!.title).toMatch(/กันสต๊อกไปแล้ว/);
  });

  it("requires a reason to release the hold", () => {
    const { ctx, calls } = stubCtx();
    const rec = lotRows().find((r) => r.recallRef)!;
    detail.actions!(rec, ctx).find((a) => a.label === "ปลดการกันสต๊อก")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("exports the customer contact list without sending anything", () => {
    const { ctx, calls } = stubCtx();
    const rec = lotRows().find((r) => r.customerCount > 0)!;
    detail.actions!(rec, ctx).find((a) => a.label === "ส่งออกรายชื่อลูกค้า")!.run!(rec);
    expect(calls.toasts.at(-1)!.title).toMatch(/ส่งออกรายชื่อลูกค้า/);
  });

  it("closes a review and keeps its history", () => {
    const { ctx } = stubCtx();
    const rec = lotRows().find((r) => r.recallRef && lotRecall(r)!.status !== "Closed")!;
    const review = lotRecall(rec)!;
    const notes = review.notes.length;

    detail.actions!(rec, ctx).find((a) => a.label === "ปิดการตรวจสอบ")!.run!(rec);
    expect(review.status).toBe("Closed");
    expect(review.notes.length).toBeGreaterThan(notes);
  });
});

describe("Lot Tracking — list", () => {
  it("renders the title and subtitle", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Lot Tracking" })).toBeInTheDocument();
    expect(screen.getByText(/Trace lot-controlled inventory/)).toBeInTheDocument();
  });

  it("renders all ten KPI cards", () => {
    renderList();
    for (const label of [
      "Total Active Lots",
      "Available Lots",
      "QC Hold Lots",
      "Recall Hold Lots",
      "Near Expiry Lots",
      "Expired Lots",
      "Depleted Lots",
      "Lots Received This Month",
      "Lots Shipped This Month",
      "Total Lot Inventory Value",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("declares the columns and quick filters the spec lists", () => {
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Lot Number",
      "Product Code",
      "Product Name",
      "Brand",
      "Category",
      "Supplier",
      "Manufacturer",
      "Manufacturing Date",
      "Expiry Date",
      "Lot Status",
      "Total On Hand",
      "Available",
      "Reserved",
      "QC Hold",
      "Return Hold",
      "Damaged",
      "Blocked",
      "Expired Qty",
      "Recall Hold",
      "In Transit",
      "Warehouses",
      "Locations",
      "Original Received Qty",
      "Shipped Qty",
      "Returned Qty",
      "Unit Cost",
      "Inventory Value",
      "Last Movement",
    ]) {
      expect(labels, label).toContain(label);
    }
    expect(list.tabs).toHaveLength(10);
  });

  it("exposes the advanced filters the spec lists", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of [
      "lotStatus",
      "stockStatus",
      "product",
      "cat",
      "brand",
      "supplier",
      "manufacturer",
      "warehouse",
      "location",
      "received",
      "mfg",
      "exp",
      "expiryClass",
      "hasAvailable",
      "hasReserved",
      "qcOnly",
      "returnOnly",
      "recallOnly",
      "shipped",
      "returned",
      "corrected",
      "myWarehouse",
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("searches by lot number", async () => {
    const user = userEvent.setup();
    renderList();
    const rec = lotRows()[0];
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), rec.lot);
    const expected = lotRows().filter((r) =>
      list.searchFields
        .map((f) => String((r as unknown as Record<string, unknown>)[f] ?? ""))
        .join(" ")
        .toLowerCase()
        .includes(rec.lot.toLowerCase()),
    ).length;
    expect(screen.getByText(new RegExp(`^${expected} lots$`))).toBeInTheDocument();
  });

  it("searches by product and by supplier", () => {
    for (const f of ["product", "productName", "supplier", "barcode", "poRef", "grRef"]) {
      expect(list.searchFields).toContain(f);
    }
  });

  it("filters by lot status, warehouse and expiry class", async () => {
    const user = userEvent.setup();
    renderList();

    const expected = lotRows().filter((r) => r.expiryClass === "Expired").length;
    await user.selectOptions(screen.getByLabelText("Expiry Classification"), "Expired");
    expect(screen.getByText(new RegExp(`^${expected} lots$`))).toBeInTheDocument();

    const byStatus = list.filters.find((f) => f.id === "lotStatus")!;
    expect(lotRows().filter((r) => byStatus.test(r, "Active")).every((r) => r.lotStatus === "Active")).toBe(
      true,
    );
    const wh = lotRows().find((r) => r.warehouses.length)!.warehouses[0];
    const byWh = list.filters.find((f) => f.id === "warehouse")!;
    expect(lotRows().filter((r) => byWh.test(r, wh)).every((r) => r.warehouses.includes(wh))).toBe(true);
  });

  it("counts the summary the KPI cards read", () => {
    const s = lotSummary();
    expect(s.total).toBe(lotRows().length);
    expect(s.expired).toBe(lotRows().filter((r) => r.expiryClass === "Expired").length);
  });
});

describe("Lot Tracking — drawer and detail", () => {
  it("declares the tabs the spec asks for", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "inventory",
      "movement",
      "inbound",
      "outbound",
      "customers",
      "supplier",
      "returns",
      "recall",
      "genealogy",
      "corrections",
      "docs",
      "timeline",
      "audit",
    ]);
  });

  it("heads the lot with status, expiry and available quantity", () => {
    const rec = lotRows()[0];
    const id = detail.identity(rec);
    expect(id.code).toBe(rec.lot);
    expect(id.badges.map((b) => b.text)).toContain(rec.lotStatus);
    expect(id.badges.map((b) => b.text)).toContain(rec.expiryClass);
    expect(detail.kpis(rec).map((k) => k.label)).toContain("Available");
    expect(detail.kpis(rec).map((k) => k.label)).toContain("Days to Expiry");
  });

  it("opens when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    const rec = lotRows()[0];
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), rec.lot);
    await user.click(screen.getAllByText(rec.lot)[0]);

    const drawer = await screen.findByRole("dialog", { name: new RegExp(rec.productName) });
    expect(within(drawer).getByRole("tab", { name: "Inventory" })).toBeInTheDocument();
  });

  it("opens the full traceability page", () => {
    const rec = lotRows().find((r) => r.customerCount > 0)!;
    render(<FullDetail schema={detail} record={rec} />);
    expect(screen.getAllByText(rec.lot).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inbound Trace" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lot Genealogy" })).toBeInTheDocument();
  });

  it("navigates into the source goods receipt", () => {
    const { ctx, calls } = stubCtx();
    const rec = lotRows().find((r) => r.grRef)!;
    const action = list.rowActions(rec, ctx).find((a) => a.icon === "goodsReceipt")!;
    expect(action.disabled).toBeFalsy();
    action.run!(rec);
    expect(calls.entities.at(-1)).toBe(`goods-receipt/${rec.grRef}`);
  });
});

describe("Lot Tracking — navigation", () => {
  it("is registered read-only in the entity registry", () => {
    expect(REGISTRY["lot-tracking"]).toBeDefined();
    expect(getSchemas("lot-tracking")!.form).toBeUndefined();
  });

  it("is reachable from the Inventory sidebar group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    const item = group.items.find((i) => i.label === "Lot Tracking")!;
    expect(item.href).toBe("/m/lot-tracking");
    expect(item.soon).toBeUndefined();
    expect(pageHref("Lot Tracking")).toBe("/m/lot-tracking");
  });

  it("leaves the phases after Inventory as coming soon", () => {
    /* Inventory is complete; Finance and the rest are the next phase. */
    for (const label of ["Finance", "Service", "Reports", "Settings"]) {
      const group = NAV.find((g) => g.label === label);
      expect(group, label).toBeDefined();
      expect(group!.items.every((i) => i.soon), label).toBe(true);
    }
  });

  it("keeps the other Inventory modules untouched", () => {
    expect(pageHref("Inventory Workspace")).toBe("/inventory");
    expect(pageHref("Stock Inquiry")).toBe("/m/stock-inquiry");
    expect(pageHref("Stock Card")).toBe("/m/stock-card");
    expect(pageHref("Stock Transfer")).toBe("/m/stock-transfer");
    expect(pageHref("Stock Adjustment")).toBe("/m/stock-adjustment");
    expect(pageHref("Cycle Count")).toBe("/m/cycle-count");
  });

  it("resolves a lot by product and lot number", () => {
    const rec = lotRows()[0];
    expect(findLot(rec.product, rec.lot)?.code).toBe(rec.code);
    for (const alias of rec.aliases) {
      expect(findLot(rec.product, alias)?.code).toBe(rec.code);
    }
  });
});

describe("Lot Tracking — export and responsive", () => {
  it("offers Excel, CSV and print without writing a file", () => {
    const { ctx, calls } = stubCtx();
    const labels = list.secondaryActions!(ctx).map((a) => a.label);
    expect(labels).toContain("Export Excel");
    expect(labels).toContain("Export CSV");
    expect(labels).toContain("Print");

    list.secondaryActions!(ctx).find((a) => a.label === "Export Excel")!.run();
    expect(calls.toasts.at(-1)!.title).toMatch(/ส่งออก/);
  });

  it("keeps cost columns hidden until a user asks for them", () => {
    for (const key of ["unitCost", "inventoryValue"]) {
      expect(list.columns.find((c) => c.key === key)?.defaultHidden).toBe(true);
    }
  });

  it("scrolls the wide table rather than the page", () => {
    const { container } = renderList();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("opens with a readable column subset and a locked identity column", () => {
    const visible = list.columns.filter((c) => !c.defaultHidden);
    expect(visible.length).toBeLessThan(list.columns.length);
    expect(list.columns.find((c) => c.key === "lot")?.locked).toBe(true);
  });
});
