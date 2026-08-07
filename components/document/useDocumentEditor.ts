"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actingUserName, can } from "@/lib/domain/admin";
import {
  applyBillType,
  applyCustomerTo,
  applyProductForCustomer,
  applyShipToOn,
  blankLine,
  blockingIssues,
  type DocInsight,
  type DocTotals,
  type DraftIssue,
  type DraftLine,
  type PartyFields,
  type TermFields,
} from "@/lib/domain/doc-draft";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/form";
import { timeAgo } from "@/lib/format";
import { anchorId } from "./parts";

/* ============================================================
   THE STATE BEHIND A DOCUMENT-FIRST EDITOR

   The quotation and the sales request are the same screen with
   different words on it. Before this hook existed they were two
   thousand-line files that agreed on about 87% of their content,
   which meant every fix had to be made twice and could be
   forgotten once.

   What lives here is everything that is genuinely the same: the
   draft and its line operations, autosave to local recovery,
   the recovered-session offer, validation timing, and the four
   actions that do not depend on which document this is.

   What does NOT live here is anything a document decides for
   itself — its fields, its wording, its save rules. Those come
   in through `DocumentEditorConfig` so that sharing this code
   never means the two documents have to behave alike.

   Autosave writes to local recovery only, never to the record.
   A half-typed document must not become a saved one just
   because somebody stopped typing.
   ============================================================ */

const AUTOSAVE_DEBOUNCE = 1500;
const CLOCK_TICK = 20_000;

export type SaveState = "idle" | "saving" | "saved" | "failed";

/** What a document's own store hands back when asked to write. */
export interface DocumentSaveResult {
  code: string;
  created: boolean;
  /**
   * Why the write was refused, when it was. Absent on success — and absent
   * entirely for a document whose store cannot refuse, which is why every
   * caller treats it as optional rather than checking a discriminator.
   */
  blocked?: string;
}

/**
 * The minimum a draft must carry for this hook to run it.
 *
 * The party and terms blocks come in whole rather than field by field,
 * because the shared handlers this hook calls — `applyCustomerTo`,
 * `applyShipToOn`, `applyBillType` — are written against exactly those and
 * restating a subset here would let the two drift.
 */
export interface EditableDraft extends PartyFields, TermFields {
  code: string;
  status: string;
  items: DraftLine[];
  mode?: string;
}

export interface DocumentEditorConfig<TDraft extends EditableDraft, TRecord> {
  /** Registry key. Drives the permission check and the recovery-store key. */
  entity: string;
  record?: TRecord;
  blank: () => TDraft;
  fromRecord: (record: TRecord) => TDraft;
  totals: (draft: TDraft) => DocTotals;
  insight: (draft: TDraft) => DocInsight;
  validate: (draft: TDraft) => DraftIssue[];
  /**
   * Write to the document's own store.
   *
   * `finalise` is the one flag every sell-side document has and each names
   * differently — a quotation issues, a request submits. Normalised here so
   * the shared save actions do not have to know which word applies.
   */
  save: (
    draft: TDraft,
    opts: { finalise: boolean; user: string },
  ) => DocumentSaveResult;
  /**
   * Patches this document handles itself, tried before the shared ones.
   *
   * Return the next draft to claim the patch, or null to let the shared
   * handling take it. This is how a sales request loads a quotation's lines
   * when its `quotationRef` changes without the quotation editor — which has
   * no such field — carrying the branch.
   */
  onPatch?: (draft: TDraft, patch: Partial<TDraft>) => TDraft | null;
}

export interface DocumentEditorApi<TDraft extends EditableDraft> {
  draft: TDraft;
  setDraft: React.Dispatch<React.SetStateAction<TDraft>>;
  mode: "create" | "edit";
  mayEdit: boolean;
  storeKey: string;
  /** Whoever is filling this in — read per call, never a constant. */
  user: string;

  set: (patch: Partial<TDraft>) => void;
  setLine: (id: string, col: keyof DraftLine, value: string) => void;
  patchLine: (id: string, patch: Partial<DraftLine>) => void;
  pickProduct: (id: string, code: string) => void;
  addLine: () => void;
  addLines: (codes: string[]) => void;
  removeLine: (id: string) => void;
  removeSelected: () => void;
  moveSelected: (dir: -1 | 1) => void;
  selectLine: (id: string, on: boolean) => void;
  selected: Set<string>;

  totals: DocTotals;
  insight: DocInsight;
  issues: DraftIssue[];
  blocking: DraftIssue[];
  invalid: Set<string>;
  shownIssues: DraftIssue[];
  showErrors: boolean;
  setShowErrors: (v: boolean) => void;

  autosave: SaveState;
  setAutosave: (s: SaveState) => void;
  savedAt: number | null;
  savedLabel: string;
  recovered: { draft: TDraft; at: number } | null;
  acceptRecovered: () => void;
  discardRecovered: () => void;
  clearStoredDraft: () => void;

  preview: null | "document" | "print";
  setPreview: (v: null | "document" | "print") => void;
  pasteOpen: boolean;
  setPasteOpen: (v: boolean) => void;
  docMode: "edit" | "read";

  markDirty: () => void;
  isDirty: () => boolean;
  jumpTo: (field: string) => void;
  /** Write without finalising. Reports refusal; clears nothing on one. */
  saveDraftNow: (report: SaveReporter) => void;
  /** Validate, then write and finalise. */
  saveDocument: (report: SaveReporter) => void;
  resetDraft: () => void;
  duplicate: () => string;
  onGridKey: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/** How the editor tells the user what happened, without owning a toast. */
export interface SaveReporter {
  blocked: (why: string) => void;
  invalidCount: (n: number) => void;
  savedDraft: (res: DocumentSaveResult) => void;
  saved: (res: DocumentSaveResult) => void;
}

export function useDocumentEditor<TDraft extends EditableDraft, TRecord>(
  config: DocumentEditorConfig<TDraft, TRecord>,
): DocumentEditorApi<TDraft> {
  const { entity, record, blank, fromRecord, onPatch } = config;
  const mode = record ? "edit" : "create";
  const storeKey = draftKey(entity, (record as { code?: string } | undefined)?.code);

  const [draft, setDraft] = useState<TDraft>(() => (record ? fromRecord(record) : blank()));
  const [showErrors, setShowErrors] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<null | "document" | "print">(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [autosave, setAutosave] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = useRef(false);
  const [, setClock] = useState(0);

  const mayEdit = can(entity, mode === "edit" ? "edit" : "create");

  /* ---------- Writing ---------- */

  const set = useCallback(
    (patch: Partial<TDraft>) => {
      dirty.current = true;
      setDraft((d) => {
        /* The document's own patches first — it knows about fields this hook
           has never heard of. */
        const own = onPatch?.(d, patch);
        if (own) return own;
        /* The customer drives half the document; picking one loads the partner
           rather than only writing the field. */
        if ("customerPick" in patch)
          return applyCustomerTo(d, String((patch as Record<string, unknown>).customerPick ?? ""));
        if ("shipAddressPick" in patch)
          return applyShipToOn(d, String((patch as Record<string, unknown>).shipAddressPick ?? ""));
        /* Changing the bill type retaxes every line — see applyBillType. */
        if ("billType" in patch)
          return applyBillType(d, String((patch as Record<string, unknown>).billType ?? ""));
        return { ...d, ...patch };
      });
    },
    [onPatch],
  );

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

  /** Fields the item grid writes as a unit — the naming strip's own controls. */
  const patchLine = useCallback((id: string, patch: Partial<DraftLine>) => {
    dirty.current = true;
    setDraft((d) => ({
      ...d,
      items: d.items.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }, []);

  /* The line opens at this customer's own price, not the catalogue's — the
     tier is known the moment the product is picked, so asking at the wrong
     one and correcting it later would only make the grid argue with itself. */
  const pickProduct = useCallback((id: string, code: string) => {
    dirty.current = true;
    setDraft((d) => ({
      ...d,
      items: d.items.map((l) =>
        l.id === id ? applyProductForCustomer(l, code, d.customerPick) : l,
      ),
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
      return {
        ...d,
        items: [
          ...kept,
          ...codes.map((c) => applyProductForCustomer(blankLine(), c, d.customerPick)),
        ],
      };
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

  const totals = useMemo(() => config.totals(draft), [config, draft]);
  const insight = useMemo(() => config.insight(draft), [config, draft]);
  const issues = useMemo(() => config.validate(draft), [config, draft]);
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
  const [recovered, setRecovered] = useState<{ draft: TDraft; at: number } | null>(null);
  useEffect(() => {
    const found = readDraft(storeKey);
    if (found?.state) {
      setRecovered({ draft: found.state as unknown as TDraft, at: found.at });
    }
  }, [storeKey]);

  const acceptRecovered = useCallback(() => {
    setRecovered((r) => {
      if (r) setDraft(r.draft);
      return null;
    });
  }, []);

  const discardRecovered = useCallback(() => {
    clearDraft(storeKey);
    setRecovered(null);
  }, [storeKey]);

  /**
   * Throw away the local recovery copy.
   *
   * Leaving the page deliberately has to do this, or the next visit offers to
   * restore work the user just chose to abandon.
   */
  const clearStoredDraft = useCallback(() => clearDraft(storeKey), [storeKey]);

  /* ---------- Actions ---------- */

  const jumpTo = useCallback((field: string) => {
    const el = document.getElementById(anchorId(field));
    if (!el) return;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    el.querySelector<HTMLElement>("input,select,textarea")?.focus();
  }, []);

  const saveDraftNow = useCallback(
    (report: SaveReporter) => {
      const res = config.save(draft, { finalise: false, user: actingUserName() });
      /* The store decides whether the write was allowed; this only reports it.
         Nothing is cleared on a refusal — the typing stays where it is. */
      if (res.blocked) {
        setAutosave("idle");
        report.blocked(res.blocked);
        return;
      }
      clearDraft(storeKey);
      dirty.current = false;
      setSavedAt(Date.now());
      setAutosave("saved");
      setDraft((d) => ({ ...d, mode: "edit" }));
      report.savedDraft(res);
    },
    [config, draft, storeKey],
  );

  const saveDocument = useCallback(
    (report: SaveReporter) => {
      setShowErrors(true);
      if (blocking.length) {
        report.invalidCount(blocking.length);
        jumpTo(blocking[0].field);
        return;
      }
      const res = config.save(draft, { finalise: true, user: actingUserName() });
      if (res.blocked) {
        report.blocked(res.blocked);
        return;
      }
      clearDraft(storeKey);
      dirty.current = false;
      report.saved(res);
    },
    [blocking, config, draft, jumpTo, storeKey],
  );

  const resetDraft = useCallback(() => {
    clearDraft(storeKey);
    setDraft(record ? fromRecord(record) : blank());
    setShowErrors(false);
    setSelected(new Set());
    dirty.current = false;
  }, [blank, fromRecord, record, storeKey]);

  const duplicate = useCallback(() => {
    const fresh = blank();
    setDraft((d) => ({ ...d, code: fresh.code, mode: "create", status: "Draft" }));
    dirty.current = true;
    return fresh.code;
  }, [blank]);

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

  /* Only the document preview strips the controls. Print preview covers the
     page with its own overlay and leaves the editor underneath as it was, so
     closing it returns to a form rather than to a read-only sheet. */
  const docMode: "edit" | "read" = preview === "document" ? "read" : "edit";

  const savedLabel =
    autosave === "saving"
      ? "Saving..."
      : autosave === "failed"
        ? "Autosave failed"
        : savedAt
          ? `Last saved: ${timeAgo(savedAt)}`
          : "ยังไม่ได้บันทึก";

  return {
    draft,
    setDraft,
    mode,
    mayEdit,
    storeKey,
    user: actingUserName(),
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
    issues,
    blocking,
    invalid,
    shownIssues,
    showErrors,
    setShowErrors,
    autosave,
    setAutosave,
    savedAt,
    savedLabel,
    recovered,
    acceptRecovered,
    discardRecovered,
    clearStoredDraft,
    preview,
    setPreview,
    pasteOpen,
    setPasteOpen,
    docMode,
    markDirty: () => {
      dirty.current = true;
    },
    isDirty: () => dirty.current,
    jumpTo,
    saveDraftNow,
    saveDocument,
    resetDraft,
    duplicate,
    onGridKey,
  };
}
