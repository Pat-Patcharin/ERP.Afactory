import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import DashboardPage from "@/app/(erp)/dashboard/page";
import {
  DASH_ACTIONS,
  DOC_TABS,
  TREND_RANGES,
  dashActivities,
  dashAlerts,
  dashFinanceOverview,
  dashInventoryMix,
  dashInventoryOverview,
  dashKpis,
  dashPendingTasks,
  dashPurchaseOverview,
  dashRecentDocuments,
  dashSalesOverview,
  dashSalesTrend,
  openTaskCount,
  pendingApprovalCount,
} from "@/lib/domain/dashboard";
import { invSnapshot } from "@/lib/domain/inventory";
import { ceYear } from "@/lib/format";
import { can, resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { SALES_REQUESTS, decorateOutbound } from "@/lib/domain/outbound";
import { NAV_INDEX } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { routerPush } from "./setup";

/** The four demo chairs, by the code the seed gives them. */
const REP = "EMP004";
const SALES_ADMIN = "EMP013";
const SALES_MANAGER = "EMP003";
const ADMIN = "EMP001";

/* ============================================================
   DASHBOARD regression suite.

   Figures are asserted against the domain read model rather than
   hard-coded numbers. The dashboard's whole contract is that it
   never disagrees with the module a tile links into — a literal
   expected value would pass while that contract broke.
   ============================================================ */

describe("Dashboard — page shell", () => {
  it("renders the page header with title and subtitle", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(
      screen.getByText("ภาพรวมธุรกิจและกิจกรรมที่สำคัญ — ERP Command Center"),
    ).toBeInTheDocument();
  });

  it("exposes the four header actions", () => {
    render(<DashboardPage />);
    const header = screen.getByTestId("ws-page-header");
    for (const label of ["Refresh", "Export", "Print", "More Actions"]) {
      expect(within(header).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders every section the spec names", () => {
    render(<DashboardPage />);
    const sections = [
      "Quick Actions",
      "My Pending Tasks",
      "Business Alerts",
      "Purchase Overview",
      "Sales Overview",
      "Inventory Overview",
      "Finance Overview",
      "ยอดขาย",
      "มูลค่าสินค้าคงคลัง",
      "กิจกรรมล่าสุด",
      "Recent Documents",
    ];
    for (const s of sections) {
      expect(screen.getByRole("heading", { name: s })).toBeInTheDocument();
    }
  });

  it("keeps the morning brief above the fold", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Good Morning, คุณพิมพกา.")).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });
});

/* ---------- Section 1 ---------- */

describe("Dashboard — global KPI", () => {
  it("renders the eight KPI cards the spec lists, in order", () => {
    render(<DashboardPage />);
    const grid = screen.getByTestId("dash-kpi-grid");
    const cards = within(grid).getAllByRole("button");
    expect(cards).toHaveLength(8);

    const expected = [
      "Sales Today",
      "Purchase Today",
      "Inventory Value",
      "Low Stock Items",
      "Pending Approvals",
      "Open Tasks",
      "Near Expiry",
      "Open Shipments",
    ];
    expected.forEach((title, i) => expect(cards[i]).toHaveTextContent(title));
  });

  it("gives every KPI an icon, a value, a comparison, a trend and a sparkline", () => {
    render(<DashboardPage />);
    const grid = screen.getByTestId("dash-kpi-grid");

    for (const k of dashKpis()) {
      expect(k.icon).not.toHaveLength(0);
      expect(k.value).not.toHaveLength(0);
      expect(k.compare).not.toHaveLength(0);
      expect(typeof k.delta).toBe("number");
      expect(k.points.length).toBeGreaterThan(0);
    }
    /* One sparkline per card — matched on the Sparkline's own 54px box, so
       an icon that happens to contain a polyline cannot inflate the count. */
    expect(grid.querySelectorAll('svg[width="54"] polyline')).toHaveLength(8);
  });

  it("labels the delta as a comparison against yesterday", () => {
    render(<DashboardPage />);
    const grid = screen.getByTestId("dash-kpi-grid");
    expect(within(grid).getAllByText("vs เมื่อวาน")).toHaveLength(8);
  });

  it("reports the same inventory value as the warehouse read model", () => {
    const snap = invSnapshot();
    const kpi = dashKpis().find((k) => k.key === "inventoryValue")!;
    expect(kpi.value).toBe(`฿${(snap.value / 1_000_000).toFixed(2)}M`);
  });

  it("reports low stock and near expiry straight from the stock position", () => {
    const snap = invSnapshot();
    const kpis = dashKpis();
    expect(kpis.find((k) => k.key === "lowStock")!.value).toBe(String(snap.belowRop));
    expect(kpis.find((k) => k.key === "nearExpiry")!.value).toBe(String(snap.lotsNearExpiry));
  });

  it("makes Pending Approvals the total of the pending task list", () => {
    const total = dashPendingTasks().reduce((t, r) => t + r.count, 0);
    expect(pendingApprovalCount()).toBe(total);
    expect(dashKpis().find((k) => k.key === "pendingApproval")!.value).toBe(String(total));
  });

  it("routes a KPI card into its module", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    const grid = screen.getByTestId("dash-kpi-grid");

    await user.click(within(grid).getByText("Open Shipments").closest("button")!);
    expect(routerPush).toHaveBeenCalledWith(pageHref("Shipment"));
  });
});

/* ---------- Section 2 ---------- */

describe("Dashboard — quick actions", () => {
  it("renders the eight create shortcuts the spec lists", () => {
    render(<DashboardPage />);
    const rail = screen.getByTestId("ws-quick-actions");
    expect(within(rail).getAllByRole("button")).toHaveLength(8);

    for (const label of [
      "Purchase Request",
      "Purchase Order",
      "Goods Receipt",
      "Sales Order",
      "Shipment",
      "Stock Transfer",
      "Cycle Count",
      "Supplier Invoice",
    ]) {
      expect(within(rail).getByText(label)).toBeInTheDocument();
    }
  });

  it("gives every shortcut a one-line description", () => {
    render(<DashboardPage />);
    const rail = screen.getByTestId("ws-quick-actions");
    for (const a of DASH_ACTIONS) {
      expect(a.desc).not.toHaveLength(0);
      expect(within(rail).getByText(a.desc)).toBeInTheDocument();
    }
  });

  it("navigates to the module when a shortcut is clicked", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    const rail = screen.getByTestId("ws-quick-actions");

    await user.click(within(rail).getByText("Goods Receipt").closest("button")!);
    expect(routerPush).toHaveBeenCalledWith(pageHref("Goods Receipt"));
  });

  it("routes the unbuilt Supplier Invoice to the named placeholder", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    const rail = screen.getByTestId("ws-quick-actions");

    await user.click(within(rail).getByText("Supplier Invoice").closest("button")!);
    expect(routerPush).toHaveBeenCalledWith("/soon?m=Supplier%20Invoice");
  });
});

/* ---------- Section 3 ---------- */

describe("Dashboard — my pending tasks", () => {
  it("renders every queue this account may act on", () => {
    /* The count is no longer fixed — the box is what THIS person owes, and
       the default demo account can reach everything. What is asserted is
       that nothing was lost when the sell side joined the list. */
    render(<DashboardPage />);
    const list = screen.getByTestId("dash-task-list");

    for (const title of [
      "Purchase Request รออนุมัติ",
      "Purchase Order รออนุมัติ",
      "QC รอตรวจสอบ",
      "Shipment รอจัดส่ง",
      "Cycle Count รอตรวจนับ",
      "Sales Return รออนุมัติ",
      "Credit Note รออนุมัติ",
      "Supplier Invoice รออนุมัติ",
      /* Section 4 of the spec — the sell side, which had no row at all. */
      "ใบเสนอราคารออนุมัติ",
      "ใบเสนอราคารอลูกค้าตอบ",
      "คำขอขายรออนุมัติ",
      "คู่ค้ารอยืนยัน",
      "ใบสั่งขายรอเปิดใบหยิบสินค้า",
      "ใบส่งของรอวางบิล",
    ]) {
      expect(within(list).getByText(title), title).toBeInTheDocument();
    }

    expect(within(list).getAllByRole("listitem").length).toBe(dashPendingTasks().length);
  });

  it("gives every row an icon, a count and a priority", () => {
    for (const t of dashPendingTasks()) {
      expect(t.icon).not.toHaveLength(0);
      expect(t.count).toBeGreaterThanOrEqual(0);
      expect(["Critical", "High", "Medium", "Low"]).toContain(t.priority);
    }
  });

  it("sorts the most urgent queue to the top", () => {
    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const ranks = dashPendingTasks().map((t) => rank[t.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("opens the module behind a task row", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    const list = screen.getByTestId("dash-task-list");

    /* The QC queue now opens the Goods Receipt, which is where the
       inspection is decided from — QC Inspection is hidden from the sidebar,
       and a row that led to a Coming Soon page would be a dead end carrying
       a real count. */
    await user.click(within(list).getByText("QC รอตรวจสอบ").closest("button")!);
    expect(routerPush).toHaveBeenCalledWith(pageHref("Goods Receipt"));
  });
});

/* ============================================================
   THE BOX IS WHAT YOU OWE, NOT WHAT THE COMPANY OWES

   Every row now carries the permission it needs, and the two
   priced-under-the-floor rows carry the level as well. What
   follows is mostly refusals, because a row appearing for
   somebody who cannot act on it is the failure mode: they open
   it, get turned away at the last click, and stop reading the
   box altogether.
   ============================================================ */

describe("Dashboard — the task box follows the chair", () => {
  const asAccount = (code: string) => setCurrentUser(code);
  const titles = () => dashPendingTasks().map((t) => t.title);

  afterEach(resetCurrentUser);

  it("keeps the purchase side out of the sales admin's box", () => {
    asAccount(SALES_ADMIN);
    const mine = titles();

    expect(mine).not.toContain("Purchase Request รออนุมัติ");
    expect(mine).not.toContain("Purchase Order รออนุมัติ");
    expect(mine).not.toContain("QC รอตรวจสอบ");
    /* And keeps the work that IS theirs. */
    expect(mine).toContain("คำขอขายรออนุมัติ");
    expect(mine).toContain("คู่ค้ารอยืนยัน");
  });

  it("never puts manager-only work in the sales admin's box", () => {
    /* The rule this whole step exists for. Being shown work and then refused
       at the approve button is worse than never having been shown it. */
    asAccount(SALES_ADMIN);
    expect(titles()).not.toContain("คำขอขายราคาต่ำกว่าขั้นต่ำ");
    expect(titles()).not.toContain("ใบเสนอราคาราคาต่ำกว่าขั้นต่ำ");

    asAccount(SALES_MANAGER);
    expect(titles()).toContain("คำขอขายราคาต่ำกว่าขั้นต่ำ");
    expect(titles()).toContain("ใบเสนอราคาราคาต่ำกว่าขั้นต่ำ");
  });

  it("does not count a manager-level request in the admin's ordinary queue", () => {
    /* Not just hidden as a row — the number on the row they DO see must not
       include work they cannot sign, or the box lies by arithmetic. */
    const submitted = SALES_REQUESTS.filter((r) => r.status === "Submitted");
    const victim = submitted[0];
    const wasLevel = victim.priceApprovalLevel;
    victim.priceApprovalLevel = "manager";
    decorateOutbound();

    try {
      asAccount(SALES_ADMIN);
      const adminRow = dashPendingTasks().find((t) => t.key === "srApproval")!;

      asAccount(SALES_MANAGER);
      const managerRow = dashPendingTasks().find((t) => t.key === "srApproval")!;

      expect(managerRow.count).toBe(submitted.length);
      expect(adminRow.count).toBe(submitted.length - 1);
    } finally {
      victim.priceApprovalLevel = wasLevel;
      decorateOutbound();
    }
  });

  it("gives the sales rep no approval queue at all", () => {
    asAccount(REP);
    const mine = titles();

    expect(mine).not.toContain("ใบเสนอราคารออนุมัติ");
    expect(mine).not.toContain("คำขอขายรออนุมัติ");
    expect(mine).not.toContain("คู่ค้ารอยืนยัน");
    /* What a rep does have is their own follow-up. */
    expect(mine).toContain("ใบเสนอราคารอลูกค้าตอบ");
  });

  it("asks the permission matrix, never the role code", () => {
    /* A row must be reachable exactly when `can()` says so — the same call
       the module's own buttons make. Checked across every account so a row
       wired to the wrong module or action shows up here. */
    for (const code of [REP, SALES_ADMIN, SALES_MANAGER, ADMIN]) {
      asAccount(code);
      for (const t of dashPendingTasks()) {
        expect(can(t.needs.module, t.needs.action), `${code} · ${t.title}`).toBe(true);
      }
    }
  });
});

/* ---------- Section 4 ---------- */

describe("Dashboard — business alerts", () => {
  it("renders the seven alerts the spec lists", () => {
    render(<DashboardPage />);
    const list = screen.getByTestId("dash-alert-list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);

    for (const title of [
      "สินค้าคงเหลือต่ำกว่าจุดสั่งซื้อ",
      "สินค้าใกล้หมดอายุ",
      "QC ไม่ผ่านการตรวจสอบ",
      "การจัดส่งล่าช้า",
      "ผลนับสต๊อกมีผลต่าง",
      "สต๊อกถูกกันไว้ (QC / Return Hold)",
      "ปรับปรุงยอดมูลค่าสูง",
    ]) {
      expect(within(list).getByText(title)).toBeInTheDocument();
    }
  });

  it("gives every alert a severity, a count and a way in", () => {
    for (const a of dashAlerts()) {
      expect(["Critical", "High", "Medium", "Low"]).toContain(a.severity);
      expect(a.count).toBeGreaterThanOrEqual(0);
      expect(a.unit).not.toHaveLength(0);
      expect(pageHref(a.goto).startsWith("/")).toBe(true);
    }
  });

  it("sorts critical alerts to the front", () => {
    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const ranks = dashAlerts().map((a) => rank[a.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("takes the low stock alert into Stock Inquiry", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    const list = screen.getByTestId("dash-alert-list");

    await user.click(within(list).getByText("สินค้าคงเหลือต่ำกว่าจุดสั่งซื้อ").closest("button")!);
    expect(routerPush).toHaveBeenCalledWith(pageHref("Stock Inquiry"));
  });
});

/* ---------- Sections 5–6 ---------- */

describe("Dashboard — purchase overview", () => {
  it("renders the four purchase documents with count, today and pending", () => {
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-purchase-rows");

    for (const col of ["Document", "Total", "Today", "Pending"]) {
      expect(within(card).getByText(col)).toBeInTheDocument();
    }
    for (const label of [
      "Purchase Request",
      "Purchase Order",
      "Goods Receipt",
      "QC Inspection",
    ]) {
      expect(within(card).getByText(label)).toBeInTheDocument();
    }
    /* Hidden from the sidebar, so nothing here may lead to it. */
    expect(within(card).queryByText("Supplier Claim")).toBeNull();
    /* Put Away left the inbound chain — receiving ends at the goods
       receipt, so there is no queue behind a row for it. */
    expect(within(card).queryByText("Put Away")).toBeNull();
    expect(within(card).getAllByRole("button")).toHaveLength(4);
  });

  it("counts no more pending than total on any row", () => {
    for (const r of dashPurchaseOverview()) {
      expect(r.pending).toBeLessThanOrEqual(r.total);
      expect(r.today).toBeLessThanOrEqual(r.total);
    }
  });

  it("shows a progress bar on every row", () => {
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-purchase-rows");
    expect(card.querySelectorAll(".rounded-pill.bg-neutral-soft")).toHaveLength(4);
  });
});

describe("Dashboard — sales overview", () => {
  it("renders the nine outbound documents the spec lists", () => {
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-sales-rows");

    for (const label of [
      "Quotation",
      "Sales Order",
      "Picking",
      "Packing",
      "Delivery Order",
      "Sales Invoice",
      "Shipment",
      "Sales Return",
      "Credit Note",
    ]) {
      expect(within(card).getByText(label)).toBeInTheDocument();
    }
    expect(within(card).getAllByRole("button")).toHaveLength(9);
  });

  it("counts no more pending than total on any row", () => {
    for (const r of dashSalesOverview()) {
      expect(r.pending).toBeLessThanOrEqual(r.total);
      expect(r.today).toBeLessThanOrEqual(r.total);
    }
  });
});

/* ---------- Section 7 ---------- */

describe("Dashboard — inventory overview", () => {
  it("renders the ten inventory figures the spec lists", () => {
    render(<DashboardPage />);
    const grid = screen.getByTestId("dash-inventory-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(10);

    for (const label of [
      "Inventory Value",
      "Available Qty",
      "Reserved Qty",
      "QC Hold",
      "Damaged",
      "Low Stock",
      "Near Expiry",
      "Cycle Count",
      "Stock Transfer",
      "Stock Adjustment",
    ]) {
      expect(within(grid).getByText(label)).toBeInTheDocument();
    }
  });

  it("agrees with the warehouse read model on available and reserved", () => {
    const snap = invSnapshot();
    const stats = dashInventoryOverview();
    expect(stats.find((s) => s.key === "available")!.value).toBe(
      snap.available.toLocaleString("en-US"),
    );
    expect(stats.find((s) => s.key === "reserved")!.value).toBe(
      snap.reserved.toLocaleString("en-US"),
    );
  });
});

/* ---------- Section 8 ---------- */

describe("Dashboard — finance placeholder", () => {
  it("labels the module as coming soon", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dash-finance")).toHaveTextContent(
      "Finance Module Coming Soon",
    );
  });

  it("renders the seven finance figures the spec lists", () => {
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-finance");

    for (const label of [
      "Accounts Receivable",
      "Accounts Payable",
      "Overdue AR",
      "Overdue AP",
      "Receive Payment",
      "Supplier Payment",
      "Cash Position",
    ]) {
      expect(within(card).getByText(label)).toBeInTheDocument();
    }
  });

  it("derives receivables from sales invoices and declares only the rest", () => {
    const stats = dashFinanceOverview();
    const live = stats.filter((s) => !s.declared).map((s) => s.key);
    expect(live).toEqual(["ar", "overdueAr"]);
    expect(stats.filter((s) => s.declared)).toHaveLength(5);
  });
});

/* ---------- Sections 9–10 ---------- */

describe("Dashboard — charts", () => {
  it("renders the sales trend as one bar per day", () => {
    render(<DashboardPage />);
    const chart = screen.getByTestId("dash-bar-chart");
    expect(within(chart).getAllByRole("button")).toHaveLength(30);
  });

  it("offers the 7 / 30 / 90 day windows and redraws on change", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    for (const r of TREND_RANGES) {
      expect(screen.getByRole("button", { name: `${r} วัน` })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "7 วัน" }));
    expect(within(screen.getByTestId("dash-bar-chart")).getAllByRole("button")).toHaveLength(7);

    await user.click(screen.getByRole("button", { name: "90 วัน" }));
    expect(within(screen.getByTestId("dash-bar-chart")).getAllByRole("button")).toHaveLength(90);
  });

  it("returns a labelled positive value for every trend point", () => {
    for (const range of TREND_RANGES) {
      const series = dashSalesTrend(range);
      expect(series).toHaveLength(range);
      for (const p of series) {
        expect(p.label).toMatch(/^\d{2}\/\d{2}$/);
        expect(p.value).toBeGreaterThan(0);
      }
    }
  });

  it("renders the inventory donut with a slice and a legend row per category", () => {
    render(<DashboardPage />);
    const chart = screen.getByTestId("dash-donut-chart");

    expect(chart.querySelectorAll("svg circle")).toHaveLength(6);
    expect(within(chart).getAllByRole("listitem")).toHaveLength(6);
    for (const label of [
      "Dental Equipment",
      "Consumables",
      "Materials",
      "Accessories",
      "Spare Parts",
      "Others",
    ]) {
      expect(within(chart).getByText(label)).toBeInTheDocument();
    }
  });

  it("totals the donut to the Inventory Value KPI", () => {
    const mix = dashInventoryMix();
    const total = mix.reduce((t, m) => t + m.value, 0);
    /* Per-slice rounding moves the sum by at most half a baht per slice. */
    expect(Math.abs(total - invSnapshot().value)).toBeLessThanOrEqual(mix.length);
    expect(mix.reduce((t, m) => t + m.share, 0)).toBeCloseTo(100, 5);
  });
});

/* ---------- Section 11 ---------- */

describe("Dashboard — recent activity", () => {
  it("renders eight timeline entries", () => {
    render(<DashboardPage />);
    const timeline = screen.getByTestId("ws-timeline");
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(8);
  });

  it("shows time, document, user and status on every entry", () => {
    const first = dashActivities(8)[0];
    render(<DashboardPage />);
    const row = within(screen.getByTestId("ws-timeline")).getAllByRole("listitem")[0];

    expect(row).toHaveTextContent(first.doc);
    expect(row).toHaveTextContent(first.status);
    expect(row).toHaveTextContent(first.time);
  });

  it("orders entries newest first and draws from more than one module", () => {
    const rows = dashActivities(8);
    expect(rows.map((r) => r.ts)).toEqual([...rows.map((r) => r.ts)].sort((a, b) => b - a));
    expect(new Set(rows.map((r) => r.kind)).size).toBeGreaterThan(1);
  });

  it("opens the document behind an entry", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    const timeline = screen.getByTestId("ws-timeline");

    await user.click(within(timeline).getAllByRole("listitem")[0].querySelector("button")!);
    expect(routerPush).toHaveBeenCalledWith(pageHref(dashActivities(8)[0].goto));
  });
});

/* ---------- Section 12 ---------- */

describe("Dashboard — recent documents", () => {
  it("renders the four tabs the spec lists", () => {
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-recent-docs");
    for (const t of DOC_TABS) {
      expect(within(card).getByRole("tab", { name: t })).toBeInTheDocument();
    }
  });

  it("renders every column the spec lists", () => {
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-recent-docs");
    for (const col of ["Document", "Business Partner", "Date", "Amount", "Status", "Open"]) {
      expect(within(card).getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
  });

  it("lists five documents per tab and switches on click", async () => {
    const user = userEvent.setup();
    const docs = dashRecentDocuments(5);
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-recent-docs");

    /* Purchase is the tab that opens. */
    expect(within(card).getAllByRole("row")).toHaveLength(6);
    expect(within(card).getByText(docs.Purchase[0].code)).toBeInTheDocument();

    await user.click(within(card).getByRole("tab", { name: "Sales" }));
    expect(within(card).getByText(docs.Sales[0].code)).toBeInTheDocument();
    expect(within(card).queryByText(docs.Purchase[0].code)).not.toBeInTheDocument();
  });

  it("fills every tab and orders each newest first", () => {
    const docs = dashRecentDocuments(5);
    for (const tab of DOC_TABS) {
      const rows = docs[tab];
      expect(rows.length, `${tab} rows`).toBeGreaterThan(0);
      expect(rows.map((r) => r.ts)).toEqual([...rows.map((r) => r.ts)].sort((a, b) => b - a));
      for (const r of rows) {
        expect(r.code).not.toHaveLength(0);
        expect(r.status).not.toHaveLength(0);
      }
    }
  });

  it("draws each tab from more than one module", () => {
    /* Modules date their documents in different eras, so a straight sort by
       recency hands a whole tab to whichever module runs latest. The tab
       exists to show the group, so every group must be represented. */
    const docs = dashRecentDocuments(5);
    for (const tab of DOC_TABS) {
      expect(new Set(docs[tab].map((r) => r.goto)).size, `${tab} modules`).toBeGreaterThan(1);
    }
  });

  it("orders each tab by the date column it displays", () => {
    /* The rows are sorted on the date the reader can see, not on a hidden
       audit stamp — otherwise the Date column reads out of order. */
    /* `ceYear`, not a hand-rolled era guess. D2 collapsed five copies of
       that heuristic into one helper; this one was in a test and got missed.
       A test carrying its own copy of a rule can agree with itself while
       disagreeing with the application. */
    const parse = (d: string) => {
      const [dd, mm, yy] = d.split("/").map(Number);
      return new Date(ceYear(yy), mm - 1, dd).getTime();
    };
    const docs = dashRecentDocuments(5);
    for (const tab of DOC_TABS) {
      const dates = docs[tab].map((r) => parse(r.date));
      expect(dates, `${tab} dates`).toEqual([...dates].sort((a, b) => b - a));
    }
  });

  it("opens a document from its Open button", async () => {
    const user = userEvent.setup();
    const first = dashRecentDocuments(5).Purchase[0];
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-recent-docs");

    await user.click(within(card).getByRole("button", { name: `Open ${first.code}` }));
    expect(routerPush).toHaveBeenCalledWith(pageHref(first.goto));
  });
});

/* ---------- Navigation ---------- */

describe("Dashboard — navigation", () => {
  it("resolves every destination the page links to", () => {
    const targets = [
      ...dashKpis().map((k) => k.goto),
      ...DASH_ACTIONS.map((a) => a.goto),
      ...dashPendingTasks().map((t) => t.goto),
      ...dashAlerts().map((a) => a.goto),
      ...dashPurchaseOverview().map((r) => r.goto),
      ...dashSalesOverview().map((r) => r.goto),
      ...dashInventoryOverview().map((r) => r.goto),
      ...dashActivities(8).map((a) => a.goto),
    ];

    for (const t of targets) {
      const href = pageHref(t);
      expect(href.startsWith("/")).toBe(true);
      /* A real route, or the placeholder that names the future module. */
      expect(
        href === `/soon?m=${encodeURIComponent(t)}` || !href.startsWith("/soon"),
        `${t} resolves`,
      ).toBe(true);
    }
  });

  it("registers every built destination in the sidebar", () => {
    /* Supplier Invoice has no module and no sidebar entry — it is expected
       to fall through to the named placeholder, so it is excluded here.

       The Inventory targets are excluded for a different reason: those
       screens are BUILT and hidden from the menu while the inbound and
       outbound flows are being walked. The dashboard still reports their
       figures — a QC hold and a low-stock count are true whether or not the
       screen behind them is on the menu — so clicking one lands on the named
       placeholder until the group is restored. */
    const registered = new Set(NAV_INDEX.map((n) => n.label));
    const extra = new Set([
      "Purchase Workspace",
      "Outbound Workspace",
      "Supplier Invoice",
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

    const targets = new Set([
      ...dashKpis().map((k) => k.goto),
      ...DASH_ACTIONS.map((a) => a.goto),
      ...dashPendingTasks().map((t) => t.goto),
      ...dashAlerts().map((a) => a.goto),
    ]);

    for (const t of targets) {
      if (extra.has(t)) continue;
      expect(registered, `${t} in sidebar`).toContain(t);
    }
  });

  it("keeps Dashboard the first sidebar entry and a real route", () => {
    const item = NAV_INDEX.find((n) => n.label === "Dashboard")!;
    expect(item.href).toBe("/dashboard");
    expect(item.soon).toBeUndefined();
    expect(NAV_INDEX[0].label).toBe("Dashboard");
  });
});

/* ---------- Responsive ---------- */

describe("Dashboard — responsive layout", () => {
  it("steps the KPI grid from four columns to two to one", () => {
    render(<DashboardPage />);
    const cls = screen.getByTestId("dash-kpi-grid").className;
    expect(cls).toContain("grid-cols-4");
    expect(cls).toContain("max-[1280px]:grid-cols-2");
    expect(cls).toContain("max-md:grid-cols-1");
  });

  it("collapses the action band from three columns to one", () => {
    render(<DashboardPage />);
    const cls = screen.getByTestId("dash-action-band").className;
    expect(cls).toContain("grid-cols-3");
    expect(cls).toContain("max-[1400px]:grid-cols-2");
    expect(cls).toContain("max-[900px]:grid-cols-1");
  });

  it("collapses the overview band from four columns to two to one", () => {
    render(<DashboardPage />);
    const cls = screen.getByTestId("dash-overview-band").className;
    expect(cls).toContain("grid-cols-4");
    expect(cls).toContain("max-[1400px]:grid-cols-2");
    expect(cls).toContain("max-[900px]:grid-cols-1");
  });

  it("collapses the chart band and stacks the quick action rail", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dash-chart-band").className).toContain(
      "max-[900px]:grid-cols-1",
    );
    expect(screen.getByTestId("ws-quick-actions").className).toContain(
      "max-md:grid-cols-2",
    );
  });

  it("keeps the document table scrollable and drops its date column on mobile", () => {
    render(<DashboardPage />);
    const card = screen.getByTestId("dash-recent-docs");
    expect(
      within(card).getByRole("columnheader", { name: "Date" }).className,
    ).toContain("max-md:hidden");
    expect(card.querySelector(".overflow-x-auto")).not.toBeNull();
  });
});

/* ---------- Read model invariants ---------- */

describe("Dashboard — read model", () => {
  it("counts open tasks as the sum of the work stages, never negative", () => {
    const open = openTaskCount();
    expect(open).toBeGreaterThanOrEqual(0);
    const sales = dashSalesOverview();
    const purchase = dashPurchaseOverview();
    expect(open).toBeLessThanOrEqual(
      [...sales, ...purchase].reduce((t, r) => t + r.total, 0),
    );
  });

  it("never reports a figure the modules cannot back", () => {
    for (const r of [...dashPurchaseOverview(), ...dashSalesOverview()]) {
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.pending).toBeGreaterThanOrEqual(0);
      expect(r.today).toBeGreaterThanOrEqual(0);
      expect(pageHref(r.goto).startsWith("/")).toBe(true);
    }
  });

  it("marks the queues that belong to unbuilt modules", () => {
    const future = dashPendingTasks().filter((t) => t.future).map((t) => t.key);
    /* Supplier Claim was one of these and is now hidden entirely — a queue
       for an unbuilt module is worth showing; one for a module that has been
       taken off the sidebar is not. */
    expect(future.sort()).toEqual(["supplierInvoice"]);
  });
});
