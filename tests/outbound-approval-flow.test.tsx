import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EntityDetailPage from "@/app/(erp)/m/[entity]/[code]/page";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { SalesRequestEditor } from "@/components/sales-request/SalesRequestEditor";
import { ConfirmModalHost } from "@/components/ui";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { SALES_REQUESTS as RAW_SR } from "@/data/sales-requests";
import { NOTIFY_ITEMS as RAW_NOTIFY } from "@/data/notifications";
import {
  QUOTATIONS,
  SALES_REQUESTS,
  decorateOutbound,
  type QtRow,
} from "@/lib/domain/outbound";
import { NOTIFY_ITEMS, unreadCount } from "@/lib/domain/notify";
import { qtSchemas } from "@/schemas/quotation";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { routeParams } from "./setup";

/* ============================================================
   ASKING FOR APPROVAL, AND GETTING IT

   Two repairs to one flow, both of the same shape: the screen
   said something had happened and the record said otherwise.

     · "Save and Request for Approve" only saved. The quotation
       was written as a Draft, no approver was told, and the
       salesperson had no way to know their request had not been
       made.

     · Approving one changed the record and left the sheet on
       screen exactly as it was — empty signature block, the
       approver's four buttons still there. Only a reload showed
       the truth.
   ============================================================ */

const REP = "EMP020"; // Noey — Sales Representative, raises quotations
const SALES_ADMIN = "EMP019"; // Min — Sales Admin, signs the ordinary ones

const CUSTOMER = "BP000123 - บริษัท เดนทัล สมายล์ จำกัด";
const PRODUCT = "AA-TH003-WL";

/** The least a sell-side document needs before it can be submitted. */
async function fillOneLine(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Customer"), CUSTOMER);
  const reps = screen.getByLabelText("Sales Representative") as HTMLSelectElement;
  await user.selectOptions(reps, within(reps).getAllByRole("option")[1]);
  await user.click(screen.getByLabelText("Item Code 1"));
  await user.click(await screen.findByText(PRODUCT));
}

/** The record the editor just wrote — newest first, so it is at the front. */
const newest = <T extends { created: string }>(live: T[]) => live[0];

const SNAP = {
  qt: JSON.stringify(RAW_QT),
  sr: JSON.stringify(RAW_SR),
  notify: JSON.stringify(RAW_NOTIFY),
};

const restore = (live: unknown[], json: string) => {
  live.length = 0;
  live.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(QUOTATIONS, SNAP.qt);
  restore(SALES_REQUESTS, SNAP.sr);
  restore(NOTIFY_ITEMS, SNAP.notify);
  decorateOutbound();
  resetCurrentUser();
  routeParams.entity = "quotation";
  delete routeParams.code;
});

afterEach(() => {
  resetCurrentUser();
  delete routeParams.code;
});

/* ============================================================
   1. THE BUTTON DOES WHAT IT SAYS
   ============================================================ */

describe("Save and Request for Approve", () => {
  /** Fill the least a quotation needs to pass validation, then press it. */
  async function raise(user: ReturnType<typeof userEvent.setup>) {
    render(<QuotationEditor />);
    await fillOneLine(user);
    await user.click(
      within(screen.getByTestId("qt-toolbar")).getByText("Save and Request for Approve"),
    );
  }

  it("ใบใหม่ไปอยู่ที่รออนุมัติ ไม่ใช่ค้างเป็นร่าง", async () => {
    setCurrentUser(REP);
    await raise(userEvent.setup());

    const fresh = QUOTATIONS[0];
    /* The whole complaint: the admin opened the list and saw Draft. */
    expect(fresh.status).toBe("Pending Approval");
    expect(fresh.approvalStatus).toBe("Pending Approval");
  });

  it("เขียนประวัติและแจ้งผู้อนุมัติ ไม่ใช่แค่เปลี่ยนสถานะ", async () => {
    setCurrentUser(REP);
    const before = NOTIFY_ITEMS.length;
    await raise(userEvent.setup());

    const fresh = QUOTATIONS[0];
    /* Routed through qtSubmit, so everything that function owns happened —
       the level was frozen, the entry written, the approvers told. */
    expect(fresh.history.some((h) => h.t === "Submitted for approval")).toBe(true);
    expect(fresh.priceApprovalLevel).toBeTruthy();
    expect(NOTIFY_ITEMS.length).toBeGreaterThan(before);

    setCurrentUser(SALES_ADMIN);
    expect(unreadCount()).toBeGreaterThan(0);
  });

  it("แอดมินหาใบที่รออนุมัติเจอจากแท็บในหน้ารายการ", async () => {
    setCurrentUser(REP);
    await raise(userEvent.setup());

    /* A queue nobody can filter to is a queue nobody works. */
    const tab = qtSchemas.list.tabs!.find((t) => t.key === "pending")!;
    expect(tab.label).toBe("รออนุมัติ");
    expect(QUOTATIONS.filter((q) => tab.test!(q)).map((q) => q.code)).toContain(
      newest(QUOTATIONS).code,
    );
  });

  it("ผู้อนุมัติแก้ใบที่รออนุมัติอยู่แล้ว ไม่ถูกส่งเข้าคิวซ้ำ", async () => {
    const user = userEvent.setup();
    const pending = QUOTATIONS.find((q) => q.status === "Pending Approval") ?? QUOTATIONS[0];
    pending.status = "Pending Approval";
    pending.approvalStatus = "Pending Approval";
    decorateOutbound();

    setCurrentUser(SALES_ADMIN);
    const entries = pending.history.length;
    render(<QuotationEditor record={pending} />);
    await user.click(
      within(screen.getByTestId("qt-toolbar")).getByText("Save and Request for Approve"),
    );

    /* Correcting a quotation in place is not re-submitting it — the approver
       signs it themselves afterwards. */
    expect(pending.status).toBe("Pending Approval");
    expect(
      pending.history.slice(0, pending.history.length - entries).some(
        (h) => h.t === "Submitted for approval",
      ),
    ).toBe(false);
  });
});

describe("Submit Request — คำขอขาย", () => {
  it("ส่งแล้วอยู่ที่ Submitted ไม่ใช่ Draft", async () => {
    const user = userEvent.setup();
    setCurrentUser(REP);
    routeParams.entity = "sales-request";

    render(<SalesRequestEditor />);
    await fillOneLine(user);
    /* A request says which warehouse will serve it; a quotation does not. */
    const wh = screen.getByLabelText("Preferred Warehouse") as HTMLSelectElement;
    await user.selectOptions(wh, within(wh).getAllByRole("option")[1]);
    await user.click(within(screen.getByTestId("sr-toolbar")).getByText("Submit Request"));

    /* The toast used to read "สร้างคำขอขายแล้ว — รออนุมัติ" over a Draft. */
    expect(SALES_REQUESTS[0].status).toBe("Submitted");
    expect(SALES_REQUESTS[0].history.some((h) => h.t === "Submitted for approval")).toBe(true);
  });
});

/* ============================================================
   2. THE SHEET REDRAWS WHEN THE DECISION IS MADE
   ============================================================ */

describe("อนุมัติแล้วกระดาษเปลี่ยนทันที", () => {
  /** A quotation waiting on the ordinary desk, opened at its own route. */
  function openPending() {
    const qt = (QUOTATIONS.find((q) => q.status === "Pending Approval") ??
      QUOTATIONS[0]) as QtRow;
    qt.status = "Pending Approval";
    qt.approvalStatus = "Pending Approval";
    /* Below the floor price it would need a manager — this one is ordinary. */
    qt.priceApprovalLevel = "admin";
    qt.approvedBy = "";
    qt.approvedAt = "";
    decorateOutbound();

    routeParams.entity = "quotation";
    routeParams.code = qt.code;
    render(
      <>
        <EntityDetailPage />
        <ConfirmModalHost />
      </>,
    );
    return qt;
  }

  it("ขึ้นลายเซ็นผู้อนุมัติ และเปลี่ยนปุ่มเป็นดาวน์โหลด PDF โดยไม่ต้องรีเฟรช", async () => {
    const user = userEvent.setup();
    setCurrentUser(SALES_ADMIN);
    const qt = openPending();

    const bar = () => screen.getByTestId("qt-decision-bar");
    expect(within(bar()).queryByRole("button", { name: /ดาวน์โหลด PDF/ })).toBeNull();

    await user.click(within(bar()).getByRole("button", { name: /^Approve/ }));
    await user.click(screen.getByRole("button", { name: "Approve quotation" }));

    expect(qt.status).toBe("Approved");
    /* The record changed; so must the sheet, on the same paint. */
    expect(screen.getAllByText(qt.approvedBy).length).toBeGreaterThan(0);
    expect(within(bar()).getByRole("button", { name: /ดาวน์โหลด PDF/ })).toBeInTheDocument();
    /* And the approver's four are gone, because there is nothing left to decide. */
    expect(within(bar()).queryByRole("button", { name: /^Approve/ })).toBeNull();
    expect(within(bar()).queryByRole("button", { name: /^Reject/ })).toBeNull();
  });

  it("ผู้แทนขายที่อนุมัติเองไม่ได้ ก็ไม่เห็นปุ่ม", () => {
    setCurrentUser(REP);
    openPending();
    expect(
      within(screen.getByTestId("qt-decision-bar")).queryByRole("button", { name: /^Approve/ }),
    ).toBeNull();
  });
});
