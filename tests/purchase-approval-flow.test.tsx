import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PURCHASE_REQUESTS as RAW_PR } from "@/data/purchase-requests";
import { PURCHASE_ORDERS as RAW_PO } from "@/data/purchase-orders";
import {
  PURCHASE_ORDERS,
  PURCHASE_REQUESTS,
  decoratePRs,
  prApprovalPlan,
  prOpenLines,
  type PoRow,
  type PrRow,
} from "@/lib/domain/purchase";
import {
  prApprove,
  prCanApprove,
  prCanConvert,
  prCanOpen,
  prCanSubmit,
  prConvert,
  prOpen,
  prReject,
  prSubmit,
} from "@/lib/workflows-purchase";
import { NOTIFY_ITEMS } from "@/data/notifications";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   THE INBOUND APPROVAL FLOW

   Backoffice raises a request; the general manager signs what is
   within the limit; the managing director signs what is over it.
   Then the general manager turns the approved request into one
   purchase order, or into several — one supplier, several
   instalments.

   Every assertion here is about the RULE, not about the number:
   the limit is read from the approval workflow in Administration,
   so a document is built above or below whatever that says rather
   than above or below a literal 100,000 typed into the test.
   ============================================================ */

const PR_SNAP = JSON.stringify(RAW_PR);
const PO_SNAP = JSON.stringify(RAW_PO);
const NOTIFY_SNAP = JSON.stringify(NOTIFY_ITEMS);

const PIM = "EMP014";
const PRAEW = "EMP015";
const MAX = "EMP016";

/** The value at which a request needs the second signature. */
const LIMIT = prApprovalPlan({ amount: Number.MAX_SAFE_INTEGER, items: [] } as never)[1]!.threshold;

beforeEach(() => {
  /* Restored undecorated and decorated again below — the same round trip a
     reload makes, and the cast every seed restore in this suite uses. */
  PURCHASE_REQUESTS.length = 0;
  PURCHASE_REQUESTS.push(...(JSON.parse(PR_SNAP) as PrRow[]));
  PURCHASE_ORDERS.length = 0;
  PURCHASE_ORDERS.push(...(JSON.parse(PO_SNAP) as PoRow[]));
  NOTIFY_ITEMS.length = 0;
  NOTIFY_ITEMS.push(...(JSON.parse(NOTIFY_SNAP) as typeof NOTIFY_ITEMS));
  decoratePRs();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

/** Confirm dialogs run straight through — the transition is what is tested. */
const makeCtx = (over: Partial<ActionCtx> = {}): ActionCtx => ({
  goto: () => {},
  openEntity: () => {},
  toast: () => {},
  confirm: (o) => o.onConfirm(),
  formModal: () => {},
  refresh: () => {},
  quickView: () => {},
  panel: () => {},
  ...over,
});

/**
 * A fresh draft raised by Pim, worth EXACTLY what the caller asks for.
 *
 * The remainder goes on the first line rather than being rounded away: a
 * three-line request built for "one baht under the limit" that came out at
 * the limit would have been testing the other branch and saying so in the
 * name of the test.
 */
function draft(amount: number, lines = 1): PrRow {
  const each = Math.floor(amount / lines);
  const rest = amount - each * lines;
  const pr = {
    code: `PR-TEST-${PURCHASE_REQUESTS.length + 1}`,
    dept: "Operation",
    requester: "Pim",
    priority: "Normal",
    date: "10/08/2026",
    needBy: "20/08/2026",
    status: "Draft",
    warehouse: "WH-BKK Bangkok Main",
    supplier: "DentCare Co., Ltd.",
    note: "",
    headerDisc: 0,
    freight: 0,
    otherCharges: 0,
    items: Array.from({ length: lines }, (_, i) => ({
      code: `ITEM-${i + 1}`,
      name: `Item ${i + 1}`,
      unit: "Piece",
      qty: 1,
      price: i === 0 ? each + rest : each,
      note: "",
    })),
    approvals: [],
    createdBy: "Pim",
    created: "10/08/2026 09:00",
    updatedBy: "Pim",
    updated: "10/08/2026 09:00",
  } as unknown as PrRow;
  PURCHASE_REQUESTS.unshift(pr);
  decoratePRs();
  return pr;
}

const toRoles = (docCode: string) =>
  NOTIFY_ITEMS.filter((n) => n.docCode === docCode).map((n) => n.toRole);

/* ============================================================
   UNDER THE LIMIT — one signature
   ============================================================ */

describe("ใบขอซื้อไม่เกินวงเงิน", () => {
  it("Pim ส่งแล้วเอกสารเปิดทันที และเด้งหา General Manager", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT - 1);

    expect(prCanSubmit(pr)).toBe(true);
    prSubmit(pr, makeCtx());

    expect(pr.status).toBe("Open");
    expect(pr.submittedBy).toBe("Pim");
    /* Addressed to the role, never to a person — anyone holding it may act. */
    expect(toRoles(pr.code)).toContain("GENERAL_MANAGER");
    expect(toRoles(pr.code)).not.toContain("MANAGEMENT");
  });

  it("Praew อนุมัติได้เลย ไม่ต้องผ่าน MD", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT - 1);
    prSubmit(pr, makeCtx());

    setCurrentUser(PRAEW);
    expect(prCanApprove(pr)).toBe(true);
    prApprove(pr, makeCtx());

    expect(pr.status).toBe("Approved");
    expect(prApprovalPlan(pr)).toHaveLength(1);
  });

  it("Pim อนุมัติใบที่ตัวเองเปิดไม่ได้", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT - 1);
    prSubmit(pr, makeCtx());

    /* The guard is on the mutation, not on the button: the document does not
       move, whatever surface the call came from. */
    let warned = "";
    prApprove(pr, makeCtx({ toast: (t) => (warned = t) }));
    expect(pr.status).toBe("Open");
    expect(warned).toBe("สิทธิ์ไม่พอ");
  });
});

/* ============================================================
   OVER THE LIMIT — the reviewer's door, then the second signature
   ============================================================ */

describe("ใบขอซื้อเกินวงเงิน", () => {
  it("Pim ส่งแล้วยังเป็น Draft — รอ Praew ตรวจก่อน", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT + 1);
    prSubmit(pr, makeCtx());

    expect(pr.status).toBe("Draft");
    /* A draft nobody is waiting on and a draft on somebody's desk are told
       apart by this, not by the status. */
    expect(pr.submittedAt).toBeTruthy();
    expect(prCanSubmit(pr)).toBe(false);
    expect(toRoles(pr.code)).toContain("GENERAL_MANAGER");

    /* `prCanOpen` answers "may I open this", not "is this openable" — so it
       is false for the requester who just sent it, and true for the desk it
       landed on. Asked as both, because the buttons on both screens are
       drawn from this one answer. */
    expect(prCanOpen(pr), "ผู้ขอซื้อเปิดเอกสารเองไม่ได้").toBe(false);
    setCurrentUser(PRAEW);
    expect(prCanOpen(pr)).toBe(true);
  });

  it("ยังอนุมัติไม่ได้จนกว่า Praew จะเปิดเอกสาร", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT + 1);
    prSubmit(pr, makeCtx());

    setCurrentUser(MAX);
    prApprove(pr, makeCtx());
    expect(pr.status).toBe("Draft");
  });

  it("Praew เปิดเอกสารแล้วเด้งหา MD ไม่ใช่ตัวเอง", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT + 1);
    prSubmit(pr, makeCtx());

    setCurrentUser(PRAEW);
    prOpen(pr, makeCtx());

    expect(pr.status).toBe("Open");
    expect(toRoles(pr.code)).toContain("MANAGEMENT");
  });

  it("Praew อนุมัติขั้นของ MD เองไม่ได้", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT + 1);
    prSubmit(pr, makeCtx());

    setCurrentUser(PRAEW);
    prOpen(pr, makeCtx());

    let warned = "";
    prApprove(pr, makeCtx({ toast: (t) => (warned = t) }));
    expect(pr.status, "ยังไม่อนุมัติ").toBe("Open");
    expect(warned).toBe("อนุมัติไม่ได้");
  });

  it("Max อนุมัติแล้วกลับมาที่ Praew เพื่อออก PO", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT + 1);
    prSubmit(pr, makeCtx());
    setCurrentUser(PRAEW);
    prOpen(pr, makeCtx());

    setCurrentUser(MAX);
    prApprove(pr, makeCtx());

    expect(pr.status).toBe("Approved");
    expect(toRoles(pr.code)).toContain("GENERAL_MANAGER");
  });
});

/* ============================================================
   ONE SUPPLIER, SEVERAL ORDERS
   ============================================================ */

describe("ออกใบสั่งซื้อจากใบขอซื้อที่อนุมัติแล้ว", () => {
  const approved = (amount: number, lines: number) => {
    setCurrentUser(PIM);
    const pr = draft(amount, lines);
    prSubmit(pr, makeCtx());
    setCurrentUser(PRAEW);
    prApprove(pr, makeCtx());
    return pr;
  };

  it("ใบขอซื้อที่ยังไม่ระบุผู้ขาย ส่งขออนุมัติไม่ได้", () => {
    setCurrentUser(PIM);
    const pr = draft(1_000);
    pr.supplier = "";

    let warned = "";
    prSubmit(pr, makeCtx({ toast: (t) => (warned = t) }));
    expect(pr.status, "ไม่ขยับ").toBe("Draft");
    expect(warned).toBe("ยังไม่ได้ระบุผู้ขาย");
  });

  it("ไม่ติ๊กอะไรเลย = สั่งทั้งใบในครั้งเดียว", () => {
    const pr = approved(LIMIT - 1, 3);

    prConvert(pr, makeCtx());

    /* Everything is ticked to start with, because ordering the whole request
       is the ordinary case and the split is what somebody opts into. */
    expect(pr.status).toBe("Converted");
    expect(pr.items.every((l) => l.poRef === pr.poRefs![0])).toBe(true);
  });

  it("ติ๊กออกบางรายการ ออก PO เฉพาะที่เหลือ และใบขอซื้อยังเปิดอยู่", async () => {
    const pr = approved(LIMIT - 1, 3);
    const dropped = pr.items[0].code;

    /* The real dialog, clicked the way Praew clicks it: render the message
       the workflow handed the confirm, untick a line, then confirm. */
    let confirm: (() => void) | null = null;
    prConvert(
      pr,
      makeCtx({
        confirm: (o) => {
          render(<>{o.message}</>);
          confirm = o.onConfirm;
        },
      }),
    );

    /* Three lines plus the tick that does all three. */
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByLabelText("เลือกทุกรายการ")).toBeChecked();

    await userEvent.click(screen.getByLabelText(`สั่ง ${dropped}`));
    confirm!();

    const po = PURCHASE_ORDERS.find((p) => p.prRef === pr.code)!;
    expect(po.items.map((l) => l.code)).not.toContain(dropped);
    expect(po.items).toHaveLength(2);

    /* Two lines ordered, one still to go — so the request is not finished. */
    expect(pr.status).toBe("Approved");
    expect(prOpenLines(pr).map((l) => l.code)).toEqual([dropped]);

    /* And the rest goes out on a second order, to the same supplier. */
    prConvert(pr, makeCtx());
    expect(pr.poRefs).toHaveLength(2);
    expect(pr.status).toBe("Converted");
    const second = PURCHASE_ORDERS.find((p) => p.code === pr.poRefs![1])!;
    expect(second.supplier).toBe(pr.supplier);
    expect(second.items.map((l) => l.code)).toEqual([dropped]);
  });

  it("รายการที่ออก PO แล้ว ไม่ถูกเสนอให้สั่งซ้ำ", () => {
    const pr = approved(LIMIT - 1, 2);
    pr.items[0].poRef = "PO-EXISTING";
    decoratePRs();

    expect(prOpenLines(pr)).toHaveLength(1);
    expect(pr.openLines).toBe(1);

    prConvert(pr, makeCtx());
    const po = PURCHASE_ORDERS.find((p) => p.prRef === pr.code)!;
    expect(po.items).toHaveLength(1);
    expect(po.items[0].code).toBe(pr.items[1].code);
    /* Every line now on an order, so the request itself is finished. */
    expect(pr.status).toBe("Converted");
  });

  it("PO ที่ออกมาเป็นของผู้ขายรายเดียวกับใบขอซื้อเสมอ", () => {
    const pr = approved(LIMIT - 1, 2);
    prConvert(pr, makeCtx());

    const po = PURCHASE_ORDERS.find((p) => p.prRef === pr.code)!;
    expect(po.supplier).toBe(pr.supplier);
    expect(po.status).toBe("Open");
  });

  it("ยังไม่อนุมัติ ออกใบสั่งซื้อไม่ได้", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT - 1);
    prSubmit(pr, makeCtx());

    setCurrentUser(PRAEW);
    expect(prCanConvert(pr)).toBe(false);
    prConvert(pr, makeCtx());
    expect(PURCHASE_ORDERS.some((p) => p.prRef === pr.code)).toBe(false);
  });
});

/* ============================================================
   REJECTION
   ============================================================ */

describe("ปฏิเสธใบขอซื้อ", () => {
  it("Praew ปฏิเสธแล้วเด้งกลับหา Pim พร้อมเหตุผล", () => {
    setCurrentUser(PIM);
    const pr = draft(LIMIT - 1);
    prSubmit(pr, makeCtx());

    setCurrentUser(PRAEW);
    prReject(pr, makeCtx());

    expect(pr.status).toBe("Rejected");
    const back = NOTIFY_ITEMS.find((n) => n.docCode === pr.code && n.toUser === "Pim");
    expect(back?.kind).toBe("rejected");
  });
});
