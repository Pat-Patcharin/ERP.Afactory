import { beforeEach, describe, expect, it } from "vitest";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { BILL_TYPES } from "@/data/partners";
import { BUSINESS_PARTNERS } from "@/lib/domain/partner";
import { QUOTATIONS, SALES_ORDERS, SALES_REQUESTS } from "@/lib/domain/outbound";
import { billableLinesFrom } from "@/lib/domain/invoice";
import { zeroTaxIfNonVat } from "@/lib/domain/doc-draft";
import {
  applyCustomer,
  blankDraft,
  blankLine,
  saveQuotationDraft,
} from "@/lib/domain/quotation-draft";

/* ============================================================
   VAT / NON VAT AT THE HEAD OF A DOCUMENT

   The rule is one line long — a Non VAT document carries no tax
   on any line — and the reason it has to be enforced at every
   write is that lines arrive from places no form ever touched:
   a conversion, an import, a stale tab.

   The `?? 7` case below is the one with legal weight. `0 || 7`
   turned a deliberately exempt line into a 7% charge the moment
   it reached an invoice, on a document a customer is entitled to
   rely on.
   ============================================================ */

const QT_SNAP = JSON.stringify(RAW_QT);
const SO_SNAP = JSON.stringify(RAW_SO);

beforeEach(() => {
  QUOTATIONS.length = 0;
  QUOTATIONS.push(...(JSON.parse(QT_SNAP) as never[]));
  SALES_ORDERS.length = 0;
  SALES_ORDERS.push(...(JSON.parse(SO_SNAP) as never[]));
});

describe("A document knows how it is billed", () => {
  it("gives every seeded document one of the two values", () => {
    for (const store of [QUOTATIONS, SALES_REQUESTS, SALES_ORDERS]) {
      for (const d of store) {
        expect(BILL_TYPES, `${d.code} → ${d.billType}`).toContain(d.billType);
      }
    }
  });

  it("matches the customer it was raised for", () => {
    for (const store of [QUOTATIONS, SALES_REQUESTS, SALES_ORDERS]) {
      for (const d of store) {
        const bp = BUSINESS_PARTNERS.find((b) => b.code === d.customerCode);
        if (!bp) continue;
        expect(d.billType, `${d.code} vs ${bp.code}`).toBe(bp.billType);
      }
    }
  });

  it("carries no tax on any line of a Non VAT document", () => {
    for (const store of [QUOTATIONS, SALES_REQUESTS, SALES_ORDERS]) {
      for (const d of store.filter((x) => x.billType === "Non VAT")) {
        for (const it of d.items ?? []) {
          expect(it.tax, `${d.code} line ${it.code}`).toBe(0);
        }
      }
    }
  });
});

describe("A new document takes the customer's bill type", () => {
  const draftFor = (customerCode: string) => {
    const bp = BUSINESS_PARTNERS.find((b) => b.code === customerCode)!;
    return applyCustomer(blankDraft(), `${bp.code} - ${bp.nameTh}`);
  };

  it("makes a document for a VAT-registered customer a VAT one", () => {
    const bp = BUSINESS_PARTNERS.find((b) => b.tax?.vatReg === true)!;
    expect(draftFor(bp.code).billType).toBe("VAT");
  });

  it("makes a document for a customer with vatReg false a Non VAT one", () => {
    const bp = BUSINESS_PARTNERS.find((b) => b.tax?.vatReg === false)!;
    expect(bp.billType).toBe("Non VAT");
    expect(draftFor(bp.code).billType).toBe("Non VAT");
  });

  it("flattens the tax on save, whatever the lines were typed as", () => {
    const bp = BUSINESS_PARTNERS.find((b) => b.tax?.vatReg === false)!;
    const draft = draftFor(bp.code);
    /* A line typed as taxable, on a document that cannot carry tax. */
    draft.items = [
      { ...blankLine(), code: "AA-TH003-WL", name: "A-FLEX PU40", unit: "Tube", qty: 5, price: 100, disc: 0, tax: 7 },
    ];

    const res = saveQuotationDraft(draft, { issue: true });
    expect(res.blocked).toBeUndefined();

    const saved = QUOTATIONS.find((q) => q.code === res.code)!;
    expect(saved.billType).toBe("Non VAT");
    expect(saved.items[0].tax, "the write, not the form, is what enforces it").toBe(0);
  });
});

describe("zeroTaxIfNonVat", () => {
  it("leaves a VAT document alone", () => {
    const lines = [{ tax: 7 }, { tax: 0 }];
    expect(zeroTaxIfNonVat("VAT", lines)).toEqual(lines);
  });

  it("flattens every line of a Non VAT document", () => {
    expect(zeroTaxIfNonVat("Non VAT", [{ tax: 7 }, { tax: 3 }])).toEqual([{ tax: 0 }, { tax: 0 }]);
  });
});

describe("Billing an order — the tax rate that reaches the invoice", () => {
  const vatOrder = () => SALES_ORDERS.find((s) => s.billType === "VAT")!;
  const nonVatOrder = () => SALES_ORDERS.find((s) => s.billType === "Non VAT")!;

  it("keeps a deliberate tax 0 at 0", () => {
    /* The `0 || 7` hole: an exempt line on an otherwise taxable order. */
    const so = vatOrder();
    so.items[0].tax = 0;

    const line = billableLinesFrom("Sales Order", so.code).find((l) => l.code === so.items[0].code)!;
    expect(line.taxRate, "an exempt line must not become 7%").toBe(0);
  });

  it("still defaults a line with no rate at all to 7", () => {
    const so = vatOrder();
    delete (so.items[0] as { tax?: number }).tax;

    const line = billableLinesFrom("Sales Order", so.code).find((l) => l.code === so.items[0].code)!;
    expect(line.taxRate).toBe(7);
  });

  it("bills every line of a Non VAT order at 0", () => {
    const so = nonVatOrder();
    /* Even if a line somehow carries 7, the document overrides it. */
    so.items[0].tax = 7;

    for (const line of billableLinesFrom("Sales Order", so.code)) {
      expect(line.taxRate, `${so.code} line ${line.code}`).toBe(0);
      expect(line.taxCode).toBe("NONE");
    }
  });

  it("keeps a VAT order billing at its line rate", () => {
    const so = vatOrder();
    so.items[0].tax = 7;
    const line = billableLinesFrom("Sales Order", so.code).find((l) => l.code === so.items[0].code)!;
    expect(line.taxRate).toBe(7);
    expect(line.taxCode).toBe("VAT7");
  });
});
