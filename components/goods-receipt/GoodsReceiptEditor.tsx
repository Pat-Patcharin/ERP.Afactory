"use client";

import { useCallback, useMemo, useState } from "react";
import type { GoodsReceipt, GrType } from "@/data/goods-receipts";
import {
  GR_NONPO_REASON_OPTIONS,
  GR_WAREHOUSE_OPTIONS,
  applyProductForReceipt,
  applyPurchaseOrder,
  blankGrDraft,
  blankGrLine,
  canForceClose,
  draftFromGoodsReceipt,
  grTotals,
  receivablePOs,
  saveGoodsReceiptDraft,
  validateGrDraft,
  type GoodsReceiptDraft,
  type GrDraftLine,
} from "@/lib/domain/goods-receipt-draft";
import { grItemRemaining, grItemVariance } from "@/lib/domain/inbound";
import { productSearch } from "@/lib/domain/doc-draft";
import { DASH, fmt, isoToDmy } from "@/lib/format";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { useCrumbCode } from "@/components/layout/Topbar";
import {
  DocFooter,
  DocHeader,
  DocLabel,
  IssueSummary,
  MetaPanel,
  metaControls,
  RemarksPanel,
  SignatureRow,
  anchorId,
  type MetaRow,
} from "@/components/document/parts";
import {
  DocumentEditorShell,
  ItemSectionBar,
} from "@/components/document/DocumentEditorShell";
import { useDocumentEditor } from "@/components/document/useDocumentEditor";
import { Badge, CellInput, Select } from "@/components/ui";

/* ============================================================
   GOODS RECEIPT EDITOR

   The receiving desk's document, on the same one-page editor as
   the purchase request — type into the paper, no wizard.

   TWO DOCUMENTS ON ONE SHEET, AND THE SWITCH IS AT THE TOP.

   WITH PO: pick the order, and its outstanding lines arrive
   ticked at what is still owed. The receiver unticks what did
   not turn up and types what actually did.

   WITHOUT PO: no order, so the lines are typed. This is how
   goods come back from a claim or a repair — a receipt with its
   own number series, because the two questions ("what did we
   order and get" / "what came back to us") are not one question.

   The one thing the receiving desk cannot do alone is receive
   SHORT: that closes the rest of the order, and giving up on
   goods already ordered needs the approve right. The block and
   the reason box appear as the number is typed, not after save.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;

/** A receipt is signed for by the people who saw the goods. */
const GR_SIGNATURES = [
  { en: "Received By", th: "ผู้รับของ" },
  { en: "Checked By", th: "ผู้ตรวจรับ" },
  { en: "Warehouse", th: "ฝ่ายคลังสินค้า" },
];

export function GoodsReceiptEditor({ record }: { record?: GoodsReceipt }) {
  const ctx = useActionCtx();

  /* The kind of receipt is chosen before anything is typed, and never
     afterwards: the number series follows from it, and a document that
     changed series mid-edit would have two identities. */
  const [type, setType] = useState<GrType>(
    record ? ((record.type === "Without PO" ? "Without PO" : "With PO") as GrType) : "With PO",
  );

  const api = useDocumentEditor<GoodsReceiptDraft, GoodsReceipt>({
    entity: "goods-receipt",
    record,
    blank: () => blankGrDraft(type),
    fromRecord: draftFromGoodsReceipt,
    totals: grTotals,
    validate: validateGrDraft,
    applyProduct: (line, code) => applyProductForReceipt(line as GrDraftLine, code),
    /* Choosing the order is what fills the document in. Handled here rather
       than by the caller so that every path to a PO — typing, picking,
       recovering a draft — lands the same lines. */
    onPatch: (d, patch) =>
      "poRef" in patch && patch.poRef !== d.poRef
        ? applyPurchaseOrder(d, String(patch.poRef ?? ""))
        : null,
    save: (d, { user }) => {
      const res = saveGoodsReceiptDraft(d, { user });
      return { code: res.code, created: res.created };
    },
  });

  const {
    draft,
    mode,
    set,
    setLine,
    patchLine,
    pickProduct,
    addLine,
    addLines,
    removeLine,
    removeSelected,
    moveSelected,
    selectLine,
    selected,
    totals,
    invalid,
    shownIssues,
    docMode,
    setPasteOpen,
    savedLabel,
    user,
    jumpTo,
    onGridKey,
    isDirty,
    saveDraftNow,
    saveDocument,
    resetDraft,
    duplicate,
    clearStoredDraft,
  } = api;

  useCrumbCode(mode === "edit" ? (record?.code ?? null) : "New");

  const t = grTotals(draft);
  const mayClose = canForceClose();
  const withPO = draft.type === "With PO";

  const reporter = useMemo(
    () => ({
      blocked: (why: string) => ctx.toast("บันทึกไม่ได้", why, "danger"),
      invalidCount: (n: number) =>
        ctx.toast(
          "บันทึกไม่ได้",
          `ต้องแก้ไข ${n} รายการก่อน — กดที่ข้อความเพื่อไปยังช่องนั้น`,
          "warning",
        ),
      savedDraft: (res: { code: string }) =>
        ctx.toast("บันทึกฉบับร่างแล้ว", `${res.code} — แก้ไขต่อได้ทุกเมื่อ`, "success"),
      saved: (res: { code: string; created: boolean }) => {
        ctx.toast(
          res.created ? "บันทึกการรับของแล้ว" : "บันทึกการแก้ไขแล้ว",
          t.forceCloses
            ? `${res.code} — ปิดยอดคงเหลือของ ${draft.poRef} แล้ว`
            : `${res.code} — รับเข้า ${fmt(t.totalQty)} หน่วย`,
          "success",
        );
        ctx.goto(`/m/goods-receipt/${encodeURIComponent(res.code)}`);
      },
    }),
    [ctx, draft.poRef, t.forceCloses, t.totalQty],
  );

  const cancel = useCallback(() => {
    const leave = () => {
      clearStoredDraft();
      ctx.goto(
        mode === "edit"
          ? `/m/goods-receipt/${encodeURIComponent(draft.code)}`
          : "/m/goods-receipt",
      );
    };
    if (!isDirty()) return leave();
    ctx.confirm({
      title: "ออกจากหน้านี้",
      message: "การแก้ไขที่ยังไม่ได้บันทึกจะหายไป",
      confirmText: "ออกโดยไม่บันทึก",
      tone: "danger",
      onConfirm: leave,
    });
  }, [clearStoredDraft, ctx, draft.code, isDirty, mode]);

  const reset = useCallback(() => {
    ctx.confirm({
      title: "ล้างเอกสาร",
      message: "ล้างข้อมูลทั้งหมดกลับเป็นใบรับของเปล่า",
      confirmText: "ล้างเอกสาร",
      tone: "danger",
      onConfirm: resetDraft,
    });
  }, [ctx, resetDraft]);

  const metaRows: MetaRow[] = useMemo(() => {
    const { txt, sel } = metaControls(draft, set);
    return [
      {
        field: "receiptDate",
        label: "Receipt Date",
        required: true,
        control: txt("receiptDate", "Receipt Date", "date"),
        read: isoToDmy(draft.receiptDate),
      },
      {
        field: "receiver",
        label: "Received By",
        required: true,
        control: txt("receiver", "Received By"),
        read: draft.receiver || DASH,
      },
      {
        field: "warehouse",
        label: "Warehouse",
        required: true,
        control: sel("warehouse", "Warehouse", [...GR_WAREHOUSE_OPTIONS]),
        read: draft.warehouse || DASH,
      },
    ];
  }, [draft, set]);

  /* The kind of receipt, and the order it is against. Above the paper
     because neither is printed on it: the sheet shows the PO number, not
     the picker that found it. */
  const settings = (
    <div className="flex flex-wrap items-end gap-3">
      {mode === "create" && (
        <label className="flex flex-col gap-1">
          <DocLabel en="Receipt Type" th="ประเภทการรับ" />
          <Select
            aria-label="Receipt Type"
            value={type}
            onChange={(e) => {
              const next = e.target.value as GrType;
              setType(next);
              /* A new series and a new set of lines — this is a different
                 document, not the same one relabelled. */
              set(blankGrDraft(next) as Partial<GoodsReceiptDraft>);
            }}
            className="w-[190px]"
          >
            <option value="With PO">รับของตามใบสั่งซื้อ</option>
            <option value="Without PO">รับของโดยไม่มีใบสั่งซื้อ</option>
          </Select>
        </label>
      )}

      {withPO && (
        <label className="flex flex-col gap-1">
          <DocLabel en="Purchase Order" th="ใบสั่งซื้อ" />
          <Select
            aria-label="Purchase Order"
            value={draft.poRef}
            onChange={(e) => set({ poRef: e.target.value })}
            className="w-[220px]"
            disabled={docMode === "read"}
          >
            <option value="">— ค้นหาเลขที่ใบสั่งซื้อ —</option>
            {receivablePOs().map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.supplier}
              </option>
            ))}
          </Select>
        </label>
      )}

      {!withPO && (
        <label className="flex flex-col gap-1">
          <DocLabel en="Reason" th="เหตุผลที่ไม่มีใบสั่งซื้อ" />
          <Select
            aria-label="Non-PO Reason"
            value={draft.nonPoReason}
            onChange={(e) => set({ nonPoReason: e.target.value })}
            className="w-[220px]"
            disabled={docMode === "read"}
          >
            <option value="">— เลือกเหตุผล —</option>
            {GR_NONPO_REASON_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </label>
      )}

      {!withPO && (
        <label className="flex flex-col gap-1">
          <DocLabel en="Reference" th="เอกสารอ้างอิง" />
          <CellInput
            aria-label="Reference Document"
            value={draft.refDoc}
            placeholder="เลขที่ใบเคลม / ใบซ่อม"
            onChange={(e) => set({ refDoc: e.target.value })}
            className="w-[200px]"
            disabled={docMode === "read"}
          />
        </label>
      )}
    </div>
  );

  return (
    <div data-doc-family="inbound">
      <DocumentEditorShell
        api={api}
        labels={{
          entityName: "Goods Receipt",
          primaryAction: "Save Receipt",
          noPermissionTitle: "ไม่มีสิทธิ์รับของเข้าคลัง",
          noPermissionBody: "บทบาทของคุณเปิดใบรับของได้ แต่แก้ไขไม่ได้",
        }}
        testIds={{
          toolbar: "gr-toolbar",
          document: "goods-receipt-document",
          stickySummary: "gr-sticky-summary",
        }}
        printJob={null}
        settings={settings}
        onSaveDraft={() => saveDraftNow(reporter)}
        onSave={() => saveDocument(reporter)}
        onCancel={cancel}
        onReset={reset}
        onDuplicate={() => {
          const code = duplicate();
          ctx.toast("ทำสำเนาแล้ว", `เอกสารใหม่ ${code}`, "info");
        }}
        onImport={(codes) => {
          addLines(codes);
          ctx.toast("เพิ่มรายการแล้ว", `${codes.length} รายการ`, "success");
        }}
      >
        <DocHeader
          title="GOODS RECEIPT"
          titleTh={withPO ? "ใบรับสินค้า (ตามใบสั่งซื้อ)" : "ใบรับสินค้า (ไม่มีใบสั่งซื้อ)"}
          code={draft.code}
          status={draft.status}
          showVerifyCode={false}
        />

        <div className="mt-5 grid grid-cols-[1fr_1fr_minmax(300px,340px)] items-start gap-4 max-[1100px]:grid-cols-1">
          <ReceiptFromPanel draft={draft} />
          <ReceiptRefPanel draft={draft} />
          <MetaPanel rows={metaRows} mode={docMode} invalid={invalid} />
        </div>

        {docMode === "edit" && (
          <div className="mt-4 flex flex-col gap-3">
            <IssueSummary issues={shownIssues} onJump={jumpTo} />
          </div>
        )}

        {/* ---------- Lines ---------- */}
        <section id={anchorId("items")} className="mt-6">
          {/* A receipt against an order has no line controls at all: its
              lines ARE the order's, and an Add button would offer to receive
              something nobody bought. Only a receipt without one is typed. */}
          {withPO ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.06em]">Items</h2>
              <span className="text-cap text-ink-3">
                รายการมาจากใบสั่งซื้อ — ติ๊กเฉพาะที่มาถึงรอบนี้ แล้วใส่จำนวนที่รับจริง
              </span>
            </div>
          ) : (
            <ItemSectionBar
              mode={docMode}
              selectedCount={selected.size}
              onAdd={addLine}
              onImport={() => setPasteOpen(true)}
              onMove={moveSelected}
              onRemoveSelected={removeSelected}
            />
          )}

          <div onKeyDown={onGridKey}>
            <ReceiptLineTable
              lines={draft.items}
              mode={docMode}
              withPO={withPO}
              invalid={invalid}
              onTick={(id, on) => patchLine(id, { include: on } as Partial<GrDraftLine>)}
              onCell={setLine}
              onPatch={patchLine}
              onPick={pickProduct}
              onRemove={removeLine}
              selected={selected}
              onSelect={selectLine}
            />
          </div>
        </section>

        {/* ---------- Short receipt: the decision, not the arithmetic ---------- */}
        {withPO && t.shortLines > 0 && (
          <div
            id={anchorId("forceCloseReason")}
            className={`mt-4 rounded-card border p-4 ${
              mayClose ? "border-warning bg-warning-soft" : "border-danger bg-danger-soft"
            }`}
          >
            <div className="text-body font-semibold">
              รับน้อยกว่าจำนวนที่สั่ง {t.shortLines} รายการ — ปิดใบสั่งซื้อส่วนที่เหลือ
            </div>
            <p className="mt-1 text-cap text-ink-2">
              บันทึกแล้ว {draft.poRef} จะถูกปิด ยอดที่ยังไม่ได้รับจะไม่ถูกยกไปใบรับของถัดไป
              ถ้าของที่เหลือยังจะมา ให้เอาติ๊กรายการนั้นออกแทน แล้วรับในรอบหน้า
            </p>
            {mayClose ? (
              <label className="mt-3 flex flex-col gap-1">
                <DocLabel en="Reason for closing" th="เหตุผลที่ปิดยอดคงเหลือ" />
                <CellInput
                  aria-label="Force close reason"
                  value={draft.forceCloseReason}
                  placeholder="เช่น ผู้ขายแจ้งยกเลิกส่วนที่เหลือ"
                  onChange={(e) => set({ forceCloseReason: e.target.value })}
                  disabled={docMode === "read"}
                />
              </label>
            ) : (
              <p className="mt-2 text-cap font-medium text-danger-text">
                บทบาทของคุณปิดใบสั่งซื้อไม่ได้ — ให้ผู้มีสิทธิ์อนุมัติเป็นผู้บันทึกใบนี้
                หรือเอาติ๊กรายการที่รับไม่ครบออก แล้วรับเท่าที่มาจริงในรอบถัดไป
              </p>
            )}
          </div>
        )}

        {/* ---------- Remarks and the count ---------- */}
        <div className="mt-5 grid grid-cols-[1fr_minmax(320px,420px)] items-start gap-5 max-[1100px]:grid-cols-1">
          <RemarksPanel
            remarks={draft.remark}
            internalNote=""
            mode={docMode}
            onRemarks={(remark) => set({ remark })}
            onInternalNote={() => {}}
          />
          <ReceiptSummary totals={t} />
        </div>

        <div className="mt-6">
          <SignatureRow blocks={GR_SIGNATURES} />
        </div>

        <div className="mt-6">
          <DocFooter createdBy={user} savedLabel={savedLabel} />
        </div>
      </DocumentEditorShell>
    </div>
  );
}

/* ---------- Panels ---------- */

function PanelShell({ title, titleTh, children }: { title: string; titleTh: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line p-4">
      <DocLabel en={title} th={titleTh} />
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

const PanelRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 text-[13px]">
    <span className="text-ink-2">{label}</span>
    <span className="text-right font-medium">{value || DASH}</span>
  </div>
);

/** Who the goods came from — read off the order, never typed over it. */
function ReceiptFromPanel({ draft }: { draft: GoodsReceiptDraft }) {
  return (
    <PanelShell title="Received From" titleTh="รับของจาก">
      <PanelRow label="ผู้ขาย / ผู้ส่ง" value={draft.supplier} />
      <PanelRow label="ใบส่งของ" value={draft.deliveryNote} />
      <PanelRow label="ใบกำกับภาษี" value={draft.invoiceRef} />
      <PanelRow label="ผู้ขนส่ง" value={draft.transporter} />
    </PanelShell>
  );
}

function ReceiptRefPanel({ draft }: { draft: GoodsReceiptDraft }) {
  const withPO = draft.type === "With PO";
  return (
    <PanelShell title="Reference" titleTh="เอกสารอ้างอิง">
      <PanelRow label="ประเภท" value={withPO ? "ตามใบสั่งซื้อ" : "ไม่มีใบสั่งซื้อ"} />
      <PanelRow label={withPO ? "ใบสั่งซื้อ" : "เหตุผล"} value={withPO ? draft.poRef : draft.nonPoReason} />
      <PanelRow label="อ้างอิง" value={draft.refDoc} />
      <PanelRow label="กำหนดส่ง" value={isoToDmy(draft.expectedDate)} />
    </PanelShell>
  );
}

function ReceiptSummary({ totals }: { totals: ReturnType<typeof grTotals> }) {
  return (
    <div className="rounded-card border border-line p-4">
      <DocLabel en="Receipt Summary" th="สรุปการรับของ" />
      <div className="mt-2 flex flex-col gap-1.5">
        <PanelRow label="รายการที่รับรอบนี้" value={`${fmt(totals.lines)} รายการ`} />
        <PanelRow label="จำนวนรวม" value={fmt(totals.totalQty)} />
        <PanelRow label="ต้องตรวจ QC" value={`${fmt(totals.qcLines)} รายการ`} />
        <PanelRow label="รับเกินจำนวนสั่ง" value={`${fmt(totals.overLines)} รายการ`} />
        <PanelRow label="รับไม่ครบ" value={`${fmt(totals.shortLines)} รายการ`} />
      </div>
    </div>
  );
}

/* ---------- The line table ---------- */

function ReceiptLineTable({
  lines,
  mode,
  withPO,
  invalid,
  onTick,
  onCell,
  onPatch,
  onPick,
  onRemove,
  selected,
  onSelect,
}: {
  lines: GrDraftLine[];
  mode: "edit" | "read";
  withPO: boolean;
  invalid: Set<string>;
  onTick: (id: string, on: boolean) => void;
  onCell: (id: string, col: "qty" | "note", value: string) => void;
  onPatch: (id: string, patch: Partial<GrDraftLine>) => void;
  onPick: (id: string, code: string) => void;
  onRemove: (id: string) => void;
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
}) {
  const rows = mode === "read" ? lines.filter((l) => l.include && l.code) : lines;

  if (!rows.length) {
    return (
      <div className="rounded-card border border-dashed border-line px-4 py-8 text-center text-body text-ink-3">
        {withPO
          ? "เลือกใบสั่งซื้อด้านบน แล้วรายการที่ยังค้างรับจะขึ้นมาให้ติ๊ก"
          : "ยังไม่มีรายการ — กดเพิ่มรายการเพื่อพิมพ์สินค้าที่รับเข้า"}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[900px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-surface text-cap text-ink-2">
            <th className="w-[44px] px-2 py-2">
              {mode === "edit" ? (
                <label className="flex flex-col items-center gap-0.5">
                  <input
                    type="checkbox"
                    aria-label="รับทุกรายการ"
                    checked={rows.length > 0 && rows.every((l) => l.include)}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          rows.some((l) => l.include) && !rows.every((l) => l.include);
                    }}
                    onChange={(e) => rows.forEach((l) => onTick(l.id, e.target.checked))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>รับ</span>
                </label>
              ) : (
                "รับ"
              )}
            </th>
            <th className="px-2 py-2 text-left">Product</th>
            <th className="w-[70px] px-2 py-2 text-right">Ordered</th>
            <th className="w-[80px] px-2 py-2 text-right">Received</th>
            <th className="w-[80px] px-2 py-2 text-right">Outstanding</th>
            <th className="w-[100px] px-2 py-2 text-right">Receive Now</th>
            <th className="w-[90px] px-2 py-2 text-right">Variance</th>
            <th className="w-[110px] px-2 py-2 text-left">Location</th>
            <th className="w-[70px] px-2 py-2">QC</th>
            {mode === "edit" && !withPO && <th className="w-[40px] px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const item = { ordered: l.ordered, prevRecv: l.prevRecv, receiveNow: num(l.qty) };
            const remaining = grItemRemaining(item);
            const variance = num(l.qty) > 0 ? grItemVariance(item) : 0;
            const off = !l.include;
            return (
              <tr
                key={l.id}
                className={`border-b border-line last:border-b-0 ${off ? "opacity-45" : ""} ${
                  selected.has(l.id) ? "bg-surface" : ""
                }`}
              >
                <td className="px-2 py-1.5 text-center">
                  {mode === "edit" ? (
                    <input
                      type="checkbox"
                      aria-label={`รับรายการที่ ${i + 1}`}
                      checked={l.include}
                      onChange={(e) => onTick(l.id, e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                  ) : (
                    <span className="text-success-text">✓</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {mode === "edit" && !withPO ? (
                    <ProductPick line={l} index={i} onPick={onPick} />
                  ) : (
                    <>
                      <span className="block font-medium">{l.code}</span>
                      <span className="block text-cap text-ink-3">{l.name}</span>
                    </>
                  )}
                </td>
                <td className="tnum px-2 py-1.5 text-right text-ink-2">
                  {withPO ? fmt(l.ordered) : DASH}
                </td>
                <td className="tnum px-2 py-1.5 text-right text-ink-2">
                  {withPO ? fmt(l.prevRecv) : DASH}
                </td>
                <td className="tnum px-2 py-1.5 text-right">{withPO ? fmt(remaining) : DASH}</td>
                <td className="px-2 py-1.5">
                  {mode === "edit" ? (
                    <CellInput
                      aria-label={`จำนวนที่รับเข้า บรรทัดที่ ${i + 1}`}
                      type="number"
                      min={0}
                      value={String(l.qty ?? "")}
                      onChange={(e) => onCell(l.id, "qty", e.target.value)}
                      onFocus={() => onSelect(l.id, true)}
                      disabled={off}
                      className={`text-right ${
                        invalid.has(`line-${l.id}-qty`) ? "border-danger" : ""
                      }`}
                    />
                  ) : (
                    <span className="tnum block text-right font-medium">{fmt(num(l.qty))}</span>
                  )}
                </td>
                <td className="tnum px-2 py-1.5 text-right">
                  {!withPO || !num(l.qty) ? (
                    DASH
                  ) : variance === 0 ? (
                    <span className="text-success-text">ครบ</span>
                  ) : variance > 0 ? (
                    <Badge tone="info">เกิน {fmt(variance)}</Badge>
                  ) : (
                    <Badge tone="warning">ขาด {fmt(-variance)}</Badge>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {mode === "edit" ? (
                    <CellInput
                      aria-label={`ตำแหน่งจัดเก็บ บรรทัดที่ ${i + 1}`}
                      value={l.location}
                      placeholder="โซน/ชั้น"
                      onChange={(e) => onPatch(l.id, { location: e.target.value })}
                      disabled={off}
                    />
                  ) : (
                    l.location || DASH
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {l.qcRequired ? <Badge tone="warning">QC</Badge> : <span className="text-ink-3">{DASH}</span>}
                </td>
                {mode === "edit" && !withPO && (
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      aria-label={`ลบบรรทัดที่ ${i + 1}`}
                      onClick={() => onRemove(l.id)}
                      className="text-ink-3 hover:text-danger"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Same search-and-pick the other documents use, on a receipt row. */
function ProductPick({
  line,
  index,
  onPick,
}: {
  line: GrDraftLine;
  index: number;
  onPick: (id: string, code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => (open ? productSearch(query) : []), [open, query]);

  return (
    <div className="relative">
      <CellInput
        aria-label={`Item Code ${index + 1}`}
        value={open ? query : line.code}
        placeholder="ค้นหาสินค้า..."
        onFocus={() => {
          setQuery(line.code);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!open && line.name && <span className="mt-0.5 block text-cap text-ink-3">{line.name}</span>}
      {open && hits.length > 0 && (
        <ul
          role="listbox"
          aria-label={`ผลการค้นหาสินค้า บรรทัดที่ ${index + 1}`}
          className="absolute left-0 top-[36px] z-20 max-h-[240px] w-[320px] overflow-y-auto rounded-card border border-line bg-card py-1 shadow-lg"
        >
          {hits.map((h) => (
            <li key={h.code}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-surface"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(line.id, h.code);
                  setOpen(false);
                }}
              >
                <span className="text-[13px] font-medium">{h.code}</span>
                <span className="text-cap text-ink-2">{h.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { blankGrLine };
