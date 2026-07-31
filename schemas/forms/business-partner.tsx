import {
  BP_ROLE_DEFS,
  BP_STATUS,
  BP_TYPES,
  PAY_TERMS,
  PROVINCES,
  SALES_REPS,
} from "@/data/partners";
import { PO_CURRENCIES, PO_INCOTERMS, PO_BUYERS } from "@/data/purchase-orders";
import {
  BUSINESS_PARTNERS,
  decorateBPs,
  nextBPCode,
  validEmail,
  validPhone,
  validThaiTaxId,
  validZip,
  type BpRow,
} from "@/lib/domain/partner";
import { money0, stamp, toDisplayDate, toInputDate } from "@/lib/format";
import { checkPermission } from "@/lib/permissions";
import type { FormSchema, GridRow } from "@/lib/types";
import { FORM_USER, RailCard, RailRow, isCreate, opts, saved } from "./common";

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
const CUST_GROUPS = ["คลินิกทั่วไป", "คลินิกเฉพาะทาง", "โรงพยาบาล", "ตัวแทนจำหน่าย", "หน่วยงานราชการ", "มหาวิทยาลัย"];
const SUP_GROUPS = ["วัสดุสิ้นเปลือง", "เครื่องมือแพทย์", "อะไหล่", "บริการ", "ขนส่ง"];
const INDUSTRIES = ["บริการทางการแพทย์", "ค้าส่ง-ค้าปลีก", "การผลิต", "การศึกษา", "ราชการ", "อื่น ๆ"];
const CUST_LEVELS = ["Platinum", "Gold", "Silver", "Bronze", "New"];
const PRICE_GROUPS = ["Retail", "Dealer", "Government", "Chain Clinic", "Contract"];
const TERRITORIES = ["กรุงเทพฯ-ปริมณฑล", "ภาคกลาง", "ภาคเหนือ", "ภาคอีสาน", "ภาคใต้", "ภาคตะวันออก"];
const CHANNELS = ["Direct Sales", "Dealer", "Online", "Government", "Export"];
const ADDRESS_TYPES = ["Registered Address", "Billing Address", "Shipping Address", "Other"];
const CONTACT_METHODS = ["โทรศัพท์", "อีเมล", "LINE", "แฟกซ์"];
const CREDIT_CONTROL = ["ไม่ควบคุม", "เตือนเมื่อเกินวงเงิน", "ระงับเมื่อเกินวงเงิน"];
const ACC_TYPES = ["ออมทรัพย์", "กระแสรายวัน", "ฝากประจำ"];
const BANKS = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรีอยุธยา", "ทหารไทยธนชาต"];
const RATINGS = ["A - ดีเยี่ยม", "B - ดี", "C - พอใช้", "D - ต้องปรับปรุง"];

const isCustomer = (s: { roles?: Record<string, boolean> }) =>
  Boolean(s.roles?.customer || s.roles?.dealer);
const isSupplier = (s: { roles?: Record<string, boolean> }) => Boolean(s.roles?.supplier);

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
    logo: "🏢",
    nameTh: "",
    nameEn: "",
    trade: "",
    type: "Company",
    website: "",
    status: "Active",
    notes: "",
    roles: { customer: false, supplier: false, dealer: false, prospect: false, other: false },
    cls: {
      custGroup: "",
      supGroup: "",
      industry: "",
      bizType: "นิติบุคคล",
      custLevel: "New",
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
    roles: { ...b.roles },
    cls: { ...b.cls },
    tax: { ...b.tax, vatDate: toInputDate(b.tax?.vatDate) },
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
            { type: "image", path: "logo", label: "Logo", span: true },
            {
              type: "static",
              path: "code",
              label: "Partner Code",
              hint: "ระบบออกรหัสให้อัตโนมัติ — บทบาทไม่ถูกเข้ารหัสไว้ในรหัสคู่ค้า",
              when: (s) => !checkPermission("canSetBPCode") || !isCreate(s),
            },
            {
              type: "text",
              path: "code",
              label: "Partner Code",
              required: true,
              when: (s) => checkPermission("canSetBPCode") && isCreate(s),
            },
            {
              type: "select",
              path: "status",
              label: "Status",
              required: true,
              options: opts(BP_STATUS),
            },
            {
              type: "text",
              path: "nameTh",
              label: "ชื่อภาษาไทย",
              required: true,
              span: true,
              placeholder: "บริษัท เดนทัล สมายล์ จำกัด",
            },
            { type: "text", path: "nameEn", label: "English Name" },
            { type: "text", path: "trade", label: "Trade Name", placeholder: "Dental Smile" },
            {
              type: "select",
              path: "type",
              label: "Partner Type",
              required: true,
              options: opts(BP_TYPES),
            },
            { type: "text", path: "website", label: "Website", placeholder: "www.example.co.th" },
            { type: "textarea", path: "notes", label: "Notes", span: true, rows: 2 },
          ],
        },
      ],
    },

    /* ---------- 2. ROLES ---------- */
    {
      key: "roles",
      label: "Roles",
      railLabel: "บทบาท",
      labelTh: "ลูกค้า / ผู้ขาย / ตัวแทน",
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
      ],
    },

    /* ---------- 3. CLASSIFICATION ---------- */
    {
      key: "classification",
      label: "Classification",
      railLabel: "การจัดกลุ่ม",
      labelTh: "กลุ่มและเขตการขาย",
      blocks: () => [
        {
          type: "card",
          title: "Grouping",
          cols: "2",
          fields: [
            {
              type: "select",
              path: "cls.custGroup",
              label: "Customer Group",
              options: CUST_GROUPS,
              when: isCustomer,
            },
            {
              type: "select",
              path: "cls.supGroup",
              label: "Supplier Group",
              options: SUP_GROUPS,
              when: isSupplier,
            },
            { type: "select", path: "cls.industry", label: "Industry", options: INDUSTRIES },
            {
              type: "select",
              path: "cls.custLevel",
              label: "Customer Level",
              options: CUST_LEVELS,
              when: isCustomer,
            },
            {
              type: "select",
              path: "cls.priceGroup",
              label: "Price Group",
              options: PRICE_GROUPS,
              when: isCustomer,
            },
            { type: "select", path: "cls.territory", label: "Territory", options: TERRITORIES },
            { type: "select", path: "cls.channel", label: "Sales Channel", options: CHANNELS },
          ],
        },
      ],
    },

    /* ---------- 4. TAX ---------- */
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
            {
              type: "text",
              path: "tax.taxId",
              label: "Tax ID",
              required: true,
              placeholder: "0105560112347",
              hint: "13 หลัก ระบบตรวจสอบหลักตรวจสอบให้อัตโนมัติ",
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
          cols: [
            { key: "prefix", label: "คำนำหน้า", type: "text", width: "80px", placeholder: "คุณ" },
            { key: "first", label: "ชื่อ", type: "text", required: true },
            { key: "last", label: "นามสกุล", type: "text" },
            { key: "pos", label: "ตำแหน่ง", type: "text", muted: true },
            { key: "mobile", label: "มือถือ", type: "text", placeholder: "081-234-5678" },
            { key: "email", label: "อีเมล", type: "text" },
            { key: "method", label: "ช่องทางหลัก", type: "select", options: CONTACT_METHODS },
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
          empty: "ยังไม่มีที่อยู่ — ต้องมีอย่างน้อย 1 แห่ง",
          cols: [
            { key: "name", label: "ชื่อเรียก", type: "text", required: true, placeholder: "สำนักงานใหญ่" },
            { key: "type", label: "ประเภท", type: "select", options: ADDRESS_TYPES },
            { key: "l1", label: "ที่อยู่", type: "text", required: true, width: "220px" },
            { key: "sub", label: "แขวง/ตำบล", type: "text" },
            { key: "dist", label: "เขต/อำเภอ", type: "text" },
            { key: "prov", label: "จังหวัด", type: "select", options: opts(PROVINCES) },
            { key: "zip", label: "รหัสไปรษณีย์", type: "text", width: "110px" },
            { key: "primary", label: "หลัก", type: "radio", width: "56px" },
            { key: "active", label: "ใช้งาน", type: "check", width: "56px" },
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
            { type: "select", path: "sales.territory", label: "Territory", options: TERRITORIES },
            { type: "select", path: "sales.channel", label: "Sales Channel", options: CHANNELS },
            { type: "text", path: "sales.priceList", label: "Price List", placeholder: "Retail 2569" },
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
            {
              type: "select",
              path: "purchasing.buyer",
              label: "Buyer",
              required: true,
              options: opts(PO_BUYERS),
            },
            { type: "select", path: "purchasing.supGroup", label: "Supplier Group", options: SUP_GROUPS },
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
          hint: "เลขบัญชีจะถูกปิดบังบางส่วนสำหรับผู้ที่ไม่มีสิทธิ์ดู",
          cols: [
            { key: "bank", label: "ธนาคาร", type: "select", options: BANKS, required: true },
            { key: "branch", label: "สาขา", type: "text" },
            { key: "accName", label: "ชื่อบัญชี", type: "text", width: "200px" },
            { key: "accNo", label: "เลขที่บัญชี", type: "text", required: true },
            { key: "accType", label: "ประเภท", type: "select", options: ACC_TYPES },
            { key: "def", label: "หลัก", type: "radio", width: "56px" },
            { key: "active", label: "ใช้งาน", type: "check", width: "56px" },
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
    { path: "tax.taxId", label: "Tax ID", step: "tax" },
    {
      path: "contacts",
      label: "ผู้ติดต่ออย่างน้อย 1 คน",
      step: "contacts",
      test: (s) => ((s.contacts ?? []) as GridRow[]).some((c) => String(c.first ?? "").trim()),
    },
    {
      path: "addresses",
      label: "ที่อยู่อย่างน้อย 1 แห่ง",
      step: "addresses",
      test: (s) => ((s.addresses ?? []) as GridRow[]).some((a) => String(a.l1 ?? "").trim()),
    },
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
      label: "ต้องเลือกที่อยู่หลัก 1 แห่ง",
      step: "addresses",
      test: (s) => {
        const rows = (s.addresses ?? []) as GridRow[];
        return rows.length === 0 || rows.filter((a) => a.primary).length === 1;
      },
    },
    {
      label: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก",
      step: "addresses",
      test: (s) => ((s.addresses ?? []) as GridRow[]).every((a) => validZip(String(a.zip ?? ""))),
    },
    {
      label: "วงเงินเครดิตต้องไม่ติดลบ",
      step: "finance",
      test: (s) => num(s.credit?.limit) >= 0,
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
          type: "Registered Address",
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
          def: false,
          active: true,
        };
      default:
        return {};
    }
  },

  /* The first contact and address added are the primary ones by default. */
  onGridChange: (path, s) => {
    if (path !== "contacts" && path !== "addresses" && path !== "banks") return;
    const flag = path === "banks" ? "def" : "primary";
    const rows = (s[path] ?? []) as GridRow[];
    if (rows.length && !rows.some((r) => r[flag])) rows[0][flag] = true;
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

  sidePanel: (s) => {
    const roles = BP_ROLE_DEFS.filter((r) => s.roles?.[r.key]).map((r) => r.label);
    const limit = num(s.credit?.limit);

    return (
      <RailCard icon="partner" title="Partner Summary">
        <RailRow label="บทบาท" value={roles.length ? roles.join(", ") : "ยังไม่ได้เลือก"} />
        <RailRow label="ผู้ติดต่อ" value={`${((s.contacts ?? []) as GridRow[]).length} คน`} />
        <RailRow label="ที่อยู่" value={`${((s.addresses ?? []) as GridRow[]).length} แห่ง`} />
        {checkPermission("canViewCredit") && (
          <RailRow
            label="วงเงินเครดิต"
            value={limit ? money0(limit) : "ไม่ให้เครดิต"}
            tone={limit ? "ok" : undefined}
          />
        )}
        <RailRow
          label="เลขผู้เสียภาษี"
          value={
            s.tax?.taxId
              ? validThaiTaxId(String(s.tax.taxId))
                ? "ถูกต้อง"
                : "ไม่ถูกต้อง"
              : "ยังไม่ระบุ"
          }
          tone={
            s.tax?.taxId ? (validThaiTaxId(String(s.tax.taxId)) ? "ok" : "danger") : undefined
          }
        />
      </RailCard>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = BUSINESS_PARTNERS.find((b) => b.code === code);

    const patch = {
      logo: String(s.logo ?? "🏢"),
      nameTh: String(s.nameTh ?? "").trim(),
      nameEn: String(s.nameEn ?? ""),
      trade: String(s.trade ?? ""),
      type: String(s.type ?? "Company"),
      website: String(s.website ?? ""),
      status: String(s.status ?? "Active"),
      notes: String(s.notes ?? ""),
      roles: { ...(s.roles ?? {}) },
      cls: { ...(s.cls ?? {}) },
      tax: { ...(s.tax ?? {}), vatDate: toDisplayDate(s.tax?.vatDate) },
      contacts: ((s.contacts ?? []) as GridRow[]).map((c, i) => ({
        ...c,
        code: c.code || `CT${String(i + 1).padStart(3, "0")}`,
      })),
      addresses: ((s.addresses ?? []) as GridRow[]).map((a) => ({ ...a })),
      sales: isCustomer(s) ? { ...(s.sales ?? {}) } : null,
      purchasing: isSupplier(s) ? { ...(s.purchasing ?? {}) } : null,
      banks: ((s.banks ?? []) as GridRow[]).map((k) => ({ ...k })),
      updated: now,
      updatedBy: FORM_USER,
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
      approvedBy: existing?.credit?.approvedBy ?? FORM_USER,
      approvalDate: existing?.credit?.approvalDate ?? now.split(" ")[0],
    };

    if (existing) {
      Object.assign(existing, patch, { credit });
      existing.history.unshift({
        t: "Partner updated",
        d: "แก้ไขข้อมูลคู่ค้าจากฟอร์ม",
        u: FORM_USER,
        when: now,
        kind: "primary",
      });
    } else {
      BUSINESS_PARTNERS.push({
        code,
        ...patch,
        credit,
        docs: [],
        txn: { so: [], po: [], inv: [] },
        created: now,
        createdBy: FORM_USER,
        history: [
          {
            t: "Partner created",
            d: "สร้างคู่ค้าเข้าระบบจากฟอร์ม",
            u: FORM_USER,
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
