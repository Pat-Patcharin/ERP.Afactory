import type { PromotionRow } from "@/lib/domain/promotion";

/* ============================================================
   ข้อมูลตัวอย่างโปรโมชั่น

   `import type` ข้างบนเป็นชนิดล้วน ๆ ถูกลบตอนคอมไพล์ ไฟล์นี้จึงไม่มี
   สายวิ่งกลับไปหา domain ตอนรันจริง — domain อ่านไฟล์นี้ทางเดียว
   แบบเดียวกับที่ pricing.ts อ่าน data/price-lists.ts

   ห้าแถวเลือกให้ครบทั้งห้าสถานะ และให้กฎที่เขียนไว้ **กัดได้จริงบนหน้าจอ**
   ไม่ใช่กัดเฉพาะในเทสต์ที่ประกอบระเบียนขึ้นมาเอง — บทเรียนจาก BACKLOG N-3
   ที่กฎคู่ค้าสถานะ Draft เขียวในเทสต์แต่ไม่เคยปฏิเสธใครในแอป

   PM-0002 จึงมีขั้นที่ทำให้ราคาเฉลี่ยหลุด price_last ของจริง และ PM-0005
   ถูกหยุดไว้พร้อมธงว่าเงื่อนไขถูกแก้แล้ว เพื่อให้ปุ่มเปิดกลับปฏิเสธได้จริง
   ============================================================ */

export const PROMOTIONS: PromotionRow[] = [
  {
    code: "PM-0001",
    name: "Diamond Bur ซื้อ 3 แถม 1 — ไตรมาส 3",
    printName: "ซื้อ 3 แถม 1",
    kind: "free-goods",
    status: "Active",
    from: "01/07/2026",
    to: "30/09/2026",
    priority: 5,
    reason: "ดันยอดสิ้นไตรมาส",
    reasonNote: "",
    owner: "พิมพกา สุขใจ",

    scope: "item",
    items: ["D-AD001-01"],
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
    commissionBase: "ยอดขายหลังหักมูลค่าของแถม",

    budget: 80_000,
    budgetBasis: "cost",
    budgetUsed: 41_200,
    budgetOver: "warn",
    budgetWarnAt: 80,
    freeGoodsWarehouse: "WH-MAIN",

    tiers: [
      { buy: 3, free: 1 },
      { buy: 10, free: 4 },
      { buy: 30, free: 15 },
    ],

    created: "24/06/2026",
    createdBy: "พิมพกา สุขใจ",
    approvedBy: "สมชาย ใจดี",
    approvedAt: "26/06/2026",
    pausedReason: "",
    pausedBy: "",
    pausedAt: "",
    dirtySinceApproval: false,
  },

  {
    /* รออนุมัติ และแถมหนักจนราคาเฉลี่ยหลุดราคาขั้นต่ำ — โปรตัวที่ทำให้
       ปุ่มอนุมัติของแอดมินถูกปฏิเสธจริงบนหน้าจอ ไม่ใช่แค่ในเทสต์ */
    code: "PM-0002",
    name: "ล้างสต๊อกเรซิน ซื้อ 2 แถม 3",
    printName: "ซื้อ 2 แถม 3",
    kind: "free-goods",
    status: "Pending Approval",
    from: "01/09/2026",
    to: "31/10/2026",
    priority: 3,
    reason: "ล้างสต๊อกใกล้หมดอายุ",
    reasonNote: "",
    owner: "สมชาย ใจดี",

    scope: "item",
    items: ["H-AD001-01"],
    priceLists: [],
    minOrder: null,
    minOrderBasis: "ยอดก่อนภาษี",
    nearExpiryOnly: true,
    nearExpiryDays: 90,

    customerGroups: [],
    customers: [],
    areas: [],
    channels: [],
    allowDraftPartner: false,

    usePerCustomer: 2,
    useTotal: null,
    stackWithPromo: false,
    stackWithCustomerDiscount: false,
    recordUsage: true,
    needsApproval: true,
    commissionBase: "ไม่จ่ายค่าคอมสำหรับใบที่ใช้โปรนี้",

    budget: 250_000,
    budgetBasis: "price",
    budgetUsed: 0,
    budgetOver: "stop",
    budgetWarnAt: 80,
    freeGoodsWarehouse: "WH-MAIN",

    tiers: [{ buy: 2, free: 3 }],

    created: "12/08/2026",
    createdBy: "สมชาย ใจดี",
    approvedBy: "",
    approvedAt: "",
    pausedReason: "",
    pausedBy: "",
    pausedAt: "",
    dirtySinceApproval: false,
  },

  {
    code: "PM-0003",
    name: "ชุดเปิดคลินิกใหม่ — ยังตั้งไม่เสร็จ",
    printName: "",
    kind: "free-goods",
    status: "Draft",
    from: "01/10/2026",
    to: "",
    priority: 5,
    reason: "",
    reasonNote: "",
    owner: "พิมพกา สุขใจ",

    scope: "group",
    items: [],
    priceLists: [],
    minOrder: 20_000,
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
    /* สามช่องที่ §6b บังคับและไม่มีค่าเริ่มต้น ยังว่างอยู่ —
       ระเบียนนี้จึงยังส่งขออนุมัติไม่ได้ */
    commissionBase: "",

    budget: null,
    budgetBasis: "",
    budgetUsed: 0,
    budgetOver: "warn",
    budgetWarnAt: 80,
    freeGoodsWarehouse: "",

    tiers: [],

    created: "15/08/2026",
    createdBy: "พิมพกา สุขใจ",
    approvedBy: "",
    approvedAt: "",
    pausedReason: "",
    pausedBy: "",
    pausedAt: "",
    dirtySinceApproval: false,
  },

  {
    code: "PM-0004",
    name: "หัวขัดฟัน ซื้อ 10 แถม 2 — หมดรอบแล้ว",
    printName: "ซื้อ 10 แถม 2",
    kind: "free-goods",
    status: "Ended",
    from: "01/04/2026",
    to: "30/06/2026",
    priority: 5,
    reason: "แข่งกับคู่แข่ง",
    reasonNote: "",
    owner: "สมชาย ใจดี",

    scope: "item",
    items: ["D-AD004-01"],
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
    commissionBase: "ยอดขายหลังหักมูลค่าของแถม",

    budget: 60_000,
    budgetBasis: "cost",
    budgetUsed: 58_900,
    budgetOver: "stop",
    budgetWarnAt: 80,
    freeGoodsWarehouse: "WH-MAIN",

    tiers: [{ buy: 10, free: 2 }],

    created: "20/03/2026",
    createdBy: "สมชาย ใจดี",
    approvedBy: "วิชัย เจริญ",
    approvedAt: "25/03/2026",
    pausedReason: "",
    pausedBy: "",
    pausedAt: "",
    dirtySinceApproval: false,
  },

  {
    /* หยุดไว้ และเงื่อนไขถูกแก้ระหว่างหยุด — ปุ่มเปิดกลับต้องปฏิเสธ
       แล้วส่งไปเข้าคิวอนุมัติใหม่ ตาม §6g */
    code: "PM-0005",
    name: "โปรตัวแทนจำหน่าย ซื้อ 12 แถม 5",
    printName: "ซื้อ 12 แถม 5",
    kind: "free-goods",
    status: "Paused",
    from: "01/08/2026",
    to: "31/12/2026",
    priority: 4,
    reason: "รักษาลูกค้ารายใหญ่",
    reasonNote: "",
    owner: "สมชาย ใจดี",

    scope: "item",
    items: ["H-AD002-01"],
    priceLists: ["PL-DEALER-2026"],
    minOrder: null,
    minOrderBasis: "ยอดก่อนภาษี",
    nearExpiryOnly: false,
    nearExpiryDays: null,

    customerGroups: ["Dealer"],
    customers: [],
    areas: [],
    channels: [],
    allowDraftPartner: false,

    usePerCustomer: null,
    useTotal: 40,
    stackWithPromo: false,
    stackWithCustomerDiscount: false,
    recordUsage: true,
    needsApproval: true,
    commissionBase: "ยอดขายหลังหักมูลค่าของแถม",

    budget: 150_000,
    budgetBasis: "cost",
    budgetUsed: 96_400,
    budgetOver: "warn",
    budgetWarnAt: 80,
    freeGoodsWarehouse: "WH-PROMO",

    tiers: [{ buy: 12, free: 5 }],

    created: "22/07/2026",
    createdBy: "สมชาย ใจดี",
    approvedBy: "วิชัย เจริญ",
    approvedAt: "28/07/2026",
    pausedReason: "ตัวแทนแจ้งว่าของแถมไปชนกับโปรของผู้ผลิต ขอพักตรวจสอบก่อน",
    pausedBy: "วิชัย เจริญ",
    pausedAt: "10/08/2026",
    dirtySinceApproval: true,
  },

  {
    /* คู่เทียบของ PM-0002 — รออนุมัติเหมือนกัน แต่ราคาเฉลี่ยยังไม่หลุด
       และงบไม่เกินเพดาน แอดมินฝ่ายขายจึงอนุมัติตัวนี้ได้ ส่วน PM-0002
       อนุมัติไม่ได้ สองแถวนี้ทำให้ระดับอนุมัติสองชั้นเห็นได้จากหน้ารายการ
       โดยไม่ต้องอ่านโค้ด */
    code: "PM-0006",
    name: "หัวขัด ซื้อ 10 แถม 2 — รอบใหม่",
    printName: "ซื้อ 10 แถม 2",
    kind: "free-goods",
    status: "Pending Approval",
    from: "01/09/2026",
    to: "31/12/2026",
    priority: 5,
    reason: "แข่งกับคู่แข่ง",
    reasonNote: "",
    owner: "สมชาย ใจดี",

    scope: "item",
    items: ["D-AD004-01"],
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
    commissionBase: "ยอดขายหลังหักมูลค่าของแถม",

    budget: 50_000,
    budgetBasis: "cost",
    budgetUsed: 0,
    budgetOver: "warn",
    budgetWarnAt: 80,
    freeGoodsWarehouse: "WH-MAIN",

    tiers: [{ buy: 10, free: 2 }],

    created: "14/08/2026",
    createdBy: "สมชาย ใจดี",
    approvedBy: "",
    approvedAt: "",
    pausedReason: "",
    pausedBy: "",
    pausedAt: "",
    dirtySinceApproval: false,
  },
];
