"use client";

import type { SalesOrder } from "@/data/sales-orders";
import {
  creditCheck,
  getCustomer,
  soCloseBlocked,
  soLinkedDocs,
  type SoRow,
} from "@/lib/domain/outbound";
import { tierNotices } from "@/lib/domain/price-tier";
import { displayName, lineNet, recordTotals } from "@/lib/domain/lines";
import { can } from "@/lib/domain/admin";
import {
  soApproveCredit,
  soCancel,
  soClose,
  soConfirm,
  soCreateInvoice,
  soCreatePick,
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
import { SO_TONE, PRIORITY_TONE, tone } from "@/lib/badges";

/* ============================================================
   SALES ORDER — the document, read

   The sheet that binds the company: an approved price and a
   customer's yes. It used to open as four tabs of cards, so the
   person deciding whether to release it to the warehouse read a
   summary of the order rather than the order.

   What a sales order says that a quotation does not is how much
   of it has actually left the building. Ordered, picked,
   delivered and outstanding sit on the line itself, because
   "which of these twelve lines is still owed" is the question
   asked in front of this paper, and it is a per-line question.
   ============================================================ */

type Line = SoRow["items"][number];

const ITEM_COLUMNS: PaperColumn<Line>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, displayName(l)) },
  {
    key: "qty",
    label: "Ordered",
    th: "สั่ง",
    align: "right",
    width: "w-[76px]",
    cell: (l) => <span className="font-medium">{fmt(l.qty)}</span>,
  },
  {
    key: "picked",
    label: "Picked",
    th: "หยิบแล้ว",
    align: "right",
    width: "w-[76px]",
    cell: (l) => <span className="text-ink-2">{fmt(l.picked)}</span>,
  },
  {
    key: "delivered",
    label: "Delivered",
    th: "ส่งแล้ว",
    align: "right",
    width: "w-[80px]",
    cell: (l) => fmt(l.delivered),
  },
  {
    key: "outstanding",
    label: "Outstanding",
    th: "ค้างส่ง",
    align: "right",
    width: "w-[86px]",
    /* The number the warehouse and the salesperson both come here for. */
    cell: (l) => {
      const left = Math.max(0, Number(l.qty) - Number(l.delivered));
      return left > 0 ? (
        <span className="font-semibold text-warning-text">{fmt(left)}</span>
      ) : (
        <span className="text-ink-3">{DASH}</span>
      );
    },
  },
  { key: "unit", label: "Unit", width: "w-[70px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  { key: "price", label: "Unit Price", align: "right", width: "w-[100px]", cell: (l) => money(l.price) },
  {
    key: "disc",
    label: "Disc %",
    align: "right",
    width: "w-[70px]",
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

export function SalesOrderDocument({ record }: { record: SalesOrder }) {
  const so = record as SoRow;
  const bp = getCustomer(so.customerCode);
  const form = docForm("sales-order", so.billType);
  const totals = recordTotals(so);
  const credit = creditCheck(`${so.customerCode} - ${so.customer}`, so.total);
  const linked = soLinkedDocs(so.code);
  const taxed = (so.items ?? []).some((l) => Number(l.tax) > 0);

  /* Everything somebody must know before releasing this order to the floor.
     On the paper, above the lines — a credit hold read after the decision is
     a credit hold read too late. */
  const notices: (DocNotice | false)[] = [
    so.status === "On Hold" && {
      tone: "danger",
      title: "ใบสั่งขายถูกระงับด้วยเหตุผลด้านเครดิต",
      message: `${so.creditNote || "เกินวงเงินเครดิต"} — ต้องได้รับอนุมัติจากฝ่ายบัญชีก่อนจึงจะจัดของได้`,
    },
    Boolean(so.billTypeDrift) && {
      tone: "warn",
      title: `ประเภทบิลต่างจากเอกสารต้นทาง — ${so.billType}`,
      message: `${so.billTypeDrift!.label} ${so.billTypeDrift!.code} เป็น ${so.billTypeDrift!.billType} — การเปลี่ยนประเภทบิลย้ายภาษีทั้งใบ ตรวจสอบก่อนออกใบแจ้งหนี้`,
    },
    so.isOverdue && {
      tone: "warn",
      title: "เลยกำหนดส่งมอบแล้ว",
      message: `กำหนดส่ง ${so.deliveryDate} — ยังส่งมอบไม่ครบ คงเหลือ ${fmt(so.outstandingQty)} หน่วย`,
    },
    /* Which price tier this customer is on, and anything odd about how it was
       decided — the same notice the editors show, read back where the order
       that used those prices is read. */
    ...(bp ? tierNotices(bp) : []).map(
      (n) => ({ tone: n.tone, title: n.title, message: n.message }) as DocNotice,
    ),
  ];

  return (
    <DocPage backTo="/m/sales-order" backLabel="Back to Sales Order List">
      <DocPaper testId="sales-order-document">
        <DocHeader
          title={form?.config.titleEN ?? "SALES ORDER"}
          titleTh={form?.config.titleTH ?? "ใบสั่งขาย"}
          code={so.code}
          status={so.status}
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="Bill To" titleTh="ลูกค้า">
            <DocPanelRow label="ลูกค้า" value={so.customer} />
            <DocPanelRow label="รหัสลูกค้า" value={so.customerCode} />
            <DocPanelRow label="เลขผู้เสียภาษี" value={bp?.tax?.taxId} />
            <DocPanelRow label="เลข PO ลูกค้า" value={so.customerPo} />
            <DocPanelRow label="ผู้แทนขาย" value={so.salesRep} />
          </DocPanel>

          <DocPanel title="Ship To" titleTh="สถานที่ส่งของ">
            <DocPanelText value={so.shipTo} />
            <DocPanelRow label="ผู้รับ" value={so.shipContact} />
            <DocPanelRow label="โทรศัพท์" value={so.shipPhone} />
            {/* The only line on this sheet written purely for the driver. It
                rides to the delivery note, so it is shown where the person
                who typed it can still see whether it survived. */}
            {so.shipInstruction && (
              <p className="mt-1 rounded-card border border-info bg-info-soft px-2 py-1 text-cap text-info-text">
                {so.shipInstruction}
              </p>
            )}
          </DocPanel>

          <DocPanel title="Order" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={so.code} />
            <DocPanelRow label="วันที่สั่ง" value={so.orderDate} />
            <DocPanelRow
              label="กำหนดส่ง"
              value={
                so.isOverdue ? (
                  <span className="font-semibold text-danger">{so.deliveryDate}</span>
                ) : (
                  so.deliveryDate
                )
              }
            />
            <DocPanelRow label="คลังสินค้า" value={so.warehouse} />
            <DocPanelRow label="เงื่อนไขชำระ" value={so.payTerm} />
            <DocPanelRow label="Incoterm" value={so.incoterm} />
            <DocPanelRow label="ประเภทบิล" value={so.billType} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(SO_TONE, so.status)}>{so.status}</Badge>}
            />
            <DocPanelRow
              label="ความเร่งด่วน"
              value={<Badge tone={tone(PRIORITY_TONE, so.priority)}>{so.priority}</Badge>}
            />
            <DocPanelRow
              label="เครดิต"
              value={
                <Badge tone={so.creditApproved ? "success" : "danger"}>
                  {so.creditApproved ? "Approved" : "On Hold"}
                </Badge>
              }
            />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={so.items ?? []} minWidth={920} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Remarks" titleTh="หมายเหตุ">
            <DocPanelText value={so.remark} />
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="รวมเป็นเงิน" value={`${money0(totals.subtotal)} ${so.currency}`} />
            <DocPanelRow label="ส่วนลดรายการ" value={`${money0(totals.lineDiscount)} ${so.currency}`} />
            {totals.headerDiscount > 0 && (
              <DocPanelRow label="ส่วนลดท้ายบิล" value={`${money0(totals.headerDiscount)} ${so.currency}`} />
            )}
            {totals.freight > 0 && (
              <DocPanelRow label="ค่าขนส่ง" value={`${money0(totals.freight)} ${so.currency}`} />
            )}
            {totals.otherCharges > 0 && (
              <DocPanelRow label="ค่าใช้จ่ายอื่น" value={`${money0(totals.otherCharges)} ${so.currency}`} />
            )}
            {/* A Non VAT order has no tax line at all rather than a zero —
                see the Non VAT print form, which drops the column too. */}
            {taxed && <DocPanelRow label="ภาษีมูลค่าเพิ่ม" value={`${money0(totals.vat)} ${so.currency}`} />}
            <DocPanelRow
              label="ยอดรวมทั้งสิ้น"
              value={<strong>{`${money0(totals.grandTotal)} ${so.currency}`}</strong>}
            />
          </DocPanel>
        </div>

        <DocRemarks config={form?.config ?? null} />

        <div className="mt-6">
          <SignatureRow
            blocks={docSignatures(form?.config ?? null, {
              preparedBy: { by: so.createdBy, role: "ผู้แทนขาย", at: so.created },
              /* Who confirmed it, read back out of the history the workflow
                 wrote — see historySignature. Blank until somebody has. */
              approvedBy: (() => {
                const s = historySignature(so.history, "Confirmed", "Credit approved");
                return s && { by: s.by, role: "ฝ่ายขาย", at: s.at };
              })(),
            })}
          />
        </div>
      </DocPaper>

      <SoDecisionBar so={so} credit={credit} />

      <RelatedStrip
        items={[
          Boolean(so.quotationRef) && {
            label: "ใบเสนอราคา",
            code: so.quotationRef!,
            entity: "quotation",
          },
          Boolean(so.srRef) && { label: "คำขอขาย", code: so.srRef, entity: "sales-request" },
          ...linked.picks.map((p) => ({
            label: "ใบจัดสินค้า",
            code: p.code,
            entity: "picking",
            sub: p.status,
          })),
          ...linked.packs.map((p) => ({
            label: "ใบบรรจุ",
            code: p.code,
            entity: "packing",
            sub: p.status,
          })),
          ...linked.deliveries.map((d) => ({
            label: "ใบส่งสินค้า",
            code: d.code,
            entity: "delivery-order",
            sub: d.status,
          })),
        ]}
      />

      <HistoryStrip rows={historyRows(so.history)} />

      <CommentThread
        docCode={so.code}
        people={[so.createdBy, so.updatedBy, so.salesRep]}
        /* An order crosses the sales desk, the warehouse floor and, when the
           credit is tight, accounting. */
        departments={["Sales", "Warehouse", "Finance"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

/**
 * What this chair may do with this order.
 *
 * Confirming, releasing credit and opening a pick all move stock or money, so
 * they belong to the approver rather than to whoever typed the order — the
 * same `can("sales-order", "approve")` the list menu asks.
 */
function SoDecisionBar({
  so,
  credit,
}: {
  so: SoRow;
  credit: ReturnType<typeof creditCheck>;
}) {
  const ctx = useActionCtx();
  const mayRun = can("sales-order", "approve");
  const closeBlocked = soCloseBlocked(so);

  const acts = docActs([
    so.status === "Draft" &&
      mayRun && {
        key: "confirm",
        label: "ยืนยันใบสั่งขาย",
        icon: "checkCircle" as const,
        variant: "primary" as const,
        run: () => soConfirm(so, ctx),
      },
    so.status === "On Hold" &&
      mayRun && {
        key: "credit",
        label: "อนุมัติเครดิต",
        icon: "shield" as const,
        variant: "primary" as const,
        run: () => soApproveCredit(so, ctx),
      },
    ["Confirmed", "Picking", "Partially Delivered"].includes(so.status) &&
      so.outstandingQty > 0 &&
      mayRun && {
        key: "pick",
        label: "เปิดใบจัดสินค้า",
        icon: "picking" as const,
        /* The order's own next step while it is still whole; once picking has
           started it is one of several things somebody might do. */
        variant: so.status === "Confirmed" ? ("primary" as const) : undefined,
        run: () => soCreatePick(so, ctx),
      },
    ["Confirmed", "Picking", "Partially Delivered", "Completed"].includes(so.status) && {
      key: "invoice",
      label: "ออกใบแจ้งหนี้",
      icon: "invoice" as const,
      run: () => soCreateInvoice(so, ctx),
    },
    /* Offered only once nothing is outstanding — the rule is that an order
       closes when the goods are with the customer, so a button that appeared
       earlier and then refused would just be a button that lies. */
    ["Confirmed", "Picking", "Partially Delivered"].includes(so.status) &&
      so.outstandingQty === 0 &&
      mayRun && {
        key: "close",
        label: "ปิดใบสั่งขาย",
        icon: "checkCircle" as const,
        run: () => soClose(so, ctx),
      },
    !["Cancelled", "Completed"].includes(so.status) && {
      key: "cancel",
      label: "ยกเลิกใบสั่งขาย",
      icon: "circleSlash" as const,
      variant: "danger" as const,
      run: () => soCancel(so, ctx),
    },
  ]);

  const note = !acts.length
    ? idleNote(so.status)
    : so.status === "On Hold"
      ? `เกินวงเงินคงเหลือ ${money0(credit.available)} บาท — รอฝ่ายบัญชีอนุมัติเครดิต`
      : closeBlocked && so.status !== "Draft"
        ? closeBlocked
        : `สถานะ ${so.status} — ส่งมอบแล้ว ${so.deliverPct}% คงเหลือ ${fmt(so.outstandingQty)} หน่วย`;

  return (
    <DecisionBar
      testId="so-decision-bar"
      note={note}
      acts={acts}
      before={<DocPrintButton entity="sales-order" record={so} />}
    />
  );
}
