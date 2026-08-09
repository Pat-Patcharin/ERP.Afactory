import {
  ATTACHMENT_TYPES,
  BENEFIT_LEVELS,
  BILL_TYPES,
  BP_ADDRESS_TYPES,
  BP_ROLE_DEFS,
  BP_STATUS,
  BANK_SCOPES,
  BP_TYPES,
  CHARGE_BEARERS,
  CLEARING_SYSTEMS,
  COUNTRIES,
  CREDIT_TERMS,
  CUSTOMER_BIZ_TYPES,
  CUSTOMER_SIZES,
  CUSTOMER_TYPES,
  IMAGE_KINDS,
  PAY_TERMS,
  PROVINCES,
  SALES_REPS,
  SUPPLIER_ITEM_STATUS,
  SUPPLIER_STATUSES,
  SUPPLIER_TYPES,
} from "@/data/partners";
import { SALES_AREA_NAMES } from "@/data/sales-areas";
import { districtsOf, subdistrictsOf } from "@/lib/domain/thai-address";
import { can } from "@/lib/domain/admin";
import { PRODUCTS } from "@/lib/domain/product";
import { PO_CURRENCIES, PO_INCOTERMS } from "@/data/purchase-orders";
import { PRICE_LISTS } from "@/data/price-lists";
import {
  BUSINESS_PARTNERS,
  decorateBPs,
  nextBPCode,
  isForeignBank,
  validEmail,
  validIban,
  validLat,
  validLng,
  validPhone,
  validSwift,
  validThaiTaxId,
  validZip,
  type BpRow,
} from "@/lib/domain/partner";
import { BILLING_ADDRESS_TYPES, DELIVERY_ADDRESS_TYPES } from "@/data/partners";
import { money0, stamp, isoToDmy, dmyToIso } from "@/lib/format";
import type { FormSchema, FormState, GridRow } from "@/lib/types";
import { FORM_USER, opts, saved } from "./common";

/* ============================================================
   BUSINESS PARTNER FORM

   One legal entity, many roles. The roles picked in step 2 decide
   which later steps exist at all — a pure supplier never sees the
   sales terms, and its required fields never block the save.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const ENTITY_TYPES = [
  "บริษัทจำกัด",
  "บริษัทมหาชนจำกัด",
  "ห้างหุ้นส่วนจำกัด",
  "บุคคลธรรมดา",
  "หน่วยงานราชการ",
  "มูลนิธิ / สมาคม",
];
const BRANCH_TYPES = ["สำนักงานใหญ่", "สาขา"];
/* The seven kinds of buyer this business actually sells to. State and private
   hospitals are split because they buy on different terms, and `Dentist` is a
   practitioner buying on their own account — see BP_TYPES. */
const CUST_GROUPS = [
  "คลินิกทันตกรรม",
  "โรงพยาบาลรัฐ",
  "โรงพยาบาลเอกชน",
  "หน่วยงานราชการ",
  "มหาวิทยาลัย",
  "สถาบัน",
  "Dentist",
];
const SUP_GROUPS = ["วัสดุสิ้นเปลือง", "เครื่องมือแพทย์", "อะไหล่", "บริการ", "ขนส่ง"];
/* Sales areas come from the sales area master so a partner is filed under the
   same 14 areas the reps are assigned to. Called "Territory" on screen until
   now, which was a second name for the one thing the master already names. */
const SALES_AREAS = SALES_AREA_NAMES;

const CHANNELS = ["Direct Sales", "Dealer", "Online", "Government", "Export"];
/* The price lists that exist, as the documents name them. */
const PRICE_LIST_OPTIONS = PRICE_LISTS.map((p) => `${p.code} ${p.name}`);
/* Address types now come from the master list so the form, the detail page
   and the validator agree on which of them can carry a billing default. */
const ADDRESS_TYPES = [...BP_ADDRESS_TYPES];
const CONTACT_METHODS = ["โทรศัพท์", "อีเมล", "LINE", "แฟกซ์"];
const CREDIT_CONTROL = ["ไม่ควบคุม", "เตือนเมื่อเกินวงเงิน", "ระงับเมื่อเกินวงเงิน"];
const ACC_TYPES = ["ออมทรัพย์", "กระแสรายวัน", "ฝากประจำ"];
const BANKS = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรีอยุธยา", "ทหารไทยธนชาต"];
const RATINGS = ["A - ดีเยี่ยม", "B - ดี", "C - พอใช้", "D - ต้องปรับปรุง"];

/**
 * Whether the legal name and tax ID may still be typed.
 *
 * Yes while the partner is being created or is still a Draft — nothing
 * references it, and a record that locks the instant it is saved turns one
 * typo into an errand for an administrator. People route around that by
 * abandoning the record and raising another, and the system fills with
 * duplicate partners, which is worse than the problem being solved.
 *
 * Once confirmed the pair is fixed: quotations, orders and invoices carry it,
 * and changing it retroactively rewrites what those documents claim. Whoever
 * may approve the module can still edit, because they are the ones who would
 * be asked anyway.
 */
const identityEditable = (s: { _mode?: unknown; status?: unknown }): boolean =>
  s._mode === "create" ||
  String(s.status ?? "") === "Draft" ||
  can("business-partner", "approve");

const isCustomer = (s: { roles?: Record<string, boolean> }) =>
  Boolean(s.roles?.customer || s.roles?.dealer);
const isSupplier = (s: { roles?: Record<string, boolean> }) => Boolean(s.roles?.supplier);

/** A grid row is a foreign wire destination. */
const isForeign = (k: GridRow) => isForeignBank(k as { scope?: string });

/**
 * An address row is in Thailand.
 *
 * Blank counts as Thailand: every new row starts there, and a half-filled row
 * should show the Thai fields rather than the foreign ones.
 */
const isThai = (r: GridRow) => {
  const c = String(r.country ?? "").trim();
  return !c || c === "ประเทศไทย";
};

export const BP_FORM: FormSchema<BpRow> = {
  key: "business-partner",
  entityLabel: "Business Partner",
  titleField: "nameTh",
  saveButton: "Save Partner",
  statusBadge: {
    Active: "success",
    Inactive: "neutral",
    "On Hold": "warning",
    Blocked: "danger",
  },

  blank: () => ({
    _mode: "create",
    code: nextBPCode(),
    logo: "",
    nameTh: "",
    nameEn: "",
    trade: "",
    type: "Company",
    website: "",
    /**
     * A salesperson raises a partner as a Draft; whoever may approve the
     * module raises one that is live straight away.
     *
     * Decided from the permission rather than from a role name, so adding a
     * role that should be able to confirm partners is a change in the matrix
     * and not in this file.
     */
    status: can("business-partner", "approve") ? "Active" : "Draft",
    notes: "",
    since: new Date().toISOString().slice(0, 10),
    billType: "VAT",
    creditTerm: "30",
    roles: { customer: false, supplier: false, dealer: false, prospect: false, other: false },
    cls: {
      custGroup: "",
      supGroup: "",
      bizType: "นิติบุคคล",
      priceGroup: "Retail",
      territory: "",
      channel: "",
    },
    tax: {
      entity: "บริษัทจำกัด",
      taxId: "",
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: "",
      vatReg: true,
      vatDate: "",
      wht: true,
      country: "ประเทศไทย",
    },
    contacts: [],
    addresses: [],
    sales: {
      rep: "",
      team: "",
      territory: "",
      channel: "",
      custGroup: "",
      priceList: "",
      discGroup: "",
      payTerm: "เครดิต 30 วัน",
      creditLimit: 0,
      creditDays: 30,
      creditControl: "เตือนเมื่อเกินวงเงิน",
      delivery: "",
      minOrder: 0,
      taxInvoice: true,
      poRequired: false,
    },
    purchasing: {
      buyer: "",
      supGroup: "",
      currency: "THB",
      payTerm: "เครดิต 30 วัน",
      lead: "",
      minValue: 0,
      punit: "",
      incoterm: "FOB",
      delivery: "",
      rating: "B - ดี",
      preferred: false,
      wht: "3%",
      warehouse: "",
    },
    credit: { payTerm: "เครดิต 30 วัน", limit: 0, days: 30, status: "Normal" },
    banks: [],
    customer: {
      custType: "Private",
      bizType: "Clinic",
      benefit: "0%",
      benefitPct: 0,
      size: "S",
      creditHold: false,
      holdReason: "",
    },
    supplier: {
      supType: "Distributor",
      status: "Approved",
    },
    supplierItems: [],
    docs: [],
    images: [],
  }),

  toState: (b) => ({
    _mode: "edit",
    code: b.code,
    logo: b.logo,
    nameTh: b.nameTh,
    nameEn: b.nameEn,
    trade: b.trade,
    type: b.type,
    website: b.website,
    status: b.status,
    notes: b.notes,
    since: dmyToIso(b.since),
    billType: b.billType ?? "VAT",
    creditTerm: b.creditTerm ?? "30",
    roles: { ...b.roles },
    cls: { ...b.cls },
    tax: { ...b.tax, vatDate: dmyToIso(b.tax?.vatDate) },
    contacts: (b.contacts ?? []).map((c) => ({ ...c })),
    addresses: (b.addresses ?? []).map((a) => ({ ...a })),
    sales: b.sales ? { ...b.sales } : {},
    purchasing: b.purchasing ? { ...b.purchasing } : {},
    credit: b.credit
      ? {
          payTerm: b.credit.payTerm,
          limit: b.credit.limit,
          days: b.credit.days,
          status: b.credit.status,
        }
      : {},
    banks: (b.banks ?? []).map((k) => ({ ...k })),
    /* The profiles are re-derived on save, so the draft only needs the
       dimensions a user can actually edit here. */
    customer: b.customer
      ? {
          custType: b.customer.custType,
          bizType: b.customer.bizType,
          benefit: b.customer.benefit,
          benefitPct: b.customer.benefitPct,
          size: b.customer.size,
          creditHold: b.customer.creditHold,
          holdReason: b.customer.holdReason,
        }
      : {},
    supplier: b.supplier
      ? {
          supType: b.supplier.supType,
          status: b.supplier.status,
        }
      : {},
    supplierItems: (b.supplierItems ?? []).map((i) => ({ ...i })),
    docs: (b.docs ?? []).map((d) => ({ ...d })),
    images: (b.images ?? []).map((i) => ({ ...i })),
  }),

  steps: [
    /* ---------- 1. IDENTITY ---------- */
    {
      key: "identity",
      label: "Identity",
      railLabel: "ข้อมูลองค์กร",
      labelTh: "ชื่อและประเภทคู่ค้า",
      blocks: () => [
        {
          type: "card",
          title: "Organisation",
          cols: "2",
          fields: [
            {
              type: "photo",
              path: "logo",
              label: "รูปคลินิก / สถานประกอบการ",
              span: true,
              hint: "อัปโหลดรูปจริงของคู่ค้า — JPG หรือ PNG ไม่เกิน 2 MB",
            },
            {
              /* The code is issued by the system and never typed. */
              type: "static",
              path: "code",
              label: "Partner Code",
              hint: "ระบบออกรหัสให้อัตโนมัติ — บทบาทไม่ถูกเข้ารหัสไว้ในรหัสคู่ค้า",
            },
            {
              type: "select",
              path: "status",
              label: "Status",
              required: true,
              options: opts(BP_STATUS),
            },
            /**
             * The legal identity — the name on the invoice and the tax ID the
             * revenue department will match it against.
             *
             * A salesperson may type both while the partner is still a Draft:
             * nothing references it yet, and locking a record the moment it is
             * created means one typo needs an administrator. Once the partner
             * is confirmed the pair is fixed, because documents now carry it.
             *
             * Two declarations rather than a conditional `readonly`, which the
             * field contract does not take — the same `when` pairing the Sales
             * Order form uses for its source request.
             */
            {
              type: "text",
              path: "nameTh",
              label: "ชื่อภาษาไทย",
              required: true,
              span: true,
              placeholder: "บริษัท เดนทัล สมายล์ จำกัด",
              when: identityEditable,
            },
            {
              type: "static",
              path: "nameTh",
              label: "ชื่อภาษาไทย",
              span: true,
              hint: "ชื่อนิติบุคคลของคู่ค้าที่ยืนยันแล้วแก้ไม่ได้ — ติดต่อผู้ดูแลหากต้องแก้",
              when: (s) => !identityEditable(s),
            },
            { type: "text", path: "nameEn", label: "English Name" },
            { type: "text", path: "trade", label: "Trade Name", placeholder: "Dental Smile" },
            {
              type: "select",
              path: "type",
              label: "Categories",
              required: true,
              options: opts(BP_TYPES),
            },
            { type: "text", path: "website", label: "Website", placeholder: "www.example.co.th" },
            { type: "date", path: "since", label: "Starting Date" },
            {
              type: "select",
              path: "billType",
              label: "Bill Type",
              required: true,
              options: opts(BILL_TYPES),
            },
            {
              type: "select",
              path: "creditTerm",
              label: "Credit Term",
              required: true,
              options: opts(CREDIT_TERMS),
              hint: "จำนวนวัน หรือ No Credit สำหรับเงินสด",
            },
            { type: "textarea", path: "notes", label: "Remarks", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 2. ROLES AND GROUPING ---------- */
    {
      key: "roles",
      label: "Roles",
      railLabel: "บทบาท",
      labelTh: "บทบาทและการจัดกลุ่ม",
      blocks: () => [
        {
          type: "note",
          label: "หนึ่งนิติบุคคล = หนึ่งระเบียน",
          text: "บทบาทเป็นแฟล็กบนคู่ค้ารายเดียว ไม่ใช่ระเบียนลูกค้าและผู้ขายแยกกัน — บทบาทที่เลือกจะกำหนดว่าขั้นตอนถัดไปมีอะไรบ้าง",
        },
        {
          type: "cards",
          path: "roles",
          label: "Partner Roles",
          required: true,
          hint: "เลือกได้มากกว่าหนึ่งบทบาท",
          cardOptions: BP_ROLE_DEFS.map((r) => ({
            key: r.key,
            label: r.label,
            desc: r.desc,
          })),
        },
        /* The Grouping card stood here. Its two group pickers now sit with the
           role they belong to — Customer Group on Customer Info, Supplier
           Group on Supplier Info — because a group is a fact about being a
           customer or a supplier, not a separate subject. Sales Area and
           Sales Channel were asked twice, here and on Sales Terms; only the
           Sales Terms copy is left. */
      ],
    },

    /* ---------- 3. TAX ---------- */
    {
      key: "tax",
      label: "Tax",
      railLabel: "ภาษี",
      labelTh: "เลขผู้เสียภาษีและ VAT",
      blocks: () => [
        {
          type: "card",
          title: "Tax Registration",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "tax.entity",
              label: "Legal Entity",
              options: ENTITY_TYPES,
            },
            /* A VAT registrant must have a Tax ID; anyone else may not have
               one at all, so the same field stops being mandatory. */
            {
              type: "text",
              path: "tax.taxId",
              label: "Tax ID",
              required: true,
              placeholder: "0105560112347",
              hint: "13 หลัก ระบบตรวจสอบหลักตรวจสอบให้อัตโนมัติ",
              when: (s) => Boolean(s.tax?.vatReg) && identityEditable(s),
            },
            {
              type: "text",
              path: "tax.taxId",
              label: "Tax ID",
              placeholder: "0105560112347",
              hint: "ไม่จด VAT จึงไม่บังคับ — ถ้ากรอกต้องเป็น 13 หลักที่ถูกต้อง",
              when: (s) => !s.tax?.vatReg && identityEditable(s),
            },
            {
              /* Confirmed partner: the tax ID is already on documents. */
              type: "static",
              path: "tax.taxId",
              label: "Tax ID",
              hint: "เลขผู้เสียภาษีของคู่ค้าที่ยืนยันแล้วแก้ไม่ได้ — ติดต่อผู้ดูแลหากต้องแก้",
              when: (s) => !identityEditable(s),
            },
            {
              type: "select",
              path: "tax.branchType",
              label: "Branch Type",
              options: BRANCH_TYPES,
            },
            {
              type: "text",
              path: "tax.branchNo",
              label: "Branch Number",
              placeholder: "00000",
            },
            {
              type: "text",
              path: "tax.regName",
              label: "Registered Name",
              span: true,
              hint: "ชื่อตามหนังสือรับรอง ใช้ออกใบกำกับภาษี",
            },
            {
              type: "toggle",
              path: "tax.vatReg",
              label: "VAT Registered",
              onText: "จดทะเบียน VAT",
              offText: "ไม่จด VAT",
            },
            { type: "date", path: "tax.vatDate", label: "VAT Registration Date" },
            {
              type: "toggle",
              path: "tax.wht",
              label: "Withholding Tax",
              onText: "หัก ณ ที่จ่าย",
              offText: "ไม่หัก",
            },
          ],
        },
      ],
    },

    /* ---------- 5. CONTACTS ---------- */
    {
      key: "contacts",
      label: "Contacts",
      railLabel: "ผู้ติดต่อ",
      labelTh: "รายชื่อผู้ติดต่อ",
      blocks: () => [
        {
          type: "grid",
          path: "contacts",
          label: "Contact People",
          required: true,
          addLabel: "เพิ่มผู้ติดต่อ",
          empty: "ยังไม่มีผู้ติดต่อ — ต้องมีอย่างน้อย 1 คน",
          hint: "เลือกผู้ติดต่อหลัก 1 คน — ระบบใช้ชื่อนี้ในหน้ารายการและเอกสาร",
          /* Eleven columns on one line leaves every box too narrow to read. */
          layout: "stacked",
          rowLabel: "ผู้ติดต่อ",
          cols: [
            { key: "prefix", label: "คำนำหน้า", type: "text", width: "80px", placeholder: "คุณ" },
            { key: "first", label: "ชื่อ", type: "text", required: true },
            { key: "last", label: "นามสกุล", type: "text" },
            { key: "pos", label: "ตำแหน่ง", type: "text", muted: true },
            { key: "mobile", label: "มือถือ", type: "text", placeholder: "081-234-5678" },
            { key: "email", label: "อีเมล", type: "text" },
            { key: "dept", label: "แผนก", type: "text", muted: true },
            { key: "phone", label: "โทรศัพท์", type: "text", width: "130px" },
            { key: "method", label: "ช่องทางหลัก", type: "select", options: CONTACT_METHODS },
            { key: "remark", label: "หมายเหตุ", type: "text", muted: true, span: true },
            { key: "primary", label: "หลัก", type: "radio", width: "56px" },
            { key: "active", label: "ใช้งาน", type: "check", width: "56px" },
          ],
        },
      ],
    },

    /* ---------- 6. ADDRESSES ---------- */
    {
      key: "addresses",
      label: "Addresses",
      railLabel: "ที่อยู่",
      labelTh: "ที่อยู่จดทะเบียนและจัดส่ง",
      blocks: () => [
        {
          type: "grid",
          path: "addresses",
          label: "Addresses",
          required: true,
          addLabel: "เพิ่มที่อยู่",
          empty: "ยังไม่มีที่อยู่ — ต้องมีที่อยู่ออกบิลอย่างน้อย 1 แห่ง",
          hint: "ที่อยู่ออกบิลบังคับ · ที่อยู่จัดส่งไม่บังคับ · ออกบิลได้เฉพาะ Head Office และ Branch · ส่งของได้ทุกประเภท",
          /* Seventeen columns; a street address needs room to be read back. */
          layout: "stacked",
          rowLabel: "ที่อยู่",
          cols: [
            { key: "name", label: "ชื่อเรียก", type: "text", required: true, placeholder: "สำนักงานใหญ่" },
            { key: "type", label: "ประเภท", type: "select", options: ADDRESS_TYPES, required: true },
            { key: "l1", label: "ที่อยู่", type: "text", required: true, width: "220px", span: true },
            /* Country first, because it decides what the three lines under it
               mean. A supplier in Vietnam has provinces and districts too —
               they are simply not Thailand's, and offering a Thai dropdown
               for them is offering the wrong list. */
            { key: "country", label: "ประเทศ", type: "select", options: opts(COUNTRIES), required: true },

            /* ---- Thailand: จังหวัด › อำเภอ › ตำบล, each list drawn from
                   the one above it. See lib/domain/thai-address.ts. ---- */
            { key: "prov", label: "จังหวัด", type: "select", options: opts(PROVINCES), when: isThai },
            {
              key: "dist",
              /* Bangkok has เขต; everywhere else has อำเภอ. Same field, and
                 the label is the only place the difference shows. */
              label: "เขต/อำเภอ",
              type: "select",
              optionsFor: (r) => districtsOf(String(r.prov ?? "")),
              placeholder: "— เลือกจังหวัดก่อน —",
              when: isThai,
            },
            {
              key: "sub",
              label: "แขวง/ตำบล",
              type: "select",
              optionsFor: (r) => subdistrictsOf(String(r.prov ?? ""), String(r.dist ?? "")),
              placeholder: "— เลือกอำเภอก่อน —",
              when: isThai,
            },

            /* ---- Anywhere else ---- */
            { key: "prov", label: "State / Province", type: "text", when: (r) => !isThai(r) },
            { key: "dist", label: "City / District", type: "text", when: (r) => !isThai(r) },
            { key: "sub", label: "Area", type: "text", when: (r) => !isThai(r) },

            { key: "zip", label: "รหัสไปรษณีย์", type: "text", width: "110px" },
            { key: "contact", label: "ผู้ติดต่อ", type: "text" },
            { key: "phone", label: "โทรศัพท์", type: "text", width: "130px" },
            { key: "email", label: "อีเมล", type: "text" },
            { key: "lat", label: "Latitude", type: "text", width: "110px", muted: true },
            { key: "lng", label: "Longitude", type: "text", width: "110px", muted: true },
            { key: "maps", label: "Google Map URL", type: "text", width: "180px", muted: true, span: true },
            { key: "billingPrimary", label: "ออกบิล", type: "radio", width: "64px" },
            { key: "deliveryPrimary", label: "จัดส่ง", type: "radio", width: "64px" },
            { key: "remark", label: "หมายเหตุ", type: "text", muted: true, span: true },
            { key: "active", label: "ใช้งาน", type: "check", width: "56px" },
          ],
        },
      ],
    },

    /* ---------- 6b. CUSTOMER INFORMATION (customers and dealers only) ---------- */
    {
      key: "customer",
      label: "Customer Info",
      railLabel: "ข้อมูลลูกค้า",
      labelTh: "ประเภทลูกค้าและส่วนลด",
      when: isCustomer,
      blocks: (s) => [
        {
          type: "card",
          title: "Customer Information",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "customer.custType",
              label: "Customer Type",
              required: true,
              options: opts(CUSTOMER_TYPES),
            },
            {
              type: "select",
              path: "customer.bizType",
              label: "Business Type",
              required: true,
              options: opts(CUSTOMER_BIZ_TYPES),
            },
            /* Moved off the old Grouping card — see the note on the Roles step. */
            {
              type: "select",
              path: "cls.custGroup",
              label: "Customer Group",
              options: CUST_GROUPS,
            },
            {
              type: "select",
              path: "customer.size",
              label: "Customer Size",
              options: opts(CUSTOMER_SIZES),
            },
            {
              type: "select",
              path: "customer.benefit",
              label: "Benefit Level",
              options: opts(BENEFIT_LEVELS),
            },
            /* Only asked for when the ladder cannot express it. */
            {
              type: "number",
              path: "customer.benefitPct",
              label: "Benefit %",
              min: 0,
              max: 100,
              step: "0.5",
              when: (st) => st.customer?.benefit === "Custom",
              hint: "ส่วนลดที่ตกลงเป็นรายสัญญา",
            },
          ],
        },
        {
          type: "card",
          title: "Credit Control",
          cols: "2",
          fields: [
            {
              type: "toggle",
              path: "customer.creditHold",
              label: "Credit Hold",
              onText: "ระงับการขายเชื่อ",
              offText: "ปกติ",
            },
            {
              type: "text",
              path: "customer.holdReason",
              label: "Credit Hold Reason",
              when: (st) => Boolean(st.customer?.creditHold),
              placeholder: "เหตุผลที่ระงับ",
            },
            {
              type: "static",
              label: "Available Credit",
              value: (st) =>
                `${money0(Math.max(0, num(st.credit?.limit) - num(st.credit?.outstanding)))} THB`,
            },
          ],
        },
      ],
    },

    /* ---------- 6c. SUPPLIER INFORMATION (suppliers only) ---------- */
    {
      key: "supplier",
      label: "Supplier Info",
      railLabel: "ข้อมูลผู้ขาย",
      labelTh: "ประเภทผู้ขายและสินค้าที่เสนอ",
      when: isSupplier,
      blocks: () => [
        {
          type: "card",
          title: "Supplier Information",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "supplier.supType",
              label: "Supplier Type",
              required: true,
              options: opts(SUPPLIER_TYPES),
            },
            {
              type: "select",
              path: "supplier.status",
              label: "Supplier Status",
              options: opts(SUPPLIER_STATUSES),
            },
            /* Moved off the old Grouping card. Purchasing Terms asked for the
               same group a second time; that copy is gone. */
            {
              type: "select",
              path: "cls.supGroup",
              label: "Supplier Group",
              options: SUP_GROUPS,
            },
          ],
        },
        {
          type: "grid",
          path: "supplierItems",
          label: "Supplier Items",
          addLabel: "เพิ่มสินค้าที่เสนอ",
          empty: "ยังไม่มีรายการสินค้าที่ผู้ขายรายนี้เสนอ",
          hint: "ราคาที่ผู้ขายเสนอต่อสินค้า ใช้เป็นราคาตั้งต้นตอนออกใบสั่งซื้อ",
          cols: [
            {
              key: "product",
              label: "Product Code",
              type: "lookup",
              source: "product",
              required: true,
              width: "150px",
            },
            { key: "sku", label: "Vendor Product Code", type: "text", width: "150px" },
            { key: "productName", label: "Product Name", type: "static", muted: true, width: "200px" },
            { key: "punit", label: "Purchase Unit", type: "text", width: "110px" },
            { key: "moq", label: "MOQ", type: "number", align: "right", width: "90px" },
            { key: "lead", label: "Lead (วัน)", type: "number", align: "right", width: "100px" },
            { key: "currency", label: "Currency", type: "select", options: [...PO_CURRENCIES] },
            { key: "price", label: "Cost", type: "number", align: "right", width: "120px" },
            { key: "status", label: "Status", type: "select", options: [...SUPPLIER_ITEM_STATUS] },
          ],
        },
      ],
    },

    /* ---------- 6d. ATTACHMENTS & IMAGES ---------- */
    {
      key: "attachments",
      label: "Attachments",
      railLabel: "เอกสารและรูปภาพ",
      labelTh: "เอกสารแนบและแกลเลอรี",
      blocks: () => [
        {
          type: "grid",
          path: "docs",
          label: "Attachments",
          addLabel: "เพิ่มเอกสาร",
          empty: "ยังไม่มีเอกสารแนบ",
          hint: "รองรับ PDF, Word, Excel และรูปภาพ — ชนิดไฟล์อ่านจากนามสกุลอัตโนมัติ",
          cols: [
            {
              key: "type",
              label: "ประเภทเอกสาร",
              type: "select",
              options: [...ATTACHMENT_TYPES],
              required: true,
            },
            { key: "name", label: "ชื่อไฟล์", type: "text", required: true, width: "220px" },
            { key: "issue", label: "วันที่ออก", type: "date", width: "130px" },
            { key: "expiry", label: "วันหมดอายุ", type: "date", width: "130px" },
            { key: "by", label: "ผู้อัปโหลด", type: "text" },
            { key: "date", label: "วันที่อัปโหลด", type: "date", width: "130px" },
            { key: "remark", label: "หมายเหตุ", type: "text", muted: true, span: true },
            {
              key: "status",
              label: "สถานะ",
              type: "select",
              options: ["Active", "Expired", "Superseded"],
            },
          ],
        },
        {
          type: "grid",
          path: "images",
          label: "Image Gallery",
          addLabel: "เพิ่มรูปภาพ",
          empty: "ยังไม่มีรูปภาพ",
          hint: "ตั้งรูปหน้าปกได้ 1 รูป — จะใช้เป็นรูปประจำคู่ค้า",
          cols: [
            { key: "src", label: "รูป", type: "text", width: "80px", placeholder: "🏥" },
            { key: "name", label: "ชื่อรูป", type: "text", required: true, width: "200px" },
            { key: "kind", label: "ประเภท", type: "select", options: [...IMAGE_KINDS] },
            { key: "by", label: "ผู้อัปโหลด", type: "text" },
            { key: "date", label: "วันที่", type: "date", width: "130px" },
            { key: "remark", label: "หมายเหตุ", type: "text", muted: true, span: true },
            { key: "cover", label: "หน้าปก", type: "radio", width: "70px" },
          ],
        },
      ],
    },

    /* ---------- 7. SALES TERMS (customers and dealers only) ---------- */
    {
      key: "sales",
      label: "Sales Terms",
      railLabel: "เงื่อนไขการขาย",
      labelTh: "ผู้ดูแลและเครดิต",
      when: isCustomer,
      blocks: () => [
        {
          type: "card",
          title: "Sales Assignment",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "sales.rep",
              label: "Sales Representative",
              required: true,
              options: opts(SALES_REPS),
            },
            { type: "select", path: "sales.territory", label: "Sales Area", options: SALES_AREAS },
            { type: "select", path: "sales.channel", label: "Sales Channel", options: CHANNELS },
            /* Picked from the price list master rather than typed. A free-text
               box here meant "Retail 2569" on the partner and "PL-STD-2026
               Standard" in the list the documents read, with nothing to say
               they were meant to be the same thing. */
            {
              type: "select",
              path: "sales.priceList",
              label: "Price List",
              options: PRICE_LIST_OPTIONS,
              hint: "จาก Price List Master — เอกสารขายอ่านรายการเดียวกันนี้",
            },
            { type: "text", path: "sales.discGroup", label: "Discount Group", placeholder: "Gold 5%" },
            {
              type: "number",
              path: "sales.minOrder",
              label: "Minimum Order Value",
              min: 0,
            },
          ],
        },
        {
          type: "card",
          title: "Payment & Delivery",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "sales.payTerm",
              label: "Payment Term",
              required: true,
              options: opts(PAY_TERMS),
            },
            {
              type: "select",
              path: "sales.creditControl",
              label: "Credit Control",
              options: CREDIT_CONTROL,
            },
            {
              type: "toggle",
              path: "sales.taxInvoice",
              label: "Tax Invoice Required",
              onText: "ต้องออกใบกำกับภาษี",
              offText: "ไม่ต้อง",
            },
            {
              type: "toggle",
              path: "sales.poRequired",
              label: "PO Required",
              onText: "ต้องมีใบสั่งซื้อลูกค้า",
              offText: "ไม่ต้อง",
            },
          ],
        },
      ],
    },

    /* ---------- 8. PURCHASING TERMS (suppliers only) ---------- */
    {
      key: "purchasing",
      label: "Purchasing Terms",
      railLabel: "เงื่อนไขการซื้อ",
      labelTh: "ผู้จัดซื้อและ Incoterm",
      when: isSupplier,
      blocks: () => [
        {
          type: "card",
          title: "Purchasing",
          cols: "2",
          fields: [
            /* Buyer stood here. Who places the order is a fact about the
               purchase order, not about the supplier — the PO form asks for
               it, and asking again on the partner produced a default nobody
               reads. Supplier Group moved to Supplier Info with the rest of
               the grouping. */
            {
              type: "select",
              path: "purchasing.currency",
              label: "Currency",
              required: true,
              options: opts(PO_CURRENCIES),
            },
            {
              type: "select",
              path: "purchasing.payTerm",
              label: "Payment Term",
              options: opts(PAY_TERMS),
            },
            { type: "select", path: "purchasing.incoterm", label: "Incoterm", options: opts(PO_INCOTERMS) },
            { type: "text", path: "purchasing.lead", label: "Lead Time", placeholder: "14 วัน" },
            { type: "number", path: "purchasing.minValue", label: "Minimum Order Value", min: 0 },
            { type: "select", path: "purchasing.rating", label: "Supplier Rating", options: RATINGS },
            { type: "text", path: "purchasing.wht", label: "Withholding Tax Rate", placeholder: "3%" },
            {
              type: "toggle",
              path: "purchasing.preferred",
              label: "Preferred Supplier",
              onText: "ผู้ขายที่แนะนำ",
              offText: "ผู้ขายทั่วไป",
            },
          ],
        },
      ],
    },

    /* ---------- 9. FINANCE ---------- */
    {
      key: "finance",
      label: "Finance",
      railLabel: "การเงิน",
      labelTh: "วงเงินและบัญชีธนาคาร",
      blocks: () => [
        {
          type: "card",
          title: "Credit",
          cols: "3",
          fields: [
            {
              type: "secure",
              as: "number",
              permission: "canViewCredit",
              path: "credit.limit",
              label: "Credit Limit",
              min: 0,
              hint: "0 = ไม่ให้เครดิต",
            },
            {
              type: "secure",
              as: "number",
              permission: "canViewCredit",
              path: "credit.days",
              label: "Credit Days",
              min: 0,
              max: 180,
            },
            {
              type: "select",
              path: "credit.payTerm",
              label: "Payment Term",
              options: opts(PAY_TERMS),
            },
          ],
        },
        {
          type: "grid",
          path: "banks",
          label: "Bank Accounts",
          addLabel: "เพิ่มบัญชีธนาคาร",
          empty: "ยังไม่มีบัญชีธนาคาร",
          hint: "บัญชีในประเทศกรอกเท่าที่เห็น · บัญชีต่างประเทศจะเปิดช่องสำหรับการโอนผ่าน SWIFT เพิ่มให้ · เลขบัญชีจะถูกปิดบังบางส่วนสำหรับผู้ที่ไม่มีสิทธิ์ดู",
          /* Fifteen fields on a foreign wire; the card lets them breathe. */
          layout: "stacked",
          rowLabel: "บัญชี",
          cols: [
            {
              key: "scope",
              label: "ประเภทการโอน",
              type: "select",
              options: [...BANK_SCOPES],
              required: true,
              width: "140px",
            },

            /* ---- Domestic ---- */
            {
              key: "bank",
              label: "ธนาคาร",
              type: "select",
              options: BANKS,
              required: true,
              when: (k) => !isForeign(k),
            },
            { key: "branch", label: "สาขา", type: "text", when: (k) => !isForeign(k) },
            {
              key: "accType",
              label: "ประเภทบัญชี",
              type: "select",
              options: ACC_TYPES,
              when: (k) => !isForeign(k),
            },

            /* ---- International: the receiving bank ---- */
            {
              key: "bankName",
              label: "Bank Name (EN)",
              type: "text",
              required: true,
              span: true,
              when: isForeign,
            },
            {
              key: "swift",
              label: "SWIFT / BIC",
              type: "text",
              required: true,
              placeholder: "KASITHBK หรือ KASITHBKXXX",
              when: isForeign,
            },
            {
              key: "iban",
              label: "IBAN",
              type: "text",
              placeholder: "DE89 3704 0044 0532 0130 00",
              when: isForeign,
            },
            {
              key: "bankCountry",
              label: "Bank Country",
              type: "select",
              options: opts(COUNTRIES),
              required: true,
              when: isForeign,
            },
            {
              key: "bankAddress",
              label: "Bank Address",
              type: "text",
              span: true,
              when: isForeign,
            },

            /* ---- International: the beneficiary ---- */
            {
              key: "beneName",
              label: "Beneficiary Name (EN)",
              type: "text",
              required: true,
              span: true,
              when: isForeign,
            },
            {
              key: "beneAddress",
              label: "Beneficiary Address",
              type: "text",
              span: true,
              when: isForeign,
            },

            /* ---- Shared ---- */
            { key: "accName", label: "ชื่อบัญชี", type: "text", span: true },
            { key: "accNo", label: "เลขที่บัญชี", type: "text", required: true },
            {
              key: "currency",
              label: "Currency",
              type: "select",
              options: [...PO_CURRENCIES],
              required: true,
              when: isForeign,
            },

            /* ---- International: routing extras ---- */
            {
              key: "clearingSystem",
              label: "Clearing System",
              type: "select",
              options: [...CLEARING_SYSTEMS],
              when: isForeign,
            },
            {
              key: "clearingCode",
              label: "Clearing Code",
              type: "text",
              when: (k) => isForeign(k) && Boolean(k.clearingSystem) && k.clearingSystem !== "ไม่มี",
            },
            { key: "interSwift", label: "Intermediary SWIFT", type: "text", when: isForeign },
            {
              key: "interBank",
              label: "Intermediary Bank",
              type: "text",
              span: true,
              when: (k) => isForeign(k) && Boolean(k.interSwift),
            },
            {
              key: "charges",
              label: "Charge Bearer",
              type: "select",
              options: [...CHARGE_BEARERS],
              when: isForeign,
            },
            {
              key: "purpose",
              label: "Purpose of Payment",
              type: "text",
              span: true,
              when: isForeign,
            },

            { key: "def", label: "บัญชีหลัก", type: "radio", width: "80px" },
            { key: "active", label: "ใช้งาน", type: "check", width: "80px" },
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
    { path: "code", label: "Partner Code", step: "identity" },
    { path: "nameTh", label: "ชื่อภาษาไทย", step: "identity" },
    { path: "type", label: "Partner Type", step: "identity" },
    { path: "status", label: "Status", step: "identity" },
    {
      path: "roles",
      label: "Partner Roles",
      step: "roles",
      test: (s) => Object.values(s.roles ?? {}).some(Boolean),
    },
    {
      /* Only a VAT registrant is obliged to have one. */
      path: "tax.taxId",
      label: "Tax ID (เมื่อจดทะเบียน VAT)",
      step: "tax",
      test: (s) => !s.tax?.vatReg || Boolean(String(s.tax?.taxId ?? "").trim()),
    },
    {
      path: "contacts",
      label: "ผู้ติดต่ออย่างน้อย 1 คน",
      step: "contacts",
      test: (s) => ((s.contacts ?? []) as GridRow[]).some((c) => String(c.first ?? "").trim()),
    },
    {
      /* Billing must exist; delivery is explicitly optional per the spec. */
      path: "addresses",
      label: "ที่อยู่ออกบิลอย่างน้อย 1 แห่ง",
      step: "addresses",
      test: (s) =>
        ((s.addresses ?? []) as GridRow[]).some(
          (a) => String(a.l1 ?? "").trim() && BILLING_ADDRESS_TYPES.includes(String(a.type)),
        ),
    },
    { path: "billType", label: "Bill Type", step: "identity" },
    { path: "creditTerm", label: "Credit Term", step: "identity" },
    { path: "customer.custType", label: "Customer Type", step: "customer" },
    { path: "customer.bizType", label: "Business Type", step: "customer" },
    { path: "supplier.supType", label: "Supplier Type", step: "supplier" },
    { path: "sales.rep", label: "Sales Representative", step: "sales" },
    { path: "sales.payTerm", label: "Payment Term (ขาย)", step: "sales" },
    { path: "purchasing.buyer", label: "Buyer", step: "purchasing" },
    { path: "purchasing.currency", label: "Currency (ซื้อ)", step: "purchasing" },
  ],

  rules: [
    {
      label: "เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลักและหลักตรวจสอบถูกต้อง",
      step: "tax",
      test: (s) => !s.tax?.taxId || validThaiTaxId(String(s.tax.taxId)),
    },
    {
      label: "เลขประจำตัวผู้เสียภาษีต้องไม่ซ้ำกับคู่ค้ารายอื่น",
      step: "tax",
      test: (s) => {
        const id = String(s.tax?.taxId ?? "").trim();
        return !id || !BUSINESS_PARTNERS.some((b) => b.tax?.taxId === id && b.code !== s.code);
      },
    },
    {
      label: "ต้องเลือกผู้ติดต่อหลัก 1 คน",
      step: "contacts",
      test: (s) => {
        const rows = (s.contacts ?? []) as GridRow[];
        return rows.length === 0 || rows.filter((c) => c.primary).length === 1;
      },
    },
    {
      label: "อีเมลผู้ติดต่อต้องอยู่ในรูปแบบที่ถูกต้อง",
      step: "contacts",
      test: (s) => ((s.contacts ?? []) as GridRow[]).every((c) => validEmail(String(c.email ?? ""))),
    },
    {
      label: "เบอร์โทรผู้ติดต่อต้องอยู่ในรูปแบบที่ถูกต้อง",
      step: "contacts",
      test: (s) => ((s.contacts ?? []) as GridRow[]).every((c) => validPhone(String(c.mobile ?? ""))),
    },
    {
      label: "ต้องเลือกที่อยู่ออกบิล 1 แห่ง",
      step: "addresses",
      test: (s) => {
        const rows = (s.addresses ?? []) as GridRow[];
        return rows.length === 0 || rows.filter((a) => a.billingPrimary).length === 1;
      },
    },
    {
      label: "ที่อยู่ออกบิลต้องเป็นประเภท Billing, Both, Head Office หรือ Branch",
      step: "addresses",
      test: (s) =>
        ((s.addresses ?? []) as GridRow[])
          .filter((a) => a.billingPrimary)
          .every((a) => BILLING_ADDRESS_TYPES.includes(String(a.type))),
    },
    {
      label: "ที่อยู่จัดส่งต้องเป็นประเภทที่รับสินค้าได้",
      step: "addresses",
      test: (s) =>
        ((s.addresses ?? []) as GridRow[])
          .filter((a) => a.deliveryPrimary)
          .every((a) => DELIVERY_ADDRESS_TYPES.includes(String(a.type))),
    },
    {
      label: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก",
      step: "addresses",
      test: (s) => ((s.addresses ?? []) as GridRow[]).every((a) => validZip(String(a.zip ?? ""))),
    },
    {
      label: "พิกัดต้องอยู่ในช่วง latitude -90..90 และ longitude -180..180",
      step: "addresses",
      test: (s) =>
        ((s.addresses ?? []) as GridRow[]).every(
          (a) => validLat(String(a.lat ?? "")) && validLng(String(a.lng ?? "")),
        ),
    },
    {
      label: "วงเงินเครดิตต้องไม่ติดลบ",
      step: "finance",
      test: (s) => num(s.credit?.limit) >= 0,
    },
    {
      label: "ส่วนลดแบบ Custom ต้องอยู่ระหว่าง 0-100%",
      step: "customer",
      test: (s) =>
        s.customer?.benefit !== "Custom" ||
        (num(s.customer?.benefitPct) >= 0 && num(s.customer?.benefitPct) <= 100),
    },
    {
      label: "เหตุผลจำเป็นเมื่อระงับเครดิต",
      step: "customer",
      test: (s) => !s.customer?.creditHold || Boolean(String(s.customer?.holdReason ?? "").trim()),
    },
    {
      label: "Vendor Product Code ต้องไม่ซ้ำกันในผู้ขายรายเดียว",
      step: "supplier",
      test: (s) => {
        const skus = ((s.supplierItems ?? []) as GridRow[])
          .map((i) => String(i.sku ?? "").trim())
          .filter(Boolean);
        return new Set(skus).size === skus.length;
      },
    },
    {
      label: "ราคาที่ผู้ขายเสนอต้องไม่ติดลบ",
      step: "supplier",
      test: (s) => ((s.supplierItems ?? []) as GridRow[]).every((i) => num(i.price) >= 0),
    },
    /* ---- International wires. A domestic account answers none of these. ---- */
    {
      label: "บัญชีต่างประเทศต้องระบุ SWIFT / BIC",
      step: "finance",
      test: (s) =>
        ((s.banks ?? []) as GridRow[])
          .filter(isForeign)
          .every((k) => Boolean(String(k.swift ?? "").trim())),
    },
    {
      label: "SWIFT / BIC ต้องเป็น 8 หรือ 11 ตัวอักษรตามมาตรฐาน",
      step: "finance",
      test: (s) =>
        ((s.banks ?? []) as GridRow[]).every((k) => validSwift(String(k.swift ?? ""))),
    },
    {
      label: "IBAN ต้องอยู่ในรูปแบบที่ถูกต้อง",
      step: "finance",
      test: (s) => ((s.banks ?? []) as GridRow[]).every((k) => validIban(String(k.iban ?? ""))),
    },
    {
      label: "บัญชีต่างประเทศต้องระบุชื่อธนาคาร ประเทศ ชื่อผู้รับเงิน และสกุลเงิน",
      step: "finance",
      test: (s) =>
        ((s.banks ?? []) as GridRow[])
          .filter(isForeign)
          .every((k) =>
            ["bankName", "bankCountry", "beneName", "currency"].every((f) =>
              Boolean(String(k[f] ?? "").trim()),
            ),
          ),
    },
    {
      label: "ถ้าเลือกระบบ Clearing ต้องระบุรหัส Clearing ด้วย",
      step: "finance",
      test: (s) =>
        ((s.banks ?? []) as GridRow[])
          .filter((k) => isForeign(k) && k.clearingSystem && k.clearingSystem !== "ไม่มี")
          .every((k) => Boolean(String(k.clearingCode ?? "").trim())),
    },
    {
      label: "รูปหน้าปกต้องมีได้ 1 รูป",
      step: "attachments",
      test: (s) => {
        const rows = (s.images ?? []) as GridRow[];
        return rows.length === 0 || rows.filter((i) => i.cover).length === 1;
      },
    },
  ],

  newRow: (path) => {
    switch (path) {
      case "contacts":
        return {
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
        };
      case "addresses":
        return {
          name: "",
          /* Both is the common case — one site that bills and receives. */
          type: "Head Office",
          l1: "",
          l2: "",
          sub: "",
          dist: "",
          prov: "",
          zip: "",
          country: "ประเทศไทย",
          phone: "",
          contact: "",
          email: "",
          maps: "",
          lat: "",
          lng: "",
          remark: "",
          image: "",
          primary: false,
          billingPrimary: false,
          deliveryPrimary: false,
          active: true,
        };
      case "banks":
        return {
          bank: "",
          branch: "",
          accName: "",
          accNo: "",
          accType: "ออมทรัพย์",
          currency: "THB",
          swift: "",
          scope: "ในประเทศ",
          bankName: "",
          bankCountry: "",
          bankAddress: "",
          iban: "",
          beneName: "",
          beneAddress: "",
          clearingSystem: "",
          clearingCode: "",
          interSwift: "",
          interBank: "",
          charges: "SHA — แบ่งกันจ่าย",
          purpose: "",
          def: false,
          active: true,
        };
      case "supplierItems":
        return {
          product: "",
          productName: "",
          sku: "",
          punit: "",
          moq: 1,
          lead: 7,
          currency: "THB",
          price: 0,
          status: "Active",
        };
      case "docs":
        return {
          type: "Business License",
          name: "",
          issue: "",
          expiry: "",
          status: "Active",
          by: FORM_USER(),
          date: new Date().toISOString().slice(0, 10),
          remark: "",
        };
      case "images":
        return {
          id: "",
          name: "",
          src: "🖼️",
          kind: "Other",
          by: FORM_USER(),
          date: new Date().toISOString().slice(0, 10),
          cover: false,
          remark: "",
        };
      default:
        return {};
    }
  },

  /**
   * Collections that carry a default keep exactly one. The first row added
   * wins by default, so a user who never touches the radio still saves a
   * record the validator accepts.
   */
  onGridChange: (path, s) => {
    const first = (rows: GridRow[], flag: string, eligible?: (r: GridRow) => boolean) => {
      if (!rows.length || rows.some((r) => r[flag])) return;
      const row = eligible ? rows.find(eligible) : rows[0];
      if (row) row[flag] = true;
    };
    const rows = (s[path] ?? []) as GridRow[];

    if (path === "contacts") first(rows, "primary");
    if (path === "banks") first(rows, "def");
    if (path === "images") first(rows, "cover");
    if (path === "addresses") {
      /**
       * A district belongs to the province above it and a subdistrict to the
       * district above that, so changing a parent invalidates the children.
       *
       * Cleared rather than left standing: the select would show a blank for
       * a value that is no longer in its list, which looks like nothing was
       * ever filled in — while the record still carries กรุงเทพมหานคร with a
       * tambon from Chiang Mai. Wrong and invisible beats empty and obvious
       * only if nobody has to ship anything there.
       */
      for (const a of rows) {
        /* Thailand only. The same three fields are free text abroad, and
           checking a Hanoi address against the Thai list would empty it. */
        if (!isThai(a)) continue;
        const prov = String(a.prov ?? "");
        const dist = String(a.dist ?? "");
        if (dist && !districtsOf(prov).includes(dist)) {
          a.dist = "";
          a.sub = "";
        } else if (a.sub && !subdistrictsOf(prov, dist).includes(String(a.sub))) {
          a.sub = "";
        }
      }

      first(rows, "primary");
      first(rows, "billingPrimary", (a) => BILLING_ADDRESS_TYPES.includes(String(a.type)));
      if (rows.some((a) => DELIVERY_ADDRESS_TYPES.includes(String(a.type)))) {
        first(rows, "deliveryPrimary", (a) => DELIVERY_ADDRESS_TYPES.includes(String(a.type)));
      }
      /* Changing a type can strip an address of the right to hold a default. */
      for (const a of rows) {
        if (a.billingPrimary && !BILLING_ADDRESS_TYPES.includes(String(a.type))) {
          a.billingPrimary = false;
        }
        if (a.deliveryPrimary && !DELIVERY_ADDRESS_TYPES.includes(String(a.type))) {
          a.deliveryPrimary = false;
        }
      }
    }
  },

  lookup: {
    product: (q) => {
      const needle = q.trim().toLowerCase();
      return PRODUCTS.filter(
        (p) =>
          !needle ||
          p.code.toLowerCase().includes(needle) ||
          p.name.toLowerCase().includes(needle),
      )
        .slice(0, 8)
        .map((p) => ({ code: p.code, name: p.name, meta: p.unit }));
    },
  },

  onLookupPick: (source, gridPath, index, rec, state) => {
    if (source !== "product") return;
    const row = ((state[gridPath] ?? []) as GridRow[])[index];
    if (!row) return;
    row.product = rec.code;
    row.productName = rec.name;
    row.punit ||= rec.meta ?? "";
  },

  findDuplicates: (s) => {
    const id = String(s.tax?.taxId ?? "").trim();
    const name = String(s.nameTh ?? "").trim();
    if (!id && name.length < 4) return [];
    return BUSINESS_PARTNERS.filter(
      (b) =>
        b.code !== s.code &&
        ((id && b.tax?.taxId === id) || (name.length >= 4 && b.nameTh === name)),
    )
      .slice(0, 4)
      .map((b) => ({
        code: b.code,
        name: b.nameTh,
        why: b.tax?.taxId === id ? "เลขผู้เสียภาษีซ้ำ" : "ชื่อภาษาไทยซ้ำ",
      }));
  },

  openDuplicate: (code, ctx) => ctx.openEntity("business-partner", code),

  /* No side panel: the rail already shows step progress, and a second
     summary of the same draft only competed with the fields being filled. */

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = BUSINESS_PARTNERS.find((b) => b.code === code);

    const patch = {
      logo: String(s.logo ?? ""),
      nameTh: String(s.nameTh ?? "").trim(),
      nameEn: String(s.nameEn ?? ""),
      trade: String(s.trade ?? ""),
      type: String(s.type ?? "Company"),
      website: String(s.website ?? ""),
      status: String(s.status ?? "Active"),
      notes: String(s.notes ?? ""),
      since: isoToDmy(s.since),
      billType: String(s.billType ?? "VAT"),
      creditTerm: String(s.creditTerm ?? "30"),
      roles: { ...(s.roles ?? {}) },
      cls: { ...(s.cls ?? {}) },
      tax: { ...(s.tax ?? {}), vatDate: isoToDmy(s.tax?.vatDate) },
      contacts: ((s.contacts ?? []) as GridRow[]).map((c, i) => ({
        ...c,
        code: c.code || `CT${String(i + 1).padStart(3, "0")}`,
      })),
      addresses: ((s.addresses ?? []) as GridRow[]).map((a) => ({
        ...a,
        /* The legacy single-primary flag follows the billing default, so
           anything still reading `primary` keeps working. */
        primary: Boolean(a.billingPrimary),
      })),
      sales: isCustomer(s) ? { ...(s.sales ?? {}) } : null,
      purchasing: isSupplier(s) ? { ...(s.purchasing ?? {}) } : null,
      banks: ((s.banks ?? []) as GridRow[]).map((k) => ({ ...k })),
      /* Profiles keep only the dimensions the form owns; decorateBPs() puts
         the money and the ownership back from their real homes. */
      customer: isCustomer(s) ? { ...(s.customer ?? {}) } : null,
      supplier: isSupplier(s) ? { ...(s.supplier ?? {}) } : null,
      supplierItems: isSupplier(s)
        ? ((s.supplierItems ?? []) as GridRow[]).map((i) => ({
            ...i,
            /* Dates are carried, not edited — an older row keeps its own. */
            effective: i.effective ? isoToDmy(i.effective) : "",
            expiry: i.expiry ? isoToDmy(i.expiry) : "",
          }))
        : [],
      docs: ((s.docs ?? []) as GridRow[]).map((d) => ({
        ...d,
        issue: isoToDmy(d.issue),
        expiry: isoToDmy(d.expiry),
        date: isoToDmy(d.date),
      })),
      images: ((s.images ?? []) as GridRow[]).map((i, idx) => ({
        ...i,
        id: i.id || `IMG${String(idx + 1).padStart(3, "0")}`,
        date: isoToDmy(i.date),
      })),
      updated: now,
      updatedBy: FORM_USER(),
    };

    /* Balances are transactional — the form only sets the policy figures. */
    const limit = num(s.credit?.limit);
    const outstanding = existing?.credit?.outstanding ?? 0;
    const credit = {
      payTerm: String(s.credit?.payTerm ?? ""),
      limit,
      days: num(s.credit?.days),
      outstanding,
      openSO: existing?.credit?.openSO ?? 0,
      openInv: existing?.credit?.openInv ?? 0,
      available: Math.max(0, limit - outstanding),
      status: isCustomer(s) ? (existing?.credit?.status ?? "Normal") : "Not Applicable",
      holdReason: existing?.credit?.holdReason ?? "",
      holdDate: existing?.credit?.holdDate ?? "",
      approvedBy: existing?.credit?.approvedBy ?? FORM_USER(),
      approvalDate: existing?.credit?.approvalDate ?? now.split(" ")[0],
    };

    if (existing) {
      Object.assign(existing, patch, { credit });
      existing.history.unshift({
        t: "Partner updated",
        d: "แก้ไขข้อมูลคู่ค้าจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      BUSINESS_PARTNERS.push({
        code,
        ...patch,
        credit,
        txn: { so: [], po: [], inv: [] },
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: "Partner created",
            d: "สร้างคู่ค้าเข้าระบบจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as BpRow);
    }

    decorateBPs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "สร้างคู่ค้าแล้ว",
      message: `${code} — ${patch.nameTh}`,
      goto: `/m/business-partner/${encodeURIComponent(code)}`,
    });
  },
};
