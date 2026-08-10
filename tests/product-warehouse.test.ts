import { describe, expect, it } from "vitest";
import {
  PRODUCTS,
  defaultReceivingWarehouse,
  getProduct,
  isStocked,
  productWarehouses,
  storageWarning,
  warehouseRop,
} from "@/lib/domain/product";
import { supplierOffers } from "@/lib/domain/partner";
import { WAREHOUSES } from "@/lib/domain/warehouse";

/* ============================================================
   PRODUCT × WAREHOUSE, and PRODUCT × SUPPLIER

   The two links the product master was missing. A balance says
   where the goods ARE; the policy says where they MAY BE, and
   only the second can be answered before any stock exists.
   ============================================================ */

const STOCKED = "AA-TH003-WL";

describe("คลังที่เก็บสินค้าได้ — นโยบาย ไม่ใช่ยอดคงเหลือ", () => {
  it("สินค้าที่เคยมีของ ได้สิทธิ์เก็บที่คลังนั้น", () => {
    const p = getProduct(STOCKED)!;
    const policy = productWarehouses(p).map((w) => w.wh);

    expect(policy.length).toBeGreaterThan(0);
    /* Seeded from the balances, because a warehouse that has held the item
       is one that may — the policy existed, it was just never written where
       a screen could read it. */
    for (const s of p.stocks) expect(policy, s.wh).toContain(s.wh);
  });

  it("สินค้าจากไฟล์ราคายังไม่มีคลังไหนรับได้ ซึ่งเป็นความจริง", () => {
    const catalogue = PRODUCTS.find((p) => p.priceRef && !isStocked(p))!;
    expect(productWarehouses(catalogue)).toEqual([]);
    expect(defaultReceivingWarehouse(catalogue)).toBe("");
  });

  it("มีคลังรับเข้าตั้งต้นหนึ่งคลังต่อสินค้า", () => {
    for (const p of PRODUCTS) {
      const rows = productWarehouses(p);
      if (!rows.length) continue;
      expect(rows.filter((w) => w.defaultReceiving).length, p.code).toBeLessThanOrEqual(1);
      expect(defaultReceivingWarehouse(p), p.code).toBeTruthy();
    }
  });
});

describe("จุดสั่งซื้อรายคลัง", () => {
  it("คลังที่ตั้งตัวเลขเอง ใช้ตัวเลขของตัวเอง", () => {
    const p = getProduct(STOCKED)!;
    const wh = productWarehouses(p)[0]!;

    const was = wh.rop;
    wh.rop = 42;
    expect(warehouseRop(p, wh.wh)).toBe(42);
    wh.rop = was;
  });

  it("ศูนย์บนแถวนโยบายแปลว่ายังไม่ได้ตั้ง จึงใช้ Min ของสินค้า", () => {
    /*
       This used to read the other way: 0 meant "this store never reorders".
       The product form stopped asking for a level per warehouse — Min and Max
       are one rule for the item — so a zero on a row is now an unanswered
       question rather than an answer, and the product's Min applies.

       A row that carries its own figure still wins, which is what keeps the
       seeded per-store levels working.
    */
    const p = getProduct(STOCKED)!;
    const wh = productWarehouses(p)[0]!;
    const was = wh.rop;

    wh.rop = 0;
    expect(warehouseRop(p, wh.wh)).toBe(p.lowLevel);

    wh.rop = 25;
    expect(warehouseRop(p, wh.wh)).toBe(25);
    wh.rop = was;
  });

  it("คลังที่ไม่มีในนโยบายใช้ค่าตั้งต้นของสินค้า", () => {
    const p = getProduct(STOCKED)!;
    expect(warehouseRop(p, "WH-99 ไม่มีจริง")).toBe(p.lowLevel);
  });

  it("รับค่าจุดสั่งซื้อรายคลังที่มีอยู่เดิมมา ไม่ใช่ทับด้วยค่าตั้งต้น", () => {
    /* 200 / 100 / 0 existed in the seed and every screen showed 200 three times
       over the top of them. */
    const p = getProduct(STOCKED)!;
    const rops = productWarehouses(p).map((w) => w.rop);
    expect(new Set(rops).size, "คลังต่างกันต้องมีจุดสั่งซื้อต่างกันได้").toBeGreaterThan(1);
  });

  it("ตารางคลังบนหน้ารายละเอียดอ่านจุดสั่งซื้อรายคลัง", () => {
    /* This column used to render `p.lowLevel` for every row, so a table of
       four warehouses showed one figure four times and called it per-warehouse. */
    const p = getProduct(STOCKED)!;
    for (const r of p.detail.whRows) {
      expect(r.rop, r.wh).toBe(warehouseRop(p, r.wh));
    }
  });
});

describe("เงื่อนไขการเก็บ — ตรวจจากข้อมูลที่มีอยู่แล้ว", () => {
  it("เตือนเมื่อสินค้าแช่เย็นถูกผูกกับคลังอุณหภูมิห้อง", () => {
    const ambient = WAREHOUSES.find((w) => /ambient/i.test(w.rules.temp))!;
    const cold = WAREHOUSES.find((w) => /cold/i.test(w.rules.temp));

    const warn = storageWarning("แช่เย็น (2–8°C)", `${ambient.code} ${ambient.name}`);
    expect(warn).toBeTruthy();
    expect(warn).toContain(ambient.rules.temp);

    if (cold) {
      expect(storageWarning("แช่เย็น (2–8°C)", `${cold.code} ${cold.name}`)).toBeNull();
    }
  });

  it("ไม่เตือนสินค้าที่เก็บอุณหภูมิห้อง หรือที่ไม่ได้ระบุ", () => {
    const ambient = WAREHOUSES.find((w) => /ambient/i.test(w.rules.temp))!;
    const wh = `${ambient.code} ${ambient.name}`;
    expect(storageWarning("อุณหภูมิห้อง (15–30°C)", wh)).toBeNull();
    expect(storageWarning("", wh)).toBeNull();
    expect(storageWarning("แช่เย็น (2–8°C)", "WH-99 ไม่มีจริง")).toBeNull();
  });
});

describe("ต้นทุนต่อผู้ขาย แปลงเป็นหน่วยที่คลังนับ", () => {
  it("แปลงราคาต่อหน่วยซื้อกลับเป็นหน่วยหลัก", () => {
    /*
       The comparison that could not be made before: one supplier quotes per
       Carton of 24 and another per Tube, and the two numbers mean nothing
       side by side until the pack size is divided out.
    */
    const offers = supplierOffers(STOCKED);
    expect(offers.length).toBeGreaterThan(1);

    for (const o of offers) {
      expect(o.punitFactor, o.partner).toBeGreaterThan(0);
      expect(o.costPerBase, o.partner).toBeCloseTo(o.price / o.punitFactor, 2);
    }

    const packed = offers.find((o) => o.punitFactor > 1);
    if (packed) expect(packed.costPerBase).toBeLessThan(packed.price);
  });

  it("ผู้ขายหลักขึ้นก่อน แล้วเรียงตามต้นทุนต่อหน่วยหลัก", () => {
    const offers = supplierOffers(STOCKED);
    const preferred = offers.filter((o) => o.preferred);
    if (preferred.length) expect(offers[0].preferred).toBe(true);

    const rest = offers.filter((o) => !o.preferred);
    for (let i = 1; i < rest.length; i++) {
      expect(rest[i - 1].costPerBase).toBeLessThanOrEqual(rest[i].costPerBase);
    }
  });

  it("สินค้าที่ไม่มีผู้ขายได้ลิสต์ว่าง ไม่ใช่ error", () => {
    expect(supplierOffers("NO-SUCH-PRODUCT")).toEqual([]);
  });
});
