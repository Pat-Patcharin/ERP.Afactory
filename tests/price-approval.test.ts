import { beforeEach, describe, expect, it } from "vitest";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { QUOTATIONS } from "@/lib/domain/outbound";
import { priceApproval, blankLine } from "@/lib/domain/doc-draft";
import { priceMasterRows } from "@/lib/domain/price-master";
import { qtApprove, qtSubmit } from "@/lib/workflows-outbound";
import { USERS } from "@/data/admin";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   PRICE APPROVAL

   CLAUDE.md has always stated the rule — nothing sells below
   `price_last` without approval — and `checkQuotedPrice()` has
   always implemented it. Nothing called it, so the rule was a
   sentence in a document rather than something the software did.
   These tests are what keep the two connected.

   No rule is restated here either: the expectations are written
   against real rows taken from the price master.
   ============================================================ */

const QT_SNAP = JSON.stringify(RAW_QT);

beforeEach(() => {
  QUOTATIONS.length = 0;
  QUOTATIONS.push(...(JSON.parse(QT_SNAP) as never[]));
  resetCurrentUser();
});

/** A real row that can actually be judged: it has both a cost and a floor. */
const priced = () =>
  priceMasterRows().find((r) => r.status === "OK" && r.price_last && r.cost_thb)!;

/**
 * A real row with no cost — the case that blocks rather than escalates.
 *
 * It has to carry a product code as well: only 5 of the 56 costless rows do,
 * and a row without one can never be looked up from a document line.
 */
const costless = () => priceMasterRows().find((r) => !r.cost_thb && r.product_code)!;

const line = (code: string, price: number, disc = 0) => ({
  ...blankLine(),
  code,
  name: code,
  qty: 1,
  price,
  disc,
});

describe("priceApproval — who has to sign", () => {
  it("asks only for the ordinary approver when every line is at or above its floor", () => {
    const row = priced();
    const plan = priceApproval([line(row.product_code, row.price_last!)]);

    expect(plan.level).toBe("admin");
    expect(plan.flagged).toEqual([]);
    expect(plan.noCost).toEqual([]);
    expect(plan.uncheckable).toEqual([]);
  });

  it("escalates to the manager when a line is below its floor", () => {
    const row = priced();
    const plan = priceApproval([line(row.product_code, row.price_last! - 1)]);

    expect(plan.level).toBe("manager");
    expect(plan.flagged).toHaveLength(1);
    expect(plan.flagged[0].code).toBe(row.product_code);
    expect(plan.flagged[0].floor).toBe(row.price_last);
    expect(plan.flagged[0].reasons.join(" ")).toContain("ต้องขออนุมัติ");
  });

  it("judges the price AFTER the discount, not the list price", () => {
    /* The rule collapses otherwise: quote high, discount hard, and the floor
       is never breached on paper. */
    const row = priced();
    const list = row.price_last! * 2;

    expect(priceApproval([line(row.product_code, list, 0)]).level).toBe("admin");
    expect(priceApproval([line(row.product_code, list, 60)]).level).toBe("manager");
  });

  it("records the net price it actually judged", () => {
    /* Only lines with something to report are listed, so this has to be one
       that fails: 100 less 25% is 75, under every floor in the master. */
    const row = priced();
    const plan = priceApproval([line(row.product_code, 100, 25)]);

    expect(plan.flagged).toHaveLength(1);
    expect(plan.flagged[0].quoted, "net of the discount, not the 100 typed").toBe(75);
  });

  it("blocks rather than escalates when the product has no cost", () => {
    const row = costless();
    const plan = priceApproval([line(row.product_code, 100)]);

    expect(plan.noCost).toHaveLength(1);
    expect(plan.noCost[0].code).toBe(row.product_code);
    /* Not flagged: nobody can judge a price whose cost is unknown. */
    expect(plan.flagged).toEqual([]);
  });

  it("counts a product with no price master row as unchecked, and does not block it", () => {
    const plan = priceApproval([line("NOT-IN-THE-MASTER", 1)]);

    expect(plan.uncheckable).toHaveLength(1);
    expect(plan.level, "a new product must still be sellable").toBe("admin");
    expect(plan.noCost).toEqual([]);
  });

  it("ignores blank lines", () => {
    const plan = priceApproval([{ ...blankLine(), code: "", price: 1 }]);
    expect(plan.uncheckable).toEqual([]);
    expect(plan.level).toBe("admin");
  });
});

/* ============================================================
   Submitting and approving
   ============================================================ */

function ctxStub() {
  const toasts: { title: string; message?: string; tone?: string }[] = [];
  return {
    toasts,
    ctx: {
      goto: () => {},
      openEntity: () => {},
      toast: (title: string, message?: string, tone?: string) =>
        toasts.push({ title, message, tone }),
      confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
      formModal: () => {},
      refresh: () => {},
      quickView: () => {},
      panel: () => {},
    } as never,
  };
}

describe("qtSubmit — the price decides what the document asks for", () => {
  const draftQuote = () => {
    const q = QUOTATIONS.find((x) => x.code === "QT2507-0006")!;
    q.status = "Draft";
    q.approvalStatus = "Not Submitted";
    q.priceApprovalLevel = "admin";
    q.uncheckedPriceLines = 0;
    return q;
  };

  it("freezes the level as manager when a line is under the floor", () => {
    const row = priced();
    const q = draftQuote();
    q.items = [
      { ...q.items[0], code: row.product_code, qty: 1, price: row.price_last! - 1, disc: 0 },
    ];
    const { ctx } = ctxStub();

    qtSubmit(q as never, ctx);

    expect(q.status).toBe("Pending Approval");
    expect(q.priceApprovalLevel).toBe("manager");
  });

  it("refuses to submit at all when a line has no cost, and says where to fix it", () => {
    const row = costless();
    const q = draftQuote();
    q.items = [{ ...q.items[0], code: row.product_code, qty: 1, price: 100, disc: 0 }];
    const { toasts, ctx } = ctxStub();

    qtSubmit(q as never, ctx);

    expect(q.status, "still a draft").toBe("Draft");
    expect(toasts[0].tone).toBe("danger");
    expect(toasts[0].message).toContain("ทะเบียนสินค้า");
  });

  it("carries the unchecked count onto the document for the approver", () => {
    const q = draftQuote();
    q.items = [{ ...q.items[0], code: "NOT-IN-THE-MASTER", qty: 1, price: 100, disc: 0 }];
    const { ctx } = ctxStub();

    qtSubmit(q as never, ctx);

    expect(q.status).toBe("Pending Approval");
    expect(q.uncheckedPriceLines).toBe(1);
    expect(q.priceApprovalLevel).toBe("admin");
  });
});

describe("qtApprove — the level the document asked for is enforced", () => {
  const asRole = (roleCode: string) =>
    setCurrentUser(USERS.find((u) => u.roleCode === roleCode && u.status === "Active")!.code);

  const pending = (level: string) => {
    const q = QUOTATIONS.find((x) => x.code === "QT2507-0006")!;
    q.status = "Pending Approval";
    q.approvalStatus = "Pending Approval";
    q.priceApprovalLevel = level;
    return q;
  };

  it("lets the sales manager approve a manager-level quotation", () => {
    asRole("SALES_MANAGER");
    const q = pending("manager");
    const { ctx } = ctxStub();

    qtApprove(q as never, ctx);
    expect(q.status).toBe("Approved");
  });

  it("lets management approve one too, since that role clears every level", () => {
    asRole("MANAGEMENT");
    const q = pending("manager");
    const { ctx } = ctxStub();

    qtApprove(q as never, ctx);
    expect(q.status).toBe("Approved");
  });

  it("still lets an approver sign an ordinary quotation", () => {
    asRole("SALES_MANAGER");
    const q = pending("admin");
    const { ctx } = ctxStub();

    qtApprove(q as never, ctx);
    expect(q.status).toBe("Approved");
  });

  it("refuses a sales rep outright — they never had approve rights", () => {
    asRole("SALES_REP");
    const q = pending("admin");
    const { toasts, ctx } = ctxStub();

    qtApprove(q as never, ctx);
    expect(q.status).toBe("Pending Approval");
    expect(toasts[0].tone).toBe("danger");
  });
});
