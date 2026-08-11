"use client";

import { useCallback, useMemo } from "react";
import {
  QT_VALID_DAY_OPTIONS,
  applyValidity,
  blankDraft,
  draftFromQuotation,
  draftInsight,
  draftPrintDoc,
  draftTotals,
  saveQuotationDraft,
  validateDraft,
  type QuotationDraft,
} from "@/lib/domain/quotation-draft";
import {
  applyProductForCustomer,
  planBillTypeChange,
  sellSidePatch,
} from "@/lib/domain/doc-draft";
import type { DraftLine } from "@/lib/domain/doc-draft";
import type { Quotation } from "@/data/quotations";
import { buildPrintJob, getPrintConfig } from "@/lib/print";
import { isoToDmy, stamp } from "@/lib/format";
import { Icon } from "@/lib/icons";
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
  MetaText,
  metaControls,
  RemarksPanel,
  ValidityChips,
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
import { QT_CHANNELS, QT_PRICE_LISTS } from "@/data/quotations";
import { BILL_TYPES, PAY_TERMS } from "@/data/partners";
import {
  BillTypeNotice,
  billTypeConfirmText,
  billTypeDialogTitle,
} from "@/components/document/BillTypeNotice";
import { PriceApprovalNotice } from "@/components/document/PriceApprovalNotice";
import { getQT, warehouseOptions, salesRepOptions } from "@/lib/domain/outbound";
import { qtSubmit } from "@/lib/workflows-outbound";

/* ============================================================
   QUOTATION EDITOR

   One page. The salesperson types into the quotation itself —
   the same header, the same panels, the same item table and the
   same totals block that will come out of the printer.

   There is no wizard, no review step and no separate preview
   summary: the document IS the form, so there is nothing left to
   review afterwards. Preview only strips the controls.

   Business logic lives in lib/domain/quotation-draft.ts; the
   interaction — editing, autosave, validation timing, the save
   actions — is the shared editor in
   components/document/useDocumentEditor.ts and
   DocumentEditorShell.tsx. What is left in this file is only
   what a quotation decides differently from a sales request.
   ============================================================ */

/**
 * The item grid a quotation shows.
 *
 * Lot and serial belong to stock that has been picked; a quotation reserves
 * nothing, so there is nothing to record against. UOM comes with the product
 * and is not a per-line decision either. What a quotation does need is the
 * salesperson's own wording for the customer and the price that customer is
 * supposed to pay.
 */
const QT_ITEM_LAYOUT: ItemTableLayout = {
  lot: false,
  serial: false,
  uom: false,
  naming: true,
  standardPrice: true,
};

/**
 * A picked product opens the line at this customer's own price.
 *
 * Module scope, not an inline arrow in the config: the hook lists it as a
 * dependency of `pickProduct` and `addLines`, so a fresh identity every render
 * would rebuild both and re-render the item grid for nothing. They were stable
 * before the config existed and stay stable now.
 */
const applyLineProduct = (line: DraftLine, code: string, draft: QuotationDraft) =>
  applyProductForCustomer(line, code, draft.customerPick);

/** A quotation closes with the customer accepting it. */
const QT_SIGNATURES = [
  { en: "Prepared By", th: "ผู้จัดทำ" },
  { en: "Sales Representative", th: "พนักงานขาย" },
  { en: "Approved By", th: "ผู้อนุมัติ" },
  { en: "Customer Acceptance", th: "ลูกค้าผู้รับรอง" },
];

/**
 * The customer's own purchase order, attached to the quotation.
 *
 * PDF or an image, because that is what arrives — a scan, a phone photo of a
 * signed sheet, an emailed PDF. Held as an object URL for now: the file is
 * real inside this browser session and goes when the tab does, which is the
 * honest state of a prototype with no upload target behind it. Swapping the
 * URL for one a server returns is the whole of the change later.
 */
function CustomerPoAttach({
  value,
  onChange,
}: {
  value: { name: string; type: string; url: string; at: string } | null;
  onChange: (v: { name: string; type: string; url: string; at: string } | null) => void;
}) {
  const id = "quotation-customer-po";

  return (
    <label className="flex min-w-[210px] flex-col gap-1">
      <span className="text-cap text-ink-2">
        แนบ PO ลูกค้า
        <span className="ml-1 text-ink-3">— PDF หรือรูปภาพ</span>
      </span>

      {value ? (
        <span className="flex h-9 items-center gap-2 rounded-input border border-line bg-card px-2 text-[13px]">
          <Icon name="file" size={15} className="flex-shrink-0 text-primary" />
          <a
            href={value.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate hover:underline"
            title={value.name}
          >
            {value.name}
          </a>
          <button
            type="button"
            aria-label="เอาไฟล์ที่แนบออก"
            onClick={() => onChange(null)}
            className="flex-shrink-0 text-ink-3 hover:text-danger"
          >
            <Icon name="close" size={15} />
          </button>
        </span>
      ) : (
        <>
          <input
            id={id}
            type="file"
            aria-label="แนบ PO ลูกค้า"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              /* An object URL when the browser offers one. Without it the
                 attachment is still recorded by name and type — a file
                 nobody can preview is better than an upload that throws. */
              const url =
                typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
                  ? URL.createObjectURL(file)
                  : "";
              onChange({
                name: file.name,
                type: file.type || "application/octet-stream",
                url,
                at: stamp(),
              });
            }}
          />
          <label
            htmlFor={id}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-input border border-dashed border-line-strong px-2 text-[13px] text-ink-2 hover:border-primary hover:text-primary"
          >
            <Icon name="upload" size={15} />
            เลือกไฟล์
          </label>
        </>
      )}
    </label>
  );
}

export function QuotationEditor({ record }: { record?: Quotation }) {
  const ctx = useActionCtx();

  const api = useDocumentEditor<QuotationDraft, Quotation>({
    entity: "quotation",
    record,
    blank: blankDraft,
    fromRecord: draftFromQuotation,
    totals: draftTotals,

    validate: validateDraft,
    /* The validity span first — it owns two fields that derive a third —
       then the sell-side three. */
    onPatch: (d, patch) => applyValidity(d, patch) ?? sellSidePatch(d, patch),
    applyProduct: applyLineProduct,
    save: (d, { finalise, user }) => saveQuotationDraft(d, { issue: finalise, user }),
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

  /* Credit, price tier and the approval level — all of it about a customer,
     so it is worked out here rather than by the shared editor, which serves
     documents that have no customer at all. */
  const insight = useMemo(() => draftInsight(draft), [draft]);

  /**
   * Switching VAT ⇄ Non VAT rewrites the tax on every line, so it is shown
   * before it happens. The plan — which lines change, by how much, what the
   * total becomes — is built by doc-draft.ts, the same one the sales request
   * editor and the sales order form read. Nothing is worked out here.
   *
   * No plan means there is nothing to decide: same value, or no priced lines
   * yet. Then the write goes straight through.
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
      /* ------------------------------------------------------------
         THE BUTTON SAYS SAVE **AND** REQUEST FOR APPROVE

         It only saved. `saveQuotationDraft` writes every new record as
         Draft / Not Submitted — deliberately, because it is also what
         Save Draft calls — so a quotation the salesperson had just sent
         for approval sat in the list as a Draft, with nobody told and
         nobody waiting on it. The approver's own tab was empty and the
         rep had no way to know.

         Submitting goes through `qtSubmit`, the same function the list
         row and the decision bar call, rather than a second copy of the
         rule here. That function is what freezes the approval level,
         refuses a line with no cost behind it, writes the history entry
         and notifies whoever may sign — none of which a status set from
         this file would have done.

         Only from Draft. An approver editing a quotation that is
         already Pending Approval is correcting it in place, and must
         not push it back through submission behind their own back.
         ------------------------------------------------------------ */
      saved: (res: { code: string; created: boolean }) => {
        const record = getQT(res.code);
        if (record?.status === "Draft") {
          /* Says what happened, and who it now waits on, in its own toast. */
          qtSubmit(record, ctx);
        } else {
          ctx.toast("บันทึกการแก้ไขแล้ว", `${res.code} — ${draft.customer}`, "success");
        }
        ctx.goto(`/m/quotation/${encodeURIComponent(res.code)}`);
      },
    }),
    [ctx, draft.customer],
  );

  const cancel = useCallback(() => {
    const leave = () => {
      clearStoredDraft();
      ctx.goto(mode === "edit" ? `/m/quotation/${encodeURIComponent(draft.code)}` : "/m/quotation");
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
      message: "ล้างข้อมูลทั้งหมดกลับเป็นใบเสนอราคาเปล่า",
      confirmText: "ล้างเอกสาร",
      tone: "danger",
      onConfirm: resetDraft,
    });
  }, [ctx, resetDraft]);

  /** Print job built from what is on screen right now, not from the store. */
  const printJob = useMemo(() => {
    if (preview !== "print") return null;
    const config = getPrintConfig("quotation");
    if (!config) return null;
    return buildPrintJob("quotation", draft.code, {
      document: draftPrintDoc(draft, config),
      watermark: draft.status === "Draft" ? "DRAFT" : undefined,
    });
  }, [draft, preview]);

  /* ---------- Metadata rows this document shows ---------- */

  const metaRows: MetaRow[] = useMemo(() => {
    const { txt, sel } = metaControls(draft, set);

    /* Six rows and the validity line beneath them. What is NOT here is as
       deliberate as what is:

         customerRef · channel · billType   moved off the paper — see the
                                            settings strip above the sheet
         warehouse · internalRef            deleted; neither was ever written
                                            to the record, so both had been
                                            collecting typing and dropping it
                                            since the day they were added
         validUntil                         now derived from a span, shown
                                            under the panel rather than as a
                                            date somebody counts out */
    return [
      { field: "quoteDate", label: "Quotation Date", required: true, control: txt("quoteDate", "Quotation Date", "date"), read: isoToDmy(draft.quoteDate) },
      { field: "salesRep", label: "Sales Representative", required: true, control: sel("salesRep", "Sales Representative", salesRepOptions(), "— เลือกพนักงานขาย —"), read: draft.salesRep },
      { field: "priceList", label: "Price List", required: true, control: sel("priceList", "Price List", QT_PRICE_LISTS), read: draft.priceList },
      { field: "payTerm", label: "Payment Term", control: sel("payTerm", "Payment Term", PAY_TERMS), read: draft.payTerm },
      /* No Currency and no Delivery Date.

         Everything is quoted in baht, so the currency was a one-option
         question asked on every quotation. And a delivery date is a promise
         about goods — it is settled on the order, against stock that exists;
         printing one on an offer commits the warehouse to a date nobody has
         checked. Both are still on the sales order, where they mean
         something. */
    ];
  }, [draft, set]);

  /* Off the paper, in one place. See the strip's note in the shell. */
  const settings = (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-cap text-ink-2">Bill Type</span>
        <MetaSelect
          label="Bill Type"
          value={draft.billType}
          options={BILL_TYPES}
          /* Asks before it writes — retaxing every line is not a silent
             change. See askBillType. */
          onChange={askBillType}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-cap text-ink-2">Sales Channel</span>
        <MetaSelect
          label="Sales Channel"
          value={draft.channel}
          options={QT_CHANNELS}
          onChange={(channel) => set({ channel })}
        />
      </label>
      <label className="flex min-w-[190px] flex-1 flex-col gap-1">
        <span className="text-cap text-ink-2">
          Customer Reference
          <span className="ml-1 text-ink-3">— เลข PO ของลูกค้า</span>
        </span>
        <MetaText
          label="Customer Reference"
          value={draft.customerRef}
          onChange={(customerRef) => set({ customerRef })}
        />
      </label>
      <CustomerPoAttach
        value={draft.customerPo}
        onChange={(customerPo) => set({ customerPo })}
      />
    </>
  );

  return (
    <DocumentEditorShell
      api={api}
      settings={settings}
      labels={{
        entityName: "Quotation",
        /* It saves AND asks for approval — one button doing two things says
           both, or somebody presses it expecting only the first. Save Draft
           beside it is the one that does only the first. */
        primaryAction: "Save and Request for Approve",
        noPermissionTitle: "ไม่มีสิทธิ์สร้างใบเสนอราคา",
        noPermissionBody: "บทบาทของคุณเปิดใบเสนอราคาได้ แต่แก้ไขไม่ได้",
      }}
      testIds={{
        toolbar: "qt-toolbar",
        document: "quotation-document",
        stickySummary: "qt-sticky-summary",
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
        title="QUOTATION"
        titleTh="ใบเสนอราคา"
        code={draft.code}
        status={draft.status}
      />

      <div className="mt-5 grid grid-cols-[1fr_1fr_minmax(300px,340px)] items-start gap-4 max-[1100px]:grid-cols-1">
        <BillToPanel draft={draft} mode={docMode} set={set} invalid={invalid} />
        <ShipToPanel draft={draft} mode={docMode} set={set} invalid={invalid} />
        <div>
          <MetaPanel rows={metaRows} mode={docMode} invalid={invalid} />
          {/* Under the panel rather than inside it: the span is one line of
              prose on the finished sheet, not a labelled field. */}
          <ValidityChips
            days={draft.validDays}
            until={isoToDmy(draft.validUntil)}
            options={QT_VALID_DAY_OPTIONS}
            mode={docMode}
            onChange={(validDays) => set({ validDays })}
          />
        </div>
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
            /* A quotation is an offer: nothing is picked from a shelf, so
               there is no lot and no serial to record, and the unit is the
               product's own rather than something typed per line. What it
               does need is the customer's wording and this customer's
               standard price. */
            layout={QT_ITEM_LAYOUT}
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
        <SignatureRow blocks={QT_SIGNATURES} />
      </div>

      <div className="mt-6">
        <DocFooter createdBy={user} savedLabel={savedLabel} />
      </div>
    </DocumentEditorShell>
  );
}
