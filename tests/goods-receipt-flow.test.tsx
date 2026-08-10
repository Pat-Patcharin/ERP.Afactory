import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GoodsReceiptEditor } from "@/components/goods-receipt/GoodsReceiptEditor";
import { GOODS_RECEIPTS as RAW_GR } from "@/data/goods-receipts";
import { PURCHASE_ORDERS as RAW_PO } from "@/data/purchase-orders";
import {
  GOODS_RECEIPTS,
  decorateGRs,
  grForceCloses,
  grIsWithPO,
  nextGRCode,
  type GrRow,
} from "@/lib/domain/inbound";
import { PURCHASE_ORDERS, decoratePOs, getPO, type PoRow } from "@/lib/domain/purchase";
import {
  applyPurchaseOrder,
  blankGrDraft,
  blankGrLine,
  canForceClose,
  grTotals,
  receivablePOs,
  saveGoodsReceiptDraft,
  validateGrDraft,
  type GoodsReceiptDraft,
} from "@/lib/domain/goods-receipt-draft";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   RECEIVING

   Two documents that look alike and are not: one against an
   order, one without. And three quantity outcomes, only one of
   which is a decision rather than arithmetic — receiving SHORT
   closes the rest of the order, and that needs the approve
   right, not the receiving right.
   ============================================================ */

const GR_SNAP = JSON.stringify(RAW_GR);
const PO_SNAP = JSON.stringify(RAW_PO);

const KIE = "EMP018"; // Warehouse Admin — receives, cannot close an order
const PIM = "EMP014"; // Backoffice — receives, and may close an order short
const PRAEW = "EMP015"; // General Manager

beforeEach(() => {
  GOODS_RECEIPTS.length = 0;
  GOODS_RECEIPTS.push(...(JSON.parse(GR_SNAP) as GrRow[]));
  PURCHASE_ORDERS.length = 0;
  PURCHASE_ORDERS.push(...(JSON.parse(PO_SNAP) as PoRow[]));
  decorateGRs();
  decoratePOs();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

/** An order with something still owed on it. */
const openPO = () => receivablePOs()[0]!;

/** A receipt against that order, ready to have its quantities changed. */
function poDraft(): GoodsReceiptDraft {
  const po = openPO();
  const d = applyPurchaseOrder(blankGrDraft("With PO"), po.code);
  return { ...d, warehouse: d.warehouse || "WH01 Main Warehouse", receiver: "Kie" };
}

/* ============================================================
   TWO SERIES
   ============================================================ */

describe("เลขที่ใบรับของ", () => {
  it("รับตาม PO กับรับโดยไม่มี PO เดินคนละซีรีส์", () => {
    expect(nextGRCode("With PO").startsWith("GR")).toBe(true);
    expect(nextGRCode("Without PO").startsWith("GRW")).toBe(true);
    expect(nextGRCode("With PO")).not.toBe(nextGRCode("Without PO"));
  });

  it("เลขของซีรีส์หนึ่ง ไม่ดันเลขของอีกซีรีส์", () => {
    const before = nextGRCode("Without PO");

    /* Receiving against an order advances GR… and must leave GRW… alone —
       otherwise a gap in one series is explained by the other, which is the
       whole reason they are separate. */
    setCurrentUser(KIE);
    const d = poDraft();
    saveGoodsReceiptDraft(d, { user: "Kie" });

    expect(nextGRCode("Without PO")).toBe(before);
    expect(nextGRCode("With PO")).not.toBe(d.code);
  });

  it("ใบที่ไม่มี PO ไม่ผูกกับใบสั่งซื้อเลย", () => {
    setCurrentUser(KIE);
    const draft: GoodsReceiptDraft = {
      ...blankGrDraft("Without PO"),
      warehouse: "WH01 Main Warehouse",
      receiver: "Kie",
      nonPoReason: "Warranty Replacement",
      refDoc: "CLM-2026-0007",
      items: [{ ...blankGrLine(), code: "AA-TH003-WL", name: "A-FLEX PU40", unit: "Tube", qty: 5 }],
    };

    expect(validateGrDraft(draft).filter((i) => i.blocking)).toHaveLength(0);
    const res = saveGoodsReceiptDraft(draft, { user: "Kie" });
    const saved = GOODS_RECEIPTS.find((g) => g.code === res.code)!;

    expect(saved.code.startsWith("GRW")).toBe(true);
    expect(grIsWithPO(saved)).toBe(false);
    expect(saved.poRef).toBe("");
    expect(saved.nonPoReason).toBe("Warranty Replacement");
    expect(saved.refDoc).toBe("CLM-2026-0007");
    /* Nothing is force closed by a receipt with no order behind it. */
    expect(res.forceClosed).toBe(false);
  });

  it("ใบที่ไม่มี PO ต้องระบุเหตุผล", () => {
    const draft: GoodsReceiptDraft = {
      ...blankGrDraft("Without PO"),
      warehouse: "WH01 Main Warehouse",
      receiver: "Kie",
      items: [{ ...blankGrLine(), code: "AA-TH003-WL", qty: 5 }],
    };
    expect(validateGrDraft(draft).map((i) => i.field)).toContain("nonPoReason");
  });
});

/* ============================================================
   RECEIVING AGAINST AN ORDER
   ============================================================ */

describe("รับของตามใบสั่งซื้อ", () => {
  it("ดึงเฉพาะรายการที่ยังค้างรับ และตั้งจำนวนไว้เท่าที่ค้าง", () => {
    const po = openPO();
    const d = applyPurchaseOrder(blankGrDraft("With PO"), po.code);

    expect(d.poRef).toBe(po.code);
    expect(d.supplier).toBe(po.supplier);
    expect(d.items.length).toBeGreaterThan(0);
    for (const l of d.items) {
      const line = po.items.find((x) => x.code === l.code)!;
      expect(l.qty, l.code).toBe(line.qty - line.recv);
      expect(l.include, "ติ๊กมาให้ทุกรายการ").toBe(true);
    }
  });

  it("เอาติ๊กออก = ไม่รับรอบนี้ ยอดยังค้างอยู่ที่ใบสั่งซื้อ", () => {
    setCurrentUser(KIE);
    const d = poDraft();
    if (d.items.length < 2) return;

    const skipped = d.items[0];
    const draft = {
      ...d,
      items: d.items.map((l) => (l.id === skipped.id ? { ...l, include: false } : l)),
    };

    const res = saveGoodsReceiptDraft(draft, { user: "Kie" });
    const saved = GOODS_RECEIPTS.find((g) => g.code === res.code)!;
    const po = getPO(draft.poRef)!;

    expect(saved.items.map((l) => l.code)).not.toContain(skipped.code);
    /* Not received is not the same as received short: the order still owes
       it, and the order is not closed. */
    expect(res.forceClosed).toBe(false);
    expect(po.status).toBe("Partial Received");
    const stillOwed = po.items.find((x) => x.code === skipped.code)!;
    expect(stillOwed.qty - stillOwed.recv).toBeGreaterThan(0);
  });

  it("รับครบ ปิดใบสั่งซื้อ", () => {
    setCurrentUser(KIE);
    const d = poDraft();
    const res = saveGoodsReceiptDraft(d, { user: "Kie" });
    const po = getPO(d.poRef)!;

    expect(res.forceClosed).toBe(false);
    expect(po.status).toBe("Completed");
    for (const line of po.items) expect(line.recv).toBeGreaterThanOrEqual(line.qty);
  });

  it("รับเกินจำนวนที่สั่งได้ และเตือนโดยไม่บล็อก", () => {
    setCurrentUser(KIE);
    const d = poDraft();
    const draft = {
      ...d,
      items: d.items.map((l, i) => (i === 0 ? { ...l, qty: Number(l.qty) + 5 } : l)),
    };

    const t = grTotals(draft);
    expect(t.overLines).toBe(1);
    expect(t.forceCloses, "รับเกินไม่ใช่การปิดใบสั่งซื้อ").toBe(false);

    const issues = validateGrDraft(draft);
    expect(issues.some((i) => !i.blocking)).toBe(true);
    expect(issues.filter((i) => i.blocking)).toHaveLength(0);

    const res = saveGoodsReceiptDraft(draft, { user: "Kie" });
    const saved = GOODS_RECEIPTS.find((g) => g.code === res.code)!;
    expect(saved.items[0].receiveNow).toBe(Number(d.items[0].qty) + 5);
  });
});

/* ============================================================
   SHORT RECEIPT — the one decision on this document
   ============================================================ */

describe("รับน้อยกว่าจำนวนที่สั่ง = ปิดใบสั่งซื้อ", () => {
  const shortDraft = () => {
    const d = poDraft();
    return {
      ...d,
      forceCloseReason: "ผู้ขายแจ้งยกเลิกส่วนที่เหลือ",
      items: d.items.map((l, i) => (i === 0 ? { ...l, qty: Math.max(1, Number(l.qty) - 1) } : l)),
    };
  };

  it("Kie รับของได้ แต่ปิดใบสั่งซื้อไม่ได้", () => {
    setCurrentUser(KIE);
    expect(canForceClose()).toBe(false);

    const draft = shortDraft();
    expect(grForceCloses({ type: draft.type, items: draft.items.map((l) => ({ ordered: l.ordered, prevRecv: l.prevRecv, receiveNow: Number(l.qty) })) })).toBe(true);

    const blocking = validateGrDraft(draft).filter((i) => i.blocking);
    expect(blocking.map((i) => i.message).join(" ")).toContain("ผู้มีสิทธิ์อนุมัติ");
  });

  it("Pim ปิดได้ และต้องบอกเหตุผล", () => {
    setCurrentUser(PIM);
    expect(canForceClose()).toBe(true);

    const noReason = { ...shortDraft(), forceCloseReason: "" };
    expect(validateGrDraft(noReason).map((i) => i.field)).toContain("forceCloseReason");

    const draft = shortDraft();
    expect(validateGrDraft(draft).filter((i) => i.blocking)).toHaveLength(0);

    const res = saveGoodsReceiptDraft(draft, { user: "Pim" });
    const saved = GOODS_RECEIPTS.find((g) => g.code === res.code)!;
    const po = getPO(draft.poRef)!;

    expect(res.forceClosed).toBe(true);
    expect(saved.forceClosed).toBe(true);
    expect(saved.forceClosedBy).toBe("Pim");
    expect(saved.forceCloseReason).toBe("ผู้ขายแจ้งยกเลิกส่วนที่เหลือ");
    /* Closed even though a unit is still owed — that is what closing means. */
    expect(po.status).toBe("Completed");
    expect(po.items[0].recv).toBeLessThan(po.items[0].qty);
    expect(po.remark).toContain(saved.code);
  });

  it("ผู้จัดการทั่วไปก็ปิดได้", () => {
    setCurrentUser(PRAEW);
    expect(canForceClose()).toBe(true);
  });

  it("รับพอดีไม่ถือเป็นการปิด", () => {
    setCurrentUser(KIE);
    const draft = poDraft();
    expect(grTotals(draft).forceCloses).toBe(false);
    expect(validateGrDraft(draft).filter((i) => i.blocking)).toHaveLength(0);
  });
});

/* ============================================================
   THE DOCUMENT ITSELF
   ============================================================ */

describe("Goods Receipt editor — the document", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setCurrentUser(KIE);
  });

  it("renders as one page, with no stepper", () => {
    render(<GoodsReceiptEditor />);
    expect(screen.getByTestId("goods-receipt-document")).toBeInTheDocument();
    expect(screen.getByTestId("gr-toolbar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ถัดไป|Next/ })).toBeNull();
  });

  it("carries the inbound family, like the request it closes", () => {
    const { container } = render(<GoodsReceiptEditor />);
    expect(container.querySelector('[data-doc-family="inbound"]')).toBeTruthy();
  });

  it("opens with no lines until an order is chosen", () => {
    render(<GoodsReceiptEditor />);
    expect(screen.getByText(/เลือกใบสั่งซื้อด้านบน/)).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("เลือก PO แล้วรายการค้างรับขึ้นมาให้ติ๊ก", async () => {
    const po = openPO();
    render(<GoodsReceiptEditor />);

    await userEvent.selectOptions(screen.getByLabelText("Purchase Order"), po.code);

    const outstanding = po.items.filter((it) => it.qty - it.recv > 0);
    /* One tick per outstanding line — a line already received in full has
       nothing left to offer this receipt. */
    expect(screen.getAllByRole("checkbox")).toHaveLength(outstanding.length);
    for (const it of outstanding) expect(screen.getByText(it.code)).toBeInTheDocument();
  });

  it("สลับเป็นแบบไม่มี PO แล้วเลขเอกสารเปลี่ยนซีรีส์", async () => {
    const withPo = nextGRCode("With PO");
    render(<GoodsReceiptEditor />);
    /* The number is on the sheet and in the toolbar — both are the document
       saying which one it is. */
    expect(screen.getAllByText(withPo).length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByLabelText("Receipt Type"), "Without PO");

    expect(screen.getAllByText(nextGRCode("Without PO")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(withPo)).toHaveLength(0);
    expect(screen.getByLabelText("Non-PO Reason")).toBeInTheDocument();
    expect(screen.queryByLabelText("Purchase Order")).toBeNull();
  });

  it("Kie เห็นคำเตือนว่าปิดใบสั่งซื้อเองไม่ได้ เมื่อรับไม่ครบ", async () => {
    const po = openPO();
    render(<GoodsReceiptEditor />);
    await userEvent.selectOptions(screen.getByLabelText("Purchase Order"), po.code);

    const qty = screen.getByLabelText("จำนวนที่รับเข้า บรรทัดที่ 1");
    await userEvent.clear(qty);
    await userEvent.type(qty, "1");

    expect(screen.getByText(/ปิดใบสั่งซื้อส่วนที่เหลือ/)).toBeInTheDocument();
    expect(screen.getByText(/บทบาทของคุณปิดใบสั่งซื้อไม่ได้/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Force close reason")).toBeNull();
  });

  it("Pim เห็นช่องให้กรอกเหตุผลแทนคำเตือน", async () => {
    setCurrentUser(PIM);
    const po = openPO();
    render(<GoodsReceiptEditor />);
    await userEvent.selectOptions(screen.getByLabelText("Purchase Order"), po.code);

    const qty = screen.getByLabelText("จำนวนที่รับเข้า บรรทัดที่ 1");
    await userEvent.clear(qty);
    await userEvent.type(qty, "1");

    expect(screen.getByLabelText("Force close reason")).toBeInTheDocument();
    expect(screen.queryByText(/บทบาทของคุณปิดใบสั่งซื้อไม่ได้/)).toBeNull();
  });
});
