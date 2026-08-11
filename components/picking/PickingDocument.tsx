"use client";

import { PICK_STAFF, type PickingTask } from "@/data/picking";
import {
  getSO,
  pickLineViews,
  type PickLineAvailability,
  type PickRow,
} from "@/lib/domain/outbound";
import { paBinShort } from "@/lib/domain/inbound";
import { displayName } from "@/lib/domain/lines";
import {
  pickAssign,
  pickCancel,
  pickComplete,
  pickCreatePack,
  pickFillAvailable,
  pickStart,
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
import { PICK_LINE_TONE, PICK_TONE, PRIORITY_TONE, tone } from "@/lib/badges";

/* ============================================================
   PICKING LIST — the document, read

   The sheet a picker walks the warehouse with. It is the one
   document in the chain with no money on it at all: what it has
   instead is a bin, a lot and two quantities, and the whole job
   is reconciling the second with the first.

   It also answers the question the old tabbed profile could not
   ask in one place — of what is still owed, how much is on the
   shelf this morning. That is read live off the stock master on
   every render, never stored on the task: a figure frozen when
   the task was raised would send a picker to a bin another
   order emptied overnight.
   ============================================================ */

type Line = PickRow["items"][number] & PickLineAvailability;

const ITEM_COLUMNS: PaperColumn<Line>[] = [
  lineNoColumn(),
  { key: "product", label: "Product", cell: (l) => productCell(l.code, displayName(l)) },
  {
    key: "lot",
    label: "Lot",
    th: "ล็อต",
    width: "w-[110px]",
    cell: (l) => <span className="tnum text-ink-2">{l.lot || DASH}</span>,
  },
  {
    key: "bin",
    label: "Bin",
    th: "ช่องเก็บ",
    width: "w-[110px]",
    /* The short form, because the full path is five slashes long and the
       picker only needs the last two segments to find the shelf. */
    cell: (l) => <span className="tnum font-medium">{paBinShort(l.bin)}</span>,
  },
  {
    key: "ordered",
    label: "Ordered",
    th: "ต้องจัด",
    align: "right",
    width: "w-[76px]",
    cell: (l) => <span className="font-medium">{fmt(l.ordered)}</span>,
  },
  {
    key: "picked",
    label: "Picked",
    th: "จัดแล้ว",
    align: "right",
    width: "w-[76px]",
    cell: (l) => fmt(l.picked),
  },
  {
    key: "short",
    label: "Short",
    th: "ขาด",
    align: "right",
    width: "w-[70px]",
    cell: (l) =>
      l.remaining > 0 ? (
        <span className="font-semibold text-warning-text">{fmt(l.remaining)}</span>
      ) : (
        <span className="text-ink-3">{DASH}</span>
      ),
  },
  {
    key: "available",
    label: "In Stock",
    th: "คงเหลือในคลัง",
    align: "right",
    width: "w-[92px]",
    cell: (l) => <span className="text-ink-2">{l.available === null ? DASH : fmt(l.available)}</span>,
  },
  {
    key: "stock",
    label: "Stock",
    th: "สถานะของ",
    width: "w-[130px]",
    cell: (l) =>
      l.done ? (
        <Badge tone="success">หยิบครบแล้ว</Badge>
      ) : l.waitQty === 0 ? (
        <Badge tone="success">มีของ</Badge>
      ) : l.readyQty > 0 ? (
        <Badge tone="warning">มีบางส่วน · รอ {fmt(l.waitQty)}</Badge>
      ) : (
        <Badge tone="danger">รอของ {fmt(l.waitQty)}</Badge>
      ),
  },
  { key: "unit", label: "Unit", width: "w-[70px]", cell: (l) => <span className="text-ink-2">{l.unit}</span> },
  {
    key: "status",
    label: "Line",
    th: "สถานะบรรทัด",
    width: "w-[100px]",
    cell: (l) => <Badge tone={tone(PICK_LINE_TONE, l.status)}>{l.status}</Badge>,
  },
  {
    key: "note",
    label: "Note",
    th: "หมายเหตุ",
    cell: (l) => <span className="text-ink-2">{l.note || DASH}</span>,
  },
];

export function PickingDocument({ record }: { record: PickingTask }) {
  const task = record as PickRow;
  const so = getSO(task.soRef);
  const form = docForm("picking");
  const lines = pickLineViews(task) as Line[];
  const open = !["Completed", "Cancelled"].includes(task.status);

  const notices: (DocNotice | false)[] = [
    task.shortCount > 0 && {
      tone: "warn",
      title: `หยิบไม่ครบ ${task.shortCount} บรรทัด`,
      message: `หยิบได้ ${fmt(task.pickedQty)} จาก ${fmt(task.orderedQty)} หน่วย — ใบสั่งขาย ${task.soRef} จะยังปิดไม่ได้จนกว่าจะหยิบครบหรือส่งบางส่วน`,
    },
    /* Stock the warehouse does not have yet, said as what to do about it
       rather than merely that it is missing. */
    task.waitQty > 0 &&
      open && {
        tone: "warn",
        title: `รอของ ${task.waitLines} บรรทัด · ${fmt(task.waitQty)} หน่วย`,
        message: `พร้อมหยิบตอนนี้ ${fmt(task.readyQty)} หน่วย — ส่งเท่าที่มีก่อนได้ ส่วนที่รอจะค้างอยู่ใน ${task.soRef} และเปิดใบจัดสินค้ารอบถัดไปได้`,
      },
  ];

  return (
    <DocPage backTo="/m/picking" backLabel="Back to Picking List">
      <DocPaper testId="picking-document">
        <DocHeader
          title={form?.config.titleEN ?? "PICKING LIST"}
          titleTh={form?.config.titleTH ?? "ใบจัดสินค้า"}
          code={task.code}
          status={task.status}
          showVerifyCode={false}
        />

        <DocNotices notices={notices} />

        <div className="mt-5 grid grid-cols-3 gap-4 max-[1000px]:grid-cols-1">
          <DocPanel title="For Order" titleTh="ตามใบสั่งขาย">
            <DocPanelRow label="ใบสั่งขาย" value={task.soRef} />
            <DocPanelRow label="ลูกค้า" value={task.customer} />
            <DocPanelRow label="รหัสลูกค้า" value={task.customerCode} />
            <DocPanelRow label="กำหนดส่ง" value={so?.deliveryDate} />
            <DocPanelRow label="ผู้แทนขาย" value={so?.salesRep} />
          </DocPanel>

          <DocPanel title="Warehouse" titleTh="คลังสินค้า">
            <DocPanelRow label="คลัง" value={task.warehouse} />
            <DocPanelRow label="ผู้รับผิดชอบ" value={task.assignedTo || "รอมอบหมาย"} />
            {/* How the picker is told to walk the warehouse — FEFO on a
                shelf of dated goods is not a preference. */}
            <DocPanelRow label="วิธีหยิบ" value={task.strategy} />
            <DocPanelRow
              label="ความเร่งด่วน"
              value={<Badge tone={tone(PRIORITY_TONE, task.priority)}>{task.priority}</Badge>}
            />
          </DocPanel>

          <DocPanel title="Document" titleTh="เอกสาร">
            <DocPanelRow label="เลขที่" value={task.code} />
            <DocPanelRow label="วันที่จัด" value={task.pickDate} />
            <DocPanelRow label="กำหนดเสร็จ" value={task.dueDate} />
            <DocPanelRow
              label="สถานะ"
              value={<Badge tone={tone(PICK_TONE, task.status)}>{task.status}</Badge>}
            />
            <DocPanelRow label="ใบบรรจุ" value={task.packRef} />
          </DocPanel>
        </div>

        <DocSection title="Lines to Pick">
          <PaperTable cols={ITEM_COLUMNS} rows={lines} minWidth={1080} />
        </DocSection>

        <div className="mt-5 grid grid-cols-[1fr_minmax(280px,360px)] gap-5 max-[1000px]:grid-cols-1">
          <DocPanel title="Remarks" titleTh="หมายเหตุ">
            <DocPanelText value={task.remark} />
          </DocPanel>
          <DocPanel title="Summary" titleTh="สรุป">
            <DocPanelRow label="ต้องจัด" value={`${fmt(task.orderedQty)} หน่วย`} />
            <DocPanelRow label="จัดแล้ว" value={`${fmt(task.pickedQty)} หน่วย · ${task.pct}%`} />
            <DocPanelRow label="พร้อมหยิบ" value={`${fmt(task.readyQty)} หน่วย`} />
            <DocPanelRow
              label="รอของ"
              value={
                task.waitQty > 0 ? (
                  <span className="font-semibold text-warning-text">{fmt(task.waitQty)} หน่วย</span>
                ) : (
                  `${fmt(0)} หน่วย`
                )
              }
            />
            <DocPanelRow label="บรรทัดที่หยิบไม่ครบ" value={`${fmt(task.shortCount)} บรรทัด`} />
          </DocPanel>
        </div>

        <DocRemarks config={form?.config ?? null} />

        <div className="mt-6">
          <SignatureRow
            blocks={docSignatures(form?.config ?? null, {
              preparedBy: task.assignedTo
                ? {
                    by: task.assignedTo,
                    role: "ผู้จัดสินค้า",
                    at: historySignature(task.history, "Completed")?.at,
                  }
                : undefined,
              checkedBy: (() => {
                const s = historySignature(task.history, "Completed");
                return s && { by: s.by, role: "หัวหน้าคลัง", at: s.at };
              })(),
            })}
          />
        </div>
      </DocPaper>

      <PickDecisionBar task={task} />

      <RelatedStrip
        items={[
          { label: "ใบสั่งขาย", code: task.soRef, entity: "sales-order" },
          Boolean(task.packRef) && { label: "ใบบรรจุ", code: task.packRef, entity: "packing" },
        ]}
      />

      <HistoryStrip rows={historyRows(task.history)} />

      <CommentThread
        docCode={task.code}
        people={[task.createdBy, task.assignedTo, task.updatedBy]}
        departments={["Warehouse", "Sales"]}
      />
    </DocPage>
  );
}

/* ---------- The decision ---------- */

function PickDecisionBar({ task }: { task: PickRow }) {
  const ctx = useActionCtx();

  const acts = docActs([
    /* Picking staff are a warehouse roster, not login accounts, so this is
       not "assign to me" — it is the default picker, named on the button so
       nobody presses it expecting their own name. The edit form is where it
       is changed. Same call the list menu makes. */
    task.status === "Waiting" && {
      key: "assign",
      label: `มอบหมายให้ ${PICK_STAFF[0]}`,
      icon: "user" as const,
      variant: "primary" as const,
      run: () => pickAssign(task, PICK_STAFF[0], ctx),
    },
    task.status === "Assigned" && {
      key: "start",
      label: "เริ่มจัดสินค้า",
      icon: "play" as const,
      variant: "primary" as const,
      run: () => pickStart(task, ctx),
    },
    /* Fill the lines the shelf can actually cover, so the picker types the
       exceptions rather than the whole sheet. */
    ["Waiting", "Assigned", "In Progress"].includes(task.status) &&
      task.readyQty > 0 && {
        key: "fill",
        label: "เติมตามของที่มี",
        icon: "picking" as const,
        run: () => pickFillAvailable(task, ctx),
      },
    ["Assigned", "In Progress"].includes(task.status) && {
      key: "complete",
      label: "จัดเสร็จแล้ว",
      icon: "checkCircle" as const,
      run: () => pickComplete(task, ctx),
    },
    task.status === "Completed" &&
      !task.packRef && {
        key: "pack",
        label: "เปิดงานแพ็ค",
        icon: "packing" as const,
        variant: "primary" as const,
        run: () => pickCreatePack(task, ctx),
      },
    !["Completed", "Cancelled"].includes(task.status) && {
      key: "cancel",
      label: "ยกเลิกงาน",
      icon: "circleSlash" as const,
      variant: "danger" as const,
      run: () => pickCancel(task, ctx),
    },
  ]);

  const note = !acts.length
    ? idleNote(task.status)
    : task.waitQty > 0
      ? `พร้อมหยิบ ${fmt(task.readyQty)} หน่วย · รอของ ${fmt(task.waitQty)} หน่วย — ส่งเท่าที่มีก่อนได้`
      : `สถานะ ${task.status} — จัดแล้ว ${fmt(task.pickedQty)} จาก ${fmt(task.orderedQty)} หน่วย`;

  return (
    <DecisionBar
      testId="pick-decision-bar"
      note={note}
      acts={acts}
      before={<DocPrintButton entity="picking" record={task} label="พิมพ์ใบจัดสินค้า" />}
    />
  );
}
