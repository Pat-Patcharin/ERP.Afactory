"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn, getPath } from "@/lib/utils";
import { esc, toInputDate } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { checkPermission } from "@/lib/permissions";
import {
  CellInput,
  CellSelect,
  Checkbox,
  FieldShell,
  Input,
  Radio,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import type {
  ActionCtx,
  FormField,
  FormState,
  GridCol,
  GridRow,
  LookupHit,
  SelectOption,
} from "@/lib/types";

/* ============================================================
   FIELD RENDERERS

   Thirteen field types, one switch. A form schema names a type and
   a path; nothing here knows what a Product or a Goods Receipt is.
   ============================================================ */

/** Everything a field needs to read state and write it back. */
export interface FormApi {
  state: FormState;
  set: (path: string, value: unknown) => void;
  gridSet: (path: string, index: number, key: string, value: unknown) => void;
  /** Sets the flag on one row and clears it on every other — "the primary one". */
  gridRadio: (path: string, index: number, key: string) => void;
  gridAdd: (path: string) => void;
  gridRemove: (path: string, index: number) => void;
  lookup: (source: string, q: string) => LookupHit[];
  lookupPick: (source: string, path: string, index: number, hit: LookupHit) => void;
  /** Required paths still blank. Only marked once the user has tried to save. */
  blank: Set<string>;
  showErrors: boolean;
  ctx: ActionCtx;
}

const optValue = (o: string | SelectOption) => (typeof o === "string" ? o : o.value);
const optLabel = (o: string | SelectOption) => (typeof o === "string" ? o : o.label);

/** Controls that sit under a label and can carry the green tick / red ring. */
const PLAIN = new Set(["text", "number", "date", "select", "textarea"]);

export function FieldView({ field: f, api }: { field: FormField; api: FormApi }) {
  if (f.when && !f.when(api.state)) return null;

  /* secure resolves to its inner type, or to a locked placeholder. */
  if (f.type === "secure") {
    if (!f.permission || checkPermission(f.permission)) {
      return <FieldView field={{ ...f, type: f.as ?? "text" }} api={api} />;
    }
    return (
      <FieldShell label={f.label} span={f.span} hint={f.hint}>
        <div className="flex h-10 items-center gap-2 rounded-input border border-dashed border-line-strong bg-surface px-3 text-[13px] text-ink-3">
          <Icon name="lock" size={15} />
          Restricted by permission
        </div>
      </FieldShell>
    );
  }

  /* Blocks that own their whole row and draw their own heading. */
  if (f.type === "grid") return <GridField field={f} api={api} />;
  if (f.type === "tree") return <TreeField field={f} api={api} />;
  if (f.type === "cards") return <CardsField field={f} api={api} />;
  if (f.type === "note") return <NoteField field={f} />;

  const path = f.path ?? "";
  const value = getPath(api.state, path);
  const isBlank = api.showErrors && api.blank.has(path);
  const filled = Boolean(f.required) && !api.blank.has(path);
  const ring = isBlank ? "border-danger focus:border-danger focus:ring-danger/[.12]" : "";

  const control = (() => {
    switch (f.type) {
      case "text":
        return (
          <Input
            value={String(value ?? "")}
            placeholder={f.placeholder}
            readOnly={f.readonly}
            aria-invalid={isBlank || undefined}
            className={ring}
            onChange={(e) => api.set(path, e.target.value)}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value === null || value === undefined ? "" : String(value)}
            placeholder={f.placeholder}
            readOnly={f.readonly}
            min={f.min}
            max={f.max}
            step={f.step}
            aria-invalid={isBlank || undefined}
            className={cn("tnum", ring)}
            onChange={(e) =>
              api.set(path, e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={toInputDate(value as string)}
            readOnly={f.readonly}
            aria-invalid={isBlank || undefined}
            className={cn("tnum", ring)}
            onChange={(e) => api.set(path, e.target.value)}
          />
        );

      case "select":
        return (
          <Select
            value={String(value ?? "")}
            disabled={f.readonly}
            aria-invalid={isBlank || undefined}
            className={ring}
            onChange={(e) => api.set(path, e.target.value)}
          >
            <option value="">{f.placeholder ?? "— เลือก —"}</option>
            {(f.options ?? []).map((o) => (
              <option key={optValue(o)} value={optValue(o)}>
                {optLabel(o)}
              </option>
            ))}
          </Select>
        );

      case "textarea":
        return (
          <Textarea
            rows={f.rows ?? 3}
            value={String(value ?? "")}
            placeholder={f.placeholder}
            readOnly={f.readonly}
            aria-invalid={isBlank || undefined}
            className={ring}
            onChange={(e) => api.set(path, e.target.value)}
          />
        );

      case "toggle":
        return (
          <Switch
            checked={Boolean(value)}
            label={f.label}
            onText={f.onText}
            offText={f.offText}
            onChange={(next) => api.set(path, next)}
          />
        );

      case "image":
        return <ImageControl field={f} api={api} />;

      case "photo":
        return <PhotoControl field={f} api={api} />;

      case "static":
        return (
          <div className="flex min-h-10 items-center rounded-input border border-line bg-surface px-3 text-body text-ink-2 tnum">
            {f.value ? f.value(api.state) : esc(value)}
          </div>
        );

      default:
        return null;
    }
  })();

  if (!control) return null;

  return (
    <FieldShell
      label={f.label}
      required={f.required}
      hint={
        isBlank ? (
          <span className="font-medium text-danger">กรุณากรอก{f.label}</span>
        ) : (
          f.hint
        )
      }
      span={f.span}
      valid={filled && PLAIN.has(f.type)}
    >
      {control}
    </FieldShell>
  );
}

/* ---------- image — the emoji stand-in every master uses today ---------- */

const EMOJI = ["📦", "🧪", "🧴", "🦷", "🏢", "🏭", "🏬", "🗂️", "🧾", "🔬", "📥", "🚚"];

function ImageControl({ field: f, api }: { field: FormField; api: FormApi }) {
  const path = f.path ?? "";
  const value = String(getPath(api.state, path) ?? "");

  return (
    <div className="flex items-start gap-4">
      <div className="grid h-[88px] w-[88px] flex-shrink-0 place-items-center rounded-card border border-line bg-surface text-[40px]">
        {value || <Icon name="product" size={28} className="text-ink-3" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => api.set(path, e)}
              aria-pressed={value === e}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-btn border text-lg transition-colors duration-fast",
                value === e
                  ? "border-primary bg-primary-soft"
                  : "border-line bg-card hover:bg-surface",
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            api.ctx.toast("อัปโหลดรูปภาพ", "การอัปโหลดไฟล์ — Future support", "info")
          }
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-info hover:underline"
        >
          <Icon name="upload" size={14} />
          อัปโหลดรูปภาพจริง
        </button>
      </div>
    </div>
  );
}

/* ---------- photo — a real photograph, with no icon to hide behind ------- */

/** Anything the browser can put in an <img>, rather than an emoji marker. */
export const isPhoto = (v: string) => /^(data:image\/|https?:\/\/|\/)/.test(v);

function PhotoControl({ field: f, api }: { field: FormField; api: FormApi }) {
  const path = f.path ?? "";
  const value = String(getPath(api.state, path) ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const has = isPhoto(value);

  /* Read the file into the draft. Nothing is uploaded anywhere — the picture
     lives in the record exactly like every other field until an API exists. */
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      api.ctx.toast("ไฟล์ไม่ใช่รูปภาพ", file.name, "danger");
      return;
    }
    if (file.size > 2_000_000) {
      api.ctx.toast("ไฟล์ใหญ่เกินไป", "รองรับไฟล์ไม่เกิน 2 MB", "danger");
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      api.set(path, String(reader.result ?? ""));
      setBusy(false);
      api.ctx.toast("อัปโหลดรูปแล้ว", file.name, "success");
    };
    reader.onerror = () => {
      setBusy(false);
      api.ctx.toast("อ่านไฟล์ไม่สำเร็จ", file.name, "danger");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-start gap-4">
      <div className="grid h-[88px] w-[88px] flex-shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-surface">
        {has ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={f.label} className="h-full w-full object-cover" />
        ) : (
          <Icon name="partner" size={28} className="text-ink-3" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-label={f.label}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex w-fit items-center gap-1.5 rounded-btn border border-line bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-surface disabled:opacity-50"
          >
            <Icon name={busy ? "spinner" : "upload"} size={14} />
            {has ? "เปลี่ยนรูป" : "อัปโหลดรูปจริง"}
          </button>
          {has && (
            <button
              type="button"
              onClick={() => api.set(path, "")}
              className="text-[13px] font-medium text-danger hover:underline"
            >
              ลบรูป
            </button>
          )}
        </div>
        <span className="text-cap text-ink-3">
          {f.hint ?? "รองรับ JPG หรือ PNG ไม่เกิน 2 MB"}
        </span>
      </div>
    </div>
  );
}

/* ---------- note — guidance inside the flow, never a data field ---------- */

function NoteField({ field: f }: { field: FormField }) {
  return (
    <div className="col-span-full flex gap-3 rounded-btn border border-[#BFDBFE] bg-info-soft p-4">
      <Icon name="info" size={17} className="flex-shrink-0 text-info" strokeWidth={2} />
      <div className="min-w-0 text-[13px] leading-relaxed text-info-text">
        {f.label && <p className="mb-0.5 font-semibold">{f.label}</p>}
        {f.text}
      </div>
    </div>
  );
}

/* ---------- cards — multi-select over a flags object (BP roles) ---------- */

function CardsField({ field: f, api }: { field: FormField; api: FormApi }) {
  const path = f.path ?? "";
  const picked = (getPath(api.state, path) ?? {}) as Record<string, boolean>;
  const invalid = api.showErrors && api.blank.has(path);

  return (
    <div className="col-span-full flex flex-col gap-2">
      <label className="text-cap font-medium text-ink-2">
        {f.label}
        {f.required && <span className="font-semibold text-danger"> *</span>}
      </label>
      <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-md:grid-cols-1">
        {(f.cardOptions ?? []).map((c) => {
          const on = Boolean(picked[c.key]);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => api.set(`${path}.${c.key}`, !on)}
              className={cn(
                "flex items-start gap-3 rounded-btn border p-4 text-left transition-colors duration-fast",
                on
                  ? "border-primary bg-primary-soft"
                  : "border-line bg-card hover:border-line-strong hover:bg-surface",
              )}
            >
              <span
                className={cn(
                  "mt-px grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-[5px] border-[1.5px]",
                  on ? "border-primary bg-primary text-white" : "border-line-strong",
                )}
              >
                {on && <Icon name="check" size={12} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{c.label}</span>
                {c.desc && (
                  <span className="mt-0.5 block text-cap leading-relaxed text-ink-2">
                    {c.desc}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {invalid ? (
        <span className="text-cap font-medium text-danger">
          เลือกอย่างน้อย 1 รายการ
        </span>
      ) : (
        f.hint && <span className="text-cap text-ink-3">{f.hint}</span>
      )}
    </div>
  );
}

/* ---------- tree — the warehouse Zone › Rack › Shelf › Bin builder ---------- */

interface TreeItem {
  code: string;
  name: string;
  children?: TreeItem[];
}

function TreeField({ field: f, api }: { field: FormField; api: FormApi }) {
  const path = f.path ?? "";
  const levels = f.levels ?? [];
  const nodes = (getPath(api.state, path) ?? []) as TreeItem[];

  const addAt = (parentPath: string, depth: number) => {
    const list = (getPath(api.state, parentPath) ?? []) as TreeItem[];
    api.set(parentPath, [
      ...list,
      { code: "", name: "", ...(depth + 1 < levels.length ? { children: [] } : {}) },
    ]);
  };

  const removeAt = (parentPath: string, index: number) => {
    const list = (getPath(api.state, parentPath) ?? []) as TreeItem[];
    api.set(
      parentPath,
      list.filter((_, i) => i !== index),
    );
  };

  const renderLevel = (list: TreeItem[], parentPath: string, depth: number): ReactNode => {
    const level = levels[depth];
    if (!level) return null;

    return (
      <div className={cn("flex flex-col gap-2", depth > 0 && "mt-2 border-l border-line pl-4")}>
        {list.map((node, i) => {
          const rowPath = `${parentPath}.${i}`;
          return (
            <div key={i} className="rounded-btn border border-line bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="w-[52px] flex-shrink-0 text-cap font-semibold uppercase tracking-[0.06em] text-ink-3">
                  {level.label}
                </span>
                <CellInput
                  value={node.code ?? ""}
                  placeholder={level.codePh}
                  className="w-[130px] flex-shrink-0"
                  onChange={(e) => api.set(`${rowPath}.code`, e.target.value)}
                />
                <CellInput
                  value={node.name ?? ""}
                  placeholder={level.namePh}
                  onChange={(e) => api.set(`${rowPath}.name`, e.target.value)}
                />
                <button
                  type="button"
                  title={`ลบ ${level.label}`}
                  onClick={() => removeAt(parentPath, i)}
                  className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-btn text-ink-3 transition-colors duration-fast hover:bg-danger-soft hover:text-danger"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
              {depth + 1 < levels.length && (
                <>
                  {renderLevel(node.children ?? [], `${rowPath}.children`, depth + 1)}
                  <button
                    type="button"
                    onClick={() => addAt(`${rowPath}.children`, depth + 1)}
                    className="mt-2 inline-flex items-center gap-1.5 text-cap font-medium text-info hover:underline"
                  >
                    <Icon name="plus" size={13} strokeWidth={2.4} />
                    เพิ่ม {levels[depth + 1].label}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="col-span-full flex flex-col gap-3">
      {nodes.length === 0 ? (
        <p className="rounded-btn border border-dashed border-line-strong bg-surface p-5 text-center text-[13px] text-ink-3">
          {f.empty ?? "ยังไม่มีโครงสร้างจัดเก็บ"}
        </p>
      ) : (
        renderLevel(nodes, path, 0)
      )}
      <button
        type="button"
        onClick={() => addAt(path, 0)}
        className="inline-flex w-fit items-center gap-1.5 rounded-btn border border-dashed border-line-strong px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors duration-fast hover:border-primary hover:bg-primary-soft hover:text-primary-active"
      >
        <Icon name="plus" size={15} strokeWidth={2.2} />
        {f.addLabel ?? `เพิ่ม ${levels[0]?.label ?? "รายการ"}`}
      </button>
    </div>
  );
}

/* ---------- grid — every document's line-item table ---------- */

function GridField({ field: f, api }: { field: FormField; api: FormApi }) {
  const path = f.path ?? "";
  const rows = (getPath(api.state, path) ?? []) as GridRow[];
  const cols = f.cols ?? [];
  const invalid = api.showErrors && api.blank.has(path);

  return (
    <div className="col-span-full flex flex-col gap-3">
      <div className="overflow-x-auto rounded-btn border border-line">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="bg-surface">
              {cols.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    "whitespace-nowrap border-b border-line px-2 py-2.5 text-cap font-semibold text-ink-2",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                  {c.required && <span className="font-semibold text-danger"> *</span>}
                </th>
              ))}
              <th className="w-10 border-b border-line" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={cols.length + 1}
                  className="px-3 py-8 text-center text-ink-3"
                >
                  {f.empty ?? "ยังไม่มีรายการ"}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-2 py-1.5 align-middle",
                        c.align === "right" && "text-right tnum",
                        c.muted && "text-ink-2",
                        c.cls?.(row),
                      )}
                    >
                      <GridCell
                        col={c}
                        row={row}
                        index={i}
                        gridPath={path}
                        api={api}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      title="ลบรายการ"
                      onClick={() => api.gridRemove(path, i)}
                      className="grid h-[30px] w-[30px] place-items-center rounded-btn text-ink-3 transition-colors duration-fast hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => api.gridAdd(path)}
          className="inline-flex items-center gap-1.5 rounded-btn border border-dashed border-line-strong px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors duration-fast hover:border-primary hover:bg-primary-soft hover:text-primary-active"
        >
          <Icon name="plus" size={15} strokeWidth={2.2} />
          {f.addLabel ?? "เพิ่มรายการ"}
        </button>
        {invalid && (
          <span className="text-cap font-medium text-danger">
            ต้องมีอย่างน้อย 1 รายการ
          </span>
        )}
        {!invalid && f.hint && (
          <span className="text-cap text-ink-3">{f.hint}</span>
        )}
      </div>
    </div>
  );
}

function GridCell({
  col: c,
  row,
  index,
  gridPath,
  api,
}: {
  col: GridCol;
  row: GridRow;
  index: number;
  gridPath: string;
  api: FormApi;
}) {
  const v = row[c.key];
  const put = (value: unknown) => api.gridSet(gridPath, index, c.key, value);

  switch (c.type) {
    case "computed":
      return <span className="tnum">{c.get ? c.get(row) : esc(v)}</span>;

    case "static":
      return <span className={cn(c.muted && "text-ink-2")}>{esc(v)}</span>;

    case "number":
      return (
        <CellInput
          type="number"
          value={v === null || v === undefined ? "" : String(v)}
          placeholder={c.placeholder}
          className="text-right tnum"
          onChange={(e) => put(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );

    case "date":
      return (
        <CellInput
          type="date"
          value={toInputDate(v as string)}
          className="tnum"
          onChange={(e) => put(e.target.value)}
        />
      );

    case "select":
      return (
        <CellSelect value={String(v ?? "")} onChange={(e) => put(e.target.value)}>
          <option value="">{c.placeholder ?? "—"}</option>
          {(c.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </CellSelect>
      );

    case "check":
      return (
        <span className="grid place-items-center">
          <Checkbox checked={Boolean(v)} onChange={(e) => put(e.target.checked)} />
        </span>
      );

    case "radio":
      return (
        <span className="grid place-items-center">
          <Radio
            name={`${gridPath}.${c.key}`}
            checked={Boolean(v)}
            onChange={() => api.gridRadio(gridPath, index, c.key)}
          />
        </span>
      );

    case "seg":
      return (
        <span className="inline-flex rounded-btn border border-line p-0.5">
          {(c.segOptions ?? []).map((s) => {
            const on = v === s.val;
            return (
              <button
                key={s.val}
                type="button"
                aria-pressed={on}
                onClick={() => put(on ? "" : s.val)}
                className={cn(
                  "rounded-sm px-2 py-1 text-[12px] font-medium transition-colors duration-fast",
                  !on && "text-ink-2 hover:bg-neutral-soft",
                  on && s.tone === "ok" && "bg-success text-white",
                  on && s.tone === "danger" && "bg-danger text-white",
                  on && (!s.tone || s.tone === "neutral") && "bg-neutral-text text-white",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </span>
      );

    case "lookup":
      return (
        <LookupCell
          col={c}
          value={String(v ?? "")}
          index={index}
          gridPath={gridPath}
          api={api}
        />
      );

    default:
      return (
        <CellInput
          value={String(v ?? "")}
          placeholder={c.placeholder}
          onChange={(e) => put(e.target.value)}
        />
      );
  }
}

/** Type-ahead over a schema-declared source; picking hands the row to the schema. */
function LookupCell({
  col: c,
  value,
  index,
  gridPath,
  api,
}: {
  col: GridCol;
  value: string;
  index: number;
  gridPath: string;
  api: FormApi;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hits = open && c.source ? api.lookup(c.source, q).slice(0, 8) : [];

  return (
    <div className="relative">
      <CellInput
        value={open ? q : value}
        placeholder={c.placeholder ?? "ค้นหา..."}
        onFocus={() => {
          setQ(value);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          api.gridSet(gridPath, index, c.key, e.target.value);
        }}
      />
      {open && hits.length > 0 && (
        <ul className="absolute left-0 top-[38px] z-20 max-h-[248px] w-[320px] overflow-y-auto rounded-btn border border-line bg-card py-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.code}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  if (c.source) api.lookupPick(c.source, gridPath, index, h);
                  setOpen(false);
                }}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors duration-fast hover:bg-surface"
              >
                <span className="font-medium tnum">{h.code}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{h.name}</span>
                {h.meta && (
                  <span className="flex-shrink-0 text-cap text-ink-3 tnum">{h.meta}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
