import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUSINESS_PARTNERS,
  isDefaultSupplierOf,
  isVendorStub,
  onboardedPartners,
  leadingNumber,
  supplyTermsFor,
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

/* ============================================================
   ONE HOME FOR THE BUYING TERMS

   Minimum order, lead time, quoted price and the vendor's own
   item code were kept twice — formatted for reading on the
   product, as numbers on the partner — with nothing keeping them
   in step. They had drifted before anybody noticed: AA-TH003-WL
   read "240 Tube / 21 วัน" on the product while a supplier item
   said 24 and 14.

   The supplier item is now the only home, because it is keyed by
   (partner, product) — the grain these facts have. `product.sup`
   renders that row rather than storing its own answer.
   ============================================================ */

describe("the buying terms have one home", () => {
  it("gives the supplier of a product a row for it", () => {
    const withTerms = PRODUCTS.filter((p) => supplyTermsFor(p.code));
    expect(withTerms.length).toBeGreaterThan(500);
  });

  it("shows the product exactly what the supplier item says", () => {
    /* The two used to disagree. They cannot now, because there is only one
       of them: `sup` is rendered from the row. */
    for (const p of PRODUCTS.slice(0, 60)) {
      const terms = supplyTermsFor(p.code);
      if (!terms) continue;
      const sup = (p as unknown as { sup?: Record<string, string> }).sup;
      if (!sup) continue;

      expect(sup.code, `${p.code} supplier code`).toBe(terms.partner.code);
      expect(sup.itemCode, `${p.code} vendor item code`).toBe(terms.row.sku);
      if (terms.row.moq > 0) expect(sup.moq, `${p.code} moq`).toContain(String(terms.row.moq));
      if (terms.row.lead > 0) expect(sup.lead, `${p.code} lead`).toContain(String(terms.row.lead));
    }
  });

  it("prefers the supplier the product master names over any other source", () => {
    /* A product with two sources must not resolve by array order. */
    const twoSources = PRODUCTS.find((p) => {
      const holders = BUSINESS_PARTNERS.filter((b) =>
        (b.supplierItems ?? []).some((i) => i.product === p.code),
      );
      return holders.length > 1;
    });
    expect(twoSources, "the fixture needs a product with two suppliers").toBeTruthy();

    const named = vendorPartner(twoSources!.supplier)!;
    expect(supplyTermsFor(twoSources!.code)!.partner.code).toBe(named.code);
  });

  it("never lets a generated row replace one somebody typed", () => {
    /* BP000121's rows are hand-written seeds. A derived row for the same
       product on the same partner would be data loss, quietly. */
    const bp = BUSINESS_PARTNERS.find((b) => b.code === "BP000121")!;
    const codes = (bp.supplierItems ?? []).map((i) => i.product);
    expect(codes.length, "duplicate rows for one product").toBe(new Set(codes).size);

    const seeded = (bp.supplierItems ?? []).find((i) => i.product === "AA-TH003-WL")!;
    expect(seeded.moq).toBe(24);
    expect(seeded.sku).toBe("DNT-CR-A2-4G");
  });

  it("reads a legacy display string only once, into a number", () => {
    expect(leadingNumber("240 Tube")).toBe(240);
    expect(leadingNumber("21 วัน")).toBe(21);
    expect(leadingNumber("68.50 THB")).toBe(68.5);
    /* Not stated is 0, not NaN — the figure has to stay addable. */
    expect(leadingNumber("")).toBe(0);
    expect(leadingNumber("—")).toBe(0);
    expect(leadingNumber(undefined)).toBe(0);
  });
});

/* ============================================================
   THE SUP-xxxx NAMESPACE IS GONE

   Suppliers were named three ways: a free-text name on the
   product, `SUP-0012` on `sup` and `altSuppliers`, and
   `BP0xxxxx` on the partner master. None joined to the others.

   One survives. `sup.code` and every alternative source carry a
   partner code, which means every one of them opens the record
   it is talking about.
   ============================================================ */

describe("a supplier is identified one way", () => {
  it("never shows a SUP-xxxx code anywhere", () => {
    const stale: string[] = [];
    for (const p of PRODUCTS) {
      const rec = p as unknown as {
        sup?: { code?: string };
        altSuppliers?: { code?: string }[];
      };
      if (String(rec.sup?.code ?? "").startsWith("SUP-")) stale.push(`${p.code} sup`);
      for (const a of rec.altSuppliers ?? []) {
        if (String(a.code ?? "").startsWith("SUP-")) stale.push(`${p.code} alt`);
      }
    }
    expect(stale, `still on the old namespace:\n${stale.join("\n")}`).toEqual([]);
  });

  it("has no SUP-xxxx left in the source either", () => {
    /*
       The assertion above checks what is SHOWN, and passes even with a stale
       code in the seed — `syncProductSupplyView` overwrites it before anyone
       sees it. That is the design working, and it is also why that test
       alone cannot tell you the namespace is gone.

       This reads the file. A dead identifier sitting in source is a third
       way of naming a supplier for whoever opens it next, whether or not it
       ever reaches a screen.
    */
    const src = readFileSync(join("data", "products.ts"), "utf8");
    const hits = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => /SUP-\d/.test(line));

    expect(
      hits,
      `the SUP-xxxx namespace is retired — partner codes identify a supplier now:\n${hits
        .map((h) => `  data/products.ts:${h.no}  ${h.line}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("points every alternative source at a partner that exists", () => {
    const codes = new Set(BUSINESS_PARTNERS.map((b) => b.code));
    let checked = 0;
    for (const p of PRODUCTS) {
      const alts = (p as unknown as { altSuppliers?: { code: string }[] }).altSuppliers ?? [];
      for (const a of alts) {
        expect(codes.has(a.code), `${p.code} → ${a.code}`).toBe(true);
        checked++;
      }
    }
    /* Guards the guard: a product master with no alternatives listed would
       satisfy the loop above without proving anything. */
    expect(checked).toBeGreaterThan(0);
  });

  it("migrated the companies the old alternatives list named", () => {
    /*
       Named explicitly, and that is the point. The looser assertions below
       passed with the migration switched off, because a hand-seeded row on
       another partner already made AA-TH003-WL look like it had a second
       source. Green for a reason that had nothing to do with the code under
       test — so this one names the two companies the product's old
       `altSuppliers` list actually held and insists they are there.
    */
    for (const name of ["HDX WILL", "Andaman Medical"]) {
      const bp = vendorPartner(name);
      expect(bp, `${name} has no partner`).not.toBeNull();
      const row = (bp!.supplierItems ?? []).find((i) => i.product === "AA-TH003-WL");
      expect(row, `${name} holds no row for AA-TH003-WL`).toBeTruthy();
      /* Carrying the terms it was listed with, not a copy of the default's. */
      expect(row!.lead).toBeGreaterThan(0);
      expect(row!.price).toBeGreaterThan(0);
      expect(row!.preferred, `${name} must not claim to be the default`).toBe(false);
    }
  });

  it("gives a second source a row of its own rather than a figure on the product", () => {
    /* AA-TH003-WL is bought from more than one company. Each gets a row, so
       each keeps its own price and lead time — which a single figure on the
       product could only ever get right for one of them. */
    const holders = BUSINESS_PARTNERS.filter((b) =>
      (b.supplierItems ?? []).some((i) => i.product === "AA-TH003-WL"),
    );
    expect(holders.length).toBeGreaterThan(1);

    const prices = holders.map(
      (b) => (b.supplierItems ?? []).find((i) => i.product === "AA-TH003-WL")!.price,
    );
    expect(new Set(prices).size, "sources that all quote the same price prove nothing").toBeGreaterThan(1);
  });

  it("lets exactly one supplier per product be the preferred one", () => {
    /* The same invariant the billing address holds. Five places read this
       flag, including a Preferred badge — two rows claiming it at once is
       the word meaning nothing. */
    const counts = new Map<string, number>();
    for (const b of BUSINESS_PARTNERS) {
      for (const i of b.supplierItems ?? []) {
        if (i.preferred) counts.set(i.product, (counts.get(i.product) ?? 0) + 1);
      }
    }
    const doubled = [...counts.entries()].filter(([, n]) => n > 1);
    expect(doubled, `products with two preferred suppliers: ${JSON.stringify(doubled)}`).toEqual([]);

    /* And the one that wins is the one the product master names. */
    const terms = supplyTermsFor("AA-TH003-WL")!;
    expect(terms.row.preferred).toBe(true);
    expect(terms.partner.code).toBe(vendorPartner(getProduct("AA-TH003-WL")!.supplier)!.code);
  });
});
