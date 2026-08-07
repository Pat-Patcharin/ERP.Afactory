import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { PACKING_TASKS as RAW_PACK } from "@/data/packing";
import { DELIVERY_ORDERS as RAW_DO } from "@/data/delivery-orders";
import { NOTIFY_ITEMS as RAW_NOTIFY } from "@/data/notifications";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  SALES_ORDERS,
  checkConfirmLines,
  confirmLines,
  decorateOutbound,
  packIsConfirmed,
  type PackRow,
  type SoRow,
} from "@/lib/domain/outbound";
import { billableLinesFrom, remainingBillable } from "@/lib/domain/invoice";
import { NOTIFY_ITEMS, myNotifications, rolesWhoMay } from "@/lib/domain/notify";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { packConfirmShipQty, packCreateDelivery } from "@/lib/workflows-outbound";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   THE WAREHOUSE CONFIRMS WHAT CAN SHIP

   Before this step the order's intention travelled all the way
   to the tax invoice: the pack line defaulted to what was
   picked, the delivery note to the pack line, the invoice to the
   delivery note. Nothing along that chain was a statement by
   anybody that the goods were on the lorry.

   Two desks, and neither may do the other's job. The warehouse
   says what ships; the sales desk turns that into paperwork.

   Most of what follows is refusals, because that is the only
   evidence a guard is real — this file exists because three
   earlier rules in this project read as working code while
   refusing nobody.
   ============================================================ */

const SALES_ADMIN = "EMP013";
const WAREHOUSE = "EMP008";

const SNAP = {
  so: JSON.stringify(RAW_SO),
  pack: JSON.stringify(RAW_PACK),
  do: JSON.stringify(RAW_DO),
  notify: JSON.stringify(RAW_NOTIFY),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(SALES_ORDERS, SNAP.so);
  restore(PACKING_TASKS, SNAP.pack);
  restore(DELIVERY_ORDERS, SNAP.do);
  restore(NOTIFY_ITEMS, SNAP.notify);
  decorateOutbound();
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
 * One order, one completed pack, one product.
 *
 * `ordered` is what the customer asked for and `picked` what came off the
 * shelf, so a fixture can be built short at either step independently — the
 * two are different failures and the rules treat them differently.
 */
function readyPack(ordered = 10, picked = 10): { so: SoRow; pack: PackRow } {
  const pack = PACKING_TASKS[0];
  const so = SALES_ORDERS.find((s) => s.code === pack.soRef) ?? SALES_ORDERS[0];
  pack.soRef = so.code;

  so.status = "Picking";
  so.items = [
    {
      code: "TEST-001",
      name: "สินค้าทดสอบ",
      unit: "กล่อง",
      qty: ordered,
      price: 100,
      disc: 0,
      tax: 7,
      picked,
      delivered: 0,
      note: "",
    },
  ] as SoRow["items"];

  pack.status = "Completed";
  pack.doRef = "";
  pack.confirmedAt = "";
  pack.confirmedBy = "";
  pack.items = [
    {
      line: 1,
      code: "TEST-001",
      name: "สินค้าทดสอบ",
      unit: "กล่อง",
      qty: picked,
      packedQty: picked,
      box: "BOX-1",
      note: "",
    },
  ] as PackRow["items"];
  pack.packages = [
    { box: "BOX-1", type: "กล่องกระดาษ", weight: 3, dim: "40x30x30", sealNo: "", note: "" },
  ] as PackRow["packages"];

  /* The seed ships a delivery order for this pack already. Leaving it in
     place would make "no delivery note exists yet" true before the test
     started and false for the wrong reason afterwards. */
  for (let i = DELIVERY_ORDERS.length - 1; i >= 0; i--) {
    if (DELIVERY_ORDERS[i].packRef === pack.code) DELIVERY_ORDERS.splice(i, 1);
  }

  decorateOutbound();
  return { so, pack };
}

/** Answer the confirm dialog by typing into the per-line quantity boxes. */
async function answerConfirm(
  modal: { body: () => ReactNode; onConfirm: () => boolean | void },
  edits: { code: string; qty?: number; reason?: string }[] = [],
) {
  const user = userEvent.setup();
  const { unmount } = render(<>{modal.body()}</>);

  for (const e of edits) {
    if (e.qty !== undefined) {
      const box = screen.getByLabelText(`ยืนยันส่ง ${e.code}`);
      await user.clear(box);
      await user.type(box, String(e.qty));
    }
    if (e.reason !== undefined) {
      const reason = screen.getByLabelText(new RegExp(`เหตุผลที่ ${e.code} ส่งไม่ครบ`));
      await user.type(reason, e.reason);
    }
  }

  const result = modal.onConfirm();
  unmount();
  return result;
}

/* ============================================================
   WHO MAY ANSWER
   ============================================================ */

describe("Only the warehouse may say what ships", () => {
  it("refuses the sales admin, who issues the invoice afterwards", () => {
    const { pack } = readyPack();
    const { ctx, getModal, lastToast } = stub();

    setCurrentUser(SALES_ADMIN);
    packConfirmShipQty(pack, ctx);

    expect(getModal(), "no dialog for a desk that may not answer").toBeFalsy();
    expect(lastToast().title).toBe("สิทธิ์ไม่พอ");
    expect(packIsConfirmed(pack), "and nothing was written").toBe(false);
  });

  it("lets the warehouse through", () => {
    const { pack } = readyPack();
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);

    expect(getModal(), "the floor gets the dialog").toBeTruthy();
  });

  it("refuses the warehouse at the delivery note, the other half of the split", async () => {
    const { pack } = readyPack();
    const w = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, w.ctx);
    await answerConfirm(w.getModal());
    expect(packIsConfirmed(pack), "the floor did its half").toBe(true);

    /* ...and stops there. Raising the customer's paperwork is the sales
       desk's job, and the warehouse holds no delivery-order rights. */
    const a = stub();
    packCreateDelivery(pack, a.ctx);

    expect(a.lastToast().title).toBe("สิทธิ์ไม่พอ");
    expect(DELIVERY_ORDERS.some((d) => d.packRef === pack.code)).toBe(false);
  });
});

/* ============================================================
   WHAT MAY BE ANSWERED
   ============================================================ */

describe("The confirmed quantity has a ceiling and a price", () => {
  it("refuses more than was picked", async () => {
    const { pack } = readyPack(10, 6);
    const { ctx, getModal, lastToast } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);
    const ok = await answerConfirm(getModal(), [{ code: "TEST-001", qty: 8 }]);

    expect(ok, "the write is refused, not merely warned about").toBe(false);
    expect(lastToast().title).toBe("ยืนยันไม่ได้");
    expect(lastToast().message).toContain("เกินจำนวนที่หยิบได้");
    expect(pack.items[0].confirmedQty, "nothing written").toBeUndefined();
  });

  it("refuses short of the order when no reason is given", async () => {
    const { pack } = readyPack(10, 10);
    const { ctx, getModal, lastToast } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);
    const ok = await answerConfirm(getModal(), [{ code: "TEST-001", qty: 7 }]);

    expect(ok).toBe(false);
    expect(lastToast().message).toContain("ต้องระบุเหตุผล");
    expect(pack.items[0].confirmedQty).toBeUndefined();
  });

  it("accepts short of the order once the reason is written down", async () => {
    const { pack } = readyPack(10, 10);
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);
    await answerConfirm(getModal(), [
      { code: "TEST-001", qty: 7, reason: "ของชำรุด 3 กล่องตอนแพ็ค" },
    ]);

    expect(pack.items[0].confirmedQty).toBe(7);
    expect(pack.items[0].shortReason).toContain("ชำรุด");
    expect(pack.confirmedBy, "and who said so").toBeTruthy();
  });

  it("needs no reason to ship exactly what was ordered", async () => {
    const { pack } = readyPack(10, 10);
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);
    const ok = await answerConfirm(getModal());

    expect(ok).not.toBe(false);
    expect(pack.items[0].confirmedQty).toBe(10);
    expect(pack.items[0].shortReason).toBe("");
  });

  it("treats a confirmed zero as an answer, not as an unanswered line", () => {
    const { pack } = readyPack(10, 10);
    const lines = confirmLines(pack);

    /* The distinction the delivery-order guard rests on. */
    expect(packIsConfirmed(pack)).toBe(false);
    pack.items[0].confirmedQty = 0;
    expect(packIsConfirmed(pack), "zero is a decision to ship none of it").toBe(true);
    expect(checkConfirmLines(lines, { "TEST-001": { qty: 0, reason: "ของหมด" } })).toEqual([]);
  });
});

/* ============================================================
   THE GUARD IS ON THE WRITE, NOT ON THE FORM
   ============================================================ */

describe("checkConfirmLines is the rule, and the modal only shows it", () => {
  it("catches an over-confirmation handed straight to it", () => {
    const { pack } = readyPack(10, 6);
    const problems = checkConfirmLines(confirmLines(pack), {
      "TEST-001": { qty: 9, reason: "" },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("เกินจำนวนที่หยิบได้");
  });

  it("catches a line nobody answered at all", () => {
    const { pack } = readyPack(10, 10);
    expect(checkConfirmLines(confirmLines(pack), {})).toEqual([
      expect.stringContaining("ยังไม่ได้ระบุจำนวน"),
    ]);
  });

  it("refuses a negative quantity", () => {
    const { pack } = readyPack(10, 10);
    const problems = checkConfirmLines(confirmLines(pack), {
      "TEST-001": { qty: -1, reason: "พิมพ์ผิด" },
    });
    expect(problems[0]).toContain("ไม่ติดลบ");
  });
});

/* ============================================================
   WHAT THE PAPERWORK IS BUILT FROM
   ============================================================ */

describe("The delivery note is built from the confirmed figure", () => {
  it("refuses to exist before the warehouse has answered", () => {
    const { pack } = readyPack();
    const { ctx, lastToast } = stub();

    setCurrentUser(SALES_ADMIN);
    packCreateDelivery(pack, ctx);

    expect(lastToast().title).toBe("ยังออกใบส่งของไม่ได้");
    expect(DELIVERY_ORDERS.some((d) => d.packRef === pack.code)).toBe(false);
    expect(pack.doRef).toBe("");
  });

  it("carries the confirmed quantity, not the quantity ordered", async () => {
    const { so, pack } = readyPack(10, 10);
    const w = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, w.ctx);
    await answerConfirm(w.getModal(), [
      { code: "TEST-001", qty: 6, reason: "เหลือเท่านี้จริง" },
    ]);

    const a = stub();
    setCurrentUser(SALES_ADMIN);
    packCreateDelivery(pack, a.ctx);
    decorateOutbound();

    const dobj = DELIVERY_ORDERS.find((d) => d.packRef === pack.code)!;
    expect(dobj, "the sales desk raises it").toBeTruthy();
    expect(dobj.items[0].qty, "six confirmed, not ten ordered").toBe(6);
    expect(so.items[0].qty, "the customer still asked for ten").toBe(10);
  });

  it("leaves off a line the warehouse confirmed it cannot ship at all", async () => {
    const { pack } = readyPack(10, 10);
    const w = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, w.ctx);
    await answerConfirm(w.getModal(), [{ code: "TEST-001", qty: 0, reason: "ของหมดทั้งล็อต" }]);

    const a = stub();
    setCurrentUser(SALES_ADMIN);
    packCreateDelivery(pack, a.ctx);

    expect(a.lastToast().title).toBe("ไม่มีของให้ส่ง");
    expect(DELIVERY_ORDERS.some((d) => d.packRef === pack.code)).toBe(false);
  });

  it("raises the shortfall as a back order on the sales order", async () => {
    const { so, pack } = readyPack(10, 10);
    const w = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, w.ctx);
    await answerConfirm(w.getModal(), [{ code: "TEST-001", qty: 4, reason: "ส่งได้เท่านี้ก่อน" }]);

    const a = stub();
    setCurrentUser(SALES_ADMIN);
    packCreateDelivery(pack, a.ctx);
    decorateOutbound();

    expect(so.status).toBe("Partially Delivered");
    expect(so.outstandingQty, "ten asked for, none delivered yet").toBe(10);
    expect(
      so.history.some((h) => h.t === "Back order raised"),
      "and the order says why",
    ).toBe(true);
  });
});

/* ============================================================
   AND WHAT THE CUSTOMER IS BILLED
   ============================================================ */

describe("The invoice cannot bill past what shipped", () => {
  it("offers the confirmed quantity as the billable figure", async () => {
    const { pack } = readyPack(10, 10);
    const w = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, w.ctx);
    await answerConfirm(w.getModal(), [{ code: "TEST-001", qty: 6, reason: "ของไม่พอ" }]);

    const a = stub();
    setCurrentUser(SALES_ADMIN);
    packCreateDelivery(pack, a.ctx);
    decorateOutbound();

    const dobj = DELIVERY_ORDERS.find((d) => d.packRef === pack.code)!;
    const lines = billableLinesFrom("Delivery Order", dobj.code);

    expect(lines[0].invoiceQty, "bills six, the number that left the building").toBe(6);
    expect(lines[0].orderedQty, "while still showing what was ordered").toBe(10);
  });

  it("caps what may be billed at the delivered figure", async () => {
    const { pack } = readyPack(10, 10);
    const w = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, w.ctx);
    await answerConfirm(w.getModal(), [{ code: "TEST-001", qty: 6, reason: "ของไม่พอ" }]);

    const a = stub();
    setCurrentUser(SALES_ADMIN);
    packCreateDelivery(pack, a.ctx);
    decorateOutbound();

    const dobj = DELIVERY_ORDERS.find((d) => d.packRef === pack.code)!;
    const line = billableLinesFrom("Delivery Order", dobj.code)[0];

    /* The rule the invoice form's save path now enforces. Ten was ordered;
       billing ten would be charging for four boxes nobody sent. */
    expect(remainingBillable(line, "Delivery Order")).toBe(6);
    expect(remainingBillable({ ...line, invoiceQty: 10 }, "Delivery Order")).toBe(6);
  });
});

/* ============================================================
   WHO IS TOLD
   ============================================================ */

describe("Confirming tells whoever raises the delivery note", () => {
  it("addresses the roles that may create one, read from the matrix", async () => {
    const { pack } = readyPack(10, 10);
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);
    await answerConfirm(getModal());

    const sent = NOTIFY_ITEMS.filter((n) => n.docCode === pack.code);
    expect(sent.length, "one item per addressed role").toBeGreaterThan(0);

    const may = rolesWhoMay("delivery-order", "create");
    expect(may.length, "somebody must be able to act on it").toBeGreaterThan(0);
    expect(sent.map((n) => n.toRole).sort()).toEqual([...may].sort());
  });

  it("says whether it ships in full or in part", async () => {
    const { pack } = readyPack(10, 10);
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);
    await answerConfirm(getModal(), [{ code: "TEST-001", qty: 4, reason: "ของไม่พอ" }]);

    const item = NOTIFY_ITEMS.find((n) => n.docCode === pack.code)!;
    expect(item.title).toContain("ส่งได้บางส่วน");
    expect(item.body, "with the numbers, so nobody has to open it to know").toContain("4");
  });

  it("reaches the sales admin's inbox, and not the warehouse's own", async () => {
    const { pack } = readyPack(10, 10);
    const { ctx, getModal } = stub();

    setCurrentUser(WAREHOUSE);
    packConfirmShipQty(pack, ctx);
    await answerConfirm(getModal());

    /* Nobody is told their own news — the warehouse caused this one. */
    expect(myNotifications().some((n) => n.docCode === pack.code)).toBe(false);

    setCurrentUser(SALES_ADMIN);
    expect(myNotifications().some((n) => n.docCode === pack.code)).toBe(true);
  });
});
