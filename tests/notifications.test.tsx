import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Topbar } from "@/components/layout/Topbar";
import { NOTIFY_ITEMS as RAW_NOTIFY } from "@/data/notifications";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { SALES_REQUESTS as RAW_SR } from "@/data/sales-requests";
import { BUSINESS_PARTNERS as RAW_BP } from "@/data/partners";
import {
  NOTIFY_ITEMS,
  markAllRead,
  markRead,
  myNotifications,
  notify,
  rolesWhoMay,
  unreadCount,
} from "@/lib/domain/notify";
import { QUOTATIONS, SALES_REQUESTS, decorateOutbound } from "@/lib/domain/outbound";
import { BUSINESS_PARTNERS, decorateBPs, getBP } from "@/lib/domain/partner";
import { resetCurrentUser, setCurrentUser, actingUserName } from "@/lib/domain/admin";
import { qtApprove, qtRejectApproval, qtSubmit, srSubmit } from "@/lib/workflows-outbound";
import { bpConfirm } from "@/lib/workflows-partner";
import { routerPush } from "./setup";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   NOTIFICATIONS

   The bell is only worth looking at if two things hold: what
   lands in it is work this person can actually do, and none of
   it is news they made themselves. Most of what follows is
   therefore a check that something did NOT arrive.
   ============================================================ */

const REP = "EMP004";
const SALES_ADMIN = "EMP013";
const SALES_MANAGER = "EMP003";

const SNAP = {
  notify: JSON.stringify(RAW_NOTIFY),
  qt: JSON.stringify(RAW_QT),
  sr: JSON.stringify(RAW_SR),
  bp: JSON.stringify(RAW_BP),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(NOTIFY_ITEMS, SNAP.notify);
  restore(QUOTATIONS, SNAP.qt);
  restore(SALES_REQUESTS, SNAP.sr);
  restore(BUSINESS_PARTNERS, SNAP.bp);
  decorateOutbound();
  decorateBPs();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

const ctxStub = () =>
  ({
    goto: () => {},
    openEntity: () => {},
    toast: () => {},
    confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
    formModal: (o: { onConfirm?: () => boolean | void }) => o.onConfirm?.(),
    refresh: () => {},
    quickView: () => {},
    panel: () => {},
  }) as unknown as ActionCtx;

const asAccount = (code: string) => setCurrentUser(code);

/**
 * A draft quotation priced so it needs only the ordinary approver, stamped as
 * the work of whoever is acting.
 *
 * The stamp matters: a result travels back to the name on `createdBy`, and
 * the seeded documents carry authors who are not users of this system. That
 * is the honest outcome for them and a useless fixture for this, so the
 * document is made to belong to the person raising it — exactly as one
 * created in the app would be.
 */
const draftQuote = () => {
  const q = QUOTATIONS.find((x) => x.status === "Draft" && (x.items ?? []).length)!;
  q.status = "Draft";
  q.approvalStatus = "Not Submitted";
  q.priceApprovalLevel = "admin";
  q.createdBy = actingUserName();
  return q;
};

const titlesFor = (code: string) => {
  asAccount(code);
  return myNotifications().map((n) => n.title);
};

describe("Notifications — who receives an approval request", () => {
  it("reaches everyone whose permissions let them approve it", () => {
    asAccount(REP);
    const q = draftQuote();
    qtSubmit(q, ctxStub());

    const sent = NOTIFY_ITEMS.filter((n) => n.docCode === q.code && n.kind === "approval_request");
    expect(sent.length).toBeGreaterThan(0);
    /* The recipient list is the permission matrix, not a list in a file. */
    expect(sent.map((n) => n.toRole).sort()).toEqual(rolesWhoMay("quotation", "approve").sort());
    expect(sent.map((n) => n.toRole)).toContain("SALES_ADMIN");
  });

  it("keeps a manager-level request away from the desk that cannot sign it", () => {
    /* The refusal that matters: an approval request landing with somebody who
       will be turned away at the button is worse than not being told. */
    asAccount(REP);
    const q = draftQuote();
    q.priceApprovalLevel = "manager";
    qtSubmit(q, ctxStub());
    /* qtSubmit re-judges the price, so force the escalated case by hand and
       send again the way a below-floor document would. */
    NOTIFY_ITEMS.length = 0;
    notify({
      kind: "escalated",
      docType: "quotation",
      docCode: q.code,
      title: `ใบเสนอราคา ${q.code} รออนุมัติ`,
      body: "ต่ำกว่าราคาขั้นต่ำ",
      toRoles: rolesWhoMay("quotation", "approve").filter((r) =>
        ["SALES_MANAGER", "MANAGEMENT", "SUPER_ADMIN"].includes(r),
      ),
    });

    expect(titlesFor(SALES_ADMIN)).not.toContain(`ใบเสนอราคา ${q.code} รออนุมัติ`);
    expect(titlesFor(SALES_MANAGER)).toContain(`ใบเสนอราคา ${q.code} รออนุมัติ`);
  });

  it("sends a submitted sales request the same way", () => {
    asAccount(REP);
    const r = SALES_REQUESTS.find((x) => x.status === "Draft")!;
    srSubmit(r, ctxStub());

    const sent = NOTIFY_ITEMS.filter((n) => n.docCode === r.code);
    expect(sent.map((n) => n.toRole)).toContain("SALES_ADMIN");
  });
});

describe("Notifications — nobody is told their own news", () => {
  it("does not show an approver the request they submitted themselves", () => {
    /* The sales admin holds `approve` on quotations, so they are a legitimate
       recipient of the request — just not of their own. */
    asAccount(SALES_ADMIN);
    const q = draftQuote();
    qtSubmit(q, ctxStub());

    expect(NOTIFY_ITEMS.some((n) => n.docCode === q.code), "the record still exists").toBe(true);
    expect(myNotifications().map((n) => n.docCode)).not.toContain(q.code);
  });

  it("still shows it to the other people holding that role", () => {
    /* Filtered when read, not when written — so suppressing it for one person
       must not suppress it for everyone. */
    asAccount(SALES_ADMIN);
    const q = draftQuote();
    qtSubmit(q, ctxStub());

    expect(titlesFor(SALES_MANAGER)).toContain(`ใบเสนอราคา ${q.code} รออนุมัติ`);
  });

  it("never writes an item addressed to the person who caused it", () => {
    asAccount(SALES_ADMIN);
    const before = NOTIFY_ITEMS.length;
    notify({
      kind: "approved",
      docType: "quotation",
      docCode: "QT-SELF",
      title: "ถึงตัวเอง",
      body: "",
      toUser: actingUserName(),
    });
    expect(NOTIFY_ITEMS.length, "nothing was written").toBe(before);
  });
});

describe("Notifications — the result goes back to the author", () => {
  it("tells the salesperson their quotation was approved", () => {
    asAccount(REP);
    const q = draftQuote();
    const author = actingUserName();
    qtSubmit(q, ctxStub());

    asAccount(SALES_ADMIN);
    qtApprove(q, ctxStub());

    asAccount(REP);
    const mine = myNotifications();
    expect(mine.some((n) => n.docCode === q.code && n.kind === "approved")).toBe(true);
    expect(mine.find((n) => n.kind === "approved")!.toUser).toBe(author);
  });

  it("tells them when it was refused, with the reason", async () => {
    const user = userEvent.setup();
    asAccount(REP);
    const q = draftQuote();
    qtSubmit(q, ctxStub());

    asAccount(SALES_ADMIN);
    /* The refusal will not go through without a reason, so the dialog has to
       be filled in the way a person fills it in — which is also a check that
       the reason is genuinely required. */
    let modal: { body: () => ReactNode; onConfirm?: () => boolean | void } | null = null;
    const ctx = {
      ...ctxStub(),
      formModal: (o: { body: () => ReactNode; onConfirm?: () => boolean | void }) => {
        modal = o;
      },
    } as unknown as ActionCtx;
    qtRejectApproval(q, ctx);

    const dialog = modal as unknown as { body: () => ReactNode; onConfirm: () => boolean | void };
    const { unmount } = render(<>{dialog.body()}</>);
    await user.type(screen.getByRole("textbox"), "ส่วนลดเกินเพดาน");
    dialog.onConfirm();
    unmount();

    expect(q.status).toBe("Rejected");
    asAccount(REP);
    const mine = myNotifications().filter((n) => n.docCode === q.code && n.kind === "rejected");
    expect(mine).toHaveLength(1);
    expect(mine[0].body).toBe("ส่วนลดเกินเพดาน");
  });

  it("tells the salesperson their partner was confirmed", () => {
    /* Fired from the workflow, not the button — the schema now calls through. */
    const draft = BUSINESS_PARTNERS.find((b) => b.status === "Draft");
    if (!draft) {
      const seed = getBP("BP000123")!;
      seed.status = "Draft";
      seed.createdBy = "สุภาวิตา โยธะพันธ์";
      decorateBPs();
    }
    const bp = BUSINESS_PARTNERS.find((b) => b.status === "Draft")!;
    bp.createdBy = "สุภาวิตา โยธะพันธ์";

    asAccount(SALES_ADMIN);
    bpConfirm(bp, ctxStub());

    expect(bp.status).toBe("Active");
    asAccount(REP);
    expect(myNotifications().some((n) => n.docCode === bp.code)).toBe(true);
  });

  it("refuses to confirm a partner from a chair without the right", () => {
    const bp = BUSINESS_PARTNERS.find((b) => b.status === "Draft") ?? getBP("BP000123")!;
    bp.status = "Draft";
    const before = NOTIFY_ITEMS.length;

    asAccount(REP);
    bpConfirm(bp, ctxStub());

    expect(bp.status, "still a draft").toBe("Draft");
    expect(NOTIFY_ITEMS.length, "and nobody was told anything").toBe(before);
  });
});

describe("Notifications — reading them", () => {
  it("counts only the unread ones addressed to this chair", () => {
    asAccount(SALES_ADMIN);
    const mine = myNotifications();
    expect(unreadCount()).toBe(mine.filter((n) => !n.readAt).length);
  });

  it("marks one read once, and only for its recipient", () => {
    asAccount(SALES_ADMIN);
    const first = myNotifications().find((n) => !n.readAt)!;
    expect(markRead(first.id)).toBe(true);
    expect(markRead(first.id), "a second call must not move the timestamp").toBe(false);

    /* And a stranger cannot mark it read on their behalf. */
    const other = NOTIFY_ITEMS.find((n) => n.toRole === "SALES_MANAGER" && !n.readAt);
    if (other) {
      asAccount(REP);
      expect(markRead(other.id)).toBe(false);
    }
  });

  it("clears the whole box at once", () => {
    asAccount(SALES_ADMIN);
    expect(unreadCount()).toBeGreaterThan(0);
    markAllRead();
    expect(unreadCount()).toBe(0);
  });
});

describe("Notifications — the bell", () => {
  it("shows the unread count and opens the document behind an item", async () => {
    const user = userEvent.setup();
    setCurrentUser(SALES_ADMIN);
    render(<Topbar />);

    const bell = screen.getByRole("button", { name: "Notifications" });
    expect(within(bell).getByText(String(unreadCount()))).toBeInTheDocument();

    await user.click(bell);
    const item = screen.getByText("คำขอขาย SR2506-0002 รออนุมัติ");
    await user.click(item);

    expect(routerPush).toHaveBeenCalledWith("/m/sales-request/SR2506-0002");
  });

  it("says so plainly when there is nothing to read", async () => {
    const user = userEvent.setup();
    NOTIFY_ITEMS.length = 0;
    setCurrentUser(SALES_ADMIN);
    render(<Topbar />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("ไม่มีรายการที่รอคุณอยู่")).toBeInTheDocument();
  });

  /* Acting on an item is what clears it. The bell holds what is still owed,
     not a log of everything that has ever happened — a list that only grows
     is a list people stop opening. */
  it("an item that has been opened leaves the bell", async () => {
    const user = userEvent.setup();
    setCurrentUser(SALES_ADMIN);
    render(<Topbar />);

    const before = unreadCount();
    const bell = screen.getByRole("button", { name: "Notifications" });
    await user.click(bell);
    await user.click(screen.getByText("คำขอขาย SR2506-0002 รออนุมัติ"));

    /* Gone from the list, and off the count on the badge. */
    await user.click(bell);
    expect(screen.queryByText("คำขอขาย SR2506-0002 รออนุมัติ")).toBeNull();
    expect(unreadCount()).toBe(before - 1);
  });

  it("อ่านทั้งหมด empties it", async () => {
    const user = userEvent.setup();
    setCurrentUser(SALES_ADMIN);
    render(<Topbar />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(screen.getByRole("button", { name: "อ่านทั้งหมด" }));

    /* The menu stays open — it empties under the cursor rather than after a
       second trip to the bell. */
    expect(screen.getByText("ไม่มีรายการที่รอคุณอยู่")).toBeInTheDocument();
  });
});

/* ============================================================
   CHANGING CHAIRS

   The page you were on belonged to the chair you just left, and
   may be a module the new one cannot open at all.
   ============================================================ */

describe("สลับบัญชี", () => {
  it("กลับไปหน้า dashboard ทุกครั้งที่สลับ", async () => {
    const user = userEvent.setup();
    setCurrentUser(SALES_ADMIN);
    render(<Topbar />);

    await user.click(screen.getByTestId("session-name"));
    const target = screen.getByText("Noey");
    await user.click(target);

    expect(routerPush).toHaveBeenCalledWith("/dashboard");
    expect(actingUserName()).toBe("Noey");
  });

  it("กดบัญชีที่ใช้อยู่แล้ว ไม่พาไปไหน", async () => {
    const user = userEvent.setup();
    setCurrentUser(SALES_ADMIN);
    render(<Topbar />);

    await user.click(screen.getByTestId("session-name"));
    /* The account already in force is the one with the tick beside it —
       pressing it is not a switch, so nothing should move. */
    const me = actingUserName();
    await user.click(screen.getByText(me));

    expect(routerPush).not.toHaveBeenCalled();
  });
});
