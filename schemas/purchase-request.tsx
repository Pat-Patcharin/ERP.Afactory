import {
  PURCHASE_REQUESTS,
  prLineTotal,
  type PrRow,
} from "@/lib/domain/purchase";
import { productStock } from "@/lib/domain/product";
import { PR_DEPARTMENTS, PR_PRIORITY, PR_STATUS } from "@/data/purchase-requests";
import { PR_TONE, PRIORITY_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import {
  prApprove,
  prCancel,
  prConvert,
  prDelete,
  prReject,
  prSubmit,
} from "@/lib/workflows";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, Thumb } from "@/components/ui";

/* ============================================================
   PURCHASE REQUEST — the first transactional document.
   Draft → Pending Approval → Approved → Converted to PO
                            → Rejected
   ============================================================ */

export const PR_LIST: ListSchema<PrRow> = {
  key: "purchase-request",
  entity: "Purchase Request",
  entityPlural: "Purchase Requests",
  title: "Purchase Request",
  subtitle: "จัดการใบขอซื้อ ตั้งแต่ร่างเอกสาร ขออนุมัติ จนแปลงเป็นใบสั่งซื้อ",
  crumb: "Purchase Request",
  primaryLabel: "Create Purchase Request",
  searchPlaceholder: "ค้นหาเลขที่ PR แผนก ผู้ขอซื้อ หรือผู้ขายสินค้า...",
  emptyTitle: "ไม่พบใบขอซื้อที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => PURCHASE_REQUESTS,
  searchFields: ["code", "dept", "requester", "supplier", "note"],

  tabs: [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft", test: (p) => p.status === "Draft" },
    { key: "pending", label: "Pending Approval", test: (p) => p.status === "Pending Approval" },
    { key: "approved", label: "Approved", test: (p) => p.status === "Approved" },
    { key: "converted", label: "Converted to PO", test: (p) => p.status === "Converted" },
    { key: "rejected", label: "Rejected", test: (p) => p.status === "Rejected" },
  ],

  filters: [
    { id: "status", label: "Status", options: () => [...PR_STATUS], test: (p, v) => p.status === v },
    { id: "dept", label: "Department", options: () => [...PR_DEPARTMENTS], test: (p, v) => p.dept === v },
    { id: "priority", label: "Priority", options: () => [...PR_PRIORITY], test: (p, v) => p.priority === v },
    {
      id: "requester",
      label: "Requester",
      options: () => [...new Set(PURCHASE_REQUESTS.map((p) => p.requester))],
      test: (p, v) => p.requester === v,
    },
  ],

  columns: [
    {
      key: "code",
      label: "PR Number",
      sortable: true,
      cell: (p) => (
        <CellMedia>
          <Thumb>{p.icon}</Thumb>
          <span className="font-medium">{p.code}</span>
        </CellMedia>
      ),
    },
    { key: "dept", label: "Department", muted: true, cell: (p) => p.dept },
    { key: "requester", label: "Requester", cell: (p) => p.requester },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      cell: (p) => <Badge tone={tone(PRIORITY_TONE, p.priority)}>{p.priority}</Badge>,
    },
    { key: "date", label: "Request Date", muted: true, sortable: true, cell: (p) => p.date },
    { key: "itemCount", label: "Items", align: "right", cell: (p) => fmt(p.itemCount) },
    {
      key: "status",
      label: "Status",
      cell: (p) => <Badge tone={tone(PR_TONE, p.status)}>{p.status}</Badge>,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortable: true,
      cell: (p) => money0(p.amount),
    },
  ],

  rowActions: (pr, ctx) => {
    const acts: RowAction<PrRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.quickView("purchase-request", r) },
      {
        label: "Open Full Detail",
        icon: "external",
        run: (r) => ctx.goto(`/m/purchase-request/${r.code}`),
      },
    ];

    // Edit only while Draft or Rejected — an approved PR is locked.
    if (pr.status === "Draft" || pr.status === "Rejected")
      acts.push({
        label: "Edit",
        icon: "edit",
        run: (r) => ctx.goto(`/m/purchase-request/${r.code}/edit`),
      });

    acts.push({ sep: true });

    if (pr.status === "Draft")
      acts.push({ label: "Submit for Approval", icon: "send", run: (r) => prSubmit(r, ctx) });

    if (pr.status === "Pending Approval") {
      acts.push({ label: "Approve", icon: "check", run: (r) => prApprove(r, ctx) });
      acts.push({ label: "Reject", icon: "close", danger: true, run: (r) => prReject(r, ctx) });
    }

    if (pr.status === "Approved")
      acts.push({
        label: "Convert to Purchase Order",
        icon: "purchaseOrder",
        run: (r) => prConvert(r, ctx),
      });

    if (pr.status === "Converted" && pr.poRef)
      acts.push({
        label: `ดู ${pr.poRef}`,
        icon: "purchaseOrder",
        run: () => ctx.openEntity("purchase-order", pr.poRef),
      });

    acts.push({ sep: true });
    acts.push({
      label: "Print / Export",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์เอกสาร", `${r.code} — Future support`, "info"),
    });

    if (pr.status === "Draft")
      acts.push({ label: "Delete", icon: "trash", danger: true, run: (r) => prDelete(r, ctx) });
    else if (pr.status !== "Converted" && pr.status !== "Cancelled")
      acts.push({ label: "Cancel PR", icon: "circleSlash", danger: true, run: (r) => prCancel(r, ctx) });

    return acts;
  },
};

export const PR_DETAIL: DetailSchema<PrRow> = {
  key: "purchase-request",
  entityLabel: "Purchase Request",

  identity: (pr) => ({
    image: pr.icon,
    code: pr.code,
    title: `${pr.dept} · ${pr.requester}`,
    copyFields: [
      { label: "PR number", value: pr.code },
      { label: "Amount", value: `${money0(pr.amount)} THB` },
    ],
    badges: [
      { text: pr.status, tone: tone(PR_TONE, pr.status) },
      { text: pr.priority, tone: tone(PRIORITY_TONE, pr.priority) },
    ],
    tags: [pr.date, `${pr.itemCount} รายการ`, pr.warehouse].filter(Boolean),
  }),

  kpis: (pr) => [
    { icon: "cart", label: "Total Amount", value: money0(pr.amount), sub: "THB", goTab: "items" },
    { icon: "box", label: "Items", value: fmt(pr.itemCount), sub: "รายการ", goTab: "items" },
    { icon: "clock", label: "Need By", value: pr.needBy || DASH, sub: "กำหนดรับ", goTab: "overview" },
    {
      icon: "shield",
      label: "Approver",
      value: pr.currentApprover,
      sub: pr.status,
      wide: true,
      goTab: "approval",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (pr) => [
        {
          type: "fields",
          title: "Request Information",
          cols: 2,
          items: [
            { label: "PR Number", value: pr.code },
            { label: "Status", value: <Badge tone={tone(PR_TONE, pr.status)}>{pr.status}</Badge> },
            { label: "Department", value: pr.dept },
            { label: "Requester", value: pr.requester },
            {
              label: "Priority",
              value: <Badge tone={tone(PRIORITY_TONE, pr.priority)}>{pr.priority}</Badge>,
            },
            { label: "Request Date", value: pr.date },
            { label: "Need By Date", value: pr.needBy || DASH },
            { label: "Target Warehouse", value: pr.warehouse },
            { label: "Preferred Supplier", value: pr.supplier || DASH },
            { label: "Total Amount", value: `${money0(pr.amount)} THB` },
          ],
        },
        { type: "note", title: "Note", text: pr.note || DASH },
        Boolean(pr.poRef) && {
          type: "fields",
          title: "Linked Document",
          cols: 2,
          items: [{ label: "Purchase Order", value: <Badge tone="info">{pr.poRef}</Badge> }],
        },
        {
          type: "fields",
          title: "System Information",
          cols: 2,
          items: [
            { label: "Created By", value: pr.createdBy, muted: true },
            { label: "Created Date", value: pr.created, muted: true },
            { label: "Last Updated By", value: pr.updatedBy, muted: true },
            { label: "Last Updated", value: pr.updated, muted: true },
          ],
        },
      ],
    },

    {
      key: "items",
      label: "Items",
      blocks: (pr) => [
        {
          type: "table",
          title: `Requested Items (${pr.itemCount})`,
          rows: (pr.items ?? []).map((it) => {
            const si = productStock(it.code);
            return {
              ...it,
              lineTotal: prLineTotal(it),
              avail: si ? si.available : null,
              stStatus: si ? si.status : null,
              stTone: si ? si.tone : null,
            };
          }),
          empty: "ยังไม่มีรายการสินค้า",
          cols: [
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            { key: "name", label: "Product Name" },
            { key: "qty", label: "Qty", align: "right", cell: (r) => fmt(r.qty) },
            { key: "unit", label: "Unit", muted: true },
            { key: "price", label: "Unit Price", align: "right", cell: (r) => money0(r.price) },
            {
              key: "lineTotal",
              label: "Line Total",
              align: "right",
              cell: (r) => <span className="font-medium">{money0(r.lineTotal)}</span>,
            },
            {
              key: "avail",
              label: "Available",
              align: "right",
              cell: (r) =>
                r.avail === null ? (
                  DASH
                ) : (
                  <span
                    className={
                      r.avail < 0
                        ? "font-bold text-danger-text"
                        : r.stStatus !== "Healthy"
                          ? "font-semibold text-warning-text"
                          : ""
                    }
                  >
                    {fmt(r.avail)}
                  </span>
                ),
            },
            {
              key: "stStatus",
              label: "Stock Status",
              cell: (r) =>
                r.stStatus ? <Badge tone={r.stTone}>{r.stStatus}</Badge> : DASH,
            },
          ],
        },
        {
          type: "fields",
          title: "Summary",
          cols: 2,
          items: [
            { label: "Total Items", value: fmt(pr.itemCount) },
            {
              label: "Total Quantity",
              value: fmt((pr.items ?? []).reduce((s, it) => s + (Number(it.qty) || 0), 0)),
            },
            { label: "Total Amount", value: `${money0(pr.amount)} THB` },
          ],
        },
      ],
    },

    {
      key: "approval",
      label: "Approval",
      blocks: (pr) => [
        {
          type: "timeline",
          title: "Approval Flow",
          items: (pr.approvals ?? []).map((a) => ({
            title: `${a.step}${a.by ? ` — ${a.by}` : ""}`,
            detail: [a.role, a.note].filter(Boolean).join(" · ") || DASH,
            user: a.by,
            when: a.when || "รออนุมัติ",
            kind: a.status === "done" ? "primary" : a.status === "rejected" ? "warn" : "",
          })),
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (pr) => [
        {
          type: "timeline",
          title: "Activity",
          items: [
            {
              title: "Last updated",
              detail: `โดย ${pr.updatedBy}`,
              user: pr.updatedBy,
              when: pr.updated,
              kind: "primary",
            },
            {
              title: "Created",
              detail: "สร้างใบขอซื้อเข้าระบบ",
              user: pr.createdBy,
              when: pr.created,
            },
          ],
        },
      ],
    },
  ],
};

export const prSchemas: EntitySchemas<PrRow> = { list: PR_LIST, detail: PR_DETAIL };
