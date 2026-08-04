import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import {
  duplicateProductCodes,
  itemsByStatus,
  loadPriceListItems,
  priceListMeta,
} from "@/lib/domain/pricelist-repo";
import {
  PRICE_STATUS_TONE,
  flaggedRows,
  getPriceMasterRow,
  gpTone,
  priceMasterByProduct,
  priceMasterRows,
  priceMasterSummary,
  tierOrderHolds,
} from "@/lib/domain/price-master";
import { PRICING_CONFIG, grossProfitRate } from "@/lib/domain/pricing-master";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { priceListMasterSchemas } from "@/schemas/price-list-master";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   PRICE LIST MASTER regression suite.

   The counts below are the ones docs/PRICING_RULES.md §5 publishes.
   They are asserted rather than trusted: if the file is regenerated
   and the mix changes, this suite is what says so.
   ============================================================ */

const { list, detail } = priceListMasterSchemas;
const rows = () => priceMasterRows();

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

const titlesOf = (blocks: unknown[]): string[] =>
  blocks.filter(Boolean).flatMap((b) => {
    const block = b as { title?: string };
    return block.title ? [block.title] : [];
  });

beforeEach(() => window.localStorage.clear());

/* ============================================================
   Data access
   ============================================================ */

describe("Price List Master — repository layer", () => {
  it("is the only module that reads the JSON file", () => {
    /* The user's rule: one data-access layer, so swapping the bundled file
       for an API route later is a change in one place. */
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        if (f === "node_modules" || f === ".next" || f === ".git") return [];
        const full = join(dir, f);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(f) ? [full] : [];
      });

    const importers = walk(process.cwd()).filter((f) =>
      /pricelist_master\.json/.test(readFileSync(f, "utf8")),
    );

    expect(importers).toHaveLength(1);
    expect(importers[0].replace(/\\/g, "/")).toMatch(/lib\/domain\/pricelist-repo\.ts$/);
  });

  it("publishes the metadata the file was generated with", () => {
    const m = priceListMeta();
    expect(m.schemaVersion).toBe("1.0.0");
    expect(m.currency).toBe("THB");
    /* Rule 1: no field anywhere includes VAT. */
    expect(m.vatIncluded).toBe(false);
    expect(m.recordCount).toBe(807);
    expect(m.source.length).toBeGreaterThan(0);
  });

  it("carries the record mix the spec documents", () => {
    expect(loadPriceListItems()).toHaveLength(807);
    expect(itemsByStatus("OK")).toHaveLength(727);
    expect(itemsByStatus("PENDING_COST")).toHaveLength(56);
    expect(itemsByStatus("REVIEW")).toHaveLength(16);
    expect(itemsByStatus("NO_PRICE")).toHaveLength(8);
  });

  it("names the five product codes that are used twice", () => {
    expect(duplicateProductCodes()).toEqual([
      "H-AD001-01",
      "H-AD002-01",
      "H-AD003-01",
      "H-RC005-01",
      "R-SC001-01",
    ]);
  });
});

/* ============================================================
   Read model
   ============================================================ */

describe("Price List Master — rows", () => {
  it("gives every row a key of its own", () => {
    /* 51 rows have no product code and 5 codes are shared, so the product
       code cannot address a row. */
    const keys = rows().map((r) => r.code);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe("PLM-0001");
    expect(getPriceMasterRow("PLM-0001")).not.toBeNull();
  });

  it("counts the data problems the spec says to surface", () => {
    const s = priceMasterSummary();
    expect(s.total).toBe(807);
    expect(s.missingCode).toBe(51);
    /* Five codes, two rows each. */
    expect(s.duplicateCode).toBe(10);
  });

  it("resolves a duplicated code to every row that claims it", () => {
    const dupes = priceMasterByProduct("H-RC005-01");
    expect(dupes).toHaveLength(2);
    /* The spec calls this one the worst: two different products. */
    expect(new Set(dupes.map((d) => d.product_name)).size).toBe(2);
  });

  it("keeps government ≥ private ≥ dealer ≥ last on every row", () => {
    for (const r of rows()) {
      expect(r.tierOrderOk, `${r.code} ${r.product_code}`).toBe(true);
    }
    expect(priceMasterSummary().tierOrderBroken).toBe(0);
  });

  it("skips the tiers a row has not got when checking the ladder", () => {
    expect(tierOrderHolds({ price_government: 100, price_private: null, price_dealer: 60, price_last: 50 } as never)).toBe(true);
    expect(tierOrderHolds({ price_government: 50, price_private: 100, price_dealer: null, price_last: null } as never)).toBe(false);
  });

  it("shows the GP the file recorded rather than recomputing it", () => {
    /* Rule 2: GP is measured on the ex-VAT price. Recomputing invites the
       ÷1.07 bug, so the stored decimal is what reaches the screen. */
    const items = loadPriceListItems();
    rows().forEach((r, n) => {
      expect(r.gp_private).toBe(items[n].gp_private);
      expect(r.gp_dealer).toBe(items[n].gp_dealer);
      expect(r.gp_last).toBe(items[n].gp_last);
    });
  });

  it("agrees with the formula where both a price and a cost exist", () => {
    const sample = rows().filter((r) => r.gp_private !== null && r.cost_thb && r.price_private).slice(0, 50);
    expect(sample.length).toBeGreaterThan(0);
    for (const r of sample) {
      const direct = grossProfitRate(r.price_private!, r.cost_thb!);
      expect(Math.abs(direct - r.gp_private!), r.code).toBeLessThan(0.001);
    }
  });

  it("bands GP against the dealer and last-price floors", () => {
    expect(gpTone(0.5)).toBe("success");
    expect(gpTone(PRICING_CONFIG.dealerGpMin)).toBe("success");
    expect(gpTone(0.44)).toBe("warning");
    expect(gpTone(PRICING_CONFIG.lastPriceGpMin)).toBe("warning");
    expect(gpTone(0.2)).toBe("danger");
    expect(gpTone(null)).toBe("neutral");
  });

  it("marks a row with no cost as not sellable", () => {
    const pending = rows().filter((r) => r.status === "PENDING_COST");
    expect(pending).toHaveLength(56);
    for (const r of pending) {
      expect(r.sellable, r.code).toBe(false);
      /* No cost means the two lower tiers cannot be computed at all. */
      expect(r.price_dealer).toBeNull();
      expect(r.price_last).toBeNull();
    }
  });

  it("collects the rows the validator flagged", () => {
    const flagged = flaggedRows();
    expect(flagged.length).toBeGreaterThan(0);
    for (const r of flagged) {
      expect(r.violations.length > 0 || r.duplicateCode || !r.tierOrderOk, r.code).toBe(true);
    }
  });
});

/* ============================================================
   The forbidden divisor
   ============================================================ */

describe("Price List Master — VAT must never enter the GP path", () => {
  it("divides by no VAT factor anywhere in the pricing modules", () => {
    /* PR-08. The spec calls this out as a bug on sight, so it is checked
       against the source rather than left to review. */
    for (const f of [
      "lib/domain/price-master.ts",
      "lib/domain/pricelist-repo.ts",
      "schemas/price-list-master.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\/\s*1\.07/);
      expect(src, f).not.toMatch(/\/\s*\(\s*1\s*\+\s*\w*[Vv]at/);
    }
  });
});

/* ============================================================
   List
   ============================================================ */

describe("Price List Master — list", () => {
  it("renders the title and subtitle", () => {
    render(<ListView schema={list} />);
    expect(screen.getByRole("heading", { level: 1, name: "Price List Master" })).toBeInTheDocument();
    expect(screen.getByText(/ราคาตั้งต่อ SKU สี่ชั้น/)).toBeInTheDocument();
  });

  it("shows the four price tiers as columns, highest first", () => {
    const keys = list.columns.map((c) => c.key);
    const TIERS = ["price_government", "price_private", "price_dealer", "price_last"];
    const tiers = keys.filter((k) => TIERS.includes(k));
    expect(tiers).toEqual([
      "price_government",
      "price_private",
      "price_dealer",
      "price_last",
    ]);
    for (const k of tiers) {
      expect(list.columns.find((c) => c.key === k)!.defaultHidden, k).toBeFalsy();
    }
  });

  it("shows GP as its own column for every tier that has one", () => {
    const gp = list.columns.filter((c) => c.key.startsWith("gp_")).map((c) => c.key);
    expect(gp).toEqual(["gp_private", "gp_dealer", "gp_last"]);
  });

  it("colours the status badge by how usable the row is", () => {
    expect(PRICE_STATUS_TONE.OK).toBe("success");
    expect(PRICE_STATUS_TONE.REVIEW).toBe("warning");
    /* No cost blocks the sale, so it reads as an error, not a warning. */
    expect(PRICE_STATUS_TONE.PENDING_COST).toBe("danger");
    expect(PRICE_STATUS_TONE.NO_PRICE).toBe("neutral");

    const col = list.columns.find((c) => c.key === "status")!;
    expect(col.defaultHidden).toBeFalsy();
  });

  it("renders the KPI strip the header promises", () => {
    render(<ListView schema={list} />);
    for (const label of ["Total SKU", "พร้อมขาย", "รอต้นทุน", "ต้องทบทวน", "ไม่มีราคา", "ปัญหารหัส"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("offers a tab for each status and each data problem", () => {
    expect(list.tabs.map((t) => t.key)).toEqual([
      "all",
      "ok",
      "cost",
      "review",
      "noprice",
      "codeissue",
      "orderbad",
      "promo",
    ]);
    const codeIssue = list.tabs.find((t) => t.key === "codeissue")!;
    expect(rows().filter((r) => codeIssue.test!(r))).toHaveLength(61);
  });

  it("filters by the dimensions a buyer actually scans", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of ["status", "source", "brand", "group", "vendor", "gpband", "nocode", "dupcode"]) {
      expect(ids, id).toContain(id);
    }
    const band = list.filters.find((f) => f.id === "gpband")!;
    const high = rows().filter((r) => band.test(r, "≥ 48%"));
    expect(high.length).toBeGreaterThan(0);
    for (const r of high) expect(r.gp_private!).toBeGreaterThanOrEqual(PRICING_CONFIG.dealerGpMin);
  });

  it("searches by product code and by name", async () => {
    const user = userEvent.setup();
    render(<ListView schema={list} />);
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), "D-AD001-01");
    expect(await screen.findByText(/^1 prices$/)).toBeInTheDocument();
  }, 20_000);

  it("warns about the rows that cannot be sold", () => {
    render(<ListView schema={list} />);
    expect(screen.getByText(/มี 56 รายการที่ยังไม่มีต้นทุน/)).toBeInTheDocument();
  });

  it("offers no way to create or edit a generated file", () => {
    expect(list.hideCreate).toBe(true);
    expect(getSchemas("price-list-master")!.form).toBeUndefined();

    const rec = rows()[0];
    const labels = [
      ...list.rowActions(rec, makeCtx()).map((a) => a.label ?? ""),
      ...(detail.actions?.(rec, makeCtx()) ?? []).map((a) => a.label ?? ""),
    ];
    for (const l of labels) {
      expect(l.toLowerCase()).not.toMatch(/edit|delete|แก้ไข|ลบ/);
    }
  });
});

/* ============================================================
   Detail
   ============================================================ */

describe("Price List Master — detail", () => {
  const ok = () => rows().find((r) => r.status === "OK" && r.cost_thb)!;

  it("declares the tabs the plan set out", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "tiers",
      "margin",
      "validation",
      "catalog",
      "promo",
      "record",
    ]);
  });

  it("heads the record with its status and price source", () => {
    const r = ok();
    const id = detail.identity(r);
    expect(id.code).toBe(r.product_code);
    expect(id.badges.map((b) => b.text)).toContain(r.status);
    expect(id.badges.map((b) => b.text)).toContain(r.price_source);
  });

  it("puts the four tiers on the first tab in order", () => {
    const cards = detail.tabs[0].blocks(ok(), makeCtx()).filter(Boolean).find(
      (b) => b && b.type === "cards",
    ) as { items: { label: string }[] };
    expect(cards.items.map((i) => i.label)).toEqual([
      "ราคาราชการ",
      "ราคาเอกชน",
      "ราคา Dealer",
      "Last Price",
    ]);
  });

  it("says outright that a row with no cost must not be sold", () => {
    const pending = rows().find((r) => r.status === "PENDING_COST")!;
    const blocks = detail.tabs[0].blocks(pending, makeCtx()).filter(Boolean);
    const alert = blocks.find((b) => b && b.type === "alert") as { tone: string; title: string };
    expect(alert.tone).toBe("danger");
    expect(alert.title).toMatch(/ห้ามขาย/);
  });

  it("warns that the catalogue net price is not a selling price", () => {
    const withNet = rows().find((r) => r.catalog_net_price)!;
    const promo = detail.tabs.find((t) => t.key === "promo")!.blocks(withNet, makeCtx());
    const alert = promo.filter(Boolean).find((b) => b && b.type === "alert") as { message: string };
    expect(alert.message).toMatch(/ห้ามนำมาตั้งเป็นราคาขาย/);
  });

  it("lists the other rows sharing a duplicated code", () => {
    const dupe = rows().find((r) => r.duplicateCode)!;
    const titles = titlesOf(detail.tabs.find((t) => t.key === "validation")!.blocks(dupe, makeCtx()));
    expect(titles.some((t) => t.includes(dupe.product_code))).toBe(true);
  });

  it("opens a row that has no product code at all", () => {
    const nameless = rows().find((r) => r.missingCode)!;
    render(<FullDetail schema={detail} record={nameless} />);
    expect(screen.getAllByText(nameless.product_name).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ไม่มีรหัสสินค้า").length).toBeGreaterThan(0);
  });
});

/* ============================================================
   Wiring
   ============================================================ */

describe("Price List Master — navigation", () => {
  it("is registered read-only under its own key", () => {
    expect(REGISTRY["price-list-master"]).toBeDefined();
    expect(getSchemas("price-list-master")!.form).toBeUndefined();
  });

  it("sits in Master Data beside the policy list", () => {
    const group = NAV.find((g) => g.label === "Master Data")!;
    const labels = group.items.map((i) => i.label);
    expect(labels).toContain("Price List Master");
    expect(pageHref("Price List Master")).toBe("/m/price-list-master");
  });

  it("renames the older module to what it actually holds", () => {
    /* One is pricing policy and priority, the other is the price per SKU.
       Two things called "Price List" was the confusion worth removing. */
    const group = NAV.find((g) => g.label === "Master Data")!;
    expect(group.items.map((i) => i.label)).toContain("Price Policy");
    expect(pageHref("Price Policy")).toBe("/m/price-list");
    expect(getSchemas("price-list")!.list.title).toBe("Price Policy");
  });

  it("keeps the two modules separate", () => {
    /* Different sources, different records — merging them was explicitly
       deferred. */
    expect(getSchemas("price-list")!.list.source()).not.toBe(
      getSchemas("price-list-master")!.list.source(),
    );
  });
});
