import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EntityCreatePage from "@/app/(erp)/m/[entity]/new/page";
import EntityEditPage from "@/app/(erp)/m/[entity]/[code]/edit/page";
import { SalesRequestEditor } from "@/components/sales-request/SalesRequestEditor";
import { COMPANY, USERS } from "@/data/admin";
import { SALES_REQUESTS as RAW_SR, SR_PRICE_LISTS } from "@/data/sales-requests";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { PRODUCTS } from "@/lib/domain/product";
import { QUOTATIONS, SALES_REQUESTS, getCustomer, getQT } from "@/lib/domain/outbound";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import {
  applyCustomer,
  applyProduct,
  applyQuotation,
  blankLine,
  blankSrDraft,
  blockingIssues,
  draftFromSalesRequest,
  lineAvailability,
  quotationChoices,
  saveSalesRequestDraft,
  standardLinePrice,
  srInsight,
  srPrintDoc,
  srTotals,
  validateSrDraft,
  warningIssues,
  type SalesRequestDraft,
} from "@/lib/domain/sales-request-draft";
import { docTotals } from "@/lib/domain/doc-draft";
import { ItemTable } from "@/components/document/parts";
import { buildPrintJob, getPrintConfig } from "@/lib/print";
import { getSchemas } from "@/schemas/registry";
import { routeParams } from "./setup";

/* ============================================================
   SALES REQUEST DOCUMENT EDITOR regression suite.

   The request runs on the same editor as the quotation, so the
   tests worth writing are the ones about what makes it a REQUEST:
   the required date, the warehouse, the approval close, and the
   quotation it was raised from.
   ============================================================ */

const CUSTOMER = "BP000123 - บริษัท เดนทัล สมายล์ จำกัด";
const PRODUCT = "AA-TH003-WL";
const EXISTING = "SR2506-0001";

const SR_SNAPSHOT = RAW_SR.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) }));
const QT_SNAPSHOT = RAW_QT.map((q) => ({ ...q, items: q.items.map((i) => ({ ...i })) }));

/** Both stores are mutable mock state; the editor writes into them. */
beforeEach(() => {
  SALES_REQUESTS.length = 0;
  SALES_REQUESTS.push(
    ...(SR_SNAPSHOT.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i })) })) as never[]),
  );
  QUOTATIONS.length = 0;
  QUOTATIONS.push(
    ...(QT_SNAPSHOT.map((q) => ({ ...q, items: q.items.map((i) => ({ ...i })) })) as never[]),
  );
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

/** A request that could be submitted as it stands. */
function readyDraft(over: Partial<SalesRequestDraft> = {}): SalesRequestDraft {
  const base = applyCustomer(blankSrDraft(), CUSTOMER);
  return {
    ...base,
    salesRep: base.salesRep || "SALE001 - Patcharin Thiengkaew",
    warehouse: "WH-BKK Bangkok Main Warehouse",
    items: [{ ...applyProduct(blankLine(), PRODUCT), qty: 10, price: 100, disc: 0, tax: 7 }],
    ...over,
  };
}

/* ============================================================
   The wizard is gone
   ============================================================ */

describe("Sales Request editor — the wizard is gone", () => {
  it("no longer registers a step form for sales requests", () => {
    const schemas = getSchemas("sales-request")!;
    expect(schemas.form).toBeUndefined();
    expect(schemas.editor).toBeDefined();
  });

  it("renders the document editor on the create route", () => {
    routeParams.entity = "sales-request";
    render(<EntityCreatePage />);

    expect(screen.getByTestId("request-document")).toBeInTheDocument();
    for (const gone of ["Review", "ตรวจทาน", "Step 1", "1 / 3"]) {
      expect(screen.queryByText(gone), gone).not.toBeInTheDocument();
    }
  });

  it("renders the same editor on the edit route", () => {
    routeParams.entity = "sales-request";
    routeParams.code = EXISTING;
    render(<EntityEditPage />);
    expect(screen.getByTestId("request-document")).toBeInTheDocument();
  });

  it("shares its machinery with the quotation editor rather than copying it", () => {
    /* Both documents run the same line maths — that is what stops them
       drifting apart as the ERP grows. */
    const d = readyDraft();
    expect(srTotals(d)).toEqual(docTotals(d.items, d));
  });
});

/* ============================================================
   The document
   ============================================================ */

describe("Sales Request editor — document layout", () => {
  beforeEach(() => render(<SalesRequestEditor />));

  it("prints the A-Factory letterhead and the request title", () => {
    const doc = within(screen.getByTestId("request-document"));
    expect(doc.getByText(COMPANY.nameEn)).toBeInTheDocument();
    expect(doc.getByText("SALES REQUEST")).toBeInTheDocument();
    expect(doc.getByText("ใบขอขาย")).toBeInTheDocument();
    expect(doc.getByText("DRAFT")).toBeInTheDocument();
    expect(doc.getByText(/^SR\d{4}-\d{4}$/)).toBeInTheDocument();
  });

  it("asks for what a request needs, not what an offer needs", () => {
    /* A request has no price-validity window; it has a date the customer
       needs the goods and a warehouse expected to serve it. */
    expect(screen.getByLabelText("Request Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Required Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred Warehouse")).toBeInTheDocument();
    expect(screen.getByLabelText("Source Quotation")).toBeInTheDocument();
    expect(screen.queryByLabelText("Valid Until")).not.toBeInTheDocument();
  });

  it("closes with the approver, never the customer", () => {
    const doc = within(screen.getByTestId("request-document"));
    expect(doc.getByText(/Approved By/)).toBeInTheDocument();
    expect(doc.getByText(/Reviewed By/)).toBeInTheDocument();
    expect(doc.queryByText(/Customer Acceptance/)).not.toBeInTheDocument();
  });

  it("submits for approval rather than issuing a price", () => {
    const bar = within(screen.getByTestId("sr-toolbar"));
    expect(bar.getByText("Submit Request")).toBeInTheDocument();
    expect(bar.getByText("Save Draft")).toBeInTheDocument();
    expect(bar.queryByText("Save Quotation")).not.toBeInTheDocument();
  });

  it("keeps the save actions sticky at the top and the bottom", () => {
    expect(screen.getByTestId("sr-toolbar")).toHaveClass("sticky");
    expect(screen.getByTestId("sr-sticky-summary")).toHaveClass("fixed");
  });
});

/* ============================================================
   Customer and source quotation
   ============================================================ */

describe("Sales Request editor — customer and source", () => {
  it("loads the partner when a customer is chosen", () => {
    const bp = getCustomer(CUSTOMER)!;
    const d = applyCustomer(blankSrDraft(), CUSTOMER);
    expect(d.customerCode).toBe(bp.code);
    expect(d.taxId).toBe(bp.tax.taxId);
    expect(d.billAddress).toBeTruthy();
    expect(d.payTerm).toBe(bp.sales!.payTerm);
  });

  it("offers only quotations that are still open", () => {
    const open = quotationChoices();
    expect(open.length).toBeGreaterThan(0);
    for (const code of open) {
      const qt = getQT(code)!;
      expect(qt.srRef, code).toBe("");
      expect(["Draft", "Sent", "Accepted"]).toContain(qt.status);
    }
    /* A quotation already turned into a request is not offered again. */
    const converted = QUOTATIONS.find((q) => q.srRef)!;
    expect(open).not.toContain(converted.code);
  });

  it("narrows the quotation list to the chosen customer", () => {
    const d = applyCustomer(blankSrDraft(), CUSTOMER);
    for (const code of quotationChoices(d.customerCode)) {
      expect(getQT(code)!.customerCode).toBe(d.customerCode);
    }
  });

  it("carries the agreed lines and terms across from the quotation", () => {
    const qt = getQT(quotationChoices().find((c) => getQT(c)!.items.length > 0)!)!;
    const d = applyQuotation(blankSrDraft(), qt.code);

    expect(d.quotationRef).toBe(qt.code);
    expect(d.customerCode).toBe(qt.customerCode);
    expect(d.currency).toBe(qt.currency);
    expect(d.payTerm).toBe(qt.payTerm);
    expect(d.customerRef).toBe(qt.customerRef);
    expect(d.items).toHaveLength(qt.items.length);
    expect(d.items[0].code).toBe(qt.items[0].code);
    expect(d.items[0].price).toBe(qt.items[0].price);
    /* And the customer's addresses came with it. */
    expect(d.billAddress).toBeTruthy();
  });

  it("pulls the quotation in from the document, without retyping", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    /* Whatever the picker actually offers — status, not just srRef, decides. */
    const qt = getQT(quotationChoices()[0])!;

    await user.selectOptions(screen.getByLabelText("Source Quotation"), qt.code);

    expect((screen.getByLabelText("Item Code 1") as HTMLInputElement).value).toBe(
      qt.items[0].code,
    );
    expect((screen.getByLabelText("Customer") as HTMLSelectElement).value).toContain(
      qt.customerCode,
    );
  });

  it("blocks a quotation belonging to somebody else", () => {
    const qt = QUOTATIONS.find((q) => q.customerCode !== "BP000123")!;
    const d = readyDraft({ quotationRef: qt.code });
    expect(
      blockingIssues(validateSrDraft(d)).some((i) => i.field === "quotationRef"),
    ).toBe(true);
  });
});

/* ============================================================
   Items and calculation
   ============================================================ */

describe("Sales Request editor — items and calculation", () => {
  it("adds a product from the grid without leaving the page", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);

    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));

    expect((screen.getByLabelText("Item Code 1") as HTMLInputElement).value).toBe(PRODUCT);
    expect(screen.getByTestId("request-document")).toBeInTheDocument();
  });

  it("uses the shared line maths", () => {
    const t = srTotals(readyDraft());
    expect(t.subtotal).toBe(1000);
    expect(t.vat).toBeCloseTo(70, 2);
    expect(t.grandTotal).toBeCloseTo(1070, 2);
  });

  it("recalculates as the user types", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);

    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));
    await user.clear(screen.getByLabelText("Quantity 1"));
    await user.type(screen.getByLabelText("Quantity 1"), "10");
    await user.clear(screen.getByLabelText("Unit Price 1"));
    await user.type(screen.getByLabelText("Unit Price 1"), "100");

    expect(within(screen.getByTestId("sr-sticky-summary")).getByText("1,070.00")).toBeInTheDocument();
  });

  it("opens the next row on Enter", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.click(screen.getByLabelText("Quantity 1"));
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Item Code 2")).toBeInTheDocument();
  });
});

/* ============================================================
   Validation
   ============================================================ */

describe("Sales Request editor — validation", () => {
  it("passes a complete request", () => {
    expect(blockingIssues(validateSrDraft(readyDraft()))).toEqual([]);
  });

  it("blocks what an approver cannot act without", () => {
    const fields = blockingIssues(validateSrDraft(blankSrDraft())).map((i) => i.field);
    for (const f of ["customer", "salesRep", "warehouse", "items"]) {
      expect(fields, f).toContain(f);
    }
  });

  it("blocks a required date that falls before the request date", () => {
    const d = readyDraft({ requestDate: "2026-08-10", requiredDate: "2026-08-04" });
    expect(
      blockingIssues(validateSrDraft(d)).some((i) => i.field === "requiredDate"),
    ).toBe(true);
  });

  it("accepts a same-day request — unlike a quotation's validity date", () => {
    /* "Needed today" is a real answer; "the price stands until today" is not. */
    const d = readyDraft({ requestDate: "2026-08-04", requiredDate: "2026-08-04" });
    expect(blockingIssues(validateSrDraft(d))).toEqual([]);
  });

  it("warns without blocking on short stock and a deep discount", () => {
    const d = readyDraft({
      customerRef: "",
      items: [{ ...blankLine(), code: PRODUCT, qty: 999_999, price: 100, disc: 60, tax: 7 }],
    });
    const issues = validateSrDraft(d);
    expect(blockingIssues(issues)).toEqual([]);
    const text = warningIssues(issues).map((i) => i.message).join(" ");
    expect(text).toMatch(/สูงกว่าเกณฑ์ปกติ/);
    expect(text).toMatch(/ไม่จองสต๊อก/);
  });

  it("never blocks over the credit limit", () => {
    const bp = getCustomer(CUSTOMER)!;
    const d = readyDraft({
      items: [{ ...blankLine(), code: PRODUCT, qty: 1, price: bp.credit.limit + 1, disc: 0, tax: 0 }],
    });
    const credit = validateSrDraft(d).filter((i) => i.field === "credit");
    expect(credit).toHaveLength(1);
    expect(credit[0].blocking).toBe(false);
    expect(srInsight(d).withinLimit).toBe(false);
  });

  it("shows the error summary on submit and refuses to save", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    const before = SALES_REQUESTS.length;

    await user.click(within(screen.getByTestId("sr-toolbar")).getByText("Submit Request"));

    const summary = screen.getByTestId("issue-summary");
    expect(within(summary).getByText(/ต้องแก้ไข/)).toBeInTheDocument();
    expect(within(summary).getByText("ยังไม่ได้เลือกคลังที่จะจ่ายของ")).toBeInTheDocument();
    expect(SALES_REQUESTS.length).toBe(before);
  });

  it("jumps to the offending field when an error is clicked", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.click(within(screen.getByTestId("sr-toolbar")).getByText("Submit Request"));
    await user.click(
      within(screen.getByTestId("issue-summary")).getByText("ยังไม่ได้เลือกคลังที่จะจ่ายของ"),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Preferred Warehouse"));
  });
});

/* ============================================================
   Saving
   ============================================================ */

describe("Sales Request editor — saving", () => {
  it("always creates the record as Draft — approval stays a deliberate step", () => {
    const res = saveSalesRequestDraft(readyDraft(), { submit: true });
    expect(res.created).toBe(true);
    expect(SALES_REQUESTS.find((r) => r.code === res.code)!.status).toBe("Draft");
  });

  it("updates in place rather than piling up duplicates", () => {
    const d = readyDraft();
    saveSalesRequestDraft(d, { submit: false });
    const after = SALES_REQUESTS.length;
    saveSalesRequestDraft(d, { submit: false });
    saveSalesRequestDraft({ ...d, customerRef: "PO-2" }, { submit: true });

    expect(SALES_REQUESTS.length).toBe(after);
    expect(SALES_REQUESTS.filter((r) => r.code === d.code)).toHaveLength(1);
    expect(SALES_REQUESTS.find((r) => r.code === d.code)!.customerRef).toBe("PO-2");
  });

  it("closes the quotation it was raised from", () => {
    const qt = getQT(quotationChoices().find((c) => getQT(c)!.items.length > 0)!)!;
    const d = { ...applyQuotation(blankSrDraft(), qt.code), warehouse: "WH-BKK Bangkok Main Warehouse" };

    const res = saveSalesRequestDraft(d, { submit: true });

    expect(getQT(qt.code)!.srRef).toBe(res.code);
    expect(getQT(qt.code)!.status).toBe("Converted");
    /* And it is no longer offered as a source. */
    expect(quotationChoices()).not.toContain(qt.code);
  });

  it("writes what the document shows", () => {
    const d = readyDraft({ customerRef: "PO-2569-001", priority: "High" });
    saveSalesRequestDraft(d, { submit: true });
    const saved = SALES_REQUESTS.find((r) => r.code === d.code)!;

    expect(saved.customer).toBe(d.customer);
    expect(saved.warehouse).toBe(d.warehouse);
    expect(saved.priority).toBe("High");
    expect(saved.items).toHaveLength(1);
    expect(saved.amount).toBeCloseTo(srTotals(d).grandTotal, 2);
  });

  /* Rule changed at A2b — see the same test on the quotation for why. The
     promise is "never printed", not "never stored", and it is now held by
     tests/internal-note.test.ts. */
  it("keeps the internal note on the record, for the salesperson's own side", () => {
    const d = readyDraft({ internalNote: "ลูกค้ารายนี้จ่ายช้าประจำ" });
    saveSalesRequestDraft(d, { submit: true });
    const saved = SALES_REQUESTS.find((r) => r.code === d.code)!;
    expect(saved.internalNote).toBe("ลูกค้ารายนี้จ่ายช้าประจำ");
    expect(saved.note).not.toContain("จ่ายช้าประจำ");
  });

  it("saves a draft from the toolbar without validating", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    const before = SALES_REQUESTS.length;

    await user.click(within(screen.getByTestId("sr-toolbar")).getByText("Save Draft"));

    expect(SALES_REQUESTS.length).toBe(before + 1);
  });

  it("autosaves to local recovery, never to the record", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    const before = SALES_REQUESTS.length;

    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("Saving...");

    await waitFor(
      () => expect(screen.getByTestId("autosave-status")).toHaveTextContent(/Last saved/),
      { timeout: 4000 },
    );

    expect(SALES_REQUESTS.length).toBe(before);
    expect(window.localStorage.getItem("afactory:draft:sales-request:new")).toBeTruthy();
  }, 8000);
});

/* ============================================================
   Editor mode vs print mode
   ============================================================ */

describe("Sales Request editor — editor and print modes", () => {
  it("strips every control in preview mode", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);

    await user.click(within(screen.getByTestId("sr-toolbar")).getByText("Preview"));

    const doc = screen.getByTestId("request-document");
    expect(doc).toHaveAttribute("data-mode", "read");
    expect(doc.querySelectorAll("input,select,textarea")).toHaveLength(0);
  });

  it("builds a print job from the unsaved request", () => {
    const d = readyDraft({ customerRef: "PO-UNSAVED" });
    expect(SALES_REQUESTS.find((r) => r.code === d.code)).toBeUndefined();

    const config = getPrintConfig("sales-request")!;
    const job = buildPrintJob("sales-request", d.code, {
      document: srPrintDoc(d, config),
      watermark: "DRAFT",
    })!;

    expect(job.doc.code).toBe(d.code);
    expect(job.doc.lines).toHaveLength(1);
    expect(job.doc.totals!.grandTotal).toBeCloseTo(srTotals(d).grandTotal, 2);
    expect(job.watermark).toBe("DRAFT");
  });

  it("stamps DRAFT across the printed sheet", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));

    await user.click(screen.getByLabelText("More Actions"));
    await user.click(screen.getByText("Print Preview"));

    const overlay = screen.getByTestId("print-preview-overlay");
    expect(overlay.querySelectorAll(".a4-watermark").length).toBeGreaterThan(0);
    expect(within(overlay).getAllByText("DRAFT").length).toBeGreaterThan(0);
  });

  it("keeps the internal note off the printed sheet", () => {
    const doc = srPrintDoc(
      readyDraft({ internalNote: "อย่ารับออร์เดอร์นี้ถ้ายังค้างชำระ" }),
      getPrintConfig("sales-request")!,
    );
    expect(JSON.stringify(doc)).not.toContain("อย่ารับออร์เดอร์");
  });
});

/* ============================================================
   The grid the request shares with the quotation, plus stock
   ============================================================ */

describe("Sales Request editor — the same grid as the quotation", () => {
  it("drops Lot No., Serial No. and UOM, for the same reason", () => {
    /* A request reserves nothing — its own remark says so — so there is no
       picked stock to record against, and the unit comes with the product. */
    render(<SalesRequestEditor />);
    const doc = within(screen.getByTestId("request-document"));

    for (const gone of ["Lot No.", "Serial No.", "UOM"]) {
      expect(doc.queryByText(gone), gone).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Lot 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Serial 1")).not.toBeInTheDocument();
  });

  it("opens a line at this customer's own price", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));

    const expected = standardLinePrice(CUSTOMER, PRODUCT);
    expect(expected, "this customer has a standard price for this product").not.toBeNull();
    expect((screen.getByLabelText("Unit Price 1") as HTMLInputElement).value).toBe(
      String(expected!.price),
    );
  });

  it("carries the salesperson's own wording, like the quotation", async () => {
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));

    expect(screen.getByLabelText("Custom Name 1")).toBeInTheDocument();
  });
});

describe("Sales Request editor — what the warehouse has", () => {
  const stockOf = (code: string) => lineAvailability(code);

  it("shows the figure as soon as a product is picked, not only when short", async () => {
    /* This is the difference from the quotation. A request is where someone
       first asks whether we can serve the order at all, so the answer belongs
       beside the quantity before a quantity has even been typed. */
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));

    const st = stockOf(PRODUCT);
    expect(st.found, "the fixture product is stocked").toBe(true);
    expect(await screen.findByText(`คงเหลือ ${st.available.toLocaleString()}`)).toBeInTheDocument();
  });

  it("is absent before a product is chosen", () => {
    render(<SalesRequestEditor />);
    expect(screen.queryByText(/^คงเหลือ /)).not.toBeInTheDocument();
  });

  it("disappears once the request becomes a document", async () => {
    /* A figure that was true this afternoon has no business on the sheet the
       approver keeps. Read mode is the document, so it carries no stock. */
    const user = userEvent.setup();
    render(<SalesRequestEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    await user.click(screen.getByLabelText("Item Code 1"));
    await user.click(await screen.findByText(PRODUCT));
    expect(screen.getByText(/^คงเหลือ /)).toBeInTheDocument();

    await user.click(within(screen.getByTestId("sr-toolbar")).getByText("Preview"));

    expect(screen.getByTestId("request-document")).toHaveAttribute("data-mode", "read");
    expect(screen.queryByText(/^คงเหลือ /)).not.toBeInTheDocument();
  });

  it("never reaches the printed sheet", () => {
    const st = stockOf(PRODUCT);
    const doc = srPrintDoc(readyDraft(), getPrintConfig("sales-request")!);
    expect(JSON.stringify(doc)).not.toContain("คงเหลือ");
    expect(JSON.stringify(doc)).not.toContain(`"available":${st.available}`);
  });

  it("leaves the quotation's grid as it was — showing only what is short", () => {
    /* The flag is off by default, so turning it on for the request changed
       nothing for any other document. Proved against the shared component,
       not against the quotation editor, so it stays true if the quotation
       later changes its mind. */
    const plenty = { ...applyProduct(blankLine(), PRODUCT), qty: 1 };
    const short = {
      ...applyProduct(blankLine(), PRODUCT),
      qty: stockOf(PRODUCT).available + 50,
    };

    render(
      <ItemTable
        items={[plenty, short]}
        mode="edit"
        invalid={new Set()}
        onCell={() => {}}
        onPick={() => {}}
        onRemove={() => {}}
        onAdd={() => {}}
        selected={new Set()}
        onSelect={() => {}}
        layout={{ lot: false, serial: false, uom: false, naming: true, standardPrice: true }}
      />,
    );

    /* One line is short, one is not — and only the short one says so. */
    expect(screen.getAllByText(/^คงเหลือ /)).toHaveLength(1);
  });
});

describe("Sales Request editor — detail rows survive being saved", () => {
  it("writes them into the record and reads them back as rows", () => {
    /* The record has one note field and the editor works in rows. Without the
       round trip the buttons would be there and the typing would vanish on
       save, which is worse than not offering them at all. */
    const draft = readyDraft();
    draft.items[0].details = ["สีขาว", "รับประกัน 2 ปี"];

    const { code } = saveSalesRequestDraft(draft);
    const stored = SALES_REQUESTS.find((r) => r.code === code)!;
    expect(stored.items[0].note).toBe("สีขาว\nรับประกัน 2 ปี");

    const reopened = draftFromSalesRequest(stored);
    expect(reopened.items[0].details).toEqual(["สีขาว", "รับประกัน 2 ปี"]);
    expect(reopened.items[0].note, "the two must not both hold it").toBe("");
  });

  it("brings them across from the quotation it was raised from", () => {
    const qt = QUOTATIONS.find((q) => q.items.length)!;
    qt.items[0].note = "สีขาว\nรับประกัน 2 ปี";
    qt.status = "Accepted";
    qt.srRef = "";
    qt.soRef = "";

    const draft = applyQuotation(blankSrDraft(), qt.code);
    expect(draft.items[0].details).toEqual(["สีขาว", "รับประกัน 2 ปี"]);
  });

  it("prints them under the item, and prints the salesperson's name for it", () => {
    /* `showOnBill` decides what a CUSTOMER sees; a request goes to an
       approver, so it shows the wording being approved either way. */
    const draft = readyDraft();
    draft.items[0].customName = "ชุดวัสดุอุดฟันสำหรับคลินิกสาขาใหม่";
    draft.items[0].showOnBill = false;
    draft.items[0].details = ["สีขาว"];

    const doc = srPrintDoc(draft, getPrintConfig("sales-request")!);
    expect(doc.lines[0].description).toBe("ชุดวัสดุอุดฟันสำหรับคลินิกสาขาใหม่");
    expect(doc.lines[0].extraLines).toContain("สีขาว");
  });
});

/* ============================================================
   Editing an existing request
   ============================================================ */

describe("Sales Request editor — editing a saved request", () => {
  it("opens the stored request into the document", () => {
    const r = SALES_REQUESTS.find((x) => x.code === EXISTING)!;
    const d = draftFromSalesRequest(r);

    expect(d.mode).toBe("edit");
    expect(d.code).toBe(EXISTING);
    expect(d.warehouse).toBe(r.warehouse);
    expect(d.priority).toBe(r.priority);
    expect(d.items).toHaveLength(r.items.length);
    expect(d.billAddress).toBeTruthy();
  });

  it("renders it in the editor", () => {
    const r = SALES_REQUESTS.find((x) => x.code === EXISTING)!;
    render(<SalesRequestEditor record={r} />);

    expect(screen.getAllByText(EXISTING).length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Item Code 1") as HTMLInputElement).value).toBe(r.items[0].code);
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe(r.priority);
  });

  it("saves an edit back onto the same record", () => {
    const r = SALES_REQUESTS.find((x) => x.code === EXISTING)!;
    const before = SALES_REQUESTS.length;
    saveSalesRequestDraft({ ...draftFromSalesRequest(r), customerRef: "PO-EDITED" }, { submit: true });

    expect(SALES_REQUESTS.length).toBe(before);
    expect(SALES_REQUESTS.find((x) => x.code === EXISTING)!.customerRef).toBe("PO-EDITED");
  });
});

/* ============================================================
   Permissions and responsive
   ============================================================ */

describe("Sales Request editor — permissions", () => {
  it("lets a Sales Representative raise a request", () => {
    asRole("SALES_REP");
    render(<SalesRequestEditor />);
    expect(screen.getByTestId("request-document")).toBeInTheDocument();
  });

  it("does not render the editor for a role that may not create one", () => {
    asRole("WAREHOUSE_STAFF");
    render(<SalesRequestEditor />);
    expect(screen.queryByTestId("request-document")).not.toBeInTheDocument();
    expect(screen.getByText("ไม่มีสิทธิ์สร้างคำขอขาย")).toBeInTheDocument();
  });

  it("shows no cost or margin on the document", () => {
    asRole("SALES_REP");
    render(<SalesRequestEditor />);
    const text = screen.getByTestId("request-document").textContent ?? "";
    for (const word of ["Cost", "Margin", "Profit", "ต้นทุน", "กำไร"]) {
      expect(text, word).not.toContain(word);
    }
  });
});

describe("Sales Request editor — responsive", () => {
  beforeEach(() => render(<SalesRequestEditor />));

  it("scrolls the item grid sideways rather than squeezing it", () => {
    const table = screen.getByTestId("request-document").querySelector("table")!;
    expect(table.className).toContain("min-w-[900px]");
    expect(table.parentElement?.className).toContain("overflow-x-auto");
  });

  it("keeps the save actions reachable on a small screen", () => {
    expect(screen.getByTestId("sr-toolbar").className).toContain("sticky");
    expect(screen.getByTestId("sr-sticky-summary").className).toContain("bottom-0");
  });
});

/* ============================================================
   Nothing else changed
   ============================================================ */

describe("Sales Request editor — existing behaviour", () => {
  it("leaves the list and detail schemas alone", () => {
    const s = getSchemas("sales-request")!;
    expect(s.list.key).toBe("sales-request");
    expect(s.detail).toBeDefined();
  });

  it("keeps using the existing masters", () => {
    const d = applyCustomer(blankSrDraft(), CUSTOMER);
    expect(SR_PRICE_LISTS).toContain(d.priceList);
    expect(PRODUCTS.some((p) => p.code === PRODUCT)).toBe(true);
  });
});
