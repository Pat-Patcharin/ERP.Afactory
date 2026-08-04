import {
  SR_AREAS,
  SR_CHANNELS,
  SR_COMM_GROUPS,
  SR_CUST_GROUPS,
  SR_DEPARTMENTS,
  SR_MANAGERS,
  SR_REGIONS,
  SR_STATUS,
  SR_TEAMS,
  SR_TITLES,
} from "@/data/sales-reps";
import { PROVINCES } from "@/data/partners";
import { validEmail, validPhone } from "@/lib/domain/partner";
import {
  SALES_REPRESENTATIVES,
  decorateSRs,
  nextSRCode,
  type SalesRepRow,
} from "@/lib/domain/sales";
import { money0, stamp, toDisplayDate, toInputDate } from "@/lib/format";
import type { FormSchema } from "@/lib/types";
import { FORM_USER, RailCard, RailRow, isCreate, opts, saved } from "./common";

/* ============================================================
   SALES REPRESENTATIVE FORM

   Targets and authority limits sit in their own steps because they
   are approved by a different person from the one who enters the
   personal details.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

const GENDERS = ["ชาย", "หญิง", "ไม่ระบุ"];
const POSITIONS = [
  "Sales Executive",
  "Senior Sales Executive",
  "Key Account Manager",
  "Sales Manager",
  "Area Manager",
];
const PROD_CATS = ["ทุกหมวดหมู่", "Sealant", "Acrylic", "Silicone", "Accessory", "Instrument"];
const WH_ACCESS = ["ทุกคลัง", "WH-BKK", "WH-CNX", "WH-SVC"];

const isResigned = (s: { status?: string }) => s.status === "Resigned";

export const SALES_REP_FORM: FormSchema<SalesRepRow> = {
  key: "sales-rep",
  entityLabel: "Sales Representative",
  titleField: "first",
  saveButton: "Save Sales Rep",
  statusBadge: {
    Active: "success",
    Inactive: "neutral",
    "On Leave": "warning",
    Resigned: "danger",
  },

  blank: () => ({
    _mode: "create",
    code: nextSRCode(),
    empId: "",
    title: "นาย",
    first: "",
    last: "",
    nick: "",
    gender: "ไม่ระบุ",
    birth: "",
    dept: "Sales",
    position: "Sales Executive",
    team: "",
    manager: "",
    status: "Active",
    hireDate: "",
    resignDate: "",
    mobile: "",
    office: "",
    email: "",
    line: "",
    area: "",
    province: "",
    region: "",
    custGroup: "",
    channel: "Direct",
    commGroup: "Standard 3%",
    monthlyTarget: 0,
    quarterTarget: 0,
    annualTarget: 0,
    discountLimit: 5,
    approvalLimit: 0,
    whAccess: "ทุกคลัง",
    prodCat: "ทุกหมวดหมู่",
  }),

  toState: (r) => ({
    _mode: "edit",
    code: r.code,
    empId: r.empId,
    title: r.title,
    first: r.first,
    last: r.last,
    nick: r.nick,
    gender: r.gender,
    birth: toInputDate(r.birth),
    dept: r.dept,
    position: r.position,
    team: r.team,
    manager: r.manager,
    status: r.status,
    hireDate: toInputDate(r.hireDate),
    resignDate: toInputDate(r.resignDate),
    mobile: r.mobile,
    office: r.office,
    email: r.email,
    line: r.line,
    area: r.area,
    province: r.province,
    region: r.region,
    custGroup: r.custGroup,
    channel: r.channel,
    commGroup: r.commGroup,
    monthlyTarget: r.monthlyTarget,
    quarterTarget: r.quarterTarget,
    annualTarget: r.annualTarget,
    discountLimit: r.discountLimit,
    approvalLimit: r.approvalLimit,
    whAccess: r.whAccess,
    prodCat: r.prodCat,
  }),

  steps: [
    /* ---------- 1. PERSONAL ---------- */
    {
      key: "personal",
      label: "Personal",
      railLabel: "ข้อมูลส่วนตัว",
      labelTh: "ชื่อและรหัสพนักงาน",
      blocks: () => [
        {
          type: "card",
          title: "Identity",
          cols: "3",
          fields: [
            {
              type: "static",
              path: "code",
              label: "Sales Rep Code",
              hint: "ระบบออกรหัสให้อัตโนมัติ",
              when: (s) => !isCreate(s),
            },
            {
              type: "text",
              path: "code",
              label: "Sales Rep Code",
              required: true,
              when: isCreate,
            },
            { type: "text", path: "empId", label: "Employee ID", placeholder: "EMP-0125" },
            {
              type: "select",
              path: "status",
              label: "Status",
              required: true,
              options: opts(SR_STATUS),
            },
            { type: "select", path: "title", label: "คำนำหน้า", options: opts(SR_TITLES) },
            { type: "text", path: "first", label: "ชื่อ", required: true },
            { type: "text", path: "last", label: "นามสกุล", required: true },
            { type: "text", path: "nick", label: "ชื่อเล่น" },
            { type: "select", path: "gender", label: "เพศ", options: GENDERS },
            { type: "date", path: "birth", label: "วันเกิด" },
          ],
        },
      ],
    },

    /* ---------- 2. EMPLOYMENT ---------- */
    {
      key: "employment",
      label: "Employment",
      railLabel: "การจ้างงาน",
      labelTh: "แผนก ทีม และผู้บังคับบัญชา",
      blocks: () => [
        {
          type: "card",
          title: "Position",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "dept",
              label: "Department",
              required: true,
              options: opts(SR_DEPARTMENTS),
            },
            { type: "select", path: "position", label: "Position", options: POSITIONS },
            {
              type: "select",
              path: "team",
              label: "Team",
              required: true,
              options: opts(SR_TEAMS),
            },
            { type: "select", path: "manager", label: "Reporting Manager", options: opts(SR_MANAGERS) },
            { type: "date", path: "hireDate", label: "Hire Date", required: true },
            {
              type: "date",
              path: "resignDate",
              label: "Resign Date",
              required: true,
              when: isResigned,
              hint: "จำเป็นเมื่อสถานะเป็น Resigned",
            },
          ],
        },
      ],
    },

    /* ---------- 3. CONTACT ---------- */
    {
      key: "contact",
      label: "Contact",
      railLabel: "การติดต่อ",
      labelTh: "เบอร์โทรและอีเมล",
      blocks: () => [
        {
          type: "card",
          title: "Contact Details",
          cols: "2",
          fields: [
            { type: "text", path: "mobile", label: "Mobile", required: true, placeholder: "081-234-5678" },
            { type: "text", path: "office", label: "Office Phone", placeholder: "02-123-4567" },
            { type: "text", path: "email", label: "Email", placeholder: "name@a-factory.co.th" },
            { type: "text", path: "line", label: "LINE ID" },
          ],
        },
      ],
    },

    /* ---------- 4. TERRITORY ---------- */
    {
      key: "territory",
      label: "Territory",
      railLabel: "เขตการขาย",
      labelTh: "พื้นที่และกลุ่มลูกค้า",
      blocks: () => [
        {
          type: "card",
          title: "Coverage",
          cols: "3",
          fields: [
            {
              type: "select",
              path: "area",
              label: "Sales Area",
              required: true,
              options: opts(SR_AREAS),
            },
            { type: "select", path: "province", label: "Base Province", options: opts(PROVINCES) },
            { type: "select", path: "region", label: "Region", options: opts(SR_REGIONS) },
            { type: "select", path: "custGroup", label: "Customer Group", options: opts(SR_CUST_GROUPS) },
            { type: "select", path: "channel", label: "Sales Channel", options: opts(SR_CHANNELS) },
            { type: "select", path: "prodCat", label: "Product Category", options: PROD_CATS },
          ],
        },
      ],
    },

    /* ---------- 5. TARGETS ---------- */
    {
      key: "targets",
      label: "Targets",
      railLabel: "เป้าการขาย",
      labelTh: "เป้าเดือน ไตรมาส และปี",
      blocks: () => [
        {
          type: "card",
          title: "Sales Targets",
          cols: "3",
          fields: [
            {
              type: "number",
              path: "monthlyTarget",
              label: "Monthly Target",
              required: true,
              min: 0,
            },
            { type: "number", path: "quarterTarget", label: "Quarterly Target", min: 0 },
            { type: "number", path: "annualTarget", label: "Annual Target", min: 0 },
            {
              type: "static",
              label: "เป้าไตรมาสที่คาดจากเป้าเดือน",
              value: (s) => money0(num(s.monthlyTarget) * 3),
              hint: "ใช้เทียบความสมเหตุสมผลของเป้า",
            },
            {
              type: "static",
              label: "เป้าปีที่คาดจากเป้าเดือน",
              value: (s) => money0(num(s.monthlyTarget) * 12),
            },
            {
              type: "select",
              path: "commGroup",
              label: "Commission Group",
              options: opts(SR_COMM_GROUPS),
            },
          ],
        },
      ],
    },

    /* ---------- 6. AUTHORITY ---------- */
    {
      key: "authority",
      label: "Authority",
      railLabel: "อำนาจอนุมัติ",
      labelTh: "ส่วนลดและวงเงิน",
      blocks: () => [
        {
          type: "note",
          label: "อำนาจอนุมัติต้องได้รับการยืนยันจากผู้จัดการฝ่ายขาย",
          text: "ค่าที่ตั้งไว้ที่นี่จะถูกใช้ตรวจสอบทุกใบเสนอราคาและใบสั่งขายที่พนักงานคนนี้เปิด",
        },
        {
          type: "card",
          title: "Approval Limits",
          cols: "3",
          fields: [
            {
              type: "number",
              path: "discountLimit",
              label: "Discount Limit (%)",
              required: true,
              min: 0,
              max: 100,
              step: "0.5",
            },
            { type: "number", path: "approvalLimit", label: "Order Approval Limit", min: 0 },
            { type: "select", path: "whAccess", label: "Warehouse Access", options: WH_ACCESS },
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
    { path: "code", label: "Sales Rep Code", step: "personal" },
    { path: "first", label: "ชื่อ", step: "personal" },
    { path: "last", label: "นามสกุล", step: "personal" },
    { path: "status", label: "Status", step: "personal" },
    { path: "dept", label: "Department", step: "employment" },
    { path: "team", label: "Team", step: "employment" },
    { path: "hireDate", label: "Hire Date", step: "employment" },
    {
      path: "resignDate",
      label: "Resign Date",
      step: "employment",
      /* Only demanded once the rep is actually marked as resigned. */
      test: (s) => !isResigned(s) || Boolean(s.resignDate),
    },
    { path: "mobile", label: "Mobile", step: "contact" },
    { path: "area", label: "Sales Area", step: "territory" },
    { path: "monthlyTarget", label: "Monthly Target", step: "targets" },
    { path: "discountLimit", label: "Discount Limit", step: "authority" },
  ],

  rules: [
    {
      label: "รหัสพนักงานขายต้องไม่ซ้ำ",
      step: "personal",
      test: (s) =>
        !isCreate(s) ||
        !SALES_REPRESENTATIVES.some((r) => r.code === String(s.code ?? "").trim()),
    },
    {
      label: "วันลาออกต้องอยู่หลังวันเริ่มงาน",
      step: "employment",
      test: (s) => !s.resignDate || !s.hireDate || String(s.resignDate) >= String(s.hireDate),
    },
    {
      label: "อีเมลต้องอยู่ในรูปแบบที่ถูกต้อง",
      step: "contact",
      test: (s) => validEmail(String(s.email ?? "")),
    },
    {
      label: "เบอร์มือถือต้องอยู่ในรูปแบบที่ถูกต้อง",
      step: "contact",
      test: (s) => validPhone(String(s.mobile ?? "")),
    },
    {
      label: "เป้าไตรมาสต้องไม่น้อยกว่าเป้าเดือน",
      step: "targets",
      test: (s) => !num(s.quarterTarget) || num(s.quarterTarget) >= num(s.monthlyTarget),
    },
    {
      label: "เป้าปีต้องไม่น้อยกว่าเป้าไตรมาส",
      step: "targets",
      test: (s) => !num(s.annualTarget) || num(s.annualTarget) >= num(s.quarterTarget),
    },
    {
      label: "เพดานส่วนลดต้องอยู่ระหว่าง 0–100%",
      step: "authority",
      test: (s) => num(s.discountLimit) >= 0 && num(s.discountLimit) <= 100,
    },
  ],

  findDuplicates: (s) => {
    const full = `${String(s.first ?? "").trim()} ${String(s.last ?? "").trim()}`.trim();
    const emp = String(s.empId ?? "").trim();
    if (full.length < 4 && !emp) return [];
    return SALES_REPRESENTATIVES.filter(
      (r) =>
        r.code !== s.code &&
        ((emp && r.empId === emp) || (full.length >= 4 && `${r.first} ${r.last}` === full)),
    ).map((r) => ({
      code: r.code,
      name: `${r.first} ${r.last}`,
      why: r.empId === emp ? "รหัสพนักงานซ้ำ" : "ชื่อ-นามสกุลซ้ำ",
    }));
  },

  openDuplicate: (code, ctx) => ctx.openEntity("sales-rep", code),

  sidePanel: (s) => {
    const monthly = num(s.monthlyTarget);
    const annual = num(s.annualTarget);
    const consistent = !annual || annual >= monthly * 6;

    return (
      <RailCard icon="salesRep" title="Target Sanity Check" tone={consistent ? "default" : "warn"}>
        <RailRow label="เป้าเดือน" value={monthly ? money0(monthly) : "—"} />
        <RailRow label="เป้าไตรมาส" value={num(s.quarterTarget) ? money0(s.quarterTarget) : "—"} />
        <RailRow label="เป้าปี" value={annual ? money0(annual) : "—"} />
        <RailRow label="เพดานส่วนลด" value={`${num(s.discountLimit)}%`} />
        <RailRow
          label="วงเงินอนุมัติ"
          value={num(s.approvalLimit) ? money0(s.approvalLimit) : "ไม่จำกัด"}
        />
        {!consistent && (
          <p className="mt-3 text-cap leading-relaxed text-warning-text">
            เป้าปีต่ำกว่า 6 เท่าของเป้าเดือน — ตรวจสอบว่ากรอกหน่วยถูกต้องหรือไม่
          </p>
        )}
      </RailCard>
    );
  },

  save: (s, ctx) => {
    const now = stamp();
    const code = String(s.code ?? "").trim();
    const existing = SALES_REPRESENTATIVES.find((r) => r.code === code);

    const patch = {
      empId: String(s.empId ?? ""),
      title: String(s.title ?? ""),
      first: String(s.first ?? "").trim(),
      last: String(s.last ?? "").trim(),
      nick: String(s.nick ?? ""),
      gender: String(s.gender ?? ""),
      birth: toDisplayDate(s.birth),
      dept: String(s.dept ?? ""),
      position: String(s.position ?? ""),
      team: String(s.team ?? ""),
      manager: String(s.manager ?? ""),
      status: String(s.status ?? "Active"),
      hireDate: toDisplayDate(s.hireDate),
      resignDate: toDisplayDate(s.resignDate),
      mobile: String(s.mobile ?? ""),
      office: String(s.office ?? ""),
      email: String(s.email ?? ""),
      line: String(s.line ?? ""),
      area: String(s.area ?? ""),
      province: String(s.province ?? ""),
      region: String(s.region ?? ""),
      custGroup: String(s.custGroup ?? ""),
      channel: String(s.channel ?? ""),
      commGroup: String(s.commGroup ?? ""),
      monthlyTarget: num(s.monthlyTarget),
      quarterTarget: num(s.quarterTarget),
      annualTarget: num(s.annualTarget),
      discountLimit: num(s.discountLimit),
      approvalLimit: num(s.approvalLimit),
      whAccess: String(s.whAccess ?? ""),
      prodCat: String(s.prodCat ?? ""),
      updated: now,
      updatedBy: FORM_USER(),
    };

    if (existing) {
      Object.assign(existing, patch);
      existing.history.unshift({
        t: "Sales rep updated",
        d: "แก้ไขข้อมูลพนักงานขายจากฟอร์ม",
        u: FORM_USER(),
        when: now,
        kind: "primary",
      });
    } else {
      SALES_REPRESENTATIVES.push({
        code,
        ...patch,
        monthlySales: 0,
        achievement: 0,
        custCount: 0,
        openQuo: 0,
        openOrd: 0,
        collection: 0,
        overdue: 0,
        trend: [0, 0, 0, 0, 0, 0],
        bonus: 0,
        commission: 0,
        customers: [],
        visits: [],
        created: now,
        createdBy: FORM_USER(),
        history: [
          {
            t: "Sales rep created",
            d: "เพิ่มพนักงานขายเข้าระบบจากฟอร์ม",
            u: FORM_USER(),
            when: now,
            kind: "primary",
          },
        ],
      } as unknown as SalesRepRow);
    }

    decorateSRs();
    saved(ctx, {
      title: existing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มพนักงานขายแล้ว",
      message: `${code} — ${patch.first} ${patch.last}`,
      goto: `/m/sales-rep/${encodeURIComponent(code)}`,
    });
  },
};
