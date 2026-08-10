import type { Product, ProductDetailMap } from "@/data/products";
import { DASH } from "@/lib/format";
import { priceListMeta, priceMasterRows, type PriceMasterRow } from "./price-master";

/* ============================================================
   PRODUCT CATALOGUE — the price list master, materialised as products.

   Product Master used to hold eight hand-built records while the price
   file carried 807. Same business, two catalogues. This builds a Product
   for every priced row so the two are one list, without rewriting either
   source: the price file stays generated and read-only, the prototype's
   own eight records stay exactly as they were.

   What the price file cannot tell us, this does not invent. A catalogue
   product has no stock record, no barcode and no registration — those are
   absent, not zero, and the screens say so.

   Three problems in the source file are carried through rather than tidied
   away, because Product Master keys by product code and the file does not:

     · 51 rows have no product code    → keyed by the price row key, Draft
     · 5 codes are used twice          → first row wins, the other is held
                                          back and named on the survivor
     · 80 rows are not OK              → Draft, so they cannot be sold
   ============================================================ */

type ProductDetail = ProductDetailMap[string];

/** Source sheet → the category a buyer would look under. */
const CATEGORY: Record<string, string> = {
  "Clinical product": "Clinical Product",
  "Dental Bur-Vertex": "Dental Bur",
  "Dental Equipment": "Dental Equipment",
  "Endodontic - File&Fill": "Endodontic",
  "Impression Material": "Impression Material",
  "Instrument-Bull's": "Instrument",
  "Orthodontic - Elastic": "Orthodontic",
  "Orthodontic-Wire&Orther": "Orthodontic",
  "Scaler Tips-Refine": "Scaler Tip",
  "Supply&Orther": "Supply",
};

const ICON: Record<string, string> = {
  "Clinical Product": "🧴",
  "Dental Bur": "🪛",
  "Dental Equipment": "🖥️",
  Endodontic: "🪡",
  "Impression Material": "🧪",
  Instrument: "🔧",
  Orthodontic: "🦷",
  "Scaler Tip": "🔩",
  Supply: "📦",
};

export const catalogCategory = (sheet: string) => CATEGORY[sheet] ?? "Uncategorised";

/** "2026-08-04" → "04/08/2026", the format every other record uses. */
function thaiDate(iso: string): string {
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * Why a row is not sellable, in the words the salesperson needs. Empty for
 * an OK row.
 */
const BLOCK_REASON: Record<string, string> = {
  PENDING_COST: "ยังไม่มีต้นทุน — คำนวณราคา Dealer/Last ไม่ได้ จึงยังขายไม่ได้",
  REVIEW: "ต้นทุนสูงจนราคาเอกชนทำ GP 48% ไม่ได้ — รอทบทวนราคา",
  NO_PRICE: "ยังไม่มีราคาตั้ง",
};

/* ---------- One product ---------- */

function toProduct(
  r: PriceMasterRow,
  conflicts: string[],
  clash: boolean,
  date: string,
): Product {
  const cat = catalogCategory(r.source_sheet);
  const unit = r.unit || DASH;
  const promo = r.promo_catalog || r.promo_legacy;

  return {
    /* A row with no product code is addressed by its price row key. The key
       is visibly synthetic, which is the point: nobody should mistake it for
       a real code, and it links straight back to the row that needs one. */
    code: r.product_code || r.code,
    barcode: "",
    icon: ICON[cat] ?? "🦷",
    name: r.product_name,
    nameTh: r.product_name,
    nameEn: r.product_name,
    cat,
    brand: r.brand || DASH,
    series: r.product_group || DASH,
    unit,
    weight: DASH,
    dim: DASH,
    demo: false,

    /* The catalogue price is the private tier. Government is the same
       product at +10%, not a different selling price. */
    price: r.price_private ?? r.price_government ?? 0,

    /* No stock record — not zero stock. isStocked() keeps the two apart. */
    stock: 0,
    onHand: 0,
    reserved: 0,
    onOrder: 0,
    lowLevel: 0,

    status: r.status === "OK" ? "Active" : "Draft",
    created: date,
    updated: date,
    createdBy: "Price List Master",
    updatedBy: "Price List Master",
    desc: [BLOCK_REASON[r.status], promo && `โปรโมชั่น: ${promo}`, r.notes]
      .filter(Boolean)
      .join(" · "),
    supplier: r.vendor || DASH,
    expiry: DASH,

    pricing: {
      currency: "THB",
      retail: r.price_private ?? 0,
      dealer: r.price_dealer ?? 0,
      gov: r.price_government ?? 0,
      lastCost: r.cost_thb ?? 0,
      avgCost: r.cost_thb ?? 0,
      vat: "VAT 7% (exclusive)",
      effective: date,
      contract: null,
    },

    stocks: [],
    sup: {
      code: DASH,
      itemCode: DASH,
      lead: DASH,
      moq: DASH,
      punit: unit,
      lastPrice: r.cost_thb === null ? DASH : String(r.cost_thb),
      warranty: DASH,
      country: DASH,
    },
    altSuppliers: [],
    reg: {
      no: DASH,
      status: DASH,
      issue: DASH,
      expiry: DASH,
      warranty: DASH,
      custWarranty: DASH,
      docs: [],
    },
    history: [
      {
        t: "นำเข้าจาก Price List Master",
        d: `${r.code} · ${r.source_sheet}`,
        u: "System",
        when: date,
        kind: "primary",
      },
    ],

    priceRef: {
      row: r.code,
      sheet: r.source_sheet,
      priceStatus: r.status,
      codePending: r.missingCode,
      conflicts,
      conflictClash: clash,
      floor: r.price_last,
      gpPrivate: r.gp_private,
      sellable: r.sellable,
    },
  };
}

/* ---------- Its detail payload ---------- */

/**
 * The detail a catalogue product opens with. Deliberately sparse: the price
 * file knows prices and a vendor name, so those are filled and the rest is
 * left empty for the engine's own empty states to explain.
 *
 * `price_last` is not in the price list table. It is the floor a quote needs
 * approval to go under, not a list a customer can be sold from.
 */
function toDetail(r: PriceMasterRow, p: Product, date: string): ProductDetail {
  const tier = (name: string, price: number | null) =>
    price === null
      ? null
      : {
          name,
          price,
          cur: "THB",
          from: date,
          to: "30/09/2026",
          status: r.status === "OK" ? "Active" : "Draft",
        };

  return {
    cls: {
      devClass: DASH,
      storage: DASH,
    },
    units: [{ unit: p.unit, type: "Base Unit", conv: `1 ${p.unit}`, barcode: "", active: true }],
    rfid: false,
    priceLists: [
      tier("ราคาราชการ", r.price_government),
      tier("ราคาเอกชน", r.price_private),
      tier("ราคา Dealer", r.price_dealer),
    ].filter(Boolean) as ProductDetail["priceLists"],
    tiers: [],
    contracts: [],
    backOrder: 0,
    /* Unknown until the item is actually stocked — claiming either way here
       would be guessing. */
    lotTracked: false,
    serialTracked: false,
    whRows: [],
    lots: [],
    serials: [],
    altSupRows: [],
    regRows: [],
    warranty: { sup: DASH, cust: DASH, unit: "เดือน", startEvent: DASH },
    docs: [],
    audit: [
      {
        event: "นำเข้าจาก Price List Master",
        user: "System",
        when: date,
        field: DASH,
        from: DASH,
        to: r.code,
        kind: "primary",
      },
    ],
  } as ProductDetail;
}

/* ---------- Build ---------- */

export interface HeldBackRow {
  /** Price row that could not become a product. */
  row: string;
  code: string;
  name: string;
  /** Price row that took the code first. */
  keptBy: string;
  keptName: string;
}

export interface CatalogBuild {
  products: Product[];
  details: Record<string, ProductDetail>;
  heldBack: HeldBackRow[];
}

let cache: CatalogBuild | null = null;

function build(): CatalogBuild {
  const rows = priceMasterRows();
  const date = thaiDate(priceListMeta().generatedAt);

  /* First row wins a contested code. Which one wins is arbitrary — that a
     conflict exists is the part a human has to resolve, so it is recorded
     on the survivor rather than settled here. */
  const first = new Map<string, PriceMasterRow>();
  const conflicts = new Map<string, string[]>();
  /* Four of the five shared codes are the same product entered twice; one is
     two different products wearing one code. Only the second is dangerous, so
     the two are not reported in the same words. */
  const clashes = new Set<string>();

  for (const r of rows) {
    if (!r.product_code) continue;
    const held = first.get(r.product_code);
    if (!held) {
      first.set(r.product_code, r);
      continue;
    }
    conflicts.set(r.product_code, [...(conflicts.get(r.product_code) ?? []), r.code]);
    if (r.product_name !== held.product_name) clashes.add(r.product_code);
  }

  const products: Product[] = [];
  const details: Record<string, ProductDetail> = {};
  const heldBack: HeldBackRow[] = [];

  for (const r of rows) {
    if (r.product_code && first.get(r.product_code) !== r) {
      const kept = first.get(r.product_code)!;
      heldBack.push({
        row: r.code,
        code: r.product_code,
        name: r.product_name,
        keptBy: kept.code,
        keptName: kept.product_name,
      });
      continue;
    }
    const p = toProduct(
      r,
      conflicts.get(r.product_code) ?? [],
      clashes.has(r.product_code),
      date,
    );
    products.push(p);
    details[p.code] = toDetail(r, p, date);
  }

  return { products, details, heldBack };
}

export const catalogBuild = (): CatalogBuild => (cache ??= build());

export const catalogProducts = () => catalogBuild().products;

/** Rows the code clash kept out of Product Master — five, all real conflicts. */
export const catalogHeldBack = () => catalogBuild().heldBack;

export interface CatalogSummary {
  /** Rows in the price file. */
  rows: number;
  /** Products built from them. */
  products: number;
  sellable: number;
  blocked: number;
  codePending: number;
  conflicted: number;
  heldBack: number;
  generatedAt: string;
}

export function catalogSummary(): CatalogSummary {
  const { products, heldBack } = catalogBuild();
  const by = (f: (p: Product) => boolean) => products.filter(f).length;

  return {
    rows: priceMasterRows().length,
    products: products.length,
    sellable: by((p) => p.status === "Active"),
    blocked: by((p) => p.status !== "Active"),
    codePending: by((p) => Boolean(p.priceRef?.codePending)),
    conflicted: by((p) => (p.priceRef?.conflicts.length ?? 0) > 0),
    heldBack: heldBack.length,
    generatedAt: priceListMeta().generatedAt,
  };
}
