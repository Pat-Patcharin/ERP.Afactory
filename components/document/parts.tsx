"use client";

import { useMemo, useState, type ReactNode } from "react";
import { COMPANY } from "@/data/admin";
import { customerOptions } from "@/lib/domain/outbound";
import {
  DISCOUNT_THRESHOLD,
  lineAvailability,
  productSearch,
  shipToChoices,
  type ChargeFields,
  type DocInsight,
  type DocTotals,
  type DraftLine,
  type PartyFields,
} from "@/lib/domain/doc-draft";
import { bahtText } from "@/lib/print/words";
import { AFactoryLogo, BarcodePlaceholder, QRPlaceholder } from "@/components/print/marks";
import { fmt, money, money0, toDisplayDate } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  CellInput,
  CellSelect,
  Checkbox,
  IconButton,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

/* ============================================================
   QUOTATION DOCUMENT — the sections of the sheet.

   Every one of these renders the SAME layout in both modes. In
   `edit` the values sit in controls; in `read` they are plain
   text. That is what lets the salesperson type into the document
   they are about to send, and what guarantees the printed sheet
   carries no form controls at all.
   ============================================================ */

export type DocMode = "edit" | "read";

const num = (v: unknown) => Number(v) || 0;

/** Scroll anchor for the validation summary. */
export const anchorId = (field: string) => `qt-field-${field}`;

/* ---------- Small primitives ---------- */

export function DocLabel({ en, th }: { en: string; th?: string }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
      {en}
      {th && <span className="ml-1 normal-case tracking-normal text-ink-3">({th})</span>}
    </span>
  );
}

/** One labelled row inside a document panel. */
export function DocRow({
  label,
  required,
  invalid,
  field,
  children,
}: {
  label: string;
  required?: boolean;
  invalid?: boolean;
  field?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={field ? anchorId(field) : undefined}
      className={cn(
        "flex items-center gap-3 py-[5px]",
        invalid && "-mx-2 rounded-btn bg-danger-soft px-2",
      )}
    >
      <span className="w-[112px] flex-shrink-0 text-cap text-ink-2">
        {label}
        {required && <span className="font-semibold text-danger"> *</span>}
      </span>
      <div className="min-w-0 flex-1 text-[13px]">{children}</div>
    </div>
  );
}

/** Read-only value with the em dash the rest of the ERP uses for "nothing". */
export const DocValue = ({ value }: { value: string }) => (
  <span className={cn(!value && "text-ink-3")}>{value || "—"}</span>
);

/* ---------- Header ---------- */

export function DocHeader({
  title,
  titleTh,
  code,
  status,
}: {
  title: string;
  titleTh: string;
  code: string;
  status: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-primary pb-5">
      <div className="flex min-w-0 items-start gap-4">
        <AFactoryLogo size={22} src={COMPANY.logoUrl} />
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold uppercase leading-tight tracking-[-0.01em] text-primary">
            {COMPANY.nameEn}
          </h1>
          <p className="text-[15px] font-semibold text-ink">{COMPANY.nameTh}</p>
          <div className="mt-2 space-y-0.5 text-cap text-ink-2">
            <p>{COMPANY.address}</p>
            <p>
              โทร. {COMPANY.phone}
              <span className="ml-4">เลขประจำตัวผู้เสียภาษี {COMPANY.taxId}</span>
            </p>
            <p>
              E-mail : {COMPANY.email}
              <span className="ml-4">Website : {COMPANY.website}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-5">
        <div className="text-right">
          <p className="text-[26px] font-bold leading-none tracking-[-0.01em]">{title}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{titleTh}</p>
          <p className="mt-2 text-[22px] font-bold tracking-[0.01em] text-primary tnum">
            {code}
          </p>
          <p className="mt-2 flex items-center justify-end gap-2 text-cap text-ink-2">
            Status :
            <Badge tone={status === "Draft" ? "neutral" : "info"}>
              {status.toUpperCase()}
            </Badge>
          </p>
        </div>

        <div className="text-center max-md:hidden">
          <p className="mb-1 text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-ink-3">
            Scan to verify
            <br />
            document
          </p>
          <QRPlaceholder value={code} size={17} />
          <div className="mt-1.5">
            <BarcodePlaceholder value={code} width={34} height={7} />
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------- Bill To / Ship To ---------- */

export function BillToPanel({
  draft,
  mode,
  set,
  invalid,
}: {
  draft: PartyFields;
  mode: DocMode;
  set: (patch: Partial<PartyFields>) => void;
  invalid: Set<string>;
}) {
  return (
    <section className="rounded-card border border-line p-4">
      <DocLabel en="Bill To" th="ลูกค้า" />
      <div className="mt-2">
        <DocRow label="Customer" required field="customer" invalid={invalid.has("customer")}>
          {mode === "edit" ? (
            <Select
              aria-label="Customer"
              className="h-9"
              value={draft.customerPick}
              onChange={(e) => set({ customerPick: e.target.value })}
            >
              <option value="">— เลือกลูกค้า —</option>
              {customerOptions().map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <DocValue value={draft.customer} />
          )}
        </DocRow>
        <DocRow label="Customer Code">
          <DocValue value={draft.customerCode} />
        </DocRow>
        <DocRow label="Customer Name">
          <DocValue value={draft.customer} />
        </DocRow>
        <DocRow label="Tax ID">
          <span className="tnum">
            <DocValue value={draft.taxId} />
          </span>
        </DocRow>
        <DocRow
          label="Address"
          required
          field="billAddress"
          invalid={invalid.has("billAddress")}
        >
          <DocValue value={draft.billAddress} />
        </DocRow>
        <DocRow label="Contact">
          {mode === "edit" ? (
            <Input
              aria-label="Bill To Contact"
              className="h-9"
              value={draft.billContact}
              onChange={(e) => set({ billContact: e.target.value })}
            />
          ) : (
            <DocValue value={draft.billContact} />
          )}
        </DocRow>
        <DocRow label="Tel.">
          {mode === "edit" ? (
            <Input
              aria-label="Bill To Telephone"
              className="h-9"
              value={draft.billPhone}
              onChange={(e) => set({ billPhone: e.target.value })}
            />
          ) : (
            <DocValue value={draft.billPhone} />
          )}
        </DocRow>
      </div>
    </section>
  );
}

export function ShipToPanel({
  draft,
  mode,
  set,
  invalid,
}: {
  draft: PartyFields;
  mode: DocMode;
  set: (patch: Partial<PartyFields>) => void;
  invalid: Set<string>;
}) {
  const choices = useMemo(() => shipToChoices(draft.customerPick), [draft.customerPick]);
  const same = draft.sameAsBill;

  return (
    <section className="rounded-card border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DocLabel en="Ship To" th="จัดส่งที่" />
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-cap text-ink-2">
            <Checkbox
              checked={same}
              aria-label="Same as Bill To"
              onChange={(e) => set({ sameAsBill: e.target.checked })}
            />
            Same as Bill To
          </label>
        )}
      </div>

      <div className="mt-2">
        {mode === "edit" && !same && (
          <DocRow label="Ship To" field="shipAddress" invalid={invalid.has("shipAddress")}>
            <Select
              aria-label="Delivery Address"
              className="h-9"
              value={draft.shipAddressPick}
              onChange={(e) => set({ shipAddressPick: e.target.value })}
              disabled={!choices.length}
            >
              <option value="">
                {choices.length ? "— เลือกที่อยู่จัดส่ง —" : "เลือกลูกค้าก่อน"}
              </option>
              {choices.map((c) => (
                <option key={c.label} value={c.label}>
                  {c.label}
                </option>
              ))}
            </Select>
          </DocRow>
        )}

        <DocRow label="Address">
          <DocValue value={same ? draft.billAddress : draft.shipAddress} />
        </DocRow>
        <DocRow label="Contact">
          <DocValue value={same ? draft.billContact : draft.shipContact} />
        </DocRow>
        <DocRow label="Tel.">
          <DocValue value={same ? draft.billPhone : draft.shipPhone} />
        </DocRow>
        <DocRow label="Delivery Instruction">
          {mode === "edit" ? (
            <Textarea
              aria-label="Delivery Instruction"
              rows={2}
              className="text-[13px]"
              value={draft.shipInstruction}
              onChange={(e) => set({ shipInstruction: e.target.value })}
            />
          ) : (
            <DocValue value={draft.shipInstruction} />
          )}
        </DocRow>
      </div>
    </section>
  );
}

/* ---------- Metadata ---------- */

/**
 * The metadata column, described by the document rather than hard-coded.
 *
 * A quotation lists a validity date; a sales request lists a required date and
 * a priority. Both are the same rows in the same box, so the panel takes the
 * rows and the document decides what they are.
 */
export interface MetaRow {
  /** Draft field name — also the scroll anchor the error summary jumps to. */
  field: string;
  label: string;
  required?: boolean;
  /** Editable control; omitted rows are read-only in both modes. */
  control?: ReactNode;
  read: string;
}

export function MetaPanel({
  rows,
  mode,
  invalid,
}: {
  rows: MetaRow[];
  mode: DocMode;
  invalid: Set<string>;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line">
      {rows.map((r) => (
        <div
          key={r.field}
          id={anchorId(r.field)}
          className={cn(
            "grid grid-cols-[136px_1fr] items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0",
            invalid.has(r.field) && "bg-danger-soft",
          )}
        >
          <span className="text-cap text-ink-2">
            {r.label}
            {r.required && <span className="font-semibold text-danger"> *</span>}
          </span>
          {mode === "edit" && r.control ? (
            r.control
          ) : (
            <span className="text-[13px]">{r.read || "—"}</span>
          )}
        </div>
      ))}
    </section>
  );
}

/** Controls a document builds its metadata rows from. */
export function MetaText({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (next: string) => void;
}) {
  return (
    <Input
      aria-label={label}
      type={type}
      className="h-9"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function MetaSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <Select
      aria-label={label}
      className="h-9"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  );
}

/* ---------- Customer insight ---------- */

export function InsightPanel({ insight }: { insight: DocInsight }) {
  const [open, setOpen] = useState(false);
  if (!insight.found) return null;

  const cell = (label: string, value: string, tone?: "warn") => (
    <div className="min-w-0">
      <p className="text-cap text-ink-3">{label}</p>
      <p className={cn("truncate text-[13px] font-medium tnum", tone === "warn" && "text-warning-text")}>
        {value}
      </p>
    </div>
  );

  return (
    <section
      data-testid="customer-insight"
      className="rounded-card border border-line bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Icon name="partner" size={16} className="text-ink-2" />
        <span className="text-cap font-semibold text-ink-2">Customer Insight</span>
        <span className="text-cap text-ink-3">
          {insight.cashOnly
            ? "ลูกค้าเงินสด"
            : `วงเงินคงเหลือ ${money0(insight.available)} · ${insight.status}`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "ซ่อน" : "ดูข้อมูลลูกค้า"}
          <Icon name={open ? "chevronUp" : "chevronDown"} size={15} />
        </Button>
      </div>

      {open && (
        <div className="mt-3 grid grid-cols-4 gap-x-4 gap-y-3 border-t border-line pt-3 max-md:grid-cols-2">
          {cell("Credit Limit", insight.cashOnly ? "เงินสดเท่านั้น" : money0(insight.limit))}
          {cell("Credit Used", money0(insight.outstanding))}
          {cell("Available Credit", money0(insight.available))}
          {cell(
            "Projected Exposure",
            money0(insight.projected),
            insight.withinLimit ? undefined : "warn",
          )}
          {cell("Credit Status", insight.status)}
          {cell("Payment Term", insight.payTerm)}
          {cell("Price List", insight.priceList)}
          {cell("Last Sales Order", insight.lastOrder || "—")}
          {cell("Last Transaction", insight.lastOrderDate || "—")}
          {cell("Outstanding Invoices", String(insight.outstandingInvoices))}
          {cell("Sales This Year", money0(insight.salesThisYear))}
        </div>
      )}
    </section>
  );
}

export function CreditWarning({ insight }: { insight: DocInsight }) {
  if (!insight.found || insight.withinLimit) return null;
  return (
    <div
      data-testid="credit-warning"
      className="rounded-card border border-warning/40 bg-warning-soft px-4 py-3"
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold text-warning-text">
        <Icon name="alert" size={16} />
        Customer Credit Limit Exceeded — เกินวงเงินเครดิต {money0(insight.overBy)}
      </p>
      <div className="mt-2 grid grid-cols-4 gap-3 text-cap max-md:grid-cols-2">
        <div>
          <p className="text-ink-3">Credit Limit</p>
          <p className="font-medium tnum">{money0(insight.limit)}</p>
        </div>
        <div>
          <p className="text-ink-3">Credit Used</p>
          <p className="font-medium tnum">{money0(insight.outstanding)}</p>
        </div>
        <div>
          <p className="text-ink-3">Quotation Value</p>
          <p className="font-medium tnum">{money0(insight.projected - insight.outstanding)}</p>
        </div>
        <div>
          <p className="text-ink-3">Projected Exposure</p>
          <p className="font-medium text-warning-text tnum">{money0(insight.projected)}</p>
        </div>
      </div>
      <p className="mt-2 text-cap text-ink-2">
        เสนอราคาได้ตามปกติ — ฝ่ายบัญชีจะพิจารณาเครดิตอีกครั้งตอนอนุมัติคำขอขาย
      </p>
    </div>
  );
}

/* ---------- Item table ---------- */

const HEAD = "bg-[#2f3542] text-white text-[11px] font-semibold uppercase tracking-[0.03em]";

export function ItemTable({
  items,
  mode,
  invalid,
  onCell,
  onPick,
  onRemove,
  onAdd,
  selected,
  onSelect,
}: {
  items: DraftLine[];
  mode: DocMode;
  invalid: Set<string>;
  onCell: (id: string, col: keyof DraftLine, value: string) => void;
  onPick: (id: string, code: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
}) {
  const rows = mode === "read" ? items.filter((l) => l.code) : items;

  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[900px] border-collapse text-[13px]">
        <thead>
          <tr className={HEAD}>
            {mode === "edit" && <th className="w-9 px-2 py-2.5" />}
            <th className="w-11 px-2 py-2.5 text-center">No.</th>
            <th className="w-[150px] px-2 py-2.5 text-left">Item Code</th>
            <th className="px-2 py-2.5 text-left">Description</th>
            <th className="w-[110px] px-2 py-2.5 text-left">Lot No.</th>
            <th className="w-[120px] px-2 py-2.5 text-left">Serial No.</th>
            <th className="w-[86px] px-2 py-2.5 text-right">Quantity</th>
            <th className="w-[72px] px-2 py-2.5 text-center">UOM</th>
            <th className="w-[104px] px-2 py-2.5 text-right">Unit Price</th>
            <th className="w-[92px] px-2 py-2.5 text-right">Discount (%)</th>
            <th className="w-[104px] px-2 py-2.5 text-right">Net Price</th>
            <th className="w-[110px] px-2 py-2.5 text-right">Amount</th>
            {mode === "edit" && <th className="w-10 px-2 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => (
            <ItemRow
              key={l.id}
              line={l}
              index={i}
              mode={mode}
              invalid={invalid.has(`item-${l.id}`)}
              onCell={onCell}
              onPick={onPick}
              onRemove={onRemove}
              selected={selected.has(l.id)}
              onSelect={onSelect}
            />
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={13} className="px-3 py-8 text-center text-ink-3">
                ยังไม่มีรายการสินค้า
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {mode === "edit" && (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-2 border-t border-line py-2.5 text-[13px] font-medium text-info hover:bg-surface"
        >
          <Icon name="plus" size={15} strokeWidth={2} />
          เพิ่มรายการ (Enter ที่บรรทัดสุดท้าย)
        </button>
      )}
    </div>
  );
}

function ItemRow({
  line,
  index,
  mode,
  invalid,
  onCell,
  onPick,
  onRemove,
  selected,
  onSelect,
}: {
  line: DraftLine;
  index: number;
  mode: DocMode;
  invalid: boolean;
  onCell: (id: string, col: keyof DraftLine, value: string) => void;
  onPick: (id: string, code: string) => void;
  onRemove: (id: string) => void;
  selected: boolean;
  onSelect: (id: string, on: boolean) => void;
}) {
  const base = num(line.qty) * num(line.price);
  const amount = base - base * (num(line.disc) / 100);
  const netPrice = num(line.price) * (1 - num(line.disc) / 100);
  const stock = line.code ? lineAvailability(line.code) : null;
  const short = stock?.found && stock.available < num(line.qty);
  const deepDiscount = num(line.disc) > DISCOUNT_THRESHOLD;

  if (mode === "read") {
    return (
      <tr className="border-b border-line align-top last:border-b-0">
        <td className="px-2 py-2.5 text-center tnum">{index + 1}</td>
        <td className="px-2 py-2.5">
          <p className="font-medium">{line.code}</p>
          <p className="text-cap text-ink-2">{line.name}</p>
        </td>
        <td className="px-2 py-2.5">
          {line.desc && <p>{line.desc}</p>}
          {line.note && <p className="text-cap text-ink-2">{line.note}</p>}
          {!line.desc && !line.note && <span className="text-ink-3">—</span>}
        </td>
        <td className="px-2 py-2.5 tnum">{line.lot || "-"}</td>
        <td className="px-2 py-2.5 tnum">{line.serial || "-"}</td>
        <td className="px-2 py-2.5 text-right tnum">{fmt(num(line.qty))}</td>
        <td className="px-2 py-2.5 text-center">{line.unit}</td>
        <td className="px-2 py-2.5 text-right tnum">{money(num(line.price))}</td>
        <td className="px-2 py-2.5 text-right tnum">{money(num(line.disc))}</td>
        <td className="px-2 py-2.5 text-right tnum">{money(netPrice)}</td>
        <td className="px-2 py-2.5 text-right font-medium tnum">{money(amount)}</td>
      </tr>
    );
  }

  return (
    <tr
      id={anchorId(`item-${line.id}`)}
      className={cn("border-b border-line last:border-b-0", invalid && "bg-danger-soft")}
    >
      <td className="px-2 py-1.5 text-center">
        <Checkbox
          checked={selected}
          aria-label={`เลือกบรรทัดที่ ${index + 1}`}
          onChange={(e) => onSelect(line.id, e.target.checked)}
        />
      </td>
      <td className="px-2 py-1.5 text-center text-ink-2 tnum">{index + 1}</td>
      <td className="px-2 py-1.5">
        <ProductCell line={line} index={index} onPick={onPick} />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          aria-label={`Description ${index + 1}`}
          value={line.name}
          placeholder="รายละเอียด"
          onChange={(e) => onCell(line.id, "name", e.target.value)}
        />
        <CellInput
          aria-label={`Additional Description ${index + 1}`}
          className="mt-1"
          value={line.desc}
          placeholder="+ รายละเอียดเพิ่มเติม"
          onChange={(e) => onCell(line.id, "desc", e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          aria-label={`Lot ${index + 1}`}
          value={line.lot}
          placeholder="-"
          onChange={(e) => onCell(line.id, "lot", e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          aria-label={`Serial ${index + 1}`}
          value={line.serial}
          placeholder="-"
          onChange={(e) => onCell(line.id, "serial", e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          aria-label={`Quantity ${index + 1}`}
          type="number"
          min={0}
          className="text-right"
          value={String(line.qty)}
          onChange={(e) => onCell(line.id, "qty", e.target.value)}
        />
        {short && (
          <p className="mt-0.5 text-right text-[11px] text-warning-text">
            คงเหลือ {fmt(stock!.available)}
          </p>
        )}
      </td>
      <td className="px-2 py-1.5 text-center text-ink-2">{line.unit || "—"}</td>
      <td className="px-2 py-1.5">
        <CellInput
          aria-label={`Unit Price ${index + 1}`}
          type="number"
          min={0}
          className="text-right"
          value={String(line.price)}
          onChange={(e) => onCell(line.id, "price", e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5">
        <CellInput
          aria-label={`Discount ${index + 1}`}
          type="number"
          min={0}
          max={100}
          className={cn("text-right", deepDiscount && "border-warning")}
          value={String(line.disc)}
          onChange={(e) => onCell(line.id, "disc", e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5 text-right tnum">{money(netPrice)}</td>
      <td className="px-2 py-1.5 text-right font-medium tnum">{money(amount)}</td>
      <td className="px-2 py-1.5 text-center">
        <IconButton
          size="sm"
          aria-label={`ลบบรรทัดที่ ${index + 1}`}
          onClick={() => onRemove(line.id)}
        >
          <Icon name="trash" size={15} />
        </IconButton>
      </td>
    </tr>
  );
}

/**
 * Item code cell with type-ahead.
 *
 * The salesperson types a code or a name and picks from the list — the whole
 * point is that choosing a product never takes them off the document.
 */
function ProductCell({
  line,
  index,
  onPick,
}: {
  line: DraftLine;
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
                <span className="text-cap text-ink-3">
                  {money0(h.price)} · คงเหลือ {fmt(h.available)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Remarks and totals ---------- */

export function RemarksPanel({
  remarks,
  internalNote,
  mode,
  onRemarks,
  onInternalNote,
}: {
  remarks: string;
  internalNote: string;
  mode: DocMode;
  onRemarks: (next: string) => void;
  onInternalNote: (next: string) => void;
}) {
  const lines = remarks.split("\n").filter((l) => l.trim());

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-card border border-line p-4">
        <DocLabel en="Remark" th="หมายเหตุ" />
        {mode === "edit" ? (
          <Textarea
            aria-label="Remarks"
            rows={5}
            className="mt-2 text-[13px]"
            value={remarks}
            onChange={(e) => onRemarks(e.target.value)}
          />
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
            {lines.map((l, i) => (
              <li key={i}>{l.replace(/^\s*\d+[.)]\s*/, "")}</li>
            ))}
          </ol>
        )}
        {mode === "edit" && (
          <p className="mt-1.5 text-cap text-ink-3">
            หมายเหตุนี้จะพิมพ์อยู่บนใบเสนอราคาที่ส่งให้ลูกค้า
          </p>
        )}
      </section>

      {mode === "edit" && (
        <section className="rounded-card border border-dashed border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <Icon name="lock" size={14} className="text-ink-3" />
            <DocLabel en="Internal Note" th="บันทึกภายใน" />
          </div>
          <Textarea
            aria-label="Internal Note"
            rows={3}
            className="mt-2 text-[13px]"
            value={internalNote}
            onChange={(e) => onInternalNote(e.target.value)}
          />
          <p className="mt-1.5 text-cap text-ink-3">
            ไม่พิมพ์ลงเอกสาร และไม่ถูกส่งให้ลูกค้า
          </p>
        </section>
      )}
    </div>
  );
}

export function TotalsPanel({
  charges,
  totals,
  taxed,
  mode,
  set,
}: {
  charges: ChargeFields;
  totals: DocTotals;
  /** Whether any line carries VAT — decides the "VAT 7%" label. */
  taxed: boolean;
  mode: DocMode;
  set: (patch: Partial<ChargeFields>) => void;
}) {
  const row = (label: string, value: number, show = true) =>
    show ? (
      <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-medium tnum">{money(value)}</span>
      </div>
    ) : null;

  const editable = (
    label: string,
    field: "headerDisc" | "freight" | "otherCharges",
    value: number,
  ) =>
    mode === "edit" ? (
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-1.5 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <CellInput
          aria-label={label}
          type="number"
          min={0}
          className="w-[120px] text-right"
          value={String(charges[field])}
          onChange={(e) => set({ [field]: e.target.value } as Partial<ChargeFields>)}
        />
      </div>
    ) : (
      row(label, value, value > 0)
    );

  return (
    <section className="overflow-hidden rounded-card border border-line">
      {row("Subtotal", totals.subtotal)}
      {row("Line Discount", totals.lineDiscount, totals.lineDiscount > 0)}
      {editable("Discount", "headerDisc", totals.headerDiscount)}
      {row("Net Amount", totals.netAmount)}
      {row(taxed ? "VAT 7%" : "VAT", totals.vat)}
      {editable("Freight", "freight", totals.freight)}
      {editable("Other Charges", "otherCharges", totals.otherCharges)}
      {row("Rounding", totals.rounding, totals.rounding !== 0)}

      <div className="flex items-center justify-between bg-primary px-4 py-2.5 text-white">
        <span className="text-[13px] font-bold uppercase tracking-[0.03em]">Grand Total</span>
        <span className="text-[17px] font-bold tnum">{money(totals.grandTotal)}</span>
      </div>
      <p className="px-4 py-1.5 text-right text-cap text-ink-2">
        ( {bahtText(totals.grandTotal)} )
      </p>
    </section>
  );
}

/* ---------- Signatures and footer ---------- */

export interface SignatureBlock {
  en: string;
  th: string;
}

/**
 * Who signs differs by document: a quotation ends with the customer, an
 * internal request ends with the approver.
 */
export function SignatureRow({ blocks }: { blocks: SignatureBlock[] }) {
  const SIGNATURES = blocks;

  return (
    <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
      {SIGNATURES.map((s) => (
        <div key={s.en} className="rounded-card border border-line px-4 pb-3 pt-4">
          <p className="text-center text-[12px] font-semibold">
            {s.en} <span className="font-normal text-ink-2">({s.th})</span>
          </p>
          <p className="mt-9 border-t border-dashed border-line-strong pt-2 text-center text-cap text-ink-3">
            Date ____ / ____ / ______
          </p>
        </div>
      ))}
    </div>
  );
}

export function DocFooter({
  createdBy,
  savedLabel,
  version = "1.0",
}: {
  createdBy: string;
  savedLabel: string;
  version?: string;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-cap text-ink-3">
      <span>
        Generated by
        <br className="max-md:hidden" />
        <span className="font-medium text-ink-2">A-Factory ERP</span>
      </span>
      <span>Template v{version}</span>
      <span>{savedLabel}</span>
      <span>Created by: {createdBy}</span>
    </footer>
  );
}

/* ---------- Validation summary ---------- */

export function IssueSummary({
  issues,
  onJump,
}: {
  issues: { field: string; message: string; blocking: boolean }[];
  onJump: (field: string) => void;
}) {
  if (!issues.length) return null;
  const blocking = issues.filter((i) => i.blocking);

  return (
    <div
      data-testid="issue-summary"
      className={cn(
        "rounded-card border px-4 py-3",
        blocking.length
          ? "border-danger/30 bg-danger-soft text-danger-text"
          : "border-warning/30 bg-warning-soft text-warning-text",
      )}
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Icon name={blocking.length ? "alert" : "info"} size={16} />
        {blocking.length
          ? `ต้องแก้ไข ${blocking.length} รายการก่อนบันทึกใบเสนอราคา`
          : `ข้อควรทราบ ${issues.length} รายการ`}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {issues.map((i, n) => (
          <li key={`${i.field}-${n}`}>
            <button
              type="button"
              onClick={() => onJump(i.field)}
              className="text-left text-cap underline-offset-2 hover:underline"
            >
              {i.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
