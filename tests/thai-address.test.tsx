import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";

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

  /**
   * Rendered, not called.
   *
   * Every other test here reaches `optionsFor` as a function, which proves the
   * data is right and proves nothing about whether the form uses it. Two whole
   * pieces sit between them — the schema has to declare `optionsFor`, and the
   * grid cell has to prefer it over `options` — and a break in either shows up
   * as a district dropdown that never fills, with every test still green.
   *
   * So this one picks a province in the actual form and looks at the actual
   * <select>.
   */
  it("fills the district dropdown on screen once a province is picked", async () => {
    const user = userEvent.setup();
    render(<MasterForm schema={BP_FORM} />);

    await user.click(screen.getByRole("button", { name: /เพิ่มที่อยู่/ }));

    /* Grid cells caption themselves with a <span>, not a <label for>, so the
       select is found through the caption it sits under. (That the engine
       gives these no accessible name is a real gap — noted in the backlog.) */
    const card = document.getElementById("form-business-partner-addresses")!;
    const cell = (caption: string) => {
      const span = within(card)
        .getAllByText(caption)
        .find((el) => el.tagName === "SPAN")!;
      return within(span.parentElement!).getByRole("combobox") as HTMLSelectElement;
    };

    const province = cell("จังหวัด");
    const district = cell("เขต/อำเภอ");
    /* Nothing to offer until a province says which districts exist. */
    expect(within(district).queryAllByRole("option").length).toBe(1);

    await user.selectOptions(province, "ขอนแก่น");

    const names = within(district)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toContain("เมืองขอนแก่น");
    expect(names).not.toContain("เมืองเชียงใหม่");

    await user.selectOptions(district, "เมืองขอนแก่น");
    const sub = cell("แขวง/ตำบล");
    expect(within(sub).getAllByRole("option").map((o) => o.textContent)).toContain("ในเมือง");
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

  const thaiRow = (over: Record<string, unknown> = {}) => ({
    addresses: [
      {
        type: "Head Office",
        country: "ประเทศไทย",
        prov: "เชียงใหม่",
        dist: "เมืองเชียงใหม่",
        sub: "สุเทพ",
        zip: "",
        ...over,
      },
    ],
  });

  it("fills the postal code from the subdistrict", () => {
    const state = thaiRow();
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].zip).toBe("50200");
  });

  /**
   * The half that matters more than the filling.
   *
   * `onGridChange` runs on every change to the grid, so a rule that always
   * wrote the code would undo a hand-typed one on the next keystroke in any
   * other cell — the field would look possessed.
   */
  it("never argues with a code somebody typed", () => {
    const state = thaiRow({ zip: "50210" });
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].zip).toBe("50210");
  });

  it("drops the code with the subdistrict it came from", () => {
    /* Which is what makes "only fill a blank" enough: change the tambon and
       the stale code goes, then the new one lands on the next pass. */
    const state = thaiRow({ dist: "เมืองเชียงใหม่", sub: "ในเมือง", zip: "50200" });
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].sub, "ในเมือง is not in เมืองเชียงใหม่").toBe("");
    expect(state.addresses[0].zip).toBe("");

    state.addresses[0].sub = "ช้างเผือก";
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].zip).toBe("50300");
  });

  it("leaves a foreign postal code alone", () => {
    const state = {
      addresses: [
        { type: "Manufacturer", country: "เวียดนาม", prov: "Hanoi", dist: "Ba Dinh", sub: "Ngoc Ha", zip: "" },
      ],
    };
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].zip).toBe("");
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
