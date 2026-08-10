/* eslint-disable */
/**
 * Product master. Shapes mirror the eventual API response so detail
 * panes will not change when the backend lands.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface Product {
  code: string;
  barcode: string;
  icon: string;
  name: string;
  nameTh: string;
  nameEn: string;
  cat: string;
  brand: string;
  series: string;
  unit: string;
  weight: string;
  dim: string;
  demoAllowed: boolean;
  price: number;
  stock: number;
  onHand: number;
  reserved: number;
  onOrder: number;
  lowLevel: number;
  status: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
  desc: string;
  supplier: string;
  expiry: string;
  pricing: {
    currency: string;
    retail: number;
    dealer: number;
    gov: number;
    lastCost: number;
    avgCost: number;
    vat: string;
    effective: string;
    contract: {
      name: string;
      price: number;
    } | null;
  };
  stocks: {
    wh: string;
    loc: string;
    avail: number;
    res: number;
    lot: string;
    exp: string;
  }[];
  /**
   * The buying terms, rendered. The truth is the `supplierItems` row on the
   * partner — see syncProductSupplyView.
   */
  sup: {
    code: string;
    itemCode: string;
    lead: string;
    moq: string;
    /**
     * The unit the supplier quotes in. Just the unit: the seed wrote
     * "Carton (24 Tube)" and buried the conversion factor inside the unit's
     * own NAME, where no arithmetic could reach it. The number moved to
     * `punitFactor`; this is the word again.
     */
    punit: string;
    /** Base units in one purchase unit. 1 when they quote in our base unit. */
    punitFactor: number;
    lastPrice: string;
    warranty: string;
    country: string;
  };
  altSuppliers: {
    name: string;
    code: string;
    lead: string;
    price: string;
  }[];
  reg: {
    no: string;
    status: string;
    issue: string;
    expiry: string;
    warranty: string;
    custWarranty: string;
    docs: {
      name: string;
      meta: string;
    }[];
  };
  history: {
    t: string;
    d: string;
    u: string;
    when: string;
    kind: string;
  }[];
  low?: boolean;

  /**
   * Present only on products materialised from the price list master, and
   * the record of everything that file knew and this shape has nowhere to
   * put. Absent on the prototype's own eight records.
   */
  priceRef?: {
    /** Row key in the price list master — the file's own address for it. */
    row: string;
    /** Sheet the row was read from. */
    sheet: string;
    /** OK | REVIEW | PENDING_COST | NO_PRICE, straight from the file. */
    priceStatus: string;
    /** The file had no product code; `code` carries the row key instead. */
    codePending: boolean;
    /** Other price rows using this same code. */
    conflicts: string[];
    /** Those rows name a different product — one code, two things. */
    conflictClash: boolean;
    /** Floor below which a quote needs approval. Never a sellable tier. */
    floor: number | null;
    gpPrivate: number | null;
    sellable: boolean;
  };
}

/**
 * What is left of the classification once the fields that repeated something
 * else were taken out.
 *
 * `ptype` said "Medical Consumable" where the category already said "Dental
 * Consumable" — two names for one fact, and the product form asked for both.
 * `origin` and `maker` belonged to the supplier, who is where a buyer looks
 * for them. `inv` / `buy` / `sell` were three toggles nothing outside the
 * form ever read.
 */
export interface ProductClassification {
  devClass: string;
  storage: string;
}

export type ProductDetailMap = Record<string, {
  cls: ProductClassification;
  units: {
    unit: string;
    type: string;
    /**
     * Base units in ONE of this unit. The base unit's own row is 1.
     *
     * This was `conv`, a free-text string, and it was written three
     * incompatible ways in this repo alone — "12 Tubes" in the seed,
     * "1 Box = 12 Tube" as the form's placeholder, `1 ${unit}` from the
     * generator. None of them could be multiplied by, so a sale of one Box
     * could not decrement the Tubes it contains and a Carton received could
     * not be counted into stock. The sentence a reader wants is built from
     * this number; the number is what the arithmetic uses.
     */
    factor: number;
    barcode: string;
    active: boolean;
  }[];
  rfid: boolean;
  priceLists: {
    name: string;
    price: number;
    cur: string;
    from: string;
    to: string;
    status: string;
  }[];
  tiers: ({
    min: number;
    max: number | null;
    price: number;
  })[];
  contracts: {
    cust: string;
    type: string;
    price: number;
    from: string;
    to: string;
    status: string;
  }[];
  backOrder: number;
  lotTracked: boolean;
  serialTracked: boolean;
  whRows: {
    wh: string;
    loc: string;
    onHand: number;
    res: number;
    onOrder: number;
    rop: number;
  }[];
  lots: {
    lot: string;
    exp: string;
    wh: string;
    loc: string;
    qty: number;
    status: string;
  }[];
  serials: unknown[];
  altSupRows: {
    name: string;
    code: string;
    punit: string;
    /** Base units in one of that supplier's purchase units. */
    punitFactor: number;
    moq: string;
    lead: string;
    price: number;
    status: string;
  }[];
  regRows: {
    type: string;
    no: string;
    issue: string;
    exp: string;
    status: string;
    doc: string;
  }[];
  warranty: {
    sup: string;
    cust: string;
    unit: string;
    startEvent: string;
  };
  docs: {
    name: string;
    type: string;
    size: string;
    by: string;
    date: string;
  }[];
  audit: {
    event: string;
    user: string;
    when: string;
    field: string;
    from: string;
    to: string;
    kind: string;
  }[];
}>;

export const PRODUCTS: Product[] = [
  {
    code: "AA-TH003-WL",
    barcode: "8851234000131",
    icon: "🧴",
    name: "A-FLEX PU40 (White)",
    nameTh: "เอ-เฟล็กซ์ พียู40 สีขาว",
    nameEn: "A-FLEX PU40 White",
    cat: "Sealant",
    brand: "A-FLEX",
    series: "PU40",
    unit: "Tube",
    weight: "48 g",
    dim: "22 × 22 × 128 mm",
    demoAllowed: false,
    price: 120,
    stock: 1100,
    onHand: 1250,
    reserved: 150,
    onOrder: 600,
    lowLevel: 200,
    status: "Active",
    created: "12/03/2024 09:41",
    updated: "08/07/2026 14:22",
    createdBy: "Pimpaka S.",
    updatedBy: "Pimpaka S.",
    desc: "วัสดุเคลือบร่องฟัน ชนิดหลอด ความหนืดต่ำ ใช้งานง่าย เหมาะกับงานฟันหน้าและฟันหลัง",
    supplier: "Supplier A Co., Ltd.",
    expiry: "31/12/2026",
    pricing: {
      currency: "THB",
      retail: 120,
      dealer: 104,
      gov: 112,
      lastCost: 68.5,
      avgCost: 71.2,
      vat: "VAT 7% (exclusive)",
      effective: "01/01/2026",
      contract: {
        name: "สัญญาจัดซื้อ รพ.ธรรมศาสตร์ 2569",
        price: 98,
      },
    },
    stocks: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "A-03-12",
        avail: 820,
        res: 100,
        lot: "LT2601",
        exp: "31/12/2027",
      },
      {
        wh: "WH-02 Bangkok",
        loc: "B-01-04",
        avail: 280,
        res: 50,
        lot: "LT2598",
        exp: "30/06/2027",
      },
      {
        wh: "WH-03 Service",
        loc: "S-02",
        avail: 0,
        res: 0,
        lot: "—",
        exp: "—",
      },
    ],
    sup: {
      code: "",
      itemCode: "AFX-PU40-WH",
      lead: "21 วัน",
      moq: "240 Tube",
      punit: "Carton",
      punitFactor: 24,
      lastPrice: "68.50 THB",
      warranty: "12 เดือน",
      country: "ประเทศไทย",
    },
    altSuppliers: [
      {
        name: "HDX WILL Co., Ltd.",
        code: "",
        lead: "35 วัน",
        price: "71.00",
      },
      {
        name: "Andaman Medical",
        code: "",
        lead: "28 วัน",
        price: "73.20",
      },
    ],
    reg: {
      no: "ผ.1234/2567",
      status: "Active",
      issue: "15/01/2024",
      expiry: "31/12/2026",
      warranty: "12 เดือน (ผู้ผลิต)",
      custWarranty: "6 เดือน (ลูกค้าปลายทาง)",
      docs: [
        {
          name: "ใบจดทะเบียน อย.pdf",
          meta: "PDF · 1.2 MB · อัปโหลด 15/01/2024",
        },
        {
          name: "Certificate of Analysis.pdf",
          meta: "PDF · 480 KB · อัปโหลด 02/02/2024",
        },
      ],
    },
    history: [
      {
        t: "Price updated",
        d: "ราคาขายมาตรฐาน 115.00 → 120.00 THB",
        u: "Pimpaka S.",
        when: "08/07/2026 14:22",
        kind: "primary",
      },
      {
        t: "Warehouse changed",
        d: "ย้ายตำแหน่งจัดเก็บ WH-01 A-02-08 → A-03-12",
        u: "Somchai B.",
        when: "21/05/2026 10:05",
        kind: "info",
      },
      {
        t: "Supplier changed",
        d: "เปลี่ยนซัพพลายเออร์หลักเป็น Supplier A Co., Ltd.",
        u: "Pimpaka S.",
        when: "03/02/2026 16:48",
        kind: "info",
      },
      {
        t: "Status changed",
        d: "Draft → Active",
        u: "Pimpaka S.",
        when: "20/03/2024 11:30",
        kind: "warn",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "12/03/2024 09:41",
        kind: "",
      },
    ],
  },
  {
    code: "AA-TH003-GR",
    barcode: "8851234000148",
    icon: "🧴",
    name: "A-FLEX PU40 (Grey)",
    nameTh: "เอ-เฟล็กซ์ พียู40 สีเทา",
    nameEn: "A-FLEX PU40 Grey",
    cat: "Sealant",
    brand: "A-FLEX",
    series: "PU40",
    unit: "Tube",
    weight: "48 g",
    dim: "22 × 22 × 128 mm",
    demoAllowed: false,
    price: 120,
    stock: 760,
    onHand: 820,
    reserved: 60,
    onOrder: 240,
    lowLevel: 200,
    status: "Active",
    created: "12/03/2024 09:44",
    updated: "08/07/2026 14:22",
    createdBy: "Pimpaka S.",
    updatedBy: "Pimpaka S.",
    desc: "วัสดุเคลือบร่องฟัน สีเทา สำหรับงานฟันหลัง มองเห็นขอบวัสดุชัดเจนขณะตรวจ",
    supplier: "Supplier A Co., Ltd.",
    expiry: "31/12/2026",
    pricing: {
      currency: "THB",
      retail: 120,
      dealer: 104,
      gov: 112,
      lastCost: 68.5,
      avgCost: 70.8,
      vat: "VAT 7% (exclusive)",
      effective: "01/01/2026",
      contract: null,
    },
    stocks: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "A-03-13",
        avail: 600,
        res: 40,
        lot: "LT2601",
        exp: "31/12/2027",
      },
      {
        wh: "WH-02 Bangkok",
        loc: "B-01-05",
        avail: 160,
        res: 20,
        lot: "LT2598",
        exp: "30/06/2027",
      },
    ],
    sup: {
      code: "",
      itemCode: "AFX-PU40-GR",
      lead: "21 วัน",
      moq: "240 Tube",
      punit: "Carton",
      punitFactor: 24,
      lastPrice: "68.50 THB",
      warranty: "12 เดือน",
      country: "ประเทศไทย",
    },
    altSuppliers: [
      {
        name: "HDX WILL Co., Ltd.",
        code: "",
        lead: "35 วัน",
        price: "71.00",
      },
    ],
    reg: {
      no: "ผ.1234/2567",
      status: "Active",
      issue: "15/01/2024",
      expiry: "31/12/2026",
      warranty: "12 เดือน (ผู้ผลิต)",
      custWarranty: "6 เดือน (ลูกค้าปลายทาง)",
      docs: [
        {
          name: "ใบจดทะเบียน อย.pdf",
          meta: "PDF · 1.2 MB · อัปโหลด 15/01/2024",
        },
      ],
    },
    history: [
      {
        t: "Price updated",
        d: "ราคาขายมาตรฐาน 115.00 → 120.00 THB",
        u: "Pimpaka S.",
        when: "08/07/2026 14:22",
        kind: "primary",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "12/03/2024 09:44",
        kind: "",
      },
    ],
  },
  {
    code: "AA-TH004-BK",
    barcode: "8851234000155",
    icon: "🧴",
    name: "A-FLEX PU50 (Black)",
    nameTh: "เอ-เฟล็กซ์ พียู50 สีดำ",
    nameEn: "A-FLEX PU50 Black",
    cat: "Sealant",
    brand: "A-FLEX",
    series: "PU50",
    unit: "Tube",
    weight: "52 g",
    dim: "22 × 22 × 128 mm",
    demoAllowed: true,
    price: 150,
    stock: 320,
    onHand: 400,
    reserved: 80,
    onOrder: 0,
    lowLevel: 150,
    status: "Draft",
    created: "02/06/2026 13:15",
    updated: "19/07/2026 09:02",
    createdBy: "Somchai B.",
    updatedBy: "Pimpaka S.",
    desc: "สูตรความหนืดสูง อยู่ระหว่างขึ้นทะเบียน อย. ยังไม่เปิดขาย",
    supplier: "Supplier A Co., Ltd.",
    expiry: "30/06/2027",
    pricing: {
      currency: "THB",
      retail: 150,
      dealer: 130,
      gov: 140,
      lastCost: 88,
      avgCost: 88,
      vat: "VAT 7% (exclusive)",
      effective: "—",
      contract: null,
    },
    stocks: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "A-04-01",
        avail: 320,
        res: 80,
        lot: "LT2610",
        exp: "30/06/2028",
      },
    ],
    sup: {
      code: "",
      itemCode: "AFX-PU50-BK",
      lead: "21 วัน",
      moq: "120 Tube",
      punit: "Carton",
      punitFactor: 24,
      lastPrice: "88.00 THB",
      warranty: "12 เดือน",
      country: "ประเทศไทย",
    },
    altSuppliers: [],
    reg: {
      no: "อยู่ระหว่างยื่นคำขอ",
      status: "Pending",
      issue: "—",
      expiry: "—",
      warranty: "12 เดือน (ผู้ผลิต)",
      custWarranty: "—",
      docs: [],
    },
    history: [
      {
        t: "Status changed",
        d: "ยังคงสถานะ Draft รอผลการขึ้นทะเบียน",
        u: "Pimpaka S.",
        when: "19/07/2026 09:02",
        kind: "warn",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "02/06/2026 13:15",
        kind: "",
      },
    ],
  },
  {
    code: "AB-AC001",
    barcode: "8851234000162",
    icon: "🧪",
    name: "A-ACRYLIC 100% (White)",
    nameTh: "เอ-อะคริลิก 100% สีขาว",
    nameEn: "A-ACRYLIC 100% White",
    cat: "Acrylic",
    brand: "A-ACRYLIC",
    series: "AC100",
    unit: "Tube",
    weight: "60 g",
    dim: "25 × 25 × 130 mm",
    demoAllowed: false,
    low: true,
    price: 95,
    stock: 280,
    onHand: 280,
    reserved: 0,
    onOrder: 0,
    lowLevel: 400,
    status: "Active",
    created: "05/08/2024 15:20",
    updated: "12/06/2026 11:10",
    createdBy: "Somchai B.",
    updatedBy: "System",
    desc: "อะคริลิกสำหรับงานฟันปลอม เซ็ตตัวเร็ว ใช้กับงานซ่อมฐานฟันปลอมทั่วไป",
    supplier: "HDX WILL",
    expiry: "15/09/2026",
    pricing: {
      currency: "THB",
      retail: 95,
      dealer: 82,
      gov: 90,
      lastCost: 54,
      avgCost: 55.4,
      vat: "VAT 7% (exclusive)",
      effective: "01/04/2026",
      contract: null,
    },
    stocks: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "C-01-06",
        avail: 280,
        res: 0,
        lot: "LT2588",
        exp: "15/09/2026",
      },
    ],
    sup: {
      code: "",
      itemCode: "HDX-AC100-W",
      lead: "35 วัน",
      moq: "200 Tube",
      punit: "Carton",
      punitFactor: 20,
      lastPrice: "54.00 THB",
      warranty: "6 เดือน",
      country: "เกาหลีใต้",
    },
    altSuppliers: [
      {
        name: "Andaman Medical",
        code: "",
        lead: "28 วัน",
        price: "56.80",
      },
    ],
    reg: {
      no: "ผ.5678/2566",
      status: "Expiring",
      issue: "15/09/2023",
      expiry: "15/09/2026",
      warranty: "6 เดือน (ผู้ผลิต)",
      custWarranty: "3 เดือน (ลูกค้าปลายทาง)",
      docs: [
        {
          name: "ใบจดทะเบียน อย.pdf",
          meta: "PDF · 980 KB · อัปโหลด 15/09/2023",
        },
      ],
    },
    history: [
      {
        t: "Stock level warning",
        d: "สต็อกคงเหลือต่ำกว่าจุดสั่งซื้อ (400 Tube)",
        u: "System",
        when: "12/06/2026 11:10",
        kind: "warn",
      },
      {
        t: "Price updated",
        d: "ราคาขายมาตรฐาน 90.00 → 95.00 THB",
        u: "Pimpaka S.",
        when: "01/04/2026 08:30",
        kind: "primary",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "05/08/2024 15:20",
        kind: "",
      },
    ],
  },
  {
    code: "AT-SL001",
    barcode: "8851234000179",
    icon: "🧫",
    name: "A-SILICONE 300 (Clear)",
    nameTh: "เอ-ซิลิโคน 300 ชนิดใส",
    nameEn: "A-SILICONE 300 Clear",
    cat: "Silicone",
    brand: "A-SILICONE",
    series: "SL300",
    unit: "Tube",
    weight: "300 g",
    dim: "55 × 55 × 165 mm",
    demoAllowed: false,
    price: 110,
    stock: 180,
    onHand: 210,
    reserved: 30,
    onOrder: 0,
    lowLevel: 100,
    status: "Inactive",
    created: "18/11/2023 10:00",
    updated: "01/03/2026 17:45",
    createdBy: "Pimpaka S.",
    updatedBy: "Pimpaka S.",
    desc: "ซิลิโคนพิมพ์ปาก ชนิดใส เลิกจำหน่ายแล้ว เหลือสต็อกระบายเท่านั้น",
    supplier: "Andaman Medical",
    expiry: "01/03/2026",
    pricing: {
      currency: "THB",
      retail: 110,
      dealer: 96,
      gov: 105,
      lastCost: 62,
      avgCost: 63.5,
      vat: "VAT 7% (exclusive)",
      effective: "01/01/2025",
      contract: null,
    },
    stocks: [
      {
        wh: "WH-02 Bangkok",
        loc: "B-03-11",
        avail: 180,
        res: 30,
        lot: "LT2455",
        exp: "01/03/2026",
      },
    ],
    sup: {
      code: "",
      itemCode: "AND-SL300-CL",
      lead: "28 วัน",
      moq: "50 Tube",
      punit: "Box",
      punitFactor: 10,
      lastPrice: "62.00 THB",
      warranty: "6 เดือน",
      country: "มาเลเซีย",
    },
    altSuppliers: [],
    reg: {
      no: "ผ.9012/2565",
      status: "Expired",
      issue: "01/03/2022",
      expiry: "01/03/2026",
      warranty: "—",
      custWarranty: "—",
      docs: [],
    },
    history: [
      {
        t: "Status changed",
        d: "Active → Inactive (ทะเบียนหมดอายุ)",
        u: "Pimpaka S.",
        when: "01/03/2026 17:45",
        kind: "warn",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "18/11/2023 10:00",
        kind: "",
      },
    ],
  },
  {
    code: "AT-GL001",
    barcode: "8851234000186",
    icon: "🧤",
    name: "A-GLOVE (Latex)",
    nameTh: "ถุงมือยาง เอ-โกลฟ",
    nameEn: "A-GLOVE Latex",
    cat: "Accessory",
    brand: "A-FACTORY",
    series: "GL-L",
    unit: "Box",
    weight: "620 g",
    dim: "240 × 120 × 65 mm",
    demoAllowed: false,
    price: 250,
    stock: 500,
    onHand: 560,
    reserved: 60,
    onOrder: 1200,
    lowLevel: 200,
    status: "Active",
    created: "09/01/2024 08:15",
    updated: "15/07/2026 16:00",
    createdBy: "Somchai B.",
    updatedBy: "Pimpaka S.",
    desc: "ถุงมือยางธรรมชาติ แบบมีแป้ง บรรจุ 100 ชิ้น/กล่อง ขนาด M",
    supplier: "Supplier A Co., Ltd.",
    expiry: "—",
    pricing: {
      currency: "THB",
      retail: 250,
      dealer: 215,
      gov: 235,
      lastCost: 148,
      avgCost: 151.5,
      vat: "VAT 7% (exclusive)",
      effective: "01/07/2026",
      contract: {
        name: "สัญญาราคากลาง กรมอนามัย 2569",
        price: 228,
      },
    },
    stocks: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "D-01-02",
        avail: 380,
        res: 40,
        lot: "LT2612",
        exp: "—",
      },
      {
        wh: "WH-02 Bangkok",
        loc: "B-04-09",
        avail: 120,
        res: 20,
        lot: "LT2612",
        exp: "—",
      },
    ],
    sup: {
      code: "",
      itemCode: "AF-GLV-LTX-M",
      lead: "14 วัน",
      moq: "100 Box",
      punit: "Carton",
      punitFactor: 10,
      lastPrice: "148.00 THB",
      warranty: "—",
      country: "ประเทศไทย",
    },
    altSuppliers: [
      {
        name: "HDX WILL Co., Ltd.",
        code: "",
        lead: "30 วัน",
        price: "152.00",
      },
    ],
    reg: {
      no: "ผ.3344/2566",
      status: "Active",
      issue: "10/01/2023",
      expiry: "10/01/2028",
      warranty: "—",
      custWarranty: "—",
      docs: [
        {
          name: "ใบจดทะเบียน อย.pdf",
          meta: "PDF · 1.1 MB · อัปโหลด 10/01/2023",
        },
      ],
    },
    history: [
      {
        t: "Price updated",
        d: "ราคาขายมาตรฐาน 240.00 → 250.00 THB",
        u: "Pimpaka S.",
        when: "15/07/2026 16:00",
        kind: "primary",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "09/01/2024 08:15",
        kind: "",
      },
    ],
  },
  {
    code: "AT-MD001",
    barcode: "8851234000193",
    icon: "😷",
    name: "A-MEDICAL MASK",
    nameTh: "หน้ากากอนามัย เอ-แฟคทอรี่",
    nameEn: "A-MEDICAL MASK 3-Ply",
    cat: "Accessory",
    brand: "A-FACTORY",
    series: "MD-3P",
    unit: "Box",
    weight: "320 g",
    dim: "195 × 100 × 95 mm",
    demoAllowed: false,
    price: 150,
    stock: 1200,
    onHand: 1200,
    reserved: 0,
    onOrder: 0,
    lowLevel: 300,
    status: "Active",
    created: "09/01/2024 08:20",
    updated: "02/05/2026 10:30",
    createdBy: "Somchai B.",
    updatedBy: "Pimpaka S.",
    desc: "หน้ากากอนามัย 3 ชั้น บรรจุ 50 ชิ้น/กล่อง มาตรฐาน มอก.",
    supplier: "Supplier A Co., Ltd.",
    expiry: "—",
    pricing: {
      currency: "THB",
      retail: 150,
      dealer: 128,
      gov: 142,
      lastCost: 86,
      avgCost: 87.4,
      vat: "VAT 7% (exclusive)",
      effective: "01/05/2026",
      contract: null,
    },
    stocks: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "D-02-05",
        avail: 1200,
        res: 0,
        lot: "LT2615",
        exp: "—",
      },
    ],
    sup: {
      code: "",
      itemCode: "AF-MSK-3P",
      lead: "14 วัน",
      moq: "200 Box",
      punit: "Carton",
      punitFactor: 20,
      lastPrice: "86.00 THB",
      warranty: "—",
      country: "ประเทศไทย",
    },
    altSuppliers: [],
    reg: {
      no: "ผ.3345/2566",
      status: "Active",
      issue: "10/01/2023",
      expiry: "10/01/2028",
      warranty: "—",
      custWarranty: "—",
      docs: [
        {
          name: "ใบรับรอง มอก..pdf",
          meta: "PDF · 720 KB · อัปโหลด 10/01/2023",
        },
      ],
    },
    history: [
      {
        t: "Price updated",
        d: "ราคาขายมาตรฐาน 145.00 → 150.00 THB",
        u: "Pimpaka S.",
        when: "02/05/2026 10:30",
        kind: "primary",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "09/01/2024 08:20",
        kind: "",
      },
    ],
  },
  {
    code: "AT-BR002",
    barcode: "8851234000209",
    icon: "🦷",
    name: "A-BUR Diamond Set",
    nameTh: "ชุดหัวกรอเพชร เอ-เบอร์",
    nameEn: "A-BUR Diamond Set 12pcs",
    cat: "Accessory",
    brand: "A-FACTORY",
    series: "BR-D12",
    unit: "Set",
    weight: "95 g",
    dim: "120 × 80 × 20 mm",
    demoAllowed: false,
    low: true,
    price: 890,
    stock: 64,
    onHand: 64,
    reserved: 0,
    onOrder: 120,
    lowLevel: 80,
    status: "Active",
    created: "22/02/2025 14:00",
    updated: "30/06/2026 09:15",
    createdBy: "Pimpaka S.",
    updatedBy: "System",
    desc: "ชุดหัวกรอเพชร 12 ชิ้น สำหรับงานทั่วไป ก้าน FG มาตรฐาน",
    supplier: "DGSHAPE",
    expiry: "—",
    pricing: {
      currency: "THB",
      retail: 890,
      dealer: 760,
      gov: 840,
      lastCost: 512,
      avgCost: 520,
      vat: "VAT 7% (exclusive)",
      effective: "01/06/2026",
      contract: null,
    },
    stocks: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "E-01-03",
        avail: 64,
        res: 0,
        lot: "LT2607",
        exp: "—",
      },
    ],
    sup: {
      code: "",
      itemCode: "DGS-BRD12",
      lead: "45 วัน",
      moq: "50 Set",
      punit: "Box",
      punitFactor: 10,
      lastPrice: "512.00 THB",
      warranty: "6 เดือน",
      country: "ญี่ปุ่น",
    },
    altSuppliers: [
      {
        name: "Andaman Medical",
        code: "",
        lead: "40 วัน",
        price: "528.00",
      },
    ],
    reg: {
      no: "ผ.7788/2567",
      status: "Active",
      issue: "20/02/2024",
      expiry: "20/02/2027",
      warranty: "6 เดือน (ผู้ผลิต)",
      custWarranty: "3 เดือน (ลูกค้าปลายทาง)",
      docs: [
        {
          name: "ใบจดทะเบียน อย.pdf",
          meta: "PDF · 840 KB · อัปโหลด 20/02/2024",
        },
      ],
    },
    history: [
      {
        t: "Stock level warning",
        d: "สต็อกคงเหลือต่ำกว่าจุดสั่งซื้อ (80 Set)",
        u: "System",
        when: "30/06/2026 09:15",
        kind: "warn",
      },
      {
        t: "Product created",
        d: "สร้างสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "22/02/2025 14:00",
        kind: "",
      },
    ],
  },
];

export const DEFAULT_CLASS: ProductClassification = {
  devClass: "Class II",
  storage: "อุณหภูมิห้อง (15–30°C)",
};

export const DETAIL: ProductDetailMap = {
  "AA-TH003-WL": {
    cls: {
      devClass: "Class II",
      storage: "อุณหภูมิห้อง (15–30°C)",
    },
    units: [
      {
        unit: "Tube",
        type: "Base Unit",
        factor: 1,
        barcode: "8850000001003",
        active: true,
      },
      {
        unit: "Box",
        type: "Sales Unit",
        factor: 12,
        barcode: "8850000001010",
        active: true,
      },
      {
        unit: "Carton",
        type: "Purchase Unit",
        factor: 120,
        barcode: "8850000001027",
        active: true,
      },
    ],
    rfid: false,
    priceLists: [
      {
        name: "Standard 2569",
        price: 120,
        cur: "THB",
        from: "01/01/2026",
        to: "31/12/2026",
        status: "Active",
      },
      {
        name: "Dealer Tier A",
        price: 104,
        cur: "THB",
        from: "01/01/2026",
        to: "31/12/2026",
        status: "Active",
      },
      {
        name: "Government",
        price: 112,
        cur: "THB",
        from: "01/01/2026",
        to: "31/12/2026",
        status: "Active",
      },
      {
        name: "Standard 2568",
        price: 115,
        cur: "THB",
        from: "01/01/2025",
        to: "31/12/2025",
        status: "Expired",
      },
    ],
    tiers: [
      {
        min: 1,
        max: 11,
        price: 120,
      },
      {
        min: 12,
        max: 119,
        price: 112,
      },
      {
        min: 120,
        max: null,
        price: 104,
      },
    ],
    contracts: [
      {
        cust: "มหาวิทยาลัยธรรมศาสตร์",
        type: "Contract",
        price: 98,
        from: "01/01/2026",
        to: "31/12/2026",
        status: "Active",
      },
      {
        cust: "รพ.สมุทรปราการ",
        type: "Exception",
        price: 105,
        from: "01/03/2026",
        to: "28/02/2027",
        status: "Active",
      },
    ],
    backOrder: 0,
    lotTracked: true,
    serialTracked: false,
    whRows: [
      {
        wh: "WH-01 Samut Prakan",
        loc: "A-03-12",
        onHand: 950,
        res: 130,
        onOrder: 600,
        rop: 200,
      },
      {
        wh: "WH-02 Bangkok",
        loc: "B-01-04",
        onHand: 300,
        res: 20,
        onOrder: 0,
        rop: 100,
      },
      {
        wh: "WH-03 Service",
        loc: "S-02",
        onHand: 0,
        res: 0,
        onOrder: 0,
        rop: 0,
      },
    ],
    lots: [
      {
        lot: "LT2601",
        exp: "31/12/2027",
        wh: "WH-01 Samut Prakan",
        loc: "A-03-12",
        qty: 820,
        status: "Normal",
      },
      {
        lot: "LT2598",
        exp: "30/06/2027",
        wh: "WH-02 Bangkok",
        loc: "B-01-04",
        qty: 280,
        status: "Normal",
      },
      {
        lot: "LT2555",
        exp: "30/09/2026",
        wh: "WH-01 Samut Prakan",
        loc: "A-03-13",
        qty: 150,
        status: "Near Expiry",
      },
    ],
    serials: [],
    altSupRows: [
      {
        name: "HDX WILL Co., Ltd.",
        code: "",
        punit: "Carton",
        punitFactor: 24,
        moq: "240 Tube",
        lead: "35 วัน",
        price: 71,
        status: "Active",
      },
      {
        name: "Andaman Medical",
        code: "",
        punit: "Box",
        punitFactor: 10,
        moq: "100 Tube",
        lead: "28 วัน",
        price: 73.2,
        status: "Active",
      },
    ],
    regRows: [
      {
        type: "Thai FDA",
        no: "ผ.1234/2567",
        issue: "15/01/2024",
        exp: "31/12/2026",
        status: "Active",
        doc: "ใบจดทะเบียน อย.pdf",
      },
      {
        type: "ISO 13485",
        no: "ISO-2024-8891",
        issue: "02/02/2024",
        exp: "02/02/2027",
        status: "Active",
        doc: "ISO Certificate.pdf",
      },
    ],
    warranty: {
      sup: "12",
      cust: "6",
      unit: "เดือน",
      startEvent: "Delivery Date",
    },
    docs: [
      {
        name: "A-FLEX PU40 White.jpg",
        type: "Product Image",
        size: "820 KB",
        by: "Pimpaka S.",
        date: "15/05/2024",
      },
      {
        name: "A-FLEX Catalogue 2026.pdf",
        type: "Product Catalogue",
        size: "4.2 MB",
        by: "Pimpaka S.",
        date: "10/01/2026",
      },
      {
        name: "PU40 Datasheet.pdf",
        type: "Datasheet",
        size: "1.1 MB",
        by: "Somchai B.",
        date: "12/03/2024",
      },
      {
        name: "ใบจดทะเบียน อย.pdf",
        type: "Thai FDA Certificate",
        size: "1.2 MB",
        by: "Pimpaka S.",
        date: "15/01/2024",
      },
      {
        name: "Warranty Terms.pdf",
        type: "Warranty Document",
        size: "340 KB",
        by: "Somchai B.",
        date: "15/01/2024",
      },
    ],
    audit: [
      {
        event: "Price Updated",
        user: "Pimpaka S.",
        when: "08/07/2026 14:22",
        field: "Standard Selling Price",
        from: "115.00 THB",
        to: "120.00 THB",
        kind: "primary",
      },
      {
        event: "Warehouse Assignment Changed",
        user: "Somchai B.",
        when: "21/05/2026 10:05",
        field: "Storage Location (WH-01)",
        from: "A-02-08",
        to: "A-03-12",
        kind: "info",
      },
      {
        event: "Registration Updated",
        user: "Pimpaka S.",
        when: "12/02/2026 09:20",
        field: "FDA Expiry Date",
        from: "31/12/2025",
        to: "31/12/2026",
        kind: "info",
      },
      {
        event: "Supplier Changed",
        user: "Pimpaka S.",
        when: "03/02/2026 16:48",
        field: "Main Supplier",
        from: "HDX WILL Co., Ltd.",
        to: "Supplier A Co., Ltd.",
        kind: "info",
      },
      {
        event: "Product Name Updated",
        user: "Somchai B.",
        when: "18/09/2024 11:02",
        field: "Product Name EN",
        from: "A-FLEX PU40",
        to: "A-FLEX PU40 White",
        kind: "",
      },
      {
        event: "Status Changed",
        user: "Pimpaka S.",
        when: "20/03/2024 11:30",
        field: "Status",
        from: "Draft",
        to: "Active",
        kind: "warn",
      },
      {
        event: "Product Created",
        user: "Pimpaka S.",
        when: "12/03/2024 09:41",
        field: "—",
        from: "—",
        to: "AA-TH003-WL",
        kind: "",
      },
    ],
  },
};
