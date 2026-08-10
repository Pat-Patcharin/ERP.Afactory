"use client";

import { useMemo } from "react";
import type { Quotation } from "@/data/quotations";
import { getCustomer, type QtRow } from "@/lib/domain/outbound";
import { can } from "@/lib/domain/admin";
import {
  qtAccept,
  qtApprove,
  qtConvert,
  qtRejectApproval,
  qtRequestEdit,
  qtRequestRevision,
  qtSend,
  qtSubmit,
} from "@/lib/workflows-outbound";
import { lineNet, lineBase, lineDisc } from "@/lib/domain/lines";
import { DASH, fmt, money, money0 } from "@/lib/format";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { DocHeader, DocLabel, SignatureRow } from "@/components/document/parts";
import { CommentThread } from "@/components/document/CommentThread";
import { Badge, Button } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { QT_TONE, tone } from "@/lib/badges";

/* ============================================================
   QUOTATION — the document, read

   The sheet the customer will receive, shown as the sheet, with
   the three things the people around it need underneath:

     1. the decision — submit, approve, send back, or take it
        back to change it, and only the ones this chair may make
     2. what has happened to it
     3. nothing else

   THE SIGNATURE IS A MOCK, AND SAYS SO.

   An approved quotation carries the approver's name in a script
   face, their role and the moment they signed. That is what a
   document approved IN a system has — a name, a role and a
   timestamp — rather than a scan of a pen. Nothing here claims to
   be a scanned signature, and the block is empty until somebody
   has actually approved it.
   ============================================================ */

const QT_SIGNATURES = (qt: QtRow) => [
  { en: "Prepared By", th: "ผู้จัดทำ", signedBy: qt.createdBy, signedRole: "ผู้แทนขาย", signedAt: qt.created },
  {
    en: "Approved By",
    th: "ผู้อนุมัติ",
    /* Only once. A block that filled itself in from "whoever is looking at
       this" would sign every quotation the moment it was opened. */
    signedBy: qt.approvalStatus === "Approved" ? qt.approvedBy : "",
    signedRole: "ฝ่ายขาย",
    signedAt: qt.approvedAt,
  },
  { en: "Customer", th: "ลูกค้า" },
];

export function QuotationDocument({ record }: { record: Quotation }) {
  const ctx = useActionCtx();
  const qt = record as QtRow;
  const bp = getCustomer(qt.customer);

  const lines = qt.items ?? [];
  const subtotal = lines.reduce((s, l) => s + lineBase(l), 0);
  const discount = lines.reduce((s, l) => s + lineDisc(l), 0);
  const net = lines.reduce((s, l) => s + lineNet(l), 0);

  return (
    <div data-doc-family="outbound" className="px-6 py-5">
      <button
        type="button"
        onClick={() => ctx.goto("/m/quotation")}
        className="mb-4 inline-flex items-center gap-1.5 text-body text-ink-2 hover:text-ink-1"
      >
        <Icon name="arrowLeft" size={16} />
        Back to Quotation List
      </button>

      <article
        data-testid="quotation-document"
        className="mx-auto max-w-[1100px] rounded-card border border-line bg-card p-8 shadow-sm"
      >
        <DocHeader
          title="QUOTATION"
          titleTh="ใบเสนอราคา"
          code={qt.code}
          status={qt.status}
          showVerifyCode={false}
        />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <Panel title="Bill To" titleTh="ลูกค้า">
            <Row label="ลูกค้า" value={qt.customer} />
            <Row label="เลขผู้เสียภาษี" value={bp?.tax?.taxId} />
            <Row label="รหัสลูกค้า" value={qt.customerCode} />
            {/* A customer the rep raised is quotable and not yet orderable.
                Saying so on the sheet is what stops somebody promising
                delivery against a partner nobody has checked. */}
            {bp?.status === "Draft" && (
              <p className="mt-1 rounded-card border border-warning bg-warning-soft px-2 py-1 text-cap text-warning-text">
                ลูกค้ารายนี้ยังรอฝ่ายขายยืนยัน — เสนอราคาได้ แต่ยังเปิดใบสั่งขายไม่ได้
              </p>
            )}
          </Panel>
          <Panel title="Terms" titleTh="เงื่อนไข">
            <Row label="ผู้แทนขาย" value={qt.salesRep} />
            <Row label="ยืนราคาถึง" value={qt.validUntil} />
            <Row label="เงื่อนไขชำระ" value={qt.payTerm} />
            <Row label="ประเภทบิล" value={qt.billType} />
          </Panel>
          <Panel title="Document" titleTh="เอกสาร">
            <Row label="เลขที่" value={qt.code} />
            <Row label="วันที่" value={qt.quoteDate} />
            <Row
              label="สถานะ"
              value={<Badge tone={tone(QT_TONE, qt.status)}>{qt.status}</Badge>}
            />
            <Row
              label="การอนุมัติ"
              value={
                <Badge tone={qt.approvalStatus === "Approved" ? "success" : "warning"}>
                  {qt.approvalStatus || "Not Submitted"}
                </Badge>
              }
            />
          </Panel>
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em]">Items</h2>
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface text-cap text-ink-2">
                  <th className="w-[40px] px-2 py-2 text-right">#</th>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="w-[70px] px-2 py-2 text-right">Qty</th>
                  <th className="w-[70px] px-2 py-2 text-left">Unit</th>
                  <th className="w-[100px] px-2 py-2 text-right">Unit Price</th>
                  <th className="w-[80px] px-2 py-2 text-right">Disc %</th>
                  <th className="w-[110px] px-2 py-2 text-right">Amount</th>
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
                    <td className="tnum px-2 py-2 text-right">{money(l.price)}</td>
                    <td className="tnum px-2 py-2 text-right text-ink-2">
                      {l.disc ? `${l.disc}%` : DASH}
                    </td>
                    <td className="tnum px-2 py-2 text-right font-medium">{money(lineNet(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <Panel title="Remarks" titleTh="หมายเหตุ">
            <p className="whitespace-pre-wrap text-[13px]">{qt.note || DASH}</p>
          </Panel>
          <Panel title="Summary" titleTh="สรุป">
            <Row label="รวมเป็นเงิน" value={`${money0(subtotal)} THB`} />
            <Row label="ส่วนลด" value={`${money0(discount)} THB`} />
            <Row label="ยอดสุทธิ" value={`${money0(net)} THB`} />
            <Row label="มูลค่าเอกสาร" value={`${money0(qt.amount)} THB`} />
          </Panel>
        </div>

        <div className="mt-6">
          <SignatureRow blocks={QT_SIGNATURES(qt)} />
        </div>
      </article>

      <DecisionBar qt={qt} />
      <HistoryStrip qt={qt} />

      {/* A question about a price belongs beside the price, asked of the
          person who typed it — not on the phone, where the answer ends up
          nowhere the next reader can find it. */}
      <CommentThread
        docCode={qt.code}
        people={[qt.createdBy, qt.salesRep, qt.approvedBy, ...(qt.history ?? []).map((h) => h.u)]}
        departments={["Sales"]}
      />
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

const Row = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 text-[13px]">
    <span className="text-ink-2">{label}</span>
    <span className="text-right font-medium">{value || DASH}</span>
  </div>
);

/* ---------- The decision ---------- */

/**
 * What this chair may do with this quotation, and nothing else.
 *
 * The rep raises it and takes it back to change it; the sales admin signs it.
 * Every act here is the same workflow function the list menu calls, so the
 * guard behind it holds whichever surface the click came from.
 */
function DecisionBar({ qt }: { qt: QtRow }) {
  const ctx = useActionCtx();
  const mayApprove = can("quotation", "approve");
  const mayEdit = can("quotation", "edit");

  const acts = [
    qt.status === "Draft" &&
      mayEdit && {
        key: "submit",
        label: "ส่งขออนุมัติ",
        icon: "upload" as const,
        variant: "primary" as const,
        run: () => qtSubmit(qt, ctx),
      },
    qt.status === "Pending Approval" &&
      mayApprove && {
        key: "approve",
        label: "Approve",
        icon: "checkCircle" as const,
        variant: "primary" as const,
        run: () => qtApprove(qt, ctx),
      },
    /* THE APPROVER'S OWN PENCIL.

       A quantity typed wrong or a missing reference does not need a round
       trip: sending it back costs a day and the rep fixes it by retyping
       what the approver could have corrected in ten seconds. So the desk
       that signs it may also edit it — the quotation stays Pending Approval
       while they do, and they sign it themselves afterwards.

       Sending it back is for a document that is wrong in a way the approver
       should not quietly fix. Rejecting is for one that is wrong altogether,
       and it asks for a reason. */
    qt.status === "Pending Approval" &&
      mayApprove && {
        key: "edit-here",
        label: "แก้ไขเอง",
        icon: "edit" as const,
        variant: "default" as const,
        run: () => ctx.goto(`/m/quotation/${encodeURIComponent(qt.code)}/edit`),
      },
    qt.status === "Pending Approval" &&
      mayApprove && {
        key: "revise",
        label: "ส่งกลับให้ผู้แทนขายแก้",
        icon: "refresh" as const,
        variant: "default" as const,
        run: () => qtRequestRevision(qt, ctx),
      },
    qt.status === "Pending Approval" &&
      mayApprove && {
        key: "reject",
        label: "Reject",
        icon: "close" as const,
        variant: "danger" as const,
        run: () => qtRejectApproval(qt, ctx),
      },
    /* Approved: the rep's three. Editing pulls it back through approval —
       see qtRequestEdit — because a quotation that changed after it was
       signed is not the one that was signed. */
    qt.status === "Approved" &&
      mayEdit && {
        key: "edit",
        label: "แก้ไข (ต้องขออนุมัติใหม่)",
        icon: "edit" as const,
        variant: "default" as const,
        run: () => qtRequestEdit(qt, ctx),
      },
    qt.status === "Approved" &&
      mayEdit && {
        key: "send",
        label: "ส่งให้ลูกค้า",
        icon: "send" as const,
        variant: "default" as const,
        run: () => qtSend(qt, ctx),
      },
    (qt.status === "Approved" || qt.status === "Sent") &&
      mayEdit && {
        key: "accept",
        label: "ลูกค้ายืนยันสั่งซื้อ",
        icon: "checkCircle" as const,
        variant: "default" as const,
        run: () => qtAccept(qt, ctx),
      },
    qt.status === "Accepted" && {
      key: "convert",
      label: "Confirm & generate S/R",
      icon: "salesRequest" as const,
      variant: "primary" as const,
      run: () => qtConvert(qt, ctx),
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    icon: "upload" | "checkCircle" | "refresh" | "close" | "edit" | "send" | "salesRequest";
    variant: "primary" | "danger" | "default";
    run: () => void;
  }[];

  return (
    <section
      data-testid="qt-decision-bar"
      className="mx-auto mt-4 max-w-[1100px] rounded-card border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <DocLabel en="Decision" th="การตัดสินใจ" />
          <p className="mt-1 text-cap text-ink-2">
            {qt.approvalStatus === "Approved"
              ? `อนุมัติโดย ${qt.approvedBy || DASH} เมื่อ ${qt.approvedAt || DASH} — ดาวน์โหลดส่งลูกค้าได้`
              : acts.length
                ? `สถานะ ${qt.status} — ${qt.approvalStatus || "ยังไม่ได้ส่งขออนุมัติ"}`
                : `ไม่มีสิ่งที่คุณต้องทำกับเอกสารนี้ตอนนี้ — สถานะ ${qt.status}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Downloading is not a decision, so it sits apart from them — and
              it is offered only once the sheet has been signed. A PDF of an
              unapproved quotation is a price nobody agreed to, in the
              customer's inbox. */}
          {qt.approvalStatus === "Approved" && (
            <Button
              onClick={() => ctx.goto(`/print/quotation/${encodeURIComponent(qt.code)}`)}
            >
              <Icon name="printer" size={16} strokeWidth={2.2} />
              ดาวน์โหลด PDF
            </Button>
          )}
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
    </section>
  );
}

/* ---------- History ---------- */

function HistoryStrip({ qt }: { qt: QtRow }) {
  const rows = useMemo(
    () =>
      (qt.history ?? []).map((h) => ({
        title: h.t,
        detail: h.d,
        by: h.u,
        when: h.when,
        kind: h.kind,
      })),
    [qt.history],
  );

  return (
    <section className="mx-auto mt-4 max-w-[1100px] rounded-card border border-line bg-card p-4">
      <DocLabel en="History" th="ประวัติเอกสาร" />
      <ol className="mt-3 flex flex-col gap-2">
        {rows.length === 0 && <li className="text-cap text-ink-3">ยังไม่มีประวัติ</li>}
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-3 text-[13px]">
            <span
              className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                r.kind === "warn" ? "bg-warning" : r.kind === "danger" ? "bg-danger" : "bg-success"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.title}</span>
              {r.detail && <span className="text-ink-2"> — {r.detail}</span>}
            </span>
            <span className="whitespace-nowrap text-cap text-ink-3">
              {r.by || DASH} · {r.when || DASH}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
