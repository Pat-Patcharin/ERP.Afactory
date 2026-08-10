import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";
import { PRODUCT_FORM } from "@/schemas/forms/product";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { resetCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   WHEREVER THERE IS A COLUMN OF TICKS

   …there is a tick for the column. Ticking fourteen rows one at
   a time is the work a screen exists to save somebody, and a
   table that offers no way to clear a selection makes the user
   undo it row by row as well.

   Three states, not two: all, none, and SOME — the header shows
   indeterminate rather than lying in either direction.
   ============================================================ */

beforeEach(() => {
  window.localStorage.clear();
  resetCurrentUser();
});

describe("ตารางรายการในเอกสาร", () => {
  it("มีช่องติ๊กหัวตารางที่เลือกทุกบรรทัดได้", async () => {
    render(<QuotationEditor />);

    const all = screen.getByLabelText("เลือกทุกบรรทัด");
    expect(all).not.toBeChecked();

    await userEvent.click(all);
    /* The row-selection ticks, by name — a document row carries other
       checkboxes of its own (show this name on the bill, and so on) and
       those are not part of the selection. */
    const rows = screen.getAllByLabelText(/^เลือกบรรทัดที่ /);
    expect(rows.length).toBeGreaterThan(0);
    for (const b of rows) expect(b).toBeChecked();
    expect(all).toBeChecked();

    await userEvent.click(all);
    for (const b of rows) expect(b).not.toBeChecked();
  });
});

describe("ตารางย่อยในฟอร์ม", () => {
  /** The units grid carries an Active column — a column of ticks. */
  const unitsGrid = () => document.getElementById("form-product-units")!;

  it("คอลัมน์ติ๊กในตารางย่อย มีติ๊กที่หัวคอลัมน์", async () => {
    render(<MasterForm schema={PRODUCT_FORM} />);
    const grid = within(unitsGrid());

    /* Two rows, so the header has something to do. */
    const add = grid.getAllByRole("button", { name: /เพิ่มหน่วยขาย|เพิ่ม/ })[0];
    await userEvent.click(add);
    await userEvent.click(add);

    const all = grid.getByLabelText("Active — ทุกแถว");
    /* New rows open Active, so the header opens ticked. */
    expect(all).toBeChecked();

    await userEvent.click(all);
    const rowBoxes = grid.getAllByRole("checkbox").filter((b) => b !== all);
    expect(rowBoxes.length).toBeGreaterThan(0);
    for (const b of rowBoxes) expect(b).not.toBeChecked();

    await userEvent.click(all);
    for (const b of rowBoxes) expect(b).toBeChecked();
  });

  it("ติ๊กบางแถว หัวคอลัมน์เป็นครึ่งติ๊ก ไม่ใช่ติ๊กหรือว่าง", async () => {
    render(<MasterForm schema={PRODUCT_FORM} />);
    const grid = within(unitsGrid());

    const add = grid.getAllByRole("button", { name: /เพิ่มหน่วยขาย|เพิ่ม/ })[0];
    await userEvent.click(add);
    await userEvent.click(add);

    const all = grid.getByLabelText("Active — ทุกแถว") as HTMLInputElement;
    const rowBoxes = grid
      .getAllByRole("checkbox")
      .filter((b) => b !== all) as HTMLInputElement[];

    await userEvent.click(rowBoxes[0]);

    /* Some on, some off — the header must say so rather than pick a side. */
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(true);
  });
});
