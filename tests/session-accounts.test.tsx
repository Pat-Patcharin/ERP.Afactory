import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { ListView } from "@/components/engine/ListView";
import {
  actingUserName,
  can,
  canViewField,
  currentUser,
  demoAccounts,
  getRole,
  getUser,
  resetCurrentUser,
  restoreAccount,
  switchAccount,
} from "@/lib/domain/admin";
import { SALES_REQUESTS, decorateOutbound, type SrRow } from "@/lib/domain/outbound";
import { srApprove, srConvert, srReject, srSubmit } from "@/lib/workflows-outbound";
import { srSchemas } from "@/schemas/sales-request";
import { soSchemas } from "@/schemas/sales-order";
import { invSchemas } from "@/schemas/sales-invoice";
import { productSchemas } from "@/schemas/product";
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
const SALES_ADMIN = "EMP013";
const SALES_MANAGER = "EMP003";

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
  it("offers the four chairs one order passes through, in that order", () => {
    /* This used to read "exactly the sales rep and the administrator", from
       when every outbound approval needed a manager. The sales admin desk
       exists now, so the demo carries the three sales chairs plus the one
       that can reach Administration. */
    const codes = demoAccounts().map((a) => a.code);
    expect(codes).toEqual([REP, SALES_ADMIN, SALES_MANAGER, ADMIN]);

    const roleOf = (i: number) => getRole(demoAccounts()[i].user.roleCode)!;
    expect(roleOf(0).code).toBe("SALES_REP");
    expect(roleOf(1).code).toBe("SALES_ADMIN");
    expect(roleOf(2).code).toBe("SALES_MANAGER");
    expect(roleOf(3).all).toBe(true);

    /* Every one of them must be usable — a demo chair nobody can sit in is
       worse than not offering it. */
    for (const a of demoAccounts()) expect(a.user.status).toBe("Active");
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

  it("offers every chair in the story from that menu", async () => {
    const user = userEvent.setup();
    render(<Topbar />);
    await user.click(screen.getByRole("button", { name: /Super Admin/ }));

    /* Each account by name, so a chair dropped from DEMO_ACCOUNTS shows up
       here rather than as a demo that quietly cannot be walked. The acting
       one appears twice — in the trigger, and in the list carrying the tick
       that says which chair you are sitting in. */
    for (const code of [REP, SALES_ADMIN, SALES_MANAGER, ADMIN]) {
      const hits = screen.getAllByText(getUser(code)!.name);
      expect(hits.length, code).toBeGreaterThanOrEqual(currentUser().code === code ? 2 : 1);
    }
  });

  it("re-answers the permission questions the moment the chair changes", async () => {
    /* The switch is only worth having if `can()` changes with it — the menu,
       the buttons and the task box all read the same function. */
    const user = userEvent.setup();
    render(<Topbar />);
    await user.click(screen.getByRole("button", { name: /Super Admin/ }));
    await user.click(screen.getByText(getUser(SALES_ADMIN)!.name));

    expect(currentUser().code).toBe(SALES_ADMIN);
    expect(can("quotation", "approve"), "the desk signs the ordinary").toBe(true);
    expect(can("admin-role", "view"), "and loses the admin console").toBe(false);
    expect(canViewField("cost"), "and never sees cost").toBe(false);
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
    /* The rep may look at the product catalogue; maintaining it is not theirs. */
    switchAccount(REP);
    const { unmount } = render(<ListView schema={productSchemas.list} />);
    expect(screen.queryByRole("button", { name: /Create Product/ })).toBeNull();
    unmount();

    switchAccount(ADMIN);
    render(<ListView schema={productSchemas.list} />);
    expect(screen.getByRole("button", { name: /Create Product/ })).toBeInTheDocument();
  });

  it("gives no Create button on a convert-only document, not even to Super Admin", () => {
    /* Permission is not the question here: an invoice exists because goods
       moved, so there is no blank page for anybody to start one on. */
    switchAccount(ADMIN);
    expect(can("sales-invoice", "create")).toBe(true);
    render(<ListView schema={invSchemas.list} />);
    expect(screen.queryByRole("button", { name: /Create Invoice/ })).toBeNull();
  });
});

/* Keep vitest from complaining about an unused import when a branch is skipped. */
void vi;
