import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { USERS } from "@/data/admin";
import { INV_FORM } from "@/schemas/forms/sales-invoice";
import { SO_FORM } from "@/schemas/forms/sales-order";
import { PRINT_CONFIGS, buildPrintJob } from "@/lib/print";
import type { PrintTotals } from "@/lib/print";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import {
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
  decorateOutbound,
  outboundCustomers,
  soTotal,
} from "@/lib/domain/outbound";
import {
  SALES_INVOICES,
  billableLinesFrom,
  chargesFromSource,
  headerFromSource,
  invoiceTotals,
} from "@/lib/domain/invoice";
import {
  applyCustomer,
  applyProduct,
  blankDraft,
  blankLine,
} from "@/lib/domain/quotation-draft";
import {
  qtAccept,
  qtApprove,
  qtConvert,
  qtSend,
  qtSubmit,
  srApprove,
  srConvert,
  srSubmit,
} from "@/lib/workflows-outbound";
import {
  draftFromQuotation,
  draftPrintDoc,
  saveQuotationDraft,
} from "@/lib/domain/quotation-draft";
import {
  draftFromSalesRequest,
  saveSalesRequestDraft,
  srPrintDoc,
} from "@/lib/domain/sales-request-draft";
import {
  draftFromPurchaseRequest,
  prPrintDoc,
  savePurchaseRequestDraft,
} from "@/lib/domain/purchase-request-draft";
import { getQT, getSR, qtTotal, srTotal } from "@/lib/domain/outbound";
import { getPR, prTotal } from "@/lib/domain/purchase";

/* ============================================================
   THE SAME DOCUMENT, TWICE, FOR THE SAME MONEY

   Header discount, freight and other charges were editable in
   the totals panel and printed on the sheet, and the record had
   nowhere to put them. So:

     type freight 500 · preview prints 21,400
     save · print again    · the sheet says 20,900

   Nobody did anything wrong. The salesperson showed the customer
   a preview, saved, printed the real thing and sent it. The
   customer received a figure they had not agreed to.

   There were two causes and both had to go. The record could not
   hold the fields — fixed by storing them. And the print engine
   had a second totals formula for stored documents,
   `docGrandTotal`, which adds the lines and stops. Storing the
   fields without collapsing the formulas would have fixed the
   symptom for exactly as long as it took somebody to print.

   So the test is not "are the fields saved". It is the property
   the salesperson actually needs: PRINT THE SAME DOCUMENT BEFORE
   AND AFTER SAVING AND GET THE SAME MONEY.
   ============================================================ */

/** Everything on the sheet that is a number, so nothing hides behind a total. */
const money = (t: PrintTotals) => ({
  subtotal: t.subtotal,
  lineDiscount: t.lineDiscount,
  headerDiscount: t.headerDiscount,
  netAmount: t.netAmount,
  vat: t.vat,
  freight: t.freight,
  otherCharges: t.otherCharges,
  rounding: t.rounding,
  grandTotal: t.grandTotal,
  amountInWords: t.amountInWords,
});

/* Figures that are awkward on purpose: a discount that changes the VAT, and
   charges that do not divide evenly, so a rounding difference would show. */
const CHARGES = { headerDisc: 137, freight: 500, otherCharges: 89.5 };

describe("a quotation prints the same money before and after saving", () => {
  /* QT2507-0006 is the seeded Draft — a Converted or Sent quote is locked
     against writes, which is a different rule and tested elsewhere. */
  const CODE = "QT2507-0006";

  beforeEach(() => {
    const q = getQT(CODE)!;
    q.headerDisc = 0;
    q.freight = 0;
    q.otherCharges = 0;
  });

  it("carries the charges through the save", () => {
    const draft = { ...draftFromQuotation(getQT(CODE)!), ...CHARGES };
    const result = saveQuotationDraft(draft);
    expect(result.blocked, "the seeded draft must be writable").toBeUndefined();

    const saved = getQT(CODE)!;
    expect(saved.headerDisc).toBe(CHARGES.headerDisc);
    expect(saved.freight).toBe(CHARGES.freight);
    expect(saved.otherCharges).toBe(CHARGES.otherCharges);
  });

  it("reopens with the charges still on it", () => {
    saveQuotationDraft({ ...draftFromQuotation(getQT(CODE)!), ...CHARGES });
    /* The round trip. Without this a second save would silently zero them. */
    const reopened = draftFromQuotation(getQT(CODE)!);
    expect(reopened.headerDisc).toBe(CHARGES.headerDisc);
    expect(reopened.freight).toBe(CHARGES.freight);
    expect(reopened.otherCharges).toBe(CHARGES.otherCharges);
  });

  it("prints the same totals from the editor and from the store", () => {
    const draft = { ...draftFromQuotation(getQT(CODE)!), ...CHARGES };

    const preview = draftPrintDoc(draft, PRINT_CONFIGS.quotation).totals!;
    saveQuotationDraft(draft);
    const stored = buildPrintJob("quotation", CODE)!.doc.totals!;

    expect(money(stored)).toEqual(money(preview));
    /* And the charges are actually in there — two identical zeros would
       satisfy the line above while proving nothing. */
    expect(stored.freight).toBe(CHARGES.freight);
    expect(stored.headerDiscount).toBe(CHARGES.headerDisc);
    expect(stored.otherCharges).toBe(CHARGES.otherCharges);
    expect(stored.grandTotal).toBeGreaterThan(0);
  });

  it("shows the list the same figure as the sheet", () => {
    const draft = { ...draftFromQuotation(getQT(CODE)!), ...CHARGES };
    saveQuotationDraft(draft);

    /* A list column disagreeing with the document beside it is the same
       fault one screen further out. */
    expect(qtTotal(getQT(CODE)!)).toBe(buildPrintJob("quotation", CODE)!.doc.totals!.grandTotal);
  });
});

describe("a sales request prints the same money before and after saving", () => {
  const CODE = "SR2507-0004";

  beforeEach(() => {
    const r = getSR(CODE)!;
    r.headerDisc = 0;
    r.freight = 0;
    r.otherCharges = 0;
  });

  it("prints the same totals from the editor and from the store", () => {
    const draft = { ...draftFromSalesRequest(getSR(CODE)!), ...CHARGES };

    const preview = srPrintDoc(draft, PRINT_CONFIGS["sales-request"]).totals!;
    saveSalesRequestDraft(draft);
    const stored = buildPrintJob("sales-request", CODE)!.doc.totals!;

    expect(money(stored)).toEqual(money(preview));
    expect(stored.freight).toBe(CHARGES.freight);
    expect(srTotal(getSR(CODE)!)).toBe(stored.grandTotal);
  });
});

/* ============================================================
   AND THE SAME MONEY ALL THE WAY TO THE BILL

   A1 stopped a quotation losing its freight between the preview
   and the save. It stopped there, and the chain does not: the
   request became an order, and the order had nowhere to put the
   three fields either. So the same 500 baht survived two
   documents and fell out at the third, and the invoice — which
   has had a `freight` column all along — billed for the goods
   and nothing else.

   Exactly the bug A1 fixed, one hop further down, and it would
   have come back as "the invoice is short" rather than as
   anything anyone could connect to a quotation.

   What follows walks one document from quotation to invoice and
   asks for one thing at every hop: the same money.
   ============================================================ */

const SNAP = {
  qt: JSON.stringify(QUOTATIONS),
  sr: JSON.stringify(SALES_REQUESTS),
  so: JSON.stringify(SALES_ORDERS),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

/** Auto-confirms every dialog, so the walk reads as acts rather than clicks. */
const journeyCtx = () =>
  ({
    goto: () => {},
    openEntity: () => {},
    toast: () => {},
    confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
    formModal: () => {},
    refresh: () => {},
    quickView: () => {},
    panel: () => {},
  }) as never;

const asRole = (roleCode: string) =>
  setCurrentUser(USERS.find((u) => u.roleCode === roleCode && u.status === "Active")!.code);

/**
 * Quotation → sales request → sales order, carrying CHARGES the whole way.
 *
 * The quotation is raised through the editor's own save path rather than
 * poked into the array, because "the editor writes a record with the charges
 * on it" is half of what is being tested.
 */
function walkToOrder(charges: typeof CHARGES) {
  const ctx = journeyCtx();
  const bp = outboundCustomers().find((b) => b.status === "Active" && b.billType !== "Non VAT")!;

  asRole("SALES_REP");
  const draft = applyCustomer(blankDraft(), `${bp.code} - ${bp.nameTh}`);
  draft.salesRep = draft.salesRep || "SALE001 - Patcharin Thiengkaew";
  draft.items = [{ ...applyProduct(blankLine(), "AA-TH003-WL"), qty: 10, price: 500, disc: 0, tax: 7 }];
  Object.assign(draft, charges);

  const res = saveQuotationDraft(draft, { issue: true });
  expect(res.blocked, "the quotation should save").toBeUndefined();
  const qt = QUOTATIONS.find((q) => q.code === res.code)!;

  qtSubmit(qt, ctx);
  asRole("SALES_MANAGER");
  qtApprove(qt, ctx);
  qtSend(qt, ctx);
  qtAccept(qt, ctx);
  qtConvert(qt, ctx);
  decorateOutbound();

  const sr = SALES_REQUESTS.find((r) => r.code === qt.srRef)!;
  asRole("SALES_ADMIN");
  srSubmit(sr, ctx);
  srApprove(sr, ctx);
  srConvert(sr, ctx);
  decorateOutbound();

  const so = SALES_ORDERS.find((s) => s.code === sr.soRef)!;
  return { qt, sr, so };
}

describe("the freight agreed on the quotation is what the invoice collects", () => {
  beforeEach(() => {
    restore(QUOTATIONS, SNAP.qt);
    restore(SALES_REQUESTS, SNAP.sr);
    restore(SALES_ORDERS, SNAP.so);
    decorateOutbound();
    resetCurrentUser();
  });

  /* The walk signs in as four different people. Left signed in as the last of
     them, the describes after this one print as somebody who may not. */
  afterEach(resetCurrentUser);

  it("carries all three fields through every conversion", () => {
    const { qt, sr, so } = walkToOrder(CHARGES);

    for (const [doc, label] of [
      [qt, "quotation"],
      [sr, "request"],
      [so, "order"],
    ] as const) {
      expect(doc.headerDisc, `${label} header discount`).toBe(CHARGES.headerDisc);
      expect(doc.freight, `${label} freight`).toBe(CHARGES.freight);
      expect(doc.otherCharges, `${label} other charges`).toBe(CHARGES.otherCharges);
    }
  });

  it("asks for the same money at every hop, right through to the invoice", () => {
    const { qt, sr, so } = walkToOrder(CHARGES);

    const agreed = qtTotal(qt);
    expect(srTotal(sr), "the request").toBe(agreed);
    expect(soTotal(so), "the order").toBe(agreed);
    expect(buildPrintJob("sales-order", so.code)!.doc.totals!.grandTotal, "the order sheet").toBe(
      agreed,
    );

    /* The invoice, built the way the form builds it. */
    const head = headerFromSource("Sales Order", so.code)!;
    const inv = {
      items: billableLinesFrom("Sales Order", so.code),
      taxMode: "Tax Exclusive",
      headerDisc: head.headerDisc,
      freight: head.freight,
      otherCharges: head.otherCharges,
      rounding: 0,
      withholdingTax: 0,
    };
    expect(invoiceTotals(inv).grandTotal, "the bill").toBe(agreed);

    /* Two matching zeros would satisfy every line above. These are the
       figures that make the assertions mean something. */
    expect(invoiceTotals(inv).freight).toBe(CHARGES.freight);
    expect(invoiceTotals(inv).headerDiscount).toBe(CHARGES.headerDisc);
    expect(agreed).toBeGreaterThan(
      /* Strictly more than the goods alone, or the charges never arrived. */
      qtTotal({ items: qt.items, headerDisc: 0, freight: 0, otherCharges: 0 }),
    );
  });

  it("bills the freight once, not once per delivery", () => {
    const { so } = walkToOrder(CHARGES);

    /* First bill takes the charges. */
    expect(chargesFromSource("Sales Order", so.code).freight).toBe(CHARGES.freight);

    SALES_INVOICES.unshift({
      ...SALES_INVOICES[0],
      code: "INV-TEST-000001",
      status: "Issued",
      sourceType: "Sales Order",
      sourceDoc: so.code,
    });
    try {
      /* The second one does not. An order delivered in two drops is billed
         twice; the delivery was agreed once. */
      expect(chargesFromSource("Sales Order", so.code)).toEqual({
        headerDisc: 0,
        freight: 0,
        otherCharges: 0,
      });
    } finally {
      SALES_INVOICES.shift();
    }
  });

  /**
   * The two screens, not just the two functions.
   *
   * Everything above proves the domain hands the charges on. It does not
   * prove the forms pick them up, and the forms are the write path a person
   * actually takes — N7 is on record in BACKLOG.md as every piece working
   * and the joint between them not.
   */
  it("puts the charges on screen when the invoice picks its source", () => {
    const { so } = walkToOrder(CHARGES);

    const s = INV_FORM.blank();
    s.sourceType = "Sales Order";
    s.sourceDoc = so.code;
    INV_FORM.onChange!("sourceDoc", s);

    expect(s.freight, "the biller sees the freight without typing it").toBe(CHARGES.freight);
    expect(s.headerDisc).toBe(CHARGES.headerDisc);
    expect(s.otherCharges).toBe(CHARGES.otherCharges);
  });

  it("puts them on screen when the order is raised from its request", () => {
    const ctx = journeyCtx();
    const { qt } = walkToOrder(CHARGES);
    const sr = SALES_REQUESTS.find((r) => r.code === qt.srRef)!;

    /* The form route to an order, as against `srConvert` above. Both exist,
       and only one of them was ever going to be remembered. */
    const s = SO_FORM.blank();
    s.srRef = sr.code;
    SO_FORM.onChange!("srRef", s);

    expect(s.freight).toBe(CHARGES.freight);
    expect(s.headerDisc).toBe(CHARGES.headerDisc);
    expect(s.otherCharges).toBe(CHARGES.otherCharges);
  });

  it("leaves rounding and withholding tax doing what they did", () => {
    const { so } = walkToOrder(CHARGES);
    const items = billableLinesFrom("Sales Order", so.code);
    const head = headerFromSource("Sales Order", so.code)!;
    const base = { items, taxMode: "Tax Exclusive", ...head };

    const plain = invoiceTotals({ ...base, rounding: 0, withholdingTax: 0 });

    /* Rounding still moves the total by exactly what it says, no more. */
    const rounded = invoiceTotals({ ...base, rounding: 0.25, withholdingTax: 0 });
    expect(rounded.grandTotal).toBe(Math.round((plain.grandTotal + 0.25) * 100) / 100);

    /* Withholding is still a percentage of the taxable base — which now
       includes the freight, because the freight is taxable. It is reported,
       never subtracted from the total: it is deducted at payment. */
    const wht = invoiceTotals({ ...base, rounding: 0, withholdingTax: 3 });
    expect(wht.withholding).toBeCloseTo(plain.taxable * 0.03, 2);
    expect(wht.grandTotal, "withholding does not change what is invoiced").toBe(plain.grandTotal);
    expect(plain.taxable).toBeGreaterThan(0);
  });
});

describe("a purchase request prints the same money before and after saving", () => {
  const CODE = "PR2506-0124";

  beforeEach(() => {
    const p = getPR(CODE)!;
    p.headerDisc = 0;
    p.freight = 0;
    p.otherCharges = 0;
  });

  it("prints the same totals from the editor and from the store", () => {
    const draft = { ...draftFromPurchaseRequest(getPR(CODE)!), ...CHARGES };

    const preview = prPrintDoc(draft, PRINT_CONFIGS["purchase-request"]).totals!;
    savePurchaseRequestDraft(draft);
    const stored = buildPrintJob("purchase-request", CODE)!.doc.totals!;

    expect(money(stored)).toEqual(money(preview));
    expect(stored.freight).toBe(CHARGES.freight);
    expect(prTotal(getPR(CODE)!)).toBe(stored.grandTotal);
  });
});
