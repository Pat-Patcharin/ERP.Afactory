import { beforeEach, describe, expect, it } from "vitest";
import { BP_SELLABLE_STATUS, BP_STATUS, BUSINESS_PARTNERS as RAW_BP } from "@/data/partners";
import { USERS } from "@/data/admin";
import { BP_TONE } from "@/lib/badges";
import { BUSINESS_PARTNERS, decorateBPs } from "@/lib/domain/partner";
import { blockedForDraftPartner } from "@/lib/domain/outbound";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { getSchemas } from "@/schemas/registry";

/* ============================================================
   A PARTNER NOBODY HAS CHECKED YET

   A salesperson can raise a partner and quote against it the
   same afternoon. What they cannot do is raise a Sales Order:
   that is the document that binds the company and feeds an
   invoice carrying a tax ID nobody has verified.

   The guard is at the write, not on the button — a hidden button
   is a courtesy, and this has to hold for a stale tab too.
   ============================================================ */

const BP_SNAP = JSON.stringify(RAW_BP);

beforeEach(() => {
  BUSINESS_PARTNERS.length = 0;
  BUSINESS_PARTNERS.push(...(JSON.parse(BP_SNAP) as never[]));
  decorateBPs();
  resetCurrentUser();
});

const asRole = (roleCode: string) =>
  setCurrentUser(USERS.find((u) => u.roleCode === roleCode && u.status === "Active")!.code);

const anyPartner = () => BUSINESS_PARTNERS[0];

describe("Draft is a real status, not just a colour", () => {
  it("is in the status list", () => {
    /* BP_TONE carried a colour for Draft long before the status existed —
       the mirror of the QT_STATUS problem, and fixed the same way. */
    expect(BP_STATUS).toContain("Draft");
  });

  it("has a tone, like every other status", () => {
    for (const s of BP_STATUS) {
      expect(BP_TONE[s], s).toBeTruthy();
    }
  });

  it("is not a status a partner can be sold to", () => {
    expect(BP_SELLABLE_STATUS).toEqual(["Active"]);
    expect(BP_SELLABLE_STATUS).not.toContain("Draft");
  });
});

describe("blockedForDraftPartner", () => {
  it("lets an Active partner through", () => {
    const bp = anyPartner();
    bp.status = "Active";
    expect(blockedForDraftPartner(bp.code)).toBeNull();
  });

  it("stops a Draft partner and says what can be done instead", () => {
    const bp = anyPartner();
    bp.status = "Draft";
    const msg = blockedForDraftPartner(bp.code)!;

    expect(msg).toContain(bp.code);
    expect(msg, "the way out, not only the refusal").toContain("ใบเสนอราคา");
    expect(msg).toContain("คำขอขาย");
  });

  it("stops the other non-sellable statuses too, naming the status", () => {
    const bp = anyPartner();
    for (const status of ["Inactive", "On Hold", "Blocked"]) {
      bp.status = status;
      const msg = blockedForDraftPartner(bp.code)!;
      expect(msg, status).toContain(status);
    }
  });

  it("says nothing about a partner it cannot find", () => {
    /* An order for a partner that is not in the master has a different
       problem, and this is not the function that reports it. */
    expect(blockedForDraftPartner("BP-NOPE")).toBeNull();
    expect(blockedForDraftPartner("")).toBeNull();
  });
});

describe("Who raises a partner as a Draft", () => {
  const blank = () => getSchemas("business-partner")!.form!.blank!();

  it("makes a salesperson's new partner a Draft", () => {
    asRole("SALES_REP");
    expect(blank().status).toBe("Draft");
  });

  it("lets someone who may approve the module raise a live one", () => {
    asRole("MANAGEMENT");
    expect(blank().status).toBe("Active");
  });

  it("keeps the sales manager on Drafts too — they hold no approve here", () => {
    /* Confirming a partner is an administrative act, not a sales one:
       business-partner sits in the Master Data group, where the sales
       manager is view-only. Worth pinning, because "manager" reads like it
       ought to be enough and is not. */
    asRole("SALES_MANAGER");
    expect(blank().status).toBe("Draft");
  });

  it("decides from the permission, not from the role name", () => {
    /* Whoever holds `approve` on the module raises live partners, so adding a
       role later is a change in the matrix and not in the form. */
    for (const role of ["SUPER_ADMIN", "MANAGEMENT"]) {
      asRole(role);
      expect(blank().status, role).toBe("Active");
    }
  });
});

describe("The legal identity locks only once the partner is confirmed", () => {
  const fields = () => {
    const form = getSchemas("business-partner")!.form!;
    return form.steps
      .flatMap((st) =>
        (st.blocks({} as never) ?? []).flatMap((b) =>
          b && "fields" in b ? (b.fields ?? []) : [],
        ),
      )
      .filter((f): f is Exclude<typeof f, false | undefined | null> => Boolean(f));
  };

  /** Is the named path editable in this state, or shown read-only? */
  const editable = (path: string, state: Record<string, unknown>) => {
    const shown = fields().filter(
      (f) => f && f.path === path && (!f.when || f.when(state as never)),
    );
    expect(shown.length, `${path} should render exactly once`).toBe(1);
    return shown[0]!.type !== "static";
  };

  beforeEach(() => asRole("SALES_REP"));

  it("lets a salesperson type the name and tax ID while creating", () => {
    const state = { _mode: "create", status: "Draft", tax: { vatReg: true } };
    expect(editable("nameTh", state)).toBe(true);
    expect(editable("tax.taxId", state)).toBe(true);
  });

  it("still lets them fix a typo while the partner is a Draft", () => {
    /* Locking at the moment of saving turns one typo into an errand, and
       people route around that by raising a second partner. */
    const state = { _mode: "edit", status: "Draft", tax: { vatReg: true } };
    expect(editable("nameTh", state)).toBe(true);
    expect(editable("tax.taxId", state)).toBe(true);
  });

  it("locks both once the partner is confirmed", () => {
    const state = { _mode: "edit", status: "Active", tax: { vatReg: true } };
    expect(editable("nameTh", state)).toBe(false);
    expect(editable("tax.taxId", state)).toBe(false);
  });

  it("locks the legal identity and nothing else", () => {
    /* The rule is about the two fields on the invoice, not about the record:
       a salesperson still maintains the addresses and the phone numbers. */
    const confirmed = { _mode: "edit", status: "Active", tax: { vatReg: true } };
    const locked = fields().filter(
      (f) => f.type === "static" && (!f.when || f.when(confirmed as never)),
    );
    const lockedByThisRule = locked.filter((f) => f.path === "nameTh" || f.path === "tax.taxId");
    expect(lockedByThisRule).toHaveLength(2);

    for (const path of ["trade", "nameEn", "website"]) {
      expect(editable(path, confirmed), path).toBe(true);
    }
  });

  it("lets an approver edit a confirmed partner's identity", () => {
    asRole("MANAGEMENT");
    const state = { _mode: "edit", status: "Active", tax: { vatReg: true } };
    expect(editable("nameTh", state)).toBe(true);
  });
});

describe("The list puts pending partners where an administrator will see them", () => {
  it("offers a tab of its own, before the role tabs", () => {
    const tabs = getSchemas("business-partner")!.list.tabs!;
    const keys = tabs.map((t) => t.key);

    expect(keys).toContain("draft");
    expect(keys.indexOf("draft"), "ahead of the role tabs").toBeLessThan(keys.indexOf("cust"));
  });

  it("shows exactly the partners waiting to be confirmed", () => {
    const bp = anyPartner();
    bp.status = "Draft";
    const tab = getSchemas("business-partner")!.list.tabs!.find((t) => t.key === "draft")!;

    const shown = BUSINESS_PARTNERS.filter((b) => tab.test!(b));
    expect(shown.map((b) => b.code)).toEqual([bp.code]);
  });
});
