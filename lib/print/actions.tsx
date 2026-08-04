import type { ActionCtx, RecordBase, RowAction } from "@/lib/types";
import { getPrintConfig, printTypesFor } from "./config";
import { allowedCopyTypes, canPrint } from "./permissions";
import { printCount } from "./audit";
import type { CopyType, PrintDocType } from "./types";

/* ============================================================
   PRINT ACTIONS

   The menu every outbound module gets, built from the same
   config the engine reads. A module calls `printActions(entity)`
   and inherits Print Preview, every document variant its source
   supports, and every copy type the acting role may produce.

   Nothing about printing is written into an outbound schema —
   which is the whole point: adding a copy type or a document
   variant must not mean editing ten files.
   ============================================================ */

const COPY_LABEL: Record<CopyType, string> = {
  ORIGINAL: "Print Original",
  CUSTOMER: "Print Customer Copy",
  COMPANY: "Print Company Copy",
  ACCOUNTING: "Print Accounting Copy",
  WAREHOUSE: "Print Warehouse Copy",
  DELIVERY: "Print Delivery Copy",
  REPRINT: "Reprint",
};

const href = (docType: PrintDocType, code: string, copy?: CopyType) =>
  `/print/${docType}/${encodeURIComponent(code)}${copy && copy !== "ORIGINAL" ? `?copy=${copy}` : ""}`;

/**
 * Build the print block of a detail page's More Actions menu.
 *
 * Returns an empty list when the role may not print the module at all, so a
 * schema can splice it in unconditionally.
 */
export function printActions<T extends RecordBase>(
  entity: string,
  record: T,
  ctx: ActionCtx,
): RowAction<T>[] {
  const types = printTypesFor(entity);
  if (!types.length) return [];

  const primary = getPrintConfig(types[0]);
  if (!primary || !canPrint(primary)) return [];

  const out: RowAction<T>[] = [
    { sep: true },
    {
      label: "Print Preview",
      icon: "eye",
      run: (r) => ctx.goto(href(types[0], r.code)),
    },
  ];

  /* A source with more than one printable document — a Delivery Order prints
     with price, without price, or as a tax invoice — lists them all. */
  if (types.length > 1) {
    for (const t of types.slice(1)) {
      const cfg = getPrintConfig(t)!;
      out.push({
        label: `Print ${cfg.titleEN}`,
        icon: "printer",
        run: (r) => ctx.goto(href(t, r.code)),
      });
    }
  }

  /* Copy types the acting role is actually allowed to produce. */
  for (const copy of allowedCopyTypes(primary)) {
    if (copy === "REPRINT") continue;
    out.push({
      label: COPY_LABEL[copy],
      icon: "printer",
      run: (r) => ctx.goto(href(types[0], r.code, copy)),
    });
  }

  /* Reprint is offered only once the document has actually been printed —
     otherwise it is the original, and labelling it otherwise is a lie. */
  const printed = printCount(primary.documentType, record.code) > 0;
  out.push({
    label: "Reprint",
    icon: "copy",
    disabled: !printed,
    disabledReason: "เอกสารนี้ยังไม่เคยพิมพ์ — การพิมพ์ครั้งแรกคือต้นฉบับ",
    run: (r) => ctx.goto(href(types[0], r.code, "REPRINT")),
  });

  out.push({
    label: "Export PDF",
    icon: "download",
    run: () =>
      ctx.toast(
        "ส่งออก PDF",
        "เปิด Print Preview แล้วเลือก Save as PDF — ตัวสร้าง PDF ฝั่งเซิร์ฟเวอร์ยังไม่เปิดใช้",
        "info",
      ),
  });

  return out;
}
