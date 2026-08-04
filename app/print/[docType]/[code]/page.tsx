"use client";

import { useParams, useSearchParams } from "next/navigation";
import { PrintPreview } from "@/components/print/PrintPreview";
import { COPY_TYPES, PRINT_DOC_TYPES } from "@/lib/print";
import type { CopyType, PrintDocType } from "@/lib/print/types";

/**
 * Generic print route. One file serves all sixteen document types —
 * /print/delivery-order/DO2506-0001, /print/tax-invoice/INV-2026-000025.
 *
 * The document type is part of the URL rather than a query flag so a print
 * link can be shared, bookmarked and reopened to the same sheet. The copy
 * type is a query flag because it is a choice about one printing, not about
 * which document is being looked at.
 */
export default function PrintRoute() {
  const params = useParams<{ docType: string; code: string }>();
  const search = useSearchParams();
  const docType = decodeURIComponent(params.docType ?? "");
  const code = decodeURIComponent(params.code ?? "");

  const asked = (search.get("copy") ?? "").toUpperCase();
  const copy: CopyType = asked in COPY_TYPES ? (asked as CopyType) : "ORIGINAL";

  if (!PRINT_DOC_TYPES.includes(docType as PrintDocType)) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface p-6 text-center">
        <div>
          <p className="text-h3 font-semibold">ไม่รู้จักประเภทเอกสาร</p>
          <p className="mt-2 text-ink-2">{docType}</p>
        </div>
      </div>
    );
  }

  return <PrintPreview docType={docType as PrintDocType} code={code} initialCopy={copy} />;
}
