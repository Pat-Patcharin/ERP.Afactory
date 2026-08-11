"use client";

import { useMemo } from "react";
import type { PurchaseRequest } from "@/data/purchase-requests";
import { prLineTotal, type PrRow } from "@/lib/domain/purchase";
import { productStock } from "@/lib/domain/product";
import {
  prApprove,
  prCanApprove,
  prCanConvert,
  prCanOpen,
  prCanRevise,
  prCanSubmit,
  prConvert,
  prOpen,
  prProgress,
  prReject,
  prRevise,
  prSubmit,
} from "@/lib/workflows";
import { DASH, fmt, money0 } from "@/lib/format";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { DocHeader, SignatureRow } from "@/components/document/parts";
import { CommentThread } from "@/components/document/CommentThread";
import {
  DecisionBar,
  DocPage,
  DocPanel,
  DocPanelRow,
  DocPanelText,
  DocPaper,
  DocSection,
  HistoryStrip,
  PaperTable,
  docActs,
  idleNote,
  lineNoColumn,
  productCell,
  type HistoryRow,
  type PaperColumn,
} from "@/components/document/DocumentView";
import { Badge } from "@/components/ui";
import type { BadgeTone } from "@/lib/types";
import { PR_TONE, PRIORITY_TONE, tone } from "@/lib/badges";

/* ============================================================
   PURCHASE REQUEST — the document, read

   The same sheet the requester typed, shown as the sheet. The
   old profile page broke it into four tabs of cards: an approver
   read a summary of the request rather than the request, and had
   to open a menu to say yes.

   Three things sit under the paper, in the order somebody works
   through them:

     1. the decision — approve, send back, or reject, and only
        the ones this person may actually make on this document
     2. what has happened to it so far
     3. the conversation, where a question about line 2 can be
        asked of the person who typed line 2

   The paper, the panels, the table and the strips underneath are
   the ones every document read this way uses — see
   components/document/DocumentView. What this file decides is
   only what a purchase request says.

   MOCK: the comment thread is component state. It is here to be
   looked at and argued with before anything is built behind it —
   a reload empties it, deliberately, so nobody mistakes it for
   something that is already storing what they wrote.
   ============================================================ */

const PR_SIGNATURES = [
  { en: "Requested By", th: "ผู้ขอซื้อ" },
  { en: "Department Head", th: "หัวหน้าแผนก" },
  { en: "Purchasing", th: "ฝ่ายจัดซื้อ" },
  { en: "Approved By", th: "ผู้อนุมัติ" },
];

/** A line with the four stock figures the approval turns on. */
interface StockLine {
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  onHand: number | null;
  onOrder: number | null;
  backOrder: number | null;
  available: number | null;
  stockStatus: string | null;
  stockTone: BadgeTone;
}

/** Nothing, or a figure — an unknown product is not "zero in stock". */
const stockCell = (v: number | null, className = "") =>
  v === null ? DASH : <span className={className}>{fmt(v)}</span>;

const ITEM_COLUMNS: PaperColumn<StockLine>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, l.name) },
  {
    key: "qty",
    label: "Qty",
    align: "right",
    width: "w-[70px]",
    cell: (l) => <span className="font-medium">{fmt(l.qty)}</span>,
  },
  { key: "unit", label: "Unit", width: "w-[60px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  { key: "price", label: "Unit Price", align: "right", width: "w-[90px]", cell: (l) => money0(l.price) },
  {
    key: "total",
    label: "Line Total",
    align: "right",
    width: "w-[100px]",
    cell: (l) => <span className="font-medium">{money0(l.total)}</span>,
  },
  /* The four figures that answer "do we actually need this?" — asked while
     the approval is being decided, which is the only time the answer
     changes anything. */
  {
    key: "onHand",
    label: "On Hand",
    th: "คงเหลือ",
    align: "right",
    width: "w-[84px]",
    cell: (l) => stockCell(l.onHand, "text-ink-2"),
  },
  {
    key: "onOrder",
    label: "On Order",
    th: "กำลังเข้า",
    align: "right",
    width: "w-[84px]",
    cell: (l) => stockCell(l.onOrder, l.onOrder ? "font-semibold text-info-text" : ""),
  },
  {
    key: "backOrder",
    label: "Back Order",
    th: "ค้างส่ง",
    align: "right",
    width: "w-[84px]",
    cell: (l) => stockCell(l.backOrder, l.backOrder ? "font-semibold text-warning-text" : ""),
  },
  {
    key: "available",
    label: "Available",
    th: "พร้อมขาย",
    align: "right",
    width: "w-[84px]",
    cell: (l) => stockCell(l.available, "font-medium"),
  },
  {
    key: "stock",
    label: "Stock",
    width: "w-[92px]",
    cell: (l) =>
      l.stockStatus ? (
        <Badge tone={l.stockTone}>{l.stockStatus}</Badge>
      ) : (
        <span className="text-ink-3">{DASH}</span>
      ),
  },
];

export function PurchaseRequestDocument({ record }: { record: PurchaseRequest }) {
  const pr = record as PrRow;

  const lines = useMemo<StockLine[]>(
    () =>
      (pr.items ?? []).map((it) => {
        const st = productStock(it.code);
        return {
          ...it,
          total: prLineTotal(it),
          onHand: st?.onHand ?? null,
          onOrder: st?.onOrder ?? null,
          backOrder: st?.backOrder ?? null,
          available: st?.available ?? null,
          stockStatus: st?.status ?? null,
          stockTone: (st?.tone ?? "neutral") as BadgeTone,
        };
      }),
    [pr.items],
  );

  const subtotal = lines.reduce((s, l) => s + l.total, 0);

  return (
    <DocPage family="inbound" backTo="/m/purchase-request" backLabel="Back to Purchase Request List">
      <DocPaper testId="purchase-request-document">
        <DocHeader
          title="PURCHASE REQUEST"
          titleTh="ใบขอซื้อ"
          code={pr.code}
          status={pr.status}
          showVerifyCode={false}
        />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="Requested By" titleTh="ผู้ขอซื้อ">
            <DocPanelRow label="แผนก" value={pr.dept} />
            <DocPanelRow label="ผู้ขอซื้อ" value={pr.requester} />
            <DocPanelRow label="ความเร่งด่วน" value={pr.priority} />
            <DocPanelRow label="วันที่ขอ" value={pr.date} />
          </DocPanel>
          <DocPanel title="Deliver To" titleTh="ส่งของที่">
            <DocPanelRow label="คลังปลายทาง" value={pr.warehouse} />
            <DocPanelRow label="ผู้ขาย" value={pr.supplier} />
            <DocPanelRow label="ต้องการรับภายใน" value={pr.needBy} />
          </DocPanel>
          <DocPanel title="Document" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={pr.code} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(PR_TONE, pr.status)}>{pr.status}</Badge>}
            />
            <DocPanelRow
              label="ความเร่งด่วน"
              value={<Badge tone={tone(PRIORITY_TONE, pr.priority)}>{pr.priority}</Badge>}
            />
            <DocPanelRow label="มูลค่ารวม" value={`${money0(pr.amount)} THB`} />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={lines} minWidth={980} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Reason" titleTh="เหตุผลที่ขอซื้อ">
            <DocPanelText value={pr.note} />
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="จำนวนรายการ" value={`${fmt(pr.itemCount)} รายการ`} />
            <DocPanelRow label="รวมเป็นเงิน" value={`${money0(subtotal)} THB`} />
            <DocPanelRow label="มูลค่าเอกสาร" value={`${money0(pr.amount)} THB`} />
          </DocPanel>
        </div>

        <div className="mt-6">
          <SignatureRow blocks={PR_SIGNATURES} />
        </div>
      </DocPaper>

      <PrDecisionBar pr={pr} />

      <HistoryStrip rows={approvalRows(pr)} />

      <CommentThread
        docCode={pr.code}
        people={[pr.createdBy, pr.requester, pr.updatedBy, ...(pr.approvals ?? []).map((a) => a.by)]}
        /* The desks a purchase request crosses on its way to an order. */
        departments={["Management", "Purchasing"]}
      />
    </DocPage>
  );
}

/* ---------- History ---------- */

/**
 * A purchase request's history is its approval trail, not an activity log —
 * every other outbound document keeps `{ t, d, u, when, kind }` and this one
 * keeps signatures, so it maps its own rows rather than sharing `historyRows`.
 */
function approvalRows(pr: PrRow): HistoryRow[] {
  const state: Record<string, HistoryRow["tone"]> = {
    done: "success",
    rejected: "danger",
    revision: "warning",
  };

  return [
    ...(pr.approvals ?? []).map((a) => ({
      title: a.step.startsWith("APPROVAL-") ? `ขั้นอนุมัติที่ ${a.step.split("-")[1]}` : a.step,
      detail: [a.role, a.note].filter(Boolean).join(" · "),
      by: a.by,
      when: a.when,
      tone: state[a.status] ?? ("muted" as const),
    })),
    {
      title: "สร้างเอกสาร",
      detail: "เปิดใบขอซื้อเข้าระบบ",
      by: pr.createdBy,
      when: pr.created,
      tone: "success" as const,
    },
  ];
}

/* ---------- The decision ---------- */

/**
 * The acts this person may make on this document, and nothing else.
 *
 * Gated by the same `prCan…` predicates the list uses, so the button under
 * the paper and the button on the row can never disagree about whether a
 * document is waiting for you.
 */
function PrDecisionBar({ pr }: { pr: PrRow }) {
  const ctx = useActionCtx();
  const plan = prProgress(pr);
  const waiting = plan.find((s) => !s.signed);

  const acts = docActs([
    prCanSubmit(pr) && {
      key: "submit",
      label: "ส่งขออนุมัติ",
      icon: "send" as const,
      variant: "primary" as const,
      run: () => prSubmit(pr, ctx),
    },
    prCanOpen(pr) && {
      key: "open",
      label: "ตรวจแล้ว — เปิดเอกสาร",
      icon: "checkCircle" as const,
      variant: "primary" as const,
      run: () => prOpen(pr, ctx),
    },
    prCanApprove(pr) && {
      key: "approve",
      label: "Approve",
      icon: "check" as const,
      variant: "primary" as const,
      run: () => prApprove(pr, ctx),
    },
    prCanRevise(pr) && {
      key: "revise",
      label: "Revise",
      icon: "refresh" as const,
      run: () => prRevise(pr, ctx),
    },
    (prCanApprove(pr) || prCanOpen(pr)) && {
      key: "reject",
      label: "Reject",
      icon: "close" as const,
      variant: "danger" as const,
      run: () => prReject(pr, ctx),
    },
    prCanConvert(pr) && {
      key: "convert",
      label: pr.openLines < pr.itemCount ? `ออกใบสั่งซื้อรอบถัดไป (${pr.openLines})` : "ออกใบสั่งซื้อ",
      icon: "purchaseOrder" as const,
      variant: "primary" as const,
      run: () => prConvert(pr, ctx),
    },
  ]);

  return (
    <DecisionBar
      testId="pr-decision-bar"
      note={
        acts.length
          ? waiting
            ? `รอ${waiting.roleName}ลงนาม — ขั้นที่ ${waiting.seq} จาก ${plan.length}`
            : "เอกสารนี้พร้อมให้ดำเนินการต่อ"
          : idleNote(pr.status)
      }
      acts={acts}
    >
      {/* The plan itself, so "why can't I sign this" has an answer on screen. */}
      {plan.length > 1 && (
        <ol className="mt-3 flex flex-wrap gap-2">
          {plan.map((s) => (
            <li
              key={s.seq}
              className={`rounded-pill border px-3 py-1 text-cap ${
                s.signed ? "border-success bg-success-soft text-success-text" : "border-line text-ink-2"
              }`}
            >
              {s.seq}. {s.roleName}
              {s.threshold > 0 && ` · ตั้งแต่ ${money0(s.threshold)} บาท`}
              {s.signed && s.row?.by ? ` · ${s.row.by}` : ""}
            </li>
          ))}
        </ol>
      )}
    </DecisionBar>
  );
}
