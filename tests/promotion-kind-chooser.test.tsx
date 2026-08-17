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

   Four cards, three of them openable. The one that is not is the
   interesting half of this screen: it has to be visibly present and
   genuinely inert, because the failure this guards against is a card
   that looks ordinary and lands on nothing.

   A kind opens when it has a calculator and a form of its own — free
   goods (รอบที่ 1), price discount and redeem (รอบที่ 2). Package stays
   shut on an accounting question: whether a part-shipped set is
   invoiced in full. That answer changes the data model, so it is not
   a coding decision — see §0 and §4 of Promotion-Types-2-3-Spec.

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

  it("เปิดสามใบ — แถมสินค้า ส่วนลดราคา แลกซื้อ ทุกใบมีตัวคำนวณของตัวเอง", () => {
    /* ปักที่ข้อมูล ไม่ใช่แค่บนหน้าจอ: ใบที่สามที่ถูกเปิดจะทำให้ข้อนี้แดง
       ซึ่งเป็นเครื่องเตือนว่าฟอร์มกับตัวคำนวณของมันต้องมีอยู่ก่อน */
    expect(OPEN.map((k) => k.key)).toEqual(["free-goods", "price-discount", "redeem"]);

    render(<PromotionKindPage />);

    /* ทุกใบที่เปิดต้องเป็นลิงก์ และปลายทางต้องเป็นของตัวเอง ไม่ใช่ของใบอื่น
       — การ์ดที่ชี้ผิดชนิดจะเปิดฟอร์มที่ถามคำถามผิดชุด */
    for (const k of OPEN) {
      expect(within(card(k.key)).getByRole("link"), k.label).toHaveAttribute("href", k.href!);
      expect(k.href).toContain(`kind=${k.key}`);
    }
    expect(screen.getAllByRole("link")).toHaveLength(OPEN.length);
  });

  it("ใบที่เหลือกดไม่ได้จริง และไม่มีปลายทางให้ไปตั้งแต่แรก", () => {
    /* Pinned because CLOSED is derived from the same data this checks. Open
       a kind without this line and the loop below quietly examines nothing
       at all, and still passes. */
    expect(CLOSED.map((k) => k.key)).toEqual(["package"]);
    render(<PromotionKindPage />);

    for (const k of CLOSED) {
      const c = within(card(k.key));
      expect(c.getByRole("button"), k.label).toBeDisabled();
      expect(c.queryByRole("link"), k.label).toBeNull();
    }
  });

  it("คลิกใบที่ปิดแล้วไม่พาไปไหน", async () => {
    expect(CLOSED).toHaveLength(1);
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
