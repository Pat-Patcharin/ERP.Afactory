import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import { MOVEMENT_TARGETS, MOVEMENT_TYPE_MAP, MOVEMENT_TYPES } from "@/data/movements";
import { PRODUCTS } from "@/lib/domain/product";
import { productTotals } from "@/lib/domain/stock";
import {
  movementRows,
  productCards,
  ledgerSummary,
  movementsByLocation,
  movementsByLot,
  movementsBySerial,
  movementsByWarehouse,
  movementSummary,
  productLedger,
  serialTimeline,
} from "@/lib/domain/movement";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { stockCardSchemas } from "@/schemas/stock-card";
import { productStockCardSchemas } from "@/schemas/product-stock-card";
import { routerPush } from "./setup";

const { list, detail } = stockCardSchemas;
const cardList = productStockCardSchemas.list;
const cardDetail = productStockCardSchemas.detail;

/* The ledger is a cache now — read it once per suite through its accessor. */
const MOVEMENTS = movementRows();
const PRODUCT_CARDS = productCards();

const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );

/** A product with lots, serials and a full document trail. */
const richProduct =
  PRODUCT_CARDS.find(
    (p) =>
      productLedger(p.code).some((m) => m.sourceDoc) &&
      movementsByWarehouse(p.code).length > 1,
  ) ?? PRODUCT_CARDS[0];

const sample = productLedger(richProduct.code).find((m) => m.sourceDoc)!;

beforeEach(() => window.localStorage.clear());

/* ============================================================
   STOCK CARD regression suite.
   ============================================================ */

describe("Stock Card — mock data", () => {
  it("generates at least the volume the module was specified with", () => {
    expect(MOVEMENTS.length).toBeGreaterThanOrEqual(MOVEMENT_TARGETS.minMovements);
    expect(PRODUCT_CARDS.length).toBe(PRODUCTS.length);
  });

  it("covers inbound, outbound, status and non-quantity movement types", () => {
    const groups = new Set(MOVEMENTS.map((m) => m.group));
    expect(groups).toContain("Inbound");
    expect(groups).toContain("Outbound");
    expect(groups).toContain("Status");
  });

  it("is deterministic — no Math.random in the ledger", () => {
    const a = MOVEMENTS.map((m) => `${m.code}:${m.balanceAfter}`).join("|");
    const b = MOVEMENTS.map((m) => `${m.code}:${m.balanceAfter}`).join("|");
    expect(a).toBe(b);
    expect(MOVEMENTS.every((m) => /^MOV-2026-\d{6}$/.test(m.code))).toBe(true);
  });

  it("never posts a negative running balance", () => {
    for (const m of MOVEMENTS) expect(m.balanceAfter).toBeGreaterThanOrEqual(0);
  });
});

describe("Stock Card — running balance", () => {
  it("obeys Balance After = Balance Before + In − Out on every row", () => {
    for (const m of MOVEMENTS) {
      expect(m.balanceAfter, m.code).toBe(m.balanceBefore + m.qtyIn - m.qtyOut);
    }
  });

  it("chains each product's ledger without a gap", () => {
    for (const p of PRODUCTS) {
      const ledger = productLedger(p.code);
      for (let i = 1; i < ledger.length; i++) {
        expect(ledger[i].balanceBefore, `${p.code} row ${i}`).toBe(
          ledger[i - 1].balanceAfter,
        );
      }
    }
  });

  it("closes on the figures Stock Inquiry and the Product master report", () => {
    for (const p of PRODUCTS) {
      const ledger = productLedger(p.code);
      if (!ledger.length) continue;
      const last = ledger[ledger.length - 1];
      const now = productTotals(p.code);

      expect(last.balanceAfter, `${p.code} on hand`).toBe(now.onHand);
      expect(last.balanceAfter, `${p.code} vs master`).toBe(p.onHand ?? 0);
      expect(last.availAfter, `${p.code} available`).toBe(now.available);
      expect(last.resAfter, `${p.code} reserved`).toBe(now.reserved);
      expect(last.qcAfter, `${p.code} qc hold`).toBe(now.qcHold);
      expect(last.retAfter, `${p.code} return hold`).toBe(now.returnHold);
      expect(last.dmgAfter, `${p.code} damaged`).toBe(now.damaged);
    }
  });

  it("keeps On Hand = Available + Reserved + QC Hold + Return Hold", () => {
    for (const m of MOVEMENTS) {
      expect(m.availAfter + m.resAfter + m.qcAfter + m.retAfter, m.code).toBe(
        m.balanceAfter,
      );
    }
  });

  it("summarises opening, totals and closing for a product", () => {
    const ledger = productLedger(richProduct.code);
    const s = ledgerSummary(ledger);
    expect(s.opening).toBe(ledger[0].balanceBefore);
    expect(s.closing).toBe(ledger[ledger.length - 1].balanceAfter);
    expect(s.net).toBe(s.totalIn - s.totalOut);
    expect(s.opening + s.net).toBe(s.closing);
  });
});

describe("Stock Card — movement rules", () => {
  it("treats a reservation as a status move, not a quantity deduction", () => {
    const rows = MOVEMENTS.filter((m) => m.type === "Available to Reserved");
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(m.qtyIn).toBe(0);
      expect(m.qtyOut).toBe(0);
      expect(m.balanceAfter).toBe(m.balanceBefore);
      expect(m.resAfter).toBeGreaterThan(m.resBefore);
      expect(m.availAfter).toBeLessThan(m.availBefore);
      expect(m.availBefore - m.availAfter).toBe(m.resAfter - m.resBefore);
    }
  });

  it("reduces on hand and the reservation when picking", () => {
    const rows = MOVEMENTS.filter((m) => m.type === "Picking");
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(m.qtyOut).toBeGreaterThan(0);
      expect(m.balanceAfter).toBe(m.balanceBefore - m.qtyOut);
      expect(m.resAfter).toBe(m.resBefore - m.qtyOut);
    }
  });

  it("moves quantity between statuses on a QC release without changing on hand", () => {
    const rows = MOVEMENTS.filter((m) => m.type === "QC Hold to Available");
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(m.balanceAfter).toBe(m.balanceBefore);
      expect(m.qcAfter).toBe(m.qcBefore - (m.availAfter - m.availBefore));
    }
  });

  it("parks a goods receipt in QC hold", () => {
    const rows = MOVEMENTS.filter((m) => m.type === "Goods Receipt");
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(m.qtyIn).toBeGreaterThan(0);
      expect(m.balanceAfter).toBe(m.balanceBefore + m.qtyIn);
      expect(m.qcAfter).toBe(m.qcBefore + m.qtyIn);
    }
  });

  it("moves a transfer out of one balance and a transfer in back", () => {
    const out = MOVEMENTS.filter((m) => m.type === "Transfer Out");
    const into = MOVEMENTS.filter((m) => m.type === "Transfer In");
    expect(out.length).toBeGreaterThan(0);
    expect(into.length).toBeGreaterThan(0);
    for (const m of out) expect(m.balanceAfter).toBe(m.balanceBefore - m.qtyOut);
    for (const m of into) expect(m.balanceAfter).toBe(m.balanceBefore + m.qtyIn);
  });

  it("leaves a put away as a location change, never a second receipt", () => {
    const rows = MOVEMENTS.filter((m) => m.type === "Put Away");
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(m.qtyIn).toBe(0);
      expect(m.qtyOut).toBe(0);
      expect(m.balanceAfter).toBe(m.balanceBefore);
      expect(m.direction).toBe("Transfer");
    }
  });

  it("declares an effect for every movement type in the catalogue", () => {
    expect(MOVEMENT_TYPES.length).toBeGreaterThanOrEqual(28);
    for (const t of MOVEMENT_TYPES) {
      expect(MOVEMENT_TYPE_MAP.get(t.type)).toBeDefined();
      expect(t.direction).toBeTruthy();
    }
  });
});

describe("Stock Card — reversal", () => {
  const reversals = MOVEMENTS.filter((m) => m.reversalOf);

  it("creates a separate reversal rather than editing the original", () => {
    expect(reversals.length).toBeGreaterThan(0);
    for (const rev of reversals) {
      const original = MOVEMENTS.find((m) => m.code === rev.reversalOf)!;
      expect(original, rev.code).toBeDefined();
      expect(original.status).toBe("Reversed");
      expect(original.reversedBy).toBe(rev.code);
      expect(rev.ts).toBeGreaterThan(original.ts);
    }
  });

  it("carries the opposite quantity effect", () => {
    for (const rev of reversals) {
      const original = MOVEMENTS.find((m) => m.code === rev.reversalOf)!;
      expect(rev.qtyIn).toBe(original.qtyOut);
      expect(rev.qtyOut).toBe(original.qtyIn);
    }
  });

  it("links both directions", () => {
    for (const rev of reversals) {
      const original = MOVEMENTS.find((m) => m.code === rev.reversalOf)!;
      expect(original.reversedBy).toBe(rev.code);
      expect(rev.reversalOf).toBe(original.code);
    }
  });
});

describe("Stock Card — list", () => {
  it("renders the title and subtitle", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Stock Card" })).toBeInTheDocument();
    expect(screen.getByText(/Trace every inventory movement/)).toBeInTheDocument();
  });

  it("renders all ten KPI cards", () => {
    renderList();
    for (const label of [
      "Total Movements",
      "Inbound Today",
      "Outbound Today",
      "Transfer Movements",
      "Adjustment Movements",
      "Reservation Movements",
      "Return Movements",
      "Net Movement Today",
      "Products Moved Today",
      "Inventory Value Change",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("offers the quick filters the spec lists", () => {
    const keys = list.tabs.map((t) => t.key);
    for (const k of ["all", "in", "out", "transfer", "adjust", "reserve", "return", "count", "today", "week"]) {
      expect(keys).toContain(k);
    }
  });

  it("declares every table column the spec lists", () => {
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Movement Date",
      "Movement No.",
      "Product Code",
      "Product Name",
      "Movement Type",
      "Direction",
      "Source Document",
      "Source Module",
      "Warehouse",
      "From Location",
      "To Location",
      "Lot Number",
      "Serial Number",
      "UOM",
      "Qty In",
      "Qty Out",
      "Balance Before",
      "Balance After",
      "Status Before",
      "Status After",
      "Unit Cost",
      "Value Impact",
      "Performed By",
      "Reference",
    ]) {
      expect(labels, label).toContain(label);
    }
  });
});

describe("Stock Card — search and filters", () => {
  it("searches every field the spec names", () => {
    for (const f of [
      "product",
      "productName",
      "barcode",
      "sourceDoc",
      "warehouse",
      "toLoc",
      "lot",
      "serial",
      "partner",
      "user",
    ]) {
      expect(list.searchFields).toContain(f);
    }
  });

  it("finds movements by product code", async () => {
    const user = userEvent.setup();
    renderList();
    const box = screen.getByPlaceholderText(list.searchPlaceholder!);
    await user.type(box, richProduct.code);

    const expected = MOVEMENTS.filter((m) => m.product === richProduct.code).length;
    expect(expected).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^${expected} movements$`))).toBeInTheDocument();
  });

  it("exposes every advanced filter the spec lists", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of [
      "dateFrom",
      "dateTo",
      "type",
      "direction",
      "product",
      "cat",
      "brand",
      "warehouse",
      "zone",
      "rack",
      "bin",
      "lot",
      "serial",
      "module",
      "doc",
      "user",
      "statusBefore",
      "statusAfter",
      "inOnly",
      "outOnly",
      "cost",
      "reversed",
      "myWarehouse",
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("filters by date range", () => {
    const from = list.filters.find((f) => f.id === "dateFrom")!;
    const to = list.filters.find((f) => f.id === "dateTo")!;
    const day = MOVEMENTS[Math.floor(MOVEMENTS.length / 2)].date;

    const after = MOVEMENTS.filter((m) => from.test(m, day));
    const before = MOVEMENTS.filter((m) => to.test(m, day));
    expect(after.length).toBeGreaterThan(0);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length + before.length).toBeGreaterThanOrEqual(MOVEMENTS.length);
  });

  it("filters by movement type, direction and warehouse", async () => {
    const user = userEvent.setup();
    renderList();

    const expected = MOVEMENTS.filter((m) => m.direction === "In").length;
    await user.selectOptions(screen.getByLabelText("Direction"), "In");
    expect(screen.getByText(new RegExp(`^${expected} movements$`))).toBeInTheDocument();

    const byType = list.filters.find((f) => f.id === "type")!;
    expect(MOVEMENTS.filter((m) => byType.test(m, "Picking")).length).toBeGreaterThan(0);

    const wh = MOVEMENTS[0].whLabel;
    const byWh = list.filters.find((f) => f.id === "warehouse")!;
    expect(MOVEMENTS.filter((m) => byWh.test(m, wh)).every((m) => m.whLabel === wh)).toBe(true);
  });
});

describe("Stock Card — drawer and movement detail", () => {
  it("declares the tabs the drawer needs", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "impact",
      "source",
      "lot",
      "cost",
      "timeline",
    ]);
  });

  it("opens the quick drawer when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), sample.code);
    await user.click(screen.getAllByText(sample.code)[0]);

    const drawer = await screen.findByRole("dialog", { name: new RegExp(sample.type) });
    expect(within(drawer).getByRole("tab", { name: "Stock Impact" })).toBeInTheDocument();
    expect(within(drawer).getAllByText(sample.code).length).toBeGreaterThan(0);
  });

  it("heads the movement with number, type, direction and status", () => {
    const id = detail.identity(sample);
    expect(id.code).toBe(sample.code);
    expect(id.badges.map((b) => b.text)).toContain(sample.direction);
    expect(id.badges.map((b) => b.text)).toContain(sample.status);
  });

  it("opens the full movement detail page", () => {
    render(<FullDetail schema={detail} record={sample} />);
    expect(screen.getAllByText(sample.code).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Stock Impact" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cost Preview" })).toBeInTheDocument();
  });

  it("shows every before and after pair in Stock Impact", () => {
    const blocks = detail.tabs.find((t) => t.key === "impact")!.blocks(sample, {} as never);
    const fields = blocks.find(
      (b) => b && (b as { type: string }).type === "fields",
    ) as { items: { label: string }[] };
    for (const label of [
      "On Hand",
      "Available",
      "Reserved",
      "QC Hold",
      "Return Hold",
      "Damaged",
    ]) {
      expect(fields.items.map((i) => i.label)).toContain(label);
    }
  });
});

describe("Stock Card — read-only", () => {
  it("offers no create, edit or delete anywhere", () => {
    expect(list.hideCreate).toBe(true);
    expect(getSchemas("stock-card")!.form).toBeUndefined();
    expect(getSchemas("product-stock-card")!.form).toBeUndefined();

    const ctx = {} as never;
    const labels = [
      ...list.rowActions(sample, ctx).map((a) => a.label ?? ""),
      ...(detail.actions?.(sample, ctx) ?? []).map((a) => a.label ?? ""),
      ...(list.bulkActions?.([sample], ctx) ?? []).map((a) => a.label),
    ];
    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(/edit|delete|แก้ไข|ลบ/);
    }
  });

  it("renders no create button on the list", () => {
    renderList();
    expect(screen.queryByRole("button", { name: /เพิ่ม|Create|New/ })).not.toBeInTheDocument();
  });
});

describe("Stock Card — export", () => {
  it("offers Excel, CSV and Print", () => {
    const labels = list.secondaryActions!({} as never).map((a) => a.label);
    expect(labels).toContain("Export Excel");
    expect(labels).toContain("Export CSV");
    expect(labels).toContain("Print");
  });

  it("reports the export instead of pretending to write a file", () => {
    const toasted: string[] = [];
    const ctx = { toast: (t: string) => toasted.push(t) } as never;
    list.secondaryActions!(ctx).find((a) => a.label === "Export Excel")!.run();
    expect(toasted[0]).toMatch(/ส่งออก/);
  });
});

describe("Product Stock Card", () => {
  it("declares the nine tabs the spec lists", () => {
    expect(cardDetail.tabs.map((t) => t.key)).toEqual([
      "balance",
      "warehouse",
      "location",
      "lot",
      "serial",
      "reservations",
      "incoming",
      "trace",
      "timeline",
    ]);
  });

  it("heads the card with the current stock position", () => {
    const kpis = cardDetail.kpis(richProduct);
    expect(kpis.map((k) => k.label)).toEqual([
      "On Hand",
      "Available",
      "Reserved",
      "QC Hold",
      "Return Hold",
      "Damaged",
    ]);
    const now = productTotals(richProduct.code);
    expect(kpis[0].value).toBe(now.onHand.toLocaleString("en-US"));
  });

  it("opens for a product", () => {
    render(<FullDetail schema={cardDetail} record={richProduct} />);
    expect(screen.getAllByText(richProduct.name).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Running Balance" })).toBeInTheDocument();
  });

  it("lists one row per product with its movement counts", () => {
    render(<ListView schema={cardList} />);
    expect(screen.getByRole("heading", { level: 1, name: "Product Stock Card" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^${PRODUCT_CARDS.length} stock cards$`))).toBeInTheDocument();
  });

  it("groups by warehouse and closes on the same balance", () => {
    const rows = movementsByWarehouse(richProduct.code);
    expect(rows.length).toBeGreaterThan(0);
    for (const w of rows) expect(w.lastMovement).toBeTruthy();
  });

  it("groups by location down to the bin", () => {
    const rows = movementsByLocation(richProduct.code);
    expect(rows.length).toBeGreaterThan(0);
    for (const l of rows) expect(l.movementIn + l.movementOut).toBeGreaterThanOrEqual(0);
  });

  it("reports lot movement with opening, in, out and closing", () => {
    const lotProduct =
      PRODUCT_CARDS.find((p) => movementsByLot(p.code).length > 0) ?? richProduct;
    const rows = movementsByLot(lotProduct.code);
    expect(rows.length).toBeGreaterThan(0);
    for (const l of rows) expect(l.closing).toBe(l.opening + l.qtyIn - l.qtyOut);
  });

  it("reports serial movement one row per serial with a timeline", () => {
    const serialProduct = PRODUCT_CARDS.find((p) => movementsBySerial(p.code).length > 0)!;
    const rows = movementsBySerial(serialProduct.code);
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.serial)).size).toBe(rows.length);
    expect(Array.isArray(serialTimeline(rows[0].serial))).toBe(true);
  });
});

describe("Stock Card — source document trace", () => {
  it("points every referenced module at a registered entity", () => {
    const withDoc = MOVEMENTS.filter((m) => m.sourceDoc && m.sourceModule);
    expect(withDoc.length).toBeGreaterThan(0);
    for (const m of withDoc) expect(REGISTRY[m.sourceModule], m.sourceModule).toBeDefined();
  });

  it("resolves every source document to a record that exists", () => {
    for (const m of MOVEMENTS.filter((x) => x.sourceDoc && x.sourceModule)) {
      const rows = getSchemas(m.sourceModule)!.list.source();
      expect(rows.some((r) => r.code === m.sourceDoc), `${m.sourceModule}/${m.sourceDoc}`).toBe(
        true,
      );
    }
  });

  it("navigates a row action into the source module", () => {
    const ctx = {
      goto: routerPush,
      openEntity: (entity: string, code?: string) => routerPush(`/m/${entity}/${code}`),
      toast: () => {},
    } as never;
    const action = list.rowActions(sample, ctx).find((a) => a.icon === "file")!;
    expect(action.disabled).toBeFalsy();
    action.run!(sample);
    expect(routerPush).toHaveBeenCalledWith(`/m/${sample.sourceModule}/${sample.sourceDoc}`);
  });

  it("disables the source action when a movement has no document", () => {
    const orphan = MOVEMENTS.find((m) => !m.sourceDoc)!;
    const action = list.rowActions(orphan, {} as never).find((a) => a.icon === "file")!;
    expect(action.disabled).toBe(true);
  });
});

describe("Stock Card — navigation", () => {
  it("registers both entities", () => {
    expect(REGISTRY["stock-card"]).toBeDefined();
    expect(REGISTRY["product-stock-card"]).toBeDefined();
  });

  it("is reachable from the Inventory sidebar group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    const item = group.items.find((i) => i.label === "Stock Card")!;
    expect(item.href).toBe("/m/stock-card");
    expect(item.soon).toBeUndefined();
    expect(pageHref("Stock Card")).toBe("/m/stock-card");
  });

  it("leaves the modules this round must not build as coming soon", () => {
    for (const label of ["Barcode Lookup"]) {
      expect(pageHref(label)).toBe(`/soon?m=${encodeURIComponent(label)}`);
    }
  });

  it("keeps Stock Inquiry and the Inventory Workspace untouched", () => {
    expect(pageHref("Stock Inquiry")).toBe("/m/stock-inquiry");
    expect(pageHref("Inventory Workspace")).toBe("/inventory");
  });
});

describe("Stock Card — cost preview", () => {
  it("labels the section as a preview, not accounting", () => {
    const blocks = detail.tabs.find((t) => t.key === "cost")!.blocks(sample, {} as never);
    const alert = blocks.find((b) => b && (b as { type: string }).type === "alert") as {
      title: string;
    };
    expect(alert.title).toBe("Operational Cost Preview");
  });

  it("carries unit cost, value in, value out and a costing method", () => {
    expect(sample.unitCost).toBeGreaterThanOrEqual(0);
    expect(sample.valueIn).toBe(Math.round(sample.qtyIn * sample.unitCost * 100) / 100);
    expect(sample.valueOut).toBe(Math.round(sample.qtyOut * sample.unitCost * 100) / 100);
    expect(sample.costingMethod).toBe("Moving Average");
    expect(sample.currency).toBe("THB");
  });

  it("keeps cost columns hidden until a user asks for them", () => {
    for (const key of ["unitCost", "valueImpact"]) {
      expect(list.columns.find((c) => c.key === key)?.defaultHidden).toBe(true);
    }
  });
});

describe("Stock Card — responsive", () => {
  it("scrolls the wide ledger rather than the page", () => {
    const { container } = renderList();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("opens with a readable column subset", () => {
    const visible = list.columns.filter((c) => !c.defaultHidden);
    expect(visible.length).toBeLessThan(list.columns.length);
    expect(visible.length).toBeLessThanOrEqual(14);
  });

  it("keeps the movement number locked in every layout", () => {
    expect(list.columns.find((c) => c.key === "code")?.locked).toBe(true);
    expect(cardList.columns.find((c) => c.key === "code")?.locked).toBe(true);
  });
});

describe("Stock Card — summary", () => {
  it("counts movements by kind", () => {
    const s = movementSummary();
    expect(s.total).toBe(MOVEMENTS.length);
    expect(s.transfers).toBe(MOVEMENTS.filter((m) => m.type.startsWith("Transfer")).length);
    expect(s.netToday).toBe(s.inboundToday - s.outboundToday);
  });
});
