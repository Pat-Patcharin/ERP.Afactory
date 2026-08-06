import { beforeEach, describe, expect, it } from "vitest";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { SALES_REQUESTS as RAW_SR } from "@/data/sales-requests";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { PICKING_TASKS as RAW_PICK } from "@/data/picking";
import { NOTIFY_ITEMS as RAW_NOTIFY } from "@/data/notifications";
import { BUSINESS_PARTNERS as RAW_BP } from "@/data/partners";
import {
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
  decorateOutbound,
  outboundCustomers,
} from "@/lib/domain/outbound";
import { BUSINESS_PARTNERS, decorateBPs } from "@/lib/domain/partner";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { priceMasterRows } from "@/lib/domain/price-master";
import { NOTIFY_ITEMS, myNotifications } from "@/lib/domain/notify";
import { dashPendingTasks } from "@/lib/domain/dashboard";
import { actingUserName, currentUser, resetCurrentUser, switchAccount } from "@/lib/domain/admin";
import {
  applyCustomer,
  applyProduct,
  blankDraft,
  blankLine,
  saveQuotationDraft,
} from "@/lib/domain/quotation-draft";
import { blankSrDraft, saveSalesRequestDraft } from "@/lib/domain/sales-request-draft";
import {
  pickComplete,
  pickStart,
  qtAccept,
  qtApprove,
  qtConvert,
  qtSend,
  qtSubmit,
  soApproveCredit,
  soConfirm,
  soCreatePick,
  srApprove,
  srConvert,
  srSubmit,
} from "@/lib/workflows-outbound";
import type { ActionCtx } from "@/lib/types";
import type { ReactNode } from "react";

/* ============================================================
   THREE PEOPLE, ONE ORDER

   Every other suite proves a rule. This one proves the rules
   join up when three different people take turns at the same
   document — which is the thing that cannot be checked by
   calling functions as one omnipotent user.

   The chair is changed with `switchAccount`, the same call the
   topbar menu makes, so what is walked here is what a person
   walking the demo would get.
   ============================================================ */

const REP = "EMP004";
const ADMIN = "EMP013";
const MANAGER = "EMP003";

const SNAP = {
  qt: JSON.stringify(RAW_QT),
  sr: JSON.stringify(RAW_SR),
  so: JSON.stringify(RAW_SO),
  pick: JSON.stringify(RAW_PICK),
  notify: JSON.stringify(RAW_NOTIFY),
  bp: JSON.stringify(RAW_BP),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(QUOTATIONS, SNAP.qt);
  restore(SALES_REQUESTS, SNAP.sr);
  restore(SALES_ORDERS, SNAP.so);
  restore(PICKING_TASKS, SNAP.pick);
  restore(NOTIFY_ITEMS, SNAP.notify);
  restore(BUSINESS_PARTNERS, SNAP.bp);
  decorateBPs();
  decorateOutbound();
  resetCurrentUser();
});

/** Auto-confirms and answers the shortage dialog with whatever is set. */
function walkCtx() {
  const toasts: { title: string; message?: string; tone?: string }[] = [];
  let modal: { body: () => ReactNode; onConfirm?: () => boolean | void } | null = null;
  return {
    toasts,
    lastToast: () => toasts[toasts.length - 1],
    /* The shortage dialog's default answer is a back order, which is what a
       walk-through wants: nothing about the order changes. */
    answerModal: () => modal?.onConfirm?.(),
    ctx: {
      goto: () => {},
      openEntity: () => {},
      toast: (title: string, message?: string, tone?: string) =>
        toasts.push({ title, message, tone }),
      confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
      formModal: (o: { body: () => ReactNode; onConfirm?: () => boolean | void }) => {
        modal = o;
      },
      refresh: () => {},
      quickView: () => {},
      panel: () => {},
    } as unknown as ActionCtx,
  };
}

const sitAs = (code: string) => {
  expect(switchAccount(code), `switch to ${code}`).toBe(true);
};

/** A customer we may sell to, confirmed, billed with VAT. */
const customer = () => {
  const bp = outboundCustomers().find((b) => b.status === "Active" && b.billType !== "Non VAT")!;
  return `${bp.code} - ${bp.nameTh}`;
};

/** A catalogue product with stock, and how much of it there is. */
const stocked = () => {
  const p = PRODUCTS.find((x) => (productStock(x.code)?.available ?? 0) > 5)!;
  return { code: p.code, available: productStock(p.code)!.available };
};

/**
 * Raise a quotation as whoever is sitting down, at the price given.
 *
 * Stamped with the acting user so the approval result can find its way back —
 * exactly what happens when the editor saves one.
 */
function raiseQuote(code: string, qty: number, price: number) {
  const draft = applyCustomer(blankDraft(), customer());
  draft.salesRep = draft.salesRep || "SALE001 - Patcharin Thiengkaew";
  draft.items = [{ ...applyProduct(blankLine(), code), qty, price, disc: 0, tax: 7 }];
  const res = saveQuotationDraft(draft, { issue: true, user: actingUserName() });
  expect(res.blocked, "the quotation should save").toBeUndefined();
  const qt = QUOTATIONS.find((q) => q.code === res.code)!;
  qt.createdBy = actingUserName();
  return qt;
}

/** Titles in the acting user's task box. */
const myTasks = () => dashPendingTasks().map((t) => t.title);
const myInbox = () => myNotifications().map((n) => n.title);

describe("Journey — quotation, request, order, all three chairs", () => {
  it("walks an ordinary order from the rep's desk to the warehouse", () => {
    const { ctx, answerModal } = walkCtx();
    const { code, available } = stocked();

    /* ---------- The rep raises it ---------- */
    sitAs(REP);
    const qt = raiseQuote(code, available + 10, 500);
    const repName = actingUserName();
    qtSubmit(qt, ctx);
    expect(qt.status).toBe("Pending Approval");
    expect(qt.priceApprovalLevel, "an ordinary price").toBe("admin");

    /* The rep cannot sign their own paperwork. */
    qtApprove(qt, ctx);
    expect(qt.status, "still waiting").toBe("Pending Approval");

    /* ---------- It appears on the admin's desk ---------- */
    sitAs(ADMIN);
    expect(myTasks()).toContain("ใบเสนอราคารออนุมัติ");
    expect(myInbox()).toContain(`ใบเสนอราคา ${qt.code} รออนุมัติ`);

    qtApprove(qt, ctx);
    expect(qt.status).toBe("Approved");
    expect(qt.approvedBy).toBe(actingUserName());
    /* And the approver is not told about their own signature. */
    expect(myInbox()).not.toContain(`${qt.code} อนุมัติแล้ว`);

    /* ---------- The rep hears back ---------- */
    sitAs(REP);
    expect(currentUser().name).toBe(repName);
    expect(myInbox()).toContain(`${qt.code} อนุมัติแล้ว`);

    qtSend(qt, ctx);
    qtAccept(qt, ctx);
    expect(qt.status).toBe("Accepted");

    /* ---------- Accepted becomes a request, never an order ---------- */
    qtConvert(qt, ctx);
    decorateOutbound();
    expect(qt.srRef).toBeTruthy();
    expect(qt.soRef, "the direct route is closed").toBe("");

    const sr = SALES_REQUESTS.find((r) => r.code === qt.srRef)!;
    sr.createdBy = actingUserName();
    srSubmit(sr, ctx);
    expect(sr.status).toBe("Submitted");
    expect(sr.priceApprovalLevel).toBe("admin");

    /* ---------- The admin signs and converts ---------- */
    sitAs(ADMIN);
    expect(myTasks()).toContain("คำขอขายรออนุมัติ");
    srApprove(sr, ctx);
    expect(sr.status).toBe("Approved");

    srConvert(sr, ctx);
    decorateOutbound();
    const so = SALES_ORDERS.find((s) => s.code === sr.soRef)!;
    expect(so, "the order the request produced").toBeTruthy();
    expect(so.srRef).toBe(sr.code);

    /* ---------- Credit first, then stock ----------
       An order this size lands on a credit hold, and clearing that is the
       admin's job too. Only then is the stock question worth asking. */
    if (so.status === "On Hold") {
      soApproveCredit(so, ctx);
      expect(so.status).toBe("Confirmed");
    }

    const beforeStockQuestion = so.status;
    soConfirm(so, ctx);
    expect(so.status, "the shortage is asked about, not assumed").toBe(beforeStockQuestion);
    answerModal();
    expect(so.status).toBe("Confirmed");
    expect(so.items[0].qty, "a back order changes nothing").toBe(available + 10);

    /* ---------- The warehouse picks what there is ---------- */
    soCreatePick(so, ctx);
    decorateOutbound();
    const pick = PICKING_TASKS.find((p) => p.soRef === so.code)!;
    pickStart(pick, ctx);
    for (const l of pick.items) l.picked = available;
    decorateOutbound();
    pickComplete(pick, ctx);

    expect(pick.status).toBe("Completed");
    expect(so.status, "partial the moment the sheet closes").toBe("Partially Delivered");
    expect(so.items[0].delivered, "and nothing has actually shipped").toBe(0);

    /* ---------- The rep is told, before the lorry ---------- */
    sitAs(REP);
    expect(myInbox()).toContain(`${so.code} หยิบของไม่ครบ`);
  });

  it("stops the admin at a price under the floor and lets the manager through", () => {
    const { ctx, lastToast } = walkCtx();
    const row = priceMasterRows().find((r) => r.status === "OK" && r.price_last && r.cost_thb)!;

    sitAs(REP);
    const qt = raiseQuote(row.product_code, 1, row.price_last! - 1);
    qtSubmit(qt, ctx);
    expect(qt.priceApprovalLevel, "below the floor asks for the manager").toBe("manager");

    /* The desk that signs everything routine cannot sign this. */
    sitAs(ADMIN);
    qtApprove(qt, ctx);
    expect(qt.status, "refused").toBe("Pending Approval");
    expect(lastToast().message).toContain("ผู้จัดการฝ่ายขาย");
    /* And it was never put in front of them in the first place. */
    expect(myTasks()).not.toContain("ใบเสนอราคาราคาต่ำกว่าขั้นต่ำ");

    sitAs(MANAGER);
    expect(myTasks()).toContain("ใบเสนอราคาราคาต่ำกว่าขั้นต่ำ");
    qtApprove(qt, ctx);
    expect(qt.status).toBe("Approved");
  });

  it("holds the same floor on a request raised without any quotation", () => {
    /* The route that exists for the customer who never asked for a quote —
       and the one that used to skip the price rule entirely. */
    const { ctx, lastToast } = walkCtx();
    const row = priceMasterRows().find((r) => r.status === "OK" && r.price_last && r.cost_thb)!;

    sitAs(REP);
    const draft = blankSrDraft();
    draft.customerPick = customer();
    draft.items = [
      {
        ...blankLine(),
        code: row.product_code,
        name: row.product_name,
        qty: 1,
        price: row.price_last! - 1,
        disc: 0,
        tax: 7,
      },
    ];
    const res = saveSalesRequestDraft(draft, { user: actingUserName() });
    const sr = SALES_REQUESTS.find((r) => r.code === res.code)!;
    sr.createdBy = actingUserName();
    expect(sr.quotationRef, "no quotation behind it").toBe("");

    srSubmit(sr, ctx);
    expect(sr.status).toBe("Submitted");
    expect(sr.priceApprovalLevel, "the floor holds without a quotation").toBe("manager");

    sitAs(ADMIN);
    srApprove(sr, ctx);
    expect(sr.status, "refused, same as the quotation route").toBe("Submitted");
    expect(lastToast().message).toContain("ผู้จัดการฝ่ายขาย");

    sitAs(MANAGER);
    srApprove(sr, ctx);
    expect(sr.status).toBe("Approved");
  });

  it("never shows anybody the news they made themselves", () => {
    const { ctx } = walkCtx();
    const { code, available } = stocked();

    sitAs(REP);
    const qt = raiseQuote(code, available, 500);
    qtSubmit(qt, ctx);
    /* The rep sent it, so the request is not in their box — even though the
       record of it exists and other people can see it. */
    expect(myInbox()).not.toContain(`ใบเสนอราคา ${qt.code} รออนุมัติ`);
    expect(NOTIFY_ITEMS.some((n) => n.docCode === qt.code)).toBe(true);

    sitAs(ADMIN);
    expect(myInbox()).toContain(`ใบเสนอราคา ${qt.code} รออนุมัติ`);
    qtApprove(qt, ctx);
    expect(myInbox(), "the approver is not told of their own approval").not.toContain(
      `${qt.code} อนุมัติแล้ว`,
    );

    sitAs(REP);
    expect(myInbox()).toContain(`${qt.code} อนุมัติแล้ว`);
  });

  it("gives each chair a different task box from the same data", () => {
    sitAs(REP);
    const rep = myTasks();
    sitAs(ADMIN);
    const admin = myTasks();
    sitAs(MANAGER);
    const manager = myTasks();

    expect(rep).not.toEqual(admin);
    /* The rep approves nothing; the admin approves the ordinary; only the
       manager is shown what is under the floor. */
    expect(rep).not.toContain("คำขอขายรออนุมัติ");
    expect(admin).toContain("คำขอขายรออนุมัติ");
    expect(admin).not.toContain("คำขอขายราคาต่ำกว่าขั้นต่ำ");
    expect(manager).toContain("คำขอขายรออนุมัติ");
  });
});
