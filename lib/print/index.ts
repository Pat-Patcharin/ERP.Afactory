import { getCopyDef, getPrintConfig } from "./config";
import { mapDocument } from "./mapper";
import { paginate } from "./pagination";
import { allowedCopyTypes, applyPrintPermissions, canPrint, printedBy } from "./permissions";
import { isReprint, printCount } from "./audit";
import { validatePrint } from "./validate";
import type { CopyType, PrintDocType, PrintJob } from "./types";

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
}

export function buildPrintJob(
  docType: PrintDocType,
  code: string,
  options: BuildOptions = {},
): PrintJob | null {
  const config = getPrintConfig(docType);
  if (!config) return null;

  const mapped = mapDocument({ entity: config.entity, code }, config);
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
  };
}

/** dd/mm/yyyy HH:mm in the Buddhist era every other stamp in the app uses. */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
export { recordPrint, recordPreview, printCount, resetPrintCounts } from "./audit";
export { validatePrint } from "./validate";
export { mapDocument, printCompany, defaultBank } from "./mapper";
