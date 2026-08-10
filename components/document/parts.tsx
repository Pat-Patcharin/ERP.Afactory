"use client";

import { useMemo, useState, type ReactNode } from "react";
import { COMPANY } from "@/data/admin";
import { customerOptions } from "@/lib/domain/outbound";
import {
  createDraftCustomer,
  validateDraftCustomer,
  type DraftCustomerInput,
} from "@/lib/domain/draft-customer";
import {
  DISCOUNT_THRESHOLD,
  lineAvailability,
  productSearch,
  shipToChoices,
  standardLinePrice,
  type ChargeFields,
  type DocInsight,
  type DocTotals,
  type DraftLine,
  type PartyFields,
} from "@/lib/domain/doc-draft";
import { billName, displayName } from "@/lib/domain/lines";
import { bahtText } from "@/lib/print/words";
import { AFactoryLogo, QRPlaceholder } from "@/components/print/marks";
import { fmt, money, money0, isoToDmy } from "@/lib/format";
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

/* ---------- Header ----------

   Two colours meet here and they answer to different things. The rule under
   the header and the document number are the DOCUMENT's, so they follow
   `doc-accent` and change with the family. The company name beside the logo
   is the COMPANY's and stays on the brand colour whatever is being printed —
   a purchase request is still issued by the same firm as a quotation. */

export function DocHeader({
  title,
  titleTh,
  code,
  status,
  showVerifyCode = true,
  anonymous = false,
}: {
  title: string;
  titleTh: string;
  code: string;
  status: string;
  /**
   * A letterhead that names nobody.
   *
   * A Non-VAT bill is not issued in the company's name, so the sheet must not
   * carry the company's name, address, tax ID or website — printing them on
   * a document there is no tax invoice for is exactly the thing the customer
   * asked not to happen. What is left is a plain mark, "A.FAC", which
   * identifies the sheet to whoever handles it and to nobody else.
   *
   * A flag rather than a second header component: the two differ in what the
   * left-hand block says and in nothing else, and two components would have
   * drifted the first time the right-hand block changed.
   */
  anonymous?: boolean;
  /**
   * The "scan to verify document" QR and barcode.
   *
   * On by default so every document that already showed them still does.
   * An internal document turns it off: a purchase request never leaves the
   * company, so there is nobody outside to scan it and nothing for them to
   * verify against. A verification mark that verifies nothing teaches people
   * to ignore the ones that matter.
   */
  showVerifyCode?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-doc-accent pb-5">
      {anonymous ? (
        <div className="flex min-w-0 items-center gap-3" data-testid="doc-anonymous-mark">
          {/* The whole letterhead. No name, no address, no tax ID, no site. */}
          <span className="grid h-[52px] w-[52px] place-items-center rounded-card border-2 border-ink text-[15px] font-extrabold tracking-[-0.02em]">
            A.
          </span>
          <span className="text-[26px] font-extrabold uppercase leading-none tracking-[0.08em]">
            A.FAC
          </span>
        </div>
      ) : (
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
      )}

      <div className="flex items-start gap-5">
        <div className="text-right">
          <p className="text-[26px] font-bold leading-none tracking-[-0.01em]">{title}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{titleTh}</p>
          <p className="mt-2 text-[22px] font-bold tracking-[0.01em] text-doc-accent tnum">
            {code}
          </p>
          <p className="mt-2 flex items-center justify-end gap-2 text-cap text-ink-2">
            Status :
            <Badge tone={status === "Draft" ? "neutral" : "info"}>
              {status.toUpperCase()}
            </Badge>
          </p>
        </div>

        {showVerifyCode && (
          <div className="text-center max-md:hidden" data-testid="doc-verify-code">
            <p className="mb-1 text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-ink-3">
              Scan to verify
              <br />
              document
            </p>
            {/* The QR alone. It already encodes the document number, which is
                printed beside it in 22pt — a second machine-readable copy of
                the same string is furniture. */}
            <QRPlaceholder value={code} size={17} />
          </div>
        )}
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
            <div className="flex items-center gap-1.5">
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
              {/* The customer in front of the salesperson is not always in the
                  file yet. Sending them away to have one opened first is how
                  quotations get written against "ลูกค้าใหม่ (รอเปิดรหัส)" and
                  reconciled by hand a week later. */}
              <NewCustomerButton onCreated={(label) => set({ customerPick: label })} />
            </div>
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

/**
 * Raise a customer without leaving the document.
 *
 * What comes back is a DRAFT partner: quotable immediately, and refused by
 * the sales order until somebody with the authority has checked the name and
 * the tax ID. The rep is not adding a customer to the master file — they are
 * asking for one, and the request lands on the sales admin's desk.
 */
function NewCustomerButton({ onCreated }: { onCreated: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        title="ลูกค้าใหม่ — เปิดไว้ก่อน รอฝ่ายขายยืนยัน"
      >
        <Icon name="plus" size={15} strokeWidth={2.2} />
        ลูกค้าใหม่
      </Button>
      {open && (
        <NewCustomerDialog
          onClose={() => setOpen(false)}
          onCreated={(label) => {
            onCreated(label);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function NewCustomerDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (label: string) => void;
}) {
  const [form, setForm] = useState<DraftCustomerInput>({ nameTh: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<DraftCustomerInput>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    const issues = validateDraftCustomer(form);
    setErrors(issues);
    if (issues.length) return;
    const res = createDraftCustomer(form);
    onCreated(`${res.code} - ${res.name}`);
  };

  const field = (
    label: string,
    key: keyof DraftCustomerInput,
    placeholder?: string,
    required = false,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-cap font-medium text-ink-2">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <CellInput
        aria-label={label}
        value={String(form[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value } as Partial<DraftCustomerInput>)}
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-label="ลูกค้าใหม่"
    >
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-card border border-line bg-card p-5 shadow-lg">
        <h2 className="text-[15px] font-bold">ลูกค้าใหม่</h2>
        <p className="mt-1 text-cap text-ink-2">
          กรอกเท่าที่ใบเสนอราคาต้องใช้ · บันทึกแล้วจะยังไม่เข้า Master Data
          จนกว่าฝ่ายขายจะยืนยัน — เสนอราคาได้ทันที แต่ยังเปิดใบสั่งขายไม่ได้
        </p>

        {errors.length > 0 && (
          <ul className="mt-3 rounded-card border border-danger bg-danger-soft px-3 py-2 text-cap text-danger-text">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
          <div className="col-span-2 max-[520px]:col-span-1">
            {field("ชื่อลูกค้า (ชื่อนิติบุคคล)", "nameTh", "บริษัท ... จำกัด", true)}
          </div>
          {field("ชื่อการค้า", "trade", "ชื่อที่ใช้เรียกกัน")}
          {field("เลขผู้เสียภาษี", "taxId", "0105558xxxxxx")}
          {field("ผู้ติดต่อ", "contactName", "ชื่อผู้ติดต่อ")}
          {field("เบอร์โทร", "phone", "02-xxx-xxxx")}
          {field("อีเมล", "email", "name@company.co.th")}
          <div className="col-span-2 max-[520px]:col-span-1">
            {field("ที่อยู่ออกบิล", "addressLine", "เลขที่ ถนน แขวง")}
          </div>
          {field("เขต/อำเภอ", "district")}
          {field("จังหวัด", "province")}
          {field("รหัสไปรษณีย์", "postcode", "10110")}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>
            บันทึกและใช้ลูกค้ารายนี้
          </Button>
        </div>
      </div>
    </div>
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

/* ============================================================
   REQUESTER / DESTINATION — the inbound pair

   These sit where Bill To and Ship To sit on a sales document,
   and they are deliberately NOT those components with different
   labels.

   A requester is not a customer. Nobody is billed, no credit is
   checked, no tax ID applies, and the "address" is a warehouse
   the company already owns. Sharing `PartyFields` between them
   would tie a purchase request to every future change made for
   the sell side — and the first field one of them needs that the
   other does not would have to be added to both.

   They look alike today. That is not a reason to make them the
   same thing.
   ============================================================ */

export interface RequesterFields {
  dept: string;
  requester: string;
  needBy: string;
}

export function RequesterPanel({
  draft,
  mode,
  set,
  invalid,
  departments,
  requesters,
}: {
  draft: RequesterFields;
  mode: DocMode;
  set: (patch: Partial<RequesterFields>) => void;
  invalid: Set<string>;
  departments: readonly string[];
  requesters: readonly string[];
}) {
  return (
    <section className="rounded-card border border-line p-4">
      <DocLabel en="Requested By" th="ผู้ขอ" />
      <div className="mt-2">
        <DocRow label="Department" required field="dept" invalid={invalid.has("dept")}>
          {mode === "edit" ? (
            <Select
              aria-label="Department"
              className="h-9"
              value={draft.dept}
              onChange={(e) => set({ dept: e.target.value })}
            >
              <option value="">— เลือกแผนก —</option>
              {departments.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <DocValue value={draft.dept} />
          )}
        </DocRow>
        <DocRow label="Requester" required field="requester" invalid={invalid.has("requester")}>
          {mode === "edit" ? (
            <Select
              aria-label="Requester"
              className="h-9"
              value={draft.requester}
              onChange={(e) => set({ requester: e.target.value })}
            >
              <option value="">— เลือกผู้ขอ —</option>
              {requesters.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <DocValue value={draft.requester} />
          )}
        </DocRow>
        {/* The date the goods are actually wanted, which is what a buyer
            plans the order around — not the date the request was raised. */}
        <DocRow label="Needed By" required field="needBy" invalid={invalid.has("needBy")}>
          {mode === "edit" ? (
            <Input
              aria-label="Needed By"
              type="date"
              className="h-9"
              value={draft.needBy}
              onChange={(e) => set({ needBy: e.target.value })}
            />
          ) : (
            <DocValue value={isoToDmy(draft.needBy)} />
          )}
        </DocRow>
      </div>
    </section>
  );
}

export interface DestinationFields {
  warehouse: string;
  supplier: string;
}

export function DestinationPanel({
  draft,
  mode,
  set,
  invalid,
  warehouses,
  suppliers,
}: {
  draft: DestinationFields;
  mode: DocMode;
  set: (patch: Partial<DestinationFields>) => void;
  invalid: Set<string>;
  warehouses: readonly string[];
  suppliers: readonly string[];
}) {
  return (
    <section className="rounded-card border border-line p-4">
      <DocLabel en="Deliver To" th="ปลายทาง" />
      <div className="mt-2">
        <DocRow label="Warehouse" required field="warehouse" invalid={invalid.has("warehouse")}>
          {mode === "edit" ? (
            <Select
              aria-label="Deliver To Warehouse"
              className="h-9"
              value={draft.warehouse}
              onChange={(e) => set({ warehouse: e.target.value })}
            >
              <option value="">— เลือกคลัง —</option>
              {warehouses.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <DocValue value={draft.warehouse} />
          )}
        </DocRow>
        {/* A suggestion, not a commitment. Purchasing chooses the supplier on
            the purchase order; the requester only says who they had in mind,
            which is why this is the one field here that is not required. */}
        <DocRow label="Suggested Supplier">
          {mode === "edit" ? (
            <Select
              aria-label="Suggested Supplier"
              className="h-9"
              value={draft.supplier}
              onChange={(e) => set({ supplier: e.target.value })}
            >
              <option value="">— ยังไม่ระบุ —</option>
              {suppliers.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <DocValue value={draft.supplier} />
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

/**
 * How long the price stands, as chips rather than a date.
 *
 * Four options fit side by side, so all of them are visible at once and
 * choosing takes one click — a dropdown would hide three of the four behind
 * an interaction to save no space. The resulting date is shown underneath
 * because the customer will read it on the sheet, but nobody has to type it.
 *
 * In read mode this collapses to the sentence that actually prints.
 */
export function ValidityChips({
  days,
  until,
  options,
  mode,
  onChange,
}: {
  days: number;
  until: string;
  options: readonly number[];
  mode: DocMode;
  onChange: (days: number) => void;
}) {
  if (mode !== "edit") {
    return (
      <p className="mt-2 text-cap text-ink-2" data-testid="validity-read">
        ยืนราคา <span className="font-semibold text-ink">{days}</span> วัน
        {until ? ` — ถึง ${until}` : ""}
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="validity-chips">
      <span className="text-cap text-ink-2">ยืนราคา</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-label={`ยืนราคา ${o} วัน`}
          aria-pressed={o === days}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-pill border px-3 py-1 text-cap font-medium transition-colors duration-fast",
            o === days
              ? "border-doc-accent bg-doc-accent text-white"
              : "border-line bg-card text-ink-2 hover:border-doc-accent hover:text-ink",
          )}
        >
          {o} วัน
        </button>
      ))}
      {until && <span className="text-cap text-ink-3">ถึง {until}</span>}
    </div>
  );
}

/** Controls a document builds its metadata rows from. */
/**
 * The two controls every document's metadata panel is built from, bound to
 * one draft and one setter.
 *
 * Each editor was declaring the same pair of closures before its own row
 * list; they are here so a third document does not declare them a third time.
 * Field names stay `keyof TDraft`, so a typo is still a compile error rather
 * than a silently empty box.
 */
export function metaControls<TDraft>(
  draft: TDraft,
  set: (patch: Partial<TDraft>) => void,
) {
  const txt = (field: keyof TDraft & string, label: string, type = "text") => (
    <MetaText
      label={label}
      type={type}
      value={String(draft[field] ?? "")}
      onChange={(v) => set({ [field]: v } as Partial<TDraft>)}
    />
  );

  const sel = (
    field: keyof TDraft & string,
    label: string,
    options: readonly string[],
    placeholder?: string,
  ) => (
    <MetaSelect
      label={label}
      value={String(draft[field] ?? "")}
      options={options}
      placeholder={placeholder}
      onChange={(v) => set({ [field]: v } as Partial<TDraft>)}
    />
  );

  return { txt, sel };
}

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

/**
 * Which price tier the customer is on, and anything odd about how it was
 * decided. It sits on the document rather than only on the partner record
 * because the moment the tier matters is the moment a price is quoted, and
 * the person who needs to see it is the one typing the document.
 */
export function PriceTierNotice({ insight }: { insight: DocInsight }) {
  if (!insight.found || insight.tierNotices.length === 0) return null;

  return (
    <div data-testid="price-tier-notice" className="flex flex-col gap-2">
      {insight.tierNotices.map((n) => (
        <div
          key={n.kind}
          className={cn(
            "rounded-card border px-4 py-3",
            n.tone === "danger"
              ? "border-danger/40 bg-danger-soft"
              : "border-warning/40 bg-warning-soft",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-2 text-[13px] font-semibold",
              n.tone === "danger" ? "text-danger" : "text-warning-text",
            )}
          >
            <Icon name={n.tone === "danger" ? "alert" : "info"} size={16} />
            {n.title}
          </p>
          <p className="mt-1.5 text-cap leading-relaxed text-ink-2">{n.message}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Item table ---------- */

/* The item table's head band. Tokenised so an inbound document can carry its
   own, and defaulted to the slate it has always been so nothing moves today. */
const HEAD =
  "bg-doc-head text-doc-head-text text-[11px] font-semibold uppercase tracking-[0.03em]";

/**
 * Which columns and which per-line controls a document's grid carries.
 *
 * A quotation is an offer: nothing has been picked, so there is no lot and no
 * serial to record, and it names the product rather than dictating a unit. A
 * sales request still shows all three. Every flag defaults to what the grid
 * has always done, so a caller that passes no layout is unchanged.
 */
export interface ItemTableLayout {
  lot?: boolean;
  serial?: boolean;
  uom?: boolean;
  /** Per-line naming and repeatable detail rows, in a strip under the row. */
  naming?: boolean;
  /** This customer's catalogue price, under the unit price. */
  standardPrice?: boolean;
  /**
   * What the warehouse has, under the quantity, on every line rather than
   * only on the ones that are short.
   *
   * Off leaves the older behaviour untouched: a short line still warns. On,
   * the number is there before the salesperson types a quantity, which is the
   * point — it is an aid while the document is being written. Edit mode only,
   * never in read mode: a figure that was true this afternoon has no business
   * on the sheet the customer keeps.
   */
  stock?: boolean;
}

const DEFAULT_LAYOUT: Required<ItemTableLayout> = {
  lot: true,
  serial: true,
  uom: true,
  naming: false,
  standardPrice: false,
  stock: false,
};

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
  layout,
  customerPick = "",
  onPatch,
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
  layout?: ItemTableLayout;
  /** Whose prices these are — decides the standard price shown per line. */
  customerPick?: string;
  /** Writes a line's naming and detail fields. Required by `layout.naming`. */
  onPatch?: (id: string, patch: Partial<DraftLine>) => void;
}) {
  const rows = mode === "read" ? items.filter((l) => l.code) : items;
  const L = { ...DEFAULT_LAYOUT, ...layout };
  const cols =
    9 + (mode === "edit" ? 2 : 0) + (L.lot ? 1 : 0) + (L.serial ? 1 : 0) + (L.uom ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[900px] border-collapse text-[13px]">
        <thead>
          <tr className={HEAD}>
            {mode === "edit" && (
              <th className="w-9 px-2 py-2.5">
                {/* Wherever there is a column of ticks there is a tick for
                    the column. Half-ticked when some rows are chosen, so the
                    header says which of the three states the table is in
                    rather than only "all" or "none". */}
                <Checkbox
                  aria-label="เลือกทุกบรรทัด"
                  checked={rows.length > 0 && rows.every((l) => selected.has(l.id))}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        rows.some((l) => selected.has(l.id)) &&
                        !rows.every((l) => selected.has(l.id));
                  }}
                  onChange={(e) => rows.forEach((l) => onSelect(l.id, e.target.checked))}
                />
              </th>
            )}
            <th className="w-11 px-2 py-2.5 text-center">No.</th>
            <th className="w-[150px] px-2 py-2.5 text-left">Item Code</th>
            <th className="px-2 py-2.5 text-left">Description</th>
            {L.lot && <th className="w-[110px] px-2 py-2.5 text-left">Lot No.</th>}
            {L.serial && <th className="w-[120px] px-2 py-2.5 text-left">Serial No.</th>}
            <th className="w-[86px] px-2 py-2.5 text-right">Quantity</th>
            {L.uom && <th className="w-[72px] px-2 py-2.5 text-center">UOM</th>}
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
              layout={L}
              cols={cols}
              customerPick={customerPick}
              onPatch={onPatch}
            />
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={cols} className="px-3 py-8 text-center text-ink-3">
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
  layout,
  cols,
  customerPick,
  onPatch,
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
  layout: Required<ItemTableLayout>;
  cols: number;
  customerPick: string;
  onPatch?: (id: string, patch: Partial<DraftLine>) => void;
}) {
  const base = num(line.qty) * num(line.price);
  const amount = base - base * (num(line.disc) / 100);
  const netPrice = num(line.price) * (1 - num(line.disc) / 100);
  const stock = line.code ? lineAvailability(line.code) : null;
  const short = stock?.found && stock.available < num(line.qty);
  const deepDiscount = num(line.disc) > DISCOUNT_THRESHOLD;

  /* What this customer is supposed to pay, so the salesperson can see the
     moment they have moved off it. Recomputed only when the line changes
     product or the document changes customer. */
  const standard = useMemo(
    () => (layout.standardPrice ? standardLinePrice(customerPick, line.code) : null),
    [customerPick, layout.standardPrice, line.code],
  );
  const offStandard = standard !== null && num(line.price) > 0 && num(line.price) !== standard.price;

  /* The rows the salesperson typed. A blank one is kept while it is being
     filled in; joinDetails drops it on the way to the record. */
  const details = layout.naming ? line.details : [];

  if (mode === "read") {
    /* Read mode is the document as it will be sent, so the line reads under
       whichever name is going out — not the one behind it. */
    const shown = billName(line);
    const extra = line.showOnBill ? [line.desc, ...details].filter(Boolean) : [];
    return (
      <tr className="border-b border-line align-top last:border-b-0">
        <td className="px-2 py-2.5 text-center tnum">{index + 1}</td>
        <td className="px-2 py-2.5">
          <p className="font-medium">{line.code}</p>
          <p className="text-cap text-ink-2">{shown}</p>
        </td>
        <td className="px-2 py-2.5">
          {extra.map((d, i) => (
            <p key={i} className={i ? "text-cap text-ink-2" : undefined}>
              {d}
            </p>
          ))}
          {!extra.length && !line.note && <span className="text-ink-3">—</span>}
          {!layout.naming && line.note && <p className="text-cap text-ink-2">{line.note}</p>}
        </td>
        {layout.lot && <td className="px-2 py-2.5 tnum">{line.lot || "-"}</td>}
        {layout.serial && <td className="px-2 py-2.5 tnum">{line.serial || "-"}</td>}
        <td className="px-2 py-2.5 text-right tnum">{fmt(num(line.qty))}</td>
        {layout.uom && <td className="px-2 py-2.5 text-center">{line.unit}</td>}
        <td className="px-2 py-2.5 text-right tnum">{money(num(line.price))}</td>
        <td className="px-2 py-2.5 text-right tnum">{money(num(line.disc))}</td>
        <td className="px-2 py-2.5 text-right tnum">{money(netPrice)}</td>
        <td className="px-2 py-2.5 text-right font-medium tnum">{money(amount)}</td>
      </tr>
    );
  }

  return (
    <>
      <tr
        id={anchorId(`item-${line.id}`)}
        className={cn(
          "border-b border-line last:border-b-0",
          invalid && "bg-danger-soft",
          /* The naming strip belongs to this row, so the border goes under it. */
          layout.naming && line.code && "border-b-0",
        )}
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
          {layout.naming ? (
            /* The catalogue name is the product master's, not a field. What
               the salesperson may write instead is in the strip below — see
               LineNaming, and the code has to be picked before it opens. */
            line.code ? (
              <>
                <p className="text-[13px] leading-snug">{displayName(line)}</p>
                {line.customName.trim() !== "" && (
                  <p className="text-cap text-ink-3">ชื่อในระบบ: {line.name}</p>
                )}
              </>
            ) : (
              <span className="text-cap text-ink-3">เลือกรหัสสินค้าก่อน</span>
            )
          ) : (
            <>
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
            </>
          )}
        </td>
        {layout.lot && (
          <td className="px-2 py-1.5">
            <CellInput
              aria-label={`Lot ${index + 1}`}
              value={line.lot}
              placeholder="-"
              onChange={(e) => onCell(line.id, "lot", e.target.value)}
            />
          </td>
        )}
        {layout.serial && (
          <td className="px-2 py-1.5">
            <CellInput
              aria-label={`Serial ${index + 1}`}
              value={line.serial}
              placeholder="-"
              onChange={(e) => onCell(line.id, "serial", e.target.value)}
            />
          </td>
        )}
        <td className="px-2 py-1.5">
          <CellInput
            aria-label={`Quantity ${index + 1}`}
            type="number"
            min={0}
            className="text-right"
            value={String(line.qty)}
            onChange={(e) => onCell(line.id, "qty", e.target.value)}
          />
          {/* On when the layout asks for it, and — as before — whenever the
              line is short. The colour still carries the alarm, so turning it
              on adds a figure without turning every row into a warning. */}
          {(layout.stock ? stock?.found : short) && (
            <p
              className={cn(
                "mt-0.5 text-right text-[11px]",
                short ? "text-warning-text" : "text-ink-3",
              )}
            >
              คงเหลือ {fmt(stock!.available)}
            </p>
          )}
        </td>
        {layout.uom && (
          <td className="px-2 py-1.5 text-center text-ink-2">{line.unit || "—"}</td>
        )}
        <td className="px-2 py-1.5">
          <CellInput
            aria-label={`Unit Price ${index + 1}`}
            type="number"
            min={0}
            className="text-right"
            value={String(line.price)}
            onChange={(e) => onCell(line.id, "price", e.target.value)}
          />
          {standard && (
            <p
              data-testid={`standard-price-${index + 1}`}
              className={cn(
                "mt-0.5 text-right text-[11px]",
                offStandard ? "text-warning-text" : "text-ink-3",
              )}
              title={standard.label}
            >
              {offStandard ? (
                <button
                  type="button"
                  aria-label={`ใช้ราคามาตรฐาน บรรทัดที่ ${index + 1}`}
                  className="underline-offset-2 hover:underline"
                  onClick={() => onCell(line.id, "price", String(standard.price))}
                >
                  ราคามาตรฐาน {money(standard.price)}
                </button>
              ) : (
                <>ราคามาตรฐาน {money(standard.price)}</>
              )}
            </p>
          )}
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

      {layout.naming && line.code && onPatch && (
        <tr className={cn("border-b border-line last:border-b-0", invalid && "bg-danger-soft")}>
          <td />
          <td colSpan={cols - 1} className="px-2 pb-2">
            <LineNaming line={line} index={index} details={details} onPatch={onPatch} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * What the customer will read on this line.
 *
 * Two separate things sit here because they answer the same question. The
 * salesperson may call the item whatever the customer calls it — a name that
 * does not have to match the catalogue — and may add as many detail lines
 * under it as the offer needs. The tick decides which of the two names goes
 * out; the catalogue name is what prints when it is off, and the product code
 * prints either way, so a renamed line is still traceable to the item.
 *
 * It only appears once a product has been chosen: a name with no code behind
 * it is not a line anybody can quote.
 */
function LineNaming({
  line,
  index,
  details,
  onPatch,
}: {
  line: DraftLine;
  index: number;
  details: string[];
  onPatch: (id: string, patch: Partial<DraftLine>) => void;
}) {
  const n = index + 1;
  const setDetails = (next: string[]) => onPatch(line.id, { details: next });
  const custom = line.customName.trim();
  const printed = billName(line);

  return (
    <div className="flex flex-col gap-2 rounded-btn border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-[92px] flex-shrink-0 text-cap text-ink-2">ชื่อที่ใช้เอง</span>
        <CellInput
          aria-label={`Custom Name ${n}`}
          className="min-w-[220px] max-w-[420px] flex-1"
          value={line.customName}
          placeholder={line.name}
          onChange={(e) => onPatch(line.id, { customName: e.target.value })}
        />
        <label className="flex cursor-pointer items-center gap-2 text-cap text-ink-2">
          <Checkbox
            aria-label={`แสดงชื่อที่ใช้เองในใบเสนอราคา บรรทัดที่ ${n}`}
            checked={line.showOnBill}
            onChange={(e) => onPatch(line.id, { showOnBill: e.target.checked })}
          />
          แสดงชื่อนี้ในใบเสนอราคา
        </label>
        <span data-testid={`printed-name-${n}`} className="text-cap text-ink-3">
          จะพิมพ์ว่า <span className="font-medium text-ink-2">{printed}</span>
          {!line.showOnBill && custom !== "" && " (ชื่อตามระบบ)"}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <span className="mt-[9px] w-[92px] flex-shrink-0 text-cap text-ink-2">
          รายละเอียด
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {details.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 flex-shrink-0 text-right text-cap text-ink-3 tnum">
                {i + 1}.
              </span>
              <CellInput
                aria-label={`Detail ${n}.${i + 1}`}
                className="max-w-[520px]"
                value={d}
                placeholder="เช่น สี ขนาด หรือกำหนดส่งของบรรทัดนี้"
                onChange={(e) =>
                  setDetails(details.map((v, k) => (k === i ? e.target.value : v)))
                }
              />
              <IconButton
                size="sm"
                aria-label={`ลบรายละเอียดที่ ${i + 1} ของบรรทัดที่ ${n}`}
                onClick={() => setDetails(details.filter((_, k) => k !== i))}
              >
                <Icon name="trash" size={14} />
              </IconButton>
            </div>
          ))}
          <div>
            <button
              type="button"
              onClick={() => setDetails([...details, ""])}
              className="inline-flex items-center gap-1.5 text-cap font-medium text-info hover:underline"
            >
              <Icon name="plus" size={14} strokeWidth={2} />
              เพิ่มรายละเอียด
            </button>
            {!line.showOnBill && details.length > 0 && (
              <span className="ml-3 text-cap text-ink-3">
                รายละเอียดจะไม่พิมพ์ เมื่อไม่ได้ติ๊กแสดงชื่อนี้
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
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

      <div className="flex items-center justify-between bg-doc-accent px-4 py-2.5 text-white">
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
  /** Filled once somebody has signed — see SignatureRow. */
  signedBy?: string;
  signedRole?: string;
  signedAt?: string;
}

/**
 * Who signs differs by document: a quotation ends with the customer, an
 * internal request ends with the approver.
 */
/**
 * The block a signature goes in — and, once it has been signed, the signature.
 *
 * `signedBy` fills the line that is otherwise left blank for a pen. It is a
 * script-font rendering of the approver's name rather than an uploaded image:
 * a MOCK of a signature, which is what a document that has been approved in
 * the system actually has — a name, a role and a moment, not a scan.
 */
export function SignatureRow({ blocks }: { blocks: SignatureBlock[] }) {
  return (
    <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
      {blocks.map((s) => (
        <div key={s.en} className="rounded-card border border-line px-4 pb-3 pt-4">
          <p className="text-center text-[12px] font-semibold">
            {s.en} <span className="font-normal text-ink-2">({s.th})</span>
          </p>
          {s.signedBy ? (
            <p
              className="mt-2 text-center text-[26px] leading-[38px] text-primary"
              style={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive' }}
            >
              {s.signedBy}
            </p>
          ) : (
            <p className="mt-9" />
          )}
          <p className="border-t border-dashed border-line-strong pt-2 text-center text-cap text-ink-3">
            {s.signedBy ? (
              <>
                {s.signedRole || "—"}
                <br />
                {s.signedAt || ""}
              </>
            ) : (
              "Date ____ / ____ / ______"
            )}
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
