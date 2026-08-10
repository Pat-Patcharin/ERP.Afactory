"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PRODUCTS } from "@/lib/domain/product";
import { PrintDocument } from "@/components/print/PrintDocument";
import type { PrintJob } from "@/lib/print/types";
import { money, money0, timeAgo } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button, Input, Menu, MenuItem, MenuSep, Modal, Textarea } from "@/components/ui";
import type { DocMode } from "./parts";
import type { DocumentEditorApi, EditableDraft } from "./useDocumentEditor";
import { catalogPrice } from "@/lib/domain/pricing";

/* ============================================================
   THE CHROME AROUND A DOCUMENT-FIRST EDITOR

   Everything outside the document body: the sticky toolbar, the
   recovered-draft offer, the paper the document is printed on,
   the sticky totals bar, the print overlay and the import
   dialog.

   The body itself — header, party panels, items, totals,
   signatures — is passed in, because that is the part each
   document genuinely decides for itself.

   Wording arrives through `labels` rather than being derived
   from the entity key. A sales request submits and a quotation
   issues; inferring one verb from the other would be inventing
   a rule the business does not have.
   ============================================================ */

export interface DocumentEditorLabels {
  /** "Sales Request" — used for "New …" and "Edit …". */
  entityName: string;
  /** Primary button. "Submit Request" / "Save Quotation". */
  primaryAction: string;
  /** Shown when the role may open the document but not write it. */
  noPermissionTitle: string;
  noPermissionBody: string;
}

export interface DocumentEditorTestIds {
  toolbar: string;
  document: string;
  stickySummary: string;
}

/**
 * Completion across the document's required fields.
 *
 * Optional: a quotation has never shown one and still does not. A purchase
 * request does, because it came from the stepped form where the count was the
 * only signal of how much was left, and losing it on the way to one page
 * would be a downgrade the person filling it in would feel.
 *
 * The numbers come from `formStatus()` in lib/form.ts — the same pure
 * function the stepped engine uses, so the two cannot disagree.
 */
export interface DocumentProgress {
  done: number;
  total: number;
  percent: number;
  /** Shown beside the count at the foot. The stepped form said "3 หัวข้อ". */
  sectionCount: number;
}

export function DocumentEditorShell<TDraft extends EditableDraft>({
  api,
  labels,
  testIds,
  printJob,
  progress,
  settings,
  onSaveDraft,
  onSave,
  onCancel,
  onReset,
  onDuplicate,
  onImport,
  children,
}: {
  api: DocumentEditorApi<TDraft>;
  labels: DocumentEditorLabels;
  testIds: DocumentEditorTestIds;
  /** Built by the document from what is on screen, or null when not previewing. */
  printJob: PrintJob | null;
  /** Omit for a document that has never shown a completion count. */
  progress?: DocumentProgress;
  /**
   * Controls that belong to the document but not on its paper.
   *
   * Rendered above the sheet and never printed. A document with nothing of
   * this kind omits it and the strip does not appear.
   */
  settings?: ReactNode;
  onSaveDraft: () => void;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
  onDuplicate: () => void;
  onImport: (codes: string[]) => void;
  /** The document body, rendered inside the paper. */
  children: ReactNode;
}) {
  const {
    draft,
    mode,
    mayEdit,
    totals,
    savedLabel,
    recovered,
    acceptRecovered,
    discardRecovered,
    preview,
    setPreview,
    pasteOpen,
    setPasteOpen,
    docMode,
  } = api;

  if (!mayEdit) {
    return (
      <main className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <p className="text-h3 font-semibold">{labels.noPermissionTitle}</p>
          <p className="mt-2 text-ink-2">{labels.noPermissionBody}</p>
          <Button className="mt-5" onClick={onCancel}>
            กลับไปหน้ารายการ
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-28">
      {/* ---------- Sticky application toolbar ---------- */}
      <div
        data-testid={testIds.toolbar}
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-card px-6 py-3 max-md:px-4"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">
            {mode === "edit" ? `Edit ${labels.entityName}` : `New ${labels.entityName}`}
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
          <Button size="sm" onClick={onSaveDraft}>
            Save Draft
          </Button>
          <Button size="sm" variant="doc" onClick={onSave}>
            <Icon name="save" size={15} strokeWidth={2} />
            {labels.primaryAction}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
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
                    onDuplicate();
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
                    onReset();
                  }}
                >
                  Reset
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      {/* ---------- Completion ----------
          Markup moved from MasterForm rather than rewritten, so the bar the
          purchase request had as a stepped form is the bar it has now. The
          fill follows the document accent instead of the brand, because it
          measures the document. */}
      {progress && (
        <div
          className="mx-auto mt-4 flex max-w-[1180px] items-center gap-3 px-6 max-md:px-3"
          data-testid="doc-progress"
        >
          <div
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-neutral-soft"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="ความคืบหน้าการกรอกข้อมูล"
          >
            <div
              className={cn(
                "h-full rounded-pill transition-[width] duration-slow ease-out",
                progress.percent === 100 ? "bg-success" : "bg-doc-accent",
              )}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="flex-shrink-0 text-cap font-medium text-ink-2 tnum">
            {progress.done}/{progress.total} ช่องที่จำเป็น · {progress.percent}%
          </span>
        </div>
      )}

      {/* ---------- Recovered draft ---------- */}
      {recovered && (
        <div className="mx-auto mt-4 flex max-w-[1180px] flex-wrap items-center gap-3 rounded-card border border-info/30 bg-info-soft px-4 py-3 text-[13px] max-md:mx-4">
          <Icon name="info" size={16} className="text-info" />
          <span className="min-w-0 flex-1">
            พบฉบับร่างที่ยังไม่ได้บันทึกจาก {timeAgo(recovered.at)}
          </span>
          <Button size="sm" onClick={acceptRecovered}>
            กู้คืน
          </Button>
          <Button size="sm" variant="ghost" onClick={discardRecovered}>
            ทิ้งไป
          </Button>
        </div>
      )}

      {/* ---------- Settings that are not the document ----------
          Fields the document must carry and pass on, but which are not part
          of what the customer reads: how it is billed, which channel it came
          through, the customer's own reference number.

          Deliberately ONE strip rather than three homes. They belong together
          because they answer one question — "what kind of quotation is this"
          — and scattering them would leave a salesperson hunting three
          places for three settings of the same kind. */}
      {settings && docMode === "edit" && (
        <div
          data-testid="doc-settings"
          className="mx-auto mt-4 flex max-w-[1180px] flex-wrap items-end gap-4 rounded-card border border-line bg-card px-4 py-3 max-md:mx-4"
        >
          <span className="text-cap font-semibold uppercase tracking-[0.06em] text-ink-3">
            ตั้งค่าเอกสาร
          </span>
          {settings}
        </div>
      )}

      {/* ---------- The document ---------- */}
      <div className="px-6 py-5 max-md:px-3 max-md:py-4">
        <article
          data-testid={testIds.document}
          data-mode={docMode}
          className="mx-auto max-w-[1180px] rounded-card border border-line bg-card p-8 shadow-sm max-md:p-4"
        >
          {children}
        </article>
      </div>

      {/* ---------- Sticky bottom summary ---------- */}
      {docMode === "edit" && (
        <div
          data-testid={testIds.stickySummary}
          className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-4 border-t border-line bg-card px-6 py-2.5 shadow-[0_-2px_12px_rgba(16,24,40,.06)] max-md:px-3"
        >
          {/* The stepped form's foot line, kept word for word so the count a
              requester was reading before is the count they read now. */}
          {progress && (
            <span className="text-cap text-ink-3 tnum" data-testid="doc-progress-foot">
              {progress.done}/{progress.total} ช่องที่จำเป็น · {progress.sectionCount} หัวข้อ
            </span>
          )}
          <span className="text-cap text-ink-2">
            รายการ <span className="font-semibold text-ink tnum">{totals.itemCount}</span>
          </span>
          <span className="text-cap text-ink-2">
            Net <span className="font-semibold text-ink tnum">{money(totals.netAmount)}</span>
          </span>
          <span className="text-cap text-ink-2">
            Grand Total{" "}
            {/* The same figure as the Grand Total bar on the paper above, so
                it takes the same colour. Leaving it on the brand would put an
                orange total under a teal one on the same screen. */}
            <span className="text-[15px] font-bold text-doc-accent tnum">
              {money(totals.grandTotal)}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={onSaveDraft}>
              Save Draft
            </Button>
            <Button size="sm" variant="doc" onClick={onSave}>
              {labels.primaryAction}
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
            <span className="text-[13px] font-semibold">Print Preview · {draft.code}</span>
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
          onImport(codes);
          setPasteOpen(false);
        }}
      />
    </main>
  );
}

/**
 * The item section's own toolbar — add, import, reorder, remove.
 *
 * Sits here rather than in each editor because the buttons are the same
 * buttons; what differs between documents is the table underneath them, which
 * `ItemTable` already parameterises through its layout.
 */
export function ItemSectionBar({
  mode,
  selectedCount,
  onAdd,
  onImport,
  onMove,
  onRemoveSelected,
}: {
  mode: DocMode;
  selectedCount: number;
  onAdd: () => void;
  onImport: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemoveSelected: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.06em]">Items</h2>
      {mode === "edit" && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onAdd}>
            <Icon name="plus" size={15} strokeWidth={2} />
            Add Item
          </Button>
          <Button size="sm" onClick={onImport}>
            <Icon name="plus" size={15} strokeWidth={2} />
            Add Multiple Items
          </Button>
          <Button size="sm" onClick={onImport}>
            <Icon name="upload" size={15} strokeWidth={2} />
            Import Items
          </Button>
          <Button
            size="sm"
            disabled={selectedCount !== 1}
            aria-label="เลื่อนรายการขึ้น"
            onClick={() => onMove(-1)}
          >
            <Icon name="chevronUp" size={15} />
          </Button>
          <Button
            size="sm"
            disabled={selectedCount !== 1}
            aria-label="เลื่อนรายการลง"
            onClick={() => onMove(1)}
          >
            <Icon name="chevronDown" size={15} />
          </Button>
          <Button size="sm" variant="ghost" disabled={!selectedCount} onClick={onRemoveSelected}>
            Remove Selected
          </Button>
        </div>
      )}
    </div>
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
                  <span className="ml-auto text-cap text-ink-3 tnum">{money0(catalogPrice(p.code))}</span>
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
