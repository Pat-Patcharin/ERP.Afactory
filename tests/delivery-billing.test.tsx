import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PACKING_TASKS as RAW_PACK } from "@/data/packing";
import { DELIVERY_ORDERS as RAW_DO } from "@/data/delivery-orders";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { SALES_INVOICES as RAW_INV } from "@/data/sales-invoices";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  SALES_ORDERS,
  decorateOutbound,
  type PackRow,
} from "@/lib/domain/outbound";
import {
  SALES_INVOICES,
  decorateInvoices,
  invoiceTotals,
  invoicesForSource,
} from "@/lib/domain/invoice";
import { packCreateDelivery } from "@/lib/workflows-outbound";
import { DeliveryOrderDocument } from "@/components/delivery-order/DeliveryOrderDocument";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   THE DELIVERY NOTE AND THE BILL ARE ONE STEP

   They were two, and the second one waited for whoever
   remembered to open the create screen — which is how goods
   reach a customer with nothing asking them to pay for it.

   Raising the note now raises the invoice, as a draft. Issuing
   stays a separate press.

   AND WHEN THE LORRY GOES SHORT, IT ASKS. Billing what shipped
   and billing the whole order are both legitimate and they
   charge the customer different amounts, so the software must
   not pick one quietly.
   ============================================================ */

const SNAP = {
  pack: JSON.stringify(RAW_PACK),
  delivery: JSON.stringify(RAW_DO),
  so: JSON.stringify(RAW_SO),
  inv: JSON.stringify(RAW_INV),
};

const ADMIN = "EMP001"; // Super Admin — may both ship and bill

const restore = (live: unknown[], json: string) => {
  live.length = 0;
  live.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(PACKING_TASKS, SNAP.pack);
  restore(DELIVERY_ORDERS, SNAP.delivery);
  restore(SALES_ORDERS, SNAP.so);
  restore(SALES_INVOICES, SNAP.inv);
  decorateOutbound();
  decorateInvoices();
  setCurrentUser(ADMIN);
});

afterEach(resetCurrentUser);

/** Auto-confirms, and hands back whatever form modal was raised. */
function billingCtx() {
  let modal: { body: () => ReactNode; onConfirm?: () => boolean | void } | null = null;
  const gone: string[] = [];
  return {
    getModal: () => modal,
    gotos: gone,
    ctx: {
      goto: (href: string) => gone.push(href),
      openEntity: () => {},
      toast: () => {},
      confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
      formModal: (o: { body: () => ReactNode; onConfirm?: () => boolean | void }) => {
        modal = o;
      },
      refresh: () => {},
      quickView: () => {},
      panel: () => {},
    } as unknown as ActionCtx,
  };
}

/**
 * A pack ready to ship, confirmed at the quantity given.
 *
 * `short` trims the confirmed figure on the first line, which is how a real
 * shortfall reaches the delivery note.
 */
function readyPack({ short = 0 }: { short?: number } = {}): PackRow {
  const pack = PACKING_TASKS.find((p) => p.status === "Completed")!;
  pack.doRef = "";
  for (const it of pack.items) it.confirmedQty = it.qty;
  if (short > 0) {
    pack.items[0].confirmedQty = Math.max(0, Number(pack.items[0].qty) - short);
    pack.items[0].shortReason = "สต๊อกไม่พอ";
  }
  pack.confirmedAt = "01/07/2026 09:00";
  pack.confirmedBy = "Warin S.";
  decorateOutbound();
  return pack;
}

describe("ออกใบส่งสินค้าแล้วได้ใบแจ้งหนี้ทันที", () => {
  it("ส่งครบ — ออกบิลให้เลย ไม่ต้องถาม", () => {
    const { ctx, getModal } = billingCtx();
    const pack = readyPack();

    packCreateDelivery(pack, ctx);
    decorateOutbound();

    /* Nothing to ask: the note carries the whole order. */
    expect(getModal(), "ไม่มีคำถามเมื่อส่งครบ").toBeNull();

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    const bills = invoicesForSource(dobj.code);
    expect(bills, "ใบส่งของออกบิลให้ตัวเอง").toHaveLength(1);
    expect(bills[0].sourceType).toBe("Delivery Order");
  });

  it("บิลที่ออกมาเป็นฉบับร่าง — การออกบิลจริงยังต้องกดเอง", () => {
    const { ctx } = billingCtx();
    const pack = readyPack();
    packCreateDelivery(pack, ctx);

    const inv = invoicesForSource(pack.doRef)[0];
    /* An invoice that issued itself is a tax document nobody read. */
    expect(inv.status).toBe("Draft");
    expect(inv.paymentStatus).toBe("Unpaid");
    expect(inv.dueDate, "ครบกำหนดชำระคิดจากเครดิตของลูกค้า").toBeTruthy();
  });

  it("ส่งไม่ครบ — ถามก่อนว่าจะบิลเท่าไร", () => {
    const { ctx, getModal } = billingCtx();
    const pack = readyPack({ short: 5 });

    packCreateDelivery(pack, ctx);
    decorateOutbound();

    const modal = getModal();
    expect(modal, "ต้องถาม ไม่ใช่เลือกให้เอง").toBeTruthy();
    /* Nothing is billed until the question is answered. */
    expect(invoicesForSource(pack.doRef)).toHaveLength(0);

    render(<>{modal!.body()}</>);
    expect(screen.getByLabelText("บิลเท่าที่ส่งจริง")).toBeInTheDocument();
    expect(screen.getByLabelText("บิลเต็มตามใบสั่งขาย")).toBeInTheDocument();
  });

  it("เลือกบิลเท่าที่ส่ง — ยอดตรงกับที่ออกจากคลัง", () => {
    const { ctx, getModal } = billingCtx();
    const pack = readyPack({ short: 5 });
    packCreateDelivery(pack, ctx);

    /* The default answer is the safe one: bill what actually went. */
    getModal()!.onConfirm!();
    decorateInvoices();

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    const inv = invoicesForSource(dobj.code)[0];
    expect(inv, "ตั้งจากใบส่งของ").toBeTruthy();
    const shipped = dobj.items.reduce((s, l) => s + Number(l.qty), 0);
    expect(invoiceTotals(inv).totalQty).toBe(shipped);
  });

  it("เลือกบิลเต็ม — ตั้งจากใบสั่งขาย ไม่ใช่ใบส่งของ", () => {
    const { ctx, getModal } = billingCtx();
    const pack = readyPack({ short: 5 });
    packCreateDelivery(pack, ctx);

    const modal = getModal()!;
    render(<>{modal.body()}</>);
    /* Picking the second option is what changes the source: billing the
       whole order means the invoice is raised against the order, because
       that is the document it is actually billing. */
    screen.getByLabelText("บิลเต็มตามใบสั่งขาย").click();
    modal.onConfirm!();
    decorateInvoices();

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    const so = SALES_ORDERS.find((s) => s.code === dobj.soRef)!;
    const inv = invoicesForSource(so.code).find((i) => i.note.includes(dobj.code))!;
    expect(inv, "ตั้งจากใบสั่งขาย").toBeTruthy();
    expect(inv.sourceType).toBe("Sales Order");

    const ordered = so.items.reduce((s, l) => s + Number(l.qty), 0);
    const shipped = dobj.items.reduce((s, l) => s + Number(l.qty), 0);
    expect(invoiceTotals(inv).totalQty).toBe(ordered);
    expect(ordered, "และมากกว่าที่ส่งจริง").toBeGreaterThan(shipped);
  });
});

describe("ใบส่งของที่มีบิลแล้ว", () => {
  it("พิมพ์ออกมาเป็นใบเดียว — ใบส่งสินค้า / ใบกำกับภาษี", () => {
    const { ctx } = billingCtx();
    const pack = readyPack();
    packCreateDelivery(pack, ctx);
    decorateOutbound();

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    render(<DeliveryOrderDocument record={dobj} />);

    expect(screen.getByText("DELIVERY ORDER / TAX INVOICE")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("do-decision-bar")).getByRole("button", {
        name: /ใบกำกับภาษี/,
      }),
    ).toBeInTheDocument();
  });

  it("ไม่มีปุ่มออกใบแจ้งหนี้ซ้ำ", () => {
    const { ctx } = billingCtx();
    const pack = readyPack();
    packCreateDelivery(pack, ctx);
    decorateOutbound();

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    dobj.status = "Shipped";
    render(<DeliveryOrderDocument record={dobj} />);

    /* Offering it beside an invoice that already exists is an invitation to
       bill the same goods twice. */
    expect(
      within(screen.getByTestId("do-decision-bar")).queryByRole("button", {
        name: /^ออกใบแจ้งหนี้/,
      }),
    ).toBeNull();
  });

  it("บิลอยู่ในแถบเอกสารที่เกี่ยวข้อง", () => {
    const { ctx } = billingCtx();
    const pack = readyPack();
    packCreateDelivery(pack, ctx);
    decorateOutbound();

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    const inv = invoicesForSource(dobj.code)[0];
    render(<DeliveryOrderDocument record={dobj} />);

    expect(within(screen.getByTestId("doc-related")).getByText(inv.code)).toBeInTheDocument();
  });

  it("ใบที่ยังไม่มีบิลและส่งไม่ครบ มีสองปุ่มให้เลือก", () => {
    const { ctx } = billingCtx();
    const pack = readyPack({ short: 5 });
    packCreateDelivery(pack, ctx);
    /* Leave the question unanswered, so the note exists with no bill. */

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    dobj.status = "Delivered";
    decorateOutbound();
    render(<DeliveryOrderDocument record={dobj} />);

    /* Both figures are on the sheet already, so the two answers are two
       buttons rather than a dialog asking what the reader can see. */
    const bar = within(screen.getByTestId("do-decision-bar"));
    expect(bar.getByRole("button", { name: "ออกใบแจ้งหนี้ตามที่ส่ง" })).toBeInTheDocument();
    expect(
      bar.getByRole("button", { name: "ออกใบแจ้งหนี้เต็มตามใบสั่งขาย" }),
    ).toBeInTheDocument();
  });

  it("ใบที่ส่งครบ มีปุ่มเดียว เพราะมีคำตอบเดียวที่ตรง", () => {
    const { ctx } = billingCtx();
    const pack = readyPack();
    packCreateDelivery(pack, ctx);

    const dobj = DELIVERY_ORDERS.find((d) => d.code === pack.doRef)!;
    /* Drop the invoice the note raised, to reach the un-billed state. */
    const bills = invoicesForSource(dobj.code);
    for (const b of bills) SALES_INVOICES.splice(SALES_INVOICES.indexOf(b), 1);
    dobj.status = "Delivered";
    decorateOutbound();
    decorateInvoices();
    render(<DeliveryOrderDocument record={dobj} />);

    const bar = within(screen.getByTestId("do-decision-bar"));
    expect(bar.getByRole("button", { name: "ออกใบแจ้งหนี้ตามที่ส่ง" })).toBeInTheDocument();
    expect(
      bar.queryByRole("button", { name: "ออกใบแจ้งหนี้เต็มตามใบสั่งขาย" }),
    ).toBeNull();
  });
});
