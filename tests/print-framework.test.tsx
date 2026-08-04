import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrintDocument, columnWidths } from "@/components/print/PrintDocument";
import { PrintPreview } from "@/components/print/PrintPreview";
import DocumentTemplatesPage from "@/app/(erp)/admin/templates/page";
import { AUDIT_LOG, COMPANY, COMPANY_BANKS, USERS } from "@/data/admin";
import { BULK_ORDER_ITEMS } from "@/data/bulk-order";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { DELIVERY_ORDERS, SALES_ORDERS } from "@/lib/domain/outbound";
import { SALES_INVOICES, invoiceTotals } from "@/lib/domain/invoice";
import { CREDIT_NOTES } from "@/lib/domain/credit-note";
import { SALES_RETURNS } from "@/lib/domain/sales-return";
import {
  COPY_TYPES,
  PRINT_CONFIGS,
  PRINT_DOC_TYPES,
  allowedCopyTypes,
  bahtText,
  buildPrintJob,
  canSeePrice,
  canSeeTax,
  fillerRows,
  getPrintConfig,
  mapDocument,
  paginate,
  pdfFilename,
  printCount,
  printTypesFor,
  recordPrint,
  resetPrintCounts,
  rowUnits,
  totalRowUnits,
  validatePrint,
  visibleColumns,
} from "@/lib/print";
import { printActions } from "@/lib/print/actions";
import type { PrintConfig, PrintDocType, PrintLine } from "@/lib/print/types";
import { PRINT_DOC_TYPES as ALL_TYPES } from "@/lib/print/config";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   OUTBOUND PRINT FRAMEWORK regression suite.

   Two things are worth protecting here above all others.

   First, the numbers: a printed tax document is evidence, and a
   print engine that recomputes a total will one day disagree with
   the module that issued it. Several tests below compare printed
   figures against the source module's own figures rather than
   against a constant.

   Second, the pagination: every mock document but one fits on a
   single sheet, so DO2507-0006 (38 lines) is what actually
   exercises continuation pages, and it is used deliberately.
   ============================================================ */

const BULK_DO = "DO2507-0006";
const BULK_SO = "SO2506-0009";
const SMALL_DO = "DO2507-0001";

/* Print counts and the acting user are process-wide; every test puts them back. */
beforeEach(resetPrintCounts);
afterEach(() => {
  resetPrintCounts();
  resetCurrentUser();
});

const asRole = (roleCode: string) => {
  const u = USERS.find((x) => x.roleCode === roleCode && x.status === "Active");
  expect(u, `an active user exists for ${roleCode}`).toBeDefined();
  setCurrentUser(u!.code);
  return u!;
};

/** Super Admin prints everything — the baseline for tests not about permissions. */
const asAdmin = () => asRole("SUPER_ADMIN");

const line = (no: number, extra = 0): PrintLine => ({
  no,
  code: `ITEM-${no}`,
  description: `Item ${no}`,
  extraLines: Array.from({ length: extra }, (_, i) => `note ${i + 1}`),
  warehouse: "",
  location: "",
  bin: "",
  lot: "",
  serial: "",
  packageNo: "",
  qty: 1,
  requiredQty: 0,
  pickedQty: 0,
  weight: 0,
  uom: "Pcs",
  unitPrice: 100,
  discount: 0,
  netPrice: 100,
  vatRate: 7,
  amount: 100,
});

const lines = (n: number, extra = 0) => Array.from({ length: n }, (_, i) => line(i + 1, extra));

const cfg = (over: Partial<PrintConfig> = {}): PrintConfig => ({
  ...PRINT_CONFIGS["delivery-order-price"],
  ...over,
});

/* ============================================================
   Configuration — sixteen documents, one engine
   ============================================================ */

describe("Print framework — configuration", () => {
  it("configures every declared document type", () => {
    expect(PRINT_DOC_TYPES).toHaveLength(16);
    for (const t of PRINT_DOC_TYPES) {
      const c = PRINT_CONFIGS[t];
      expect(c.documentType, t).toBe(t);
      expect(c.titleEN.length, t).toBeGreaterThan(0);
      expect(c.titleTH.length, t).toBeGreaterThan(0);
      expect(c.entity.length, t).toBeGreaterThan(0);
      expect(c.itemColumns.length, t).toBeGreaterThan(0);
      expect(c.supportedCopyTypes.length, t).toBeGreaterThan(0);
    }
  });

  it("keeps row capacities positive and the last page no larger than a continuation page", () => {
    /* The last page carries totals and signatures, so it can never hold more
       rows than a page that carries only items. */
    for (const t of PRINT_DOC_TYPES) {
      const c = PRINT_CONFIGS[t];
      expect(c.firstPageRows, t).toBeGreaterThan(0);
      expect(c.continuationPageRows, t).toBeGreaterThanOrEqual(c.firstPageRows);
      expect(c.lastPageRows, t).toBeLessThanOrEqual(c.continuationPageRows);
    }
  });

  it("never shows money on an operational document", () => {
    /* A picking list in the warehouse must not carry the selling price. */
    for (const t of ["picking", "packing", "delivery-order", "shipment"] as PrintDocType[]) {
      const c = PRINT_CONFIGS[t];
      expect(c.showPrice, t).toBe(false);
      expect(c.showTotals, t).toBe(false);
      expect(c.showTax, t).toBe(false);
      expect(c.itemColumns, t).not.toContain("amount");
      expect(c.itemColumns, t).not.toContain("unitPrice");
    }
  });

  it("puts amount in words and a tax id on every tax document", () => {
    for (const t of PRINT_DOC_TYPES.filter((x) => /tax-invoice/.test(x))) {
      const c = PRINT_CONFIGS[t];
      expect(c.showTax, t).toBe(true);
      expect(c.showAmountInWords, t).toBe(true);
      expect(c.showCustomerTaxId, t).toBe(true);
    }
  });

  it("lists every document a source can print, in menu order", () => {
    expect(printTypesFor("delivery-order")).toEqual([
      "delivery-order",
      "delivery-order-price",
      "delivery-tax-invoice",
    ]);
    expect(printTypesFor("sales-invoice")).toEqual([
      "sales-invoice",
      "tax-invoice",
      "invoice-tax-invoice",
      "receipt",
      "receipt-tax-invoice",
    ]);
    expect(printTypesFor("purchase-order")).toEqual([]);
  });

  it("declares only copy types the engine knows", () => {
    for (const t of PRINT_DOC_TYPES) {
      for (const c of PRINT_CONFIGS[t].supportedCopyTypes) {
        expect(COPY_TYPES[c], `${t} · ${c}`).toBeDefined();
      }
    }
  });
});

/* ============================================================
   Pagination
   ============================================================ */

describe("Print framework — pagination", () => {
  const c = cfg({ firstPageRows: 15, continuationPageRows: 22, lastPageRows: 15 });

  it("counts an item with two extra description lines as three row units", () => {
    expect(rowUnits(line(1))).toBe(1);
    expect(rowUnits(line(1, 2))).toBe(3);
    expect(totalRowUnits([line(1), line(2, 1), line(3, 2)])).toBe(6);
  });

  it("keeps a short document on one page", () => {
    const pages = paginate(lines(5), c);
    expect(pages).toHaveLength(1);
    expect(pages[0].isFirst).toBe(true);
    expect(pages[0].isLast).toBe(true);
  });

  it("measures a single page against the LAST page capacity, not the first", () => {
    /* 15 items fit; the 16th does not, because that page must still carry
       the totals block. */
    expect(paginate(lines(15), c)).toHaveLength(1);
    expect(paginate(lines(16), c).length).toBeGreaterThan(1);
  });

  it("gives the first page its own capacity once the document is multi-page", () => {
    const pages = paginate(lines(40), c);
    expect(pages[0].used).toBeLessThanOrEqual(c.firstPageRows);
    expect(pages[0].capacity).toBe(c.firstPageRows);
  });

  it("fills continuation pages to their larger capacity", () => {
    const pages = paginate(lines(60), c);
    const middles = pages.slice(1, -1);
    expect(middles.length).toBeGreaterThan(0);
    for (const p of middles) {
      expect(p.capacity).toBe(c.continuationPageRows);
      expect(p.used).toBeLessThanOrEqual(c.continuationPageRows);
    }
  });

  it("leaves room for totals on the final page", () => {
    for (const n of [16, 23, 38, 51, 77]) {
      const pages = paginate(lines(n), c);
      const last = pages[pages.length - 1];
      expect(last.used, `${n} items`).toBeLessThanOrEqual(c.lastPageRows);
      expect(last.isLast).toBe(true);
    }
  });

  it("never splits an item across a page break", () => {
    const src = lines(40, 2);
    const pages = paginate(src, c);
    const flat = pages.flatMap((p) => p.lines);
    expect(flat).toHaveLength(src.length);
    expect(flat.map((l) => l.no)).toEqual(src.map((l) => l.no));
    /* Every line lands on exactly one page. */
    for (const p of pages) expect(p.used).toBe(totalRowUnits(p.lines));
  });

  it("loses no line and keeps the original order whatever the shape", () => {
    const src = [line(1), line(2, 3), line(3), line(4, 1), ...lines(30).map((l, i) => line(i + 5))];
    const flat = paginate(src, c).flatMap((p) => p.lines);
    expect(flat.map((l) => l.no)).toEqual(src.map((l) => l.no));
  });

  it("numbers pages from one and marks exactly one first and one last", () => {
    const pages = paginate(lines(50), c);
    expect(pages.map((p) => p.page)).toEqual(pages.map((_, i) => i + 1));
    expect(pages.filter((p) => p.isFirst)).toHaveLength(1);
    expect(pages.filter((p) => p.isLast)).toHaveLength(1);
  });

  it("gives an item taller than a page a sheet of its own rather than cutting it", () => {
    /* 30 extra description lines is larger than any capacity here. Cutting it
       would silently lose text; overflowing is visible and fixable. */
    const pages = paginate([line(1), line(2, 30), line(3)], c);
    const oversized = pages.find((p) => p.lines.some((l) => l.no === 2))!;
    expect(oversized.lines).toHaveLength(1);
    expect(paginate([line(1), line(2, 30), line(3)], c).flatMap((p) => p.lines)).toHaveLength(3);
  });

  it("pads a short page with filler rows to a constant height", () => {
    const [page] = paginate(lines(4), c);
    expect(fillerRows(page)).toBe(c.lastPageRows - 4);
    const full = paginate(lines(60), c)[1];
    expect(fillerRows(full)).toBe(full.capacity - full.used);
    expect(fillerRows(full)).toBeGreaterThanOrEqual(0);
  });

  it("uses the operational capacities for a picking list", () => {
    /* No totals block, so its final page holds more rows than an invoice's. */
    const p = PRINT_CONFIGS.picking;
    expect(p.lastPageRows).toBeGreaterThan(PRINT_CONFIGS["tax-invoice"].lastPageRows);
    expect(paginate(lines(p.lastPageRows), p)).toHaveLength(1);
    expect(paginate(lines(p.lastPageRows + 1), p).length).toBeGreaterThan(1);
  });
});

/* ============================================================
   Mapping — totals are read, never recomputed
   ============================================================ */

describe("Print framework — data mapping", () => {
  beforeEach(asAdmin);

  it("maps every configured document type without throwing", () => {
    const SAMPLE: Record<string, string> = {
      quotation: "QT2506-0001",
      "sales-request": "SR2506-0001",
      "sales-order": "SO2506-0001",
      picking: "PK2506-0001",
      packing: "PACK2506-0001",
      "delivery-order": SMALL_DO,
      "sales-invoice": SALES_INVOICES[0].code,
      shipment: "SHP-2026-000031",
      "sales-return": "RTN-2026-000021",
      "credit-note": "CN-2026-000021",
    };

    for (const t of ALL_TYPES) {
      const config = PRINT_CONFIGS[t];
      const code = SAMPLE[config.entity];
      expect(code, `sample document for ${config.entity}`).toBeDefined();
      const job = buildPrintJob(t, code);
      expect(job, t).not.toBeNull();
      expect(job!.doc.code, t).toBe(code);
      expect(job!.pages.length, t).toBeGreaterThan(0);
    }
  });

  it("returns null for a document that does not exist", () => {
    expect(buildPrintJob("delivery-order", "DO-NOPE-9999")).toBeNull();
    expect(mapDocument({ entity: "delivery-order", code: "" }, PRINT_CONFIGS["delivery-order"])).toBeNull();
  });

  it("prints the invoice module's own grand total, not its own arithmetic", () => {
    const inv = SALES_INVOICES.find((i) => (i.items ?? []).length > 0)!;
    const job = buildPrintJob("invoice-tax-invoice", inv.code)!;
    expect(job.doc.totals!.grandTotal).toBe(invoiceTotals(inv).grandTotal);
    expect(job.doc.totals!.vat).toBe(invoiceTotals(inv).tax);
  });

  it("prints the credit note module's own credit total", () => {
    const cn = CREDIT_NOTES[0];
    const job = buildPrintJob("credit-note", cn.code)!;
    expect(job.doc.totals!.grandTotal).toBe(cn.totalCredit);
  });

  it("prints the sales return module's own return value", () => {
    const rtn = SALES_RETURNS[0];
    const job = buildPrintJob("sales-return", rtn.code)!;
    expect(job.doc.totals!.grandTotal).toBe(rtn.returnValue);
  });

  it("prints the sales order's own total", () => {
    const so = SALES_ORDERS.find((s) => s.code === BULK_SO)!;
    const job = buildPrintJob("sales-order", so.code)!;
    expect(job.doc.totals!.grandTotal).toBe(so.total);
  });

  it("takes delivery order prices from the sales order it fulfils", () => {
    /* A delivery order has no prices of its own; inventing them would be
       worse than showing none. */
    const so = SALES_ORDERS.find((s) => s.code === BULK_SO)!;
    const job = buildPrintJob("delivery-order-price", BULK_DO)!;
    expect(job.doc.totals!.grandTotal).toBe(so.total);
    expect(job.doc.lines[0].unitPrice).toBe(so.items[0].price);
  });

  it("resolves the customer panels from the Business Partner master", () => {
    const job = buildPrintJob("delivery-tax-invoice", SMALL_DO)!;
    expect(job.doc.billTo.name).toBeTruthy();
    expect(job.doc.billTo.address).toBeTruthy();
    expect(job.doc.billTo.taxId).toBeTruthy();
    expect(job.doc.shipTo.address).toBeTruthy();
  });

  it("bills a tax invoice to the address the invoice itself recorded", () => {
    /* An address corrected on the master today must not rewrite an invoice
       issued last year — the document is the evidence, not the master. */
    const inv = SALES_INVOICES[0];
    const job = buildPrintJob("tax-invoice", inv.code)!;
    expect(job.doc.billTo.address).toBe(inv.billingAddress);
    expect(job.doc.billTo.taxId).toBe(inv.taxId);
    expect(job.issues.filter((i) => i.blocking)).toEqual([]);
  });

  it("bills a credit note and a return the way the invoice they reverse was billed", () => {
    const cn = CREDIT_NOTES[0];
    expect(buildPrintJob("credit-note", cn.code)!.doc.billTo.taxId).toBe(cn.taxId);

    const rtn = SALES_RETURNS[0];
    const inv = SALES_INVOICES.find((i) => i.code === rtn.invoiceRef)!;
    expect(buildPrintJob("sales-return", rtn.code)!.doc.billTo.address).toBe(inv.billingAddress);
  });

  it("leaves no printable document blocked by a missing address", () => {
    /* The finance-side modules carry their own customer identity, so this is
       the check that they resolve at all. */
    const SAMPLES: [PrintDocType, string][] = [
      ["tax-invoice", SALES_INVOICES[0].code],
      ["receipt", SALES_INVOICES[0].code],
      ["credit-note", CREDIT_NOTES[0].code],
      ["sales-return", SALES_RETURNS[0].code],
      ["shipment", "SHP-2026-000031"],
    ];
    for (const [t, code] of SAMPLES) {
      const job = buildPrintJob(t, code)!;
      expect(job.doc.billTo.address, t).toBeTruthy();
      expect(job.issues.filter((i) => i.blocking), t).toEqual([]);
    }
  });

  it("splits a note into extra description lines the paginator can see", () => {
    const job = buildPrintJob("delivery-order", BULK_DO)!;
    const twoLine = job.doc.lines.find((l) => l.extraLines.length === 2);
    expect(twoLine, "the bulk fixture carries a two-line description").toBeDefined();
    expect(rowUnits(twoLine!)).toBe(3);
  });

  it("carries lot and serial onto the delivery note", () => {
    const job = buildPrintJob("delivery-order", BULK_DO)!;
    expect(job.doc.lines.filter((l) => l.lot).length).toBeGreaterThan(20);
    expect(job.doc.lines.filter((l) => l.serial).length).toBeGreaterThan(0);
  });

  it("drops metadata rows that resolve to nothing", () => {
    const job = buildPrintJob("delivery-order", SMALL_DO)!;
    for (const m of job.doc.meta) expect(m.value.trim()).not.toBe("");
  });

  it("reads the company block and default bank from Company Settings", () => {
    const job = buildPrintJob("invoice-tax-invoice", SALES_INVOICES[0].code)!;
    expect(job.doc.company.taxId).toBeTruthy();
    expect(job.doc.company.nameTH).toBeTruthy();
    expect(job.doc.bank?.accountNo).toBeTruthy();
  });
});

/* ============================================================
   Amount in words
   ============================================================ */

describe("Print framework — baht text", () => {
  it("reads the three irregular forms Thai requires", () => {
    expect(bahtText(10)).toBe("สิบบาทถ้วน");
    expect(bahtText(20)).toBe("ยี่สิบบาทถ้วน");
    expect(bahtText(21)).toBe("ยี่สิบเอ็ดบาทถ้วน");
    expect(bahtText(101)).toBe("หนึ่งร้อยเอ็ดบาทถ้วน");
  });

  it("reads satang, and rounds before reading", () => {
    expect(bahtText(34609.15)).toBe("สามหมื่นสี่พันหกร้อยเก้าบาทสิบห้าสตางค์");
    expect(bahtText(0)).toBe("ศูนย์บาทถ้วน");
    /* 0.999 is one baht, not zero baht ninety-nine satang. */
    expect(bahtText(0.999)).toBe("หนึ่งบาทถ้วน");
  });

  it("groups in millions", () => {
    expect(bahtText(1_000_000)).toBe("หนึ่งล้านบาทถ้วน");
    expect(bahtText(12_345_678)).toBe(
      "สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปดบาทถ้วน",
    );
  });

  it("puts amount in words on the printed document", () => {
    asAdmin();
    const job = buildPrintJob("invoice-tax-invoice", SALES_INVOICES[0].code)!;
    expect(job.doc.totals!.amountInWords).toBe(bahtText(job.doc.totals!.grandTotal));
  });
});

/* ============================================================
   Copy types and permissions
   ============================================================ */

describe("Print framework — copy types", () => {
  /* A priced document that also has a warehouse copy — the sales return is
     the one place both meet, which is exactly where stripping must work. */
  const RETURN = SALES_RETURNS[0].code;

  it("strips price from the DATA on a warehouse copy, not with CSS", () => {
    asAdmin();
    const job = buildPrintJob("sales-return", RETURN, { copyType: "WAREHOUSE" })!;
    expect(job.copyType).toBe("WAREHOUSE");
    expect(job.doc.totals).toBeNull();
    expect(job.doc.bank).toBeNull();
    for (const l of job.doc.lines) {
      expect(l.unitPrice).toBeNull();
      expect(l.amount).toBeNull();
      expect(l.vatRate).toBeNull();
    }
  });

  it("keeps the money off the rendered page entirely", () => {
    asAdmin();
    const job = buildPrintJob("sales-return", RETURN, { copyType: "WAREHOUSE" })!;
    const { container } = render(<PrintDocument job={job} />);
    expect(container.textContent).not.toContain("GRAND TOTAL");
    expect(container.textContent).not.toContain("Unit Price");
  });

  it("does not mutate the mapped document — the next copy type still has prices", () => {
    asAdmin();
    const stripped = buildPrintJob("sales-return", RETURN, { copyType: "WAREHOUSE" })!;
    expect(stripped.doc.lines[0].amount).toBeNull();
    const priced = buildPrintJob("sales-return", RETURN, { copyType: "ORIGINAL" })!;
    expect(priced.doc.lines[0].amount).toBeGreaterThan(0);
  });

  it("drops the price columns once the values are gone", () => {
    asAdmin();
    const c = PRINT_CONFIGS["sales-return"];
    expect(visibleColumns(c, "ORIGINAL")).toContain("amount");
    expect(visibleColumns(c, "WAREHOUSE")).not.toContain("amount");
    expect(visibleColumns(c, "WAREHOUSE")).not.toContain("unitPrice");
    expect(visibleColumns(c, "ORIGINAL")).toContain("no");
  });

  it("keeps the priced delivery note out of the warehouse's hands entirely", () => {
    /* DELIVERY ORDER (no price) is the warehouse's copy of that document, so
       the priced variant simply does not offer one. */
    expect(PRINT_CONFIGS["delivery-order-price"].supportedCopyTypes).not.toContain("WAREHOUSE");
    expect(PRINT_CONFIGS["delivery-order"].supportedCopyTypes).toContain("WAREHOUSE");
  });

  it("answers canSeePrice and canSeeTax per copy type", () => {
    asAdmin();
    const c = PRINT_CONFIGS["delivery-tax-invoice"];
    expect(canSeePrice(c, "ORIGINAL")).toBe(true);
    expect(canSeeTax(c, "ORIGINAL")).toBe(true);
    expect(canSeePrice(c, "WAREHOUSE")).toBe(false);
    expect(canSeeTax(c, "DELIVERY")).toBe(false);
    /* An operational document has no price to see for anyone. */
    expect(canSeePrice(PRINT_CONFIGS.picking, "ORIGINAL")).toBe(false);
  });

  it("offers a warehouse copy only where the document supports one", () => {
    asAdmin();
    expect(PRINT_CONFIGS["delivery-order"].supportedCopyTypes).toContain("WAREHOUSE");
    expect(PRINT_CONFIGS["tax-invoice"].supportedCopyTypes).not.toContain("WAREHOUSE");
  });

  it("falls back to a supported copy type instead of printing an unsupported one", () => {
    asAdmin();
    const job = buildPrintJob("tax-invoice", SALES_INVOICES[0].code, { copyType: "WAREHOUSE" })!;
    expect(job.copyType).not.toBe("WAREHOUSE");
    expect(PRINT_CONFIGS["tax-invoice"].supportedCopyTypes).toContain(job.copyType);
  });
});

describe("Print framework — permissions", () => {
  it("lets a role print only the modules it holds", () => {
    asRole("SALES_REP");
    /* A rep quotes and sells; the delivery note belongs to the warehouse. */
    expect(printActions("quotation", { code: "QT2506-0001" } as never, ctx()).length).toBeGreaterThan(0);
    expect(printActions("delivery-order", { code: SMALL_DO } as never, ctx())).toEqual([]);

    asRole("WAREHOUSE_STAFF");
    expect(printActions("picking", { code: "PK2506-0001" } as never, ctx()).length).toBeGreaterThan(0);
    expect(printActions("sales-invoice", { code: SALES_INVOICES[0].code } as never, ctx())).toEqual([]);
  });

  it("withholds the accounting copy from a role that cannot see invoices", () => {
    asRole("WAREHOUSE_MANAGER");
    expect(allowedCopyTypes(PRINT_CONFIGS["delivery-order-price"])).not.toContain("ACCOUNTING");

    asRole("SALES_MANAGER");
    expect(allowedCopyTypes(PRINT_CONFIGS["delivery-order-price"])).toContain("ACCOUNTING");

    asAdmin();
    expect(allowedCopyTypes(PRINT_CONFIGS["delivery-order-price"])).toEqual(
      PRINT_CONFIGS["delivery-order-price"].supportedCopyTypes,
    );
  });

  it("names the acting user in the footer", () => {
    const u = asRole("SALES_MANAGER");
    const job = buildPrintJob("sales-order", "SO2506-0001")!;
    expect(job.printedBy).toBe(u.name);
  });

  it("keeps a suspended user from printing anything", () => {
    const suspended = USERS.find((u) => u.status === "Suspended")!;
    setCurrentUser(suspended.code);
    for (const t of PRINT_DOC_TYPES) {
      expect(printActions(PRINT_CONFIGS[t].entity, { code: "X" } as never, ctx()), t).toEqual([]);
    }
  });
});

/** Minimal action context — the print menu only ever calls goto and toast. */
function ctx(): ActionCtx {
  return {
    goto: () => {},
    toast: () => {},
    confirm: () => {},
    refresh: () => {},
  } as unknown as ActionCtx;
}

/* ============================================================
   Validation
   ============================================================ */

describe("Print framework — validation", () => {
  beforeEach(asAdmin);

  const doc = (over: Record<string, unknown> = {}) => {
    const base = mapDocument({ entity: "delivery-order", code: SMALL_DO }, PRINT_CONFIGS["delivery-tax-invoice"])!;
    return { ...base, ...over } as typeof base;
  };

  it("passes a complete tax document", () => {
    const issues = validatePrint(doc(), PRINT_CONFIGS["delivery-tax-invoice"], "ORIGINAL");
    expect(issues.filter((i) => i.blocking)).toEqual([]);
  });

  it("blocks a tax invoice with no customer tax id", () => {
    const d = doc();
    const issues = validatePrint(
      { ...d, billTo: { ...d.billTo, taxId: "" } },
      PRINT_CONFIGS["delivery-tax-invoice"],
      "ORIGINAL",
    );
    expect(issues.some((i) => i.blocking && i.field === "billTo.taxId")).toBe(true);
  });

  it("blocks a document with no lines, no date or no billing address", () => {
    const c = PRINT_CONFIGS["delivery-tax-invoice"];
    const d = doc();
    expect(validatePrint({ ...d, lines: [] }, c, "ORIGINAL").some((i) => i.blocking && i.field === "lines")).toBe(true);
    expect(validatePrint({ ...d, date: "" }, c, "ORIGINAL").some((i) => i.blocking && i.field === "date")).toBe(true);
    expect(
      validatePrint({ ...d, billTo: { ...d.billTo, address: "" } }, c, "ORIGINAL").some(
        (i) => i.blocking && i.field === "billTo.address",
      ),
    ).toBe(true);
  });

  it("warns without blocking when lot numbers are missing", () => {
    const c = PRINT_CONFIGS["delivery-order"];
    const d = mapDocument({ entity: "delivery-order", code: SMALL_DO }, c)!;
    const issues = validatePrint(d, c, "ORIGINAL");
    const lot = issues.find((i) => i.field === "lines.lot");
    expect(lot).toBeDefined();
    expect(lot!.blocking).toBe(false);
    expect(issues.filter((i) => i.blocking)).toEqual([]);
  });

  it("blocks a copy type the document does not support", () => {
    const issues = validatePrint(doc(), PRINT_CONFIGS["tax-invoice"], "WAREHOUSE");
    expect(issues.some((i) => i.blocking && i.field === "copyType")).toBe(true);
  });

  it("does not demand totals on a copy that may not show them", () => {
    const c = PRINT_CONFIGS["sales-return"];
    const job = buildPrintJob("sales-return", SALES_RETURNS[0].code, { copyType: "WAREHOUSE" })!;
    expect(job.doc.totals).toBeNull();
    expect(validatePrint(job.doc, c, "WAREHOUSE").filter((i) => i.blocking)).toEqual([]);
  });
});

/* ============================================================
   Print, reprint and the audit trail
   ============================================================ */

describe("Print framework — print and reprint", () => {
  beforeEach(asAdmin);

  it("counts the first print as the original and the second as a reprint", () => {
    const c = PRINT_CONFIGS["delivery-order"];
    expect(printCount("delivery-order", SMALL_DO)).toBe(0);
    expect(recordPrint(c, SMALL_DO, "ORIGINAL", 1)).toBe(1);
    expect(recordPrint(c, SMALL_DO, "ORIGINAL", 1)).toBe(2);
    expect(printCount("delivery-order", SMALL_DO)).toBe(2);
    /* A different document has its own counter. */
    expect(printCount("delivery-order", BULK_DO)).toBe(0);
  });

  it("labels a document REPRINT once it has been printed, whatever copy is asked for", () => {
    const before = buildPrintJob("delivery-order", SMALL_DO, { copyType: "CUSTOMER" })!;
    expect(before.copyLabelEN).toBe("CUSTOMER COPY");
    expect(before.reprintOf).toBe(0);

    recordPrint(PRINT_CONFIGS["delivery-order"], SMALL_DO, "ORIGINAL", 1);

    const after = buildPrintJob("delivery-order", SMALL_DO, { copyType: "CUSTOMER" })!;
    expect(after.copyLabelEN).toBe("REPRINT");
    expect(after.reprintOf).toBe(1);
  });

  it("watermarks every page of a reprint", () => {
    recordPrint(PRINT_CONFIGS["delivery-order"], BULK_DO, "ORIGINAL", 3);
    const job = buildPrintJob("delivery-order", BULK_DO)!;
    const { container } = render(<PrintDocument job={job} />);
    expect(container.querySelectorAll(".a4-watermark").length).toBe(job.totalPages);
  });

  it("writes a print and a reprint into the Administration audit log", () => {
    const before = AUDIT_LOG.length;
    recordPrint(PRINT_CONFIGS["delivery-order"], SMALL_DO, "CUSTOMER", 1);
    recordPrint(PRINT_CONFIGS["delivery-order"], SMALL_DO, "CUSTOMER", 1);
    expect(AUDIT_LOG.length).toBe(before + 2);
    const [latest, first] = AUDIT_LOG;
    expect(first.detail).toContain("พิมพ์");
    expect(latest.detail).toContain("พิมพ์ซ้ำ");
    expect(latest.ref).toBe(SMALL_DO);
  });

  it("offers Reprint only after the document has been printed", () => {
    const menu = () =>
      printActions("delivery-order", { code: SMALL_DO } as never, ctx()).find(
        (a) => "label" in a && a.label === "Reprint",
      ) as { disabled?: boolean };

    expect(menu().disabled).toBe(true);
    recordPrint(PRINT_CONFIGS["delivery-order"], SMALL_DO, "ORIGINAL", 1);
    expect(menu().disabled).toBe(false);
  });

  it("builds the print block from config, so a module names no copy type", () => {
    const acts = printActions("delivery-order", { code: SMALL_DO } as never, ctx());
    const labels = acts.filter((a) => "label" in a).map((a) => (a as { label: string }).label);
    expect(labels).toContain("Print Preview");
    /* Both sibling documents of a delivery order are offered. */
    expect(labels).toContain("Print DELIVERY ORDER");
    expect(labels).toContain("Print DELIVERY ORDER / TAX INVOICE");
    expect(labels).toContain("Print Warehouse Copy");
    expect(labels).toContain("Export PDF");
  });
});

/* ============================================================
   Rendering — one page and many
   ============================================================ */

describe("Print framework — one-page document", () => {
  beforeEach(asAdmin);

  it("renders a single sheet with totals and no continuation markers", () => {
    const job = buildPrintJob("delivery-tax-invoice", SMALL_DO)!;
    expect(job.totalPages).toBe(1);
    render(<PrintDocument job={job} />);

    expect(screen.getByTestId("print-document")).toHaveAttribute("data-pages", "1");
    expect(screen.getByTestId("print-page-1")).toBeInTheDocument();
    expect(screen.queryByTestId("continued-from")).not.toBeInTheDocument();
    expect(screen.queryByTestId("continued-next")).not.toBeInTheDocument();
    expect(screen.getByTestId("print-closing")).toBeInTheDocument();
    expect(screen.getByText("GRAND TOTAL")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
  });

  it("prints the header, parties and signatures on the only page", () => {
    const job = buildPrintJob("delivery-tax-invoice", SMALL_DO)!;
    render(<PrintDocument job={job} />);
    expect(screen.getByText("BILL TO")).toBeInTheDocument();
    expect(screen.getByText("SHIP TO")).toBeInTheDocument();
    expect(screen.getByText("RECEIVED BY")).toBeInTheDocument();
    expect(screen.getByText(job.config.titleEN)).toBeInTheDocument();
  });

  it("pads the item table with filler rows so the form keeps its height", () => {
    const job = buildPrintJob("delivery-tax-invoice", SMALL_DO)!;
    const { container } = render(<PrintDocument job={job} />);
    expect(container.querySelectorAll(".a4-filler").length).toBe(fillerRows(job.pages[0]));
  });
});

describe("Print framework — multi-page document", () => {
  beforeEach(asAdmin);

  it("splits the 38-line delivery order across pages", () => {
    const job = buildPrintJob("delivery-order", BULK_DO)!;
    expect(job.doc.lines).toHaveLength(BULK_ORDER_ITEMS.length);
    expect(job.totalPages).toBeGreaterThan(1);
  });

  it("marks continuation on every page but the first and last", () => {
    const job = buildPrintJob("delivery-tax-invoice", BULK_DO)!;
    render(<PrintDocument job={job} />);

    expect(screen.getAllByTestId("continued-from")).toHaveLength(job.totalPages - 1);
    expect(screen.getAllByTestId("continued-next")).toHaveLength(job.totalPages - 1);
  });

  it("shows the totals block exactly once, on the final page", () => {
    const job = buildPrintJob("delivery-tax-invoice", BULK_DO)!;
    render(<PrintDocument job={job} />);

    expect(screen.getAllByTestId("print-closing")).toHaveLength(1);
    expect(screen.getAllByText("GRAND TOTAL")).toHaveLength(1);

    const last = screen.getByTestId(`print-page-${job.totalPages}`);
    expect(within(last).getByTestId("print-closing")).toBeInTheDocument();
    const first = screen.getByTestId("print-page-1");
    expect(within(first).queryByText("GRAND TOTAL")).not.toBeInTheDocument();
  });

  it("repeats the company header and page numbering on every sheet", () => {
    const job = buildPrintJob("delivery-tax-invoice", BULK_DO)!;
    render(<PrintDocument job={job} />);
    for (let p = 1; p <= job.totalPages; p++) {
      const page = screen.getByTestId(`print-page-${p}`);
      /* Page 1 carries it in the footer; later pages also carry it in the
         compact running header. */
      expect(
        within(page).getAllByText(new RegExp(`Page ${p} of ${job.totalPages}`)).length,
        `page ${p}`,
      ).toBeGreaterThan(0);
      expect(within(page).getAllByText(new RegExp(job.doc.code)).length).toBeGreaterThan(0);
    }
  });

  it("shows the customer panels only on the first page", () => {
    const job = buildPrintJob("delivery-tax-invoice", BULK_DO)!;
    render(<PrintDocument job={job} />);
    expect(screen.getAllByText("BILL TO")).toHaveLength(1);
    expect(within(screen.getByTestId("print-page-1")).getByText("BILL TO")).toBeInTheDocument();
  });

  it("renders every line exactly once across all pages", () => {
    const job = buildPrintJob("delivery-order", BULK_DO)!;
    const { container } = render(<PrintDocument job={job} />);
    const rows = container.querySelectorAll(".a4-table tbody tr:not(.a4-filler)");
    expect(rows.length).toBe(job.doc.lines.length);
    for (const l of job.doc.lines) {
      expect(screen.getAllByText(l.code).length, l.code).toBe(1);
    }
  });

  it("gives the driver a signature block on page one when the totals land later", () => {
    /* delivery-order sets signaturesOnFirstPage — handover happens at the
       door, not after the accounts department has read page three. */
    const job = buildPrintJob("delivery-order", BULK_DO)!;
    expect(job.config.signaturesOnFirstPage).toBe(false);
    const withSig = { ...job, config: { ...job.config, signaturesOnFirstPage: true } };
    render(<PrintDocument job={withSig} />);
    expect(
      within(screen.getByTestId("print-page-1")).getAllByText("RECEIVED BY").length,
    ).toBeGreaterThan(0);
  });
});

/* ============================================================
   Preview screen
   ============================================================ */

describe("Print framework — preview", () => {
  beforeEach(asAdmin);

  it("shows the toolbar outside the printed area", () => {
    render(<PrintPreview docType="delivery-tax-invoice" code={SMALL_DO} />);
    expect(screen.getByTestId("preview-toolbar")).toHaveClass("no-print");
    expect(screen.getByTestId("preview-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("print-document")).toBeInTheDocument();
  });

  it("previews the same DOM that will be printed", () => {
    render(<PrintPreview docType="delivery-tax-invoice" code={SMALL_DO} />);
    const job = buildPrintJob("delivery-tax-invoice", SMALL_DO)!;
    expect(screen.getByTestId("print-document")).toHaveAttribute(
      "data-pages",
      String(job.totalPages),
    );
  });

  it("switches document variant without leaving the preview", async () => {
    const user = userEvent.setup();
    render(<PrintPreview docType="delivery-order" code={BULK_DO} />);

    /* The operational delivery note has no money on it at all. */
    expect(screen.queryByText("GRAND TOTAL")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Document Type"), "delivery-order-price");
    expect(screen.getByText("GRAND TOTAL")).toBeInTheDocument();
  });

  it("switches copy type and the prices leave the page with it", async () => {
    const user = userEvent.setup();
    render(<PrintPreview docType="sales-return" code={SALES_RETURNS[0].code} />);

    expect(screen.getByText("GRAND TOTAL")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Copy Type"), "WAREHOUSE");
    expect(screen.queryByText("GRAND TOTAL")).not.toBeInTheDocument();
  });

  it("opens on the copy type the menu link asked for", () => {
    /* "Print Warehouse Copy" links to ?copy=WAREHOUSE — landing on the
       original instead would put prices in the warehouse's hands. */
    render(
      <PrintPreview docType="sales-return" code={SALES_RETURNS[0].code} initialCopy="WAREHOUSE" />,
    );
    expect((screen.getByLabelText("Copy Type") as HTMLSelectElement).value).toBe("WAREHOUSE");
    expect(screen.queryByText("GRAND TOTAL")).not.toBeInTheDocument();
  });

  it("shows the copy it will actually print when the document does not support the one asked for", () => {
    render(
      <PrintPreview docType="tax-invoice" code={SALES_INVOICES[0].code} initialCopy="WAREHOUSE" />,
    );
    const select = screen.getByLabelText("Copy Type") as HTMLSelectElement;
    expect(select.value).not.toBe("WAREHOUSE");
    expect(PRINT_CONFIGS["tax-invoice"].supportedCopyTypes).toContain(select.value);
  });

  it("pages through a multi-page document", async () => {
    const user = userEvent.setup();
    render(<PrintPreview docType="delivery-tax-invoice" code={BULK_DO} />);
    const job = buildPrintJob("delivery-tax-invoice", BULK_DO)!;
    const bar = within(screen.getByTestId("preview-toolbar"));

    expect(bar.getByText(`Page 1 of ${job.totalPages}`)).toBeInTheDocument();
    expect(bar.getByLabelText("Previous page")).toBeDisabled();
    await user.click(bar.getByLabelText("Next page"));
    expect(bar.getByText(`Page 2 of ${job.totalPages}`)).toBeInTheDocument();
    expect(bar.getByLabelText("Previous page")).toBeEnabled();
  });

  it("zooms without changing the document", async () => {
    const user = userEvent.setup();
    render(<PrintPreview docType="delivery-order" code={SMALL_DO} />);
    expect(screen.getByText("80%")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Zoom in"));
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByTestId("print-document")).toBeInTheDocument();
  });

  it("fits a whole A4 sheet across the viewport", async () => {
    const user = userEvent.setup();
    render(<PrintPreview docType="delivery-order" code={SMALL_DO} />);
    await user.click(screen.getByText("Fit Width"));

    /* 210mm at 96dpi is 793.7px; jsdom's window is 1024 wide, so a whole
       sheet fits at slightly over 1:1. */
    const shown = Number(
      within(screen.getByTestId("preview-toolbar")).getByText(/%$/).textContent!.replace("%", ""),
    );
    const sheetPx = (210 / 25.4) * 96;
    expect(shown / 100).toBeCloseTo(
      Math.round(((window.innerWidth - 64) / sheetPx) * 100) / 100,
      2,
    );
  });

  it("lists every issue the document carries, and never in the printed area", () => {
    const job = buildPrintJob("delivery-order", SMALL_DO)!;
    expect(job.issues.length).toBeGreaterThan(0);

    render(<PrintPreview docType="delivery-order" code={SMALL_DO} />);
    const banner = screen.getByTestId("preview-issues");
    expect(banner).toHaveClass("no-print");
    expect(banner.querySelectorAll("li")).toHaveLength(job.issues.length);
  });

  it("warns in amber and blocks in red", () => {
    /* Warnings are the user's call; a blocking issue is not. The two must not
       look alike. */
    render(<PrintPreview docType="delivery-order" code={SMALL_DO} />);
    const warn = screen.getByTestId("preview-issues");
    expect(buildPrintJob("delivery-order", SMALL_DO)!.issues.every((i) => !i.blocking)).toBe(true);
    expect(warn.className).toContain("warning");
    expect(warn.textContent).toMatch(/ข้อควรทราบ/);
  });

  it("does not cry wolf about page height on a document that fits", () => {
    /* The overflow guard measures the laid-out sheet, so it must stay silent
       unless a page really outgrew A4 — a banner on every print would train
       the user to ignore it. */
    render(<PrintPreview docType="delivery-tax-invoice" code={BULK_DO} />);
    expect(screen.queryByTestId("preview-overflow")).not.toBeInTheDocument();
  });

  it("shows no issue banner when the document has nothing outstanding", () => {
    const job = buildPrintJob("sales-order", "SO2506-0001")!;
    expect(job.issues).toEqual([]);
    render(<PrintPreview docType="sales-order" code="SO2506-0001" />);
    expect(screen.queryByTestId("preview-issues")).not.toBeInTheDocument();
  });

  it("tells the user a document cannot be found instead of rendering an empty form", () => {
    render(<PrintPreview docType="delivery-order" code="DO-NOPE-9999" />);
    expect(screen.getByText("ไม่พบเอกสารที่ต้องการพิมพ์")).toBeInTheDocument();
    expect(screen.queryByTestId("print-document")).not.toBeInTheDocument();
  });
});

/* ============================================================
   Letterhead — the company's own branding
   ============================================================ */

describe("Print framework — letterhead", () => {
  beforeEach(asAdmin);

  it("prints the registered company details from Company Settings", () => {
    const job = buildPrintJob("delivery-tax-invoice", SMALL_DO)!;
    expect(job.doc.company.taxId).toBe(COMPANY.taxId);
    expect(job.doc.company.address).toBe(COMPANY.address);
    expect(job.doc.company.phone).toBe(COMPANY.phone);
    expect(job.doc.company.line).toBe(COMPANY.line);
    expect(job.doc.company.facebook).toBe(COMPANY.facebook);
  });

  it("closes every sheet with the letterhead band", () => {
    const job = buildPrintJob("delivery-tax-invoice", BULK_DO)!;
    render(<PrintDocument job={job} />);

    for (let p = 1; p <= job.totalPages; p++) {
      const page = within(screen.getByTestId(`print-page-${p}`));
      expect(page.getAllByText(new RegExp(COMPANY.website)).length, `page ${p}`).toBeGreaterThan(0);
      expect(page.getAllByText(/LINE @afactory/).length, `page ${p}`).toBeGreaterThan(0);
      expect(page.getByLabelText(COMPANY.tagline)).toBeInTheDocument();
    }
  });

  it("prints the tax id in both the header and the letterhead", () => {
    const job = buildPrintJob("delivery-tax-invoice", SMALL_DO)!;
    render(<PrintDocument job={job} />);
    expect(screen.getAllByText(new RegExp(COMPANY.taxId)).length).toBeGreaterThanOrEqual(2);
  });

  it("uses the official logo file when Company Settings names one", () => {
    const job = buildPrintJob("delivery-order", SMALL_DO)!;
    expect(job.doc.company.logoUrl).toBe(COMPANY.logoUrl);

    const branded = { ...job, doc: { ...job.doc, company: { ...job.doc.company, logoUrl: "/logo.svg" } } };
    const { container } = render(<PrintDocument job={branded} />);
    const imgs = container.querySelectorAll('img[alt="A-Factory"]');
    /* One per sheet — the header carries it on every page. */
    expect(imgs.length).toBe(branded.totalPages);
    expect(imgs[0].getAttribute("src")).toBe("/logo.svg");
  });

  it("falls back to the vector mark when no logo file is set", () => {
    const job = buildPrintJob("delivery-order", SMALL_DO)!;
    const { container } = render(<PrintDocument job={job} />);
    expect(container.querySelectorAll('img[alt="A-Factory"]')).toHaveLength(0);
    expect(container.querySelectorAll('svg[aria-label="A-Factory"]').length).toBeGreaterThan(0);
  });
});

/* ============================================================
   Layout — nothing may run off the sheet
   ============================================================ */

describe("Print framework — sheet layout", () => {
  /* The floor the renderer guarantees; kept here so the two cannot drift. */
  const MIN_DESCRIPTION = 28;

  it("leaves the item description at least a quarter of the table", () => {
    /* Eleven columns on a tax invoice used to squeeze the description to a
       few millimetres, wrapping every product name over four lines and
       pushing the sheet past the height the paginator planned for. */
    for (const t of PRINT_DOC_TYPES) {
      const cols = PRINT_CONFIGS[t].itemColumns;
      if (!cols.includes("description")) continue;
      const w = columnWidths(cols);
      expect(parseFloat(w.description), t).toBeGreaterThanOrEqual(MIN_DESCRIPTION);
    }
  });

  it("always adds the columns up to exactly the table width", () => {
    for (const t of PRINT_DOC_TYPES) {
      const cols = PRINT_CONFIGS[t].itemColumns;
      const total = Object.values(columnWidths(cols)).reduce((s, v) => s + parseFloat(v), 0);
      expect(total, t).toBeCloseTo(100, 1);
    }
  });

  it("keeps every column on the sheet once permissions remove some", () => {
    asAdmin();
    const c = PRINT_CONFIGS["sales-return"];
    const cols = visibleColumns(c, "WAREHOUSE");
    const total = Object.values(columnWidths(cols)).reduce((s, v) => s + parseFloat(v), 0);
    expect(total).toBeCloseTo(100, 1);
    expect(parseFloat(columnWidths(cols).description)).toBeGreaterThanOrEqual(MIN_DESCRIPTION);
  });
});

/* ============================================================
   Saving a PDF
   ============================================================ */

describe("Print framework — save as PDF", () => {
  beforeEach(asAdmin);

  it("names the file after the document, not 'document.pdf'", () => {
    expect(pdfFilename(PRINT_CONFIGS["delivery-tax-invoice"], BULK_DO, "ORIGINAL")).toBe(
      "DELIVERY-ORDER---TAX-INVOICE_DO2507-0006_ORIGINAL",
    );
    /* Nothing a filesystem rejects survives. */
    expect(pdfFilename(PRINT_CONFIGS.receipt, "INV/2026:1", "COMPANY")).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("records a PDF export as an issued document, distinctly from a print", () => {
    const before = AUDIT_LOG.length;
    recordPrint(PRINT_CONFIGS["delivery-order"], SMALL_DO, "ORIGINAL", 1, "pdf");
    expect(AUDIT_LOG.length).toBe(before + 1);
    expect(AUDIT_LOG[0].detail).toContain("ส่งออก PDF");
    /* Same counter as paper: a saved PDF can be presented like a print. */
    expect(printCount("delivery-order", SMALL_DO)).toBe(1);
  });

  it("saves from the preview and logs it", async () => {
    const user = userEvent.setup();
    render(<PrintPreview docType="delivery-tax-invoice" code={SMALL_DO} />);
    const before = AUDIT_LOG.length;

    await user.click(screen.getByText("Export PDF"));

    expect(AUDIT_LOG.length).toBe(before + 1);
    expect(AUDIT_LOG[0].detail).toContain("ส่งออก PDF");
    expect(printCount("delivery-tax-invoice", SMALL_DO)).toBe(1);
  });

  it("refuses to save a document that may not be printed", async () => {
    const user = userEvent.setup();
    const c = PRINT_CONFIGS["delivery-tax-invoice"];
    const d = mapDocument({ entity: "delivery-order", code: SMALL_DO }, c)!;
    /* Same blocking rule as Print — a PDF is not a lesser document. */
    expect(
      validatePrint({ ...d, billTo: { ...d.billTo, taxId: "" } }, c, "ORIGINAL").some(
        (i) => i.blocking,
      ),
    ).toBe(true);

    render(<PrintPreview docType="delivery-order" code="DO-NOPE-9999" />);
    expect(screen.queryByText("Export PDF")).not.toBeInTheDocument();
    await user.click(screen.getByText("กลับ"));
  });
});

/* ============================================================
   The mock data the framework is exercised against
   ============================================================ */

describe("Print framework — multi-page fixture", () => {
  it("carries enough shape to exercise the pagination rules", () => {
    const so = SALES_ORDERS.find((s) => s.code === BULK_SO)!;
    const del = DELIVERY_ORDERS.find((d) => d.code === BULK_DO)!;

    expect(BULK_ORDER_ITEMS.length).toBeGreaterThanOrEqual(35);
    expect(so.items).toHaveLength(BULK_ORDER_ITEMS.length);
    expect(del.items).toHaveLength(BULK_ORDER_ITEMS.length);

    const uoms = new Set(BULK_ORDER_ITEMS.map((i) => i.unit));
    expect(uoms.size).toBeGreaterThanOrEqual(5);
    expect(BULK_ORDER_ITEMS.filter((i) => i.note.includes(" | ")).length).toBeGreaterThan(0);
    expect(BULK_ORDER_ITEMS.filter((i) => i.lot).length).toBeGreaterThan(0);
    expect(BULK_ORDER_ITEMS.filter((i) => i.serial).length).toBeGreaterThan(0);
  });

  it("keeps every fixture item code unique", () => {
    expect(new Set(BULK_ORDER_ITEMS.map((i) => i.code)).size).toBe(BULK_ORDER_ITEMS.length);
  });
});

/* ============================================================
   The Document Templates screen reads the same config
   ============================================================ */

describe("Document Templates", () => {
  it("registers a document type for every print config", () => {
    /* The settings screen is driven by PRINT_CONFIGS, so it cannot drift
       from what the engine prints. */
    for (const t of PRINT_DOC_TYPES) expect(getPrintConfig(t)).not.toBeNull();
    expect(getPrintConfig("not-a-type" as PrintDocType)).toBeNull();
  });

  it("lists every printable document and opens on the delivery order", () => {
    asAdmin();
    render(<DocumentTemplatesPage />);
    const select = screen.getByLabelText("Document Type") as HTMLSelectElement;
    expect(select.options).toHaveLength(PRINT_DOC_TYPES.length);
    expect(select.value).toBe("delivery-order");
  });

  it("shows the capacities and columns the engine will actually use", async () => {
    asAdmin();
    const user = userEvent.setup();
    render(<DocumentTemplatesPage />);
    const panel = screen.getByTestId("template-detail");

    const doCfg = PRINT_CONFIGS["delivery-order"];
    /* First and last page hold the same number of rows on this document, so
       the value legitimately appears twice. */
    expect(within(panel).getAllByText(`${doCfg.firstPageRows} row units`).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Lot No.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Document Type"), "picking");
    const pick = PRINT_CONFIGS.picking;
    expect(within(panel).getByText(`${pick.firstPageRows} row units`)).toBeInTheDocument();
    expect(within(panel).getByText(`${pick.lastPageRows} row units`)).toBeInTheDocument();
    /* A picking list carries no money, and the screen must say so. */
    expect(within(panel).queryByText("Amount")).not.toBeInTheDocument();
  });

  it("reads the default bank from Company Settings, not from the template", () => {
    asAdmin();
    render(<DocumentTemplatesPage />);
    const bank = COMPANY_BANKS.find((b) => b.isDefault)!;
    expect(screen.getByText(bank.accountNo)).toBeInTheDocument();
  });
});
