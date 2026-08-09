import { describe, expect, it } from "vitest";

import { PROVINCES, BKK_DISTRICTS, THAI_PROVINCES, resolveSalesArea } from "@/data/sales-areas";
import {
  THAI_GEOGRAPHY_META,
  districtsOf,
  geographyProvinces,
  postalCodeOf,
  subdistrictsOf,
} from "@/lib/domain/thai-address";
import { BP_FORM } from "@/schemas/forms/business-partner";
import { BUSINESS_PARTNERS } from "@/lib/domain/partner";

/* ============================================================
   จังหวัด › อำเภอ › ตำบล

   The address form asked for อำเภอ and ตำบล as free text outside
   Bangkok, because the only district list in the repo was the
   fifty เขต the sales area master needs. Fifty of 928, and no
   tambon anywhere.

   The gap was closed by retrieving a dataset, not by writing one
   out — an invented amphoe reads exactly like a real one, and
   the cost of being wrong is a lorry at the wrong address.

   Which makes the first test here the important one: this data
   came from outside, so what it has to earn is agreement with
   what the application already believed. A dataset that quietly
   spells a province differently would not fail loudly; it would
   put addresses in a sales area that does not exist.
   ============================================================ */

describe("the geography data agrees with what the app already knew", () => {
  it("carries every province the sales area master does, spelled the same", () => {
    expect(geographyProvinces().length).toBe(77);
    expect([...geographyProvinces()].sort()).toEqual([...THAI_PROVINCES].sort());
    /* PROVINCES is what the form offers; it is derived from the area master. */
    for (const p of PROVINCES) expect(districtsOf(p).length, p).toBeGreaterThan(0);
  });

  it("carries Bangkok's fifty districts, spelled the same as the area master", () => {
    expect([...districtsOf("กรุงเทพมหานคร")].sort()).toEqual([...BKK_DISTRICTS].sort());
  });

  /**
   * The reason the spellings matter, stated as a test rather than a comment.
   * A Bangkok address only resolves to one of the four BKK areas through its
   * district, matched by string.
   */
  it("lets an address filled from these lists still resolve to a sales area", () => {
    for (const d of districtsOf("กรุงเทพมหานคร")) {
      expect(resolveSalesArea("กรุงเทพมหานคร", d), d).not.toBeNull();
    }
    expect(resolveSalesArea("เชียงใหม่")).not.toBeNull();
  });

  it("counts what it says it counts", () => {
    const districts = geographyProvinces().reduce((t, p) => t + districtsOf(p).length, 0);
    const subs = geographyProvinces().reduce(
      (t, p) => t + districtsOf(p).reduce((u, d) => u + subdistrictsOf(p, d).length, 0),
      0,
    );
    expect(districts).toBe(THAI_GEOGRAPHY_META.counts.districts);
    expect(subs).toBe(THAI_GEOGRAPHY_META.counts.subdistricts);
    /* Rounded landmarks, so a truncated file cannot pass by agreeing with
       its own header. */
    expect(districts).toBe(928);
    expect(subs).toBeGreaterThan(7000);
  });

  it("names its source, because a retrieved dataset has to say where it is from", () => {
    expect(THAI_GEOGRAPHY_META.source).toBeTruthy();
    expect(THAI_GEOGRAPHY_META.retrieved).toBeTruthy();
  });
});

describe("each list is drawn from the one above it", () => {
  it("gives a province its own districts and nobody else's", () => {
    expect(districtsOf("เชียงใหม่")).toContain("เมืองเชียงใหม่");
    expect(districtsOf("เชียงใหม่")).not.toContain("เมืองขอนแก่น");
    /* No province chosen yet — nothing to offer, rather than all 928. */
    expect(districtsOf("")).toEqual([]);
    expect(districtsOf("Hanoi")).toEqual([]);
  });

  it("gives a district its own subdistricts", () => {
    expect(subdistrictsOf("เชียงใหม่", "เมืองเชียงใหม่")).toContain("สุเทพ");
    expect(subdistrictsOf("เชียงใหม่", "")).toEqual([]);
    /* A real district under the wrong province resolves to nothing. */
    expect(subdistrictsOf("ขอนแก่น", "เมืองเชียงใหม่")).toEqual([]);
  });

  it("knows the postal code once the address reaches a subdistrict", () => {
    expect(postalCodeOf("เชียงใหม่", "เมืองเชียงใหม่", "สุเทพ")).toBe("50200");
    /* A district covers several codes, so there is no answer above tambon. */
    expect(postalCodeOf("เชียงใหม่", "เมืองเชียงใหม่", "")).toBe("");
  });

  it("offers the right lists per row, not one list for the column", () => {
    const step = BP_FORM.steps.find((s) => s.key === "addresses")!;
    const grid = step.blocks({} as never).find((b) => b && b.type === "grid")! as never as {
      cols: { key: string; optionsFor?: (r: Record<string, unknown>) => string[] }[];
    };
    const dist = grid.cols.find((c) => c.key === "dist")!;
    const sub = grid.cols.find((c) => c.key === "sub")!;

    expect(dist.optionsFor!({ prov: "ขอนแก่น" })).toContain("เมืองขอนแก่น");
    expect(dist.optionsFor!({ prov: "ภูเก็ต" })).not.toContain("เมืองขอนแก่น");
    expect(sub.optionsFor!({ prov: "ขอนแก่น", dist: "เมืองขอนแก่น" })).toContain("ในเมือง");
  });
});

describe("changing a parent clears what no longer belongs under it", () => {
  it("drops the district and the subdistrict when the province changes", () => {
    const state = {
      addresses: [
        {
          type: "Head Office",
          country: "ประเทศไทย",
          prov: "ขอนแก่น",
          dist: "เมืองเชียงใหม่",
          sub: "สุเทพ",
        },
      ],
    };
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].dist, "a Chiang Mai district under Khon Kaen").toBe("");
    expect(state.addresses[0].sub).toBe("");
  });

  it("drops only the subdistrict when the district changes", () => {
    const state = {
      addresses: [
        {
          type: "Head Office",
          country: "ประเทศไทย",
          prov: "เชียงใหม่",
          dist: "เมืองเชียงใหม่",
          sub: "ในเมือง",
        },
      ],
    };
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].dist, "the district is still valid").toBe("เมืองเชียงใหม่");
    expect(state.addresses[0].sub).toBe("");
  });

  it("keeps a valid Thai address exactly as it is", () => {
    const state = {
      addresses: [
        {
          type: "Head Office",
          country: "ประเทศไทย",
          prov: "เชียงใหม่",
          dist: "เมืองเชียงใหม่",
          sub: "สุเทพ",
        },
      ],
    };
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].dist).toBe("เมืองเชียงใหม่");
    expect(state.addresses[0].sub).toBe("สุเทพ");
  });

  /**
   * The one that is easy to get wrong: abroad, these same three fields are
   * free text. Checking a Vietnamese address against the Thai list would
   * empty it, and the partner's address would disappear on an unrelated edit.
   */
  it("leaves a foreign address alone", () => {
    const state = {
      addresses: [
        {
          type: "Manufacturer",
          country: "เวียดนาม",
          prov: "Hanoi",
          dist: "Ba Dinh",
          sub: "Ngoc Ha",
        },
      ],
    };
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].prov).toBe("Hanoi");
    expect(state.addresses[0].dist).toBe("Ba Dinh");
    expect(state.addresses[0].sub).toBe("Ngoc Ha");
  });

  it("leaves every seeded partner address standing", () => {
    /* If the retrieved data disagreed with the addresses already on record,
       loading the module would quietly blank them on the first edit. */
    for (const bp of BUSINESS_PARTNERS) {
      for (const a of bp.addresses ?? []) {
        if (a.country && a.country !== "ประเทศไทย") continue;
        expect(districtsOf(a.prov), `${bp.code} ${a.prov}`).toContain(a.dist);
        expect(subdistrictsOf(a.prov, a.dist), `${bp.code} ${a.dist}`).toContain(a.sub);
      }
    }
  });
});
