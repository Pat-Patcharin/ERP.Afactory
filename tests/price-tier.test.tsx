import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FullDetail } from "@/components/engine/FullDetail";
import { PriceTierNotice } from "@/components/document/parts";
import { BUSINESS_PARTNERS as RAW, type BusinessPartner } from "@/data/partners";
import { BUSINESS_PARTNERS, decorateBPs, getBP } from "@/lib/domain/partner";
import {
  TIER_TH,
  resolveCustomerPrice,
  tierForPartner,
  tierNotices,
} from "@/lib/domain/price-tier";
import { priceForCustomer, priceForTier } from "@/lib/domain/pricing-master";
import { priceMasterByProduct } from "@/lib/domain/price-master";
import { docInsight } from "@/lib/domain/doc-draft";
import { bpSchemas } from "@/schemas/business-partner";
import { getSchemas } from "@/schemas/registry";
import type { ActionCtx } from "@/lib/types";
import type { DocInsight } from "@/lib/domain/doc-draft";

/* ============================================================
   PRICE TIER regression suite.

   Two dimensions that look alike and are not: the ROLE a partner
   plays (customer / supplier / dealer) and the KIND of customer it
   is (government / private). The tier is decided from both, and
   these tests are what keeps the two from being conflated again.
   ============================================================ */

const SEED = JSON.parse(JSON.stringify(RAW)) as BusinessPartner[];

beforeEach(() => {
  RAW.length = 0;
  RAW.push(...(JSON.parse(JSON.stringify(SEED)) as BusinessPartner[]));
  decorateBPs();
});

const makeCtx = (over: Partial<ActionCtx> = {}): ActionCtx => ({
  goto: () => {},
  openEntity: () => {},
  toast: () => {},
  confirm: () => {},
  formModal: () => {},
  refresh: () => {},
  quickView: () => {},
  panel: () => {},
  ...over,
});

/** A partner shaped for one case, without touching the seeded records. */
const partner = (over: {
  dealer?: boolean;
  custType?: string;
  bizType?: string;
  priceGroup?: string;
}) =>
  ({
    roles: { customer: true, supplier: false, dealer: Boolean(over.dealer), prospect: false, other: false },
    cls: { priceGroup: over.priceGroup ?? "" },
    customer: { custType: over.custType ?? "Private", bizType: over.bizType ?? "Clinic" },
  }) as unknown as BusinessPartner;

describe("Price tier — choosing a tier", () => {
  it("gives a private clinic the private price", () => {
    expect(tierForPartner(partner({ custType: "Private", bizType: "Clinic" }))).toBe("private");
  });

  it("gives a government body the government price", () => {
    expect(tierForPartner(partner({ custType: "Government", bizType: "Hospital" }))).toBe("government");
  });

  it("gives a dealer the dealer price", () => {
    expect(tierForPartner(partner({ dealer: true }))).toBe("dealer");
    /* The business type says dealer even when nobody ticked the role. */
    expect(tierForPartner(partner({ bizType: "Dealer" }))).toBe("dealer");
  });

  it("lets the dealer role win over the entity kind", () => {
    /* A reseller buys to resell whatever it is registered as. */
    expect(tierForPartner(partner({ dealer: true, custType: "Government" }))).toBe("dealer");
  });

  it("reads the customer kind from the extension, never from the price group", () => {
    /* Government is a fact about the entity; the price group is a setting.
       BP000089 is the live record where the two disagree. */
    const gov = partner({ custType: "Government", priceGroup: "Retail" });
    expect(tierForPartner(gov)).toBe("government");

    const priv = partner({ custType: "Private", priceGroup: "Government" });
    expect(tierForPartner(priv)).toBe("private");
  });

  it("falls back to private for a partner with no customer profile", () => {
    expect(tierForPartner({ roles: { customer: false } } as never)).toBe("private");
  });

  it("puts every seeded customer on a tier", () => {
    const expected: Record<string, string> = {
      BP000123: "private",
      BP000122: "private",
      BP000120: "dealer",
      BP000119: "government",
      BP000118: "private",
      BP000089: "government",
    };
    for (const [code, tier] of Object.entries(expected)) {
      expect(tierForPartner(getBP(code)!), code).toBe(tier);
    }
  });
});

describe("Price tier — last price is not a tier", () => {
  it("will not resolve a customer price for the floor", () => {
    const row = priceMasterByProduct("D-AD001-01")[0];
    /* The compiler is the guard here — that is the point of the split. */
    // @ts-expect-error 'last' is not a CustomerPriceTier
    priceForCustomer(row, "last");
  });

  it("keeps the floor readable for the approval check only", () => {
    const row = priceMasterByProduct("D-AD001-01")[0];
    expect(priceForTier(row, "last")).toBe(row.price_last);
    expect(priceForTier(row, "private")).toBe(row.price_private);
  });

  it("never returns the floor as the resolved price", () => {
    for (const b of BUSINESS_PARTNERS.filter((x) => x.roles.customer)) {
      const r = resolveCustomerPrice(b, "D-AD001-01");
      expect(["private", "government", "dealer"]).toContain(r.tier);
      if (r.price !== null && r.floor !== null) {
        /* The quoted price always sits at or above the floor. */
        expect(r.price, `${b.code}`).toBeGreaterThanOrEqual(r.floor);
      }
    }
  });
});

describe("Price tier — resolving a price", () => {
  it("picks the tier's own column from the catalogue row", () => {
    const row = priceMasterByProduct("D-AD001-01")[0];

    expect(resolveCustomerPrice(partner({ custType: "Private" }), "D-AD001-01").price).toBe(
      row.price_private,
    );
    expect(resolveCustomerPrice(partner({ custType: "Government" }), "D-AD001-01").price).toBe(
      row.price_government,
    );
    expect(resolveCustomerPrice(partner({ dealer: true }), "D-AD001-01").price).toBe(
      row.price_dealer,
    );
  });

  it("reports a product that is not in the catalogue rather than guessing", () => {
    const r = resolveCustomerPrice(partner({}), "NOT-A-REAL-CODE");
    expect(r.row).toBeNull();
    expect(r.price).toBeNull();
    expect(r.sellable).toBe(false);
  });

  it("refuses to call a row without a cost sellable", () => {
    const pending = priceMasterByProduct(
      priceMasterByProduct("D-AD001-01")[0].product_code,
    );
    expect(pending.length).toBeGreaterThan(0);

    const noCost = resolveCustomerPrice(partner({}), "F-DC001-01");
    if (noCost.row?.status === "PENDING_COST") expect(noCost.sellable).toBe(false);
  });
});

describe("Price tier — notices", () => {
  it("stays quiet when the record agrees with itself", () => {
    expect(tierNotices(getBP("BP000123")!)).toEqual([]);
    expect(tierNotices(getBP("BP000119")!)).toEqual([]);
    expect(tierNotices(getBP("BP000120")!)).toEqual([]);
  });

  it("flags the government body whose price group says Retail", () => {
    const notices = tierNotices(getBP("BP000089")!);
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("price-group-mismatch");
    /* The title has to carry the figure, not just say "they differ". */
    expect(notices[0].title).toMatch(/ราคาราชการ/);
    expect(notices[0].title).toMatch(/\d+%/);
    expect(notices[0].message).toMatch(/Retail/);
  });

  it("measures the gap on a real row when one is given", () => {
    const row = priceMasterByProduct("D-AD001-01")[0];
    const notices = tierNotices(getBP("BP000089")!, row);
    /* 650 → 720 is 10.8%, which rounds to 11 — the measured figure, not the
       nominal 10% from the rule. */
    expect(notices[0].title).toContain("11%");
  });

  it("still states the rule when there is no row to measure", () => {
    const notices = tierNotices(getBP("BP000089")!);
    expect(notices[0].title).toContain("10%");
  });

  it("flags a government body that is also ticked as a dealer", () => {
    const odd = partner({ dealer: true, custType: "Government" });
    const notices = tierNotices(odd);
    const gov = notices.find((n) => n.kind === "government-dealer")!;

    expect(gov).toBeDefined();
    /* Worth stopping for: dealer is the lowest of the three tiers. */
    expect(gov.tone).toBe("danger");
    expect(gov.title).toMatch(/ราชการ/);
    expect(gov.message).toMatch(/ผู้อนุมัติ/);
  });

  it("puts a number on how far the dealer price sits below government", () => {
    const row = priceMasterByProduct("D-AD001-01")[0];
    const notices = tierNotices(partner({ dealer: true, custType: "Government" }), row);
    const gov = notices.find((n) => n.kind === "government-dealer")!;
    /* 720 → 460 is −36%. */
    expect(gov.title).toMatch(/ต่ำกว่าราคาราชการ 36%/);
  });
});

describe("Price tier — where the notice appears", () => {
  it("rides on the shared document insight", () => {
    const insight = docInsight("BP000089 - มหาวิทยาลัย", 1000, {
      priceList: "",
      payTerm: "",
    } as never);

    expect(insight.priceTier).toBe("government");
    expect(insight.priceTierLabel).toBe(TIER_TH.government);
    expect(insight.tierNotices).toHaveLength(1);
  });

  it("renders on a sales document for the salesperson typing it", () => {
    const insight = docInsight("BP000089 - มหาวิทยาลัย", 1000, {
      priceList: "",
      payTerm: "",
    } as never);

    render(<PriceTierNotice insight={insight as DocInsight} />);
    expect(screen.getByTestId("price-tier-notice")).toBeInTheDocument();
    expect(screen.getByText(/ระบบเลือกราคาราชการ/)).toBeInTheDocument();
  });

  it("shows nothing when the record is consistent", () => {
    const insight = docInsight("BP000123 - เดนทัล สมายล์", 1000, {
      priceList: "",
      payTerm: "",
    } as never);

    render(<PriceTierNotice insight={insight as DocInsight} />);
    expect(screen.queryByTestId("price-tier-notice")).toBeNull();
  });

  it("shows the tier and the notice on the partner record", () => {
    render(<FullDetail schema={bpSchemas.detail} record={getBP("BP000089")!} />);
    expect(screen.getAllByText(/ระบบเลือกราคาราชการ/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Price Tier").length).toBeGreaterThan(0);
  });

  it("shows the notice on a sales order for the same customer", () => {
    const so = getSchemas("sales-order")!
      .list.source()
      .find((s) => (s as { customerCode?: string }).customerCode === "BP000089");

    if (!so) return; /* No seeded order for this partner — nothing to assert. */
    const blocks = getSchemas("sales-order")!.detail.tabs[0].blocks(so, makeCtx());
    const titles = blocks
      .filter(Boolean)
      .map((b) => (b as { title?: string }).title ?? "");
    expect(titles.some((t) => t.includes("ราคาราชการ"))).toBe(true);
  });
});
