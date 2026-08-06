import { beforeEach, describe, expect, it } from "vitest";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { BILL_TYPES } from "@/data/partners";
import { BUSINESS_PARTNERS } from "@/lib/domain/partner";
import { QUOTATIONS, SALES_ORDERS, SALES_REQUESTS } from "@/lib/domain/outbound";
import { billableLinesFrom } from "@/lib/domain/invoice";
import { buildPrintJob, printTypesFor } from "@/lib/print";
import { applyBillType, planBillTypeChange, zeroTaxIfNonVat } from "@/lib/domain/doc-draft";
import {
  applyCustomer,
  blankDraft,
  blankLine,
  draftFromQuotation,
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

/* ============================================================
   CHANGING THE BILL TYPE (step 8b)

   One plan, three surfaces. These test the plan, because if it
   is right the quotation editor, the sales request editor and
   the sales order form are all right — none of them computes
   anything of its own.
   ============================================================ */

describe("planBillTypeChange", () => {
  const charges = { headerDisc: 0, freight: 0, otherCharges: 0 } as const;
  const line = (code: string, tax: number, qty = 10, price = 100) => ({
    code,
    name: `name-${code}`,
    qty,
    price,
    disc: 0,
    tax,
  });

  it("says there is nothing to decide when the value is unchanged", () => {
    const doc = { ...charges, billType: "VAT", items: [line("A", 7)] };
    expect(planBillTypeChange(doc, "VAT")).toBeNull();
  });

  it("says there is nothing to decide when no line is priced yet", () => {
    const doc = { ...charges, billType: "VAT", items: [{ code: "", tax: 7 }] };
    expect(planBillTypeChange(doc, "Non VAT")).toBeNull();
  });

  it("shows the money leaving the document on the way to Non VAT", () => {
    const doc = { ...charges, billType: "VAT", items: [line("A", 7)] };
    const plan = planBillTypeChange(doc, "Non VAT")!;

    expect(plan.before.grandTotal).toBe(1070);
    expect(plan.after.grandTotal).toBe(1000);
    expect(plan.delta).toBe(-70);
    expect(plan.lineCount).toBe(1);
  });

  it("shows the money arriving on the way back to VAT", () => {
    const doc = { ...charges, billType: "Non VAT", items: [line("A", 0)] };
    const plan = planBillTypeChange(doc, "VAT")!;

    expect(plan.before.grandTotal).toBe(1000);
    expect(plan.after.grandTotal).toBe(1070);
    expect(plan.delta).toBe(70);
  });

  it("names every line whose deliberate rate would be overwritten", () => {
    /* B is exempt on purpose and C is on a reduced rate; both vanish under a
       blanket switch to 7%, which is the whole reason the dialog exists. */
    const doc = {
      ...charges,
      billType: "Non VAT",
      items: [line("A", 0), line("B", 0), line("C", 3)],
    };
    const plan = planBillTypeChange(doc, "VAT")!;

    expect(plan.lineCount).toBe(3);
    expect(plan.overwritten.map((l) => l.code)).toEqual(["C"]);
    expect(plan.overwritten[0]).toMatchObject({ from: 3, to: 7, name: "name-C" });
  });

  it("does not call a line overwritten when it already sits on the target", () => {
    const doc = { ...charges, billType: "VAT", items: [line("A", 7), line("B", 0)] };
    const plan = planBillTypeChange(doc, "Non VAT")!;
    /* B is already 0, which is where the switch is heading. */
    expect(plan.overwritten).toEqual([]);
  });

  it("counts a line as overwritten only when its rate actually changes", () => {
    /* On a VAT document, A is standard and B is exempt. Switching to Non VAT
       moves both to 0 — B was already there, so only A moves, and A is not a
       deliberate exception. Nothing to warn about. */
    const toNonVat = planBillTypeChange(
      { ...charges, billType: "VAT", items: [line("A", 7), line("B", 0)] },
      "Non VAT",
    )!;
    expect(toNonVat.overwritten).toEqual([]);

    /* A reduced rate is the case that matters: it is neither where the
       document sits nor where it is going, so somebody chose it. */
    const reduced = planBillTypeChange(
      { ...charges, billType: "VAT", items: [line("A", 7), line("B", 3)] },
      "Non VAT",
    )!;
    expect(reduced.overwritten.map((l) => l.code)).toEqual(["B"]);
    expect(reduced.overwritten[0]).toMatchObject({ from: 3, to: 0 });
  });
});

describe("applyBillType", () => {
  const draft = () => ({
    billType: "VAT",
    items: [
      { ...blankLine(), code: "A", qty: 1, price: 100, tax: 7 },
      { ...blankLine(), code: "B", qty: 1, price: 100, tax: 3 },
      { ...blankLine(), code: "", tax: 7 },
    ],
  });

  it("retaxes every priced line on the way to Non VAT", () => {
    const next = applyBillType(draft(), "Non VAT");
    expect(next.billType).toBe("Non VAT");
    expect(next.items.filter((l) => l.code).map((l) => l.tax)).toEqual([0, 0]);
  });

  it("puts every priced line back on the standard rate on the way to VAT", () => {
    const next = applyBillType({ ...draft(), billType: "Non VAT" }, "VAT");
    expect(next.items.filter((l) => l.code).map((l) => l.tax)).toEqual([7, 7]);
  });

  it("leaves a blank line alone", () => {
    /* Rewriting an empty row would make an untouched one look edited. */
    const before = draft().items[2];
    const next = applyBillType(draft(), "Non VAT");
    expect(next.items[2].tax).toBe(before.tax);
  });
});

describe("A sealed quotation refuses a bill type change too", () => {
  it("blocks at the write, not merely by hiding the control", () => {
    const q = QUOTATIONS.find((x) => x.code === "QT2507-0006")!;
    q.status = "Sent";
    const was = q.billType;

    const draft = draftFromQuotation(q);
    const res = saveQuotationDraft(applyBillType(draft, was === "VAT" ? "Non VAT" : "VAT"), {
      issue: true,
    });

    expect(res.blocked).toBeTruthy();
    expect(QUOTATIONS.find((x) => x.code === "QT2507-0006")!.billType).toBe(was);
  });
});

/* ============================================================
   THE PRINTED SHEET (step 8c, task 1)

   A Non VAT document gets its own form rather than the VAT one
   with a zero in the tax row. The engine is untouched: the form
   is a config entry that declares who it is for.
   ============================================================ */

describe("Non VAT print forms", () => {
  it("offers the VAT form to a VAT document and nothing else", () => {
    const types = printTypesFor("quotation", { billType: "VAT" });
    expect(types).toContain("quotation");
    expect(types).not.toContain("quotation-non-vat");
  });

  it("offers the Non VAT form to a Non VAT document and nothing else", () => {
    const types = printTypesFor("quotation", { billType: "Non VAT" });
    expect(types).toContain("quotation-non-vat");
    expect(types, "a customer must never be handed the VAT sheet").not.toContain("quotation");
  });

  it("does the same for a sales order", () => {
    expect(printTypesFor("sales-order", { billType: "Non VAT" })).toEqual(["sales-order-non-vat"]);
    expect(printTypesFor("sales-order", { billType: "VAT" })).toEqual(["sales-order"]);
  });

  it("still lists every form when no record is given", () => {
    /* The old signature, which the rest of the app still uses. */
    expect(printTypesFor("quotation")).toEqual(["quotation", "quotation-non-vat"]);
    expect(printTypesFor("delivery-order").length).toBeGreaterThan(1);
  });

  it("prints no tax row and no tax-invoice wording on the Non VAT form", () => {
    const q = QUOTATIONS.find((x) => x.billType === "Non VAT")!;
    const job = buildPrintJob("quotation-non-vat", q.code)!;
    expect(job).toBeTruthy();

    expect(job.config.showTax, "no VAT line on a document that carries none").toBe(false);
    expect(job.config.itemColumns).not.toContain("vat");
    expect(job.config.titleTH).toContain("ไม่มีภาษี");

    const printed = [job.config.titleTH, job.config.titleEN, ...job.config.remarks].join(" ");
    expect(printed).not.toContain("เอกสารฉบับนี้เป็นใบกำกับภาษี");
    expect(printed).toContain("ไม่ใช่ใบกำกับภาษี");
  });

  it("carries no tax figure on the mapped document", () => {
    const q = QUOTATIONS.find((x) => x.billType === "Non VAT")!;
    const job = buildPrintJob("quotation-non-vat", q.code)!;
    expect(job.doc.totals!.vat).toBe(0);
    /* Every line rate is 0 too, so nothing can add up to tax later. */
    for (const l of job.doc.lines) expect(l.vatRate ?? 0).toBe(0);
  });

  it("keeps the VAT form printing its tax row", () => {
    const q = QUOTATIONS.find((x) => x.billType === "VAT")!;
    const job = buildPrintJob("quotation", q.code)!;
    expect(job.config.showTax).toBe(true);
  });
});
