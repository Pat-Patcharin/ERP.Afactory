"use client";

import type { PurchaseOrder } from "@/data/purchase-orders";
import {
  poRemainingQty,
  poSupplierInfo,
  type PoRow,
} from "@/lib/domain/purchase";
import { can } from "@/lib/domain/admin";
import { poCancel, poIssue, poReceive } from "@/lib/workflows";
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
  DocSection,
  HistoryStrip,
  PaperTable,
  RelatedStrip,
  docActs,
  idleNote,
  lineNoColumn,
  productCell,
  type DocNotice,
  type HistoryRow,
  type PaperColumn,
} from "@/components/document/DocumentView";
import { Badge } from "@/components/ui";
import { PO_TONE, tone } from "@/lib/badges";

/* ============================================================
   PURCHASE ORDER — the document, read

   The sheet the supplier receives. Everything the buy side has
   promised to pay for is on it, which is why it reads as paper
   rather than as four tabs of cards: the person opening it is
   either about to send it out or about to check what arrived
   against it.

   Teal, through `data-doc-family="inbound"`, like every other
   sheet on the buying side.

   WHAT A PURCHASE ORDER HAS THAT NO SELL-SIDE DOCUMENT DOES:
   the supplier's own record. Rating, lead time, on-time
   delivery and what they last charged for these goods sit on
   the paper because "should we be ordering this from them" is
   the question being asked in front of it — and it is answered
   with their history, not with this order's figures.
   ============================================================ */

type Line = PoRow["items"][number];

const ITEM_COLUMNS: PaperColumn<Line>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, l.name) },
  {
    key: "qty",
    label: "Ordered",
    th: "สั่ง",
    align: "right",
    width: "w-[80px]",
    cell: (l) => <span className="font-medium">{fmt(l.qty)}</span>,
  },
  {
    key: "recv",
    label: "Received",
    th: "รับแล้ว",
    align: "right",
    width: "w-[84px]",
    cell: (l) => fmt(l.recv),
  },
  {
    key: "remaining",
    label: "Outstanding",
    th: "ค้างรับ",
    align: "right",
    width: "w-[90px]",
    cell: (l) => {
      const left = Math.max(0, Number(l.qty) - Number(l.recv));
      return left > 0 ? (
        <span className="font-semibold text-warning-text">{fmt(left)}</span>
      ) : (
        <span className="text-ink-3">{DASH}</span>
      );
    },
  },
  { key: "unit", label: "Unit", width: "w-[70px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  { key: "price", label: "Unit Price", align: "right", width: "w-[104px]", cell: (l) => money(l.price) },
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
    width: "w-[116px]",
    cell: (l) => {
      const base = Number(l.qty) * Number(l.price);
      const net = base - base * ((Number(l.disc) || 0) / 100);
      return <span className="font-medium">{money(net + net * ((Number(l.tax) || 0) / 100))}</span>;
    },
  },
];

/** Each receipt raised against this order — what the history strip shows. */
const receiptRows = (po: PoRow): HistoryRow[] =>
  (po.receipts ?? []).map((r) => ({
    title: `รับของ ${r.grn}`,
    detail: `${fmt(r.qty)} หน่วย เข้า ${r.warehouse}`,
    by: r.receiver,
    when: r.date,
    tone: r.status === "Received" ? "success" : "warning",
  }));

export function PurchaseOrderDocument({ record }: { record: PurchaseOrder }) {
  const po = record as PoRow;
  const supplier = poSupplierInfo(po.supplier);
  const remaining = poRemainingQty(po);

  const subtotal = (po.items ?? []).reduce((s, l) => s + Number(l.qty) * Number(l.price), 0);
  const discount = (po.items ?? []).reduce(
    (s, l) => s + Number(l.qty) * Number(l.price) * ((Number(l.disc) || 0) / 100),
    0,
  );
  const total = po.total;
  const tax = total - (subtotal - discount);

  const notices: (DocNotice | false)[] = [
    po.isOverdue && {
      tone: "warn",
      title: "เลยกำหนดรับของแล้ว",
      message: `กำหนดรับ ${po.expectedDate} — ยังค้างรับอีก ${fmt(remaining)} หน่วย`,
    },
    po.status === "Cancelled" && {
      tone: "danger",
      title: "ใบสั่งซื้อถูกยกเลิก",
      message: "เอกสารนี้ไม่มีผลผูกพันกับผู้ขายแล้ว",
    },
    /* A supplier who is late more often than not is worth knowing about at
       the moment the order is being sent, not after it is late. */
    supplier.otd < 90 && {
      tone: "warn",
      title: `ผู้ขายรายนี้ส่งตรงเวลา ${supplier.otd}%`,
      message: `เวลานำเฉลี่ย ${supplier.lead} วัน — เผื่อเวลาก่อนยืนยันวันรับกับฝ่ายที่ขอซื้อ`,
    },
  ];

  return (
    <DocPage family="inbound" backTo="/m/purchase-order" backLabel="Back to Purchase Order List">
      <DocPaper testId="purchase-order-document">
        <DocHeader
          title="PURCHASE ORDER"
          titleTh="ใบสั่งซื้อ"
          code={po.code}
          status={po.status}
          /* The supplier holds this sheet, and there is nothing on our side
             for them to verify it against yet. */
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="Supplier" titleTh="ผู้ขาย">
            <p className="text-[13px] font-medium">{po.supplier}</p>
            <DocPanelRow
              label="คะแนน"
              value={
                <Badge tone={supplier.rating >= 4.5 ? "success" : "neutral"}>
                  ★ {supplier.rating} · {supplier.ratingLabel}
                </Badge>
              }
            />
            <DocPanelRow label="เวลานำเฉลี่ย" value={`${supplier.lead} วัน`} />
            <DocPanelRow
              label="ส่งตรงเวลา"
              value={
                supplier.otd < 90 ? (
                  <span className="font-semibold text-warning-text">{supplier.otd}%</span>
                ) : (
                  `${supplier.otd}%`
                )
              }
            />
            <DocPanelRow
              label="ราคาซื้อครั้งก่อน"
              value={supplier.lastPrice ? `${money(supplier.lastPrice)} · ${supplier.lastDate}` : undefined}
            />
            <DocPanelRow label="ยอดค้างชำระ" value={`${money0(supplier.outstanding)} ${po.currency}`} />
          </DocPanel>

          <DocPanel title="Deliver To" titleTh="ส่งของที่">
            <DocPanelRow label="คลังปลายทาง" value={po.warehouse} />
            <DocPanelRow label="วันที่สั่ง" value={po.orderDate} />
            <DocPanelRow
              label="กำหนดรับ"
              value={
                po.isOverdue ? (
                  <span className="font-semibold text-danger">{po.expectedDate}</span>
                ) : (
                  po.expectedDate
                )
              }
            />
            <DocPanelRow label="Incoterm" value={po.incoterm} />
            <DocPanelRow label="เงื่อนไขชำระ" value={po.payTerm} />
          </DocPanel>

          <DocPanel title="Order" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={po.code} />
            <DocPanelRow label="ผู้สั่งซื้อ" value={po.buyer} />
            <DocPanelRow label="สกุลเงิน" value={`${po.currency} · ${po.fx}`} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(PO_TONE, po.status)}>{po.status}</Badge>}
            />
            <DocPanelRow label="รับแล้ว" value={`${po.recvPct}%`} />
            <DocPanelRow label="ใบขอซื้อ" value={po.prRef} />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={po.items ?? []} minWidth={940} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Remarks" titleTh="หมายเหตุ">
            <DocPanelText value={po.remark} />
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="รวมเป็นเงิน" value={`${money0(subtotal)} ${po.currency}`} />
            <DocPanelRow label="ส่วนลด" value={`${money0(discount)} ${po.currency}`} />
            <DocPanelRow label="ภาษีมูลค่าเพิ่ม" value={`${money0(tax)} ${po.currency}`} />
            <DocPanelRow
              label="ยอดรวมทั้งสิ้น"
              value={<strong>{`${money0(total)} ${po.currency}`}</strong>}
            />
            <DocPanelRow label="ค้างรับ" value={`${fmt(remaining)} หน่วย`} />
          </DocPanel>
        </div>

        <div className="mt-6">
          <SignatureRow
            blocks={[
              {
                en: "Prepared By",
                th: "ผู้สั่งซื้อ",
                signedBy: po.buyer,
                signedRole: "ฝ่ายจัดซื้อ",
                signedAt: po.created,
              },
              { en: "Approved By", th: "ผู้อนุมัติ" },
              { en: "Supplier", th: "ผู้ขาย" },
            ]}
          />
        </div>
      </DocPaper>

      <PoDecisionBar po={po} remaining={remaining} />

      <RelatedStrip
        items={[
          Boolean(po.prRef) && {
            label: "ใบขอซื้อ",
            code: po.prRef,
            entity: "purchase-request",
          },
          ...(po.receipts ?? []).map((r) => ({
            label: "ใบรับของ",
            code: r.grn,
            entity: "goods-receipt",
            sub: r.status,
          })),
        ]}
      />

      {/* A purchase order keeps no activity log of its own — what has happened
          to it IS the receipts raised against it. */}
      <HistoryStrip rows={receiptRows(po)} empty="ยังไม่มีการรับของ" />

      <CommentThread
        docCode={po.code}
        people={[po.buyer, po.createdBy, po.updatedBy]}
        departments={["Purchasing", "Warehouse"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

function PoDecisionBar({ po, remaining }: { po: PoRow; remaining: number }) {
  const ctx = useActionCtx();
  const mayEdit = can("purchase-order", "edit");

  const acts = docActs([
    po.status === "Draft" &&
      mayEdit && {
        key: "issue",
        label: "ส่งให้ผู้ขาย",
        icon: "send" as const,
        variant: "primary" as const,
        run: () => poIssue(po, ctx),
      },
    ["Open", "Partial Received"].includes(po.status) &&
      remaining > 0 &&
      mayEdit && {
        key: "receive",
        label: "บันทึกรับของ",
        icon: "goodsReceipt" as const,
        variant: "primary" as const,
        run: () => poReceive(po, ctx),
      },
    !["Cancelled", "Completed", "Closed"].includes(po.status) &&
      mayEdit && {
        key: "cancel",
        label: "ยกเลิกใบสั่งซื้อ",
        icon: "circleSlash" as const,
        variant: "danger" as const,
        run: () => poCancel(po, ctx),
      },
  ]);

  const note = !acts.length
    ? idleNote(po.status)
    : po.isOverdue
      ? `เลยกำหนดรับ ${po.expectedDate} — ค้างรับ ${fmt(remaining)} หน่วย`
      : `สถานะ ${po.status} — รับแล้ว ${po.recvPct}% · ค้างรับ ${fmt(remaining)} หน่วย`;

  return <DecisionBar testId="po-decision-bar" note={note} acts={acts} />;
}
