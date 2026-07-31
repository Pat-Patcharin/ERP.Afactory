import {
  CATEGORIES,
  catByCode,
  catPath,
  decorateCategories,
  nextCategoryCode,
  wouldCycle,
  type CategoryRow,
} from "@/lib/domain/category";
import { stamp } from "@/lib/format";
import type { FormSchema, SelectOption } from "@/lib/types";
import { FORM_USER, RailCard, RailRow, isCreate, saved } from "./common";

/* ============================================================
   CATEGORY FORM — the smallest complete example. Two content
   steps and a review; everything else is inherited from the
   engine.
   ============================================================ */

const STATUS = ["Active", "Inactive"];

/** Parents a category may adopt: anything that is not itself or its own subtree. */
function parentOptions(selfCode: string): SelectOption[] {
  return CATEGORIES.filter((c) => c.code !== selfCode && !wouldCycle(selfCode, c.code))
    .map((c) => ({ value: c.code, label: `${c.code} · ${catPath(c)}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const CATEGORY_FORM: FormSchema<CategoryRow> = {
  key: "category",
  entityLabel: "Category",
  titleField: "nameTh",
  saveButton: "Save Category",
  statusBadge: { Active: "success", Inactive: "neutral" },

  blank: () => ({
    _mode: "create",
    code: nextCategoryCode(),
    nameTh: "",
    nameEn: "",
    parent: "",
    sort: CATEGORIES.length + 1,
    desc: "",
    status: "Active",
  }),

  toState: (c) => ({
    _mode: "edit",
    code: c.code,
    nameTh: c.nameTh,
    nameEn: c.nameEn,
    parent: c.parent ?? "",
    sort: c.sort,
    desc: c.desc,
    status: c.status,
  }),

  steps: [
    {
      key: "general",
      label: "General",
      railLabel: "ข้อมูลทั่วไป",
      labelTh: "รหัสและชื่อหมวดหมู่",
      blocks: () => [
        {
          type: "card",
          title: "Basic Information",
          cols: "2",
          fields: [
            {
              type: "text",
              path: "code",
              label: "Category Code",
              required: true,
              placeholder: "CAT-050",
              hint: "ระบบออกรหัสให้อัตโนมัติ แก้ไขได้ก่อนบันทึก",
              when: isCreate,
            },
            {
              type: "static",
              path: "code",
              label: "Category Code",
              hint: "รหัสหมวดหมู่แก้ไขไม่ได้หลังสร้างแล้ว",
              when: (st) => !isCreate(st),
            },
            {
              type: "select",
              path: "status",
              label: "Status",
              required: true,
              options: STATUS,
            },
            {
              type: "text",
              path: "nameTh",
              label: "ชื่อภาษาไทย",
              required: true,
              placeholder: "เครื่องมือทันตกรรม",
            },
            {
              type: "text",
              path: "nameEn",
              label: "English Name",
              placeholder: "Dental Equipment",
            },
            {
              type: "textarea",
              path: "desc",
              label: "Description",
              span: true,
              rows: 3,
              placeholder: "อธิบายขอบเขตของหมวดหมู่นี้",
            },
          ],
        },
      ],
    },

    {
      key: "hierarchy",
      label: "Hierarchy",
      railLabel: "โครงสร้าง",
      labelTh: "หมวดหมู่แม่และลำดับ",
      blocks: (s) => [
        {
          type: "card",
          title: "Placement",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "parent",
              label: "Parent Category",
              placeholder: "— ไม่มี (เป็นหมวดหมู่ระดับบนสุด) —",
              options: parentOptions(String(s.code ?? "")),
              hint: "เว้นว่างไว้เพื่อให้เป็นหมวดหมู่ระดับบนสุด",
            },
            {
              type: "number",
              path: "sort",
              label: "Sort Order",
              min: 0,
              hint: "ตัวเลขน้อยแสดงก่อน",
            },
            {
              type: "static",
              label: "Full Path",
              span: true,
              value: (st) => {
                const parent = catByCode(String(st.parent ?? "") || null);
                const name = String(st.nameEn || st.nameTh || "หมวดหมู่ใหม่");
                return parent ? `${catPath(parent)} › ${name}` : name;
              },
            },
          ],
        },
      ],
    },

    {
      key: "review",
      label: "Review",
      railLabel: "ตรวจทาน",
      labelTh: "ตรวจสอบก่อนบันทึก",
      review: true,
      blocks: () => [],
    },
  ],

  required: [
    { path: "code", label: "Category Code", step: "general" },
    { path: "nameTh", label: "ชื่อภาษาไทย", step: "general" },
    { path: "status", label: "Status", step: "general" },
  ],

  rules: [
    {
      label: "รหัสหมวดหมู่ต้องไม่ซ้ำกับที่มีอยู่แล้ว",
      step: "general",
      test: (s) =>
        !isCreate(s) || !CATEGORIES.some((c) => c.code === String(s.code ?? "").trim()),
    },
    {
      label: "หมวดหมู่แม่ต้องไม่ทำให้เกิดโครงสร้างวนซ้ำ",
      step: "hierarchy",
      test: (s) => !s.parent || !wouldCycle(String(s.code ?? ""), String(s.parent)),
    },
  ],

  findDuplicates: (s) => {
    const th = String(s.nameTh ?? "").trim();
    const en = String(s.nameEn ?? "").trim();
    if (th.length < 2 && en.length < 2) return [];
    return CATEGORIES.filter(
      (c) =>
        c.code !== s.code &&
        ((th && c.nameTh === th) || (en && c.nameEn && c.nameEn === en)),
    ).map((c) => ({
      code: c.code,
      name: c.nameTh,
      why: c.nameTh === th ? "ชื่อภาษาไทยซ้ำ" : "ชื่อภาษาอังกฤษซ้ำ",
    }));
  },

  openDuplicate: (code, ctx) => ctx.openEntity("category", code),

  sidePanel: (s) => {
    const parent = catByCode(String(s.parent ?? "") || null);
    const siblings = parent ? CATEGORIES.filter((c) => c.parent === parent.code).length : 0;
    return (
      <RailCard icon="category" title="Placement">
        <RailRow label="ระดับชั้น" value={parent ? `ระดับ ${parent.level + 1}` : "ระดับ 1"} />
        <RailRow label="หมวดหมู่แม่" value={parent ? parent.nameEn || parent.nameTh : "—"} />
        <RailRow label="หมวดหมู่ร่วมระดับ" value={siblings} />
        <RailRow label="หมวดหมู่ทั้งหมด" value={CATEGORIES.length} />
      </RailCard>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const patch = {
      nameTh: String(s.nameTh ?? "").trim(),
      nameEn: String(s.nameEn ?? "").trim(),
      parent: String(s.parent ?? "") || null,
      sort: Number(s.sort) || 0,
      desc: String(s.desc ?? ""),
      status: String(s.status ?? "Active"),
      updated: now,
      updatedBy: FORM_USER,
    };

    const existing = CATEGORIES.find((c) => c.code === code);
    if (existing) {
      Object.assign(existing, patch);
    } else {
      CATEGORIES.push({
        code,
        ...patch,
        created: now,
        createdBy: FORM_USER,
      } as CategoryRow);
    }

    decorateCategories();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างหมวดหมู่แล้ว",
      message: `${code} — ${patch.nameTh}`,
      goto: `/m/category/${encodeURIComponent(code)}`,
    });
  },
};
