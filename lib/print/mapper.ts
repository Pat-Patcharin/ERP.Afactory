import { COMPANY, COMPANY_BANKS } from "@/data/admin";
import { BUSINESS_PARTNERS, addressLine, bpBillingAddress, bpDeliveryAddress } from "@/lib/domain/partner";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
} from "@/lib/domain/outbound";
import { SALES_INVOICES, invoiceTotals } from "@/lib/domain/invoice";
import { SHIPMENTS } from "@/lib/domain/shipment";
import { SALES_RETURNS } from "@/lib/domain/sales-return";
import { CREDIT_NOTES } from "@/lib/domain/credit-note";
import { PURCHASE_REQUESTS } from "@/lib/domain/purchase";
import {
  billShows,
  displayName,
  docDiscTotal,
  docGrandTotal,
  docSubtotal,
  docTaxTotal,
} from "@/lib/domain/lines";
import { recordTotals } from "@/lib/domain/lines";
import { DASH } from "@/lib/format";
import type { BadgeTone } from "@/lib/types";
import { META_LABELS } from "./config";
import type {
  MetaField,
  PrintBank,
  PrintCompany,
  PrintConfig,
  PrintDoc,
  PrintLine,
  PrintParty,
  PrintTotals,
} from "./types";
import { bahtText, englishAmountText } from "./words";

/* ============================================================
   DATA MAPPER

   Turns a source document into the neutral `PrintDoc`. This is
   the only file that knows what a Packing Task looks like; the
   renderer, the paginator and the config never do.

   The rule the whole framework rests on: TOTALS ARE READ, NEVER
   RECOMPUTED. An invoice already knows its grand total, and a
   print engine that adds the lines up again will one day disagree
   with the document it is printing. Where a source has finalised
   figures, they are copied through untouched.
   ============================================================ */

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => String(v ?? "").trim();

/* ---------- Company and bank, from Company Settings ---------- */

export function printCompany(): PrintCompany {
  return {
    logo: COMPANY.logo,
    logoUrl: COMPANY.logoUrl,
    nameTH: COMPANY.nameTh,
    nameEN: COMPANY.nameEn,
    address: COMPANY.address,
    branch: COMPANY.branch,
    branchNo: COMPANY.branchNo,
    taxId: COMPANY.taxId,
    phone: COMPANY.phone,
    email: COMPANY.email,
    website: COMPANY.website,
    line: COMPANY.line,
    facebook: COMPANY.facebook,
    tagline: COMPANY.tagline,
  };
}

export function defaultBank(reference = ""): PrintBank | null {
  const b = COMPANY_BANKS.find((x) => x.isDefault && x.status === "Active") ?? COMPANY_BANKS[0];
  if (!b) return null;
  return {
    bank: b.bank,
    branch: b.branch,
    accountNo: b.accountNo,
    accountName: b.accountName,
    method: "โอนเงินเข้าบัญชีธนาคาร",
    reference,
  };
}

/* ---------- Customer panels ---------- */

const EMPTY_PARTY: PrintParty = {
  name: "",
  code: "",
  address: "",
  taxId: "",
  branch: "",
  phone: "",
  contact: "",
};

/**
 * What the document itself recorded about the customer at the moment it was
 * issued. An invoice is evidence of what was agreed then, so its own snapshot
 * outranks the master — correcting an address today must not silently rewrite
 * a tax invoice printed last year.
 */
export interface PartySnapshot {
  address?: string;
  taxId?: string;
  branch?: string;
  phone?: string;
  contact?: string;
}

const applySnapshot = (party: PrintParty, snap: PartySnapshot): PrintParty => ({
  ...party,
  address: str(snap.address) || party.address,
  taxId: str(snap.taxId) || party.taxId,
  branch: str(snap.branch) || party.branch,
  phone: str(snap.phone) || party.phone,
  contact: str(snap.contact) || party.contact,
});

/**
 * Bill-to and ship-to. Where the document carries no snapshot of its own they
 * come from the Business Partner master, so an address corrected on the
 * partner corrects every document printed after it. A document that names a
 * partner we cannot resolve still prints, carrying what it holds, rather than
 * failing.
 */
export function parties(
  customerCode: string,
  customerName: string,
  shipToOverride = "",
  billToSnapshot: PartySnapshot = {},
): { billTo: PrintParty; shipTo: PrintParty } {
  const bp = BUSINESS_PARTNERS.find(
    (b) => b.code === customerCode || b.nameTh === customerName,
  );

  if (!bp) {
    const fallback = { ...EMPTY_PARTY, name: customerName, code: customerCode };
    return {
      billTo: applySnapshot(fallback, billToSnapshot),
      shipTo: {
        ...fallback,
        address: shipToOverride || str(billToSnapshot.address),
        phone: str(billToSnapshot.phone),
        contact: str(billToSnapshot.contact),
      },
    };
  }

  const billing = bpBillingAddress(bp);
  const delivery = bpDeliveryAddress(bp) ?? billing;
  const contact = bp.contacts?.find((c) => c.primary) ?? bp.contacts?.[0] ?? null;
  const contactName = contact ? `${contact.prefix}${contact.first} ${contact.last}`.trim() : "";

  return {
    billTo: applySnapshot(
      {
        name: bp.nameTh || bp.nameEn,
        code: bp.code,
        address: billing ? addressLine(billing) : "",
        taxId: bp.tax?.taxId ?? "",
        branch: `${bp.tax?.branchType ?? ""} ${bp.tax?.branchNo ?? ""}`.trim(),
        phone: billing?.phone || contact?.phone || contact?.mobile || "",
        contact: contactName,
      },
      billToSnapshot,
    ),
    shipTo: {
      name: bp.nameTh || bp.nameEn,
      code: bp.code,
      address: shipToOverride || (delivery ? addressLine(delivery) : ""),
      taxId: "",
      branch: "",
      phone: delivery?.phone || contact?.mobile || "",
      contact: delivery?.contact || contactName,
      instruction: delivery?.remark ?? "",
    },
  };
}

/* ---------- Metadata ---------- */

/**
 * Build the metadata rows a config asks for, dropping any that resolve to
 * nothing. An empty row on a printed form reads as missing data rather than
 * as inapplicable, so it is better not to print it at all.
 */
function buildMeta(config: PrintConfig, values: Partial<Record<MetaField, string>>) {
  return config.metaFields
    .map((field) => ({
      field,
      label: META_LABELS[field]?.en ?? field,
      labelTH: META_LABELS[field]?.th ?? "",
      value: str(values[field]),
    }))
    .filter((r) => r.value && r.value !== DASH);
}

/* ---------- Totals ---------- */

function makeTotals(
  partial: Partial<PrintTotals> & { grandTotal: number },
  currency = "THB",
): PrintTotals {
  const grandTotal = partial.grandTotal;
  return {
    subtotal: partial.subtotal ?? grandTotal,
    lineDiscount: partial.lineDiscount ?? 0,
    headerDiscount: partial.headerDiscount ?? 0,
    freight: partial.freight ?? 0,
    otherCharges: partial.otherCharges ?? 0,
    netAmount: partial.netAmount ?? grandTotal,
    vat: partial.vat ?? 0,
    withholding: partial.withholding ?? 0,
    rounding: partial.rounding ?? 0,
    grandTotal,
    currency,
    amountInWords:
      currency === "THB" ? bahtText(grandTotal) : englishAmountText(grandTotal, currency),
  };
}

/* ---------- Lines ---------- */

const blankLine = (no: number): PrintLine => ({
  no,
  code: "",
  description: "",
  extraLines: [],
  warehouse: "",
  location: "",
  bin: "",
  lot: "",
  serial: "",
  packageNo: "",
  qty: 0,
  requiredQty: 0,
  pickedQty: 0,
  weight: 0,
  uom: "",
  unitPrice: null,
  discount: null,
  netPrice: null,
  vatRate: null,
  amount: null,
});

/**
 * Split a note into the extra description lines that sit under the item.
 * Each one costs a row unit, which is why the paginator must see them.
 */
const extraFrom = (note: string): string[] =>
  str(note)
    .split(/\s*\|\s*|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

/* ============================================================
   Per-entity mapping
   ============================================================ */

type Source = { entity: string; code: string };

/**
 * A priced sell-side line: quotation, sales request, sales order.
 *
 * `bill` says whether this sheet goes to the customer. On one that does, the
 * line's `showOnBill` flag decides whether the salesperson's own wording and
 * note travel with it. On an internal sheet they always show — the people
 * picking and packing need to see what the customer was promised.
 */
function priceLine(
  it: {
    code: string;
    name: string;
    unit: string;
    qty: number;
    price: number;
    disc: number;
    tax: number;
    note?: string;
    customName?: string;
    showOnBill?: boolean;
  },
  no: number,
  bill = false,
): PrintLine {
  const base = num(it.qty) * num(it.price);
  const disc = base * (num(it.disc) / 100);
  const hidden = bill && !billShows(it);
  return {
    ...blankLine(no),
    code: it.code,
    description: hidden ? it.name : displayName(it),
    extraLines: hidden ? [] : extraFrom(it.note ?? ""),
    qty: num(it.qty),
    uom: it.unit,
    unitPrice: num(it.price),
    discount: num(it.disc),
    netPrice: num(it.price) * (1 - num(it.disc) / 100),
    vatRate: num(it.tax),
    amount: base - disc,
  };
}

export function mapDocument(source: Source, config: PrintConfig): PrintDoc | null {
  const company = printCompany();

  switch (source.entity) {
    /* ---------- Purchase request ----------
       The only inbound document here. It has no customer, so the party block
       carries the department that asked and the person who signed it — that
       is who the sheet concerns. `parties()` is not used at all: it looks up
       a business partner, and there is none on this side. */
    case "purchase-request": {
      const d = PURCHASE_REQUESTS.find((x) => x.code === source.code);
      if (!d) return null;
      const subtotal = (d.items ?? []).reduce(
        (s, it) => s + num(it.qty) * num(it.price),
        0,
      );
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "info",
        date: d.date,
        company,
        billTo: {
          name: d.dept ? `แผนก${d.dept}` : "",
          code: "",
          address: d.warehouse ? `รับของที่ ${d.warehouse}` : "",
          taxId: "",
          branch: "",
          phone: "",
          contact: d.requester,
        },
        shipTo: {
          name: "",
          code: "",
          address: "",
          taxId: "",
          branch: "",
          phone: "",
          contact: "",
        },
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.date,
          deliveryDate: d.needBy,
          warehouse: d.warehouse,
          currency: "THB",
        }),
        lines: (d.items ?? []).map((it, i) => ({
          no: i + 1,
          code: it.code,
          description: it.name,
          extraLines: [],
          warehouse: d.warehouse,
          location: "",
          bin: "",
          lot: "",
          serial: "",
          packageNo: "",
          qty: num(it.qty),
          requiredQty: num(it.qty),
          pickedQty: 0,
          weight: 0,
          uom: it.unit,
          unitPrice: num(it.price),
          discount: 0,
          netPrice: num(it.price),
          /* No tax on a request — settled on the purchase order. */
          vatRate: 0,
          amount: num(it.qty) * num(it.price),
        })),
        /* Same one function as the editor preview. A request carries no tax,
           which `recordTotals` gets from the lines rather than being told. */
        totals: makeTotals(recordTotals(d), "THB"),
        bank: null,
        remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
      };
    }

    /* ---------- Quotation ---------- */
    case "quotation": {
      const d = QUOTATIONS.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer);
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "info",
        date: d.quoteDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          revision: `ฉบับที่ ${d.revision}`,
          docDate: d.quoteDate,
          customerCode: d.customerCode,
          salesRep: d.salesRep,
          payTerm: d.payTerm,
          currency: d.currency,
          reference: d.customerRef,
          approvedBy: d.approvedBy,
          approvedAt: d.approvedAt,
        }),
        lines: (d.items ?? []).map((it, i) => priceLine(it, i + 1, true)),
        /* `recordTotals` — the same function the editor's preview uses. This
           listed the figures out by hand and never reached for the header
           discount, freight or other charges, so the sheet printed from the
           store disagreed with the sheet printed from the editor. One
           function, so they cannot drift again. */
        totals: makeTotals(recordTotals(d), d.currency),
        bank: defaultBank(d.code),
        remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
        /* Only a quotation that actually cleared approval carries one. */
        ...(d.approvalStatus === "Approved" && d.approvedBy
          ? { approval: { by: d.approvedBy, at: d.approvedAt } }
          : {}),
      };
    }

    /* ---------- Sales request ---------- */
    case "sales-request": {
      const d = SALES_REQUESTS.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer);
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "info",
        date: d.requestDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.requestDate,
          customerCode: d.customerCode,
          salesRep: d.salesRep,
          quotationNo: d.quotationRef,
          currency: d.currency,
        }),
        lines: (d.items ?? []).map((it, i) => priceLine(it, i + 1)),
        /* Same one function as the quotation and the editor preview. */
        totals: makeTotals(recordTotals(d), d.currency),
        bank: null,
        remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
      };
    }

    /* ---------- Sales order ---------- */
    case "sales-order": {
      const d = SALES_ORDERS.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer, d.shipTo);
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "info",
        date: d.orderDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.orderDate,
          customerCode: d.customerCode,
          customerPo: d.customerPo,
          requestNo: d.srRef,
          salesRep: d.salesRep,
          payTerm: d.payTerm,
          deliveryDate: d.deliveryDate,
          warehouse: d.warehouse,
          currency: d.currency,
        }),
        lines: (d.items ?? []).map((it, i) => priceLine(it, i + 1)),
        totals: makeTotals(
          {
            subtotal: docSubtotal(d),
            lineDiscount: docDiscTotal(d),
            netAmount: docSubtotal(d) - docDiscTotal(d),
            vat: docTaxTotal(d),
            grandTotal: d.total,
          },
          d.currency,
        ),
        bank: defaultBank(d.code),
        remarks: [...config.remarks, ...(d.remark ? [d.remark] : [])],
      };
    }

    /* ---------- Picking ---------- */
    case "picking": {
      const d = PICKING_TASKS.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer);
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "warning",
        date: d.pickDate || d.created.split(" ")[0],
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.pickDate,
          customerCode: d.customerCode,
          salesOrderNo: d.soRef,
          warehouse: d.warehouse,
        }),
        lines: (d.items ?? []).map((it, i) => ({
          ...blankLine(i + 1),
          code: it.code,
          description: displayName(it),
          extraLines: extraFrom(it.note),
          warehouse: d.warehouse,
          bin: it.bin,
          location: it.bin,
          lot: it.lot,
          qty: num(it.picked),
          requiredQty: num(it.ordered),
          pickedQty: num(it.picked),
          uom: it.unit,
        })),
        totals: null,
        bank: null,
        remarks: [...config.remarks, ...(d.remark ? [d.remark] : [])],
      };
    }

    /* ---------- Packing ---------- */
    case "packing": {
      const d = PACKING_TASKS.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer);
      const boxWeight = new Map((d.packages ?? []).map((b) => [b.box, num(b.weight)]));
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "warning",
        date: d.packDate || d.created.split(" ")[0],
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.packDate,
          customerCode: d.customerCode,
          salesOrderNo: d.soRef,
          warehouse: d.warehouse,
        }),
        lines: (d.items ?? []).map((it, i) => ({
          ...blankLine(i + 1),
          code: it.code,
          description: displayName(it),
          extraLines: extraFrom(it.note),
          packageNo: it.box,
          weight: boxWeight.get(it.box) ?? 0,
          qty: num(it.packedQty) || num(it.qty),
          uom: it.unit,
        })),
        totals: null,
        bank: null,
        remarks: [...config.remarks, ...(d.remark ? [d.remark] : [])],
      };
    }

    /* ---------- Delivery order (three configs share this source) ---------- */
    case "delivery-order": {
      const d = DELIVERY_ORDERS.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer, d.shipTo);
      const so = SALES_ORDERS.find((x) => x.code === d.soRef);
      /* Price comes from the sales order this delivery fulfils — a delivery
         order has no prices of its own, and inventing them would be worse
         than showing none. */
      const priceOf = (code: string) => so?.items?.find((i) => i.code === code) ?? null;

      const lines = (d.items ?? []).map((it, i) => {
        const src = priceOf(it.code);
        const qty = num(it.qty);
        const price = src ? num(src.price) : 0;
        const disc = src ? num(src.disc) : 0;
        const base = qty * price;
        return {
          ...blankLine(i + 1),
          code: it.code,
          description: billShows(it) ? displayName(it) : it.name,
          extraLines: billShows(it) ? extraFrom(it.note) : [],
          packageNo: it.box,
          lot: str(it.lot),
          serial: str(it.serial),
          qty,
          uom: it.unit,
          unitPrice: src ? price : null,
          discount: src ? disc : null,
          netPrice: src ? price * (1 - disc / 100) : null,
          vatRate: src ? num(src.tax) : null,
          amount: src ? base - base * (disc / 100) : null,
        };
      });

      const priced = config.showPrice && Boolean(so);
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "success",
        date: d.deliveryDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.deliveryDate,
          customerCode: d.customerCode,
          customerPo: so?.customerPo,
          salesOrderNo: d.soRef,
          salesRep: so?.salesRep,
          payTerm: so?.payTerm,
          dueDate: so?.deliveryDate,
          deliveryDate: d.deliveryDate,
          trackingNo: d.trackingNo,
          warehouse: d.warehouse,
          currency: so?.currency,
        }),
        lines,
        totals: priced
          ? makeTotals(
              {
                subtotal: docSubtotal(so!),
                lineDiscount: docDiscTotal(so!),
                netAmount: docSubtotal(so!) - docDiscTotal(so!),
                vat: docTaxTotal(so!),
                grandTotal: so!.total,
              },
              so!.currency,
            )
          : null,
        bank: defaultBank(d.code),
        remarks: [...config.remarks, ...(d.remark ? [d.remark] : [])],
      };
    }

    /* ---------- Sales invoice family ---------- */
    case "sales-invoice": {
      const d = SALES_INVOICES.find((x) => x.code === source.code);
      if (!d) return null;
      /* The invoice carries the customer as billed — that is the record a tax
         office reads, so it wins over today's master. */
      const p = parties(d.customerCode, d.customer, "", {
        address: d.billingAddress,
        taxId: d.taxId,
        branch: d.branch,
        phone: d.phone,
        contact: d.contactPerson,
      });
      /* The invoice module owns this maths; the print engine reads it. */
      const t = invoiceTotals(d);
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: d.isOverdue ? "danger" : "info",
        date: d.invoiceDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.invoiceDate,
          customerCode: d.customerCode,
          customerPo: d.customerPo,
          salesOrderNo: d.sourceDoc,
          invoiceNo: d.code,
          salesRep: d.salesRep,
          payTerm: d.payTerm,
          dueDate: d.dueDate,
          currency: d.currency,
          reference: d.paymentRef,
        }),
        lines: (d.items ?? []).map((it, i) => {
          const qty = num(it.invoiceQty);
          const price = num(it.unitPrice);
          const base = qty * price;
          const discAmt = it.discType === "Amount" ? num(it.disc) : base * (num(it.disc) / 100);
          return {
            ...blankLine(i + 1),
            code: it.code,
            description: billShows(it) ? displayName(it) : it.name,
            extraLines: billShows(it)
              ? extraFrom([it.desc, it.note].filter(Boolean).join(" | "))
              : extraFrom(it.desc),
            warehouse: it.warehouse,
            lot: it.lotSerial,
            qty,
            uom: it.unit,
            unitPrice: price,
            discount: num(it.disc),
            netPrice: qty ? (base - discAmt) / qty : price,
            vatRate: num(it.taxRate),
            amount: base - discAmt,
          };
        }),
        totals: makeTotals(
          {
            subtotal: t.subtotal,
            lineDiscount: t.lineDiscount,
            headerDiscount: t.headerDiscount,
            freight: t.freight,
            otherCharges: t.otherCharges,
            netAmount: t.taxable,
            vat: t.tax,
            withholding: t.withholding,
            rounding: t.rounding,
            grandTotal: t.grandTotal,
          },
          d.currency,
        ),
        bank: defaultBank(d.code),
        remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
      };
    }

    /* ---------- Shipment ---------- */
    case "shipment": {
      const d = SHIPMENTS.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer, d.deliveryAddress, {
        address: d.deliveryAddress,
        phone: d.contactPhone,
        contact: d.contactPerson,
      });
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: d.isDelayed ? "warning" : "success",
        date: d.shipmentDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.shipmentDate,
          customerCode: d.customerCode,
          deliveryOrderNo: d.doRef,
          salesOrderNo: d.soRef,
          salesRep: d.salesRep,
          warehouse: d.warehouse,
          trackingNo: d.trackingNo,
          deliveryDate: d.expectedDelivery,
        }),
        lines: (d.items ?? []).map((it, i) => ({
          ...blankLine(i + 1),
          code: it.code,
          description: it.name,
          extraLines: extraFrom(it.note),
          warehouse: it.warehouse,
          bin: it.bin,
          location: it.bin,
          lot: it.lot,
          serial: it.serial,
          packageNo: it.packageNo,
          qty: num(it.shipmentQty),
          uom: it.unit,
        })),
        totals: null,
        bank: null,
        remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
      };
    }

    /* ---------- Sales return ---------- */
    case "sales-return": {
      const d = SALES_RETURNS.find((x) => x.code === source.code);
      if (!d) return null;
      /* A return has no billing details of its own; it credits an invoice, so
         it bills to whatever that invoice billed to. */
      const inv = SALES_INVOICES.find((x) => x.code === d.invoiceRef);
      const p = parties(d.customerCode, d.customer, d.pickupAddress, {
        address: inv?.billingAddress || d.pickupAddress,
        taxId: inv?.taxId,
        phone: d.contactPhone,
        contact: d.contactPerson,
      });
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "warning",
        date: d.returnDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.returnDate,
          customerCode: d.customerCode,
          invoiceNo: d.invoiceRef,
          salesOrderNo: d.soRef,
          warehouse: d.receiving?.warehouse,
          reference: d.rmaNo,
        }),
        lines: (d.items ?? []).map((it, i) => {
          const qty = num(it.approvedQty) || num(it.requestedQty);
          return {
            ...blankLine(i + 1),
            code: it.code,
            description: it.name,
            extraLines: extraFrom([it.condition, it.reason].filter(Boolean).join(" | ")),
            lot: it.lot,
            serial: it.serial,
            qty,
            uom: it.unit,
            unitPrice: num(it.unitPrice),
            amount: qty * num(it.unitPrice),
            reason: it.reason,
          };
        }),
        /* returnValue is the module's own figure — not recomputed here. */
        totals: makeTotals({ grandTotal: d.returnValue, subtotal: d.returnValue }, "THB"),
        bank: null,
        remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
      };
    }

    /* ---------- Credit note ---------- */
    case "credit-note": {
      const d = CREDIT_NOTES.find((x) => x.code === source.code);
      if (!d) return null;
      const p = parties(d.customerCode, d.customer, "", {
        address: d.address,
        taxId: d.taxId,
        branch: d.branch,
        phone: d.phone,
        contact: d.contactPerson,
      });
      return {
        entity: source.entity,
        code: d.code,
        status: d.status,
        statusTone: "warning",
        date: d.creditDate,
        company,
        ...p,
        meta: buildMeta(config, {
          docNo: d.code,
          docDate: d.creditDate,
          customerCode: d.customerCode,
          sourceInvoiceNo: d.invoiceRef,
          salesOrderNo: d.soRef,
          currency: d.currency,
          reference: d.returnRef,
        }),
        lines: (d.items ?? []).map((it, i) => {
          const qty = num(it.creditQty);
          const base = qty * num(it.unitPrice);
          const disc = base * (num(it.disc) / 100);
          return {
            ...blankLine(i + 1),
            code: it.code,
            description: it.name,
            extraLines: extraFrom([it.reason, it.note].filter(Boolean).join(" | ")),
            qty,
            uom: it.unit,
            unitPrice: num(it.unitPrice),
            discount: num(it.disc),
            netPrice: num(it.unitPrice) * (1 - num(it.disc) / 100),
            vatRate: num(it.taxRate),
            amount: base - disc,
            reason: it.reason,
          };
        }),
        /* Decorated by the credit-note module; read, never recomputed. */
        totals: makeTotals(
          {
            subtotal: d.subtotal,
            lineDiscount: d.discountTotal,
            netAmount: d.taxable,
            vat: d.taxAmount,
            grandTotal: d.totalCredit,
          },
          d.currency,
        ),
        bank: null,
        remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
      };
    }

    default:
      return null;
  }
}

/** Status tone map so a printed badge reads the same as it does on screen. */
export const statusTone = (t: string): BadgeTone => (t as BadgeTone) ?? "neutral";

/**
 * Render a stored revision of a quotation as a document.
 *
 * The header — customer, addresses, terms — comes from the live record,
 * because it is the same company and the same quotation number. Everything
 * that was frozen when the issue closed comes from the snapshot: the lines,
 * the money, the approver, the dates. Feed the result to `buildPrintJob` as
 * `options.document` and the whole engine works on it unchanged.
 *
 * Returns null when the quotation or that revision does not exist, so a
 * hand-typed URL fails as "not found" rather than as today's figures wearing
 * an old revision number.
 */
export function mapQuotationRevision(
  code: string,
  revision: number,
  config: PrintConfig,
): PrintDoc | null {
  const d = QUOTATIONS.find((x) => x.code === code);
  if (!d) return null;
  const snap = (d.revisions ?? []).find((r) => r.revision === revision);
  if (!snap) return null;

  const p = parties(d.customerCode, d.customer);
  return {
    entity: "quotation",
    code: d.code,
    status: d.status,
    statusTone: "info",
    date: d.quoteDate,
    company: printCompany(),
    ...p,
    meta: buildMeta(config, {
      docNo: d.code,
      revision: `ฉบับที่ ${snap.revision}`,
      docDate: d.quoteDate,
      customerCode: d.customerCode,
      salesRep: d.salesRep,
      payTerm: d.payTerm,
      currency: d.currency,
      reference: d.customerRef,
      approvedBy: snap.approvedBy,
      approvedAt: snap.approvedAt,
    }),
    lines: (snap.items ?? []).map((it, i) => priceLine(it, i + 1, true)),
    totals: makeTotals(
      {
        subtotal: snap.totals.subtotal,
        lineDiscount: snap.totals.discount,
        netAmount: snap.totals.subtotal - snap.totals.discount,
        vat: snap.totals.vat,
        grandTotal: snap.totals.grandTotal,
      },
      d.currency,
    ),
    bank: defaultBank(d.code),
    remarks: [...config.remarks, ...(d.note ? [d.note] : [])],
    ...(snap.approvedBy ? { approval: { by: snap.approvedBy, at: snap.approvedAt } } : {}),
    supersededRevision: {
      revision: snap.revision,
      closedAt: snap.closedAt,
      closedReason: snap.closedReason,
    },
  };
}
