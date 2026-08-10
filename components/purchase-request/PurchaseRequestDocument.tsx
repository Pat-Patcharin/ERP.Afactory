"use client";

import { useMemo, useState } from "react";
import type { PurchaseRequest } from "@/data/purchase-requests";
import { prLineTotal, type PrRow } from "@/lib/domain/purchase";
import { productStock } from "@/lib/domain/product";
import { actingUserName, currentUser, getUsers } from "@/lib/domain/admin";
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
import { DASH, fmt, money0, stamp } from "@/lib/format";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { DocHeader, DocLabel, SignatureRow } from "@/components/document/parts";
import { Badge, Button, CellInput } from "@/components/ui";
import { Icon } from "@/lib/icons";
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

   MOCK: the comment thread is component state. It is here to be
   looked at and argued with before anything is built behind it —
   a reload empties it, deliberately, so nobody mistakes it for
   something that is already storing what they wrote.
   ============================================================ */

const STOCK_COLS = [
  { key: "onHand", label: "On Hand", th: "คงเหลือ" },
  { key: "onOrder", label: "On Order", th: "กำลังเข้า" },
  { key: "backOrder", label: "Back Order", th: "ค้างส่ง" },
  { key: "available", label: "Available", th: "พร้อมขาย" },
] as const;

const PR_SIGNATURES = [
  { en: "Requested By", th: "ผู้ขอซื้อ" },
  { en: "Department Head", th: "หัวหน้าแผนก" },
  { en: "Purchasing", th: "ฝ่ายจัดซื้อ" },
  { en: "Approved By", th: "ผู้อนุมัติ" },
];

interface Comment {
  id: number;
  author: string;
  role: string;
  at: string;
  text: string;
  mentions: string[];
}

export function PurchaseRequestDocument({ record }: { record: PurchaseRequest }) {
  const ctx = useActionCtx();
  const pr = record as PrRow;

  const lines = useMemo(
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
    <div data-doc-family="inbound" className="px-6 py-5">
      <button
        type="button"
        onClick={() => ctx.goto("/m/purchase-request")}
        className="mb-4 inline-flex items-center gap-1.5 text-body text-ink-2 hover:text-ink-1"
      >
        <Icon name="arrowLeft" size={16} />
        Back to Purchase Request List
      </button>

      {/* ---------- The paper ---------- */}
      <article
        data-testid="purchase-request-document"
        className="mx-auto max-w-[1100px] rounded-card border border-line bg-card p-8 shadow-sm"
      >
        <DocHeader
          title="PURCHASE REQUEST"
          titleTh="ใบขอซื้อ"
          code={pr.code}
          status={pr.status}
          showVerifyCode={false}
        />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <Panel title="Requested By" titleTh="ผู้ขอซื้อ">
            <Row label="แผนก" value={pr.dept} />
            <Row label="ผู้ขอซื้อ" value={pr.requester} />
            <Row label="ความเร่งด่วน" value={pr.priority} />
            <Row label="วันที่ขอ" value={pr.date} />
          </Panel>
          <Panel title="Deliver To" titleTh="ส่งของที่">
            <Row label="คลังปลายทาง" value={pr.warehouse} />
            <Row label="ผู้ขาย" value={pr.supplier} />
            <Row label="ต้องการรับภายใน" value={pr.needBy} />
          </Panel>
          <Panel title="Document" titleTh="เอกสาร">
            <Row label="เลขที่" value={pr.code} />
            <Row
              label="สถานะ"
              value={<Badge tone={tone(PR_TONE, pr.status)}>{pr.status}</Badge>}
            />
            <Row
              label="ความเร่งด่วน"
              value={<Badge tone={tone(PRIORITY_TONE, pr.priority)}>{pr.priority}</Badge>}
            />
            <Row label="มูลค่ารวม" value={`${money0(pr.amount)} THB`} />
          </Panel>
        </div>

        {/* ---------- Lines, with what the warehouse already has ---------- */}
        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em]">Items</h2>
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[980px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface text-cap text-ink-2">
                  <th className="w-[40px] px-2 py-2 text-right">#</th>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="w-[70px] px-2 py-2 text-right">Qty</th>
                  <th className="w-[60px] px-2 py-2 text-left">Unit</th>
                  <th className="w-[90px] px-2 py-2 text-right">Unit Price</th>
                  <th className="w-[100px] px-2 py-2 text-right">Line Total</th>
                  {/* The four figures that answer "do we actually need this?"
                      — asked while the approval is being decided, which is
                      the only time the answer changes anything. */}
                  {STOCK_COLS.map((c) => (
                    <th key={c.key} className="w-[84px] px-2 py-2 text-right">
                      {c.label}
                      <span className="block font-normal text-ink-3">{c.th}</span>
                    </th>
                  ))}
                  <th className="w-[92px] px-2 py-2">Stock</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.code}-${i}`} className="border-b border-line last:border-b-0">
                    <td className="tnum px-2 py-2 text-right text-ink-3">{i + 1}</td>
                    <td className="px-2 py-2">
                      <span className="block font-medium">{l.code}</span>
                      <span className="block text-cap text-ink-3">{l.name}</span>
                    </td>
                    <td className="tnum px-2 py-2 text-right font-medium">{fmt(l.qty)}</td>
                    <td className="px-2 py-2 text-ink-2">{l.unit}</td>
                    <td className="tnum px-2 py-2 text-right">{money0(l.price)}</td>
                    <td className="tnum px-2 py-2 text-right font-medium">{money0(l.total)}</td>
                    <td className="tnum px-2 py-2 text-right text-ink-2">
                      {l.onHand === null ? DASH : fmt(l.onHand)}
                    </td>
                    <td className="tnum px-2 py-2 text-right">
                      {l.onOrder === null ? (
                        DASH
                      ) : l.onOrder > 0 ? (
                        <span className="font-semibold text-info-text">{fmt(l.onOrder)}</span>
                      ) : (
                        fmt(0)
                      )}
                    </td>
                    <td className="tnum px-2 py-2 text-right">
                      {l.backOrder === null ? (
                        DASH
                      ) : l.backOrder > 0 ? (
                        <span className="font-semibold text-warning-text">{fmt(l.backOrder)}</span>
                      ) : (
                        fmt(0)
                      )}
                    </td>
                    <td className="tnum px-2 py-2 text-right font-medium">
                      {l.available === null ? DASH : fmt(l.available)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {l.stockStatus ? (
                        <Badge tone={l.stockTone}>{l.stockStatus}</Badge>
                      ) : (
                        <span className="text-ink-3">{DASH}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <Panel title="Reason" titleTh="เหตุผลที่ขอซื้อ">
            <p className="whitespace-pre-wrap text-[13px]">{pr.note || DASH}</p>
          </Panel>
          <Panel title="Summary" titleTh="สรุป">
            <Row label="จำนวนรายการ" value={`${fmt(pr.itemCount)} รายการ`} />
            <Row label="รวมเป็นเงิน" value={`${money0(subtotal)} THB`} />
            <Row label="มูลค่าเอกสาร" value={`${money0(pr.amount)} THB`} />
          </Panel>
        </div>

        <div className="mt-6">
          <SignatureRow blocks={PR_SIGNATURES} />
        </div>
      </article>

      {/* ---------- The decision ---------- */}
      <DecisionBar pr={pr} />

      {/* ---------- What has happened ---------- */}
      <HistoryStrip pr={pr} />

      {/* ---------- The conversation ---------- */}
      <CommentThread pr={pr} />
    </div>
  );
}

/* ---------- Paper furniture ---------- */

function Panel({
  title,
  titleTh,
  children,
}: {
  title: string;
  titleTh: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line p-4">
      <DocLabel en={title} th={titleTh} />
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 text-[13px]">
    <span className="text-ink-2">{label}</span>
    <span className="text-right font-medium">{value || DASH}</span>
  </div>
);

/* ---------- The decision bar ---------- */

/**
 * The acts this person may make on this document, and nothing else.
 *
 * Gated by the same `prCan…` predicates the list uses, so the button under
 * the paper and the button on the row can never disagree about whether a
 * document is waiting for you.
 */
function DecisionBar({ pr }: { pr: PrRow }) {
  const ctx = useActionCtx();
  const plan = prProgress(pr);
  const waiting = plan.find((s) => !s.signed);

  const acts = [
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
      variant: "default" as const,
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
  ].filter(Boolean) as {
    key: string;
    label: string;
    icon: "send" | "check" | "checkCircle" | "close" | "refresh" | "purchaseOrder";
    variant: "primary" | "danger" | "default";
    run: () => void;
  }[];

  return (
    <section
      data-testid="pr-decision-bar"
      className="mx-auto mt-4 max-w-[1100px] rounded-card border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <DocLabel en="Decision" th="การตัดสินใจ" />
          <p className="mt-1 text-cap text-ink-2">
            {acts.length
              ? waiting
                ? `รอ${waiting.roleName}ลงนาม — ขั้นที่ ${waiting.seq} จาก ${plan.length}`
                : "เอกสารนี้พร้อมให้ดำเนินการต่อ"
              : `ไม่มีสิ่งที่คุณต้องทำกับเอกสารนี้ตอนนี้ — สถานะ ${pr.status}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {acts.map((a) => (
            <Button
              key={a.key}
              variant={a.variant === "default" ? undefined : a.variant}
              onClick={a.run}
            >
              <Icon name={a.icon} size={16} strokeWidth={2.2} />
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {/* The plan itself, so "why can't I sign this" has an answer on screen. */}
      {plan.length > 1 && (
        <ol className="mt-3 flex flex-wrap gap-2">
          {plan.map((s) => (
            <li
              key={s.seq}
              className={`rounded-pill border px-3 py-1 text-cap ${
                s.signed
                  ? "border-success bg-success-soft text-success-text"
                  : "border-line text-ink-2"
              }`}
            >
              {s.seq}. {s.roleName}
              {s.threshold > 0 && ` · ตั้งแต่ ${money0(s.threshold)} บาท`}
              {s.signed && s.row?.by ? ` · ${s.row.by}` : ""}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- History ---------- */

function HistoryStrip({ pr }: { pr: PrRow }) {
  const rows = [
    ...(pr.approvals ?? []).map((a) => ({
      title: a.step.startsWith("APPROVAL-")
        ? `ขั้นอนุมัติที่ ${a.step.split("-")[1]}`
        : a.step,
      detail: [a.role, a.note].filter(Boolean).join(" · "),
      by: a.by,
      when: a.when,
      state: a.status,
    })),
    {
      title: "สร้างเอกสาร",
      detail: "เปิดใบขอซื้อเข้าระบบ",
      by: pr.createdBy,
      when: pr.created,
      state: "done",
    },
  ];

  return (
    <section className="mx-auto mt-4 max-w-[1100px] rounded-card border border-line bg-card p-4">
      <DocLabel en="History" th="ประวัติเอกสาร" />
      <ol className="mt-3 flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-3 text-[13px]">
            <span
              className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                r.state === "done"
                  ? "bg-success"
                  : r.state === "rejected"
                    ? "bg-danger"
                    : r.state === "revision"
                      ? "bg-warning"
                      : "bg-line-strong"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.title}</span>
              {r.detail && <span className="text-ink-2"> — {r.detail}</span>}
            </span>
            <span className="whitespace-nowrap text-cap text-ink-3">
              {r.by || DASH} · {r.when || "รอดำเนินการ"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Comments ---------- */

/**
 * MOCK. Component state, cleared by a reload.
 *
 * Shown before it is built so the shape can be argued with: who is taggable,
 * what a mention looks like on the page, whether a thread belongs under the
 * document at all. Nothing here writes to a store, and it says so on screen
 * rather than only in this comment.
 */
function CommentThread({ pr }: { pr: PrRow }) {
  const me = currentUser();
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [seq, setSeq] = useState(0);

  /* Everybody the document has touched, plus whoever may sign it. A mention
     list of the whole staff directory is a list nobody reads. */
  const people = useMemo(() => {
    const named = new Set(
      [pr.createdBy, pr.requester, pr.updatedBy, ...(pr.approvals ?? []).map((a) => a.by)].filter(
        Boolean,
      ),
    );
    return getUsers()
      .filter((u) => u.status === "Active")
      .filter((u) => named.has(u.name) || u.department === "Management" || u.department === "Purchasing")
      .map((u) => ({ name: u.name, role: u.roleCode }));
  }, [pr]);

  const mentioned = people.filter((p) => text.includes(`@${p.name}`)).map((p) => p.name);

  const post = () => {
    const body = text.trim();
    if (!body) return;
    setItems((prev) => [
      ...prev,
      {
        id: seq,
        author: actingUserName(),
        role: me.roleCode,
        at: stamp(),
        text: body,
        mentions: mentioned,
      },
    ]);
    setSeq((n) => n + 1);
    setText("");
  };

  return (
    <section
      data-testid="pr-comments"
      className="mx-auto mt-4 max-w-[1100px] rounded-card border border-line bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <DocLabel en="Comments" th="พูดคุยเกี่ยวกับเอกสารนี้" />
        <Badge tone="neutral">Mock — ยังไม่ได้เก็บข้อมูล</Badge>
      </div>

      <ol className="mt-3 flex flex-col gap-3">
        {items.length === 0 && (
          <li className="text-cap text-ink-3">
            ยังไม่มีความเห็น — พิมพ์ด้านล่าง แท็กคนที่เกี่ยวข้องด้วย @ชื่อ
          </li>
        )}
        {items.map((c) => (
          <li key={c.id} className="flex gap-3">
            <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary-soft text-cap font-bold text-primary">
              {c.author.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-semibold">{c.author}</span>
                <span className="text-cap text-ink-3">{c.at}</span>
              </div>
              <p className="whitespace-pre-wrap text-[13px]">{c.text}</p>
              {c.mentions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.mentions.map((m) => (
                    <Badge key={m} tone="info">
                      @{m}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-cap text-ink-3">แท็ก:</span>
          {people.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${p.name} `)}
              className="rounded-pill border border-line px-2 py-0.5 text-cap text-ink-2 hover:border-primary hover:text-primary"
            >
              @{p.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <CellInput
            aria-label="เขียนความเห็น"
            value={text}
            placeholder={`ตอบกลับเกี่ยวกับ ${pr.code} — แท็กด้วย @ชื่อ`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                post();
              }
            }}
            className="h-10 flex-1"
          />
          <Button variant="primary" onClick={post}>
            ส่ง
          </Button>
        </div>
      </div>
    </section>
  );
}
