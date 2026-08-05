import { describe, expect, it } from "vitest";
import {
  AREA_BY_DISTRICT,
  BANGKOK,
  BKK_DISTRICTS,
  PROVINCES,
  SALES_AREAS,
  SALES_AREA_GROUPS,
  SHARED_PROVINCES,
  THAI_PROVINCES,
  UNCOVERED_PROVINCES,
  inSalesArea,
  provincesOfArea,
  resolveSalesArea,
  salesArea,
} from "@/data/sales-areas";
import { SALES_REPRESENTATIVES } from "@/lib/domain/sales";
import { BUSINESS_PARTNERS } from "@/lib/domain/partner";
import { DASH } from "@/lib/format";

/* ============================================================
   SALES AREA MASTER

   The territory sheet is the kind of data that breaks quietly: drop a
   province while editing and nothing throws, the province simply stops
   being sellable. These assertions re-derive the partition instead of
   trusting it.
   ============================================================ */

describe("Sales Area master — the partition", () => {
  it("holds the fourteen areas from the sheet, in three groups", () => {
    expect(SALES_AREAS).toHaveLength(14);
    expect(SALES_AREAS.filter((a) => a.group === "BKK").map((a) => a.code)).toEqual([
      "BKK1",
      "BKK2",
      "BKK3",
      "BKK4",
    ]);
    expect(new Set(SALES_AREAS.map((a) => a.group))).toEqual(
      new Set(SALES_AREA_GROUPS.map((g) => g.key)),
    );
  });

  it("covers all 77 provinces with no province left out", () => {
    expect(UNCOVERED_PROVINCES).toEqual([]);
    expect(PROVINCES).toHaveLength(77);
    expect([...PROVINCES].sort()).toEqual([...THAI_PROVINCES].sort());
  });

  it("gives every province exactly one area", () => {
    expect(SHARED_PROVINCES).toEqual([]);
    const owned = SALES_AREAS.flatMap((a) => a.provinces);
    expect(owned).toHaveLength(new Set(owned).size);
    /* 76 owned + Bangkok, which is split by district instead. */
    expect(owned).toHaveLength(76);
    expect(owned).not.toContain(BANGKOK);
  });

  it("splits all 50 Bangkok districts across the four BKK areas", () => {
    expect(BKK_DISTRICTS).toHaveLength(50);
    expect(Object.keys(AREA_BY_DISTRICT)).toHaveLength(50);
    expect(SALES_AREAS.filter((a) => a.districts.length).map((a) => a.code)).toEqual([
      "BKK1",
      "BKK2",
      "BKK3",
      "BKK4",
    ]);
  });

  it("keeps the two corrections applied to the source sheet", () => {
    /* ชัยนาท and อุทัยธานี were listed under เหนือล่าง as well. */
    expect(salesArea("C-UP")!.provinces).toEqual(
      expect.arrayContaining(["ชัยนาท", "อุทัยธานี", "สุพรรณบุรี"]),
    );
    expect(salesArea("N-LOW")!.provinces).not.toContain("ชัยนาท");
    expect(salesArea("N-LOW")!.provinces).not.toContain("อุทัยธานี");
  });
});

describe("Sales Area master — resolving an address", () => {
  it("places an upcountry address by its province", () => {
    expect(resolveSalesArea("ภูเก็ต")?.code).toBe("S-LOW");
    expect(resolveSalesArea("ขอนแก่น")?.code).toBe("NE-MID");
    expect(resolveSalesArea("สุพรรณบุรี")?.code).toBe("C-UP");
  });

  it("places a Bangkok address by its district", () => {
    expect(resolveSalesArea(BANGKOK, "ทุ่งครุ")?.code).toBe("BKK1");
    expect(resolveSalesArea(BANGKOK, "ห้วยขวาง")?.code).toBe("BKK2");
    expect(resolveSalesArea(BANGKOK, "คลองเตย")?.code).toBe("BKK3");
    expect(resolveSalesArea(BANGKOK, "ลาดกระบัง")?.code).toBe("BKK4");
  });

  it("refuses to guess a Bangkok address with no district", () => {
    expect(resolveSalesArea(BANGKOK)).toBeNull();
  });

  it("does not let a Bangkok district name hijack an upcountry address", () => {
    /* บางพลี is an amphoe of สมุทรปราการ, not a Bangkok district — but the
       province must win regardless of what the district field says. */
    expect(resolveSalesArea("สมุทรปราการ", "บางพลี")?.code).toBe("BKK3");
    expect(resolveSalesArea("เชียงใหม่", "คลองเตย")?.code).toBe("N-UP");
  });

  it("returns null for a province outside the map", () => {
    expect(resolveSalesArea("Tokyo")).toBeNull();
    expect(resolveSalesArea("")).toBeNull();
  });

  it("narrows the province picker to what the area owns", () => {
    expect(provincesOfArea("S-LOW")).toContain("ภูเก็ต");
    expect(provincesOfArea("S-LOW")).not.toContain("เชียงใหม่");
    /* A BKK area can be based in Bangkok itself as well as its province. */
    expect(provincesOfArea("BKK2")).toEqual([BANGKOK, "นนทบุรี"]);
    expect(provincesOfArea("BKK1")).toEqual([BANGKOK]);
    /* No area chosen yet — the full list is the honest answer. */
    expect(provincesOfArea("")).toHaveLength(77);
  });

  it("treats a district-less Bangkok address as inside any BKK area", () => {
    expect(inSalesArea("BKK1", BANGKOK)).toBe(true);
    expect(inSalesArea("BKK1", BANGKOK, "ทุ่งครุ")).toBe(true);
    expect(inSalesArea("BKK2", BANGKOK, "ทุ่งครุ")).toBe(false);
    expect(inSalesArea("N-UP", BANGKOK)).toBe(false);
  });
});

describe("Sales Area master — what the other modules read", () => {
  it("assigns every rep to a real area they are based in", () => {
    for (const r of SALES_REPRESENTATIVES) {
      expect(salesArea(r.area), `${r.code} area ${r.area}`).not.toBeNull();
      expect(inSalesArea(r.area, r.province), `${r.code} ${r.province}`).toBe(true);
      expect(r.areaMatchesProvince, r.code).toBe(true);
    }
  });

  it("decorates a rep with the area name and group", () => {
    const rep = SALES_REPRESENTATIVES.find((r) => r.code === "SALE003")!;
    expect(rep.areaName).toBe("เหนือบน");
    expect(rep.areaGroup).toBe("ตจว เหนือ-อีสาน");
    expect(rep.areaCoverage).toBe("8 จังหวัด");
  });

  it("reports Bangkok coverage as districts, not provinces", () => {
    const rep = SALES_REPRESENTATIVES.find((r) => r.code === "SALE001")!;
    expect(rep.areaName).toBe("BKK1 ฝั่งธน");
    expect(rep.areaCoverage).toBe("21 เขต กทม.");
  });

  it("files every partner under a territory that exists and matches its address", () => {
    const names = new Set(SALES_AREAS.map((a) => a.name));
    for (const b of BUSINESS_PARTNERS) {
      expect(names.has(b.salesArea), `${b.code} territory ${b.salesArea}`).toBe(true);
      expect(b.salesAreaFromAddress, b.code).not.toBe(DASH);
      expect(b.salesAreaMismatch, `${b.code} vs ${b.salesAreaFromAddress}`).toBe(false);
    }
  });
});
