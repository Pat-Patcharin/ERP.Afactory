import { canSeePrice } from "./permissions";
import type { CopyType, PrintConfig, PrintDoc, PrintIssue } from "./types";

/* ============================================================
   PRE-PRINT VALIDATION

   A printed tax document is evidence. Once it leaves the printer
   the mistake is in the customer's hands, so the checks that
   matter run BEFORE the page renders, not after.

   Blocking issues stop the print. Non-blocking ones are shown
   and the user decides — a missing tracking number is worth
   knowing about, but it is not worth refusing to print over.
   ============================================================ */

export function validatePrint(
  doc: PrintDoc,
  config: PrintConfig,
  copyType: CopyType,
): PrintIssue[] {
  const issues: PrintIssue[] = [];
  const block = (field: string, message: string) =>
    issues.push({ field, message, blocking: true });
  const warn = (field: string, message: string) =>
    issues.push({ field, message, blocking: false });

  /* ---- Identity ---- */
  if (!doc.code) block("code", "เอกสารไม่มีเลขที่");
  if (!doc.date) block("date", "เอกสารไม่มีวันที่");
  if (!doc.billTo.name) block("billTo", "เอกสารไม่มีชื่อลูกค้า");
  if (!doc.billTo.address) block("billTo.address", "ไม่พบที่อยู่สำหรับออกบิลของลูกค้า");

  if (config.showShipTo && !doc.shipTo.address) {
    warn("shipTo.address", "ไม่พบที่อยู่จัดส่ง — ระบบจะใช้ที่อยู่ออกบิลแทน");
  }

  /* ---- Lines ---- */
  if (!doc.lines.length) block("lines", "เอกสารไม่มีรายการสินค้า");

  for (const l of doc.lines) {
    if (l.qty < 0) block(`line.${l.no}`, `รายการที่ ${l.no} มีจำนวนติดลบ`);
  }
  if (doc.lines.length && doc.lines.every((l) => l.qty === 0)) {
    warn("lines.qty", "ทุกรายการมีจำนวนเป็นศูนย์");
  }

  /* Lot and serial are only required where the document is the record of
     which physical goods moved. */
  if (config.showLot) {
    const missing = doc.lines.filter((l) => !l.lot).length;
    if (missing) warn("lines.lot", `${missing} รายการไม่มีเลขที่ล็อต`);
  }
  if (config.showSerial) {
    const missing = doc.lines.filter((l) => !l.serial).length;
    if (missing) warn("lines.serial", `${missing} รายการไม่มีหมายเลขเครื่อง`);
  }

  /* ---- Tax ---- */
  const isTaxDoc = /tax-invoice|receipt-tax/.test(config.documentType);
  if (isTaxDoc) {
    if (!doc.billTo.taxId) {
      block("billTo.taxId", "ใบกำกับภาษีต้องมีเลขประจำตัวผู้เสียภาษีของลูกค้า");
    }
    if (!doc.company.taxId) {
      block("company.taxId", "ยังไม่ได้ตั้งเลขประจำตัวผู้เสียภาษีของบริษัท");
    }
  }

  /* ---- Money ---- */
  if (config.showTotals && canSeePrice(config, copyType)) {
    if (!doc.totals) {
      block("totals", "เอกสารนี้ต้องแสดงยอดรวม แต่ไม่พบข้อมูลยอดรวม");
    } else if (doc.totals.grandTotal < 0) {
      warn("totals.grandTotal", "ยอดรวมติดลบ — ตรวจสอบก่อนพิมพ์");
    }

    if (config.showPayment && !doc.bank) {
      block("bank", "เอกสารนี้แสดงข้อมูลการชำระเงิน แต่ยังไม่ได้ตั้งบัญชีธนาคารหลัก");
    }
  }

  /* ---- Configuration ---- */
  if (config.showSignatures && !config.signatureRoles.length) {
    block("signatures", "ยังไม่ได้กำหนดช่องลงนามของเอกสารนี้");
  }
  if (!config.supportedCopyTypes.includes(copyType)) {
    block("copyType", `เอกสารนี้ไม่รองรับสำเนาประเภท ${copyType}`);
  }

  return issues;
}

export const blockingIssues = (issues: PrintIssue[]) => issues.filter((i) => i.blocking);
