import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import { STOCK_TARGETS } from "@/data/stock";
import { PRODUCTS } from "@/lib/domain/product";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import {
  STOCK_INCOMING,
  STOCK_LOTS,
  STOCK_MOVEMENTS,
  STOCK_POSITIONS,
  STOCK_RESERVATIONS,
  STOCK_SERIALS,
  productByWarehouse,
  productIncoming,
  productLots,
  productReservations,
  productRows,
  productSerials,
  productTotals,
  stockMovements,
  stockStatusOf,
  stockSummary,
} from "@/lib/domain/stock";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { getPath } from "@/lib/utils";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { stockInquirySchemas } from "@/schemas/stock-inquiry";
import { routerPush } from "./setup";

const { list, detail } = stockInquirySchemas;

/** The engine drives the whole screen — render it exactly as the route does. */
const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );

/** A product with lots, movements and more than one warehouse. */
const richRow = STOCK_POSITIONS.find(
  (r) =>
    r.lot &&
    productByWarehouse(r.product).length > 1 &&
    stockMovements(r.product, 20).length > 0,
)!;

beforeEach(() => window.localStorage.clear());

/* ============================================================
   STOCK INQUIRY regression suite.
   ============================================================ */

describe("Stock Inquiry — mock data", () => {
  it("generates the volumes the module was specified with", () => {
    expect(STOCK_POSITIONS).toHaveLength(STOCK_TARGETS.positions);
    expect(STOCK_LOTS).toHaveLength(STOCK_TARGETS.lots);
    expect(STOCK_SERIALS).toHaveLength(STOCK_TARGETS.serials);
    expect(STOCK_MOVEMENTS).toHaveLength(STOCK_TARGETS.movements);
    expect(STOCK_RESERVATIONS.length).toBeLessThanOrEqual(STOCK_TARGETS.reservations);
    expect(STOCK_INCOMING.length).toBeLessThanOrEqual(STOCK_TARGETS.incoming);
  });

  it("never invents a product or a warehouse", () => {
    const products = new Set(PRODUCTS.map((p) => p.code));
    const warehouses = new Set(WAREHOUSES.map((w) => w.code));
    for (const r of STOCK_POSITIONS) {
      expect(products.has(r.product), r.product).toBe(true);
      expect(warehouses.has(r.warehouse), r.warehouse).toBe(true);
    }
  });

  it("keeps every product's quantities equal to the Product master", () => {
    for (const p of PRODUCTS) {
      const t = productTotals(p.code);
      expect(t.onHand, `${p.code} on hand`).toBe(p.onHand ?? 0);
      expect(t.reserved, `${p.code} reserved`).toBe(p.reserved ?? 0);
      expect(t.onOrder, `${p.code} on order`).toBe(p.onOrder ?? 0);
    }
  });

  it("applies the availability formula on every row", () => {
    for (const r of STOCK_POSITIONS) {
      expect(r.available).toBe(r.onHand - r.reserved - r.qcHold - r.returnHold);
    }
  });

  it("leaves damaged, in-transit and on-order outside availability", () => {
    const withExtras = STOCK_POSITIONS.filter(
      (r) => r.damaged > 0 || r.inTransit > 0 || r.onOrder > 0,
    );
    expect(withExtras.length).toBeGreaterThan(0);
    for (const r of withExtras) {
      expect(r.available).toBe(r.onHand - r.reserved - r.qcHold - r.returnHold);
    }
  });

  it("derives status from the row, worst condition first", () => {
    const base = {
      available: 10,
      expDays: null,
      blocked: false,
      qcHold: 0,
      returnHold: 0,
      damaged: 0,
      reserved: 0,
    };
    expect(stockStatusOf({ ...base, available: -1 })).toBe("Negative");
    expect(stockStatusOf({ ...base, expDays: -5 })).toBe("Expired");
    expect(stockStatusOf({ ...base, blocked: true })).toBe("Blocked");
    expect(stockStatusOf({ ...base, qcHold: 5 })).toBe("QC Hold");
    expect(stockStatusOf({ ...base, returnHold: 5 })).toBe("Return Hold");
    expect(stockStatusOf({ ...base, damaged: 5 })).toBe("Damaged");
    expect(stockStatusOf({ ...base, expDays: 20 })).toBe("Near Expiry");
    expect(stockStatusOf({ ...base, available: 0, reserved: 5 })).toBe("Reserved");
    expect(stockStatusOf(base)).toBe("Available");
  });

  it("is deterministic — no Math.random in the generator", () => {
    const first = STOCK_POSITIONS.map((r) => `${r.code}:${r.available}`).join("|");
    const second = STOCK_POSITIONS.map((r) => `${r.code}:${r.available}`).join("|");
    expect(first).toBe(second);
    expect(STOCK_POSITIONS[0].code).toBe("STK-0001");
  });
});

describe("Stock Inquiry — page", () => {
  it("renders the title and subtitle", () => {
    renderList();
    expect(
      screen.getByRole("heading", { level: 1, name: "Stock Inquiry" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Real-time Inventory Visibility")).toBeInTheDocument();
  });

  it("offers Export, Print and Column Settings but no create action", () => {
    renderList();
    expect(screen.getByRole("button", { name: /Export Excel/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Columns/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeInTheDocument();
    /* An inquiry screen creates nothing. */
    expect(list.hideCreate).toBe(true);
  });

  it("renders all twelve KPI cards", () => {
    renderList();
    for (const label of [
      "Total Products",
      "Total Inventory Value",
      "Available Stock",
      "Reserved Stock",
      "QC Hold",
      "Return Hold",
      "Damaged Stock",
      "Near Expiry",
      "Expired",
      "Low Stock",
      "Negative Stock",
      "Today's Movement",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});

describe("Stock Inquiry — search", () => {
  /* Same field resolution the engine uses, so the test cannot drift from it. */
  const hay = (r: (typeof STOCK_POSITIONS)[number]) =>
    list.searchFields.map((f) => String(getPath(r, f) ?? "")).join(" ");

  it("covers every field the spec names", () => {
    for (const f of [
      "product",
      "barcode",
      "productName",
      "brand",
      "cat",
      "lot",
      "serial",
      "warehouse",
      "zone",
      "bin",
    ]) {
      expect(list.searchFields).toContain(f);
    }
  });

  it("matches a product code, a barcode, a lot and a bin", async () => {
    const user = userEvent.setup();
    renderList();
    const box = screen.getByPlaceholderText(list.searchPlaceholder!);
    const sample = STOCK_POSITIONS.find((r) => r.lot)!;

    for (const term of [sample.product, sample.barcode, sample.lot, sample.bin]) {
      await user.clear(box);
      await user.type(box, term);
      const expected = STOCK_POSITIONS.filter((r) =>
        hay(r).toLowerCase().includes(term.toLowerCase()),
      ).length;
      expect(expected, `${term} should match something`).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(`^${expected} positions$`))).toBeInTheDocument();
    }
    /* Four full type-and-assert rounds over 300 positions. The default five
       seconds is enough alone and not enough with the suite running beside
       it, which made this the one test that failed at random. */
  }, 20_000);

  it("shows the empty state when nothing matches", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), "zzz-no-such");
    expect(screen.getByText(list.emptyTitle!)).toBeInTheDocument();
  });
});

describe("Stock Inquiry — filters", () => {
  it("exposes every advanced filter the spec lists", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of [
      "warehouse",
      "cat",
      "brand",
      "status",
      "lot",
      "serial",
      "expiry",
      "zone",
      "bin",
      "availableOnly",
      "lowOnly",
      "nearExpiry",
      "expired",
      "negative",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("selects the right rows for each predicate", () => {
    const by = (id: string) => list.filters.find((f) => f.id === id)!;
    const rows = STOCK_POSITIONS;

    const wh = rows[0].whLabel;
    expect(rows.filter((r) => by("warehouse").test(r, wh)).every((r) => r.whLabel === wh)).toBe(
      true,
    );
    expect(
      rows.filter((r) => by("availableOnly").test(r, "Yes")).every((r) => r.available > 0),
    ).toBe(true);
    expect(
      rows.filter((r) => by("negative").test(r, "Yes")).every((r) => r.available < 0),
    ).toBe(true);
    expect(
      rows
        .filter((r) => by("expired").test(r, "Yes"))
        .every((r) => r.expDays !== null && r.expDays < 0),
    ).toBe(true);
    expect(
      rows
        .filter((r) => by("nearExpiry").test(r, "Yes"))
        .every((r) => r.expDays !== null && r.expDays >= 0 && r.expDays <= 90),
    ).toBe(true);
  });

  it("buckets expiry by 30, 60 and 90 days", () => {
    const f = list.filters.find((x) => x.id === "expiry")!;
    const in30 = STOCK_POSITIONS.filter((r) => f.test(r, "ภายใน 30 วัน"));
    const in90 = STOCK_POSITIONS.filter((r) => f.test(r, "ภายใน 90 วัน"));
    expect(in90.length).toBeGreaterThanOrEqual(in30.length);
    for (const r of in30) expect(r.expDays).toBeLessThanOrEqual(30);
  });

  it("narrows the table when a filter is applied", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /Filters/ }));

    const status = await screen.findByLabelText("Inventory Status");
    await user.selectOptions(status, "Negative");

    const expected = STOCK_POSITIONS.filter((r) => r.status === "Negative").length;
    expect(expected).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^${expected} positions$`))).toBeInTheDocument();
  });
});

describe("Stock Inquiry — table and columns", () => {
  it("declares every column the spec lists", () => {
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Product Code",
      "Product Name",
      "Category",
      "Warehouse",
      "Zone",
      "Rack",
      "Bin",
      "UOM",
      "On Hand",
      "Reserved",
      "Available",
      "QC Hold",
      "Return Hold",
      "Damaged",
      "In Transit",
      "On Order",
      "Back Order",
      "Reorder Point",
      "Safety Stock",
      "Lot Number",
      "Serial Number",
      "Expiry Date",
      "Inventory Status",
      "Updated Time",
    ]) {
      expect(labels, label).toContain(label);
    }
  });

  it("opens with a readable subset and keeps the identity column locked", () => {
    const visible = list.columns.filter((c) => !c.defaultHidden);
    expect(visible.length).toBeLessThan(list.columns.length);
    expect(list.columns.find((c) => c.key === "product")?.locked).toBe(true);
  });

  it("hides a column through Column Settings and keeps the locked one", async () => {
    const user = userEvent.setup();
    renderList();

    /* Scoped to the main grid — the summary panels carry their own tables. */
    const grid = () => screen.getAllByRole("table")[0];
    const heads = (name: string) =>
      within(grid()).queryAllByRole("columnheader", { name });

    expect(heads("Available")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Columns/ }));
    await user.click(screen.getByRole("checkbox", { name: "Available" }));

    expect(heads("Available")).toHaveLength(0);
    expect(heads("Product Code")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Product Code" })).toBeDisabled();
  });
});

describe("Stock Inquiry — quick drawer", () => {
  it("declares the tabs the spec asks for", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "warehouse",
      "lot",
      "serial",
      "reservations",
      "incoming",
      "movement",
    ]);
  });

  it("heads the drawer with product, warehouse, available and status", () => {
    const id = detail.identity(richRow);
    expect(id.code).toBe(richRow.product);
    expect(id.title).toBe(richRow.productName);
    expect(id.badges[0].text).toBe(richRow.status);
    expect(id.tags).toContain(richRow.whLabel);

    const kpis = detail.kpis(richRow);
    expect(kpis.map((k) => k.label)).toEqual([
      "Warehouse",
      "Available",
      "Reserved",
      "Incoming",
    ]);
  });

  /**
   * Was "opens when a row is clicked" and asserted a side drawer. The drawer
   * is gone — a row opens the record itself. It only ever held a summary, so
   * anyone who wanted the whole thing read it and clicked again.
   */
  it("opens the record when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), richRow.code);
    routerPush.mockClear();
    await user.click(screen.getAllByText(richRow.product)[0]);

    expect(routerPush).toHaveBeenCalledWith(
      `/m/stock-inquiry/${encodeURIComponent(richRow.code)}`,
    );
  });

  it("shows only the tracking tab the product actually uses", () => {
    const lotRow = STOCK_POSITIONS.find((r) => r.lot && !r.serial)!;
    const serialRow = STOCK_POSITIONS.find((r) => r.serial)!;
    const shown = (r: typeof lotRow) =>
      detail.tabs.filter((t) => !t.when || t.when(r)).map((t) => t.key);

    expect(shown(lotRow)).toContain("lot");
    expect(shown(lotRow)).not.toContain("serial");
    expect(shown(serialRow)).toContain("serial");
    expect(shown(serialRow)).not.toContain("lot");
  });
});

describe("Stock Inquiry — drilldowns", () => {
  it("breaks a product down by warehouse and sums back to its total", () => {
    const rows = productByWarehouse(richRow.product);
    expect(rows.length).toBeGreaterThan(1);

    const t = productTotals(richRow.product);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(t.onHand);
    expect(rows.reduce((s, r) => s + r.available, 0)).toBe(t.available);
    expect(rows.reduce((s, r) => s + r.reserved, 0)).toBe(t.reserved);
  });

  it("points every reservation at a sales order that exists", () => {
    const orders = new Set(getSchemas("sales-order")!.list.source().map((r) => r.code));
    expect(STOCK_RESERVATIONS.length).toBeGreaterThan(0);
    for (const r of STOCK_RESERVATIONS) expect(orders.has(r.soRef)).toBe(true);
  });

  it("points every documented incoming row at a purchase order that exists", () => {
    const orders = new Set(getSchemas("purchase-order")!.list.source().map((r) => r.code));
    const documented = STOCK_INCOMING.filter((r) => r.documented);
    expect(documented.length).toBeGreaterThan(0);
    for (const r of documented) expect(orders.has(r.poRef)).toBe(true);
    /* Undocumented rows must not pretend to have a reference. */
    for (const r of STOCK_INCOMING.filter((x) => !x.documented)) expect(r.poRef).toBe("");
  });

  it("lists lots with quantity, dates and status", () => {
    const lots = productLots(richRow.product);
    expect(lots.length).toBeGreaterThan(0);
    for (const l of lots) {
      expect(l.lot).toMatch(/^LOT-/);
      expect(l.mfg).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(l.exp).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
  });

  it("lists serials with location, status and current document", () => {
    const serialRow = STOCK_POSITIONS.find((r) => r.serial)!;
    const serials = productSerials(serialRow.product);
    expect(serials.length).toBeGreaterThan(0);
    for (const s of serials) {
      expect(s.serial).toMatch(/^SN-/);
      expect(s.location).toBeTruthy();
      /* Only a unit that left the shelf carries a document. */
      if (s.status === "In Stock") expect(s.doc).toBe("");
      else expect(s.doc).not.toBe("");
    }
  });

  it("caps recent movement at twenty and points each at a real module", () => {
    const rows = stockMovements(richRow.product, 20);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(20);
    for (const m of rows) expect(REGISTRY[m.entity]).toBeDefined();
  });

  it("routes a row action into the product master", async () => {
    const ctx = {
      goto: routerPush,
      openEntity: (entity: string, code?: string) =>
        routerPush(code ? `/m/${entity}/${code}` : `/m/${entity}`),
      toast: () => {},
      confirm: () => {},
      formModal: () => {},
      refresh: () => {},
      quickView: () => {},
    };
    const actions = list.rowActions(richRow, ctx as never);
    actions.find((a) => a.label === "เปิดข้อมูลสินค้า")!.run!(richRow);
    expect(routerPush).toHaveBeenCalledWith(`/m/product/${richRow.product}`);
  });
});

describe("Stock Inquiry — summary panels", () => {
  const ctx = {
    goto: () => {},
    openEntity: () => {},
    toast: () => {},
    confirm: () => {},
    formModal: () => {},
    refresh: () => {},
    quickView: () => {},
  } as never;

  it("renders the four widgets the spec asks for", () => {
    const blocks = list.panels!(STOCK_POSITIONS, ctx).filter(Boolean);
    const titles = blocks.map((b) => (b as { title?: string }).title ?? "");
    expect(titles[0]).toBe("Stock Summary");
    expect(titles[1]).toMatch(/^Low Stock/);
    expect(titles[2]).toMatch(/^Near Expiry/);
    expect(titles[3]).toMatch(/^Negative Inventory/);
  });

  it("summarises the rows it is given, not the whole table", () => {
    const subset = STOCK_POSITIONS.slice(0, 10);
    const block = list.panels!(subset, ctx)[0] as {
      items: { label: string; value: string }[];
    };
    const onHand = subset.reduce((t, r) => t + r.onHand, 0);
    expect(block.items.find((i) => i.label === "Total On Hand")!.value).toBe(
      onHand.toLocaleString("en-US"),
    );
  });

  it("renders the panels below the table", () => {
    renderList();
    expect(screen.getByText("Stock Summary")).toBeInTheDocument();
    expect(screen.getByText(/^Low Stock —/)).toBeInTheDocument();
    expect(screen.getByText(/^Near Expiry —/)).toBeInTheDocument();
    expect(screen.getByText(/^Negative Inventory/)).toBeInTheDocument();
  });

  it("keeps the summary consistent with the headline", () => {
    const s = stockSummary();
    expect(s.available).toBe(STOCK_POSITIONS.reduce((t, r) => t + r.available, 0));
    expect(s.products).toBe(new Set(STOCK_POSITIONS.map((r) => r.product)).size);
  });
});

describe("Stock Inquiry — navigation", () => {
  it("is registered in the entity registry", () => {
    expect(REGISTRY["stock-inquiry"]).toBeDefined();
    expect(getSchemas("stock-inquiry")!.list.key).toBe("stock-inquiry");
    /* Read-only: no form schema, so /new and /edit stay placeholders. */
    expect(getSchemas("stock-inquiry")!.form).toBeUndefined();
  });

  it("ซ่อนจากเมนู Inventory แต่โมดูลยังอยู่ครบ", () => {
    /* The Inventory group is hidden from the sidebar while the inbound and
       outbound flows are being walked — see lib/nav.ts. The module is
       untouched: its route resolves and its schema is registered. Restoring
       the group is what puts it back on the menu. */
    expect(NAV.some((g) => g.label === "Inventory")).toBe(false);
    expect(NAV.flatMap((g) => g.items).some((i) => i.label === "Stock Inquiry")).toBe(
      false,
    );
    /* Still registered, so the route still resolves for anyone who has the
       URL — hidden is not deleted. */
    expect(getSchemas("stock-inquiry")).toBeTruthy();
  });

  it("leaves the phases after Inventory as coming soon", () => {
    /* Inventory is complete; Finance and the rest are the next phase. */
    for (const label of ["Finance", "Service", "Reports"]) {
      const group = NAV.find((g) => g.label === label);
      expect(group, label).toBeDefined();
      expect(group!.items.every((i) => i.soon), label).toBe(true);
    }
  });
});

describe("Stock Inquiry — responsive", () => {
  it("scrolls the wide table rather than the page", () => {
    const { container } = renderList();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("only opens the columns that fit, leaving the rest behind settings", () => {
    const hidden = list.columns.filter((c) => c.defaultHidden);
    expect(hidden.length).toBeGreaterThanOrEqual(10);
    expect(productRows(richRow.product).length).toBeGreaterThan(0);
  });
});
