import { COLUMN_LABELS, SIGNATURE_LABELS, fillerRows } from "@/lib/print";
import { visibleColumns } from "@/lib/print/permissions";
import type { ItemColumn, PrintJob, PrintLine, PrintPage } from "@/lib/print/types";
import { AFactoryLogo, AllInOneMark, BarcodePlaceholder, QRPlaceholder } from "./marks";

/* ============================================================
   PRINT RENDERER

   Draws the pages the engine planned. It makes no decisions of
   its own: which columns exist, which page carries the totals
   and how many blank rows pad a short page were all settled
   before this component was called.

   That split is what keeps sixteen document types on one
   template — the renderer has nothing to branch on except
   "first page", "middle", "last".
   ============================================================ */

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? ""
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number) => n.toLocaleString("en-US");

/**
 * Column widths in percent of the table.
 *
 * Description has no fixed width: it takes what the others leave. A document
 * with eleven columns would otherwise squeeze it to a few millimetres and
 * wrap every product name over four lines, which pushes the sheet past its
 * planned height — the paginator counted one row unit, not four.
 */
const COL_WIDTH: Partial<Record<ItemColumn, number>> = {
  no: 3.6,
  code: 11,
  warehouse: 8.5,
  location: 7.5,
  bin: 7.5,
  lot: 9.5,
  serial: 10,
  package: 7,
  qty: 6.5,
  requiredQty: 6.5,
  pickedQty: 6.5,
  weight: 6.5,
  uom: 5.5,
  unitPrice: 8.5,
  discount: 6,
  netPrice: 8.5,
  vat: 5,
  amount: 9.5,
};

/** Description never drops below this share of the table. */
const MIN_DESCRIPTION = 28;

/**
 * Resolve the widths for one document's columns.
 *
 * The fixed columns are scaled down together when they would leave the
 * description too little — narrowing every number column a shade is far
 * better than making the item name unreadable.
 */
export function columnWidths(cols: ItemColumn[]): Record<string, string> {
  const fixed = cols.filter((c) => c !== "description");
  const asked = fixed.reduce((t, c) => t + (COL_WIDTH[c] ?? 7), 0);
  const hasDescription = cols.includes("description");
  if (!hasDescription) {
    /* No description: share the table out in the declared proportions. */
    const out: Record<string, string> = {};
    for (const c of fixed) out[c] = `${(((COL_WIDTH[c] ?? 7) / asked) * 100).toFixed(2)}%`;
    return out;
  }

  const budget = 100 - MIN_DESCRIPTION;
  const scale = asked > budget ? budget / asked : 1;

  const out: Record<string, string> = {};
  let used = 0;
  for (const c of fixed) {
    const w = (COL_WIDTH[c] ?? 7) * scale;
    used += w;
    out[c] = `${w.toFixed(2)}%`;
  }
  out.description = `${(100 - used).toFixed(2)}%`;
  return out;
}

function cellValue(line: PrintLine, col: ItemColumn): string {
  switch (col) {
    case "no": return String(line.no);
    case "code": return line.code;
    case "description": return line.description;
    case "warehouse": return line.warehouse;
    case "location": return line.location;
    case "bin": return line.bin;
    case "lot": return line.lot;
    case "serial": return line.serial;
    case "package": return line.packageNo;
    case "qty": return qty(line.qty);
    case "requiredQty": return qty(line.requiredQty);
    case "pickedQty": return qty(line.pickedQty);
    case "weight": return line.weight ? `${line.weight} kg` : "";
    case "uom": return line.uom;
    case "unitPrice": return money(line.unitPrice);
    case "discount": return line.discount ? `${line.discount}%` : line.discount === 0 ? "0.00" : "";
    case "netPrice": return money(line.netPrice);
    case "vat": return line.vatRate === null ? "" : `${line.vatRate}%`;
    case "amount": return money(line.amount);
    default: return "";
  }
}

/* ---------- Header ---------- */

function CompanyBlock({ job }: { job: PrintJob }) {
  const c = job.doc.company;
  return (
    <div style={{ display: "flex", gap: "3mm", alignItems: "flex-start", minWidth: 0 }}>
      <AFactoryLogo size={15} src={c.logoUrl} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "11.5pt", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.05 }}>
          {c.nameEN}
        </div>
        <div style={{ fontSize: "8pt", fontWeight: 600 }} className="a4-muted">
          {c.nameTH}
        </div>
        <div style={{ marginTop: "1.2mm", fontSize: "7pt" }} className="a4-muted">
          <div>
            {c.branch} {c.address}
          </div>
          <div>
            เลขประจำตัวผู้เสียภาษี {c.taxId} · โทร. {c.phone}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The letterhead band that closes every sheet — the company's own printed
 * footer: address on the left, the ways to reach them on the right, the
 * ALL IN · ONE lockup and the QR.
 */
function LetterheadFooter({ job }: { job: PrintJob }) {
  const c = job.doc.company;
  return (
    <div style={{ marginTop: "auto", paddingTop: "2.5mm" }}>
      {/* The short orange rule the artwork opens with. */}
      <div
        style={{
          width: "14mm",
          height: "1.4mm",
          background: "var(--pr-orange)",
          borderRadius: "0.4mm",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: "4mm",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginTop: "1.8mm",
        }}
      >
        <div style={{ fontSize: "6.9pt", lineHeight: 1.45, minWidth: 0 }} className="a4-muted">
          <div>
            {c.branch} : {c.address}
          </div>
          <div>เลขประจำตัวผู้เสียภาษี {c.taxId}</div>
        </div>

        <div style={{ display: "flex", gap: "3mm", alignItems: "flex-end", flexShrink: 0 }}>
          <div style={{ fontSize: "6.9pt", lineHeight: 1.5, textAlign: "right" }}>
            <div style={{ fontWeight: 700 }}>โทร. {c.phone}</div>
            {c.line && <div className="a4-muted">LINE {c.line}</div>}
            {c.facebook && <div className="a4-muted">Facebook {c.facebook}</div>}
            <div style={{ color: "var(--pr-orange)", fontWeight: 700 }}>{c.website}</div>
          </div>

          {c.tagline && <AllInOneMark label={c.tagline} />}
          {job.config.showQRCode && <QRPlaceholder value={c.website} size={13} />}
        </div>
      </div>
    </div>
  );
}

function TitleBlock({ job }: { job: PrintJob }) {
  const { config, doc } = job;
  return (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div className="a4-title">{config.titleEN}</div>
      <div style={{ fontSize: "8.4pt" }} className="a4-muted">
        {config.titleTH}
      </div>
      <div className="a4-docno" style={{ marginTop: "1mm" }}>
        {doc.code}
      </div>
      <div style={{ marginTop: "1.5mm", display: "flex", gap: "2mm", justifyContent: "flex-end" }}>
        <span
          style={{
            border: "0.3mm solid var(--pr-line-strong)",
            borderRadius: "1mm",
            padding: "0.6mm 2mm",
            fontSize: "7pt",
            fontWeight: 600,
          }}
        >
          {doc.status}
        </span>
        <span
          style={{
            background: "var(--pr-orange-soft)",
            border: "0.3mm solid var(--pr-orange)",
            color: "var(--pr-orange)",
            borderRadius: "1mm",
            padding: "0.6mm 2mm",
            fontSize: "7pt",
            fontWeight: 700,
          }}
        >
          {job.copyLabelEN}
        </span>
      </div>
      <div style={{ fontSize: "6.8pt", marginTop: "0.8mm" }} className="a4-dim">
        {job.copyLabelTH} · {job.copyAudience}
      </div>
    </div>
  );
}

function MarksBlock({ job }: { job: PrintJob }) {
  const { config, doc } = job;
  if (!config.showQRCode && !config.showBarcode) return null;
  return (
    <div style={{ textAlign: "center", flexShrink: 0 }}>
      {config.showQRCode && (
        <>
          <div className="a4-label" style={{ fontSize: "5.4pt", marginBottom: "0.6mm" }}>
            Scan to verify
          </div>
          <QRPlaceholder value={doc.code} size={14} />
        </>
      )}
      {config.showBarcode && (
        <div style={{ marginTop: "1.2mm" }}>
          <BarcodePlaceholder value={doc.code} width={30} height={6} />
          <div style={{ fontSize: "5.8pt", letterSpacing: "0.06em" }} className="a4-dim">
            {doc.code}
          </div>
        </div>
      )}
    </div>
  );
}

function FullHeader({ job }: { job: PrintJob }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "4mm",
        alignItems: "flex-start",
        justifyContent: "space-between",
        paddingBottom: "3mm",
        borderBottom: "0.5mm solid var(--pr-orange)",
      }}
    >
      <CompanyBlock job={job} />
      <TitleBlock job={job} />
      <MarksBlock job={job} />
    </div>
  );
}

/** Continuation pages repeat only what identifies the sheet. */
function CompactHeader({ job, page }: { job: PrintJob; page: PrintPage }) {
  const { config, doc } = job;
  return (
    <div
      style={{
        display: "flex",
        gap: "3mm",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: "2mm",
        borderBottom: "0.4mm solid var(--pr-orange)",
      }}
    >
      <div style={{ display: "flex", gap: "2.5mm", alignItems: "center", minWidth: 0 }}>
        <AFactoryLogo size={11} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "10pt", fontWeight: 700 }}>{config.titleEN}</div>
          <div style={{ fontSize: "7pt" }} className="a4-muted">
            {doc.billTo.name}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="a4-docno" style={{ fontSize: "10.5pt" }}>
          {doc.code}
        </div>
        <div style={{ fontSize: "7pt" }} className="a4-muted">
          {doc.date} · Page {page.page} of {job.totalPages}
        </div>
      </div>
    </div>
  );
}

/* ---------- Parties and metadata ---------- */

function PartyPanel({
  title,
  titleTH,
  party,
  showTaxId,
}: {
  title: string;
  titleTH: string;
  party: { name: string; code: string; address: string; taxId: string; branch: string; phone: string; contact: string; instruction?: string };
  showTaxId: boolean;
}) {
  return (
    <div className="a4-panel" style={{ flex: 1, minWidth: 0 }}>
      <div className="a4-label" style={{ color: "var(--pr-orange)" }}>
        {title} <span className="a4-dim">({titleTH})</span>
      </div>
      <div style={{ fontWeight: 700, marginTop: "1mm", fontSize: "8.6pt" }}>{party.name || "—"}</div>
      {party.code && (
        <div style={{ fontSize: "7pt" }} className="a4-dim">
          {party.code}
        </div>
      )}
      <div style={{ marginTop: "1mm" }} className="a4-muted">
        {party.address || "—"}
      </div>
      <div style={{ marginTop: "1mm", fontSize: "7.2pt" }} className="a4-muted">
        {showTaxId && party.taxId && <div>เลขประจำตัวผู้เสียภาษี {party.taxId}</div>}
        {showTaxId && party.branch && <div>{party.branch}</div>}
        {party.contact && <div>ผู้ติดต่อ {party.contact}</div>}
        {party.phone && <div>โทร. {party.phone}</div>}
        {party.instruction && <div>หมายเหตุ {party.instruction}</div>}
      </div>
    </div>
  );
}

function MetaTable({ job }: { job: PrintJob }) {
  return (
    <div className="a4-panel" style={{ width: "78mm", flexShrink: 0, padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {job.doc.meta.map((m) => (
            <tr key={m.field}>
              <td
                style={{
                  padding: "1.3mm 2.5mm",
                  borderBottom: "0.2mm solid var(--pr-line)",
                  width: "44%",
                  fontSize: "7.4pt",
                }}
                className="a4-muted"
              >
                {m.label}
                <div style={{ fontSize: "6.4pt" }} className="a4-dim">
                  {m.labelTH}
                </div>
              </td>
              <td
                style={{
                  padding: "1.3mm 2.5mm",
                  borderBottom: "0.2mm solid var(--pr-line)",
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                {m.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Item table ---------- */

function ItemTable({ job, page }: { job: PrintJob; page: PrintPage }) {
  const cols = visibleColumns(job.config, job.copyType);
  const filler = fillerRows(page);
  const widths = columnWidths(cols);

  return (
    <table className="a4-table">
      <colgroup>
        {cols.map((c) => (
          <col key={c} style={{ width: widths[c] }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {cols.map((c) => {
            const l = COLUMN_LABELS[c];
            return (
              <th
                key={c}
                className={l?.align === "right" ? "a4-right" : l?.align === "center" ? "a4-center" : undefined}
              >
                {l?.en ?? c}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {page.lines.map((line) => (
          <tr key={`${line.no}-${line.code}`} className="a4-row">
            {cols.map((c) => {
              const l = COLUMN_LABELS[c];
              const align = l?.align === "right" ? "a4-right" : l?.align === "center" ? "a4-center" : "";
              return (
                <td key={c} className={align}>
                  {cellValue(line, c)}
                  {/* Extra description lines belong to the description cell and
                      were counted as row units by the paginator. */}
                  {c === "description" &&
                    line.extraLines.map((extra, i) => (
                      <div key={i} style={{ fontSize: "7pt", paddingLeft: "2mm" }} className="a4-dim">
                        - {extra}
                      </div>
                    ))}
                </td>
              );
            })}
          </tr>
        ))}

        {/* Blank rows so a short page keeps the height of a full one. */}
        {Array.from({ length: filler }, (_, i) => (
          <tr key={`filler-${i}`} className="a4-filler">
            {cols.map((c) => (
              <td key={c}>&nbsp;</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- Closing blocks ---------- */

function Remarks({ job }: { job: PrintJob }) {
  if (!job.doc.remarks.length) return null;
  return (
    <div className="a4-panel" style={{ flex: 1, minWidth: 0 }}>
      <div className="a4-label" style={{ color: "var(--pr-orange)" }}>
        Remark <span className="a4-dim">(หมายเหตุ)</span>
      </div>
      <ol style={{ margin: "1.5mm 0 0", paddingLeft: "4.5mm" }} className="a4-muted">
        {job.doc.remarks.map((r, i) => (
          <li key={i} style={{ marginBottom: "0.8mm" }}>
            {r}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Totals({ job }: { job: PrintJob }) {
  const t = job.doc.totals;
  if (!t) return null;

  const row = (label: string, value: number, show = true) =>
    show ? (
      <tr key={label}>
        <td style={{ padding: "1.2mm 3mm", borderBottom: "0.2mm solid var(--pr-line)" }} className="a4-muted">
          {label}
        </td>
        <td
          style={{ padding: "1.2mm 3mm", borderBottom: "0.2mm solid var(--pr-line)", fontWeight: 600 }}
          className="a4-right"
        >
          {money(value)}
        </td>
      </tr>
    ) : null;

  return (
    <div style={{ width: "78mm", flexShrink: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", border: "0.3mm solid var(--pr-line)" }}>
        <tbody>
          {row("SUBTOTAL", t.subtotal)}
          {row("LINE DISCOUNT", t.lineDiscount, t.lineDiscount > 0)}
          {row("HEADER DISCOUNT", t.headerDiscount, t.headerDiscount > 0)}
          {row("FREIGHT", t.freight, t.freight > 0)}
          {row("OTHER CHARGES", t.otherCharges, t.otherCharges > 0)}
          {row("NET AMOUNT", t.netAmount)}
          {job.config.showTax && row("VAT", t.vat)}
          {row("WITHHOLDING TAX", t.withholding, t.withholding > 0)}
          {row("ROUNDING", t.rounding, t.rounding !== 0)}
          <tr className="a4-grand">
            <td style={{ padding: "2mm 3mm", fontSize: "9.5pt" }}>GRAND TOTAL</td>
            <td style={{ padding: "2mm 3mm", fontSize: "11pt" }} className="a4-right">
              {money(t.grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {job.config.showAmountInWords && (
        <div style={{ marginTop: "1.2mm", textAlign: "right", fontSize: "7.6pt" }} className="a4-muted">
          ( {t.amountInWords} )
        </div>
      )}
    </div>
  );
}

function PaymentInfo({ job }: { job: PrintJob }) {
  const b = job.doc.bank;
  if (!job.config.showPayment || !b) return null;

  const cell = (label: string, value: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="a4-label" style={{ fontSize: "5.8pt" }}>
        {label}
      </div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );

  return (
    <div className="a4-panel" style={{ marginTop: "2.5mm" }}>
      <div className="a4-label" style={{ color: "var(--pr-orange)", marginBottom: "1.5mm" }}>
        Payment Information <span className="a4-dim">(ข้อมูลการชำระเงิน)</span>
      </div>
      <div style={{ display: "flex", gap: "3mm" }}>
        {cell("Payment Method", b.method)}
        {cell("Bank", `${b.bank} ${b.branch}`)}
        {cell("Account No.", b.accountNo)}
        {cell("Account Name", b.accountName)}
      </div>
    </div>
  );
}

function Signatures({ job }: { job: PrintJob }) {
  if (!job.config.showSignatures) return null;
  return (
    <div style={{ display: "flex", gap: "3mm", marginTop: "2.5mm" }}>
      {job.config.signatureRoles.map((role) => {
        const l = SIGNATURE_LABELS[role];
        return (
          <div key={role} className="a4-panel" style={{ flex: 1, minWidth: 0, paddingTop: "2mm" }}>
            <div className="a4-label" style={{ color: "var(--pr-orange)", fontSize: "6pt" }}>
              {l?.en ?? role}
            </div>
            <div style={{ fontSize: "6.6pt" }} className="a4-dim">
              {l?.th ?? ""}
            </div>
            <div
              style={{
                marginTop: "8mm",
                borderTop: "0.2mm dotted var(--pr-line-strong)",
                paddingTop: "1mm",
                fontSize: "6.6pt",
              }}
              className="a4-dim"
            >
              วันที่ ____ / ____ / ______
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The control line: who printed this, when, and which sheet of how many. */
function Footer({ job, page }: { job: PrintJob; page: PrintPage }) {
  return (
    <div
      style={{
        marginTop: "1.8mm",
        paddingTop: "1.4mm",
        borderTop: "0.3mm solid var(--pr-line)",
        display: "flex",
        gap: "3mm",
        justifyContent: "space-between",
        fontSize: "6.4pt",
      }}
      className="a4-dim"
    >
      <span>Generated by A-Factory ERP</span>
      <span>Printed by {job.printedBy}</span>
      <span>Printed on {job.printedAt}</span>
      <span>{job.doc.code}</span>
      <span>
        Page {page.page} of {job.totalPages}
      </span>
    </div>
  );
}

/* ---------- One sheet ---------- */

export function PrintPageView({ job, page }: { job: PrintJob; page: PrintPage }) {
  const { config } = job;
  const multi = job.totalPages > 1;
  const watermark = job.watermark ?? (job.reprintOf > 0 ? "REPRINT" : "");

  return (
    <section className="a4-page" data-testid={`print-page-${page.page}`} data-page={page.page}>
      {watermark && (
        <div className="a4-watermark" aria-hidden>
          <span>{watermark}</span>
        </div>
      )}

      <div className="a4-layer" style={{ padding: "0" }}>
        {page.isFirst ? <FullHeader job={job} /> : <CompactHeader job={job} page={page} />}

        {/* Continued-from marker on every page after the first. */}
        {!page.isFirst && (
          <div
            data-testid="continued-from"
            style={{ marginTop: "1.5mm", fontSize: "7pt", fontStyle: "italic" }}
            className="a4-dim"
          >
            รายการต่อจากหน้าก่อน / Continued from previous page
          </div>
        )}

        {/* Parties and metadata only on page 1. */}
        {page.isFirst && (
          <div style={{ display: "flex", gap: "3mm", marginTop: "3mm" }}>
            <PartyPanel
              title="BILL TO"
              titleTH="ลูกค้า"
              party={job.doc.billTo}
              showTaxId={config.showCustomerTaxId}
            />
            {config.showShipTo && (
              <PartyPanel title="SHIP TO" titleTH="จัดส่งที่" party={job.doc.shipTo} showTaxId={false} />
            )}
            <MetaTable job={job} />
          </div>
        )}

        <div style={{ marginTop: "3mm" }}>
          <ItemTable job={job} page={page} />
        </div>

        {/* Continued-to marker on every page but the last. */}
        {!page.isLast && (
          <div
            data-testid="continued-next"
            style={{ marginTop: "1.5mm", textAlign: "right", fontSize: "7pt", fontStyle: "italic" }}
            className="a4-dim"
          >
            มีรายการต่อหน้าถัดไป / Continued on next page
          </div>
        )}

        {/* Everything below appears once, on the final sheet. */}
        {page.isLast && (
          <div data-testid="print-closing" style={{ marginTop: "3mm" }}>
            <div style={{ display: "flex", gap: "3mm", alignItems: "flex-start" }}>
              <Remarks job={job} />
              {job.doc.totals && <Totals job={job} />}
            </div>
            <PaymentInfo job={job} />
            <Signatures job={job} />
          </div>
        )}

        {/* An operational delivery note wants a signature at handover even when
            the money lands on a later sheet. */}
        {config.signaturesOnFirstPage && page.isFirst && !page.isLast && multi && (
          <Signatures job={job} />
        )}

        <LetterheadFooter job={job} />
        <Footer job={job} page={page} />
      </div>
    </section>
  );
}

/* ---------- The document ---------- */

export function PrintDocument({ job }: { job: PrintJob }) {
  return (
    <div className="a4-root" data-testid="print-document" data-pages={job.totalPages}>
      <div className="a4-canvas">
        {job.pages.map((p) => (
          <PrintPageView key={p.page} job={job} page={p} />
        ))}
      </div>
    </div>
  );
}
