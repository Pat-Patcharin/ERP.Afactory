import { describe, expect, it } from "vitest";
import {
  PRICING,
  ensurePricing,
  impliedUnitPrice,
  sellableUnits,
  winningLine,
} from "@/lib/domain/pricing";
import { getProduct, unitFactor } from "@/lib/domain/product";

/* ============================================================
   PRICE LINE — keyed at (list × product × unit)

   Phase 1 of the master-data plan. The line gains the unit it is
   quoted for and its own volume ladder; nothing has been removed
   from the product yet, so both still hold a price and the line
   is the one that is right.
   ============================================================ */

const CODE = "AA-TH003-WL";

describe("บรรทัดราคา — หน่วยขายเป็นส่วนหนึ่งของ key", () => {
  it("หน่วยที่ขายได้ = หน่วยหลัก + หน่วยขายที่ยังใช้งาน", () => {
    const p = getProduct(CODE)!;
    const units = sellableUnits(p);

    /* The stock unit is always sellable and always leads, because every
       other factor is counted in it. */
    expect(units[0]).toEqual({ unit: p.unit, factor: 1 });
    expect(units.map((u) => u.unit)).toContain("Box");
  });

  it("ไม่เสนอหน่วยซื้ออย่างเดียวให้ตั้งราคาขาย", () => {
    /* AA-TH003-WL is received by the Carton and sold by the Box. Quoting a
       customer per Carton would be a price nobody can order at. */
    const p = getProduct(CODE)!;
    const carton = p.detail.units.find((u) => u.unit === "Carton")!;
    expect(carton.type).toBe("Purchase Unit");
    expect(sellableUnits(p).map((u) => u.unit)).not.toContain("Carton");
  });

  it("สร้างบรรทัดหนึ่งเส้นต่อ (รายการราคา × หน่วย)", () => {
    delete PRICING[CODE];
    const lines = ensurePricing(CODE);
    const p = getProduct(CODE)!;

    const lists = [...new Set(lines.map((l) => l.priceList))];
    const units = sellableUnits(p).map((u) => u.unit);
    expect(lists.length).toBeGreaterThan(0);

    for (const list of lists) {
      const forList = lines.filter((l) => l.priceList === list);
      expect(forList.map((l) => l.unit).sort(), list).toEqual([...units].sort());
    }

    /* One line per pair, never two. */
    const keys = lines.map((l) => `${l.priceList}·${l.unit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ราคาหน่วยใหญ่ตั้งต้นที่ผลคูณ แล้วแก้ต่อได้", () => {
    delete PRICING[CODE];
    const lines = ensurePricing(CODE);
    const p = getProduct(CODE)!;

    const base = lines.find((l) => l.priceList === "PL-STD-2026" && l.unit === p.unit)!;
    const box = lines.find((l) => l.priceList === "PL-STD-2026" && l.unit === "Box")!;
    expect(box.price).toBe(base.price * unitFactor(p, "Box"));

    /* Seeded, not derived: the box price is its own field and editing it
       leaves the tube price alone. */
    box.price = 1_320;
    expect(lines.find((l) => l.id === base.id)!.price).toBe(base.price);
  });

  it("บอกส่วนต่างจากผลคูณ ให้เห็นว่าลดไปเท่าไหร่", () => {
    delete PRICING[CODE];
    const lines = ensurePricing(CODE);
    const p = getProduct(CODE)!;

    const base = lines.find((l) => l.priceList === "PL-STD-2026" && l.unit === p.unit)!;
    const box = lines.find((l) => l.priceList === "PL-STD-2026" && l.unit === "Box")!;

    /* The stock unit has nothing to be compared against. */
    expect(impliedUnitPrice(lines, base, p)).toBeNull();
    expect(impliedUnitPrice(lines, box, p)).toBe(base.price * 12);

    box.price = base.price * 11;
    expect(impliedUnitPrice(lines, box, p)).toBe(base.price * 12);
  });

  it("ขั้นบันไดตามจำนวนย้ายมาอยู่บนบรรทัดราคามาตรฐานหน่วยหลัก", () => {
    delete PRICING[CODE];
    const lines = ensurePricing(CODE);
    const p = getProduct(CODE)!;

    const base = lines.find((l) => l.priceList === "PL-STD-2026" && l.unit === p.unit)!;
    expect(base.qtyBreaks.length).toBe(p.detail.tiers.length);

    /* It is a fact about that one price, not about every list and unit —
       copying it onto all of them would be the same drift in a new place. */
    for (const l of lines) {
      if (l === base) continue;
      expect(l.qtyBreaks, `${l.priceList} · ${l.unit}`).toEqual([]);
    }
  });

  it("ตัวเลือกราคาที่ชนะยังทำงานเหมือนเดิม", () => {
    delete PRICING[CODE];
    const lines = ensurePricing(CODE);
    const win = winningLine(lines);
    expect(win).not.toBeNull();
    expect(win!.status).toBe("Active");
    expect(win!.unit).toBeTruthy();
  });

  it("ทุกบรรทัดที่ seed ไว้มีหน่วยและช่องขั้นบันได", () => {
    for (const [code, lines] of Object.entries(PRICING)) {
      for (const l of lines) {
        expect(l.unit, `${code} · ${l.id}`).toBeTruthy();
        expect(Array.isArray(l.qtyBreaks), `${code} · ${l.id}`).toBe(true);
      }
    }
  });
});
