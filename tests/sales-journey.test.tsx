import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { USERS } from "@/data/admin";
import { BUSINESS_PARTNERS, decorateBPs } from "@/lib/domain/partner";
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
import { billableLinesFrom, headerFromSource } from "@/lib/domain/invoice";
import { priceMasterRows } from "@/lib/domain/price-master";
import { displayName } from "@/lib/domain/lines";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import {
  applyCustomer,
  applyProduct,
  blankDraft,
  blankLine,
  saveQuotationDraft,
} from "@/lib/domain/quotation-draft";
import {
  applyQuotation,
  blankSrDraft,
  saveSalesRequestDraft,
} from "@/lib/domain/sales-request-draft";
import {
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
  qtRequestEdit,
  qtSend,
  qtSubmit,
  soConfirm,
  soCreatePick,
  srApprove,
  srConvert,
  srSubmit,
} from "@/lib/workflows-outbound";
import { buildPrintJob, printTypesFor } from "@/lib/print";

/* ============================================================
   THE WHOLE JOURNEY, END TO END

   Every step of this rework has tests of its own. What none of
   them prove is that the steps join up — that a name typed on a
   quotation is still on the invoice eight documents later, that
   the older route through a sales request still arrives, and
   that each guard refuses the thing it was built to refuse.

   Three walks: the direct route, the request route, and a route
   where everything that can object, objects.

   These are journeys, not unit tests. Nothing here re-checks a
   rule that already has its own file; what is asserted at each
   hop is only what that hop was supposed to carry.
   ============================================================ */

/* ---------- Fixtures ---------- */

/* The domain modules re-export the mock arrays themselves, so a snapshot taken
   here is the whole mutable world these workflows write to. */
const SNAP = {
  qt: JSON.stringify(QUOTATIONS),
  sr: JSON.stringify(SALES_REQUESTS),
  so: JSON.stringify(SALES_ORDERS),
  pick: JSON.stringify(PICKING_TASKS),
  pack: JSON.stringify(PACKING_TASKS),
  do: JSON.stringify(DELIVERY_ORDERS),
  bp: JSON.stringify(BUSINESS_PARTNERS),
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
  restore(BUSINESS_PARTNERS, SNAP.bp);
  decorateBPs();
  decorateOutbound();
  resetCurrentUser();
});

/** Auto-confirms, so a walk reads as the sequence of acts, not of clicks. */
function journeyCtx() {
  const toasts: { title: string; message?: string; tone?: string }[] = [];
  let modal: { body: () => ReactNode; onConfirm?: () => boolean | void } | null = null;
  return {
    toasts,
    lastToast: () => toasts[toasts.length - 1],
    getModal: () => modal!,
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
    } as never,
  };
}

const asRole = (roleCode: string) =>
  setCurrentUser(USERS.find((u) => u.roleCode === roleCode && u.status === "Active")!.code);

const REP = "SALE001 - Patcharin Thiengkaew";

/** A customer we may sell to, whose record is confirmed, billed with VAT. */
const vatCustomer = () => {
  const bp = outboundCustomers().find((b) => b.status === "Active" && b.billType !== "Non VAT")!;
  return { bp, pick: `${bp.code} - ${bp.nameTh}` };
};

/** A product in the catalogue the editor prices from. */
const PRODUCT = "AA-TH003-WL";
const CUSTOM_NAME = "ชุดวัสดุอุดฟันสำหรับคลินิกสาขาใหม่";
const LINE_NOTE = "รับประกัน 2 ปี";

/** Raise a quotation the way the editor does, and return the stored record. */
function raiseQuotation(over: { customerPick?: string } = {}) {
  const draft = applyCustomer(blankDraft(), over.customerPick ?? vatCustomer().pick);
  draft.salesRep = draft.salesRep || REP;
  draft.items = [
    {
      ...applyProduct(blankLine(), PRODUCT),
      qty: 10,
      price: 500,
      disc: 0,
      tax: 7,
      customName: CUSTOM_NAME,
      note: LINE_NOTE,
      showOnBill: true,
    },
  ];
  const res = saveQuotationDraft(draft, { issue: true });
  expect(res.blocked, "the quotation should save").toBeUndefined();
  return QUOTATIONS.find((q) => q.code === res.code)!;
}

/**
 * A quotation for one price-master line, priced as given.
 *
 * Kept separate from `raiseQuotation` because these lines name a product the
 * price master knows rather than one the product catalogue does — which is the
 * only way the floor rule has anything to compare against today.
 */
function raiseQuotationFor(code: string, name: string, price: number) {
  const draft = applyCustomer(blankDraft(), vatCustomer().pick);
  draft.salesRep = REP;
  draft.items = [{ ...blankLine(), code, name, qty: 1, price, disc: 0, tax: 7 }];
  const res = saveQuotationDraft(draft, { issue: true });
  expect(res.blocked, "the quotation should save").toBeUndefined();
  return QUOTATIONS.find((q) => q.code === res.code)!;
}

/** Draft → Accepted, which is where both routes to an order begin. */
function takeToAccepted(qt: ReturnType<typeof raiseQuotation>, ctx: never) {
  asRole("SALES_REP");
  qtSubmit(qt, ctx);
  asRole("SALES_MANAGER");
  qtApprove(qt, ctx);
  qtSend(qt, ctx);
  qtAccept(qt, ctx);
  expect(qt.status, "the customer has said yes").toBe("Accepted");
}

/* ============================================================
   LINE A — the direct route
   ============================================================ */

describe("Journey A — quotation through a sales request and out the door", () => {
  it("carries the customer, the price and the wording from quote to invoice", () => {
    const { bp } = vatCustomer();
    const { ctx, getModal } = journeyCtx();

    /* ---- Quotation ---- */
    asRole("SALES_REP");
    const qt = raiseQuotation();
    expect(qt.customerCode).toBe(bp.code);
    expect(qt.billType, "taken from the customer, not typed again").toBe(bp.billType);

    qtSubmit(qt, ctx);
    expect(qt.status).toBe("Pending Approval");

    asRole("SALES_MANAGER");
    qtApprove(qt, ctx);
    expect(qt.status).toBe("Approved");
    expect(qt.approvedBy, "the sheet has to be able to name its approver").toBeTruthy();

    qtSend(qt, ctx);
    expect(qt.status).toBe("Sent");
    qtAccept(qt, ctx);
    expect(qt.status).toBe("Accepted");

    /* ---- Sales request ----
       An accepted quote does not become an order by itself. What the customer
       agreed and what the company will actually fulfil are two decisions, and
       the request is where the second one is made. */
    qtConvert(qt, ctx);
    decorateOutbound();
    expect(qt.status).toBe("Converted");
    expect(qt.srRef, "an accepted quote becomes a request").toBeTruthy();
    expect(qt.soRef, "never an order directly").toBe("");

    const sr = SALES_REQUESTS.find((r) => r.code === qt.srRef)!;
    expect(sr, "the request the quotation produced").toBeTruthy();
    expect(sr.customerCode).toBe(qt.customerCode);
    expect(sr.quotationRef, "the request knows where it came from").toBe(qt.code);
    expect(sr.billType, "how it bills follows the paper the customer agreed").toBe(qt.billType);
    expect(sr.items[0].price, "at the price they agreed").toBe(qt.items[0].price);

    /* ---- Sales order ---- */
    asRole("SALES_ADMIN");
    srSubmit(sr, ctx);
    srApprove(sr, ctx);
    expect(sr.status).toBe("Approved");
    srConvert(sr, ctx);
    decorateOutbound();
    expect(sr.status).toBe("Converted");

    const so = SALES_ORDERS.find((s) => s.code === sr.soRef)!;
    expect(so, "the order the request produced").toBeTruthy();
    expect(so.customerCode).toBe(qt.customerCode);
    expect(so.srRef, "the order knows where it came from").toBe(sr.code);
    expect(so.billType).toBe(qt.billType);
    expect(so.items[0].qty).toBe(qt.items[0].qty);
    expect(so.items[0].price).toBe(qt.items[0].price);
    expect(so.items[0].customName, "the wording travels with the price").toBe(CUSTOM_NAME);
    expect(so.items[0].note).toBe(LINE_NOTE);

    /* ---- Warehouse ---- */
    soConfirm(so, ctx);
    expect(so.status, "confirmed, or held for credit — not still a draft").not.toBe("Draft");
    so.status = "Confirmed";

    soCreatePick(so, ctx);
    decorateOutbound();
    const pick = PICKING_TASKS.find((p) => p.soRef === so.code)!;
    expect(pick, "a confirmed order produces a pick").toBeTruthy();
    expect(pick.items[0].note, "the floor is told what was promised").toBe(LINE_NOTE);

    asRole("WAREHOUSE_STAFF");
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
      { box: "BOX-1", type: "กล่องกระดาษ", weight: 5, dim: "40x30x30", sealNo: "", note: "" },
    ];
    decorateOutbound();
    packComplete(pack, ctx);
    expect(pack.status).toBe("Completed");

    /* The warehouse says what can actually go. Everything was picked in full
       here, so the defaults carry through — but the step is not optional and
       the delivery note below is refused without it. */
    packConfirmShipQty(pack, ctx);
    getModal().onConfirm!();
    decorateOutbound();
    expect(pack.isConfirmed, "the warehouse has answered every line").toBe(true);

    /* ---- Delivery — back at the sales desk ---- */
    asRole("SALES_ADMIN");
    packCreateDelivery(pack, ctx);
    decorateOutbound();
    const dobj = DELIVERY_ORDERS.find((d) => d.soRef === so.code)!;
    expect(dobj, "packing produces the delivery note").toBeTruthy();
    expect(dobj.customerCode).toBe(qt.customerCode);
    expect(dobj.items[0].customName, "read from the order, not from the pack chain").toBe(
      CUSTOM_NAME,
    );
    expect(dobj.items[0].note).toBe(LINE_NOTE);

    for (const l of dobj.items) l.delivered = l.qty;

    /* ---- Invoice ---- */
    const header = headerFromSource("Delivery Order", dobj.code)!;
    expect(header.customerCode).toBe(qt.customerCode);
    expect(header.soRef).toBe(so.code);

    const invLines = billableLinesFrom("Delivery Order", dobj.code);
    const billed = invLines.find((l) => l.code === qt.items[0].code)!;
    expect(billed, "the line reaches the bill").toBeTruthy();
    expect(billed.unitPrice, "at the price the quotation agreed").toBe(qt.items[0].price);
    expect(billed.invoiceQty).toBe(qt.items[0].qty);
    expect(billed.customName, "still carrying the customer's own wording").toBe(CUSTOM_NAME);
    expect(billed.note).toBe(LINE_NOTE);
    expect(billed.taxRate, "a VAT order bills at its line rate").toBe(7);
    expect(displayName(billed), "and that is the name the bill prints").toBe(CUSTOM_NAME);
  });
});

/* ============================================================
   LINE B — the older route still arrives
   ============================================================ */

describe("Journey B — quotation through a sales request", () => {
  it("still reaches a sales order, carrying the same lines", () => {
    const { ctx } = journeyCtx();
    asRole("SALES_REP");
    const qt = raiseQuotation();
    takeToAccepted(qt, ctx);

    /* The request is raised in the request editor from the accepted quote —
       qtConvert no longer offers this route, it goes straight to an order. */
    asRole("SALES_REP");
    const draft = applyQuotation(blankSrDraft(), qt.code);
    draft.salesRep = draft.salesRep || REP;
    const saved = saveSalesRequestDraft(draft);

    const sr = SALES_REQUESTS.find((r) => r.code === saved.code)!;
    expect(sr, "the request the quotation produced").toBeTruthy();
    expect(sr.quotationRef).toBe(qt.code);
    expect(sr.customerCode).toBe(qt.customerCode);
    expect(sr.billType, "the request inherits how the quote was billed").toBe(qt.billType);
    expect(sr.items[0].qty).toBe(qt.items[0].qty);
    expect(sr.items[0].price).toBe(qt.items[0].price);
    expect(sr.items[0].customName).toBe(CUSTOM_NAME);

    /* And the quotation closes onto the request the moment it is raised. */
    expect(QUOTATIONS.find((q) => q.code === qt.code)!.srRef).toBe(sr.code);
    expect(qt.status).toBe("Converted");

    srSubmit(sr, ctx);
    expect(sr.status).toBe("Submitted");

    asRole("SALES_MANAGER");
    srApprove(sr, ctx);
    expect(sr.status).toBe("Approved");

    srConvert(sr, ctx);
    decorateOutbound();
    expect(sr.status).toBe("Converted");

    const so = SALES_ORDERS.find((s) => s.code === sr.soRef)!;
    expect(so, "the request route still produces an order").toBeTruthy();
    expect(so.srRef, "this route records the request").toBe(sr.code);
    expect(so.customerCode).toBe(qt.customerCode);
    expect(so.billType).toBe(qt.billType);
    expect(so.items[0].price).toBe(qt.items[0].price);
    expect(so.items[0].customName, "the wording survives the extra hop").toBe(CUSTOM_NAME);
  });
});

/* ============================================================
   LINE C — the route where everything objects
   ============================================================ */

describe("Journey C — every obstacle, in the order it would be met", () => {
  it("lets an unconfirmed partner be quoted and requested, but not ordered", () => {
    const { ctx, lastToast } = journeyCtx();
    const bp = outboundCustomers().find((b) => b.status === "Active" && b.billType !== "Non VAT")!;
    bp.status = "Draft";
    decorateBPs();

    /* Neither a quotation nor a request binds anybody, so both are allowed —
       which is the point of the rule: a salesperson can work all afternoon
       without waiting on an administrator to check a tax ID. */
    asRole("SALES_REP");
    const qt = raiseQuotation({ customerPick: `${bp.code} - ${bp.nameTh}` });
    expect(qt.customerCode).toBe(bp.code);
    takeToAccepted(qt, ctx);

    qtConvert(qt, ctx);
    decorateOutbound();
    expect(qt.status, "the request is open to a draft partner").toBe("Converted");
    const sr = SALES_REQUESTS.find((r) => r.code === qt.srRef)!;
    expect(sr).toBeTruthy();

    /* The order is the document that binds, so that is where it stops. */
    asRole("SALES_ADMIN");
    srSubmit(sr, ctx);
    srApprove(sr, ctx);
    srConvert(sr, ctx);

    expect(sr.status, "approved, but it cannot become an order").toBe("Approved");
    expect(sr.soRef).toBe("");
    expect(lastToast().tone).toBe("danger");
    expect(lastToast().message, "and it says what can be done instead").toContain("ใบเสนอราคา");
  });

  it("escalates a price below the floor, and refuses the rep their own signature", () => {
    const { ctx } = journeyCtx();
    asRole("SALES_REP");

    /* A code the price master actually knows, so the floor rule has something
       to compare against — see the note at the foot of this file. */
    const row = priceMasterRows().find((r) => r.status === "OK" && r.price_last)!;
    const qt = raiseQuotationFor(row.product_code, row.product_name, row.price_last! - 1);

    qtSubmit(qt, ctx);
    expect(qt.status).toBe("Pending Approval");
    expect(qt.priceApprovalLevel, "below the floor asks for the manager").toBe("manager");

    /* The rep who raised it cannot sign it off. */
    qtApprove(qt, ctx);
    expect(qt.status, "not signed by the person who wrote it").toBe("Pending Approval");

    asRole("SALES_MANAGER");
    qtApprove(qt, ctx);
    expect(qt.status).toBe("Approved");
  });

  it("will not convert a quotation twice, whichever route the first one took", () => {
    /* Some orders in the book were raised straight from a quotation, back
       when that was allowed. Those records still carry `soRef`, still have to
       open, and must not be converted a second time now that the route is a
       request — which would give one quotation two children. */
    const { ctx, lastToast } = journeyCtx();
    asRole("SALES_REP");
    const qt = raiseQuotation();
    takeToAccepted(qt, ctx);

    /* Standing in for one of the legacy records. */
    qt.soRef = "SO2506-0005";

    asRole("SALES_ADMIN");
    qtConvert(qt, ctx);

    expect(qt.srRef, "no request was raised").toBe("");
    expect(qt.status, "and the quotation was left alone").toBe("Accepted");
    expect(lastToast().message).toContain("SO2506-0005");
  });

  it("refuses to submit a quotation for a product whose cost nobody has set", () => {
    const { ctx, lastToast } = journeyCtx();
    asRole("SALES_REP");

    const row = priceMasterRows().find((r) => r.product_code && !r.cost_thb)!;
    const qt = raiseQuotationFor(row.product_code, row.product_name, 999);

    qtSubmit(qt, ctx);

    expect(qt.status, "still a draft — blocked, not escalated").toBe("Draft");
    expect(lastToast().message, "and it says where to fix it").toContain("ทะเบียนสินค้า");
  });

  it("seals an approved quotation, and reopens it only as a new revision", async () => {
    const user = userEvent.setup();
    const { ctx, getModal } = journeyCtx();
    asRole("SALES_REP");
    const qt = raiseQuotation();

    qtSubmit(qt, ctx);
    asRole("SALES_MANAGER");
    qtApprove(qt, ctx);

    /* Sealed at the write, so it holds for autosave and for a stale tab. */
    const before = JSON.stringify(qt.items);
    const blocked = saveQuotationDraft(
      { ...applyCustomer(blankDraft(), vatCustomer().pick), code: qt.code },
      { issue: true },
    );
    expect(blocked.blocked, "an approved quotation refuses the write").toBeTruthy();
    expect(JSON.stringify(qt.items), "and nothing was written").toBe(before);

    /* The way back in is a revision, and it costs a reason. */
    asRole("SALES_REP");
    qtRequestEdit(qt, ctx);
    render(<>{getModal().body()}</>);
    await user.type(screen.getByLabelText("เหตุผลที่ขอแก้ไข"), "ลูกค้าขอเปลี่ยนจำนวน");
    getModal().onConfirm!();

    expect(qt.status).toBe("Draft");
    expect(qt.revision).toBe(2);
    expect(qt.approvalStatus, "the new issue starts its approval over").toBe("Not Submitted");
    expect(qt.approvedBy, "and carries no stamp from the old one").toBe("");
    expect(qt.revisions).toHaveLength(1);
    expect(qt.revisions[0].revision).toBe(1);
    expect(qt.revisions[0].closedReason).toBe("ลูกค้าขอเปลี่ยนจำนวน");

    /* Editable again, and this time the write goes through. */
    const reopened = saveQuotationDraft(
      { ...applyCustomer(blankDraft(), vatCustomer().pick), code: qt.code },
      {},
    );
    expect(reopened.blocked, "a draft takes writes again").toBeUndefined();
  });

  it("keeps a Non VAT quotation at zero tax and off the VAT form", () => {
    asRole("SALES_REP");
    const bp = outboundCustomers().find((b) => b.billType === "Non VAT")!;
    const qt = raiseQuotation({ customerPick: `${bp.code} - ${bp.nameTh}` });

    expect(qt.billType).toBe("Non VAT");
    for (const l of qt.items) {
      expect(l.tax, "no tax on any line, whatever was typed").toBe(0);
    }

    /* The 7% typed into the draft above never reaches a form that shows tax. */
    expect(printTypesFor("quotation", qt)).toEqual(["quotation-non-vat"]);

    const job = buildPrintJob("quotation-non-vat", qt.code)!;
    expect(job.config.showTax).toBe(false);
    expect(job.doc.totals!.vat).toBe(0);
  });
});

/* ============================================================
   WHAT WALKING THE LINE SHOWED

   Two things, both recorded where they belong rather than
   papered over here: the price-master code mismatch (backlog 11)
   and the fact that no role in the current matrix can actually
   be refused at the manager level. The tests above use a real
   price-master code, and the rep's own lack of `approve`,
   precisely so that what they assert is true today.
   ============================================================ */
