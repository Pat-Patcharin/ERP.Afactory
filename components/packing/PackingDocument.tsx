"use client";

import type { PackBox, PackingTask } from "@/data/packing";
import { confirmLines, getSO, type ConfirmLine, type PackRow } from "@/lib/domain/outbound";
import {
  packCancel,
  packComplete,
  packConfirmShipQty,
  packCreateDelivery,
  packStart,
} from "@/lib/workflows-outbound";
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
import { PACK_TONE, PRIORITY_TONE, tone } from "@/lib/badges";

/* ============================================================
   PACKING LIST — the document, read

   Three quantities per line, from three different documents, and
   keeping them straight is the whole point of this sheet:

     ordered    what the customer asked for   — sales order
     picked     what came off the shelf       — this task
     confirmed  what will actually go today   — the answer

   The third is the one the customer is billed from, so it is on
   the paper beside the other two rather than buried in a dialog
   somebody opened once. A line nobody has answered yet says so:
   undefined and zero are different answers, and the delivery
   order refuses to exist while any line is still the first.
   ============================================================ */

/** A confirm line with the box it went into — see `packLines` below. */
type Line = ConfirmLine & { box: string };

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
    key: "picked",
    label: "Picked",
    th: "หยิบได้",
    align: "right",
    width: "w-[76px]",
    cell: (l) => <span className="font-medium">{fmt(l.picked)}</span>,
  },
  {
    key: "confirmed",
    label: "Confirmed",
    th: "ยืนยันส่ง",
    align: "right",
    width: "w-[96px]",
    /* Blank until somebody at the warehouse has looked at the line — a
       number here that nobody typed would become a bill nobody checked. */
    cell: (l) =>
      l.answered ? (
        <span className={l.confirmed < l.ordered ? "font-semibold text-warning-text" : "font-semibold"}>
          {fmt(l.confirmed)}
        </span>
      ) : (
        <span className="text-ink-3">ยังไม่ยืนยัน</span>
      ),
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
    key: "reason",
    label: "Short Reason",
    th: "เหตุผลที่ส่งไม่ครบ",
    cell: (l) => <span className="text-ink-2">{l.shortReason || DASH}</span>,
  },
];

/**
 * The lines, with the box each one went into.
 *
 * `confirmLines` maps over `items` in order, so the two line up index for
 * index — it is the same array, read twice. Matching on product code would
 * pick the wrong box for an order that ships one product across two of them.
 */
const packLines = (task: PackRow): Line[] =>
  confirmLines(task).map((l, i) => ({ ...l, box: (task.items ?? [])[i]?.box ?? "" }));

const BOX_COLUMNS: PaperColumn<PackBox>[] = [
  { key: "box", label: "Box No.", th: "กล่องที่", width: "w-[110px]", cell: (b) => <span className="font-medium tnum">{b.box}</span> },
  { key: "type", label: "Box Type", th: "ชนิดกล่อง", cell: (b) => b.type },
  { key: "weight", label: "Weight", th: "น้ำหนัก (กก.)", align: "right", width: "w-[100px]", cell: (b) => fmt(b.weight) },
  { key: "dim", label: "Dimension", th: "ขนาด", width: "w-[120px]", cell: (b) => <span className="text-ink-2">{b.dim || DASH}</span> },
  { key: "sealNo", label: "Seal No.", th: "ซีล", width: "w-[120px]", cell: (b) => <span className="tnum text-ink-2">{b.sealNo || DASH}</span> },
  { key: "note", label: "Note", th: "หมายเหตุ", cell: (b) => <span className="text-ink-2">{b.note || DASH}</span> },
];

export function PackingDocument({ record }: { record: PackingTask }) {
  const task = record as PackRow;
  const so = getSO(task.soRef);
  const form = docForm("packing");
  const lines = packLines(task);

  const notices: (DocNotice | false)[] = [
    task.status === "Completed" &&
      !task.doRef &&
      !task.isConfirmed && {
        tone: "warn",
        title: "ยังไม่ได้ยืนยันจำนวนที่ส่งได้",
        message:
          "ใบส่งสินค้าสร้างไม่ได้จนกว่าทุกบรรทัดจะมีจำนวนที่ยืนยัน — ใบแจ้งหนี้ตั้งจากจำนวนที่คลังยืนยัน ไม่ใช่จำนวนที่ลูกค้าสั่ง",
      },
    task.isConfirmed &&
      task.shipsShort && {
        tone: "warn",
        title: "ยืนยันส่งน้อยกว่าที่สั่ง",
        message: `ส่วนที่เหลือจะค้างอยู่ในใบสั่งขาย ${task.soRef} และเปิดรอบส่งถัดไปได้`,
      },
    task.status === "Completed" &&
      task.isConfirmed &&
      !task.doRef && {
        tone: "info",
        title: "แพ็คเสร็จแล้ว รอออกใบส่งสินค้า",
        message: `${fmt(task.boxCount)} กล่อง น้ำหนักรวม ${fmt(task.totalWeight)} กก.`,
      },
    task.handling !== "ปกติ" && {
      tone: "warn",
      title: `ต้องระวังพิเศษ: ${task.handling}`,
      message: "แจ้งผู้ขนส่งและติดสัญลักษณ์บนกล่องทุกใบก่อนส่งมอบ",
    },
  ];

  return (
    <DocPage backTo="/m/packing" backLabel="Back to Packing List">
      <DocPaper testId="packing-document">
        <DocHeader
          title={form?.config.titleEN ?? "PACKING LIST"}
          titleTh={form?.config.titleTH ?? "ใบบรรจุหีบห่อ"}
          code={task.code}
          status={task.status}
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="For Order" titleTh="ตามใบสั่งขาย">
            <DocPanelRow label="ใบสั่งขาย" value={task.soRef} />
            <DocPanelRow label="ใบจัดสินค้า" value={task.pickRef} />
            <DocPanelRow label="ลูกค้า" value={task.customer} />
            <DocPanelRow label="รหัสลูกค้า" value={task.customerCode} />
            <DocPanelRow label="กำหนดส่ง" value={so?.deliveryDate} />
          </DocPanel>

          <DocPanel title="Packed At" titleTh="สถานที่บรรจุ">
            <DocPanelRow label="คลัง" value={task.warehouse} />
            <DocPanelRow label="ผู้แพ็ค" value={task.packer || "รอมอบหมาย"} />
            <DocPanelRow label="การจัดการพิเศษ" value={task.handling} />
            <DocPanelRow
              label="ความเร่งด่วน"
              value={<Badge tone={tone(PRIORITY_TONE, task.priority)}>{task.priority}</Badge>}
            />
            <DocPanelRow label="ที่อยู่ส่ง" value={so?.shipTo} />
          </DocPanel>

          <DocPanel title="Document" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={task.code} />
            <DocPanelRow label="วันที่แพ็ค" value={task.packDate} />
            <DocPanelRow label="กำหนดเสร็จ" value={task.dueDate} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(PACK_TONE, task.status)}>{task.status}</Badge>}
            />
            {/* Who signed off the shippable quantities, and when. Blank means
                it has not happened, and the delivery order is refused. */}
            <DocPanelRow
              label="ยืนยันจำนวนส่ง"
              value={
                task.isConfirmed ? (
                  <Badge tone="success">{task.confirmedBy || "ยืนยันแล้ว"}</Badge>
                ) : (
                  <Badge tone="warning">ยังไม่ยืนยัน</Badge>
                )
              }
            />
            <DocPanelRow label="ใบส่งสินค้า" value={task.doRef} />
          </DocPanel>
        </div>

        <DocSection title="Items">
          <PaperTable cols={ITEM_COLUMNS} rows={lines} minWidth={880} />
        </DocSection>

        <DocSection title="Packages">
          <PaperTable
            cols={BOX_COLUMNS}
            rows={task.packages ?? []}
            minWidth={780}
            empty="ยังไม่ได้บรรจุกล่อง — เพิ่มกล่องในหน้าแก้ไข"
          />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Remarks" titleTh="หมายเหตุ">
            <DocPanelText value={task.remark} />
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="จำนวนที่ต้องแพ็ค" value={`${fmt(task.totalQty)} หน่วย`} />
            <DocPanelRow label="แพ็คแล้ว" value={`${fmt(task.packedQty)} หน่วย · ${task.pct}%`} />
            <DocPanelRow
              label="ยืนยันส่ง"
              value={task.isConfirmed ? `${fmt(task.confirmedQty)} หน่วย` : "ยังไม่ยืนยัน"}
            />
            <DocPanelRow label="จำนวนกล่อง" value={`${fmt(task.boxCount)} กล่อง`} />
            <DocPanelRow label="น้ำหนักรวม" value={`${fmt(task.totalWeight)} กก.`} />
          </DocPanel>
        </div>

        <DocRemarks config={form?.config ?? null} />

        <div className="mt-6">
          <SignatureRow
            blocks={docSignatures(form?.config ?? null, {
              preparedBy: task.packer
                ? {
                    by: task.packer,
                    role: "ผู้แพ็ค",
                    at: historySignature(task.history, "Completed")?.at,
                  }
                : undefined,
              checkedBy:
                task.isConfirmed && task.confirmedBy
                  ? { by: task.confirmedBy, role: "ผู้ยืนยันจำนวนส่ง", at: task.confirmedAt }
                  : undefined,
            })}
          />
        </div>
      </DocPaper>

      <PackDecisionBar task={task} />

      <RelatedStrip
        items={[
          { label: "ใบสั่งขาย", code: task.soRef, entity: "sales-order" },
          Boolean(task.pickRef) && { label: "ใบจัดสินค้า", code: task.pickRef, entity: "picking" },
          Boolean(task.doRef) && {
            label: "ใบส่งสินค้า",
            code: task.doRef,
            entity: "delivery-order",
          },
        ]}
      />

      <HistoryStrip rows={historyRows(task.history)} />

      <CommentThread
        docCode={task.code}
        people={[task.createdBy, task.packer, task.updatedBy, task.confirmedBy ?? ""]}
        departments={["Warehouse", "Sales"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

function PackDecisionBar({ task }: { task: PackRow }) {
  const ctx = useActionCtx();

  const acts = docActs([
    task.status === "Waiting" && {
      key: "start",
      label: "เริ่มแพ็ค",
      icon: "play" as const,
      variant: "primary" as const,
      run: () => packStart(task, ctx),
    },
    ["Waiting", "In Progress"].includes(task.status) && {
      key: "complete",
      label: "แพ็คเสร็จแล้ว",
      icon: "checkCircle" as const,
      run: () => packComplete(task, ctx),
    },
    task.status === "Completed" &&
      !task.doRef && {
        key: "confirm",
        label: task.isConfirmed ? "แก้จำนวนที่ยืนยันส่ง" : "ยืนยันจำนวนที่ส่งได้",
        icon: "checkCircle" as const,
        variant: task.isConfirmed ? undefined : ("primary" as const),
        run: () => packConfirmShipQty(task, ctx),
      },
    task.status === "Completed" &&
      !task.doRef &&
      task.isConfirmed && {
        key: "delivery",
        label: "เปิดใบส่งสินค้า",
        icon: "delivery" as const,
        variant: "primary" as const,
        run: () => packCreateDelivery(task, ctx),
      },
    !["Completed", "Cancelled"].includes(task.status) && {
      key: "cancel",
      label: "ยกเลิกงาน",
      icon: "circleSlash" as const,
      variant: "danger" as const,
      run: () => packCancel(task, ctx),
    },
  ]);

  const note = !acts.length
    ? idleNote(task.status)
    : task.status === "Completed" && !task.isConfirmed
      ? "ต้องยืนยันจำนวนที่ส่งได้ทุกบรรทัดก่อน จึงจะเปิดใบส่งสินค้าได้"
      : `สถานะ ${task.status} — แพ็คแล้ว ${fmt(task.packedQty)} จาก ${fmt(task.totalQty)} หน่วย · ${fmt(task.boxCount)} กล่อง`;

  return (
    <DecisionBar
      testId="pack-decision-bar"
      note={note}
      acts={acts}
      before={<DocPrintButton entity="packing" record={task} label="พิมพ์ใบบรรจุ" />}
    />
  );
}
