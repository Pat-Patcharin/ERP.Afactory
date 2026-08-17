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
import type { LadderTier } from "./promotion-ladder";
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

   แถมสินค้า and ส่วนลดราคา are open. The other two are listed rather than
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
    example: "ซื้อครบ 20,000 แลกซื้อหัวกรอ 1 ตัว ราคา 500",
    icon: "cart",
    href: null,
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
export type PromotionScope = "" | "item" | "set" | "group";

export const PROMOTION_SCOPE_TH: Record<PromotionScope, string> = {
  "": "— ยังไม่ได้เลือก —",
  item: "รายตัว — แถมสินค้าตัวเดียวกัน",
  set: "ชุดที่กำหนด — แถมจากชุดที่ระบุ",
  group: "กลุ่ม — แถมตัวที่ถูกที่สุด",
};

/**
 * แบบที่เลือกได้จริงวันนี้
 *
 * แบบกลุ่มยังไม่เปิด เพราะ §2 ยังไม่ตัดสินว่า "ถูกที่สุด" วัดจากราคาไหน —
 * ราคาตั้ง · ราคาหลังหักส่วนลดของลูกค้ารายนั้น · หรือต้นทุน สามคำตอบให้ของแถม
 * คนละชิ้น และถ้าวัดจากราคาหลังหักส่วนลด ของที่ถูกสุดจะเปลี่ยนไปตามลูกค้าแต่ละราย
 *
 * ปิดที่ **ทางเขียน** ไม่ใช่แค่ไม่ใส่ในรายการตัวเลือก — ตัวเลือกที่ซ่อนยังส่งมา
 * ทาง `?scope=group` ได้ และ disabled option ในหลายเบราว์เซอร์ยังโฟกัสได้
 */
export const OPEN_PROMOTION_SCOPES: readonly PromotionScope[] = ["item", "set"];

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
 * สองตัว ตามที่ตกลงกันไว้ และคำที่ใช้คือคำที่ตกลงกัน ไม่ใช่คำที่โค้ดคิดขึ้น
 * สเปคบังคับให้เลือก และบอกว่าต้องเป็นกล่องเตือนไม่ใช่ dropdown ธรรมดา
 *
 * เคยมีตัวที่สาม "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้" — ตัดออกแล้ว มันคือ
 * การเดานโยบายค่าตอบแทน ไม่ใช่ข้อเท็จจริงที่ใครบอกมา และเป็นเรื่องที่กระทบ
 * รายได้พนักงาน ระบบจะไม่เสนอตัวเลือกที่ไม่มีใครตัดสินใจไว้
 */
export const COMMISSION_BASES = [
  "ยอดที่ลูกค้าจ่ายจริง",
  "มูลค่าบรรทัดหลังเฉลี่ยของแถม",
] as const;

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
  priority: number;
  reason: string;
  reasonNote: string;
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
  /** แบบกลุ่ม — กลุ่มที่ของแถมจะถูกเลือกมาจาก ยังไม่เปิดใช้ ดู OPEN_PROMOTION_SCOPES */
  freeGroup: string;
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
  allowDraftPartner: boolean;

  /* ---------- กลุ่ม 4 · ข้อจำกัดและผลกระทบ ---------- */
  usePerCustomer: number | null;
  useTotal: number | null;
  stackWithPromo: boolean;
  stackWithCustomerDiscount: boolean;
  recordUsage: boolean;
  needsApproval: boolean;
  commissionBase: string;

  /* ---------- กลุ่ม 5 · งบประมาณและคลัง ---------- */
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
  freeGroup: "",
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
  useTotal: null,
  stackWithPromo: false,
  stackWithCustomerDiscount: false,
  recordUsage: true,
  needsApproval: true,
  commissionBase: "",

  budget: null,
  budgetBasis: "",
  budgetUsed: 0,
  budgetOver: "warn",
  budgetWarnAt: 80,
  freeGoodsWarehouse: "",

  tiers: [],
  discountTiers: [],
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

/** ราคาขั้นต่ำของสินค้าตัวหนึ่ง — null เมื่อไม่มีแถวในราคากลาง */
export function productFloor(code: string): number | null {
  /* รหัสเดียวชี้ได้หลายแถว — ห้าตัวซ้ำในราคากลาง จึงเลือกแถวที่ขายได้ก่อน
     แบบเดียวกับที่ priceApproval ทำ */
  const rows = priceMasterByProduct(code);
  const row = rows.find((r) => r.status === "OK") ?? rows[0];
  return row?.price_last ?? null;
}

export interface FloorBreach {
  code: string;
  name: string;
  tier: LadderTier;
  /** ราคาเฉลี่ยที่ขั้นนี้ทำให้เกิด */
  average: number;
  floor: number;
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

  const out: FloorBreach[] = [];
  for (const code of p.items) {
    const floor = productFloor(code);
    if (floor === null) continue;
    const unit = catalogPrice(code);
    if (!(unit > 0)) continue;
    const name = PRODUCTS.find((x) => x.code === code)?.name ?? code;

    for (const tier of p.tiers) {
      const average = tierAveragePrice(unit, tier);
      if (average < floor) out.push({ code, name, tier, average, floor });
    }
  }
  return out;
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
  "kind", "scope", "items", "freeItems", "freeGroup",
  "tiers", "discountTiers", "discountMode",
  "priceLists", "minOrder", "minOrderBasis",
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

  /* แบบกลุ่มยังไม่เปิด และปิดที่ทางเขียน ไม่ใช่ที่รายการตัวเลือก
     ตรวจว่า patch **ตั้ง** เป็นแบบนั้น ไม่ใช่ว่าแถวเดิมเป็นแบบนั้นอยู่แล้ว —
     ข้อมูลตัวอย่างมีโปรแบบกลุ่มค้างอยู่หนึ่งตัว และการแก้ชื่อของมันไม่ควร
     ถูกปฏิเสธเพราะเรื่องที่คนแก้ไม่ได้แตะ */
  if ("scope" in patch && !OPEN_PROMOTION_SCOPES.includes(patch.scope as PromotionScope)) {
    return {
      ok: false,
      reason:
        patch.scope === "group"
          ? "แบบกลุ่มยังใช้ไม่ได้ — ยังไม่ได้ตัดสินว่า \"ถูกที่สุด\" วัดจากราคาไหน (ราคาตั้ง · ราคาหลังหักส่วนลด · ต้นทุน)"
          : "ต้องเลือกรูปแบบว่านับยอดแบบไหน — รายตัว หรือ ชุดที่กำหนด",
    };
  }

  const touchedCondition = PROMOTION_CONDITION_FIELDS.some(
    (k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(p[k]),
  );

  Object.assign(p, patch);

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

  const row: PromotionRow = {
    ...blankPromotion(),
    code: nextPromotionCode(),
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
