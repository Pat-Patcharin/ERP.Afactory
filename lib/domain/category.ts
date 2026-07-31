import { CATEGORIES as RAW, type Category } from "@/data/categories";
import { PRODUCTS } from "./product";
import { DASH } from "@/lib/format";

export interface CategoryRow extends Category {
  /** Generic alias the shared engines read. */
  name: string;
  icon: string;
  level: number;
  path: string;
  parentName: string;
  childCount: number;
  productCount: number;
  history: { t: string; d: string; u: string; when: string; kind: string }[];
}

export const CATEGORIES = RAW as CategoryRow[];

export const catByCode = (code: string | null) =>
  CATEGORIES.find((c) => c.code === code) ?? null;

/** Depth from root, 1-based. The seen-set guards against a corrupted cycle. */
export function catLevel(cat: Category): number {
  let n = 1;
  let p = cat.parent;
  const seen = new Set([cat.code]);
  while (p && !seen.has(p)) {
    seen.add(p);
    n++;
    p = catByCode(p)?.parent ?? null;
  }
  return n;
}

/** "Dental Equipment › Endodontic › Files" */
export function catPath(cat: Category): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let c: Category | null = cat;
  while (c && !seen.has(c.code)) {
    seen.add(c.code);
    parts.unshift(c.nameEn || c.nameTh);
    c = catByCode(c.parent);
  }
  return parts.join(" › ");
}

export const catChildren = (code: string) =>
  CATEGORIES.filter((c) => c.parent === code);

/** Which products reference this category? Matched on the English name. */
export const catProducts = (cat: Category) =>
  PRODUCTS.filter((p) => p.cat === (cat.nameEn || cat.nameTh));

/** Would setting `parentCode` as parent of `catCode` create a loop? */
export function wouldCycle(catCode: string, parentCode: string): boolean {
  if (!parentCode) return false;
  if (parentCode === catCode) return true;
  let p: string | null = parentCode;
  const seen = new Set<string>();
  while (p && !seen.has(p)) {
    if (p === catCode) return true;
    seen.add(p);
    p = catByCode(p)?.parent ?? null;
  }
  return false;
}

/** Attach derived fields so list, detail and form all read the same values. */
export function decorateCategories() {
  for (const c of CATEGORIES) {
    c.level = catLevel(c);
    c.path = catPath(c);
    c.parentName = c.parent ? (catByCode(c.parent)?.nameEn ?? c.parent) : DASH;
    c.childCount = catChildren(c.code).length;
    c.productCount = catProducts(c).length;
    c.icon = "🗂️";
    c.name = c.nameEn || c.nameTh;
    c.history = [
      {
        t: "Category updated",
        d: `แก้ไขข้อมูลล่าสุดโดย ${c.updatedBy}`,
        u: c.updatedBy,
        when: c.updated,
        kind: "primary",
      },
      {
        t: "Category created",
        d: "สร้างหมวดหมู่เข้าระบบ",
        u: c.createdBy,
        when: c.created,
        kind: "",
      },
    ];
  }
}

decorateCategories();
