"use client";

import type { GoodsReceipt } from "@/data/goods-receipts";
import {
  grDiscrepancyCount,
  grItemFinalRecv,
  grItemVariance,
  grIsWithPO,
  grTotalAccepted,
  grTotalOrdered,
  grTotalReceiving,
  grTotalRejected,
  type GrRow,
} from "@/lib/domain/inbound";
import { getPO } from "@/lib/domain/purchase";
import { can } from "@/lib/domain/admin";
import { grCancel, grPassQC } from "@/lib/workflows";
import { DASH, fmt } from "@/lib/format";
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
  historyRows,
  historySignature,
  idleNote,
  lineNoColumn,
  productCell,
  type DocNotice,
  type PaperColumn,
} from "@/components/document/DocumentView";
import { Badge } from "@/components/ui";
import { GR_QC_TONE, GR_TONE, tone } from "@/lib/badges";

/* ============================================================
   GOODS RECEIPT — the document, read

   The sheet signed at the dock. It is the moment a promise on a
   purchase order becomes stock the company owns, and the only
   document in the chain where three different quantities can
   legitimately disagree:

     ordered    what the purchase order asked for
     received   what came off the lorry
     accepted   what we are keeping

   All three sit on the line, with the variance worked out
   beside them, because a receipt where they differ is the whole
   reason anybody opens this sheet afterwards.

   RECEIVING ENDS HERE. There is no put-away step between the
   dock and the shelf in this system — see the note above
   `grPassQC` — so what this document accepts is available.
   ============================================================ */

type Line = GrRow["items"][number];

const ITEM_COLUMNS: PaperColumn<Line>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, l.name) },
  {
    key: "ordered",
    label: "Ordered",
    th: "สั่ง",
    align: "right",
    width: "w-[76px]",
    cell: (l) => <span className="text-ink-2">{fmt(l.ordered)}</span>,
  },
  {
    key: "received",
    label: "Received",
    th: "รับครั้งนี้",
    align: "right",
    width: "w-[86px]",
    cell: (l) => <span className="font-medium">{fmt(grItemFinalRecv(l))}</span>,
  },
  {
    key: "accepted",
    label: "Accepted",
    th: "รับไว้",
    align: "right",
    width: "w-[80px]",
    cell: (l) => fmt(l.accepted),
  },
  {
    key: "rejected",
    label: "Rejected",
    th: "ตีกลับ",
    align: "right",
    width: "w-[80px]",
    cell: (l) =>
      Number(l.rejected) > 0 ? (
        <span className="font-semibold text-danger">{fmt(l.rejected)}</span>
      ) : (
        <span className="text-ink-3">{DASH}</span>
      ),
  },
  {
    key: "variance",
    label: "Variance",
    th: "ต่างจากที่สั่ง",
    align: "right",
    width: "w-[96px]",
    /* Signed on purpose: short and over are different problems and the sign
       is the fastest way to tell them apart. */
    cell: (l) => {
      const v = grItemVariance(l);
      if (!v) return <span className="text-ink-3">{DASH}</span>;
      return (
        <span className={v < 0 ? "font-semibold text-warning-text" : "font-semibold text-info-text"}>
          {v > 0 ? `+${fmt(v)}` : fmt(v)}
        </span>
      );
    },
  },
  { key: "unit", label: "Unit", width: "w-[66px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  {
    key: "lot",
    label: "Lot",
    th: "ล็อต",
    width: "w-[130px]",
    cell: (l) => (
      <span className="tnum text-ink-2">
        {(l.lots ?? []).map((x) => x.lot).filter(Boolean).join(", ") || DASH}
      </span>
    ),
  },
  {
    key: "disc",
    label: "Note",
    th: "หมายเหตุ",
    cell: (l) => <span className="text-ink-2">{l.disc || DASH}</span>,
  },
];

export function GoodsReceiptDocument({ record }: { record: GoodsReceipt }) {
  const gr = record as GrRow;
  const po = gr.poRef ? getPO(gr.poRef) : null;
  const withPO = grIsWithPO(gr);
  const discrepancies = grDiscrepancyCount(gr);

  const notices: (DocNotice | false)[] = [
    discrepancies > 0 && {
      tone: "warn",
      title: `รับไม่ตรงกับที่สั่ง ${discrepancies} รายการ`,
      message: `รับ ${fmt(grTotalReceiving(gr))} จากที่สั่ง ${fmt(grTotalOrdered(gr))} หน่วย — ต้องแจ้งฝ่ายจัดซื้อติดตามกับผู้ขาย`,
    },
    grTotalRejected(gr) > 0 && {
      tone: "danger",
      title: `ตีกลับ ${fmt(grTotalRejected(gr))} หน่วย`,
      message: "ของที่ตีกลับไม่เข้าสต๊อก — ต้องออกเอกสารคืนของกับผู้ขาย",
    },
    gr.status === "Pending QC" && {
      tone: "info",
      title: "รอตรวจคุณภาพ",
      message: `สินค้าอยู่ใน QC Hold — ยังไม่พร้อมใช้งานจนกว่าจะตรวจผ่าน${
        gr.qc?.inspector ? ` · ผู้ตรวจ ${gr.qc.inspector}` : ""
      }`,
    },
    /* No purchase order behind it means nobody agreed a price or a quantity
       in advance. Legitimate, and worth saying on the sheet. */
    !withPO && {
      tone: "warn",
      title: "รับของโดยไม่มีใบสั่งซื้อ",
      message: "ไม่มีเอกสารต้นทางให้เทียบจำนวนและราคา — ฝ่ายจัดซื้อควรตรวจสอบย้อนหลัง",
    },
    /* "Good" is the ordinary answer and says nothing worth a notice. The
       other four in GR_PKG_CONDITION are a claim against the carrier
       waiting to be made, and the dock is where the evidence was seen. */
    Boolean(gr.pkgCondition) &&
      gr.pkgCondition !== "Good" && {
        tone: "warn",
        title: `สภาพหีบห่อ: ${gr.pkgCondition}`,
        message: "บันทึกไว้ตั้งแต่หน้าท่ารับของ — ใช้เป็นหลักฐานหากต้องเคลมกับผู้ขนส่ง",
      },
  ];

  return (
    <DocPage family="inbound" backTo="/m/goods-receipt" backLabel="Back to Goods Receipt List">
      <DocPaper testId="goods-receipt-document">
        <DocHeader
          title="GOODS RECEIPT"
          titleTh="ใบรับสินค้า"
          code={gr.code}
          status={gr.status}
          /* Internal paper — it never leaves the company. */
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="From Supplier" titleTh="ผู้ขาย">
            <p className="text-[13px] font-medium">{gr.supplier}</p>
            <DocPanelRow
              label="ใบสั่งซื้อ"
              value={gr.poRef || <span className="text-ink-3">ไม่มี — รับโดยไม่มี PO</span>}
            />
            <DocPanelRow label="ใบส่งของผู้ขาย" value={gr.deliveryNote} />
            <DocPanelRow label="เลขใบกำกับผู้ขาย" value={gr.invoiceRef} />
            <DocPanelRow label="เงื่อนไขชำระ" value={po?.payTerm} />
          </DocPanel>

          <DocPanel title="Delivered By" titleTh="การขนส่ง">
            <DocPanelRow label="ผู้ขนส่ง" value={gr.transporter} />
            <DocPanelRow label="พนักงานขับรถ" value={gr.driver} />
            <DocPanelRow label="ทะเบียนรถ" value={gr.vehicle} />
            <DocPanelRow label="ท่ารับของ" value={gr.dock} />
            <DocPanelRow label="จำนวนหีบห่อ" value={gr.packages ? `${fmt(gr.packages)} หีบ` : undefined} />
            <DocPanelRow label="สภาพหีบห่อ" value={gr.pkgCondition} />
            <DocPanelRow label="ซีล" value={gr.seal} />
          </DocPanel>

          <DocPanel title="Receipt" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={gr.code} />
            <DocPanelRow label="วันที่รับ" value={gr.receiptDate} />
            <DocPanelRow label="กำหนดรับ" value={gr.expectedDate} />
            <DocPanelRow label="ผู้รับของ" value={gr.receiver} />
            <DocPanelRow label="คลังปลายทาง" value={gr.warehouse} />
            <DocPanelRow label="ประเภท" value={<Badge tone="neutral">{gr.type}</Badge>} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(GR_TONE, gr.status)}>{gr.status}</Badge>}
            />
            <DocPanelRow
              label="คุณภาพ"
              value={<Badge tone={tone(GR_QC_TONE, gr.qcStatus)}>{gr.qcStatus}</Badge>}
            />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={gr.items ?? []} minWidth={1040} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Remarks" titleTh="หมายเหตุ">
            <DocPanelText value={gr.remark} />
            {gr.discrepancy && (
              <p className="mt-1 rounded-card border border-warning bg-warning-soft px-2 py-1 text-cap text-warning-text">
                {gr.discrepancy}
              </p>
            )}
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="สั่งไว้" value={`${fmt(grTotalOrdered(gr))} หน่วย`} />
            <DocPanelRow label="รับเข้ามา" value={`${fmt(grTotalReceiving(gr))} หน่วย`} />
            <DocPanelRow label="รับไว้" value={`${fmt(grTotalAccepted(gr))} หน่วย`} />
            <DocPanelRow
              label="ตีกลับ"
              value={
                grTotalRejected(gr) > 0 ? (
                  <span className="font-semibold text-danger">{fmt(grTotalRejected(gr))} หน่วย</span>
                ) : (
                  `${fmt(0)} หน่วย`
                )
              }
            />
            <DocPanelRow
              label="รายการที่ไม่ตรง"
              value={
                discrepancies > 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(discrepancies)} รายการ</span>
                ) : (
                  "ตรงทุกรายการ"
                )
              }
            />
          </DocPanel>
        </div>

        <div className="mt-6">
          <SignatureRow
            blocks={[
              {
                en: "Received By",
                th: "ผู้รับสินค้า",
                signedBy: gr.receiver,
                signedRole: "ฝ่ายคลังสินค้า",
                signedAt: gr.receiptDate,
              },
              {
                en: "Inspected By",
                th: "ผู้ตรวจคุณภาพ",
                /* Only once QC actually happened — an inspector's name on a
                   receipt nobody inspected is the signature that matters
                   most and the one easiest to fake by accident. */
                signedBy: gr.qcStatus === "Passed" ? (gr.qc?.inspector ?? "") : "",
                signedRole: "ฝ่ายควบคุมคุณภาพ",
                signedAt: historySignature(gr.history, "QC Passed")?.at,
              },
              { en: "Delivered By", th: "ผู้ส่งสินค้า", signedRole: gr.transporter },
              { en: "Approved By", th: "ผู้อนุมัติ" },
            ]}
          />
        </div>
      </DocPaper>

      <GrDecisionBar gr={gr} />

      <RelatedStrip
        items={[
          Boolean(gr.poRef) && {
            label: "ใบสั่งซื้อ",
            code: gr.poRef,
            entity: "purchase-order",
            sub: po?.status,
          },
        ]}
      />

      <HistoryStrip rows={historyRows(gr.history)} />

      <CommentThread
        docCode={gr.code}
        people={[gr.receiver, gr.createdBy, gr.updatedBy, gr.qc?.inspector ?? ""]}
        departments={["Warehouse", "Purchasing"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

function GrDecisionBar({ gr }: { gr: GrRow }) {
  const ctx = useActionCtx();
  const mayEdit = can("goods-receipt", "edit");

  const acts = docActs([
    ["Draft", "Partial"].includes(gr.status) &&
      mayEdit && {
        key: "continue",
        label: gr.status === "Draft" ? "แก้ไขใบรับของ" : "รับของต่อ",
        icon: "edit" as const,
        variant: "primary" as const,
        run: () => ctx.goto(`/m/goods-receipt/${encodeURIComponent(gr.code)}/edit`),
      },
    gr.status === "Pending QC" &&
      mayEdit && {
        key: "qc",
        label: "ตรวจ QC",
        icon: "qc" as const,
        variant: "primary" as const,
        run: () => grPassQC(gr, ctx),
      },
    !["Completed", "Cancelled"].includes(gr.status) &&
      mayEdit && {
        key: "cancel",
        label: "ยกเลิกใบรับของ",
        icon: "circleSlash" as const,
        variant: "danger" as const,
        run: () => grCancel(gr, ctx),
      },
  ]);

  const note = !acts.length
    ? idleNote(gr.status)
    : gr.status === "Pending QC"
      ? "สินค้าอยู่ใน QC Hold — ตรวจผ่านแล้วจึงเข้าสต๊อกพร้อมใช้งาน"
      : `สถานะ ${gr.status} — รับแล้ว ${fmt(grTotalReceiving(gr))} จาก ${fmt(grTotalOrdered(gr))} หน่วย`;

  return <DecisionBar testId="gr-decision-bar" note={note} acts={acts} />;
}
