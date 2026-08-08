import { getCopyDef, getPrintConfig } from "./config";
import { mapDocument } from "./mapper";
import { paginate } from "./pagination";
import { allowedCopyTypes, applyPrintPermissions, canPrint, printedBy } from "./permissions";
import { isReprint, printCount } from "./audit";
import { validatePrint } from "./validate";
import type { CopyType, PrintDoc, PrintDocType, PrintJob } from "./types";
import { beYear, toBuddhistText } from "@/lib/format";

/* ============================================================
   THE ENGINE

   One entry point. Give it a document type, a record code and a
   copy type; it returns a fully planned job — pages, totals,
   permissions applied, problems found.

   Nothing renders until this has run, which is what makes
   "Page 1 of 3" possible and what stops a document printing
   with a missing tax ID.
   ============================================================ */

export interface BuildOptions {
  copyType?: CopyType;
  /** Override the billing/delivery address chosen for a multi-address partner. */
  billToAddress?: string;
  shipToAddress?: string;
  /**
   * Print something that is not in the store yet.
   *
   * The quotation editor previews what the salesperson has typed, before it
   * has been saved — so the job is built from a document the caller mapped,
   * rather than from a record looked up by code.
   */
  document?: PrintDoc;
  /** Diagonal stamp for an unissued document. */
  watermark?: string;
}

export function buildPrintJob(
  docType: PrintDocType,
  code: string,
  options: BuildOptions = {},
): PrintJob | null {
  const config = getPrintConfig(docType);
  if (!config) return null;

  const mapped = options.document ?? mapDocument({ entity: config.entity, code }, config);
  if (!mapped) return null;

  /* A document already printed is a reprint even if ORIGINAL was asked for —
     the label is a fact about the document, not a user preference. */
  const requested = options.copyType ?? "ORIGINAL";
  const allowed = allowedCopyTypes(config);
  const copyType: CopyType = allowed.includes(requested) ? requested : (allowed[0] ?? "ORIGINAL");

  const doc = applyPrintPermissions(mapped, config, copyType);

  /* Address overrides, for a partner with more than one on file. */
  if (options.billToAddress) doc.billTo = { ...doc.billTo, address: options.billToAddress };
  if (options.shipToAddress) doc.shipTo = { ...doc.shipTo, address: options.shipToAddress };

  /* ----------------------------------------------------------
     ONE ERA PER SHEET.

     Document dates reach here in whatever era their module
     stores — the sales chain in BE, invoices and shipments in
     CE — while the printed-at stamp below has always been BE.
     A quotation raised today therefore printed "08/08/2026" as
     its document date beside "08/08/2569" as its print time, on
     the same page, going to a customer.

     Normalising to BE here is the smallest change that stops
     that leaving the building. It is a stopgap: D4 settles the
     era for the whole application at the display layer, and
     this block goes when it does. Until then a sheet is
     internally consistent, which is what the customer sees.
     ---------------------------------------------------------- */
  normaliseEra(doc);

  const pages = paginate(doc.lines, config);
  const copy = getCopyDef(copyType);
  const reprintOf = printCount(config.documentType, code);

  return {
    config,
    doc,
    copyType,
    copyLabelEN: reprintOf > 0 ? "REPRINT" : copy.labelEN,
    copyLabelTH: reprintOf > 0 ? "พิมพ์ซ้ำ" : copy.labelTH,
    copyAudience: copy.audience,
    reprintOf,
    printedBy: printedBy(),
    printedAt: stamp(),
    pages,
    totalPages: pages.length,
    issues: validatePrint(doc, config, copyType),
    watermark: options.watermark ?? (reprintOf > 0 ? "REPRINT" : undefined),
  };
}

/**
 * dd/mm/yyyy HH:mm in the Buddhist era, matching the sheet.
 *
 * The comment here used to claim this was "the Buddhist era every other
 * stamp in the app uses". It is not: `format.stamp()` produces Gregorian,
 * and that mismatch is half of why a sheet could carry two eras.
 */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${beYear(d.getFullYear())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Put every date on the sheet into the Buddhist era, in place.
 *
 * Walks the display strings rather than naming fields: the mapper sets dates
 * in forty-odd places across ten document types, and a list of field paths
 * would fall behind the first time one was added. `toBuddhistText` only
 * touches dd/mm/yyyy runs, and is idempotent, so a document already in BE is
 * left alone.
 */
function normaliseEra(doc: PrintDoc): void {
  doc.date = toBuddhistText(doc.date);
  doc.meta = doc.meta.map((m) => ({ ...m, value: toBuddhistText(m.value) }));
  doc.remarks = (doc.remarks ?? []).map(toBuddhistText);
  doc.lines = doc.lines.map((l) => ({
    ...l,
    description: toBuddhistText(l.description),
    extraLines: (l.extraLines ?? []).map(toBuddhistText),
  }));
}

export const canPrintDocument = canPrint;
export { isReprint };

export * from "./types";
export {
  COPY_TYPES,
  COLUMN_LABELS,
  META_LABELS,
  PRINT_CONFIGS,
  PRINT_DOC_TYPES,
  SIGNATURE_LABELS,
  getCopyDef,
  getPrintConfig,
  printTypesFor,
} from "./config";
export { paginate, rowUnits, totalRowUnits, fillerRows } from "./pagination";
export { bahtText, thaiNumberText } from "./words";
export { allowedCopyTypes, canSeePrice, canSeeTax, visibleColumns } from "./permissions";
export { recordPrint, recordPreview, printCount, resetPrintCounts, pdfFilename } from "./audit";
export { validatePrint } from "./validate";
export { mapDocument, mapQuotationRevision, printCompany, defaultBank } from "./mapper";
