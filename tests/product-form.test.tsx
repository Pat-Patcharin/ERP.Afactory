import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";
import { PRODUCT_FORM } from "@/schemas/forms/product";
import { PRODUCTS, getProduct } from "@/lib/domain/product";
import { supplierOffers, vendorPartner } from "@/lib/domain/partner";
import { formStatus } from "@/lib/form";
import { resetCurrentUser } from "@/lib/domain/admin";
import type { FormBlock, FormField, FormState } from "@/lib/types";

/* ============================================================
   PRODUCT FORM — what the form stopped asking for

   Every question here was removed because it duplicated an
   answer the form already had, and the form is smaller for it.
   A field that comes back has to earn its place again, which is
   what these assertions are for.
   ============================================================ */

beforeEach(() => {
  window.localStorage.clear();
  resetCurrentUser();
});

const section = (key: string) => document.getElementById(`form-product-${key}`)!;

/** Every field on the form, flattened out of its cards. */
const allFields = (state: FormState = PRODUCT_FORM.blank()): FormField[] =>
  PRODUCT_FORM.steps
    .flatMap((st) => st.blocks(state))
    .filter((b): b is FormBlock => Boolean(b))
    .flatMap((b) => ("fields" in b ? b.fields : [b]))
    .filter((f): f is FormField => Boolean(f));

const paths = (state?: FormState) => allFields(state).map((f) => f.path);

describe("Product form — คำถามที่ตัดออก", () => {
  it("ไม่ถาม Product Type อีกแล้ว เพราะ Category ตอบไปแล้ว", () => {
    expect(paths()).not.toContain("cls.ptype");
    expect(paths()).toContain("cat");
    expect(PRODUCT_FORM.required.map((r) => r.path)).not.toContain("cls.ptype");
  });

  it("ไม่ถามผู้ผลิตและประเทศต้นทาง", () => {
    expect(paths()).not.toContain("cls.maker");
    expect(paths()).not.toContain("cls.origin");
  });

  it("เหลือช่องติ๊กอันเดียว คือเบิกเป็น Demo ได้หรือไม่", () => {
    const toggles = allFields().filter((f) => f.type === "toggle");
    expect(toggles.map((f) => f.path)).toEqual(["demoAllowed"]);

    /* The wording is the point: every product in the master is a normal
       product, and the switch is a permission asked of it — not a kind of
       thing it is. "เป็นสินค้าตัวอย่าง" said the second. */
    const [demo] = toggles;
    expect(demo.onText).toBe("เบิกเป็นสินค้า Demo ได้");
    expect(demo.offText).toBe("เบิกเป็นสินค้า Demo ไม่ได้");
  });

  it("ไม่มีการ์ดสรุปด้านข้าง", () => {
    expect(PRODUCT_FORM.sidePanel).toBeUndefined();
    expect(PRODUCT_FORM.previewCard).toBeUndefined();
  });
});

describe("Product form — grouping กับ classification อยู่หัวข้อเดียวกัน", () => {
  it("ไม่มีหัวข้อ Classification แยกอีกแล้ว", () => {
    expect(PRODUCT_FORM.steps.map((s) => s.key)).not.toContain("classification");
  });

  it("หมวดหมู่และการจัดประเภทอยู่ในการ์ดเดียวกัน", () => {
    const cards = PRODUCT_FORM.steps
      .find((s) => s.key === "general")!
      .blocks(PRODUCT_FORM.blank())
      .filter((b): b is Extract<FormBlock, { type: "card" }> =>
        Boolean(b) && (b as FormBlock).type === "card",
      );

    const grouping = cards.find((c) => c.fields.some((f) => f && f.path === "cat"))!;
    const inCard = grouping.fields.map((f) => f && f.path);

    for (const p of ["cat", "brand", "series", "cls.devClass", "cls.storage", "demoAllowed"]) {
      expect(inCard, p).toContain(p);
    }
  });

  it("ทุกช่องที่บังคับกรอกชี้ไปยังหัวข้อที่ยังมีอยู่จริง", () => {
    const live = new Set(PRODUCT_FORM.steps.map((s) => s.key));
    for (const r of PRODUCT_FORM.required) expect(live, r.label).toContain(r.step);
    for (const r of PRODUCT_FORM.rules ?? []) expect(live, r.label).toContain(r.step);
  });
});

describe("Product form — รูปสินค้า", () => {
  it("อัปโหลดรูปจริง ไม่ใช่เลือกไอคอน", () => {
    const image = allFields().find((f) => f.path === "icon")!;
    expect(image.type).toBe("photo");
    expect(PRODUCT_FORM.blank().icon).toBe("");
  });

  it("มีปุ่มอัปโหลดและไม่มีปุ่มไอคอนให้เลือก", () => {
    render(<MasterForm schema={PRODUCT_FORM} />);

    const identity = section("general");
    expect(within(identity).getByRole("button", { name: "อัปโหลดรูปจริง" })).toBeInTheDocument();
    expect(within(identity).queryByRole("button", { name: "📦" })).toBeNull();
  });
});

describe("Product form — ชื่อสินค้ามาจากชื่อไทยหรือชื่ออังกฤษ", () => {
  it("ไม่มีช่อง Product Name ให้พิมพ์เองแล้ว", () => {
    const named = allFields().filter((f) => f.path === "name");
    expect(named).toEqual([]);
  });

  it("ติ๊กเลือกภาษาแล้วชื่อสินค้าเปลี่ยนตาม", async () => {
    const user = userEvent.setup();
    render(<MasterForm schema={PRODUCT_FORM} />);

    const identity = within(section("general"));
    await user.type(
      identity.getByPlaceholderText("เอ-เฟล็กซ์ ซีลแลนท์ พียู40 2 มล."),
      "เอ-เฟล็กซ์ พียู40 สีขาว",
    );
    await user.type(
      identity.getByPlaceholderText("A-FLEX Sealant PU40 2ml"),
      "A-FLEX PU40 White",
    );

    /* Thai is the default, so the echo shows the Thai name without anyone
       touching the choice. */
    expect(identity.getByText("เอ-เฟล็กซ์ พียู40 สีขาว")).toBeInTheDocument();

    await user.click(identity.getByRole("radio", { name: "English" }));
    expect(identity.getByText("A-FLEX PU40 White")).toBeInTheDocument();
  });

  it("บังคับกรอกเฉพาะภาษาที่เลือกไว้", () => {
    const draft = { ...PRODUCT_FORM.blank(), nameTh: "", nameEn: "A-FLEX PU40 White" };

    expect(formStatus(PRODUCT_FORM, { ...draft, nameLang: "en" }).blankPaths).not.toContain(
      "nameTh",
    );
    expect(formStatus(PRODUCT_FORM, { ...draft, nameLang: "th" }).blankPaths).toContain(
      "nameTh",
    );
  });

  it("แก้ไขสินค้าเดิมแล้วเดาได้ว่าชื่อเดิมมาจากภาษาไหน", () => {
    const p = getProduct("AA-TH003-WL")!;

    /* Seeded records carry a `name` typed on its own. It seeds the Thai box
       when it is not an exact copy of the English one, so nothing is lost on
       the way into the form. */
    const th = PRODUCT_FORM.toState({ ...p, name: p.nameTh });
    expect(th.nameLang).toBe("th");
    expect(th.nameTh).toBe(p.nameTh);

    const en = PRODUCT_FORM.toState({ ...p, name: p.nameEn });
    expect(en.nameLang).toBe("en");
    expect(en.nameEn).toBe(p.nameEn);
  });

  it("บันทึกแล้วชื่อสินค้าคือชื่อในภาษาที่ติ๊กไว้", () => {
    const code = "ZZ-NAME-01";
    const ctx = { goto: () => {}, toast: () => {}, refresh: () => {} } as never;

    PRODUCT_FORM.save(
      {
        ...PRODUCT_FORM.blank(),
        code,
        nameTh: "ยาสีฟันสูตรเย็น",
        nameEn: "Cool Mint Toothpaste",
        nameLang: "en",
        cat: "Dental Consumable",
        brand: "A-FLEX",
        unit: "Tube",
        price: 250,
      },
      ctx,
    );

    const saved = PRODUCTS.find((r) => r.code === code)!;
    expect(saved.name).toBe("Cool Mint Toothpaste");
    expect(saved.nameTh).toBe("ยาสีฟันสูตรเย็น");

    PRODUCTS.splice(PRODUCTS.indexOf(saved), 1);
  });
});

describe("Product form — ต้นทุนและผู้ขายอยู่หัวข้อเดียวกัน", () => {
  const stepKeys = (s: FormState) =>
    PRODUCT_FORM.steps.filter((st) => !st.when || st.when(s)).map((st) => st.key);

  it("แสดงเสมอ ไม่ต้องเปิด Purchase Item ก่อน", () => {
    expect(stepKeys(PRODUCT_FORM.blank())).toContain("supply");
  });

  it("ไม่มีหัวข้อผู้ขายแยกอีกแล้ว", () => {
    /*
       The two sections were renderings of the same supplierItems row —
       "Cost" showed every supplier's price, "Supplier" showed one of them
       again as six read-only boxes, and Latest Purchase Price appeared in
       both. One section, one table.
    */
    expect(stepKeys(PRODUCT_FORM.blank())).not.toContain("supplier");
    expect(PRODUCT_FORM.steps.map((s) => s.key)).not.toContain("price");
  });

  it("ไม่ถามซ้ำสิ่งที่ตารางผู้ขายบอกอยู่แล้ว", () => {
    const supply = PRODUCT_FORM.steps.find((s) => s.key === "supply")!;
    const paths = supply
      .blocks(PRODUCT_FORM.blank())
      .filter((b): b is FormBlock => Boolean(b))
      .flatMap((b) => ("fields" in b ? b.fields : [b]))
      .filter((f): f is FormField => Boolean(f))
      .map((f) => f.path);

    /* Every one of these is a column of the table below. */
    for (const gone of ["sup.code", "sup.itemCode", "sup.moq", "sup.lead", "sup.lastPrice"]) {
      expect(paths, gone).not.toContain(gone);
    }
    /* What the form still decides: which supplier is the default, and the
       two terms that belong to the product rather than to one quote. */
    expect(paths).toContain("supplier");
    expect(paths).toContain("sup.warranty");
  });

  it("ตารางต้นทุนตามผู้ขายแก้ไม่ได้จากที่นี่", () => {
    /* The rows belong to the partner. An Add button here would promise a
       write that the next load discards. */
    const supply = PRODUCT_FORM.steps.find((s) => s.key === "supply")!;
    const grid = supply
      .blocks(PRODUCT_FORM.blank())
      .filter((b): b is FormBlock => Boolean(b))
      .find((b) => "path" in b && b.path === "offers") as FormField;

    expect(grid.readonly).toBe(true);
  });

  it("ถามผู้ขายก่อน แล้วค่อยถามต้นทุนของผู้ขายรายนั้น", () => {
    const supply = PRODUCT_FORM.steps.find((s) => s.key === "supply")!;
    const cards = supply
      .blocks(PRODUCT_FORM.blank())
      .filter((b): b is Extract<FormBlock, { type: "card" }> =>
        Boolean(b) && (b as FormBlock).type === "card",
      );

    /* Currency, VAT and the agreed cost are all terms of one supplier's
       quote, so the question "which supplier" cannot come second. */
    expect(cards[0].fields.map((f) => f && f.path)).toContain("supplier");
    expect(cards[1].fields.map((f) => f && f.path)).toEqual([
      "pricing.currency",
      "pricing.vat",
      "pricing.supplierCost",
    ]);
  });

  it("ไม่ถามต้นทุนที่ระบบเขียนเอง", () => {
    /*
       Latest Purchase Price comes from a goods receipt, Moving Average moves
       with every exchange rate and every discount, and the lowest offer is a
       row in the table below. None of the three is something a person states,
       so none of them belongs on a form.
    */
    const supply = PRODUCT_FORM.steps.find((s) => s.key === "supply")!;
    const fields = supply
      .blocks(PRODUCT_FORM.blank())
      .filter((b): b is FormBlock => Boolean(b))
      .flatMap((b) => ("fields" in b ? b.fields : [b]))
      .filter((f): f is FormField => Boolean(f));

    for (const gone of ["pricing.lastCost", "pricing.avgCost", "pricing.effective"]) {
      expect(fields.map((f) => f.path), gone).not.toContain(gone);
    }
    for (const gone of ["Latest Purchase Price", "Moving Average Cost", "ต้นทุนต่ำสุดที่เสนอมา"]) {
      expect(fields.map((f) => f.label), gone).not.toContain(gone);
    }
  });

  it("เลือกผู้ขายแล้วเติมราคาที่ผู้ขายรายนั้นเสนอไว้ให้", () => {
    const p = getProduct("AA-TH003-WL")!;
    const offer = supplierOffers(p.code).find(
      (o) => o.partner === vendorPartner(p.supplier)?.code,
    );
    /* The seed has to have an offer from the named supplier for this to mean
       anything — otherwise the test would pass on a form that does nothing. */
    expect(offer?.costPerBase).toBeGreaterThan(0);

    const s: FormState = { ...PRODUCT_FORM.blank(), code: p.code, supplier: p.supplier };
    PRODUCT_FORM.onChange!("supplier", s);
    expect(s.pricing.supplierCost).toBe(offer!.costPerBase);
    expect(s.pricing.currency).toBe(offer!.currency);

    /* A negotiated figure is not overwritten by the standing offer. */
    const typed: FormState = {
      ...PRODUCT_FORM.blank(),
      code: p.code,
      supplier: p.supplier,
      pricing: { ...PRODUCT_FORM.blank().pricing, supplierCost: 12.5 },
    };
    PRODUCT_FORM.onChange!("supplier", typed);
    expect(typed.pricing.supplierCost).toBe(12.5);
  });

  it("บันทึกต้นทุนที่ตกลงไว้ โดยไม่แตะต้นทุนที่มาจากใบรับสินค้า", () => {
    const code = "ZZ-COST-01";
    const ctx = { goto: () => {}, toast: () => {}, refresh: () => {} } as never;

    PRODUCT_FORM.save(
      {
        ...PRODUCT_FORM.blank(),
        code,
        nameTh: "สินค้าทดสอบต้นทุน",
        nameLang: "th",
        cat: "Dental Consumable",
        brand: "A-FLEX",
        unit: "Tube",
        pricing: { currency: "THB", vat: "VAT 7% (exclusive)", supplierCost: "88.5" },
      },
      ctx,
    );

    const fresh = PRODUCTS.find((r) => r.code === code)!;
    expect(fresh.pricing.supplierCost).toBe(88.5);
    /* Nothing has been received, so there is no purchase price to state. */
    expect(fresh.pricing.lastCost).toBe(0);
    expect(fresh.pricing.avgCost).toBe(0);

    /* And a product that HAS been received keeps its receipt figures when the
       agreed cost is edited. */
    const existing = getProduct("AA-TH003-WL")!;
    const { lastCost, avgCost } = existing.pricing;
    PRODUCT_FORM.save(
      { ...PRODUCT_FORM.toState(existing), pricing: { ...PRODUCT_FORM.toState(existing).pricing, supplierCost: 99 } },
      ctx,
    );
    expect(existing.pricing.supplierCost).toBe(99);
    expect(existing.pricing.lastCost).toBe(lastCost);
    expect(existing.pricing.avgCost).toBe(avgCost);

    PRODUCTS.splice(PRODUCTS.indexOf(fresh), 1);
  });

  it("ไม่มีตารางผู้ขายสำรองที่พิมพ์แล้วหาย", () => {
    /* `altSuppliers` is rebuilt from the partner's supplier items on every
       load, so anything typed into it was gone before it was read back. */
    expect(PRODUCT_FORM.newRow!("altSuppliers", true)).toEqual({});
    expect(paths()).not.toContain("altSuppliers");
  });
});
