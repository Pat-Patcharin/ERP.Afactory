"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SCAN_SOURCES,
  WAREHOUSE_CONTEXTS,
} from "@/data/barcodes";
import { fmt, stamp } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import type { ActionCtx } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  barcodeSummary,
  logScan,
  partialSearch,
  recentScans,
  recognize,
  type Match,
  type Recognition,
} from "@/lib/domain/barcode";
import {
  bcCopy,
  bcExportLog,
  bcLabelPreview,
  bcPaste,
  bcRemoveScan,
  bcReportUnknown,
  bcScanner,
  bcSoon,
  MobileScannerCard,
} from "@/lib/workflows-barcode";
import {
  docPrefixHelp,
  gs1Blocks,
  helpExamples,
  invalidBlocks,
  multiBlocks,
  resultView,
  supportedTypes,
  unknownBlocks,
} from "@/schemas/barcode-lookup";
import { OUTCOME_TONE } from "@/schemas/scan-history";
import { BlockRenderer } from "@/components/engine/BlockRenderer";
import { Badge, Button, Card, Table, TableWrap, Tabs, Td, Th } from "@/components/ui";
import { WsPageHeader } from "@/components/workspace/parts";

/* ============================================================
   BARCODE LOOKUP — one input, every entity in the ERP.

   The page is a router, not a database. It hands the code to the
   recognition engine, then renders whichever result view the match
   asks for. Every action leaves for the module that owns the data;
   nothing here writes a quantity, a status or an owner.
   ============================================================ */

const USER = "Admin";

export default function BarcodeLookupPage() {
  const router = useRouter();
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const formModal = useUI((s) => s.formModal);
  const openQuickView = useUI((s) => s.openQuickView);
  const refresh = useUI((s) => s.refresh);
  const revision = useUI((s) => s.revision);

  const ctx: ActionCtx = useMemo(
    () => ({
      goto: (href) => router.push(href),
      openEntity: (entity, code) =>
        router.push(code ? `/m/${entity}/${encodeURIComponent(code)}` : `/m/${entity}`),
      toast,
      confirm,
      formModal,
      refresh,
      quickView: openQuickView,
    }),
    [router, toast, confirm, formModal, refresh, openQuickView],
  );

  const [value, setValue] = useState("");
  const [source, setSource] = useState<string>(SCAN_SOURCES[0]);
  const [warehouse, setWarehouse] = useState<string>(WAREHOUSE_CONTEXTS[0]);
  const [result, setResult] = useState<Recognition | null>(null);
  const [picked, setPicked] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  /* A scan gun types and presses Enter, so the input owns the focus. */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = useCallback(
    (raw: string, via = source): Recognition => {
      const code = raw.trim();
      const rec = recognize(code);

      /* A gun that double-fires must not log the same scan twice. */
      const now = Date.now();
      const dup = lastRef.current.code === code && now - lastRef.current.at < 800;
      lastRef.current = { code, at: now };

      if (!dup && code) {
        logScan(rec, { source: via, warehouse, user: USER, when: stamp() });
      }

      setResult(rec);
      setPicked(rec.outcome === "Found" ? rec.matches[0] : null);
      setTab("");
      refresh();
      return rec;
    },
    [source, warehouse, refresh],
  );

  const submit = useCallback(
    (raw?: string) => {
      const code = (raw ?? value).trim();
      if (!code) {
        toast("ยังไม่ได้ใส่รหัส", "สแกนหรือพิมพ์รหัสก่อน", "info");
        return;
      }
      setValue(code);
      setBusy(true);
      const rec = run(code);
      setBusy(false);
      if (rec.outcome === "Found") {
        toast("พบผลลัพธ์", `${rec.matches[0].typeLabel} · ${rec.matches[0].code}`, "success");
      }
    },
    [value, run, toast],
  );

  const clear = useCallback(() => {
    setValue("");
    setResult(null);
    setPicked(null);
    inputRef.current?.focus();
  }, []);

  /* A code passed in the URL (rescan from Scan History) runs on arrival.
     Read from the location rather than useSearchParams, which would force the
     whole page to client-side rendering. */
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) submit(code);
    /* Once, on mount — submit is recreated on every keystroke. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Ctrl+K focuses the scan box, Ctrl+Shift+H opens the history. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        router.push("/m/scan-history");
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const view = useMemo(() => (picked ? resultView(picked, ctx) : null), [picked, ctx]);
  const recent = useMemo(() => recentScans(20), [revision]);
  const summary = useMemo(() => barcodeSummary(), [revision]);
  const partial = useMemo(
    () => (result?.outcome === "Not Found" ? partialSearch(result.normalized) : []),
    [result],
  );

  const activeTab = view ? tab || view.tabs[0]?.key : "";

  return (
    <div className="flex flex-col gap-6">
      <WsPageHeader
        title="Barcode Lookup"
        subtitle="Scan or enter a code to identify products, lots, serial numbers, locations, packages, and documents."
        onRefresh={refresh}
        extraActions={[
          { label: "Start Mock Scanner", icon: "barcode", run: () => bcScanner(ctx, (c, s) => run(c, s)) },
          {
            label: "Paste Code",
            icon: "copy",
            run: () => {
              void bcPaste(ctx).then((v) => {
                if (!v) return;
                setValue(v);
                setSource("Clipboard Paste");
                submit(v);
              });
            },
          },
          { label: "Scan History", icon: "clock", run: () => router.push("/m/scan-history") },
          { label: "Export Scan Log", icon: "upload", run: () => bcExportLog(ctx) },
          {
            label: "Help",
            icon: "bulb",
            run: () =>
              bcSoon(
                ctx,
                "วิธีใช้",
                "สแกนหรือพิมพ์รหัสแล้วกด Enter · Ctrl+K โฟกัสช่องสแกน · Ctrl+Shift+H เปิดประวัติ",
              ),
          },
        ]}
      />

      {/* ---------- Scanner input panel ---------- */}
      <Card data-testid="bc-scan-panel" className="p-6">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
          <div className="flex items-center justify-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-primary/10 text-primary">
              <Icon name="barcode" size={22} strokeWidth={2} />
            </span>
            <span className="text-h3 font-semibold">Scan or enter a code</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              aria-label="Scan Input"
              value={value}
              placeholder="Scan barcode, serial, lot, location, package, or document number"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  clear();
                }
              }}
              className={cn(
                "h-14 min-w-[320px] flex-1 rounded-btn border border-line bg-card px-4",
                "text-h3 tnum outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
              )}
            />
            <Button variant="primary" onClick={() => submit()} disabled={busy}>
              <Icon name={busy ? "spinner" : "search"} size={17} strokeWidth={2} />
              Scan
            </Button>
            <Button onClick={clear}>
              <Icon name="close" size={17} strokeWidth={2} />
              Clear
            </Button>
            <Button
              onClick={() => {
                void bcPaste(ctx).then((v) => {
                  if (!v) return;
                  setValue(v);
                  setSource("Clipboard Paste");
                  submit(v);
                });
              }}
            >
              <Icon name="copy" size={17} strokeWidth={2} />
              Paste
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-cap font-medium text-ink-2">Scan Source</span>
              <select
                aria-label="Scan Source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-9 rounded-btn border border-line bg-card px-2 text-cap outline-none focus:border-primary"
              >
                {SCAN_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-cap font-medium text-ink-2">Warehouse Context</span>
              <select
                aria-label="Warehouse Context"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                className="h-9 rounded-btn border border-line bg-card px-2 text-cap outline-none focus:border-primary"
              >
                {WAREHOUSE_CONTEXTS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex flex-col gap-1">
              <span className="text-cap font-medium text-ink-2">Scan Date and Time</span>
              <span className="text-cap text-ink-3">{stamp()}</span>
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-cap font-medium text-ink-2">User</span>
              <span className="text-cap text-ink-3">{USER}</span>
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-cap font-medium text-ink-2">Device</span>
              <span className="text-cap text-ink-3">Desktop — Phase 2</span>
            </span>
          </div>

          {result && (
            <div
              data-testid="bc-recognition"
              className="flex flex-wrap items-center gap-2 rounded-btn border border-line bg-surface p-3"
              role="status"
              aria-live="polite"
            >
              <Badge tone={OUTCOME_TONE[result.outcome] ?? "neutral"}>{result.outcome}</Badge>
              <Badge tone="info">{result.codeType}</Badge>
              <span className="text-cap text-ink-3">{result.symbology}</span>
              <span className="tnum text-cap text-ink-2">{result.raw}</span>
              {result.checkDigitOk !== undefined && (
                <span className="text-cap text-ink-3">
                  Check digit (placeholder): {result.checkDigitOk ? "ผ่าน" : "ไม่ผ่าน"}
                </span>
              )}
            </div>
          )}

          <p className="text-cap text-ink-3">
            Enter = Search · Escape = Clear · Ctrl + K = Focus scan input · Ctrl + Shift + H = Scan
            History
          </p>
        </div>
      </Card>

      <MobileScannerCard onManual={() => inputRef.current?.focus()} />

      {/* ---------- Result ---------- */}
      {view && (
        <Card data-testid="bc-result" className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-btn bg-surface text-h2">
              {view.icon}
            </span>
            <div className="min-w-[240px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{view.typeLabel}</Badge>
                <span className="text-h2 font-semibold tnum">{view.code}</span>
              </div>
              <p className="mt-1 text-ink-2">{view.title}</p>
              <p className="text-cap text-ink-3">{view.subtitle}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {view.badges.map((b) => (
                  <Badge key={b.text} tone={b.tone}>
                    {b.text}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {view.actions.map((a) => (
                <Button key={a.label} onClick={a.run}>
                  <Icon name={a.icon} size={16} strokeWidth={2} />
                  {a.label}
                </Button>
              ))}
              <Button onClick={() => bcLabelPreview(ctx, view.label)}>
                <Icon name="printer" size={16} strokeWidth={2} />
                Label Preview
              </Button>
            </div>
          </div>

          <BlockRenderer blocks={[view.summary]} />

          {result?.gs1 && <BlockRenderer blocks={gs1Blocks(result)} />}

          {view.tabs.length > 1 && (
            <Tabs
              items={view.tabs.map((t) => ({ key: t.key, label: t.label }))}
              active={activeTab}
              onChange={setTab}
            />
          )}
          <BlockRenderer
            blocks={(view.tabs.find((t) => t.key === activeTab) ?? view.tabs[0])?.blocks ?? []}
          />
        </Card>
      )}

      {/* ---------- Multiple matches ---------- */}
      {result?.outcome === "Multiple Matches" && !picked && (
        <Card data-testid="bc-multi" className="flex flex-col gap-4 p-6">
          <BlockRenderer blocks={multiBlocks(result)} />
          <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-md:grid-cols-1">
            {result.matches.map((m) => (
              <button
                key={`${m.kind}-${m.key}`}
                type="button"
                onClick={() => setPicked(m)}
                className={cn(
                  "flex flex-col gap-2 rounded-card border border-line bg-card p-4 text-left",
                  "hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="text-h3">{m.icon}</span>
                  <Badge tone="info">{m.typeLabel}</Badge>
                </span>
                <span className="font-semibold tnum">{m.code}</span>
                <span className="text-cap text-ink-2">{m.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-cap text-ink-3">
                  <Badge tone={m.tone}>{m.status}</Badge>
                  <span>{m.place || "—"}</span>
                </span>
                <span className="text-cap text-ink-3">{m.via}</span>
                {m.updated && <span className="text-cap text-ink-3">{m.updated}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => inputRef.current?.focus()}>Refine Search</Button>
            <Button
              onClick={() => {
                const exact = result.matches.filter((m) => m.code === result.normalized);
                if (exact.length === 1) {
                  setPicked(exact[0]);
                  return;
                }
                toast("ไม่มีรายการที่ตรงแบบเป๊ะ", "เลือกรายการจากรายการด้านบน", "info");
              }}
            >
              Search Exact Match Only
            </Button>
            <Button onClick={() => bcCopy(ctx, result.raw)}>Copy Code</Button>
          </div>
        </Card>
      )}

      {/* ---------- Not found ---------- */}
      {result?.outcome === "Not Found" && (
        <Card data-testid="bc-not-found" className="flex flex-col gap-4 p-6">
          <BlockRenderer
            blocks={unknownBlocks(result, { when: stamp(), user: USER, warehouse })}
          />
          {partial.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-cap font-semibold text-ink-2">
                ผลการค้นหาบางส่วน {fmt(partial.length)} รายการ
              </span>
              <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-md:grid-cols-1">
                {partial.map((m) => (
                  <button
                    key={`${m.kind}-${m.key}`}
                    type="button"
                    onClick={() => setPicked(m)}
                    className="flex flex-col gap-1 rounded-card border border-line bg-card p-3 text-left hover:border-primary"
                  >
                    <Badge tone="info">{m.typeLabel}</Badge>
                    <span className="font-semibold tnum">{m.code}</span>
                    <span className="text-cap text-ink-2">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => submit()}>
              Try Again
            </Button>
            <Button onClick={() => submit(result.raw.replace(/\s+/g, ""))}>Remove Spaces</Button>
            <Button onClick={() => router.push("/m/stock-inquiry")}>Search Product</Button>
            <Button onClick={() => router.push("/m/serial-tracking")}>Search Serial</Button>
            <Button onClick={() => router.push("/m/lot-tracking")}>Search Lot</Button>
            <Button onClick={() => router.push("/m/stock-card")}>Search Document</Button>
            <Button onClick={() => bcReportUnknown(ctx, result.raw)}>Report Unknown Barcode</Button>
            <Button onClick={() => bcCopy(ctx, result.raw)}>Copy Code</Button>
          </div>
        </Card>
      )}

      {/* ---------- Invalid ---------- */}
      {result?.outcome === "Invalid" && (
        <Card data-testid="bc-invalid" className="flex flex-col gap-4 p-6">
          <BlockRenderer blocks={invalidBlocks(result)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => inputRef.current?.focus()}>
              Edit Input
            </Button>
            <Button onClick={() => submit()}>Retry</Button>
            <Button onClick={() => submit(result.raw.replace(/[()]/g, ""))}>Use Raw Search</Button>
            <Button onClick={() => bcCopy(ctx, result.raw, "ค่าดิบ")}>Copy Raw Value</Button>
          </div>
        </Card>
      )}

      {/* ---------- Recent scans ---------- */}
      <Card data-testid="bc-recent" className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-h3 font-semibold">Recent Scans</span>
          <Button onClick={() => router.push("/m/scan-history")}>
            <Icon name="clock" size={16} strokeWidth={2} />
            Scan History
          </Button>
        </div>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Scanned Code</Th>
                <Th>Recognized Type</Th>
                <Th>Result Name</Th>
                <Th>Status</Th>
                <Th>Warehouse / Customer</Th>
                <Th>Scanned At</Th>
                <Th>Scanned By</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.code}>
                  <Td>
                    <span className="tnum font-medium">{s.scanned}</span>
                  </Td>
                  <Td muted>{s.codeType}</Td>
                  <Td>{s.resultName || "—"}</Td>
                  <Td>
                    <Badge tone={OUTCOME_TONE[s.outcome] ?? "neutral"}>{s.outcome}</Badge>
                  </Td>
                  <Td muted>{s.warehouse}</Td>
                  <Td muted>{s.when}</Td>
                  <Td muted>{s.user}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="text-cap text-primary hover:underline"
                        onClick={() => submit(s.scanned)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="text-cap text-ink-3 hover:underline"
                        onClick={() => bcCopy(ctx, s.scanned)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="text-cap text-danger hover:underline"
                        onClick={() => bcRemoveScan(ctx, s.code)}
                      >
                        Remove
                      </button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* ---------- Help ---------- */}
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Card data-testid="bc-help" className="flex flex-col gap-3 p-6">
          <span className="text-h3 font-semibold">Examples</span>
          <div className="flex flex-col gap-2">
            {helpExamples().map((e) => (
              <button
                key={e.code}
                type="button"
                onClick={() => submit(e.code)}
                className="flex flex-col rounded-btn border border-line px-3 py-2 text-left hover:border-primary"
              >
                <span className="tnum text-cap font-medium">{e.code}</span>
                <span className="text-cap text-ink-3">{e.note}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <span className="text-h3 font-semibold">Supported Code Types</span>
          <div className="flex flex-wrap gap-2">
            {supportedTypes().map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>

          <span className="text-cap font-semibold text-ink-2">Document Prefixes</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {docPrefixHelp().map((p) => (
              <span key={p.prefix} className="text-cap text-ink-3">
                <span className="font-semibold text-ink-2">{p.prefix}</span> → {p.type}
              </span>
            ))}
          </div>

          <span className="text-cap font-semibold text-ink-2">Catalogue</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {(
              [
                ["Product Barcodes", summary.productBarcodes],
                ["Lots", summary.lots],
                ["Serials", summary.serials],
                ["Locations", summary.locations],
                ["Packages", summary.packages],
                ["Documents", summary.documents],
                ["Scans Logged", summary.scans],
                ["Unresolved Scans", summary.notFound],
              ] as [string, number][]
            ).map(([label, n]) => (
              <span key={label} className="flex justify-between gap-3 text-cap">
                <span className="text-ink-3">{label}</span>
                <span className="tnum font-medium">{fmt(n)}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
