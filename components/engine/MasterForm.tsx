"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clone, cn, getPath, setPath } from "@/lib/utils";
import { esc, timeAgo } from "@/lib/format";
import { Icon } from "@/lib/icons";
import {
  clearDraft,
  draftKey,
  formStatus,
  readDraft,
  visibleSteps,
  writeDraft,
} from "@/lib/form";
import type {
  FormBlock,
  FormCard,
  FormField,
  FormSchema,
  FormState,
  GridRow,
  LookupHit,
  RecordBase,
} from "@/lib/types";
import { Badge, Button, SectionTitle } from "@/components/ui";
import { useCrumbCode } from "@/components/layout/Topbar";
import { FieldView, type FormApi } from "./FormFields";
import { useActionCtx } from "./useActionCtx";

/* ============================================================
   MASTER FORM ENGINE

   Create and edit for every master and document. The schema says
   which steps exist, what fields they hold and when a value is
   acceptable; this file owns the mechanics that are the same
   everywhere — the section rail, completion, validation timing,
   draft autosave and the review step.

   Nothing here imports a domain module.
   ============================================================ */

const AUTOSAVE_DEBOUNCE = 1200;
/** How often the "saved 2 minutes ago" label re-reads the clock. */
const CLOCK_TICK = 20_000;

/**
 * The anchor a section is reachable at. Namespaced by form key so two forms
 * mounted in one tree — a drawer over a page — cannot collide on a step key
 * as ordinary as "items".
 */
const sectionDomId = (formKey: string, stepKey: string) => `form-${formKey}-${stepKey}`;

export function MasterForm<T extends RecordBase>({
  schema,
  record,
  seed,
}: {
  schema: FormSchema<T>;
  /** Absent in create mode. */
  record?: T;
  /**
   * Values the caller has already decided, applied over `blank()` as if the
   * user had typed them — `onChange` fires for each, so a seeded source
   * document pulls its lines exactly as picking it from the list would.
   * Ignored in edit mode: the record is the truth there.
   */
  seed?: Record<string, unknown>;
}) {
  const ctx = useActionCtx();
  const mode = record ? "edit" : "create";
  const key = draftKey(schema.key, record?.code);
  const locked = record ? (schema.editGuard?.(record) ?? null) : null;

  const [state, setState] = useState<FormState>(() => {
    if (record) return schema.toState(record);
    const blank = schema.blank();
    /* In order — a source document is only meaningful once its type is set. */
    for (const [path, value] of Object.entries(seed ?? {})) {
      setPath(blank, path, value);
      schema.onChange?.(path, blank);
    }
    return blank;
  });
  const [stepKey, setStepKey] = useState(schema.steps[0]?.key ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [offeredDraft, setOfferedDraft] = useState<{ state: FormState; at: number } | null>(
    null,
  );
  /** Nothing is autosaved and nothing warns on exit until the user edits. */
  const dirty = useRef(false);
  const [, setClock] = useState(0);

  useCrumbCode(mode === "edit" ? (record?.code ?? null) : "New");

  /* ---------- Writing state ---------- */

  const mutate = useCallback((fn: (draft: FormState) => void) => {
    setState((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
    dirty.current = true;
  }, []);

  const set = useCallback(
    (path: string, value: unknown) =>
      mutate((d) => {
        setPath(d, path, value);
        schema.onChange?.(path, d);
      }),
    [mutate, schema],
  );

  const gridSet = useCallback(
    (path: string, index: number, col: string, value: unknown) =>
      mutate((d) => {
        setPath(d, `${path}.${index}.${col}`, value);
        schema.onGridChange?.(path, d);
      }),
    [mutate, schema],
  );

  /**
   * Every row in one tick column at once.
   *
   * A column of checkboxes needs the checkbox that does the column — ticking
   * fourteen units Active one at a time is the kind of work a screen is
   * supposed to save somebody.
   */
  const gridSetColumn = useCallback(
    (path: string, col: string, value: boolean) =>
      mutate((d) => {
        const cur = (getPath(d, path) ?? []) as GridRow[];
        setPath(
          d,
          path,
          cur.map((row) => ({ ...row, [col]: value })),
        );
        schema.onGridChange?.(path, d);
      }),
    [mutate, schema],
  );

  /** "Primary contact", "default bank" — one row owns the flag, the rest lose it. */
  const gridRadio = useCallback(
    (path: string, index: number, col: string) =>
      mutate((d) => {
        const cur = (getPath(d, path) ?? []) as GridRow[];
        setPath(
          d,
          path,
          cur.map((row, i) => ({ ...row, [col]: i === index })),
        );
        schema.onGridChange?.(path, d);
      }),
    [mutate, schema],
  );

  const gridAdd = useCallback(
    (path: string) => {
      const list = (getPath(state, path) ?? []) as GridRow[];
      const row = schema.newRow ? schema.newRow(path, list.length === 0) : {};
      if (!row) {
        ctx.toast("เพิ่มรายการไม่ได้", "รายการในเอกสารนี้มาจากเอกสารต้นทาง", "warning");
        return;
      }
      mutate((d) => {
        const cur = (getPath(d, path) ?? []) as GridRow[];
        setPath(d, path, [...cur, row]);
        schema.onGridChange?.(path, d);
      });
    },
    [ctx, mutate, schema, state],
  );

  /**
   * Several rows at once — the multi-add picker's write.
   *
   * Not a loop over `gridAdd`: each call reads `state` from the render it
   * was made in, so fourteen calls in one tick all append to the same list
   * and thirteen of them are lost. One write, one list.
   */
  const gridAddMany = useCallback(
    (path: string, rows: GridRow[]) => {
      if (!rows.length) return;
      const list = (getPath(state, path) ?? []) as GridRow[];
      const base = schema.newRow ? schema.newRow(path, list.length === 0) : {};
      if (!base) {
        ctx.toast("เพิ่มรายการไม่ได้", "รายการในเอกสารนี้มาจากเอกสารต้นทาง", "warning");
        return;
      }
      mutate((d) => {
        const cur = (getPath(d, path) ?? []) as GridRow[];
        setPath(d, path, [...cur, ...rows.map((r) => ({ ...base, ...r }))]);
        schema.onGridChange?.(path, d);
      });
    },
    [ctx, mutate, schema, state],
  );

  const gridRemove = useCallback(
    (path: string, index: number) =>
      mutate((d) => {
        const cur = (getPath(d, path) ?? []) as GridRow[];
        setPath(
          d,
          path,
          cur.filter((_, i) => i !== index),
        );
        schema.onGridChange?.(path, d);
      }),
    [mutate, schema],
  );

  const lookup = useCallback(
    (source: string, q: string): LookupHit[] => schema.lookup?.[source]?.(q) ?? [],
    [schema],
  );

  const lookupPick = useCallback(
    (source: string, path: string, index: number, hit: LookupHit) =>
      mutate((d) => {
        schema.onLookupPick?.(source, path, index, hit, d);
        schema.onGridChange?.(path, d);
      }),
    [mutate, schema],
  );

  /* ---------- Derived: steps, completion, validation ---------- */

  const steps = useMemo(() => visibleSteps(schema, state), [schema, state]);
  const status = useMemo(() => formStatus(schema, state), [schema, state]);

  /**
   * Which section the rail marks as "where you are".
   *
   * Every section is on the page, so this decides a highlight and nothing
   * else — no section is ever hidden by it. Resolved by key rather than
   * index because a step can disappear when a toggle turns it off (a partner
   * who is no longer a supplier has no Purchasing section), and a stale key
   * simply falls back to the first surviving one.
   */
  const activeKey = steps.some((s) => s.key === stepKey) ? stepKey : (steps[0]?.key ?? "");

  const duplicates = useMemo(
    () => schema.findDuplicates?.(state) ?? [],
    [schema, state],
  );

  /* ---------- Draft autosave ---------- */

  useEffect(() => {
    const found = readDraft(key);
    if (found) setOfferedDraft(found);
    // Offered once, on mount, for this record only.
  }, [key]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      const at = writeDraft(key, state);
      if (at) setSavedAt(at);
    }, AUTOSAVE_DEBOUNCE);
    return () => clearTimeout(t);
  }, [key, state]);

  useEffect(() => {
    const t = setInterval(() => setClock((n) => n + 1), CLOCK_TICK);
    return () => clearInterval(t);
  }, []);

  /* ---------- Which section the rail points at while scrolling ---------- */

  /* Keyed on the step list rather than on `steps` itself: that array is
     rebuilt on every keystroke, and re-observing the page each time somebody
     types a letter would be an observer per character. */
  const stepKeys = steps.map((s) => s.key).join("|");

  useEffect(() => {
    /* jsdom has no IntersectionObserver. The rail still works there — a click
       sets the highlight directly — so this is a progressive extra, not a
       requirement. */
    if (typeof IntersectionObserver === "undefined") return;

    const keys = stepKeys ? stepKeys.split("|") : [];
    const byId = new Map(keys.map((k) => [sectionDomId(schema.key, k), k]));
    const els = [...byId.keys()]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;

    const onScreen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onScreen.add(e.target.id);
          else onScreen.delete(e.target.id);
        }
        /* The highest section still on screen, in document order — what a
           reader would call "where I am" when two are visible at once. */
        const top = [...byId.keys()].find((id) => onScreen.has(id));
        if (top) setStepKey(byId.get(top)!);
      },
      /* Top edge sits below the sticky topbar; the bottom margin stops a
         section that has only just crept into view from stealing the mark. */
      { rootMargin: "-88px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [stepKeys, schema.key]);

  /* Leaving with unsaved edits is almost always a misclick, never a decision. */
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  /* ============================================================
     MOVING AROUND A FORM THAT IS ALL ON ONE PAGE

     The rail no longer swaps which section is mounted — every
     section is already there. It scrolls, which is why a jump
     works the same whether it comes from the rail, from the
     review list, or from Save landing on the first thing that is
     missing.

     `scrollIntoView` is called optionally: jsdom does not
     implement it, and a test that fills in a form should not
     fail on the way the page moves.
     ============================================================ */

  const jumpTo = (nextKey: string) => {
    setStepKey(nextKey);
    if (typeof document === "undefined") return;
    document.getElementById(sectionDomId(schema.key, nextKey))?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
  };

  const leave = () => {
    const back = `/m/${schema.key}`;
    if (!dirty.current) {
      ctx.goto(back);
      return;
    }
    ctx.confirm({
      title: "ออกจากฟอร์มโดยไม่บันทึก?",
      message: "การแก้ไขที่ยังไม่บันทึกจะหายไป (ร่างอัตโนมัติยังเก็บไว้ในเครื่องนี้)",
      confirmText: "ออกโดยไม่บันทึก",
      onConfirm: () => {
        dirty.current = false;
        ctx.goto(back);
      },
    });
  };

  const save = () => {
    setShowErrors(true);

    if (!status.canSave) {
      const target = status.missing[0]?.step ?? status.broken[0]?.step;
      if (target) jumpTo(target);
      const missingCount = status.missing.length;
      ctx.toast(
        "ยังกรอกข้อมูลไม่ครบ",
        missingCount
          ? `เหลืออีก ${missingCount} ช่องที่จำเป็น — ${status.missing[0].label}`
          : status.broken[0].label,
        "warning",
      );
      return;
    }

    const proceed = () => {
      dirty.current = false;
      clearDraft(key);
      schema.save(state, ctx);
    };

    if (schema.beforeSave) schema.beforeSave(state, proceed, ctx);
    else proceed();
  };

  const api: FormApi = {
    state,
    set,
    gridSet,
    gridRadio,
    gridSetColumn,
    gridAdd,
    gridAddMany,
    gridRemove,
    lookup,
    lookupPick,
    blank: status.blankPaths,
    showErrors,
    ctx,
  };

  /* A locked record never renders the form — hooks above have all run, so this
     early return is safe. */
  if (locked && record) {
    return (
      <div>
        <header className="border-b border-line bg-card px-6 py-4 max-md:px-4">
          <button
            onClick={() => ctx.goto(`/m/${schema.key}`)}
            className="mb-3 inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium text-ink-2 transition-colors hover:bg-neutral-soft hover:text-ink"
          >
            <Icon name="arrowLeft" size={16} />
            Back to {schema.entityLabel} List
          </button>
          <h1 className="text-h2 font-semibold">Edit {schema.entityLabel}</h1>
        </header>
        <main className="px-6 py-12 max-md:px-4">
          <div className="mx-auto max-w-2xl rounded-card border border-line bg-card p-8 text-center shadow-xs">
            <div className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-btn bg-warning-soft text-warning">
              <Icon name="lock" size={24} />
            </div>
            <h2 className="mb-2 text-h3 font-semibold">แก้ไขเอกสารนี้ไม่ได้</h2>
            <p className="mb-6 leading-relaxed text-ink-2">{locked}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => ctx.goto(`/m/${schema.key}`)}>กลับไปหน้ารายการ</Button>
              <Button
                variant="primary"
                onClick={() =>
                  ctx.goto(`/m/${schema.key}/${encodeURIComponent(record.code)}`)
                }
              >
                ดูรายละเอียด {record.code}
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const entityLabel = schema.entityLabel;
  const title =
    schema.saveTitle ??
    (mode === "create" ? `Create ${entityLabel}` : `Edit ${entityLabel}`);
  const subtitle = schema.titleField
    ? String(getPath(state, schema.titleField) ?? "")
    : "";
  const statusValue = String(getPath(state, "status") ?? "");
  const statusTone = schema.statusBadge?.[statusValue];
  const kindBadge = schema.headerBadge?.(state) ?? null;

  return (
    <div>
      {/* ---------- Header ---------- */}
      <header className="border-b border-line bg-card px-6 pt-5 max-md:px-4 max-md:pt-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={leave}
            className="inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium text-ink-2 transition-colors duration-fast hover:bg-neutral-soft hover:text-ink"
          >
            <Icon name="arrowLeft" size={16} />
            Back to {entityLabel} List
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-h2 font-semibold tracking-[-0.015em] max-md:text-h3">
                {title}
              </h1>
              {statusValue && statusTone && (
                <Badge tone={statusTone}>{statusValue}</Badge>
              )}
              {kindBadge && <Badge tone={kindBadge.tone}>{kindBadge.text}</Badge>}
            </div>
            <p className="mt-1 truncate text-[13px] text-ink-2">
              {mode === "edit" ? (
                <span className="tnum">{record?.code}</span>
              ) : (
                subtitle || "กรอกได้ทั้งหมดในหน้าเดียว — กดหัวข้อด้านซ้ายเพื่อข้ามไปยังส่วนนั้น"
              )}
              {mode === "edit" && subtitle && ` · ${subtitle}`}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 max-md:w-full">
            {savedAt && (
              <span className="mr-1 inline-flex items-center gap-1.5 text-cap text-ink-3 max-md:mr-auto">
                <Icon name="check" size={13} strokeWidth={2.4} className="text-success" />
                {schema.savedLabel ?? "บันทึกร่างอัตโนมัติ"} · {timeAgo(savedAt)}
              </span>
            )}
            <Button onClick={leave}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              <Icon name="save" size={16} strokeWidth={2} />
              {schema.saveButton ?? `Save ${entityLabel}`}
            </Button>
          </div>
        </div>

        {/* Completion — counts only the steps that currently apply. */}
        <div className="mb-4 flex items-center gap-3">
          <div
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-neutral-soft"
            role="progressbar"
            aria-valuenow={status.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="ความคืบหน้าการกรอกข้อมูล"
          >
            <div
              className={cn(
                "h-full rounded-pill transition-[width] duration-slow ease-out",
                status.percent === 100 ? "bg-success" : "bg-primary",
              )}
              style={{ width: `${status.percent}%` }}
            />
          </div>
          <span className="flex-shrink-0 text-cap font-medium text-ink-2 tnum">
            {status.done}/{status.total} ช่องที่จำเป็น · {status.percent}%
          </span>
        </div>
      </header>

      {/* ---------- Body ---------- */}
      <main
        /* ------------------------------------------------------------
           NO SUMMARY RAIL

           Every form used to carry one on the right: a preview card
           and a readiness checklist, both assembled out of figures
           already on the page. The pick form is the clearest case —
           "หยิบแล้ว / ต้องหยิบ" restated a column of the grid it sat
           beside, and "หยิบไม่ครบ 3 บรรทัด" counted the rows whose
           ขาด column was already amber.

           A summary of what is visible is not a summary, it is the
           same thing twice, and it cost 320px of the width the form
           itself was short of. What the rail said that the form did
           not is now said where it applies: on the line, or in the
           validation summary above Save.
           ------------------------------------------------------------ */
        className="grid max-w-[1440px] grid-cols-[228px_minmax(0,1fr)] items-start gap-5 px-6 pb-16 pt-6 max-md:px-4 max-[900px]:grid-cols-1"
      >
        <StepRail
          steps={steps}
          activeKey={activeKey}
          status={status}
          showErrors={showErrors}
          onPick={jumpTo}
        />

        <div className="flex min-w-0 flex-col gap-4">
          {offeredDraft && (
            <DraftBanner
              at={offeredDraft.at}
              onRestore={() => {
                setState(offeredDraft.state);
                setSavedAt(offeredDraft.at);
                setOfferedDraft(null);
                ctx.toast("กู้คืนร่างแล้ว", "ข้อมูลที่บันทึกอัตโนมัติถูกนำกลับมา", "success");
              }}
              onDiscard={() => {
                clearDraft(key);
                setOfferedDraft(null);
              }}
            />
          )}

          {duplicates.length > 0 && (
            <DuplicateAlert
              hits={duplicates}
              onOpen={(code) => schema.openDuplicate?.(code, ctx)}
            />
          )}

          {/* ---------- Every section, in order ---------- */}
          {steps.map((step, i) => {
            const st = status.steps[step.key];
            const bad = showErrors && st && !st.complete;

            return (
              <section
                key={step.key}
                id={sectionDomId(schema.key, step.key)}
                aria-labelledby={`${sectionDomId(schema.key, step.key)}-h`}
                data-side={step.side}
                /* Clears the sticky topbar, so a jump does not land with the
                   heading tucked underneath it.

                   A one-sided section is tinted and inset: customer work in
                   info blue, supplier work in success green, with a rule down
                   the left so the block reads as one region rather than as
                   cards that happen to share a colour. Neutral sections are
                   left alone — a tint everywhere would say nothing. */
                className={cn(
                  "flex scroll-mt-[84px] flex-col gap-4",
                  step.side &&
                    "rounded-card border-l-2 py-4 pl-4 pr-4 max-md:pl-3 max-md:pr-3",
                  step.side === "customer" && "border-l-info bg-info-soft/40",
                  step.side === "supplier" && "border-l-success bg-success-soft/40",
                )}
              >
                <header className="flex items-center gap-2.5 pt-2 first:pt-0">
                  <span
                    className={cn(
                      "grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-full border text-[11px] font-semibold tnum",
                      bad
                        ? "border-danger bg-danger text-white"
                        : st && st.complete && st.total > 0
                          ? "border-success bg-success text-white"
                          : "border-line-strong bg-card text-ink-3",
                    )}
                  >
                    {bad ? <Icon name="alert" size={12} strokeWidth={2.6} /> : i + 1}
                  </span>
                  <h2
                    id={`${sectionDomId(schema.key, step.key)}-h`}
                    className="text-[15px] font-semibold tracking-[-0.01em]"
                  >
                    {step.label}
                  </h2>
                  {step.labelTh && (
                    <span className="truncate text-cap text-ink-3">{step.labelTh}</span>
                  )}
                  {/* Said in words as well as in colour: colour alone is not
                      a label, and roughly one man in twelve cannot read this
                      particular pair of tints apart. */}
                  {step.side && (
                    <Badge tone={step.side === "customer" ? "info" : "success"}>
                      {step.side === "customer" ? "ฝั่งลูกค้า" : "ฝั่งผู้ขาย"}
                    </Badge>
                  )}
                </header>

                {step.review ? (
                  <ReviewStep schema={schema} state={state} onJump={jumpTo} />
                ) : (
                  (step.blocks(state).filter(Boolean) as FormBlock[] | undefined)?.map(
                    (b, bi) => <BlockView key={bi} block={b} api={api} />,
                  )
                )}
              </section>
            );
          })}

          {/* ---------- Save ---------- */}
          <div className="flex items-center gap-3 border-t border-line pt-4">
            <span className="text-cap text-ink-3 tnum">
              {status.done}/{status.total} ช่องที่จำเป็น · {steps.length} หัวข้อ
            </span>
            <Button variant="primary" className="ml-auto" onClick={save}>
              <Icon name="save" size={16} strokeWidth={2} />
              {schema.saveButton ?? `Save ${entityLabel}`}
            </Button>
          </div>
        </div>

      </main>
    </div>
  );
}

/* ---------- Section rail ---------- */

function StepRail({
  steps,
  activeKey,
  status,
  showErrors,
  onPick,
}: {
  steps: { key: string; label: string; railLabel?: string; labelTh?: string }[];
  activeKey: string;
  status: ReturnType<typeof formStatus>;
  showErrors: boolean;
  onPick: (key: string) => void;
}) {
  return (
    <nav
      aria-label="หัวข้อในฟอร์ม"
      className="sticky top-[84px] flex flex-col gap-0.5 max-[900px]:static max-[900px]:flex-row max-[900px]:overflow-x-auto max-[900px]:pb-2 scrollbar-none"
    >
      {steps.map((s, i) => {
        const st = status.steps[s.key];
        const on = s.key === activeKey;
        const bad = showErrors && st && !st.complete;
        const done = st && st.complete && st.total > 0;

        return (
          <button
            key={s.key}
            onClick={() => onPick(s.key)}
            /* "location", not "step": nothing is hidden behind this any more,
               it says which part of one page you are looking at. */
            aria-current={on ? "location" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-btn px-3 py-2.5 text-left transition-colors duration-fast max-[900px]:flex-shrink-0",
              on ? "bg-primary-soft text-primary-active" : "text-ink-2 hover:bg-neutral-soft",
            )}
          >
            <span
              className={cn(
                "grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-full border text-[11px] font-semibold tnum",
                bad
                  ? "border-danger bg-danger text-white"
                  : done
                    ? "border-success bg-success text-white"
                    : on
                      ? "border-primary bg-primary text-white"
                      : "border-line-strong bg-card text-ink-3",
              )}
            >
              {bad ? (
                <Icon name="alert" size={12} strokeWidth={2.6} />
              ) : done ? (
                <Icon name="check" size={12} strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-[13px]",
                  on ? "font-semibold" : "font-medium",
                )}
              >
                {s.railLabel ?? s.label}
              </span>
              {s.labelTh && (
                <span className="block truncate text-cap text-ink-3 max-[900px]:hidden">
                  {s.labelTh}
                </span>
              )}
            </span>
            {bad && st.missing.length > 0 && (
              <span className="ml-auto flex-shrink-0 rounded-pill bg-danger-soft px-1.5 text-[11px] font-semibold text-danger-text tnum max-[900px]:hidden">
                {st.missing.length}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- Blocks ---------- */

/** Field types that draw their own heading — the block must not repeat it. */
const SELF_TITLED = new Set(["cards", "note", "picks"]);

function BlockView({ block, api }: { block: FormBlock; api: FormApi }) {
  if (block.type === "card") return <CardBlock card={block} api={api} />;

  /* A lone field owns the full width — grids, trees and role pickers. */
  const field = block as FormField;
  if (field.when && !field.when(api.state)) return null;

  return (
    <div className="rounded-card border border-line bg-card px-6 py-5 shadow-xs max-md:rounded-btn max-md:p-4">
      {field.label && !SELF_TITLED.has(field.type) && (
        <SectionTitle>
          {field.label}
          {field.required && <span className="text-danger"> *</span>}
        </SectionTitle>
      )}
      <div className="grid grid-cols-1">
        <FieldView field={field} api={api} />
      </div>
    </div>
  );
}

const COLS: Record<string, string> = {
  "2": "grid-cols-2 max-[820px]:grid-cols-1",
  "3": "grid-cols-3 max-[1100px]:grid-cols-2 max-[820px]:grid-cols-1",
  "4": "grid-cols-4 max-[1100px]:grid-cols-2 max-[820px]:grid-cols-1",
  "5": "grid-cols-5 max-[1100px]:grid-cols-3 max-[820px]:grid-cols-2",
};

function CardBlock({ card, api }: { card: FormCard; api: FormApi }) {
  const fields = card.fields.filter(Boolean) as FormField[];
  if (fields.every((f) => f.when && !f.when(api.state))) return null;

  return (
    <div className="rounded-card border border-line bg-card px-6 py-5 shadow-xs max-md:rounded-btn max-md:p-4">
      {(card.title || card.badge) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {card.title && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
              {card.title}
            </p>
          )}
          {card.badge}
        </div>
      )}
      <div className={cn("grid gap-x-5 gap-y-4", COLS[card.cols ?? "2"])}>
        {/* Position, not path: a card can hold two fields on the same path —
            a Product Code that is typed on create and read back on edit —
            and keying on the path alone made those two one child. */}
        {fields.map((f, i) => (
          <FieldView key={`${f.path ?? f.type}-${i}`} field={f} api={api} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Draft restore ---------- */

function DraftBanner({
  at,
  onRestore,
  onDiscard,
}: {
  at: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-btn border border-[#FDE68A] bg-warning-soft p-4">
      <Icon name="clock" size={17} className="flex-shrink-0 text-warning" strokeWidth={2} />
      <span className="min-w-0 flex-1 text-[13px] text-warning-text">
        <strong className="font-semibold">พบร่างที่บันทึกอัตโนมัติไว้</strong> — จากเมื่อ{" "}
        {timeAgo(at)} ในเบราว์เซอร์นี้
      </span>
      <span className="flex gap-2">
        <Button size="sm" onClick={onDiscard}>
          ทิ้งร่าง
        </Button>
        <Button size="sm" variant="primary" onClick={onRestore}>
          กู้คืนร่าง
        </Button>
      </span>
    </div>
  );
}

/* ---------- Duplicate detection ---------- */

function DuplicateAlert({
  hits,
  onOpen,
}: {
  hits: { code: string; name: string; why: string }[];
  onOpen: (code: string) => void;
}) {
  return (
    <div className="rounded-btn border border-[#FDE68A] bg-warning-soft p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="alert" size={17} className="text-warning" strokeWidth={2} />
        <p className="text-[13px] font-semibold text-warning-text">
          อาจซ้ำกับข้อมูลที่มีอยู่แล้ว ({hits.length})
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {hits.map((h) => (
          <div
            key={h.code}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-card/70 px-3 py-2"
          >
            <span className="font-medium tnum">{h.code}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{h.name}</span>
            <span className="text-cap text-warning-text">{h.why}</span>
            <button
              type="button"
              onClick={() => onOpen(h.code)}
              className="text-[13px] font-medium text-info hover:underline"
            >
              เปิดดู
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Review step ---------- */

function ReviewStep<T extends RecordBase>({
  schema,
  state,
  onJump,
}: {
  schema: FormSchema<T>;
  state: FormState;
  onJump: (step: string) => void;
}) {
  const status = formStatus(schema, state);

  const row = (label: string, value: unknown, step: string): ReactNode => (
    <button
      key={`${step}:${label}`}
      type="button"
      onClick={() => onJump(step)}
      title="ไปที่หัวข้อนี้เพื่อแก้ไข"
      className="flex w-full items-baseline gap-4 border-b border-line py-[9px] text-left last:border-b-0 hover:bg-surface"
    >
      <span className="flex-shrink-0 text-[13px] text-ink-2">{label}</span>
      <span
        className={cn(
          "ml-auto truncate text-right text-[13px] font-medium tnum",
          !isFilledForReview(value) && "font-normal text-danger",
        )}
      >
        {isFilledForReview(value) ? reviewValue(value) : "ยังไม่ได้กรอก"}
      </span>
      <Icon name="chevronRight" size={14} className="flex-shrink-0 text-ink-3" />
    </button>
  );

  return (
    <>
      <div
        className={cn(
          "flex gap-3 rounded-btn border p-4",
          status.canSave
            ? "border-[#BBF7D0] bg-success-soft"
            : "border-[#FDE68A] bg-warning-soft",
        )}
      >
        <Icon
          name={status.canSave ? "checkCircle" : "alert"}
          size={18}
          strokeWidth={2}
          className={cn("flex-shrink-0", status.canSave ? "text-success" : "text-warning")}
        />
        <div
          className={cn(
            "min-w-0 text-[13px] leading-relaxed",
            status.canSave ? "text-success-text" : "text-warning-text",
          )}
        >
          <p className="mb-0.5 font-semibold">
            {status.canSave
              ? "ข้อมูลครบถ้วน พร้อมบันทึก"
              : `ยังมี ${status.missing.length + status.broken.length} รายการที่ต้องแก้ไข`}
          </p>
          {status.canSave ? (
            "ตรวจทานรายละเอียดด้านล่างอีกครั้งก่อนกดบันทึก"
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5">
              {status.missing.slice(0, 6).map((m) => (
                <li key={m.path + m.label}>
                  <button
                    type="button"
                    onClick={() => onJump(m.step)}
                    className="text-left hover:underline"
                  >
                    • {m.label}
                  </button>
                </li>
              ))}
              {status.broken.slice(0, 4).map((b) => (
                <li key={b.label}>
                  <button
                    type="button"
                    onClick={() => onJump(b.step)}
                    className="text-left hover:underline"
                  >
                    • {b.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {schema.reviewCards ? (
        schema.reviewCards(state, row)
      ) : (
        <div className="rounded-card border border-line bg-card px-6 py-5 shadow-xs max-md:rounded-btn max-md:p-4">
          <SectionTitle>สรุปข้อมูลที่จำเป็น</SectionTitle>
          <div className="flex flex-col">
            {schema.required.map((r) => row(r.label, getPath(state, r.path), r.step))}
          </div>
        </div>
      )}
    </>
  );
}

const isFilledForReview = (v: unknown) =>
  v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

function reviewValue(v: unknown): ReactNode {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return `${v.length} รายการ`;
  if (v && typeof v === "object") {
    const on = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val === true)
      .map(([k]) => k);
    return on.length ? on.join(", ") : esc(null);
  }
  return esc(v);
}
