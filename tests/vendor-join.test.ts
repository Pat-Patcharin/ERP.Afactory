import { describe, expect, it } from "vitest";

import {
  BUSINESS_PARTNERS,
  isDefaultSupplierOf,
  isVendorStub,
  onboardedPartners,
  vendorPartner,
} from "@/lib/domain/partner";
import { PRODUCTS, getProduct } from "@/lib/domain/product";
import { BP_STATUS } from "@/data/partners";
import { BP_TONE } from "@/lib/badges";

/* ============================================================
   THREE WAYS TO NAME A SUPPLIER, NONE OF THEM MEETING

   The product master said who a product is bought from as a
   NAME. The partner master used `BP0xxxxx`. Eight prototype
   products carried a third spelling, the `SUP-0012` series. None
   of the three joined to either of the others, so the question
   "is this partner the supplier of that product" had no answer
   at all — which is why the supplier-item form could not fill in
   terms it plainly should have known.

   Measured before the fix: 23 distinct vendor names across 757
   products, and ZERO of them matched a partner.

   The fix is not a fourth identifier. It is to make the names
   real: one partner per distinct vendor, generated from the same
   file the products came from, so the two cannot drift.

   These tests are about the join being LIVE. A lookup that
   resolves nothing reads exactly like a lookup that works, and
   this project has shipped that mistake more than once.
   ============================================================ */

describe("every vendor the product master names is a partner", () => {
  const named = PRODUCTS.map((p) => String(p.supplier ?? "").trim()).filter(
    (n) => n && n !== "—",
  );

  it("has products to join in the first place", () => {
    /* Guards the guards: if the product master were empty, every assertion
       below would pass by vacuum. */
    expect(named.length).toBeGreaterThan(500);
    expect(new Set(named).size).toBeGreaterThan(10);
  });

  it("resolves the supplier of every product that names one", () => {
    const unresolved = [...new Set(named)].filter((n) => !vendorPartner(n));
    expect(unresolved, `vendors with no partner:\n${unresolved.join("\n")}`).toEqual([]);
  });

  it("gives the same vendor the same partner every time", () => {
    /* Codes are handed out over a sorted list precisely so a reload cannot
       shuffle them. A vendor whose code moves is a vendor whose purchase
       history detaches. */
    const first = vendorPartner("Andaman Medical");
    expect(first).not.toBeNull();
    expect(vendorPartner("andaman medical")?.code).toBe(first!.code);
    expect(vendorPartner("Andaman Medical Co., Ltd.")?.code).toBe(first!.code);
  });

  it("never mints a second partner for a company already on file", () => {
    /* The rule `mergeCatalog` follows, applied here: generated records fill
       gaps and never overwrite or duplicate a hand-written one. */
    const codes = BUSINESS_PARTNERS.map((b) => b.code);
    expect(codes.length, "duplicate partner codes").toBe(new Set(codes).size);

    const keys = BUSINESS_PARTNERS.map((b) => b.nameEn.toLowerCase().trim());
    expect(keys.length, "two partners under one name").toBe(new Set(keys).size);
  });
});

describe("a supplier item can tell whose product it is", () => {
  it("says yes for the partner the product actually names", () => {
    /* The question the Supplier Items grid has to ask before it can fill
       anything in. Picked live rather than hard-coded, so the test follows
       the data instead of pinning it. */
    const product = PRODUCTS.find((p) => vendorPartner(p.supplier))!;
    const owner = vendorPartner(product.supplier)!;

    expect(isDefaultSupplierOf(owner.code, product)).toBe(true);
  });

  it("says no for a different partner", () => {
    const product = PRODUCTS.find((p) => vendorPartner(p.supplier))!;
    const owner = vendorPartner(product.supplier)!;
    const other = BUSINESS_PARTNERS.find((b) => b.code !== owner.code)!;

    /* The refusal, which is the half worth testing: a supplier who does not
       supply this product must be left to type the terms themselves. */
    expect(isDefaultSupplierOf(other.code, product)).toBe(false);
  });

  it("says no when nobody is named", () => {
    expect(isDefaultSupplierOf("BP000121", { supplier: "" })).toBe(false);
    expect(isDefaultSupplierOf("", { supplier: "Andaman Medical" })).toBe(false);
  });
});

describe("a generated vendor is honest about being one", () => {
  it("is Unverified, and Unverified is a real status", () => {
    const stubs = BUSINESS_PARTNERS.filter(isVendorStub);
    expect(stubs.length).toBeGreaterThan(10);
    expect(stubs.every((b) => b.status === "Unverified")).toBe(true);
    expect(BP_STATUS).toContain("Unverified");
    expect(BP_TONE.Unverified).toBeTruthy();
  });

  it("stays out of the queue of records a person started", () => {
    /* Draft is somebody's unfinished work. Twenty-three machine-written
       stubs filed beside it is how that queue stops being read. */
    const drafts = BUSINESS_PARTNERS.filter((b) => b.status === "Draft");
    expect(drafts.every((b) => !isVendorStub(b))).toBe(true);
  });

  it("cannot be sold to, and is not offered as a customer", () => {
    const stubs = BUSINESS_PARTNERS.filter(isVendorStub);
    expect(stubs.every((b) => b.status !== "Active")).toBe(true);
    expect(stubs.every((b) => !b.roles.customer && !b.roles.dealer)).toBe(true);
  });

  it("is excluded from the invariants that describe a filled-in partner", () => {
    /* `onboardedPartners()` is what the seed-integrity tests iterate. If a
       stub ever leaked into it, those tests would start failing for a reason
       that has nothing to do with what they are checking. */
    expect(onboardedPartners().some(isVendorStub)).toBe(false);
    expect(onboardedPartners().length).toBeLessThan(BUSINESS_PARTNERS.length);
  });
});
