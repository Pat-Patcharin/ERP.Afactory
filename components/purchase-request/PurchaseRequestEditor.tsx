"use client";

import { useCallback, useMemo } from "react";
import {
  PR_DEPT_OPTIONS,
  PR_PRIORITY_OPTIONS,
  PR_REQUESTER_OPTIONS,
  PR_SUPPLIER_OPTIONS,
  PR_WAREHOUSE_OPTIONS,
  applyProductForPurchase,
  blankPrDraft,
  draftFromPurchaseRequest,
  prTotals,
  savePurchaseRequestDraft,
  suggestedSupplierFor,
  validatePrDraft,
  type PurchaseRequestDraft,
} from "@/lib/domain/purchase-request-draft";
import type { PurchaseRequest } from "@/data/purchase-requests";
import { toDisplayDate } from "@/lib/format";
import { useActionCtx } from "@/components/engine/useActionCtx";
import { useCrumbCode } from "@/components/layout/Topbar";
import {
  DestinationPanel,
  DocFooter,
  DocHeader,
  IssueSummary,
  ItemTable,
  type ItemTableLayout,
  MetaPanel,
  metaControls,
  RemarksPanel,
  RequesterPanel,
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
import { StockAdvicePanel } from "./StockAdvicePanel";
import { formStatus } from "@/lib/form";
import { PR_FORM } from "@/schemas/forms/purchase-request";

/* ============================================================
   PURCHASE REQUEST EDITOR

   The buying side's opening document, on the same one-page
   editor the quotation and the sales request use. Type into the
   document; there is no wizard and no review step.

   What makes it a different document rather than a recoloured
   sales request:

     · Requested By / Deliver To instead of Bill To / Ship To —
       different panels, not the same ones relabelled.
     · No QR or barcode. It never leaves the company, so there is
       nobody outside to scan it.
     · Teal, through `data-doc-family="inbound"`, so a buyer can
       see at a glance that this is not a sales document.
     · Lines open at the supplier's last cost, not the catalogue
       price — the company is spending, not charging.

   The company header stays, because an approved request is
   printed and filed as the evidence that the spend was agreed.
   ============================================================ */

/**
 * The item grid a purchase request shows.
 *
 * Lot and serial belong to goods that exist; nothing has been bought yet.
 * `standardPrice` is off because there is no customer price to compare
 * against — the reference figure here is the supplier's cost, which
 * `applyProductForPurchase` has already put in the price cell.
 *
 * `stock` is on for the same reason the sales request has it, from the other
 * direction: the first question about a request is "do we actually need
 * this?", and the shelf figure answers it while the quantity is being typed.
 */
const PR_ITEM_LAYOUT: ItemTableLayout = {
  lot: false,
  serial: false,
  uom: false,
  naming: false,
  standardPrice: false,
  stock: true,
};

/** An internal request closes with the approvers who release the money. */
const PR_SIGNATURES = [
  { en: "Requested By", th: "ผู้ขอซื้อ" },
  { en: "Department Head", th: "หัวหน้าแผนก" },
  { en: "Purchasing", th: "ฝ่ายจัดซื้อ" },
  { en: "Approved By", th: "ผู้อนุมัติ" },
];

/** See the note on `applyProduct` in useDocumentEditor.ts — module scope. */
const applyLineProduct = (line: Parameters<typeof applyProductForPurchase>[0], code: string) =>
  applyProductForPurchase(line, code);

export function PurchaseRequestEditor({ record }: { record?: PurchaseRequest }) {
  const ctx = useActionCtx();

  const api = useDocumentEditor<PurchaseRequestDraft, PurchaseRequest>({
    entity: "purchase-request",
    record,
    blank: blankPrDraft,
    fromRecord: draftFromPurchaseRequest,
    totals: prTotals,
    validate: validatePrDraft,
    applyProduct: applyLineProduct,
    save: (d, { finalise, user }) => savePurchaseRequestDraft(d, { submit: finalise, user }),
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

  /* Offered once, when the requester has picked products and not yet named a
     supplier. Never written on their behalf: purchasing chooses the real one
     on the purchase order, and a value that appeared by itself would look
     like a decision somebody made. */
  const suggestion = useMemo(
    () => (draft.supplier ? "" : suggestedSupplierFor(draft.items)),
    [draft.items, draft.supplier],
  );

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
          res.created ? "ส่งใบขอซื้อแล้ว — รออนุมัติ" : "บันทึกการแก้ไขแล้ว",
          `${res.code} — ${draft.dept || "ไม่ระบุแผนก"}`,
          "success",
        );
        ctx.goto(`/m/purchase-request/${encodeURIComponent(res.code)}`);
      },
    }),
    [ctx, draft.dept],
  );

  const cancel = useCallback(() => {
    const leave = () => {
      clearStoredDraft();
      ctx.goto(
        mode === "edit"
          ? `/m/purchase-request/${encodeURIComponent(draft.code)}`
          : "/m/purchase-request",
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
      message: "ล้างข้อมูลทั้งหมดกลับเป็นใบขอซื้อเปล่า",
      confirmText: "ล้างเอกสาร",
      tone: "danger",
      onConfirm: resetDraft,
    });
  }, [ctx, resetDraft]);

  /**
   * The completion count, from the same `formStatus()` the stepped form used.
   *
   * `PR_FORM` is still the authority on which fields are required, so the
   * count cannot drift from the form's own rules — and a field added to
   * `PR_FORM.required` starts being counted here without this file changing.
   *
   * The draft's field names line up with the form's paths except for two the
   * document renamed for the paper (`requestDate`, `reason`), which are
   * mapped rather than renamed back: the paper's wording is the point.
   */
  const progress = useMemo(() => {
    const state: Record<string, unknown> = {
      ...draft,
      date: draft.requestDate,
      note: draft.reason,
      items: draft.items.filter((l) => String(l.code ?? "").trim()),
    };
    const status = formStatus(PR_FORM, state);
    return {
      done: status.done,
      total: status.total,
      percent: status.percent,
      sectionCount: PR_FORM.steps.length,
    };
  }, [draft]);

  const metaRows: MetaRow[] = useMemo(() => {
    const { txt, sel } = metaControls(draft, set);
    return [
      {
        field: "requestDate",
        label: "Request Date",
        required: true,
        control: txt("requestDate", "Request Date", "date"),
        read: toDisplayDate(draft.requestDate),
      },
      {
        field: "priority",
        label: "Priority",
        required: true,
        control: sel("priority", "Priority", PR_PRIORITY_OPTIONS),
        read: draft.priority,
      },
    ];
  }, [draft, set]);

  return (
    /* One attribute, and every document token inside turns teal. The sidebar,
       the logo and the top bar are outside it and stay on the brand. */
    <div data-doc-family="inbound">
      <DocumentEditorShell
        api={api}
        labels={{
          entityName: "Purchase Request",
          primaryAction: "Submit Request",
          noPermissionTitle: "ไม่มีสิทธิ์สร้างใบขอซื้อ",
          noPermissionBody: "บทบาทของคุณเปิดใบขอซื้อได้ แต่แก้ไขไม่ได้",
        }}
        testIds={{
          toolbar: "pr-toolbar",
          document: "purchase-request-document",
          stickySummary: "pr-sticky-summary",
        }}
        /* No print config for this document type yet — P1c. */
        printJob={null}
        progress={progress}
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
          title="PURCHASE REQUEST"
          titleTh="ใบขอซื้อ"
          code={draft.code}
          status={draft.status}
          /* Internal document: nobody outside scans it, so a verify mark
             would verify nothing. */
          showVerifyCode={false}
        />

        <div className="mt-5 grid grid-cols-[1fr_1fr_minmax(300px,340px)] items-start gap-4 max-[1100px]:grid-cols-1">
          <RequesterPanel
            draft={draft}
            mode={docMode}
            set={set}
            invalid={invalid}
            departments={PR_DEPT_OPTIONS}
            requesters={PR_REQUESTER_OPTIONS}
          />
          <DestinationPanel
            draft={draft}
            mode={docMode}
            set={set}
            invalid={invalid}
            warehouses={PR_WAREHOUSE_OPTIONS()}
            suppliers={PR_SUPPLIER_OPTIONS}
          />
          <MetaPanel rows={metaRows} mode={docMode} invalid={invalid} />
        </div>

        {docMode === "edit" && (
          <div className="mt-4 flex flex-col gap-3">
            <StockAdvicePanel items={draft.items} suggestedSupplier={suggestion} />
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
              layout={PR_ITEM_LAYOUT}
              customerPick=""
              onPatch={patchLine}
            />
          </div>
        </section>

        {/* ---------- Reason and totals ---------- */}
        <div className="mt-5 grid grid-cols-[1fr_minmax(320px,420px)] items-start gap-5 max-[1100px]:grid-cols-1">
          <RemarksPanel
            remarks={draft.reason}
            internalNote=""
            mode={docMode}
            onRemarks={(reason) => set({ reason })}
            onInternalNote={() => {}}
          />
          <TotalsPanel
            charges={draft}
            totals={totals}
            /* A request carries no tax — what the company is charged is
               settled on the purchase order against the supplier's terms. */
            taxed={false}
            mode={docMode}
            set={set}
          />
        </div>

        <div className="mt-6">
          <SignatureRow blocks={PR_SIGNATURES} />
        </div>

        <div className="mt-6">
          <DocFooter createdBy={user} savedLabel={savedLabel} />
        </div>
      </DocumentEditorShell>
    </div>
  );
}
