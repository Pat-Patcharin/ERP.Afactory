import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import InventoryWorkspacePage from "@/app/(erp)/inventory/page";
import {
  invActivities,
  invAlerts,
  invHealth,
  invKpis,
  invPipeline,
  invShortcuts,
  invSnapshot,
  invWarehouseOverview,
} from "@/lib/domain/inventory";
import { WAREHOUSES } from "@/lib/domain/warehouse";
import { NAV, NAV_INDEX } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { routerPush } from "./setup";

const fmt = (n: number) => n.toLocaleString("en-US");

/* ============================================================
   INVENTORY WORKSPACE regression suite.

   Values are asserted against the domain read model rather than
   hard-coded numbers: the point is that the page never disagrees
   with the documents it summarises, which is exactly what would
   break if a module changed underneath it.
   ============================================================ */

describe("Inventory Workspace — rendering", () => {
  it("renders the page header with title and subtitle", () => {
    render(<InventoryWorkspacePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Inventory Workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Warehouse Operations Command Center"),
    ).toBeInTheDocument();
  });

  it("exposes the four header actions", () => {
    render(<InventoryWorkspacePage />);
    /* Scoped: the morning brief carries its own Refresh icon button. */
    const header = screen.getByTestId("ws-page-header");
    for (const label of ["Refresh", "Export", "Print", "More Actions"]) {
      expect(within(header).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders every required section", () => {
    render(<InventoryWorkspacePage />);
    const sections = [
      "Inventory KPI",
      "Warehouse Operations Pipeline",
      "Quick Actions",
      "Warehouse Alerts",
      "Recent Inventory Activities",
      "Warehouse Overview",
      "Inventory Health",
      "Shortcut Panels",
    ];
    for (const s of sections) {
      expect(screen.getByRole("heading", { name: s })).toBeInTheDocument();
    }
  });
});

describe("Inventory Workspace — KPI cards", () => {
  it("renders all twelve KPIs named by the spec", () => {
    render(<InventoryWorkspacePage />);
    const grid = screen.getByTestId("ws-kpi-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(12);

    const required = [
      "Stock On Hand",
      "Available Stock",
      "Reserved Stock",
      "QC Hold",
      "Return Hold",
      "In Transit",
      "Low Stock Items",
      "Out of Stock Items",
      "Near Expiry",
      "Today's Movement",
      "Inventory Value",
      "Pending Stock Count",
    ];
    for (const title of required) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
  });

  it("shows stock figures that match the warehouse master", () => {
    const snap = invSnapshot();
    const active = WAREHOUSES.filter((w) => w.status === "Active");
    const masterOnHand = active.reduce((t, w) => t + w.inv.qty, 0);
    const masterAvailable = active.reduce((t, w) => t + w.inv.available, 0);

    expect(snap.onHand).toBe(masterOnHand);
    expect(snap.available).toBe(masterAvailable);

    render(<InventoryWorkspacePage />);
    const grid = screen.getByTestId("ws-kpi-grid");
    expect(within(grid).getByText(fmt(masterOnHand))).toBeInTheDocument();
    expect(within(grid).getByText(fmt(masterAvailable))).toBeInTheDocument();
  });

  it("gives every KPI a trend delta", () => {
    for (const k of invKpis()) {
      expect(k.points.length).toBeGreaterThan(0);
      expect(typeof k.delta).toBe("number");
    }
  });
});

describe("Inventory Workspace — operations pipeline", () => {
  it("renders the eight stages in the order the spec defines", () => {
    render(<InventoryWorkspacePage />);
    const pipeline = screen.getByTestId("inv-pipeline");
    const labels = within(pipeline)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");

    const expected = [
      "Goods Receipt",
      "Put Away",
      "Available Stock",
      "Reserved",
      "Picking",
      "Shipment",
      "Sales Return",
      "Adjustment",
    ];
    expect(labels).toHaveLength(8);
    expected.forEach((name, i) => expect(labels[i]).toContain(name));
  });

  it("gives every stage a pending quantity, a day count and a status badge", () => {
    for (const s of invPipeline()) {
      expect(s.pending).toBeGreaterThanOrEqual(0);
      expect(s.today).toBeGreaterThanOrEqual(0);
      expect(["Clear", "Normal", "Backlog"]).toContain(s.badge);
    }
  });

  it("reports Available Stock identical to the KPI figure", () => {
    const stage = invPipeline().find((s) => s.key === "available")!;
    expect(stage.pending).toBe(invSnapshot().available);
  });
});

describe("Inventory Workspace — quick actions", () => {
  it("renders the nine inventory shortcuts", () => {
    render(<InventoryWorkspacePage />);
    const rail = screen.getByTestId("ws-quick-actions");
    const buttons = within(rail).getAllByRole("button");
    expect(buttons).toHaveLength(9);

    for (const label of [
      "Stock Inquiry",
      "Stock Card",
      "Stock Transfer",
      "Stock Adjustment",
      "Cycle Count",
      "Lot Tracking",
      "Serial Tracking",
      "Barcode Lookup",
      "Inventory Reports",
    ]) {
      expect(within(rail).getByText(label)).toBeInTheDocument();
    }
  });
});

describe("Inventory Workspace — warehouse alerts", () => {
  it("renders the twelve alert cards the spec lists", () => {
    render(<InventoryWorkspacePage />);
    const grid = screen.getByTestId("ws-alert-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(12);

    for (const title of [
      "Low Stock",
      "Negative Stock",
      "QC Hold Waiting",
      "Return Waiting QC",
      "Pending Transfer",
      "Pending Adjustment",
      "Pending Cycle Count",
      "Near Expiry",
      "Expired Products",
      "Missing Serial",
      "Missing Lot",
      "Damaged Stock",
    ]) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
  });

  it("gives every alert a count, priority, warehouse and action", () => {
    for (const a of invAlerts()) {
      expect(a.count).toBeGreaterThanOrEqual(0);
      expect(["Critical", "High", "Medium", "Low"]).toContain(a.priority);
      expect(a.warehouse).not.toHaveLength(0);
      expect(a.action).not.toHaveLength(0);
    }
  });

  it("sorts critical alerts to the front", () => {
    const priorities = invAlerts().map((a) => a.priority);
    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const ranks = priorities.map((p) => rank[p]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("Inventory Workspace — recent activities", () => {
  it("renders twenty timeline entries", () => {
    render(<InventoryWorkspacePage />);
    const timeline = screen.getByTestId("ws-timeline");
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(20);
  });

  it("covers every module that moves stock, not just the busiest", () => {
    const kinds = new Set(invActivities(20).map((a) => a.kind));
    for (const kind of [
      "Goods Receipt",
      "QC Inspection",
      "Put Away",
      "Picking",
      "Packing",
      "Shipment",
      "Sales Return",
    ]) {
      expect(kinds).toContain(kind);
    }
  });

  it("shows time, document, warehouse, user and status per entry", () => {
    const first = invActivities(20)[0];
    render(<InventoryWorkspacePage />);
    const timeline = screen.getByTestId("ws-timeline");
    const row = within(timeline).getAllByRole("listitem")[0];
    expect(row).toHaveTextContent(first.doc);
    expect(row).toHaveTextContent(first.status);
    expect(row).toHaveTextContent(first.time);
  });

  it("orders entries newest first", () => {
    const ts = invActivities(20).map((a) => a.ts);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
  });
});

describe("Inventory Workspace — warehouse overview", () => {
  it("renders every column the spec lists", () => {
    render(<InventoryWorkspacePage />);
    const table = screen.getByTestId("inv-warehouse-table");
    for (const col of [
      "Warehouse",
      "Available",
      "Reserved",
      "QC Hold",
      "Return Hold",
      "Transit",
      "Total Stock",
      "Inventory Value",
      "Pending Count",
      "Utilization",
    ]) {
      expect(within(table).getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
  });

  it("lists only active warehouses", () => {
    render(<InventoryWorkspacePage />);
    const table = screen.getByTestId("inv-warehouse-table");
    const active = WAREHOUSES.filter((w) => w.status === "Active");

    expect(within(table).getAllByRole("row")).toHaveLength(active.length + 1);
    expect(within(table).queryByText(/WH-OLD/)).not.toBeInTheDocument();
  });

  it("totals to the same inventory value as the KPI", () => {
    const rows = invWarehouseOverview();
    const total = rows.reduce((t, r) => t + r.value, 0);
    expect(total).toBe(invSnapshot().value);
  });
});

describe("Inventory Workspace — health and shortcuts", () => {
  it("renders eight health gauges", () => {
    render(<InventoryWorkspacePage />);
    const grid = screen.getByTestId("ws-gauge-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(8);

    for (const title of [
      "Stock Accuracy",
      "Inventory Turnover",
      "Average Days in Stock",
      "Expired Products",
      "Near Expiry",
      "Negative Inventory",
      "Slow Moving",
      "Fast Moving",
    ]) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
  });

  it("keeps every gauge inside 0-100", () => {
    for (const g of invHealth()) {
      expect(g.pct).toBeGreaterThanOrEqual(0);
      expect(g.pct).toBeLessThanOrEqual(100);
    }
  });

  it("renders the seven shortcut panels", () => {
    render(<InventoryWorkspacePage />);
    const grid = screen.getByTestId("ws-shortcut-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(7);

    for (const title of [
      "Pending Transfers",
      "Pending Adjustments",
      "Pending Counts",
      "Pending QC",
      "Pending Returns",
      "Pending Supplier Claims",
      "Pending Put Away",
    ]) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
  });
});

describe("Inventory Workspace — navigation", () => {
  it("resolves every destination the page links to", () => {
    const targets = [
      ...invKpis().map((k) => k.goto),
      ...invPipeline().map((s) => s.goto),
      ...invAlerts().map((a) => a.goto),
      ...invShortcuts().map((s) => s.goto),
      ...invHealth().map((h) => h.goto),
      ...invActivities(20).map((a) => a.goto),
    ];

    for (const t of targets) {
      const href = pageHref(t);
      expect(href.startsWith("/")).toBe(true);
      /* Either a real route, or the placeholder naming the future module. */
      expect(href === `/soon?m=${encodeURIComponent(t)}` || !href.startsWith("/soon")).toBe(
        true,
      );
    }
  });

  it("registers every workspace destination in the sidebar", () => {
    /* pageHref falls back to /soon for anything unknown, so an unregistered
       target still routes — it just becomes unreachable from the sidebar. */
    const targets = new Set([
      ...invKpis().map((k) => k.goto),
      ...invPipeline().map((s) => s.goto),
      ...invAlerts().map((a) => a.goto),
      ...invShortcuts().map((s) => s.goto),
      ...invHealth().map((h) => h.goto),
    ]);
    const registered = new Set(NAV_INDEX.map((n) => n.label));
    for (const t of targets) expect(registered, `${t} in sidebar`).toContain(t);
  });

  it("routes a KPI card into its module", async () => {
    const user = userEvent.setup();
    render(<InventoryWorkspacePage />);
    const grid = screen.getByTestId("ws-kpi-grid");

    await user.click(within(grid).getByText("QC Hold").closest("button")!);
    expect(routerPush).toHaveBeenCalledWith(pageHref("QC Inspection"));
  });

  it("routes a warehouse row into the warehouse master", async () => {
    const user = userEvent.setup();
    render(<InventoryWorkspacePage />);
    const table = screen.getByTestId("inv-warehouse-table");

    await user.click(within(table).getAllByRole("row")[1]);
    expect(routerPush).toHaveBeenCalledWith("/m/warehouse");
  });

  it("registers the Inventory group with the workspace built and the rest coming soon", () => {
    const group = NAV.find((g) => g.label === "Inventory");
    expect(group).toBeDefined();

    const labels = group!.items.map((i) => i.label);
    expect(labels).toEqual([
      "Inventory Workspace",
      "Stock Inquiry",
      "Stock Card",
      "Stock Transfer",
      "Stock Adjustment",
      "Cycle Count",
      "Lot Tracking",
      "Serial Tracking",
      "Barcode Lookup",
    ]);

    /* Built so far: the workspace, Stock Inquiry, then Stock Card. */
    const built: [string, string][] = [
      ["Inventory Workspace", "/inventory"],
      ["Stock Inquiry", "/m/stock-inquiry"],
      ["Stock Card", "/m/stock-card"],
    ];
    built.forEach(([label, href], i) => {
      expect(group!.items[i].label).toBe(label);
      expect(group!.items[i].href).toBe(href);
      expect(group!.items[i].soon).toBeUndefined();
    });

    /* Transfer, Adjustment, Count and tracking stay unbuilt. */
    for (const item of group!.items.slice(built.length)) expect(item.soon).toBe(true);
  });

  it("keeps Finance, Service, Reports and Settings as coming soon", () => {
    for (const label of ["Finance", "Service", "Reports", "Settings"]) {
      const group = NAV.find((g) => g.label === label);
      expect(group, `${label} group`).toBeDefined();
      expect(group!.items.length).toBeGreaterThan(0);
      for (const item of group!.items) expect(item.soon).toBe(true);
    }
  });
});

describe("Inventory Workspace — responsive layout", () => {
  it("stacks the KPI grid down to a single column", () => {
    render(<InventoryWorkspacePage />);
    const cls = screen.getByTestId("ws-kpi-grid").className;
    expect(cls).toContain("grid-cols-6");
    expect(cls).toContain("max-[1100px]:grid-cols-3");
    expect(cls).toContain("max-md:grid-cols-1");
  });

  it("keeps the pipeline scrollable rather than wrapping", () => {
    render(<InventoryWorkspacePage />);
    expect(screen.getByTestId("inv-pipeline").className).toContain("overflow-x-auto");
  });

  it("collapses the secondary warehouse columns on mobile", () => {
    render(<InventoryWorkspacePage />);
    const table = screen.getByTestId("inv-warehouse-table");
    for (const col of ["QC Hold", "Return Hold", "Transit", "Pending Count"]) {
      expect(
        within(table).getByRole("columnheader", { name: col }).className,
      ).toContain("max-md:hidden");
    }
    expect(table.className).toContain("overflow-x-auto");
  });

  it("stacks alert, gauge and shortcut grids on mobile", () => {
    render(<InventoryWorkspacePage />);
    for (const id of ["ws-alert-grid", "ws-gauge-grid", "ws-shortcut-grid"]) {
      expect(screen.getByTestId(id).className).toContain("max-md:grid-cols-1");
    }
  });
});

describe("Navigation regression — every module still resolves", () => {
  it("points built modules at a real route and unbuilt ones at /soon", () => {
    for (const item of NAV_INDEX) {
      if (item.soon) {
        expect(item.href.startsWith("/soon?m=")).toBe(true);
        expect(pageHref(item.label)).toBe(`/soon?m=${encodeURIComponent(item.label)}`);
      } else {
        expect(item.href.startsWith("/soon")).toBe(false);
        expect(pageHref(item.label)).toBe(item.href);
      }
    }
  });

  it("keeps the Phase 1 module routes untouched", () => {
    const phase1: [string, string][] = [
      ["Product", "/m/product"],
      ["Business Partner", "/m/business-partner"],
      ["Warehouse", "/m/warehouse"],
      ["Purchase Workspace", "/purchase"],
      ["Purchase Order", "/m/purchase-order"],
      ["Goods Receipt", "/m/goods-receipt"],
      ["QC Inspection", "/m/qc-inspection"],
      ["Put Away", "/m/put-away"],
      ["Outbound Workspace", "/outbound"],
      ["Sales Order", "/m/sales-order"],
      ["Picking", "/m/picking"],
      ["Packing", "/m/packing"],
      ["Sales Invoice", "/m/sales-invoice"],
      ["Shipment", "/m/shipment"],
      ["Sales Return", "/m/sales-return"],
      ["Credit Note", "/m/credit-note"],
    ];
    for (const [label, href] of phase1) expect(pageHref(label)).toBe(href);
  });
});
