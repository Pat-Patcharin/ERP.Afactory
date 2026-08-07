"use client";

import { useCallback, useMemo } from "react";
import {
  applyQuotation,
  blankSrDraft,
  draftFromSalesRequest,
  quotationChoices,
  saveSalesRequestDraft,
  srInsight,
  srPrintDoc,
  srTotals,
  validateSrDraft,
  type SalesRequestDraft,
} from "@/lib/domain/sales-request-draft";
import { planBillTypeChange } from "@/lib/domain/doc-draft";
import type { SalesRequest } from "@/data/sales-requests";
import { buildPrintJob, getPrintConfig } from "@/lib/print";
import { toDisplayDate } from "@/lib/format";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { useCrumbCode } from "@/components/layout/Topbar";
import {
  BillToPanel,
  CreditWarning,
  PriceTierNotice,
  DocFooter,
  DocHeader,
  InsightPanel,
  IssueSummary,
  ItemTable,
  type ItemTableLayout,
  MetaPanel,
  MetaSelect,
  metaControls,
  RemarksPanel,
  ShipToPanel,
  SignatureRow,
  TotalsPanel,
  anchorId,
  type MetaRow,
} from "@/components/document/parts";
import {
  DocumentEditorShell,
  ItemSectionBar,
} from "@/components/document/DocumentEditorShell";
import { useDocumentEditor } from "@/components/document/useDocumentEditor";
import { SR_CHANNELS, SR_PRICE_LISTS, SR_PRIORITY } from "@/data/sales-requests";
import { BILL_TYPES, PAY_TERMS } from "@/data/partners";
import {
  BillTypeNotice,
  billTypeConfirmText,
  billTypeDialogTitle,
} from "@/components/document/BillTypeNotice";
import { PriceApprovalNotice } from "@/components/document/PriceApprovalNotice";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { warehouseOptions, salesRepOptions } from "@/lib/domain/outbound";

/* ============================================================
   SALES REQUEST EDITOR

   The same document-first editor as the quotation, on the
   document that actually starts the outbound process.

   A request is internal: it goes to an approver, not to the
   customer. So the header carries a required date, a priority
   and the warehouse expected to serve it, the closing signature
   is the approver rather than the customer, and the primary
   action submits for approval rather than issuing a price.

   Everything else — the draft, its lines, autosave, recovery,
   the toolbar and the paper — is the shared editor in
   components/document/useDocumentEditor.ts and
   DocumentEditorShell.tsx. What remains in this file is only
   what a sales request decides differently from a quotation.
   ============================================================ */

/**
 * The item grid a sales request shows.
 *
 * Lot, serial and UOM go for the same reason they go on the quotation: a
 * request reserves nothing — its own remark says so — so there is no picked
 * stock to record against, and the unit comes with the product.
 *
 * What it adds over the quotation is the stock figure. A request is the
 * document where someone first asks "can we actually serve this?", and the
 * answer belongs beside the quantity while it is being typed. It is a working
 * aid, not part of the document: read mode never shows it.
 */
const SR_ITEM_LAYOUT: ItemTableLayout = {
  lot: false,
  serial: false,
  uom: false,
  naming: true,
  standardPrice: true,
  stock: true,
};

/** An internal request closes with the approver, never the customer. */
const SR_SIGNATURES = [
  { en: "Prepared By", th: "ผู้จัดทำ" },
  { en: "Sales Representative", th: "พนักงานขาย" },
  { en: "Reviewed By", th: "ผู้ตรวจสอบ" },
  { en: "Approved By", th: "ผู้อนุมัติ" },
];

export function SalesRequestEditor({ record }: { record?: SalesRequest }) {
  const ctx = useActionCtx();

  const api = useDocumentEditor<SalesRequestDraft, SalesRequest>({
    entity: "sales-request",
    record,
    blank: blankSrDraft,
    fromRecord: draftFromSalesRequest,
    totals: srTotals,
    insight: srInsight,
    validate: validateSrDraft,
    /* The whole reason a quotation exists: the customer agreed a price, so
       the request carries those exact lines rather than being retyped. */
    onPatch: (d, patch) =>
      "quotationRef" in patch ? applyQuotation(d, String(patch.quotationRef ?? "")) : null,
    save: (d, { finalise, user }) => saveSalesRequestDraft(d, { submit: finalise, user }),
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
    insight,
    invalid,
    shownIssues,
    docMode,
    preview,
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

  /**
   * Switching VAT ⇄ Non VAT rewrites the tax on every line, so it is shown
   * before it happens. The plan is built by doc-draft.ts — the same one the
   * quotation editor and the sales order form read, so the figures cannot
   * differ between the three screens. Nothing is worked out here.
   */
  const askBillType = useCallback(
    (next: string) => {
      const plan = planBillTypeChange(draft, next);
      if (!plan) {
        set({ billType: next });
        return;
      }
      ctx.confirm({
        title: billTypeDialogTitle(plan),
        message: (
          <>
            <p className="mb-3 text-ink-2">
              {draft.code} · {draft.customer}
            </p>
            <BillTypeNotice plan={plan} />
          </>
        ),
        confirmText: billTypeConfirmText(plan),
        tone: plan.overwritten.length ? "danger" : "primary",
        onConfirm: () => set({ billType: next }),
      });
    },
    [ctx, draft, set],
  );

  /* ---------- How this document reports what the save did ---------- */

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
          res.created ? "สร้างคำขอขายแล้ว — รออนุมัติ" : "บันทึกการแก้ไขแล้ว",
          `${res.code} — ${draft.customer}`,
          "success",
        );
        ctx.goto(`/m/sales-request/${encodeURIComponent(res.code)}`);
      },
    }),
    [ctx, draft.customer],
  );

  const cancel = useCallback(() => {
    const leave = () => {
      clearStoredDraft();
      ctx.goto(
        mode === "edit" ? `/m/sales-request/${encodeURIComponent(draft.code)}` : "/m/sales-request",
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
      message: "ล้างข้อมูลทั้งหมดกลับเป็นคำขอขายเปล่า",
      confirmText: "ล้างเอกสาร",
      tone: "danger",
      onConfirm: resetDraft,
    });
  }, [ctx, resetDraft]);

  /** Print job built from what is on screen right now, not from the store. */
  const printJob = useMemo(() => {
    if (preview !== "print") return null;
    const config = getPrintConfig("sales-request");
    if (!config) return null;
    return buildPrintJob("sales-request", draft.code, {
      document: srPrintDoc(draft, config),
      watermark: draft.status === "Draft" ? "DRAFT" : undefined,
    });
  }, [draft, preview]);

  /* ---------- Metadata rows this document shows ---------- */

  const metaRows: MetaRow[] = useMemo(() => {
    const { txt, sel } = metaControls(draft, set);

    return [
      { field: "requestDate", label: "Request Date", required: true, control: txt("requestDate", "Request Date", "date"), read: toDisplayDate(draft.requestDate) },
      { field: "requiredDate", label: "Required Date", required: true, control: txt("requiredDate", "Required Date", "date"), read: toDisplayDate(draft.requiredDate) },
      { field: "priority", label: "Priority", required: true, control: sel("priority", "Priority", SR_PRIORITY), read: draft.priority },
      {
        field: "quotationRef",
        label: "Source Quotation",
        control: (
          <MetaSelect
            label="Source Quotation"
            value={draft.quotationRef}
            options={quotationChoices(draft.customerCode)}
            placeholder="— ลูกค้าติดต่อตรง —"
            onChange={(v) => set({ quotationRef: v })}
          />
        ),
        read: draft.quotationRef,
      },
      { field: "customerRef", label: "Customer Reference", control: txt("customerRef", "Customer Reference"), read: draft.customerRef },
      { field: "salesRep", label: "Sales Representative", required: true, control: sel("salesRep", "Sales Representative", salesRepOptions(), "— เลือกพนักงานขาย —"), read: draft.salesRep },
      { field: "warehouse", label: "Preferred Warehouse", required: true, control: sel("warehouse", "Preferred Warehouse", warehouseOptions(), "— เลือกคลัง —"), read: draft.warehouse },
      { field: "priceList", label: "Price List", required: true, control: sel("priceList", "Price List", SR_PRICE_LISTS), read: draft.priceList },
      { field: "currency", label: "Currency", required: true, control: sel("currency", "Currency", PO_CURRENCIES), read: draft.currency },
      { field: "payTerm", label: "Payment Term", control: sel("payTerm", "Payment Term", PAY_TERMS), read: draft.payTerm },
      { field: "channel", label: "Sales Channel", control: sel("channel", "Sales Channel", SR_CHANNELS), read: draft.channel },
      {
        field: "billType",
        label: "Bill Type",
        /* Not `sel()`: this one asks before it writes. See askBillType. */
        control: (
          <MetaSelect
            label="Bill Type"
            value={draft.billType}
            options={BILL_TYPES}
            onChange={askBillType}
          />
        ),
        read: draft.billType,
      },
      { field: "internalRef", label: "Internal Reference", control: txt("internalRef", "Internal Reference"), read: draft.internalRef },
    ];
  }, [askBillType, draft, set]);

  return (
    <DocumentEditorShell
      api={api}
      labels={{
        entityName: "Sales Request",
        primaryAction: "Submit Request",
        noPermissionTitle: "ไม่มีสิทธิ์สร้างคำขอขาย",
        noPermissionBody: "บทบาทของคุณเปิดคำขอขายได้ แต่แก้ไขไม่ได้",
      }}
      testIds={{
        toolbar: "sr-toolbar",
        document: "request-document",
        stickySummary: "sr-sticky-summary",
      }}
      printJob={printJob}
      onSaveDraft={() => saveDraftNow(reporter)}
      onSave={() => saveDocument(reporter)}
      onCancel={cancel}
      onReset={reset}
      onDuplicate={() => {
        const code = duplicate();
        ctx.toast("ทำสำเนาแล้ว", `เอกสารใหม่ ${code} — ข้อมูลเดิมถูกคัดลอกมาให้`, "info");
      }}
      onImport={(codes) => {
        addLines(codes);
        ctx.toast("เพิ่มรายการแล้ว", `${codes.length} รายการ`, "success");
      }}
    >
      <DocHeader
        title="SALES REQUEST"
        titleTh="ใบขอขาย"
        code={draft.code}
        status={draft.status}
      />

      <div className="mt-5 grid grid-cols-[1fr_1fr_minmax(300px,340px)] items-start gap-4 max-[1100px]:grid-cols-1">
        <BillToPanel draft={draft} mode={docMode} set={set} invalid={invalid} />
        <ShipToPanel draft={draft} mode={docMode} set={set} invalid={invalid} />
        <MetaPanel rows={metaRows} mode={docMode} invalid={invalid} />
      </div>

      {docMode === "edit" && (
        <div className="mt-4 flex flex-col gap-3">
          <InsightPanel insight={insight} />
          <CreditWarning insight={insight} />
          <PriceTierNotice insight={insight} />
          {insight.priceApproval && <PriceApprovalNotice plan={insight.priceApproval} />}
          <IssueSummary issues={shownIssues} onJump={jumpTo} />
        </div>
      )}

      {/* ---------- Items ---------- */}
      <section id={anchorId("items")} className="mt-6">
        <ItemSectionBar
          mode={docMode}
          selectedCount={selected.size}
          onAdd={addLine}
          onImport={() => setPasteOpen(true)}
          onMove={moveSelected}
          onRemoveSelected={removeSelected}
        />

        <div onKeyDown={onGridKey}>
          <ItemTable
            items={draft.items}
            mode={docMode}
            invalid={invalid}
            onCell={setLine}
            onPick={pickProduct}
            onRemove={removeLine}
            onAdd={addLine}
            selected={selected}
            onSelect={selectLine}
            layout={SR_ITEM_LAYOUT}
            customerPick={draft.customerPick}
            onPatch={patchLine}
          />
        </div>
      </section>

      {/* ---------- Remarks and totals ---------- */}
      <div className="mt-5 grid grid-cols-[1fr_minmax(320px,420px)] items-start gap-5 max-[1100px]:grid-cols-1">
        <RemarksPanel
          remarks={draft.remarks}
          internalNote={draft.internalNote}
          mode={docMode}
          onRemarks={(remarks) => set({ remarks })}
          onInternalNote={(internalNote) => set({ internalNote })}
        />
        <TotalsPanel
          charges={draft}
          totals={totals}
          taxed={draft.items.some((l) => Number(l.tax) > 0)}
          mode={docMode}
          set={set}
        />
      </div>

      <div className="mt-6">
        <SignatureRow blocks={SR_SIGNATURES} />
      </div>

      <div className="mt-6">
        <DocFooter createdBy={user} savedLabel={savedLabel} />
      </div>
    </DocumentEditorShell>
  );
}
