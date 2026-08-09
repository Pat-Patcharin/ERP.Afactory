import { describe, expect, it } from "vitest";

import { PRINT_CONFIGS, PRINT_DOC_TYPES, buildPrintJob } from "@/lib/print";
import { SALES_INVOICES } from "@/lib/domain/invoice";

/* ============================================================
   THE SHEET NAMES THE DAY

   Two halves of one gap, closed together at group C.

   `showDueDate` was declared on every config, set deliberately
   per document, and asserted in a test — and read by nothing.
   Meanwhile every tax document carried this remark:

     "กรุณาชำระเงินภายในวันที่ครบกำหนด"

   Pay by the due date. Which is when? The record knows — it is
   computed from the invoice date and the credit days — and the
   sheet did not say. A customer holding it cannot act on it,
   and "we told you" is not a thing anybody can point at.

   Now the flag decides whether the sheet asks for payment by a
   date, and the date is the real one off the record.
   ============================================================ */

describe("a document that asks for payment by a date prints the date", () => {
  const invoice = SALES_INVOICES.find((i) => i.dueDate)!;

  it("names the invoice's own due date, not a general instruction", () => {
    const job = buildPrintJob("sales-invoice", invoice.code)!;
    const asked = job.doc.remarks.filter((r) => r.includes("ชำระเงินภายใน"));

    /**
     * Checked against the sheet's OWN due-date row rather than against the
     * record's `dueDate`.
     *
     * Records hold ค.ศ. and paper holds พ.ศ. (the D4 rule), so the remark is
     * converted on the way out like every other date. Converting it back here
     * would give this file a private copy of the era rule — which is the
     * mistake `tests/dashboard.test.tsx` was caught making at N-9c, and what
     * the tripwire in `tests/era.test.ts` exists to prevent. Comparing two
     * things on the same sheet needs no era rule at all, and additionally
     * proves the remark and the meta row cannot disagree.
     */
    const row = job.doc.meta.find((m) => m.field === "dueDate")!;
    expect(row?.value, "the sheet shows a due date row").toBeTruthy();
    expect(asked, "one line asking for payment, and only one").toHaveLength(1);
    expect(asked[0]).toContain(row.value);
    /* The vague version is gone, not merely joined by the specific one. */
    expect(asked[0]).not.toBe("กรุณาชำระเงินภายในวันที่ครบกำหนด");
  });

  it("says nothing on documents that carry no due date of their own", () => {
    /* A quotation is not a demand for payment, and a delivery note has no
       due date on the record — printing the sentence there would be asking
       for money by a day nobody had set. */
    for (const type of ["quotation", "delivery-order-price"] as const) {
      expect(PRINT_CONFIGS[type].showDueDate, `${type} config`).toBe(false);
    }
  });

  it("has a reader — the flag decides something now", () => {
    /* The property this whole change is about: turning the flag off has to
       change what is printed. A config value nobody reads is what it was. */
    const config = PRINT_CONFIGS["sales-invoice"];
    const before = config.showDueDate;
    try {
      (config as { showDueDate: boolean }).showDueDate = false;
      const off = buildPrintJob("sales-invoice", invoice.code)!;
      expect(off.doc.remarks.filter((r) => r.includes("ชำระเงินภายใน"))).toHaveLength(0);
    } finally {
      (config as { showDueDate: boolean }).showDueDate = before;
    }
  });

  it("leaves no document asking for payment without naming a day", () => {
    /* The sweep: whatever else changes, no sheet may go back to the vague
       sentence. This is the assertion that would have failed before. */
    for (const type of PRINT_DOC_TYPES) {
      const config = PRINT_CONFIGS[type];
      if (!config) continue;
      for (const remark of config.remarks) {
        expect(remark, `${type} carries a payment deadline with no date`).not.toBe(
          "กรุณาชำระเงินภายในวันที่ครบกำหนด",
        );
      }
    }
  });
});
