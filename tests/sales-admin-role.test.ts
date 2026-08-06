import { beforeEach, describe, expect, it } from "vitest";
import { ROLES, USERS } from "@/data/admin";
import {
  can,
  canViewField,
  getRole,
  resetCurrentUser,
  roleActions,
  setCurrentUser,
} from "@/lib/domain/admin";
import { checkPermission } from "@/lib/permissions";

/* ============================================================
   THE SALES ADMIN DESK

   The role that runs the sell-side paperwork. What it may do is
   ordinary; what it may NOT do is the point of it existing as a
   role of its own, so most of what follows is a refusal.

   Nothing here names a user by name except to sit in the chair —
   the questions are all asked of `can()` and `canViewField()`,
   which is what the modules themselves ask.
   ============================================================ */

const asRole = (roleCode: string) =>
  setCurrentUser(USERS.find((u) => u.roleCode === roleCode && u.status === "Active")!.code);

beforeEach(resetCurrentUser);

describe("SALES_ADMIN — the role exists and is usable", () => {
  it("is a real active role with somebody in it", () => {
    const role = getRole("SALES_ADMIN")!;
    expect(role.status).toBe("Active");
    expect(role.department).toBe("Sales");
    /* A role nobody holds cannot approve anything, however it is configured. */
    expect(
      USERS.some((u) => u.roleCode === "SALES_ADMIN" && u.status === "Active"),
    ).toBe(true);
  });

  it("does not carry the blanket flag — it is configured, not exempt", () => {
    expect(getRole("SALES_ADMIN")!.all).toBeFalsy();
  });
});

describe("SALES_ADMIN — what the desk may do", () => {
  it("approves the sell-side documents it has to move", () => {
    asRole("SALES_ADMIN");
    for (const m of ["quotation", "sales-request", "sales-order"]) {
      expect(can(m, "approve"), m).toBe(true);
    }
  });

  it("runs the warehouse and billing documents through to the end", () => {
    asRole("SALES_ADMIN");
    for (const m of ["picking", "packing", "delivery-order", "sales-invoice", "credit-note"]) {
      expect(can(m, "create"), m).toBe(true);
    }
  });

  it("confirms a partner the rep raised", () => {
    /* The gate the Draft-partner rule reads — without it the admin can take
       the order but not let it become one. */
    asRole("SALES_ADMIN");
    expect(can("business-partner", "approve")).toBe(true);
  });
});

describe("SALES_ADMIN — what the desk may not do", () => {
  it("never sees cost, margin or profit", () => {
    asRole("SALES_ADMIN");
    for (const f of ["cost", "margin", "profit", "supplierCost", "inventoryValue"]) {
      expect(canViewField(f), f).toBe(false);
    }
    /* And through the legacy bridge a dozen schemas still call. */
    expect(checkPermission("canViewCost")).toBe(false);
  });

  it("declares no field permissions at all", () => {
    expect(getRole("SALES_ADMIN")!.fields).toEqual([]);
  });

  it("cannot open the purchase side or the admin console", () => {
    asRole("SALES_ADMIN");
    for (const m of [
      "purchase-request",
      "purchase-order",
      "goods-receipt",
      "admin-user",
      "admin-role",
      "admin-series",
    ]) {
      expect(can(m, "view"), m).toBe(false);
    }
  });

  it("cannot edit stock — inventory is read-only from this chair", () => {
    asRole("SALES_ADMIN");
    expect(can("stock-inquiry", "view")).toBe(true);
    expect(can("stock-adjustment", "create")).toBe(false);
    expect(can("stock-transfer", "create")).toBe(false);
    expect(can("cycle-count", "create")).toBe(false);
  });

  it("cannot change a price list or the price master", () => {
    asRole("SALES_ADMIN");
    expect(can("price-list", "view")).toBe(true);
    expect(can("price-list", "edit")).toBe(false);
    expect(can("pricing", "edit")).toBe(false);
    expect(can("product", "edit")).toBe(false);
  });

  it("cannot delete a business partner, only raise and confirm one", () => {
    asRole("SALES_ADMIN");
    expect(can("business-partner", "create")).toBe(true);
    expect(can("business-partner", "delete")).toBe(false);
  });
});

describe("SALES_ADMIN — the tier below the manager", () => {
  it("sits between the rep and the manager on approval, not beside either", () => {
    /* The rep cannot sign at all; the admin signs the ordinary; the manager
       signs what the admin cannot. Asserted as the shape of the ladder so a
       later permission edit that flattens it fails here. */
    asRole("SALES_REP");
    expect(can("quotation", "approve")).toBe(false);

    asRole("SALES_ADMIN");
    expect(can("quotation", "approve")).toBe(true);

    asRole("SALES_MANAGER");
    expect(can("quotation", "approve")).toBe(true);
  });

  it("is not one of the roles the price floor recognises as a manager", () => {
    /* MANAGER_ROLES is private to the workflow module, so this asks the
       question the way the app does: of the three roles that hold approve on
       a quotation, only the two manager-level ones may see margin. The sales
       admin cannot, which is the same line the floor rule draws.
       The refusal itself is proven in price-approval.test.ts. */
    asRole("SALES_MANAGER");
    expect(canViewField("margin")).toBe(true);

    asRole("SALES_ADMIN");
    expect(canViewField("margin")).toBe(false);
  });

  it("keeps the manager tier to the two roles the floor rule names", () => {
    /* If a new role is given Outbound approve without a decision about the
       floor, this is where it shows up. */
    const outboundApprovers = ROLES.filter(
      (r) => r.status === "Active" && roleActions(r.code, "quotation").includes("approve"),
    ).map((r) => r.code);

    expect(outboundApprovers.sort()).toEqual(
      ["MANAGEMENT", "SALES_ADMIN", "SALES_MANAGER", "SUPER_ADMIN"].sort(),
    );
  });
});
