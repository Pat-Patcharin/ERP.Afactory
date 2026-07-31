import {
  CATEGORIES,
  catByCode,
  catChildren,
  catProducts,
  decorateCategories,
  type CategoryRow,
} from "@/lib/domain/category";
import { STATUS_TONE, tone } from "@/lib/badges";
import { DASH, fmt } from "@/lib/format";
import type { DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellMedia, CellSub, LinkButton, Thumb } from "@/components/ui";
import { CATEGORY_FORM } from "./forms/category";

/* ============================================================
   CATEGORY — hierarchical lookup master. Proves the engines are
   generic: same components, a different schema, nothing else.
   ============================================================ */

export const CATEGORY_LIST: ListSchema<CategoryRow> = {
  key: "category",
  entity: "Category",
  entityPlural: "Categories",
  title: "Category Master",
  subtitle: "จัดการหมวดหมู่สินค้าและลำดับชั้นของข้อมูลอ้างอิง",
  crumb: "Category",
  primaryLabel: "Create Category",
  searchPlaceholder: "ค้นหารหัส ชื่อหมวดหมู่ หรือคำอธิบาย...",
  emptyTitle: "ไม่พบหมวดหมู่ที่ตรงกับเงื่อนไข",

  source: () => CATEGORIES,
  searchFields: ["code", "nameTh", "nameEn", "desc"],

  tabs: [
    { key: "all", label: "All" },
    { key: "Active", label: "Active", test: (c) => c.status === "Active" },
    { key: "Inactive", label: "Inactive", test: (c) => c.status === "Inactive" },
    { key: "Draft", label: "Draft", test: (c) => c.status === "Draft" },
  ],

  filters: [
    {
      id: "status",
      label: "Status",
      options: () => ["Active", "Inactive", "Draft"],
      test: (c, v) => c.status === v,
    },
    {
      id: "parent",
      label: "Parent Category",
      options: () => [
        "— ไม่มีหมวดแม่ —",
        ...CATEGORIES.filter((c) => catChildren(c.code).length).map((c) => c.nameEn),
      ],
      test: (c, v) => (v === "— ไม่มีหมวดแม่ —" ? !c.parent : c.parentName === v),
    },
    {
      id: "level",
      label: "Level",
      options: () => ["1", "2", "3"],
      test: (c, v) => String(c.level) === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "Category Code",
      sortable: true,
      cell: (c) => (
        <CellMedia>
          <Thumb>{c.icon}</Thumb>
          <span className="font-medium">{c.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "nameEn",
      label: "Category Name",
      sortable: true,
      cell: (c) => (
        <>
          {c.nameEn}
          <CellSub>{c.nameTh}</CellSub>
        </>
      ),
    },
    { key: "parentName", label: "Parent Category", muted: true, cell: (c) => c.parentName },
    {
      key: "level",
      label: "Level",
      sortable: true,
      align: "right",
      cell: (c) => <Badge tone="neutral">L{c.level}</Badge>,
    },
    {
      key: "productCount",
      label: "Products Using",
      sortable: true,
      align: "right",
      cell: (c) =>
        c.productCount ? (
          <span className="font-medium">{fmt(c.productCount)}</span>
        ) : (
          <span className="text-ink-2">0</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      cell: (c) => <Badge tone={tone(STATUS_TONE, c.status)}>{c.status}</Badge>,
    },
    { key: "updated", label: "Last Updated", muted: true, sortable: true, cell: (c) => c.updated },
  ],

  rowActions: (c, ctx) => {
    const used = c.productCount > 0;
    const hasKids = c.childCount > 0;
    return [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("category", r) },
      { label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/category/${r.code}/edit`) },
      {
        label: "Duplicate",
        icon: "copy",
        run: (r) => ctx.toast("ทำสำเนาหมวดหมู่", `${r.code} — Future support`, "info"),
      },
      { sep: true },
      c.status === "Active"
        ? {
            label: "Deactivate",
            icon: "circleSlash",
            run: (r) => {
              r.status = "Inactive";
              ctx.refresh();
              ctx.toast("ปิดใช้งานแล้ว", `${r.code} — ${r.nameEn}`, "info");
            },
          }
        : {
            label: "Activate",
            icon: "checkCircle",
            run: (r) => {
              r.status = "Active";
              ctx.refresh();
              ctx.toast("เปิดใช้งานแล้ว", `${r.code} — ${r.nameEn}`);
            },
          },
      {
        label: "History",
        icon: "clock",
        run: (r) => ctx.goto(`/m/category/${r.code}`),
      },
      { sep: true },
      {
        label: "Delete",
        icon: "trash",
        danger: true,
        // A category in use, or with children, must not be deletable.
        disabled: used || hasKids,
        disabledReason: used
          ? `มีสินค้าใช้งานอยู่ ${c.productCount} รายการ`
          : "มีหมวดหมู่ย่อยอยู่",
        run: (r) =>
          ctx.confirm({
            title: "Delete this category?",
            message: (
              <>
                <strong>{r.code}</strong> — {r.nameEn} จะถูกลบออกจากระบบ
                การกระทำนี้ย้อนกลับไม่ได้
              </>
            ),
            confirmText: "Delete category",
            onConfirm: () => {
              const i = CATEGORIES.indexOf(r);
              if (i > -1) CATEGORIES.splice(i, 1);
              decorateCategories();
              ctx.refresh();
              ctx.toast("ลบหมวดหมู่แล้ว", `${r.code} — ${r.nameEn}`, "danger");
            },
          }),
      },
    ];
  },
};

export const CATEGORY_DETAIL: DetailSchema<CategoryRow> = {
  key: "category",
  entityLabel: "Category",

  identity: (c) => ({
    image: c.icon,
    code: c.code,
    title: c.nameEn || c.nameTh,
    copyFields: [
      { label: "Category code", value: c.code },
      { label: "Full path", value: c.path },
    ],
    badges: [
      { text: c.status, tone: tone(STATUS_TONE, c.status) },
      { text: `Level ${c.level}`, tone: "neutral" },
    ],
    tags: [
      c.nameTh,
      c.parentName === DASH ? "หมวดหลัก" : `แม่: ${c.parentName}`,
      `${c.productCount} สินค้า`,
    ],
  }),

  kpis: (c) => [
    { icon: "layers", label: "Level", value: `L${c.level}`, sub: "ลำดับชั้น", goTab: "hierarchy" },
    {
      icon: "box",
      label: "Products Using",
      value: fmt(c.productCount),
      sub: "รายการ",
      goTab: "products",
    },
    {
      icon: "tag",
      label: "Child Categories",
      value: fmt(c.childCount),
      sub: "หมวดย่อย",
      goTab: "hierarchy",
    },
    {
      icon: "clock",
      label: "Last Updated",
      value: c.updated.split(" ")[0],
      sub: c.updatedBy,
      wide: true,
      goTab: "general",
    },
  ],

  tabs: [
    {
      key: "general",
      label: "General",
      blocks: (c) => [
        {
          type: "fields",
          title: "General Information",
          cols: 2,
          items: [
            { label: "Category Code", value: c.code },
            {
              label: "Status",
              value: <Badge tone={tone(STATUS_TONE, c.status)}>{c.status}</Badge>,
            },
            { label: "ชื่อภาษาไทย", value: c.nameTh },
            { label: "English Name", value: c.nameEn },
            { label: "Sort Order", value: c.sort },
            { label: "Level", value: `L${c.level}` },
          ],
        },
        { type: "note", title: "Description", text: c.desc },
        {
          type: "fields",
          title: "System Information",
          cols: 2,
          items: [
            { label: "Created Date", value: c.created, muted: true },
            { label: "Created By", value: c.createdBy, muted: true },
            { label: "Last Updated Date", value: c.updated, muted: true },
            { label: "Last Updated By", value: c.updatedBy, muted: true },
          ],
        },
      ],
    },

    {
      key: "hierarchy",
      label: "Hierarchy",
      blocks: (c) => [
        {
          type: "fields",
          title: "Position",
          cols: 2,
          items: [
            { label: "Parent Category", value: c.parentName },
            { label: "Level", value: `L${c.level}` },
            { label: "Child Categories", value: fmt(c.childCount) },
            { label: "Full Path", value: c.path, span: true },
          ],
        },
        {
          type: "table",
          title: "Child Categories",
          rows: catChildren(c.code),
          empty: "ไม่มีหมวดหมู่ย่อย",
          cols: [
            { key: "code", label: "Code" },
            { key: "nameEn", label: "Name" },
            { key: "nameTh", label: "ชื่อไทย", muted: true },
            {
              key: "status",
              label: "Status",
              cell: (r) => <Badge tone={tone(STATUS_TONE, r.status)}>{r.status}</Badge>,
            },
          ],
        },
      ],
    },

    {
      key: "products",
      label: "Products",
      blocks: (c, ctx) => {
        const list = catProducts(c);
        return [
          {
            type: "cards",
            title: "Usage",
            cols: 3,
            items: [
              { label: "Products Using", value: fmt(list.length), tone: "accent" },
              {
                label: "Active",
                value: fmt(list.filter((p) => p.status === "Active").length),
              },
              {
                label: "Inactive",
                value: fmt(list.filter((p) => p.status !== "Active").length),
              },
            ],
          },
          {
            type: "table",
            title: "Products in this category",
            rows: list,
            empty: "ยังไม่มีสินค้าในหมวดหมู่นี้",
            cols: [
              {
                key: "code",
                label: "Product Code",
                cell: (p) => (
                  <LinkButton onClick={() => ctx.openEntity("product", p.code)}>
                    {p.code}
                  </LinkButton>
                ),
              },
              { key: "name", label: "Product Name" },
              { key: "brand", label: "Brand", muted: true },
              {
                key: "status",
                label: "Status",
                cell: (p) => <Badge tone={tone(STATUS_TONE, p.status)}>{p.status}</Badge>,
              },
            ],
          },
        ];
      },
    },

    {
      key: "history",
      label: "History",
      blocks: (c) => [
        {
          type: "timeline",
          title: "Activity",
          items: c.history.map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind as "primary" | "info" | "warn" | "",
          })),
        },
      ],
    },
  ],
};

export const categorySchemas: EntitySchemas<CategoryRow> = {
  list: CATEGORY_LIST,
  detail: CATEGORY_DETAIL,
  form: CATEGORY_FORM,
};

export { catByCode };
