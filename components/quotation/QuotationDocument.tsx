"use client";

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
import { DocHeader, SignatureRow } from "@/components/document/parts";
import { CommentThread } from "@/components/document/CommentThread";
import {
  DecisionBar,
  DocPage,
  DocPanel,
  DocPanelRow,
  DocPanelText,
  DocPaper,
  DocPrintButton,
  DocSection,
  HistoryStrip,
  PaperTable,
  docActs,
  historyRows,
  idleNote,
  lineNoColumn,
  productCell,
  type PaperColumn,
} from "@/components/document/DocumentView";
import { Badge } from "@/components/ui";
import { QT_TONE, tone } from "@/lib/badges";

/* ============================================================
   QUOTATION — the document, read

   The sheet the customer will receive, shown as the sheet, with
   the three things the people around it need underneath:

     1. the decision — submit, approve, send back, or take it
        back to change it, and only the ones this chair may make
     2. what has happened to it
     3. nothing else

   The furniture — the paper, the panels, the item table, the
   decision bar, the history — is shared with the other six
   documents read this way; see components/document/DocumentView.

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

type Line = QtRow["items"][number];

const ITEM_COLUMNS: PaperColumn<Line>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, l.name) },
  {
    key: "qty",
    label: "Qty",
    align: "right",
    width: "w-[70px]",
    cell: (l) => <span className="font-medium">{fmt(l.qty)}</span>,
  },
  { key: "unit", label: "Unit", width: "w-[70px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  { key: "price", label: "Unit Price", align: "right", width: "w-[100px]", cell: (l) => money(l.price) },
  {
    key: "disc",
    label: "Disc %",
    align: "right",
    width: "w-[80px]",
    cell: (l) => <span className="text-ink-2">{l.disc ? `${l.disc}%` : DASH}</span>,
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    width: "w-[110px]",
    cell: (l) => <span className="font-medium">{money(lineNet(l))}</span>,
  },
];

export function QuotationDocument({ record }: { record: Quotation }) {
  const qt = record as QtRow;
  const bp = getCustomer(qt.customer);

  const lines = qt.items ?? [];
  const subtotal = lines.reduce((s, l) => s + lineBase(l), 0);
  const discount = lines.reduce((s, l) => s + lineDisc(l), 0);
  const net = lines.reduce((s, l) => s + lineNet(l), 0);

  return (
    <DocPage backTo="/m/quotation" backLabel="Back to Quotation List">
      <DocPaper testId="quotation-document">
        <DocHeader
          title="QUOTATION"
          titleTh="ใบเสนอราคา"
          code={qt.code}
          status={qt.status}
          showVerifyCode={false}
        />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="Bill To" titleTh="ลูกค้า">
            <DocPanelRow label="ลูกค้า" value={qt.customer} />
            <DocPanelRow label="เลขผู้เสียภาษี" value={bp?.tax?.taxId} />
            <DocPanelRow label="รหัสลูกค้า" value={qt.customerCode} />
            {/* A customer the rep raised is quotable and not yet orderable.
                Saying so on the sheet is what stops somebody promising
                delivery against a partner nobody has checked. */}
            {bp?.status === "Draft" && (
              <p className="mt-1 rounded-card border border-warning bg-warning-soft px-2 py-1 text-cap text-warning-text">
                ลูกค้ารายนี้ยังรอฝ่ายขายยืนยัน — เสนอราคาได้ แต่ยังเปิดใบสั่งขายไม่ได้
              </p>
            )}
          </DocPanel>
          <DocPanel title="Terms" titleTh="เงื่อนไข">
            <DocPanelRow label="ผู้แทนขาย" value={qt.salesRep} />
            <DocPanelRow label="ยืนราคาถึง" value={qt.validUntil} />
            <DocPanelRow label="เงื่อนไขชำระ" value={qt.payTerm} />
            <DocPanelRow label="ประเภทบิล" value={qt.billType} />
          </DocPanel>
          <DocPanel title="Document" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={qt.code} />
            <DocPanelRow label="วันที่" value={qt.quoteDate} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(QT_TONE, qt.status)}>{qt.status}</Badge>}
            />
            <DocPanelRow
              label="การอนุมัติ"
              value={
                <Badge tone={qt.approvalStatus === "Approved" ? "success" : "warning"}>
                  {qt.approvalStatus || "Not Submitted"}
                </Badge>
              }
            />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={lines} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Remarks" titleTh="หมายเหตุ">
            <DocPanelText value={qt.note} />
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="รวมเป็นเงิน" value={`${money0(subtotal)} THB`} />
            <DocPanelRow label="ส่วนลด" value={`${money0(discount)} THB`} />
            <DocPanelRow label="ยอดสุทธิ" value={`${money0(net)} THB`} />
            <DocPanelRow label="มูลค่าเอกสาร" value={`${money0(qt.amount)} THB`} />
          </DocPanel>
        </div>

        <div className="mt-6">
          <SignatureRow blocks={QT_SIGNATURES(qt)} />
        </div>
      </DocPaper>

      <QtDecisionBar qt={qt} />
      <HistoryStrip rows={historyRows(qt.history)} />

      {/* A question about a price belongs beside the price, asked of the
          person who typed it — not on the phone, where the answer ends up
          nowhere the next reader can find it. */}
      <CommentThread
        docCode={qt.code}
        people={[qt.createdBy, qt.salesRep, qt.approvedBy, ...(qt.history ?? []).map((h) => h.u)]}
        departments={["Sales"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

/**
 * What this chair may do with this quotation, and nothing else.
 *
 * The rep raises it and takes it back to change it; the sales admin signs it.
 * Every act here is the same workflow function the list menu calls, so the
 * guard behind it holds whichever surface the click came from.
 */
function QtDecisionBar({ qt }: { qt: QtRow }) {
  const ctx = useActionCtx();
  const mayApprove = can("quotation", "approve");
  const mayEdit = can("quotation", "edit");

  const acts = docActs([
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
        run: () => ctx.goto(`/m/quotation/${encodeURIComponent(qt.code)}/edit`),
      },
    qt.status === "Pending Approval" &&
      mayApprove && {
        key: "revise",
        label: "ส่งกลับให้ผู้แทนขายแก้",
        icon: "refresh" as const,
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
        run: () => qtRequestEdit(qt, ctx),
      },
    qt.status === "Approved" &&
      mayEdit && {
        key: "send",
        label: "ส่งให้ลูกค้า",
        icon: "send" as const,
        run: () => qtSend(qt, ctx),
      },
    (qt.status === "Approved" || qt.status === "Sent") &&
      mayEdit && {
        key: "accept",
        label: "ลูกค้ายืนยันสั่งซื้อ",
        icon: "checkCircle" as const,
        run: () => qtAccept(qt, ctx),
      },
    qt.status === "Accepted" && {
      key: "convert",
      label: "Confirm & generate S/R",
      icon: "salesRequest" as const,
      variant: "primary" as const,
      run: () => qtConvert(qt, ctx),
    },
  ]);

  return (
    <DecisionBar
      testId="qt-decision-bar"
      note={
        qt.approvalStatus === "Approved"
          ? `อนุมัติโดย ${qt.approvedBy || DASH} เมื่อ ${qt.approvedAt || DASH} — ดาวน์โหลดส่งลูกค้าได้`
          : acts.length
            ? `สถานะ ${qt.status} — ${qt.approvalStatus || "ยังไม่ได้ส่งขออนุมัติ"}`
            : idleNote(qt.status)
      }
      acts={acts}
      /* Downloading is not a decision, so it sits apart from them — and it is
         offered only once the sheet has been signed. A PDF of an unapproved
         quotation is a price nobody agreed to, in the customer's inbox. */
      before={
        qt.approvalStatus === "Approved" && (
          <DocPrintButton entity="quotation" record={qt} label="ดาวน์โหลด PDF" />
        )
      }
    />
  );
}
