import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { SHIPMENTS as RAW_SHP } from "@/data/shipments";
import { SALES_INVOICES as RAW_INV } from "@/data/sales-invoices";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { SALES_REQUESTS as RAW_SR } from "@/data/sales-requests";
import { NOTIFY_ITEMS as RAW_NOTIFY } from "@/data/notifications";
import {
  SHIPMENTS,
  decorateShipments,
  invoiceShipping,
  traceFromTracking,
  type ShpRow,
} from "@/lib/domain/shipment";
import { SALES_INVOICES, decorateInvoices } from "@/lib/domain/invoice";
import {
  SALES_ORDERS,
  SALES_REQUESTS,
  decorateOutbound,
} from "@/lib/domain/outbound";
import { NOTIFY_ITEMS, myNotifications } from "@/lib/domain/notify";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { shpSetTrackingNo } from "@/lib/workflows-shipment";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   THE TRACKING NUMBER LIVES IN ONE PLACE

   On the shipment, because that is where the parcel is. The
   invoice holds a pointer — `shipmentRef` — and reads through
   it. It never keeps a copy.

   The alternative was obvious and wrong for the same reason
   `effectiveBillType` exists: two copies of one fact drift, and
   once they disagree nobody can say which is true. A stale
   tracking number is a bad version of that, because it sends
   the customer to a carrier's site reporting no such parcel.

   So the first test here is a grep. It is the only kind of test
   that can hold "there is no second copy" — every other test
   would pass just as happily against a duplicated field that
   happened to agree today.
   ============================================================ */

const SALES_ADMIN = "EMP013";
const WAREHOUSE = "EMP008";

const SNAP = {
  shp: JSON.stringify(RAW_SHP),
  inv: JSON.stringify(RAW_INV),
  so: JSON.stringify(RAW_SO),
  sr: JSON.stringify(RAW_SR),
  notify: JSON.stringify(RAW_NOTIFY),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(SHIPMENTS, SNAP.shp);
  restore(SALES_INVOICES, SNAP.inv);
  restore(SALES_ORDERS, SNAP.so);
  restore(SALES_REQUESTS, SNAP.sr);
  restore(NOTIFY_ITEMS, SNAP.notify);
  decorateOutbound();
  decorateInvoices();
  decorateShipments();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

function stub() {
  const toasts: { title: string; message?: string; tone?: string }[] = [];
  let modal: { body: () => ReactNode; onConfirm?: () => boolean | void } | null = null;
  return {
    toasts,
    lastToast: () => toasts[toasts.length - 1],
    getModal: () => modal as unknown as { body: () => ReactNode; onConfirm: () => boolean | void },
    ctx: {
      goto: () => {},
      openEntity: () => {},
      toast: (title: string, message?: string, tone?: string) =>
        toasts.push({ title, message, tone }),
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
 * Type a number into the tracking dialog and confirm it.
 *
 * The modal seeds its state when it opens, so the value has to go in through
 * the field rather than by writing to the shipment afterwards — which is also
 * the path a real user takes.
 */
async function answerTracking(
  modal: { body: () => ReactNode; onConfirm: () => boolean | void },
  value: string,
) {
  const user = userEvent.setup();
  const { unmount } = render(<>{modal.body()}</>);
  const field = screen.getByLabelText("เลขพัสดุ");
  await user.clear(field);
  if (value) await user.type(field, value);
  const result = modal.onConfirm();
  unmount();
  return result;
}

/** A dispatched shipment with a tracking number and an invoice pointing at it. */
function shippedWithInvoice(): { s: ShpRow; invCode: string } {
  const s = SHIPMENTS.find((x) => x.trackingNo && x.invRef)!;
  const inv = SALES_INVOICES.find((i) => i.code === s.invRef)!;
  inv.shipmentRef = s.code;
  return { s, invCode: inv.code };
}

/* ============================================================
   ONE COPY, AND A TEST THAT CAN TELL
   ============================================================ */

describe("The invoice never stores a tracking number of its own", () => {
  it("keeps no trackingNo field anywhere in the invoice module", async () => {
    /* A grep is the honest test: any assertion on values would pass against
       a duplicated field that happens to agree at this moment, which is
       precisely the state this rule exists to prevent. */
    const { readFileSync } = await import("node:fs");
    const files = [
      "data/sales-invoices.ts",
      "lib/domain/invoice.ts",
      "schemas/forms/sales-invoice.tsx",
    ];

    for (const f of files) {
      const src = readFileSync(f, "utf8");
      /* `shipmentRef` is the pointer and is expected. A `trackingNo` field
         being declared or assigned on an invoice is not. */
      expect(/trackingNo\s*[:=]/.test(src), `${f} must not carry its own trackingNo`).toBe(false);
    }
  });

  it("declares the pointer instead", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("data/sales-invoices.ts", "utf8")).toContain("shipmentRef");
  });
});

/* ============================================================
   READING THROUGH THE POINTER
   ============================================================ */

describe("invoiceShipping reads the shipment", () => {
  it("shows the carrier, number, status and the date it actually arrived", () => {
    const { s, invCode } = shippedWithInvoice();
    const inv = SALES_INVOICES.find((i) => i.code === invCode)!;

    const ship = invoiceShipping(inv)!;
    expect(ship).toBeTruthy();
    expect(ship.shipmentCode).toBe(s.code);
    expect(ship.carrier).toBe(s.carrier);
    expect(ship.trackingNo).toBe(s.trackingNo);
    expect(ship.deliveryStatus).toBeTruthy();
    expect(ship.actualDelivery).toBe(s.actualDelivery);
  });

  it("follows the shipment when the number changes there, with nothing to sync", () => {
    const { s, invCode } = shippedWithInvoice();
    const inv = SALES_INVOICES.find((i) => i.code === invCode)!;

    s.trackingNo = "CHANGED-999";
    /* No write to the invoice, no decorate, no refresh — the point of a
       pointer is that there is nothing to keep in step. */
    expect(invoiceShipping(inv)!.trackingNo).toBe("CHANGED-999");
  });

  it("returns null for an invoice whose goods have not been handed to a carrier", () => {
    const inv = SALES_INVOICES.find((i) => !i.shipmentRef)!;
    /* Deliberately not an error and not a row of dashes: the paperwork can
       legitimately be raised before the lorry leaves. */
    const orphan = { ...inv, shipmentRef: undefined, code: "INV-NOT-SHIPPED-0000" };
    expect(invoiceShipping(orphan)).toBeNull();
  });

  it("does not invent a blank tracking number for a shipment that has none", () => {
    const s = SHIPMENTS.find((x) => !x.trackingNo)!;
    const ship = invoiceShipping({ shipmentRef: s.code })!;
    expect(ship, "the shipment is real, so the panel shows").toBeTruthy();
    expect(ship.trackingNo, "but the number is honestly empty").toBe("");
  });
});

/* ============================================================
   ENTERING IT
   ============================================================ */

describe("The number is entered on the shipment", () => {
  it("refuses a shipment that has not been dispatched", () => {
    const s = SHIPMENTS.find((x) => x.status === "Draft")!;
    const { ctx, getModal, lastToast } = stub();

    setCurrentUser(WAREHOUSE);
    shpSetTrackingNo(s, ctx);

    expect(getModal()).toBeFalsy();
    expect(lastToast().title).toBe("ใส่เลข tracking ไม่ได้");
  });

  it("refuses an empty number", async () => {
    const s = SHIPMENTS.find((x) => !["Draft", "Cancelled"].includes(x.status))!;
    s.trackingNo = "";
    const { ctx, getModal, lastToast } = stub();

    setCurrentUser(WAREHOUSE);
    shpSetTrackingNo(s, ctx);
    const ok = await answerTracking(getModal(), "");

    expect(ok).toBe(false);
    expect(lastToast().title).toBe("ยังไม่ได้กรอก");
    expect(s.trackingNo).toBe("");
  });

  it("refuses a number already used by another parcel", async () => {
    const live = SHIPMENTS.filter(
      (x) => x.trackingNo && !["Draft", "Cancelled"].includes(x.status),
    );
    const taken = live[0].trackingNo;
    const target = live[1];
    const before = target.trackingNo;
    const { ctx, getModal, lastToast } = stub();

    setCurrentUser(WAREHOUSE);
    shpSetTrackingNo(target, ctx);
    const ok = await answerTracking(getModal(), taken);

    expect(ok, "a reused number makes the trace back from it ambiguous").toBe(false);
    expect(lastToast().title).toBe("เลขพัสดุซ้ำ");
    expect(target.trackingNo, "and the old one is left alone").toBe(before);
  });

  it("writes the number and records who did it", async () => {
    const s = SHIPMENTS.find((x) => !["Draft", "Cancelled"].includes(x.status))!;
    s.trackingNo = "";
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    shpSetTrackingNo(s, ctx);
    await answerTracking(getModal(), "NEWTRACK-0001");

    expect(s.trackingNo).toBe("NEWTRACK-0001");
    expect(s.history.some((h) => h.t.includes("Tracking number"))).toBe(true);
    expect(s.audit.some((a) => a.field === "trackingNo")).toBe(true);
  });
});

/* ============================================================
   TELLING THE SALESPERSON
   ============================================================ */

describe("Entering it tells whoever raised the paperwork", () => {
  it("reaches the person named on the order, with the number in the message", async () => {
    const s = SHIPMENTS.find((x) => !["Draft", "Cancelled"].includes(x.status) && x.soRef)!;
    const so = SALES_ORDERS.find((x) => x.code === s.soRef)!;
    /* Give the order an author this seed row can be checked against, rather
       than skipping the assertion when the seed happens not to carry one. */
    so.srRef = "";
    so.createdBy = "สุภาวิตา โยธะพันธ์";
    decorateOutbound();

    s.trackingNo = "";
    const { ctx, getModal } = stub();
    setCurrentUser(WAREHOUSE);
    shpSetTrackingNo(s, ctx);
    await answerTracking(getModal(), "TELLME-0001");

    const item = NOTIFY_ITEMS.find((n) => n.docCode === s.code && n.toUser === so.createdBy);
    expect(item, "the salesperson is told their customer's goods left").toBeTruthy();
    expect(item!.body, "and does not have to open anything to get the number").toContain(
      "TELLME-0001",
    );
  });

  it("does not tell the person who entered it", async () => {
    const s = SHIPMENTS.find((x) => !["Draft", "Cancelled"].includes(x.status) && x.soRef)!;
    s.trackingNo = "";
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    shpSetTrackingNo(s, ctx);
    await answerTracking(getModal(), "SELFTEST-0001");

    expect(myNotifications().some((n) => n.docCode === s.code)).toBe(false);
  });
});

/* ============================================================
   BACK UP THE CHAIN
   ============================================================ */

/** The one seeded shipment wired onto the real sales chain. See its note. */
const WIRED = "AF260801001";

describe("A tracking number leads back to the quotation", () => {
  it("walks the whole chain on the seeded data, without the test building it", () => {
    /* The requirement in full, against data as shipped: tracking number →
       shipment → delivery order → sales order → sales request → quotation.
       Nothing below is arranged by this test. */
    const steps = traceFromTracking(WIRED);

    expect(steps.map((x) => x.entity)).toEqual([
      "shipment",
      "delivery-order",
      "sales-order",
      "sales-request",
      "quotation",
    ]);
    expect(steps.map((x) => x.code)).toEqual([
      "SHP-2026-000031",
      "DO2507-0001",
      "SO2506-0001",
      "SR2506-0001",
      "QT2506-0001",
    ]);
  });

  it("still reaches the quotation on an order converted straight from one", () => {
    const so = SALES_ORDERS.find((x) => x.code === "SO2506-0001")!;
    so.srRef = "";
    so.quotationRef = "QT2507-0007";
    decorateOutbound();

    const steps = traceFromTracking(WIRED);
    expect(steps.map((x) => x.entity)).not.toContain("sales-request");
    expect(steps.at(-1)).toEqual({
      entity: "quotation",
      label: "Quotation",
      code: "QT2507-0007",
    });
  });

  it("is case- and space-insensitive, because the number gets read off paper", () => {
    expect(traceFromTracking(`  ${WIRED.toLowerCase()} `).map((x) => x.entity)).toContain(
      "quotation",
    );
  });

  it("returns nothing for a number nobody shipped", () => {
    expect(traceFromTracking("NO-SUCH-PARCEL")).toEqual([]);
    expect(traceFromTracking("")).toEqual([]);
  });

  it("stops where the chain genuinely ends rather than inventing a hop", () => {
    const so = SALES_ORDERS.find((x) => x.code === "SO2506-0001")!;
    so.srRef = "";
    so.quotationRef = "";
    decorateOutbound();

    const steps = traceFromTracking(WIRED);
    expect(steps.at(-1)!.entity, "an order raised directly ends there").toBe("sales-order");
  });

  it("dead-ends at the shipment for the rows whose refs point at nothing", () => {
    /* Not a bug in the walk — the invoice and shipment seeds were authored in
       a different document-code space from the sales chain and never joined
       up. Recorded here so the gap is visible rather than mistaken for the
       trace being broken. See docs/BACKLOG.md item N-4. */
    const orphan = SHIPMENTS.find(
      (x) => x.trackingNo && x.trackingNo !== WIRED && x.doRef.startsWith("DO-2026-"),
    )!;
    expect(orphan, "the seed still carries such rows").toBeTruthy();
    expect(traceFromTracking(orphan.trackingNo).map((x) => x.entity)).toEqual(["shipment"]);
  });
});

/* ============================================================
   THE WHOLE POINT, END TO END
   ============================================================ */

describe("From the customer's question to the quotation", () => {
  it("answers 'where is my order' from the invoice, and traces back from the number", () => {
    const { s, invCode } = shippedWithInvoice();
    const inv = SALES_INVOICES.find((i) => i.code === invCode)!;

    setCurrentUser(SALES_ADMIN);
    const ship = invoiceShipping(inv)!;
    expect(ship.trackingNo).toBeTruthy();

    const steps = traceFromTracking(ship.trackingNo);
    expect(steps[0].code, "the trail starts at the parcel").toBe(s.code);
    expect(steps.at(-1)!.entity, "and ends at the sheet the customer agreed to").toBe(
      "quotation",
    );
  });
});
