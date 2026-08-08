import { beforeEach, describe, expect, it } from "vitest";

import { PRINT_CONFIGS, buildPrintJob } from "@/lib/print";
import type { PrintTotals } from "@/lib/print";
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
