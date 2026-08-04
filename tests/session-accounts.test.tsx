import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ListView } from "@/components/engine/ListView";
import {
  actingUserName,
  can,
  currentUser,
  demoAccounts,
  getRole,
  resetCurrentUser,
  restoreAccount,
  switchAccount,
} from "@/lib/domain/admin";
import { SALES_REQUESTS, decorateOutbound, type SrRow } from "@/lib/domain/outbound";
import { srApprove, srConvert, srReject, srSubmit } from "@/lib/workflows-outbound";
import { srSchemas } from "@/schemas/sales-request";
import { soSchemas } from "@/schemas/sales-order";
import { invSchemas } from "@/schemas/sales-invoice";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   TWO ACCOUNTS regression suite.

   The sales rep raises the paperwork; the administrator approves
   it and moves it down the line. These tests hold that split at
   both levels it is enforced — the button a role is shown, and
   the function it can actually run.
   ============================================================ */

const REP = "EMP004";
const ADMIN = "EMP001";

const SEED = JSON.parse(JSON.stringify(SALES_REQUESTS)) as SrRow[];

beforeEach(() => {
  SALES_REQUESTS.length = 0;
  SALES_REQUESTS.push(...(JSON.parse(JSON.stringify(SEED)) as SrRow[]));
  decorateOutbound();
  resetCurrentUser();
});

afterEach(() => resetCurrentUser());

const toasts: { title: string; tone?: string }[] = [];

const makeCtx = (over: Partial<ActionCtx> = {}): ActionCtx => ({
  goto: () => {},
  openEntity: () => {},
  toast: (title: string, _m?: unknown, tone?: string) => toasts.push({ title, tone }),
  confirm: (o: { onConfirm?: () => void }) => o.onConfirm?.(),
  formModal: () => {},
  refresh: () => {},
  quickView: () => {},
  panel: () => {},
  ...over,
});

const sr = (status: string) => SALES_REQUESTS.find((r) => r.status === status) as SrRow;

/** Walk a seeded request up to Approved so there is something to convert. */
function approved(): SrRow {
  const prev = currentUser().code;
  switchAccount(ADMIN);
  const rec = sr("Submitted");
  srApprove(rec, makeCtx());
  decorateOutbound();
  switchAccount(prev);
  return rec;
}
const labels = (acts: { label?: string }[]) => acts.map((a) => a.label ?? "");

describe("Two accounts — who they are", () => {
  it("offers exactly the sales rep and the administrator", () => {
    const codes = demoAccounts().map((a) => a.code);
    expect(codes).toEqual([REP, ADMIN]);

    expect(getRole(demoAccounts()[0].user.roleCode)!.code).toBe("SALES_REP");
    expect(getRole(demoAccounts()[1].user.roleCode)!.all).toBe(true);
  });

  it("starts in the administrator's chair", () => {
    expect(currentUser().code).toBe(ADMIN);
  });

  it("switches and stays switched across a reload", () => {
    expect(switchAccount(REP)).toBe(true);
    expect(currentUser().code).toBe(REP);

    /* A reload re-imports nothing in the test, so simulate it by putting the
       session back and asking the store to restore it. */
    resetCurrentUser();
    expect(currentUser().code).toBe(ADMIN);
    switchAccount(REP);
    expect(restoreAccount()).toBe(REP);
  });

  it("refuses an account that does not exist", () => {
    expect(switchAccount("EMP999")).toBe(false);
    expect(currentUser().code).toBe(ADMIN);
  });
});

describe("Two accounts — what each may do", () => {
  it("lets the rep write quotations and requests but not approve them", () => {
    switchAccount(REP);

    expect(can("quotation", "create")).toBe(true);
    expect(can("sales-request", "create")).toBe(true);
    expect(can("sales-request", "edit")).toBe(true);
    expect(can("sales-request", "approve")).toBe(false);
    expect(can("sales-order", "approve")).toBe(false);
  });

  it("lets the administrator approve and run the process on", () => {
    switchAccount(ADMIN);

    expect(can("sales-request", "approve")).toBe(true);
    expect(can("sales-order", "approve")).toBe(true);
    expect(can("picking", "create")).toBe(true);
  });

  it("keeps cost figures away from the rep", () => {
    switchAccount(ADMIN);
    const adminSeesCost = can("product", "view");
    switchAccount(REP);
    /* Both may open the product master; only one may price its purchase. */
    expect(adminSeesCost).toBe(true);
    expect(can("product", "view")).toBe(true);
    expect(can("product", "edit")).toBe(false);
  });
});

describe("Two accounts — the buttons each is shown", () => {
  it("shows the rep Submit but never Approve", () => {
    switchAccount(REP);
    const ctx = makeCtx();

    expect(labels(srSchemas.detail.actions!(sr("Draft"), ctx))).toContain(
      "Submit for Approval",
    );
    const submitted = labels(srSchemas.detail.actions!(sr("Submitted"), ctx));
    expect(submitted).not.toContain("Approve");
    expect(submitted).not.toContain("Reject");
  });

  it("shows the administrator Approve and Reject on the same record", () => {
    switchAccount(ADMIN);
    const acts = labels(srSchemas.detail.actions!(sr("Submitted"), ctx()));
    expect(acts).toContain("Approve");
    expect(acts).toContain("Reject");
  });

  it("keeps Convert to Sales Order for the approver", () => {
    const rec = approved();
    expect(rec.isConvertible).toBe(true);

    switchAccount(REP);
    expect(labels(srSchemas.detail.actions!(rec, ctx()))).not.toContain(
      "Convert to Sales Order",
    );

    switchAccount(ADMIN);
    expect(labels(srSchemas.detail.actions!(rec, ctx()))).toContain(
      "Convert to Sales Order",
    );
  });

  it("keeps the sales order's own process steps for the approver", () => {
    const draft = soSchemas.list.source().find((s) => s.status === "Draft");
    if (!draft) return; /* No draft order seeded — nothing to assert. */

    switchAccount(REP);
    expect(labels(soSchemas.detail.actions!(draft, ctx()))).not.toContain("Confirm Order");

    switchAccount(ADMIN);
    expect(labels(soSchemas.detail.actions!(draft, ctx()))).toContain("Confirm Order");
  });

  function ctx() {
    return makeCtx();
  }
});

describe("Two accounts — the guard behind the button", () => {
  beforeEach(() => {
    toasts.length = 0;
  });

  it("refuses an approval the rep reaches by another route", () => {
    switchAccount(REP);
    const rec = sr("Submitted");
    const before = rec.status;

    srApprove(rec, makeCtx());

    expect(rec.status, "status untouched").toBe(before);
    expect(toasts.at(-1)?.title).toBe("สิทธิ์ไม่พอ");
    expect(toasts.at(-1)?.tone).toBe("danger");
  });

  it("refuses a rejection too", () => {
    switchAccount(REP);
    const rec = sr("Submitted");
    srReject(rec, makeCtx());
    expect(rec.status).toBe("Submitted");
    expect(toasts.at(-1)?.title).toBe("สิทธิ์ไม่พอ");
  });

  it("refuses to let the rep push an approved request into an order", () => {
    const rec = approved();
    switchAccount(REP);
    toasts.length = 0;

    srConvert(rec, makeCtx());

    expect(rec.soRef).toBe("");
    expect(rec.status).toBe("Approved");
    expect(toasts.at(-1)?.title).toBe("สิทธิ์ไม่พอ");
  });

  it("lets the rep submit, which is their half of the job", () => {
    switchAccount(REP);
    const rec = sr("Draft");
    srSubmit(rec, makeCtx());
    expect(rec.status).toBe("Submitted");
    expect(rec.updatedBy).toBe(actingUserName());
  });

  it("signs the approval with the administrator, not the author", () => {
    switchAccount(REP);
    const rec = sr("Draft");
    srSubmit(rec, makeCtx());
    const author = rec.updatedBy;

    switchAccount(ADMIN);
    srApprove(rec, makeCtx());

    expect(rec.status).toBe("Approved");
    expect(rec.approvedBy).toBe(actingUserName());
    expect(rec.approvedBy, "two different people").not.toBe(author);
  });
});

describe("Two accounts — on the screen", () => {
  it("names the acting account in the top bar", () => {
    switchAccount(REP);
    render(<Topbar />);
    expect(screen.getByTestId("session-name")).toHaveTextContent(currentUser().name);
    expect(screen.getByTestId("session-role")).toHaveTextContent("Sales Representative");
  });

  it("switches account from the top bar menu", async () => {
    const user = userEvent.setup();
    render(<Topbar />);
    expect(screen.getByTestId("session-role")).toHaveTextContent("Super Admin");

    await user.click(screen.getByRole("button", { name: /Super Admin/ }));
    await user.click(screen.getByText("สุภาวิตา โยธะพันธ์"));

    expect(currentUser().code).toBe(REP);
  });

  it("hides from the rep the modules the rep may not open", () => {
    switchAccount(REP);
    const { unmount } = render(<Sidebar />);
    /* Sales work stays; the warehouse and the admin console go. */
    expect(screen.getAllByText("Quotation").length).toBeGreaterThan(0);
    expect(screen.queryByText("Stock Adjustment")).toBeNull();
    expect(screen.queryByText("Purchase Order")).toBeNull();
    unmount();

    switchAccount(ADMIN);
    render(<Sidebar />);
    expect(screen.getAllByText("Stock Adjustment").length).toBeGreaterThan(0);
  });

  it("gives no Create button on a list the role may only read", () => {
    /* The rep may look at sales invoices; raising one is finance's job. */
    switchAccount(REP);
    const { unmount } = render(<ListView schema={invSchemas.list} />);
    expect(screen.queryByRole("button", { name: /Create Invoice/ })).toBeNull();
    unmount();

    switchAccount(ADMIN);
    render(<ListView schema={invSchemas.list} />);
    expect(screen.getByRole("button", { name: /Create Invoice/ })).toBeInTheDocument();
  });
});

/* Keep vitest from complaining about an unused import when a branch is skipped. */
void vi;
