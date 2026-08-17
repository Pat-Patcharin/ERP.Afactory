import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PromotionKindPage from "@/app/(erp)/promotion/new/page";
import { PROMOTION_KINDS } from "@/lib/domain/promotion";
import { NAV_INDEX } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { routerPush } from "./setup";

/* ============================================================
   CHOOSING A KIND OF PROMOTION

   Four cards, one of them openable. The three that are not are
   the interesting half of this screen: they have to be visibly
   present and genuinely inert, because the failure this guards
   against is a card that looks ordinary and lands on nothing.

   "Inert" is asserted three ways — the control is disabled, the
   card holds no anchor at all, and clicking every one of them
   moves nothing. Any one alone could pass while the screen was
   still broken.
   ============================================================ */

const card = (key: string) => screen.getByTestId(`promotion-kind-${key}`);

const OPEN = PROMOTION_KINDS.filter((k) => k.href !== null);
const CLOSED = PROMOTION_KINDS.filter((k) => k.href === null);

describe("หน้าเลือกประเภทโปรโมชั่น", () => {
  it("แสดงครบสี่ประเภท พร้อมชื่อ คำอธิบาย และตัวอย่าง", () => {
    render(<PromotionKindPage />);

    const grid = within(screen.getByTestId("promotion-kinds"));
    expect(grid.getAllByTestId(/^promotion-kind-/)).toHaveLength(4);

    for (const k of PROMOTION_KINDS) {
      const c = within(card(k.key));
      expect(c.getByText(k.label)).toBeInTheDocument();
      expect(c.getByText(k.desc)).toBeInTheDocument();
      expect(c.getByText(k.example)).toBeInTheDocument();
    }
  });

  it("เปิดใช้ใบเดียวคือแถมสินค้า และเป็นใบเดียวที่เป็นลิงก์", () => {
    /* Pinned in the data, not only on screen: the moment a second kind is
       given an href this fails, which is the reminder that its form has to
       exist first. */
    expect(OPEN.map((k) => k.key)).toEqual(["free-goods"]);

    render(<PromotionKindPage />);

    expect(within(card("free-goods")).getByRole("link")).toHaveAttribute(
      "href",
      OPEN[0].href!,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("อีกสามใบกดไม่ได้จริง และไม่มีปลายทางให้ไปตั้งแต่แรก", () => {
    /* Pinned because CLOSED is derived from the same data this checks. Open
       a kind without this line and the loop below quietly examines two cards
       instead of three, and still passes. */
    expect(CLOSED).toHaveLength(3);
    render(<PromotionKindPage />);

    for (const k of CLOSED) {
      const c = within(card(k.key));
      expect(c.getByRole("button"), k.label).toBeDisabled();
      expect(c.queryByRole("link"), k.label).toBeNull();
    }
  });

  it("คลิกทั้งสามใบที่ปิดแล้วไม่พาไปไหน", async () => {
    expect(CLOSED).toHaveLength(3);
    const user = userEvent.setup();
    render(<PromotionKindPage />);

    for (const k of CLOSED) {
      await user.click(within(card(k.key)).getByRole("button"));
    }

    expect(routerPush).not.toHaveBeenCalled();
  });

  it("ใบที่ยังไม่เปิดมีป้ายบอก ใบที่เปิดไม่มี", () => {
    render(<PromotionKindPage />);

    for (const k of CLOSED) {
      expect(within(card(k.key)).getByText("ยังไม่เปิดใช้"), k.label).toBeInTheDocument();
    }
    expect(within(card("free-goods")).queryByText("ยังไม่เปิดใช้")).toBeNull();
  });
});

describe("เมนู Promotion", () => {
  /* ปลายทางที่แน่นอนของเมนูย้ายไปอยู่ในเทสต์ของ entity แล้ว — ตอนที่หน้านี้
     เกิดขึ้น เมนูชี้มาที่หน้าเลือกประเภทเพราะยังไม่มีหน้ารายการให้ชี้ พอมี
     หน้ารายการ เมนูก็ชี้ไปที่นั่นเหมือนโมดูลอื่นทั้งแอป และหน้าเลือกประเภท
     กลายเป็นปุ่มสร้างของหน้ารายการ

     สิ่งที่ไฟล์นี้ยังต้องคุมคือข้อที่ไม่ขึ้นกับว่า entity มาแล้วหรือยัง:
     Promotion ไม่ใช่ placeholder อีกต่อไป */
  it("ไม่ใช่ placeholder อีกแล้ว", () => {
    const item = NAV_INDEX.find((i) => i.label === "Promotion");
    expect(item).toBeDefined();
    expect(item!.soon).toBeUndefined();
    expect(item!.href.startsWith("/soon")).toBe(false);
    /* ตัวแปลงปลายทางของ workspace ต้องเห็นตรงกัน ไม่งั้นลิงก์จากแดชบอร์ด
       จะยังตกไปที่ placeholder */
    expect(pageHref("Promotion")).toBe(item!.href);
  });
});
