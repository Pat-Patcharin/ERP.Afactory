import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";
import { PRODUCT_FORM } from "@/schemas/forms/product";
import { PRODUCTS, getProduct } from "@/lib/domain/product";
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

  it("เหลือช่องติ๊กอันเดียวคือสินค้า Demo", () => {
    const toggles = allFields().filter((f) => f.type === "toggle");
    expect(toggles.map((f) => f.path)).toEqual(["demo"]);
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

    for (const p of ["cat", "brand", "series", "cls.devClass", "cls.storage", "demo"]) {
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

describe("Product form — ผู้ขายสินค้า", () => {
  it("แสดงหัวข้อผู้ขายเสมอ ไม่ต้องเปิด Purchase Item ก่อน", () => {
    const stepKeys = (s: FormState) =>
      PRODUCT_FORM.steps.filter((st) => !st.when || st.when(s)).map((st) => st.key);

    expect(stepKeys(PRODUCT_FORM.blank())).toContain("supplier");
  });
});
