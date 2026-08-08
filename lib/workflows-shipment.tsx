"use client";

import { actingUserName } from "./domain/admin";
import { useState, type ReactNode } from "react";
import { notify } from "./domain/notify";
import { SALES_ORDERS, SALES_REQUESTS } from "./domain/outbound";
import { DASH, fmt, stamp, isoToDmy, today, dmyToIso } from "./format";
import { cn } from "./utils";
import { Icon } from "./icons";
import type { ActionCtx } from "./types";
import {
  SHP_DELIVERY_RESULTS,
  SHP_EXCEPTION_TYPES,
  SHP_RESCHEDULE_REASONS,
  SHP_RESPONSIBLE,
  SHP_SEVERITY,
  SHP_TRACK_STATUS,
  SHP_CANCEL_REASONS,
} from "@/data/shipments";
import {
  SHIPMENTS,
  blockingIssues,
  decorateShipments,
  dispatchReadiness,
  type ShpRow,
} from "./domain/shipment";

/* ============================================================
   SHIPMENT WORKFLOWS

   Draft → Ready to Dispatch → Dispatched → In Transit
        → Out for Delivery → Delivered / Partially Delivered
        → Delivery Failed → Rescheduled / Returned

   Nothing here writes stock or money. Dispatch locks quantities;
   tracking stays open afterwards.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();
const num = (v: unknown) => Number(v) || 0;

function log(s: ShpRow, t: string, d: string, kind = "primary", u = USER()) {
  (s.history ??= []).unshift({ t, d, u, when: stamp(), kind });
}

function audit(s: ShpRow, event: string, field: string, from: string, to: string, kind = "primary") {
  (s.audit ??= []).unshift({ event, user: USER(), when: stamp(), field, from, to, kind });
}

function track(s: ShpRow, status: string, location: string, remark = "", by = USER()) {
  (s.tracking ??= []).unshift({ status, when: stamp(), location, by, remark });
}

function commit(
  ctx: ActionCtx,
  title: string,
  message: string,
  tone: "success" | "info" | "danger" | "warning" = "success",
) {
  decorateShipments();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

/**
 * Whoever raised the paperwork this parcel came from.
 *
 * Walks shipment → sales order → sales request the same way the outbound
 * workflows do, because that is where the person's name actually is: a
 * shipment's `salesRep` is a display string off the order, not the account
 * that keyed the document. Falls back through the chain rather than giving
 * up, and sends nothing at all when no name can be found — an item addressed
 * to nobody is worse than none.
 */
function notifyShipmentOwner(s: ShpRow, n: { title: string; body: string }) {
  const so = SALES_ORDERS.find((x) => x.code === s.soRef);
  const sr = so?.srRef ? SALES_REQUESTS.find((r) => r.code === so.srRef) : null;
  const owner = sr?.createdBy || so?.createdBy || "";
  if (!owner) return;

  notify({
    kind: "converted",
    docType: "shipment",
    docCode: s.code,
    title: n.title,
    body: n.body,
    toUser: owner,
  });
}

/* ============================================================
   Small stateful modal bodies
   ============================================================ */

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-cap font-medium text-ink-2">
        {label}
        {required && <span className="font-semibold text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

const CONTROL =
  "w-full rounded-input border border-line bg-card px-3 py-2 text-body text-ink " +
  "placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/[.12]";

function Picker({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className={cn(CONTROL, "cursor-pointer")} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— เลือก —</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Self-contained picker for modals that only need one value back. */
function ReasonField({
  label,
  options,
  onChange,
}: {
  label: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Field label={label} required>
      <Picker
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </Field>
  );
}

/* ---------- Mark ready ---------- */

export function shpMarkReady(s: ShpRow, ctx: ActionCtx) {
  if (!["Draft", "Rescheduled"].includes(s.status)) {
    ctx.toast("ทำไม่ได้", `${s.code} อยู่ในสถานะ ${s.status}`, "warning");
    return;
  }
  const blocking = blockingIssues(dispatchReadiness(s));
  if (blocking.length) {
    ctx.toast(
      "ยังพร้อมส่งไม่ได้",
      `เหลือ ${blocking.length} เรื่องที่ต้องแก้ — ${blocking[0].label}`,
      "warning",
    );
    return;
  }

  const from = s.status;
  s.status = "Ready to Dispatch";
  s.deliveryStatus = "Ready";
  s.updated = stamp();
  s.updatedBy = USER();
  log(s, "Marked ready", "จัดกล่องและตรวจสอบครบ พร้อมนำขึ้นรถ", "info");
  track(s, "Ready to Dispatch", s.warehouse, "Packed and ready");
  audit(s, "Status changed", "status", from, "Ready to Dispatch", "info");
  commit(ctx, "พร้อมนำส่งแล้ว", `${s.code} — รอ Dispatch`);
}

/* ---------- Dispatch confirmation ---------- */

const DISPATCH_CHECKS = [
  "Packages verified",
  "Items verified",
  "Carrier verified",
  "Delivery address verified",
  "Documents attached",
];

function DispatchBody({ s, onChange }: { s: ShpRow; onChange: (ok: boolean) => void }) {
  const [checked, setChecked] = useState<boolean[]>(DISPATCH_CHECKS.map(() => false));
  const issues = dispatchReadiness(s);
  const blocking = blockingIssues(issues);

  const toggle = (i: number) => {
    const next = checked.map((c, n) => (n === i ? !c : c));
    setChecked(next);
    onChange(next.every(Boolean) && blocking.length === 0);
  };

  const rows: [string, ReactNode][] = [
    ["Shipment Number", s.code],
    ["Customer", s.customer],
    ["Delivery Order", s.doRef || "—"],
    ["Carrier", `${s.carrier} · ${s.carrierService}`],
    ["Driver", s.driver || "—"],
    ["Vehicle", s.vehicleNo || "—"],
    ["Total Packages", fmt(s.packageCount)],
    ["Total Quantity", `${fmt(s.totalQty)} หน่วย`],
    ["Dispatch Date & Time", stamp()],
    ["Expected Delivery", s.expectedDelivery],
  ];

  return (
    <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
      <div className="flex flex-col">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-4 border-b border-line py-[7px] last:border-b-0">
            <span className="flex-shrink-0 text-cap text-ink-2">{label}</span>
            <span className="ml-auto text-right text-[13px] font-medium tnum">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-btn border border-line bg-surface p-4">
        {blocking.length > 0 && (
          <div className="mb-2 rounded-btn border border-[#FECACA] bg-danger-soft p-3">
            <p className="mb-1 text-[13px] font-semibold text-danger-text">
              ยังนำส่งไม่ได้ ({blocking.length})
            </p>
            <ul className="flex flex-col gap-0.5 text-cap text-danger-text">
              {blocking.map((b) => (
                <li key={b.label}>• {b.label}</li>
              ))}
            </ul>
          </div>
        )}
        {DISPATCH_CHECKS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => toggle(i)}
            className="flex items-center gap-2.5 rounded-sm py-1.5 text-left text-[13px] transition-colors hover:bg-card"
          >
            <span
              className={cn(
                "grid h-[17px] w-[17px] flex-shrink-0 place-items-center rounded-[5px] border-[1.5px]",
                checked[i] ? "border-primary bg-primary text-white" : "border-line-strong bg-card",
              )}
            >
              {checked[i] && <Icon name="check" size={11} strokeWidth={3} />}
            </span>
            {c}
          </button>
        ))}
        <p className="mt-2 text-cap leading-relaxed text-ink-3">
          เมื่อ Dispatch แล้ว จำนวนสินค้าและกล่องจะถูกล็อก — เพิ่มเหตุการณ์ติดตามได้ต่อ
        </p>
      </div>
    </div>
  );
}

export function shpDispatch(s: ShpRow, ctx: ActionCtx) {
  if (s.status !== "Ready to Dispatch") {
    ctx.toast(
      "Dispatch ไม่ได้",
      `${s.code} อยู่ในสถานะ ${s.status} — ต้องเป็น Ready to Dispatch ก่อน`,
      "warning",
    );
    return;
  }

  let ready = false;

  ctx.formModal({
    title: "Confirm Dispatch",
    width: "wide",
    confirmText: "Dispatch Shipment",
    body: () => <DispatchBody s={s} onChange={(v) => (ready = v)} />,
    onConfirm: () => {
      if (!ready) {
        ctx.toast(
          "ยังยืนยันไม่ครบ",
          "ต้องแก้ปัญหาที่ค้างและติ๊กยืนยันครบทุกข้อก่อน Dispatch",
          "warning",
        );
        return false;
      }
      const now = stamp();
      s.status = "Dispatched";
      s.deliveryStatus = "Dispatched";
      s.dispatchDate = now;
      if (!s.pickupTime) s.pickupTime = now;
      (s.packages ?? []).forEach((p) => {
        if (p.status !== "Damaged") p.status = "Loaded";
      });
      s.updated = now;
      s.updatedBy = USER();
      log(s, "Dispatched", `ออกจากคลัง ${s.packageCount} กล่อง · ${fmt(s.totalQty)} หน่วย`);
      track(s, "Dispatched", s.warehouse, `Handed over to ${s.carrier}`);
      audit(s, "Status changed", "status", "Ready to Dispatch", "Dispatched");
      commit(ctx, "Dispatch แล้ว", `${s.code} — ล็อกจำนวนสินค้าเรียบร้อย`);
    },
  });
}

/* ============================================================
   THE CARRIER'S TRACKING NUMBER — ENTERED IN ONE PLACE

   Here, on the shipment, because this is where the parcel is.
   The invoice shows the number by following its `shipmentRef`;
   it does not keep a copy. See the note in domain/shipment.ts
   for why a second copy is worse than none.

   Entering it is also the moment the salesperson can finally
   answer "where is my customer's order", so the send is wired
   to this transition rather than to a button somebody may or
   may not press afterwards.
   ============================================================ */

export function shpSetTrackingNo(s: ShpRow, ctx: ActionCtx) {
  if (["Draft", "Cancelled"].includes(s.status)) {
    ctx.toast(
      "ใส่เลข tracking ไม่ได้",
      `${s.code} อยู่ในสถานะ ${s.status} — ต้อง Dispatch ก่อนจึงจะมีเลขพัสดุ`,
      "warning",
    );
    return;
  }

  let v = { trackingNo: s.trackingNo, carrier: s.carrier, service: s.carrierService };

  ctx.formModal({
    title: s.trackingNo ? "แก้เลขพัสดุ" : "ใส่เลขพัสดุ",
    confirmText: "บันทึกเลขพัสดุ",
    body: () => <TrackingNoBody s={s} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const trackingNo = v.trackingNo.trim();
      if (!trackingNo) {
        ctx.toast("ยังไม่ได้กรอก", "ต้องระบุเลขพัสดุจากผู้ขนส่ง", "warning");
        return false;
      }
      /* One number belongs to one parcel. Reusing it across two shipments
         makes the trace back from it ambiguous, which is the one thing this
         number exists to prevent. */
      const clash = SHIPMENTS.find(
        (x) => x.code !== s.code && (x.trackingNo ?? "").trim() === trackingNo,
      );
      if (clash) {
        ctx.toast("เลขพัสดุซ้ำ", `${trackingNo} ถูกใช้กับ ${clash.code} แล้ว`, "danger");
        return false;
      }

      const from = s.trackingNo;
      s.trackingNo = trackingNo;
      if (v.carrier.trim()) s.carrier = v.carrier.trim();
      if (v.service.trim()) s.carrierService = v.service.trim();
      s.updated = stamp();
      s.updatedBy = USER();
      log(s, from ? "Tracking number updated" : "Tracking number added", `${s.carrier} — ${trackingNo}`);
      audit(s, from ? "Tracking updated" : "Tracking added", "trackingNo", from || DASH, trackingNo, "info");

      /* Back to whoever raised the paperwork, by name — the person a customer
         rings. `notifyOwner` walks the chain the same way the sales order
         notifications do. */
      notifyShipmentOwner(s, {
        title: `${s.code} ของออกแล้ว`,
        body: `${s.carrier}${s.carrierService ? ` (${s.carrierService})` : ""} — เลขพัสดุ ${trackingNo}${
          s.expectedDelivery ? ` · คาดถึง ${s.expectedDelivery}` : ""
        }`,
      });

      commit(ctx, "บันทึกเลขพัสดุแล้ว", `${s.code} — ${trackingNo}`);
    },
  });
}

function TrackingNoBody({
  s,
  onChange,
}: {
  s: ShpRow;
  onChange: (v: { trackingNo: string; carrier: string; service: string }) => void;
}) {
  const [v, setV] = useState({
    trackingNo: s.trackingNo,
    carrier: s.carrier,
    service: s.carrierService,
  });
  const put = (patch: Partial<typeof v>) => {
    const next = { ...v, ...patch };
    setV(next);
    onChange(next);
  };

  const field = (label: string, value: string, on: (x: string) => void, ph: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-cap font-medium text-ink-2">{label}</span>
      <input
        aria-label={label}
        value={value}
        placeholder={ph}
        onChange={(e) => on(e.target.value)}
        className="rounded-btn border border-line px-3 py-2 text-[13px]"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-cap text-ink-2">
        เลขพัสดุเก็บที่รอบขนส่งที่เดียว — ใบกำกับจะอ่านจากที่นี่ไปแสดง ไม่ได้เก็บซ้ำ
      </p>
      {field("ผู้ขนส่ง", v.carrier, (x) => put({ carrier: x }), "เช่น Kerry Express")}
      {field("บริการ", v.service, (x) => put({ service: x }), "เช่น Next Day")}
      {field("เลขพัสดุ", v.trackingNo, (x) => put({ trackingNo: x }), "เช่น KEX1234567890")}
    </div>
  );
}

/* ---------- Tracking update ---------- */

function TrackingBody({
  onChange,
}: {
  onChange: (v: { status: string; location: string; remark: string }) => void;
}) {
  const [v, setV] = useState({ status: "", location: "", remark: "" });
  const put = (next: typeof v) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="Status" required>
          <Picker options={SHP_TRACK_STATUS} value={v.status} onChange={(x) => put({ ...v, status: x })} />
        </Field>
        <Field label="Date and Time">
          <input className={CONTROL} value={stamp()} readOnly />
        </Field>
      </div>
      <Field label="Location" required>
        <input
          className={CONTROL}
          placeholder="เช่น Bangkok DC, Kerry Bangkok Hub"
          value={v.location}
          onChange={(e) => put({ ...v, location: e.target.value })}
        />
      </Field>
      <Field label="Remark">
        <textarea
          rows={2}
          className={cn(CONTROL, "resize-y")}
          value={v.remark}
          onChange={(e) => put({ ...v, remark: e.target.value })}
        />
      </Field>
    </div>
  );
}

/** Status a tracking event implies for the shipment itself. */
const TRACK_TO_STATUS: Record<string, string> = {
  "In Transit": "In Transit",
  "Arrived at Hub": "In Transit",
  "Out for Delivery": "Out for Delivery",
  "Picked Up": "Dispatched",
};

export function shpAddTracking(s: ShpRow, ctx: ActionCtx) {
  if (["Draft", "Cancelled"].includes(s.status)) {
    ctx.toast("เพิ่มไม่ได้", `${s.code} ยังไม่ได้ Dispatch`, "warning");
    return;
  }

  let v = { status: "", location: "", remark: "" };

  ctx.formModal({
    title: "Add Tracking Update",
    confirmText: "Add Update",
    body: () => <TrackingBody onChange={(next) => (v = next)} />,
    onConfirm: () => {
      if (!v.status || !v.location.trim()) {
        ctx.toast("ข้อมูลไม่ครบ", "ต้องเลือกสถานะและระบุสถานที่", "warning");
        return false;
      }
      track(s, v.status, v.location.trim(), v.remark.trim());
      const mapped = TRACK_TO_STATUS[v.status];
      if (mapped && s.status !== mapped) {
        const from = s.status;
        s.status = mapped;
        s.deliveryStatus = mapped;
        audit(s, "Status changed", "status", from, mapped, "info");
      }
      s.updated = stamp();
      s.updatedBy = USER();
      log(s, `Tracking: ${v.status}`, `${v.location}${v.remark ? ` — ${v.remark}` : ""}`, "info");
      commit(ctx, "เพิ่มสถานะติดตามแล้ว", `${s.code} — ${v.status}`);
    },
  });
}

/* ---------- Delivery confirmation + Proof of Delivery ---------- */

interface DeliveryDraft {
  date: string;
  time: string;
  recipient: string;
  position: string;
  phone: string;
  result: string;
  deliveredQty: string;
  remark: string;
  signature: boolean;
  photo: boolean;
}

function DeliveryBody({ s, onChange }: { s: ShpRow; onChange: (v: DeliveryDraft) => void }) {
  const [v, setV] = useState<DeliveryDraft>({
    date: dmyToIso(today()),
    time: "14:45",
    recipient: "",
    position: "",
    phone: s.contactPhone,
    result: "Fully Delivered",
    deliveredQty: String(s.totalQty),
    remark: "",
    signature: false,
    photo: false,
  });

  const put = (next: DeliveryDraft) => {
    setV(next);
    onChange(next);
  };

  const partial = v.result === "Partially Delivered";
  const rejected = ["Customer Rejected", "Address Not Found", "Customer Unavailable", "Damaged in Transit"].includes(
    v.result,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <Field label="Delivery Result" required>
          <Picker options={SHP_DELIVERY_RESULTS} value={v.result} onChange={(x) => put({ ...v, result: x })} />
        </Field>
        <Field label="Delivery Date" required>
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.date}
            onChange={(e) => put({ ...v, date: e.target.value })}
          />
        </Field>
        <Field label="Delivery Time" required>
          <input
            type="time"
            className={cn(CONTROL, "tnum")}
            value={v.time}
            onChange={(e) => put({ ...v, time: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <Field label="Recipient Name" required>
          <input
            className={CONTROL}
            placeholder="ชื่อผู้รับของ"
            value={v.recipient}
            onChange={(e) => put({ ...v, recipient: e.target.value })}
          />
        </Field>
        <Field label="Recipient Position">
          <input
            className={CONTROL}
            placeholder="เช่น Storekeeper"
            value={v.position}
            onChange={(e) => put({ ...v, position: e.target.value })}
          />
        </Field>
        <Field label="Recipient Phone">
          <input
            className={CONTROL}
            value={v.phone}
            onChange={(e) => put({ ...v, phone: e.target.value })}
          />
        </Field>
      </div>

      {(partial || rejected) && (
        <Field label={partial ? "Delivered Quantity" : "Rejected Quantity"} required>
          <input
            type="number"
            className={cn(CONTROL, "tnum")}
            value={v.deliveredQty}
            onChange={(e) => put({ ...v, deliveredQty: e.target.value })}
          />
          <span className="text-cap text-ink-3">
            ส่งไปทั้งหมด {fmt(s.totalQty)} หน่วย — ส่วนที่เหลือจะยังค้างไว้ให้เปิดใบขนส่งรอบใหม่
          </span>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div className="flex flex-col gap-2 rounded-btn border border-line bg-surface p-4">
          <p className="text-cap font-semibold text-ink-2">Proof of Delivery</p>
          {(
            [
              ["signature", "ลายเซ็นผู้รับ (จำลอง)"],
              ["photo", "รูปถ่ายหน้างาน (จำลอง)"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => put({ ...v, [k]: !v[k] })}
              className="flex items-center gap-2.5 rounded-sm py-1.5 text-left text-[13px] transition-colors hover:bg-card"
            >
              <span
                className={cn(
                  "grid h-[17px] w-[17px] flex-shrink-0 place-items-center rounded-[5px] border-[1.5px]",
                  v[k] ? "border-primary bg-primary text-white" : "border-line-strong bg-card",
                )}
              >
                {v[k] && <Icon name="check" size={11} strokeWidth={3} />}
              </span>
              {label}
            </button>
          ))}
          <p className="mt-1 text-cap leading-relaxed text-ink-3">
            GPS จะบันทึกเป็นค่าจำลอง — การเก็บลายเซ็นและภาพจริงจะมาพร้อมแอปคนขับ
          </p>
        </div>

        <Field label="Delivery Remark">
          <textarea
            rows={5}
            className={cn(CONTROL, "resize-y")}
            placeholder="เช่น Delivered in good condition."
            value={v.remark}
            onChange={(e) => put({ ...v, remark: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

export function shpConfirmDelivery(s: ShpRow, ctx: ActionCtx) {
  if (!s.canDeliver) {
    ctx.toast(
      "ยืนยันการส่งไม่ได้",
      `${s.code} อยู่ในสถานะ ${s.status} — ต้อง Dispatched, In Transit หรือ Out for Delivery`,
      "warning",
    );
    return;
  }

  let v: DeliveryDraft | null = null;

  ctx.formModal({
    title: "Confirm Delivery",
    width: "wide",
    confirmText: "Confirm Delivery",
    body: () => <DeliveryBody s={s} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const d = v;
      if (!d) {
        ctx.toast("ยังไม่ได้กรอกข้อมูล", "กรอกผลการส่งและชื่อผู้รับก่อน", "warning");
        return false;
      }
      if (!d.recipient.trim()) {
        ctx.toast("ต้องระบุผู้รับ", "ยืนยันการส่งมอบต้องมีชื่อผู้รับเสมอ", "warning");
        return false;
      }
      if (!d.result) {
        ctx.toast("ต้องเลือกผลการส่ง", "เลือก Delivery Result ก่อนยืนยัน", "warning");
        return false;
      }

      const failed = ["Customer Rejected", "Address Not Found", "Customer Unavailable", "Damaged in Transit"].includes(
        d.result,
      );
      const partial = d.result === "Partially Delivered";
      const delivered = partial ? Math.min(num(d.deliveredQty), s.totalQty) : failed ? 0 : s.totalQty;

      /* Spread the delivered quantity across lines in order. */
      let left = delivered;
      for (const it of s.items ?? []) {
        const take = Math.min(num(it.shipmentQty), left);
        it.deliveredQty = take;
        it.deliveryStatus =
          take === 0 ? "Failed" : take < num(it.shipmentQty) ? "Partially Delivered" : "Delivered";
        left -= take;
      }

      const now = stamp();
      const from = s.status;
      s.status = failed ? "Delivery Failed" : partial ? "Partially Delivered" : "Delivered";
      s.deliveryStatus = failed ? "Failed" : partial ? "Partially Delivered" : "Delivered";
      s.actualDelivery = `${isoToDmy(d.date)} ${d.time}`;
      s.pod = {
        recipient: d.recipient.trim(),
        position: d.position.trim(),
        phone: d.phone.trim(),
        date: isoToDmy(d.date),
        time: d.time,
        result: d.result,
        signature: d.signature ? "ลายเซ็นอิเล็กทรอนิกส์ (จำลอง)" : "",
        photo: d.photo ? `pod-${s.code.toLowerCase()}.jpg` : "",
        gps: "13.7563, 100.5018",
        remark: d.remark.trim(),
      };
      if (!failed) {
        (s.packages ?? []).forEach((p) => {
          if (p.status !== "Damaged") p.status = "Delivered";
        });
      }
      s.updated = now;
      s.updatedBy = USER();

      log(
        s,
        failed ? "Delivery failed" : partial ? "Partially delivered" : "Delivered",
        `${d.result} — ผู้รับ: ${d.recipient.trim()} · รับ ${fmt(delivered)} จาก ${fmt(s.totalQty)} หน่วย`,
        failed || partial ? "warn" : "primary",
      );
      track(
        s,
        failed ? "Delivery Failed" : "Delivered",
        s.deliveryAddress,
        d.remark.trim() || d.result,
      );
      audit(s, "Delivery confirmed", "status", from, s.status, failed ? "warn" : "primary");

      if (failed) {
        (s.exceptions ??= []).unshift({
          type: d.result === "Customer Rejected" ? "Customer Rejected" : d.result,
          when: now,
          desc: d.remark.trim() || `ส่งไม่สำเร็จ: ${d.result}`,
          severity: "Medium",
          party: d.result === "Customer Rejected" ? "ฝ่ายขาย" : "ลูกค้า",
          resolution: "",
          followUp: "",
          status: "Open",
        });
      }

      commit(
        ctx,
        failed ? "บันทึกส่งไม่สำเร็จ" : partial ? "ส่งมอบบางส่วนแล้ว" : "ยืนยันการส่งมอบแล้ว",
        failed
          ? `${s.code} — ${d.result} · เปิด Exception ให้แล้ว`
          : partial
            ? `${s.code} — คงเหลือ ${fmt(s.totalQty - delivered)} หน่วยรอส่งรอบใหม่`
            : `${s.code} — บันทึก Proof of Delivery เรียบร้อย`,
        failed ? "danger" : partial ? "warning" : "success",
      );
    },
  });
}

/* ---------- Delivery exception ---------- */

interface ExceptionDraft {
  type: string;
  severity: string;
  party: string;
  desc: string;
  resolution: string;
  followUp: string;
}

function ExceptionBody({ onChange }: { onChange: (v: ExceptionDraft) => void }) {
  const [v, setV] = useState<ExceptionDraft>({
    type: "",
    severity: "Medium",
    party: "",
    desc: "",
    resolution: "",
    followUp: "",
  });
  const put = (next: ExceptionDraft) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <Field label="Exception Type" required>
          <Picker options={SHP_EXCEPTION_TYPES} value={v.type} onChange={(x) => put({ ...v, type: x })} />
        </Field>
        <Field label="Severity" required>
          <Picker options={SHP_SEVERITY} value={v.severity} onChange={(x) => put({ ...v, severity: x })} />
        </Field>
        <Field label="Responsible Party">
          <Picker options={SHP_RESPONSIBLE} value={v.party} onChange={(x) => put({ ...v, party: x })} />
        </Field>
      </div>
      <Field label="Description" required>
        <textarea
          rows={3}
          className={cn(CONTROL, "resize-y")}
          placeholder="อธิบายสิ่งที่เกิดขึ้นและผลกระทบต่อการส่งมอบ"
          value={v.desc}
          onChange={(e) => put({ ...v, desc: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="Resolution">
          <input
            className={CONTROL}
            placeholder="เช่น นัดส่งใหม่ / นำของกลับคลัง"
            value={v.resolution}
            onChange={(e) => put({ ...v, resolution: e.target.value })}
          />
        </Field>
        <Field label="Follow-Up Date">
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.followUp}
            onChange={(e) => put({ ...v, followUp: e.target.value })}
          />
        </Field>
      </div>
      <p className="text-cap leading-relaxed text-ink-3">
        การแนบรูปและไฟล์จะเปิดใช้พร้อมระบบจัดเก็บเอกสารในเฟสถัดไป
      </p>
    </div>
  );
}

export function shpRecordException(s: ShpRow, ctx: ActionCtx) {
  let v: ExceptionDraft | null = null;

  ctx.formModal({
    title: "Record Delivery Exception",
    width: "wide",
    confirmText: "Record Exception",
    body: () => <ExceptionBody onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const e = v;
      if (!e || !e.type) {
        ctx.toast("ต้องเลือกประเภท", "เลือก Exception Type ก่อนบันทึก", "warning");
        return false;
      }
      if (!e.desc.trim()) {
        ctx.toast("ต้องระบุรายละเอียด", "อธิบายเหตุการณ์ที่เกิดขึ้นก่อนบันทึก", "warning");
        return false;
      }

      const now = stamp();
      (s.exceptions ??= []).unshift({
        type: e.type,
        when: now,
        desc: e.desc.trim(),
        severity: e.severity,
        party: e.party,
        resolution: e.resolution.trim(),
        followUp: isoToDmy(e.followUp),
        status: e.resolution.trim() ? "Resolved" : "Open",
      });

      /* A critical open exception takes the shipment out of normal flow. */
      if (e.severity === "Critical" && !["Delivered", "Returned", "Cancelled"].includes(s.status)) {
        const from = s.status;
        s.status = "Exception";
        audit(s, "Status changed", "status", from, "Exception", "warn");
      }
      s.updated = now;
      s.updatedBy = USER();
      log(s, "Exception recorded", `${e.type} — ระดับ ${e.severity}`, "warn");
      track(s, "Delivery Failed", s.deliveryAddress, e.desc.trim());
      audit(s, "Exception recorded", "exceptions", String((s.exceptions?.length ?? 1) - 1), String(s.exceptions?.length ?? 1), "warn");

      commit(ctx, "บันทึกเหตุผิดปกติแล้ว", `${s.code} — ${e.type}`, "warning");
    },
  });
}

/* ---------- Reschedule ---------- */

interface RescheduleDraft {
  date: string;
  time: string;
  reason: string;
  confirmed: boolean;
  driver: string;
  notes: string;
}

function RescheduleBody({ s, onChange }: { s: ShpRow; onChange: (v: RescheduleDraft) => void }) {
  const [v, setV] = useState<RescheduleDraft>({
    date: "",
    time: "",
    reason: "",
    confirmed: false,
    driver: s.driver,
    notes: "",
  });
  const put = (next: RescheduleDraft) => {
    setV(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-btn border border-line bg-surface p-3 text-[13px]">
        <span className="text-ink-2">Original Delivery Date</span>{" "}
        <strong className="tnum">{s.expectedDelivery || "—"}</strong>
      </div>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="New Delivery Date" required>
          <input
            type="date"
            className={cn(CONTROL, "tnum")}
            value={v.date}
            onChange={(e) => put({ ...v, date: e.target.value })}
          />
        </Field>
        <Field label="New Delivery Time">
          <input
            type="time"
            className={cn(CONTROL, "tnum")}
            value={v.time}
            onChange={(e) => put({ ...v, time: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Reason" required>
        <Picker options={SHP_RESCHEDULE_REASONS} value={v.reason} onChange={(x) => put({ ...v, reason: x })} />
      </Field>
      <button
        type="button"
        onClick={() => put({ ...v, confirmed: !v.confirmed })}
        className="flex items-center gap-2.5 rounded-sm py-1 text-left text-[13px]"
      >
        <span
          className={cn(
            "grid h-[17px] w-[17px] flex-shrink-0 place-items-center rounded-[5px] border-[1.5px]",
            v.confirmed ? "border-primary bg-primary text-white" : "border-line-strong bg-card",
          )}
        >
          {v.confirmed && <Icon name="check" size={11} strokeWidth={3} />}
        </span>
        ลูกค้ายืนยันวันใหม่แล้ว
      </button>
      <Field label="Notes">
        <textarea
          rows={2}
          className={cn(CONTROL, "resize-y")}
          value={v.notes}
          onChange={(e) => put({ ...v, notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

export function shpReschedule(s: ShpRow, ctx: ActionCtx) {
  if (!s.canReschedule) {
    ctx.toast("เลื่อนไม่ได้", `${s.code} อยู่ในสถานะ ${s.status}`, "warning");
    return;
  }

  let v: RescheduleDraft | null = null;

  ctx.formModal({
    title: "Reschedule Delivery",
    confirmText: "Reschedule",
    body: () => <RescheduleBody s={s} onChange={(next) => (v = next)} />,
    onConfirm: () => {
      const r = v;
      if (!r || !r.date) {
        ctx.toast("ต้องระบุวันใหม่", "เลือกวันส่งใหม่ก่อนยืนยัน", "warning");
        return false;
      }
      if (!r.reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่เลื่อนก่อนยืนยัน", "warning");
        return false;
      }

      const now = stamp();
      const oldDate = s.expectedDelivery;
      const from = s.status;
      s.rescheduledFrom = oldDate;
      s.expectedDelivery = isoToDmy(r.date);
      s.rescheduleReason = r.notes.trim() ? `${r.reason} — ${r.notes.trim()}` : r.reason;
      if (r.driver) s.driver = r.driver;
      s.status = "Rescheduled";
      s.deliveryStatus = "Rescheduled";
      s.updated = now;
      s.updatedBy = USER();

      log(
        s,
        "Rescheduled",
        `เลื่อนจาก ${oldDate} เป็น ${s.expectedDelivery} — ${r.reason}${
          r.confirmed ? " (ลูกค้ายืนยันแล้ว)" : ""
        }`,
        "warn",
      );
      track(s, "Rescheduled", s.deliveryAddress, `New date ${s.expectedDelivery}`);
      audit(s, "Delivery rescheduled", "expectedDelivery", oldDate, s.expectedDelivery, "warn");
      audit(s, "Status changed", "status", from, "Rescheduled", "warn");

      commit(ctx, "เลื่อนกำหนดส่งแล้ว", `${s.code} → ${s.expectedDelivery}`, "warning");
    },
  });
}

/* ---------- Return request entry point ---------- */

export function shpCreateReturn(s: ShpRow, ctx: ActionCtx) {
  if (!["Delivery Failed", "Delivered", "Partially Delivered", "Returned", "Exception"].includes(s.status)) {
    ctx.toast(
      "เปิดคำขอคืนไม่ได้",
      `${s.code} ยังไม่ถึงขั้นตอนที่เปิดคำขอคืนสินค้าได้`,
      "warning",
    );
    return;
  }
  if (s.returnRef) {
    ctx.toast("มีคำขอคืนอยู่แล้ว", `${s.code} → ${s.returnRef}`, "warning");
    return;
  }

  ctx.confirm({
    title: "Create Return Request?",
    message: (
      <>
        เปิดคำขอคืนสินค้าจาก <strong>{s.code}</strong> — {s.customer}
        <br />
        {fmt(s.totalQty)} หน่วย · {s.packageCount} กล่อง
        <br />
        <span className="text-ink-2">
          โมดูล Return เต็มรูปแบบจะมาในเฟสถัดไป — ตอนนี้จะผูกเลขที่คำขอคืนไว้ให้ก่อน
        </span>
      </>
    ),
    confirmText: "Create Return Request",
    tone: "primary",
    onConfirm: () => {
      const code = `RET-2026-${String(SHIPMENTS.length + 10).padStart(6, "0")}`;
      s.returnRef = code;
      s.updated = stamp();
      s.updatedBy = USER();
      log(s, "Return request created", `เปิดคำขอคืนสินค้า ${code}`, "warn");
      audit(s, "Return request created", "returnRef", "—", code, "warn");
      commit(ctx, "เปิดคำขอคืนสินค้าแล้ว (จำลอง)", `${code} — โมดูล Return จะมาในเฟสถัดไป`, "info");
    },
  });
}

/* ---------- Cancel ---------- */

export function shpCancel(s: ShpRow, ctx: ActionCtx) {
  if (["Delivered", "Returned", "Cancelled"].includes(s.status)) {
    ctx.toast("ยกเลิกไม่ได้", `${s.code} อยู่ในสถานะ ${s.status}`, "warning");
    return;
  }

  let reason = "";

  ctx.formModal({
    title: "Cancel Shipment",
    confirmText: "Cancel Shipment",
    body: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          <strong>{s.code}</strong> — {s.customer} · {fmt(s.totalQty)} หน่วย
          <br />
          ใบขนส่งจะไม่ถูกลบ แต่เปลี่ยนสถานะเป็น Cancelled และแก้ไขไม่ได้อีก
        </p>
        <ReasonField
          label="เหตุผลที่ยกเลิก"
          options={SHP_CANCEL_REASONS}
          onChange={(v) => (reason = v)}
        />
      </div>
    ),
    onConfirm: () => {
      if (!reason) {
        ctx.toast("ต้องระบุเหตุผล", "เลือกเหตุผลที่ยกเลิกก่อนยืนยัน", "warning");
        return false;
      }
      const from = s.status;
      s.status = "Cancelled";
      s.deliveryStatus = "Cancelled";
      s.cancelReason = reason;
      s.updated = stamp();
      s.updatedBy = USER();
      log(s, "Cancelled", `เหตุผล: ${reason}`, "warn");
      audit(s, "Status changed", "status", from, "Cancelled", "warn");
      commit(ctx, "ยกเลิกใบขนส่งแล้ว", `${s.code} — ${reason}`, "danger");
    },
  });
}

/* ---------- Print / export placeholders ---------- */

export function shpPrintLabel(s: ShpRow, ctx: ActionCtx) {
  ctx.toast(
    "พิมพ์ Shipping Label",
    `${s.code} — ${s.packageCount} กล่อง · ผู้ให้บริการฉลากจริงจะเชื่อมในเฟสถัดไป`,
    "info",
  );
}

export function shpPrintDocument(s: ShpRow, ctx: ActionCtx) {
  ctx.toast("พิมพ์เอกสารขนส่ง", `${s.code} — Future support`, "info");
}

/* ---------- Bulk ---------- */

export function shpBulk(
  rows: ShpRow[],
  action: "ready" | "dispatch" | "carrier" | "driver" | "label" | "cancel",
  ctx: ActionCtx,
) {
  if (action === "carrier" || action === "driver") {
    ctx.toast(
      action === "carrier" ? "Assign Carrier" : "Assign Driver",
      `${rows.length} ใบ — การกำหนดแบบกลุ่มจะเปิดใช้พร้อมหน้าจัดรอบรถในเฟสถัดไป`,
      "info",
    );
    return;
  }
  if (action === "label") {
    ctx.toast("พิมพ์ Shipping Labels", `${rows.length} ใบ — Future support`, "info");
    return;
  }

  const eligible = rows.filter((r) => {
    if (action === "ready") return ["Draft", "Rescheduled"].includes(r.status);
    if (action === "dispatch") return r.status === "Ready to Dispatch";
    return r.status === "Draft";
  });

  if (!eligible.length) {
    ctx.toast("ไม่มีรายการที่ทำได้", "รายการที่เลือกไม่อยู่ในสถานะที่รองรับ", "warning");
    return;
  }

  const verb = { ready: "ทำเครื่องหมายพร้อมส่ง", dispatch: "Dispatch", cancel: "ยกเลิก" }[action];

  ctx.confirm({
    title: `${verb} ${eligible.length} ใบ?`,
    message:
      eligible.length === rows.length
        ? `จะดำเนินการกับใบขนส่งทั้ง ${eligible.length} ใบที่เลือกไว้`
        : `เลือกไว้ ${rows.length} ใบ แต่ทำได้ ${eligible.length} ใบ — ที่เหลือสถานะไม่รองรับ`,
    confirmText: verb,
    tone: action === "cancel" ? "danger" : "primary",
    onConfirm: () => {
      const now = stamp();
      let skipped = 0;
      for (const s of eligible) {
        if (action === "dispatch" && blockingIssues(dispatchReadiness(s)).length) {
          skipped++;
          continue;
        }
        const from = s.status;
        if (action === "ready") {
          s.status = "Ready to Dispatch";
          s.deliveryStatus = "Ready";
          track(s, "Ready to Dispatch", s.warehouse, "Bulk action");
        } else if (action === "dispatch") {
          s.status = "Dispatched";
          s.deliveryStatus = "Dispatched";
          s.dispatchDate = now;
          track(s, "Dispatched", s.warehouse, "Bulk dispatch");
        } else {
          s.status = "Cancelled";
          s.deliveryStatus = "Cancelled";
          s.cancelReason = "ยกเลิกแบบกลุ่ม";
        }
        s.updated = now;
        s.updatedBy = USER();
        log(s, `${verb} (bulk)`, `ดำเนินการแบบกลุ่มโดย ${USER()}`, action === "cancel" ? "warn" : "primary");
        audit(s, "Status changed", "status", from, s.status, action === "cancel" ? "warn" : "primary");
      }
      commit(
        ctx,
        `${verb}แล้ว`,
        skipped ? `${eligible.length - skipped} ใบ · ข้าม ${skipped} ใบที่ยังไม่พร้อม` : `${eligible.length} ใบ`,
        skipped ? "warning" : action === "cancel" ? "danger" : "success",
      );
    },
  });
}
