import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { USERS } from "@/data/admin";
import { INV_BILLABLE_SOURCE_TYPES } from "@/data/sales-invoices";
import { ListView } from "@/components/engine/ListView";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
  decorateOutbound,
  pickLineAvailability,
  soCloseBlocked,
  type PickRow,
  type SoRow,
} from "@/lib/domain/outbound";
import { PRODUCTS, productStock } from "@/lib/domain/product";
import { billableLinesFrom } from "@/lib/domain/invoice";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { setPath } from "@/lib/utils";
import {
  doCreateInvoice,
  pickFillAvailable,
  soClose,
  soCreateInvoice,
  soCreatePick,
} from "@/lib/workflows-outbound";
import { INV_FORM } from "@/schemas/forms/sales-invoice";
import { qtSchemas } from "@/schemas/quotation";
import { srSchemas } from "@/schemas/sales-request";
import { soSchemas } from "@/schemas/sales-order";
import { pickSchemas } from "@/schemas/picking";
import { packSchemas } from "@/schemas/packing";
import { doSchemas } from "@/schemas/delivery-order";
import { invSchemas } from "@/schemas/sales-invoice";
import type { ActionCtx, EntitySchemas, RecordBase } from "@/lib/types";

/* ============================================================
   THE CHAIN, AND WHAT HOLDS IT TOGETHER

   Four rules, each of which exists because breaking it costs
   real money:

     · a document downstream of the order is never typed from
       scratch — it is what the document before it produced
     · an order comes from an accepted quotation or an approved
       request, and from nowhere else
     · a picking sheet says which lines the warehouse can serve
       today, so the rest can ship as a back order
     · an order closes when the goods are with the customer

   These are the rules, not the screens. Where a rule is enforced
   in two places — the button and the function behind it — both
   are asserted, because only one of them survives a stale page.
   ============================================================ */

const SNAP = {
  qt: JSON.stringify(QUOTATIONS),
  sr: JSON.stringify(SALES_REQUESTS),
  so: JSON.stringify(SALES_ORDERS),
  pick: JSON.stringify(PICKING_TASKS),
  pack: JSON.stringify(PACKING_TASKS),
  do: JSON.stringify(DELIVERY_ORDERS),
};

const restore = (store: unknown[], json: string) => {
  store.length = 0;
  store.push(...(JSON.parse(json) as unknown[]));
};

beforeEach(() => {
  restore(QUOTATIONS, SNAP.qt);
  restore(SALES_REQUESTS, SNAP.sr);
  restore(SALES_ORDERS, SNAP.so);
  restore(PICKING_TASKS, SNAP.pick);
  restore(PACKING_TASKS, SNAP.pack);
  restore(DELIVERY_ORDERS, SNAP.do);
  decorateOutbound();
  resetCurrentUser();
});

function testCtx() {
  const toasts: { title: string; message?: string; tone?: string }[] = [];
  const routes: string[] = [];
  return {
    toasts,
    routes,
    lastToast: () => toasts[toasts.length - 1],
    ctx: {
      goto: (to: string) => routes.push(to),
      openEntity: () => {},
      toast: (title: string, message?: string, tone?: string) =>
        toasts.push({ title, message, tone }),
      confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
      formModal: () => {},
      refresh: () => {},
      quickView: () => {},
      panel: () => {},
    } as unknown as ActionCtx,
  };
}

/** Super Admin — so a refusal in these tests is never about permissions. */
const asAdmin = () =>
  setCurrentUser(USERS.find((u) => u.roleCode === "SUPER_ADMIN" && u.status === "Active")!.code);

/* ============================================================
   RULE 1 — NO BLANK PAGE
   ============================================================ */

/** The registry stores schemas row-typed; these tests only read the shape. */
const anySchemas = (s: unknown) => s as EntitySchemas<RecordBase>;

const DOWNSTREAM: [string, EntitySchemas<RecordBase>][] = [
  ["sales-order", anySchemas(soSchemas)],
  ["picking", anySchemas(pickSchemas)],
  ["packing", anySchemas(packSchemas)],
  ["delivery-order", anySchemas(doSchemas)],
  ["sales-invoice", anySchemas(invSchemas)],
];

describe("เอกสารปลายทางสร้างขึ้นเองไม่ได้", () => {
  it.each(DOWNSTREAM)("%s ประกาศว่ามาจากเอกสารต้นทางเท่านั้น", (_key, schemas) => {
    const rule = schemas.list.convertOnly;
    expect(rule, "the create route reads this to refuse the blank page").toBeTruthy();
    /* The message has to name the document that produces this one — "you
       cannot" without "instead, do this" is where people give up and keep the
       order in a spreadsheet. */
    expect(rule!.from.length).toBeGreaterThan(0);
    expect(rule!.goto.startsWith("/m/")).toBe(true);
  });

  it.each(DOWNSTREAM)("%s ไม่มีปุ่ม Create แม้เป็น Super Admin", (_key, schemas) => {
    asAdmin();
    const { unmount } = render(<ListView schema={schemas.list} />);
    expect(screen.queryByTestId("list-create")).toBeNull();
    unmount();
  });

  it("ยังมีปุ่ม Create ในทะเบียนที่เปิดใหม่ได้ — กฎนี้ไม่ได้ปิดทั้งระบบ", () => {
    asAdmin();
    render(<ListView schema={anySchemas(srSchemas).list} />);
    expect(screen.getByTestId("list-create")).toBeInTheDocument();
  });

  it("เส้นทาง /new เปิดได้เฉพาะใบแจ้งหนี้ที่มีเอกสารต้นทางติดมา", () => {
    /* The rule the create route reads. Four of the five never open the form:
       their conversion writes the record itself. The invoice does, because a
       human still has to say what is being billed — but only with a source. */
    const inv = invSchemas.list.convertOnly!;
    expect(inv.allowSeeded?.({ sourceType: "Delivery Order", sourceDoc: "DO2507-0001" })).toBe(true);
    expect(inv.allowSeeded?.({}), "หน้าเปล่าไม่ผ่าน").toBe(false);
    expect(inv.allowSeeded?.({ sourceType: "Delivery Order", sourceDoc: " " })).toBe(false);

    for (const [key, schemas] of DOWNSTREAM) {
      if (key === "sales-invoice") continue;
      expect(schemas.list.convertOnly!.allowSeeded, key).toBeUndefined();
    }
  });

  it("ต้นทางของสายงาน — ใบเสนอราคาและคำขอขาย — ยังเปิดใหม่ได้", () => {
    /* The rule closes the middle of the chain, not the start of it. A
       salesperson who cannot raise a quotation has no way in at all. */
    expect(qtSchemas.list.convertOnly).toBeUndefined();
    expect(srSchemas.list.convertOnly).toBeUndefined();
  });
});

/* ============================================================
   RULE 2 — AN ORDER COMES FROM A QUOTATION OR A REQUEST
   ============================================================ */

describe("ใบสั่งขายมาจากใบเสนอราคาหรือคำขอขายเท่านั้น", () => {
  it("ทุกใบในระบบอ้างถึงเอกสารที่สร้างมัน", () => {
    for (const so of SALES_ORDERS) {
      expect(
        Boolean(so.srRef) || Boolean(so.quotationRef),
        `${so.code} ต้องมีเอกสารต้นทาง`,
      ).toBe(true);
    }
  });

  it("อ้างได้เอกสารเดียว ไม่ใช่ทั้งสองทาง", () => {
    /* Both filled would mean two documents each believe they produced this
       order — and the bill-type drift badge would compare against the wrong
       one. The conversion writes one field and blanks the other. */
    for (const so of SALES_ORDERS) {
      expect(Boolean(so.srRef) && Boolean(so.quotationRef), `${so.code}`).toBe(false);
    }
  });
});

/* ============================================================
   RULE 3 — WHAT CAN GO TODAY, AND WHAT HAS TO WAIT
   ============================================================ */

/** A catalogue product with stock on the shelf, so the sums have something real. */
const stockedProduct = () => {
  const p = PRODUCTS.find((x) => (productStock(x.code)?.available ?? 0) > 3)!;
  return { product: p, available: productStock(p.code)!.available };
};

/** A picking task for one line of `qty`, pushed into the live store. */
function seedPick(code: string, name: string, unit: string, qty: number, picked = 0): PickRow {
  const task = {
    code: "PK-TEST-0001",
    soRef: "SO-TEST",
    customer: "ลูกค้าทดสอบ",
    customerCode: "BP000001",
    warehouse: "WH-01 คลังหลัก",
    assignedTo: "",
    priority: "Normal",
    status: "Assigned",
    pickDate: "",
    dueDate: "",
    strategy: "FEFO (หมดอายุก่อน หยิบก่อน)",
    remark: "",
    items: [
      { line: 1, code, name, unit, lot: "", ordered: qty, picked, bin: "", status: "Pending", note: "" },
    ],
    packRef: "",
    history: [],
    created: "",
    createdBy: "",
    updated: "",
    updatedBy: "",
  } as unknown as PickRow;
  PICKING_TASKS.unshift(task);
  decorateOutbound();
  return task;
}

describe("ใบหยิบสินค้าบอกว่าอะไรมีของ อะไรต้องรอ", () => {
  it("แยกจำนวนที่หยิบได้วันนี้ออกจากจำนวนที่ต้องรอของ", () => {
    const { product, available } = stockedProduct();
    const task = seedPick(product.code, product.name, product.unit, available + 5);

    expect(task.readyQty).toBe(available);
    expect(task.waitQty).toBe(5);
    expect(task.waitLines).toBe(1);
  });

  it("ไม่นับสต๊อกซ้ำกับของที่หยิบไปแล้ว", () => {
    /* The stock figure is what was on the shelf before the picker started.
       Counting it again against the units they have already taken would make
       "รอของ" shrink every time somebody picked — backwards, and it would
       hide a back order nobody then goes and buys. */
    const { product, available } = stockedProduct();
    const task = seedPick(product.code, product.name, product.unit, available + 5, available);

    expect(task.readyQty).toBe(0);
    expect(task.waitQty).toBe(5);
  });

  it("สินค้าที่ไม่มีในทะเบียนไม่ถูกนับเป็นของที่ต้องรอ", () => {
    /* Nobody has said the shelf is empty — an unmapped code is a pick to
       attempt, not a phantom back order for the buyer to chase. */
    const cover = pickLineAvailability({ code: "NOT-A-REAL-CODE", ordered: 4, picked: 0 });
    expect(cover.available).toBeNull();
    expect(cover.readyQty).toBe(4);
    expect(cover.waitQty).toBe(0);
  });

  it("เติมจำนวนตามของที่มี แล้วปล่อยส่วนที่ขาดค้างไว้", () => {
    asAdmin();
    const { product, available } = stockedProduct();
    const task = seedPick(product.code, product.name, product.unit, available + 5);
    const { ctx } = testCtx();

    pickFillAvailable(task, ctx);

    expect(task.items[0].picked, "หยิบได้เท่าที่มีจริง").toBe(available);
    expect(task.waitQty, "ส่วนที่ขาดยังค้างอยู่เท่าเดิม").toBe(5);
  });

  it("กดเติมซ้ำไม่ได้ของเพิ่ม", () => {
    asAdmin();
    const { product, available } = stockedProduct();
    const task = seedPick(product.code, product.name, product.unit, available + 5);
    const { ctx, lastToast } = testCtx();

    pickFillAvailable(task, ctx);
    pickFillAvailable(task, ctx);

    expect(task.items[0].picked).toBe(available);
    expect(lastToast().title).toBe("ไม่มีของให้หยิบเพิ่ม");
  });

  it("ใบหยิบรอบถัดไปมีเฉพาะบรรทัดที่ยังค้าง", () => {
    asAdmin();
    const so = SALES_ORDERS.find(
      (s) => (s.items ?? []).length > 1 && ["Confirmed", "Picking"].includes(s.status),
    )!;
    /* One line filled by an earlier round, the rest still owed. */
    so.items[0].picked = so.items[0].qty;
    PICKING_TASKS.length = 0;
    decorateOutbound();
    const { ctx } = testCtx();

    soCreatePick(so, ctx);

    const task = PICKING_TASKS.find((t) => t.soRef === so.code)!;
    expect(task.items).toHaveLength(so.items.length - 1);
    expect(task.items.some((it) => it.code === so.items[0].code)).toBe(false);
  });
});

/* ============================================================
   RULE 4 — AN ORDER CLOSES WHEN THE GOODS ARRIVE
   ============================================================ */

/** An open order whose lines are all still owed. */
const openOrder = (): SoRow =>
  SALES_ORDERS.find((s) => ["Confirmed", "Picking", "Partially Delivered"].includes(s.status))!;

describe("ปิดใบสั่งขายได้ต่อเมื่อส่งของครบ", () => {
  it("บอกจำนวนที่ยังค้าง แทนที่จะบอกแค่ว่าปิดไม่ได้", () => {
    const so = openOrder();
    so.items.forEach((it) => (it.delivered = 0));
    decorateOutbound();

    const why = soCloseBlocked(so);
    expect(why).toContain("ยังส่งมอบไม่ครบ");
    expect(why).toContain(String(so.orderedQty));
  });

  it("soClose ปฏิเสธเมื่อยังส่งไม่ครบ", () => {
    asAdmin();
    const so = openOrder();
    so.items.forEach((it) => (it.delivered = 0));
    decorateOutbound();
    const before = so.status;
    const { ctx, lastToast } = testCtx();

    soClose(so, ctx);

    expect(so.status, "สถานะต้องไม่ขยับ").toBe(before);
    expect(lastToast().title).toBe("ปิดใบสั่งขายไม่ได้");
  });

  it("soClose ปิดได้เมื่อส่งครบทุกบรรทัด", () => {
    asAdmin();
    const so = openOrder();
    so.items.forEach((it) => (it.delivered = it.qty));
    decorateOutbound();
    const { ctx } = testCtx();

    expect(soCloseBlocked(so)).toBeNull();
    soClose(so, ctx);
    expect(so.status).toBe("Completed");
  });

  it("ส่งเกือบครบก็ยังปิดไม่ได้", () => {
    /* One unit short is still short. This is the case a "close it, near
       enough" habit would quietly swallow. */
    const so = openOrder();
    so.items.forEach((it) => (it.delivered = it.qty));
    so.items[0].delivered = Number(so.items[0].qty) - 1;
    decorateOutbound();

    expect(soCloseBlocked(so)).toContain("คงเหลืออีก 1 หน่วย");
  });
});

/* ============================================================
   PARTIAL DELIVERY BILLS PARTIALLY
   ============================================================ */

describe("ใบแจ้งหนี้เปิดจากเอกสารต้นทางเท่านั้น", () => {
  it("ต้นทางที่เปิดใบใหม่ได้เหลือเฉพาะใบส่งของกับใบสั่งขาย", () => {
    expect([...INV_BILLABLE_SOURCE_TYPES]).toEqual(["Delivery Order", "Sales Order"]);
    expect([...INV_BILLABLE_SOURCE_TYPES]).not.toContain("Manual");
  });

  it("ฟอร์มใบใหม่เริ่มที่ใบส่งของ ไม่ใช่ Manual", () => {
    expect(INV_FORM.blank().sourceType).toBe("Delivery Order");
  });

  it("ใบส่งของที่ออกจากคลังแล้วเปิดใบแจ้งหนี้พร้อมต้นทางที่เลือกไว้ให้", () => {
    asAdmin();
    const d = DELIVERY_ORDERS.find((x) => ["Shipped", "Delivered"].includes(x.status))!;
    const { ctx, routes } = testCtx();

    doCreateInvoice(d, ctx);

    expect(routes[0]).toContain("/m/sales-invoice/new");
    expect(routes[0]).toContain(encodeURIComponent("Delivery Order"));
    expect(routes[0]).toContain(encodeURIComponent(d.code));
  });

  it("ใบส่งของที่ของยังไม่ออกจากคลัง วางบิลไม่ได้", () => {
    asAdmin();
    const d = DELIVERY_ORDERS.find((x) => ["Draft", "Ready"].includes(x.status))!;
    const { ctx, routes, lastToast } = testCtx();

    doCreateInvoice(d, ctx);

    expect(routes, "ต้องไม่พาไปหน้าเปิดใบแจ้งหนี้").toHaveLength(0);
    expect(lastToast().title).toBe("ออกใบแจ้งหนี้ไม่ได้");
  });

  it("ต้นทางที่ส่งมากับ URL ดึงหัวเอกสารและบรรทัดที่ยังวางบิลไม่ครบมาให้", () => {
    /* Exactly what MasterForm does with `seed`: write each field onto the
       blank draft and fire the form's own onChange, in the order given. The
       order is the point — the document list is read off the type, so a
       sourceDoc applied first would land on an empty list and pull nothing. */
    const d = DELIVERY_ORDERS.find(
      (x) =>
        ["Shipped", "Delivered"].includes(x.status) &&
        billableLinesFrom("Delivery Order", x.code).length > 0,
    )!;
    const state = INV_FORM.blank();

    for (const [path, value] of Object.entries({
      sourceType: "Delivery Order",
      sourceDoc: d.code,
    })) {
      setPath(state, path, value);
      INV_FORM.onChange?.(path, state);
    }

    expect(state.customerCode).toBe(d.customerCode);
    expect((state.items as unknown[]).length).toBeGreaterThan(0);
  });

  it("ใบสั่งขายที่ยืนยันแล้ววางบิลก่อนส่งได้", () => {
    /* The deposit and the cash sale. What ships is billed from the delivery
       note instead, and the form nets both against what is already billed. */
    asAdmin();
    const so = openOrder();
    const { ctx, routes } = testCtx();

    soCreateInvoice(so, ctx);

    expect(routes[0]).toContain(encodeURIComponent("Sales Order"));
    expect(routes[0]).toContain(encodeURIComponent(so.code));
  });
});
