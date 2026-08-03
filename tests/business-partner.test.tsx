import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
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
  bpValidate,
  canBill,
  canDeliver,
  decorateBPs,
  bpDaysUntil,
  docKind,
  getBP,
  mapUrl,
  nextBPCode,
  validLat,
  validLng,
  validThaiTaxId,
} from "@/lib/domain/partner";
import {
  bpCustomerKpi,
  bpPurchaseKpi,
  bpSalesOrders,
  bpTopProducts,
  bpTopPurchasedProducts,
} from "@/lib/domain/partner-analytics";
import { daysUntil } from "@/lib/format";
import { ATTACHMENT_SEED } from "@/data/partner-profiles";
import { NAV_INDEX } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { getSchemas } from "@/schemas/registry";
import { bpSchemas } from "@/schemas/business-partner";
import { BP_FORM } from "@/schemas/forms/business-partner";

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
      "riskLevel",
      "province",
      "contactName",
    ]) {
      expect(keys, k).toContain(k);
    }
  });

  it("keeps the added columns hidden until Column Settings turns them on", () => {
    for (const k of ["customerType", "supplierType", "creditLimit", "riskLevel"]) {
      expect(list.columns.find((c) => c.key === k)!.defaultHidden, k).toBe(true);
    }
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
    for (const id of ["custType", "supType", "bizType", "risk", "size"]) {
      expect(ids, id).toContain(id);
    }
    const risk = list.filters.find((f) => f.id === "risk")!;
    expect(risk.test(bp(CUSTOMER), bp(CUSTOMER).riskLevel)).toBe(true);
  });
});

/* ============================================================
   Detail page
   ============================================================ */

describe("BP Master — detail tabs", () => {
  it("declares the eleven tabs the spec names", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "addresses",
      "contacts",
      "customer",
      "supplier",
      "banks",
      "attachments",
      "sales-report",
      "purchase-history",
      "activity",
      "audit",
    ]);
  });

  it("shows the Customer tab and hides Supplier for a pure customer", () => {
    const rec = bp(CUSTOMER);
    const visible = detail.tabs.filter((t) => !t.when || t.when(rec)).map((t) => t.key);
    expect(visible).toContain("customer");
    expect(visible).toContain("sales-report");
    expect(visible).not.toContain("supplier");
    expect(visible).not.toContain("purchase-history");
  });

  it("shows the Supplier tab and hides Customer for a pure supplier", () => {
    const rec = bp(SUPPLIER);
    const visible = detail.tabs.filter((t) => !t.when || t.when(rec)).map((t) => t.key);
    expect(visible).toContain("supplier");
    expect(visible).toContain("purchase-history");
    expect(visible).not.toContain("customer");
    expect(visible).not.toContain("sales-report");
  });

  it("shows both sections when the partner is Both", () => {
    const rec = bp(BOTH);
    const visible = detail.tabs.filter((t) => !t.when || t.when(rec)).map((t) => t.key);
    expect(visible).toContain("customer");
    expect(visible).toContain("supplier");
  });

  it("renders the detail page with the General Information block", () => {
    renderDetail(BOTH);
    expect(screen.getAllByText("General Information").length).toBeGreaterThan(0);
    expect(screen.getByText("Bill Type")).toBeInTheDocument();
    expect(screen.getByText("Credit Term")).toBeInTheDocument();
    expect(screen.getByText("Starting Date")).toBeInTheDocument();
  });

  it("builds every visible tab without throwing", () => {
    const ctx = {
      goto: () => {},
      openEntity: () => {},
      toast: () => {},
      confirm: () => {},
      formModal: () => {},
      refresh: () => {},
      quickView: () => {},
    };
    for (const code of [BOTH, CUSTOMER, SUPPLIER]) {
      const rec = bp(code);
      for (const tab of detail.tabs) {
        if (tab.when && !tab.when(rec)) continue;
        expect(() => tab.blocks(rec, ctx), `${code} · ${tab.key}`).not.toThrow();
      }
    }
  });

  it("summarises only the first two addresses and points at the rest", () => {
    const b = bp(CUSTOMER);
    bpAddAddress(b, { name: "สาขา A", type: "Branch", l1: "1" });
    bpAddAddress(b, { name: "สาขา B", type: "Branch", l1: "2" });

    const ctx = { goto: () => {} } as never;
    const blocks = detail.tabs.find((t) => t.key === "addresses")!.blocks(b, ctx);
    const summary = blocks.find(
      (x) => x && typeof x === "object" && x.type === "entity",
    ) as { items: unknown[] };

    expect(summary.items).toHaveLength(2);
    expect(b.addresses.length).toBeGreaterThan(2);
    expect(blocks.some((x) => x && typeof x === "object" && x.type === "note")).toBe(true);
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

  it("rejects duplicate supplier SKUs", () => {
    const rule = BP_FORM.rules!.find((r) => r.label.includes("Supplier SKU"))!;
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
    };
    const del = list.rowActions(withTxn, ctx).find((a) => a.label === "Delete")!;
    expect(del.disabled).toBe(true);
    expect(del.disabledReason).toContain(String(withTxn.txnCount));
  });
});
