import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { PICKING_TASKS as RAW_PICK } from "@/data/picking";
import { NOTIFY_ITEMS as RAW_NOTIFY } from "@/data/notifications";
import { PICKING_TASKS, SALES_ORDERS, decorateOutbound, type SoRow } from "@/lib/domain/outbound";
import { BUSINESS_PARTNERS } from "@/lib/domain/partner";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { NOTIFY_ITEMS, myNotifications } from "@/lib/domain/notify";
import { actingUserName, resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { pickComplete, soConfirm, soShortLines } from "@/lib/workflows-outbound";
import { pickSchemas } from "@/schemas/picking";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   NOT ENOUGH STOCK

   The order used to learn it at the loading bay. It learns it at
   confirmation now, while somebody is still holding the paperwork
   and the customer is still reachable — and a short pick moves
   the order the moment the picker closes the sheet, not when a
   lorry comes back.

   A shortage has three honest answers, so most of what follows
   checks that the software does not quietly pick one.
   ============================================================ */

const REP = "EMP004";
const SALES_ADMIN = "EMP013";

const SNAP = {
  so: JSON.stringify(RAW_SO),
  pick: JSON.stringify(RAW_PICK),
  notify: JSON.stringify(RAW_NOTIFY),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(SALES_ORDERS, SNAP.so);
  restore(PICKING_TASKS, SNAP.pick);
  restore(NOTIFY_ITEMS, SNAP.notify);
  decorateOutbound();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

function stub() {
  const toasts: { title: string; tone?: string }[] = [];
  let modal: { body: () => ReactNode; onConfirm?: () => boolean | void } | null = null;
  return {
    toasts,
    getModal: () => modal as unknown as { body: () => ReactNode; onConfirm: () => boolean | void },
    ctx: {
      goto: () => {},
      openEntity: () => {},
      toast: (title: string, _m?: unknown, tone?: string) => toasts.push({ title, tone }),
      confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
      formModal: (o: { body: () => ReactNode; onConfirm?: () => boolean | void }) => {
        modal = o;
      },
      refresh: () => {},
      quickView: () => {},
      panel: () => {},
    } as unknown as ActionCtx,
  };
}

/**
 * An order the warehouse cannot fill, raised by the rep.
 *
 * Built from a real product so `availabilityFor` has something to answer
 * with, and ordered well past what is on the shelf.
 */
function shortOrder(): { so: SoRow; shortBy: number } {
  const product = PRODUCTS.find((p) => (productStock(p.code)?.available ?? 0) > 0)!;
  const available = productStock(product.code)!.available;
  const so = SALES_ORDERS.find((s) => s.status === "Confirmed" || s.status === "Draft")!;

  so.status = "Draft";
  so.creditApproved = true;
  so.createdBy = "สุภาวิตา โยธะพันธ์";
  so.items = [
    {
      code: product.code,
      name: product.name,
      unit: product.unit,
      qty: available + 10,
      price: 100,
      disc: 0,
      tax: 7,
      picked: 0,
      delivered: 0,
      note: "",
    },
  ] as SoRow["items"];
  decorateOutbound();
  return { so, shortBy: 10 };
}

/** Answer the shortage dialog by picking one of its three radio buttons. */
async function answerShortage(
  modal: { body: () => ReactNode; onConfirm: () => boolean | void },
  choice: string,
  who?: string,
) {
  const user = userEvent.setup();
  const { unmount } = render(<>{modal.body()}</>);
  await user.click(screen.getByRole("radio", { name: new RegExp(choice) }));
  /* An empty string is the "left it blank" case, and userEvent will not type
     one — the field simply stays as it was. */
  if (who) await user.type(screen.getByRole("textbox"), who);
  const result = modal.onConfirm();
  unmount();
  return result;
}

describe("soConfirm — the shortage is a question, not a warning", () => {
  it("says nothing when the warehouse can cover the order", () => {
    const { ctx, getModal } = stub();
    const so = SALES_ORDERS.find((s) => s.status === "Draft") ?? SALES_ORDERS[0];
    so.status = "Draft";
    so.creditApproved = true;
    so.items = [];
    decorateOutbound();

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);

    expect(getModal(), "no dialog for an order with nothing short").toBeFalsy();
    expect(so.status).toBe("Confirmed");
  });

  it("lists every short line with how far short it is", () => {
    const { so, shortBy } = shortOrder();
    const short = soShortLines(so);

    expect(short).toHaveLength(1);
    expect(short[0].shortBy).toBe(shortBy);
    expect(short[0].ordered).toBe(so.items[0].qty);
  });

  it("opens as a back order without changing what was ordered", async () => {
    const { so } = shortOrder();
    const ordered = so.items[0].qty;
    const { ctx, getModal } = stub();

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);
    await answerShortage(getModal(), "เปิดเป็นของค้างส่ง");

    expect(so.status).toBe("Confirmed");
    expect(so.items[0].qty, "the customer still asked for all of it").toBe(ordered);
  });

  it("refuses to cut the shortfall without naming who agreed to it", async () => {
    /* The refusal that matters. Cutting a line is a change to what was agreed
       with the customer, and one nobody can name later is indistinguishable
       from the warehouse quietly shipping less. */
    const { so } = shortOrder();
    const ordered = so.items[0].qty;
    const { ctx, getModal, toasts } = stub();

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);
    const result = await answerShortage(getModal(), "ยกเลิกส่วนที่ขาด", "");

    expect(result, "the dialog stays open").toBe(false);
    expect(so.status, "and nothing was confirmed").toBe("Draft");
    expect(so.items[0].qty).toBe(ordered);
    expect(toasts[toasts.length - 1].tone).toBe("danger");
  });

  it("cuts to what is available once somebody is named, and records them", async () => {
    const { so } = shortOrder();
    const available = soShortLines(so)[0].available;
    const { ctx, getModal } = stub();

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);
    await answerShortage(getModal(), "ยกเลิกส่วนที่ขาด", "คุณสมหญิง ฝ่ายจัดซื้อ");

    expect(so.status).toBe("Confirmed");
    expect(so.items[0].qty).toBe(available);
    expect(so.remark, "who agreed, and when").toContain("คุณสมหญิง ฝ่ายจัดซื้อ");
    expect(so.history[0].d).toContain("คุณสมหญิง ฝ่ายจัดซื้อ");
  });

  it("cancels the whole order when that is the answer", async () => {
    const { so } = shortOrder();
    const { ctx, getModal } = stub();

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);
    await answerShortage(getModal(), "ยกเลิกทั้งใบ");

    expect(so.status).toBe("Cancelled");
  });

  it("tells the salesperson whenever their order was changed or killed", async () => {
    const { so } = shortOrder();
    const { ctx, getModal } = stub();

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);
    await answerShortage(getModal(), "ยกเลิกทั้งใบ");

    setCurrentUser(REP);
    expect(myNotifications().some((n) => n.docCode === so.code)).toBe(true);
  });

  it("does not bother the salesperson when nothing about their order changed", async () => {
    /* A back order leaves the document exactly as they wrote it. */
    const { so } = shortOrder();
    const { ctx, getModal } = stub();
    const before = NOTIFY_ITEMS.length;

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);
    await answerShortage(getModal(), "เปิดเป็นของค้างส่ง");

    expect(NOTIFY_ITEMS.length).toBe(before);
  });

  it("still stops at the credit wall before asking about stock", () => {
    /* Order of business: an order that cannot be afforded is not an order
       whose stock is worth discussing. */
    const { so } = shortOrder();
    /* A customer who trades on credit at all — a cash-only one has no limit
       to breach, so there would be no wall to stop at. */
    const bp = BUSINESS_PARTNERS.find((b) => Number(b.credit?.limit) > 0)!;
    so.customerCode = bp.code;
    so.customer = bp.nameTh;
    so.creditApproved = false;
    so.items[0].price = 9_000_000;
    decorateOutbound();
    const { ctx, getModal } = stub();

    setCurrentUser(SALES_ADMIN);
    soConfirm(so, ctx);

    expect(so.status).toBe("On Hold");
    expect(getModal(), "the stock question never came up").toBeFalsy();
  });
});

describe("pickComplete — a short pick moves the order at once", () => {
  /** A pick against a real order, short by design. */
  const shortPick = () => {
    const { so } = shortOrder();
    so.status = "Picking";
    const task = PICKING_TASKS[0];
    task.soRef = so.code;
    task.status = "In Progress";
    task.items = [
      {
        line: 1,
        code: so.items[0].code,
        name: so.items[0].name,
        unit: so.items[0].unit,
        lot: "",
        ordered: so.items[0].qty,
        picked: 1,
        bin: "",
        status: "Pending",
        note: "",
      },
    ] as (typeof task)["items"];
    decorateOutbound();
    return { so, task };
  };

  it("marks the order partial the moment the sheet is closed", () => {
    const { so, task } = shortPick();
    const { ctx } = stub();

    setCurrentUser(SALES_ADMIN);
    pickComplete(task, ctx);

    expect(task.status).toBe("Completed");
    expect(so.status, "before the lorry, not after").toBe("Partially Delivered");
    /* Nothing has actually been delivered — the quantities stay honest even
       though the status has moved early. */
    expect(so.items[0].delivered).toBe(0);
  });

  it("tells the salesperson who raised it, with the shortfall", () => {
    const { so, task } = shortPick();
    const { ctx } = stub();

    setCurrentUser(SALES_ADMIN);
    pickComplete(task, ctx);

    setCurrentUser(REP);
    const mine = myNotifications().filter((n) => n.docCode === so.code);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toContain("หยิบของไม่ครบ");
  });

  it("leaves a full pick alone", () => {
    const { so, task } = shortPick();
    task.items[0].picked = task.items[0].ordered;
    decorateOutbound();
    const { ctx } = stub();
    const before = NOTIFY_ITEMS.length;

    setCurrentUser(SALES_ADMIN);
    pickComplete(task, ctx);

    expect(so.status, "nothing is partial about it").toBe("Picking");
    expect(NOTIFY_ITEMS.length, "and nobody needed telling").toBe(before);
  });

  it("does not overwrite an order somebody already cancelled", () => {
    const { so, task } = shortPick();
    so.status = "Cancelled";
    const { ctx } = stub();

    setCurrentUser(SALES_ADMIN);
    pickComplete(task, ctx);

    expect(so.status).toBe("Cancelled");
  });
});

describe("Picking — stock is not corrected from here", () => {
  it("offers no way to adjust stock from the picking screen", () => {
    /* A picker who finds five where the system says eight must raise a stock
       adjustment and have it approved. A button here would be an unapproved
       write to inventory dressed up as a convenience. */
    const task = PICKING_TASKS[0];
    const { ctx } = stub();
    const labels = [
      ...pickSchemas.list.rowActions(task, ctx),
      ...(pickSchemas.detail.actions?.(task, ctx) ?? []),
    ].map((a) => a.label ?? "");

    for (const l of labels) {
      expect(l, l).not.toMatch(/ปรับ(ปรุง)?ยอด|Adjust|adjustment/i);
    }
  });

  it("keeps the acting user out of their own notification", () => {
    /* The picker completing a short pick is often the same person who would
       read the box. They are told nothing; the salesperson is. */
    const so = SALES_ORDERS[0];
    so.createdBy = actingUserName();
    expect(myNotifications().some((n) => n.createdBy === actingUserName())).toBe(false);
  });
});
