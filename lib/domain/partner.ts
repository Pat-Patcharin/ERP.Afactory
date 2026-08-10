import {
  BILLING_ADDRESS_TYPES,
  BP_ROLE_DEFS,
  BUSINESS_PARTNERS as RAW,
  DELIVERY_ADDRESS_TYPES,
  LEGACY_ADDRESS_TYPES,
  type BpBank,
  type BpImage,
  type BpRoleDef,
  type BpSupplierItem,
  type BusinessPartner,
} from "@/data/partners";
import {
  ATTACHMENT_SEED,
  CUSTOMER_SEED,
  PARTNER_IMAGES,
  SUPPLIER_ITEMS,
  SUPPLIER_SEED,
} from "@/data/partner-profiles";
import { resolveSalesArea } from "@/data/sales-areas";
/* The decorated master, not the raw file: the price list master folds in
   there, so a supplier item naming a catalogue product still finds its unit. */
import { PRODUCTS } from "./product";
import { DASH, daysUntil, today } from "@/lib/format";

/* ============================================================
   BUSINESS PARTNER — one legal entity, many roles.

   The A-Factory BP Master schema added address defaults, contact
   and bank lists, a gallery, customer/supplier profiles and a
   supplier item table. Every one of those is OPTIONAL on the
   record: `normalise()` fills the gaps on load, so a partner
   written before the schema existed reads exactly like one
   written after it.

   The rule the whole module follows: a figure has ONE home.
   Credit limit lives on `credit`, the sales rep on `sales`, the
   currency on `purchasing`. The customer and supplier profiles
   read them rather than storing them again, so the Customer tab
   and the Credit tab can never disagree.
   ============================================================ */

type Address = BusinessPartner["addresses"][number];
type Contact = BusinessPartner["contacts"][number];
type Bank = BusinessPartner["banks"][number];
type Doc = BusinessPartner["docs"][number];

export interface BpRow extends BusinessPartner {
  /** Generic aliases the shared engines read. */
  name: string;
  icon: string;
  roleList: BpRoleDef[];
  roleNames: string;
  contactName: string;
  phone: string;
  mobile: string;
  email: string;
  province: string;
  salesRep: string;
  payTerm: string;
  creditStatus: string;
  taxId: string;
  /** Customer / Supplier / Both / — the phrasing the spec uses. */
  bpMode: string;
  /** Flattened profile values, so list columns and search read one field. */
  customerType: string;
  supplierType: string;
  businessType: string;
  riskLevel: string;
  /** Sales territory — from the sales block, falling back to classification. */
  salesArea: string;
  /**
   * The area the billing address actually falls in, read off the territory
   * master. Kept separate from `salesArea` (which is what someone typed on
   * the record) so the two can be compared instead of one overwriting the
   * other. DASH when the address is too thin to place — most often a Bangkok
   * address with no district.
   */
  salesAreaFromAddress: string;
  /** True when the recorded territory disagrees with the address. */
  salesAreaMismatch: boolean;
  creditLimit: number;
  creditUsed: number;
  availableCredit: number;
  /** Every contact name joined — the list search matches any of them. */
  contactNames: string;
  /** Every supplier SKU joined — likewise. */
  supplierSkus: string;
  addressCount: number;
  contactCount: number;
  bankCount: number;
  docCount: number;
  imageCount: number;
  supplierItemCount: number;
  /** A partner with any transaction must never be hard-deleted. */
  txnCount: number;
}

export const BUSINESS_PARTNERS = RAW as BpRow[];

/* ---------- Role helpers ---------- */

export const bpRoleList = (bp: BusinessPartner) =>
  BP_ROLE_DEFS.filter((r) => bp.roles?.[r.key as keyof typeof bp.roles]);

/** A dealer buys to resell, so it is a customer for every rule that matters. */
export const isCustomerRole = (bp: BusinessPartner) =>
  Boolean(bp.roles?.customer || bp.roles?.dealer);

export const isSupplierRole = (bp: BusinessPartner) => Boolean(bp.roles?.supplier);

/** Customer / Supplier / Both — derived, never stored. */
export function bpMode(bp: BusinessPartner): string {
  const c = isCustomerRole(bp);
  const s = isSupplierRole(bp);
  if (c && s) return "Both";
  if (c) return "Customer";
  if (s) return "Supplier";
  return DASH;
}

/* ---------- Address ---------- */

export const bpPrimaryContact = (bp: BusinessPartner) =>
  bp.contacts?.find((c) => c.primary) ?? bp.contacts?.[0] ?? null;

export const bpPrimaryAddress = (bp: BusinessPartner) =>
  bp.addresses?.find((a) => a.primary) ?? bp.addresses?.[0] ?? null;

export const canBill = (a: Address) => BILLING_ADDRESS_TYPES.includes(a.type);
export const canDeliver = (a: Address) => DELIVERY_ADDRESS_TYPES.includes(a.type);

/**
 * The address an invoice goes to. Falls back down the chain rather than
 * returning nothing: an explicit default, then any address that can bill,
 * then the legacy primary. Billing must always resolve — the module refuses
 * to save a partner without one.
 */
export const bpBillingAddress = (bp: BusinessPartner): Address | null =>
  bp.addresses?.find((a) => a.billingPrimary) ??
  bp.addresses?.find((a) => canBill(a) && a.active) ??
  bpPrimaryAddress(bp);

/**
 * Where the goods go. Required as of the address rework — `bpValidate` blocks
 * a partner without one — but still typed as nullable, because a record can
 * be read before it has been validated and a caller that assumes otherwise
 * would throw on exactly the data the rule exists to catch.
 */
export const bpDeliveryAddress = (bp: BusinessPartner): Address | null =>
  bp.addresses?.find((a) => a.deliveryPrimary) ??
  bp.addresses?.find((a) => canDeliver(a) && a.active) ??
  null;

/** One-line rendering used by tables and the summary card. */
export const addressLine = (a: Address | null): string =>
  a
    ? [a.l1, a.l2, a.sub, a.dist, a.prov, a.zip].filter(Boolean).join(" ").trim()
    : DASH;

/** A Google Maps link, from the stored URL or from the coordinates. */
export function mapUrl(a: Address): string {
  if (a.maps) return a.maps;
  if (a.lat && a.lng) return `https://maps.google.com/?q=${a.lat},${a.lng}`;
  return "";
}

export const hasCoordinates = (a: Address) => Boolean(a.lat && a.lng);

/* ---------- Normalisation ---------- */

/**
 * Exactly one address carries each default. Called after every address
 * mutation, so "set as billing" cannot leave two winners or none.
 */
export function reconcileAddressDefaults(bp: BusinessPartner) {
  const rows = bp.addresses ?? [];
  if (!rows.length) return;

  const fix = (flag: "billingPrimary" | "deliveryPrimary", eligible: (a: Address) => boolean) => {
    const marked = rows.filter((a) => a[flag]);
    if (marked.length === 1) return;
    if (marked.length > 1) {
      /* Last write wins: keep the final one, clear the rest. */
      const keep = marked[marked.length - 1];
      for (const a of marked) if (a !== keep) a[flag] = false;
      return;
    }
    const candidate =
      rows.find((a) => eligible(a) && a.active) ?? rows.find((a) => a.primary) ?? rows[0];
    if (candidate) candidate[flag] = true;
  };

  fix("billingPrimary", canBill);
  /* Every address kind can receive goods now, so this holds whenever there is
     an address at all — kept as a guard rather than assumed, because the list
     of kinds is data and could gain one that cannot. */
  if (rows.some((a) => canDeliver(a))) fix("deliveryPrimary", canDeliver);

  if (!rows.some((a) => a.primary)) {
    const b = bpBillingAddress(bp);
    if (b) b.primary = true;
  }
}

/** Infer the attachment's file kind from its name, for the row icon. */
export function docKind(name: string): string {
  const ext = String(name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  return "other";
}

/** Credit term as the spec words it, derived from the credit block. */
function creditTermOf(bp: BusinessPartner): string {
  if (bp.creditTerm) return bp.creditTerm;
  const days = bp.credit?.days ?? 0;
  if (!days) return "No Credit";
  const nearest = [30, 60, 90, 120].reduce((best, d) =>
    Math.abs(d - days) < Math.abs(best - days) ? d : best,
  );
  return String(nearest);
}

/**
 * Fill in everything the record may predate. Idempotent — it reads what is
 * there and only writes what is missing, so running it again after an edit
 * never undoes a user's choice.
 */
function normalise(bp: BusinessPartner) {
  bp.addresses ??= [];
  bp.contacts ??= [];
  bp.banks ??= [];
  /* Every account written before the international block existed is a
     domestic one — the flag decides which fields the form asks for. */
  for (const k of bp.banks) k.scope ||= "ในประเทศ";
  /* The seeded partners carry an empty docs array rather than none, so an
     emptiness check — not `??=` — is what actually adopts the seed. */
  if (!bp.docs?.length) bp.docs = ATTACHMENT_SEED[bp.code] ?? bp.docs ?? [];
  bp.supplierItems ??= SUPPLIER_ITEMS[bp.code] ?? [];
  /* Purchase unit joined the line after the seeds were written; the product
     master already knows it, so an older row does not read blank. A row that
     quotes in our own base unit converts one for one, which is what an
     unstated factor means — never 0, which would multiply every receipt to
     nothing. */
  for (const i of bp.supplierItems) {
    i.punit ||= PRODUCTS.find((p) => p.code === i.product)?.unit ?? "";
    if (!i.punitFactor || i.punitFactor <= 0) i.punitFactor = 1;
  }
  bp.images ??= PARTNER_IMAGES[bp.code] ?? [];

  for (const a of bp.addresses) {
    /* Migrate the pre-schema vocabulary first — everything downstream asks
       "can this bill?", and the old names answer no to every question. */
    a.type = LEGACY_ADDRESS_TYPES[a.type] ?? a.type;
    a.email ??= "";
    a.remark ??= "";
    a.image ??= "";
    a.billingPrimary ??= false;
    a.deliveryPrimary ??= false;
  }
  reconcileAddressDefaults(bp);

  for (const c of bp.contacts) c.remark ??= "";
  for (const d of bp.docs) {
    d.remark ??= "";
    d.kind ??= docKind(d.name);
  }

  bp.since ??= bp.created?.split(" ")[0] ?? "";
  bp.billType ??= bp.tax?.vatReg ? "VAT" : "Non VAT";
  bp.creditTerm = creditTermOf(bp);
  bp.profileImage ??= bp.images.find((i) => i.cover)?.src ?? bp.logo;

  /* ---- Customer profile: new dimensions from the seed, money from `credit`,
     ownership from `sales`. Never a second copy. ---- */
  if (isCustomerRole(bp)) {
    const seed = CUSTOMER_SEED[bp.code];
    const limit = bp.credit?.limit ?? 0;
    const used = bp.credit?.outstanding ?? 0;
    bp.customer = {
      custType: bp.customer?.custType ?? seed?.custType ?? "Private",
      bizType: bp.customer?.bizType ?? seed?.bizType ?? "Company",
      benefit: bp.customer?.benefit ?? seed?.benefit ?? "0%",
      benefitPct: bp.customer?.benefitPct ?? seed?.benefitPct ?? 0,
      size: bp.customer?.size ?? seed?.size ?? "S",
      rep: bp.sales?.rep || DASH,
      priceList: bp.sales?.priceList || DASH,
      creditLimit: limit,
      creditUsed: used,
      creditHold:
        bp.customer?.creditHold ?? seed?.creditHold ?? bp.credit?.status === "Credit Hold",
      holdReason: bp.customer?.holdReason ?? seed?.holdReason ?? bp.credit?.holdReason ?? "",
      risk: bp.customer?.risk ?? seed?.risk ?? "Medium",
      payMethod: bp.customer?.payMethod ?? seed?.payMethod ?? "Transfer",
    };
  } else {
    bp.customer = null;
  }

  if (isSupplierRole(bp)) {
    const seed = SUPPLIER_SEED[bp.code];
    bp.supplier = {
      supType: bp.supplier?.supType ?? seed?.supType ?? "Distributor",
      status:
        bp.supplier?.status ??
        seed?.status ??
        (bp.purchasing?.preferred ? "Preferred" : "Approved"),
      preferred: bp.purchasing?.preferred ?? false,
      lead: parseInt(String(bp.purchasing?.lead ?? "").replace(/\D/g, ""), 10) || 0,
      currency: bp.purchasing?.currency || "THB",
      payMethod: bp.supplier?.payMethod ?? seed?.payMethod ?? "Transfer",
    };
  } else {
    bp.supplier = null;
  }
}

/* ============================================================
   VENDORS THE PRODUCT MASTER NAMES BUT NOBODY HAS ONBOARDED

   The product master records who a product is bought from as a
   NAME — 23 of them across 757 products — and the partner master
   knows nothing about any of them. Nothing joined the two, so
   every question of the form "is this partner the supplier of
   that product" had no answer, and the eight prototype products
   carried a third spelling of the same idea (`sup.code`, the
   `SUP-0012` series) that matched neither.

   Three ways to name a supplier, none of them meeting. This
   closes it by making the names real: one stub partner per
   distinct vendor, generated from the same file the products
   were, so regenerating the price master keeps them in step.
   The same reasoning as `mergeCatalog` in product.ts, and the
   same rule — a generated record NEVER overwrites a hand-written
   one, so a vendor whose name matches a partner already on file
   is left alone and simply resolves to it.

   These are STUBS and say so: no tax ID, no address, no contact,
   status "Draft". That is the truth about them — nobody has
   onboarded these companies — and it is deliberately visible
   rather than papered over with invented detail. A Draft partner
   already cannot open a sales order, and opening one in the form
   will demand a contact with a telephone before it can be saved,
   which is exactly the prompt somebody needs.
   ============================================================ */

/** Comparable form of a company name — case and spacing are not identity. */
const vendorKey = (name: string) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(co|ltd|inc|corp|corporaion|corporation|company|limited|intl|international)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Every name a partner already answers to. */
const partnerNameKeys = (bp: BusinessPartner) =>
  [bp.nameTh, bp.nameEn, bp.trade].filter(Boolean).map(vendorKey);

function vendorStub(name: string, code: string): BusinessPartner {
  return {
    code,
    /* The vendor master is written in English; there is no Thai name to
       invent, and inventing one would be worse than leaving it to whoever
       onboards the company properly. */
    nameTh: name,
    nameEn: name,
    trade: name,
    type: "Company",
    logo: "🏭",
    website: "",
    /* Unverified, not Draft — see the note on BP_STATUS. Nobody started
       this record, so it does not belong in the queue of records somebody
       started. Not Active either: nothing about this company is checked. */
    status: "Unverified",
    notes: "สร้างอัตโนมัติจากชื่อผู้ขายในราคากลาง — ยังไม่ได้ตรวจสอบข้อมูลบริษัท",
    roles: { customer: false, supplier: true, dealer: false, prospect: false, other: false },
    cls: {
      custGroup: "",
      supGroup: "",
      industry: "",
      bizType: "",
      custLevel: "",
      priceGroup: "",
      territory: "",
      channel: "",
    },
    tax: {
      entity: "",
      taxId: "",
      branchType: "",
      branchNo: "",
      regName: "",
      vatReg: false,
      vatDate: "",
      wht: false,
      regNo: "",
      country: "",
    },
    contacts: [],
    addresses: [],
    sales: null,
    purchasing: null,
    credit: {
      payTerm: "",
      limit: 0,
      days: 0,
      outstanding: 0,
      openSO: 0,
      openInv: 0,
      available: 0,
      status: "Not Applicable",
      holdReason: "",
      holdDate: "",
      approvedBy: "",
      approvalDate: "",
    },
    banks: [],
    docs: [],
    txn: { so: [], po: [], inv: [] },
    history: [],
    created: today(),
    createdBy: VENDOR_STUB_AUTHOR,
    updated: today(),
    updatedBy: VENDOR_STUB_AUTHOR,
  };
}

/**
 * Give every vendor named by the product master a partner record.
 *
 * Deterministic: the names are sorted before codes are handed out, so the
 * same vendor keeps the same code across reloads and between runs. Codes
 * continue the one BP sequence rather than starting a block of their own —
 * a separate range would be a fourth way of saying "supplier", which is the
 * thing this is here to stop.
 */
function mergeVendors() {
  const taken = new Map<string, string>();
  for (const bp of RAW) for (const k of partnerNameKeys(bp)) taken.set(k, bp.code);

  const names = [...new Set(PRODUCTS.map((p) => String(p.supplier ?? "").trim()))]
    .filter((n) => n && n !== DASH)
    .filter((n) => !taken.has(vendorKey(n)))
    .sort();

  let seq = RAW.reduce(
    (m, b) => Math.max(m, parseInt(b.code.replace(/\D/g, ""), 10) || 0),
    0,
  );

  for (const name of names) {
    const code = `BP${String(++seq).padStart(6, "0")}`;
    RAW.push(vendorStub(name, code));
    taken.set(vendorKey(name), code);
  }

  vendorIndex = taken;
}

/** vendor-name key → partner code. Built by mergeVendors. */
let vendorIndex = new Map<string, string>();

/**
 * The partner a product is bought from.
 *
 * This is the join that did not exist. Every caller that used to compare
 * supplier NAMES should come through here instead — matching on a name is
 * what left purchase history unable to find its own supplier.
 */
export function vendorPartner(name: string | null | undefined): BpRow | null {
  const code = vendorIndex.get(vendorKey(String(name ?? "")));
  return code ? (BUSINESS_PARTNERS.find((b) => b.code === code) ?? null) : null;
}

/** Is this partner the supplier the product master names for that product? */
export const isDefaultSupplierOf = (partnerCode: string, product: { supplier?: string }) =>
  Boolean(partnerCode) && vendorPartner(product.supplier)?.code === partnerCode;

/** Who wrote a generated vendor stub. One spelling, checked in one place. */
export const VENDOR_STUB_AUTHOR = "Price List Master";

/**
 * A record the system created from a vendor name, that nobody has onboarded.
 *
 * Exported because the invariants the seeded partners hold — every one has a
 * billing address, a delivery address, a territory, an attachment — are
 * properties of a partner somebody FILLED IN, and a stub has by definition
 * had nothing filled in. Tests and code check the same predicate rather than
 * each deciding for itself what "a real partner" means.
 *
 * Provenance, not status: an administrator part-way through onboarding one of
 * these will move it off `Unverified` long before it is complete, and it
 * should stop being exempt at exactly that moment.
 */
export const isVendorStub = (bp: BusinessPartner) =>
  bp.createdBy === VENDOR_STUB_AUTHOR && bp.status === "Unverified";

/** The partners somebody has actually taken responsibility for. */
export const onboardedPartners = () => BUSINESS_PARTNERS.filter((b) => !isVendorStub(b));

mergeVendors();

/* ============================================================
   ONE HOME FOR WHAT IT COSTS TO BUY SOMETHING

   The terms of a purchase — minimum order, lead time, the price
   quoted, the vendor's own code for our item — were kept twice.
   On the product as `sup`, formatted for reading; on the partner
   as a `supplierItems` row, as numbers. Nothing kept them in
   step, and they had already drifted. For AA-TH003-WL:

     product.sup     moq "240 Tube"  lead "21 วัน"  price "68.50 THB"
     BP000121 item   moq 24          lead 14        price 420

   Two answers to one question, and they even name different
   suppliers. Whoever read one was wrong half the time.

   The supplier item wins, for a reason that is not a preference:
   it is keyed by (partner, product), which is the grain these
   facts actually have. The same item from a second source has
   its own minimum and its own wait, and `altSuppliers` on the
   product says second sources already exist. A figure kept on
   the product alone has to be wrong for one of them.

   So: every product whose vendor resolves to a partner gets a
   row on that partner, and `product.sup` becomes a view of it.
   ============================================================ */

/**
 * The leading number in a legacy display string — "240 Tube" → 240.
 *
 * Used ONCE, here, to carry the old strings across. Not a reading-time
 * parser: the value it produces is stored as a number and the string is
 * never consulted again. Returns 0 for "not stated", which is what an
 * unparseable or absent value honestly means.
 */
export function leadingNumber(v: unknown): number {
  const m = /-?\d+(?:\.\d+)?/.exec(String(v ?? ""));
  return m ? Number(m[0]) : 0;
}

/**
 * "Carton (24 Tube)" → { unit: "Carton", factor: 24 }.
 *
 * Same one-time role as `leadingNumber`. The old seed wrote a purchase unit
 * with its conversion in brackets, which reads perfectly and computes not at
 * all; this splits the two apart so the number can be multiplied by. A plain
 * "Box" converts one for one, which is the truthful reading of a unit that
 * never claimed to contain anything.
 */
/**
 * A minimum recorded in stock units, restated in the unit it is ordered in.
 *
 * One-time, like the two above. A remainder is left alone rather than
 * rounded: "250 Tube" against a Carton of 24 is 10.4 cartons, and both
 * roundings are a different order from the one somebody agreed to. Leaving
 * the figure as it was keeps it visibly wrong instead of quietly wrong,
 * which is the version a buyer can catch.
 */
export function toPurchaseUnits(moqInBase: number, factor: number): number {
  if (!(moqInBase > 0) || !(factor > 1)) return moqInBase;
  const q = moqInBase / factor;
  return Number.isInteger(q) ? q : moqInBase;
}

export function splitPackedUnit(v: unknown): { unit: string; factor: number } {
  const raw = String(v ?? "").trim();
  const m = /^(.*?)\s*\((\d+(?:\.\d+)?)[^)]*\)$/.exec(raw);
  if (!m) return { unit: raw, factor: 1 };
  return { unit: m[1].trim() || raw, factor: Number(m[2]) || 1 };
}

/**
 * Give every partner the rows for the products the master says they supply.
 *
 * Never overwrites a row that already exists: the hand-written seeds in
 * `SUPPLIER_ITEMS` are what somebody actually agreed, and a figure derived
 * from the product master must not silently replace one a buyer typed.
 */
function mergeSupplierItems() {
  const byPartner = new Map<string, typeof PRODUCTS>();
  for (const p of PRODUCTS) {
    const owner = vendorPartner(p.supplier);
    if (!owner) continue;
    const list = byPartner.get(owner.code) ?? [];
    list.push(p);
    byPartner.set(owner.code, list);
  }

  /* Adopt the hand-written seeds FIRST, for every partner — not only the
     ones the product master points at. Skipping a partner with no products
     left its seeded rows invisible while the generated ones were being
     written, so a row somebody typed lost to a row derived from a stale
     string. Generated data never beats hand-written data; that only holds if
     the hand-written data is in place before the generating starts. */
  for (const bp of BUSINESS_PARTNERS) bp.supplierItems ??= SUPPLIER_ITEMS[bp.code] ?? [];

  for (const bp of BUSINESS_PARTNERS) {
    const mine = byPartner.get(bp.code);
    if (!mine?.length) continue;
    const held = new Set(bp.supplierItems!.map((i) => i.product));

    for (const p of mine) {
      if (held.has(p.code)) continue;
      const legacy = (p as { sup?: Record<string, unknown> }).sup;
      /* The oldest records wrote the pack size into the unit's NAME —
         "Carton (24 Tube)". Split that once, here, so the row stores a unit
         and a number rather than a sentence. A record that already states the
         factor outright wins over re-reading the name, because the name is
         the thing being migrated away from. */
      const packed = splitPackedUnit(legacy?.punit);
      const stated = Number(legacy?.punitFactor);
      bp.supplierItems!.push({
        product: p.code,
        productName: p.name,
        /* The vendor's own code, where the product carried one. */
        sku: String(legacy?.itemCode ?? ""),
        supName: p.name,
        punit: packed.unit || p.unit,
        punitFactor: stated > 0 ? stated : packed.factor,
        /* 0 means "not stated", and for the catalogue products that is the
           truth — the price list master records a vendor and a cost, and
           has never held a minimum or a lead time. */
        moq: toPurchaseUnits(
          leadingNumber(legacy?.moq),
          stated > 0 ? stated : packed.factor,
        ),
        lead: leadingNumber(legacy?.lead),
        currency: p.pricing?.currency || "THB",
        /* The last cost actually paid, which the pricing block does know. */
        price: p.pricing?.lastCost ?? 0,
        preferred: true,
        status: p.status === "Active" ? "Active" : "Draft",
        effective: p.pricing?.effective ?? "",
        expiry: "",
      });
      held.add(p.code);
    }
  }

  /*
     Second sources, onto the partner that offers them.

     `product.altSuppliers` was the other half of the old arrangement: a list
     on the product, naming companies by name and carrying the `SUP-xxxx`
     code that joined to nothing. Every one of those names resolves to a
     partner now, so the rows belong beside the default supplier's row —
     same shape, same place, `preferred: false` to say which is which.

     This is what makes (partner × product) the right grain rather than a
     claim about it: AA-TH003-WL is bought from three companies at three
     prices with three lead times, and there is now one row per company
     instead of one figure on the product that has to be wrong for two.
  */
  for (const p of PRODUCTS) {
    const alts = (p as unknown as { altSuppliers?: { name: string; lead: string; price: string }[] })
      .altSuppliers;
    if (!alts?.length) continue;

    for (const alt of alts) {
      const owner = vendorPartner(alt.name);
      if (!owner) continue;
      owner.supplierItems ??= [];
      if (owner.supplierItems.some((i) => i.product === p.code)) continue;

      owner.supplierItems.push({
        product: p.code,
        productName: p.name,
        sku: "",
        supName: p.name,
        /* The alt list never recorded a pack size either, so this second
           source is taken to quote in our base unit until somebody says
           otherwise. */
        punit: p.unit,
        punitFactor: 1,
        /* The alt list never recorded a minimum. 0 is "not stated", which is
           the truth, rather than borrowing the default supplier's figure. */
        moq: 0,
        lead: leadingNumber(alt.lead),
        currency: p.pricing?.currency || "THB",
        price: leadingNumber(alt.price),
        preferred: false,
        status: "Active",
        effective: p.pricing?.effective ?? "",
        expiry: "",
      });
    }
  }
}

mergeSupplierItems();

/**
 * Exactly one preferred supplier per product.
 *
 * The same invariant `reconcileAddressDefaults` holds for billing addresses,
 * and for the same reason: "preferred" cannot be true of two rows at once
 * without the word meaning nothing. Five places read this flag, including a
 * Preferred badge on the screen and `supplyTermsFor`'s own fallback, and
 * three products ended up claiming two — a hand-written row on one partner
 * and a generated row on the vendor the master names.
 *
 * The named supplier wins, because that is the answer everything else
 * already gives. This does clear a flag on a hand-written row, which is not
 * the same as overwriting one: the row keeps its price, its lead time and
 * its minimum, and only stops claiming to be the default that another row
 * is also claiming.
 */
function reconcileSupplierPreference() {
  const byProduct = new Map<string, { bp: BpRow; row: BpSupplierItem }[]>();
  for (const bp of BUSINESS_PARTNERS) {
    for (const row of bp.supplierItems ?? []) {
      const list = byProduct.get(row.product) ?? [];
      list.push({ bp, row });
      byProduct.set(row.product, list);
    }
  }

  for (const [productCode, rows] of byProduct) {
    if (rows.length < 2) continue;
    const product = PRODUCTS.find((p) => p.code === productCode);
    const named = product ? vendorPartner(product.supplier)?.code : undefined;

    const winner =
      rows.find((r) => r.bp.code === named) ?? rows.find((r) => r.row.preferred) ?? rows[0];
    for (const r of rows) r.row.preferred = r === winner;
  }
}

reconcileSupplierPreference();

/**
 * Render the agreed terms back onto `product.sup`, so the Product master
 * shows what the supplier item says rather than its own stale copy.
 *
 * A view, not a second home: only the four fields that ARE the terms are
 * written. `sup.country` and `sup.warranty` are facts about the product and
 * its regulatory paperwork, not about a purchase, and they stay where they
 * are and stay editable.
 *
 * Done here rather than in `decorateProducts` because the supplier items do
 * not exist until this module has run — product.ts cannot import partner.ts
 * without closing a loop, and the loop is what left `recordTotals` undefined
 * the last time somebody tried.
 */
function syncProductSupplyView() {
  for (const p of PRODUCTS) {
    const found = supplyTermsFor(p.code);
    if (!found) continue;
    const { partner, row } = found;
    const sup = (p as unknown as { sup: Record<string, unknown> }).sup;
    if (!sup) continue;

    sup.code = partner.code;
    sup.itemCode = row.sku;
    sup.punit = row.punit || p.unit;
    sup.punitFactor = row.punitFactor && row.punitFactor > 0 ? row.punitFactor : 1;
    /*
       MOQ is counted in the PURCHASE unit — "ขั้นต่ำ 10 ลัง" is how the
       supplier states it and how the order goes out.

       The recorded minimums were written in the stock unit and converted
       once in mergeSupplierItems. Rendering it against the wrong unit is a
       ten-times error either way round, so the unit shown here comes from
       the same row as the number.
    */
    sup.moq = row.moq > 0 ? `${row.moq} ${row.punit || p.unit}`.trim() : DASH;
    sup.lead = row.lead > 0 ? `${row.lead} วัน` : DASH;
    sup.lastPrice = row.price > 0 ? `${row.price.toFixed(2)} ${row.currency}` : DASH;

    /*
       The second sources, rendered from the same rows — so the alternatives
       list cannot disagree with the partners it names either. It carried a
       `SUP-xxxx` code that joined to nothing; it carries the partner code
       now, which opens the record it is talking about.

       `detail.altSupRows` is rebuilt alongside it: `decorateProducts` built
       that from the old list before this module had loaded, and leaving it
       would put a stale table under a fresh summary. It also gains a real
       MOQ, which the old row could only ever show as a dash.
    */
    const others: { partner: BpRow; row: BpSupplierItem }[] = [];
    for (const bp of BUSINESS_PARTNERS) {
      if (bp.code === partner.code) continue;
      const r = (bp.supplierItems ?? []).find((i) => i.product === p.code);
      if (r) others.push({ partner: bp, row: r });
    }

    const prod = p as unknown as {
      altSuppliers: { name: string; code: string; lead: string; price: string }[];
      detail?: { altSupRows: unknown[] };
    };
    prod.altSuppliers = others.map(({ partner: bp, row: r }) => ({
      name: bp.nameTh || bp.nameEn,
      code: bp.code,
      lead: r.lead > 0 ? `${r.lead} วัน` : DASH,
      price: r.price.toFixed(2),
    }));
    if (prod.detail) {
      prod.detail.altSupRows = others.map(({ partner: bp, row: r }) => ({
        name: bp.nameTh || bp.nameEn,
        code: bp.code,
        punit: r.punit || p.unit,
        punitFactor: r.punitFactor && r.punitFactor > 0 ? r.punitFactor : 1,
        moq: r.moq > 0 ? String(r.moq) : DASH,
        lead: r.lead > 0 ? `${r.lead} วัน` : DASH,
        price: r.price,
        status: r.status,
      }));
    }
  }
}

syncProductSupplyView();

/**
 * The buying terms for a product, from the one place they live.
 *
 * `product.sup` is rendered from this rather than stored, so the Product
 * master and the partner's supplier item cannot say different things.
 */
export function supplyTermsFor(productCode: string) {
  const rows: { partner: BpRow; row: BpSupplierItem }[] = [];
  for (const bp of BUSINESS_PARTNERS) {
    const row = (bp.supplierItems ?? []).find((i) => i.product === productCode);
    if (row) rows.push({ partner: bp, row });
  }
  if (!rows.length) return null;

  /*
     "Whichever partner came first in the array" is not a rule, and it gave
     the wrong answer the moment a product had two sources: a generated row
     on the vendor the master names, and a row somebody had typed on another
     partner who also supplies it. `altSuppliers` says second sources are
     normal, so this has to be decided rather than stumbled into.

     The default supplier is the one the product master names. Failing that,
     the row marked preferred. Failing that, the only one there is.
  */
  const product = PRODUCTS.find((p) => p.code === productCode);
  const named = product ? vendorPartner(product.supplier)?.code : undefined;

  return (
    rows.find((r) => r.partner.code === named) ??
    rows.find((r) => r.row.preferred) ??
    rows[0]
  );
}

/* ---------- Decoration ---------- */

export function decorateBPs() {
  for (const bp of BUSINESS_PARTNERS) {
    normalise(bp);

    const c = bpPrimaryContact(bp);
    const billing = bpBillingAddress(bp);

    bp.name = bp.nameTh || bp.nameEn;
    bp.icon = bp.profileImage || bp.logo;
    bp.roleList = bpRoleList(bp);
    bp.roleNames = bp.roleList.map((r) => r.label).join(", ") || DASH;
    bp.bpMode = bpMode(bp);

    bp.contactName = c ? `${c.prefix}${c.first} ${c.last}`.trim() : DASH;
    bp.phone = c ? c.phone || c.mobile || DASH : DASH;
    bp.mobile = c ? c.mobile || DASH : DASH;
    bp.email = c ? c.email || DASH : DASH;
    bp.contactNames = bp.contacts
      .map((x) => `${x.prefix}${x.first} ${x.last}`.trim())
      .join(" · ");

    bp.province = billing ? billing.prov : DASH;
    bp.salesRep = bp.sales?.rep || DASH;
    bp.payTerm = bp.sales?.payTerm ?? bp.purchasing?.payTerm ?? DASH;
    bp.creditStatus = bp.credit ? bp.credit.status : "Not Applicable";
    bp.taxId = bp.tax?.taxId ?? "";

    bp.customerType = bp.customer?.custType ?? DASH;
    bp.supplierType = bp.supplier?.supType ?? DASH;
    bp.businessType = bp.customer?.bizType ?? bp.cls?.bizType ?? DASH;
    bp.riskLevel = bp.customer?.risk ?? DASH;
    bp.salesArea = bp.sales?.territory || bp.cls?.territory || DASH;

    const placed = billing ? resolveSalesArea(billing.prov, billing.dist) : null;
    bp.salesAreaFromAddress = placed?.name ?? DASH;
    /* Only a disagreement counts — an unplaceable address or a blank
       territory is incomplete data, not a contradiction. */
    bp.salesAreaMismatch =
      Boolean(placed) && bp.salesArea !== DASH && bp.salesArea !== placed!.name;
    bp.creditLimit = bp.credit?.limit ?? 0;
    bp.creditUsed = bp.credit?.outstanding ?? 0;
    bp.availableCredit = Math.max(0, bp.creditLimit - bp.creditUsed);

    bp.supplierSkus = (bp.supplierItems ?? []).map((i) => i.sku).join(" ");

    bp.addressCount = bp.addresses.length;
    bp.contactCount = bp.contacts.length;
    bp.bankCount = bp.banks.length;
    bp.docCount = bp.docs.length;
    bp.imageCount = bp.images?.length ?? 0;
    bp.supplierItemCount = bp.supplierItems?.length ?? 0;

    bp.txnCount =
      (bp.txn?.so?.length ?? 0) + (bp.txn?.po?.length ?? 0) + (bp.txn?.inv?.length ?? 0);
  }
}

decorateBPs();

export const getBP = (code: string) =>
  BUSINESS_PARTNERS.find((b) => b.code === code) ?? null;

/** Next code in the BP000001 sequence — role is never encoded in the code. */
export function nextBPCode(): string {
  const n = BUSINESS_PARTNERS.reduce(
    (m, b) => Math.max(m, parseInt(b.code.replace(/\D/g, ""), 10) || 0),
    0,
  );
  return `BP${String(n + 1).padStart(6, "0")}`;
}

/* ============================================================
   CHILD TABLE CRUD

   Every mutation goes through here rather than through the UI, so
   the invariants (one billing default, one primary contact, one
   default bank, one cover image) hold no matter which screen made
   the change — detail drawer, form, or a future import run.
   ============================================================ */

export const blankAddress = (): Address => ({
  name: "",
  type: "Both",
  l1: "",
  l2: "",
  sub: "",
  dist: "",
  prov: "",
  zip: "",
  country: "ประเทศไทย",
  phone: "",
  contact: "",
  maps: "",
  lat: "",
  lng: "",
  primary: false,
  active: true,
  email: "",
  remark: "",
  image: "",
  billingPrimary: false,
  deliveryPrimary: false,
});

export function bpAddAddress(bp: BusinessPartner, patch: Partial<Address> = {}): Address {
  const row = { ...blankAddress(), ...patch };
  bp.addresses.push(row);
  reconcileAddressDefaults(bp);
  return row;
}

export function bpUpdateAddress(bp: BusinessPartner, index: number, patch: Partial<Address>) {
  const row = bp.addresses[index];
  if (!row) return null;
  Object.assign(row, patch);
  reconcileAddressDefaults(bp);
  return row;
}

/**
 * Removing an address is refused when it is the last one that can bill —
 * an invoice with nowhere to go is a worse outcome than a stale address.
 */
export function bpRemoveAddress(bp: BusinessPartner, index: number): string | null {
  const row = bp.addresses[index];
  if (!row) return "ไม่พบที่อยู่";
  const billable = bp.addresses.filter(canBill);
  if (canBill(row) && billable.length <= 1) {
    return "ต้องมีที่อยู่สำหรับออกใบกำกับภาษีอย่างน้อย 1 แห่ง";
  }
  bp.addresses.splice(index, 1);
  reconcileAddressDefaults(bp);
  return null;
}

export function bpSetPrimaryBilling(bp: BusinessPartner, index: number): string | null {
  const row = bp.addresses[index];
  if (!row) return "ไม่พบที่อยู่";
  if (!canBill(row)) return `ที่อยู่ประเภท ${row.type} ใช้ออกใบกำกับภาษีไม่ได้`;
  for (const a of bp.addresses) a.billingPrimary = a === row;
  return null;
}

export function bpSetPrimaryDelivery(bp: BusinessPartner, index: number): string | null {
  const row = bp.addresses[index];
  if (!row) return "ไม่พบที่อยู่";
  if (!canDeliver(row)) return `ที่อยู่ประเภท ${row.type} ใช้จัดส่งไม่ได้`;
  for (const a of bp.addresses) a.deliveryPrimary = a === row;
  return null;
}

/* ---------- Contacts ---------- */

export const blankContact = (): Contact => ({
  code: "",
  prefix: "คุณ",
  first: "",
  last: "",
  pos: "",
  dept: "",
  phone: "",
  mobile: "",
  email: "",
  line: "",
  method: "โทรศัพท์",
  primary: false,
  active: true,
  remark: "",
});

/** Sequential contact code within the partner: CT001, CT002, … */
function nextContactCode(bp: BusinessPartner): string {
  const n = bp.contacts.reduce(
    (m, c) => Math.max(m, parseInt(String(c.code).replace(/\D/g, ""), 10) || 0),
    0,
  );
  return `CT${String(n + 1).padStart(3, "0")}`;
}

export function bpAddContact(bp: BusinessPartner, patch: Partial<Contact> = {}): Contact {
  const row = { ...blankContact(), ...patch };
  row.code ||= nextContactCode(bp);
  bp.contacts.push(row);
  if (!bp.contacts.some((c) => c.primary)) row.primary = true;
  return row;
}

export function bpUpdateContact(bp: BusinessPartner, index: number, patch: Partial<Contact>) {
  const row = bp.contacts[index];
  if (!row) return null;
  Object.assign(row, patch);
  if (patch.primary) for (const c of bp.contacts) c.primary = c === row;
  return row;
}

export function bpRemoveContact(bp: BusinessPartner, index: number): string | null {
  const row = bp.contacts[index];
  if (!row) return "ไม่พบผู้ติดต่อ";
  if (bp.contacts.length <= 1) return "ต้องมีผู้ติดต่ออย่างน้อย 1 คน";
  bp.contacts.splice(index, 1);
  if (!bp.contacts.some((c) => c.primary)) bp.contacts[0].primary = true;
  return null;
}

export function bpSetPrimaryContact(bp: BusinessPartner, index: number): string | null {
  const row = bp.contacts[index];
  if (!row) return "ไม่พบผู้ติดต่อ";
  for (const c of bp.contacts) c.primary = c === row;
  return null;
}

/* ---------- Bank accounts ---------- */

export const blankBank = (): Bank => ({
  bank: "",
  branch: "",
  accName: "",
  accNo: "",
  accType: "ออมทรัพย์",
  currency: "THB",
  swift: "",
  def: false,
  active: true,
});

export function bpAddBank(bp: BusinessPartner, patch: Partial<Bank> = {}): Bank {
  const row = { ...blankBank(), ...patch };
  bp.banks.push(row);
  if (!bp.banks.some((b) => b.def)) row.def = true;
  return row;
}

export function bpUpdateBank(bp: BusinessPartner, index: number, patch: Partial<Bank>) {
  const row = bp.banks[index];
  if (!row) return null;
  Object.assign(row, patch);
  if (patch.def) for (const b of bp.banks) b.def = b === row;
  return row;
}

export function bpRemoveBank(bp: BusinessPartner, index: number): string | null {
  const row = bp.banks[index];
  if (!row) return "ไม่พบบัญชีธนาคาร";
  bp.banks.splice(index, 1);
  if (bp.banks.length && !bp.banks.some((b) => b.def)) bp.banks[0].def = true;
  return null;
}

export function bpSetDefaultBank(bp: BusinessPartner, index: number): string | null {
  const row = bp.banks[index];
  if (!row) return "ไม่พบบัญชีธนาคาร";
  if (!row.active) return "บัญชีที่ปิดใช้งานตั้งเป็นบัญชีหลักไม่ได้";
  for (const b of bp.banks) b.def = b === row;
  return null;
}

export const bpDefaultBank = (bp: BusinessPartner) =>
  bp.banks?.find((b) => b.def && b.active) ?? bp.banks?.find((b) => b.active) ?? null;

/* ---------- Attachments ---------- */

export function bpAddDoc(bp: BusinessPartner, patch: Partial<Doc> = {}): Doc {
  const row: Doc = {
    type: "Other",
    name: "",
    issue: "",
    expiry: "",
    status: "Active",
    by: "",
    date: "",
    remark: "",
    kind: "other",
    ...patch,
  };
  row.kind = docKind(row.name);
  bp.docs.push(row);
  return row;
}

export function bpRemoveDoc(bp: BusinessPartner, index: number): string | null {
  if (!bp.docs[index]) return "ไม่พบเอกสาร";
  bp.docs.splice(index, 1);
  return null;
}

/**
 * Days until a partner date.
 *
 * Kept as a name the BP module already calls in a dozen places, but it no
 * longer corrects anything: `daysUntil` reads either era now. The reasoning
 * that used to live here moved to lib/format.ts beside that function — it
 * described a problem nine modules shared, so it belongs where the fix is.
 */
export const bpDaysUntil = daysUntil;

/** Attachments expiring inside the window, soonest first. Expired ones sort first. */
export const bpExpiringDocs = (bp: BusinessPartner, withinDays = 90) =>
  (bp.docs ?? [])
    .map((d) => ({ doc: d, days: bpDaysUntil(d.expiry) }))
    .filter((x): x is { doc: Doc; days: number } => x.days !== null && x.days <= withinDays)
    .sort((a, b) => a.days - b.days);

/* ---------- Images ---------- */

export function bpAddImage(bp: BusinessPartner, patch: Partial<BpImage> = {}): BpImage {
  bp.images ??= [];
  const n = bp.images.length + 1;
  const row: BpImage = {
    id: `IMG${String(n).padStart(3, "0")}`,
    name: "",
    src: "🖼️",
    kind: "Other",
    by: "",
    date: "",
    cover: false,
    remark: "",
    ...patch,
  };
  bp.images.push(row);
  if (!bp.images.some((i) => i.cover)) row.cover = true;
  bp.profileImage = bp.images.find((i) => i.cover)?.src ?? bp.logo;
  return row;
}

export function bpRemoveImage(bp: BusinessPartner, index: number): string | null {
  const images = bp.images;
  const row = images?.[index];
  if (!images || !row) return "ไม่พบรูปภาพ";
  images.splice(index, 1);
  if (images.length && !images.some((i) => i.cover)) images[0].cover = true;
  bp.profileImage = images.find((i) => i.cover)?.src ?? bp.logo;
  return null;
}

export function bpSetCoverImage(bp: BusinessPartner, index: number): string | null {
  const images = bp.images;
  const row = images?.[index];
  if (!images || !row) return "ไม่พบรูปภาพ";
  for (const i of images) i.cover = i === row;
  bp.profileImage = row.src;
  return null;
}

export const bpCoverImage = (bp: BusinessPartner) =>
  bp.images?.find((i) => i.cover) ?? bp.images?.[0] ?? null;

/* ---------- Supplier items ---------- */

export const bpActiveSupplierItems = (bp: BusinessPartner) =>
  (bp.supplierItems ?? []).filter((i) => i.status === "Active");

export const bpPreferredSupplierItems = (bp: BusinessPartner) =>
  bpActiveSupplierItems(bp).filter((i) => i.preferred);

/** The quote for a product, preferring an active preferred line. */
export function bpQuoteFor(bp: BusinessPartner, product: string): BpSupplierItem | null {
  const rows = (bp.supplierItems ?? []).filter((i) => i.product === product);
  return rows.find((i) => i.preferred && i.status === "Active") ?? rows[0] ?? null;
}

/* ---------- Purchase and sales rollups ---------- */

export interface BpTxnSummary {
  count: number;
  total: number;
  last: { no: string; date: string; amount: number; status: string } | null;
  avg: number;
}

function summarise(rows: { no: string; date: string; amount: number; status: string }[]): BpTxnSummary {
  const total = rows.reduce((t, r) => t + (r.amount || 0), 0);
  return {
    count: rows.length,
    total,
    last: rows[0] ?? null,
    avg: rows.length ? Math.round(total / rows.length) : 0,
  };
}

export const bpSalesSummary = (bp: BusinessPartner) => summarise(bp.txn?.so ?? []);
export const bpInvoiceSummary = (bp: BusinessPartner) => summarise(bp.txn?.inv ?? []);
export const bpPurchaseSummary = (bp: BusinessPartner) => summarise(bp.txn?.po ?? []);

/** Average quoted lead time across the supplier's active items. */
export function bpAverageLeadTime(bp: BusinessPartner): number {
  const rows = bpActiveSupplierItems(bp);
  if (!rows.length) return bp.supplier?.lead ?? 0;
  return Math.round(rows.reduce((t, i) => t + (i.lead || 0), 0) / rows.length);
}

/* ---------- Validation ---------- */

/** Thai Tax ID: 13 digits where the last is a mod-11 check digit. */
export function validThaiTaxId(id: string): boolean {
  const s = String(id ?? "").replace(/\D/g, "");
  if (s.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(s[i], 10) * (13 - i);
  return ((11 - (sum % 11)) % 10) === parseInt(s[12], 10);
}

export const validEmail = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const validPhone = (v: string) => !v || /^[0-9()+\-\s]{6,20}$/.test(v);
export const validZip = (v: string) => !v || /^\d{5}$/.test(v);
/** WGS84 bounds. Empty passes — coordinates are optional everywhere. */
/**
 * SWIFT/BIC: four letters of bank, two of country, two of location, and an
 * optional three-character branch. Eight or eleven characters, never nine or
 * ten — which is the mistake worth catching before a wire leaves.
 */
export const validSwift = (v: string) =>
  !v || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.trim().toUpperCase());

/**
 * IBAN: country, two check digits, then up to thirty alphanumerics. The
 * mod-97 checksum is a Phase 2 job; this catches the shape.
 */
export const validIban = (v: string) =>
  !v || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v.replace(/\s+/g, "").toUpperCase());

/** True when the account is a foreign wire destination rather than a Thai one. */
export const isForeignBank = (k: { scope?: string }) => k.scope === "ต่างประเทศ";

/** The name shown for an account, wherever the bank happens to be. */
export const bankLabel = (k: BpBank) =>
  (isForeignBank(k) ? k.bankName : k.bank) || k.bank || k.bankName || DASH;

export const validLat = (v: string) => !v || (Number(v) >= -90 && Number(v) <= 90);
export const validLng = (v: string) => !v || (Number(v) >= -180 && Number(v) <= 180);

export interface BpIssue {
  field: string;
  message: string;
  blocking: boolean;
}

/**
 * The module's own rulebook, in one place so the form, the import run and
 * the detail page all reject the same records.
 *
 * Required: BP Code, BP Name, BP Type, Status, and a billing address.
 * Tax ID is required to be VALID, not to be present — a cash customer with
 * no tax registration is a real customer.
 */
export function bpValidate(bp: Partial<BusinessPartner>): BpIssue[] {
  const issues: BpIssue[] = [];
  const need = (v: unknown, field: string, message: string) => {
    if (!String(v ?? "").trim()) issues.push({ field, message, blocking: true });
  };

  need(bp.code, "code", "ต้องระบุรหัสคู่ค้า");
  need(bp.nameTh || bp.nameEn, "nameTh", "ต้องระบุชื่อคู่ค้า");
  need(bp.type, "type", "ต้องระบุประเภทคู่ค้า");
  need(bp.status, "status", "ต้องระบุสถานะ");

  if (!Object.values(bp.roles ?? {}).some(Boolean)) {
    issues.push({ field: "roles", message: "ต้องเลือกบทบาทอย่างน้อย 1 อย่าง", blocking: true });
  }

  const taxId = bp.tax?.taxId ?? "";
  if (taxId && !validThaiTaxId(taxId)) {
    issues.push({
      field: "tax.taxId",
      message: "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลักและหลักตรวจสอบ)",
      blocking: true,
    });
  }
  /* A VAT registrant must have a Tax ID; anyone else may legitimately have
     none, which is why the rule hangs off the registration flag. */
  if (!taxId && bp.tax?.vatReg) {
    issues.push({
      field: "tax.taxId",
      message: "จดทะเบียน VAT ต้องระบุเลขประจำตัวผู้เสียภาษี",
      blocking: true,
    });
  }

  /**
   * A partner needs somewhere to be billed AND somewhere to receive goods,
   * and both have to be usable rather than merely present.
   *
   * `&& a.active` is the part that makes these bite. Without it the check
   * asked "is there a row of this kind", while `bpBillingAddress()` and
   * `bpDeliveryAddress()` — the functions that actually go and find the
   * address — skip inactive rows. A partner whose only address had been
   * switched off passed validation and then resolved to nothing, which is
   * the failure arriving one step later and further from its cause.
   *
   * Delivery is required as of the same change. It was reported and never
   * blocking, on the reasoning that a partner billed at a registered office
   * need not have a delivery point; the business says otherwise — goods have
   * to have somewhere to go before the partner is usable.
   */
  const addresses = bp.addresses ?? [];
  if (!addresses.some((a) => canBill(a) && a.active)) {
    issues.push({
      field: "addresses",
      message: "ต้องมีที่อยู่สำหรับออกใบกำกับภาษีที่ใช้งานอยู่อย่างน้อย 1 แห่ง",
      blocking: true,
    });
  }
  if (!addresses.some((a) => canDeliver(a) && a.active)) {
    issues.push({
      field: "addresses",
      message: "ต้องมีที่อยู่จัดส่งที่ใช้งานอยู่อย่างน้อย 1 แห่ง",
      blocking: true,
    });
  }

  for (const a of addresses) {
    if (!validZip(a.zip)) {
      issues.push({ field: "addresses.zip", message: `รหัสไปรษณีย์ "${a.zip}" ไม่ถูกต้อง`, blocking: true });
    }
    if (!validLat(a.lat) || !validLng(a.lng)) {
      issues.push({ field: "addresses.geo", message: `พิกัดของ "${a.name}" ไม่อยู่ในช่วงที่ถูกต้อง`, blocking: true });
    }
  }

  for (const c of bp.contacts ?? []) {
    if (!validEmail(c.email)) {
      issues.push({ field: "contacts.email", message: `อีเมล "${c.email}" ไม่ถูกต้อง`, blocking: true });
    }
  }

  /* Warnings — everything the spec marks optional. */
  if (!taxId) issues.push({ field: "tax.taxId", message: "ยังไม่ระบุเลขผู้เสียภาษี", blocking: false });
  if (!(bp.contacts ?? []).length)
    issues.push({ field: "contacts", message: "ยังไม่มีผู้ติดต่อ", blocking: false });
  if (!(bp.banks ?? []).length)
    issues.push({ field: "banks", message: "ยังไม่มีบัญชีธนาคาร", blocking: false });

  return issues;
}

export const bpBlockingIssues = (bp: Partial<BusinessPartner>) =>
  bpValidate(bp).filter((i) => i.blocking);
