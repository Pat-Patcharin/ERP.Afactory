"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  allowedCopyTypes,
  buildPrintJob,
  getCopyDef,
  getPrintConfig,
  mapQuotationRevision,
  pdfFilename,
  printTypesFor,
  recordPrint,
} from "@/lib/print";
import type { CopyType, PrintDocType } from "@/lib/print/types";
import { findRecord } from "@/schemas/registry";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import { Badge, Button, Select } from "@/components/ui";
import { PrintDocument } from "./PrintDocument";

/* ============================================================
   PRINT PREVIEW

   Full screen, no application chrome, showing exactly the sheets
   that will come out of the printer — same components, same CSS,
   only a zoom transform and a grey canvas between them.

   The toolbar is marked `no-print`, so the thing being previewed
   and the thing being printed are literally the same DOM.
   ============================================================ */

const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5];

/** An A4 sheet is 210 × 297mm; CSS resolves mm at 96dpi. */
const SHEET_PX = (210 / 25.4) * 96;
const SHEET_HEIGHT_PX = (297 / 25.4) * 96;

/** Zoom that puts one whole sheet across the viewport, with room to breathe. */
function fitWidthZoom(): number {
  if (typeof window === "undefined") return 0.8;
  const usable = window.innerWidth - 64;
  return Math.min(1.5, Math.max(0.3, Math.round((usable / SHEET_PX) * 100) / 100));
}

export function PrintPreview({
  docType,
  code,
  /* Which copy the caller asked for — "Print Warehouse Copy" in a detail
     menu opens straight onto that copy rather than onto the original. */
  initialCopy = "ORIGINAL",
  /* "Export PDF" in a detail menu opens the save dialog on arrival; the user
     already said what they wanted, so making them click again is friction. */
  autoPdf = false,
  /* Show a stored revision instead of the live record. Quotation only — it is
     the only document that keeps issue snapshots. */
  revision,
}: {
  docType: PrintDocType;
  code: string;
  initialCopy?: CopyType;
  autoPdf?: boolean;
  revision?: number;
}) {
  const router = useRouter();
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);

  const [type, setType] = useState<PrintDocType>(docType);
  const [copyType, setCopyType] = useState<CopyType>(initialCopy);
  const [zoom, setZoom] = useState(0.8);
  const [page, setPage] = useState(1);

  const config = getPrintConfig(type);
  const job = useMemo(() => {
    /* A revision renders from its snapshot, so the engine never shows today's
       figures under an old issue number. */
    if (revision && type === "quotation" && config) {
      const document = mapQuotationRevision(code, revision, config);
      if (!document) return null;
      return buildPrintJob(type, code, { copyType, document });
    }
    return buildPrintJob(type, code, { copyType });
  }, [type, code, copyType, revision, config]);

  /* Sibling documents from the same source — a Delivery Order can print with
     or without price, and both read the same record. */
  const siblings = useMemo(
    /* Filtered by the record: a Non VAT order must not be able to reach the
       VAT sheet from the dropdown either. */
    () =>
      config
        ? printTypesFor(
            config.entity,
            (findRecord(config.entity, code) as { billType?: string } | null) ?? undefined,
          )
        : [],
    [config, code],
  );
  const copies = useMemo(() => (config ? allowedCopyTypes(config) : []), [config]);

  /* Arriving from "Export PDF": open the save dialog once the sheets are on
     screen, so the user sees what is about to be saved. Held in a ref because
     the handler is defined below, after the not-found guard. */
  const issueRef = useRef<(channel: "print" | "pdf") => void>(() => {});
  useEffect(() => {
    if (!autoPdf) return;
    const t = window.setTimeout(() => issueRef.current("pdf"), 0);
    return () => window.clearTimeout(t);
  }, [autoPdf]);

  /* Sheets that outgrew A4. The engine plans in row units, which assumes one
     printed line per item; an unusually long description can still push a
     page over. Measuring the laid-out sheet is the only way to know, and a
     page that silently ran onto a second sheet at the printer is exactly the
     failure this preview exists to prevent. */
  const [overflowing, setOverflowing] = useState<number[]>([]);
  useEffect(() => {
    const sheets = Array.from(document.querySelectorAll<HTMLElement>(".a4-page"));
    const over = sheets
      .map((el, i) => ({ page: i + 1, h: el.getBoundingClientRect().height / (zoom || 1) }))
      /* 2px of tolerance for sub-pixel rounding; 0 means jsdom, not overflow. */
      .filter((s) => s.h > SHEET_HEIGHT_PX + 2)
      .map((s) => s.page);
    setOverflowing(over);
  }, [job, zoom]);

  if (!config || !job) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface p-6 text-center">
        <div>
          <p className="text-h3 font-semibold">ไม่พบเอกสารที่ต้องการพิมพ์</p>
          <p className="mt-2 text-ink-2">
            {code} — ตรวจสอบเลขที่เอกสารและประเภทเอกสารอีกครั้ง
          </p>
          <Button className="mt-5" onClick={() => router.back()}>
            กลับ
          </Button>
        </div>
      </div>
    );
  }

  const blocking = job.issues.filter((i) => i.blocking);
  const warnings = job.issues.filter((i) => !i.blocking);

  /**
   * Print, or save a PDF — the same act through the same dialog.
   *
   * The PDF is produced by the browser from these very sheets, so the text
   * stays selectable and the millimetre layout survives exactly. Rasterising
   * the page into an image-PDF instead would lose both, and would render Thai
   * worse than the printer does.
   */
  const issue = (channel: "print" | "pdf") => {
    if (blocking.length) {
      /* ERP modal, never alert() — and never a print that would produce a
         document missing something a tax office asks for. */
      confirm({
        title: channel === "pdf" ? "บันทึก PDF ไม่ได้" : "พิมพ์เอกสารไม่ได้",
        message: (
          <>
            <p className="mb-2">ต้องแก้ไขข้อมูลต่อไปนี้ก่อนจึงจะออกเอกสารได้</p>
            <ul className="list-disc pl-5">
              {blocking.map((i) => (
                <li key={i.field}>{i.message}</li>
              ))}
            </ul>
          </>
        ),
        confirmText: "เข้าใจแล้ว",
        onConfirm: () => {},
      });
      return;
    }

    const seq = recordPrint(config, code, job.copyType, job.totalPages, channel);

    /* The Save-as-PDF dialog offers the document title as the filename. */
    const previous = document.title;
    document.title = pdfFilename(config, code, job.copyType);
    const restore = () => {
      document.title = previous;
    };
    window.addEventListener("afterprint", restore, { once: true });
    /* Not every browser fires afterprint; never leave the tab renamed. */
    window.setTimeout(restore, 60_000);

    toast(
      seq > 1
        ? `${channel === "pdf" ? "ส่งออก PDF" : "พิมพ์"}ซ้ำครั้งที่ ${seq - 1}`
        : channel === "pdf"
          ? "บันทึกเป็น PDF"
          : "ส่งไปยังเครื่องพิมพ์แล้ว",
      channel === "pdf"
        ? `เลือกปลายทางเป็น "Save as PDF" หรือ "Microsoft Print to PDF" — ไฟล์จะชื่อ ${document.title}.pdf`
        : `${config.titleEN} ${code} · ${job.totalPages} หน้า`,
      seq > 1 ? "warning" : "success",
    );

    /* A browser with no print dialog (or one that refuses) must not take the
       preview down with it — the sheets on screen are still correct. */
    try {
      window.print();
    } catch {
      restore();
    }
  };

  issueRef.current = issue;

  const doPrint = () => issue("print");
  const exportPdf = () => issue("pdf");

  const fitWidth = useCallback(() => setZoom(fitWidthZoom()), []);

  const zoomStep = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
    setZoom(next);
  };

  const goPage = (n: number) => {
    const target = Math.min(job.totalPages, Math.max(1, n));
    setPage(target);
    const sheet = document.querySelector(`[data-testid="print-page-${target}"]`);
    /* Scrolling is a nicety; the page counter is the actual state. Never let
       a missing implementation take the button down with it. */
    if (typeof sheet?.scrollIntoView === "function") {
      sheet.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-[#e9ecef]">
      {/* ---------- Toolbar (never printed) ---------- */}
      <header
        data-testid="preview-toolbar"
        className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-card px-5 py-3 shadow-xs max-md:px-3"
      >
        <Button size="sm" onClick={() => router.back()}>
          <Icon name="arrowLeft" size={16} strokeWidth={2} />
          Close
        </Button>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold">
            {config.titleEN} · {code}
          </span>
          <span className="truncate text-cap text-ink-2">
            {config.titleTH} · {job.copyLabelTH} {job.copyAudience}
          </span>
        </div>

        <Badge tone={job.reprintOf > 0 ? "warning" : "success"}>
          {job.copyLabelEN}
        </Badge>

        {/* Document variant, where the source supports more than one. */}
        {siblings.length > 1 && (
          <Select
            aria-label="Document Type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as PrintDocType);
              setPage(1);
            }}
            className="w-[210px] max-md:w-full"
          >
            {siblings.map((t) => (
              <option key={t} value={t}>
                {getPrintConfig(t)!.titleEN}
              </option>
            ))}
          </Select>
        )}

        <Select
          aria-label="Copy Type"
          /* The engine's resolved copy, not the requested one — a document
             that does not support the asked-for copy shows what it will
             actually print. */
          value={job.copyType}
          onChange={(e) => setCopyType(e.target.value as CopyType)}
          className="w-[180px] max-md:w-full"
        >
          {copies.map((c) => (
            <option key={c} value={c}>
              {getCopyDef(c).labelEN}
            </option>
          ))}
        </Select>

        {/* ---------- Zoom and paging ---------- */}
        <div className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0 max-md:w-full">
          <div className="flex items-center gap-1 rounded-btn border border-line bg-surface p-0.5">
            <Button size="sm" iconOnly aria-label="Zoom out" onClick={() => zoomStep(-1)}>
              <Icon name="minus" size={15} />
            </Button>
            <span className="w-12 text-center text-cap tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button size="sm" iconOnly aria-label="Zoom in" onClick={() => zoomStep(1)}>
              <Icon name="plus" size={15} />
            </Button>
            <Button size="sm" onClick={fitWidth}>
              Fit Width
            </Button>
          </div>

          <div className="flex items-center gap-1 rounded-btn border border-line bg-surface p-0.5">
            <Button
              size="sm"
              iconOnly
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
            >
              <Icon name="chevronLeft" size={15} />
            </Button>
            <span className="whitespace-nowrap px-1 text-cap tabular-nums">
              Page {page} of {job.totalPages}
            </span>
            <Button
              size="sm"
              iconOnly
              aria-label="Next page"
              disabled={page >= job.totalPages}
              onClick={() => goPage(page + 1)}
            >
              <Icon name="chevronRight" size={15} />
            </Button>
          </div>

          <Button size="sm" onClick={exportPdf}>
            <Icon name="download" size={16} strokeWidth={2} />
            Export PDF
          </Button>
          <Button size="sm" variant="primary" onClick={doPrint}>
            <Icon name="printer" size={16} strokeWidth={2} />
            Print
          </Button>
        </div>
      </header>

      {/* ---------- Sheets that will not fit ---------- */}
      {overflowing.length > 0 && (
        <div
          data-testid="preview-overflow"
          className="no-print border-b border-warning/30 bg-warning-soft px-5 py-3 text-warning-text max-md:px-3"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Icon name="alert" size={16} />
            หน้า {overflowing.join(", ")} ยาวเกินกระดาษ A4 — เนื้อหาจะไหลไปหน้าถัดไปตอนพิมพ์
          </p>
          <p className="mt-1 text-cap">
            ลดจำนวนบรรทัดต่อหน้าของเอกสารนี้ได้ที่ Administration → Document Templates
          </p>
        </div>
      )}

      {/* ---------- Validation banner ---------- */}
      {(blocking.length > 0 || warnings.length > 0) && (
        <div
          data-testid="preview-issues"
          className={cn(
            "no-print border-b px-5 py-3 max-md:px-3",
            blocking.length
              ? "border-danger/30 bg-danger-soft text-danger-text"
              : "border-warning/30 bg-warning-soft text-warning-text",
          )}
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Icon name={blocking.length ? "alert" : "info"} size={16} />
            {blocking.length
              ? `ต้องแก้ไข ${blocking.length} รายการก่อนพิมพ์`
              : `ข้อควรทราบ ${warnings.length} รายการ`}
          </p>
          <ul className="mt-1 list-disc pl-6 text-cap">
            {[...blocking, ...warnings].map((i, n) => (
              <li key={`${i.field}-${n}`}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- The sheets ---------- */}
      <div
        data-testid="preview-canvas"
        style={{ zoom }}
        className="origin-top"
      >
        <PrintDocument job={job} />
      </div>
    </div>
  );
}
