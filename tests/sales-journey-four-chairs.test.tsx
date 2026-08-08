import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { PACKING_TASKS as RAW_PACK } from "@/data/packing";
import { DELIVERY_ORDERS as RAW_DO } from "@/data/delivery-orders";
import { SHIPMENTS as RAW_SHP } from "@/data/shipments";
import { SALES_REQUESTS as RAW_SR } from "@/data/sales-requests";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { PICKING_TASKS as RAW_PICK } from "@/data/picking";
import { NOTIFY_ITEMS as RAW_NOTIFY } from "@/data/notifications";
import { BUSINESS_PARTNERS as RAW_BP } from "@/data/partners";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
  decorateOutbound,
  outboundCustomers,
} from "@/lib/domain/outbound";
import {
  SHIPMENTS,
  decorateShipments,
  headerFromDO,
  shippableLinesFrom,
  traceFromTracking,
  type ShpRow,
} from "@/lib/domain/shipment";
import { SHP_FORM } from "@/schemas/forms/shipment";
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
import { shpSetTrackingNo } from "@/lib/workflows-shipment";
import {
  doConfirmDelivery,
  packComplete,
  packConfirmShipQty,
  packCreateDelivery,
  packStart,
  pickComplete,
  pickCreatePack,
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
   FOUR PEOPLE, ONE ORDER

   Every other suite proves a rule. This one proves the rules
   join up when four different people take turns at the same
   document — which is the thing that cannot be checked by
   calling functions as one omnipotent user.

   The chair is changed with `switchAccount`, the same call the
   topbar menu makes, so what is walked here is what a person
   walking the demo would get.

   The full relay, and why each hand-off is a hand-off:

     rep        raises the quotation, and cannot approve it
     admin      approves it, and stops there
     rep        sends it, hears yes, converts it to a request —
                their customer, so their move
     admin      signs the request, opens the order, confirms it,
                and cannot say what came off the shelf
     warehouse  picks, packs, and states what will actually ship
     admin      turns that figure into the delivery note, and
                enters the tracking number
     rep        learns the goods left, from a notification they
                did not send themselves

   The rep converting is not a detail. The request's author is
   who the system treats as the order's owner from there on, so
   every notification downstream — including the tracking number
   at the very end — depends on the right person having made
   that move. Writing this walk with the admin converting made
   the final notification vanish, which is how the omission was
   found.

   It was three chairs until N8 gave the warehouse a decision of
   its own. The file was renamed with it: a test named for the
   wrong number is the same lie as a comment the code does not
   follow.
   ============================================================ */

const REP = "EMP004";
const ADMIN = "EMP013";
const MANAGER = "EMP003";
const WAREHOUSE = "EMP008";

const SNAP = {
  qt: JSON.stringify(RAW_QT),
  sr: JSON.stringify(RAW_SR),
  so: JSON.stringify(RAW_SO),
  pick: JSON.stringify(RAW_PICK),
  pack: JSON.stringify(RAW_PACK),
  do: JSON.stringify(RAW_DO),
  shp: JSON.stringify(RAW_SHP),
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
  restore(PACKING_TASKS, SNAP.pack);
  restore(DELIVERY_ORDERS, SNAP.do);
  restore(SHIPMENTS, SNAP.shp);
  restore(NOTIFY_ITEMS, SNAP.notify);
  restore(BUSINESS_PARTNERS, SNAP.bp);
  decorateBPs();
  decorateOutbound();
  decorateShipments();
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
    /* For dialogs whose answer has to be typed rather than defaulted. */
    getModal: () => modal as unknown as { body: () => ReactNode; onConfirm: () => boolean | void },
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

/**
 * Raise the shipment a delivery order hands over to.
 *
 * There is no workflow function for this — a shipment is only ever created
 * through the form — so the walk drives `SHP_FORM.save()`, which is the same
 * code path the New Shipment screen runs. Worth knowing: that save is also
 * where the invoice's `shipmentRef` is written, so a shortcut around it would
 * skip the very link N9 exists to create.
 */
function shipFromDelivery(doCode: string, ctx: ActionCtx): ShpRow {
  const head = headerFromDO(doCode);
  expect(head, `delivery order ${doCode} must be shippable`).toBeTruthy();

  const state = {
    ...(SHP_FORM.blank!() as Record<string, unknown>),
    ...head,
    doRef: doCode,
    items: shippableLinesFrom(doCode),
  };
  SHP_FORM.save!(state as never, ctx as never);
  decorateShipments();

  const s = SHIPMENTS.find((x) => x.doRef === doCode);
  expect(s, "the form must have written a shipment").toBeTruthy();
  return s!;
}

/**
 * Type a tracking number into the dialog the workflow opened.
 *
 * The modal seeds its state when it opens, so the value has to arrive through
 * the field rather than by writing to the shipment afterwards — which is also
 * the path a real user takes.
 */
async function answerTracking(
  modal: { body: () => ReactNode; onConfirm: () => boolean | void },
  value: string,
) {
  const user = userEvent.setup();
  const { unmount } = render(<>{modal.body()}</>);
  const field = screen.getByLabelText("เลขพัสดุ");
  await user.clear(field);
  await user.type(field, value);
  const result = modal.onConfirm();
  unmount();
  return result;
}

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

    /* ---------- The warehouse picks what there is ----------
       And it is the warehouse that does it: since N8 the sales desk holds
       picking and packing read-only, so closing the sheet from the admin's
       chair is refused. */
    soCreatePick(so, ctx);
    decorateOutbound();
    const pick = PICKING_TASKS.find((p) => p.soRef === so.code)!;

    pickComplete(pick, ctx);
    expect(pick.status, "the admin may watch the pick, not close it").not.toBe("Completed");

    sitAs(WAREHOUSE);
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

/* ============================================================
   THE WHOLE RELAY, END TO END

   Quotation to tracking number, changing chairs at every point
   where the business changes hands. Nothing below calls a
   workflow as the wrong person: where a chair cannot do a step,
   the test proves it is refused before the right chair does it.
   ============================================================ */

describe("Journey — quotation to tracking, four chairs", () => {
  it("walks the whole relay and refuses every shortcut on the way", async () => {
    const { ctx, answerModal, getModal } = walkCtx();
    const { code: product } = stocked();

    /* ---------- 1. The rep raises it ---------- */
    sitAs(REP);
    const qt = raiseQuote(product, 4, 900);
    qtSubmit(qt, ctx);
    expect(qt.status, "the rep can ask, not decide").toBe("Pending Approval");

    /* The rep cannot approve their own quotation. */
    qtApprove(qt, ctx);
    expect(qt.status, "still waiting — the rep holds no approve right").toBe(
      "Pending Approval",
    );

    /* ---------- 2. The admin approves and converts ---------- */
    sitAs(ADMIN);
    qtApprove(qt, ctx);
    expect(qt.status).toBe("Approved");

    /* ---------- 3. Back to the rep, who owns the customer ----------
       Sending the sheet, hearing yes, and turning it into a request are the
       salesperson's moves — see §6 of the roles spec. It matters beyond
       tidiness: the request's author is who the system treats as the order's
       owner from here on, and it is their customer, so it must be them. */
    sitAs(REP);
    qtSend(qt, ctx);
    qtAccept(qt, ctx);
    expect(qt.status).toBe("Accepted");

    qtConvert(qt, ctx);
    decorateOutbound();
    const sr = SALES_REQUESTS.find((r) => r.code === qt.srRef)!;
    expect(sr, "a quotation becomes a request, not an order").toBeTruthy();
    expect(sr.createdBy, "raised by the rep whose customer it is").toBe(actingUserName());

    srSubmit(sr, ctx);

    /* ---------- 4. The admin signs it ---------- */
    sitAs(ADMIN);
    srApprove(sr, ctx);
    expect(sr.status).toBe("Approved");

    srConvert(sr, ctx);
    decorateOutbound();
    const so = SALES_ORDERS.find((s) => s.code === sr.soRef)!;
    expect(so, "and the request becomes the order").toBeTruthy();

    if (so.status === "On Hold") soApproveCredit(so, ctx);
    soConfirm(so, ctx);
    if (so.status !== "Confirmed") answerModal();
    expect(so.status).toBe("Confirmed");

    soCreatePick(so, ctx);
    decorateOutbound();
    const pick = PICKING_TASKS.find((p) => p.soRef === so.code)!;
    expect(pick, "a confirmed order produces warehouse work").toBeTruthy();

    /* The admin may watch the pick and may not close it. */
    pickComplete(pick, ctx);
    expect(pick.status, "picking belongs to the floor").not.toBe("Completed");

    /* ---------- 5. The warehouse does the physical work ---------- */
    sitAs(WAREHOUSE);
    pickStart(pick, ctx);
    for (const l of pick.items) l.picked = l.ordered;
    decorateOutbound();
    pickComplete(pick, ctx);
    expect(pick.status).toBe("Completed");

    pickCreatePack(pick, ctx);
    decorateOutbound();
    const pack = PACKING_TASKS.find((p) => p.pickRef === pick.code)!;
    expect(pack, "a completed pick produces a pack").toBeTruthy();

    packStart(pack, ctx);
    for (const l of pack.items) l.packedQty = l.qty;
    pack.packages = [
      { box: "BOX-1", type: "กล่องกระดาษ", weight: 4, dim: "40x30x30", sealNo: "", note: "" },
    ] as typeof pack.packages;
    decorateOutbound();
    packComplete(pack, ctx);
    expect(pack.status).toBe("Completed");

    /* The step N8 exists for: the floor states what will actually ship. */
    packConfirmShipQty(pack, ctx);
    answerModal();
    decorateOutbound();
    expect(pack.isConfirmed, "the warehouse has answered every line").toBe(true);

    /* And stops there — raising the customer's paperwork is not its job. */
    packCreateDelivery(pack, ctx);
    expect(
      DELIVERY_ORDERS.some((d) => d.packRef === pack.code),
      "the warehouse holds no delivery-order rights",
    ).toBe(false);

    /* ---------- 6. Back to the admin for the paperwork ---------- */
    sitAs(ADMIN);
    packCreateDelivery(pack, ctx);
    decorateOutbound();
    const dobj = DELIVERY_ORDERS.find((d) => d.packRef === pack.code)!;
    expect(dobj, "the sales desk raises the delivery note").toBeTruthy();
    expect(dobj.items[0].qty, "built from what the warehouse confirmed").toBe(
      pack.items[0].confirmedQty,
    );

    doConfirmDelivery(dobj, ctx);
    decorateOutbound();
    expect(so.status, "delivered in full closes the order").toBe("Completed");

    /* ---------- 7. The parcel, and the number that finds it ---------- */
    const shipment = shipFromDelivery(dobj.code, ctx);
    expect(shipment.doRef).toBe(dobj.code);

    shipment.status = "Dispatched";
    shpSetTrackingNo(shipment, ctx);
    await answerTracking(getModal(), "RELAY-0001");
    expect(shipment.trackingNo).toBe("RELAY-0001");

    /* ---------- 8. And it all leads back to the sheet the customer saw ---- */
    const steps = traceFromTracking("RELAY-0001");
    expect(steps.map((s) => s.entity)).toEqual([
      "shipment",
      "delivery-order",
      "sales-order",
      "sales-request",
      "quotation",
    ]);
    expect(steps.at(-1)!.code, "the quotation this all started as").toBe(qt.code);

    /* ---------- 9. The rep hears about it, and never from themselves ---- */
    sitAs(REP);
    const inbox = myInbox();
    expect(
      inbox.some((t) => t.includes(shipment.code)),
      "the salesperson is told their customer's goods left",
    ).toBe(true);

    sitAs(ADMIN);
    expect(
      myInbox().some((t) => t.includes(shipment.code)),
      "and the person who entered it is not told their own news",
    ).toBe(false);
  });
});
