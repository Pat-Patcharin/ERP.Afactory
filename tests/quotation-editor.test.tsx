import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EntityCreatePage from "@/app/(erp)/m/[entity]/new/page";
import EntityEditPage from "@/app/(erp)/m/[entity]/[code]/edit/page";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { COMPANY, USERS } from "@/data/admin";
import { QT_PRICE_LISTS, QUOTATIONS as RAW_QUOTATIONS } from "@/data/quotations";
import { BUSINESS_PARTNERS } from "@/lib/domain/partner";
import { SALES_REPRESENTATIVES } from "@/lib/domain/sales";
import { PRODUCTS } from "@/lib/domain/product";
import { QUOTATIONS, getCustomer } from "@/lib/domain/outbound";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import {
  applyCustomer,
  applyProduct,
  applyShipTo,
  blankDraft,
  resolvePriceList,
  resolveRep,
  blankLine,
  blockingIssues,
  draftFromQuotation,
  draftInsight,
  draftPrintDoc,
  draftTotals,
  saveQuotationDraft,
  shipToChoices,
  validateDraft,
  warningIssues,
  type QuotationDraft,
} from "@/lib/domain/quotation-draft";
import { docGrandTotal } from "@/lib/domain/lines";
import { buildPrintJob, getPrintConfig } from "@/lib/print";
import { getSchemas } from "@/schemas/registry";
import { routeParams } from "./setup";

/* ============================================================
   QUOTATION DOCUMENT EDITOR regression suite.

   The point of the refactor is that there is now ONE surface: the
   document. So the tests that matter most are the ones proving
   there is no second one — no wizard, no review step, and no
   second calculation engine behind the totals block.
   ============================================================ */

const CUSTOMER = "BP000123 - บริษัท เดนทัล สมายล์ จำกัด";
const PRODUCT = "AA-TH003-WL";

/** Restore the mock store: the editor writes into it. */
const SNAPSHOT = RAW_QUOTATIONS.map((q) => ({ ...q, items: q.items.map((i) => ({ ...i })) }));

beforeEach(() => {
  QUOTATIONS.length = 0;
  QUOTATIONS.push(...(SNAPSHOT.map((q) => ({ ...q, items: q.items.map((i) => ({ ...i })) })) as never[]));
  window.localStorage.clear();
});

afterEach(() => {
  resetCurrentUser();
  vi.useRealTimers();
});

const asRole = (roleCode: string) => {
  const u = USERS.find((x) => x.roleCode === roleCode && x.status === "Active")!;
  setCurrentUser(u.code);
  return u;
};

/** A draft with a customer, one product line and a valid date range. */
function readyDraft(over: Partial<QuotationDraft> = {}): QuotationDraft {
  const base = applyCustomer(blankDraft(), CUSTOMER);
  return {
    ...base,
    salesRep: base.salesRep || "SALE001 - Patcharin Thiengkaew",
    items: [{ ...applyProduct(blankLine(), PRODUCT), qty: 10, price: 100, disc: 0, tax: 7 }],
    ...over,
  };
}

/* ============================================================
   The wizard is gone
   ============================================================ */

describe("Quotation editor — the wizard is gone", () => {
  it("no longer registers a step form for quotations", () => {
    /* The three-step schema is deleted, not merely bypassed — there is no
       second definition of what a quotation requires. */
    const schemas = getSchemas("quotation")!;
    expect(schemas.form).toBeUndefined();
    expect(schemas.editor).toBeDefined();
  });

  it("renders the document editor on the create route, with no stepper", () => {
    routeParams.entity = "quotation";
    render(<EntityCreatePage />);

    expect(screen.getByTestId("quotation-document")).toBeInTheDocument();
    for (const gone of ["Customer step", "Review", "ตรวจทาน", "Step 1", "1 / 3"]) {
      expect(screen.queryByText(gone), gone).not.toBeInTheDocument();
    }
    /* Nothing numbered the steps, and nothing offers a "next" move. */
    expect(screen.queryByRole("button", { name: /ถัดไป|Next step/ })).not.toBeInTheDocument();
  });

  it("renders the same editor on the edit route", () => {
    routeParams.entity = "quotation";
    routeParams.code = "QT2506-0001";
    render(<EntityEditPage />);
    expect(screen.getByTestId("quotation-document")).toBeInTheDocument();
  });

  it("keeps every other module on the generic form", () => {
    /* The editor is opt-in per entity; nothing else changed. */
    for (const key of ["sales-order", "purchase-order", "product"]) {
      const s = getSchemas(key)!;
      expect(s.editor, key).toBeUndefined();
      expect(s.form, key).toBeDefined();
    }
  });
});

/* ============================================================
   Document structure
   ============================================================ */

describe("Quotation editor — document layout", () => {
  beforeEach(() => render(<QuotationEditor />));

  it("prints the A-Factory letterhead into the editing canvas", () => {
    const doc = within(screen.getByTestId("quotation-document"));
    expect(doc.getByText(COMPANY.nameEn)).toBeInTheDocument();
    expect(doc.getByText(COMPANY.nameTh)).toBeInTheDocument();
    expect(doc.getByText(new RegExp(COMPANY.taxId))).toBeInTheDocument();
    expect(doc.getByText("QUOTATION")).toBeInTheDocument();
    expect(doc.getByText("DRAFT")).toBeInTheDocument();
  });

  it("shows a quotation number from the existing number series", () => {
    const doc = within(screen.getByTestId("quotation-document"));
    expect(doc.getByText(/^QT\d{4}-\d{4}$/)).toBeInTheDocument();
  });

  it("lays out every section of the printed form", () => {
    const doc = within(screen.getByTestId("quotation-document"));
    for (const section of ["Bill To", "Ship To", "Items", "Remark", "Grand Total"]) {
      expect(doc.getByText(section), section).toBeInTheDocument();
    }
    for (const sig of ["Prepared By", "Sales Representative", "Approved By", "Customer Acceptance"]) {
      expect(doc.getAllByText(new RegExp(sig)).length, sig).toBeGreaterThan(0);
    }
    expect(doc.getByText(/Generated by/)).toBeInTheDocument();
  });

  it("keeps the save actions in a sticky toolbar and a sticky summary", () => {
    expect(screen.getByTestId("qt-toolbar")).toHaveClass("sticky");
    expect(screen.getByTestId("qt-sticky-summary")).toHaveClass("fixed");
    expect(within(screen.getByTestId("qt-toolbar")).getByText("Save Quotation")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("qt-sticky-summary")).getByText("Save Draft"),
    ).toBeInTheDocument();
  });
});

/* ============================================================
   Customer
   ============================================================ */

describe("Quotation editor — customer", () => {
  it("loads the whole partner when a customer is chosen", () => {
    const bp = getCustomer(CUSTOMER)!;
    const d = applyCustomer(blankDraft(), CUSTOMER);

    expect(d.customerCode).toBe(bp.code);
    expect(d.customer).toBe(bp.nameTh);
    expect(d.taxId).toBe(bp.tax.taxId);
    expect(d.billAddress).toBeTruthy();
    expect(d.billContact).toBeTruthy();
    /* Commercial terms come with the customer — but only the ones the
       quotation can actually offer. */
    expect(d.payTerm).toBe(bp.sales!.payTerm);
  });

  it("never writes a term the picker cannot show", () => {
    /* The partner master keeps the rep as "SRE001 - สมชาย ใจดี" and the price
       group as "Retail 2569"; neither exists in the Sales Rep master or the
       quotation price lists. Adopting them verbatim would leave the field
       blank on screen with a value hidden underneath it. */
    const bp = getCustomer(CUSTOMER)!;
    expect(resolveRep(bp.sales!.rep)).toBe("");
    expect(resolvePriceList(bp.sales!.priceList)).toBe("");

    const d = applyCustomer(blankDraft(), CUSTOMER);
    expect(d.salesRep).toBe("");
    expect(QT_PRICE_LISTS).toContain(d.priceList);
  });

  it("adopts a rep and a price list it can resolve", () => {
    const rep = SALES_REPRESENTATIVES.find((r) => r.status === "Active")!;
    expect(resolveRep(`SRE999 - ${rep.first} ${rep.last}`)).toBe(
      `${rep.code} - ${rep.first} ${rep.last}`,
    );
    expect(resolvePriceList("Dealer 2569")).toBe("PL-DEALER-2026 Dealer");
  });

  it("fills Bill To in the document when the salesperson picks a customer", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    const bp = getCustomer(CUSTOMER)!;

    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);

    const doc = within(screen.getByTestId("quotation-document"));
    expect(doc.getAllByText(bp.code).length).toBeGreaterThan(0);
    expect(doc.getAllByText(bp.tax.taxId).length).toBeGreaterThan(0);
    /* The payment term travelled with the customer. */
    expect((screen.getByLabelText("Payment Term") as HTMLSelectElement).value).toBe(
      bp.sales!.payTerm,
    );
  });

  it("offers the customer's own addresses for Ship To", () => {
    const choices = shipToChoices(CUSTOMER);
    expect(choices.length).toBeGreaterThan(0);
    const picked = applyShipTo(applyCustomer(blankDraft(), CUSTOMER), choices[1]?.label ?? choices[0].label);
    expect(picked.sameAsBill).toBe(false);
    expect(picked.shipAddress).toBeTruthy();
  });

  it("mirrors the billing address while Same as Bill To is ticked", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);

    const same = screen.getByLabelText("Same as Bill To") as HTMLInputElement;
    expect(same.checked).toBe(true);
    /* Ticked: no address selector, because there is nothing to choose. */
    expect(screen.queryByLabelText("Delivery Address")).not.toBeInTheDocument();

    await user.click(same);
    expect(screen.getByLabelText("Delivery Address")).toBeInTheDocument();
  });

  it("prints the billing address as the ship-to when they are the same", () => {
    const d = readyDraft({ sameAsBill: true });
    const doc = draftPrintDoc(d, getPrintConfig("quotation")!);
    expect(doc.shipTo.address).toBe(d.billAddress);
  });
});

/* ============================================================
   Items
   ============================================================ */

describe("Quotation editor — items", () => {
  it("loads the product master into a line", () => {
    const p = PRODUCTS.find((x) => x.code === PRODUCT)!;
    const line = applyProduct(blankLine(), PRODUCT);
    expect(line.name).toBe(p.name);
    expect(line.unit).toBe(p.unit);
    expect(line.price).toBe(p.price);
    expect(line.qty).toBe(1);
    expect(line.tax).toBe(7);
  });

  it("never overwrites a price the salesperson has already negotiated", () => {
    const negotiated = { ...applyProduct(blankLine(), PRODUCT), price: 55 };
    expect(applyProduct(negotiated, PRODUCT).price).toBe(55);
  });

  it("adds a product from the grid without leaving the page", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);

    await user.click(screen.getByLabelText("Item Code 1"));
    await user.type(screen.getByLabelText("Item Code 1"), PRODUCT.slice(0, 6));
    await user.click(await screen.findByText(PRODUCT));

    expect((screen.getByLabelText("Item Code 1") as HTMLInputElement).value).toBe(PRODUCT);
    expect((screen.getByLabelText("Quantity 1") as HTMLInputElement).value).toBe("1");
    /* Still the same page — no modal step, no route change. */
    expect(screen.getByTestId("quotation-document")).toBeInTheDocument();
  });

  it("adds a row with the Add Item button", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    expect(screen.queryByLabelText("Item Code 2")).not.toBeInTheDocument();
    await user.click(screen.getByText("Add Item"));
    expect(screen.getByLabelText("Item Code 2")).toBeInTheDocument();
  });

  it("adds many products at once from the multiple-items dialog", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);

    await user.click(screen.getByText("Add Multiple Items"));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("วางรหัสสินค้า"), `${PRODUCTS[0].code}\n${PRODUCTS[1].code}`);
    await user.click(dialog.getByText(/^เพิ่ม 2 รายการ$/));

    expect((screen.getByLabelText("Item Code 1") as HTMLInputElement).value).toBe(PRODUCTS[0].code);
    expect((screen.getByLabelText("Item Code 2") as HTMLInputElement).value).toBe(PRODUCTS[1].code);
  });

  it("edits a line in place and removes it", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);

    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));
    await user.clear(screen.getByLabelText("Quantity 1"));
    await user.type(screen.getByLabelText("Quantity 1"), "5");
    expect((screen.getByLabelText("Quantity 1") as HTMLInputElement).value).toBe("5");

    await user.click(screen.getByLabelText("ลบบรรทัดที่ 1"));
    /* The last row is never truly removed — an empty grid has nowhere to type. */
    expect((screen.getByLabelText("Item Code 1") as HTMLInputElement).value).toBe("");
  });

  it("opens the next row on Enter at the end of the grid", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.click(screen.getByLabelText("Quantity 1"));
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Item Code 2")).toBeInTheDocument();
  });
});

/* ============================================================
   Live calculation
   ============================================================ */

describe("Quotation editor — live calculation", () => {
  it("uses the shared document line maths, not its own", () => {
    const d = readyDraft();
    const t = draftTotals(d);
    expect(t.subtotal).toBe(1000);
    expect(t.vat).toBeCloseTo(70, 2);
    expect(t.grandTotal).toBeCloseTo(1070, 2);
    /* Same answer as every other document in the ERP. */
    expect(t.grandTotal).toBeCloseTo(
      docGrandTotal({ items: [{ qty: 10, price: 100, disc: 0, tax: 7 }] }),
      2,
    );
  });

  it("applies a line discount before tax", () => {
    const t = draftTotals(readyDraft({ items: [{ ...blankLine(), code: PRODUCT, qty: 10, price: 100, disc: 10, tax: 7 }] }));
    expect(t.lineDiscount).toBe(100);
    expect(t.netAmount).toBe(900);
    expect(t.vat).toBeCloseTo(63, 2);
    expect(t.grandTotal).toBeCloseTo(963, 2);
  });

  it("reduces VAT proportionally when a header discount is given", () => {
    const t = draftTotals(readyDraft({ headerDisc: 100 }));
    expect(t.headerDiscount).toBe(100);
    expect(t.netAmount).toBe(900);
    expect(t.vat).toBeCloseTo(63, 2);
    expect(t.grandTotal).toBeCloseTo(963, 2);
  });

  it("adds freight and other charges after tax", () => {
    const t = draftTotals(readyDraft({ freight: 200, otherCharges: 50 }));
    expect(t.grandTotal).toBeCloseTo(1320, 2);
  });

  it("recalculates the document as the user types", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);

    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));
    await user.clear(screen.getByLabelText("Quantity 1"));
    await user.type(screen.getByLabelText("Quantity 1"), "10");
    await user.clear(screen.getByLabelText("Unit Price 1"));
    await user.type(screen.getByLabelText("Unit Price 1"), "100");

    const summary = within(screen.getByTestId("qt-sticky-summary"));
    expect(summary.getByText("1,070.00")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Discount 1"));
    await user.type(screen.getByLabelText("Discount 1"), "10");
    expect(summary.getByText("963.00")).toBeInTheDocument();
  });

  it("writes the grand total in words", () => {
    const doc = draftPrintDoc(readyDraft(), getPrintConfig("quotation")!);
    expect(doc.totals!.amountInWords).toContain("บาท");
  });
});

/* ============================================================
   Customer insight and credit
   ============================================================ */

describe("Quotation editor — customer insight and credit", () => {
  it("reads credit and history for the chosen customer", () => {
    const i = draftInsight(readyDraft());
    expect(i.found).toBe(true);
    expect(i.limit).toBeGreaterThan(0);
    expect(i.payTerm).toBeTruthy();
    expect(i.priceList).toBeTruthy();
  });

  it("stays collapsed until asked, and never dominates the page", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);

    const panel = screen.getByTestId("customer-insight");
    expect(within(panel).queryByText("Credit Limit")).not.toBeInTheDocument();
    await user.click(within(panel).getByText("ดูข้อมูลลูกค้า"));
    expect(within(panel).getByText("Credit Limit")).toBeInTheDocument();
    expect(within(panel).getByText("Last Sales Order")).toBeInTheDocument();
  });

  it("warns when the quotation pushes the customer over their limit", () => {
    const bp = getCustomer(CUSTOMER)!;
    const over = bp.credit.limit - bp.credit.outstanding + 100_000;
    const d = readyDraft({
      items: [{ ...blankLine(), code: PRODUCT, qty: 1, price: over, disc: 0, tax: 0 }],
    });

    const i = draftInsight(d);
    expect(i.withinLimit).toBe(false);
    expect(i.overBy).toBeGreaterThan(0);

    render(<QuotationEditor />);
    /* Nothing is over the limit on a blank document. */
    expect(screen.queryByTestId("credit-warning")).not.toBeInTheDocument();
  });

  it("never blocks a draft over the credit limit", () => {
    const bp = getCustomer(CUSTOMER)!;
    const over = bp.credit.limit + 1;
    const d = readyDraft({
      items: [{ ...blankLine(), code: PRODUCT, qty: 1, price: over, disc: 0, tax: 0 }],
    });
    const credit = validateDraft(d).filter((i) => i.field === "credit");
    expect(credit.length).toBe(1);
    expect(credit[0].blocking).toBe(false);
  });

  it("shows no cost or margin anywhere on the document", () => {
    asRole("SALES_REP");
    render(<QuotationEditor />);
    const text = screen.getByTestId("quotation-document").textContent ?? "";
    for (const word of ["Cost", "Margin", "Profit", "ต้นทุน", "กำไร"]) {
      expect(text, word).not.toContain(word);
    }
  });
});

/* ============================================================
   Validation
   ============================================================ */

describe("Quotation editor — validation", () => {
  it("passes a complete quotation", () => {
    expect(blockingIssues(validateDraft(readyDraft()))).toEqual([]);
  });

  it("blocks the things a quotation cannot be issued without", () => {
    const empty = blankDraft();
    const fields = blockingIssues(validateDraft(empty)).map((i) => i.field);
    expect(fields).toContain("customer");
    expect(fields).toContain("salesRep");
    expect(fields).toContain("items");
  });

  it("blocks a validity date that is not after the document date", () => {
    const d = readyDraft({ quoteDate: "2026-08-04", validUntil: "2026-08-04" });
    expect(blockingIssues(validateDraft(d)).some((i) => i.field === "validUntil")).toBe(true);
  });

  it("blocks a zero quantity or price", () => {
    const zero = readyDraft({
      items: [{ ...blankLine(), code: PRODUCT, qty: 0, price: 100, disc: 0, tax: 7 }],
    });
    expect(blockingIssues(validateDraft(zero)).length).toBeGreaterThan(0);
  });

  it("only warns about a missing reference, a deep discount or short stock", () => {
    const d = readyDraft({
      customerRef: "",
      items: [{ ...blankLine(), code: PRODUCT, qty: 5, price: 100, disc: 60, tax: 7 }],
    });
    const issues = validateDraft(d);
    expect(blockingIssues(issues)).toEqual([]);
    const messages = warningIssues(issues).map((i) => i.message).join(" ");
    expect(messages).toMatch(/อ้างอิงของลูกค้า/);
    expect(messages).toMatch(/สูงกว่าเกณฑ์ปกติ/);
  });

  it("shows an error summary on save and refuses to issue", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);

    /* Before saving, only what is worth knowing — never a wall of red on a
       document the salesperson has barely started. */
    const before = screen.getByTestId("issue-summary");
    expect(within(before).getByText(/ข้อควรทราบ/)).toBeInTheDocument();
    expect(within(before).queryByText("ยังไม่ได้เลือกลูกค้า")).not.toBeInTheDocument();

    await user.click(within(screen.getByTestId("qt-toolbar")).getByText("Save Quotation"));

    const summary = screen.getByTestId("issue-summary");
    expect(within(summary).getByText(/ต้องแก้ไข/)).toBeInTheDocument();
    expect(within(summary).getByText("ยังไม่ได้เลือกลูกค้า")).toBeInTheDocument();
    /* Nothing was written. */
    expect(QUOTATIONS.some((q) => q.customer === "")).toBe(false);
  });

  it("jumps to the offending field when an error is clicked", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.click(within(screen.getByTestId("qt-toolbar")).getByText("Save Quotation"));

    await user.click(within(screen.getByTestId("issue-summary")).getByText("ยังไม่ได้เลือกพนักงานขาย"));
    expect(document.activeElement).toBe(screen.getByLabelText("Sales Representative"));
  });

  it("never uses a browser alert", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<QuotationEditor />);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

/* ============================================================
   Saving and autosave
   ============================================================ */

describe("Quotation editor — saving", () => {
  it("saves a draft with incomplete optional information", () => {
    const partial = { ...blankDraft(), customerRef: "" };
    const before = QUOTATIONS.length;
    const res = saveQuotationDraft(partial, { issue: false });
    expect(res.created).toBe(true);
    expect(QUOTATIONS.length).toBe(before + 1);
    expect(QUOTATIONS[0].status).toBe("Draft");
  });

  it("updates in place rather than piling up duplicates", () => {
    const d = readyDraft();
    saveQuotationDraft(d, { issue: false });
    const after = QUOTATIONS.length;
    saveQuotationDraft(d, { issue: false });
    saveQuotationDraft({ ...d, customerRef: "RFQ-2" }, { issue: true });

    expect(QUOTATIONS.length).toBe(after);
    expect(QUOTATIONS.filter((q) => q.code === d.code)).toHaveLength(1);
    expect(QUOTATIONS.find((q) => q.code === d.code)!.customerRef).toBe("RFQ-2");
  });

  it("writes what the document shows", () => {
    const d = readyDraft({ customerRef: "RFQ-DS-6806" });
    saveQuotationDraft(d, { issue: true });
    const saved = QUOTATIONS.find((q) => q.code === d.code)!;

    expect(saved.customer).toBe(d.customer);
    expect(saved.salesRep).toBe(d.salesRep);
    expect(saved.priceList).toBe(d.priceList);
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].code).toBe(PRODUCT);
    expect(saved.amount).toBeCloseTo(draftTotals(d).grandTotal, 2);
  });

  it("keeps the internal note out of the saved record", () => {
    const d = readyDraft({ internalNote: "ลูกค้าต่อราคาหนัก อย่าลดเกิน 10%" });
    saveQuotationDraft(d, { issue: true });
    const saved = QUOTATIONS.find((q) => q.code === d.code)!;
    expect(JSON.stringify(saved)).not.toContain("ต่อราคาหนัก");
  });

  it("saves a draft from the toolbar without validating", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    const before = QUOTATIONS.length;

    await user.click(within(screen.getByTestId("qt-toolbar")).getByText("Save Draft"));

    expect(QUOTATIONS.length).toBe(before + 1);
    /* Nothing was flagged as blocking: a draft may be as incomplete as it likes. */
    expect(
      within(screen.getByTestId("issue-summary")).queryByText(/ต้องแก้ไข/),
    ).not.toBeInTheDocument();
  });

  it("autosaves the work in progress to local recovery, not to the record", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    const before = QUOTATIONS.length;

    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("Saving...");

    await waitFor(
      () => expect(screen.getByTestId("autosave-status")).toHaveTextContent(/Last saved/),
      { timeout: 4000 },
    );

    /* Autosave parks the work where it can be recovered — it must never issue
       the quotation, and must never leave a second record behind. */
    expect(QUOTATIONS.length).toBe(before);
    expect(window.localStorage.getItem("afactory:draft:quotation:new")).toBeTruthy();
  }, 8000);
});

/* ============================================================
   Editor mode vs print mode
   ============================================================ */

describe("Quotation editor — editor and print modes", () => {
  it("strips every control in preview mode", async () => {
    const user = userEvent.setup();
    const { container } = render(<QuotationEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);

    expect(container.querySelectorAll("input,select,textarea").length).toBeGreaterThan(0);
    await user.click(within(screen.getByTestId("qt-toolbar")).getByText("Preview"));

    const doc = screen.getByTestId("quotation-document");
    expect(doc).toHaveAttribute("data-mode", "read");
    expect(doc.querySelectorAll("input,select,textarea")).toHaveLength(0);
    expect(within(doc).queryByText("Add Item")).not.toBeInTheDocument();
    /* Still the same document, still the same values. */
    expect(within(doc).getAllByText(getCustomer(CUSTOMER)!.code).length).toBeGreaterThan(0);
  });

  it("returns to editing from preview", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.click(within(screen.getByTestId("qt-toolbar")).getByText("Preview"));
    await user.click(screen.getByText("กลับไปแก้ไข"));
    expect(screen.getByTestId("quotation-document")).toHaveAttribute("data-mode", "edit");
  });

  it("builds a print job from the unsaved document", () => {
    const d = readyDraft({ customerRef: "RFQ-UNSAVED" });
    expect(QUOTATIONS.find((q) => q.code === d.code)).toBeUndefined();

    const config = getPrintConfig("quotation")!;
    const job = buildPrintJob("quotation", d.code, {
      document: draftPrintDoc(d, config),
      watermark: "DRAFT",
    })!;

    expect(job).not.toBeNull();
    expect(job.doc.code).toBe(d.code);
    expect(job.doc.lines).toHaveLength(1);
    expect(job.doc.totals!.grandTotal).toBeCloseTo(draftTotals(d).grandTotal, 2);
    expect(job.watermark).toBe("DRAFT");
    expect(job.pages.length).toBeGreaterThan(0);
  });

  it("stamps DRAFT across every sheet of an unissued quotation", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));

    await user.click(screen.getByLabelText("More Actions"));
    await user.click(screen.getByText("Print Preview"));

    const overlay = screen.getByTestId("print-preview-overlay");
    expect(within(overlay).getByTestId("print-document")).toBeInTheDocument();
    expect(overlay.querySelectorAll(".a4-watermark").length).toBeGreaterThan(0);
    expect(within(overlay).getAllByText("DRAFT").length).toBeGreaterThan(0);
  });

  it("keeps the internal note off the printed sheet", () => {
    const d = readyDraft({ internalNote: "อย่าลดเกิน 10%" });
    const doc = draftPrintDoc(d, getPrintConfig("quotation")!);
    expect(JSON.stringify(doc)).not.toContain("อย่าลดเกิน");
  });
});

/* ============================================================
   Editing an existing draft
   ============================================================ */

describe("Quotation editor — editing a saved quotation", () => {
  const EXISTING = "QT2506-0001";

  it("opens the stored quotation into the document", () => {
    const q = QUOTATIONS.find((x) => x.code === EXISTING)!;
    const d = draftFromQuotation(q);

    expect(d.mode).toBe("edit");
    expect(d.code).toBe(EXISTING);
    expect(d.items).toHaveLength(q.items.length);
    expect(d.customerCode).toBe(q.customerCode);
    /* Addresses are not on the record — they come from the partner. */
    expect(d.billAddress).toBeTruthy();
  });

  it("renders that document in the editor", () => {
    const q = QUOTATIONS.find((x) => x.code === EXISTING)!;
    render(<QuotationEditor record={q} />);

    expect(screen.getAllByText(EXISTING).length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Item Code 1") as HTMLInputElement).value).toBe(q.items[0].code);
    expect((screen.getByLabelText("Customer") as HTMLSelectElement).value).toContain(
      q.customerCode,
    );
  });

  it("saves an edit back onto the same record", () => {
    const q = QUOTATIONS.find((x) => x.code === EXISTING)!;
    const before = QUOTATIONS.length;
    saveQuotationDraft({ ...draftFromQuotation(q), customerRef: "RFQ-EDITED" }, { issue: true });

    expect(QUOTATIONS.length).toBe(before);
    expect(QUOTATIONS.find((x) => x.code === EXISTING)!.customerRef).toBe("RFQ-EDITED");
  });
});

/* ============================================================
   Permissions
   ============================================================ */

describe("Quotation editor — permissions", () => {
  it("lets a Sales Representative create a quotation", () => {
    asRole("SALES_REP");
    render(<QuotationEditor />);
    expect(screen.getByTestId("quotation-document")).toBeInTheDocument();
  });

  it("does not render the editor for a role that may not create one", () => {
    asRole("WAREHOUSE_STAFF");
    render(<QuotationEditor />);
    expect(screen.queryByTestId("quotation-document")).not.toBeInTheDocument();
    expect(screen.getByText("ไม่มีสิทธิ์สร้างใบเสนอราคา")).toBeInTheDocument();
  });

  it("keeps a suspended user out entirely", () => {
    const suspended = USERS.find((u) => u.status === "Suspended")!;
    setCurrentUser(suspended.code);
    render(<QuotationEditor />);
    expect(screen.queryByTestId("quotation-document")).not.toBeInTheDocument();
  });
});

/* ============================================================
   Responsive
   ============================================================ */

describe("Quotation editor — responsive", () => {
  beforeEach(() => render(<QuotationEditor />));

  it("stacks the customer panels below the desktop breakpoint", () => {
    const doc = screen.getByTestId("quotation-document");
    const grid = doc.querySelector(".grid.grid-cols-\\[1fr_1fr_minmax\\(300px\\,340px\\)\\]");
    expect(grid?.className).toContain("max-[1100px]:grid-cols-1");
  });

  it("scrolls the item grid sideways rather than squeezing it", () => {
    const table = screen.getByTestId("quotation-document").querySelector("table")!;
    expect(table.className).toContain("min-w-[900px]");
    expect(table.parentElement?.className).toContain("overflow-x-auto");
  });

  it("keeps the save actions reachable on a small screen", () => {
    /* Sticky top and fixed bottom, so neither scrolls away on a phone. */
    expect(screen.getByTestId("qt-toolbar").className).toContain("sticky");
    expect(screen.getByTestId("qt-sticky-summary").className).toContain("bottom-0");
  });
});

/* ============================================================
   Nothing else changed
   ============================================================ */

describe("Quotation editor — existing behaviour", () => {
  it("leaves the quotation list and detail schemas alone", () => {
    const s = getSchemas("quotation")!;
    expect(s.list.key).toBe("quotation");
    expect(s.detail).toBeDefined();
  });

  it("keeps the price list, partner and product masters as the only sources", () => {
    const d = applyCustomer(blankDraft(), CUSTOMER);
    expect(QT_PRICE_LISTS).toContain(d.priceList);
    expect(BUSINESS_PARTNERS.some((b) => b.code === d.customerCode)).toBe(true);
    expect(PRODUCTS.some((p) => p.code === applyProduct(blankLine(), PRODUCT).code)).toBe(true);
  });
});
