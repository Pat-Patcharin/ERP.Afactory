"use client";

import type { SalesRequest } from "@/data/sales-requests";
import {
  availabilityFor,
  creditCheck,
  getCustomer,
  getQT,
  type SrRow,
} from "@/lib/domain/outbound";
import { tierNotices } from "@/lib/domain/price-tier";
import { displayName, lineNet, recordTotals } from "@/lib/domain/lines";
import { priceApproval } from "@/lib/domain/doc-draft";
import { can } from "@/lib/domain/admin";
import {
  srApprove,
  srCancel,
  srConvert,
  srReject,
  srReopen,
  srSubmit,
} from "@/lib/workflows-outbound";
import { DASH, fmt, money, money0 } from "@/lib/format";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { DocHeader, SignatureRow } from "@/components/document/parts";
import { CommentThread } from "@/components/document/CommentThread";
import {
  DecisionBar,
  DocNotices,
  DocPage,
  DocPanel,
  DocPanelRow,
  DocPanelText,
  DocPaper,
  DocPrintButton,
  DocRemarks,
  DocSection,
  HistoryStrip,
  PaperTable,
  RelatedStrip,
  docActs,
  docForm,
  docSignatures,
  historyRows,
  historySignature,
  idleNote,
  lineNoColumn,
  productCell,
  type DocNotice,
  type PaperColumn,
} from "@/components/document/DocumentView";
import { Badge } from "@/components/ui";
import { PRIORITY_TONE, SRQ_TONE, tone } from "@/lib/badges";

/* ============================================================
   SALES REQUEST — the document, read

   The internal sheet: what the customer asked for, priced, put
   in front of somebody who may say yes. It never leaves the
   company and it never reaches the customer, which is what makes
   it different from the quotation it often comes from.

   Two things follow from that, and both are on the paper.

   The stock figures are here for the same reason they are on a
   purchase request: the person signing is deciding whether the
   company can actually do this, and "is it on the shelf" is half
   that question. They are indicative and the sheet says so —
   nothing is reserved until the order is confirmed.

   And the price floor. A request that skipped the quotation
   skipped the floor with it, so the level this document needs is
   frozen at submission and shown here, beside the person who has
   to decide whether they are allowed to sign it.
   ============================================================ */

/** A line with what the warehouse could serve today, worked out live. */
type Line = SrRow["items"][number] & { avail: number | null; short: number };

const ITEM_COLUMNS: PaperColumn<Line>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, displayName(l)) },
  {
    key: "qty",
    label: "Qty",
    th: "จำนวน",
    align: "right",
    width: "w-[76px]",
    cell: (l) => <span className="font-medium">{fmt(l.qty)}</span>,
  },
  { key: "unit", label: "Unit", width: "w-[70px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  /* Read live off the stock master on every paint, never stored on the
     request: a document raised last week must not report a shelf that has
     been emptied since. */
  {
    key: "avail",
    label: "Available",
    th: "พร้อมขาย",
    align: "right",
    width: "w-[92px]",
    cell: (l) => <span className="text-ink-2">{l.avail === null ? DASH : fmt(l.avail)}</span>,
  },
  {
    key: "short",
    label: "Short",
    th: "ขาด",
    align: "right",
    width: "w-[76px]",
    cell: (l) =>
      l.short > 0 ? (
        <span className="font-semibold text-warning-text">{fmt(l.short)}</span>
      ) : (
        <span className="text-ink-3">{DASH}</span>
      ),
  },
  { key: "price", label: "Unit Price", align: "right", width: "w-[100px]", cell: (l) => money(l.price) },
  {
    key: "disc",
    label: "Disc %",
    align: "right",
    width: "w-[76px]",
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

export function SalesRequestDocument({ record }: { record: SalesRequest }) {
  const sr = record as SrRow;
  const bp = getCustomer(sr.customerCode);
  const qt = sr.quotationRef ? getQT(sr.quotationRef) : null;
  const form = docForm("sales-request", sr.billType);
  const totals = recordTotals(sr);
  const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);
  const taxed = (sr.items ?? []).some((l) => Number(l.tax) > 0);

  const lines: Line[] = (sr.items ?? []).map((it) => {
    const a = availabilityFor(it.code, Number(it.qty));
    return { ...it, avail: a?.available ?? null, short: a?.shortBy ?? 0 };
  });

  /* Which desk this one needs. Frozen at submission on the record; worked out
     from the lines while it is still a draft, so the salesperson can see the
     escalation coming rather than meeting it at the moment they submit. */
  const level =
    sr.status === "Draft" ? priceApproval(sr.items ?? []).level : sr.priceApprovalLevel;

  const notices: (DocNotice | false)[] = [
    /* The standing caveat on every request, and the reason it is not an
       order: nothing here holds any stock. */
    {
      tone: "info",
      title: "คำขอขายไม่จองสต๊อก",
      message:
        "จำนวนคงเหลือที่แสดงเป็นข้อมูลอ้างอิงเท่านั้น สต๊อกจะถูกจองเมื่อยืนยันใบสั่งขาย",
    },
    sr.status === "Rejected" && {
      tone: "danger",
      title: "คำขอขายไม่ได้รับอนุมัติ",
      message: `เหตุผล: ${sr.rejectReason || "ไม่ระบุ"} — แก้ไขแล้วส่งขออนุมัติใหม่ได้`,
    },
    level === "manager" && {
      tone: "warn",
      title: "ต้องให้ผู้จัดการฝ่ายขายอนุมัติ",
      message: `มีรายการต่ำกว่าราคาขั้นต่ำ — แอดมินฝ่ายขายเซ็นใบนี้ไม่ได้${
        sr.uncheckedPriceLines
          ? ` · อีก ${fmt(sr.uncheckedPriceLines)} รายการไม่มีราคาตั้งให้เทียบ`
          : ""
      }`,
    },
    sr.isUrgent && {
      tone: "warn",
      title: "ใกล้ถึงกำหนดที่ลูกค้าต้องการ",
      message: `ลูกค้าต้องการของวันที่ ${sr.requiredDate}${
        sr.daysToRequired !== null && sr.daysToRequired >= 0
          ? ` — เหลืออีก ${sr.daysToRequired} วัน`
          : " — เลยกำหนดแล้ว"
      }`,
    },
    !credit.withinLimit && {
      tone: "warn",
      title: "มูลค่าเกินวงเงินเครดิตของลูกค้า",
      message: `วงเงินคงเหลือ ${money0(credit.available)} บาท — อนุมัติได้ แต่ใบสั่งขายที่แปลงออกมาจะถูกตั้งเป็น On Hold`,
    },
    ...(bp ? tierNotices(bp) : []).map(
      (n) => ({ tone: n.tone, title: n.title, message: n.message }) as DocNotice,
    ),
  ];

  return (
    <DocPage backTo="/m/sales-request" backLabel="Back to Sales Request List">
      <DocPaper testId="sales-request-document">
        <DocHeader
          title={form?.config.titleEN ?? "SALES REQUEST"}
          titleTh={form?.config.titleTH ?? "ใบขอขาย"}
          code={sr.code}
          status={sr.status}
          /* Internal paper. Nobody outside the company ever holds it, so
             there is nobody to scan a verification mark. */
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="Customer" titleTh="ลูกค้า">
            <DocPanelRow label="ลูกค้า" value={sr.customer} />
            <DocPanelRow label="รหัสลูกค้า" value={sr.customerCode} />
            <DocPanelRow label="เลขผู้เสียภาษี" value={bp?.tax?.taxId} />
            <DocPanelRow label="อ้างอิงลูกค้า" value={sr.customerRef} />
            <DocPanelRow label="ช่องทางขาย" value={sr.channel} />
            <DocPanelRow label="เงื่อนไขชำระ" value={sr.payTerm} />
          </DocPanel>

          <DocPanel title="Ship To" titleTh="สถานที่ส่งของ">
            {/* "Same as billing" and "nobody filled it in" are different
                answers, and the flag is the only thing that tells them apart. */}
            {sr.sameAsBill ? (
              <p className="text-[13px] text-ink-2">ตามที่อยู่ลูกค้า</p>
            ) : (
              <>
                <DocPanelRow label="ชื่อผู้รับ" value={sr.shipName} />
                <DocPanelText value={sr.shipAddress} />
              </>
            )}
            <DocPanelRow label="ผู้ติดต่อ" value={sr.shipContact} />
            <DocPanelRow label="โทรศัพท์" value={sr.shipPhone} />
            <DocPanelRow label="คลังที่จะจ่ายของ" value={sr.warehouse} />
            {sr.shipInstruction && (
              <p className="mt-1 rounded-card border border-info bg-info-soft px-2 py-1 text-cap text-info-text">
                {sr.shipInstruction}
              </p>
            )}
          </DocPanel>

          <DocPanel title="Request" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={sr.code} />
            <DocPanelRow label="วันที่ขอ" value={sr.requestDate} />
            <DocPanelRow
              label="ลูกค้าต้องการวันที่"
              value={
                sr.daysToRequired !== null && sr.daysToRequired < 0 ? (
                  <span className="font-semibold text-danger">{sr.requiredDate}</span>
                ) : (
                  sr.requiredDate
                )
              }
            />
            <DocPanelRow label="ผู้แทนขาย" value={sr.salesRep} />
            <DocPanelRow label="ราคาตามรายการ" value={sr.priceList} />
            <DocPanelRow label="ประเภทบิล" value={sr.billType} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(SRQ_TONE, sr.status)}>{sr.status}</Badge>}
            />
            <DocPanelRow
              label="ความเร่งด่วน"
              value={<Badge tone={tone(PRIORITY_TONE, sr.priority)}>{sr.priority}</Badge>}
            />
            <DocPanelRow
              label="ใบเสนอราคา"
              value={qt ? qt.code : <span className="text-ink-3">ไม่มี — ลูกค้าติดต่อตรง</span>}
            />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={lines} minWidth={960} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <div className="flex flex-col gap-4">
            <DocPanel title="Note" titleTh="หมายเหตุ">
              <DocPanelText value={sr.note} />
            </DocPanel>

            {/* Where the approver's own question gets answered: can this
                customer carry it. Internal paper, so the credit position may
                sit on the sheet — it never could on a quotation. */}
            <DocPanel title="Credit Position" titleTh="สถานะเครดิตลูกค้า">
              <DocPanelRow
                label="วงเงิน"
                value={credit.cashOnly ? "เงินสดเท่านั้น" : `${money0(credit.limit)} บาท`}
              />
              <DocPanelRow label="ยอดค้างชำระ" value={`${money0(credit.outstanding)} บาท`} />
              <DocPanelRow label="วงเงินคงเหลือ" value={`${money0(credit.available)} บาท`} />
              <DocPanelRow
                label="หลังรวมคำขอนี้"
                value={
                  <span className={credit.withinLimit ? "" : "font-semibold text-danger"}>
                    {money0(credit.projected)} บาท
                  </span>
                }
              />
            </DocPanel>
          </div>

          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="รวมเป็นเงิน" value={`${money0(totals.subtotal)} ${sr.currency}`} />
            <DocPanelRow label="ส่วนลดรายการ" value={`${money0(totals.lineDiscount)} ${sr.currency}`} />
            {totals.headerDiscount > 0 && (
              <DocPanelRow label="ส่วนลดท้ายบิล" value={`${money0(totals.headerDiscount)} ${sr.currency}`} />
            )}
            {totals.freight > 0 && (
              <DocPanelRow label="ค่าขนส่ง" value={`${money0(totals.freight)} ${sr.currency}`} />
            )}
            {totals.otherCharges > 0 && (
              <DocPanelRow label="ค่าใช้จ่ายอื่น" value={`${money0(totals.otherCharges)} ${sr.currency}`} />
            )}
            {taxed && (
              <DocPanelRow label="ภาษีมูลค่าเพิ่ม" value={`${money0(totals.vat)} ${sr.currency}`} />
            )}
            <DocPanelRow
              label="ยอดรวมทั้งสิ้น"
              value={<strong>{`${money0(totals.grandTotal)} ${sr.currency}`}</strong>}
            />
            <DocPanelRow label="จำนวนรายการ" value={`${fmt(sr.itemCount)} รายการ`} />
          </DocPanel>
        </div>

        <DocRemarks config={form?.config ?? null} />

        <div className="mt-6">
          <SignatureRow
            blocks={docSignatures(form?.config ?? null, {
              preparedBy: { by: sr.createdBy, role: "ผู้แทนขาย", at: sr.created },
              approvedBy: sr.approvedBy
                ? {
                    by: sr.approvedBy,
                    role: level === "manager" ? "ผู้จัดการฝ่ายขาย" : "แอดมินฝ่ายขาย",
                    at: sr.approvedDate || historySignature(sr.history, "Approved")?.at,
                  }
                : undefined,
            })}
          />
        </div>
      </DocPaper>

      <SrDecisionBar sr={sr} level={level} />

      <RelatedStrip
        items={[
          Boolean(sr.quotationRef) && {
            label: "ใบเสนอราคา",
            code: sr.quotationRef,
            entity: "quotation",
            sub: qt?.status,
          },
          Boolean(sr.soRef) && { label: "ใบสั่งขาย", code: sr.soRef, entity: "sales-order" },
        ]}
      />

      <HistoryStrip rows={historyRows(sr.history)} />

      <CommentThread
        docCode={sr.code}
        people={[sr.createdBy, sr.salesRep, sr.updatedBy, ...(sr.history ?? []).map((h) => h.u)]}
        departments={["Sales"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

/**
 * What this chair may do with this request.
 *
 * The rep raises and submits; approving, converting and reopening belong to
 * whoever holds `approve` on the module — the same predicate the list menu
 * asks, so the button under the paper and the one on the row cannot disagree.
 * Whether that approver may sign THIS request is a second question, and it is
 * `srApprove` that answers it: the price level decides between the sales admin
 * and the manager, and a refusal there says who to send it to.
 */
function SrDecisionBar({ sr, level }: { sr: SrRow; level: string }) {
  const ctx = useActionCtx();
  const mayApprove = can("sales-request", "approve");

  const acts = docActs([
    sr.status === "Draft" && {
      key: "submit",
      label: "ส่งขออนุมัติ",
      icon: "send" as const,
      variant: "primary" as const,
      run: () => srSubmit(sr, ctx),
    },
    sr.status === "Submitted" &&
      mayApprove && {
        key: "approve",
        label: "Approve",
        icon: "checkCircle" as const,
        variant: "primary" as const,
        run: () => srApprove(sr, ctx),
      },
    sr.status === "Submitted" &&
      mayApprove && {
        key: "reject",
        label: "Reject",
        icon: "xCircle" as const,
        variant: "danger" as const,
        run: () => srReject(sr, ctx),
      },
    sr.isConvertible &&
      mayApprove && {
        key: "convert",
        label: "เปิดใบสั่งขาย",
        icon: "salesOrder" as const,
        variant: "primary" as const,
        run: () => srConvert(sr, ctx),
      },
    /* Only while nothing has been raised against it. Once an order exists the
       request is history, and history does not go back to being a draft. */
    sr.status === "Approved" &&
      !sr.soRef &&
      mayApprove && {
        key: "reopen",
        label: "เปิดกลับเป็นร่าง",
        icon: "refresh" as const,
        run: () => srReopen(sr, ctx),
      },
    !["Cancelled", "Converted"].includes(sr.status) && {
      key: "cancel",
      label: "ยกเลิกคำขอ",
      icon: "circleSlash" as const,
      variant: "danger" as const,
      run: () => srCancel(sr, ctx),
    },
  ]);

  const note = !acts.length
    ? idleNote(sr.status)
    : sr.status === "Submitted"
      ? level === "manager"
        ? "รออนุมัติ — ใบนี้ต่ำกว่าราคาขั้นต่ำ ต้องให้ผู้จัดการฝ่ายขายเซ็น"
        : `รออนุมัติภายใน — ส่งขออนุมัติเมื่อ ${sr.updated}`
      : sr.approvedBy
        ? `อนุมัติโดย ${sr.approvedBy}${sr.approvedDate ? ` เมื่อ ${sr.approvedDate}` : ""}`
        : `สถานะ ${sr.status} — มูลค่า ${money0(sr.amount)} ${sr.currency}`;

  return (
    <DecisionBar
      testId="sr-decision-bar"
      note={note}
      acts={acts}
      before={<DocPrintButton entity="sales-request" record={sr} label="พิมพ์คำขอขาย" />}
    />
  );
}
