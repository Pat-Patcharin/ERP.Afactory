import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COMPANY } from "@/data/admin";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { QUOTATIONS, decorateOutbound, type QtRow } from "@/lib/domain/outbound";
import {
  blankDraft,
  saveQuotationDraft,
  type QuotationDraft,
} from "@/lib/domain/quotation-draft";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { PrintDocument } from "@/components/print/PrintDocument";
import { buildPrintJob, getPrintConfig } from "@/lib/print";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   WHAT THE QUOTATION ASKS FOR, AND WHAT IT PRINTS

   Two different audiences. The editor asks the salesperson for
   what an OFFER needs — not a currency nobody chooses and not a
   delivery date no stock has been checked against. The printed
   sheet shows the customer what they are being offered, without
   the working numbers the office keeps.
   ============================================================ */

const QT_SNAP = JSON.stringify(RAW_QT);
const NOEY = "EMP020";

beforeEach(() => {
  window.localStorage.clear();
  QUOTATIONS.length = 0;
  QUOTATIONS.push(...(JSON.parse(QT_SNAP) as QtRow[]));
  decorateOutbound();
  resetCurrentUser();
  setCurrentUser(NOEY);
});

afterEach(resetCurrentUser);

describe("แนบ PO ของลูกค้า", () => {
  it("แนบไฟล์ PDF หรือรูปได้ และเก็บไว้กับใบเสนอราคา", async () => {
    render(<QuotationEditor />);

    const input = screen.getByLabelText("แนบ PO ลูกค้า") as HTMLInputElement;
    /* A scan, a phone photo, an emailed PDF — that is what arrives. */
    expect(input.accept).toContain("application/pdf");
    expect(input.accept).toContain("image/*");

    const file = new File(["po"], "PO-2569-0042.pdf", { type: "application/pdf" });
    await userEvent.upload(input, file);

    /* Named on screen — the file is the thing an argument about what was
       ordered is settled with. */
    expect(await screen.findByText("PO-2569-0042.pdf")).toBeInTheDocument();
  });

  it("เอาไฟล์ออกได้", async () => {
    render(<QuotationEditor />);
    const input = screen.getByLabelText("แนบ PO ลูกค้า") as HTMLInputElement;
    await userEvent.upload(input, new File(["po"], "wrong.pdf", { type: "application/pdf" }));
    await screen.findByText("wrong.pdf");

    await userEvent.click(screen.getByRole("button", { name: "เอาไฟล์ที่แนบออก" }));
    expect(screen.queryByText("wrong.pdf")).toBeNull();
    expect(screen.getByLabelText("แนบ PO ลูกค้า")).toBeInTheDocument();
  });

  it("บันทึกแล้วไฟล์ที่แนบยังอยู่กับเอกสาร", () => {
    const draft: QuotationDraft = {
      ...blankDraft(),
      customerPick: "BP000122 - คลินิกทันตกรรม เอบีซี",
      customerRef: "PO-2569-0042",
      customerPo: {
        name: "PO-2569-0042.pdf",
        type: "application/pdf",
        url: "blob:mock",
        at: "11/08/2569 09:00",
      },
    };
    const res = saveQuotationDraft(draft, { user: "Noey" });
    const saved = QUOTATIONS.find((q) => q.code === res.code)!;
    expect(saved.customerPo?.name).toBe("PO-2569-0042.pdf");
  });
});

describe("Save Draft กับ Save and Request for Approve", () => {
  const draft = (): QuotationDraft => ({
    ...blankDraft(),
    customerPick: "BP000122 - คลินิกทันตกรรม เอบีซี",
  });

  it("Save Draft เก็บไว้ในระบบ แต่ยังไม่ขออนุมัติ", () => {
    const res = saveQuotationDraft(draft(), { user: "Noey" });
    const saved = QUOTATIONS.find((q) => q.code === res.code)!;

    /* In the system, and nobody has been asked for anything. */
    expect(saved.status).toBe("Draft");
    expect(saved.approvalStatus).not.toBe("Pending Approval");
  });

  it("ปุ่มหลักบอกว่าเซฟแล้วส่งขออนุมัติ", () => {
    render(<QuotationEditor />);
    /* One button doing two things says both, or somebody presses it
       expecting only the first. */
    expect(
      screen.getAllByRole("button", { name: /Save and Request for Approve/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Save Draft/ }).length).toBeGreaterThan(0);
  });
});

/* ============================================================
   THE PRINTED SHEET
   ============================================================ */

const approvedSheet = () => {
  const q = QUOTATIONS.find((x) => x.approvalStatus === "Approved" && x.approvedBy)!;
  const job = buildPrintJob("quotation", q.code)!;
  const { container } = render(<PrintDocument job={job} />);
  return { q, container, job };
};

describe("เอกสารที่พิมพ์ออกมา", () => {
  it("หัวเอกสารไม่มีฉบับแก้ไข สกุลเงิน ผู้อนุมัติ และเวลาอนุมัติ", () => {
    const { job } = approvedSheet();
    const fields = getPrintConfig("quotation")!.metaFields;

    for (const gone of ["revision", "currency", "approvedBy", "approvedAt"]) {
      expect(fields, gone).not.toContain(gone);
    }
    /* What is left is what the customer reads. */
    expect(fields).toContain("docNo");
    expect(fields).toContain("docDate");
    expect(job.doc.meta.map((m) => m.field)).not.toContain("currency");
  });

  it("ใบที่อนุมัติแล้วขึ้นลายเซ็นทั้งผู้จัดทำและผู้อนุมัติ", () => {
    const { q, container } = approvedSheet();
    expect(container.textContent).toContain(q.approvedBy);
    expect(container.textContent).toContain(q.createdBy);
  });

  it("ท้ายกระดาษไม่มีที่อยู่ เบอร์ LINE Facebook เว็บไซต์ และ QR ซ้ำอีก", () => {
    const { container } = approvedSheet();
    /* All of it is in the letterhead at the top of the same page. */
    expect(container.textContent).not.toContain("LINE @afactory");
    expect(container.textContent).not.toContain("Facebook");
    expect(within(container).queryByLabelText(COMPANY.tagline)).toBeNull();
  });

  it("มุมขวาบนมีแต่ QR ไม่มีบาร์โค้ดซ้ำ", () => {
    const { container, q } = approvedSheet();
    expect(within(container).getAllByLabelText(/QR/i).length).toBeGreaterThan(0);
    /* The QR already encodes the number, and the number is printed twice
       more on the same sheet. */
    expect(within(container).queryAllByLabelText(/barcode/i)).toHaveLength(0);
    expect(container.textContent).toContain(q.code);
  });
});
