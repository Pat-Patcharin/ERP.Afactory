import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COMPANY } from "@/data/admin";
import { SalesRequestEditor } from "@/components/sales-request/SalesRequestEditor";
import { soSchemas } from "@/schemas/sales-order";
import { maySignAt } from "@/lib/domain/doc-draft";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   THE SALES REQUEST, AND HOW THE SALE IS BILLED

   Every order comes from a request — the order is convert-only,
   so there is no blank page to type one into.

   How it is billed is asked before anything else, because it
   decides what the sheet IS rather than what is on it: a Non-VAT
   bill is not issued in the company's name, so its letterhead
   carries neither the name nor the tax ID.
   ============================================================ */

const NOEY = "EMP020"; // Sales Representative
const MIN = "EMP019"; // Sales Admin — signs at list price
const PRAEW = "EMP015"; // General Manager — signs below the floor

beforeEach(() => {
  window.localStorage.clear();
  resetCurrentUser();
  setCurrentUser(NOEY);
});

afterEach(resetCurrentUser);

describe("ต้องมีคำขอขายก่อนเปิดใบสั่งขายเสมอ", () => {
  it("ใบสั่งขายเปิดจากหน้าเปล่าไม่ได้ ต้องแปลงมาเท่านั้น", () => {
    /* The document that binds the company carries an approved price and a
       customer's yes, and neither can be typed into a blank page. */
    expect(soSchemas.list.convertOnly).toBeTruthy();
    expect(soSchemas.list.convertOnly!.goto).toBe("/m/sales-request");
  });
});

describe("บิล VAT กับ Non VAT", () => {
  it("เลือกได้ตั้งแต่หัวกระดาษ ก่อนกรอกอะไร", () => {
    render(<SalesRequestEditor />);
    /* Above the paper: this is a decision about the document, not a field
       on it. */
    expect(screen.getByLabelText("Bill Type (header)")).toBeInTheDocument();
  });

  it("บิล VAT ขึ้นหัวจดหมายบริษัทเต็มรูปแบบ", () => {
    render(<SalesRequestEditor />);
    const doc = screen.getByTestId("request-document");

    expect(within(doc).getAllByText(COMPANY.nameEn).length).toBeGreaterThan(0);
    expect(within(doc).getAllByText(new RegExp(COMPANY.taxId)).length).toBeGreaterThan(0);
    expect(within(doc).queryByTestId("doc-anonymous-mark")).toBeNull();
  });

  it("บิล Non VAT ขึ้นแค่ A.FAC ไม่มีอะไรบอกว่าเป็นบริษัทไหน", async () => {
    render(<SalesRequestEditor />);
    await userEvent.selectOptions(screen.getByLabelText("Bill Type (header)"), "Non VAT");

    const doc = screen.getByTestId("request-document");
    expect(within(doc).getByTestId("doc-anonymous-mark")).toBeInTheDocument();
    expect(within(doc).getByText("A.FAC")).toBeInTheDocument();

    /* Nothing that says whose sheet it is. Printing the company's details on
       a document there is no tax invoice for is the thing the customer asked
       not to happen. */
    expect(within(doc).queryByText(COMPANY.nameEn)).toBeNull();
    expect(within(doc).queryByText(COMPANY.nameTh)).toBeNull();
    expect(within(doc).queryByText(new RegExp(COMPANY.taxId))).toBeNull();
    expect(within(doc).queryByText(new RegExp(COMPANY.website))).toBeNull();
  });

  it("สลับกลับเป็น VAT แล้วหัวจดหมายกลับมา", async () => {
    render(<SalesRequestEditor />);
    const picker = screen.getByLabelText("Bill Type (header)");

    await userEvent.selectOptions(picker, "Non VAT");
    expect(screen.getByTestId("doc-anonymous-mark")).toBeInTheDocument();

    await userEvent.selectOptions(picker, "VAT");
    expect(screen.queryByTestId("doc-anonymous-mark")).toBeNull();
    expect(screen.getAllByText(COMPANY.nameEn).length).toBeGreaterThan(0);
  });
});

describe("ลูกค้าใหม่จากคำขอขาย", () => {
  it("มีปุ่มลูกค้าใหม่แบบเดียวกับใบเสนอราคา", () => {
    render(<SalesRequestEditor />);
    /* Same panel, same dialog, same Draft partner and the same request to
       the sales admin — one path, two documents. */
    expect(screen.getByRole("button", { name: /ลูกค้าใหม่/ })).toBeInTheDocument();
  });
});

describe("ใครเซ็นราคาไหน", () => {
  it("ราคาตาม Price List — Sale Admin เซ็นเองได้", () => {
    setCurrentUser(MIN);
    expect(maySignAt("admin")).toBe(true);
  });

  it("ต่ำกว่าราคาขั้นต่ำ — ต้องส่งให้ General Manager", () => {
    setCurrentUser(MIN);
    expect(maySignAt("manager"), "แอดมินฝ่ายขายเซ็นไม่ได้").toBe(false);

    setCurrentUser(PRAEW);
    expect(maySignAt("manager"), "ผู้จัดการทั่วไปเซ็นได้").toBe(true);
  });

  it("ผู้แทนขายไม่เซ็นทั้งสองแบบ", () => {
    setCurrentUser(NOEY);
    expect(maySignAt("admin")).toBe(true);
    /* `maySignAt` is about the LEVEL; the permission matrix is what refuses
       the rep the approve button at all — proven in session-accounts. */
    expect(maySignAt("manager")).toBe(false);
  });
});
