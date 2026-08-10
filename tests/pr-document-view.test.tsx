import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PURCHASE_REQUESTS as RAW_PR } from "@/data/purchase-requests";
import { PURCHASE_REQUESTS, decoratePRs, type PrRow } from "@/lib/domain/purchase";
import { PurchaseRequestDocument } from "@/components/purchase-request/PurchaseRequestDocument";
import { prSchemas } from "@/schemas/purchase-request";
import { productStock } from "@/lib/domain/product";
import { fmt } from "@/lib/format";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   READING A PURCHASE REQUEST

   The document is the screen. What sits under it — the decision,
   the history, the thread — is what an approver came for, and
   the buttons offered are only the ones this person may press on
   THIS document.
   ============================================================ */

const SNAP = JSON.stringify(RAW_PR);

const PIM = "EMP014"; // Backoffice — raises requests
const PRAEW = "EMP015"; // General Manager — signs them
const KIE = "EMP018"; // Warehouse Admin — no business with a request

beforeEach(() => {
  PURCHASE_REQUESTS.length = 0;
  PURCHASE_REQUESTS.push(...(JSON.parse(SNAP) as PrRow[]));
  decoratePRs();
  resetCurrentUser();
});

afterEach(resetCurrentUser);

const ctx = () =>
  ({
    goto: () => {},
    openEntity: () => {},
    toast: () => {},
    confirm: (o: { onConfirm: () => void }) => o.onConfirm(),
    formModal: () => {},
    refresh: () => {},
    quickView: () => {},
    panel: () => {},
  }) as unknown as ActionCtx;

const pr = (status: string) => PURCHASE_REQUESTS.find((p) => p.status === status)!;

describe("Purchase Request — เปิดดูแล้วเป็นเอกสาร", () => {
  it("แสดงเป็นใบขอซื้อ ไม่ใช่การ์ดสรุปเป็นแท็บ", () => {
    render(<PurchaseRequestDocument record={pr("Open")} />);

    expect(screen.getByTestId("purchase-request-document")).toBeInTheDocument();
    expect(screen.getByText("PURCHASE REQUEST")).toBeInTheDocument();
    expect(screen.getByText("ใบขอซื้อ")).toBeInTheDocument();
    /* The tabbed profile is gone from this route — no Overview/Items/Approval
       tab strip to click through before reaching the document. */
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("route ของเอกสารเลือก document ก่อน detail", () => {
    expect(prSchemas.document).toBeTruthy();
    /* The tabbed schema stays as the fallback rather than being deleted —
       it is still what every other master renders through. */
    expect(prSchemas.detail).toBeTruthy();
  });

  it("ทุกบรรทัดโชว์ On Hand / On Order / Back Order / Available", () => {
    const rec = pr("Open");
    render(<PurchaseRequestDocument record={rec} />);

    for (const label of ["On Hand", "On Order", "Back Order", "Available"]) {
      expect(screen.getByText(label), label).toBeInTheDocument();
    }

    /* Read from productStock, not restated in the component — a change to
       the stock definitions moves this with the code. */
    const first = rec.items[0];
    const st = productStock(first.code)!;
    const table = screen.getByRole("table");
    const row = within(table).getByText(first.code).closest("tr")!;
    expect(within(row).getAllByText(fmt(st.available)).length).toBeGreaterThan(0);
  });
});

describe("แถบตัดสินใจใต้เอกสาร", () => {
  it("General Manager เห็น Approve / Revise / Reject บนใบที่เปิดอยู่", () => {
    setCurrentUser(PRAEW);
    render(<PurchaseRequestDocument record={pr("Open")} />);

    const bar = screen.getByTestId("pr-decision-bar");
    for (const label of ["Approve", "Revise", "Reject"]) {
      expect(within(bar).getByRole("button", { name: new RegExp(label) }), label).toBeInTheDocument();
    }
  });

  it("บัญชีที่ไม่เกี่ยวข้อง ไม่เห็นปุ่มตัดสินใจเลย", () => {
    setCurrentUser(KIE);
    render(<PurchaseRequestDocument record={pr("Open")} />);

    const bar = screen.getByTestId("pr-decision-bar");
    /* The guard is on the workflow either way; hiding the button is the
       courtesy that stops somebody queueing to press it. */
    expect(within(bar).queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(within(bar).getByText(/ไม่มีสิ่งที่คุณต้องทำ/)).toBeInTheDocument();
  });

  it("ใบที่อนุมัติแล้ว เหลือแค่ออกใบสั่งซื้อ", () => {
    setCurrentUser(PRAEW);
    render(<PurchaseRequestDocument record={pr("Approved")} />);

    const bar = screen.getByTestId("pr-decision-bar");
    expect(within(bar).getByRole("button", { name: /ออกใบสั่งซื้อ/ })).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^Approve/ })).toBeNull();
  });

  it("Revise ส่งกลับเป็นร่างที่ยังไม่ได้ส่ง", async () => {
    setCurrentUser(PRAEW);
    const rec = pr("Open");
    const { rerender } = render(<PurchaseRequestDocument record={rec} />);

    /* Driven through the workflow rather than the dialog, which the test
       context auto-confirms — the assertion is about the document. */
    const { prRevise } = await import("@/lib/workflows");
    prRevise(rec, ctx());

    expect(rec.status).toBe("Draft");
    expect(rec.submittedAt).toBe("");

    rerender(<PurchaseRequestDocument record={rec} />);
    /* Back in the requester's hands: nobody is waiting on it, and the
       reviewer has nothing left to open. */
    setCurrentUser(PIM);
    rerender(<PurchaseRequestDocument record={rec} />);
    expect(
      within(screen.getByTestId("pr-decision-bar")).getByRole("button", { name: /ส่งขออนุมัติ/ }),
    ).toBeInTheDocument();
  });
});

describe("ประวัติและช่องพูดคุย", () => {
  it("ประวัติอยู่ใต้ปุ่มตัดสินใจ ไม่ใช่ในแท็บ", () => {
    render(<PurchaseRequestDocument record={pr("Open")} />);
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getAllByText("สร้างเอกสาร").length).toBeGreaterThan(0);
  });

  it("พิมพ์คอมเมนต์แล้วขึ้นในเธรด พร้อมแท็กที่เลือก", async () => {
    setCurrentUser(PRAEW);
    render(<PurchaseRequestDocument record={pr("Open")} />);

    const thread = screen.getByTestId("doc-comments");
    expect(within(thread).getByText(/ยังไม่มีความเห็น/)).toBeInTheDocument();

    /* Tagging writes the handle into the box, which is what the reader then
       sends — the mention is part of the message, not a side channel. */
    const tag = within(thread).getAllByRole("button", { name: /^@/ })[0];
    const who = tag.textContent!.replace("@", "");
    await userEvent.click(tag);

    const box = within(thread).getByLabelText("เขียนความเห็น");
    await userEvent.type(box, "ขอดูราคาบรรทัดที่ 2 อีกครั้ง");
    await userEvent.click(within(thread).getByRole("button", { name: "ส่ง" }));

    /* The mention is part of the message the reader sends, so the posted
       line carries both the handle and the words. */
    expect(
      within(thread).getByText((t) => t.includes("ขอดูราคาบรรทัดที่ 2 อีกครั้ง")),
    ).toBeInTheDocument();
    expect(within(thread).getAllByText(new RegExp(who)).length).toBeGreaterThan(1);
    expect(within(thread).queryByText(/ยังไม่มีความเห็น/)).toBeNull();
  });

  it("บอกตรง ๆ ว่ายังเป็น mock", () => {
    /* A thread that looks real and forgets what you wrote on reload is worse
       than no thread. It says so on the page, not only in the code. */
    render(<PurchaseRequestDocument record={pr("Open")} />);
    expect(
      within(screen.getByTestId("doc-comments")).getByText(/Mock — ยังไม่ได้เก็บข้อมูล/),
    ).toBeInTheDocument();
  });
});

describe("ปุ่มลัดบนแถวรายการ", () => {
  it("ใบที่เปิดอยู่ มีถูก / revise / กากบาท ให้กดบนแถวเลย", () => {
    setCurrentUser(PRAEW);
    const acts = prSchemas.list.quickActions!(pr("Open"), ctx());
    expect(acts.map((a) => a.icon)).toEqual(["check", "refresh", "close"]);
  });

  it("ใบที่ไม่มีอะไรค้าง ไม่มีปุ่มลัดเลย", () => {
    setCurrentUser(PRAEW);
    expect(prSchemas.list.quickActions!(pr("Converted"), ctx())).toHaveLength(0);
    expect(prSchemas.list.quickActions!(pr("Rejected"), ctx())).toHaveLength(0);
  });

  it("ทุกปุ่มลัดยังอยู่ในเมนูสามจุดด้วย", () => {
    setCurrentUser(PRAEW);
    const rec = pr("Open");
    const quick = prSchemas.list.quickActions!(rec, ctx()).map((a) => a.label);
    const menu = prSchemas.list
      .rowActions(rec, ctx())
      .map((a) => a.label)
      .filter(Boolean);

    /* The menu is where somebody looks when the button they expected is not
       there — a quick action that exists only on the row is a feature that
       disappears the moment the row is narrow. */
    for (const label of quick) expect(menu, label).toContain(label);
  });
});
