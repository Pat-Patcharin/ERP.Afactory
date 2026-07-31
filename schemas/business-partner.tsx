import {
  BUSINESS_PARTNERS,
  decorateBPs,
  validThaiTaxId,
  type BpRow,
} from "@/lib/domain/partner";
import { BP_ROLE_DEFS, BP_STATUS, BP_TYPES, CREDIT_STATUS, SALES_REPS } from "@/data/partners";
import { BP_TONE, CREDIT_TONE, tone } from "@/lib/badges";
import { DASH, daysUntil, fmt, money0 } from "@/lib/format";
import { checkPermission, maskAccount } from "@/lib/permissions";
import type { BadgeTone, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { BP_FORM } from "./forms/business-partner";

/* ============================================================
   BUSINESS PARTNER
   One legal entity = one record. Roles are flags on that record,
   never separate Customer / Supplier rows.
   ============================================================ */

const roleBadges = (bp: BpRow) =>
  bp.roleList.length ? (
    <span className="inline-flex flex-wrap gap-1">
      {bp.roleList.map((r) => (
        <Badge key={r.key} tone={(r.badge.replace("badge--", "") as BadgeTone) ?? "neutral"}>
          {r.label}
        </Badge>
      ))}
    </span>
  ) : (
    <span className="text-ink-2">{DASH}</span>
  );

export const BP_LIST: ListSchema<BpRow> = {
  key: "business-partner",
  entity: "Business Partner",
  entityPlural: "Business Partners",
  title: "Business Partner Master",
  subtitle:
    "จัดการลูกค้า ผู้ขายสินค้า ตัวแทนจำหน่าย และผู้ค้าอื่นในฐานข้อมูลเดียว",
  crumb: "Business Partner",
  primaryLabel: "Create Business Partner",
  searchPlaceholder: "ค้นหารหัส ชื่อ เลขผู้เสียภาษี ผู้ติดต่อ โทรศัพท์ หรืออีเมล...",
  emptyTitle: "ไม่พบผู้ค้าที่ตรงกับเงื่อนไข",

  source: () => BUSINESS_PARTNERS,
  searchFields: ["code", "nameTh", "nameEn", "trade", "taxId", "contactName", "phone", "email"],

  tabs: [
    { key: "all", label: "All" },
    { key: "cust", label: "Customers", test: (b) => b.roles.customer },
    { key: "sup", label: "Suppliers", test: (b) => b.roles.supplier },
    {
      key: "both",
      label: "Customer & Supplier",
      test: (b) => b.roles.customer && b.roles.supplier,
    },
    { key: "dealer", label: "Dealers", test: (b) => b.roles.dealer },
    { key: "inactive", label: "Inactive", test: (b) => b.status !== "Active" },
  ],

  filters: [
    {
      id: "role",
      label: "BP Role",
      options: () => BP_ROLE_DEFS.map((r) => r.label),
      test: (b, v) => {
        const d = BP_ROLE_DEFS.find((r) => r.label === v);
        return Boolean(d && b.roles[d.key as keyof typeof b.roles]);
      },
    },
    { id: "type", label: "BP Type", options: () => [...BP_TYPES], test: (b, v) => b.type === v },
    { id: "status", label: "Status", options: () => [...BP_STATUS], test: (b, v) => b.status === v },
    {
      id: "province",
      label: "Province",
      options: () =>
        [...new Set(BUSINESS_PARTNERS.map((b) => b.province))].filter((p) => p !== DASH),
      test: (b, v) => b.province === v,
    },
    { id: "rep", label: "Sales Rep", options: () => [...SALES_REPS], test: (b, v) => b.salesRep === v },
    {
      id: "credit",
      label: "Credit Status",
      options: () => [...CREDIT_STATUS],
      test: (b, v) => b.creditStatus === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "BP Code",
      sortable: true,
      cell: (b) => (
        <CellMedia>
          <Thumb>{b.logo}</Thumb>
          <span className="font-medium">{b.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "nameTh",
      label: "Business Partner Name",
      sortable: true,
      cell: (b) => (
        <>
          {b.nameTh}
          {b.nameEn && <CellSub>{b.nameEn}</CellSub>}
        </>
      ),
    },
    { key: "type", label: "BP Type", muted: true, cell: (b) => b.type },
    { key: "roles", label: "Roles", cell: roleBadges },
    {
      key: "taxId",
      label: "Tax ID",
      muted: true,
      cell: (b) => <span className="tnum">{b.taxId || DASH}</span>,
    },
    { key: "contactName", label: "Primary Contact", muted: true, cell: (b) => b.contactName },
    {
      key: "phone",
      label: "Phone",
      muted: true,
      cell: (b) => <span className="tnum">{b.phone}</span>,
    },
    { key: "province", label: "Province", muted: true, cell: (b) => b.province },
    {
      key: "creditStatus",
      label: "Credit Status",
      cell: (b) => <Badge tone={tone(CREDIT_TONE, b.creditStatus)}>{b.creditStatus}</Badge>,
    },
    {
      key: "status",
      label: "Status",
      cell: (b) => <Badge tone={tone(BP_TONE, b.status)}>{b.status}</Badge>,
    },
    {
      key: "updated",
      label: "Last Updated",
      muted: true,
      sortable: true,
      cell: (b) => b.updated.split(" ")[0],
    },
  ],

  rowActions: (bp, ctx) => {
    const setStatus = (r: BpRow, st: string, msg: string, t?: "info" | "danger") => {
      r.status = st;
      decorateBPs();
      ctx.refresh();
      ctx.toast(msg, `${r.code} — ${r.nameTh}`, t);
    };
    return [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("business-partner", r) },
      { label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/business-partner/${r.code}/edit`) },
      {
        label: "Duplicate",
        icon: "copy",
        run: (r) => ctx.toast("ทำสำเนาผู้ค้า", `${r.code} — Future support`, "info"),
      },
      { sep: true },
      bp.status === "Active"
        ? {
            label: "Deactivate",
            icon: "circleSlash",
            run: (r) => setStatus(r, "Inactive", "ปิดใช้งานแล้ว", "info"),
          }
        : {
            label: "Activate",
            icon: "checkCircle",
            run: (r) => setStatus(r, "Active", "เปิดใช้งานแล้ว"),
          },
      {
        label: "Put On Hold",
        icon: "clock",
        run: (r) => setStatus(r, "On Hold", "พักการทำธุรกรรมแล้ว", "info"),
      },
      {
        label: "Block",
        icon: "circleSlash",
        run: (r) =>
          ctx.confirm({
            title: "Block this business partner?",
            message: (
              <>
                <strong>{r.code}</strong> — {r.nameTh} จะถูกระงับการทำธุรกรรมทั้งหมด
              </>
            ),
            confirmText: "Block partner",
            onConfirm: () => setStatus(r, "Blocked", "ระงับผู้ค้าแล้ว", "danger"),
          }),
      },
      { sep: true },
      {
        label: "Transaction History",
        icon: "invoice",
        run: (r) => ctx.goto(`/m/business-partner/${r.code}`),
      },
      {
        label: "Delete",
        icon: "trash",
        danger: true,
        // Records with transactions are never hard-deleted.
        disabled: bp.txnCount > 0,
        disabledReason: `มีธุรกรรมอ้างอิงอยู่ ${bp.txnCount} รายการ — ใช้ Deactivate แทน`,
        run: (r) =>
          ctx.confirm({
            title: "Delete this business partner?",
            message: (
              <>
                <strong>{r.code}</strong> — {r.nameTh} จะถูกลบถาวร
              </>
            ),
            confirmText: "Delete partner",
            onConfirm: () => {
              const i = BUSINESS_PARTNERS.indexOf(r);
              if (i > -1) BUSINESS_PARTNERS.splice(i, 1);
              decorateBPs();
              ctx.refresh();
              ctx.toast("ลบผู้ค้าแล้ว", `${r.code} — ${r.nameTh}`, "danger");
            },
          }),
      },
    ];
  },
};

export const BP_DETAIL: DetailSchema<BpRow> = {
  key: "business-partner",
  entityLabel: "Business Partner",

  identity: (b) => ({
    image: b.logo,
    code: b.code,
    title: b.nameTh,
    copyFields: [
      { label: "BP code", value: b.code },
      { label: "Tax ID", value: b.taxId },
    ],
    badges: [
      { text: b.status, tone: tone(BP_TONE, b.status) },
      ...b.roleList.map((r) => ({
        text: r.label,
        tone: (r.badge.replace("badge--", "") as BadgeTone) ?? "neutral",
      })),
    ],
    tags: [b.type, b.nameEn || b.trade || "", b.province].filter(Boolean),
  }),

  kpis: (b) => [
    {
      icon: "tag",
      label: "Credit Limit",
      value: checkPermission("canViewCredit") ? money0(b.credit.limit) : "••••",
      sub: "THB",
      goTab: "credit",
    },
    {
      icon: "cart",
      label: "Outstanding",
      value: checkPermission("canViewCredit") ? money0(b.credit.outstanding) : "••••",
      sub: "THB",
      goTab: "credit",
    },
    {
      icon: "shield",
      label: "Credit Status",
      value: b.credit.status,
      sub: b.credit.payTerm,
      goTab: "credit",
    },
    {
      icon: "truck",
      label: "Sales Rep",
      value: b.salesRep,
      sub: b.province,
      wide: true,
      goTab: "sales",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (b) => [
        {
          type: "fields",
          title: "General Information",
          cols: 2,
          items: [
            { label: "BP Code", value: b.code },
            { label: "Status", value: <Badge tone={tone(BP_TONE, b.status)}>{b.status}</Badge> },
            { label: "ชื่อภาษาไทย", value: b.nameTh },
            { label: "English Name", value: b.nameEn },
            { label: "Trade Name", value: b.trade || DASH },
            { label: "BP Type", value: b.type },
            { label: "Roles", value: roleBadges(b) },
            { label: "Website", value: b.website || DASH },
          ],
        },
        { type: "note", title: "Notes", text: b.notes || DASH },
        {
          type: "fields",
          title: "System Information",
          cols: 2,
          items: [
            { label: "Created Date", value: b.created, muted: true },
            { label: "Created By", value: b.createdBy, muted: true },
            { label: "Last Updated", value: b.updated, muted: true },
            { label: "Updated By", value: b.updatedBy, muted: true },
          ],
        },
      ],
    },

    {
      key: "roles",
      label: "Roles & Classification",
      blocks: (b) => [
        {
          type: "fields",
          title: "Roles",
          cols: 2,
          items: BP_ROLE_DEFS.map((r) => ({
            label: r.label,
            value: b.roles[r.key as keyof typeof b.roles] ? (
              <Badge tone={(r.badge.replace("badge--", "") as BadgeTone) ?? "neutral"}>
                เปิดใช้งาน
              </Badge>
            ) : (
              <span className="text-ink-2">ไม่ได้ใช้</span>
            ),
          })),
        },
        {
          type: "fields",
          title: "Classification",
          cols: 2,
          items: [
            { label: "Customer Group", value: b.cls.custGroup || DASH },
            { label: "Supplier Group", value: b.cls.supGroup || DASH },
            { label: "Industry", value: b.cls.industry },
            { label: "Business Type", value: b.cls.bizType },
            { label: "Customer Level", value: b.cls.custLevel || DASH },
            { label: "Price Group", value: b.cls.priceGroup || DASH },
            { label: "Territory", value: b.cls.territory || DASH },
            { label: "Sales Channel", value: b.cls.channel || DASH },
          ],
        },
      ],
    },

    {
      key: "tax",
      label: "Tax & Legal",
      blocks: (b) => {
        const t = b.tax;
        const ok = validThaiTaxId(t.taxId);
        return [
          !ok &&
            Boolean(t.taxId) && {
              type: "alert",
              tone: "warn",
              title: "เลขประจำตัวผู้เสียภาษีไม่ผ่านการตรวจสอบ",
              message: `${t.taxId} — ตรวจสอบเลข 13 หลักและหลักตรวจสอบอีกครั้ง`,
            },
          {
            type: "fields",
            title: "Tax Information",
            cols: 2,
            items: [
              { label: "Legal Entity Type", value: t.entity },
              {
                label: "Tax ID",
                value: (
                  <>
                    <span className="tnum">{t.taxId}</span>
                    {ok && <span className="ml-1 text-success-text">✓</span>}
                  </>
                ),
              },
              { label: "Branch Type", value: t.branchType },
              { label: "Branch Number", value: t.branchNo },
              { label: "Registered Company Name", value: t.regName, span: true },
              { label: "VAT Registered", value: t.vatReg ? "ใช่" : "ไม่ใช่" },
              { label: "VAT Registration Date", value: t.vatDate || DASH },
              { label: "Withholding Tax", value: t.wht ? "มีการหัก ณ ที่จ่าย" : "ไม่มี" },
              { label: "Company Registration No.", value: t.regNo || DASH },
              { label: "Country of Registration", value: t.country },
            ],
          },
        ];
      },
    },

    {
      key: "contacts",
      label: "Contacts",
      blocks: (b) => [
        {
          type: "table",
          title: `Contact Persons (${b.contacts.length})`,
          rows: b.contacts,
          empty: "ยังไม่มีผู้ติดต่อ",
          cols: [
            { key: "code", label: "Code", muted: true },
            {
              key: "name",
              label: "Name",
              cell: (c) => (
                <>
                  {c.prefix}
                  {c.first} {c.last}
                  {c.primary && (
                    <span className="ml-1.5">
                      <Badge tone="info">Primary</Badge>
                    </span>
                  )}
                </>
              ),
            },
            { key: "pos", label: "Position", muted: true },
            { key: "dept", label: "Department", muted: true },
            {
              key: "mobile",
              label: "Mobile",
              cell: (c) => <span className="tnum">{c.mobile || DASH}</span>,
            },
            { key: "email", label: "Email", muted: true },
            { key: "method", label: "Preferred", muted: true },
            {
              key: "active",
              label: "Status",
              cell: (c) => (
                <Badge tone={c.active ? "success" : "neutral"}>
                  {c.active ? "Active" : "Inactive"}
                </Badge>
              ),
            },
          ],
        },
      ],
    },

    {
      key: "addresses",
      label: "Addresses",
      blocks: (b) => [
        {
          type: "table",
          title: `Addresses (${b.addresses.length})`,
          rows: b.addresses,
          empty: "ยังไม่มีที่อยู่",
          cols: [
            {
              key: "name",
              label: "Address Name",
              cell: (a) => (
                <>
                  {a.name}
                  {a.primary && (
                    <span className="ml-1.5">
                      <Badge tone="info">Primary</Badge>
                    </span>
                  )}
                </>
              ),
            },
            { key: "type", label: "Type", cell: (a) => <Badge tone="neutral">{a.type}</Badge> },
            {
              key: "full",
              label: "Address",
              cell: (a) => `${a.l1}${a.l2 ? " " + a.l2 : ""} ${a.sub} ${a.dist}`,
            },
            { key: "prov", label: "Province", muted: true },
            { key: "zip", label: "Postal Code", muted: true },
            { key: "contact", label: "Contact", muted: true },
          ],
        },
      ],
    },

    {
      key: "sales",
      label: "Sales Info",
      when: (b) => b.roles.customer || b.roles.dealer,
      blocks: (b) => {
        const s = b.sales;
        if (!s)
          return [
            {
              type: "empty",
              heading: "ยังไม่มีข้อมูลการขาย",
              message: "เปิดบทบาท Customer หรือ Dealer เพื่อกำหนดข้อมูลนี้",
            },
          ];
        return [
          {
            type: "fields",
            title: "Sales Ownership",
            cols: 2,
            items: [
              { label: "Sales Representative", value: s.rep },
              { label: "Sales Team", value: s.team },
              { label: "Territory", value: s.territory },
              { label: "Sales Channel", value: s.channel },
              { label: "Customer Group", value: s.custGroup },
              { label: "Price List", value: s.priceList },
              { label: "Discount Group", value: s.discGroup || DASH },
              { label: "Delivery Method", value: s.delivery },
            ],
          },
          {
            type: "fields",
            title: "Order Rules",
            cols: 2,
            items: [
              { label: "Minimum Order Amount", value: `${money0(s.minOrder)} THB` },
              { label: "Tax Invoice Required", value: s.taxInvoice ? "ใช่" : "ไม่ใช่" },
              { label: "Purchase Order Required", value: s.poRequired ? "ใช่" : "ไม่ใช่" },
              { label: "Default Shipping Address", value: s.shipTo },
              { label: "Default Billing Address", value: s.billTo },
            ],
          },
        ];
      },
    },

    {
      key: "purchasing",
      label: "Purchasing Info",
      when: (b) => b.roles.supplier,
      blocks: (b) => {
        const p = b.purchasing;
        if (!p)
          return [
            {
              type: "empty",
              heading: "ยังไม่มีข้อมูลการจัดซื้อ",
              message: "เปิดบทบาท Supplier เพื่อกำหนดข้อมูลนี้",
            },
          ];
        return [
          {
            type: "fields",
            title: "Purchasing Terms",
            cols: 2,
            items: [
              { label: "Buyer / Purchasing Owner", value: p.buyer },
              { label: "Supplier Group", value: p.supGroup },
              { label: "Currency", value: p.currency },
              { label: "Payment Term", value: p.payTerm },
              { label: "Lead Time", value: p.lead },
              { label: "Minimum Order Value", value: `${money0(p.minValue)} ${p.currency}` },
              { label: "Default Purchase Unit", value: p.punit },
              { label: "Incoterm", value: p.incoterm },
              { label: "Delivery Method", value: p.delivery },
              { label: "Supplier Rating", value: <Badge tone="success">{p.rating}</Badge> },
              { label: "Preferred Supplier", value: p.preferred ? "ใช่" : "ไม่ใช่" },
              { label: "Withholding Tax Type", value: p.wht },
              { label: "Default Receiving Warehouse", value: p.warehouse },
            ],
          },
        ];
      },
    },

    {
      key: "credit",
      label: "Credit & Payment",
      blocks: (b) => {
        const c = b.credit;
        if (!checkPermission("canViewCredit")) return [{ type: "restricted" }];
        const over = c.available < 0;
        return [
          over && {
            type: "alert",
            tone: "danger",
            title: "ยอดค้างชำระเกินวงเงินเครดิต",
            message: `เกินวงเงิน ${money0(Math.abs(c.available))} THB${
              c.holdReason ? ` — ${c.holdReason}` : ""
            }`,
          },
          {
            type: "cards",
            title: "Credit Summary",
            items: [
              { label: "Credit Limit", value: money0(c.limit), unit: "THB", tone: "accent" },
              { label: "Outstanding Balance", value: money0(c.outstanding), unit: "THB" },
              {
                label: "Available Credit",
                value: money0(c.available),
                unit: "THB",
                tone: over ? "warn" : undefined,
              },
              { label: "Credit Status", value: c.status },
            ],
          },
          {
            type: "fields",
            title: "Terms",
            cols: 2,
            items: [
              { label: "Payment Term", value: c.payTerm },
              { label: "Credit Days", value: `${c.days} วัน` },
              { label: "Open Sales Orders", value: `${money0(c.openSO)} THB` },
              { label: "Open Invoices", value: `${money0(c.openInv)} THB` },
              { label: "Credit Hold Reason", value: c.holdReason || DASH },
              { label: "Credit Hold Date", value: c.holdDate || DASH },
              { label: "Approved By", value: c.approvedBy || DASH },
              { label: "Approval Date", value: c.approvalDate || DASH },
            ],
          },
        ];
      },
    },

    {
      key: "banks",
      label: "Bank Accounts",
      blocks: (b) => [
        !checkPermission("canViewBank") && {
          type: "alert",
          tone: "warn",
          title: "ข้อมูลบัญชีธนาคารถูกปกปิดบางส่วน",
          message: "เลขบัญชีถูกปกปิดตามสิทธิ์ — ต้องมีสิทธิ์ Finance จึงจะเห็นข้อมูลเต็ม",
        },
        {
          type: "table",
          title: `Bank Accounts (${b.banks.length})`,
          rows: b.banks,
          empty: "ยังไม่มีบัญชีธนาคาร",
          cols: [
            { key: "bank", label: "Bank" },
            { key: "branch", label: "Branch", muted: true },
            { key: "accName", label: "Account Name" },
            {
              key: "accNo",
              label: "Account Number",
              cell: (a) => <span className="tnum">{maskAccount(a.accNo)}</span>,
            },
            { key: "accType", label: "Type", muted: true },
            { key: "currency", label: "Currency", muted: true },
            {
              key: "def",
              label: "Default",
              cell: (a) =>
                a.def ? <Badge tone="info">Default</Badge> : <span className="text-ink-2">{DASH}</span>,
            },
          ],
        },
      ],
    },

    {
      key: "documents",
      label: "Documents",
      blocks: (b) => {
        const soon = b.docs.filter((d) => {
          const dd = daysUntil(d.expiry);
          return dd !== null && dd <= 90;
        });
        return [
          soon.length > 0 && {
            type: "alert",
            tone: "warn",
            title: "เอกสารใกล้หมดอายุ",
            message: `${soon.length} ฉบับจะหมดอายุภายใน 90 วัน: ${soon
              .map((d) => d.name)
              .join(", ")}`,
          },
          {
            type: "table",
            title: `Documents (${b.docs.length})`,
            rows: b.docs,
            empty: "ยังไม่มีเอกสารแนบ",
            cols: [
              { key: "type", label: "Document Type", cell: (d) => <Badge tone="neutral">{d.type}</Badge> },
              {
                key: "name",
                label: "File Name",
                cell: (d) => (
                  <span className="inline-flex items-center gap-2">
                    <Icon name="file" size={15} className="text-ink-3" />
                    {d.name}
                  </span>
                ),
              },
              { key: "issue", label: "Issue Date", muted: true },
              {
                key: "expiry",
                label: "Expiry Date",
                cell: (d) => {
                  const dd = daysUntil(d.expiry);
                  return dd !== null && dd <= 90 ? (
                    <span className="font-semibold text-warning-text">{d.expiry}</span>
                  ) : (
                    d.expiry
                  );
                },
              },
              {
                key: "status",
                label: "Status",
                cell: (d) => (
                  <Badge tone={d.status === "Active" ? "success" : "warning"}>{d.status}</Badge>
                ),
              },
              { key: "by", label: "Uploaded By", muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "transactions",
      label: "Transactions",
      blocks: (b) => [
        {
          type: "cards",
          title: "Summary",
          cols: 3,
          items: [
            { label: "Sales Orders", value: fmt(b.txn.so.length), tone: "accent" },
            { label: "Purchase Orders", value: fmt(b.txn.po.length) },
            { label: "Invoices", value: fmt(b.txn.inv.length) },
          ],
        },
        {
          type: "table",
          title: "Sales Orders",
          rows: b.txn.so,
          empty: "ไม่มีใบสั่งขาย",
          cols: [
            { key: "no", label: "SO No." },
            { key: "date", label: "Date", muted: true },
            { key: "amount", label: "Amount", align: "right", cell: (r) => money0(r.amount) },
            { key: "status", label: "Status", cell: (r) => <Badge tone="neutral">{r.status}</Badge> },
          ],
        },
        {
          type: "table",
          title: "Purchase Orders",
          rows: b.txn.po,
          empty: "ไม่มีใบสั่งซื้อ",
          cols: [
            { key: "no", label: "PO No." },
            { key: "date", label: "Date", muted: true },
            { key: "amount", label: "Amount", align: "right", cell: (r) => money0(r.amount) },
            { key: "status", label: "Status", cell: (r) => <Badge tone="neutral">{r.status}</Badge> },
          ],
        },
        {
          type: "table",
          title: "Invoices",
          rows: b.txn.inv,
          empty: "ไม่มีใบแจ้งหนี้",
          cols: [
            { key: "no", label: "Invoice No." },
            { key: "date", label: "Date", muted: true },
            { key: "amount", label: "Amount", align: "right", cell: (r) => money0(r.amount) },
            {
              key: "status",
              label: "Status",
              cell: (r) => (
                <Badge tone={r.status === "Overdue" ? "danger" : "neutral"}>{r.status}</Badge>
              ),
            },
          ],
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (b) => [
        {
          type: "timeline",
          title: "Activity",
          items: b.history.map((e) => ({
            title: e.t,
            detail: e.d,
            user: e.u,
            when: e.when,
            kind: e.kind,
          })),
        },
      ],
    },
  ],
};

export const bpSchemas: EntitySchemas<BpRow> = {
  list: BP_LIST,
  detail: BP_DETAIL,
  form: BP_FORM,
};
