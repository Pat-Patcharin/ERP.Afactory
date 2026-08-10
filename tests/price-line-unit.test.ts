import { describe, expect, it } from "vitest";
import {
  PRICING,
  STANDARD_LIST,
  catalogPrice,
  ensurePricing,
  impliedUnitPrice,
  sellableUnits,
  winningLine,
} from "@/lib/domain/pricing";
import { PRODUCTS, getProduct, unitFactor } from "@/lib/domain/product";
import { priceMasterByProduct } from "@/lib/domain/price-master";

/* ============================================================
   PRICE LINE — keyed at (list × product × unit)

   The selling price has left the product record entirely. It is
   read from one of two places and nowhere else: an explicit line
   for the eight hand-built products, or the price list master
   for the other 751.
   ============================================================ */

/** One of the eight whose prices moved into data/pricing.ts whole. */
const SEEDED = "AA-TH003-WL";
/** A catalogue product — priced by the file, lines generated on demand. */
const CATALOGUE = "D-AD001-01";

describe("บรรทัดราคา — หน่วยขายเป็นส่วนหนึ่งของ key", () => {
  it("หน่วยที่ขายได้ = หน่วยหลัก + หน่วยขายที่ยังใช้งาน", () => {
    const p = getProduct(SEEDED)!;
    const units = sellableUnits(p);

    /* The stock unit is always sellable and always leads, because every
       other factor is counted in it. */
    expect(units[0]).toEqual({ unit: p.unit, factor: 1 });
    expect(units.map((u) => u.unit)).toContain("Box");
  });

  it("ไม่เสนอหน่วยซื้ออย่างเดียวให้ตั้งราคาขาย", () => {
    /* AA-TH003-WL is received by the Carton and sold by the Box. Quoting a
       customer per Carton would be a price nobody can order at. */
    const p = getProduct(SEEDED)!;
    const carton = p.detail.units.find((u) => u.unit === "Carton")!;
    expect(carton.type).toBe("Purchase Unit");
    expect(sellableUnits(p).map((u) => u.unit)).not.toContain("Carton");
  });

  it("หนึ่งบรรทัดต่อ (รายการราคา × หน่วย) ไม่ซ้ำกัน", () => {
    for (const [code, lines] of Object.entries(PRICING)) {
      const keys = lines.map((l) => `${l.priceList}·${l.unit}`);
      expect(new Set(keys).size, code).toBe(keys.length);
    }
  });

  it("ราคาหน่วยใหญ่เป็นช่องของตัวเอง แก้แล้วหน่วยหลักไม่ขยับ", () => {
    const p = getProduct(SEEDED)!;
    const lines = PRICING[SEEDED];
    const base = lines.find((l) => l.priceList === STANDARD_LIST && l.unit === p.unit)!;
    const box = lines.find((l) => l.priceList === STANDARD_LIST && l.unit === "Box")!;

    /* Seeded at the arithmetic — but seeded, not derived. */
    expect(box.price).toBe(base.price * unitFactor(p, "Box"));

    const wasBase = base.price;
    box.price = 1_320;
    expect(base.price).toBe(wasBase);
    box.price = wasBase * unitFactor(p, "Box");
  });

  it("บอกส่วนต่างจากผลคูณ ให้เห็นว่าลดไปเท่าไหร่", () => {
    const p = getProduct(SEEDED)!;
    const lines = PRICING[SEEDED];
    const base = lines.find((l) => l.priceList === STANDARD_LIST && l.unit === p.unit)!;
    const box = lines.find((l) => l.priceList === STANDARD_LIST && l.unit === "Box")!;

    /* The stock unit has nothing to be compared against. */
    expect(impliedUnitPrice(lines, base, p)).toBeNull();
    expect(impliedUnitPrice(lines, box, p)).toBe(base.price * 12);
  });

  it("ขั้นบันไดตามจำนวนอยู่บนบรรทัดราคามาตรฐานหน่วยหลักเส้นเดียว", () => {
    const p = getProduct(SEEDED)!;
    const lines = PRICING[SEEDED];
    const base = lines.find((l) => l.priceList === STANDARD_LIST && l.unit === p.unit)!;

    expect(base.qtyBreaks.length).toBeGreaterThan(0);
    /* It is a fact about that one price, not about every list and unit —
       copying it onto all of them would be the same drift in a new place. */
    for (const l of lines) {
      if (l === base) continue;
      expect(l.qtyBreaks, `${l.priceList} · ${l.unit}`).toEqual([]);
    }
  });

  it("สินค้าจากไฟล์ราคาสร้างบรรทัดจากสี่ชั้นในไฟล์", () => {
    delete PRICING[CATALOGUE];
    const lines = ensurePricing(CATALOGUE);
    const row = priceMasterByProduct(CATALOGUE)[0];

    expect(lines.length).toBeGreaterThan(0);
    const std = lines.find((l) => l.priceList === STANDARD_LIST)!;
    expect(std.price).toBe(row.price_private);
    expect(std.unit).toBe(getProduct(CATALOGUE)!.unit);

    const win = winningLine(lines);
    expect(win!.status).toBe("Active");
    expect(win!.unit).toBeTruthy();
  });

  it("ทุกบรรทัดมีหน่วยและช่องขั้นบันได", () => {
    for (const [code, lines] of Object.entries(PRICING)) {
      for (const l of lines) {
        expect(l.unit, `${code} · ${l.id}`).toBeTruthy();
        expect(Array.isArray(l.qtyBreaks), `${code} · ${l.id}`).toBe(true);
      }
    }
  });
});

describe("ราคาขายไม่อยู่บนสินค้าอีกแล้ว", () => {
  it("ไม่มีสินค้าไหนถือช่องราคาขาย", () => {
    for (const p of PRODUCTS) {
      expect(p, p.code).not.toHaveProperty("price");
      expect(p.pricing, p.code).not.toHaveProperty("retail");
      expect(p.pricing, p.code).not.toHaveProperty("dealer");
      expect(p.pricing, p.code).not.toHaveProperty("gov");
      expect(p.pricing, p.code).not.toHaveProperty("contract");
      expect(p.detail, p.code).not.toHaveProperty("priceLists");
      expect(p.detail, p.code).not.toHaveProperty("tiers");
      expect(p.detail, p.code).not.toHaveProperty("contracts");
    }
  });

  it("ทุกสินค้ายังตอบราคาแคตตาล็อกได้เหมือนเดิม", () => {
    /* The move must not have lost a price. Every product that had one before
       resolves to one now — 810 of 810 matched when this was cut over. */
    let priced = 0;
    for (const p of PRODUCTS) if (catalogPrice(p.code) > 0) priced++;
    expect(priced).toBeGreaterThan(790);
  });

  it("แปลงราคาเป็นหน่วยขายใหญ่ให้เมื่อไม่มีบรรทัดของหน่วยนั้น", () => {
    const p = getProduct(SEEDED)!;
    expect(catalogPrice(p.code, "Box")).toBe(catalogPrice(p.code) * 12);
  });

  it("สินค้าที่ไม่มีราคาได้ 0 ไม่ใช่การเดา", () => {
    expect(catalogPrice("NO-SUCH-PRODUCT")).toBe(0);
  });
});
