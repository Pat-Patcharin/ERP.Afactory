import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { USERS } from "@/data/admin";
import { PRINT_CONFIGS, buildPrintJob } from "@/lib/print";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
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
  applyCustomer,
  applyProduct,
  blankDraft,
  blankLine,
  draftFromQuotation,
  draftPrintDoc,
  saveQuotationDraft,
} from "@/lib/domain/quotation-draft";
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
  qtSend,
  qtSubmit,
  soConfirm,
  soCreatePick,
  srApprove,
  srConvert,
  srSubmit,
} from "@/lib/workflows-outbound";

/* ============================================================
   THE ADDRESS ON THE PAPER IS THE ADDRESS THE LORRY GOES TO

   A customer orders once for a new branch. The salesperson
   picks that address on the quotation, prints it, and the
   customer sees the branch. Then:

     save                    the record had nowhere to put it
     print again             the sheet says head office
     convert to an order     shipTo was the literal ""
     pack, deliver           the note falls back to the master

   Nobody typed the wrong thing. The address existed only in the
   editor's memory, so every document after the preview quietly
   substituted whatever the partner master held — and the goods
   go where the delivery note says.

   `shipInstruction` is worse in one respect: "ส่งเช้าเท่านั้น"
   has no fallback to substitute. It was simply gone.

   Same shape as A1, which is the point: the editor collects a
   field, the record does not have it, and the difference only
   shows up on paper somebody has already acted on.
   ============================================================ */

const BRANCH = {
  shipName: "คลินิกทันตกรรม สาขาลาดพร้าว",
  shipAddress: "1191/2 ถนนลาดพร้าว แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900",
  shipContact: "คุณมานี ใจดี",
  shipPhone: "081-234-5678",
  shipInstruction: "ส่งเช้าเท่านั้น 08:00–11:00 · โทรก่อนถึง 30 นาที",
};

const SNAP = {
  qt: JSON.stringify(QUOTATIONS),
  sr: JSON.stringify(SALES_REQUESTS),
  so: JSON.stringify(SALES_ORDERS),
  pick: JSON.stringify(PICKING_TASKS),
  pack: JSON.stringify(PACKING_TASKS),
  do: JSON.stringify(DELIVERY_ORDERS),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

const journeyCtx = () => {
  let modal: { onConfirm?: () => boolean | void } | null = null;
  return {
    getModal: () => modal!,
    ctx: {
      goto: () => {},
      openEntity: () => {},
      toast: () => {},
      confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
      formModal: (o: { onConfirm?: () => boolean | void }) => {
        modal = o;
      },
      refresh: () => {},
      quickView: () => {},
      panel: () => {},
    } as never,
  };
};

const asRole = (roleCode: string) =>
  setCurrentUser(USERS.find((u) => u.roleCode === roleCode && u.status === "Active")!.code);

/** A quotation for one line, delivered somewhere other than the billing address. */
function raiseQuotationToBranch() {
  const bp = outboundCustomers().find((b) => b.status === "Active" && b.billType !== "Non VAT")!;
  const draft = applyCustomer(blankDraft(), `${bp.code} - ${bp.nameTh}`);
  draft.salesRep = draft.salesRep || "SALE001 - Patcharin Thiengkaew";
  draft.items = [{ ...applyProduct(blankLine(), "AA-TH003-WL"), qty: 10, price: 500, disc: 0, tax: 7 }];
  Object.assign(draft, { sameAsBill: false, ...BRANCH });
  const res = saveQuotationDraft(draft, { issue: true });
  expect(res.blocked, "the quotation should save").toBeUndefined();
  return { draft, qt: QUOTATIONS.find((q) => q.code === res.code)! };
}

describe("a one-off delivery address survives being saved", () => {
  beforeEach(() => {
    restore(QUOTATIONS, SNAP.qt);
    restore(SALES_REQUESTS, SNAP.sr);
    restore(SALES_ORDERS, SNAP.so);
    decorateOutbound();
    asRole("SALES_REP");
  });
  afterEach(resetCurrentUser);

  it("prints the same address from the editor and from the store", () => {
    const { draft, qt } = raiseQuotationToBranch();

    const preview = draftPrintDoc(draft, PRINT_CONFIGS.quotation).shipTo;
    const stored = buildPrintJob("quotation", qt.code)!.doc.shipTo;

    expect(stored.address, "the branch, not head office").toBe(BRANCH.shipAddress);
    expect(stored.address).toBe(preview.address);
    expect(stored.contact).toBe(preview.contact);
    expect(stored.phone).toBe(preview.phone);
    expect(stored.instruction).toBe(BRANCH.shipInstruction);
    /* And it is genuinely a different address from the customer's own, or the
       assertions above would pass on a document that lost it. */
    expect(stored.address).not.toBe(buildPrintJob("quotation", qt.code)!.doc.billTo.address);
  });

  it("reopens for editing with the address still on it", () => {
    const { qt } = raiseQuotationToBranch();
    const reopened = draftFromQuotation(qt);

    expect(reopened.sameAsBill).toBe(false);
    expect(reopened.shipAddress).toBe(BRANCH.shipAddress);
    expect(reopened.shipInstruction).toBe(BRANCH.shipInstruction);
    /* The round trip: saving what was reopened must not wipe it. */
    saveQuotationDraft(reopened);
    expect(QUOTATIONS.find((q) => q.code === qt.code)!.shipAddress).toBe(BRANCH.shipAddress);
  });
});

describe("the address and the instruction reach the warehouse", () => {
  beforeEach(() => {
    restore(QUOTATIONS, SNAP.qt);
    restore(SALES_REQUESTS, SNAP.sr);
    restore(SALES_ORDERS, SNAP.so);
    restore(PICKING_TASKS, SNAP.pick);
    restore(PACKING_TASKS, SNAP.pack);
    restore(DELIVERY_ORDERS, SNAP.do);
    decorateOutbound();
    resetCurrentUser();
  });
  afterEach(resetCurrentUser);

  it("carries both from the quotation to the delivery note", () => {
    const { ctx, getModal } = journeyCtx();

    asRole("SALES_REP");
    const { qt } = raiseQuotationToBranch();
    qtSubmit(qt, ctx);
    asRole("SALES_MANAGER");
    qtApprove(qt, ctx);
    qtSend(qt, ctx);
    qtAccept(qt, ctx);
    qtConvert(qt, ctx);
    decorateOutbound();

    const sr = SALES_REQUESTS.find((r) => r.code === qt.srRef)!;
    expect(sr.shipAddress, "the request").toBe(BRANCH.shipAddress);
    expect(sr.shipInstruction).toBe(BRANCH.shipInstruction);

    asRole("SALES_ADMIN");
    srSubmit(sr, ctx);
    srApprove(sr, ctx);
    srConvert(sr, ctx);
    decorateOutbound();

    const so = SALES_ORDERS.find((s) => s.code === sr.soRef)!;
    expect(so.shipTo, "the order — this was hard-coded to an empty string").toBe(
      BRANCH.shipAddress,
    );
    expect(so.shipContact).toBe(BRANCH.shipContact);
    expect(so.shipPhone).toBe(BRANCH.shipPhone);
    expect(so.shipInstruction).toBe(BRANCH.shipInstruction);

    /* ---- Out through the warehouse ---- */
    soConfirm(so, ctx);
    so.status = "Confirmed";
    soCreatePick(so, ctx);
    decorateOutbound();
    const pick = PICKING_TASKS.find((p) => p.soRef === so.code)!;

    asRole("WAREHOUSE_STAFF");
    pickStart(pick, ctx);
    for (const l of pick.items) l.picked = l.ordered;
    decorateOutbound();
    pickComplete(pick, ctx);
    pickCreatePack(pick, ctx);
    decorateOutbound();

    const pack = PACKING_TASKS.find((p) => p.pickRef === pick.code)!;
    packStart(pack, ctx);
    for (const l of pack.items) l.packedQty = l.qty;
    pack.packages = [
      { box: "BOX-1", type: "กล่องกระดาษ", weight: 5, dim: "40x30x30", sealNo: "", note: "" },
    ];
    decorateOutbound();
    packComplete(pack, ctx);
    packConfirmShipQty(pack, ctx);
    getModal().onConfirm!();
    decorateOutbound();

    asRole("SALES_ADMIN");
    packCreateDelivery(pack, ctx);
    decorateOutbound();

    const dobj = DELIVERY_ORDERS.find((d) => d.soRef === so.code)!;
    expect(dobj.shipTo, "the delivery note").toBe(BRANCH.shipAddress);
    expect(dobj.contact).toBe(BRANCH.shipContact);
    expect(dobj.phone).toBe(BRANCH.shipPhone);

    /* The sheet the driver holds. This is the end of the line and the only
       assertion here that a warehouse actually acts on. */
    const printed = buildPrintJob("delivery-order", dobj.code)!.doc;
    expect(printed.shipTo.address).toBe(BRANCH.shipAddress);
    expect(printed.shipTo.instruction).toBe(BRANCH.shipInstruction);
  });
});
