import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { PICKING_TASKS as RAW_PICK } from "@/data/picking";
import { PACKING_TASKS as RAW_PACK } from "@/data/packing";
import { DELIVERY_ORDERS as RAW_DO } from "@/data/delivery-orders";
import { SALES_INVOICES as RAW_INV } from "@/data/sales-invoices";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  SALES_ORDERS,
  decorateOutbound,
  type DoRow,
  type PackRow,
  type PickRow,
  type SoRow,
} from "@/lib/domain/outbound";
import { SALES_INVOICES, decorateInvoices, type InvRow } from "@/lib/domain/invoice";
import { SalesOrderDocument } from "@/components/sales-order/SalesOrderDocument";
import { PickingDocument } from "@/components/picking/PickingDocument";
import { PackingDocument } from "@/components/packing/PackingDocument";
import { DeliveryOrderDocument } from "@/components/delivery-order/DeliveryOrderDocument";
import { SalesInvoiceDocument } from "@/components/sales-invoice/SalesInvoiceDocument";
import { soSchemas } from "@/schemas/sales-order";
import { pickSchemas } from "@/schemas/picking";
import { packSchemas } from "@/schemas/packing";
import { doSchemas } from "@/schemas/delivery-order";
import { invSchemas } from "@/schemas/sales-invoice";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { bahtText } from "@/lib/print";
import { invoiceTotals } from "@/lib/domain/invoice";
import { fmt } from "@/lib/format";

/* ============================================================
   READING THE FIVE DOCUMENTS AFTER THE ORDER

   Sales order, picking, packing, delivery and invoice all used
   to open as a tabbed profile: KPI tiles, then cards, then a
   menu to act from. Somebody standing in front of one of them
   was reading a summary of the document rather than the
   document, which is the same complaint the purchase request
   and the quotation answered first.

   What these tests hold is the shape, not the wording: the sheet
   is there, the tabs are gone, the decision sits under the paper
   and offers only what this chair may press, and the chain and
   the conversation are underneath.
   ============================================================ */

const SNAP = {
  so: JSON.stringify(RAW_SO),
  pick: JSON.stringify(RAW_PICK),
  pack: JSON.stringify(RAW_PACK),
  delivery: JSON.stringify(RAW_DO),
  inv: JSON.stringify(RAW_INV),
};

const ADMIN = "EMP001"; // Super Admin — may press everything
const KIE = "EMP018"; // Warehouse Admin — no business approving a sales order

beforeEach(() => {
  const restore = <T,>(live: T[], snap: string) => {
    live.length = 0;
    live.push(...(JSON.parse(snap) as T[]));
  };
  restore(SALES_ORDERS, SNAP.so);
  restore(PICKING_TASKS, SNAP.pick);
  restore(PACKING_TASKS, SNAP.pack);
  restore(DELIVERY_ORDERS, SNAP.delivery);
  restore(SALES_INVOICES, SNAP.inv);
  decorateOutbound();
  decorateInvoices();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

/**
 * A record in the state under test.
 *
 * Seeded data does not carry every status — there is no Draft sales order —
 * so when one is missing it is synthesised from the first record rather than
 * the test quietly passing on an empty find.
 */
function withStatus<T extends { code: string; status: string }>(
  live: T[],
  status: string,
  prefix: string,
): T {
  const found = live.find((r) => r.status === status);
  if (found) return found;
  const rec = { ...live[0], code: `${prefix}-TEST-${status}`, status };
  live.unshift(rec);
  decorateOutbound();
  decorateInvoices();
  return rec;
}

const so = (status: string) => withStatus(SALES_ORDERS as SoRow[], status, "SO");
const pick = (status: string) => withStatus(PICKING_TASKS as PickRow[], status, "PK");
const pack = (status: string) => withStatus(PACKING_TASKS as PackRow[], status, "PACK");
const delivery = (status: string) => withStatus(DELIVERY_ORDERS as DoRow[], status, "DO");
const invoice = (status: string) => withStatus(SALES_INVOICES as InvRow[], status, "INV");

/* ============================================================
   1. ALL FIVE ARE DOCUMENTS NOW
   ============================================================ */

describe("เอกสารขาออกทั้งห้าใบ เปิดดูเป็นใบเอกสาร", () => {
  const cases = [
    {
      name: "ใบสั่งขาย",
      testId: "sales-order-document",
      title: /^SALES ORDER/,
      bar: "so-decision-bar",
      render: () => render(<SalesOrderDocument record={so("Confirmed")} />),
    },
    {
      name: "ใบจัดสินค้า",
      testId: "picking-document",
      title: /^PICKING LIST/,
      bar: "pick-decision-bar",
      render: () => render(<PickingDocument record={pick("In Progress")} />),
    },
    {
      name: "ใบบรรจุหีบห่อ",
      testId: "packing-document",
      title: /^PACKING LIST/,
      bar: "pack-decision-bar",
      render: () => render(<PackingDocument record={pack("Completed")} />),
    },
    {
      name: "ใบส่งสินค้า",
      testId: "delivery-order-document",
      title: /^DELIVERY ORDER/,
      bar: "do-decision-bar",
      render: () => render(<DeliveryOrderDocument record={delivery("Shipped")} />),
    },
    {
      name: "ใบแจ้งหนี้",
      testId: "sales-invoice-document",
      title: /^SALES INVOICE/,
      bar: "inv-decision-bar",
      render: () => render(<SalesInvoiceDocument record={invoice("Issued")} />),
    },
  ];

  for (const c of cases) {
    it(`${c.name} — เป็นกระดาษ ไม่ใช่การ์ดสรุปเป็นแท็บ`, () => {
      c.render();
      expect(screen.getByTestId(c.testId)).toBeInTheDocument();
      expect(screen.getByText(c.title)).toBeInTheDocument();
      expect(screen.queryByRole("tab")).toBeNull();
    });

    it(`${c.name} — มีแถบตัดสินใจ ประวัติ และห้องแชทใต้กระดาษ`, () => {
      setCurrentUser(ADMIN);
      c.render();
      expect(screen.getByTestId(c.bar)).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
      expect(screen.getByTestId("doc-comments")).toBeInTheDocument();
      /* A thread that looks real and forgets what you wrote is worse than no
         thread — it says so on the page. */
      expect(
        within(screen.getByTestId("doc-comments")).getByText(/Mock — ยังไม่ได้เก็บข้อมูล/),
      ).toBeInTheDocument();
    });
  }

  it("route ของทั้งห้าเลือก document ก่อน detail", () => {
    for (const s of [soSchemas, pickSchemas, packSchemas, doSchemas, invSchemas]) {
      expect(s.document).toBeTruthy();
      /* The tabbed schema stays as the fallback rather than being deleted —
         it is still what the Quick View drawer renders. */
      expect(s.detail).toBeTruthy();
    }
  });
});

/* ============================================================
   2. WHAT EACH SHEET SAYS THAT THE OTHERS DO NOT
   ============================================================ */

describe("ใบสั่งขาย", () => {
  it("ชื่อเอกสารมาจาก print config ใบเดียวกับที่พิมพ์ออกมา", () => {
    /* SO2506-0005 bills Non VAT, so the form it prints as is the Non VAT one
       — and the screen says so too, rather than calling itself a VAT sheet
       right up until somebody presses print. */
    const rec = so("Confirmed");
    expect(rec.billType).toBe("Non VAT");
    render(<SalesOrderDocument record={rec} />);
    expect(screen.getByText("SALES ORDER — NON VAT")).toBeInTheDocument();
    expect(screen.getByText("ใบสั่งขาย (ไม่มีภาษีมูลค่าเพิ่ม)")).toBeInTheDocument();
  });

  it("ทุกบรรทัดบอกว่าค้างส่งเท่าไร", () => {
    const rec = so("Partially Delivered");
    render(<SalesOrderDocument record={rec} />);

    const line = rec.items.find((l) => Number(l.qty) > Number(l.delivered))!;
    const row = within(screen.getAllByRole("table")[0]).getByText(line.code).closest("tr")!;
    expect(
      within(row).getByText(fmt(Number(line.qty) - Number(line.delivered))),
    ).toBeInTheDocument();
  });

  it("ใบที่ติดเครดิต บอกบนกระดาษ ไม่ใช่ใต้ปุ่ม", () => {
    const rec = so("On Hold");
    render(<SalesOrderDocument record={rec} />);

    /* A credit hold read after the decision is a credit hold read too late,
       so the notice sits inside the paper, above the lines. */
    const paper = screen.getByTestId("sales-order-document");
    expect(
      within(paper).getByText(/ใบสั่งขายถูกระงับด้วยเหตุผลด้านเครดิต/),
    ).toBeInTheDocument();
  });

  it("คลังสินค้าไม่เห็นปุ่มยืนยันหรืออนุมัติเครดิต", () => {
    setCurrentUser(KIE);
    render(<SalesOrderDocument record={so("Draft")} />);

    const bar = screen.getByTestId("so-decision-bar");
    expect(within(bar).queryByRole("button", { name: /ยืนยันใบสั่งขาย/ })).toBeNull();
    expect(within(bar).queryByRole("button", { name: /อนุมัติเครดิต/ })).toBeNull();
  });

  it("ผู้มีสิทธิ์อนุมัติเห็นปุ่มยืนยันบนใบร่าง", () => {
    setCurrentUser(ADMIN);
    render(<SalesOrderDocument record={so("Draft")} />);
    expect(
      within(screen.getByTestId("so-decision-bar")).getByRole("button", {
        name: /ยืนยันใบสั่งขาย/,
      }),
    ).toBeInTheDocument();
  });

  it("เอกสารที่เกี่ยวข้องกดไปต่อได้", () => {
    const rec = so("Picking");
    render(<SalesOrderDocument record={rec} />);

    const related = screen.getByTestId("doc-related");
    /* The pick raised against this order is one click away — a warehouse
       document is meaningless without the order it serves. */
    expect(within(related).getAllByRole("button").length).toBeGreaterThan(0);
  });
});

describe("ใบจัดสินค้า", () => {
  it("บอกของที่มีในคลังตอนนี้ ไม่ใช่ตัวเลขตอนเปิดงาน", () => {
    render(<PickingDocument record={pick("In Progress")} />);
    /* Read live off the stock master every render: a task raised yesterday
       must not send anybody to a bin another order emptied this morning. */
    expect(screen.getByText("คงเหลือในคลัง")).toBeInTheDocument();
    expect(screen.getByText("สถานะของ")).toBeInTheDocument();
  });

  it("งานที่หยิบไม่ครบ บอกว่าใบสั่งขายจะยังปิดไม่ได้", () => {
    const rec = pick("In Progress");
    render(<PickingDocument record={rec} />);
    const paper = screen.getByTestId("picking-document");
    expect(within(paper).getByText(/^หยิบไม่ครบ \d+ บรรทัด$/)).toBeInTheDocument();
    expect(
      within(paper).getByText(new RegExp(`${rec.soRef} จะยังปิดไม่ได้`)),
    ).toBeInTheDocument();
  });

  it("ไม่มีราคาบนใบจัดสินค้า", () => {
    /* The one document in the chain with no money on it: the floor packs
       goods and has no business with the selling price. */
    render(<PickingDocument record={pick("Completed")} />);
    const paper = screen.getByTestId("picking-document");
    expect(within(paper).queryByText("Unit Price")).toBeNull();
    expect(within(paper).queryByText("Amount")).toBeNull();
  });
});

describe("ใบบรรจุหีบห่อ", () => {
  it("แยกสามจำนวน: สั่ง หยิบได้ และยืนยันส่ง", () => {
    render(<PackingDocument record={pack("Completed")} />);
    const head = screen.getAllByRole("table")[0].querySelector("thead")!;
    for (const th of ["สั่ง", "หยิบได้", "ยืนยันส่ง"]) {
      expect(within(head).getByText(th), th).toBeInTheDocument();
    }
  });

  it("บรรทัดที่ยังไม่มีใครยืนยัน บอกว่ายังไม่ยืนยัน", () => {
    const rec = pack("Completed");
    for (const it of rec.items) delete it.confirmedQty;
    rec.doRef = "";
    decorateOutbound();

    render(<PackingDocument record={rec} />);
    /* undefined and zero are different answers — zero is a confirmed refusal
       to ship, undefined is nobody having looked. */
    expect(screen.getAllByText("ยังไม่ยืนยัน").length).toBeGreaterThan(0);
    expect(screen.getByText(/ยังไม่ได้ยืนยันจำนวนที่ส่งได้/)).toBeInTheDocument();
  });

  it("ยังไม่ยืนยัน ก็ยังไม่มีปุ่มเปิดใบส่งสินค้า", () => {
    setCurrentUser(ADMIN);
    const rec = pack("Completed");
    for (const it of rec.items) delete it.confirmedQty;
    rec.doRef = "";
    decorateOutbound();

    render(<PackingDocument record={rec} />);
    const bar = screen.getByTestId("pack-decision-bar");
    expect(within(bar).queryByRole("button", { name: /เปิดใบส่งสินค้า/ })).toBeNull();
    expect(
      within(bar).getByRole("button", { name: /ยืนยันจำนวนที่ส่งได้/ }),
    ).toBeInTheDocument();
  });

  it("มีตารางกล่องพร้อมน้ำหนักและเลขซีล", () => {
    render(<PackingDocument record={pack("Completed")} />);
    expect(screen.getByText("Packages")).toBeInTheDocument();
    expect(screen.getByText("Seal No.")).toBeInTheDocument();
  });
});

describe("ใบส่งสินค้า", () => {
  it("ใบที่ส่งถึงแล้ว มีหลักฐานการรับสินค้า", () => {
    const rec = delivery("Delivered");
    render(<DeliveryOrderDocument record={rec} />);

    expect(screen.getByText("Proof of Delivery")).toBeInTheDocument();
    expect(screen.getAllByText(rec.receivedBy).length).toBeGreaterThan(0);
  });

  it("ใบที่ยังไม่ถึงปลายทาง ยังไม่มีช่องหลักฐานการรับ", () => {
    render(<DeliveryOrderDocument record={delivery("Draft")} />);
    expect(screen.queryByText("Proof of Delivery")).toBeNull();
  });

  it("ล็อตและซีเรียลอยู่บนบรรทัด เพราะเป็นใบที่ใช้ตามของย้อนหลัง", () => {
    render(<DeliveryOrderDocument record={delivery("Delivered")} />);
    expect(screen.getByText("ล็อต / ซีเรียล")).toBeInTheDocument();
  });

  it("ใบที่ส่งไม่สำเร็จ บอกเหตุผลบนกระดาษ", () => {
    const rec = delivery("Failed");
    render(<DeliveryOrderDocument record={rec} />);
    const paper = screen.getByTestId("delivery-order-document");
    expect(within(paper).getByText("ส่งไม่สำเร็จ")).toBeInTheDocument();
  });
});

describe("ใบแจ้งหนี้", () => {
  it("มีจำนวนเงินเป็นตัวอักษร ตามที่เอกสารภาษีต้องมี", () => {
    const rec = invoice("Issued");
    render(<SalesInvoiceDocument record={rec} />);

    expect(screen.getByText("Amount in Words")).toBeInTheDocument();
    /* Read through the same `bahtText` the printed sheet uses, so the two
       cannot spell one total two ways. */
    expect(screen.getByText(bahtText(invoiceTotals(rec).grandTotal))).toBeInTheDocument();
  });

  it("ใบที่เกินกำหนดชำระ บอกจำนวนวันและยอดค้าง", () => {
    const rec = invoice("Overdue");
    render(<SalesInvoiceDocument record={rec} />);
    const paper = screen.getByTestId("sales-invoice-document");
    expect(within(paper).getByText(/^เกินกำหนดชำระ \d+ วัน$/)).toBeInTheDocument();
  });

  it("ใบที่ถูก Void บอกเหตุผลและผู้อนุมัติ", () => {
    const rec = invoice("Void");
    render(<SalesInvoiceDocument record={rec} />);
    const paper = screen.getByTestId("sales-invoice-document");
    expect(within(paper).getByText("ใบแจ้งหนี้ถูก Void")).toBeInTheDocument();
    expect(within(paper).getByText(new RegExp(rec.voidBy))).toBeInTheDocument();
  });

  it("ใบร่างมีปุ่มส่งตรวจสอบ ไม่ใช่ปุ่มออกใบแจ้งหนี้", () => {
    setCurrentUser(ADMIN);
    render(<SalesInvoiceDocument record={invoice("Draft")} />);

    const bar = screen.getByTestId("inv-decision-bar");
    expect(within(bar).getByRole("button", { name: /ส่งตรวจสอบ/ })).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^ออกใบแจ้งหนี้/ })).toBeNull();
  });
});
