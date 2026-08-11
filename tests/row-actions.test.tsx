import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { ConfirmModalHost } from "@/components/ui";
import { REGISTRY } from "@/schemas/registry";
import { routerPush } from "./setup";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";
import { PURCHASE_REQUESTS, decoratePRs, type PrRow } from "@/lib/domain/purchase";
import { PURCHASE_REQUESTS as RAW_PR } from "@/data/purchase-requests";
import { prSchemas } from "@/schemas/purchase-request";
import type { ActionCtx, RecordBase } from "@/lib/types";

/* ============================================================
   THE ACTION COLUMN

   Two rules, and the second is the one that keeps the first
   honest.

   1. WHAT IS ON THE ROW READS AS A BUTTON.

      It was a vertical pile of bare glyphs in a fourteen-unit
      column — a tick, a circular arrow and a cross, stacked, in
      a cell too narrow to sit them side by side. Nobody can tell
      those apart without hovering, and the tick and the cross
      are exactly the pair you do not want guessed at.

   2. EVERYTHING ON THE ROW IS ALSO IN THE MENU.

      The menu is where somebody looks when the button they
      expected is not there. A quick action that exists only on
      the row is a feature that vanishes the moment the row is
      narrow, the status moves, or the role changes.
   ============================================================ */

const SNAP = JSON.stringify(RAW_PR);
const ADMIN = "EMP001"; // Super Admin — sees every act every module offers
const PRAEW = "EMP015"; // General Manager — signs purchase requests

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

/* ============================================================
   1. THE RULE, ACROSS EVERY MODULE THAT HAS ONE
   ============================================================ */

describe("ปุ่มบนแถว ต้องมีในเมนูสามจุดด้วยเสมอ", () => {
  const withQuick = Object.entries(REGISTRY).filter(([, s]) => s.list.quickActions);

  it("มีอย่างน้อยหนึ่งโมดูลที่มีปุ่มบนแถว", () => {
    /* Otherwise the sweep below passes by finding nothing. */
    expect(withQuick.length).toBeGreaterThan(5);
  });

  for (const [key, schemas] of withQuick) {
    it(`${key} — ทุกปุ่มบนแถวอยู่ในเมนูด้วย`, () => {
      setCurrentUser(ADMIN);
      const c = ctx();

      for (const rec of schemas.list.source() as RecordBase[]) {
        const quick = schemas.list.quickActions!(rec, c);
        if (!quick.length) continue;

        const menu = schemas.list
          .rowActions(rec, c)
          .map((a) => a.label)
          .filter(Boolean);

        for (const a of quick) {
          expect(menu, `${key} ${rec.code} — ${a.label}`).toContain(a.label);
        }
      }
    });

    it(`${key} — ไม่มีแถวไหนมีปุ่มเกินสามปุ่ม`, () => {
      setCurrentUser(ADMIN);
      const c = ctx();
      for (const rec of schemas.list.source() as RecordBase[]) {
        /* A row of eight buttons is the same fault as a menu of eight, one
           surface out: only what this row is actually waiting for. */
        expect(
          schemas.list.quickActions!(rec, c).length,
          `${key} ${rec.code}`,
        ).toBeLessThanOrEqual(3);
      }
    });
  }

  it("ทะเบียนข้อมูลหลักไม่มีปุ่มบนแถว", () => {
    /* A product is not waiting on anybody. Quick actions are for documents
       that sit in somebody's queue. */
    for (const key of ["product", "business-partner", "warehouse", "sales-rep"]) {
      expect(REGISTRY[key].list.quickActions, key).toBeUndefined();
    }
  });
});

/* ============================================================
   2. THEY LOOK LIKE BUTTONS
   ============================================================ */

describe("แถบ Action บนแถว", () => {
  it("ขึ้นเป็นปุ่มมีข้อความ ไม่ใช่ไอคอนเปล่า", () => {
    setCurrentUser(PRAEW);
    render(<ListView schema={prSchemas.list} />);

    /* The approver's two answers, each with its own words on it. */
    const approve = screen.getAllByRole("button", { name: "Approve" })[0];
    expect(approve).toHaveTextContent("Approve");
    expect(screen.getAllByRole("button", { name: "Reject" })[0]).toHaveTextContent("Reject");
  });

  it("ปุ่มยาว ๆ ย่อข้อความ แต่ชื่อที่อ่านออกเสียงยังเต็ม", () => {
    setCurrentUser(PRAEW);
    render(<ListView schema={prSchemas.list} />);

    /* `short` is what fits on a row; `label` stays the accessible name and
       the string the menu has to match. */
    const revise = screen.getAllByRole("button", { name: "Revise — ส่งกลับแก้ไข" })[0];
    expect(revise).toHaveTextContent("Revise");
    expect(revise).not.toHaveTextContent("ส่งกลับแก้ไข");
  });

  it("กดปุ่มบนแถวแล้วทำงานจริง ไม่ใช่เปิดหน้ารายละเอียด", async () => {
    const user = userEvent.setup();
    setCurrentUser(PRAEW);
    const rec = PURCHASE_REQUESTS.find((p) => p.status === "Open")!;
    render(
      <>
        <ListView schema={prSchemas.list} />
        <ConfirmModalHost />
      </>,
    );

    const row = screen.getByText(rec.code).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Approve" }));

    /* The click is stopped at the button — a row click would have navigated
       away before the workflow had a chance to ask. */
    await user.click(screen.getByRole("button", { name: "Approve request" }));
    expect(rec.status).toBe("Approved");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("บทบาทที่ไม่เกี่ยวข้อง ไม่เห็นปุ่มบนแถวเลย", () => {
    setCurrentUser("EMP018"); // Warehouse Admin — no business with a request
    render(<ListView schema={prSchemas.list} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    /* The menu is still there — it is how they reach View and Print. */
    expect(screen.getAllByRole("button", { name: "Row actions" }).length).toBeGreaterThan(0);
  });
});
