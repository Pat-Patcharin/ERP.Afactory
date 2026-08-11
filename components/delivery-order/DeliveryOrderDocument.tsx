"use client";

import type { DeliveryOrder } from "@/data/delivery-orders";
import { getSO, type DoRow } from "@/lib/domain/outbound";
import { invoicesForSource } from "@/lib/domain/invoice";
import { displayName } from "@/lib/domain/lines";
import {
  doBillOrder,
  doBillShipped,
  doCancel,
  doConfirmDelivery,
  doFail,
  doReady,
  doShip,
} from "@/lib/workflows-outbound";
import { DASH, fmt, money0 } from "@/lib/format";
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
  docFormOf,
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
import { DO_TONE, PRIORITY_TONE, tone } from "@/lib/badges";

/* ============================================================
   DELIVERY ORDER — the document, read

   The one sheet in the chain that physically travels with the
   goods, and the only one somebody signs in the street. So the
   two things it must carry above everything else are where the
   lorry is going and what is on it — and, once it arrives, who
   took delivery and how much of it they actually took.

   Lot and serial sit on the line because this is the piece of
   paper a traceability recall is worked backwards from.
   ============================================================ */

type Line = DoRow["items"][number];

const ITEM_COLUMNS: PaperColumn<Line>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, displayName(l)) },
  {
    key: "lot",
    label: "Lot / Serial",
    th: "ล็อต / ซีเรียล",
    width: "w-[150px]",
    cell: (l) => (
      <span className="tnum text-ink-2">
        {[l.lot, l.serial].filter(Boolean).join(" · ") || DASH}
      </span>
    ),
  },
  {
    key: "qty",
    label: "Shipped",
    th: "ส่งออกไป",
    align: "right",
    width: "w-[86px]",
    cell: (l) => <span className="font-medium">{fmt(l.qty)}</span>,
  },
  {
    key: "delivered",
    label: "Received",
    th: "ลูกค้ารับ",
    align: "right",
    width: "w-[86px]",
    cell: (l) => fmt(l.delivered),
  },
  {
    key: "short",
    label: "Not Received",
    th: "ไม่ได้รับ",
    align: "right",
    width: "w-[92px]",
    cell: (l) => {
      const short = Math.max(0, Number(l.qty) - Number(l.delivered));
      return short > 0 ? (
        <span className="font-semibold text-warning-text">{fmt(short)}</span>
      ) : (
        <span className="text-ink-3">{DASH}</span>
      );
    },
  },
  { key: "unit", label: "Unit", width: "w-[70px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  {
    key: "box",
    label: "Box",
    th: "กล่องที่",
    width: "w-[100px]",
    cell: (l) => (l.box ? <Badge tone="neutral">{l.box}</Badge> : <span className="text-ink-3">{DASH}</span>),
  },
  {
    key: "note",
    label: "Note",
    th: "หมายเหตุ",
    cell: (l) => <span className="text-ink-2">{l.note || DASH}</span>,
  },
];

export function DeliveryOrderDocument({ record }: { record: DeliveryOrder }) {
  const d = record as DoRow;
  const so = getSO(d.soRef);
  /* ------------------------------------------------------------
     ONE SHEET WHEN THERE IS A BILL BEHIND IT

     Raising the note raises the invoice, so by the time anybody
     opens this page the two normally exist as a pair — and the
     paper that travels with the goods is then the combined
     "ใบส่งสินค้า / ใบกำกับภาษี", not a delivery note the customer
     has to match against something that arrives separately.

     Read off whether an invoice actually exists rather than
     assumed: a note raised by somebody without billing rights has
     no invoice yet, and printing it as a tax invoice would be a
     tax document for a bill nobody raised.
     ------------------------------------------------------------ */
  const bills = invoicesForSource(d.code);
  const form = docFormOf(bills.length ? "delivery-tax-invoice" : "delivery-order");

  /* What the order still owes beyond this note. Nought when it went whole —
     and then there is only one honest bill to raise, so only one button. */
  const aheadOfDelivery = so ? Math.max(0, so.orderedQty - d.totalQty) : 0;

  const notices: (DocNotice | false)[] = [
    d.status === "Failed" && {
      tone: "danger",
      title: "ส่งไม่สำเร็จ",
      message: `${d.failReason || "ไม่ระบุเหตุผล"} — ต้องนัดส่งใหม่หรือแจ้งฝ่ายขายติดต่อลูกค้า`,
    },
    d.isLate &&
      d.status !== "Failed" && {
        tone: "warn",
        title: "เลยกำหนดส่งแล้ว",
        message: `กำหนดส่ง ${d.deliveryDate} แต่ยังอยู่ในสถานะ ${d.status}`,
      },
    d.shortDelivery && {
      tone: "warn",
      title: "ลูกค้ารับของไม่ครบ",
      message: `รับ ${fmt(d.deliveredTotal)} จาก ${fmt(d.totalQty)} หน่วย — ส่วนที่เหลือยังค้างอยู่ในใบสั่งขาย ${d.soRef}`,
    },
    d.codAmount > 0 && {
      tone: "info",
      title: `เก็บเงินปลายทาง ${money0(d.codAmount)} บาท`,
      message: "ผู้ส่งต้องเก็บเงินให้ครบก่อนมอบสินค้า",
    },
  ];

  return (
    <DocPage backTo="/m/delivery-order" backLabel="Back to Delivery Order List">
      <DocPaper testId="delivery-order-document">
        <DocHeader
          title={form?.config.titleEN ?? "DELIVERY ORDER"}
          titleTh={form?.config.titleTH ?? "ใบส่งสินค้า"}
          code={d.code}
          status={d.status}
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="Deliver To" titleTh="ส่งที่">
            <p className="text-[13px] font-medium">{d.customer}</p>
            <DocPanelText value={d.shipTo} />
            <DocPanelRow label="ผู้รับ" value={d.contact} />
            <DocPanelRow label="โทรศัพท์" value={d.phone} />
            <DocPanelRow label="รหัสลูกค้า" value={d.customerCode} />
            {/* What the driver has to know, carried from the order. */}
            {so?.shipInstruction && (
              <p className="mt-1 rounded-card border border-info bg-info-soft px-2 py-1 text-cap text-info-text">
                {so.shipInstruction}
              </p>
            )}
          </DocPanel>

          <DocPanel title="Carrier" titleTh="การขนส่ง">
            <DocPanelRow label="ผู้ขนส่ง" value={d.carrier} />
            <DocPanelRow label="บริการ" value={d.service} />
            <DocPanelRow label="พนักงานส่ง" value={d.driver} />
            <DocPanelRow label="ทะเบียนรถ" value={d.vehicle} />
            <DocPanelRow label="เลขพัสดุ" value={d.trackingNo} />
            <DocPanelRow label="จำนวนหีบห่อ" value={`${fmt(d.packages)} กล่อง`} />
            <DocPanelRow label="น้ำหนักรวม" value={`${fmt(d.weight)} กก.`} />
          </DocPanel>

          <DocPanel title="Document" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={d.code} />
            <DocPanelRow label="ใบสั่งขาย" value={d.soRef} />
            <DocPanelRow label="ใบบรรจุ" value={d.packRef} />
            <DocPanelRow label="คลังต้นทาง" value={d.warehouse} />
            <DocPanelRow
              label="วันที่ส่ง"
              value={
                d.isLate ? <span className="font-semibold text-danger">{d.deliveryDate}</span> : d.deliveryDate
              }
            />
            <DocPanelRow label="ช่วงเวลา" value={d.deliveryTime} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(DO_TONE, d.status)}>{d.status}</Badge>}
            />
            <DocPanelRow
              label="ความเร่งด่วน"
              value={<Badge tone={tone(PRIORITY_TONE, d.priority)}>{d.priority}</Badge>}
            />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={d.items ?? []} minWidth={980} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Remarks" titleTh="หมายเหตุ">
            <DocPanelText value={d.remark} />
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="ส่งออกไป" value={`${fmt(d.totalQty)} หน่วย`} />
            <DocPanelRow label="ลูกค้ารับ" value={`${fmt(d.deliveredTotal)} หน่วย · ${d.pct}%`} />
            <DocPanelRow
              label="ไม่ได้รับ"
              value={
                d.totalQty - d.deliveredTotal > 0 ? (
                  <span className="font-semibold text-warning-text">
                    {fmt(d.totalQty - d.deliveredTotal)} หน่วย
                  </span>
                ) : (
                  `${fmt(0)} หน่วย`
                )
              }
            />
            {d.codAmount > 0 && (
              <DocPanelRow label="เก็บเงินปลายทาง" value={`${money0(d.codAmount)} บาท`} />
            )}
          </DocPanel>
        </div>

        {/* The receipt half of the note — what the customer signed for, filled
            in only once somebody actually took delivery. */}
        {["Delivered", "Failed"].includes(d.status) && (
          <div className="mt-5">
            <DocPanel title="Proof of Delivery" titleTh="หลักฐานการรับสินค้า">
              <DocPanelRow label="ผู้รับสินค้า" value={d.receivedBy} />
              <DocPanelRow label="วันเวลาที่รับ" value={d.receivedDate} />
              <DocPanelRow
                label="จำนวนที่รับ"
                value={`${fmt(d.deliveredTotal)} / ${fmt(d.totalQty)} หน่วย`}
              />
              {d.failReason && <DocPanelRow label="เหตุผลที่ส่งไม่สำเร็จ" value={d.failReason} />}
            </DocPanel>
          </div>
        )}

        <DocRemarks config={form?.config ?? null} />

        <div className="mt-6">
          <SignatureRow
            blocks={docSignatures(form?.config ?? null, {
              receivedBy: d.receivedBy
                ? { by: d.receivedBy, role: "ผู้รับสินค้า", at: d.receivedDate }
                : undefined,
              deliveredBy: (() => {
                const s = historySignature(d.history, "Shipped");
                return d.driver ? { by: d.driver, role: "พนักงานส่งสินค้า", at: s?.at } : undefined;
              })(),
              authorizedBy: (() => {
                const s = historySignature(d.history, "Ready to ship");
                return s && { by: s.by, role: "หัวหน้าคลัง", at: s.at };
              })(),
            })}
          />
        </div>
      </DocPaper>

      <DoDecisionBar d={d} billed={bills.length > 0} short={aheadOfDelivery} />

      <RelatedStrip
        items={[
          { label: "ใบสั่งขาย", code: d.soRef, entity: "sales-order" },
          Boolean(d.packRef) && { label: "ใบบรรจุ", code: d.packRef, entity: "packing" },
          ...bills.map((b) => ({
            label: "ใบแจ้งหนี้",
            code: b.code,
            entity: "sales-invoice",
            sub: b.status,
          })),
        ]}
      />

      <HistoryStrip rows={historyRows(d.history)} />

      <CommentThread
        docCode={d.code}
        people={[d.createdBy, d.driver, d.updatedBy, so?.salesRep ?? ""]}
        departments={["Warehouse", "Sales"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

function DoDecisionBar({
  d,
  billed,
  short,
}: {
  d: DoRow;
  billed: boolean;
  /** Units the order still owes beyond this note — nought when it went whole. */
  short: number;
}) {
  const ctx = useActionCtx();

  const acts = docActs([
    d.status === "Draft" && {
      key: "ready",
      label: "พร้อมส่ง",
      icon: "checkCircle" as const,
      variant: "primary" as const,
      run: () => doReady(d, ctx),
    },
    d.status === "Ready" && {
      key: "ship",
      label: "ออกรถแล้ว",
      icon: "truck" as const,
      variant: "primary" as const,
      run: () => doShip(d, ctx),
    },
    ["Shipped", "Failed"].includes(d.status) && {
      key: "confirm",
      label: "ยืนยันลูกค้ารับของ",
      icon: "checkCircle" as const,
      variant: "primary" as const,
      run: () => doConfirmDelivery(d, ctx),
    },
    d.status === "Shipped" && {
      key: "fail",
      label: "ส่งไม่สำเร็จ",
      icon: "xCircle" as const,
      variant: "danger" as const,
      run: () => doFail(d, ctx),
    },
    /* ------------------------------------------------------------
       TWO BILLS, TWO BUTTONS

       Raising the note raises the bill, so these are the way back
       for a note that somehow has none — raised by a role without
       billing rights, or one whose invoice was cancelled.

       Both figures are already on the sheet above: what shipped is
       in the summary, what was ordered is on the order it came
       from. So they are two buttons rather than one that opens a
       dialog asking what the reader can already see.

       Neither appears beside an invoice that already exists —
       that would be an invitation to bill the same goods twice.
       ------------------------------------------------------------ */
    !billed &&
      ["Shipped", "Delivered"].includes(d.status) && {
        key: "bill-shipped",
        label: "ออกใบแจ้งหนี้ตามที่ส่ง",
        icon: "invoice" as const,
        variant: "primary" as const,
        run: () => doBillShipped(d, ctx),
      },
    !billed &&
      short > 0 &&
      ["Shipped", "Delivered"].includes(d.status) && {
        key: "bill-order",
        label: "ออกใบแจ้งหนี้เต็มตามใบสั่งขาย",
        icon: "salesOrder" as const,
        run: () => doBillOrder(d, ctx),
      },
    !["Cancelled", "Delivered"].includes(d.status) && {
      key: "cancel",
      label: "ยกเลิกใบส่งสินค้า",
      icon: "circleSlash" as const,
      variant: "danger" as const,
      run: () => doCancel(d, ctx),
    },
  ]);

  const note = !acts.length
    ? idleNote(d.status)
    : d.status === "Failed"
      ? `ส่งไม่สำเร็จ — ${d.failReason || "ไม่ระบุเหตุผล"}`
      : d.status === "Shipped"
        ? `ออกรถแล้ว ${d.deliveryDate} ${d.deliveryTime} — ${d.carrier}${d.trackingNo ? ` · ${d.trackingNo}` : ""}`
        : `สถานะ ${d.status} — ${fmt(d.totalQty)} หน่วย · ${fmt(d.packages)} กล่อง`;

  return (
    <DecisionBar
      testId="do-decision-bar"
      note={note}
      acts={acts}
      /* One sheet, and it says which one it is — see the note above. */
      before={
        <DocPrintButton
          entity="delivery-order"
          record={d}
          docType={billed ? "delivery-tax-invoice" : "delivery-order"}
          label={billed ? "พิมพ์ใบส่งของ / ใบกำกับภาษี" : "พิมพ์ใบส่งสินค้า"}
        />
      }
    />
  );
}
