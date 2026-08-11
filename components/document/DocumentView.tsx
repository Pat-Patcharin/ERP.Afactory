"use client";

import type { ReactNode } from "react";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { DocLabel, type SignatureBlock } from "@/components/document/parts";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/lib/icons";
import { DASH } from "@/lib/format";
import {
  SIGNATURE_LABELS,
  canPrintDocument,
  getPrintConfig,
  printTypesFor,
  type PrintConfig,
  type PrintDocType,
} from "@/lib/print";

/* ============================================================
   READING A DOCUMENT — the furniture every one of them uses

   Seven documents are read as documents now: the quotation, the
   purchase request, and the five that carry an order from
   confirmation to the bill. They agree on the shape:

     the sheet          what would come out of the printer
     the decision       what THIS chair may do, and nothing else
     the chain          the documents either side of this one
     the history        what has happened to it
     the conversation   asked beside the thing being asked about

   The parts are here rather than copied into each file for the
   same reason CommentThread is one component: seven copies drift
   the first time one of them gains a feature, and then the
   quotation and the delivery note stop looking like paper from
   the same company.

   What is NOT here is anything about a particular document. Each
   file decides what its own sheet says — that is the part that
   differs, and the part worth reading.
   ============================================================ */

/* ---------- The page ---------- */

/**
 * The frame: a way back to the list, and the paper underneath it.
 *
 * `family` picks the accent — the sell side keeps the brand orange, the buy
 * side goes teal — through `data-doc-family`, so nothing here names a colour.
 */
export function DocPage({
  family = "outbound",
  backTo,
  backLabel,
  children,
}: {
  family?: "outbound" | "inbound";
  backTo: string;
  backLabel: string;
  children: ReactNode;
}) {
  const ctx = useActionCtx();

  return (
    <div data-doc-family={family} className="px-6 py-5">
      <button
        type="button"
        onClick={() => ctx.goto(backTo)}
        className="mb-4 inline-flex items-center gap-1.5 text-body text-ink-2 hover:text-ink-1"
      >
        <Icon name="arrowLeft" size={16} />
        {backLabel}
      </button>
      {children}
    </div>
  );
}

/** The sheet itself. One width for every document, so they stack alike. */
export function DocPaper({
  testId,
  children,
}: {
  testId: string;
  children: ReactNode;
}) {
  return (
    <article
      data-testid={testId}
      className="mx-auto max-w-[1100px] rounded-card border border-line bg-card p-8 shadow-sm"
    >
      {children}
    </article>
  );
}

/** Everything under the sheet sits on the same width as the sheet. */
export function DocStrip({
  testId,
  children,
}: {
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="mx-auto mt-4 max-w-[1100px] rounded-card border border-line bg-card p-4"
    >
      {children}
    </section>
  );
}

/* ---------- Paper furniture ---------- */

export function DocPanel({
  title,
  titleTh,
  children,
}: {
  title: string;
  titleTh: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line p-4">
      <DocLabel en={title} th={titleTh} />
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function DocPanelRow({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="flex-shrink-0 text-ink-2">{label}</span>
      <span className="min-w-0 text-right font-medium">{value || DASH}</span>
    </div>
  );
}

/** A full-width block of prose on the sheet — an address, an instruction. */
export function DocPanelText({ value }: { value?: ReactNode }) {
  return <p className="whitespace-pre-wrap text-[13px]">{value || DASH}</p>;
}

export function DocSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em]">{title}</h2>
      {children}
    </section>
  );
}

/* ---------- Notices printed on the sheet ---------- */

export type NoticeTone = "info" | "warn" | "danger";

const NOTICE_STYLE: Record<NoticeTone, string> = {
  info: "border-info bg-info-soft text-info-text",
  warn: "border-warning bg-warning-soft text-warning-text",
  danger: "border-danger bg-danger-soft text-danger-text",
};

export interface DocNotice {
  tone: NoticeTone;
  title: string;
  message?: string;
}

/**
 * The things somebody must know before acting on this sheet — a credit hold,
 * a delivery that went short, a tax ID nobody has filled in.
 *
 * On the paper rather than under it: a warning that sits below the decision
 * bar is a warning read after the decision.
 */
export function DocNotices({ notices }: { notices: (DocNotice | false | null)[] }) {
  const rows = notices.filter(Boolean) as DocNotice[];
  if (!rows.length) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {rows.map((n, i) => (
        <div
          key={`${n.title}-${i}`}
          className={`rounded-card border px-3 py-2 text-[13px] ${NOTICE_STYLE[n.tone]}`}
        >
          <p className="font-semibold">{n.title}</p>
          {n.message && <p className="mt-0.5 opacity-90">{n.message}</p>}
        </div>
      ))}
    </div>
  );
}

/* ---------- The item table ---------- */

export interface PaperColumn<T> {
  key: string;
  label: string;
  /** Thai gloss under the English head, for a column whose name is not obvious. */
  th?: string;
  align?: "left" | "right";
  /** Tailwind width class — omitted lets the column take what is left. */
  width?: string;
  cell: (row: T, index: number) => ReactNode;
}

/**
 * The lines, as a printed table would set them.
 *
 * Column-driven because every document shows a different set — a pick list
 * has bins and no prices, an invoice has tax and no bins — while the ruling,
 * the alignment and the number face must stay identical across all of them.
 */
export function PaperTable<T>({
  cols,
  rows,
  minWidth = 820,
  empty = "ไม่มีรายการ",
}: {
  cols: PaperColumn<T>[];
  rows: T[];
  minWidth?: number;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table
        className="w-full border-collapse text-[13px]"
        style={{ minWidth: `${minWidth}px` }}
      >
        <thead>
          <tr className="border-b border-line bg-surface text-cap text-ink-2">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`px-2 py-2 ${c.align === "right" ? "text-right" : "text-left"} ${c.width ?? ""}`}
              >
                {c.label}
                {c.th && <span className="block font-normal text-ink-3">{c.th}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-2 py-6 text-center text-ink-3">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-2 ${c.align === "right" ? "tnum text-right" : ""}`}
                >
                  {c.cell(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The `#` column every item table opens with. */
export function lineNoColumn<T>(): PaperColumn<T> {
  return {
    key: "no",
    label: "#",
    align: "right",
    width: "w-[40px]",
    cell: (_r, i) => <span className="text-ink-3">{i + 1}</span>,
  };
}

/** Code above, name beneath — how a printed line names a product. */
export function productCell(code: string, name: string) {
  return (
    <>
      <span className="block font-medium">{code}</span>
      <span className="block text-cap text-ink-3">{name}</span>
    </>
  );
}

/* ---------- The decision ---------- */

export interface DocAct {
  key: string;
  label: string;
  icon: IconName;
  /** Omitted is the quiet one — the sheet should carry at most one primary. */
  variant?: "primary" | "danger";
  run: () => void;
}

/** What a bar with no buttons says. One sentence, used by every document. */
export const idleNote = (status: string) =>
  `ไม่มีสิ่งที่คุณต้องทำกับเอกสารนี้ตอนนี้ — สถานะ ${status}`;

/**
 * The acts this chair may make on this document, and nothing else.
 *
 * Every act calls the same workflow function the list menu calls, so the
 * guard behind it holds whichever surface the click came from. Hiding a
 * button somebody may not press is the courtesy on top of that guard, not a
 * replacement for it.
 */
export function DecisionBar({
  testId,
  note,
  acts,
  before,
  children,
}: {
  testId: string;
  note: ReactNode;
  acts: DocAct[];
  /** Buttons that are not decisions — printing, mostly — placed ahead of them. */
  before?: ReactNode;
  /** Anything the document wants under the row, such as an approval plan. */
  children?: ReactNode;
}) {
  return (
    <DocStrip testId={testId}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <DocLabel en="Decision" th="การตัดสินใจ" />
          <p className="mt-1 text-cap text-ink-2">{note}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {before}
          {acts.map((a) => (
            <Button key={a.key} variant={a.variant} onClick={a.run}>
              <Icon name={a.icon} size={16} strokeWidth={2.2} />
              {a.label}
            </Button>
          ))}
        </div>
      </div>
      {children}
    </DocStrip>
  );
}

/** Drops the `false` entries a list of conditional acts is built from. */
export const docActs = (list: (DocAct | false | null | undefined)[]): DocAct[] =>
  list.filter(Boolean) as DocAct[];

/* ============================================================
   THE SCREEN READS THE PRINT CONFIG

   What a document is called, what is printed under its item
   table, and who signs it are already settled once, in
   lib/print/config.ts, because the printed sheet needs them.
   The screen reads the same entries rather than restating them.

   The alternative is two lists that match on the day they are
   written: rename the delivery note in the print config and the
   screen would go on calling it something else, which is the
   fault the totals had before `recordTotals`, one surface out.
   ============================================================ */

/**
 * The form this record prints as — the first one its bill type allows.
 *
 * Takes the bill type rather than the record because most documents have
 * none: a picking task is not billed, and only the sell-side sheets split
 * into a VAT and a Non VAT form.
 */
export function docForm(
  entity: string,
  billType?: string,
): { config: PrintConfig; docType: PrintDocType } | null {
  const [docType] = printTypesFor(entity, { billType });
  const config = docType ? getPrintConfig(docType) : null;
  return config && docType ? { config, docType } : null;
}

/** Who signs this document, from the print config, with whoever already did. */
export function docSignatures(
  config: PrintConfig | null,
  signed: Record<string, { by?: string; role?: string; at?: string } | undefined> = {},
): SignatureBlock[] {
  return (config?.signatureRoles ?? []).map((role) => {
    const label = SIGNATURE_LABELS[role];
    const s = signed[role];
    return {
      en: label?.en ?? role,
      th: label?.th ?? "",
      signedBy: s?.by || "",
      signedRole: s?.role,
      signedAt: s?.at,
    };
  });
}

/** The numbered conditions printed under the item table. */
export function DocRemarks({ config }: { config: PrintConfig | null }) {
  const remarks = config?.remarks ?? [];
  if (!remarks.length) return null;

  return (
    <div className="mt-5 rounded-card border border-line p-4">
      <DocLabel en="Terms" th="เงื่อนไข" />
      <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-2">
        {remarks.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The way to the printable sheet.
 *
 * Not a decision, so it sits apart from them — and it is offered only to a
 * role that may print this module at all, through the same check the print
 * menu uses.
 */
export function DocPrintButton({
  entity,
  record,
  label = "พิมพ์ / PDF",
}: {
  entity: string;
  record: { code: string; billType?: string };
  label?: string;
}) {
  const ctx = useActionCtx();
  const form = docForm(entity, record.billType);
  if (!form || !canPrintDocument(form.config)) return null;

  return (
    <Button
      onClick={() => ctx.goto(`/print/${form.docType}/${encodeURIComponent(record.code)}`)}
    >
      <Icon name="printer" size={16} strokeWidth={2.2} />
      {label}
    </Button>
  );
}

/* ---------- The chain ---------- */

export interface RelatedDoc {
  /** How the document is named in Thai — "ใบสั่งขาย", not "SO". */
  label: string;
  code: string;
  /** Registry key, so the chip navigates. Omitted renders it as plain text. */
  entity?: string;
  sub?: string;
}

/**
 * The documents either side of this one.
 *
 * A picking task is meaningless without its order and its packing job, and
 * somebody standing on one of them should not have to go back to a list and
 * search to reach the next. Chips rather than a table: this is a signpost,
 * not data.
 */
export function RelatedStrip({ items }: { items: (RelatedDoc | false | null)[] }) {
  const ctx = useActionCtx();
  const rows = items.filter(Boolean) as RelatedDoc[];
  if (!rows.length) return null;

  return (
    <DocStrip testId="doc-related">
      <DocLabel en="Related Documents" th="เอกสารที่เกี่ยวข้อง" />
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((r) => {
          const body = (
            <>
              <span className="text-ink-2">{r.label}</span>
              <span className="font-medium tnum">{r.code}</span>
              {r.sub && <span className="text-ink-3">· {r.sub}</span>}
            </>
          );
          return r.entity ? (
            <button
              key={`${r.entity}-${r.code}`}
              type="button"
              onClick={() => ctx.openEntity(r.entity!, r.code)}
              className="inline-flex items-center gap-2 rounded-pill border border-line px-3 py-1 text-cap hover:border-primary hover:text-primary"
            >
              {body}
            </button>
          ) : (
            <span
              key={`${r.label}-${r.code}`}
              className="inline-flex items-center gap-2 rounded-pill border border-line px-3 py-1 text-cap text-ink-2"
            >
              {body}
            </span>
          );
        })}
      </div>
    </DocStrip>
  );
}

/* ---------- History ---------- */

export interface HistoryRow {
  title: string;
  detail?: string;
  by?: string;
  when?: string;
  tone?: "success" | "warning" | "danger" | "muted";
}

const DOT: Record<NonNullable<HistoryRow["tone"]>, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-line-strong",
};

/** The `{ t, d, u, when, kind }` every outbound record keeps, as rows. */
export const historyRows = (
  history?: { t: string; d: string; u: string; when: string; kind: string }[],
): HistoryRow[] =>
  (history ?? []).map((h) => ({
    title: h.t,
    detail: h.d,
    by: h.u,
    when: h.when,
    tone: h.kind === "warn" ? "warning" : h.kind === "danger" ? "danger" : "success",
  }));

/**
 * Who took a given step, and when — read back out of the history.
 *
 * The signature blocks want "confirmed by whom, at what time", and for most
 * outbound documents the only place that was ever written down is the history
 * entry the workflow logged. Reading it back beats adding an `approvedBy`
 * column to five records that would then have to be kept in step with the
 * log that already says it.
 *
 * Undefined when nobody has taken the step, which leaves the block blank for
 * a pen — never a name filled in from "whoever is looking at this".
 */
export function historySignature(
  history: { t: string; u: string; when: string }[] | undefined,
  ...titles: string[]
): { by: string; at: string } | undefined {
  const hit = (history ?? []).find((h) => titles.some((t) => h.t.startsWith(t)));
  return hit ? { by: hit.u, at: hit.when } : undefined;
}

export function HistoryStrip({
  rows,
  empty = "ยังไม่มีประวัติ",
  pending = "รอดำเนินการ",
}: {
  rows: HistoryRow[];
  empty?: string;
  /** What the time column says for a step nobody has taken yet. */
  pending?: string;
}) {
  return (
    <DocStrip>
      <DocLabel en="History" th="ประวัติเอกสาร" />
      <ol className="mt-3 flex flex-col gap-2">
        {rows.length === 0 && <li className="text-cap text-ink-3">{empty}</li>}
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-3 text-[13px]">
            <span
              className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${DOT[r.tone ?? "success"]}`}
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.title}</span>
              {r.detail && <span className="text-ink-2"> — {r.detail}</span>}
            </span>
            <span className="whitespace-nowrap text-cap text-ink-3">
              {r.by || DASH} · {r.when || pending}
            </span>
          </li>
        ))}
      </ol>
    </DocStrip>
  );
}
