"use client";

import { actingUserName } from "./domain/admin";
import { useRef, useState } from "react";
import { stamp } from "./format";
import { cn } from "./utils";
import type { ActionCtx } from "./types";
import {
  LABEL_SIZES,
  SCANNER_MODES,
  WAREHOUSE_CONTEXTS,
} from "@/data/barcodes";
import { recognize, removeScan, scanHistory, type Recognition } from "./domain/barcode";
import { Badge, Barcode, Button, Switch } from "@/components/ui";

/* ============================================================
   BARCODE LOOKUP WORKFLOWS

   Everything here looks, copies or prints. Nothing writes a
   quantity, a status, a location or an owner — a scan is an
   enquiry, and the modules that own the data stay the only place
   it can be changed.
   ============================================================ */

/** The acting user, read per call — a stamp must name who actually did it. */
const USER = () => actingUserName();

/* ---------- Clipboard ---------- */

/** Copy without assuming a clipboard exists — a warehouse gun has none. */
export function bcCopy(ctx: ActionCtx, value: string, label = "รหัส") {
  const done = () => ctx.toast(`คัดลอก${label}แล้ว`, value, "success");
  try {
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clip?.writeText) {
      void clip.writeText(value).then(done, done);
      return;
    }
  } catch {
    /* fall through to the toast below */
  }
  done();
}

/* ---------- Mock scanner ---------- */

function ScannerBody({
  onScan,
  close,
}: {
  onScan: (code: string, source: string) => Recognition;
  close: () => void;
}) {
  const [mode, setMode] = useState<string>(SCANNER_MODES[0]);
  const [warehouse, setWarehouse] = useState<string>(WAREHOUSE_CONTEXTS[0]);
  const [auto, setAuto] = useState(true);
  const [continuous, setContinuous] = useState(true);
  const [sound, setSound] = useState(false);
  const [value, setValue] = useState("");
  const [log, setLog] = useState<{ code: string; outcome: string; name: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const code = value.trim();
    if (!code) return;
    const rec = onScan(code, "USB Scanner");
    setLog((l) => [
      { code, outcome: rec.outcome, name: rec.matches[0]?.name ?? rec.codeType },
      ...l,
    ].slice(0, 8));
    setValue("");
    if (!continuous) {
      close();
      return;
    }
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-cap font-medium text-ink-2">Scanner Mode</span>
          <select
            aria-label="Scanner Mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="h-10 rounded-btn border border-line bg-card px-3 text-body outline-none focus:border-primary"
          >
            {SCANNER_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-cap font-medium text-ink-2">Warehouse Context</span>
          <select
            aria-label="Warehouse Context"
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            className="h-10 rounded-btn border border-line bg-card px-3 text-body outline-none focus:border-primary"
          >
            {WAREHOUSE_CONTEXTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-cap font-medium text-ink-2">Scan Input</span>
        <input
          ref={inputRef}
          autoFocus
          aria-label="Scanner Scan Input"
          value={value}
          placeholder="ยิงบาร์โค้ดหรือพิมพ์รหัสแล้วกด Enter"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && auto) {
              e.preventDefault();
              submit();
            }
          }}
          className="h-12 rounded-btn border border-line bg-card px-3 text-h3 tnum outline-none focus:border-primary"
        />
      </label>

{/* Switch shows only Yes/No, so the toggle names sit beside it. */}
      <div className="flex flex-wrap items-center gap-5">
        {(
          [
            ["Auto-Submit", auto, setAuto],
            ["Continuous Scan", continuous, setContinuous],
            ["Sound Feedback (Phase 2)", sound, setSound],
          ] as [string, boolean, (v: boolean) => void][]
        ).map(([label, on, set]) => (
          <span key={label} className="flex items-center gap-2">
            <span className="text-cap font-medium text-ink-2">{label}</span>
            <Switch checked={on} onChange={set} label={label} />
          </span>
        ))}
      </div>

      <Button variant="primary" onClick={submit}>
        สแกน
      </Button>

      {log.length > 0 && (
        <div className="flex flex-col gap-2 rounded-btn border border-line p-3">
          <span className="text-cap font-semibold text-ink-2">ผลการสแกนในรอบนี้</span>
          {log.map((l, i) => (
            <span key={`${l.code}-${i}`} className="flex items-center justify-between gap-3 text-cap">
              <span className="tnum font-medium">{l.code}</span>
              <span className="text-ink-3">{l.name}</span>
              <Badge
                tone={
                  l.outcome === "Found"
                    ? "success"
                    : l.outcome === "Multiple Matches"
                      ? "warning"
                      : "danger"
                }
              >
                {l.outcome}
              </Badge>
            </span>
          ))}
        </div>
      )}

      <p className="text-cap text-ink-3">
        โหมด {mode} · คลัง {warehouse} · การเชื่อมต่อกล้องและเครื่องอ่านจริงจะทำในเฟส 2
      </p>
    </div>
  );
}

export function bcScanner(ctx: ActionCtx, onScan: (code: string, source: string) => Recognition) {
  ctx.formModal({
    title: "Mock Scanner",
    width: "wide",
    body: ({ close }) => <ScannerBody onScan={onScan} close={close} />,
    confirmText: "ปิด",
    cancelText: "ยกเลิก",
  });
}

/* ---------- Label preview ---------- */

export interface LabelSpec {
  kind: string;
  code: string;
  name: string;
  rows: [string, string][];
}

function LabelBody({ spec }: { spec: LabelSpec }) {
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState<string>(LABEL_SIZES[1]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-line-strong bg-card p-5">
        <div className="flex flex-col items-center gap-3">
          <span className="text-cap font-semibold uppercase tracking-wide text-ink-3">
            {spec.kind} Label
          </span>
          <Barcode code={spec.code.replace(/[^0-9]/g, "").slice(0, 13) || "0000000000000"} />
          <span className="text-h3 font-semibold tnum">{spec.code}</span>
          <span className="text-body text-ink-2">{spec.name}</span>
          <div className="mt-2 grid w-full grid-cols-2 gap-x-4 gap-y-1">
            {spec.rows.map(([k, v]) => (
              <span key={k} className="flex justify-between gap-3 text-cap">
                <span className="text-ink-3">{k}</span>
                <span className="font-medium">{v || "—"}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-cap font-medium text-ink-2">Label Size</span>
          <select
            aria-label="Label Size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="h-10 rounded-btn border border-line bg-card px-3 text-body outline-none focus:border-primary"
          >
            {LABEL_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-cap font-medium text-ink-2">Print Quantity</span>
          <input
            type="number"
            min={1}
            aria-label="Print Quantity"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="h-10 rounded-btn border border-line bg-card px-3 text-body tnum outline-none focus:border-primary"
          />
        </label>
      </div>

      <p className="text-cap text-ink-3">
        ตัวอย่างป้ายเท่านั้น — การพิมพ์จริงและการออกแบบป้ายจะทำในเฟสถัดไป
        และการพิมพ์ป้ายไม่สร้างหมายเลขใหม่ในระบบ
      </p>
    </div>
  );
}

export function bcLabelPreview(ctx: ActionCtx, spec: LabelSpec) {
  ctx.formModal({
    title: `ตัวอย่างป้าย ${spec.kind}`,
    body: () => <LabelBody spec={spec} />,
    confirmText: "พิมพ์",
    cancelText: "ปิด",
    onConfirm: () => {
      ctx.toast("ส่งงานพิมพ์ป้าย", `${spec.kind} · ${spec.code} — Future support`, "info");
    },
  });
}

/* ---------- Scan log ---------- */

export const bcExportLog = (ctx: ActionCtx) =>
  ctx.toast(
    "ส่งออกบันทึกการสแกน",
    `${scanHistory().length} รายการ — Future support`,
    "info",
  );

export function bcRemoveScan(ctx: ActionCtx, id: string) {
  removeScan(id);
  ctx.refresh();
  ctx.toast("ลบออกจากรายการล่าสุดแล้ว", id, "info");
}

/** An unknown code is a data problem, not a licence to create master data. */
export function bcReportUnknown(ctx: ActionCtx, code: string) {
  ctx.confirm({
    title: "แจ้งบาร์โค้ดที่ไม่รู้จัก",
    message: (
      <span className="flex flex-col gap-2">
        <span className="tnum font-semibold">{code}</span>
        <span className="text-cap text-ink-2">
          ระบบจะบันทึกไว้ให้ทีมข้อมูลหลักตรวจสอบ — ไม่สร้างสินค้าหรือหมายเลขเครื่องใหม่จากหน้านี้
        </span>
      </span>
    ),
    confirmText: "แจ้งเรื่อง",
    onConfirm: () =>
      ctx.toast(
        "แจ้งบาร์โค้ดที่ไม่รู้จักแล้ว",
        `${code} · ${USER()} · ${stamp()} — Future support`,
        "info",
      ),
  });
}

/* ---------- Placeholders ---------- */

export const bcSoon = (ctx: ActionCtx, what: string, detail?: string) =>
  ctx.toast(what, detail ?? "โมดูลนี้จะรองรับในเฟสถัดไป", "info");

/* ---------- Mobile scanner placeholder ---------- */

export function MobileScannerCard({ onManual }: { onManual: () => void }) {
  return (
    <div
      data-testid="bc-mobile-scanner"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface p-6 text-center md:hidden"
    >
      <div
        className={cn(
          "flex h-32 w-full max-w-[260px] items-center justify-center rounded-card",
          "border-2 border-dashed border-primary/50 bg-card",
        )}
      >
        <span className="text-cap font-semibold text-ink-3">Camera Scanner — Phase 2</span>
      </div>
      <span className="text-cap text-ink-2">
        เปิดกล้องเพื่อสแกนจะรองรับในเฟส 2 — ตอนนี้พิมพ์รหัสด้วยมือได้เลย
      </span>
      <Button variant="primary" onClick={onManual}>
        พิมพ์รหัสด้วยมือ
      </Button>
    </div>
  );
}

/** Convenience used by the landing page's Paste button. */
export async function bcPaste(ctx: ActionCtx): Promise<string> {
  try {
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clip?.readText) return (await clip.readText()).trim();
  } catch {
    /* the browser refused; fall through */
  }
  ctx.toast("วางรหัสไม่ได้", "เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ด — พิมพ์รหัสแทนได้", "info");
  return "";
}

export { recognize };
