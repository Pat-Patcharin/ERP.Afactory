import { COMPANY } from "@/data/admin";
import { PROMOTIONS as RAW } from "@/data/promotions";
import { stamp } from "@/lib/format";
import type { IconName } from "@/lib/icons";
import type { RecordBase } from "@/lib/types";
import { can, currentUser } from "./admin";
import { maySignAt } from "./doc-draft";
import { priceMasterByProduct } from "./price-master";
import { catalogPrice } from "./pricing";
import { PRODUCTS } from "./product";
import { bestLadder, type LadderResult, type LadderTier } from "./promotion-ladder";
import {
  type RedeemBasis,
  redeemQuota,
  redeemRounds,
} from "./promotion-redeem";
import {
  discountFloorBreaches,
  discountIneffectiveTiers,
  type DiscountBreach,
  type DiscountMode,
  type DiscountTier,
} from "./promotion-discount";

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

   Three of the four are open. แพ็กเกจ is the one that is not, and it
   is listed rather than hidden: a chooser that quietly drops a kind
   reads as "the system cannot do this" when the truth is "nobody has
   answered the accounting question yet" — see §0 of
   docs/Promotion-Types-2-3-Spec.md.

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
    /* `?kind=` is read as a seed by the create route, which already turns
       every query parameter into a pre-filled field. Nothing bespoke. */
    href: "/m/promotion/new?kind=free-goods",
  },
  {
    key: "price-discount",
    label: "ส่วนลดราคา",
    desc: "ตั้งราคาพิเศษให้ต่ำกว่าราคาตามชั้นลูกค้า ตลอดช่วงเวลาที่กำหนด",
    example: "ลด 15% จากราคาเอกชน ตลอดเดือนนี้",
    icon: "pricing",
    href: "/m/promotion/new?kind=price-discount",
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
    example: "ซื้อครบ 50,000 แลกซื้อได้ 3 ชิ้น ลด 55%",
    icon: "cart",
    href: "/m/promotion/new?kind=redeem",
  },
];

/* ============================================================
   ตัวโปรโมชั่นเอง — ระเบียน สถานะ และด่านตรวจ

   ห้าสถานะตาม §6g และห้ากลุ่มค่าตั้งตาม §6b ทุกช่องที่สเปคให้
   ค่าเริ่มต้นไว้ ค่านั้นอยู่ที่ `blankPromotion()` ไม่ใช่กระจาย
   อยู่ในฟอร์ม — ฟอร์มใน PR2b จะอ่านจากที่นี่ ไม่ตั้งเอง
   ============================================================ */

export const PROMOTION_STATUSES = [
  "Draft",
  "Pending Approval",
  "Active",
  "Paused",
  "Ended",
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const PROMOTION_STATUS_TH: Record<PromotionStatus, string> = {
  Draft: "ร่าง",
  "Pending Approval": "รออนุมัติ",
  Active: "ใช้งานอยู่",
  Paused: "หยุดชั่วคราว",
  Ended: "สิ้นสุด",
};

/**
 * §2 — สามแบบต่างกันที่ขอบเขตการนับและวิธีเลือกของแถม
 *
 * `""` คือยังไม่ได้เลือก และเป็นค่าเริ่มต้นโดยตั้งใจ แบบเดียวกับ `BudgetBasis`
 * — สามแบบนี้ให้ของแถมคนละอย่าง เดาให้แบบหนึ่งคือเดาว่าลูกค้าจะได้อะไร
 */
export type PromotionScope = "" | "item" | "set" | "same-price" | "group";

export const PROMOTION_SCOPE_TH: Record<PromotionScope, string> = {
  "": "— ยังไม่ได้เลือก —",
  item: "รายตัว — แถมสินค้าตัวเดียวกัน",
  "same-price": "ราคาเดียวกัน — เลือกได้ทั้งกลุ่มที่ซื้อและกลุ่มที่แถม",
  set: "ชุดที่กำหนด — แถมจากชุดที่ระบุ",
  group: "กลุ่ม — แถมตัวที่ถูกที่สุด",
};

/**
 * แบบที่เลือกได้จริงวันนี้ — เปิดครบสี่แบบแล้ว
 *
 * แบบกลุ่มเคยปิดอยู่ เพราะ §2 ยังไม่ตัดสินว่า "ถูกที่สุด" วัดจากราคาไหน
 * เจ้าของโปรเจกต์ตัดสินแล้วว่า **วัดจากราคามาตรฐาน** ตัวเดียวกับที่ทั้งโมดูล
 * ใช้คิดส่วนลดเปอร์เซ็นต์ (ดูเหตุผลที่ `cheapestByStandardPrice`) แบบกลุ่ม
 * จึงเปิดได้ และด่านที่เคยปฏิเสธมันที่ทางเขียนถูกถอดออกพร้อมกัน
 *
 * เรียงจากแบบที่ตอบคำถาม "ลูกค้าได้อะไร" ได้แน่นอนที่สุด ไปหาแบบที่หลวมที่สุด
 *   รายตัว        ได้ตัวเดิมที่ซื้อ
 *   ราคาเดียวกัน  ตัวไหนก็ได้ในกลุ่ม ซึ่งราคาเท่ากันหมดอยู่แล้ว
 *   ชุดที่กำหนด   ชุดที่คนตั้งโปรเลือกเอง ราคาต่างกันได้ตามใจ
 *   กลุ่ม         ไม่มีใครระบุของแถมล่วงหน้า ระบบเลือกตัวถูกที่สุดให้ตอนขาย
 */
export const OPEN_PROMOTION_SCOPES: readonly PromotionScope[] = [
  "item",
  "same-price",
  "set",
  "group",
];

/** §6c — ตัวเลือกตายตัว ไม่ใช่ช่องพิมพ์อิสระ เพราะต้องเอาไปจัดกลุ่มเทียบผล */
export const PROMOTION_REASONS = [
  "ล้างสต๊อกใกล้หมดอายุ",
  "แข่งกับคู่แข่ง",
  "เปิดตัวสินค้าใหม่",
  "ดันยอดสิ้นไตรมาส",
  "รักษาลูกค้ารายใหญ่",
  "อื่น ๆ (ระบุ)",
] as const;

/**
 * §6b กลุ่ม 4 — ฐานคิดค่าคอมมิชชัน
 *
 * คำที่ใช้คือคำที่ตกลงกัน ไม่ใช่คำที่โค้ดคิดขึ้น สเปคบังคับให้เลือก และบอกว่า
 * ต้องเป็นกล่องเตือนไม่ใช่ dropdown ธรรมดา
 *
 * ตัวที่สาม "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้" เคยถูกตัดออก ด้วยเหตุผลว่าเป็น
 * การเดานโยบายค่าตอบแทนที่ยังไม่มีใครตัดสิน — ตอนนี้ตัดสินแล้ว จึงกลับมา และ
 * เหตุผลเดิมก็ยังยืนอยู่ทั้งข้อ: ตัวเลือกนี้อยู่ได้เพราะมีคนบอกมา ไม่ใช่เพราะ
 * ระบบคิดเองว่าน่าจะมี
 *
 * และมันไม่ใช่ "ฐาน" ที่สาม มันคือคำตอบว่าไม่มีฐาน — โปรที่ไม่จ่ายค่าคอมเคย
 * ต้องจดไว้นอกระบบ แล้วรอบจ่ายเงินก็เถียงกันจากกระดาษคนละใบ
 */
export const COMMISSION_BASES = [
  "ยอดที่ลูกค้าจ่ายจริง",
  "มูลค่าบรรทัดหลังเฉลี่ยของแถม",
  "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้",
] as const;

/** จ่ายค่าคอมจากใบที่ใช้โปรนี้ไหม — ยังไม่ได้เลือก ยังไม่ใช่คำตอบว่าไม่จ่าย */
export const paysCommission = (p: Pick<PromotionRow, "commissionBase">): boolean =>
  Boolean(p.commissionBase) && p.commissionBase !== NO_COMMISSION;

/** คำตอบว่าไม่มีฐาน — อ้างค่าคงที่ ไม่ใช่พิมพ์สตริงเดิมซ้ำในที่ที่ต้องเทียบ */
export const NO_COMMISSION = "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้";

/**
 * เงื่อนไขการชำระเงินของใบที่ใช้โปรนี้
 *
 * ว่าง = ไม่กำหนดเพิ่ม ใช้เงื่อนไขปกติของลูกค้ารายนั้น ซึ่งเป็นคำตอบของเกือบ
 * ทุกโปร — สองตัวนี้มีไว้สำหรับโปรที่ลดลึกจนไม่ควรปล่อยเครดิต
 */
export const PAYMENT_TERMS = ["จ่ายสดเท่านั้น", "มัดจำก่อนส่งของ"] as const;

/** ตัวที่ต้องบอกต่อว่ากี่ % — อ้างค่าคงที่ ไม่ใช่พิมพ์สตริงซ้ำในที่ที่ต้องเทียบ */
export const DEPOSIT_TERM = "มัดจำก่อนส่งของ";

/** §6e — งบคิดจากอะไร ไม่มีค่าเริ่มต้น ต้องเลือกเอง */
export type BudgetBasis = "" | "cost" | "price";

export const BUDGET_BASIS_TH: Record<BudgetBasis, string> = {
  "": "— ยังไม่ได้เลือก —",
  cost: "คิดจากต้นทุน",
  price: "คิดจากราคาขาย",
};

export interface PromotionRow extends RecordBase {
  /* ---------- กลุ่ม 1 · ข้อมูลระบุตัวโปร ---------- */
  code: string;
  name: string;
  /** §6b — ชื่อภายในกับชื่อที่ลูกค้าเห็นมักไม่เหมือนกัน ว่างแปลว่าใช้ชื่อภายใน */
  printName: string;
  kind: PromotionKindKey;
  status: PromotionStatus;
  from: string;
  /** ว่าง = ไม่มีกำหนดสิ้นสุด */
  to: string;
  /**
   * §6b เขียนไว้ว่าใช้ตัดสินเมื่อโปรหลายตัวเข้าเงื่อนไขพร้อมกัน — แต่กติกา
   * การซ้อนโปรยังไม่ตัดสิน จึงยังไม่มีตัวคำนวณไหนอ่านค่านี้ ฟอร์มไม่ถามแล้ว
   * และไม่มีหน้าไหนแสดง ทุกใบใหม่จึงได้ค่าจาก `blankPromotion()` ตัวเดียว
   * ถ้าวันหนึ่งกลไกซ้อนโปรมาถึง ที่กรอกต้องกลับมาพร้อมกัน
   */
  priority: number;
  reason: string;
  reasonNote: string;
  /** ฟอร์มไม่ถามแล้ว และไม่มีหน้าไหนแสดง — เหมือน `priority` */
  owner: string;

  /* ---------- กลุ่ม 2 · ใช้กับอะไร ---------- */
  scope: PromotionScope;
  /** ฝั่งเงื่อนไข — สินค้าที่นับเข้าโปร */
  items: string[];
  /**
   * ฝั่งของแถม — คนละฝั่งกับ `items` โดยตั้งใจ
   *
   * แบบรายตัวไม่ใช้ช่องนี้ ของแถมคือสินค้าตัวเดียวกันกับที่นับ เขียนซ้ำลงมา
   * จะได้ข้อมูลสองที่ที่ต้องคอยให้ตรงกัน แบบชุดใช้ช่องนี้ระบุว่าแถมอะไรได้
   */
  freeItems: string[];
  /* `freeGroup` ถูกลบทิ้ง — เคยเตรียมไว้ให้แบบกลุ่มชี้ไปที่ "กลุ่มสินค้า"
     สักอย่าง แต่ไม่เคยมีใครเขียนหรืออ่านมันเลยตลอดสามรอบ และตอนตัดสินแบบกลุ่ม
     ก็ไม่ได้ใช้

     **แบบกลุ่มใช้ `items` ที่คนตั้งโปรเลือกเอง ไม่ใช่หมวดสินค้า (`cat`)**
     วัดจากข้อมูลจริง: `cat` มี 11 ค่าและกว้างเกินไปจนราคาปนกันหนัก —
     Supply มี 35 ราคา · Instrument 34 · Scaler Tip 6 ⇒ ถ้าแบบกลุ่มแปลว่า
     "ถูกที่สุดในหมวด" ลูกค้าที่ซื้อเก้าอี้ทำฟันจะได้สำลีก้อนเป็นของแถม
     ใครจะเอา `cat` กลับมาเป็นกลุ่มโปร ต้องแก้ข้อเท็จจริงชุดนี้ก่อน */
  /** ว่าง = ทุกตารางราคา */
  priceLists: string[];
  /** null = ไม่กำหนดยอดขั้นต่ำ */
  minOrder: number | null;
  minOrderBasis: string;
  nearExpiryOnly: boolean;
  nearExpiryDays: number | null;

  /* ---------- กลุ่ม 3 · ใช้กับใคร ---------- */
  customerGroups: string[];
  customers: string[];
  areas: string[];
  channels: string[];
  /**
   * ฟอร์มไม่ถามแล้ว — ทุกใบใหม่จึงได้ `false` จาก `blankPromotion()` ซึ่งเป็น
   * ด้านที่แคบกว่า: ลูกค้าที่ผู้แทนขายเพิ่งเปิดไว้ยังใช้โปรไม่ได้จนกว่าจะยืนยัน
   * ตัวตน ถ้าวันหนึ่งต้องเปิดให้บางโปร ที่กรอกต้องกลับมาพร้อมกับคนที่ตัดสินว่า
   * โปรแบบไหนควรเปิด — ไม่ใช่ปล่อยให้ค่าเริ่มต้นตัดสินแทนเงียบ ๆ
   */
  allowDraftPartner: boolean;

  /* ---------- กลุ่ม 4 · ข้อจำกัดและผลกระทบ ----------

     เพดานทุกตัวใช้ `null` แปลว่าไม่จำกัด ไม่ใช่ 0 — 0 คือ "ใช้ไม่ได้เลย"
     ซึ่งเป็นคนละเรื่องกับ "ไม่ได้กำหนดเพดานไว้" */
  usePerCustomer: number | null;
  /** เพดานต่อเขตขายหนึ่งเขต — เพดานเดียวกันทุกเขต ไม่ใช่รายเขต */
  usePerArea: number | null;
  useTotal: number | null;
  /**
   * เพดานจำนวนของแถมรวมทั้งโปร (ชิ้น)
   *
   * คนละเรื่องกับจำนวนครั้ง — โปรที่ใช้ได้ 100 ครั้งแต่แต่ละครั้งแถม 15 ชิ้น
   * คือของ 1,500 ชิ้น เพดานที่คนตั้งโปรคิดไว้มักเป็นจำนวนของ ไม่ใช่จำนวนครั้ง
   */
  freeQtyCap: number | null;
  stackWithPromo: boolean;
  /**
   * ซ้อนได้กับโปรตัวไหนบ้าง — ว่าง = ทุกตัว (เมื่อ `stackWithPromo` เปิด)
   *
   * มีความหมายเฉพาะตอน `stackWithPromo` เปิด ปิดอยู่แล้วรายการนี้ไม่ถูกอ่าน
   * — เก็บไว้ไม่ล้าง เพราะคนที่ปิดชั่วคราวแล้วเปิดกลับ ไม่ควรต้องเลือกใหม่หมด
   */
  stackWithPromos: string[];
  stackWithCustomerDiscount: boolean;
  commissionBase: string;
  /** ว่าง = ไม่กำหนดเพิ่ม ใช้เงื่อนไขปกติของลูกค้า ดู `PAYMENT_TERMS` */
  paymentTerm: string;
  /** กี่ % — มีความหมายเฉพาะเมื่อ `paymentTerm` เป็น `DEPOSIT_TERM` */
  depositPct: number | null;

  /* ---------- กลุ่ม 5 · งบประมาณและคลัง ----------

     ฟอร์มไม่ถามทั้งกลุ่มนี้แล้ว โปรใหม่จึงได้ `budget: null` (ไม่จำกัดงบ) และ
     `freeGoodsWarehouse: ""` จาก `blankPromotion()` ระเบียนเก่าที่มีค่าอยู่ยัง
     แสดงและยังคิดตามเดิม — `promotionApprovalLevel` ยังส่งใบที่งบเกินเพดานไป
     ให้ผู้จัดการเหมือนเดิม เพียงแต่ใบใหม่จะไม่มีงบให้เกิน

     ของแถมที่ไม่ได้ระบุคลัง แปลว่ายังไม่มีใครบอกว่าของหายไปจากคลังไหน —
     ตราบใดที่ยังไม่มีการตัดสต๊อกจริงตอนออกบิล ค่านี้ยังไม่มีใครอ่าน */
  budget: number | null;
  budgetBasis: BudgetBasis;
  budgetUsed: number;
  budgetOver: "stop" | "warn";
  budgetWarnAt: number;
  freeGoodsWarehouse: string;

  /* ---------- ขั้นบันได ----------

     สามชนิดมีขั้นคนละความหมาย จึงอยู่คนละฟิลด์ ไม่ใช่ฟิลด์เดียวหลายรูป
     ถ้ายัดรวมกัน `bestLadder` จะรับขั้นส่วนลดไปคิดเป็นของแถมโดยไม่มีอะไร
     เตือน และผลที่ออกมาก็ยังดูสมเหตุสมผล — ดูคอมเมนต์หัวไฟล์
     promotion-discount.ts */

  /** โปรแถมสินค้า — `{buy, free}` ขั้นผสมกันได้ */
  tiers: LadderTier[];

  /** โปรส่วนลดราคา — `{minQty, price|discPct}` ขั้นไม่ผสมกัน */
  discountTiers: DiscountTier[];

  /* ---------- สิทธิแลกซื้อ ----------

     ฟิลด์แบน ไม่ใช่ object ก้อนเดียว เพราะ `PROMOTION_CONDITION_FIELDS` เป็น
     `keyof PromotionRow` — object ก้อนเดียวจะทำให้ธง `dirtySinceApproval`
     ติดทั้งก้อนหรือไม่ติดเลย ซึ่งทำลายความละเอียดที่ทำไว้ตั้งแต่ PR2a */

  /** เงื่อนไขนับจากเงินหรือจำนวนชิ้น — ไม่มีค่าเริ่มต้น ต้องเลือกเอง */
  redeemBasis: RedeemBasis;
  /** ครบเท่านี้ได้สิทธิหนึ่งรอบ ทวีคูณเต็มจำนวน เศษทิ้ง */
  redeemThreshold: number | null;
  /** สินค้าที่แลกซื้อได้ — ฝั่งสิทธิ คนละฝั่งกับ `items` ที่เป็นฝั่งเงื่อนไข */
  redeemItems: string[];
  /** ส่วนลดจากราคามาตรฐาน — แลกซื้อไม่ใช่ของฟรี ลูกค้ายังจ่าย */
  redeemDiscPct: number | null;
  /** เพดานชิ้นต่อรอบ — เพดาน ไม่ใช่ขั้นต่ำ */
  redeemPerRound: number | null;
  /**
   * ราคาตายตัว หรือ ลดเป็นเปอร์เซ็นต์ — เลือกที่ระดับโปร ไม่ใช่ระดับขั้น
   *
   * ถ้าปล่อยให้แต่ละขั้นเป็นคนละแบบ ตารางขั้นจะมีสองคอลัมน์ที่สลับกันว่าง
   * และคนอ่านต้องไล่ทีละแถวว่าแถวนี้หมายถึงอะไร
   */
  discountMode: DiscountMode;

  /* ---------- ร่องรอย ---------- */
  created: string;
  createdBy: string;
  approvedBy: string;
  approvedAt: string;
  pausedReason: string;
  pausedBy: string;
  pausedAt: string;
  /**
   * §6g — เงื่อนไขถูกแก้หลังอนุมัติแล้ว
   *
   * ตัวนี้คือสิ่งที่ปิดช่องโหว่ "หยุดชั่วคราว แก้เงื่อนไข แล้วเปิดใหม่โดยไม่ผ่านใคร"
   * — เปิดกลับได้เลยถ้าไม่แตะเงื่อนไข ถ้าแตะแล้วต้องขออนุมัติใหม่
   */
  dirtySinceApproval: boolean;
}

/**
 * §6b — ค่าเริ่มต้นต้องกว้างและปลอดภัยที่สุด
 *
 * "กว้าง" คือทุกกลุ่มลูกค้า ทุกเขต ทุกช่องทาง ไม่จำกัดจำนวนครั้ง — คนตั้งโปร
 * กรอกเฉพาะที่ต้องการจำกัดจริง "ปลอดภัย" คือสามช่องที่ปล่อยว่างไว้โดยตั้งใจ
 * เพราะเดาแทนไม่ได้: เหตุผลที่สร้างโปร · ฐานคิดค่าคอม · คลังที่หักของแถม
 * และ `budgetBasis` ที่ §6e สั่งห้ามมีค่าเริ่มต้น
 */
export const blankPromotion = (): PromotionRow => ({
  code: "",
  name: "",
  printName: "",
  kind: "free-goods",
  status: "Draft",
  from: "",
  to: "",
  priority: 5,
  reason: "",
  reasonNote: "",
  owner: "",

  /* ห้ามมีค่าเริ่มต้น — สามแบบให้ของแถมคนละอย่าง เดาให้แบบหนึ่งคือเดาว่า
     ลูกค้าจะได้อะไร */
  scope: "",
  items: [],
  freeItems: [],
  priceLists: [],
  minOrder: null,
  minOrderBasis: "ยอดก่อนภาษี",
  nearExpiryOnly: false,
  nearExpiryDays: null,

  customerGroups: [],
  customers: [],
  areas: [],
  channels: [],
  allowDraftPartner: false,

  usePerCustomer: null,
  usePerArea: null,
  useTotal: null,
  freeQtyCap: null,
  stackWithPromo: false,
  stackWithPromos: [],
  stackWithCustomerDiscount: false,
  commissionBase: "",
  /* ว่างไว้ = ใช้เงื่อนไขปกติของลูกค้า — โปรไม่ควรเปลี่ยนเทอมการจ่ายเงินของ
     ใครโดยที่ไม่มีใครสั่ง */
  paymentTerm: "",
  depositPct: null,

  budget: null,
  budgetBasis: "",
  budgetUsed: 0,
  budgetOver: "warn",
  budgetWarnAt: 80,
  freeGoodsWarehouse: "",

  tiers: [],
  discountTiers: [],
  /* ห้ามมีค่าเริ่มต้น — โปรที่ยังไม่บอกว่านับเงินหรือนับชิ้น ให้สิทธิใครไม่ได้ */
  redeemBasis: "",
  redeemThreshold: null,
  redeemItems: [],
  redeemDiscPct: null,
  /* ห้ามเดาเป็น 1 — คนตั้งโปรที่ลืมกรอกจะให้สิทธิ 1 ชิ้นแทน 3 โดยไม่มีใครรู้
     ว่าตั้งใจหรือลืม ฟอร์มบังคับกรอก */
  redeemPerRound: null,
  /* ราคาตายตัวเป็นค่าเริ่มต้นเพราะเป็นแบบที่อธิบายตัวเองได้ทันที — "ชิ้นละ 850"
     ไม่ต้องรู้ราคามาตรฐานก่อนจึงจะรู้ว่าลูกค้าจ่ายเท่าไหร่ */
  discountMode: "price",

  created: "",
  createdBy: "",
  approvedBy: "",
  approvedAt: "",
  pausedReason: "",
  pausedBy: "",
  pausedAt: "",
  dirtySinceApproval: false,
});

/* ============================================================
   ราคาเฉลี่ยต่อชิ้น — สูตรเดียวของทั้งระบบ

   §8 ห้ามมีสองสูตรคำนวณราคาเฉลี่ย โดยอ้างบทเรียนจาก `projected`
   และ `headerDisc` ที่เคยมีสำเนาคนละที่แล้วตอบไม่ตรงกัน

   ทุกที่ที่ต้องการราคาเฉลี่ยต้องเรียกตัวนี้ — ตารางขั้นบันได
   ตัวลองคำนวณ บรรทัดบนเอกสาร และแบบพิมพ์ ไม่มีข้อยกเว้น
   ============================================================ */

/** §4.1 — ยอดที่จ่ายจริง ÷ จำนวนรวมที่ได้รับ */
export const averageUnitPrice = (
  unitPrice: number,
  paidQty: number,
  freeQty: number,
): number => {
  const received = paidQty + freeQty;
  return received > 0 ? (unitPrice * paidQty) / received : 0;
};

/** ราคาเฉลี่ยของขั้นหนึ่ง เมื่อใช้ขั้นนั้นหนึ่งรอบพอดี */
export const tierAveragePrice = (unitPrice: number, tier: LadderTier): number =>
  averageUnitPrice(unitPrice, tier.buy, tier.free);

/* ============================================================
   ตัวลองคำนวณ — §3.4

   ตรงนี้ไม่คำนวณของแถมเอง มันเรียก `bestLadder` ตัวเดียวกับที่หน้า
   รายละเอียดใช้ และเอาคำตอบมาเรียบเรียงให้อ่านออก สองสูตรที่ต่างกัน
   หนึ่งบรรทัดจะทำให้ตัวลองบอกเลขหนึ่ง แล้วเอกสารจริงออกอีกเลข

   ราคาเฉลี่ยก็ไม่คำนวณเอง — `averageUnitPrice` เป็นสูตรเดียวของทั้งระบบ
   ตาม §8 ที่ห้ามมีสำเนาที่สอง

   **เพดานจำนวนอยู่ที่นี่ ไม่ได้อยู่ใน `bestLadder`** เพราะเพดานคำสั่งซื้อ
   เป็นกติกาธุรกิจ ไม่ใช่รายละเอียดของตัวคำนวณ — ตัวคำนวณใช้หน่วยความจำ
   O(จำนวน) จึงต้องมีคนคุมว่าจำนวนที่ส่งเข้าไปสมเหตุสมผล และคนนั้นคือ
   จุดที่รับค่าจากหน้าจอ ไม่ใช่ตัวคำนวณเอง
   ============================================================ */

/**
 * เพดานจำนวนที่ตัวลองคำนวณรับ
 *
 * หนึ่งแสนชิ้นสูงกว่าคำสั่งซื้อจริงทุกใบในระบบนี้หลายเท่า แต่ยังเป็นตัวเลข
 * ที่ DP เดินจบในเวลาที่คนไม่รู้สึก ใครพิมพ์ 999999999 ใส่ช่องทดลองไม่ได้
 * ตั้งใจสั่งของ — เขาแค่กดเลขเล่น และหน้าจอต้องไม่ค้าง
 */
export const TRY_QTY_MAX = 100_000;

/**
 * จำนวนที่รับจากหน้าจอ — จุดเดียวที่เพดานถูกบังคับ
 *
 * ค่าที่ไม่ใช่จำนวนบวกกลายเป็น 0 ซึ่ง `bestLadder` ตอบว่าไม่ได้อะไร
 * ไม่ใช่ค่าที่ทำให้มันวน
 */
export function clampTryQty(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), TRY_QTY_MAX);
}

/** ข้อเสนอให้เพิ่มจำนวน — null เมื่อการเสนอไม่ช่วยอะไร */
export interface LadderSuggestion {
  /** เพิ่มอีกกี่ชิ้นถึงจะถึงขั้นถัดไป */
  addQty: number;
  /** ขั้นที่จะได้ */
  tier: LadderTier;
  /** ของแถมที่เพิ่มขึ้นจริงเมื่อไปถึงขั้นนั้น */
  extraFree: number;
}

/**
 * §3.4 — เสนอให้เพิ่มจำนวนเฉพาะเมื่อระยะที่เหลือ **น้อยกว่าครึ่งหนึ่ง**
 * ของขั้นนั้น
 *
 * สั่ง 3 แล้วบอกให้เพิ่มอีก 27 เพื่อถึงขั้น 30 ไม่ได้ช่วยใครตัดสินใจ มันแค่
 * ทำให้ข้อเสนอกลายเป็นเสียงรบกวนที่เซลล์เรียนรู้ที่จะไม่อ่าน
 *
 * ของแถมที่เพิ่มขึ้นอ่านจาก `bestLadder` **ทั้งสองจุด** แล้วลบกัน ไม่ได้เอา
 * `tier.free` มาบอกตรง ๆ และห้าม "ทำให้ง่ายขึ้น" เป็นแบบนั้น:
 *
 *   ขั้น 3 แถม 1 · 10 แถม 4 · 30 แถม 15 — จ่าย 20 อยู่แล้วได้แถม 8
 *   (ขั้น 10 สองรอบ) ไปถึงขั้น 30 ได้ 15 ⇒ **เพิ่มขึ้นจริง 7 ไม่ใช่ 15**
 *
 * `tier.free` คือของแถมของขั้นนั้นทั้งขั้น ไม่ใช่ส่วนที่ลูกค้าได้เพิ่ม และ
 * ข้อเสนอที่บอกเลขใหญ่กว่าความจริงเกือบเท่าตัว คือข้อเสนอที่เซลล์เอาไปคุยกับ
 * ลูกค้าแล้วเสียเครดิตตอนออกใบจริง
 *
 * ถ้าวันหนึ่งขั้นที่มีอยู่จับคู่ได้ดีจนขั้นถัดไปไม่ได้เพิ่มอะไร ส่วนต่างจะเป็น
 * ศูนย์และไม่มีข้อเสนอ ซึ่งถูก — `tier.free` ตรง ๆ จะยังเสนออยู่
 */
export function ladderSuggestion(
  tiers: readonly LadderTier[],
  qty: number,
): LadderSuggestion | null {
  const paid = clampTryQty(qty);
  if (paid <= 0) return null;

  /* ขั้นที่เล็กที่สุดซึ่งยังไม่ถึง — ขั้นที่ไกลกว่านั้นยิ่งเสนอไม่ได้ */
  const next = tiers
    .filter((t) => Number.isInteger(t.buy) && t.buy > paid)
    .sort((a, b) => a.buy - b.buy)[0];
  if (!next) return null;

  const addQty = next.buy - paid;
  /* ครึ่งหนึ่งของขั้นนั้น ไม่ใช่ครึ่งหนึ่งของระยะทั้งหมด */
  if (addQty >= next.buy / 2) return null;

  const extraFree = bestLadder(tiers, next.buy).free - bestLadder(tiers, paid).free;
  if (extraFree <= 0) return null;

  return { addQty, tier: next, extraFree };
}

export interface LadderTry {
  /** จำนวนที่ลองจริงหลังคุมเพดานแล้ว */
  qty: number;
  free: number;
  /** รวมที่ลูกค้าได้รับ = จ่ายจริง + แถม */
  total: number;
  /** ราคาเฉลี่ยต่อชิ้น · null เมื่อยังไม่รู้ราคาสินค้า */
  average: number | null;
  uses: LadderResult["uses"];
  unmatched: number;
  suggestion: LadderSuggestion | null;
}

/**
 * ลองจำนวนหนึ่งกับขั้นชุดหนึ่ง
 *
 * `unitPrice` เป็น 0 ได้ หมายถึงยังไม่รู้ราคา ซึ่งต่างจากราคาศูนย์บาท —
 * `average` จึงเป็น null ไม่ใช่ 0 เพราะ 0 อ่านว่าแถมแล้วฟรีทั้งบรรทัด
 */
export function tryLadder(
  tiers: readonly LadderTier[],
  qty: number,
  unitPrice: number,
): LadderTry {
  const paid = clampTryQty(qty);
  const r = bestLadder(tiers, paid);

  return {
    qty: paid,
    free: r.free,
    total: paid + r.free,
    average: unitPrice > 0 ? averageUnitPrice(unitPrice, paid, r.free) : null,
    uses: r.uses,
    unmatched: r.unmatched,
    suggestion: ladderSuggestion(tiers, paid),
  };
}

/** ชุดขั้นที่ใช้ ย่อเป็นบรรทัดเดียว — "10 แถม 4 × 1 + 3 แถม 1 × 1" */
export const ladderUsesText = (uses: LadderResult["uses"]): string =>
  uses.length
    ? uses.map((u) => `${u.tier.buy} แถม ${u.tier.free} × ${u.times}`).join(" + ")
    : "";

/** ราคาขั้นต่ำของสินค้าตัวหนึ่ง — null เมื่อไม่มีแถวในราคากลาง */
export function productFloor(code: string): number | null {
  /* รหัสเดียวชี้ได้หลายแถว — ห้าตัวซ้ำในราคากลาง จึงเลือกแถวที่ขายได้ก่อน
     แบบเดียวกับที่ priceApproval ทำ */
  const rows = priceMasterByProduct(code);
  const row = rows.find((r) => r.status === "OK") ?? rows[0];
  return row?.price_last ?? null;
}

/* ============================================================
   กลุ่มราคาเดียวกัน — ตัวตรวจของแบบ `same-price`

   ทั้งฟอร์มและด่านเขียนอ่านตัวเดียวกันนี้ ไม่ใช่ต่างคนต่างวนราคาเอง
   ถ้ามีสองสำเนา วันหนึ่งฟอร์มจะบอกว่าผ่านแล้วด่านตีกลับ โดยที่ข้อความ
   ทั้งสองที่บอกคนละเรื่อง
   ============================================================ */

/** สินค้าที่ราคาแคตตาล็อกเท่ากันหนึ่งกอง — ราคา 0 คือกองของ "ยังไม่มีราคา" */
export interface PriceCluster {
  price: number;
  codes: string[];
}

/**
 * แยกรหัสออกเป็นกองตามราคาแคตตาล็อก
 *
 * มากกว่าหนึ่งกอง = กลุ่มนี้ไม่ใช่ราคาเดียวกัน และ "ลูกค้าเลือกตัวไหนก็ได้"
 * จะกลายเป็นคำถามว่าเลือกตัวไหนแล้วบริษัทเสียเท่าไหร่ ซึ่งเป็นคำถามเดียวกับ
 * ที่ทำให้แบบกลุ่มยังเปิดไม่ได้
 *
 * ราคาที่ใช้คือ `catalogPrice` ตัวเดียวกับที่ `promotionFloorBreaches` ใช้
 * ตัดสินว่าใครอนุมัติได้ — ถ้าตรงนี้ใช้ราคาคนละตัว กลุ่มที่ผ่านตรงนี้จะไปหลุด
 * ราคาขั้นต่ำที่ตรงนั้นด้วยตัวเลขที่คนกรอกไม่เคยเห็น
 */
export function priceClusters(codes: string[]): PriceCluster[] {
  const by = new Map<number, string[]>();
  for (const raw of codes) {
    const code = String(raw ?? "").trim();
    if (!code) continue;
    by.set(catalogPrice(code), [...(by.get(catalogPrice(code)) ?? []), code]);
  }
  return [...by.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([price, list]) => ({ price, codes: list }));
}

/** กลุ่มที่ใช้กับแบบราคาเดียวกันได้ — ราคาเดียว และเป็นราคาที่มีอยู่จริง */
export const isSamePriceGroup = (codes: string[]): boolean => {
  const cl = priceClusters(codes);
  return cl.length === 1 && cl[0].price > 0;
};

/**
 * กองราคาที่เจอ เขียนเป็นข้อความ — ที่เดียวสำหรับทั้งกล่องเตือนบนฟอร์มและ
 * เหตุผลที่ด่านเขียนตอบกลับ ห้ามมีสองสำนวนสำหรับข้อเท็จจริงเดียวกัน
 */
export const priceClusterText = (clusters: PriceCluster[]): string =>
  clusters
    .map(
      (c) =>
        `${c.price > 0 ? c.price.toLocaleString("en-US") : "ยังไม่มีราคา"} (${c.codes.join(" · ")})`,
    )
    .join(" · ");

/** สินค้าตัวนี้อยู่ฝั่งไหนของโปร — ฝั่งที่ลูกค้าจ่ายเงินซื้อ หรือฝั่งที่ได้ฟรี */
export type LadderSide = "counted" | "free";

/** ราคาเฉลี่ยที่ตกกับสินค้าตัวหนึ่งที่ขั้นหนึ่ง พร้อมระยะห่างจากราคาขั้นต่ำของตัวมันเอง */
export interface ItemTierAverage {
  code: string;
  name: string;
  side: LadderSide;
  /** ราคาแคตตาล็อกของตัวนี้ */
  price: number;
  average: number;
  /** ราคาขั้นต่ำของตัวนี้ · null = ไม่มีราคาขั้นต่ำ จึงหลุดไม่ได้ */
  floor: number | null;
  below: boolean;
  /**
   * เฉลี่ย − ขั้นต่ำ · null เมื่อไม่มีขั้นต่ำ
   *
   * ติดลบมากที่สุด = ตัวที่แย่ที่สุด และเป็นตัวที่ตัดสินว่าโปรนี้ต้องขึ้นผู้จัดการ
   * — ไม่ใช่ตัวที่ราคาต่ำที่สุด สินค้าราคา 349,000 กับ 80 หลุดขั้นต่ำได้พอกัน
   */
  gap: number | null;
}

/**
 * ราคาเฉลี่ยของสินค้าหนึ่งตัวที่ขั้นหนึ่ง — **ที่เดียวของทั้งระบบ**
 *
 * ทั้งด่านที่ตัดสินว่าใครอนุมัติได้ (`ladderFloorBreaches`) และช่องบนฟอร์มที่
 * คนตั้งโปรอ่าน เรียกตัวนี้ตัวเดียวกัน ก่อนหน้านี้ฟอร์มคิดเอง จาก **สินค้า
 * ตัวแรกในตารางตัวเดียว** แล้วบอกว่าปลอดภัย ในขณะที่ด่านตอบว่าต้องขึ้น
 * ผู้จัดการ — คนตั้งโปรเห็นเขียวแล้วโปรถูกตีกลับ
 *
 * คืน null เมื่อสินค้านั้นยังไม่มีราคา (0) — "ไม่มีราคา" ไม่ใช่ "ฟรี" และ
 * การคิดเฉลี่ยจากศูนย์คือการรายงานว่าทุกขั้นหลุดขั้นต่ำ
 */
export function itemTierAverage(code: string, tier: LadderTier): ItemTierAverage | null {
  const price = catalogPrice(code);
  if (!(price > 0)) return null;
  return atAverage(code, tierAveragePrice(price, tier), price, tier, `counted`);
}

/**
 * สินค้าตัวหนึ่งที่ถูกลงบรรทัดด้วยราคาเฉลี่ยค่านี้
 *
 * แยกออกมาเพราะราคาเฉลี่ยของโปรแบบชุดเป็น **ค่าเดียวของทั้งใบ** ที่ตกกับ
 * สินค้าหลายตัว รวมทั้งของแถมที่ลูกค้าไม่ได้จ่ายเงินซื้อ — ตัวเลขเดียวกันนั้น
 * ต้องผ่านราคาขั้นต่ำของทุกตัวที่มันไปลง
 */
function atAverage(
  code: string,
  average: number,
  price: number,
  tier: LadderTier,
  side: LadderSide,
): ItemTierAverage | null {
  if (!(tier.buy > 0)) return null;
  const floor = productFloor(code);
  return {
    code,
    name: PRODUCTS.find((x) => x.code === code)?.name ?? code,
    side,
    price,
    average,
    floor,
    below: floor !== null && average < floor,
    gap: floor === null ? null : average - floor,
  };
}

/* ============================================================
   ฝั่งของแถม — ใครถูกแจก และราคาชุดคิดยังไง

   §ฉ.1 (ตัดสินแล้ว) ราคาเฉลี่ยของชุด = ราคารวมของชุด ÷ จำนวนชิ้นรวม
   สินค้าในชุดถือว่าราคาใกล้เคียงกันตามการใช้งานจริง — ชุดที่ราคากระจาย
   มากจะถูกเตือน (ขั้นถัดไป) ไม่ใช่ถูกบล็อก เพราะอาจมีเคสที่ตั้งใจ

   §ฉ.2 (ตัดสินแล้ว) "ถูกที่สุด" วัดจาก **ราคามาตรฐาน** ตัวเดียวกับที่ทั้ง
   โมดูลใช้คิดส่วนลดเปอร์เซ็นต์ — ไม่ใช่ราคาหลังหักส่วนลดของลูกค้ารายนั้น
   (เปลี่ยนไปตามลูกค้า เตือนตอนตั้งโปรไม่ได้) และไม่ใช่ต้นทุน (ของที่ต้นทุน
   ถูกสุดอาจขายแพงสุด แถมแล้วเสียกำไรมากกว่า)
   ============================================================ */

/**
 * ราคาต่อชิ้นของชุด — ผลรวมราคา ÷ จำนวนสินค้าในชุด
 *
 * ตัวที่ยังไม่มีราคาไม่ถูกนับเข้าทั้งเศษและส่วน — ราคา 0 ไม่ใช่ของฟรี มันคือ
 * ยังไม่รู้ราคา และการนับมันเป็น 0 จะดึงราคาชุดลงจนทุกขั้นดูเหมือนหลุดขั้นต่ำ
 *
 * ยังไม่มีที่เก็บจำนวนต่อสินค้าในชุด สมาชิกทุกตัวจึงนับเป็นหนึ่งชิ้นเท่ากัน
 * ถ้าวันหนึ่งชุดมีจำนวนต่อตัว สูตรนี้คือที่ที่ต้องแก้ ที่เดียว
 */
export function setUnitPrice(codes: readonly string[]): number | null {
  const prices = codes.map((c) => catalogPrice(c)).filter((p) => p > 0);
  if (!prices.length) return null;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

/**
 * เกณฑ์ว่าราคาในรายการเดียวกัน "กระจายเกินไป" ที่กี่เท่า
 *
 * §ฉ.1 ตัดสินให้เฉลี่ยรวมได้ พร้อมเตือนเมื่อกระจายเกินเกณฑ์ — **เตือน ไม่บล็อก**
 * เพราะอาจมีเคสที่ตั้งใจ
 *
 * เลข 3 เป็นค่าตั้งต้นที่ยังไม่ได้พิสูจน์ด้วยข้อมูลจริง อยู่ที่เดียวเพื่อให้แก้
 * ที่เดียวเมื่อมีตัวเลขที่ดีกว่า — ถ้าวันหนึ่งพบว่าเตือนบ่อยเกินจนคนเลิกอ่าน
 * หรือเงียบเกินจนไม่กันอะไร ให้แก้ตรงนี้ ไม่ใช่ไปเติมเงื่อนไขที่ผู้เรียก
 */
export const PRICE_SPREAD_LIMIT = 3;

export interface PriceSpread {
  low: { code: string; price: number };
  high: { code: string; price: number };
  /** สูงสุด ÷ ต่ำสุด */
  ratio: number;
  /** เกินเกณฑ์ `PRICE_SPREAD_LIMIT` */
  over: boolean;
}

/**
 * ราคาในรายการนี้กระจายแค่ไหน · null เมื่อยังเทียบไม่ได้
 *
 * ต้องมีสินค้าที่มีราคาอย่างน้อยสองตัวจึงจะมีคำว่ากระจาย — รายการตัวเดียว
 * หรือรายการที่ยังไม่มีราคา ไม่ใช่ "ไม่กระจาย" แต่คือ "ยังไม่มีคำถาม"
 */
export function priceSpread(codes: readonly string[]): PriceSpread | null {
  const priced = codes
    .map((code) => ({ code, price: catalogPrice(code) }))
    .filter((x) => x.price > 0);
  if (priced.length < 2) return null;

  const low = priced.reduce((a, b) => (b.price < a.price ? b : a));
  const high = priced.reduce((a, b) => (b.price > a.price ? b : a));
  const ratio = high.price / low.price;
  return { low, high, ratio, over: ratio > PRICE_SPREAD_LIMIT };
}

/** ตัวที่ราคามาตรฐานต่ำที่สุดในรายการ — ของแถมของแบบกลุ่ม */
export function cheapestByStandardPrice(codes: readonly string[]): string | null {
  let best: { code: string; price: number } | null = null;
  for (const code of codes) {
    const price = catalogPrice(code);
    if (!(price > 0)) continue;
    if (!best || price < best.price) best = { code, price };
  }
  return best?.code ?? null;
}

/** สิ่งที่ต้องรู้เพื่อคิดขั้นบันไดหนึ่งชุด — ฟอร์มมีครบก่อนมีระเบียน */
export interface LadderInput {
  scope: PromotionScope;
  items: readonly string[];
  freeItems: readonly string[];
  tiers: readonly LadderTier[];
}

export interface FreeSide {
  /** สินค้าที่ถูกแถมจริงตามรูปแบบนี้ · ว่างสำหรับแบบรายตัว (แถมตัวเดียวกับที่ซื้อ) */
  codes: string[];
  /**
   * รูปแบบนี้ต้องระบุของแถม แต่ยังไม่ได้ระบุ
   *
   * ต่างจาก "ตรวจแล้วผ่าน" — ยังตรวจราคาขั้นต่ำของฝั่งแถมไม่ได้เลยเพราะยัง
   * ไม่รู้ว่าจะแถมอะไร ผู้เรียกต้องบอกคนกรอก ไม่ใช่รายงานว่าไม่มีปัญหา
   */
  missing: boolean;
}

/** ของแถมของโปรใบนี้คือใคร — ต่างกันตามรูปแบบ ไม่ใช่ตามชนิด */
export function ladderFreeSide(
  input: Pick<LadderInput, "scope" | "items" | "freeItems">,
): FreeSide {
  const free = input.freeItems.filter(Boolean);
  switch (input.scope) {
    case "set":
    case "same-price":
      return { codes: [...free], missing: free.length === 0 };
    case "group": {
      /* แถมตัวที่ถูกที่สุดในรายการที่นับ — ของแถมอยู่ในรายการเดียวกับที่ซื้อ
         จึงไม่มีทางไม่ได้ระบุ */
      const cheapest = cheapestByStandardPrice(input.items);
      return { codes: cheapest ? [cheapest] : [], missing: false };
    }
    default:
      /* รายตัว — ของแถมคือสินค้าตัวเดียวกับที่ซื้อ ไม่มีฝั่งแยกให้ระบุ */
      return { codes: [], missing: false };
  }
}

/**
 * ราคาเฉลี่ยที่ขั้นนั้นทำให้เกิด แยกรายสินค้า เรียงจากตัวที่แย่ที่สุดก่อน
 *
 * **สองโหมด และต่างกันจริง ไม่ใช่ต่างกันแค่ชื่อ**
 *
 *   รายตัว   สินค้าแต่ละตัวเป็นโปรของตัวเอง — ซื้อ X ได้ X ราคาเฉลี่ยจึงเป็น
 *            ของ X ล้วน ๆ และมีคนละค่าต่อสินค้าหนึ่งตัว
 *
 *   ชุด/กลุ่ม/ราคาเดียวกัน
 *            ทั้งใบมีราคาเฉลี่ยค่าเดียว = ราคาชุดที่ซื้อ × จำนวนที่จ่าย ÷
 *            จำนวนที่ได้รับ แล้วค่านั้นไปลงบรรทัดของ **ทั้งของที่ซื้อและ
 *            ของที่แถม** ตามสเปครอบที่ 1 §4.1/§4.2 (ของแถมไม่ตั้งราคา 0)
 *            ⇒ ของแถมราคาแพงจะหลุดราคาขั้นต่ำของตัวมันเองทันที ซึ่งเป็น
 *            รูที่ PM-5 วัดไว้: แจกของ 320 บาทกับ 1,396,000 บาท ระบบเคย
 *            ตอบเหมือนกันเพราะฝั่งแถมไม่เคยเข้าสูตร
 *
 * ช่องบนหน้าจอที่มีที่ว่างให้เลขเดียวแสดงตัวแรกของรายการนี้ (แย่ที่สุด)
 * เพราะนั่นคือตัวที่ตัดสินว่าทั้งใบต้องขึ้นผู้จัดการหรือไม่
 */
export function tierAverages(input: LadderInput, tier: LadderTier): ItemTierAverage[] {
  const perItem = input.scope !== `set` && input.scope !== `same-price` && input.scope !== `group`;

  const rows: ItemTierAverage[] = perItem
    ? input.items
        .map((code) => itemTierAverage(code, tier))
        .filter((a): a is ItemTierAverage => a !== null)
    : (() => {
        const setPrice = setUnitPrice(input.items);
        if (setPrice === null) return [];
        const average = averageUnitPrice(setPrice, tier.buy, tier.free);
        const free = ladderFreeSide(input);
        /* ฝั่งที่ซื้อก่อน แล้วฝั่งที่แถม — ตัวที่อยู่ทั้งสองฝั่ง (แบบกลุ่ม)
           นับครั้งเดียวในฝั่งที่แถม เพราะนั่นคือฝั่งที่อธิบายว่าทำไมมันโดน */
        const freeSet = new Set(free.codes);
        return [
          ...input.items
            .filter((code) => !freeSet.has(code))
            .map((code) => atAverage(code, average, catalogPrice(code), tier, `counted`)),
          ...free.codes.map((code) =>
            atAverage(code, average, catalogPrice(code), tier, `free`),
          ),
        ].filter((a): a is ItemTierAverage => a !== null);
      })();

  return rows
    .sort((a, b) => {
      /* ตัวที่หลุดมาก่อนเสมอ แล้วเรียงตามระยะที่หลุดลึกที่สุด
         ตัวที่ไม่มีขั้นต่ำหลุดไม่ได้ จึงไปท้ายแถวและไม่มีวันเป็น "แย่ที่สุด" */
      if (a.below !== b.below) return a.below ? -1 : 1;
      if (a.gap === null) return 1;
      if (b.gap === null) return -1;
      return a.gap - b.gap;
    });
}

/** ตัวที่ตัดสินว่าขั้นนี้ต้องขึ้นผู้จัดการหรือไม่ · null เมื่อยังไม่มีสินค้าที่มีราคา */
export const worstTierAverage = (
  input: LadderInput,
  tier: LadderTier,
): ItemTierAverage | null => tierAverages(input, tier)[0] ?? null;

export interface FloorBreach {
  code: string;
  name: string;
  /** ตัวนี้เป็นของที่ซื้อ หรือของที่แถม — ของแถมที่หลุดอ่านไม่รู้เรื่องถ้าไม่บอก */
  side: LadderSide;
  tier: LadderTier;
  /** ราคาเฉลี่ยที่ขั้นนี้ทำให้เกิด */
  average: number;
  floor: number;
}

/**
 * ขั้นไหนของสินค้าตัวไหนหลุดราคาขั้นต่ำ — รับรายการตรง ๆ ไม่ต้องมีระเบียน
 *
 * ฟอร์มเรียกตัวนี้ระหว่างพิมพ์ (ยังไม่มีระเบียน) และ `promotionFloorBreaches`
 * เรียกตัวนี้ตอนตัดสินระดับอนุมัติ ทั้งสองทางจึงตอบเหมือนกันเสมอโดยโครงสร้าง
 * ไม่ใช่โดยบังเอิญ
 */
export function ladderFloorBreaches(input: LadderInput): FloorBreach[] {
  const out: FloorBreach[] = [];
  for (const tier of input.tiers) {
    for (const a of tierAverages(input, tier)) {
      if (a.floor === null || !a.below) continue;
      out.push({
        code: a.code,
        name: a.name,
        side: a.side,
        tier,
        average: a.average,
        floor: a.floor,
      });
    }
  }
  return out;
}

/**
 * ขั้นไหนของโปรนี้ทำให้ราคาเฉลี่ยหลุดราคาขั้นต่ำบ้าง
 *
 * §5 บอกว่าต้องเตือนตั้งแต่ **ตอนสร้างโปร** ไม่ใช่ให้เซลล์ไปเจอตอนถูกตีกลับ
 * ตรงนี้คือคำตอบของคำถามนั้น และเป็นตัวเดียวกับที่ใช้ตัดสินว่าใครอนุมัติได้
 *
 * ไม่เรียก `checkQuotedPrice()` — ตัวนั้นเป็นด่านของ **เอกสารขาย** และจะถูก
 * เรียกตอนออกบิลจริงตาม §5 อยู่แล้ว ที่นี่แค่อ่าน `price_last` มาเทียบเพื่อ
 * เตือนล่วงหน้า ราคาที่ใช้เทียบคือราคาแคตตาล็อก เพราะตอนตั้งโปรยังไม่รู้ว่า
 * ใบไหนจะขายเท่าไหร่
 */
export function promotionFloorBreaches(p: PromotionRow): FloorBreach[] {
  /* ⚠️ ชนิดอื่นไม่มีของแถมมาเฉลี่ย จึงคิดสูตรนี้กับมันไม่ได้
     ก่อนจะมีชนิดที่สอง ตัวนี้วน `p.tiers` โดยสมมติว่าเป็น `{buy, free}` เสมอ
     โปรส่วนลดที่ `tiers` ว่างจะได้ผลลัพธ์ว่าง "โดยบังเอิญ" ซึ่งดูเหมือนถูก
     — จนวันที่ใครใส่ขั้นของแถมค้างไว้ในโปรส่วนลด แล้วราคาเฉลี่ยของขั้นที่
     ไม่มีอยู่จริงไปตัดสินว่าใครต้องอนุมัติ ตรงนี้จึงตัดที่ชนิด ไม่ใช่หวังว่า
     ฟิลด์จะว่าง — ราคาหลังลดของโปรส่วนลดใช้ `promotionDiscountBreaches` */
  if (p.kind !== "free-goods") return [];

  /* สูตรอยู่ที่ `ladderFloorBreaches` ตัวเดียว ตรงนี้เหลือแค่ด่านชนิด —
     ฟอร์มเรียกตัวนั้นตรง ๆ ระหว่างพิมพ์ ถ้าที่นี่ยังคิดเองอีกชุด วันหนึ่ง
     สองที่จะตอบไม่ตรงกัน แล้วคนตั้งโปรจะเชื่อที่ที่ผิด */
  return ladderFloorBreaches({
    scope: p.scope,
    items: p.items,
    freeItems: p.freeItems,
    tiers: p.tiers,
  });
}

/* ============================================================
   โปรส่วนลดราคา — ตัวห่อบาง ๆ ของ promotion-discount.ts

   สูตรทั้งหมดอยู่ในไฟล์นั้น ไม่ได้ทำซ้ำที่นี่ ตรงนี้แค่แปลง `PromotionRow`
   เป็นพารามิเตอร์ที่ตัวคำนวณรับ — เพราะตัวคำนวณต้องไม่รู้จัก `PromotionRow`
   ถ้ามันรู้จัก มันจะอ่านฟิลด์เอง แล้วการทดสอบก็ต้องประกอบระเบียนทั้งใบ
   ทุกครั้งที่อยากถามคำถามเรื่องราคาสองค่า
   ============================================================ */

/** §1.4 — ขั้นไหนของโปรส่วนลดทำให้ราคาต่ำกว่าราคาขั้นต่ำ */
export function promotionDiscountBreaches(p: PromotionRow): DiscountBreach[] {
  if (p.kind !== "price-discount") return [];
  return discountFloorBreaches(p.items, p.discountTiers, p.discountMode);
}

/** §1.5 ข้อ 2 — ชั้นลูกค้าที่โปรนี้ไม่มีผลเลย เพราะได้ถูกกว่าอยู่แล้ว */
export function promotionIneffectiveTiers(p: PromotionRow) {
  if (p.kind !== "price-discount") return [];
  return discountIneffectiveTiers(p.items, p.discountTiers, p.discountMode);
}

/* ============================================================
   สิทธิแลกซื้อ — ตัวห่อของ promotion-redeem.ts

   `promotion-redeem.ts` เป็นเลขคณิตล้วน ไม่รู้จัก `PromotionRow` และไม่อ่าน
   ราคา ตรงนี้คือที่ประกอบ: แปลงระเบียนเป็นพารามิเตอร์ และ **ยืมกฎราคาของ
   ชนิดที่สองมาใช้** ไม่ได้เขียนสูตรใหม่

   ส่วนลดหนึ่งอัตราคือ `DiscountTier` หนึ่งขั้น (`minQty: 1`) จึงเรียก
   `discountFloorBreaches` ของเดิมได้ทั้งดุ้น — สินค้าที่แลกซื้อในราคาลด
   หลุด `price_last` ได้เหมือนกัน และต้องขึ้นผู้จัดการด้วยเหตุผลเดียวกัน
   ============================================================ */

/** ส่วนลดของสิทธิ ในรูปที่ตัวคำนวณราคาของชนิดที่สองรับ */
const redeemAsTier = (p: PromotionRow): DiscountTier[] =>
  p.redeemDiscPct !== null && p.redeemDiscPct > 0
    ? [{ minQty: 1, price: null, discPct: p.redeemDiscPct }]
    : [];

/** §2.1 — ยอดนี้ได้สิทธิกี่รอบ กี่ชิ้น */
export function promotionRedeemQuota(p: PromotionRow, actual: number) {
  const rounds = redeemRounds(p.redeemThreshold, p.redeemBasis, actual);
  return { rounds, quota: redeemQuota(rounds, p.redeemPerRound) };
}

/** สินค้าที่แลกซื้อแล้วราคาหลังลดต่ำกว่าราคาขั้นต่ำ — สูตรเดียวกับชนิดที่สอง */
export function promotionRedeemBreaches(p: PromotionRow): DiscountBreach[] {
  if (p.kind !== "redeem") return [];
  return discountFloorBreaches(p.redeemItems, redeemAsTier(p), "percent");
}

/* ============================================================
   ใครสร้างและอนุมัติโปร — §6h

   บทบาทที่สร้างได้ไม่ได้เขียนเป็นรายชื่อในไฟล์นี้ ตัวตัดสินคือ
   ตารางสิทธิ์ใน Administration แบบเดียวกับที่ทั้งแอปใช้ —
   ดูคอมเมนต์ "WHO MAY DO WHAT" ใน workflows-outbound.tsx
   เปลี่ยนบทบาทที่สร้างได้ = แก้ตารางสิทธิ์ ไม่ใช่แก้โค้ด

   ด่านทุกตัวอยู่บนฟังก์ชันที่เขียนข้อมูล ไม่ใช่แค่ซ่อนปุ่ม
   ============================================================ */

/**
 * เพดานงบที่ต้องให้ผู้จัดการอนุมัติ — อ่านจากค่าตั้งระบบ
 *
 * ตัวเลขอยู่ที่ COMPANY ใน data/admin.ts รวมกับอัตราภาษีและรอบปีบัญชี
 * ไม่ได้อยู่ในโมดูลนี้ เพราะใครตั้งภาษีก็ตั้งเพดานนี้ อ่านผ่านฟังก์ชัน
 * ไม่ใช่ค่าคงที่ตอน import เพื่อให้แก้ค่าตั้งระบบแล้วมีผลทันที
 */
export const managerBudgetCeiling = () => COMPANY.promotionManagerBudgetCeiling;

export type PromotionApprovalLevel = "admin" | "manager";

/** §6h — โปรแบบไหนต้องขึ้นถึงผู้จัดการ */
export function promotionApprovalLevel(p: PromotionRow): PromotionApprovalLevel {
  if (promotionFloorBreaches(p).length > 0) return "manager";
  /* โปรส่วนลดหลุดราคาขั้นต่ำก็ต้องขึ้นผู้จัดการเหมือนกัน — คนละสูตร
     แต่เป็นเหตุผลเดียวกัน และถ้าไม่เรียกตัวนี้ โปรชนิดที่สองจะผ่านแอดมิน
     ได้ทุกใบไม่ว่าลดลึกแค่ไหน */
  if (promotionDiscountBreaches(p).length > 0) return "manager";
  /* และสินค้าที่แลกซื้อในราคาลด หลุดขั้นต่ำได้เหมือนกัน */
  if (promotionRedeemBreaches(p).length > 0) return "manager";
  if ((p.budget ?? 0) > managerBudgetCeiling()) return "manager";
  return "admin";
}

/** ผลของด่าน — `reason` ว่างเมื่อผ่าน เพื่อให้ทั้ง UI และเทสต์อ่านเหตุผลเดียวกัน */
export interface PromotionGuard {
  ok: boolean;
  reason: string;
}

const PASS: PromotionGuard = { ok: true, reason: "" };

/** สร้างโปรได้ไหม — ตารางสิทธิ์ตัดสิน ไม่ใช่รายชื่อบทบาทในโค้ด */
export function mayCreatePromotion(): PromotionGuard {
  return can("promotion", "create")
    ? PASS
    : { ok: false, reason: "บทบาทนี้สร้างโปรโมชั่นไม่ได้ — โปรกระทบราคาทั้งบริษัท ไม่ใช่ดีลรายใบ" };
}

/**
 * อนุมัติโปรนี้ได้ไหม
 *
 * สี่ด่าน เรียงตามลำดับที่ทำให้ข้อความที่ได้มีประโยชน์ที่สุด: สถานะก่อน
 * เพราะมันตอบว่า "ยังไม่ถึงเวลา" · แล้วคนสร้าง เพราะมันตอบว่า "ไม่ใช่คุณ" ·
 * แล้วค่อยเรื่องสิทธิ์
 */
export function mayApprovePromotion(p: PromotionRow): PromotionGuard {
  if (p.status !== "Pending Approval") {
    return { ok: false, reason: `อนุมัติได้เฉพาะโปรที่รออนุมัติ — ตอนนี้อยู่สถานะ ${PROMOTION_STATUS_TH[p.status]}` };
  }

  /* §6h — ต่างจากใบเสนอราคาโดยตั้งใจ ใบเสนอราคาผิดกระทบลูกค้าหนึ่งราย
     โปรผิดกระทบทุกใบที่เข้าเงื่อนไขจนกว่าจะมีคนสังเกต */
  if (p.createdBy && p.createdBy === currentUser().name) {
    return { ok: false, reason: "คนสร้างโปรอนุมัติโปรของตัวเองไม่ได้ ต้องให้คนอื่นตรวจ" };
  }

  if (!can("promotion", "approve")) {
    return { ok: false, reason: "บทบาทนี้ไม่มีสิทธิ์อนุมัติโปรโมชั่น" };
  }

  const level = promotionApprovalLevel(p);
  if (!maySignAt(level)) {
    const why = promotionFloorBreaches(p).length
      ? "มีขั้นที่ทำให้ราคาเฉลี่ยต่ำกว่าราคาขั้นต่ำ"
      : "งบเกินเพดานที่แอดมินอนุมัติได้";
    return { ok: false, reason: `${why} — ต้องให้ผู้จัดการฝ่ายขายอนุมัติเท่านั้น` };
  }

  return PASS;
}

/**
 * ช่องที่นับเป็น "เงื่อนไข" ตาม §6g
 *
 * แก้ช่องพวกนี้หลังอนุมัติแล้ว = ต้องขออนุมัติใหม่ ช่องที่ไม่อยู่ในนี้
 * (ชื่อที่พิมพ์บนเอกสาร เจ้าของโปร หมายเหตุ) แก้ได้โดยไม่กระทบการอนุมัติ
 * เพราะไม่ได้เปลี่ยนว่าใครได้อะไรเท่าไหร่
 */
export const PROMOTION_CONDITION_FIELDS: readonly (keyof PromotionRow)[] = [
  "kind", "scope", "items", "freeItems",
  "tiers", "discountTiers", "discountMode",
  "redeemBasis", "redeemThreshold", "redeemItems", "redeemDiscPct", "redeemPerRound",
  "priceLists", "minOrder", "minOrderBasis",
  "usePerArea", "freeQtyCap", "stackWithPromos",
  "paymentTerm", "depositPct",
  "nearExpiryOnly", "nearExpiryDays", "customerGroups", "customers", "areas",
  "channels", "allowDraftPartner", "usePerCustomer", "useTotal", "stackWithPromo",
  "stackWithCustomerDiscount", "commissionBase", "budget", "budgetBasis",
  "budgetOver", "freeGoodsWarehouse", "from", "to",
];

/** §6h — แก้โปรที่ใช้งานอยู่ไม่ได้ ต้องหยุดชั่วคราวก่อน */
export function mayEditPromotion(p: PromotionRow): PromotionGuard {
  if (p.status === "Active") {
    return { ok: false, reason: "โปรที่ใช้งานอยู่แก้ไม่ได้ — ต้องหยุดชั่วคราวก่อน" };
  }
  if (p.status === "Pending Approval") {
    return { ok: false, reason: "โปรที่รออนุมัติอยู่แก้ไม่ได้ — ต้องถอนคำขอก่อน" };
  }
  if (p.status === "Ended") {
    return { ok: false, reason: "โปรที่สิ้นสุดแล้วแก้ไม่ได้" };
  }
  if (!can("promotion", "edit")) {
    return { ok: false, reason: "บทบาทนี้ไม่มีสิทธิ์แก้โปรโมชั่น" };
  }
  return PASS;
}

/** รูปแบบที่ `FormSchema.editGuard` ต้องการ — ข้อความเมื่อล็อก · null เมื่อแก้ได้ */
export const promotionEditGuard = (p: PromotionRow): string | null =>
  mayEditPromotion(p).ok ? null : mayEditPromotion(p).reason;

/* ---------- ตัวเขียนที่ถือด่านไว้เอง ---------- */

/**
 * เขียนค่าลงโปร
 *
 * ทุกการแก้ต้องผ่านตรงนี้ ไม่ใช่ `Object.assign` ที่หน้าจอ — ถ้าปล่อยให้
 * แต่ละหน้าเขียนเอง ด่านจะกลายเป็นการซ่อนปุ่ม ซึ่งไม่กันอะไรเลยเมื่อคำสั่ง
 * มาจากหน้าที่ค้างอยู่ จากคีย์บอร์ด หรือจาก API ที่นี่จะกลายเป็นในอนาคต
 */
export function applyPromotionPatch(
  p: PromotionRow,
  patch: Partial<PromotionRow>,
): PromotionGuard {
  const guard = mayEditPromotion(p);
  if (!guard.ok) return guard;


  /* ต้องเลือกรูปแบบ — **เฉพาะชนิดที่ใช้รูปแบบ**
     สิทธิแลกซื้อไม่มีรายตัว/ชุด เงื่อนไขของมันคือ "ทุก ๆ X ได้หนึ่งรอบ" ฟอร์ม
     จึงไม่ถาม และ patch ของมันส่ง `scope: ""` มาตามค่าในระเบียน ถ้าด่านนี้
     ไม่แยกชนิด โปรแลกซื้อจะบันทึกไม่ได้เลยด้วยเหตุผลที่ไม่เกี่ยวกับมัน
     — เจอตอนเขียนเทสต์ของชนิดที่สาม */
  const nextKind = patch.kind ?? p.kind;
  if (nextKind !== "redeem" && "scope" in patch && !patch.scope) {
    return {
      ok: false,
      reason: "ต้องเลือกรูปแบบว่านับยอดแบบไหน — รายตัว หรือ ชุดที่กำหนด",
    };
  }

  /* แบบราคาเดียวกัน — ตรวจ **เฉพาะตอนที่ patch แตะกลุ่มนั้นจริง**
     ราคาแคตตาล็อกเปลี่ยนได้ทีหลัง โปรที่เคยถูกต้องจะกลายเป็นกลุ่มสองราคา
     โดยที่ไม่มีใครแตะมัน ถ้าด่านนี้ตรวจทุกครั้ง การแก้ชื่อโปรตัวนั้นจะถูก
     ปฏิเสธด้วยเรื่องที่คนแก้ไม่ได้ทำ — บทเรียนเดียวกับแบบกลุ่มข้างบน */
  if ((patch.scope ?? p.scope) === "same-price") {
    for (const [key, label] of [
      ["items", "สินค้าที่เข้าโปร"],
      ["freeItems", "ของแถม"],
    ] as const) {
      if (!("scope" in patch) && !(key in patch)) continue;
      const codes = patch[key] ?? p[key];
      const clusters = priceClusters(codes);
      if (clusters.length > 1) {
        return {
          ok: false,
          reason: `แบบราคาเดียวกันต้องราคาเท่ากันทั้งกลุ่ม — ${label}มี ${clusters.length} ราคา: ${priceClusterText(clusters)}`,
        };
      }
    }
  }

  const touchedCondition = PROMOTION_CONDITION_FIELDS.some(
    (k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(p[k]),
  );

  /* รหัสถูกตัดออกจาก patch เสมอ — ระเบียนที่เปลี่ยนรหัสได้ คือระเบียนที่ทำให้
     เอกสารทุกใบที่อ้างถึงมันกลายเป็นเอกสารที่อ้างถึงของที่ไม่มีอยู่ ตัดที่นี่
     ที่เดียว เพราะทั้งตอนสร้างและตอนแก้เดินผ่านฟังก์ชันนี้ทางเดียว
     (`createPromotion` ตั้งรหัสลงแถวก่อนเรียกตัวนี้) */
  const { code: _code, ...writable } = patch;
  Object.assign(p, writable);

  /* §6g — แก้เงื่อนไขระหว่างหยุด ต้องขออนุมัติใหม่ ไม่งั้นจะเป็นช่องให้
     เปลี่ยนโปรที่อนุมัติแล้วโดยไม่ผ่านใคร */
  if (touchedCondition && p.approvedAt) p.dirtySinceApproval = true;

  return PASS;
}

export function approvePromotion(p: PromotionRow): PromotionGuard {
  const guard = mayApprovePromotion(p);
  if (!guard.ok) return guard;

  p.status = "Active";
  p.approvedBy = currentUser().name;
  p.approvedAt = new Date().toLocaleDateString("en-GB");
  p.dirtySinceApproval = false;
  return PASS;
}

/** §6g — หยุดชั่วคราว ต้องระบุเหตุผล และเป็นสิทธิ์ของคนที่อนุมัติได้ */
export function pausePromotion(p: PromotionRow, reason: string): PromotionGuard {
  if (p.status !== "Active") {
    return { ok: false, reason: "หยุดได้เฉพาะโปรที่ใช้งานอยู่" };
  }
  if (!can("promotion", "approve")) {
    return { ok: false, reason: "หยุดโปรได้เฉพาะคนที่มีสิทธิ์อนุมัติ" };
  }
  if (!reason.trim()) {
    return { ok: false, reason: "ต้องระบุเหตุผลที่หยุด" };
  }

  p.status = "Paused";
  p.pausedReason = reason.trim();
  p.pausedBy = currentUser().name;
  p.pausedAt = new Date().toLocaleDateString("en-GB");
  return PASS;
}

/**
 * §6g — เปิดกลับได้โดยไม่ต้องขออนุมัติซ้ำ **ถ้าไม่ได้แก้เงื่อนไข**
 *
 * ถ้าแก้ไปแล้ว มันไม่ใช่โปรตัวที่ถูกอนุมัติอีกต่อไป จึงกลับไปเข้าคิวอนุมัติ
 * แทนที่จะกลับไปใช้งาน — นี่คือด่านที่ปิดช่องโหว่ ไม่ใช่การซ่อนปุ่ม
 */
export function resumePromotion(p: PromotionRow): PromotionGuard {
  if (p.status !== "Paused") {
    return { ok: false, reason: "เปิดกลับได้เฉพาะโปรที่หยุดชั่วคราวอยู่" };
  }
  if (!can("promotion", "approve")) {
    return { ok: false, reason: "เปิดโปรกลับได้เฉพาะคนที่มีสิทธิ์อนุมัติ" };
  }

  if (p.dirtySinceApproval) {
    p.status = "Pending Approval";
    return { ok: false, reason: "เงื่อนไขถูกแก้ระหว่างหยุด — ส่งกลับไปขออนุมัติใหม่แล้ว" };
  }

  p.status = "Active";
  p.pausedReason = "";
  p.pausedBy = "";
  p.pausedAt = "";
  return PASS;
}

/* ---------- ค่าที่หน้าจออ่าน ---------- */

/** ชื่อที่ลูกค้าเห็นบนเอกสาร — ว่างแล้วตกกลับไปใช้ชื่อภายในตาม §6b */
export const promotionPrintName = (p: PromotionRow): string =>
  p.printName.trim() || p.name;

/** งบที่ใช้ไปแล้วคิดเป็นกี่เปอร์เซ็นต์ — null เมื่อไม่ได้จำกัดงบ */
export const budgetUsedPct = (p: PromotionRow): number | null =>
  p.budget && p.budget > 0 ? Math.round((p.budgetUsed / p.budget) * 100) : null;

export const PROMOTIONS = RAW as PromotionRow[];

export const getPromotion = (code: string): PromotionRow | null =>
  PROMOTIONS.find((p) => p.code === code) ?? null;

/* ============================================================
   สร้างโปรใหม่ — §6h

   `applyPromotionPatch` แก้แถวที่มีอยู่ได้ แต่แก้แถวที่ยังไม่มีไม่ได้
   ตัวนี้คือขั้นที่ขาด และมันไม่ได้เพิ่มกฎใหม่เลย — ต่อของเดิมสี่ขั้น:

     1. `mayCreatePromotion()`  ด่านที่เขียนไว้แล้วแต่ยังไม่มีใครเรียก
     2. ออกรหัสถัดไป            ลอก `nextPRCode` — ดูคอมเมนต์ที่ตัวมันเอง
     3. `blankPromotion()`      ค่าเริ่มต้นอยู่ที่เดียว ไม่กระจาย
     4. `applyPromotionPatch()` ค่าจากฟอร์มเดินทางเดียวกับตอนแก้

   ขั้นที่ 4 สำคัญที่สุด ถ้าเขียนค่าตรงลงแถวที่นี่ จะมีสองเส้นทางเขียน
   แล้ววันหนึ่งเส้นทางหนึ่งจะได้กฎที่อีกเส้นทางไม่ได้
   ============================================================ */

/**
 * รหัสโปรถัดไป
 *
 * ลอกจาก `nextPRCode` ไม่ใช่ `nextBPCode` — ทั้งสองตัวในโปรเจกต์นี้ต่างกัน:
 * PR อ่านเฉพาะส่วนหลังขีด (`split("-")[1]`) BP อ่านตัวเลขทั้งหมดในรหัส
 * (`replace(/\D/g, "")`) วันนี้ให้ผลเท่ากันเพราะรหัสโปรเป็น `PM-0001`
 * แต่ถ้าวันหน้าเติมปีเป็น `PM2506-0001` แบบ BP จะอ่านได้ 25060001
 */
export function nextPromotionCode(): string {
  const n = PROMOTIONS.reduce((m, p) => {
    const num = parseInt(String(p.code).split("-")[1], 10) || 0;
    return Math.max(m, num);
  }, 0);
  return `PM-${String(n + 1).padStart(4, "0")}`;
}

/**
 * ผลของการสร้าง — คืนเหตุผลเสมอเมื่อถูกปฏิเสธ
 *
 * `row` เป็น null เมื่อไม่ผ่าน และ `reason` บอกว่าทำไม เพื่อให้หน้าจอแสดง
 * เหตุผลได้ ไม่ใช่แค่เงียบไปเฉย ๆ — รูปแบบเดียวกับ `PromotionGuard` ตัวอื่น
 */
export interface PromotionCreateResult extends PromotionGuard {
  row: PromotionRow | null;
}

export function createPromotion(
  patch: Partial<PromotionRow>,
): PromotionCreateResult {
  const guard = mayCreatePromotion();
  if (!guard.ok) return { ...guard, row: null };

  /* รหัสที่พิมพ์มาเอง — ว่างไว้แปลว่าให้ระบบออกให้ตามลำดับเดิม
     ตรวจที่นี่ ไม่ใช่ที่ฟอร์ม เพราะรหัสซ้ำคือระเบียนสองใบที่ `getPromotion`
     ตอบได้ใบเดียว อีกใบจะเปิดไม่ขึ้นทั้งที่อยู่ในทะเบียน — และคำสั่งสร้าง
     ไม่ได้มาจากฟอร์มเสมอไป */
  const typed = String(patch.code ?? "").trim().toUpperCase();
  if (/\s/.test(typed)) {
    return { ok: false, reason: "รหัสโปรห้ามมีช่องว่าง", row: null };
  }
  if (typed && getPromotion(typed)) {
    return {
      ok: false,
      reason: `รหัส ${typed} มีอยู่แล้วในทะเบียน — ใช้รหัสอื่น หรือปล่อยว่างให้ระบบออกให้`,
      row: null,
    };
  }

  const row: PromotionRow = {
    ...blankPromotion(),
    code: typed || nextPromotionCode(),
    created: stamp(),
    createdBy: currentUser().name,
  };
  PROMOTIONS.unshift(row);

  /* ค่าทุกช่องเดินผ่านทางเขียนเดียวกับตอนแก้ ไม่มีเส้นทางลัด */
  const written = applyPromotionPatch(row, patch);
  if (!written.ok) {
    /* เขียนไม่ผ่านแล้วปล่อยแถวเปล่าค้างไว้ในทะเบียน คือการสร้างขยะที่
       หน้ารายการจะแสดงเป็นโปรไม่มีชื่อ ถอนออกให้เหมือนไม่เคยเกิด */
    const i = PROMOTIONS.indexOf(row);
    if (i > -1) PROMOTIONS.splice(i, 1);
    return { ...written, row: null };
  }

  return { ok: true, reason: "", row };
}
