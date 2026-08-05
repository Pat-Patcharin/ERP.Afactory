import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PrintDocument } from "@/components/print/PrintDocument";
import { QUOTATIONS as RAW_QT } from "@/data/quotations";
import { SALES_ORDERS as RAW_SO } from "@/data/sales-orders";
import { DELIVERY_ORDERS as RAW_DO } from "@/data/delivery-orders";
import { billShows, displayName } from "@/lib/domain/lines";
import { QUOTATIONS, SALES_ORDERS, DELIVERY_ORDERS } from "@/lib/domain/outbound";
import { billableLinesFrom } from "@/lib/domain/invoice";
import { buildPrintJob } from "@/lib/print";

/* ============================================================
   CUSTOM LINE NAMES

   A salesperson can rename a line for the customer and note
   something under it. Two rules are load-bearing:

     - a blank custom name always falls back to the catalogue
       name, so nothing anywhere prints an empty description
     - showOnBill is opt-OUT: a line written before the flag
       existed keeps printing its note

   The second one is the dangerous one. Getting it backwards
   would strip notes from every bill in the system silently.
   ============================================================ */

const QT_SNAP = JSON.stringify(RAW_QT);
const SO_SNAP = JSON.stringify(RAW_SO);
const DO_SNAP = JSON.stringify(RAW_DO);

beforeEach(() => {
  QUOTATIONS.length = 0;
  QUOTATIONS.push(...(JSON.parse(QT_SNAP) as never[]));
  SALES_ORDERS.length = 0;
  SALES_ORDERS.push(...(JSON.parse(SO_SNAP) as never[]));
  DELIVERY_ORDERS.length = 0;
  DELIVERY_ORDERS.push(...(JSON.parse(DO_SNAP) as never[]));
});

describe("displayName — the only way a line is named", () => {
  it("falls back to the catalogue name when there is no custom one", () => {
    expect(displayName({ name: "A-FLEX PU40" })).toBe("A-FLEX PU40");
    expect(displayName({ name: "A-FLEX PU40", customName: "" })).toBe("A-FLEX PU40");
    expect(displayName({ name: "A-FLEX PU40", customName: "   " })).toBe("A-FLEX PU40");
    expect(displayName({ name: "A-FLEX PU40", customName: undefined })).toBe("A-FLEX PU40");
  });

  it("never returns an empty string when the catalogue name exists", () => {
    for (const custom of ["", " ", "\t", undefined]) {
      expect(displayName({ name: "X", customName: custom }), String(custom)).toBe("X");
    }
  });

  it("uses the custom name when one is set", () => {
    expect(displayName({ name: "A-FLEX PU40", customName: "ชุดวัสดุอุดฟัน" })).toBe("ชุดวัสดุอุดฟัน");
  });
});

describe("showOnBill — opt out, never opt in", () => {
  it("treats a line written before the flag existed as visible", () => {
    /* The whole point: no value means the note keeps printing. */
    expect(billShows({ name: "X" })).toBe(true);
    expect(billShows({ name: "X", showOnBill: undefined })).toBe(true);
  });

  it("hides only on an explicit false", () => {
    expect(billShows({ name: "X", showOnBill: true })).toBe(true);
    expect(billShows({ name: "X", showOnBill: false })).toBe(false);
  });
});

describe("The printed sheet", () => {
  const qt = () => QUOTATIONS.find((q) => q.code === "QT2507-0005")!;

  const sheet = (code: string) => {
    const job = buildPrintJob("quotation", code)!;
    expect(job).toBeTruthy();
    return { job, container: render(<PrintDocument job={job} />).container };
  };

  it("prints a legacy line with no flag exactly as before", () => {
    const q = qt();
    q.items[0].note = "รับประกัน 2 ปี";
    delete (q.items[0] as { showOnBill?: boolean }).showOnBill;
    delete (q.items[0] as { customName?: string }).customName;

    const { job, container } = sheet(q.code);
    expect(job.doc.lines[0].description).toBe(q.items[0].name);
    expect(job.doc.lines[0].extraLines).toContain("รับประกัน 2 ปี");
    expect(container.textContent).toContain("รับประกัน 2 ปี");
  });

  it("shows the custom name and note when the line is billable", () => {
    const q = qt();
    q.items[0].customName = "ชุดวัสดุอุดฟันสำหรับสาขาใหม่";
    q.items[0].note = "รับประกัน 2 ปี";
    q.items[0].showOnBill = true;

    const { job } = sheet(q.code);
    expect(job.doc.lines[0].description).toBe("ชุดวัสดุอุดฟันสำหรับสาขาใหม่");
    expect(job.doc.lines[0].extraLines).toContain("รับประกัน 2 ปี");
  });

  it("falls back to the catalogue name and drops the note when hidden", () => {
    const q = qt();
    const catalogue = q.items[0].name;
    q.items[0].customName = "ชื่อภายใน ห้ามออกบิล";
    q.items[0].note = "โน้ตภายใน";
    q.items[0].showOnBill = false;

    const { job } = sheet(q.code);
    expect(job.doc.lines[0].description).toBe(catalogue);
    expect(job.doc.lines[0].extraLines).toEqual([]);
    /* But the system still knows what the salesperson wrote. */
    expect(displayName(q.items[0])).toBe("ชื่อภายใน ห้ามออกบิล");
  });

  it("always prints the product code, whatever the line is called", () => {
    const q = qt();
    q.items[0].customName = "ชื่อที่ลูกค้าเรียก";
    const { job, container } = sheet(q.code);

    expect(job.doc.lines[0].code).toBe(q.items[0].code);
    expect(container.textContent).toContain(q.items[0].code);
  });
});

describe("Internal documents ignore the flag", () => {
  it("shows the custom name on a sales order even when it is off the bill", () => {
    const so = SALES_ORDERS[0];
    so.items[0].customName = "ชื่อที่ตกลงกับลูกค้า";
    so.items[0].showOnBill = false;

    const job = buildPrintJob("sales-order", so.code)!;
    /* The floor has to see what was promised, bill or no bill. */
    expect(job.doc.lines[0].description).toBe("ชื่อที่ตกลงกับลูกค้า");
  });
});

describe("The fields travel down the chain", () => {
  it("carries a custom name from a delivery order into the invoice lines", () => {
    const dobj = DELIVERY_ORDERS.find((d) => d.soRef)!;
    const so = SALES_ORDERS.find((s) => s.code === dobj.soRef)!;
    so.items[0].customName = "ชื่อที่ตกลงกับลูกค้า";
    so.items[0].note = "รับประกัน 2 ปี";
    dobj.items[0].customName = "ชื่อที่ตกลงกับลูกค้า";
    dobj.items[0].note = "รับประกัน 2 ปี";

    const lines = billableLinesFrom("Delivery Order", dobj.code);
    const line = lines.find((l) => l.code === dobj.items[0].code)!;

    expect(line.customName).toBe("ชื่อที่ตกลงกับลูกค้า");
    expect(line.note).toBe("รับประกัน 2 ปี");
    expect(displayName(line)).toBe("ชื่อที่ตกลงกับลูกค้า");
  });
});
