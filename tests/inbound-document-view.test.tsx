import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PURCHASE_ORDERS as RAW_PO } from "@/data/purchase-orders";
import { GOODS_RECEIPTS as RAW_GR } from "@/data/goods-receipts";
import { PURCHASE_ORDERS, decoratePOs, type PoRow } from "@/lib/domain/purchase";
import { GOODS_RECEIPTS, decorateGRs, type GrRow } from "@/lib/domain/inbound";
import { PurchaseOrderDocument } from "@/components/purchase-order/PurchaseOrderDocument";
import { GoodsReceiptDocument } from "@/components/goods-receipt/GoodsReceiptDocument";
import { poSchemas } from "@/schemas/purchase-order";
import { grSchemas } from "@/schemas/goods-receipt";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { fmt } from "@/lib/format";
import { buildPrintJob, getPrintConfig } from "@/lib/print";

/* ============================================================
   READING THE BUY-SIDE DOCUMENTS

   The purchase request became a document first. The order and
   the receipt stayed as tabbed profiles behind it, so the two
   halves of one chain read as two different products — and the
   person checking what arrived against what was ordered had to
   click through tabs on both.

   Teal, like every other sheet on this side of the business.
   ============================================================ */

const SNAP = { po: JSON.stringify(RAW_PO), gr: JSON.stringify(RAW_GR) };

const ADMIN = "EMP001"; // Super Admin
const NOEY = "EMP020"; // Sales Representative — no business with buying

beforeEach(() => {
  PURCHASE_ORDERS.length = 0;
  PURCHASE_ORDERS.push(...(JSON.parse(SNAP.po) as PoRow[]));
  GOODS_RECEIPTS.length = 0;
  GOODS_RECEIPTS.push(...(JSON.parse(SNAP.gr) as GrRow[]));
  decoratePOs();
  decorateGRs();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

const po = (status: string) =>
  PURCHASE_ORDERS.find((p) => p.status === status) ?? PURCHASE_ORDERS[0];
const gr = (status: string) =>
  GOODS_RECEIPTS.find((g) => g.status === status) ?? GOODS_RECEIPTS[0];

describe("เอกสารฝั่งซื้อ เปิดดูเป็นใบเอกสาร", () => {
  const cases = [
    {
      name: "ใบสั่งซื้อ",
      testId: "purchase-order-document",
      title: "PURCHASE ORDER",
      bar: "po-decision-bar",
      render: () => render(<PurchaseOrderDocument record={po("Open")} />),
    },
    {
      name: "ใบรับสินค้า",
      testId: "goods-receipt-document",
      title: "GOODS RECEIPT",
      bar: "gr-decision-bar",
      render: () => render(<GoodsReceiptDocument record={gr("Completed")} />),
    },
  ];

  for (const c of cases) {
    it(`${c.name} — เป็นกระดาษ ไม่ใช่การ์ดสรุปเป็นแท็บ`, () => {
      c.render();
      expect(screen.getByTestId(c.testId)).toBeInTheDocument();
      expect(screen.getByText(c.title)).toBeInTheDocument();
      expect(screen.queryByRole("tab")).toBeNull();
    });

    it(`${c.name} — มีแถบตัดสินใจ ประวัติ และห้องแชทใต้กระดาษ`, () => {
      setCurrentUser(ADMIN);
      c.render();
      expect(screen.getByTestId(c.bar)).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
      expect(screen.getByTestId("doc-comments")).toBeInTheDocument();
    });

    it(`${c.name} — ใช้สีของฝั่งซื้อ`, () => {
      /* Teal rather than the sell side's orange, through data-doc-family —
         so the accent follows the family and nothing names a colour. */
      const { container } = c.render();
      expect(container.querySelector('[data-doc-family="inbound"]')).toBeTruthy();
    });
  }

  it("ทั้งสองใบเลือก document ก่อน detail", () => {
    for (const s of [poSchemas, grSchemas]) {
      expect(s.document).toBeTruthy();
      expect(s.detail).toBeTruthy();
    }
  });
});

describe("ใบสั่งซื้อ", () => {
  it("บอกประวัติผู้ขายบนกระดาษ", () => {
    /* "Should we be ordering this from them" is answered by their record,
       not by this order's figures. */
    render(<PurchaseOrderDocument record={po("Open")} />);
    const paper = screen.getByTestId("purchase-order-document");
    expect(within(paper).getByText("เวลานำเฉลี่ย")).toBeInTheDocument();
    expect(within(paper).getByText("ส่งตรงเวลา")).toBeInTheDocument();
  });

  it("ทุกบรรทัดบอกว่าค้างรับเท่าไร", () => {
    const rec = po("Open");
    render(<PurchaseOrderDocument record={rec} />);

    const line = rec.items.find((l) => Number(l.qty) > Number(l.recv));
    if (!line) return;
    const row = within(screen.getAllByRole("table")[0]).getByText(line.code).closest("tr")!;
    const outstanding = fmt(Number(line.qty) - Number(line.recv));
    expect(within(row).getAllByText(outstanding).length).toBeGreaterThan(0);
  });

  it("ประวัติคือใบรับของที่ออกจากใบนี้", () => {
    /* A purchase order keeps no activity log of its own. */
    const rec = PURCHASE_ORDERS.find((p) => (p.receipts ?? []).length > 0);
    if (!rec) return;
    render(<PurchaseOrderDocument record={rec} />);
    const history = screen.getByText("History").closest("section")!;
    expect(within(history).getByText(new RegExp(rec.receipts[0].grn))).toBeInTheDocument();
  });

  it("บัญชีที่ไม่เกี่ยวกับการซื้อ ไม่เห็นปุ่มตัดสินใจ", () => {
    setCurrentUser(NOEY);
    render(<PurchaseOrderDocument record={po("Draft")} />);
    const bar = screen.getByTestId("po-decision-bar");
    expect(within(bar).queryByRole("button", { name: /ส่งให้ผู้ขาย/ })).toBeNull();
    expect(within(bar).getByText(/ไม่มีสิ่งที่คุณต้องทำ/)).toBeInTheDocument();
  });
});

describe("ใบรับสินค้า", () => {
  it("แยกสามจำนวน: สั่ง รับครั้งนี้ และรับไว้", () => {
    render(<GoodsReceiptDocument record={gr("Completed")} />);
    const head = screen.getAllByRole("table")[0].querySelector("thead")!;
    for (const th of ["สั่ง", "รับครั้งนี้", "รับไว้", "ต่างจากที่สั่ง"]) {
      expect(within(head).getByText(th), th).toBeInTheDocument();
    }
  });

  it("ใบที่รอ QC บอกว่าของยังใช้ไม่ได้", () => {
    const rec = gr("Pending QC");
    if (rec.status !== "Pending QC") return;
    render(<GoodsReceiptDocument record={rec} />);
    expect(screen.getByText("รอตรวจคุณภาพ")).toBeInTheDocument();
  });

  it("ลายเซ็นผู้ตรวจว่างจนกว่าจะตรวจผ่านจริง", () => {
    const rec = gr("Pending QC");
    rec.qcStatus = "Pending";
    render(<GoodsReceiptDocument record={rec} />);

    /* An inspector's name on a receipt nobody inspected is the signature
       that matters most and the one easiest to fake by accident. */
    const block = screen.getByText(/Inspected By/).closest("div")!;
    expect(within(block).getByText(/Date ____/)).toBeInTheDocument();
  });
});

/* ============================================================
   PREVIEW ON EVERY DOCUMENT-ENTRY PAGE

   The shell offers Print Preview on all four document editors,
   and the goods receipt passed no job — so the menu item existed,
   the overlay opened, and nothing was inside it. A dead control
   is worse than an absent one: it teaches people the feature is
   broken rather than missing.
   ============================================================ */

describe("ใบรับสินค้า — พรีวิวก่อนพิมพ์", () => {
  it("มีฟอร์มพิมพ์ของตัวเองใน print config", () => {
    const form = getPrintConfig("goods-receipt")!;
    expect(form, "ไม่มีฟอร์ม พรีวิวก็ว่างเปล่า").toBeTruthy();
    expect(form.entity).toBe("goods-receipt");
    expect(form.family, "เอกสารฝั่งซื้อ").toBe("inbound");
    /* Operational: the person counting boxes off a lorry has no business
       with what the goods cost. */
    expect(form.showPrice).toBe(false);
  });

  it("พรีวิวสร้างงานพิมพ์ได้จริง พร้อมสามจำนวนต่อบรรทัด", () => {
    const rec = gr("Completed");
    const job = buildPrintJob("goods-receipt", rec.code)!;
    expect(job, "สร้างงานพิมพ์ได้").toBeTruthy();
    expect(job.pages.length).toBeGreaterThan(0);

    const line = job.doc.lines[0];
    /* Ordered, received and accepted — the three that can legitimately
       disagree, and the reason anybody reads the paper afterwards. */
    expect(line.requiredQty).toBe(rec.items[0].ordered);
    expect(line.qty).toBe(rec.items[0].accepted);
  });

  it("หัวกระดาษบอกว่าเป็นใบรับสินค้า และผู้ขายคือคู่ค้าบนใบ", () => {
    const rec = gr("Completed");
    const job = buildPrintJob("goods-receipt", rec.code)!;
    expect(job.config.titleTH).toBe("ใบรับสินค้า");
    /* No customer on this side — the party block carries the supplier the
       goods came from, which is who a discrepancy is taken up with. */
    expect(job.doc.billTo.name).toBe(rec.supplier);
  });
});
