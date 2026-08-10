import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";
import { PRODUCT_FORM } from "@/schemas/forms/product";
import { PRODUCTS, getProduct } from "@/lib/domain/product";
import { BUSINESS_PARTNERS, supplierOffers } from "@/lib/domain/partner";
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

  /** The single supplier grid the section is built around. */
  const supplierGrid = (state: FormState = PRODUCT_FORM.blank()): FormField => {
    const supply = PRODUCT_FORM.steps.find((st) => st.key === "supply")!;
    return supply
      .blocks(state)
      .filter((b): b is FormBlock => Boolean(b))
      .flatMap((b) => ("fields" in b ? b.fields : [b]))
      .filter((f): f is FormField => Boolean(f))
      .find((f) => f.path === "suppliers")!;
  };

  it("ผู้ขายหลักกับผู้ขายทางเลือกอยู่ในกรอบเดียวกัน กรอกเหมือนกัน", () => {
    /*
       They used to be a card of three fields and a read-only table of seven
       columns — the same subject asked for twice, in two shapes, and an
       alternative supplier could not be given the terms the main one had.
       One list, one set of fields, a tick to say which is which.
    */
    const cols = supplierGrid().cols!.map((c) => c.key);
    for (const asked of [
      "main",
      "supplierCode",
      "supplierName",
      "moq",
      "lead",
      "price",
      "warranty",
      "country",
    ]) {
      expect(cols, asked).toContain(asked);
    }

    /* Exactly one tick decides the main supplier — a checkbox per row would
       let two of them be the default. */
    expect(supplierGrid().cols!.find((c) => c.key === "main")!.type).toBe("radio");
  });

  it("ไม่มีช่อง sup.* ค้างอยู่ข้างตารางให้ขัดกันเอง", () => {
    const paths = PRODUCT_FORM.steps
      .find((st) => st.key === "supply")!
      .blocks(PRODUCT_FORM.blank())
      .filter((b): b is FormBlock => Boolean(b))
      .flatMap((b) => ("fields" in b ? b.fields : [b]))
      .filter((f): f is FormField => Boolean(f))
      .map((f) => f.path);

    /* Every one of these is now a column of the one grid. A field beside it
       would be a second copy of the same fact. */
    for (const gone of [
      "supplier",
      "sup.code",
      "sup.itemCode",
      "sup.moq",
      "sup.lead",
      "sup.lastPrice",
      "sup.warranty",
      "sup.country",
    ]) {
      expect(paths, gone).not.toContain(gone);
    }
  });

  it("ต้นทุนที่ตกลงไว้อ่านจากผู้ขายที่ติ๊ก ไม่ได้พิมพ์ซ้ำ", () => {
    const paths = PRODUCT_FORM.steps
      .find((st) => st.key === "supply")!
      .blocks(PRODUCT_FORM.blank())
      .filter((b): b is FormBlock => Boolean(b))
      .flatMap((b) => ("fields" in b ? b.fields : [b]))
      .filter((f): f is FormField => Boolean(f))
      .map((f) => f.path);

    /* It IS the ticked row's price converted to the stock unit. A box to
       type it in beside that row is how the two start disagreeing. */
    expect(paths).not.toContain("pricing.supplierCost");
    expect(paths).toContain("pricing.currency");
    expect(paths).toContain("pricing.vat");
  });

  it("ตารางผู้ขายแก้ได้จากที่นี่ และเขียนกลับไปที่คู่ค้า", () => {
    /* The rows still belong to the partner — but the product master is now
       a door into them rather than a window onto them. */
    expect(supplierGrid().readonly).toBeFalsy();
    expect(supplierGrid().addLabel).toBeTruthy();
  });

  it("ผู้ขายรายแรกที่เพิ่ม เป็นผู้ขายหลักโดยอัตโนมัติ", () => {
    expect(PRODUCT_FORM.newRow!("suppliers", true)!.main).toBe(true);
    expect(PRODUCT_FORM.newRow!("suppliers", false)!.main).toBe(false);
  });

  it("อ่านสินค้าเดิมมาแล้วได้ผู้ขายครบทุกราย พร้อมติ๊กผู้ขายหลัก", () => {
    /* This replaced a prefill: choosing a supplier used to copy their quote
       into a cost box beside the list. The list IS the quote now, so there is
       nothing to copy — it is read straight off the partner's rows. */
    const p = PRODUCTS.find((x) => supplierOffers(x.code).length > 0)!;
    const rows = PRODUCT_FORM.toState(p).suppliers as {
      supplierCode: string;
      main: boolean;
      moq: number;
      lead: number;
    }[];

    const offers = supplierOffers(p.code);
    expect(rows).toHaveLength(offers.length);
    for (const o of offers) {
      const row = rows.find((r) => r.supplierCode === o.partner)!;
      expect(row, o.partner).toBeTruthy();
      expect(row.moq).toBe(o.moq);
      expect(row.lead).toBe(o.lead);
      expect(row.main).toBe(o.preferred);
    }
  });

  it("บันทึกแล้วเขียนกลับไปที่คู่ค้า ไม่ได้เก็บสำเนาไว้บนสินค้า", () => {
    const code = "ZZ-SUP-01";
    const ctx = { goto: () => {}, toast: () => {}, refresh: () => {} } as never;
    const bp = BUSINESS_PARTNERS.find((b) => b.roles?.supplier)!;
    const alt = BUSINESS_PARTNERS.filter((b) => b.roles?.supplier && b.code !== bp.code)[0]!;

    PRODUCT_FORM.save(
      {
        ...PRODUCT_FORM.blank(),
        code,
        nameTh: "สินค้าทดสอบผู้ขาย",
        nameLang: "th",
        cat: "Dental Consumable",
        brand: "A-FLEX",
        unit: "Tube",
        pricing: { currency: "THB", vat: "VAT 7% (exclusive)" },
        suppliers: [
          {
            main: true,
            supplierCode: bp.code,
            sku: "V-001",
            punit: "Carton",
            punitFactor: 24,
            price: 2400,
            moq: 5,
            lead: 14,
            warranty: "12 เดือน",
            country: "ประเทศไทย",
            status: "Active",
          },
          {
            main: false,
            supplierCode: alt.code,
            sku: "V-002",
            punit: "Tube",
            punitFactor: 1,
            price: 105,
            moq: 20,
            lead: 30,
            warranty: "6 เดือน",
            country: "ประเทศจีน",
            status: "Active",
          },
        ],
      },
      ctx,
    );

    /* The row lands on the PARTNER — one copy, reachable from two screens. */
    const mainRow = bp.supplierItems!.find((i) => i.product === code)!;
    expect(mainRow.moq).toBe(5);
    expect(mainRow.lead).toBe(14);
    expect(mainRow.warranty).toBe("12 เดือน");
    expect(mainRow.preferred).toBe(true);

    const altRow = alt.supplierItems!.find((i) => i.product === code)!;
    expect(altRow.preferred, "ผู้ขายทางเลือกไม่ใช่ผู้ขายหลัก").toBe(false);
    expect(altRow.moq).toBe(20);
    expect(altRow.country).toBe("ประเทศจีน");

    const fresh = PRODUCTS.find((r) => r.code === code)!;
    /* The agreed cost is the ticked row's price in the STOCK unit: a carton
       of 24 at 2,400 is 100 a tube, which is the only figure that compares
       with the alternative's 105. */
    expect(fresh.pricing.supplierCost).toBe(100);
    expect(fresh.supplier).toBe(bp.nameTh || bp.nameEn);
    /* Nothing has been received, so there is no purchase price to state. */
    expect(fresh.pricing.lastCost).toBe(0);
    expect(fresh.pricing.avgCost).toBe(0);

    /* Reading it back gives both suppliers, with the tick where it was. */
    const back = PRODUCT_FORM.toState(fresh).suppliers as { supplierCode: string; main: boolean }[];
    expect(back).toHaveLength(2);
    expect(back.filter((r) => r.main)).toHaveLength(1);
    expect(back.find((r) => r.main)!.supplierCode).toBe(bp.code);

    /* Dropping a supplier takes its row for THIS product and nothing else. */
    const otherProducts = alt.supplierItems!.filter((i) => i.product !== code).length;
    PRODUCT_FORM.save(
      {
        ...PRODUCT_FORM.toState(fresh),
        suppliers: [(PRODUCT_FORM.toState(fresh).suppliers as unknown[])[0]],
      },
      ctx,
    );
    expect(alt.supplierItems!.some((i) => i.product === code)).toBe(false);
    expect(alt.supplierItems!.length).toBe(otherProducts);

    PRODUCTS.splice(PRODUCTS.indexOf(fresh), 1);
    bp.supplierItems = bp.supplierItems!.filter((i) => i.product !== code);
  });

  it("ต้นทุนที่มาจากใบรับสินค้าไม่ถูกแตะ", () => {
    const ctx = { goto: () => {}, toast: () => {}, refresh: () => {} } as never;
    const existing = getProduct("AA-TH003-WL")!;
    const { lastCost, avgCost } = existing.pricing;

    PRODUCT_FORM.save(PRODUCT_FORM.toState(existing), ctx);

    expect(existing.pricing.lastCost).toBe(lastCost);
    expect(existing.pricing.avgCost).toBe(avgCost);
  });

  it("ไม่มีตารางผู้ขายสำรองที่พิมพ์แล้วหาย", () => {
    /* `altSuppliers` is rebuilt from the partner's supplier items on every
       load, so anything typed into it was gone before it was read back. */
    expect(PRODUCT_FORM.newRow!("altSuppliers", true)).toEqual({});
    expect(paths()).not.toContain("altSuppliers");
  });
});
