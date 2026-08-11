"use client";

import type { InvLine, SalesInvoice } from "@/data/sales-invoices";
import {
  billingWarnings,
  customerOutstanding,
  invoiceTotals,
  lineAmount,
  lineDiscount,
  lineTaxAmount,
  type InvRow,
} from "@/lib/domain/invoice";
import { invoiceShipping } from "@/lib/domain/shipment";
import { displayName } from "@/lib/domain/lines";
import {
  invApprove,
  invCancel,
  invCreditNote,
  invIssue,
  invReject,
  invSubmit,
  invVoid,
} from "@/lib/workflows-invoice";
import { bahtText } from "@/lib/print";
import { DASH, fmt, money } from "@/lib/format";
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
import { INV_TONE, PAY_TONE, tone } from "@/lib/badges";

/* ============================================================
   SALES INVOICE — the document, read

   The sheet with legal weight. Everything upstream is a promise;
   this is the one the Revenue Department reads and the one the
   customer pays against, so it is the one that most deserved to
   stop being eight tabs of cards.

   Two things are on the paper that no other outbound document
   carries: the tax block — who is being billed, under which tax
   ID, at what rate — and the amount in words, which is what a
   Thai tax document is required to show and what makes a figure
   hard to alter after signing.
   ============================================================ */

/** The item columns, built once the tax mode is known — it moves the maths. */
const itemColumns = (taxMode: string): PaperColumn<InvLine>[] => [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, displayName(l)) },
  {
    key: "qty",
    label: "Qty",
    th: "จำนวน",
    align: "right",
    width: "w-[80px]",
    cell: (l) => <span className="font-medium">{fmt(l.invoiceQty)}</span>,
  },
  { key: "unit", label: "Unit", width: "w-[70px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  {
    key: "price",
    label: "Unit Price",
    th: "ราคาต่อหน่วย",
    align: "right",
    width: "w-[104px]",
    /* A price the biller overrode is flagged on the line, because the reason
       for it is the thing an approver is here to read. */
    cell: (l) =>
      l.priceOverride ? (
        <span className="font-semibold text-warning-text" title={l.overrideReason}>
          {money(l.unitPrice)} *
        </span>
      ) : (
        money(l.unitPrice)
      ),
  },
  {
    key: "disc",
    label: "Discount",
    th: "ส่วนลด",
    align: "right",
    width: "w-[96px]",
    cell: (l) => {
      const off = lineDiscount(l);
      return off ? <span className="text-ink-2">{money(off)}</span> : <span className="text-ink-3">{DASH}</span>;
    },
  },
  {
    key: "tax",
    label: "VAT",
    th: "ภาษี",
    align: "right",
    width: "w-[96px]",
    cell: (l) => (
      <span className="text-ink-2">
        {l.taxRate ? `${money(lineTaxAmount(l, taxMode))} (${l.taxRate}%)` : DASH}
      </span>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    th: "จำนวนเงิน",
    align: "right",
    width: "w-[118px]",
    cell: (l) => <span className="font-medium">{money(lineAmount(l))}</span>,
  },
];

export function SalesInvoiceDocument({ record }: { record: SalesInvoice }) {
  const inv = record as InvRow;
  const form = docForm("sales-invoice");
  const t = invoiceTotals(inv);
  const warnings = billingWarnings(inv);
  /* Read through `shipmentRef`; this invoice stores none of it. Null when the
     goods have not been handed to a carrier yet, and then the panel is left
     off rather than shown as a column of dashes. */
  const ship = invoiceShipping(inv);

  const notices: (DocNotice | false)[] = [
    inv.status === "Void" && {
      tone: "danger",
      title: "ใบแจ้งหนี้ถูก Void",
      message: `${inv.voidReason || "ไม่ระบุเหตุผล"} — อนุมัติโดย ${inv.voidBy || DASH}`,
    },
    inv.status === "Cancelled" && {
      tone: "warn",
      title: "ใบแจ้งหนี้ถูกยกเลิก",
      message: inv.cancelReason || "ไม่ระบุเหตุผล",
    },
    inv.isOverdue && {
      tone: "danger",
      title: `เกินกำหนดชำระ ${fmt(inv.daysOverdue ?? 0)} วัน`,
      message: `ครบกำหนด ${inv.dueDate} — ค้างชำระ ${money(inv.outstanding)} ${inv.currency}`,
    },
    warnings.length > 0 && {
      tone: "warn",
      title: "ข้อมูลสำหรับออกใบกำกับภาษียังไม่ครบ",
      message: warnings.join(" · "),
    },
    Boolean(inv.billTypeDrift) && {
      tone: "warn",
      title: `ใบนี้เรียกเก็บแบบ ${inv.effectiveBillType}`,
      message: `${inv.billTypeDrift!.label} ${inv.billTypeDrift!.code} เป็น ${inv.billTypeDrift!.billType} — ตรวจสอบก่อนออกเอกสาร`,
    },
    inv.hasPriceOverride && {
      tone: "warn",
      title: "มีการแก้ราคาต่างจากเอกสารต้นทาง",
      message: (inv.items ?? [])
        .filter((l) => l.priceOverride)
        .map((l) => `${l.code}: ${l.overrideReason || "ไม่ระบุเหตุผล"}`)
        .join(" · "),
    },
    Boolean(inv.creditNoteRef) && {
      tone: "info",
      title: "มีใบลดหนี้ผูกอยู่",
      message: `ออกใบลดหนี้ ${inv.creditNoteRef} จากใบแจ้งหนี้นี้แล้ว`,
    },
  ];

  return (
    <DocPage backTo="/m/sales-invoice" backLabel="Back to Sales Invoice List">
      <DocPaper testId="sales-invoice-document">
        <DocHeader
          title={form?.config.titleEN ?? "SALES INVOICE"}
          titleTh={form?.config.titleTH ?? "ใบแจ้งหนี้"}
          code={inv.code}
          status={inv.status}
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          {/* The name the tax invoice is issued to is not always the trading
              name — billingName wins when it is set. */}
          <DocPanel title="Bill To" titleTh="ผู้ซื้อ">
            <p className="text-[13px] font-medium">{inv.billingName || inv.customer}</p>
            <DocPanelText value={inv.billingAddress} />
            <DocPanelRow label="รหัสลูกค้า" value={inv.customerCode} />
            <DocPanelRow label="เลขผู้เสียภาษี" value={inv.taxId} />
            <DocPanelRow label="สาขา" value={inv.branchNo} />
            <DocPanelRow label="ผู้ติดต่อ" value={inv.contactPerson} />
            <DocPanelRow label="โทรศัพท์" value={inv.phone} />
          </DocPanel>

          <DocPanel title="Terms" titleTh="เงื่อนไข">
            <DocPanelRow label="วันที่ออก" value={inv.invoiceDate} />
            <DocPanelRow
              label="ครบกำหนดชำระ"
              value={
                inv.isOverdue ? <span className="font-semibold text-danger">{inv.dueDate}</span> : inv.dueDate
              }
            />
            <DocPanelRow label="เงื่อนไขชำระ" value={inv.payTerm} />
            <DocPanelRow label="เครดิต" value={`${fmt(inv.creditDays)} วัน`} />
            <DocPanelRow label="ราคาตามรายการ" value={inv.priceList} />
            <DocPanelRow label="สกุลเงิน" value={inv.currency} />
            <DocPanelRow label="ผู้แทนขาย" value={inv.salesRep} />
          </DocPanel>

          <DocPanel title="Document" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={inv.code} />
            <DocPanelRow label="ประเภทใบกำกับ" value={inv.taxInvoiceType} />
            <DocPanelRow label="เอกสารต้นทาง" value={inv.sourceDoc || "Manual"} />
            <DocPanelRow label="เลข PO ลูกค้า" value={inv.customerPo} />
            <DocPanelRow label="สาขาที่ออก" value={inv.branch} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(INV_TONE, inv.status)}>{inv.status}</Badge>}
            />
            <DocPanelRow
              label="การชำระเงิน"
              value={<Badge tone={tone(PAY_TONE, inv.paymentStatus)}>{inv.paymentStatus}</Badge>}
            />
            <DocPanelRow label="วิธีคิดภาษี" value={`${inv.taxMode} · ${inv.vatRate}%`} />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={itemColumns(inv.taxMode)} rows={inv.items ?? []} minWidth={960} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(300px,380px)] gap-5 max-[1000px]:grid-cols-1">
          <div className="flex flex-col gap-4">
            <DocPanel title="Notes" titleTh="หมายเหตุ">
              <DocPanelText value={inv.note} />
            </DocPanel>

            {/* Required on a Thai tax document, and the reason a total is hard
                to alter after it has been signed. */}
            <DocPanel title="Amount in Words" titleTh="จำนวนเงินเป็นตัวอักษร">
              <p className="text-[13px] font-semibold">{bahtText(t.grandTotal)}</p>
            </DocPanel>

            {ship && (
              <DocPanel title="Shipping" titleTh="การจัดส่ง">
                <DocPanelRow label="รอบขนส่ง" value={ship.shipmentCode} />
                <DocPanelRow label="ผู้ขนส่ง" value={ship.carrier} />
                <DocPanelRow label="เลขพัสดุ" value={ship.trackingNo || "ยังไม่ได้ใส่เลขพัสดุ"} />
                <DocPanelRow label="สถานะส่ง" value={ship.deliveryStatus} />
                <DocPanelRow label="วันที่ส่งจริง" value={ship.actualDelivery || "ยังไม่ถึงปลายทาง"} />
              </DocPanel>
            )}
          </div>

          <DocPanel title="Summary" titleTh="สรุปยอด">
            <DocPanelRow label="รวมเป็นเงิน" value={money(t.subtotal)} />
            <DocPanelRow label="ส่วนลดรายการ" value={money(t.lineDiscount)} />
            {t.headerDiscount > 0 && (
              <DocPanelRow label="ส่วนลดท้ายบิล" value={money(t.headerDiscount)} />
            )}
            {t.freight > 0 && <DocPanelRow label="ค่าขนส่ง" value={money(t.freight)} />}
            {t.otherCharges > 0 && <DocPanelRow label="ค่าใช้จ่ายอื่น" value={money(t.otherCharges)} />}
            <DocPanelRow label="ฐานภาษี" value={money(t.taxable)} />
            <DocPanelRow label={`ภาษีมูลค่าเพิ่ม ${inv.vatRate}%`} value={money(t.tax)} />
            {inv.withholdingTax > 0 && (
              <DocPanelRow label={`หัก ณ ที่จ่าย ${inv.withholdingTax}%`} value={money(t.withholding)} />
            )}
            {t.rounding !== 0 && <DocPanelRow label="ปัดเศษ" value={money(t.rounding)} />}
            <DocPanelRow
              label="ยอดรวมทั้งสิ้น"
              value={<strong>{`${money(t.grandTotal)} ${inv.currency}`}</strong>}
            />
            <DocPanelRow label="ชำระแล้ว" value={`${money(inv.paidAmount)} · ${inv.paidPct}%`} />
            <DocPanelRow
              label="ค้างชำระ"
              value={
                inv.outstanding > 0 ? (
                  <strong className="text-danger">{money(inv.outstanding)}</strong>
                ) : (
                  money(0)
                )
              }
            />
          </DocPanel>
        </div>

        <DocRemarks config={form?.config ?? null} />

        <div className="mt-6">
          <SignatureRow
            blocks={docSignatures(form?.config ?? null, {
              preparedBy: { by: inv.createdBy, role: "ผู้จัดทำ", at: inv.created },
              checkedBy: (() => {
                const s = historySignature(inv.history, "Approved");
                return s && { by: s.by, role: "ผู้ตรวจสอบ", at: s.at };
              })(),
              authorizedBy: (() => {
                const s = historySignature(inv.history, "Issued");
                return s && { by: s.by, role: "ผู้มีอำนาจลงนาม", at: s.at };
              })(),
            })}
          />
        </div>
      </DocPaper>

      <InvDecisionBar inv={inv} />

      <RelatedStrip
        items={[
          Boolean(inv.sourceDoc) && {
            label: inv.sourceType,
            code: inv.sourceDoc,
            entity:
              inv.sourceType === "Sales Order"
                ? "sales-order"
                : inv.sourceType === "Delivery Order"
                  ? "delivery-order"
                  : undefined,
          },
          Boolean(inv.creditNoteRef) && {
            label: "ใบลดหนี้",
            code: inv.creditNoteRef,
            entity: "credit-note",
          },
          Boolean(ship) && { label: "รอบขนส่ง", code: ship!.shipmentCode, entity: "shipment" },
        ]}
      />

      <HistoryStrip rows={historyRows(inv.history)} />

      <CommentThread
        docCode={inv.code}
        people={[inv.createdBy, inv.updatedBy, inv.salesRep]}
        /* An invoice is argued over by the people who raised it, the desk
           that approves it and whoever chases the payment. */
        departments={["Sales", "Finance", "Accounting"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

function InvDecisionBar({ inv }: { inv: InvRow }) {
  const ctx = useActionCtx();

  const acts = docActs([
    inv.status === "Draft" && {
      key: "submit",
      label: "ส่งตรวจสอบ",
      icon: "send" as const,
      variant: "primary" as const,
      run: () => invSubmit(inv, ctx),
    },
    inv.status === "Pending Review" && {
      key: "approve",
      label: "อนุมัติ",
      icon: "checkCircle" as const,
      variant: "primary" as const,
      run: () => invApprove(inv, ctx),
    },
    inv.status === "Pending Review" && {
      key: "revise",
      label: "ส่งกลับให้แก้",
      icon: "refresh" as const,
      run: () => invReject(inv, ctx),
    },
    inv.isIssuable && {
      key: "issue",
      label: "ออกใบแจ้งหนี้",
      icon: "invoice" as const,
      variant: "primary" as const,
      run: () => invIssue(inv, ctx),
    },
    inv.canCreditNote && {
      key: "credit-note",
      label: "ออกใบลดหนี้",
      icon: "creditNote" as const,
      run: () => invCreditNote(inv, ctx),
    },
    ["Draft", "Pending Review", "Approved"].includes(inv.status) && {
      key: "cancel",
      label: "ยกเลิกใบแจ้งหนี้",
      icon: "circleSlash" as const,
      variant: "danger" as const,
      run: () => invCancel(inv, ctx),
    },
    /* Void, not cancel, once it has been issued: an issued invoice has a tax
       number the Revenue Department has seen, and that number cannot simply
       disappear. */
    ["Issued", "Partially Paid", "Overdue"].includes(inv.status) && {
      key: "void",
      label: "Void ใบแจ้งหนี้",
      icon: "xCircle" as const,
      variant: "danger" as const,
      run: () => invVoid(inv, ctx),
    },
  ]);

  const note = !acts.length
    ? idleNote(inv.status)
    : inv.isOverdue
      ? `เกินกำหนดชำระ ${fmt(inv.daysOverdue ?? 0)} วัน — ค้าง ${money(inv.outstanding)} ${inv.currency}`
      : `สถานะ ${inv.status} · ${inv.paymentStatus} — ลูกค้ารายนี้ค้างรวม ${money(customerOutstanding(inv.customerCode))} ${inv.currency}`;

  return (
    <DecisionBar
      testId="inv-decision-bar"
      note={note}
      acts={acts}
      before={<DocPrintButton entity="sales-invoice" record={inv} />}
    />
  );
}
