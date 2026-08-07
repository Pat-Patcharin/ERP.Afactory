import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import {
  PRODUCTS,
  getProduct,
  isStocked,
  productStock,
  stockedProducts,
} from "@/lib/domain/product";
import {
  catalogCategory,
  catalogHeldBack,
  catalogProducts,
  catalogSummary,
} from "@/lib/domain/product-catalog";
import { priceMasterRows } from "@/lib/domain/price-master";
import { invSnapshot, invStockHealth } from "@/lib/domain/inventory";
import { PRODUCT_LIST, PRODUCT_DETAIL } from "@/schemas/product";

/* ============================================================
   PRODUCT CATALOGUE regression suite.

   Product Master and the price list master used to be two catalogues
   of one business. These tests hold them to being one — and hold the
   merge to carrying the source file's three known faults through
   instead of tidying them away.
   ============================================================ */

const PROTOTYPE = [
  "AA-TH003-WL",
  "AA-TH003-GR",
  "AA-TH004-BK",
  "AB-AC001",
  "AT-SL001",
  "AT-GL001",
  "AT-MD001",
  "AT-BR002",
];

describe("Product catalogue — the two masters are one list", () => {
  it("carries a product for every priced row it can key", () => {
    const s = catalogSummary();
    /* 807 rows, five held back by a shared code. */
    expect(s.rows).toBe(priceMasterRows().length);
    expect(s.products + s.heldBack).toBe(s.rows);
  });

  it("adds them to Product Master without disturbing what was there", () => {
    expect(PRODUCTS.length).toBe(PROTOTYPE.length + catalogProducts().length);
    for (const code of PROTOTYPE) {
      const p = getProduct(code)!;
      expect(p, code).toBeTruthy();
      /* The prototype's own records keep their stock, lots and documents. */
      expect(p.priceRef, code).toBeUndefined();
      expect(isStocked(p), code).toBe(true);
    }
  });

  it("keeps the price list master itself at its own count", () => {
    /* The merge reads the file; it must not add to or edit it. */
    expect(priceMasterRows().length).toBe(807);
  });

  it("takes the price, the vendor and the unit straight from the row", () => {
    const row = priceMasterRows().find((r) => r.product_code === "D-AD001-01")!;
    const p = getProduct("D-AD001-01")!;

    expect(p.name).toBe(row.product_name);
    expect(p.brand).toBe(row.brand);
    expect(p.unit).toBe(row.unit);
    expect(p.supplier).toBe(row.vendor);
    /* The catalogue price is the private tier — government is the same
       product at +10%, not a second selling price. */
    expect(p.price).toBe(row.price_private);
    expect(p.pricing.gov).toBe(row.price_government);
    expect(p.pricing.dealer).toBe(row.price_dealer);
    expect(p.pricing.lastCost).toBe(row.cost_thb);
  });

  it("files every row under a category a buyer would look in", () => {
    expect(catalogCategory("Instrument-Bull's")).toBe("Instrument");
    expect(catalogCategory("Orthodontic - Elastic")).toBe("Orthodontic");
    /* Both orthodontic sheets land in one category, not two. */
    expect(catalogCategory("Orthodontic-Wire&Orther")).toBe("Orthodontic");
    for (const p of catalogProducts()) expect(p.cat, p.code).not.toBe("");
  });
});

describe("Product catalogue — price, not stock", () => {
  it("gives a catalogue product no stock record at all", () => {
    const p = getProduct("D-AD001-01")!;
    expect(p.stocks).toEqual([]);
    expect(isStocked(p)).toBe(false);
    expect(p.availTotal).toBe(0);
  });

  it("does not let 800 unstocked items read as out of stock", () => {
    /* The inventory workspace counts what the warehouse holds. Folding the
       price list in must not move a single one of its figures. */
    expect(stockedProducts().length).toBe(PROTOTYPE.length);
    expect(invSnapshot().skus).toBe(PROTOTYPE.length);
    expect(invStockHealth().length).toBe(PROTOTYPE.length);
  });

  it("does not let them flood the Low Stock tab either", () => {
    const low = PRODUCTS.filter((p) => PRODUCT_LIST.tabs![2].test!(p));
    expect(PRODUCT_LIST.tabs![2].key).toBe("Low");
    expect(low.every(isStocked)).toBe(true);
    expect(low.length).toBeLessThan(PROTOTYPE.length);
  });

  it("carries the four tiers onto the product's own price tab", () => {
    const p = getProduct("D-AD001-01")!;
    const names = p.detail.priceLists.map((l) => l.name);

    expect(names).toEqual(["ราคาราชการ", "ราคาเอกชน", "ราคา Dealer"]);
    /* price_last is a floor, not a fourth list a customer can buy from. */
    expect(names).not.toContain("Last Price");
    expect(p.priceRef!.floor).toBe(280);
  });
});

/* ============================================================
   ONE DEFINITION OF PROJECTED

   The module states its own arithmetic above `decorateProducts()`:

     Available  = On Hand − Reserved
     Projected  = On Hand − Reserved − Back Order + On Order

   Both committed buckets come off, because Reserved and Back
   Order are the same thing at different stages — stock that
   already has an owner and cannot be sold again.

   Two bugs lived here, and the second was introduced while
   fixing the first:

     1. `productStock()` computed `available + onOrder`,
        subtracting neither.
     2. The stated definition subtracted Back Order ONLY. Since
        every Back Order in this seed is zero and the
        reservations are not, following it literally made a
        product with 150 units spoken for read as 1,850 free
        rather than 1,700 — worse than the bug being fixed.

   Neither was caught, because the tests asserted that the
   numbers were numbers. Asserting the formula is what makes
   them able to refuse anything.
   ============================================================ */

describe("Product stock — the stated formula is the one that runs", () => {
  const stocked = () => stockedProducts().map((p) => productStock(p.code)!);

  it("computes Available as On Hand − Reserved", () => {
    for (const s of stocked()) {
      expect(s.available, s.code).toBe(s.onHand - s.reserved);
    }
  });

  it("computes Projected as On Hand − Reserved − Back Order + On Order", () => {
    for (const s of stocked()) {
      expect(s.projected, s.code).toBe(s.onHand - s.reserved - s.backOrder + s.onOrder);
      /* Stated the second way too, since the comment gives both forms and a
         reader may check either. */
      expect(s.projected, s.code).toBe(s.available - s.backOrder + s.onOrder);
    }
  });

  it("takes off stock that is reserved but not yet back-ordered", () => {
    /* The live case in this seed, and the one the Back-Order-only definition
       got wrong: a buyer must not see reserved units as free to commit. */
    const reservedOnly = stocked().filter((s) => s.reserved > 0 && s.backOrder === 0);
    expect(reservedOnly.length, "the seed must keep such a product").toBeGreaterThan(0);

    for (const s of reservedOnly) {
      expect(s.projected, `${s.code} must not count reserved units as free`).toBeLessThan(
        s.onHand + s.onOrder,
      );
      expect(s.projected, s.code).toBe(s.onHand + s.onOrder - s.reserved);
    }
  });

  it("takes off back-ordered stock as well", () => {
    /* No product in the seed carries a back order, so the case that proves
       the other half of the rule has to be built. Without it the rule would
       be half-tested and could regress to subtracting only the reservation
       without a single test noticing. */
    const p = stockedProducts().find((x) => (x.reserved ?? 0) > 0)!;
    const before = p.backOrder;
    try {
      p.backOrder = 25;
      const s = productStock(p.code)!;
      expect(s.backOrder, "it is carried through, not swallowed").toBe(25);
      expect(s.projected).toBe(s.onHand - s.reserved - 25 + s.onOrder);
      /* And it moves the answer — a test that set it and asserted nothing
         changed would be the shape this file exists to avoid. */
      expect(s.projected).toBe(productStock(p.code)!.projected);
      p.backOrder = before;
      expect(productStock(p.code)!.projected - s.projected).toBe(25);
    } finally {
      p.backOrder = before;
    }
  });

  it("subtracts nothing when nothing is committed", () => {
    const p = stockedProducts()[0];
    const res = p.reserved;
    const back = p.backOrder;
    try {
      p.reserved = 0;
      p.backOrder = 0;
      const s = productStock(p.code)!;
      expect(s.projected).toBe(s.onHand + s.onOrder);
    } finally {
      p.reserved = res;
      p.backOrder = back;
    }
  });

  it("returns Back Order, which the purchase side reads", () => {
    for (const s of stocked()) {
      expect(typeof s.backOrder, s.code).toBe("number");
      expect(s.backOrder, s.code).toBe(getProduct(s.code)!.backOrder);
    }
  });

  it("agrees with the row-level figures the module also derives", () => {
    /* `decorateProducts()` applies the same two definitions to warehouse-row
       totals. Where a product's flat fields and its rows agree, the two paths
       must land on the same number — that is what "one definition" means. */
    for (const p of stockedProducts()) {
      const s = productStock(p.code)!;
      if (p.onHandTotal !== s.onHand || p.onOrderTotal !== s.onOrder) continue;
      expect(p.projected, p.code).toBe(s.projected);
    }
  });

  it("suggests ordering up to target off the projected balance", () => {
    for (const s of stocked()) {
      expect(s.suggested, s.code).toBe(Math.max(0, s.target - s.projected));
    }
  });

  it("answers nothing for a product the warehouse never held", () => {
    /* A catalogue row is not "zero in stock" — see `isStocked`. */
    const p = getProduct("D-AD001-01")!;
    expect(isStocked(p)).toBe(false);
    expect(productStock("NO-SUCH-CODE")).toBeNull();
  });
});

describe("Product catalogue — the source file's faults are carried, not hidden", () => {
  it("keys the 51 rows with no product code by their price row", () => {
    const pending = PRODUCTS.filter((p) => p.priceRef?.codePending);
    expect(pending).toHaveLength(51);
    for (const p of pending) {
      expect(p.code, p.name).toMatch(/^PLM-\d{4}$/);
      /* Nothing without a real code is sellable. */
      expect(p.status, p.code).toBe("Draft");
    }
  });

  it("holds back the second row of a shared code and names it on the first", () => {
    const held = catalogHeldBack();
    expect(held).toHaveLength(5);

    for (const h of held) {
      /* The row is out of Product Master but its code is still there once. */
      const survivor = getProduct(h.code)!;
      expect(survivor, h.code).toBeTruthy();
      expect(survivor.priceRef!.row).toBe(h.keptBy);
      expect(survivor.priceRef!.conflicts).toContain(h.row);
    }
  });

  it("tells one code used twice apart from one product entered twice", () => {
    /* H-RC005-01 is TopCEM RMGI in one row and UltraCore in the other —
       the fault that actually bites on import. */
    expect(getProduct("H-RC005-01")!.priceRef!.conflictClash).toBe(true);
    /* H-AD001-01 is the same HugeBond row listed twice. Untidy, not unsafe. */
    expect(getProduct("H-AD001-01")!.priceRef!.conflictClash).toBe(false);
  });

  it("blocks every row the price file could not finish pricing", () => {
    const blocked = catalogProducts().filter((p) => p.priceRef!.priceStatus !== "OK");
    expect(blocked).toHaveLength(80);
    for (const p of blocked) {
      expect(p.status, p.code).toBe("Draft");
      expect(p.priceRef!.sellable, p.code).toBe(false);
      /* A blocked row says why, in words a salesperson can act on. */
      expect(p.desc, p.code).not.toBe("");
    }
  });

  it("never marks a row without a cost as sellable", () => {
    const noCost = catalogProducts().filter((p) => p.priceRef!.priceStatus === "PENDING_COST");
    expect(noCost.length).toBe(56);
    expect(noCost.every((p) => p.pricing.lastCost === 0)).toBe(true);
    expect(noCost.every((p) => p.status === "Draft")).toBe(true);
  });
});

/** Open a product straight on its Price tab. */
async function priceTab(code: string) {
  const user = userEvent.setup();
  render(<FullDetail schema={PRODUCT_DETAIL} record={getProduct(code)!} />);
  await user.click(screen.getByRole("tab", { name: "Price" }));
}

describe("Product catalogue — on the screen", () => {
  it("finds a price list product by code in Product Master", async () => {
    const user = userEvent.setup();
    render(<ListView schema={PRODUCT_LIST} />);

    await user.type(screen.getByPlaceholderText(/ค้นหารหัสสินค้า/), "B-EN025-01");
    expect(await screen.findByText("Endo spoon 32L 1.5mm")).toBeInTheDocument();
  });

  it("marks a row that is still waiting for a product code", async () => {
    const user = userEvent.setup();
    const pending = PRODUCTS.find((p) => p.priceRef?.codePending)!;
    render(<ListView schema={PRODUCT_LIST} />);

    await user.type(screen.getByPlaceholderText(/ค้นหารหัสสินค้า/), pending.code);
    expect(await screen.findByText("รอรหัส")).toBeInTheDocument();
  });

  it("shows the four tiers and the floor on the product page", async () => {
    await priceTab("D-AD001-01");

    expect(screen.getByText(/ราคา 4 ชั้น/)).toBeInTheDocument();
    expect(screen.getByText(/เพดานล่าง/)).toBeInTheDocument();
    expect(screen.getByText(/ต่ำกว่านี้ต้องขออนุมัติ/)).toBeInTheDocument();
  });

  it("says on the page why a blocked product cannot be sold", async () => {
    const blocked = catalogProducts().find((p) => p.priceRef!.priceStatus === "PENDING_COST")!;
    await priceTab(blocked.code);

    expect(screen.getByText(/PENDING_COST/)).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีต้นทุน/)).toBeInTheDocument();
  });

  it("warns on the page that a code is shared with a different product", async () => {
    await priceTab("H-RC005-01");
    expect(screen.getByText(/ถูกใช้กับสินค้าคนละตัว/)).toBeInTheDocument();
  });

  it("shows a dash, not a zero, where there is no stock record", () => {
    render(<FullDetail schema={PRODUCT_DETAIL} record={getProduct("D-AD001-01")!} />);
    expect(screen.getByText("ยังไม่มีระเบียนสต๊อก")).toBeInTheDocument();
  });
});
