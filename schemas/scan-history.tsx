import {
  CODE_TYPES,
  ENTITY_TYPES,
  SCAN_OUTCOMES,
  SCAN_SOURCES,
  SCAN_USERS,
  WAREHOUSE_CONTEXTS,
} from "@/data/barcodes";
import { fmt } from "@/lib/format";
import type { BadgeTone, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { scanHistory, type ScanRow } from "@/lib/domain/barcode";
import { bcCopy, bcExportLog, bcRemoveScan } from "@/lib/workflows-barcode";
import { Badge } from "@/components/ui";

/* ============================================================
   SCAN HISTORY — the record of who looked at what.

   A scan changes nothing, so this list is an audit of enquiries
   rather than of work. It is read-only in the strongest sense:
   the only write it offers is removing a row from your own recent
   history.
   ============================================================ */

const dash = (v: string) => v || "—";

export const OUTCOME_TONE: Record<string, BadgeTone> = {
  Found: "success",
  "Multiple Matches": "warning",
  "Not Found": "danger",
  Invalid: "danger",
  Restricted: "warning",
  "Error Placeholder": "neutral",
};

const uniq = (v: string[]) => [...new Set(v.filter(Boolean))].sort();

const list: ListSchema<ScanRow> = {
  key: "scan-history",
  entity: "Scan",
  entityPlural: "scans",
  title: "Scan History",
  subtitle: "Every code looked up in Barcode Lookup, what it resolved to, and who scanned it.",
  crumb: "Scan History",
  crumbParent: "Inventory",
  primaryLabel: "",
  searchPlaceholder: "ค้นหารหัสที่สแกน / ผลลัพธ์ / ผู้สแกน",
  emptyTitle: "ยังไม่มีการสแกนที่ตรงกับเงื่อนไข",

  hideCreate: true,
  hideImportExport: true,

  source: scanHistory,

  searchFields: ["code", "scanned", "codeType", "entity", "resultCode", "resultName", "user", "warehouse"],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "found", label: "พบผลลัพธ์", test: (r) => r.outcome === "Found" },
    { key: "multi", label: "ตรงหลายรายการ", test: (r) => r.outcome === "Multiple Matches" },
    { key: "missing", label: "ไม่พบ", test: (r) => r.outcome === "Not Found" },
    { key: "invalid", label: "รูปแบบไม่ถูกต้อง", test: (r) => r.outcome === "Invalid" },
  ],

  filters: [
    {
      id: "when",
      label: "Date",
      options: () => uniq(scanHistory().map((r) => r.when.split(" ")[0])),
      test: (r, v) => r.when.startsWith(v),
    },
    { id: "user", label: "User", options: () => [...SCAN_USERS], test: (r, v) => r.user === v },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...WAREHOUSE_CONTEXTS],
      test: (r, v) => r.warehouse === v,
    },
    { id: "source", label: "Scan Source", options: () => [...SCAN_SOURCES], test: (r, v) => r.source === v },
    { id: "codeType", label: "Code Type", options: () => [...CODE_TYPES], test: (r, v) => r.codeType === v },
    { id: "outcome", label: "Outcome", options: () => [...SCAN_OUTCOMES], test: (r, v) => r.outcome === v },
    { id: "entity", label: "Entity Type", options: () => [...ENTITY_TYPES], test: (r, v) => r.entity === v },
    {
      id: "mine",
      label: "My Scans",
      options: () => [...SCAN_USERS],
      test: (r, v) => r.user === v,
    },
  ],

  columns: [
    { key: "code", label: "Scan ID", sortable: true, locked: true, cell: (r) => r.code },
    {
      key: "scanned",
      label: "Scanned Code",
      sortable: true,
      cell: (r) => <span className="tnum font-semibold">{r.scanned}</span>,
    },
    { key: "codeType", label: "Code Type", sortable: true, cell: (r) => r.codeType },
    {
      key: "entity",
      label: "Result Entity",
      cell: (r) => (r.entity ? <Badge tone="info">{r.entity}</Badge> : "—"),
    },
    { key: "resultCode", label: "Result Code", cell: (r) => dash(r.resultCode) },
    { key: "resultName", label: "Result Name", muted: true, cell: (r) => dash(r.resultName) },
    { key: "resultStatus", label: "Result Status", muted: true, cell: (r) => dash(r.resultStatus) },
    { key: "source", label: "Scan Source", muted: true, defaultHidden: true, cell: (r) => r.source },
    { key: "warehouse", label: "Warehouse Context", muted: true, cell: (r) => r.warehouse },
    { key: "user", label: "User", muted: true, cell: (r) => r.user },
    { key: "when", label: "Date and Time", sortable: true, cell: (r) => r.when },
    {
      key: "outcome",
      label: "Outcome",
      sortable: true,
      cell: (r) => <Badge tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>{r.outcome}</Badge>,
    },
  ],

  secondaryActions: (ctx) => [
    { label: "Export Scan Log", icon: "upload", run: () => bcExportLog(ctx) },
    {
      label: "Back to Barcode Lookup",
      icon: "barcode",
      run: () => ctx.goto("/barcode"),
    },
  ],

  hero: () => {
    const rows = scanHistory();
    const by = (o: string) => rows.filter((r) => r.outcome === o).length;
    return {
      kpis: [
        { icon: "barcode", label: "Total Scans", value: fmt(rows.length) },
        { icon: "checkCircle", label: "Found", value: fmt(by("Found")), tone: "ok" },
        { icon: "columns", label: "Multiple Matches", value: fmt(by("Multiple Matches")), tone: "warn" },
        { icon: "xCircle", label: "Not Found", value: fmt(by("Not Found")), tone: "warn" },
        { icon: "alert", label: "Invalid", value: fmt(by("Invalid")), tone: "warn" },
      ],
    };
  },

  rowActions: (rec, ctx) => [
    {
      label: "เปิดผลลัพธ์",
      icon: "eye",
      disabled: rec.outcome !== "Found",
      disabledReason: "การสแกนครั้งนี้ไม่มีผลลัพธ์เดียวให้เปิด",
      run: () => ctx.goto(`/barcode?code=${encodeURIComponent(rec.scanned)}`),
    },
    {
      label: "สแกนซ้ำ",
      icon: "refresh",
      run: () => ctx.goto(`/barcode?code=${encodeURIComponent(rec.scanned)}`),
    },
    { label: "คัดลอกรหัส", icon: "copy", run: () => bcCopy(ctx, rec.scanned, "รหัสที่สแกน") },
    { sep: true },
    {
      label: "ลบออกจากประวัติ",
      icon: "trash",
      danger: true,
      run: () => bcRemoveScan(ctx, rec.code),
    },
  ],

  bulkActions: (rows, ctx) => [
    {
      label: `ส่งออกที่เลือก (${rows.length})`,
      icon: "upload" as const,
      run: () =>
        ctx.toast("ส่งออกการสแกนที่เลือก", `${fmt(rows.length)} รายการ — Future support`, "info"),
    },
  ],
};

const detail: DetailSchema<ScanRow> = {
  key: "scan-history",
  entityLabel: "Scan",

  identity: (r) => ({
    code: r.code,
    title: r.scanned,
    copyFields: [
      { label: "Scan ID", value: r.code },
      { label: "Scanned Code", value: r.scanned },
    ],
    badges: [
      { text: r.outcome, tone: OUTCOME_TONE[r.outcome] ?? "neutral" },
      { text: r.codeType, tone: "info" },
    ],
    tags: [r.source, r.warehouse, r.user],
  }),

  kpis: (r) => [
    { icon: "barcode", label: "Code Type", value: r.codeType, wide: true },
    { icon: "checkCircle", label: "Outcome", value: r.outcome },
    { icon: "box", label: "Result", value: dash(r.resultCode) },
    { icon: "clock", label: "Scanned At", value: r.when },
  ],

  actions: (rec, ctx) => [
    { label: "สแกนซ้ำ", icon: "refresh", run: () => ctx.goto(`/barcode?code=${encodeURIComponent(rec.scanned)}`) },
    { label: "คัดลอกรหัส", icon: "copy", run: () => bcCopy(ctx, rec.scanned, "รหัสที่สแกน") },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r) => [
        {
          type: "fields",
          title: "Scan",
          cols: 2,
          items: [
            { label: "Scan ID", value: r.code },
            { label: "Scanned Code", value: r.scanned },
            { label: "Code Type", value: r.codeType },
            { label: "Scan Source", value: r.source },
            { label: "Warehouse Context", value: r.warehouse },
            { label: "User", value: r.user },
            { label: "Date and Time", value: r.when },
            { label: "Outcome", value: r.outcome },
          ],
        },
        {
          type: "fields",
          title: "Result",
          cols: 2,
          items: [
            { label: "Result Entity", value: dash(r.entity) },
            { label: "Result Code", value: dash(r.resultCode) },
            { label: "Result Name", value: dash(r.resultName) },
            { label: "Result Status", value: dash(r.resultStatus) },
          ],
        },
        {
          type: "note",
          title: "การสแกนไม่เปลี่ยนแปลงข้อมูล",
          text: "รายการนี้บันทึกเพียงว่ามีการค้นหา ไม่มีผลต่อสต๊อก เอกสาร หรือสถานะใด",
        },
      ],
    },
  ],
};

export const scanHistorySchemas: EntitySchemas<ScanRow> = { list, detail };
