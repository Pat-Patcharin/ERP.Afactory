import {
  PURCHASE_REQUESTS,
  prLineTotal,
  prNeedsSecondSignature,
  type PrRow,
} from "@/lib/domain/purchase";
import { productStock } from "@/lib/domain/product";
import { PurchaseRequestEditor } from "@/components/purchase-request/PurchaseRequestEditor";
import { PR_DEPARTMENTS, PR_PRIORITY, PR_STATUS } from "@/data/purchase-requests";
import { PR_TONE, PRIORITY_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import {
  prApprove,
  prCanApprove,
  prCanConvert,
  prCanOpen,
  prCanSubmit,
  prCancel,
  prConvert,
  prDelete,
  prOpen,
  prProgress,
  prReject,
  prSubmit,
} from "@/lib/workflows";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb } from "@/components/ui";
import { PR_FORM } from "./forms/purchase-request";

/* ============================================================
   PURCHASE REQUEST — the first transactional document.
   Draft → Open → Approved → Converted to PO
                → Rejected

   A request over the approval limit is submitted but stays a
   Draft until the reviewer opens it — see lib/workflows-purchase.
   Which is why "Draft" needs a line under it on this screen.
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
    { key: "review", label: "รอตรวจสอบ", test: (p) => p.status === "Draft" && Boolean(p.submittedAt) },
    { key: "open", label: "Open", test: (p) => p.status === "Open" },
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
      /* Two documents can both read "Draft" and mean opposite things — one
         still being typed, one sitting on the reviewer's desk. The status
         cannot say which; the line under it can. */
      cell: (p) => (
        <>
          <Badge tone={tone(PR_TONE, p.status)}>{p.status}</Badge>
          {p.status === "Draft" && p.submittedAt && <CellSub>รอตรวจสอบ</CellSub>}
          {p.status === "Open" && prNeedsSecondSignature(p) && <CellSub>เกินวงเงิน</CellSub>}
          {p.status === "Approved" && p.openLines < p.itemCount && (
            <CellSub>ยังไม่ได้สั่ง {fmt(p.openLines)} รายการ</CellSub>
          )}
        </>
      ),
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
      { label: "View", icon: "eye", run: (r) => ctx.openEntity("purchase-request", r.code) },
      {
        label: "Open Full Detail",
        icon: "external",
        run: (r) => ctx.goto(`/m/purchase-request/${r.code}`),
      },
    ];

    /* Edit while the requester still holds it, and while an approver is
       reading it — the reviewer may change the quantities before opening or
       approving, which is the whole point of putting it on their desk. */
    if (pr.status === "Draft" || pr.status === "Rejected" || pr.status === "Open")
      acts.push({
        label: "Edit",
        icon: "edit",
        run: (r) => ctx.goto(`/m/purchase-request/${r.code}/edit`),
      });

    acts.push({ sep: true });

    if (prCanSubmit(pr))
      acts.push({ label: "Submit for Approval", icon: "send", run: (r) => prSubmit(r, ctx) });

    /* Over the limit: submitted, but not open until the reviewer says so. */
    if (prCanOpen(pr)) {
      acts.push({ label: "ตรวจแล้ว — เปิดเอกสาร", icon: "check", run: (r) => prOpen(r, ctx) });
      acts.push({ label: "Reject", icon: "close", danger: true, run: (r) => prReject(r, ctx) });
    }

    if (prCanApprove(pr)) {
      acts.push({ label: "Approve", icon: "check", run: (r) => prApprove(r, ctx) });
      acts.push({ label: "Reject", icon: "close", danger: true, run: (r) => prReject(r, ctx) });
    }

    if (prCanConvert(pr))
      acts.push({
        label:
          pr.openLines < pr.itemCount
            ? `ออกใบสั่งซื้อรอบถัดไป (${pr.openLines} รายการ)`
            : "Convert to Purchase Order",
        icon: "purchaseOrder",
        run: (r) => prConvert(r, ctx),
      });

    for (const po of pr.poRefs ?? [])
      acts.push({
        label: `ดู ${po}`,
        icon: "purchaseOrder",
        run: () => ctx.openEntity("purchase-order", po),
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
        pr.status === "Draft" &&
          Boolean(pr.submittedAt) && {
            /* A draft nobody is waiting on and a draft on somebody's desk look
               identical in a status column. This is the difference. */
            type: "alert",
            tone: "warn",
            title: "รอตรวจสอบก่อนเปิดเอกสาร",
            message: `${pr.submittedBy} ส่งมาเมื่อ ${pr.submittedAt} — มูลค่า ${money0(
              pr.amount,
            )} บาท เกินวงเงินอนุมัติ ต้องตรวจสอบแล้วเปิดเอกสารก่อน จึงจะส่งให้อนุมัติได้`,
          },
        Boolean((pr.poRefs ?? []).length) && {
          type: "fields",
          title: "Linked Documents",
          cols: 2,
          items: [
            {
              label: (pr.poRefs ?? []).length > 1 ? "Purchase Orders" : "Purchase Order",
              value: (
                <span className="flex flex-wrap gap-1.5">
                  {(pr.poRefs ?? []).map((po) => (
                    <Badge key={po} tone="info">
                      {po}
                    </Badge>
                  ))}
                </span>
              ),
              span: true,
            },
            {
              label: "รายการที่ยังไม่ได้สั่ง",
              value: pr.openLines
                ? `${fmt(pr.openLines)} จาก ${fmt(pr.itemCount)} รายการ`
                : "ออกใบสั่งซื้อครบทุกรายการแล้ว",
            },
          ],
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
              /* The four figures an approver needs before turning this into
                 an order: what is on the shelf, what is already promised
                 away, what is already coming, and what is actually free.
                 Approving a purchase without them is approving a number. */
              onHand: si ? si.onHand : null,
              backOrder: si ? si.backOrder : null,
              onOrder: si ? si.onOrder : null,
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
              key: "onHand",
              label: "On Hand",
              align: "right",
              muted: true,
              cell: (r) => (r.onHand === null ? DASH : fmt(r.onHand)),
            },
            {
              key: "backOrder",
              label: "Back Order",
              align: "right",
              muted: true,
              cell: (r) =>
                r.backOrder === null ? (
                  DASH
                ) : r.backOrder > 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(r.backOrder)}</span>
                ) : (
                  fmt(0)
                ),
            },
            {
              key: "onOrder",
              label: "On Order",
              align: "right",
              muted: true,
              /* Already bought and not yet arrived. The figure that stops a
                 second order for goods that are on their way. */
              cell: (r) =>
                r.onOrder === null ? (
                  DASH
                ) : r.onOrder > 0 ? (
                  <span className="font-semibold text-info-text">{fmt(r.onOrder)}</span>
                ) : (
                  fmt(0)
                ),
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
            {
              /* Which order each line went out on. A request ordered in
                 instalments has no single answer at the header, and this is
                 the column that says which half is still waiting. */
              key: "poRef",
              label: "Purchase Order",
              cell: (r) =>
                r.poRef ? (
                  <Badge tone="info">{r.poRef}</Badge>
                ) : (
                  <span className="text-ink-3">ยังไม่ได้สั่ง</span>
                ),
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
          /* The signatures this document must collect, read from the workflow
             in Administration rather than from anything typed on the request.
             A request under the limit shows one row; one over it shows two,
             and the second row is what "เกินวงเงิน" actually means. */
          type: "table",
          title: "ขั้นการอนุมัติที่เอกสารนี้ต้องผ่าน",
          rows: prProgress(pr),
          empty: "ไม่มีขั้นอนุมัติสำหรับเอกสารนี้",
          cols: [
            { key: "seq", label: "ขั้น", align: "right", cell: (s) => fmt(s.seq) },
            { key: "name", label: "ขั้นตอน" },
            { key: "roleName", label: "ผู้มีอำนาจ" },
            {
              key: "threshold",
              label: "เงื่อนไข",
              muted: true,
              cell: (s) => (s.threshold > 0 ? `ตั้งแต่ ${money0(s.threshold)} บาทขึ้นไป` : "ทุกใบ"),
            },
            {
              key: "approvers",
              label: "ผู้อนุมัติที่ใช้งานอยู่",
              muted: true,
              cell: (s) => s.approvers.join(", ") || "ไม่มีผู้ใช้ในบทบาทนี้",
            },
            {
              key: "signed",
              label: "สถานะ",
              cell: (s) =>
                s.signed ? (
                  <Badge tone="success">ลงนามแล้ว</Badge>
                ) : (
                  <Badge tone="neutral">รอลงนาม</Badge>
                ),
            },
          ],
        },
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

export const prSchemas: EntitySchemas<PrRow> = {
  list: PR_LIST,
  detail: PR_DETAIL,
  /* Kept alongside the editor rather than deleted: `PR_FORM` still supplies
     the `required` list the progress bar counts, and it remains the fallback
     if the document editor is ever rolled back. The route prefers `editor`
     when it is present — see app/(erp)/m/[entity]/new/page.tsx. */
  form: PR_FORM,
  editor: ({ record }) => <PurchaseRequestEditor record={record} />,
};
