import { beforeEach, describe, expect, it } from "vitest";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { SALES_REQUESTS as RAW_SR } from "@/data/sales-requests";
import { QUOTATIONS, SALES_REQUESTS, decorateOutbound } from "@/lib/domain/outbound";
import { priceApproval, blankLine } from "@/lib/domain/doc-draft";
import { priceMasterRows } from "@/lib/domain/price-master";
import {
  qtApprove,
  qtSubmit,
  srApprove,
  srReopen,
  srSubmit,
} from "@/lib/workflows-outbound";
import { USERS } from "@/data/admin";
import { can, resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";

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
const SR_SNAP = JSON.stringify(RAW_SR);

beforeEach(() => {
  QUOTATIONS.length = 0;
  QUOTATIONS.push(...(JSON.parse(QT_SNAP) as never[]));
  SALES_REQUESTS.length = 0;
  SALES_REQUESTS.push(...(JSON.parse(SR_SNAP) as never[]));
  decorateOutbound();
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

  /* ------------------------------------------------------------
     The sales admin desk is the reason this level check exists.

     Until it was added, every role holding `approve` on a
     quotation was also in MANAGER_ROLES, so `maySignAt("manager")`
     had never turned anybody away. These two tests are the pair
     that proves it does: the same person, the same document, and
     the answer changes with the level the document asked for.
     ------------------------------------------------------------ */

  it("lets the sales admin approve an ordinary quotation", () => {
    asRole("SALES_ADMIN");
    const q = pending("admin");
    const { ctx } = ctxStub();

    qtApprove(q as never, ctx);
    expect(q.status).toBe("Approved");
  });

  it("refuses the sales admin a price under the floor, and names who can sign", () => {
    asRole("SALES_ADMIN");
    const q = pending("manager");
    const { toasts, ctx } = ctxStub();

    qtApprove(q as never, ctx);

    expect(q.status, "the document must not move").toBe("Pending Approval");
    expect(q.approvalStatus).toBe("Pending Approval");
    expect(toasts[0].tone).toBe("danger");
    /* Refusing without saying where to take it next is how a document sits
       for two days. */
    expect(toasts[0].message).toContain("ผู้จัดการฝ่ายขาย");
  });

  it("refuses on the level, not on the permission — the admin does hold approve", () => {
    /* If the refusal above came from the module gate instead, widening the
       role's permissions later would silently open the floor rule too. */
    asRole("SALES_ADMIN");
    expect(can("quotation", "approve")).toBe(true);
  });
});

/* ============================================================
   THE SAME FLOOR ON THE OTHER ROUTE

   The rule used to live only on the quotation, which made it
   optional: the sales request route exists precisely for the
   customer who never asked for a quotation, and a salesperson
   taking it met no floor at all. These tests are the ones that
   would have caught that.
   ============================================================ */

describe("srSubmit / srApprove — the floor holds without a quotation", () => {
  const asRole = (roleCode: string) =>
    setCurrentUser(USERS.find((u) => u.roleCode === roleCode && u.status === "Active")!.code);

  const draftRequest = () => {
    const r = SALES_REQUESTS.find((x) => x.status === "Draft")!;
    r.status = "Draft";
    r.priceApprovalLevel = "admin";
    r.uncheckedPriceLines = 0;
    return r;
  };

  const priceLine = (code: string, price: number) => ({
    code,
    name: code,
    unit: "ea",
    qty: 1,
    price,
    disc: 0,
    tax: 7,
    note: "",
  });

  it("escalates a request priced under the floor, exactly as a quotation does", () => {
    const row = priced();
    const r = draftRequest();
    r.items = [priceLine(row.product_code, row.price_last! - 1)];
    const { ctx } = ctxStub();

    srSubmit(r as never, ctx);

    expect(r.status).toBe("Submitted");
    expect(r.priceApprovalLevel).toBe("manager");
  });

  it("leaves an ordinary request at the level the admin can sign", () => {
    const row = priced();
    const r = draftRequest();
    r.items = [priceLine(row.product_code, row.price_last!)];
    const { ctx } = ctxStub();

    srSubmit(r as never, ctx);

    expect(r.status).toBe("Submitted");
    expect(r.priceApprovalLevel).toBe("admin");
  });

  it("refuses to submit a request whose product has no cost", () => {
    const row = costless();
    const r = draftRequest();
    r.items = [priceLine(row.product_code, 100)];
    const { toasts, ctx } = ctxStub();

    srSubmit(r as never, ctx);

    expect(r.status, "still a draft").toBe("Draft");
    expect(toasts[0].tone).toBe("danger");
    expect(toasts[0].message).toContain("ทะเบียนสินค้า");
  });

  it("refuses the sales admin a request priced under the floor", () => {
    const row = priced();
    const r = draftRequest();
    r.items = [priceLine(row.product_code, row.price_last! - 1)];
    const { ctx } = ctxStub();

    asRole("SALES_REP");
    srSubmit(r as never, ctx);

    asRole("SALES_ADMIN");
    const { toasts, ctx: approveCtx } = ctxStub();
    srApprove(r as never, approveCtx);

    expect(r.status, "the request must not move").toBe("Submitted");
    expect(r.approvedBy, "and nobody is recorded as having signed it").toBe("");
    expect(toasts[0].tone).toBe("danger");
    expect(toasts[0].message).toContain("ผู้จัดการฝ่ายขาย");
  });

  it("lets the sales manager sign the same request", () => {
    const row = priced();
    const r = draftRequest();
    r.items = [priceLine(row.product_code, row.price_last! - 1)];
    const { ctx } = ctxStub();

    asRole("SALES_REP");
    srSubmit(r as never, ctx);

    asRole("SALES_MANAGER");
    srApprove(r as never, ctxStub().ctx);

    expect(r.status).toBe("Approved");
  });

  it("judges the request again after it goes back for edits", () => {
    /* The level belonged to the figures that were submitted. Carrying it
       across would let a manager-signed level stick to a document whose
       prices have since been raised — or, worse, lowered. */
    const row = priced();
    const r = draftRequest();
    r.items = [priceLine(row.product_code, row.price_last! - 1)];

    asRole("SALES_REP");
    srSubmit(r as never, ctxStub().ctx);
    expect(r.priceApprovalLevel).toBe("manager");

    asRole("SALES_MANAGER");
    srReopen(r as never, ctxStub().ctx);
    expect(r.status).toBe("Draft");
    expect(r.priceApprovalLevel, "judged again on the way back in").toBe("admin");
  });
});

/* ============================================================
   THE GATE STILL CANNOT REACH THE DEMO DATA

   Backlog item 11. The documents carry product codes from one
   space (`AA-TH003-WL`) and the 807-row price master from
   another (`D-AD001-01`), so `priceApproval()` resolves nothing
   and every seeded quotation comes out `level: "admin"` with
   its whole line count uncheckable.

   Everything above this block proves the rule works when the
   codes DO line up, because those tests build their lines from
   `priceMasterRows()`. None of them can notice that no real
   document reaches the rule at all.

   *** THIS TEST GOING RED IS GOOD NEWS. ***

   It fails on the day a document line resolves to a price-master
   row — which is the day the floor starts biting real data and
   item 11 can close. Do not "fix" it back to green: read the
   backlog entry, confirm the code spaces were genuinely joined,
   then delete this block and close the item.
   ============================================================ */

describe("Item 11 — the seeded documents cannot reach the price master", () => {
  it("resolves no quotation line, and therefore flags none", () => {
    let lines = 0;
    let uncheckable = 0;
    let flagged = 0;

    for (const q of QUOTATIONS) {
      const items = (q.items ?? []) as never[];
      if (!items.length) continue;
      const plan = priceApproval(items);
      lines += items.length;
      uncheckable += plan.uncheckable.length;
      flagged += plan.flagged.length;
    }

    expect(lines, "the seed must still carry priced quotations").toBeGreaterThan(0);
    expect(
      uncheckable,
      "every line unresolved — see the note above; red here means item 11 is fixed",
    ).toBe(lines);
    expect(flagged, "so nothing can ever be escalated from seeded data").toBe(0);
  });

  it("names the two code spaces that do not meet", () => {
    /* Pinned so the failure above is self-explaining rather than a bare
       number: whoever sees it red can tell at once which side moved. */
    const docCode = String((QUOTATIONS.find((q) => q.items?.length)?.items ?? [])[0]?.code ?? "");
    const masterCodes = priceMasterRows().map((r) => r.product_code);

    expect(docCode, "documents use the AA-/AB-/AT- space").toMatch(/^A[A-Z]-/);
    expect(
      masterCodes.includes(docCode),
      `${docCode} is absent from the price master — the whole of item 11`,
    ).toBe(false);
  });
});
