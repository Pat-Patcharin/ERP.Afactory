import {
  QC_INSPECTIONS,
  qcChecklistStats,
  qcPendingQty,
  type QcRow,
} from "@/lib/domain/inbound";
import { QC_INSPECTORS, QC_PRIORITY, QC_RESULT, QC_STATUS } from "@/data/qc";
import { PRIORITY_TONE, QC_RESULT_TONE, QC_TONE, tone } from "@/lib/badges";
import { DASH, fmt } from "@/lib/format";
import { qcDecide, qcStart } from "@/lib/workflows";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, Thumb } from "@/components/ui";

/* ============================================================
   QC INSPECTION
   Receives QC-Hold items from Goods Receipt, runs a checklist,
   and routes the goods to Put Away (pass) or the Claim warehouse
   (fail, which also raises an NCR).
   ============================================================ */

export const QC_LIST: ListSchema<QcRow> = {
  key: "qc-inspection",
  entity: "QC Inspection",
  entityPlural: "QC Inspections",
  title: "QC Workspace",
  subtitle: "ตรวจสอบคุณภาพสินค้าที่รับเข้า บันทึกผล Pass/Fail และส่งต่อ Put Away หรือ Claim",
  crumb: "QC Inspection",
  primaryLabel: "Start Inspection",
  searchPlaceholder: "ค้นหาเลขที่ QC, GR, PO, ผู้ขายสินค้า, สินค้า, Lot, Serial...",
  emptyTitle: "ไม่พบใบตรวจ QC ที่ตรงกับเงื่อนไข",
  hideImportExport: true,

  source: () => QC_INSPECTIONS,
  searchFields: ["code", "grRef", "poRef", "supplier", "productName", "lot", "serial", "inspector"],

  hero: (ctx) => {
    const qcs = QC_INSPECTIONS;
    const waiting = qcs.filter((q) => q.status === "Waiting").length;
    const inProg = qcs.filter((q) => q.status === "In Progress").length;
    const completed = qcs.filter((q) => q.status === "Completed");
    const passed = completed.filter((q) => q.result === "Pass" || q.result === "Partial Pass").length;
    const failed = completed.filter((q) => q.result === "Fail").length;
    const overdue = qcs.filter((q) => q.isOverdue).length;
    const claims = qcs.filter((q) => q.claimRef || q.failAction === "Move to Claim Warehouse").length;
    const passRate = completed.length ? Math.round((passed / completed.length) * 100) : 0;
    const failRate = completed.length ? Math.round((failed / completed.length) * 100) : 0;

    return {
      banner: {
        title: "QC Morning Summary",
        icon: "qc",
        items: [
          `${waiting} waiting inspection`,
          `${inProg} in progress`,
          `${passed} passed`,
          `${failed} failed`,
          `${overdue} overdue`,
          `${claims} claim required`,
        ],
        action: "View Overdue",
        onAction: () => ctx.toast("Overdue QC", `${overdue} รายการเกินกำหนดตรวจ`, "warning"),
      },
      kpis: [
        { label: "Waiting", value: fmt(waiting), sub: "Inspection queue", link: "View", goTab: "waiting", tone: "primary", icon: "clock" },
        { label: "In Progress", value: fmt(inProg), sub: "Being inspected", link: "View", goTab: "inprogress", tone: "warn", icon: "qc" },
        { label: "Pass Rate", value: `${passRate}%`, sub: `${passed} passed`, link: "View", goTab: "completed", tone: "ok", icon: "checkCircle" },
        { label: "Fail Rate", value: `${failRate}%`, sub: `${failed} failed`, link: "View", goTab: "completed", tone: "warn", icon: "xCircle" },
        { label: "Pending Claim", value: fmt(claims), sub: "Needs action", link: "Open claims", tone: "warn", icon: "alert" },
      ],
    };
  },

  tabs: [
    { key: "all", label: "All" },
    { key: "waiting", label: "Waiting", test: (q) => q.status === "Waiting" },
    { key: "inprogress", label: "In Progress", test: (q) => q.status === "In Progress" },
    { key: "hold", label: "Hold", test: (q) => q.status === "Hold" },
    { key: "completed", label: "Completed", test: (q) => q.status === "Completed" },
    { key: "overdue", label: "Overdue", test: (q) => q.isOverdue },
  ],

  filters: [
    {
      id: "supplier",
      label: "Supplier",
      options: () => [...new Set(QC_INSPECTIONS.map((q) => q.supplier))],
      test: (q, v) => q.supplier === v,
    },
    { id: "inspector", label: "Inspector", options: () => [...QC_INSPECTORS], test: (q, v) => q.inspector === v },
    { id: "result", label: "Result", options: () => [...QC_RESULT], test: (q, v) => q.result === v },
    { id: "status", label: "Status", options: () => [...QC_STATUS], test: (q, v) => q.status === v },
    { id: "priority", label: "Priority", options: () => [...QC_PRIORITY], test: (q, v) => q.priority === v },
  ],

  columns: [
    {
      key: "code",
      label: "QC Number",
      sortable: true,
      cell: (q) => (
        <CellMedia>
          <Thumb>{q.icon}</Thumb>
          <span className="font-medium">{q.code}</span>
        </CellMedia>
      ),
    },
    { key: "grRef", label: "GR Number", muted: true, cell: (q) => q.grRef },
    { key: "poRef", label: "PO Number", muted: true, cell: (q) => q.poRef },
    { key: "supplier", label: "Supplier", sortable: true, cell: (q) => q.supplier },
    { key: "productName", label: "Product", cell: (q) => q.productName },
    { key: "lot", label: "Lot / Serial", muted: true, cell: (q) => q.lot || q.serial || DASH },
    { key: "receivedQty", label: "Qty", align: "right", cell: (q) => fmt(q.receivedQty) },
    { key: "inspector", label: "Inspector", cell: (q) => q.inspector },
    {
      key: "dueDate",
      label: "Due Date",
      muted: true,
      sortable: true,
      cell: (q) =>
        q.isOverdue ? <span className="font-semibold text-warning-text">{q.dueDate}</span> : q.dueDate,
    },
    {
      key: "status",
      label: "Status",
      cell: (q) => <Badge tone={tone(QC_TONE, q.status)}>{q.status}</Badge>,
    },
    {
      key: "result",
      label: "Result",
      cell: (q) =>
        q.result === "Pending" ? (
          <span className="text-ink-2">{DASH}</span>
        ) : (
          <Badge tone={tone(QC_RESULT_TONE, q.result)}>{q.result}</Badge>
        ),
    },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      cell: (q) => <Badge tone={tone(PRIORITY_TONE, q.priority)}>{q.priority}</Badge>,
    },
  ],

  rowActions: (qc, ctx) => {
    const acts: RowAction<QcRow>[] = [
      { label: "Open Detail", icon: "eye", run: (r) => ctx.quickView("qc-inspection", r) },
      {
        label: "Open Full Detail",
        icon: "external",
        run: (r) => ctx.goto(`/m/qc-inspection/${r.code}`),
      },
    ];

    if (qc.status === "Waiting")
      acts.push({ label: "Start Inspection", icon: "play", run: (r) => qcStart(r, ctx) });

    if (qc.status === "In Progress" || qc.status === "Hold") {
      acts.push({ sep: true });
      acts.push({ label: "Record Pass", icon: "checkCircle", run: (r) => qcDecide(r, true, ctx) });
      acts.push({ label: "Record Fail", icon: "xCircle", danger: true, run: (r) => qcDecide(r, false, ctx) });
    }

    acts.push({ sep: true });
    if (qc.status === "Completed" && qc.result === "Pass")
      acts.push({
        label: "Put Away",
        icon: "putAway",
        run: (r) => ctx.toast("ส่งต่อ Put Away", `${r.code} — ${r.productName} พร้อมจัดเก็บ`, "success"),
      });

    if (qc.ncrRef)
      acts.push({
        label: `View ${qc.ncrRef}`,
        icon: "file",
        run: () => ctx.toast("Non-Conformance Report", qc.ncrRef, "info"),
      });

    acts.push({
      label: "Print QC Report",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์รายงาน QC", `${r.code} — Future support`, "info"),
    });
    acts.push({
      label: `View ${qc.grRef}`,
      icon: "goodsReceipt",
      run: () => ctx.openEntity("goods-receipt", qc.grRef),
    });

    return acts;
  },
};

export const QC_DETAIL: DetailSchema<QcRow> = {
  key: "qc-inspection",
  entityLabel: "QC Inspection",

  identity: (qc) => ({
    image: qc.icon,
    code: qc.code,
    title: `${qc.productName} · ${qc.supplier}`,
    copyFields: [
      { label: "QC number", value: qc.code },
      { label: "GR number", value: qc.grRef },
    ],
    badges: [
      { text: qc.status, tone: tone(QC_TONE, qc.status) },
      ...(qc.result !== "Pending"
        ? ([{ text: qc.result, tone: tone(QC_RESULT_TONE, qc.result) }] as const)
        : []),
      { text: qc.priority, tone: tone(PRIORITY_TONE, qc.priority) },
    ],
    tags: [qc.lot || qc.serial, qc.warehouse, qc.inspector].filter(Boolean),
  }),

  kpis: (qc) => [
    { icon: "shield", label: "Accepted Qty", value: fmt(qc.acceptedQty), sub: qc.unit, goTab: "samples" },
    { icon: "alert", label: "Rejected Qty", value: fmt(qc.rejectedQty), sub: qc.unit, goTab: "samples" },
    { icon: "box", label: "Pending Qty", value: fmt(qcPendingQty(qc)), sub: qc.unit, goTab: "overview" },
    {
      icon: "file",
      label: "Pass Rate",
      value: `${qc.passRate}%`,
      sub: qc.result,
      wide: true,
      goTab: "checklist",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (qc) => {
        const st = qcChecklistStats(qc);
        return [
          {
            type: "fields",
            title: "Inspection Information",
            cols: 2,
            items: [
              { label: "QC Number", value: qc.code },
              { label: "Status", value: <Badge tone={tone(QC_TONE, qc.status)}>{qc.status}</Badge> },
              {
                label: "Result",
                value:
                  qc.result === "Pending" ? (
                    DASH
                  ) : (
                    <Badge tone={tone(QC_RESULT_TONE, qc.result)}>{qc.result}</Badge>
                  ),
              },
              {
                label: "Priority",
                value: <Badge tone={tone(PRIORITY_TONE, qc.priority)}>{qc.priority}</Badge>,
              },
              { label: "Supplier", value: qc.supplier },
              { label: "Goods Receipt", value: <Badge tone="info">{qc.grRef}</Badge> },
              { label: "Purchase Order", value: qc.poRef },
              { label: "Warehouse", value: qc.warehouse },
              { label: "Product", value: `${qc.product} · ${qc.productName}` },
              { label: "Lot Number", value: qc.lot || DASH },
              { label: "Serial Number", value: qc.serial || DASH },
              { label: "Expiry Date", value: qc.expiry || DASH },
              { label: "Quantity", value: `${fmt(qc.receivedQty)} ${qc.unit}` },
              { label: "Sampling Plan", value: qc.sampling },
              { label: "Inspection Method", value: qc.method },
              { label: "Inspection Date", value: qc.inspectionDate || DASH },
              { label: "Inspector", value: qc.inspector },
              qc.round > 1
                ? { label: "Inspection Round", value: `รอบ ${qc.round} (เดิม: ${qc.prevResult})` }
                : null,
            ],
          },
          {
            type: "cards",
            title: "Checklist Progress",
            items: [
              { label: "Total Items", value: fmt(st.total) },
              { label: "Pass", value: fmt(st.pass), tone: "accent" },
              { label: "Fail", value: fmt(st.fail) },
              { label: "Pending", value: fmt(st.pending) },
            ],
          },
          Boolean(qc.ncrRef || qc.claimRef) && {
            type: "fields",
            title: "Linked Documents",
            cols: 2,
            items: [
              qc.ncrRef ? { label: "NCR", value: <Badge tone="danger">{qc.ncrRef}</Badge> } : null,
              qc.claimRef
                ? { label: "Supplier Claim", value: <Badge tone="warning">{qc.claimRef}</Badge> }
                : null,
            ],
          },
          Boolean(qc.reason) && {
            type: "note",
            title: "Reason / Corrective Action",
            text: `${qc.reason}${qc.correctiveAction ? ` · ${qc.correctiveAction}` : ""}`,
          },
        ];
      },
    },

    {
      key: "checklist",
      label: "Checklist",
      blocks: (qc) => {
        const st = qcChecklistStats(qc);
        return [
          {
            type: "table",
            title: `QC Checklist (${st.pass}/${st.total} pass)`,
            rows: qc.checklist ?? [],
            empty: "ยังไม่มีรายการตรวจ",
            cols: [
              { key: "item", label: "Inspection Item", cell: (r) => <span className="font-medium">{r.item}</span> },
              {
                key: "result",
                label: "Result",
                cell: (r) =>
                  r.result === "pass" ? (
                    <Badge tone="success">Pass</Badge>
                  ) : r.result === "fail" ? (
                    <Badge tone="danger">Fail</Badge>
                  ) : r.result === "na" ? (
                    <Badge tone="neutral">N/A</Badge>
                  ) : (
                    <span className="text-ink-2">Pending</span>
                  ),
              },
              { key: "comment", label: "Comment", muted: true, cell: (r) => r.comment || DASH },
            ],
          },
        ];
      },
    },

    {
      key: "samples",
      label: "Samples",
      blocks: (qc) => [
        {
          type: "fields",
          title: "Sampling Plan",
          cols: 2,
          items: [
            { label: "Method", value: qc.method },
            { label: "Sampling Plan", value: qc.sampling },
            { label: "Sample Size", value: fmt(qc.sampleSize) },
            { label: "Accepted", value: fmt(qc.sampleAccept) },
            { label: "Rejected", value: fmt(qc.sampleReject) },
            {
              label: "Sampling Result",
              value:
                qc.sampleReject > 0 ? (
                  <Badge tone="danger">Reject</Badge>
                ) : qc.sampleAccept > 0 ? (
                  <Badge tone="success">Accept</Badge>
                ) : (
                  <span className="text-ink-2">Pending</span>
                ),
            },
          ],
        },
        {
          type: "cards",
          title: "Decision",
          cols: 3,
          items: [
            { label: "Received", value: fmt(qc.receivedQty), unit: qc.unit },
            { label: "Accepted", value: fmt(qc.acceptedQty), unit: qc.unit, tone: "accent" },
            { label: "Rejected", value: fmt(qc.rejectedQty), unit: qc.unit },
          ],
        },
      ],
    },

    {
      key: "history",
      label: "History",
      blocks: (qc) => [
        {
          type: "timeline",
          title: "Activity",
          items: (qc.history ?? []).map((e) => ({
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

export const qcSchemas: EntitySchemas<QcRow> = { list: QC_LIST, detail: QC_DETAIL };
