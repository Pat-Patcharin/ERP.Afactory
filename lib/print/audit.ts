import { audit } from "@/lib/domain/admin";
import type { CopyType, PrintConfig } from "./types";

/* ============================================================
   PRINT AUDIT

   Every print is logged, and a second print of the same document
   is logged as a REPRINT with its sequence number.

   The reason this matters is not tidiness: a delivery note or a
   tax invoice printed twice can be presented twice. A reprint
   that looks identical to the original is a control failure, so
   the count is kept here and stamped on the page.
   ============================================================ */

/** documentType:code → how many times it has been printed this session. */
const printCounts = new Map<string, number>();

const key = (docType: string, code: string) => `${docType}:${code}`;

/** How many times this document has already been printed. 0 = never. */
export const printCount = (docType: string, code: string): number =>
  printCounts.get(key(docType, code)) ?? 0;

/** A document printed before is a reprint, whatever copy type is chosen. */
export const isReprint = (docType: string, code: string): boolean =>
  printCount(docType, code) > 0;

/** How the document left the system. A PDF can be presented like paper. */
export type PrintChannel = "print" | "pdf";

/**
 * Record a print. Returns the sequence: 1 for the original, 2+ for reprints.
 * Called when the user actually prints, not when the preview opens — opening
 * a preview is reading, not issuing.
 *
 * A PDF export counts the same way and against the same counter: a saved PDF
 * of a delivery note can be sent to the customer exactly as a printed one
 * can, so treating it as a lesser act would leave a hole in the control.
 */
export function recordPrint(
  config: PrintConfig,
  code: string,
  copyType: CopyType,
  pages: number,
  channel: PrintChannel = "print",
): number {
  const k = key(config.documentType, code);
  const seq = (printCounts.get(k) ?? 0) + 1;
  printCounts.set(k, seq);

  const verb = channel === "pdf" ? "ส่งออก PDF" : "พิมพ์";
  const reprint = seq > 1;
  audit(
    "Print",
    config.entity,
    reprint
      ? `${verb}ซ้ำครั้งที่ ${seq - 1} — ${config.titleEN} (${copyType}) ${pages} หน้า`
      : `${verb} ${config.titleEN} (${copyType}) ${pages} หน้า`,
    code,
  );

  return seq;
}

/**
 * Filename the browser offers when the user chooses Save as PDF — it takes
 * the document title, so setting that before printing is what turns
 * "document.pdf" into "DELIVERY-ORDER_DO2507-0006_ORIGINAL.pdf".
 */
export function pdfFilename(config: PrintConfig, code: string, copyType: CopyType): string {
  return [config.titleEN, code, copyType]
    .join("_")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");
}

/** Preview opening is a read, logged separately so it cannot be mistaken for issuing. */
export function recordPreview(config: PrintConfig, code: string): void {
  audit("Print", config.entity, `เปิดตัวอย่างก่อนพิมพ์ — ${config.titleEN}`, code);
}

/** Test and session helper — the counter is in-memory, like the rest of the mock state. */
export const resetPrintCounts = (): void => {
  printCounts.clear();
};
