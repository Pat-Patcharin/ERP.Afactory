import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { USERS } from "@/data/admin";
import { PRINT_CONFIGS, buildPrintJob } from "@/lib/print";
import type { PrintDoc } from "@/lib/print";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { QUOTATIONS, SALES_REQUESTS, decorateOutbound, getQT, getSR } from "@/lib/domain/outbound";
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

/* ============================================================
   THE PROMISE UNDER THE INTERNAL NOTE BOX

   The editor prints a line under that box:

     "ไม่พิมพ์ลงเอกสาร และไม่ถูกส่งให้ลูกค้า"

   Salespeople write things in there on the strength of it —
   "ลูกค้าต่อราคาหนัก อย่าลดเกิน 10%", "เจ้าของร้านจ่ายช้าประจำ" —
   and the cost of the promise failing is not a wrong number,
   it is the customer reading what we say about them.

   Until A2b the promise held by accident: the field was thrown
   away at every save, so there was nothing to leak. Now it is
   stored, which is the whole point of the field, and the
   promise needs something holding it.

   This searches the WHOLE printed document, not the fields a
   note would plausibly land in. A leak that mattered would be
   somewhere nobody thought to check — that is what makes it a
   leak rather than a typo.
   ============================================================ */

/** Distinctive enough that finding it anywhere is proof, not coincidence. */
const SECRET = "ZZINTERNALZZ ลูกค้าต่อราคาหนัก อย่าลดเกิน 10%";

const SNAP = {
  qt: JSON.stringify(QUOTATIONS),
  sr: JSON.stringify(SALES_REQUESTS),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

/** Every string anywhere in the printed document, however deeply nested. */
const allText = (doc: PrintDoc): string => JSON.stringify(doc);

describe("the internal note never reaches paper", () => {
  beforeEach(() => {
    restore(QUOTATIONS, SNAP.qt);
    restore(SALES_REQUESTS, SNAP.sr);
    decorateOutbound();
    setCurrentUser(USERS.find((u) => u.roleCode === "SALES_REP")!.code);
  });
  afterEach(resetCurrentUser);

  it("is stored on the quotation — or there is nothing to leak and no test", () => {
    const draft = { ...draftFromQuotation(getQT("QT2507-0006")!), internalNote: SECRET };
    saveQuotationDraft(draft);

    expect(getQT("QT2507-0006")!.internalNote, "stored").toBe(SECRET);
    expect(draftFromQuotation(getQT("QT2507-0006")!).internalNote, "and reopens").toBe(SECRET);
  });

  it("stays off the quotation, from the editor and from the store", () => {
    const draft = { ...draftFromQuotation(getQT("QT2507-0006")!), internalNote: SECRET };

    const preview = draftPrintDoc(draft, PRINT_CONFIGS.quotation);
    expect(allText(preview), "the editor's own preview").not.toContain("ZZINTERNALZZ");

    saveQuotationDraft(draft);
    const stored = buildPrintJob("quotation", "QT2507-0006")!.doc;
    expect(allText(stored), "the sheet printed from the record").not.toContain("ZZINTERNALZZ");

    /* The document did print — an empty job would pass the two lines above
       while proving nothing at all. */
    expect(allText(stored)).toContain("QT2507-0006");
  });

  it("stays off the sales request too", () => {
    const draft = { ...draftFromSalesRequest(getSR("SR2507-0004")!), internalNote: SECRET };

    expect(allText(srPrintDoc(draft, PRINT_CONFIGS["sales-request"]))).not.toContain(
      "ZZINTERNALZZ",
    );
    saveSalesRequestDraft(draft);
    expect(getSR("SR2507-0004")!.internalNote, "stored").toBe(SECRET);

    const stored = buildPrintJob("sales-request", "SR2507-0004")!.doc;
    expect(allText(stored)).not.toContain("ZZINTERNALZZ");
    expect(allText(stored)).toContain("SR2507-0004");
  });

  it("does not follow the deal into the order's paperwork", () => {
    /* The note travels quotation → request, because the deal does. Every
       document after that is printed for somebody outside the sales desk. */
    saveQuotationDraft({ ...draftFromQuotation(getQT("QT2507-0006")!), internalNote: SECRET });

    for (const type of ["quotation", "sales-request"] as const) {
      const code = type === "quotation" ? "QT2507-0006" : "SR2507-0004";
      const job = buildPrintJob(type, code);
      if (job) expect(allText(job.doc), type).not.toContain("ZZINTERNALZZ");
    }
  });
});
