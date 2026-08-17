import type { IconName } from "@/lib/icons";

/* ============================================================
   THE FOUR SHAPES OF PROMOTION

   Four kinds of campaign, and they are genuinely four
   mechanisms rather than four names for one. What separates
   them is what each one changes:

     แถมสินค้า      the number of LINES   — free units, same unit price
     ส่วนลดราคา     the unit PRICE        — a special price for a while
     แพ็กเกจ        what is being SOLD    — one set, one price
     สิทธิแลกซื้อ   what may be BOUGHT    — an entitlement, not a gift

   ส่วนลดราคา is the one that already half exists. A `PriceLine`
   whose `type` is "Promotion" IS that mechanism, and ENGINE_ORDER
   in lib/domain/pricing.ts already ranks it above the customer
   tier. Free goods have no slot there and must not be given one:
   a gift is not a price, and putting it in the price ladder would
   make `winningLine()` answer a question nobody asked it.

   Only แถมสินค้า is open. The other three are listed rather than
   hidden because a chooser that offers one choice is not a
   chooser — somebody setting up a campaign needs to see that the
   system knows the other three exist and has not lost them.

   The wording of `desc` and `example` is provisional until
   docs/Promotion-Quantity-Discount-Spec.md lands.
   ============================================================ */

export type PromotionKindKey =
  | "free-goods"
  | "price-discount"
  | "package"
  | "redeem";

export interface PromotionKind {
  key: PromotionKindKey;
  /** What the person setting the campaign up calls it. */
  label: string;
  /** One line: what this kind does to an order. */
  desc: string;
  /** What one looks like, in the words a salesperson would use. */
  example: string;
  icon: IconName;
  /**
   * Where the card goes — null for a kind that is not open yet.
   *
   * Deliberately the ONLY switch. A separate `enabled` flag can disagree with
   * the destination, and the way that disagreement fails is a card that looks
   * open and lands on nothing.
   */
  href: string | null;
}

export const PROMOTION_KINDS: readonly PromotionKind[] = [
  {
    key: "free-goods",
    label: "แถมสินค้า",
    desc: "ซื้อครบตามจำนวนที่กำหนดแล้วได้สินค้าเพิ่มฟรี ราคาต่อชิ้นไม่เปลี่ยน",
    example: "ซื้อ 10 แถม 4 · ซื้อ 30 แถม 15",
    icon: "box",
    /* The named placeholder until PR2a registers the entity. Then this
       becomes /m/promotion/new?type=free-goods — a seed the create route
       already reads. One line changes here; nothing else has to. */
    href: "/soon?m=โปรโมชั่นแถมสินค้า",
  },
  {
    key: "price-discount",
    label: "ส่วนลดราคา",
    desc: "ตั้งราคาพิเศษให้ต่ำกว่าราคาตามชั้นลูกค้า ตลอดช่วงเวลาที่กำหนด",
    example: "ลด 15% จากราคาเอกชน ตลอดเดือนนี้",
    icon: "pricing",
    href: null,
  },
  {
    key: "package",
    label: "แพ็กเกจ",
    desc: "ขายหลายรายการรวมเป็นชุดเดียว คิดราคาทั้งชุด ไม่คิดรายชิ้น",
    example: "ชุดเปิดคลินิก 5 รายการ ราคาชุด 24,000",
    icon: "layers",
    href: null,
  },
  {
    key: "redeem",
    label: "สิทธิแลกซื้อ",
    desc: "ซื้อครบเงื่อนไขแล้วได้สิทธิซื้อสินค้าอีกตัวในราคาพิเศษ ไม่ใช่ของฟรี",
    example: "ซื้อครบ 20,000 แลกซื้อหัวกรอ 1 ตัว ราคา 500",
    icon: "cart",
    href: null,
  },
];
