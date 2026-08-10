import { describe, expect, it } from "vitest";
import {
  BASE_UNIT,
  PRODUCTS,
  conversionText,
  getProduct,
  toBaseQty,
  unitFactor,
} from "@/lib/domain/product";
import { BUSINESS_PARTNERS, splitPackedUnit, supplyTermsFor } from "@/lib/domain/partner";

/* ============================================================
   THREE UNITS, ONE ARITHMETIC

   Stock unit is what the warehouse counts. Purchase unit is what
   a supplier ships, per supplier. Sales unit is what a customer
   can order. Everything converts through the stock unit, and the
   factor that does it is a NUMBER — which is the whole point of
   this suite, because it used to be a sentence.
   ============================================================ */

describe("หน่วยนับ — ตัวคูณเป็นตัวเลข ไม่ใช่ข้อความ", () => {
  it("ไม่มีสินค้าไหนเหลือ conv ที่เป็นข้อความ", () => {
    for (const p of PRODUCTS) {
      for (const u of p.detail.units) {
        expect(typeof u.factor, `${p.code} · ${u.unit}`).toBe("number");
        expect(u.factor, `${p.code} · ${u.unit}`).toBeGreaterThan(0);
        expect(u, `${p.code} · ${u.unit}`).not.toHaveProperty("conv");
      }
    }
  });

  it("หน่วยหลักคูณหนึ่งเสมอ และเป็นแถวแรก", () => {
    for (const p of PRODUCTS) {
      const first = p.detail.units[0];
      if (!first) continue;
      expect(first.type, p.code).toBe(BASE_UNIT);
      expect(first.unit, p.code).toBe(p.unit);
      expect(first.factor, p.code).toBe(1);
      expect(unitFactor(p, p.unit), p.code).toBe(1);
    }
  });

  it("แปลงหน่วยขายกลับเป็นหน่วยที่คลังนับได้", () => {
    /* AA-TH003-WL is counted in Tube, sold by the Box of 12 and bought by
       the Carton of 120. Selling two boxes must take 24 tubes off the shelf,
       which is the sum the free-text field could never be asked for. */
    const p = getProduct("AA-TH003-WL")!;
    expect(p.unit).toBe("Tube");
    expect(unitFactor(p, "Box")).toBe(12);
    expect(unitFactor(p, "Carton")).toBe(120);
    expect(toBaseQty(2, unitFactor(p, "Box"))).toBe(24);
    expect(toBaseQty(2, unitFactor(p, "Carton"))).toBe(240);
  });

  it("หน่วยที่ไม่รู้จักคูณหนึ่ง ไม่ใช่ศูนย์", () => {
    /* Zero would silently multiply a receipt down to nothing, which is worse
       than treating an unknown unit as the stock unit and being visibly
       wrong by a factor nobody applied. */
    const p = getProduct("AA-TH003-WL")!;
    expect(unitFactor(p, "Pallet")).toBe(1);
    expect(unitFactor(p, "")).toBe(1);
    expect(toBaseQty(5, 0)).toBe(5);
    expect(toBaseQty(5, -3)).toBe(5);
  });

  it("ประโยคแปลงหน่วยสร้างจากตัวเลข ไม่ได้พิมพ์คู่กันไว้", () => {
    expect(conversionText("Tube", "Box", 12)).toBe("1 Box = 12 Tube");
    expect(conversionText("Tube", "Carton", 120)).toBe("1 Carton = 120 Tube");
    /* The base unit's own row would otherwise read "1 Tube = 1 Tube". */
    expect(conversionText("Tube", "Tube", 1)).toBe("1 Tube");
    expect(conversionText("Tube", "Box", 1)).toBe("1 Box");
  });
});

describe("หน่วยซื้อ — อยู่กับผู้ขายแต่ละราย", () => {
  it("แยกตัวคูณออกจากชื่อหน่วยที่ seed เดิมเขียนไว้", () => {
    /* The seed wrote "Carton (24 Tube)" — a unit whose name contained the
       arithmetic. Split once on the way in; never parsed at read time. */
    expect(splitPackedUnit("Carton (24 Tube)")).toEqual({ unit: "Carton", factor: 24 });
    expect(splitPackedUnit("Box (10 Tube)")).toEqual({ unit: "Box", factor: 10 });
    /* A unit that never claimed to contain anything converts one for one. */
    expect(splitPackedUnit("Box")).toEqual({ unit: "Box", factor: 1 });
    expect(splitPackedUnit("")).toEqual({ unit: "", factor: 1 });
  });

  it("ทุกแถว supplier item มีตัวคูณที่มากกว่าศูนย์", () => {
    for (const bp of BUSINESS_PARTNERS) {
      for (const i of bp.supplierItems ?? []) {
        expect(i.punit, `${bp.code} · ${i.product}`).toBeTruthy();
        expect(i.punitFactor, `${bp.code} · ${i.product}`).toBeGreaterThan(0);
      }
    }
  });

  it("ชื่อหน่วยซื้อไม่มีตัวเลขห้อยอยู่ในวงเล็บอีกแล้ว", () => {
    for (const bp of BUSINESS_PARTNERS) {
      for (const i of bp.supplierItems ?? []) {
        expect(i.punit, `${bp.code} · ${i.product}`).not.toMatch(/\(\s*\d/);
      }
    }
    for (const p of PRODUCTS) {
      expect(p.sup.punit, p.code).not.toMatch(/\(\s*\d/);
      expect(p.sup.punitFactor, p.code).toBeGreaterThan(0);
    }
  });

  it("ตัวคูณที่บันทึกไว้ชนะการอ่านจากชื่อหน่วย", () => {
    /*
       Both migrations exist — the name-splitter for the oldest records and
       the stated figure for the rest — and for a while they disagreed: the
       splitter saw a plain "Carton", returned 1, and threw away the 24 the
       record stated outright. The stated number wins.
    */
    const p = getProduct("AA-TH003-WL")!;
    expect(p.sup.punit).toBe("Carton");
    expect(p.sup.punitFactor).toBe(24);
    expect(supplyTermsFor("AA-TH003-WL")!.row.punitFactor).toBe(24);
  });

  it("MOQ นับเป็นหน่วยที่คลังนับ ไม่ใช่หน่วยซื้อ", () => {
    /*
       Every recorded minimum was written in the stock unit — "240 Tube" on a
       product bought by the Carton of 24. Rendering that number against the
       purchase unit read "240 Carton": ten times the order, from a label.
    */
    const p = getProduct("AA-TH003-WL")!;
    expect(p.sup.moq).toBe("240 Tube");
    expect(p.sup.moq).not.toContain(p.sup.punit);

    for (const q of PRODUCTS) {
      if (q.sup.moq === "—" || !q.sup.moq) continue;
      expect(q.sup.moq.endsWith(q.unit), `${q.code} · ${q.sup.moq}`).toBe(true);
    }
  });

  it("สินค้าเดียวกันซื้อจากคนละเจ้า ใช้ตัวคูณของเจ้านั้น", () => {
    /*
       This is why the factor sits on the supplier item and not on the
       product: a single figure held on AA-TH003-WL would have to be wrong
       for one of the three companies that supply it.
    */
    const rows = BUSINESS_PARTNERS.flatMap((bp) =>
      (bp.supplierItems ?? [])
        .filter((i) => i.product === "AA-TH003-WL")
        .map((i) => ({ bp: bp.code, punit: i.punit, factor: i.punitFactor })),
    );
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(r.factor, r.bp).toBeGreaterThan(0);

    /* And the product's own summary is that of its default supplier, not an
       average or the first row found. */
    const found = supplyTermsFor("AA-TH003-WL")!;
    const p = getProduct("AA-TH003-WL")!;
    expect(p.sup.punitFactor).toBe(found.row.punitFactor);
    expect(p.sup.punit).toBe(found.row.punit);
  });
});
