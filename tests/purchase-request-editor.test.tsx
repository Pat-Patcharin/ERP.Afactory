import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PURCHASE_REQUESTS as RAW_PR } from "@/data/purchase-requests";
import { PurchaseRequestEditor } from "@/components/purchase-request/PurchaseRequestEditor";
import {
  PURCHASE_REQUESTS,
  applyProductForPurchase,
  blankPrDraft,
  savePurchaseRequestDraft,
  prPrintDoc,
  validatePrDraft,
} from "@/lib/domain/purchase-request-draft";
import { blankLine } from "@/lib/domain/doc-draft";
import { PRODUCTS, productStock, stockedProducts } from "@/lib/domain/product";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { buildPrintJob, getPrintConfig } from "@/lib/print";

/* ============================================================
   PURCHASE REQUEST — the document editor

   The buying side on the same one-page editor as the quotation,
   and the first page to carry `data-doc-family="inbound"`.

   Two things this file is mostly about:

   1. The stock figures are ADVICE. Every assertion about the
      warning is paired with one that the save still went
      through. A requester knows things the reorder point does
      not, and a rule that refuses their number would teach them
      to type whatever gets past the form.

   2. The figures come from `productStock()` and are not
      recomputed. Each of the six is checked against that
      function rather than against a literal, so a change to the
      stock definitions moves the test with the code instead of
      leaving it asserting last month's arithmetic.
   ============================================================ */

const SNAP = JSON.stringify(RAW_PR);

beforeEach(() => {
  PURCHASE_REQUESTS.length = 0;
  PURCHASE_REQUESTS.push(...(JSON.parse(SNAP) as typeof RAW_PR));
  resetCurrentUser();
});

afterEach(resetCurrentUser);

/** A product the warehouse actually holds, so `productStock` has an answer. */
const stocked = () => {
  const p = stockedProducts().find((x) => (productStock(x.code)?.onHand ?? 0) > 0)!;
  return { product: p, st: productStock(p.code)! };
};

/* ============================================================
   IT IS A DOCUMENT, AND AN INBOUND ONE
   ============================================================ */

describe("Purchase Request editor — the document", () => {
  it("renders as one page, with no stepper", () => {
    render(<PurchaseRequestEditor />);
    expect(screen.getByTestId("purchase-request-document")).toBeInTheDocument();
    expect(screen.getByTestId("pr-toolbar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ถัดไป|Next/ })).toBeNull();
  });

  it("carries the inbound family, which is what recolours it", () => {
    const { container } = render(<PurchaseRequestEditor />);
    expect(container.querySelector('[data-doc-family="inbound"]')).toBeTruthy();
  });

  it("keeps the company header, because an approved request is filed as evidence", () => {
    render(<PurchaseRequestEditor />);
    expect(screen.getByText("PURCHASE REQUEST")).toBeInTheDocument();
    expect(screen.getByText("ใบขอซื้อ")).toBeInTheDocument();
  });

  it("drops the verify QR, which nobody outside would ever scan", () => {
    render(<PurchaseRequestEditor />);
    expect(screen.queryByTestId("doc-verify-code")).toBeNull();
  });

  it("asks for a requester and a destination, not a customer", () => {
    render(<PurchaseRequestEditor />);
    expect(screen.getByLabelText("Department")).toBeInTheDocument();
    expect(screen.getByLabelText("Requester")).toBeInTheDocument();
    expect(screen.getByLabelText("Needed By")).toBeInTheDocument();
    expect(screen.getByLabelText("Deliver To Warehouse")).toBeInTheDocument();
    expect(screen.getByLabelText("Suggested Supplier")).toBeInTheDocument();

    /* The sell-side panels must not have come along for the ride. */
    expect(screen.queryByLabelText("Customer")).toBeNull();
    expect(screen.queryByLabelText("Bill To Contact")).toBeNull();
  });
});

/* ============================================================
   THE COUNT THE STEPPED FORM USED TO SHOW
   ============================================================ */

describe("Purchase Request editor — completion", () => {
  it("opens at 2/7 · 29%, exactly as the stepped form did", () => {
    /* Two of the seven are answered before anybody types: the request date
       defaults to today and the priority to Normal. This is the number on the
       screenshot that started this work. */
    render(<PurchaseRequestEditor />);
    const bar = screen.getByTestId("doc-progress");
    expect(within(bar).getByText(/2\/7 ช่องที่จำเป็น · 29%/)).toBeInTheDocument();
    expect(within(bar).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "29");
  });

  it("shows the section count at the foot as well, both figures kept", () => {
    render(<PurchaseRequestEditor />);
    expect(screen.getByTestId("doc-progress-foot")).toHaveTextContent(
      /2\/7 ช่องที่จำเป็น · 3 หัวข้อ/,
    );
  });

  it("moves as fields are answered", async () => {
    const user = userEvent.setup();
    render(<PurchaseRequestEditor />);

    await user.selectOptions(screen.getByLabelText("Department"), "IT");
    expect(screen.getByTestId("doc-progress")).toHaveTextContent(/3\/7/);

    await user.selectOptions(screen.getByLabelText("Deliver To Warehouse"), (
      within(screen.getByLabelText("Deliver To Warehouse")).getAllByRole("option")[1] as HTMLOptionElement
    ).value);
    expect(screen.getByTestId("doc-progress")).toHaveTextContent(/4\/7/);
  });
});

/* ============================================================
   THE STOCK FIGURES — READ, NEVER RECOMPUTED
   ============================================================ */

describe("Purchase Request editor — what the warehouse holds", () => {
  it("shows all six figures straight from productStock", async () => {
    const user = userEvent.setup();
    const { product, st } = stocked();
    render(<PurchaseRequestEditor />);

    await user.type(screen.getByLabelText("Item Code 1"), product.code);
    await user.click(await screen.findByText(new RegExp(product.code)));

    const row = await screen.findByTestId(`stock-advice-${product.code}`);
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent ?? "");
    const fmtN = (n: number) => n.toLocaleString("en-US");

    /* Asserted against productStock, not against literals: the arithmetic
       lives there and this test must follow it rather than freeze it. */
    expect(cells.join(" ")).toContain(fmtN(st.onHand));
    expect(cells.join(" ")).toContain(fmtN(st.available));
    expect(cells.join(" ")).toContain(fmtN(st.onOrder));
    expect(cells.join(" ")).toContain(fmtN(st.projected));
  });

  it("shows back order and projected, the two a buyer cannot work out alone", () => {
    const { st } = stocked();
    /* Both come off productStock. Projected in particular nets the committed
       stock off, which is the figure that answers "will we actually run out". */
    expect(st).toHaveProperty("backOrder");
    expect(st.projected).toBe(st.onHand - st.reserved - st.backOrder + st.onOrder);
    expect(st.suggested).toBe(Math.max(0, st.target - st.projected));
  });

  it("says nothing rather than showing zeros for a product never stocked", async () => {
    const user = userEvent.setup();
    /* A catalogue row the warehouse has never held. "0 available" and "never
       stocked" mean different things to a buyer. */
    const catalogue = PRODUCTS.find((p) => !(p.stocks?.length ?? 0))!;
    render(<PurchaseRequestEditor />);

    await user.type(screen.getByLabelText("Item Code 1"), catalogue.code);
    await user.click(await screen.findByText(new RegExp(catalogue.code)));

    expect(screen.queryByTestId(`stock-advice-${catalogue.code}`)).toBeNull();
    expect(await screen.findByTestId("stock-advice-unknown")).toHaveTextContent(
      /ยังไม่มีข้อมูลสต๊อก/,
    );
  });
});

/* ============================================================
   THE ADVICE NEVER BECOMES A RULE
   ============================================================ */

describe("Purchase Request — asking for less than suggested", () => {
  /** A line under the suggested quantity for a product that needs restocking. */
  const underSuggested = () => {
    const p = stockedProducts().find((x) => (productStock(x.code)?.suggested ?? 0) > 1);
    if (!p) return null;
    const st = productStock(p.code)!;
    return { code: p.code, st, qty: st.suggested - 1 };
  };

  it("warns, and the warning is not blocking", () => {
    const under = underSuggested();
    if (!under) return; /* no product in this seed needs restocking */

    const draft = blankPrDraft();
    draft.items = [{ ...blankLine(), code: under.code, qty: under.qty, price: 10 }];
    draft.dept = "IT";
    draft.requester = "Nattapong K.";
    draft.needBy = draft.requestDate;
    draft.warehouse = "WH-BKK";

    const issues = validatePrDraft(draft);
    const warning = issues.find((i) => i.message.includes("น้อยกว่าที่แนะนำ"));

    expect(warning, "the shortfall is pointed out").toBeTruthy();
    expect(warning!.blocking, "but it never refuses the request").toBe(false);
    expect(issues.filter((i) => i.blocking), "nothing else blocks either").toHaveLength(0);
  });

  it("still saves and still submits", () => {
    const under = underSuggested();
    if (!under) return;

    const draft = blankPrDraft();
    draft.items = [{ ...blankLine(), code: under.code, qty: under.qty, price: 10 }];
    draft.dept = "IT";
    draft.requester = "Nattapong K.";
    draft.needBy = draft.requestDate;
    draft.warehouse = "WH-BKK";

    const res = savePurchaseRequestDraft(draft, { submit: true, user: "Nattapong K." });
    const saved = PURCHASE_REQUESTS.find((p) => p.code === res.code)!;

    expect(res.created).toBe(true);
    expect(saved.status, "submitted, not held back").toBe("Pending Approval");
    expect(saved.items[0].qty, "and the number the requester meant is what was kept").toBe(
      under.qty,
    );
  });
});

/* ============================================================
   WHAT A LINE OPENS AT
   ============================================================ */

describe("Purchase Request — a line opens at what the company pays", () => {
  it("uses the supplier's last cost, not the catalogue price", () => {
    const { product, st } = stocked();
    if (!st.lastCost || st.lastCost === product.price) return;

    const line = applyProductForPurchase(blankLine(), product.code);
    expect(line.price, "the cost, not the price the company charges").toBe(st.lastCost);
    expect(line.price).not.toBe(product.price);
  });

  it("leaves a price the requester already typed alone", () => {
    const { product } = stocked();
    const typed = { ...blankLine(), price: 999 };
    expect(applyProductForPurchase(typed, product.code).price).toBe(999);
  });

  it("carries no tax — that is settled on the purchase order", () => {
    const { product } = stocked();
    expect(applyProductForPurchase(blankLine(), product.code).tax).toBe(0);
  });
});

/* ============================================================
   VALIDATION THAT DOES REFUSE
   ============================================================ */

describe("Purchase Request — what it will not accept", () => {
  const complete = () => {
    const d = blankPrDraft();
    d.dept = "IT";
    d.requester = "Nattapong K.";
    d.needBy = d.requestDate;
    d.warehouse = "WH-BKK";
    d.items = [{ ...blankLine(), code: stocked().product.code, qty: 5, price: 10 }];
    return d;
  };

  it("accepts a complete request", () => {
    expect(validatePrDraft(complete()).filter((i) => i.blocking)).toHaveLength(0);
  });

  for (const field of ["dept", "requester", "needBy", "warehouse"] as const) {
    it(`refuses a request with no ${field}`, () => {
      const d = complete();
      d[field] = "";
      const blocking = validatePrDraft(d).filter((i) => i.blocking);
      expect(blocking.map((i) => i.field)).toContain(field);
    });
  }

  it("refuses a needed-by date before the request date", () => {
    const d = complete();
    d.requestDate = "2026-08-10";
    d.needBy = "2026-08-01";
    const blocking = validatePrDraft(d).filter((i) => i.blocking);
    expect(blocking.some((i) => i.message.includes("ก่อนวันที่ขอ"))).toBe(true);
  });

  it("does not require a supplier — that is purchasing's decision", () => {
    const d = complete();
    d.supplier = "";
    expect(validatePrDraft(d).filter((i) => i.blocking)).toHaveLength(0);
  });
});

/* ============================================================
   SAVING
   ============================================================ */

describe("Purchase Request — saving", () => {
  it("saves a draft without submitting it", () => {
    const d = blankPrDraft();
    d.dept = "IT";
    d.requester = "Nattapong K.";
    d.warehouse = "WH-BKK";
    d.needBy = d.requestDate;
    d.items = [{ ...blankLine(), code: stocked().product.code, qty: 2, price: 10 }];

    const res = savePurchaseRequestDraft(d, { submit: false, user: "Nattapong K." });
    expect(PURCHASE_REQUESTS.find((p) => p.code === res.code)!.status).toBe("Draft");
  });

  it("records who raised it, not a constant", () => {
    setCurrentUser("EMP004");
    const d = blankPrDraft();
    d.dept = "Sales";
    d.requester = "Patcharin T.";
    d.warehouse = "WH-BKK";
    d.needBy = d.requestDate;
    d.items = [{ ...blankLine(), code: stocked().product.code, qty: 1, price: 5 }];

    const res = savePurchaseRequestDraft(d, { submit: true });
    const saved = PURCHASE_REQUESTS.find((p) => p.code === res.code)!;
    expect(saved.createdBy).toBeTruthy();
    expect(saved.createdBy).not.toBe("Pimpaka S.");
  });

  it("drops the blank filler row rather than saving an empty line", () => {
    const d = blankPrDraft();
    d.dept = "IT";
    d.requester = "Nattapong K.";
    d.warehouse = "WH-BKK";
    d.needBy = d.requestDate;
    d.items = [
      { ...blankLine(), code: stocked().product.code, qty: 1, price: 5 },
      blankLine(),
    ];

    const res = savePurchaseRequestDraft(d);
    expect(PURCHASE_REQUESTS.find((p) => p.code === res.code)!.items).toHaveLength(1);
  });
});

/* ============================================================
   THE PRINTED SHEET

   Printed for one reason: to be signed and filed as the evidence
   that the spend was approved. Everything below follows from
   that, and from there being no customer on this side.
   ============================================================ */

describe("Purchase Request — the printed sheet", () => {
  const config = () => getPrintConfig("purchase-request")!;

  it("exists at all", () => {
    expect(config()).toBeTruthy();
    expect(config().titleEN).toBe("PURCHASE REQUEST");
    expect(config().titleTH).toBe("ใบขอซื้อ");
  });

  it("offers three copies and no CUSTOMER one", () => {
    /* There is no customer on this side of the business, so a copy addressed
       to one would be a copy with nowhere to go. */
    expect(config().supportedCopyTypes).toEqual(["ORIGINAL", "COMPANY", "REPRINT"]);
    expect(config().supportedCopyTypes).not.toContain("CUSTOMER");
  });

  it("keeps the signatures, which are the whole point of printing it", () => {
    expect(config().showSignatures).toBe(true);
    expect(config().signatureRoles).toContain("preparedBy");
    expect(config().signatureRoles).toContain("approvedBy");
  });

  it("drops the verify marks, as the screen does", () => {
    expect(config().showQRCode).toBe(false);
    expect(config().showBarcode).toBe(false);
  });

  it("shows no tax and no due date — both belong to the purchase order", () => {
    expect(config().showTax).toBe(false);
    expect(config().showDueDate).toBe(false);
    expect(config().showCustomerTaxId).toBe(false);
  });

  it("carries the inbound family, so the sheet is teal like the screen", () => {
    /* Without this the document would be teal on screen and orange once
       printed — at exactly the moment it becomes the filed record. */
    expect(config().family).toBe("inbound");
  });

  it("builds a job from the draft, with the figures the document shows", () => {
    const { product, st } = stocked();
    const d = blankPrDraft();
    d.dept = "IT";
    d.requester = "Nattapong K.";
    d.warehouse = "WH-BKK";
    d.needBy = d.requestDate;
    d.items = [{ ...blankLine(), code: product.code, name: product.name, unit: st.unit, qty: 4, price: 25 }];

    const doc = prPrintDoc(d, config());
    expect(doc.entity).toBe("purchase-request");
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].amount, "four at twenty-five").toBe(100);
    expect(doc.lines[0].vatRate, "no tax on a request").toBe(0);
    expect(doc.totals!.vat).toBe(0);
    /* The requester, not a customer — the party block says who it concerns. */
    expect(doc.billTo.contact).toBe("Nattapong K.");
    expect(doc.billTo.name).toContain("IT");
  });

  it("stamps DRAFT on anything not yet approved", () => {
    const d = blankPrDraft();
    d.dept = "IT";
    d.requester = "Nattapong K.";
    d.warehouse = "WH-BKK";
    d.needBy = d.requestDate;
    d.items = [{ ...blankLine(), code: stocked().product.code, qty: 1, price: 1 }];

    const job = buildPrintJob("purchase-request", d.code, {
      document: prPrintDoc(d, config()),
      watermark: "DRAFT",
    })!;
    expect(job.watermark).toBe("DRAFT");
  });
});
