"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRODUCTS } from "@/lib/domain/product";
import { can } from "@/lib/domain/admin";
import {
  applyCustomer,
  applyProduct,
  applyQuotation,
  applyShipTo,
  blankLine,
  blankSrDraft,
  blockingIssues,
  draftFromSalesRequest,
  quotationChoices,
  saveSalesRequestDraft,
  srInsight,
  srPrintDoc,
  srTotals,
  validateSrDraft,
  type DraftLine,
  type SalesRequestDraft,
} from "@/lib/domain/sales-request-draft";
import type { SalesRequest } from "@/data/sales-requests";
import { buildPrintJob, getPrintConfig } from "@/lib/print";
import { PrintDocument } from "@/components/print/PrintDocument";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/form";
import { money, money0, timeAgo } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button, Input, Menu, MenuItem, MenuSep, Modal, Textarea } from "@/components/ui";
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
  MetaPanel,
  MetaSelect,
  MetaText,
  RemarksPanel,
  ShipToPanel,
  SignatureRow,
  TotalsPanel,
  anchorId,
  type DocMode,
  type MetaRow,
} from "@/components/document/parts";
import { SR_CHANNELS, SR_PRICE_LISTS, SR_PRIORITY } from "@/data/sales-requests";
import { PAY_TERMS } from "@/data/partners";
import { PO_CURRENCIES } from "@/data/purchase-orders";
import { warehouseOptions, salesRepOptions } from "@/lib/domain/outbound";
import { toDisplayDate } from "@/lib/format";

/* ============================================================
   SALES REQUEST EDITOR

   The same document-first editor as the quotation, on the
   document that actually starts the outbound process.

   A request is internal: it goes to an approver, not to the
   customer. So the header carries a required date, a priority
   and the warehouse expected to serve it, the closing signature
   is the approver rather than the customer, and the primary
   action submits for approval rather than issuing a price.

   Everything else — customer, lines, totals, credit, printing —
   is the shared sell-side machinery in lib/domain/doc-draft.ts
   and components/document/parts.tsx.
   ============================================================ */

const AUTOSAVE_DEBOUNCE = 1500;
const CLOCK_TICK = 20_000;
const FORM_USER = "Pimpaka S.";

type SaveState = "idle" | "saving" | "saved" | "failed";

/** An internal request closes with the approver, never the customer. */
const SR_SIGNATURES = [
  { en: "Prepared By", th: "ผู้จัดทำ" },
  { en: "Sales Representative", th: "พนักงานขาย" },
  { en: "Reviewed By", th: "ผู้ตรวจสอบ" },
  { en: "Approved By", th: "ผู้อนุมัติ" },
];

export function SalesRequestEditor({ record }: { record?: SalesRequest }) {
  const ctx = useActionCtx();
  const mode = record ? "edit" : "create";
  const storeKey = draftKey("sales-request", record?.code);

  const [draft, setDraft] = useState<SalesRequestDraft>(() =>
    record ? draftFromSalesRequest(record) : blankSrDraft(),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<null | "document" | "print">(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [autosave, setAutosave] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = useRef(false);
  const [, setClock] = useState(0);

  useCrumbCode(mode === "edit" ? (record?.code ?? null) : "New");

  const mayEdit = can("sales-request", mode === "edit" ? "edit" : "create");

  /* ---------- Writing ---------- */

  const set = useCallback((patch: Partial<SalesRequestDraft>) => {
    dirty.current = true;
    setDraft((d) => {
      /* The customer drives half the document; picking one loads the partner
         rather than only writing the field. */
      if ("customerPick" in patch) return applyCustomer(d, String(patch.customerPick ?? ""));
      if ("shipAddressPick" in patch) return applyShipTo(d, String(patch.shipAddressPick ?? ""));
      /* The whole reason a quotation exists: the customer agreed a price, so
         the request carries those exact lines rather than being retyped. */
      if ("quotationRef" in patch) return applyQuotation(d, String(patch.quotationRef ?? ""));
      return { ...d, ...patch };
    });
  }, []);

  const setLine = useCallback((id: string, col: keyof DraftLine, value: string) => {
    dirty.current = true;
    setDraft((d) => ({
      ...d,
      items: d.items.map((l) =>
        l.id === id
          ? {
              ...l,
              [col]: ["qty", "price", "disc", "tax"].includes(col)
                ? value === ""
                  ? ""
                  : Number(value)
                : value,
            }
          : l,
      ),
    }));
  }, []);

  const pickProduct = useCallback((id: string, code: string) => {
    dirty.current = true;
    setDraft((d) => ({
      ...d,
      items: d.items.map((l) => (l.id === id ? applyProduct(l, code) : l)),
    }));
  }, []);

  const addLine = useCallback(() => {
    dirty.current = true;
    setDraft((d) => ({ ...d, items: [...d.items, blankLine()] }));
  }, []);

  const addLines = useCallback((codes: string[]) => {
    if (!codes.length) return;
    dirty.current = true;
    setDraft((d) => {
      /* An untouched blank row at the end is filler, not data — replace it. */
      const kept = d.items.filter((l) => l.code);
      return { ...d, items: [...kept, ...codes.map((c) => applyProduct(blankLine(), c))] };
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    dirty.current = true;
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    setDraft((d) => {
      const items = d.items.filter((l) => l.id !== id);
      return { ...d, items: items.length ? items : [blankLine()] };
    });
  }, []);

  const removeSelected = useCallback(() => {
    if (!selected.size) return;
    dirty.current = true;
    setDraft((d) => {
      const items = d.items.filter((l) => !selected.has(l.id));
      return { ...d, items: items.length ? items : [blankLine()] };
    });
    setSelected(new Set());
  }, [selected]);

  /** Move the one selected row, so ordering never needs a drag target. */
  const moveSelected = useCallback(
    (dir: -1 | 1) => {
      if (selected.size !== 1) return;
      const id = [...selected][0];
      dirty.current = true;
      setDraft((d) => {
        const i = d.items.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.items.length) return d;
        const items = [...d.items];
        [items[i], items[j]] = [items[j], items[i]];
        return { ...d, items };
      });
    },
    [selected],
  );

  const selectLine = useCallback((id: string, on: boolean) => {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /* ---------- Derived ---------- */

  const totals = useMemo(() => srTotals(draft), [draft]);
  const insight = useMemo(() => srInsight(draft), [draft]);
  const issues = useMemo(() => validateSrDraft(draft), [draft]);
  const blocking = useMemo(() => blockingIssues(issues), [issues]);
  const invalid = useMemo(
    () => new Set(showErrors ? blocking.map((i) => i.field) : []),
    [showErrors, blocking],
  );
  /* Warnings are always worth showing; blocking issues only once the user has
     tried to save, so a half-typed document is not shouted at. */
  const shownIssues = showErrors ? issues : issues.filter((i) => !i.blocking);

  /* ---------- Autosave to local recovery, never to the record ---------- */

  useEffect(() => {
    if (!dirty.current) return;
    setAutosave("saving");
    const t = window.setTimeout(() => {
      const at = writeDraft(storeKey, draft as unknown as Record<string, unknown>);
      if (at) {
        setSavedAt(at);
        setAutosave("saved");
      } else {
        setAutosave("failed");
      }
    }, AUTOSAVE_DEBOUNCE);
    return () => window.clearTimeout(t);
  }, [draft, storeKey]);

  /* Keep "saved 2 minutes ago" honest without re-rendering on every tick. */
  useEffect(() => {
    if (!savedAt) return;
    const id = window.setInterval(() => setClock((c) => c + 1), CLOCK_TICK);
    return () => window.clearInterval(id);
  }, [savedAt]);

  /* Recover an interrupted session. */
  const [recovered, setRecovered] = useState<{ draft: SalesRequestDraft; at: number } | null>(null);
  useEffect(() => {
    const found = readDraft(storeKey);
    if (found?.state) {
      setRecovered({ draft: found.state as unknown as SalesRequestDraft, at: found.at });
    }
  }, [storeKey]);

  /* ---------- Actions ---------- */

  const jumpTo = useCallback((field: string) => {
    const el = document.getElementById(anchorId(field));
    if (!el) return;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    el.querySelector<HTMLElement>("input,select,textarea")?.focus();
  }, []);

  const saveDraftNow = useCallback(() => {
    const res = saveSalesRequestDraft(draft, { submit: false, user: FORM_USER });
    clearDraft(storeKey);
    dirty.current = false;
    setSavedAt(Date.now());
    setAutosave("saved");
    setDraft((d) => ({ ...d, mode: "edit" }));
    ctx.toast("บันทึกฉบับร่างแล้ว", `${res.code} — แก้ไขต่อได้ทุกเมื่อ`, "success");
  }, [ctx, draft, storeKey]);

  const saveQuotation = useCallback(() => {
    setShowErrors(true);
    if (blocking.length) {
      ctx.toast(
        "บันทึกไม่ได้",
        `ต้องแก้ไข ${blocking.length} รายการก่อน — กดที่ข้อความเพื่อไปยังช่องนั้น`,
        "warning",
      );
      jumpTo(blocking[0].field);
      return;
    }
    const res = saveSalesRequestDraft(draft, { submit: true, user: FORM_USER });
    clearDraft(storeKey);
    dirty.current = false;
    ctx.toast(
      res.created ? "สร้างคำขอขายแล้ว — รออนุมัติ" : "บันทึกการแก้ไขแล้ว",
      `${res.code} — ${draft.customer}`,
      "success",
    );
    ctx.goto(`/m/sales-request/${encodeURIComponent(res.code)}`);
  }, [blocking, ctx, draft, jumpTo, storeKey]);

  const cancel = useCallback(() => {
    const leave = () => {
      clearDraft(storeKey);
      ctx.goto(mode === "edit" ? `/m/sales-request/${encodeURIComponent(draft.code)}` : "/m/sales-request");
    };
    if (!dirty.current) return leave();
    ctx.confirm({
      title: "ออกจากหน้านี้",
      message: "การแก้ไขที่ยังไม่ได้บันทึกจะหายไป",
      confirmText: "ออกโดยไม่บันทึก",
      tone: "danger",
      onConfirm: leave,
    });
  }, [ctx, draft.code, mode, storeKey]);

  const reset = useCallback(() => {
    ctx.confirm({
      title: "ล้างเอกสาร",
      message: "ล้างข้อมูลทั้งหมดกลับเป็นคำขอขายเปล่า",
      confirmText: "ล้างเอกสาร",
      tone: "danger",
      onConfirm: () => {
        clearDraft(storeKey);
        setDraft(record ? draftFromSalesRequest(record) : blankSrDraft());
        setShowErrors(false);
        setSelected(new Set());
        dirty.current = false;
      },
    });
  }, [ctx, record, storeKey]);

  const duplicate = useCallback(() => {
    const fresh = blankSrDraft();
    setDraft((d) => ({ ...d, code: fresh.code, mode: "create", status: "Draft" }));
    dirty.current = true;
    ctx.toast("ทำสำเนาแล้ว", `เอกสารใหม่ ${fresh.code} — ข้อมูลเดิมถูกคัดลอกมาให้`, "info");
  }, [ctx]);

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
    const txt = (field: keyof SalesRequestDraft & string, label: string, type = "text") => (
      <MetaText
        label={label}
        type={type}
        value={String(draft[field] ?? "")}
        onChange={(v) => set({ [field]: v } as Partial<SalesRequestDraft>)}
      />
    );
    const sel = (
      field: keyof SalesRequestDraft & string,
      label: string,
      options: readonly string[],
      placeholder?: string,
    ) => (
      <MetaSelect
        label={label}
        value={String(draft[field] ?? "")}
        options={options}
        placeholder={placeholder}
        onChange={(v) => set({ [field]: v } as Partial<SalesRequestDraft>)}
      />
    );

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
      { field: "internalRef", label: "Internal Reference", control: txt("internalRef", "Internal Reference"), read: draft.internalRef },
    ];
  }, [draft, set]);

  /* ---------- Keyboard-first entry ---------- */

  const onGridKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement;
      if (target.tagName !== "INPUT") return;
      e.preventDefault();
      const last = draft.items[draft.items.length - 1];
      /* Enter on the final row opens the next one; anywhere else it just
         commits the cell, which the controlled input has already done. */
      if (last && target.closest("tr")?.id === anchorId(`item-${last.id}`)) addLine();
    },
    [addLine, draft.items],
  );

  /* ---------- Render ---------- */

  if (!mayEdit) {
    return (
      <main className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <p className="text-h3 font-semibold">ไม่มีสิทธิ์สร้างคำขอขาย</p>
          <p className="mt-2 text-ink-2">บทบาทของคุณเปิดคำขอขายได้ แต่แก้ไขไม่ได้</p>
          <Button className="mt-5" onClick={() => ctx.goto("/m/sales-request")}>
            กลับไปหน้ารายการ
          </Button>
        </div>
      </main>
    );
  }

  const docMode: DocMode = preview === "document" ? "read" : "edit";
  const savedLabel =
    autosave === "saving"
      ? "Saving..."
      : autosave === "failed"
        ? "Autosave failed"
        : savedAt
          ? `Last saved: ${timeAgo(savedAt)}`
          : "ยังไม่ได้บันทึก";

  return (
    <main className="pb-28">
      {/* ---------- Sticky application toolbar ---------- */}
      <div
        data-testid="sr-toolbar"
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-card px-6 py-3 max-md:px-4"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">
            {mode === "edit" ? "Edit Sales Request" : "New Sales Request"}
            <span className="ml-2 font-normal text-ink-2 tnum">{draft.code}</span>
          </p>
          <p className="truncate text-cap text-ink-3" data-testid="autosave-status">
            {savedLabel}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setPreview(preview ? null : "document")}>
            <Icon name="eye" size={15} strokeWidth={2} />
            {preview ? "กลับไปแก้ไข" : "Preview"}
          </Button>
          <Button size="sm" onClick={saveDraftNow}>
            Save Draft
          </Button>
          <Button size="sm" variant="primary" onClick={saveQuotation}>
            <Icon name="save" size={15} strokeWidth={2} />
            Submit Request
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>

          <Menu
            trigger={({ toggle }) => (
              <Button size="sm" iconOnly aria-label="More Actions" onClick={toggle}>
                <Icon name="more" size={16} />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon="printer"
                  onClick={() => {
                    close();
                    setPreview("print");
                  }}
                >
                  Print Preview
                </MenuItem>
                <MenuItem
                  icon="copy"
                  onClick={() => {
                    close();
                    duplicate();
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuItem
                  icon="upload"
                  onClick={() => {
                    close();
                    setPasteOpen(true);
                  }}
                >
                  Import Items
                </MenuItem>
                <MenuSep />
                <MenuItem
                  icon="refresh"
                  danger
                  onClick={() => {
                    close();
                    reset();
                  }}
                >
                  Reset
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      {/* ---------- Recovered draft ---------- */}
      {recovered && (
        <div className="mx-auto mt-4 flex max-w-[1180px] flex-wrap items-center gap-3 rounded-card border border-info/30 bg-info-soft px-4 py-3 text-[13px] max-md:mx-4">
          <Icon name="info" size={16} className="text-info" />
          <span className="min-w-0 flex-1">
            พบฉบับร่างที่ยังไม่ได้บันทึกจาก {timeAgo(recovered.at)}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setDraft(recovered.draft);
              setRecovered(null);
            }}
          >
            กู้คืน
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearDraft(storeKey);
              setRecovered(null);
            }}
          >
            ทิ้งไป
          </Button>
        </div>
      )}

      {/* ---------- The document ---------- */}
      <div className="px-6 py-5 max-md:px-3 max-md:py-4">
        <article
          data-testid="request-document"
          data-mode={docMode}
          className="mx-auto max-w-[1180px] rounded-card border border-line bg-card p-8 shadow-sm max-md:p-4"
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
              <IssueSummary issues={shownIssues} onJump={jumpTo} />
            </div>
          )}

          {/* ---------- Items ---------- */}
          <section id={anchorId("items")} className="mt-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.06em]">Items</h2>
              {docMode === "edit" && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={addLine}>
                    <Icon name="plus" size={15} strokeWidth={2} />
                    Add Item
                  </Button>
                  <Button size="sm" onClick={() => setPasteOpen(true)}>
                    <Icon name="plus" size={15} strokeWidth={2} />
                    Add Multiple Items
                  </Button>
                  <Button size="sm" onClick={() => setPasteOpen(true)}>
                    <Icon name="upload" size={15} strokeWidth={2} />
                    Import Items
                  </Button>
                  <Button
                    size="sm"
                    disabled={selected.size !== 1}
                    aria-label="เลื่อนรายการขึ้น"
                    onClick={() => moveSelected(-1)}
                  >
                    <Icon name="chevronUp" size={15} />
                  </Button>
                  <Button
                    size="sm"
                    disabled={selected.size !== 1}
                    aria-label="เลื่อนรายการลง"
                    onClick={() => moveSelected(1)}
                  >
                    <Icon name="chevronDown" size={15} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!selected.size}
                    onClick={removeSelected}
                  >
                    Remove Selected
                  </Button>
                </div>
              )}
            </div>

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
            <DocFooter createdBy={FORM_USER} savedLabel={savedLabel} />
          </div>
        </article>
      </div>

      {/* ---------- Sticky bottom summary ---------- */}
      {docMode === "edit" && (
        <div
          data-testid="sr-sticky-summary"
          className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-4 border-t border-line bg-card px-6 py-2.5 shadow-[0_-2px_12px_rgba(16,24,40,.06)] max-md:px-3"
        >
          <span className="text-cap text-ink-2">
            รายการ <span className="font-semibold text-ink tnum">{totals.itemCount}</span>
          </span>
          <span className="text-cap text-ink-2">
            Net <span className="font-semibold text-ink tnum">{money(totals.netAmount)}</span>
          </span>
          <span className="text-cap text-ink-2">
            Grand Total{" "}
            <span className="text-[15px] font-bold text-primary tnum">
              {money(totals.grandTotal)}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={saveDraftNow}>
              Save Draft
            </Button>
            <Button size="sm" variant="primary" onClick={saveQuotation}>
              Submit Request
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Print preview ---------- */}
      {preview === "print" && printJob && (
        <div
          data-testid="print-preview-overlay"
          className="fixed inset-0 z-modal overflow-y-auto bg-[#e9ecef]"
        >
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-card px-5 py-3">
            <Button size="sm" onClick={() => setPreview(null)}>
              <Icon name="arrowLeft" size={15} strokeWidth={2} />
              กลับไปแก้ไข
            </Button>
            <span className="text-[13px] font-semibold">
              Print Preview · {draft.code}
            </span>
            <span className="text-cap text-ink-2">
              ตัวอย่างจากข้อมูลที่กำลังแก้ไข ยังไม่ได้บันทึก
            </span>
            <Button
              size="sm"
              variant="primary"
              className="ml-auto"
              onClick={() => {
                try {
                  window.print();
                } catch {
                  /* no print dialog available */
                }
              }}
            >
              <Icon name="printer" size={15} strokeWidth={2} />
              Print
            </Button>
          </div>
          <PrintDocument job={printJob} />
        </div>
      )}

      {/* ---------- Paste / import items ---------- */}
      <PasteItemsModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onAdd={(codes) => {
          addLines(codes);
          setPasteOpen(false);
          ctx.toast("เพิ่มรายการแล้ว", `${codes.length} รายการ`, "success");
        }}
      />
    </main>
  );
}

/* ============================================================
   Add Multiple / Import — one dialog.

   Paste from a spreadsheet or tick from the product list; both
   end in the same place, which is why they are not two screens.
   ============================================================ */

function PasteItemsModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (codes: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");

  const parsed = useMemo(() => {
    const wanted = text
      .split(/\r?\n/)
      .map((l) => l.split(/[\t,;]/)[0].trim())
      .filter(Boolean);
    const found = wanted.filter((c) => PRODUCTS.some((p) => p.code === c));
    return { wanted, found, missing: wanted.filter((c) => !found.includes(c)) };
  }, [text]);

  /* The product master carries the whole price list now, so this list is
     searched rather than scrolled. Ticked rows stay at the top even when a
     later search would exclude them — unticking has to stay possible. */
  const shown = useMemo(() => {
    const t = find.trim().toLowerCase();
    const on = PRODUCTS.filter((p) => picked.has(p.code));
    const rest = PRODUCTS.filter(
      (p) =>
        !picked.has(p.code) &&
        (!t || p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)),
    ).slice(0, 60);
    return [...on, ...rest];
  }, [find, picked]);

  const codes = [...new Set([...picked, ...parsed.found])];

  return (
    <Modal open={open} onClose={onClose} width="wide" label="เพิ่มรายการสินค้า">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-h3 font-semibold">เพิ่มหลายรายการ</h2>
        <p className="mt-1 text-cap text-ink-2">
          เลือกจากรายการสินค้า หรือวางรหัสสินค้าจาก Excel บรรทัดละ 1 รหัส
        </p>
      </div>

      <div className="grid max-h-[52vh] grid-cols-2 gap-4 overflow-y-auto p-5 max-md:grid-cols-1">
        <div>
          <p className="mb-2 text-cap font-medium text-ink-2">เลือกจากสินค้า</p>
          <Input
            aria-label="ค้นหาสินค้า"
            placeholder="ค้นหารหัสหรือชื่อสินค้า..."
            value={find}
            onChange={(e) => setFind(e.target.value)}
            className="mb-2"
          />
          <ul className="max-h-[300px] overflow-y-auto rounded-card border border-line">
            {shown.map((p) => (
              <li key={p.code} className="border-b border-line last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface">
                  <input
                    type="checkbox"
                    className="check"
                    checked={picked.has(p.code)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(p.code);
                        else next.delete(p.code);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{p.code}</span>
                    <span className="block truncate text-cap text-ink-2">{p.name}</span>
                  </span>
                  <span className="ml-auto text-cap text-ink-3 tnum">{money0(p.price)}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-cap text-ink-3">
            แสดง {shown.length} จาก {PRODUCTS.length} รายการ — พิมพ์เพื่อค้นหาที่เหลือ
          </p>
        </div>

        <div>
          <p className="mb-2 text-cap font-medium text-ink-2">วางรหัสสินค้า</p>
          <Textarea
            aria-label="วางรหัสสินค้า"
            rows={12}
            className="text-[13px]"
            placeholder={"AA-TH003-WL\nAB-AC001"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {parsed.missing.length > 0 && (
            <p className="mt-2 text-cap text-warning-text">
              ไม่พบรหัส {parsed.missing.slice(0, 5).join(", ")}
              {parsed.missing.length > 5 && ` และอีก ${parsed.missing.length - 5} รายการ`}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-5 py-4">
        <span className="text-cap text-ink-2">เลือกแล้ว {codes.length} รายการ</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            disabled={!codes.length}
            onClick={() => {
              onAdd(codes);
              setText("");
              setPicked(new Set());
            }}
          >
            เพิ่ม {codes.length} รายการ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
