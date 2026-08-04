import { can, canViewField, currentRole, currentUser, getRole } from "@/lib/domain/admin";
import { getCopyDef } from "./config";
import type { CopyType, PrintConfig, PrintDoc, PrintLine } from "./types";

/* ============================================================
   PRINT PERMISSIONS

   Two rules, both enforced on the DATA rather than in CSS:

     · may this user print this document at all?
     · may they see money on it?

   A price the acting role must not see is set to null in the
   mapped document before it reaches the renderer, so it is never
   in the DOM. Hiding it with a stylesheet would leave it in the
   page source, in the print spool, and in a saved PDF.
   ============================================================ */

/** Copies that expose accounting detail need more than "may open the module". */
const RESTRICTED_COPIES: Record<string, string> = {
  ACCOUNTING: "sales-invoice",
};

export const canPrint = (config: PrintConfig): boolean => can(config.entity, "print");

/** Money on a printed document — the selling price, not internal cost. */
export function canSeePrice(config: PrintConfig, copyType: CopyType): boolean {
  if (!config.showPrice) return false;
  if (getCopyDef(copyType).hidePrice) return false;
  /* A role that cannot open the module at all has no business with its
     figures either, even if someone hands them the URL. */
  return can(config.entity, "view");
}

export function canSeeTax(config: PrintConfig, copyType: CopyType): boolean {
  if (!config.showTax) return false;
  if (getCopyDef(copyType).hideTax) return false;
  return canSeePrice(config, copyType);
}

/**
 * Copy types this user may actually produce.
 *
 * An Accounting Copy carries payment and tax references, so it needs sight of
 * the invoice module; a Sales Rep printing their own delivery note does not
 * get one. Super Admin gets everything.
 */
export function allowedCopyTypes(config: PrintConfig): CopyType[] {
  const role = currentRole();
  if (role?.all) return config.supportedCopyTypes;

  return config.supportedCopyTypes.filter((c) => {
    const needs = RESTRICTED_COPIES[c];
    return !needs || can(needs, "view");
  });
}

export const canPrintCopy = (config: PrintConfig, copyType: CopyType): boolean =>
  allowedCopyTypes(config).includes(copyType);

/**
 * Strip what this user may not see. Returns a new document — the mapped one
 * is never mutated, so the same source can be rendered again for a different
 * copy type without leaking the first one's visibility.
 */
export function applyPrintPermissions(
  doc: PrintDoc,
  config: PrintConfig,
  copyType: CopyType,
): PrintDoc {
  const price = canSeePrice(config, copyType);
  const tax = canSeeTax(config, copyType);

  if (price && tax) return doc;

  const strip = (l: PrintLine): PrintLine => ({
    ...l,
    unitPrice: price ? l.unitPrice : null,
    discount: price ? l.discount : null,
    netPrice: price ? l.netPrice : null,
    amount: price ? l.amount : null,
    vatRate: tax ? l.vatRate : null,
  });

  return {
    ...doc,
    lines: doc.lines.map(strip),
    /* No prices means no totals block — a grand total is a price. */
    totals: price ? doc.totals : null,
    bank: price ? doc.bank : null,
  };
}

/** Columns to drop once permissions have taken the values away. */
export function visibleColumns(config: PrintConfig, copyType: CopyType) {
  const price = canSeePrice(config, copyType);
  const tax = canSeeTax(config, copyType);
  const copy = getCopyDef(copyType);

  return config.itemColumns.filter((c) => {
    if (["unitPrice", "discount", "netPrice", "amount"].includes(c)) return price;
    if (c === "vat") return tax;
    /* The warehouse copy earns its warehouse columns even where the base
       document did not ask for them. */
    if (["warehouse", "location", "bin"].includes(c)) {
      return config.showWarehouse || config.showLocation || copy.forceWarehouseDetail;
    }
    return true;
  });
}

/** Who the footer names as having printed this. */
export const printedBy = (): string => currentUser().name;

export const printerRoleName = (): string =>
  getRole(currentUser().roleCode)?.name ?? currentUser().roleCode;

/** Internal cost never appears on a customer-facing document, for anyone. */
export const canSeeInternalCost = (): boolean => canViewField("cost");
