import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { FullDetail } from "@/components/engine/FullDetail";
import { bpSchemas } from "@/schemas/business-partner";
import { getBP } from "@/lib/domain/partner";
import {
  bpRecentBilling,
  bpSalesOrders,
  bpTopCategories,
} from "@/lib/domain/partner-analytics";
import { getProduct } from "@/lib/domain/product";
import { resetCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   THE HEADER ANSWERS THE QUESTION THE RECORD IS OPENED FOR

   A date labelled "Last Transaction" said when something last
   happened and nothing about what it was, whether it was paid,
   or where it went. These cover the three facts that replaced
   it, and the ranking underneath.
   ============================================================ */

const detail = bpSchemas.detail;
const bp = (code: string) => getBP(code)!;

const BOTH = "BP000123";
const SUPPLIER = "BP000121";

beforeEach(() => {
  resetCurrentUser();
});

describe("BP header — 3 ใบแจ้งหนี้ล่าสุด แทน Last Transaction", () => {
  it("ไม่มีช่อง Last Transaction บนแถบ KPI แล้ว", () => {
    for (const code of [BOTH, SUPPLIER]) {
      const labels = detail.kpis(bp(code)).map((k) => k.label);
      expect(labels, code).not.toContain("Last Transaction");
      expect(labels.length, code).toBe(3);
    }
  });

  it("ลูกค้ามีแผงใบแจ้งหนี้ ผู้ขายอย่างเดียวไม่มี", () => {
    /* A supplier is never invoiced by us, so the panel would be three empty
       rows rather than an answer. */
    expect(detail.heroPanel!(bp(BOTH), {} as never, () => {})).not.toBeNull();
    expect(detail.heroPanel!(bp(SUPPLIER), {} as never, () => {})).toBeNull();
  });

  it("แสดงเลขที่ ยอด สถานะการชำระ และเลขพัสดุ", () => {
    render(<FullDetail schema={detail} record={bp(BOTH)} />);

    const panel = within(screen.getByTestId("bp-recent-invoices"));
    const rows = bpRecentBilling(bp(BOTH), 3);
    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      expect(panel.getByText(r.no)).toBeInTheDocument();
      expect(panel.getAllByText(r.payment).length).toBeGreaterThan(0);
    }

    /* At least one of them reaches a real parcel — through the delivery
       order, which is the only sell-side join that carries the BP code. */
    const parcels = rows.filter((r) => r.parcel);
    expect(parcels.length).toBeGreaterThan(0);
    expect(panel.getByText(parcels[0]!.parcel!.trackingNo)).toBeInTheDocument();
  });

  it("ไม่เดาเลขพัสดุให้ใบที่ไม่ได้ผูกการจัดส่ง", () => {
    /* The recorded rows carry no shipment reference and never will. A
       tracking number borrowed from another invoice of the same customer
       sends somebody to look up a parcel that is not theirs. */
    const recorded = new Set((bp(BOTH).txn?.inv ?? []).map((r) => r.no));
    for (const r of bpRecentBilling(bp(BOTH), 3)) {
      if (recorded.has(r.no)) expect(r.parcel, r.no).toBeNull();
    }

    render(<FullDetail schema={detail} record={bp(BOTH)} />);
    expect(
      within(screen.getByTestId("bp-recent-invoices")).getAllByText("ยังไม่ผูกการจัดส่ง").length,
    ).toBeGreaterThan(0);
  });

  it("ไม่แสดงใบเดียวกันสองครั้ง และเรียงใบใหม่สุดขึ้นก่อน", () => {
    const rows = bpRecentBilling(bp(BOTH), 3);
    expect(new Set(rows.map((r) => r.no)).size).toBe(rows.length);

    const ts = (v: string) => {
      const [d, m, y] = v.split("/").map(Number);
      return new Date(y, m - 1, d).getTime();
    };
    for (let i = 1; i < rows.length; i++) {
      expect(ts(rows[i - 1].date)).toBeGreaterThanOrEqual(ts(rows[i].date));
    }
  });

  it("แผงกินครึ่งแถบ ทำให้การ์ดเครดิตเล็กลง", () => {
    render(<FullDetail schema={detail} record={bp(BOTH)} />);
    /* Three across instead of four, and no icon plate — the room went to the
       panel beside them. */
    const tiles = screen.getByTestId("detail-kpis");
    expect(tiles.className).toContain("grid-cols-3");
    expect(tiles.className).not.toContain("grid-cols-4");
  });
});

describe("BP — Top 5 หมวดหมู่ที่ซื้อ", () => {
  it("รวมยอดตามหมวดหมู่ของสินค้าในใบสั่งขาย", () => {
    const b = bp(BOTH);
    const { rows, total, unmatched } = bpTopCategories(b, "amount", 5);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);

    /* Every line lands in exactly one place — a named category or the
       unmatched figure — so the two together are what the customer spent. */
    const lines = bpSalesOrders(b).flatMap((so) => so.items ?? []);
    const spent = lines.reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
    expect(total.lines).toBe(lines.length);
    expect(total.amount).toBeCloseTo(spent, 6);

    const all = bpTopCategories(b, "amount", 999);
    expect(all.rows.reduce((t, r) => t + r.amount, 0) + unmatched.amount).toBeCloseTo(spent, 6);
    expect(all.rows.reduce((t, r) => t + r.lines, 0) + unmatched.lines).toBe(lines.length);
  });

  it("สินค้าที่ไม่มีในทะเบียนสินค้าไม่ถูกจัดอันดับ แต่ถูกบอกเป็นตัวเลข", () => {
    /* On this customer they are 34 of 41 lines. Bucketed as a category they
       would rank first and answer nothing; dropped silently they would leave
       a Top 5 that reads as the whole picture. Neither. */
    const b = bp("BP000120");
    const orphans = bpSalesOrders(b)
      .flatMap((so) => so.items ?? [])
      .filter((i) => !getProduct(i.code));

    const { rows, unmatched } = bpTopCategories(b, "amount", 999);
    expect(unmatched.lines).toBe(orphans.length);
    expect(rows.map((r) => r.cat)).not.toContain("ไม่ระบุหมวดหมู่");
    for (const r of rows) expect(r.cat).toBeTruthy();
  });

  it("บอกจำนวนที่ตกอันดับไว้ใต้กราฟ", async () => {
    const user = userEvent.setup();
    render(<FullDetail schema={detail} record={bp("BP000120")} />);
    await user.click(screen.getByRole("tab", { name: "Customer Purchase History" }));

    const { unmatched } = bpTopCategories(bp("BP000120"), "amount", 5);
    expect(unmatched.lines).toBeGreaterThan(0);
    expect(
      within(screen.getByTestId("bp-top-categories")).getByText(/ยังไม่ผูกกับทะเบียนสินค้า/),
    ).toBeInTheDocument();
  });

  it("เรียงลำดับตามเกณฑ์ที่เลือก", () => {
    const b = bp("BP000120");
    const byAmount = bpTopCategories(b, "amount", 5).rows;
    const byLines = bpTopCategories(b, "lines", 5).rows;

    for (let i = 1; i < byAmount.length; i++) {
      expect(byAmount[i - 1].amount).toBeGreaterThanOrEqual(byAmount[i].amount);
    }
    for (let i = 1; i < byLines.length; i++) {
      expect(byLines[i - 1].lines).toBeGreaterThanOrEqual(byLines[i].lines);
    }
  });

  it("กดสลับเกณฑ์แล้วอันดับเปลี่ยนตาม", async () => {
    const user = userEvent.setup();
    render(<FullDetail schema={detail} record={bp("BP000120")} />);

    await user.click(screen.getByRole("tab", { name: "Customer Purchase History" }));
    const panel = within(screen.getByTestId("bp-top-categories"));

    const byAmount = bpTopCategories(bp("BP000120"), "amount", 5).rows;
    expect(panel.getByText(byAmount[0].cat)).toBeInTheDocument();

    const toggle = panel.getByRole("button", { name: "ตามจำนวนครั้ง" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    const byLines = bpTopCategories(bp("BP000120"), "lines", 5).rows;
    expect(panel.getByText(byLines[0].cat)).toBeInTheDocument();

    /* Both figures stay on every row — only which one leads changes. That is
       what makes the re-sort followable instead of a list that reshuffles for
       no visible reason, and it is checked here rather than the order, which
       on this customer happens to be the same either way. */
    expect(panel.getByText(`${byLines[0].lines.toLocaleString("en-US")} ครั้ง`)).toBeInTheDocument();
    expect(panel.getByText(`${byLines[0].amount.toLocaleString("en-US")} THB`)).toBeInTheDocument();
  });
});
