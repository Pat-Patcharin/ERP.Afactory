import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUSINESS_PARTNERS as RAW_BP } from "@/data/partners";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { BUSINESS_PARTNERS, decorateBPs, type BpRow } from "@/lib/domain/partner";
import { QUOTATIONS, decorateOutbound, type QtRow } from "@/lib/domain/outbound";
import {
  createDraftCustomer,
  draftCustomers,
  validateDraftCustomer,
} from "@/lib/domain/draft-customer";
import { QuotationDocument } from "@/components/quotation/QuotationDocument";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { NOTIFY_ITEMS } from "@/data/notifications";
import { getUsers, resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { SALES_REQUESTS, blockedForDraftPartner } from "@/lib/domain/outbound";
import { srSchemas } from "@/schemas/sales-request";
import type { ActionCtx } from "@/lib/types";

const makeCtx = () =>
  ({
    goto: () => {},
    openEntity: () => {},
    toast: () => {},
    confirm: () => {},
    formModal: () => {},
    refresh: () => {},
    quickView: () => {},
    panel: () => {},
  }) as ActionCtx;

/* ============================================================
   THE CUSTOMER IN FRONT OF THE SALESPERSON

   A rep quoting somebody who is not in the system yet types the
   handful of things a quotation needs and carries on. What they
   have NOT done is add a customer to the master file: the record
   lands as a Draft, and the sales admin's desk gets the job of
   checking the name and the tax ID.
   ============================================================ */

const BP_SNAP = JSON.stringify(RAW_BP);
const QT_SNAP = JSON.stringify(RAW_QT);
const NOTIFY_SNAP = JSON.stringify(NOTIFY_ITEMS);

const NOEY = "EMP020"; // Sales Representative
const MIN = "EMP019"; // Sales Admin

beforeEach(() => {
  window.localStorage.clear();
  BUSINESS_PARTNERS.length = 0;
  BUSINESS_PARTNERS.push(...(JSON.parse(BP_SNAP) as BpRow[]));
  QUOTATIONS.length = 0;
  QUOTATIONS.push(...(JSON.parse(QT_SNAP) as QtRow[]));
  NOTIFY_ITEMS.length = 0;
  NOTIFY_ITEMS.push(...(JSON.parse(NOTIFY_SNAP) as typeof NOTIFY_ITEMS));
  decorateBPs();
  decorateOutbound();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

const NEW_CUSTOMER = {
  nameTh: "บริษัท ทันตกิจ เดนทัล จำกัด",
  taxId: "0105558123456",
  phone: "02-555-1234",
  addressLine: "88 ถนนพระราม 9",
  province: "กรุงเทพมหานคร",
  postcode: "10310",
  contactName: "คุณอร",
};

describe("ผู้แทนขายเปิดลูกค้าใหม่จากใบเสนอราคา", () => {
  it("ลูกค้าที่เปิดเป็น Draft และเป็นลูกค้าเท่านั้น ไม่ใช่ผู้ขาย", () => {
    setCurrentUser(NOEY);
    const res = createDraftCustomer(NEW_CUSTOMER);
    const bp = BUSINESS_PARTNERS.find((b) => b.code === res.code)!;

    expect(bp.status).toBe("Draft");
    expect(bp.roles.customer).toBe(true);
    /* A rep raising a supplier would be raising a party the company pays,
       which is nothing to do with the sale in front of them. */
    expect(bp.roles.supplier).toBe(false);
    expect(bp.supplier).toBeNull();
    expect(bp.supplierItems).toHaveLength(0);
    expect(bp.createdBy).toBe("Noey");
  });

  it("เด้งไปหาบทบาทที่ยืนยันคู่ค้าได้ ไม่ได้ระบุชื่อคน", () => {
    setCurrentUser(NOEY);
    const res = createDraftCustomer(NEW_CUSTOMER);

    const sent = NOTIFY_ITEMS.filter((n) => n.docCode === res.code);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.map((n) => n.toRole)).toContain("SALES_ADMIN");
    expect(sent[0].kind).toBe("approval_request");
    /* Addressed to a role, so anyone holding it sees the request. */
    expect(sent.every((n) => !n.toUser)).toBe(true);
  });

  it("เข้าคิว 'ลูกค้ารออนุมัติ' ของ Sale Admin", () => {
    setCurrentUser(NOEY);
    const before = draftCustomers().length;
    createDraftCustomer(NEW_CUSTOMER);
    expect(draftCustomers()).toHaveLength(before + 1);
  });

  it("เสนอราคาได้ทันที แต่เปิดใบสั่งขายยังไม่ได้", () => {
    setCurrentUser(NOEY);
    const res = createDraftCustomer(NEW_CUSTOMER);
    const bp = BUSINESS_PARTNERS.find((b) => b.code === res.code)!;

    /* The whole point of Draft: quotable today, orderable when somebody has
       checked it. The guard is on the write, not on the button. */
    expect(blockedForDraftPartner(bp.code)).toBeTruthy();
  });

  it("ต้องมีชื่อ และเลขผู้เสียภาษีที่กรอกต้องเป็น 13 หลัก", () => {
    expect(validateDraftCustomer({ nameTh: "" })).toContain("ระบุชื่อลูกค้า");
    expect(validateDraftCustomer({ nameTh: "ร้านทดสอบ" })).toHaveLength(0);
    expect(validateDraftCustomer({ nameTh: "ร้านทดสอบ", taxId: "123" })).toHaveLength(1);
    /* An absent tax ID is a question for the sales admin, not a refusal. */
    expect(validateDraftCustomer({ nameTh: "ร้านทดสอบ", taxId: "" })).toHaveLength(0);
  });
});

describe("ป๊อปอัปลูกค้าใหม่ในใบเสนอราคา", () => {
  it("กดแล้วขึ้นฟอร์ม กรอกแล้วเลือกลูกค้ารายนั้นให้เลย", async () => {
    setCurrentUser(NOEY);
    render(<QuotationEditor />);

    await userEvent.click(screen.getByRole("button", { name: /ลูกค้าใหม่/ }));
    const dialog = screen.getByRole("dialog", { name: "ลูกค้าใหม่" });

    await userEvent.type(
      within(dialog).getByLabelText("ชื่อลูกค้า (ชื่อนิติบุคคล)"),
      NEW_CUSTOMER.nameTh,
    );
    await userEvent.type(within(dialog).getByLabelText("เลขผู้เสียภาษี"), NEW_CUSTOMER.taxId);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "บันทึกและใช้ลูกค้ารายนี้" }),
    );

    /* The dialog closes, the partner exists as a Draft, and the document is
       already pointed at it — the rep never left the quotation. */
    expect(screen.queryByRole("dialog", { name: "ลูกค้าใหม่" })).toBeNull();
    const bp = BUSINESS_PARTNERS.find((b) => b.nameTh === NEW_CUSTOMER.nameTh)!;
    expect(bp.status).toBe("Draft");

    const picker = screen.getByLabelText("Customer") as HTMLSelectElement;
    expect(picker.value).toContain(bp.code);
  });

  it("ไม่กรอกชื่อ กดบันทึกแล้วบอกว่าต้องกรอกอะไร", async () => {
    setCurrentUser(NOEY);
    const before = BUSINESS_PARTNERS.length;
    render(<QuotationEditor />);

    await userEvent.click(screen.getByRole("button", { name: /ลูกค้าใหม่/ }));
    const dialog = screen.getByRole("dialog", { name: "ลูกค้าใหม่" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "บันทึกและใช้ลูกค้ารายนี้" }),
    );

    expect(within(dialog).getByText("ระบุชื่อลูกค้า")).toBeInTheDocument();
    expect(BUSINESS_PARTNERS).toHaveLength(before);
  });
});

/* ============================================================
   THE SHEET, AND WHO MAY DO WHAT WITH IT
   ============================================================ */

/**
 * A seeded quotation in the state a test needs, or one put into it.
 *
 * The seed carries what the seed carries; a test that needs an approved
 * quotation and finds none should still be testing something, so the status
 * is set rather than the test quietly passing on an empty find.
 */
const qt = (status: string, approval = "Approved"): QtRow => {
  const found = QUOTATIONS.find((q) => q.status === status);
  if (found) return found;
  const rec = { ...QUOTATIONS[0], code: `QT-TEST-${status}`, status, approvalStatus: approval };
  QUOTATIONS.unshift(rec);
  decorateOutbound();
  return rec;
};

describe("ใบเสนอราคาเปิดดูเป็นเอกสาร", () => {
  it("แสดงเป็นใบเสนอราคา ไม่ใช่การ์ดสรุปเป็นแท็บ", () => {
    render(<QuotationDocument record={qt("Approved")} />);
    expect(screen.getByTestId("quotation-document")).toBeInTheDocument();
    expect(screen.getByText("QUOTATION")).toBeInTheDocument();
    expect(screen.getByText("ใบเสนอราคา")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("ใบที่อนุมัติแล้วขึ้นลายเซ็นผู้อนุมัติ", () => {
    const rec = qt("Sent");
    render(<QuotationDocument record={rec} />);

    /* The mock signature: the approver's name, in the Approved By block. */
    expect(screen.getAllByText(rec.approvedBy).length).toBeGreaterThan(0);
    expect(screen.getByText(/Approved By/)).toBeInTheDocument();
  });

  it("ใบที่ยังไม่อนุมัติ ช่องลายเซ็นยังว่าง และยังโหลด PDF ไม่ได้", () => {
    const rec = qt("Draft", "Not Submitted");
    render(<QuotationDocument record={rec} />);

    /* A PDF of an unapproved quotation is a price nobody agreed to, in the
       customer's inbox. */
    expect(screen.queryByRole("button", { name: /ดาวน์โหลด PDF/ })).toBeNull();
  });

  it("Sale Admin เห็น Approve / Revise / Reject บนใบที่รออนุมัติ", () => {
    setCurrentUser(MIN);
    const rec = qt("Pending Approval", "Pending Approval");
    render(<QuotationDocument record={rec} />);

    const bar = screen.getByTestId("qt-decision-bar");
    for (const label of ["Approve", "Revise", "Reject"]) {
      expect(within(bar).getByRole("button", { name: new RegExp(label) }), label).toBeInTheDocument();
    }
  });

  it("ผู้แทนขายอนุมัติใบของตัวเองไม่ได้", () => {
    setCurrentUser(NOEY);
    const rec = qt("Pending Approval", "Pending Approval");
    render(<QuotationDocument record={rec} />);

    const bar = screen.getByTestId("qt-decision-bar");
    expect(within(bar).queryByRole("button", { name: /^Approve/ })).toBeNull();
  });

  it("ใบที่อนุมัติแล้ว ผู้แทนขายโหลด PDF และขอแก้ไขได้", () => {
    setCurrentUser(NOEY);
    const rec = qt("Approved");
    render(<QuotationDocument record={rec} />);

    const bar = screen.getByTestId("qt-decision-bar");
    expect(within(bar).getByRole("button", { name: /ดาวน์โหลด PDF/ })).toBeInTheDocument();
    /* Editing pulls it back through approval — a quotation that changed
       after it was signed is not the one that was signed. */
    expect(
      within(bar).getByRole("button", { name: /แก้ไข \(ต้องขออนุมัติใหม่\)/ }),
    ).toBeInTheDocument();
  });

  it("ใบที่ลูกค้าตอบรับแล้ว มีปุ่มออกเป็น S/R", () => {
    setCurrentUser(NOEY);
    const rec = qt("Accepted");
    render(<QuotationDocument record={rec} />);

    expect(
      within(screen.getByTestId("qt-decision-bar")).getByRole("button", {
        name: /Confirm & generate S\/R/,
      }),
    ).toBeInTheDocument();
  });
});

/* ============================================================
   THE CONVERSATION UNDER THE DOCUMENT
   ============================================================ */

describe("ช่องพูดคุยใต้เอกสาร", () => {
  it("ใบเสนอราคามีช่องพูดคุย และบอกว่ายังเป็น mock", () => {
    setCurrentUser(NOEY);
    render(<QuotationDocument record={qt("Approved")} />);

    const thread = screen.getByTestId("doc-comments");
    expect(within(thread).getByText(/ยังไม่มีความเห็น/)).toBeInTheDocument();
    /* A thread that looks real and forgets what you wrote is worse than no
       thread — it says so on the page, not only in the code. */
    expect(within(thread).getByText(/Mock — ยังไม่ได้เก็บข้อมูล/)).toBeInTheDocument();
  });

  it("แท็กคนที่เกี่ยวข้องกับเอกสารได้ ไม่ใช่ทั้งบริษัท", () => {
    setCurrentUser(NOEY);
    const rec = qt("Approved");
    render(<QuotationDocument record={rec} />);

    const thread = screen.getByTestId("doc-comments");
    const tags = within(thread)
      .getAllByRole("button", { name: /^@/ })
      .map((b) => b.textContent!.replace("@", ""));

    expect(tags.length).toBeGreaterThan(0);
    /* Everyone offered is either on this document or on the desk it crosses;
       a mention list of the whole staff directory is a list nobody reads. */
    const sales = new Set(
      getUsers().filter((u) => u.department === "Sales").map((u) => u.name),
    );
    const onDoc = new Set([rec.createdBy, rec.salesRep, rec.approvedBy].filter(Boolean));
    for (const t of tags) expect(sales.has(t) || onDoc.has(t), t).toBe(true);
  });

  it("พิมพ์แล้วขึ้นในเธรด พร้อมแท็กที่เลือก", async () => {
    setCurrentUser(MIN);
    render(<QuotationDocument record={qt("Approved")} />);
    const thread = screen.getByTestId("doc-comments");

    const tag = within(thread).getAllByRole("button", { name: /^@/ })[0];
    const who = tag.textContent!.replace("@", "");
    await userEvent.click(tag);
    await userEvent.type(within(thread).getByLabelText("เขียนความเห็น"), "ยืนยันราคานี้ได้ไหม");
    await userEvent.click(within(thread).getByRole("button", { name: "ส่ง" }));

    expect(
      within(thread).getByText((t) => t.includes("ยืนยันราคานี้ได้ไหม")),
    ).toBeInTheDocument();
    expect(within(thread).getAllByText(new RegExp(who)).length).toBeGreaterThan(1);
  });

  it("คำขอขายก็มีช่องเดียวกัน", () => {
    const sr = SALES_REQUESTS[0];
    const history = srSchemas.detail.tabs.find((t) => t.key === "history")!;
    const blocks = history.blocks(sr, makeCtx()).filter(Boolean);

    /* Same component, not a third copy that would drift the first time one
       of the three gained a feature. */
    const node = blocks.find((b) => b && b.type === "node");
    expect(node).toBeTruthy();

    render(<>{(node as { node: React.ReactNode }).node}</>);
    expect(screen.getByTestId("doc-comments")).toBeInTheDocument();
  });
});
