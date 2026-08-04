import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { isPhoto } from "@/components/engine/FormFields";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import {
  BILLING_ADDRESS_TYPES,
  BP_ADDRESS_TYPES,
  BUSINESS_PARTNERS as RAW,
  DELIVERY_ADDRESS_TYPES,
  LEGACY_ADDRESS_TYPES,
  type BusinessPartner,
} from "@/data/partners";
import {
  BUSINESS_PARTNERS,
  addressLine,
  bpAddAddress,
  bpAddBank,
  bpAddContact,
  bpAddDoc,
  bpAddImage,
  bpAverageLeadTime,
  bpBillingAddress,
  bpCoverImage,
  bpDefaultBank,
  bpDeliveryAddress,
  bpExpiringDocs,
  bpMode,
  bpQuoteFor,
  bpRemoveAddress,
  bpRemoveBank,
  bpRemoveContact,
  bpRemoveDoc,
  bpRemoveImage,
  bpSetCoverImage,
  bpSetDefaultBank,
  bpSetPrimaryBilling,
  bpSetPrimaryContact,
  bpSetPrimaryDelivery,
  bankLabel,
  bpValidate,
  canBill,
  canDeliver,
  decorateBPs,
  bpDaysUntil,
  docKind,
  getBP,
  mapUrl,
  nextBPCode,
  isForeignBank,
  validIban,
  validLat,
  validLng,
  validSwift,
  validThaiTaxId,
} from "@/lib/domain/partner";
import {
  bpCustomerKpi,
  bpLastPurchase,
  bpLatestPurchaseYear,
  bpLatestSalesYear,
  bpPurchaseByYear,
  bpSalesByYear,
  bpPurchaseKpi,
  bpSalesOrders,
  bpTopProducts,
  bpTopPurchasedProducts,
} from "@/lib/domain/partner-analytics";
import { daysUntil } from "@/lib/format";
import { ATTACHMENT_SEED } from "@/data/partner-profiles";
import { USERS } from "@/data/admin";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { NAV_INDEX } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { getSchemas } from "@/schemas/registry";
import type { ActionCtx } from "@/lib/types";
import { bpSchemas } from "@/schemas/business-partner";
import { BP_FORM } from "@/schemas/forms/business-partner";
import type { FormField, FormState } from "@/lib/types";

/* ============================================================
   BUSINESS PARTNER MASTER regression suite.

   The module was upgraded to the A-Factory BP schema, not rebuilt.
   Half of what follows therefore checks the NEW capability, and
   half checks that the seven partners written before the schema
   existed still read correctly through it — which is the part an
   "extend, don't rebuild" refactor actually gets wrong.
   ============================================================ */

const { list, detail } = bpSchemas;

const SEED = JSON.parse(JSON.stringify(RAW)) as BusinessPartner[];

const restore = () => {
  RAW.length = 0;
  RAW.push(...(JSON.parse(JSON.stringify(SEED)) as BusinessPartner[]));
  decorateBPs();
};

beforeEach(restore);

const bp = (code: string) => getBP(code)!;
const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );
const renderDetail = (code: string) => render(<FullDetail schema={detail} record={bp(code)} />);

/* A partner of each shape, so the role-conditional paths all get exercised. */
/** Action context stub — schemas only ever call these. */
const makeCtx = (over: Partial<ActionCtx> = {}): ActionCtx => ({
  goto: () => {},
  openEntity: () => {},
  toast: () => {},
  confirm: () => {},
  formModal: () => {},
  refresh: () => {},
  quickView: () => {},
  panel: () => {},
  ...over,
});

/** Every field label a set of blocks renders. */
const fieldLabels = (blocks: unknown[]): string[] =>
  blocks.filter(Boolean).flatMap((b) => {
    const block = b as { type?: string; items?: { label?: string }[] };
    return block.type === "fields" || block.type === "cards"
      ? (block.items ?? []).filter(Boolean).map((i) => i.label ?? "")
      : [];
  });

/** The onClick of an in-card "View All …" link, found by its label. */
const linkAction = (blocks: unknown[], label: RegExp): (() => void) | undefined => {
  for (const b of blocks) {
    const block = b as { type?: string; items?: { value?: unknown }[] };
    if (block?.type !== "fields") continue;
    for (const item of block.items ?? []) {
      const el = item?.value as { props?: { label?: string; onClick?: () => void } } | undefined;
      if (el?.props?.label && label.test(el.props.label)) return el.props.onClick;
    }
  }
  return undefined;
};

/** Block titles, flattened through grid nesting. Overview puts its cards
 *  inside grids, so a top-level scan would miss every one of them. */
const titlesOf = (blocks: unknown[]): string[] =>
  blocks.filter(Boolean).flatMap((b) => {
    const block = b as { type?: string; title?: string; items?: unknown[] };
    if (block.type === "grid") return titlesOf(block.items ?? []);
    return block.title ? [block.title] : [];
  });

const BOTH = "BP000123";
const CUSTOMER = "BP000122";
const SUPPLIER = "BP000121";

/* ============================================================
   Backward compatibility
   ============================================================ */

describe("BP Master — records written before the schema", () => {
  it("resolves a billing address for every seeded partner", () => {
    for (const b of BUSINESS_PARTNERS) {
      expect(bpBillingAddress(b), `${b.code} billing`).not.toBeNull();
    }
  });

  it("migrates the legacy address vocabulary onto the new one", () => {
    /* "Registered Address" cannot bill under the new list, so without the
       migration every seeded partner would fail validation on load. */
    expect(LEGACY_ADDRESS_TYPES["Registered Address"]).toBe("Head Office");
    for (const b of BUSINESS_PARTNERS) {
      for (const a of b.addresses) {
        expect(BP_ADDRESS_TYPES, `${b.code} · ${a.type}`).toContain(a.type);
      }
    }
  });

  it("leaves no seeded partner with a blocking validation issue", () => {
    for (const b of BUSINESS_PARTNERS) {
      const blocking = bpValidate(b).filter((i) => i.blocking);
      expect(blocking, `${b.code}: ${blocking.map((i) => i.message).join(", ")}`).toHaveLength(0);
    }
  });

  it("fills the new fields on every partner without touching the old ones", () => {
    for (const b of BUSINESS_PARTNERS) {
      expect(b.billType === "VAT" || b.billType === "Non VAT").toBe(true);
      expect(b.creditTerm).toBeTruthy();
      expect(b.since).toBeTruthy();
      expect(Array.isArray(b.images)).toBe(true);
      expect(Array.isArray(b.supplierItems)).toBe(true);
      /* The pre-schema fields still read the same. */
      expect(b.code).toMatch(/^BP\d{6}$/);
      expect(b.nameTh).toBeTruthy();
    }
  });

  it("keeps normalisation idempotent — decorating twice changes nothing", () => {
    const before = JSON.stringify(BUSINESS_PARTNERS.map((b) => b.addresses));
    decorateBPs();
    decorateBPs();
    expect(JSON.stringify(BUSINESS_PARTNERS.map((b) => b.addresses))).toBe(before);
  });
});

/* ============================================================
   BP Type
   ============================================================ */

describe("BP Master — Customer / Supplier / Both", () => {
  it("derives the mode from the role flags, never a second field", () => {
    expect(bpMode(bp(BOTH))).toBe("Both");
    expect(bpMode(bp(CUSTOMER))).toBe("Customer");
    expect(bpMode(bp(SUPPLIER))).toBe("Supplier");
  });

  it("builds a customer profile only for partners that buy from us", () => {
    expect(bp(CUSTOMER).customer).not.toBeNull();
    expect(bp(SUPPLIER).customer).toBeNull();
    expect(bp(BOTH).customer).not.toBeNull();
  });

  it("builds a supplier profile only for partners that sell to us", () => {
    expect(bp(SUPPLIER).supplier).not.toBeNull();
    expect(bp(CUSTOMER).supplier).toBeNull();
    expect(bp(BOTH).supplier).not.toBeNull();
  });

  it("reads credit off the credit block rather than copying it", () => {
    /* One home per figure: the Customer tab and the credit block can never
       disagree because there is only one number. */
    const b = bp(CUSTOMER);
    expect(b.customer!.creditLimit).toBe(b.credit.limit);
    expect(b.customer!.creditUsed).toBe(b.credit.outstanding);
    expect(b.customer!.rep).toBe(b.sales!.rep);
  });
});

/* ============================================================
   Address CRUD
   ============================================================ */

describe("BP Master — address CRUD", () => {
  it("adds an address and keeps exactly one billing default", () => {
    const b = bp(CUSTOMER);
    const before = b.addresses.length;
    bpAddAddress(b, { name: "คลังสินค้า", type: "Warehouse", l1: "1 ถ.ทดสอบ" });

    expect(b.addresses).toHaveLength(before + 1);
    expect(b.addresses.filter((a) => a.billingPrimary)).toHaveLength(1);
  });

  it("moves the billing default and refuses a type that cannot bill", () => {
    const b = bp(CUSTOMER);
    bpAddAddress(b, { name: "สาขา 2", type: "Branch", l1: "2 ถ.ทดสอบ" });
    bpAddAddress(b, { name: "คลัง", type: "Warehouse", l1: "3 ถ.ทดสอบ" });

    expect(bpSetPrimaryBilling(b, 1)).toBeNull();
    expect(b.addresses[1].billingPrimary).toBe(true);
    expect(b.addresses.filter((a) => a.billingPrimary)).toHaveLength(1);

    const err = bpSetPrimaryBilling(b, 2);
    expect(err).toContain("Warehouse");
    expect(b.addresses[1].billingPrimary).toBe(true);
  });

  it("sets a delivery default independently of billing", () => {
    const b = bp(CUSTOMER);
    bpAddAddress(b, { name: "คลัง", type: "Warehouse", l1: "3 ถ.ทดสอบ" });

    expect(bpSetPrimaryDelivery(b, 1)).toBeNull();
    expect(b.addresses[1].deliveryPrimary).toBe(true);
    expect(b.addresses[1].billingPrimary).toBe(false);
    expect(bpDeliveryAddress(b)?.name).toBe("คลัง");
  });

  it("refuses to delete the last address that can bill", () => {
    const b = bp(CUSTOMER);
    expect(b.addresses.filter(canBill)).toHaveLength(1);
    const err = bpRemoveAddress(b, 0);
    expect(err).toContain("ใบกำกับภาษี");
    expect(b.addresses).toHaveLength(1);
  });

  it("deletes a non-billing address and reassigns the defaults", () => {
    const b = bp(CUSTOMER);
    bpAddAddress(b, { name: "คลัง", type: "Warehouse", l1: "3 ถ.ทดสอบ" });
    const before = b.addresses.length;

    expect(bpRemoveAddress(b, 1)).toBeNull();
    expect(b.addresses).toHaveLength(before - 1);
    expect(b.addresses.filter((a) => a.billingPrimary)).toHaveLength(1);
  });

  it("classifies every address type as billable, deliverable or both", () => {
    for (const t of BP_ADDRESS_TYPES) {
      const eligible = BILLING_ADDRESS_TYPES.includes(t) || DELIVERY_ADDRESS_TYPES.includes(t);
      expect(eligible, `${t} has a purpose`).toBe(true);
    }
    expect(canBill({ type: "Both" } as never)).toBe(true);
    expect(canDeliver({ type: "Both" } as never)).toBe(true);
    expect(canBill({ type: "Warehouse" } as never)).toBe(false);
  });

  it("renders a one-line address and a map link from coordinates", () => {
    const a = bp(BOTH).addresses[0];
    expect(addressLine(a)).toContain(a.prov);
    expect(mapUrl(a)).toMatch(/^https:\/\/maps\.google\.com/);
    expect(mapUrl({ ...a, maps: "", lat: "13.7", lng: "100.5" })).toBe(
      "https://maps.google.com/?q=13.7,100.5",
    );
    expect(mapUrl({ ...a, maps: "", lat: "", lng: "" })).toBe("");
  });

  it("bounds latitude and longitude", () => {
    expect(validLat("13.7")).toBe(true);
    expect(validLat("91")).toBe(false);
    expect(validLng("100.5")).toBe(true);
    expect(validLng("181")).toBe(false);
    /* Empty passes — coordinates are optional. */
    expect(validLat("")).toBe(true);
  });
});

/* ============================================================
   Contact CRUD
   ============================================================ */

describe("BP Master — contact CRUD", () => {
  it("adds a contact with a sequential code", () => {
    const b = bp(CUSTOMER);
    const before = b.contacts.length;
    const row = bpAddContact(b, { first: "ทดสอบ", last: "ระบบ" });

    expect(b.contacts).toHaveLength(before + 1);
    expect(row.code).toMatch(/^CT\d{3}$/);
    expect(b.contacts.filter((c) => c.primary)).toHaveLength(1);
  });

  it("moves the primary flag to exactly one contact", () => {
    const b = bp(CUSTOMER);
    bpAddContact(b, { first: "คนที่สอง" });
    expect(bpSetPrimaryContact(b, 1)).toBeNull();
    expect(b.contacts[1].primary).toBe(true);
    expect(b.contacts.filter((c) => c.primary)).toHaveLength(1);
  });

  it("refuses to delete the last contact and reassigns primary otherwise", () => {
    const b = bp(CUSTOMER);
    while (b.contacts.length > 1) b.contacts.pop();
    expect(bpRemoveContact(b, 0)).toContain("อย่างน้อย 1");

    bpAddContact(b, { first: "คนที่สอง" });
    bpSetPrimaryContact(b, 1);
    expect(bpRemoveContact(b, 1)).toBeNull();
    expect(b.contacts.filter((c) => c.primary)).toHaveLength(1);
  });
});

/* ============================================================
   Bank CRUD
   ============================================================ */

describe("BP Master — bank account CRUD", () => {
  it("adds a bank and makes the first one the default", () => {
    const b = bp(CUSTOMER);
    b.banks.length = 0;
    const row = bpAddBank(b, { bank: "กสิกรไทย", accNo: "1234567890" });

    expect(row.def).toBe(true);
    expect(bpDefaultBank(b)?.accNo).toBe("1234567890");
  });

  it("moves the default and refuses an inactive account", () => {
    const b = bp(CUSTOMER);
    b.banks.length = 0;
    bpAddBank(b, { bank: "กสิกรไทย", accNo: "111" });
    bpAddBank(b, { bank: "ไทยพาณิชย์", accNo: "222" });
    bpAddBank(b, { bank: "กรุงเทพ", accNo: "333", active: false });

    expect(bpSetDefaultBank(b, 1)).toBeNull();
    expect(b.banks.filter((x) => x.def)).toHaveLength(1);
    expect(bpSetDefaultBank(b, 2)).toContain("ปิดใช้งาน");
  });

  it("reassigns the default when the default account is deleted", () => {
    const b = bp(CUSTOMER);
    b.banks.length = 0;
    bpAddBank(b, { bank: "กสิกรไทย", accNo: "111" });
    bpAddBank(b, { bank: "ไทยพาณิชย์", accNo: "222" });

    expect(bpRemoveBank(b, 0)).toBeNull();
    expect(b.banks).toHaveLength(1);
    expect(b.banks[0].def).toBe(true);
  });
});

/* ============================================================
   Attachments and images
   ============================================================ */

describe("BP Master — attachments", () => {
  it("gives every partner at least one attachment", () => {
    for (const b of BUSINESS_PARTNERS) {
      expect(b.docs.length, `${b.code} attachments`).toBeGreaterThan(0);
    }
  });

  it("fills the gap without overwriting attachments a partner already had", () => {
    /* Five partners carry their own documents; the seed only covers the two
       that carry none. A seed that replaced real data would be a bug. */
    const seeded = Object.keys(ATTACHMENT_SEED);
    expect(seeded.sort()).toEqual(["BP000089", "BP000118", "BP000119", "BP000120"]);

    for (const code of seeded) {
      expect(bp(code).docs.map((d) => d.name)).toEqual(
        ATTACHMENT_SEED[code].map((d) => d.name),
      );
    }
    /* Everyone else holds documents the seed never supplied. */
    for (const b of BUSINESS_PARTNERS.filter((x) => !seeded.includes(x.code))) {
      expect(b.docs.length, `${b.code}`).toBeGreaterThan(0);
      const seedNames = Object.values(ATTACHMENT_SEED).flat().map((d) => d.name);
      for (const d of b.docs) expect(seedNames).not.toContain(d.name);
    }
  });

  it("infers the file kind from the extension", () => {
    expect(docKind("a.pdf")).toBe("pdf");
    expect(docKind("a.docx")).toBe("word");
    expect(docKind("a.xlsx")).toBe("excel");
    expect(docKind("a.png")).toBe("image");
    expect(docKind("a.zip")).toBe("other");
  });

  it("adds and removes an attachment, stamping the kind", () => {
    const b = bp(CUSTOMER);
    const before = b.docs.length;
    const row = bpAddDoc(b, { type: "Contract", name: "สัญญา.pdf" });

    expect(row.kind).toBe("pdf");
    expect(b.docs).toHaveLength(before + 1);
    expect(bpRemoveDoc(b, before)).toBeNull();
    expect(b.docs).toHaveLength(before);
  });

  it("counts Buddhist-era expiry dates correctly", () => {
    /* BP data is dated in BE. lib/format's daysUntil reads the year literally,
       so a BE date came back ~198,000 days away and the 90-day expiry banner
       could never fire. bpDaysUntil is what makes the feature work at all. */
    expect(bpDaysUntil("30/09/2569")).toBe(daysUntil("30/09/2026"));
    expect(bpDaysUntil("30/09/2026")).toBe(daysUntil("30/09/2026"));
    expect(bpDaysUntil("")).toBeNull();
  });

  it("fires the 90-day expiry warning on the default window", () => {
    const warned = BUSINESS_PARTNERS.filter((b) => bpExpiringDocs(b, 90).length > 0);
    expect(warned.length).toBeGreaterThan(0);
  });

  it("sorts expiring attachments soonest first, already-expired at the top", () => {
    const b = BUSINESS_PARTNERS.find((x) => bpExpiringDocs(x, 3650).length > 1)!;
    const rows = bpExpiringDocs(b, 3650);
    expect(rows.map((r) => r.days)).toEqual([...rows.map((r) => r.days)].sort((a, b) => a - b));
  });
});

describe("BP Master — image gallery", () => {
  it("keeps exactly one cover and drives the profile image from it", () => {
    const b = bp(BOTH);
    expect(b.images!.filter((i) => i.cover)).toHaveLength(1);
    expect(b.profileImage).toBe(bpCoverImage(b)!.src);
  });

  it("moves the cover and updates the profile image", () => {
    const b = bp(BOTH);
    expect(bpSetCoverImage(b, 1)).toBeNull();
    expect(b.images![1].cover).toBe(true);
    expect(b.images!.filter((i) => i.cover)).toHaveLength(1);
    expect(b.profileImage).toBe(b.images![1].src);
  });

  it("adds an image and makes the first one the cover", () => {
    const b = bp(CUSTOMER);
    b.images = [];
    const row = bpAddImage(b, { name: "หน้าร้าน", src: "🏪" });
    expect(row.cover).toBe(true);
    expect(b.profileImage).toBe("🏪");
  });

  it("reassigns the cover when the cover image is deleted", () => {
    const b = bp(BOTH);
    expect(bpRemoveImage(b, 0)).toBeNull();
    expect(b.images!.filter((i) => i.cover)).toHaveLength(1);
  });
});

/* ============================================================
   Customer and supplier information
   ============================================================ */

describe("BP Master — customer information", () => {
  it("carries every field the spec lists", () => {
    const c = bp(CUSTOMER).customer!;
    for (const k of [
      "custType",
      "bizType",
      "benefit",
      "size",
      "rep",
      "priceList",
      "creditLimit",
      "creditUsed",
      "creditHold",
      "risk",
      "payMethod",
    ]) {
      expect(c, k).toHaveProperty(k);
    }
  });

  it("computes available credit and never reports it negative", () => {
    for (const b of BUSINESS_PARTNERS.filter((x) => x.customer)) {
      expect(b.availableCredit).toBe(Math.max(0, b.creditLimit - b.creditUsed));
      expect(b.availableCredit).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps a Custom benefit level's percentage", () => {
    /* Only Custom needs the number — the ladder values carry it in the label. */
    const gov = BUSINESS_PARTNERS.find((b) => b.customer?.benefit === "Custom");
    expect(gov).toBeDefined();
    expect(gov!.customer!.benefitPct).toBeGreaterThan(0);
  });

  it("flags a customer on credit hold with a reason", () => {
    const held = BUSINESS_PARTNERS.find((b) => b.customer?.creditHold);
    expect(held).toBeDefined();
    expect(held!.customer!.holdReason).not.toHaveLength(0);
  });
});

describe("BP Master — supplier information", () => {
  it("carries every field the spec lists", () => {
    const s = bp(SUPPLIER).supplier!;
    for (const k of ["supType", "status", "preferred", "lead", "currency", "payMethod"]) {
      expect(s, k).toHaveProperty(k);
    }
    expect(s.currency).toBe(bp(SUPPLIER).purchasing!.currency);
  });

  it("holds a supplier item table with every column the spec lists", () => {
    const items = bp(SUPPLIER).supplierItems!;
    expect(items.length).toBeGreaterThan(0);
    for (const k of [
      "product",
      "sku",
      "supName",
      "moq",
      "lead",
      "currency",
      "price",
      "preferred",
      "status",
      "effective",
      "expiry",
    ]) {
      expect(items[0], k).toHaveProperty(k);
    }
  });

  it("prefers an active preferred quote when one product has several", () => {
    const b = bp(SUPPLIER);
    const quote = bpQuoteFor(b, "AA-TH003-WL");
    expect(quote).not.toBeNull();
    expect(quote!.status).toBe("Active");
    expect(bpQuoteFor(b, "NOT-A-PRODUCT")).toBeNull();
  });

  it("averages lead time across active items only", () => {
    const b = bp(SUPPLIER);
    const active = b.supplierItems!.filter((i) => i.status === "Active");
    const expected = Math.round(active.reduce((t, i) => t + i.lead, 0) / active.length);
    expect(bpAverageLeadTime(b)).toBe(expected);
  });
});

/* ============================================================
   Validation
   ============================================================ */

describe("BP Master — validation", () => {
  it("requires code, name, type, status and a role", () => {
    const issues = bpValidate({});
    const fields = issues.filter((i) => i.blocking).map((i) => i.field);
    for (const f of ["code", "nameTh", "type", "status", "roles"]) {
      expect(fields, f).toContain(f);
    }
  });

  it("requires a billing address but not a delivery one", () => {
    const base = {
      code: "BP999999",
      nameTh: "ทดสอบ",
      type: "Company",
      status: "Active",
      roles: { customer: true },
    } as unknown as BusinessPartner;

    const billingOnly = bpValidate({
      ...base,
      addresses: [{ type: "Billing", zip: "10110" }],
    } as unknown as BusinessPartner);

    expect(billingOnly.filter((i) => i.blocking)).toHaveLength(0);
    /* Missing delivery is reported, but never blocks. */
    expect(billingOnly.some((i) => !i.blocking && i.field === "addresses")).toBe(true);

    const noBilling = bpValidate({
      ...base,
      addresses: [{ type: "Warehouse", zip: "10110" }],
    } as unknown as BusinessPartner);
    expect(noBilling.some((i) => i.blocking && i.field === "addresses")).toBe(true);
  });

  it("requires the Tax ID to be valid when present, not to be present", () => {
    const base = {
      code: "BP999999",
      nameTh: "ทดสอบ",
      type: "Company",
      status: "Active",
      roles: { customer: true },
      addresses: [{ type: "Billing", zip: "10110" }],
    } as unknown as BusinessPartner;

    /* Absent — a warning only. */
    const absent = bpValidate(base);
    expect(absent.filter((i) => i.blocking)).toHaveLength(0);
    expect(absent.some((i) => !i.blocking && i.field === "tax.taxId")).toBe(true);

    /* Present and wrong — blocking. */
    const wrong = bpValidate({ ...base, tax: { taxId: "1234567890123" } } as never);
    expect(wrong.some((i) => i.blocking && i.field === "tax.taxId")).toBe(true);
  });

  it("validates the Thai tax ID check digit", () => {
    expect(validThaiTaxId("0105560112347")).toBe(true);
    expect(validThaiTaxId("0105560112348")).toBe(false);
    expect(validThaiTaxId("123")).toBe(false);
  });
});

/* ============================================================
   List view
   ============================================================ */

describe("BP Master — list view", () => {
  it("renders the master with every seeded partner", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "Business Partner Master" })).toBeInTheDocument();
    expect(screen.getByText(BOTH)).toBeInTheDocument();
  });

  it("offers every optional column the spec lists", () => {
    const keys = list.columns.map((c) => c.key);
    for (const k of [
      "customerType",
      "supplierType",
      "businessType",
      "salesRep",
      "creditLimit",
      "creditUsed",
      "province",
    ]) {
      expect(keys, k).toContain(k);
    }
  });

  it("keeps the added columns hidden until Column Settings turns them on", () => {
    for (const k of ["customerType", "supplierType", "creditLimit", "businessType"]) {
      expect(list.columns.find((c) => c.key === k)!.defaultHidden, k).toBe(true);
    }
  });

  it("shows the trimmed column set", () => {
    const keys = list.columns.filter((c) => !c.defaultHidden).map((c) => c.key);
    expect(keys).toEqual([
      "code",
      "nameTh",
      "type",
      "bpMode",
      "province",
      "salesArea",
      "creditStatus",
      "status",
      "lastPurchase",
    ]);
  });

  it("drops Tax ID, Roles, the contact and the phone from the table", () => {
    const keys = list.columns.map((c) => c.key);
    for (const k of ["taxId", "roles", "contactName", "phone"]) {
      expect(keys, k).not.toContain(k);
    }
    /* Removed from the view, not from the index. */
    for (const f of ["taxId", "contactName", "contactNames", "phone"]) {
      expect(list.searchFields, f).toContain(f);
    }
  });

  it("renders the BP code without a thumbnail", () => {
    renderList();
    const cell = screen.getByText(BOTH).closest("td")!;
    expect(within(cell).queryByRole("img")).toBeNull();
    expect(cell.querySelector("img")).toBeNull();
    /* The logo emoji is not rendered in the code cell. */
    expect(cell.textContent).toBe(BOTH);
  });

  it("shows Sale Area from the sales territory", () => {
    const col = list.columns.find((c) => c.key === "salesArea")!;
    expect(col.label).toBe("Sale Area");
    expect(bp(BOTH).salesArea).toBe(bp(BOTH).sales!.territory);
    renderList();
    expect(screen.getAllByText(bp(BOTH).salesArea).length).toBeGreaterThan(0);
  });

  it("replaces Last Updated with Last Purchase, sorted on the real date", () => {
    const keys = list.columns.map((c) => c.key);
    expect(keys).not.toContain("updated");

    const col = list.columns.find((c) => c.key === "lastPurchase")!;
    expect(col.label).toBe("Last Purchase");
    expect(col.sortable).toBe(true);

    /* Sorting on the parsed date, not the dd/mm/yyyy string — otherwise
       01/12 would sort above 02/11 of the same year. */
    const withOrder = BUSINESS_PARTNERS.find((b) => bpLastPurchase(b).date)!;
    expect(col.sortValue!(withOrder)).toBeGreaterThan(0);
    const without = BUSINESS_PARTNERS.find((b) => !bpLastPurchase(b).date);
    if (without) expect(col.sortValue!(without)).toBe(0);
  });

  it("reads last purchase from the sell side, falling back to the buy side", () => {
    /* A customer's last purchase is the order they placed. */
    const cust = bpLastPurchase(bp(BOTH));
    expect(cust.date).toBe(bpSalesOrders(bp(BOTH))[0].orderDate);
    expect(cust.doc).toBe(bpSalesOrders(bp(BOTH))[0].code);

    /* A pure supplier has none, so the column reports what we bought. */
    const sup = bpLastPurchase(bp(SUPPLIER));
    expect(sup.date).toBe(bp(SUPPLIER).txn.po[0].date);
  });

  it("searches every field the spec lists", () => {
    for (const f of [
      "code",
      "nameTh",
      "taxId",
      "phone",
      "email",
      "salesRep",
      "province",
      "customerType",
      "supplierType",
      "businessType",
      "contactNames",
      "supplierSkus",
    ]) {
      expect(list.searchFields, f).toContain(f);
    }
  });

  it("finds a partner by a supplier SKU held in its child table", async () => {
    const user = userEvent.setup();
    renderList();
    const sku = bp(SUPPLIER).supplierItems![0].sku;

    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), sku);
    expect(screen.getByText(SUPPLIER)).toBeInTheDocument();
    expect(screen.queryByText(CUSTOMER)).not.toBeInTheDocument();
  });

  it("finds a partner by a non-primary contact name", async () => {
    const user = userEvent.setup();
    const b = bp(BOTH);
    const second = b.contacts[1];
    /* Only meaningful when the match is NOT the primary contact. */
    expect(second?.primary).toBeFalsy();

    renderList();
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), second.first);
    expect(screen.getByText(BOTH)).toBeInTheDocument();
  });

  it("filters on the new dimensions", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of ["custType", "supType", "bizType", "size"]) {
      expect(ids, id).toContain(id);
    }
    const size = list.filters.find((f) => f.id === "size")!;
    expect(size.test(bp(CUSTOMER), bp(CUSTOMER).customer!.size)).toBe(true);
  });
});

/* ============================================================
   Quick vs advanced filters
   ============================================================ */

describe("BP Master — More Filters drawer", () => {
  const ADVANCED = ["custType", "supType", "bizType", "size"];

  it("keeps only the everyday filters on the toolbar", () => {
    const quick = list.filters.filter((f) => !f.advanced).map((f) => f.id);
    expect(quick).toEqual(["role", "type", "status", "province", "rep", "credit"]);
  });

  it("moves the extra dimensions behind More Filters", () => {
    const advanced = list.filters.filter((f) => f.advanced).map((f) => f.id);
    expect(advanced).toEqual(ADVANCED);
  });

  it("renders each filter in exactly one place", () => {
    /* The drawer stays mounted while closed, so a document-wide query finds
       both — what matters is which container each control sits in. */
    renderList();
    const drawer = screen.getByTestId("filter-drawer-fields");

    for (const label of [
      "Customer Type",
      "Supplier Type",
      "Business Type",
      "Customer Size",
    ]) {
      const el = screen.getByLabelText(label);
      expect(drawer.contains(el), `${label} is in the drawer`).toBe(true);
    }

    for (const label of ["Province", "Sales Rep", "Status", "BP Type"]) {
      const el = screen.getByLabelText(label);
      expect(drawer.contains(el), `${label} is on the toolbar`).toBe(false);
    }
  });

  it("renders them inside the drawer when it opens", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /More Filters/ }));

    const fields = await screen.findByTestId("filter-drawer-fields");
    for (const label of ["Customer Type", "Supplier Type", "Business Type", "Customer Size"]) {
      expect(within(fields).getByLabelText(label), label).toBeInTheDocument();
    }
  });

  it("narrows the table from inside the drawer", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /More Filters/ }));

    const size = await screen.findByLabelText("Customer Size");
    await user.selectOptions(size, "M");

    const expected = BUSINESS_PARTNERS.filter((b) => b.customer?.size === "M").length;
    expect(expected).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^${expected} Business Partners$`))).toBeInTheDocument();
  });

  it("counts the active drawer filters on the button", async () => {
    const user = userEvent.setup();
    renderList();
    const open = screen.getByRole("button", { name: /More Filters/ });
    expect(open.textContent).toBe("More Filters");

    await user.click(open);
    await user.selectOptions(await screen.findByLabelText("Customer Size"), "M");
    await user.selectOptions(screen.getByLabelText("Customer Type"), "Private");

    /* Without the badge a drawer filter narrows the table invisibly. */
    expect(screen.getByRole("button", { name: /More Filters/ }).textContent).toBe(
      "More Filters2",
    );
  });

  it("clears only the drawer filters, leaving the toolbar alone", async () => {
    const user = userEvent.setup();
    renderList();

    await user.selectOptions(screen.getByLabelText("Status"), "Active");
    await user.click(screen.getByRole("button", { name: /More Filters/ }));
    await user.selectOptions(await screen.findByLabelText("Customer Size"), "M");

    await user.click(screen.getByRole("button", { name: /^Clear/ }));

    expect((screen.getByLabelText("Customer Size") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("Active");
  });
});

/* ============================================================
   Detail page
   ============================================================ */

describe("BP Master — detail tabs", () => {
  it("declares the tabs the Enterprise Detail Layout defines", () => {
    /* Business split in two so a partner never reads the other role's
       fields; each half then has its own history tab. */
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "customer",
      "supplier",
      "sales-history",
      "purchase-history",
      "attachments",
    ]);
  });

  it("no longer exposes the tabs the refactor removed", () => {
    const keys = detail.tabs.map((t) => t.key);
    for (const gone of [
      "addresses",
      "contacts",
      "business",
      "banks",
      "sales-report",
      "activity",
      "audit",
    ]) {
      expect(keys, gone).not.toContain(gone);
    }
  });

  it("shows one purchase-history tab per role the partner actually plays", () => {
    const visible = (code: string) => {
      const rec = bp(code);
      return detail.tabs.filter((t) => !t.when || t.when(rec)).map((t) => t.key);
    };

    /* Both roles — both halves and both histories. */
    expect(visible(BOTH)).toEqual([
      "overview",
      "customer",
      "supplier",
      "sales-history",
      "purchase-history",
      "attachments",
    ]);

    /* Customer only — no supplier tab, no supplier history. */
    expect(visible(CUSTOMER)).toEqual([
      "overview",
      "customer",
      "sales-history",
      "attachments",
    ]);

    /* Supplier only — likewise the other way. */
    expect(visible(SUPPLIER)).toEqual([
      "overview",
      "supplier",
      "purchase-history",
      "attachments",
    ]);
  });

  it("keeps each history tab to its own side of the relationship", () => {
    const ctx = makeCtx();
    const sales = titlesOf(
      detail.tabs.find((t) => t.key === "sales-history")!.blocks(bp(BOTH), ctx),
    );
    const purchase = titlesOf(
      detail.tabs.find((t) => t.key === "purchase-history")!.blocks(bp(BOTH), ctx),
    );

    expect(sales).toContain("Customer Summary");
    expect(sales.some((t) => t?.startsWith("Invoices"))).toBe(true);
    /* Nothing about what we buy from them. */
    expect(sales).not.toContain("Supplier Summary");
    expect(sales).not.toContain("Top Products Purchased");

    expect(purchase).toContain("Supplier Summary");
    expect(purchase.some((t) => t?.startsWith("Recent Purchase Orders"))).toBe(true);
    expect(purchase).not.toContain("Customer Summary");
    expect(purchase).not.toContain("Top Products Sold");
  });

  it("keeps the customer history to invoices and nothing else", () => {
    /* Sales orders and the product breakdown were cut: this tab answers
       "what have we billed them", and the order screens own the rest. */
    const sales = titlesOf(
      detail.tabs.find((t) => t.key === "sales-history")!.blocks(bp(BOTH), makeCtx()),
    );

    expect(sales.some((t) => t?.startsWith("Recent Sales Orders"))).toBe(false);
    expect(sales).not.toContain("Top Products Sold");
  });

  it("summarises the customer on three yearly figures", () => {
    const cards = detail.tabs
      .find((t) => t.key === "sales-history")!
      .blocks(bp(BOTH), makeCtx())
      .find((b) => b && (b as { title?: string }).title === "Customer Summary") as {
      items: { label: string }[];
    };

    expect(cards.items.map((i) => i.label)).toEqual([
      "Total Sales",
      "Average Order",
      "Invoices",
    ]);
  });

  it("reports sales totals per year, not for all time", () => {
    const years = bpSalesByYear(bp(BOTH));
    expect(years.length).toBeGreaterThan(0);
    expect(years.map((y) => y.year)).toEqual([...years.map((y) => y.year)].sort((a, c) => c - a));

    const latest = bpLatestSalesYear(bp(BOTH))!;
    expect(latest.year).toBe(years[0].year);
    expect(latest.year).toBeGreaterThan(2500);
    /* Orders and invoices are counted from their own dates — an order and
       its invoice can land either side of a year end. */
    expect(latest.orders).toBeGreaterThan(0);
  });

  it("names the sales rep on each invoice", () => {
    const table = detail.tabs
      .find((t) => t.key === "sales-history")!
      .blocks(bp(BOTH), makeCtx())
      .find((b) => b && (b as { title?: string }).title?.startsWith("Invoices")) as {
      cols: { key: string; label: string }[];
    };

    expect(table.cols.map((c) => c.label)).toEqual([
      "Invoice No.",
      "Date",
      "Amount",
      "Sales Rep",
      "Status",
    ]);
  });

  it("orders the Supplier tab with the item table last", () => {
    /* The item table is the longest block on the tab and the one a buyer
       scrolls to deliberately — the terms and the bank read first. */
    const titles = titlesOf(
      detail.tabs.find((t) => t.key === "supplier")!.blocks(bp(BOTH), makeCtx()),
    );

    expect(titles[0]).toBe("Supplier Information");
    expect(titles.at(-1)!.startsWith("Supplier Items")).toBe(true);
    expect(titles.indexOf("Default Bank Account")).toBeLessThan(
      titles.findIndex((t) => t.startsWith("Supplier Items")),
    );
  });

  it("folds the supplier classification into Supplier Information", () => {
    const blocks = detail.tabs.find((t) => t.key === "supplier")!.blocks(bp(BOTH), makeCtx());
    const titles = titlesOf(blocks);

    /* Three fields never justified a card of their own. */
    expect(titles).not.toContain("Supplier Classification");

    const info = blocks.find(
      (b) => b && (b as { title?: string }).title === "Supplier Information",
    ) as { items: ({ label: string } | null | false)[] };
    const labels = info.items.filter(Boolean).map((i) => (i as { label: string }).label);

    for (const l of ["Supplier Type", "Supplier Group", "Industry", "Roles"]) {
      expect(labels, l).toContain(l);
    }
  });

  it("keeps the supplier history to purchase orders and nothing else", () => {
    /* Goods receipts and the product breakdown were cut: this tab answers
       "what have we ordered from them", and the receiving screens own the
       rest. */
    const purchase = titlesOf(
      detail.tabs.find((t) => t.key === "purchase-history")!.blocks(bp(BOTH), makeCtx()),
    );

    expect(purchase.some((t) => t?.startsWith("Goods Receipts"))).toBe(false);
    expect(purchase).not.toContain("Top Products Purchased");
  });

  it("summarises the supplier on three yearly figures", () => {
    const cards = detail.tabs
      .find((t) => t.key === "purchase-history")!
      .blocks(bp(BOTH), makeCtx())
      .find((b) => b && (b as { title?: string }).title === "Supplier Summary") as {
      items: { label: string }[];
    };

    expect(cards.items.map((i) => i.label)).toEqual([
      "Total Purchase",
      "Average Order",
      "Purchase Orders",
    ]);
  });

  it("reports purchase totals per year, not for all time", () => {
    /* A lifetime total flatters an old supplier and hides a lapsed one. */
    const b = bp(BOTH);
    const years = bpPurchaseByYear(b);
    expect(years.length).toBeGreaterThan(0);
    expect(years.map((y) => y.year)).toEqual([...years.map((y) => y.year)].sort((a, c) => c - a));

    const latest = bpLatestPurchaseYear(b)!;
    expect(latest.year).toBe(years[0].year);
    expect(latest.spend).toBeGreaterThan(0);
    /* Buddhist years, as every document in the app displays them. */
    expect(latest.year).toBeGreaterThan(2500);
  });

  it("names who placed each purchase order", () => {
    const table = detail.tabs
      .find((t) => t.key === "purchase-history")!
      .blocks(bp(BOTH), makeCtx())
      .find(
        (b) => b && (b as { title?: string }).title?.startsWith("Recent Purchase Orders"),
      ) as { cols: { key: string; label: string }[] };

    expect(table.cols.map((c) => c.key)).toEqual(["no", "date", "amount", "status", "buyer"]);
    expect(table.cols.at(-1)!.label).toBe("ผู้สั่งซื้อ");
  });

  it("renders the detail page with the Overview cards the spec lists", () => {
    renderDetail(BOTH);
    for (const title of [
      "General Information",
      "Primary Contact",
      "Address Information",
      "Business Summary",
      "Credit Summary",
    ]) {
      expect(screen.getAllByText(title).length, title).toBeGreaterThan(0);
    }
  });

  it("keeps the sales and purchase figures off Overview", () => {
    /* Business KPI duplicated what the Business tab already reports, and a
       summary card that repeats a table earns none of its height. */
    const titles = titlesOf(detail.tabs[0].blocks(bp(BOTH), makeCtx()));
    expect(titles).not.toContain("Business KPI");
  });

  it("gives every Overview card the full width of the page", () => {
    const ctx = makeCtx();
    const blocks = detail.tabs[0].blocks(bp(BOTH), ctx);

    /* No card sits beside another: side by side each was a quarter of the
       screen and every value wrapped. */
    expect(blocks.some((x) => x && typeof x === "object" && x.type === "grid")).toBe(false);

    /* Each fields card lays its rows out in two horizontal columns. */
    const cards = blocks.filter(
      (x) => x && typeof x === "object" && x.type === "fields",
    ) as { title?: string; cols?: number }[];
    expect(cards.length).toBeGreaterThanOrEqual(4);
    for (const c of cards) {
      expect(c.cols, c.title).toBe(2);
    }
  });

  it("builds every visible tab for every partner shape without throwing", () => {
    const ctx = makeCtx();
    for (const code of [BOTH, CUSTOMER, SUPPLIER]) {
      const rec = bp(code);
      for (const tab of detail.tabs) {
        if (tab.when && !tab.when(rec)) continue;
        expect(() => tab.blocks(rec, ctx), `${code} · ${tab.key}`).not.toThrow();
      }
    }
  });
});

describe("BP Master — Overview first", () => {
  it("carries no summary rail beside the cards", () => {
    /* The rail repeated what the cards already say and cost them a quarter
       of the width. What it held now reads inside the cards themselves. */
    expect(detail.tabs.every((t) => !t.aside)).toBe(true);

    const labels = fieldLabels(detail.tabs[0].blocks(bp(BOTH), makeCtx()));
    for (const l of ["Sales Representative", "Payment Terms", "Price List", "Currency"]) {
      expect(labels, l).toContain(l);
    }
    expect(labels).toContain("Credit Status");
  });

  it("opens the address, contact and bank lists in panels from the cards", () => {
    const open = (code: string, label: RegExp) => {
      const panel = vi.fn();
      const ctx = makeCtx({ panel });
      const tab = detail.tabs.find((t) => t.key === code)!;
      linkAction(tab.blocks(bp(BOTH), ctx), label)!();
      return panel.mock.calls[0][0];
    };

    expect(open("overview", /^View All Addresses/).title).toBe("All Addresses");
    expect(open("overview", /^View All Contacts/).title).toBe("All Contacts");
    expect(open("supplier", /^View All Bank Accounts/).title).toBe("All Bank Accounts");
  });

  it("shows only the default bank account, on whichever tab owns it", () => {
    const ctx = makeCtx();
    const titles = titlesOf(detail.tabs.find((t) => t.key === "supplier")!.blocks(bp(BOTH), ctx));

    expect(titles).toContain("Default Bank Account");
    /* The full list is behind the panel, not inline. */
    expect(titles).not.toContain("Bank Accounts");
  });

  it("keeps each role's fields on its own tab", () => {
    const ctx = makeCtx();
    const on = (key: string, code: string) =>
      titlesOf(detail.tabs.find((t) => t.key === key)!.blocks(bp(code), ctx));

    /* Neither tab shows the other role's card — that mixing is what made
       the old single Business tab confusing to read. */
    const cust = on("customer", BOTH);
    expect(cust).toContain("Customer Information");
    expect(cust).toContain("Customer Classification");
    expect(cust).not.toContain("Supplier Information");
    expect(cust.some((t) => t.startsWith("Supplier Items"))).toBe(false);

    const sup = on("supplier", BOTH);
    expect(sup).toContain("Supplier Information");
    expect(sup.some((t) => t.startsWith("Supplier Items"))).toBe(true);
    expect(sup).not.toContain("Customer Information");
  });

  it("shows only the relevant tab when a partner plays one role", () => {
    const keys = (code: string) =>
      detail.tabs.filter((t) => !t.when || t.when(bp(code))).map((t) => t.key);

    expect(keys(CUSTOMER)).toContain("customer");
    expect(keys(CUSTOMER)).not.toContain("supplier");

    expect(keys(SUPPLIER)).toContain("supplier");
    expect(keys(SUPPLIER)).not.toContain("customer");
  });

  it("renders bank and tax exactly once, never on both tabs", () => {
    const ctx = makeCtx();
    const on = (key: string, code: string) =>
      titlesOf(detail.tabs.find((t) => t.key === key)!.blocks(bp(code), ctx));

    /* Entity-level facts. Duplicating them across the two tabs would
       recreate the confusion the split was meant to remove. */
    expect(on("supplier", BOTH)).toContain("Default Bank Account");
    expect(on("customer", BOTH)).not.toContain("Default Bank Account");
    expect(on("supplier", BOTH)).toContain("Tax & Billing");
    expect(on("customer", BOTH)).not.toContain("Tax & Billing");

    /* A customer-only partner still gets them — nothing is lost. */
    expect(on("customer", CUSTOMER)).toContain("Default Bank Account");
    expect(on("customer", CUSTOMER)).toContain("Tax & Billing");
  });

  it("keeps the activity timeline but not the lifecycle stamps", () => {
    /* Created / updated stamps were audit metadata on a summary page; the
       timeline below already says who last touched the record. */
    const titles = titlesOf(detail.tabs[0].blocks(bp(BOTH), makeCtx()));

    expect(titles).not.toContain("Record Lifecycle");
    expect(titles.some((t) => t?.startsWith("Latest Activities"))).toBe(true);
  });

  it("omits the credit card entirely for a role that cannot see credit", () => {
    /* Layer 2 of the permission framework: not disabled, not dotted out —
       the card is never built. */
    const ctx = makeCtx();
    const titleList = () => titlesOf(detail.tabs[0].blocks(bp(BOTH), ctx));

    expect(titleList()).toContain("Credit Summary");

    const rep = USERS.find((u) => u.roleCode === "SALES_REP" && u.status === "Active")!;
    setCurrentUser(rep.code);
    expect(titleList()).not.toContain("Credit Summary");
    resetCurrentUser();
  });
});

/* ============================================================
   Sales report and purchase history
   ============================================================ */

describe("BP Master — sales report", () => {
  it("joins sales orders on the customer code", () => {
    const orders = bpSalesOrders(bp(BOTH));
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) expect(o.customerCode).toBe(BOTH);
  });

  it("computes a KPI consistent with the orders it read", () => {
    const b = bp(BOTH);
    const kpi = bpCustomerKpi(b);
    const orders = bpSalesOrders(b);

    expect(kpi.orders).toBe(orders.length);
    expect(kpi.revenue).toBe(orders.reduce((t, o) => t + o.total, 0));
    expect(kpi.avgOrder).toBe(Math.round(kpi.revenue / kpi.orders));
  });

  it("ranks top products by value, biggest first", () => {
    const top = bpTopProducts(bp(BOTH));
    expect(top.length).toBeGreaterThan(0);
    expect(top.map((t) => t.amount)).toEqual(
      [...top.map((t) => t.amount)].sort((a, b) => b - a),
    );
  });
});

describe("BP Master — purchase history", () => {
  it("falls back to the record when no purchase order matches by name", () => {
    /* Purchase orders reference a supplier NAME, and the seeded suppliers are
       not in the BP master — the tab says so rather than reporting zero. */
    const kpi = bpPurchaseKpi(bp(SUPPLIER));
    expect(kpi.fromRecord).toBe(true);
    expect(kpi.orders).toBe(bp(SUPPLIER).txn.po.length);
  });

  it("falls back to the quoted catalogue for top purchased products", () => {
    const top = bpTopPurchasedProducts(bp(SUPPLIER));
    expect(top.length).toBeGreaterThan(0);
    const active = bp(SUPPLIER).supplierItems!.filter((i) => i.status === "Active");
    expect(top.length).toBeLessThanOrEqual(active.length);
  });

  it("reports the average lead time from the item table", () => {
    expect(bpPurchaseKpi(bp(SUPPLIER)).avgLeadTime).toBe(bpAverageLeadTime(bp(SUPPLIER)));
  });
});

/* ============================================================
   Form
   ============================================================ */

describe("BP Master — create / edit form", () => {
  it("offers a step for every new section", () => {
    const keys = BP_FORM.steps.map((s) => s.key);
    for (const k of ["identity", "addresses", "contacts", "customer", "supplier", "attachments"]) {
      expect(keys, k).toContain(k);
    }
  });

  it("shows the customer step only for customers", () => {
    const step = BP_FORM.steps.find((s) => s.key === "customer")!;
    expect(step.when!({ roles: { customer: true } })).toBe(true);
    expect(step.when!({ roles: { supplier: true } })).toBe(false);
  });

  it("shows the supplier step only for suppliers", () => {
    const step = BP_FORM.steps.find((s) => s.key === "supplier")!;
    expect(step.when!({ roles: { supplier: true } })).toBe(true);
    expect(step.when!({ roles: { customer: true } })).toBe(false);
  });

  it("requires a billing address rather than any address", () => {
    const rule = BP_FORM.required.find((r) => r.path === "addresses")!;
    expect(rule.test!({ addresses: [{ l1: "1", type: "Warehouse" }] })).toBe(false);
    expect(rule.test!({ addresses: [{ l1: "1", type: "Billing" }] })).toBe(true);
    expect(rule.test!({ addresses: [{ l1: "1", type: "Head Office" }] })).toBe(true);
  });

  it("round-trips a partner through toState and back", () => {
    const state = BP_FORM.toState(bp(BOTH));
    expect(state.billType).toBeTruthy();
    expect(state.creditTerm).toBeTruthy();
    expect(Array.isArray(state.supplierItems)).toBe(true);
    expect(Array.isArray(state.docs)).toBe(true);
    expect(Array.isArray(state.images)).toBe(true);
    expect(state.customer.custType).toBe(bp(BOTH).customer!.custType);
  });

  it("gives a blank draft the new defaults and a fresh code", () => {
    const blank = BP_FORM.blank();
    expect(blank.code).toBe(nextBPCode());
    expect(blank.billType).toBe("VAT");
    expect(blank.customer.custType).toBe("Private");
    expect(blank.supplier.supType).toBe("Distributor");
  });

  it("defaults a new address to Both and assigns the billing flag", () => {
    const row = BP_FORM.newRow!("addresses", true)!;
    expect(row.type).toBe("Both");

    const state = { addresses: [row] };
    BP_FORM.onGridChange!("addresses", state);
    expect(state.addresses[0].billingPrimary).toBe(true);
    expect(state.addresses[0].deliveryPrimary).toBe(true);
  });

  it("strips a default when the address type stops allowing it", () => {
    const state = {
      addresses: [
        { type: "Billing", billingPrimary: true, deliveryPrimary: true },
        { type: "Head Office" },
      ],
    };
    BP_FORM.onGridChange!("addresses", state);
    /* Billing cannot deliver, so the delivery flag must move off it. */
    expect(state.addresses[0].billingPrimary).toBe(true);
    expect(state.addresses[0].deliveryPrimary).toBe(false);
  });

  it("rejects duplicate vendor product codes", () => {
    const rule = BP_FORM.rules!.find((r) => r.label.includes("Vendor Product Code"))!;
    expect(rule.test({ supplierItems: [{ sku: "A" }, { sku: "B" }] })).toBe(true);
    expect(rule.test({ supplierItems: [{ sku: "A" }, { sku: "A" }] })).toBe(false);
  });

  it("requires a reason when credit is held", () => {
    const rule = BP_FORM.rules!.find((r) => r.label.includes("ระงับเครดิต"))!;
    expect(rule.test({ customer: { creditHold: false } })).toBe(true);
    expect(rule.test({ customer: { creditHold: true, holdReason: "" } })).toBe(false);
    expect(rule.test({ customer: { creditHold: true, holdReason: "ค้างชำระ" } })).toBe(true);
  });

  it("looks a product up for the supplier item grid", () => {
    const hits = BP_FORM.lookup!.product("AA-TH");
    expect(hits.length).toBeGreaterThan(0);

    const state = { supplierItems: [{ product: "", productName: "", supName: "" }] };
    BP_FORM.onLookupPick!("product", "supplierItems", 0, hits[0], state);
    expect(state.supplierItems[0].product).toBe(hits[0].code);
    expect(state.supplierItems[0].productName).toBe(hits[0].name);
  });
});

/* ============================================================
   Form revisions
   ============================================================ */

/** Every field a step renders for this draft, cards flattened. */
const fieldsOf = (stepKey: string, state: FormState) => {
  const step = BP_FORM.steps.find((s) => s.key === stepKey)!;
  return step
    .blocks(state)
    .filter(Boolean)
    .flatMap((b) => (b && "fields" in b ? b.fields : [b]))
    .filter((f): f is FormField => Boolean(f))
    .filter((f) => !f.when || f.when(state));
};

describe("BP Master — form revisions", () => {
  it("carries no side summary of the draft", () => {
    expect(BP_FORM.sidePanel).toBeUndefined();
  });

  it("issues the partner code and never asks for it", () => {
    const blank = BP_FORM.blank();
    expect(String(blank.code)).toMatch(/^BP\d+$/);

    const code = fieldsOf("identity", blank).filter((f) => f.path === "code");
    expect(code).toHaveLength(1);
    expect(code[0].type).toBe("static");
    expect(code[0].required).toBeFalsy();
  });

  it("takes a photograph for the logo and offers no icon to pick", () => {
    const logo = fieldsOf("identity", BP_FORM.blank()).find((f) => f.path === "logo")!;
    expect(logo.type).toBe("photo");
    /* A new partner starts with no picture rather than a stock emoji. */
    expect(BP_FORM.blank().logo).toBe("");
  });

  it("renders an uploaded photo as an image and an old emoji as text", () => {
    expect(isPhoto("data:image/png;base64,AAAA")).toBe(true);
    expect(isPhoto("https://example.com/clinic.jpg")).toBe(true);
    expect(isPhoto("🏢")).toBe(false);
    expect(isPhoto("")).toBe(false);
  });

  it("groups the partner on the roles step instead of a step of its own", () => {
    expect(BP_FORM.steps.map((s) => s.key)).not.toContain("classification");

    const both = { roles: { customer: true, supplier: true } };
    const paths = fieldsOf("roles", both).map((f) => f.path);
    for (const p of [
      "roles",
      "cls.custGroup",
      "cls.supGroup",
      "cls.priceGroup",
      "cls.territory",
      "cls.channel",
    ]) {
      expect(paths, p).toContain(p);
    }
  });

  it("drops Industry from the form and from the record it writes", () => {
    const paths = BP_FORM.steps.flatMap((s) =>
      fieldsOf(s.key, { roles: { customer: true, supplier: true } }).map((f) => f.path),
    );
    expect(paths).not.toContain("cls.industry");
    expect(BP_FORM.blank().cls).not.toHaveProperty("industry");
  });

  it("keeps the grouping fields role-conditional after the move", () => {
    const supplierOnly = fieldsOf("roles", { roles: { supplier: true } }).map((f) => f.path);
    expect(supplierOnly).toContain("cls.supGroup");
    expect(supplierOnly).not.toContain("cls.custGroup");
    expect(supplierOnly).not.toContain("cls.priceGroup");
  });

  it("requires the Tax ID only when the partner is VAT registered", () => {
    const rule = BP_FORM.required.find((r) => r.path === "tax.taxId")!;
    expect(rule.test!({ tax: { vatReg: true, taxId: "" } })).toBe(false);
    expect(rule.test!({ tax: { vatReg: true, taxId: "0105560112347" } })).toBe(true);
    /* Not registered — the field is simply not owed. */
    expect(rule.test!({ tax: { vatReg: false, taxId: "" } })).toBe(true);
    expect(rule.test!({ tax: {} })).toBe(true);
  });

  it("marks the Tax ID field required only in the VAT-registered draft", () => {
    const on = fieldsOf("tax", { tax: { vatReg: true } }).filter((f) => f.path === "tax.taxId");
    const off = fieldsOf("tax", { tax: { vatReg: false } }).filter((f) => f.path === "tax.taxId");
    expect(on).toHaveLength(1);
    expect(off).toHaveLength(1);
    expect(on[0].required).toBe(true);
    expect(off[0].required).toBeFalsy();
  });

  it("drops Customer Level, Risk Level and Payment Method from the form", () => {
    const both = { roles: { customer: true, supplier: true } };
    const paths = BP_FORM.steps.flatMap((s) => fieldsOf(s.key, both).map((f) => f.path));
    for (const p of [
      "cls.custLevel",
      "customer.risk",
      "customer.payMethod",
      "supplier.payMethod",
    ]) {
      expect(paths, p).not.toContain(p);
    }
    /* And out of the draft, so a new partner never carries them. */
    expect(BP_FORM.blank().cls).not.toHaveProperty("custLevel");
    expect(BP_FORM.blank().customer).not.toHaveProperty("risk");
    expect(BP_FORM.blank().customer).not.toHaveProperty("payMethod");
    expect(BP_FORM.blank().supplier).not.toHaveProperty("payMethod");
  });

  it("keeps the supplier fields that were not asked to go", () => {
    const blank = BP_FORM.blank();
    expect(blank.supplier).toMatchObject({ supType: "Distributor", status: "Approved" });
    const paths = fieldsOf("supplier", { roles: { supplier: true } }).map((f) => f.path);
    expect(paths).toContain("supplier.supType");
    expect(paths).toContain("supplier.status");
  });

  it("drops Risk Level and Payment Method from the list and the detail", () => {
    expect(list.columns.map((c) => c.key)).not.toContain("riskLevel");
    expect(list.filters.map((f) => f.id)).not.toContain("risk");

    const labels = JSON.stringify(
      detail.tabs.map((t) => t.blocks(bp(BOTH), makeCtx())),
    );
    expect(labels).not.toContain("Risk Level");
    expect(labels).not.toContain("Payment Method");
    expect(labels).not.toContain("Customer Level");
  });

  it("stacks the contact and address rows so every field gets width", () => {
    for (const key of ["contacts", "addresses"]) {
      const grid = fieldsOf(key, BP_FORM.blank()).find((f) => f.path === key)!;
      expect(grid.type, key).toBe("grid");
      expect(grid.layout, key).toBe("stacked");
      expect(grid.rowLabel, key).toBeTruthy();
      /* Every column still carries its label, which the stacked card shows. */
      expect(grid.cols!.every((c) => Boolean(c.label)), key).toBe(true);
    }
  });

  it("shows exactly the nine supplier item columns, in order", () => {
    const grid = fieldsOf("supplier", { roles: { supplier: true } }).find(
      (f) => f.path === "supplierItems",
    )!;
    expect(grid.cols!.map((c) => c.key)).toEqual([
      "product",
      "sku",
      "productName",
      "punit",
      "moq",
      "lead",
      "currency",
      "price",
      "status",
    ]);
    expect(grid.cols!.map((c) => c.label)).toEqual([
      "Product Code",
      "Vendor Product Code",
      "Product Name",
      "Purchase Unit",
      "MOQ",
      "Lead (วัน)",
      "Currency",
      "Cost",
      "Status",
    ]);
    /* A new line carries only what the grid can edit. */
    expect(Object.keys(BP_FORM.newRow!("supplierItems", true)!).sort()).toEqual(
      ["currency", "lead", "moq", "price", "productName", "product", "punit", "sku", "status"].sort(),
    );
  });

  it("fills the purchase unit from the product master", () => {
    /* Seeded lines predate the column, so the master backfills them. */
    const withItems = BUSINESS_PARTNERS.find((b) => (b.supplierItems ?? []).length > 0)!;
    for (const i of withItems.supplierItems!) {
      expect(i.punit, `${withItems.code} · ${i.product}`).toBeTruthy();
    }
  });

  it("mirrors the same nine columns on the detail page", () => {
    const supplierTab = detail.tabs.find((t) => t.key === "supplier")!;
    const table = supplierTab
      .blocks(bp(SUPPLIER), makeCtx())
      .filter(Boolean)
      .find((b) => b && b.type === "table" && String(b.title).startsWith("Supplier Items")) as {
      cols: { key: string }[];
    };
    expect(table.cols.map((c) => c.key)).toEqual([
      "product",
      "sku",
      "productName",
      "punit",
      "moq",
      "lead",
      "currency",
      "price",
      "status",
    ]);
  });

  it("gives the long address fields two columns of the stacked card", () => {
    const address = fieldsOf("addresses", BP_FORM.blank()).find((f) => f.path === "addresses")!;
    const spanning = address.cols!.filter((c) => c.span).map((c) => c.key);
    expect(spanning).toContain("l1");
    expect(spanning).toContain("maps");
  });

  it("asks a domestic account for the Thai fields and nothing more", () => {
    const grid = fieldsOf("finance", BP_FORM.blank()).find((f) => f.path === "banks")!;
    const domestic = { scope: "ในประเทศ" };
    const shown = grid
      .cols!.filter((c) => !c.when || c.when(domestic))
      .map((c) => c.key);
    expect(shown).toEqual([
      "scope",
      "bank",
      "branch",
      "accType",
      "accName",
      "accNo",
      "def",
      "active",
    ]);
  });

  it("opens the wire block when the account is international", () => {
    const grid = fieldsOf("finance", BP_FORM.blank()).find((f) => f.path === "banks")!;
    const foreign = { scope: "ต่างประเทศ" };
    const shown = grid.cols!.filter((c) => !c.when || c.when(foreign)).map((c) => c.key);

    for (const k of [
      "bankName",
      "swift",
      "iban",
      "bankCountry",
      "bankAddress",
      "beneName",
      "beneAddress",
      "currency",
      "clearingSystem",
      "interSwift",
      "charges",
      "purpose",
    ]) {
      expect(shown, k).toContain(k);
    }
    /* The Thai-only fields step aside. */
    for (const k of ["bank", "branch", "accType"]) {
      expect(shown, k).not.toContain(k);
    }
  });

  it("reveals the follow-up fields only once their trigger is set", () => {
    const grid = fieldsOf("finance", BP_FORM.blank()).find((f) => f.path === "banks")!;
    const clearing = grid.cols!.find((c) => c.key === "clearingCode")!;
    const interBank = grid.cols!.find((c) => c.key === "interBank")!;

    expect(clearing.when!({ scope: "ต่างประเทศ", clearingSystem: "ไม่มี" })).toBe(false);
    expect(clearing.when!({ scope: "ต่างประเทศ", clearingSystem: "Sort Code (UK)" })).toBe(true);
    expect(interBank.when!({ scope: "ต่างประเทศ", interSwift: "" })).toBe(false);
    expect(interBank.when!({ scope: "ต่างประเทศ", interSwift: "CHASUS33" })).toBe(true);
  });

  it("validates a SWIFT code by its real shape", () => {
    expect(validSwift("KASITHBK")).toBe(true);
    expect(validSwift("DBSSSGSGXXX")).toBe(true);
    expect(validSwift("")).toBe(true);
    /* Nine and ten characters are the mistakes that actually happen. */
    expect(validSwift("KASITHBKX")).toBe(false);
    expect(validSwift("KASITHB")).toBe(false);
    expect(validSwift("1234THBK")).toBe(false);
  });

  it("validates an IBAN by its real shape", () => {
    expect(validIban("DE89370400440532013000")).toBe(true);
    expect(validIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(validIban("")).toBe(true);
    expect(validIban("DEXX370400440532013000")).toBe(false);
    expect(validIban("DE89")).toBe(false);
  });

  it("requires the wire paperwork only from an international account", () => {
    const rule = (needle: string) => BP_FORM.rules!.find((r) => r.label.includes(needle))!;
    const domestic = { banks: [{ scope: "ในประเทศ", bank: "กสิกรไทย", accNo: "1" }] };

    /* A Thai account answers none of the wire rules. */
    for (const needle of ["SWIFT / BIC", "ชื่อธนาคาร ประเทศ", "IBAN", "Clearing"]) {
      expect(rule(needle).test(domestic), needle).toBe(true);
    }

    const bare = { banks: [{ scope: "ต่างประเทศ", accNo: "1" }] };
    expect(rule("ต้องระบุ SWIFT / BIC").test(bare)).toBe(false);
    expect(rule("ชื่อธนาคาร ประเทศ").test(bare)).toBe(false);

    const complete = {
      banks: [
        {
          scope: "ต่างประเทศ",
          accNo: "003-912345-8",
          swift: "DBSSSGSGXXX",
          bankName: "DBS Bank Ltd.",
          bankCountry: "สิงคโปร์",
          beneName: "Perfect Supply Pte. Ltd.",
          currency: "USD",
        },
      ],
    };
    expect(rule("ต้องระบุ SWIFT / BIC").test(complete)).toBe(true);
    expect(rule("ชื่อธนาคาร ประเทศ").test(complete)).toBe(true);
    expect(rule("8 หรือ 11").test(complete)).toBe(true);
  });

  it("pairs a clearing system with its code", () => {
    const rule = BP_FORM.rules!.find((r) => r.label.includes("Clearing"))!;
    const base = { scope: "ต่างประเทศ", clearingSystem: "ABA / Routing Number (US)" };
    expect(rule.test({ banks: [{ ...base, clearingCode: "" }] })).toBe(false);
    expect(rule.test({ banks: [{ ...base, clearingCode: "021000021" }] })).toBe(true);
  });

  it("shows the wire block on the detail page only for a foreign default", () => {
    const rows = (code: string) => {
      const b = bp(code);
      /* Only the tabs the engine would actually render. */
      return JSON.stringify(
        detail.tabs.filter((t) => !t.when || t.when(b)).map((t) => t.blocks(b, makeCtx())),
      );
    };

    /* BP000121's default is the Thai account, so no wire fields. */
    expect(rows(SUPPLIER)).toContain("Transfer Type");
    expect(rows(SUPPLIER)).not.toContain("Beneficiary Name");

    /* Make the foreign account the default and the block appears. */
    const b = bp(SUPPLIER);
    b.banks.forEach((k) => (k.def = isForeignBank(k)));
    expect(rows(SUPPLIER)).toContain("Beneficiary Name");
    expect(rows(SUPPLIER)).toContain("SWIFT / BIC");
  });

  it("treats every account written before the split as domestic", () => {
    for (const b of BUSINESS_PARTNERS) {
      for (const k of b.banks) {
        expect(k.scope, `${b.code} · ${k.accNo}`).toBeTruthy();
      }
    }
    const seeded = BUSINESS_PARTNERS.flatMap((b) => b.banks).find((k) => isForeignBank(k))!;
    expect(seeded.swift).toBeTruthy();
    expect(seeded.beneName).toBeTruthy();
    expect(validSwift(seeded.swift)).toBe(true);
    expect(bankLabel(seeded)).toBe(seeded.bankName);
  });

  it("blocks a VAT-registered record with no Tax ID, and only then", () => {
    const base = {
      code: "BP999999",
      nameTh: "ทดสอบ",
      type: "Company",
      status: "Active",
      roles: { customer: true },
      addresses: [{ type: "Billing", zip: "10110" }],
    } as unknown as BusinessPartner;

    const registered = bpValidate({ ...base, tax: { vatReg: true, taxId: "" } } as never);
    expect(registered.some((i) => i.blocking && i.field === "tax.taxId")).toBe(true);

    const notRegistered = bpValidate({ ...base, tax: { vatReg: false, taxId: "" } } as never);
    expect(notRegistered.filter((i) => i.blocking)).toHaveLength(0);

    const filled = bpValidate({
      ...base,
      tax: { vatReg: true, taxId: "0105560112347" },
    } as never);
    expect(filled.filter((i) => i.blocking)).toHaveLength(0);
  });
});

/* ============================================================
   No regression elsewhere
   ============================================================ */

describe("BP Master — module wiring", () => {
  it("stays registered under its original key and route", () => {
    expect(getSchemas("business-partner")).toBe(bpSchemas);
    expect(pageHref("Business Partner")).toBe("/m/business-partner");
    expect(NAV_INDEX.find((n) => n.label === "Business Partner")!.soon).toBeUndefined();
  });

  it("keeps the partner list the single source other modules read", () => {
    /* Sales orders join on this array; replacing it would break them. */
    expect(BUSINESS_PARTNERS).toBe(RAW);
    expect(BUSINESS_PARTNERS.length).toBe(SEED.length);
  });

  it("still blocks deletion of a partner that carries transactions", () => {
    const withTxn = BUSINESS_PARTNERS.find((b) => b.txnCount > 0)!;
    const ctx = {
      goto: () => {},
      openEntity: () => {},
      toast: () => {},
      confirm: () => {},
      formModal: () => {},
      refresh: () => {},
      quickView: () => {},
      panel: () => {},
    };
    const del = list.rowActions(withTxn, ctx).find((a) => a.label === "Delete")!;
    expect(del.disabled).toBe(true);
    expect(del.disabledReason).toContain(String(withTxn.txnCount));
  });
});
