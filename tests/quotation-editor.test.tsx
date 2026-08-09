import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
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
import { qtRequestEdit } from "@/lib/workflows-outbound";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { isoToDmy } from "@/lib/format";
import {
  applyCustomer,
  applyProduct,
  applyProductForCustomer,
  applyShipTo,
  applyValidity,
  validDaysFrom,
  validUntilFrom,
  blankDraft,
  detailLines,
  joinDetails,
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
  standardLinePrice,
  validateDraft,
  warningIssues,
  type QuotationDraft,
} from "@/lib/domain/quotation-draft";
import { ItemTable } from "@/components/document/parts";
import { priceMasterRows } from "@/lib/domain/price-master";
import { resolveCustomerPrice } from "@/lib/domain/price-tier";
import { money } from "@/lib/format";
import { docGrandTotal } from "@/lib/domain/lines";
import { buildPrintJob, getPrintConfig, mapQuotationRevision } from "@/lib/print";
import { PrintDocument } from "@/components/print/PrintDocument";
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
   The item grid a quotation actually needs

   A quotation reserves nothing and picks nothing off a shelf, so
   the columns that describe picked stock are not on it. What it
   does carry is the salesperson's own wording for the customer,
   as many detail lines as the offer needs, and the price this
   customer is supposed to be paying.
   ============================================================ */

/** Choose the fixture product on line 1 through the type-ahead. */
const pickProduct = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText("Item Code 1"));
  await user.click(await screen.findByText(PRODUCT));
};

describe("Quotation editor — columns a quotation has no answer for", () => {
  it("drops Lot No., Serial No. and UOM from the grid", () => {
    render(<QuotationEditor />);
    const doc = within(screen.getByTestId("quotation-document"));

    for (const gone of ["Lot No.", "Serial No.", "UOM"]) {
      expect(doc.queryByText(gone), gone).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Lot 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Serial 1")).not.toBeInTheDocument();
  });

  it("keeps the unit on the line even though the column is gone", () => {
    /* Nothing was removed from the data — the printed sheet still needs a
       UOM, and it comes from the product master, not from a typed cell. */
    const p = PRODUCTS.find((x) => x.code === PRODUCT)!;
    const doc = draftPrintDoc(readyDraft(), getPrintConfig("quotation")!);
    expect(doc.lines[0].uom).toBe(p.unit);
  });

  it("leaves the shared grid alone for documents that do pick stock", () => {
    /* The columns went from the quotation's layout, not from the component
       every sell-side document shares. */
    render(
      <ItemTable
        items={[blankLine()]}
        mode="edit"
        invalid={new Set()}
        onCell={() => {}}
        onPick={() => {}}
        onRemove={() => {}}
        onAdd={() => {}}
        selected={new Set()}
        onSelect={() => {}}
      />,
    );
    for (const kept of ["Lot No.", "Serial No.", "UOM"]) {
      expect(screen.getByText(kept), kept).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Lot 1")).toBeInTheDocument();
  });
});

describe("Quotation editor — the salesperson's own name for a line", () => {
  const OWN = "ชุดวัสดุอุดฟันสำหรับคลินิกสาขาใหม่";

  it("asks for the product code before it offers a name", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);

    /* An empty row has nothing to rename. */
    expect(screen.queryByLabelText("Custom Name 1")).not.toBeInTheDocument();
    expect(screen.getByText("เลือกรหัสสินค้าก่อน")).toBeInTheDocument();

    await pickProduct(user);
    expect(screen.getByLabelText("Custom Name 1")).toBeInTheDocument();
  });

  it("types a name that need not match the catalogue", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await pickProduct(user);

    await user.type(screen.getByLabelText("Custom Name 1"), OWN);

    /* The line now reads under the salesperson's wording, with the
       catalogue name kept in view underneath it. */
    expect(screen.getByTestId("printed-name-1")).toHaveTextContent(OWN);
    expect(
      screen.getByText(`ชื่อในระบบ: ${PRODUCTS.find((p) => p.code === PRODUCT)!.name}`),
    ).toBeInTheDocument();
  });

  it("ticks which of the two names goes on the quotation", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await pickProduct(user);
    await user.type(screen.getByLabelText("Custom Name 1"), OWN);

    const tick = screen.getByLabelText(
      "แสดงชื่อที่ใช้เองในใบเสนอราคา บรรทัดที่ 1",
    ) as HTMLInputElement;
    expect(tick.checked).toBe(true);

    await user.click(tick);
    expect(screen.getByTestId("printed-name-1")).toHaveTextContent(
      PRODUCTS.find((p) => p.code === PRODUCT)!.name,
    );
  });

  it("prints whichever name the tick chose, and the code either way", () => {
    const catalogue = PRODUCTS.find((p) => p.code === PRODUCT)!.name;
    const config = getPrintConfig("quotation")!;
    const line = { ...applyProduct(blankLine(), PRODUCT), qty: 1, price: 100, customName: OWN };

    const shown = draftPrintDoc(readyDraft({ items: [{ ...line, showOnBill: true }] }), config);
    expect(shown.lines[0].description).toBe(OWN);

    const hidden = draftPrintDoc(readyDraft({ items: [{ ...line, showOnBill: false }] }), config);
    expect(hidden.lines[0].description).toBe(catalogue);

    /* The code is on the sheet whichever name won, so a renamed line is
       still traceable back to the item that shipped. */
    expect(shown.lines[0].code).toBe(PRODUCT);
    expect(hidden.lines[0].code).toBe(PRODUCT);
  });

  it("keeps the name and the tick on the saved record", () => {
    const d = readyDraft({
      items: [{ ...applyProduct(blankLine(), PRODUCT), qty: 1, price: 100, customName: OWN, showOnBill: false }],
    });
    saveQuotationDraft(d, { issue: true });

    const saved = QUOTATIONS.find((q) => q.code === d.code)!;
    expect(saved.items[0].customName).toBe(OWN);
    expect(saved.items[0].showOnBill).toBe(false);
    /* And they survive the round trip back into the editor. */
    const reopened = draftFromQuotation(saved as never);
    expect(reopened.items[0].customName).toBe(OWN);
    expect(reopened.items[0].showOnBill).toBe(false);
  });
});

describe("Quotation editor — more than one detail per line", () => {
  it("adds and removes detail rows under a line", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await pickProduct(user);

    /* A line starts with none — a detail is something you choose to add. */
    expect(screen.queryByLabelText("Detail 1.1")).not.toBeInTheDocument();

    await user.click(screen.getByText("เพิ่มรายละเอียด"));
    await user.type(screen.getByLabelText("Detail 1.1"), "สีขาว");
    await user.click(screen.getByText("เพิ่มรายละเอียด"));
    await user.type(screen.getByLabelText("Detail 1.2"), "ส่งภายใน 7 วัน");

    expect((screen.getByLabelText("Detail 1.1") as HTMLInputElement).value).toBe("สีขาว");
    expect((screen.getByLabelText("Detail 1.2") as HTMLInputElement).value).toBe("ส่งภายใน 7 วัน");

    await user.click(screen.getByLabelText("ลบรายละเอียดที่ 1 ของบรรทัดที่ 1"));
    expect((screen.getByLabelText("Detail 1.1") as HTMLInputElement).value).toBe("ส่งภายใน 7 วัน");
    expect(screen.queryByLabelText("Detail 1.2")).not.toBeInTheDocument();
  });

  it("survives a blank row being typed into", async () => {
    /* The record keeps details in one newline-separated field; a row that is
       still empty must not vanish out from under the cursor. */
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await pickProduct(user);

    await user.click(screen.getByText("เพิ่มรายละเอียด"));
    expect(screen.getByLabelText("Detail 1.1")).toBeInTheDocument();
    await user.click(screen.getByText("เพิ่มรายละเอียด"));
    expect(screen.getByLabelText("Detail 1.2")).toBeInTheDocument();
  });

  it("prints every detail as its own line under the item", () => {
    const d = readyDraft({
      items: [
        {
          ...applyProduct(blankLine(), PRODUCT),
          qty: 1,
          price: 100,
          details: ["สีขาว", "   ", "ส่งภายใน 7 วัน"],
        },
      ],
    });
    const doc = draftPrintDoc(d, getPrintConfig("quotation")!);
    /* Three rows on screen, two of them written — a blank one prints nothing. */
    expect(doc.lines[0].extraLines).toEqual(["สีขาว", "ส่งภายใน 7 วัน"]);
  });

  it("stores them in the one note field and reads them back as rows", () => {
    const d = readyDraft({
      items: [
        { ...applyProduct(blankLine(), PRODUCT), qty: 1, price: 100, details: ["สีขาว", "ส่งภายใน 7 วัน"] },
      ],
    });
    saveQuotationDraft(d, { issue: true });

    const saved = QUOTATIONS.find((q) => q.code === d.code)!;
    expect(saved.items[0].note).toBe("สีขาว\nส่งภายใน 7 วัน");
    expect(draftFromQuotation(saved as never).items[0].details).toEqual([
      "สีขาว",
      "ส่งภายใน 7 วัน",
    ]);
  });

  it("holds a detail off the sheet along with the name it belongs to", () => {
    const d = readyDraft({
      items: [
        {
          ...applyProduct(blankLine(), PRODUCT),
          qty: 1,
          price: 100,
          details: ["ราคาพิเศษเฉพาะรอบนี้"],
          showOnBill: false,
        },
      ],
    });
    const doc = draftPrintDoc(d, getPrintConfig("quotation")!);
    expect(doc.lines[0].extraLines).toEqual([]);
    expect(JSON.stringify(doc)).not.toContain("ราคาพิเศษเฉพาะรอบนี้");
  });

  it("round-trips the list through the single stored field", () => {
    expect(joinDetails(["สีขาว", "  ", "ส่งภายใน 7 วัน"])).toBe("สีขาว\nส่งภายใน 7 วัน");
    expect(detailLines("สีขาว\nส่งภายใน 7 วัน")).toEqual(["สีขาว", "ส่งภายใน 7 วัน"]);
    /* A pasted separator is flattened, never allowed to split one detail. */
    expect(joinDetails(["สีขาว | เขียว"])).toBe("สีขาว   เขียว");
  });
});

describe("Quotation editor — the standard price", () => {
  it("shows it the moment a product is chosen", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    await pickProduct(user);

    const std = standardLinePrice(CUSTOMER, PRODUCT)!;
    expect(screen.getByTestId("standard-price-1")).toHaveTextContent(
      `ราคามาตรฐาน ${money(std.price)}`,
    );
    /* And the line opened at it, so there is nothing to reconcile. */
    expect((screen.getByLabelText("Unit Price 1") as HTMLInputElement).value).toBe(
      String(std.price),
    );
  });

  it("flags a price that has moved off it, and puts it back on request", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);
    await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
    await pickProduct(user);

    const std = standardLinePrice(CUSTOMER, PRODUCT)!;
    const price = screen.getByLabelText("Unit Price 1") as HTMLInputElement;
    await user.clear(price);
    await user.type(price, "1");

    const restore = screen.getByLabelText("ใช้ราคามาตรฐาน บรรทัดที่ 1");
    expect(screen.getByTestId("standard-price-1").className).toContain("warning");

    await user.click(restore);
    expect(price.value).toBe(String(std.price));
    expect(
      screen.queryByLabelText("ใช้ราคามาตรฐาน บรรทัดที่ 1"),
    ).not.toBeInTheDocument();
  });

  it("takes it from the price master at this customer's tier", () => {
    /* The tier resolution is the price master's, not a second opinion. */
    const bp = getCustomer(CUSTOMER)!;
    const row = priceMasterRows().find((r) => r.status === "OK" && r.product_code)!;
    const std = standardLinePrice(CUSTOMER, row.product_code)!;

    expect(std.fromPriceMaster).toBe(true);
    expect(std.price).toBe(resolveCustomerPrice(bp, row.product_code).price);
  });

  it("falls back to the catalogue price rather than showing nothing", () => {
    /* The prototype's own product codes are in a different space from the
       807 priced rows, so most lines have no price-master row at all. */
    const p = PRODUCTS.find((x) => x.code === PRODUCT)!;
    const std = standardLinePrice(CUSTOMER, PRODUCT)!;

    expect(std.fromPriceMaster).toBe(false);
    expect(std.price).toBe(p.price);
    expect(standardLinePrice(CUSTOMER, "NO-SUCH-CODE")).toBeNull();
    expect(standardLinePrice(CUSTOMER, "")).toBeNull();
  });

  it("never overwrites a price the salesperson already typed", () => {
    const negotiated = { ...blankLine(), price: 55 };
    expect(applyProductForCustomer(negotiated, PRODUCT, CUSTOMER).price).toBe(55);
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

  /**
   * This asserted 1,320 — freight and other charges added after the tax and
   * never taxed themselves. The rule was CHANGED at A1b, deliberately, not
   * bent to make anything pass.
   *
   * The invoice engine has always taxed the charges, and the invoice is the
   * document the Revenue Department reads: freight billed by a VAT registrant
   * is part of the value of the supply. So a quotation saying 1,320 was
   * quoting a figure the invoice for the same goods would never charge. One
   * of the two had to move, and it was not going to be the tax invoice.
   *
   *   goods 1,000 + VAT 70 + charges 250 + VAT on charges 17.50 = 1,337.50
   */
  it("taxes freight and other charges at the document's own rate", () => {
    const t = draftTotals(readyDraft({ freight: 200, otherCharges: 50 }));
    expect(t.grandTotal).toBeCloseTo(1337.5, 2);
    /* And the 17.50 shows up as tax, not as a bigger charge. */
    expect(t.vat).toBeCloseTo(87.5, 2);
    expect(t.freight + t.otherCharges).toBe(250);
  });

  /* A Non VAT quotation charges no tax on its freight either — the rate comes
     off the lines, so nobody has to remember to zero it. */
  it("leaves the charges untaxed on a Non VAT document", () => {
    const t = draftTotals(
      readyDraft({
        items: [{ ...blankLine(), code: PRODUCT, qty: 10, price: 100, disc: 0, tax: 0 }],
        freight: 200,
        otherCharges: 50,
      }),
    );
    expect(t.vat).toBe(0);
    expect(t.grandTotal).toBeCloseTo(1250, 2);
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
  /* A Draft. It used to be QT2506-0001, which is Converted — editable when
     this test was written, sealed now that approval locks a quotation. The
     block below proves the sealed statuses refuse the same write. */
  const EXISTING = "QT2507-0006";

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
   Locked after approval

   The guard sits in saveQuotationDraft rather than on the button,
   so these call the store directly — the way a stale tab, an
   autosave or a later API would reach it.
   ============================================================ */

describe("Quotation editor — a sealed quotation refuses edits", () => {
  /* Every status except Draft and Pending Approval. */
  const LOCKED = [
    "Approved",
    "Sent",
    "Accepted",
    "Converted",
    "Rejected",
    "Expired",
    "Cancelled",
  ];

  /** The Draft fixture, moved into whichever status is under test. */
  const asStatus = (status: string) => {
    const q = QUOTATIONS.find((x) => x.code === "QT2507-0006")!;
    q.status = status;
    return q;
  };

  for (const status of LOCKED) {
    it(`refuses to save over a ${status} quotation`, () => {
      const q = asStatus(status);
      const was = q.customerRef;

      const res = saveQuotationDraft(
        { ...draftFromQuotation(q), customerRef: "RFQ-SHOULD-NOT-STICK" },
        { issue: true },
      );

      expect(res.blocked, "the store must say why").toBeTruthy();
      expect(res.blocked).toContain(status);
      expect(res.created).toBe(false);
      expect(QUOTATIONS.find((x) => x.code === "QT2507-0006")!.customerRef).toBe(was);
    });

    it(`refuses to park a draft over a ${status} quotation`, () => {
      /* issue: false is the autosave path — it must be blocked too, or the
         document rewrites itself while the page merely sits open. */
      const q = asStatus(status);
      const was = q.note;

      const res = saveQuotationDraft(
        { ...draftFromQuotation(q), remarks: "autosaved over a sealed quote" },
        { issue: false },
      );

      expect(res.blocked).toBeTruthy();
      expect(QUOTATIONS.find((x) => x.code === "QT2507-0006")!.note).toBe(was);
    });
  }

  it("still allows a Draft through", () => {
    const q = asStatus("Draft");
    const res = saveQuotationDraft(
      { ...draftFromQuotation(q), customerRef: "RFQ-OK" },
      { issue: true },
    );

    expect(res.blocked).toBeUndefined();
    expect(QUOTATIONS.find((x) => x.code === "QT2507-0006")!.customerRef).toBe("RFQ-OK");
  });

  it("hides the Edit action once a quotation is sealed", () => {
    const list = getSchemas("quotation")!.list;
    const labels = (status: string) =>
      list
        .rowActions!({ ...asStatus(status) } as never, {} as never)
        .map((a) => a.label)
        .filter(Boolean);

    expect(labels("Draft")).toContain("Edit");
    for (const status of LOCKED) {
      expect(labels(status), `${status} must not offer Edit`).not.toContain("Edit");
    }
  });
});

/* ============================================================
   Reopening a sealed quotation

   Sealing only works if there is a documented way back in;
   otherwise people raise a replacement quotation and the
   revision trail this field exists for never gets written.
   ============================================================ */

describe("Quotation — qtRequestEdit reopens a sealed quotation", () => {
  /** Captures the modal so the test can supply a reason and confirm. */
  function fakeCtx() {
    const calls = {
      toasts: [] as { title: string; tone?: string }[],
      modal: null as null | { body: () => ReactNode; onConfirm?: () => boolean | void },
    };
    return {
      calls,
      ctx: {
        goto: () => {},
        openEntity: () => {},
        toast: (title: string, _m?: string, tone?: string) => calls.toasts.push({ title, tone }),
        confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
        formModal: (o: { body: () => ReactNode; onConfirm?: () => boolean | void }) => {
          calls.modal = o;
        },
        refresh: () => {},
        quickView: () => {},
        panel: () => {},
      } as never,
    };
  }

  const at = (status: string) => {
    const q = QUOTATIONS.find((x) => x.code === "QT2507-0006")!;
    q.status = status;
    q.approvalStatus = "Approved";
    q.revision = 1;
    return q;
  };

  beforeEach(() => setCurrentUser(USERS.find((u) => u.roleCode === "SALES_REP")!.code));

  for (const status of ["Approved", "Sent", "Expired", "Rejected"]) {
    it(`reopens a ${status} quotation as a new revision`, async () => {
      const user = userEvent.setup();
      const q = at(status);
      const { calls, ctx } = fakeCtx();

      qtRequestEdit(q as never, ctx);
      expect(calls.modal, "should have asked for a reason").toBeTruthy();

      /* Confirming with nothing typed must be refused. */
      expect(calls.modal!.onConfirm!()).toBe(false);
      expect(q.status, "still sealed until a reason is given").toBe(status);

      /* Typing into the real field is what feeds the reason to onConfirm. */
      render(<>{calls.modal!.body()}</>);
      await user.type(screen.getByLabelText("เหตุผลที่ขอแก้ไข"), "ลูกค้าขอเปลี่ยนจำนวน");
      calls.modal!.onConfirm!();

      expect(q.status).toBe("Draft");
      expect(q.approvalStatus).toBe("Not Submitted");
      expect(q.revision).toBe(2);
      expect(q.rejectReason).toBe("");
      expect(q.history[0].t).toContain("revision 2");
      expect(q.history[0].d).toContain(status);
    });
  }

  it("refuses to reopen a Cancelled quotation", () => {
    const q = at("Cancelled");
    const { calls, ctx } = fakeCtx();

    qtRequestEdit(q as never, ctx);

    expect(calls.modal, "no modal — cancelling a quote is meant to be final").toBeNull();
    expect(calls.toasts[0]?.tone).toBe("warning");
    expect(q.status).toBe("Cancelled");
    expect(q.revision).toBe(1);
  });

  it("snapshots the closing issue before touching anything", async () => {
    const user = userEvent.setup();
    const q = at("Sent");
    q.items = [{ ...q.items[0], qty: 10, price: 100, disc: 0, tax: 7 }];
    q.approvedBy = "สมชาย ใจดี";
    q.approvedAt = "01/07/2569 09:00";
    q.sentAt = "01/07/2569 09:30";
    q.revisions = [];
    const { calls, ctx } = fakeCtx();

    qtRequestEdit(q as never, ctx);
    render(<>{calls.modal!.body()}</>);
    await user.type(screen.getByLabelText("เหตุผลที่ขอแก้ไข"), "ลูกค้าขอ 15 ชิ้น");
    calls.modal!.onConfirm!();

    expect(q.revisions).toHaveLength(1);
    const snap = q.revisions[0];
    expect(snap.revision, "the issue that just closed, not the new one").toBe(1);
    expect(snap.items[0].qty).toBe(10);
    expect(snap.approvedBy).toBe("สมชาย ใจดี");
    expect(snap.sentAt).toBe("01/07/2569 09:30");
    expect(snap.closedReason).toBe("ลูกค้าขอ 15 ชิ้น");
    expect(snap.closedAt).toBeTruthy();
    /* The live record moved on; the snapshot kept the old stamps. */
    expect(q.approvedBy).toBe("");
    expect(q.sentAt).toBe("");
  });

  it("leaves earlier snapshots untouched when a second revision closes", async () => {
    const user = userEvent.setup();
    const q = at("Sent");
    q.items = [{ ...q.items[0], qty: 10 }];
    q.revisions = [];

    const reopen = async (reason: string, qty: number) => {
      q.items = [{ ...q.items[0], qty }];
      const { calls, ctx } = fakeCtx();
      qtRequestEdit(q as never, ctx);
      /* Scope to this render: the previous modal is still in the document. */
      const { container } = render(<>{calls.modal!.body()}</>);
      await user.type(within(container).getByLabelText("เหตุผลที่ขอแก้ไข"), reason);
      calls.modal!.onConfirm!();
      q.status = "Sent";
    };

    await reopen("รอบแรก", 10);
    const firstSnapshot = JSON.stringify(q.revisions[0]);

    await reopen("รอบสอง", 20);

    expect(q.revisions).toHaveLength(2);
    expect(JSON.stringify(q.revisions[0]), "entry 1 must be byte-identical").toBe(firstSnapshot);
    expect(q.revisions[0].revision).toBe(1);
    expect(q.revisions[1].revision).toBe(2);
    expect(q.revisions[0].items[0].qty).toBe(10);
    expect(q.revisions[1].items[0].qty).toBe(20);
    expect(q.revision).toBe(3);
  });

  it("refuses to reopen a Converted quotation", () => {
    /* It already produced an order; that is the document to amend. */
    const q = at("Converted");
    const { calls, ctx } = fakeCtx();

    qtRequestEdit(q as never, ctx);

    expect(calls.modal).toBeNull();
    expect(q.status).toBe("Converted");
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

/* ============================================================
   Signature and stamp on the printed sheet

   The rule under test is a three-way AND: approver panel, an
   approved document, and a signature on file. Any one missing
   falls back to the blank box that was always there.
   ============================================================ */

describe("Quotation print — signature and stamp", () => {
  const CODE = "QT2507-0006";

  afterEach(() => {
    COMPANY.signatureUrl = "";
    COMPANY.stampUrl = "";
  });

  const approved = () => {
    const q = QUOTATIONS.find((x) => x.code === CODE)!;
    q.status = "Approved";
    q.approvalStatus = "Approved";
    q.approvedBy = "สมชาย ใจดี";
    q.approvedAt = "01/07/2569 09:00";
    return q;
  };

  const sheet = (code = CODE) => {
    const job = buildPrintJob("quotation", code)!;
    expect(job, "the quotation must be printable").toBeTruthy();
    return render(<PrintDocument job={job} />).container;
  };

  it("prints normally when no signature file is on record", () => {
    approved();
    const c = sheet();

    expect(c.querySelector('[data-testid="print-page-1"]')).toBeInTheDocument();
    expect(c.querySelectorAll("img")).toHaveLength(0);
    expect(c.textContent).toContain("วันที่ ____ / ____ / ______");
  });

  it("stamps the approver's signature and name once approved", () => {
    approved();
    COMPANY.signatureUrl = "/signature-md.png";
    COMPANY.stampUrl = "/stamp-afactory.png";
    const c = sheet();

    const srcs = [...c.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toContain("/signature-md.png");
    expect(srcs).toContain("/stamp-afactory.png");
    /* The image never stands alone. */
    expect(c.textContent).toContain("สมชาย ใจดี");
    expect(c.textContent).toContain("01/07/2569 09:00");
  });

  it("prints no signature on a quotation that has not been approved", () => {
    const q = QUOTATIONS.find((x) => x.code === CODE)!;
    q.status = "Draft";
    q.approvalStatus = "Not Submitted";
    q.approvedBy = "";
    q.approvedAt = "";
    COMPANY.signatureUrl = "/signature-md.png";
    const c = sheet();

    expect([...c.querySelectorAll("img")].map((i) => i.getAttribute("src"))).not.toContain(
      "/signature-md.png",
    );
    expect(c.textContent).toContain("วันที่ ____ / ____ / ______");
  });

  it("carries the document number, revision and approver onto the sheet", () => {
    const q = approved();
    q.revision = 3;
    const c = sheet();

    expect(c.textContent).toContain(CODE);
    expect(c.textContent).toContain("ฉบับที่ 3");
    expect(c.textContent).toContain("สมชาย ใจดี");
  });
});

/* ============================================================
   Reopening a stored revision
   ============================================================ */

describe("Quotation print — an earlier revision", () => {
  const CODE = "QT2507-0006";

  const withSnapshot = () => {
    const q = QUOTATIONS.find((x) => x.code === CODE)!;
    q.revision = 2;
    q.revisions = [
      {
        revision: 1,
        items: [
          { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 10, price: 100, disc: 0, tax: 7, note: "" },
        ],
        totals: { subtotal: 1000, discount: 0, vat: 70, grandTotal: 1070 },
        approvedBy: "สมชาย ใจดี",
        approvedAt: "01/07/2569 09:00",
        sentAt: "01/07/2569 09:30",
        closedAt: "02/07/2569 10:00",
        closedReason: "ลูกค้าขอเพิ่มจำนวน",
      },
    ];
    /* The live document now says something else entirely. */
    q.items = [
      { code: "AA-TH003-WL", name: "A-FLEX PU40 (White)", unit: "Tube", qty: 99, price: 100, disc: 0, tax: 7, note: "" },
    ];
    return q;
  };

  it("renders the stored figures, not the current ones", () => {
    withSnapshot();
    const config = getPrintConfig("quotation")!;
    const document = mapQuotationRevision(CODE, 1, config)!;
    const job = buildPrintJob("quotation", CODE, { document })!;
    const c = render(<PrintDocument job={job} />).container;

    expect(job.doc.totals!.grandTotal).toBe(1070);
    expect(job.doc.lines[0].qty, "the old quantity, not 99").toBe(10);
    expect(c.textContent).toContain("ฉบับที่ 1");
  });

  it("says on its face that it is not the current issue", () => {
    withSnapshot();
    const config = getPrintConfig("quotation")!;
    const document = mapQuotationRevision(CODE, 1, config)!;
    const job = buildPrintJob("quotation", CODE, { document })!;
    const c = render(<PrintDocument job={job} />).container;

    expect(c.querySelector('[data-testid="superseded-banner"]')).toBeInTheDocument();
    expect(c.textContent).toContain("ไม่ใช่ฉบับปัจจุบัน");
    expect(c.textContent).toContain("ลูกค้าขอเพิ่มจำนวน");
    expect(c.textContent).toContain("SUPERSEDED");
  });

  it("returns null for a revision that was never stored", () => {
    withSnapshot();
    const config = getPrintConfig("quotation")!;
    expect(mapQuotationRevision(CODE, 9, config)).toBeNull();
    expect(mapQuotationRevision("QT-NOPE", 1, config)).toBeNull();
  });
});

/* ============================================================
   HOW LONG THE PRICE STANDS

   The salesperson picks a span, not a date. `validUntil` is
   still what the record keeps and what every downstream reader
   uses — the Expired status, the expiring filter, the list
   column — so the change is in how it is decided, not in what
   exists.

   The derivation lives at the WRITE point rather than in the
   form, because a quotation reaches the store by routes that
   never open a form: a conversion, an import, a duplicate. A
   date computed only where somebody is typing is wrong
   everywhere else.
   ============================================================ */

describe("Quotation — validity as a span", () => {
  it("opens at thirty days", () => {
    const d = blankDraft();
    expect(d.validDays).toBe(30);
    expect(d.validUntil).toBe(validUntilFrom(d.quoteDate, 30));
  });

  it("moves the date when the span changes", () => {
    const d = blankDraft();
    const next = applyValidity(d, { validDays: 60 })!;
    expect(next.validDays).toBe(60);
    expect(next.validUntil).toBe(validUntilFrom(d.quoteDate, 60));
    /* Sixty days is thirty more than thirty — the arithmetic, not a literal. */
    const a = new Date(`${d.validUntil}T00:00:00`).getTime();
    const b = new Date(`${next.validUntil}T00:00:00`).getTime();
    expect((b - a) / 86_400_000).toBe(30);
  });

  it("moves the date when the quote date changes", () => {
    const d = { ...blankDraft(), quoteDate: "2026-03-01", validDays: 90 };
    const next = applyValidity(d, { quoteDate: "2026-04-01" })!;
    expect(next.validUntil).toBe("2026-06-30");
  });

  it("writes the derived date even when the draft carries a stale one", () => {
    /* The property the write point exists for. A draft that never passed
       through the form — a conversion, an import — may hold anything here;
       the store must not take its word for it. */
    const d = readyDraft({ quoteDate: "2026-05-01", validDays: 60 });
    const res = saveQuotationDraft({ ...d, validUntil: "1999-01-01" }, { issue: true });
    const saved = QUOTATIONS.find((q) => q.code === res.code)!;
    expect(saved.validUntil).toBe(isoToDmy(validUntilFrom("2026-05-01", 60)));
    expect(saved.validUntil).not.toContain("1999");
  });

  it("recovers the span when a saved quotation is reopened", () => {
    const d = readyDraft({ quoteDate: "2026-05-01", validDays: 90 });
    const res = saveQuotationDraft(d, { issue: true });
    const back = draftFromQuotation(QUOTATIONS.find((q) => q.code === res.code)!);
    expect(back.validDays).toBe(90);
  });

  it("snaps an odd span from an older record onto an offered option", () => {
    /* Records written before the chips existed carry arbitrary gaps. An
       empty selection would be worse than the nearest one. */
    expect(validDaysFrom("2026-05-01", "2026-06-15")).toBe(30);
    expect(validDaysFrom("2026-05-01", "2026-07-20")).toBe(90);
  });

  it("still refuses a validity that ends before it begins", () => {
    /* The rule the date field used to guard is unchanged. */
    const d = readyDraft({ quoteDate: "2026-08-04" });
    const broken = { ...d, validUntil: "2026-08-04" };
    expect(blockingIssues(validateDraft(broken)).some((i) => i.field === "validUntil")).toBe(
      true,
    );
  });
});

describe("Quotation — the header carries only the document", () => {
  it("offers the four spans as chips, with the one in force pressed", async () => {
    const user = userEvent.setup();
    render(<QuotationEditor />);

    const chips = screen.getByTestId("validity-chips");
    for (const d of [30, 60, 90, 120]) {
      expect(within(chips).getByRole("button", { name: `ยืนราคา ${d} วัน` })).toBeInTheDocument();
    }
    expect(within(chips).getByRole("button", { name: "ยืนราคา 30 วัน" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(chips).getByRole("button", { name: "ยืนราคา 90 วัน" }));
    expect(screen.getByRole("button", { name: "ยืนราคา 90 วัน" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("has no Valid Until date box on the paper any more", () => {
    render(<QuotationEditor />);
    expect(screen.queryByLabelText("Valid Until")).toBeNull();
  });

  it("drops the two fields that were never written to the record", () => {
    /* `warehouse` and `internalRef` sat in the draft and in the header, and
       `saveQuotationDraft` wrote neither. Every keystroke into them was
       thrown away on save. */
    render(<QuotationEditor />);
    expect(screen.queryByLabelText("Warehouse")).toBeNull();
    expect(screen.queryByLabelText("Internal Reference")).toBeNull();
    expect(Object.keys(blankDraft())).not.toContain("warehouse");
    expect(Object.keys(blankDraft())).not.toContain("internalRef");
  });

  it("keeps six rows on the paper", () => {
    render(<QuotationEditor />);
    for (const label of [
      "Quotation Date",
      "Sales Representative",
      "Price List",
      "Currency",
      "Payment Term",
      "Delivery Date",
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
  });
});

describe("Quotation — settings that are not the document", () => {
  it("puts bill type, channel and customer reference in one strip off the paper", () => {
    render(<QuotationEditor />);
    const strip = screen.getByTestId("doc-settings");

    expect(within(strip).getByLabelText("Bill Type")).toBeInTheDocument();
    expect(within(strip).getByLabelText("Sales Channel")).toBeInTheDocument();
    expect(within(strip).getByLabelText("Customer Reference")).toBeInTheDocument();

    /* Outside the sheet, which is the whole point. */
    const paper = screen.getByTestId("quotation-document");
    expect(paper.contains(strip)).toBe(false);
  });

  it("still carries the customer's reference to the record", () => {
    /* The number their accounts team matches our invoice against. Moving the
       input off the paper must not break the chain that ends at
       SalesOrder.customerPo. */
    const d = readyDraft({ customerRef: "PO-OFFPAPER-1" });
    const res = saveQuotationDraft(d, { issue: true });
    expect(QUOTATIONS.find((q) => q.code === res.code)!.customerRef).toBe("PO-OFFPAPER-1");
  });

  it("still prints the customer's reference on the sheet", () => {
    /* Off the screen's paper, still on the printed one — the customer needs
       to see their own number. */
    const d = readyDraft({ customerRef: "PO-PRINTED-9" });
    const config = getPrintConfig("quotation")!;
    const doc = draftPrintDoc(d, config);
    expect(doc.meta.some((m) => m.value === "PO-PRINTED-9")).toBe(true);
  });
});
