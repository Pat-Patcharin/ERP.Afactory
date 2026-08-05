/* eslint-disable */
/**
 * Business Partner master. One legal entity = one record; roles are flags
 * on that record, never separate Customer/Supplier rows.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface BpRoleDef {
  key: string;
  label: string;
  badge: string;
  desc: string;
}

/* ============================================================
   BP MASTER SCHEMA — the A-Factory extension.

   Everything added here is OPTIONAL on the record. The seven
   seeded partners predate it, so lib/domain/partner.ts fills the
   gaps on load instead: an address with no billing flag is still
   a billing address if it is the only one, a customer with no
   profile still has a credit limit under `sales`. Making these
   required would have meant rewriting the dataset, and a schema
   that cannot read yesterday's record is not an upgrade.
   ============================================================ */

/** One image in the partner gallery. The prototype stores an emoji where a
 *  real deployment stores a URL — the shape is what matters here. */
export interface BpImage {
  id: string;
  name: string;
  /** Stand-in for the binary: emoji in the prototype, URL in production. */
  src: string;
  kind: string;
  by: string;
  date: string;
  cover: boolean;
  remark: string;
}

/** Customer-side profile. Present when the partner has the Customer role. */
export interface BpCustomerProfile {
  /** Government | Private */
  custType: string;
  /** Clinic | Hospital | University | Company | Factory | Dealer | Individual */
  bizType: string;
  /** 0% … 25% | Custom */
  benefit: string;
  /** The number behind `benefit`; carries the figure when benefit is Custom. */
  benefitPct: number;
  /** S | M | L */
  size: string;
  rep: string;
  priceList: string;
  creditLimit: number;
  creditUsed: number;
  creditHold: boolean;
  holdReason: string;
  /** Low | Medium | High */
  risk: string;
  /** Cash | Transfer | Cheque | Credit Card */
  payMethod: string;
}

/** Supplier-side profile. Present when the partner has the Supplier role. */
export interface BpSupplierProfile {
  /** Manufacturer | Importer | Distributor */
  supType: string;
  /** Preferred | Approved | Watch | Suspended */
  status: string;
  preferred: boolean;
  /** Quoted lead time in days. */
  lead: number;
  currency: string;
  payMethod: string;
}

/** One product this supplier quotes — the Supplier Items child table. */
/**
 * A bank account is either domestic or a wire destination, and the two need
 * different paperwork. A Thai transfer needs the bank, the branch and the
 * number; a foreign wire needs a SWIFT/BIC, the beneficiary exactly as the
 * bank holds it, and — depending on the corridor — an IBAN, a local clearing
 * code or an intermediary bank. The extra fields exist on every row but only
 * the international ones are shown and required.
 */
export const BANK_SCOPES = ["ในประเทศ", "ต่างประเทศ"] as const;

/** Who pays the wire fees. SHA is the usual commercial default. */
export const CHARGE_BEARERS = [
  "SHA — แบ่งกันจ่าย",
  "OUR — ผู้โอนจ่ายทั้งหมด",
  "BEN — ผู้รับจ่ายทั้งหมด",
] as const;

/** The local routing code a corridor asks for beside the SWIFT. */
export const CLEARING_SYSTEMS = [
  "ABA / Routing Number (US)",
  "Sort Code (UK)",
  "BSB (AU)",
  "Transit Number (CA)",
  "IFSC (IN)",
  "CNAPS (CN)",
  "Zengin (JP)",
  "ไม่มี",
] as const;

export interface BpBank {
  /** ในประเทศ | ต่างประเทศ — decides which fields below apply. */
  scope?: string;
  /** Thai bank, chosen from the list. */
  bank: string;
  branch: string;
  accName: string;
  accNo: string;
  accType: string;
  currency: string;
  swift: string;
  def: boolean;
  active: boolean;

  /* ---- International wire only ---- */
  /** Foreign banks are not in the Thai list, so the name is typed. */
  bankName?: string;
  bankCountry?: string;
  bankAddress?: string;
  /** Europe and much of the Middle East route on this instead of an account number. */
  iban?: string;
  /** Beneficiary exactly as the receiving bank holds it, or the wire bounces. */
  beneName?: string;
  beneAddress?: string;
  clearingSystem?: string;
  clearingCode?: string;
  /** Correspondent bank, usually only needed for USD routing. */
  interSwift?: string;
  interBank?: string;
  charges?: string;
  purpose?: string;
}

export interface BpSupplierItem {
  product: string;
  productName: string;
  /** The vendor's own code for our product. */
  sku: string;
  supName: string;
  /** Unit the vendor quotes and we buy in. */
  punit?: string;
  moq: number;
  lead: number;
  currency: string;
  price: number;
  preferred: boolean;
  status: string;
  effective: string;
  expiry: string;
}

export interface BusinessPartner {
  code: string;
  nameTh: string;
  nameEn: string;
  trade: string;
  type: string;
  logo: string;
  website: string;
  status: string;
  notes: string;
  /** Starting Date — when the relationship began. */
  since?: string;
  /** VAT | Non VAT. Derived from tax.vatReg when absent. */
  billType?: string;
  /** 30 | 60 | 90 | 120 | No Credit. Derived from the credit block when absent. */
  creditTerm?: string;
  /** Cover image for the record; falls back to the gallery cover, then `logo`. */
  profileImage?: string;
  images?: BpImage[];
  customer?: BpCustomerProfile | null;
  supplier?: BpSupplierProfile | null;
  supplierItems?: BpSupplierItem[];
  roles: {
    customer: boolean;
    supplier: boolean;
    dealer: boolean;
    prospect: boolean;
    other: boolean;
  };
  cls: {
    custGroup: string;
    supGroup: string;
    industry: string;
    bizType: string;
    custLevel: string;
    priceGroup: string;
    territory: string;
    channel: string;
  };
  tax: {
    entity: string;
    taxId: string;
    branchType: string;
    branchNo: string;
    regName: string;
    vatReg: boolean;
    vatDate: string;
    wht: boolean;
    regNo: string;
    country: string;
  };
  contacts: {
    code: string;
    prefix: string;
    first: string;
    last: string;
    pos: string;
    dept: string;
    phone: string;
    mobile: string;
    email: string;
    line: string;
    method: string;
    primary: boolean;
    active: boolean;
    remark?: string;
  }[];
  addresses: {
    name: string;
    type: string;
    l1: string;
    l2: string;
    sub: string;
    dist: string;
    prov: string;
    zip: string;
    country: string;
    phone: string;
    contact: string;
    maps: string;
    lat: string;
    lng: string;
    /** Legacy single-primary flag. Kept so old records still read; the two
     *  flags below are what Sales and Logistics actually ask for. */
    primary: boolean;
    active: boolean;
    email?: string;
    remark?: string;
    image?: string;
    billingPrimary?: boolean;
    deliveryPrimary?: boolean;
  }[];
  sales: {
    rep: string;
    team: string;
    territory: string;
    channel: string;
    custGroup: string;
    priceList: string;
    discGroup: string;
    payTerm: string;
    creditLimit: number;
    creditDays: number;
    creditControl: string;
    delivery: string;
    minOrder: number;
    taxInvoice: boolean;
    poRequired: boolean;
    shipTo: string;
    billTo: string;
  } | null;
  purchasing: {
    buyer: string;
    supGroup: string;
    currency: string;
    payTerm: string;
    lead: string;
    minValue: number;
    punit: string;
    incoterm: string;
    delivery: string;
    rating: string;
    preferred: boolean;
    wht: string;
    warehouse: string;
  } | null;
  credit: {
    payTerm: string;
    limit: number;
    days: number;
    outstanding: number;
    openSO: number;
    openInv: number;
    available: number;
    status: string;
    holdReason: string;
    holdDate: string;
    approvedBy: string;
    approvalDate: string;
  };
  banks: BpBank[];
  docs: {
    type: string;
    name: string;
    issue: string;
    expiry: string;
    status: string;
    by: string;
    date: string;
    remark?: string;
    /** pdf | word | excel | image — drives the icon, inferred from the name. */
    kind?: string;
  }[];
  txn: {
    so: {
      no: string;
      date: string;
      amount: number;
      status: string;
    }[];
    po: {
      no: string;
      date: string;
      amount: number;
      status: string;
    }[];
    inv: {
      no: string;
      date: string;
      amount: number;
      status: string;
    }[];
  };
  history: {
    t: string;
    d: string;
    u: string;
    when: string;
    kind: string;
  }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const BP_TYPES = [
  "Company",
  "Individual",
  "Government",
  "Hospital",
  "Dental Clinic",
  "University",
  "Association",
  "Other",
] as const;

export const BP_ROLE_DEFS: BpRoleDef[] = [
  {
    key: "customer",
    label: "Customer",
    badge: "badge--info",
    desc: "ลูกค้าที่ซื้อสินค้าหรือบริการ",
  },
  {
    key: "supplier",
    label: "Supplier",
    badge: "badge--success",
    desc: "ผู้จัดหาสินค้าหรือบริการ",
  },
  {
    key: "dealer",
    label: "Dealer",
    badge: "badge--warning",
    desc: "ตัวแทนจำหน่ายหรือผู้ขายต่อ",
  },
  {
    key: "prospect",
    label: "Prospect",
    badge: "badge--neutral",
    desc: "ผู้ที่มีแนวโน้มเป็นลูกค้า",
  },
  {
    key: "other",
    label: "Other",
    badge: "badge--neutral",
    desc: "คู่ค้าประเภทอื่น",
  },
];

/**
 * Provinces come from the sales area master so an address can always be
 * resolved to a territory. Re-exported here because partner, warehouse and
 * sales rep forms have always imported the list from this module.
 */
export { PROVINCES } from "./sales-areas";

export const PAY_TERMS = [
  "เงินสด",
  "เครดิต 7 วัน",
  "เครดิต 15 วัน",
  "เครดิต 30 วัน",
  "เครดิต 45 วัน",
  "เครดิต 60 วัน",
  "เครดิต 90 วัน",
] as const;

export const SALES_REPS = [
  "SRE001 - สมชาย ใจดี",
  "SRE002 - สุภาวิตา โยธะพันธ์",
  "SRE003 - ณัฐพล วงศ์ดี",
  "SRE004 - ปิยนารถ เจริญทอง",
] as const;

export const CREDIT_STATUS = ["Normal", "Near Limit", "Over Limit", "Credit Hold", "Not Applicable"] as const;

export const BP_STATUS = ["Active", "Inactive", "On Hold", "Blocked"] as const;

/* ---------- BP Master schema option lists ---------- */

/** How the business talks about a partner. Derived from the role flags —
 *  a partner with both flags is "Both", never two records. */
export const BP_TYPE_MODES = ["Customer", "Supplier", "Both"] as const;

/**
 * What kind of bill this partner gets. A quotation, sales request and sales
 * order each carry a `billType` of their own, defaulted from here.
 *
 * NOT the same axis as `OPT.vat` in data/options.ts, which describes how a
 * product's catalogue price is quoted ("VAT 7% (exclusive)" and so on). The
 * two are never compared and the spellings deliberately differ.
 */
export const BILL_TYPES = ["VAT", "Non VAT"] as const;

/** Credit term in days, plus the cash-only case. */
export const CREDIT_TERMS = ["30", "60", "90", "120", "No Credit"] as const;

export const PAYMENT_METHODS = ["Cash", "Transfer", "Cheque", "Credit Card"] as const;

/* Customer side */
export const CUSTOMER_TYPES = ["Government", "Private"] as const;

export const CUSTOMER_BIZ_TYPES = [
  "Clinic",
  "Hospital",
  "University",
  "Company",
  "Factory",
  "Dealer",
  "Individual",
] as const;

export const BENEFIT_LEVELS = ["0%", "5%", "10%", "15%", "20%", "25%", "Custom"] as const;

export const CUSTOMER_SIZES = ["S", "M", "L"] as const;

export const RISK_LEVELS = ["Low", "Medium", "High"] as const;

/* Supplier side */
export const SUPPLIER_TYPES = ["Manufacturer", "Importer", "Distributor"] as const;

export const SUPPLIER_STATUSES = ["Preferred", "Approved", "Watch", "Suspended"] as const;

export const SUPPLIER_ITEM_STATUS = ["Active", "Inactive", "Expired"] as const;

/**
 * Address purpose. The first three say what the address is FOR; the rest say
 * what the site IS. A "Both" address serves billing and delivery at once,
 * which is the common case for a single-site clinic.
 */
export const BP_ADDRESS_TYPES = [
  "Billing",
  "Delivery",
  "Both",
  "Head Office",
  "Branch",
  "Warehouse",
  "Service Center",
] as const;

/**
 * Address types written before the A-Factory schema, mapped onto it.
 *
 * This matters more than it looks: "Registered Address" is not in the new
 * list, so without the mapping every seeded partner would resolve to no
 * billing address and fail validation on load. A registered office is where
 * an invoice goes, so it becomes Head Office rather than something inert.
 */
export const LEGACY_ADDRESS_TYPES: Record<string, string> = {
  "Registered Address": "Head Office",
  "Billing Address": "Billing",
  "Shipping Address": "Delivery",
  "Delivery Address": "Delivery",
  Other: "Branch",
};

/** Address types that can carry a billing or delivery default. */
export const BILLING_ADDRESS_TYPES = ["Billing", "Both", "Head Office", "Branch"];
export const DELIVERY_ADDRESS_TYPES = [
  "Delivery",
  "Both",
  "Head Office",
  "Branch",
  "Warehouse",
  "Service Center",
];

export const ATTACHMENT_TYPES = [
  "Business License",
  "Tax Certificate",
  "Company Profile",
  "Quotation",
  "Agreement",
  "Contract",
  "Image",
  "Other",
] as const;

export const COUNTRIES = ["ประเทศไทย", "ลาว", "กัมพูชา", "เมียนมา", "เวียดนาม", "อื่น ๆ"] as const;

export const IMAGE_KINDS = ["Profile", "Storefront", "Product", "Document", "Other"] as const;

export const BUSINESS_PARTNERS: BusinessPartner[] = [
  {
    code: "BP000123",
    nameTh: "บริษัท เดนทัล สมายล์ จำกัด",
    nameEn: "Dental Smile Co., Ltd.",
    trade: "Dental Smile",
    type: "Company",
    logo: "🦷",
    website: "www.dentalsmile.co.th",
    status: "Active",
    notes: "ลูกค้ากลุ่มคลินิกทันตกรรม สั่งซื้อสม่ำเสมอทุกเดือน",
    roles: {
      customer: true,
      supplier: true,
      dealer: false,
      prospect: false,
      other: false,
    },
    cls: {
      custGroup: "คลินิกทั่วไป",
      supGroup: "วัสดุสิ้นเปลือง",
      industry: "บริการทางการแพทย์",
      bizType: "นิติบุคคล",
      custLevel: "Gold",
      priceGroup: "Retail",
      territory: "BKK3 สมุทรปราการ",
      channel: "Direct Sales",
    },
    tax: {
      entity: "บริษัทจำกัด",
      taxId: "0105560112347",
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: "บริษัท เดนทัล สมายล์ จำกัด",
      vatReg: true,
      vatDate: "15/03/2560",
      wht: true,
      regNo: "0105560112347",
      country: "ประเทศไทย",
    },
    contacts: [
      {
        code: "CT001",
        prefix: "คุณ",
        first: "วราภรณ์",
        last: "ใจดี",
        pos: "ผู้จัดการจัดซื้อ",
        dept: "จัดซื้อ",
        phone: "02-123-4567",
        mobile: "081-123-4567",
        email: "waraporn@dentalsmile.co.th",
        line: "@waraporn",
        method: "โทรศัพท์",
        primary: true,
        active: true,
      },
      {
        code: "CT002",
        prefix: "คุณ",
        first: "สมหญิง",
        last: "รักงาน",
        pos: "เจ้าหน้าที่บัญชี",
        dept: "บัญชี-การเงิน",
        phone: "02-123-4568",
        mobile: "089-222-3344",
        email: "somying@dentalsmile.co.th",
        line: "",
        method: "อีเมล",
        primary: false,
        active: true,
      },
    ],
    addresses: [
      {
        name: "สำนักงานใหญ่",
        type: "Registered Address",
        l1: "119/25 อาคารเดนทัลทาวเวอร์ ชั้น 8",
        l2: "ถนนสุขุมวิท",
        sub: "คลองเตย",
        dist: "คลองเตย",
        prov: "กรุงเทพมหานคร",
        zip: "10110",
        country: "ประเทศไทย",
        phone: "02-123-4567",
        contact: "คุณวราภรณ์ ใจดี",
        maps: "https://maps.google.com/?q=13.7,100.5",
        lat: "13.7234",
        lng: "100.5678",
        primary: true,
        active: true,
      },
      {
        name: "คลังสินค้าบางนา",
        type: "Shipping Address",
        l1: "88/9 หมู่ 5 ซอยบางนา-ตราด 25",
        l2: "",
        sub: "บางนาเหนือ",
        dist: "บางนา",
        prov: "กรุงเทพมหานคร",
        zip: "10260",
        country: "ประเทศไทย",
        phone: "02-777-8888",
        contact: "คุณสมหญิง รักงาน",
        maps: "",
        lat: "",
        lng: "",
        primary: true,
        active: true,
      },
    ],
    sales: {
      rep: "SRE001 - สมชาย ใจดี",
      team: "ทีมกรุงเทพฯ",
      territory: "BKK3 สมุทรปราการ",
      channel: "Direct Sales",
      custGroup: "คลินิกทั่วไป",
      priceList: "Retail 2569",
      discGroup: "Gold 5%",
      payTerm: "เครดิต 30 วัน",
      creditLimit: 500000,
      creditDays: 30,
      creditControl: "Normal",
      delivery: "จัดส่งโดยบริษัท",
      minOrder: 5000,
      taxInvoice: true,
      poRequired: true,
      shipTo: "คลังสินค้าบางนา",
      billTo: "สำนักงานใหญ่",
    },
    purchasing: {
      buyer: "ปิยนารถ เจริญทอง",
      supGroup: "วัสดุสิ้นเปลือง",
      currency: "THB",
      payTerm: "เครดิต 30 วัน",
      lead: "14 วัน",
      minValue: 10000,
      punit: "Box",
      incoterm: "DDP",
      delivery: "ผู้ขายจัดส่ง",
      rating: "A - ดีมาก",
      preferred: true,
      wht: "หัก ณ ที่จ่าย 3%",
      warehouse: "WH-01 Samut Prakan",
    },
    credit: {
      payTerm: "เครดิต 30 วัน",
      limit: 500000,
      days: 30,
      outstanding: 150250,
      openSO: 82000,
      openInv: 150250,
      available: 349750,
      status: "Normal",
      holdReason: "",
      holdDate: "",
      approvedBy: "Pimpaka S.",
      approvalDate: "01/01/2569",
    },
    banks: [
      {
        bank: "ธนาคารกสิกรไทย",
        branch: "สาขาสุขุมวิท",
        accName: "บริษัท เดนทัล สมายล์ จำกัด",
        accNo: "123-4-56789-0",
        accType: "ออมทรัพย์",
        currency: "THB",
        swift: "KASITHBK",
        def: true,
        active: true,
      },
    ],
    docs: [
      {
        type: "Company Certificate",
        name: "หนังสือรับรองบริษัท.pdf",
        issue: "15/03/2567",
        expiry: "15/03/2569",
        status: "Active",
        by: "Pimpaka S.",
        date: "20/03/2567",
      },
      {
        type: "VAT Certificate",
        name: "ภพ.20.pdf",
        issue: "15/03/2560",
        expiry: "—",
        status: "Active",
        by: "Pimpaka S.",
        date: "20/03/2567",
      },
      {
        type: "Contract",
        name: "สัญญาซื้อขาย 2569.pdf",
        issue: "01/01/2569",
        expiry: "31/12/2569",
        status: "Active",
        by: "Somchai B.",
        date: "05/01/2569",
      },
    ],
    txn: {
      so: [
        {
          no: "SO-2569-0184",
          date: "18/07/2569",
          amount: 82000,
          status: "Open",
        },
        {
          no: "SO-2569-0151",
          date: "02/07/2569",
          amount: 145600,
          status: "Delivered",
        },
      ],
      po: [
        {
          no: "PO-2569-0042",
          date: "10/07/2569",
          amount: 68500,
          status: "Received",
        },
      ],
      inv: [
        {
          no: "INV-2569-0301",
          date: "05/07/2569",
          amount: 150250,
          status: "Unpaid",
        },
      ],
    },
    history: [
      {
        t: "Credit changed",
        d: "วงเงินเครดิต 300,000 → 500,000 THB",
        u: "Pimpaka S.",
        when: "22/07/2569 11:20",
        kind: "primary",
      },
      {
        t: "Role changed",
        d: "เพิ่มบทบาท Supplier",
        u: "Pimpaka S.",
        when: "15/06/2569 09:40",
        kind: "info",
      },
      {
        t: "Contact changed",
        d: "เพิ่มผู้ติดต่อ คุณสมหญิง รักงาน",
        u: "Somchai B.",
        when: "02/05/2569 14:10",
        kind: "info",
      },
      {
        t: "Business Partner created",
        d: "สร้างข้อมูลคู่ค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "20/03/2567 10:00",
        kind: "",
      },
    ],
    created: "20/03/2567 10:00",
    createdBy: "Pimpaka S.",
    updated: "22/07/2569 11:20",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "BP000122",
    nameTh: "คลินิกทันตกรรม เอบีซี",
    nameEn: "ABC Dental Clinic",
    trade: "ABC Dental",
    type: "Dental Clinic",
    logo: "🏥",
    website: "",
    status: "Active",
    notes: "",
    roles: {
      customer: true,
      supplier: false,
      dealer: false,
      prospect: false,
      other: false,
    },
    cls: {
      custGroup: "คลินิกทั่วไป",
      supGroup: "",
      industry: "บริการทางการแพทย์",
      bizType: "นิติบุคคล",
      custLevel: "Silver",
      priceGroup: "Retail",
      territory: "BKK1 ฝั่งธน",
      channel: "Direct Sales",
    },
    tax: {
      entity: "บริษัทจำกัด",
      taxId: "0105570012345",
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: "บริษัท เอบีซี เดนทัล คลินิก จำกัด",
      vatReg: true,
      vatDate: "01/06/2562",
      wht: true,
      regNo: "0105570012345",
      country: "ประเทศไทย",
    },
    contacts: [
      {
        code: "CT001",
        prefix: "คุณ",
        first: "ธนพล",
        last: "ศรีสุข",
        pos: "เจ้าของคลินิก",
        dept: "บริหาร",
        phone: "02-234-5678",
        mobile: "082-234-5678",
        email: "thanapol@abcdental.com",
        line: "@abcdental",
        method: "LINE",
        primary: true,
        active: true,
      },
    ],
    addresses: [
      {
        name: "ที่ตั้งคลินิก",
        type: "Registered Address",
        l1: "45/12 ถนนพระราม 4",
        l2: "",
        sub: "สีลม",
        dist: "บางรัก",
        prov: "กรุงเทพมหานคร",
        zip: "10500",
        country: "ประเทศไทย",
        phone: "02-234-5678",
        contact: "คุณธนพล ศรีสุข",
        maps: "",
        lat: "",
        lng: "",
        primary: true,
        active: true,
      },
    ],
    sales: {
      rep: "SRE002 - สุภาวิตา โยธะพันธ์",
      team: "ทีมกรุงเทพฯ",
      territory: "BKK1 ฝั่งธน",
      channel: "Direct Sales",
      custGroup: "คลินิกทั่วไป",
      priceList: "Retail 2569",
      discGroup: "Silver 3%",
      payTerm: "เครดิต 15 วัน",
      creditLimit: 200000,
      creditDays: 15,
      creditControl: "Near Limit",
      delivery: "จัดส่งโดยบริษัท",
      minOrder: 3000,
      taxInvoice: true,
      poRequired: false,
      shipTo: "ที่ตั้งคลินิก",
      billTo: "ที่ตั้งคลินิก",
    },
    purchasing: null,
    credit: {
      payTerm: "เครดิต 15 วัน",
      limit: 200000,
      days: 15,
      outstanding: 178000,
      openSO: 24000,
      openInv: 178000,
      available: 22000,
      status: "Near Limit",
      holdReason: "",
      holdDate: "",
      approvedBy: "Pimpaka S.",
      approvalDate: "01/06/2568",
    },
    banks: [],
    docs: [
      {
        type: "Company Certificate",
        name: "หนังสือรับรอง ABC.pdf",
        issue: "01/06/2562",
        expiry: "30/09/2569",
        status: "Active",
        by: "Somchai B.",
        date: "10/06/2562",
      },
    ],
    txn: {
      so: [
        {
          no: "SO-2569-0177",
          date: "15/07/2569",
          amount: 24000,
          status: "Open",
        },
      ],
      po: [],
      inv: [
        {
          no: "INV-2569-0288",
          date: "28/06/2569",
          amount: 178000,
          status: "Overdue",
        },
      ],
    },
    history: [
      {
        t: "Credit changed",
        d: "สถานะเครดิต Normal → Near Limit",
        u: "System",
        when: "22/07/2569 06:00",
        kind: "warn",
      },
      {
        t: "Business Partner created",
        d: "สร้างข้อมูลคู่ค้าเข้าระบบ",
        u: "Somchai B.",
        when: "10/06/2562 09:00",
        kind: "",
      },
    ],
    created: "10/06/2562 09:00",
    createdBy: "Somchai B.",
    updated: "22/07/2569 06:00",
    updatedBy: "System",
  },
  {
    code: "BP000121",
    nameTh: "บริษัท เพอร์เฟค ซัพพลาย จำกัด",
    nameEn: "Perfect Supply Co., Ltd.",
    trade: "Perfect Supply",
    type: "Company",
    logo: "📦",
    website: "www.perfectsupply.co.th",
    status: "Active",
    notes: "ซัพพลายเออร์วัสดุสิ้นเปลืองหลัก",
    roles: {
      customer: false,
      supplier: true,
      dealer: false,
      prospect: false,
      other: false,
    },
    cls: {
      custGroup: "",
      supGroup: "วัสดุสิ้นเปลือง",
      industry: "ค้าส่ง",
      bizType: "นิติบุคคล",
      custLevel: "",
      priceGroup: "",
      territory: "BKK3 สมุทรปราการ",
      channel: "",
    },
    tax: {
      entity: "บริษัทจำกัด",
      taxId: "0105550012340",
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: "บริษัท เพอร์เฟค ซัพพลาย จำกัด",
      vatReg: true,
      vatDate: "20/01/2555",
      wht: true,
      regNo: "0105550012340",
      country: "ประเทศไทย",
    },
    contacts: [
      {
        code: "CT001",
        prefix: "คุณ",
        first: "อนุชา",
        last: "วงศ์ดี",
        pos: "ผู้จัดการฝ่ายขาย",
        dept: "ขาย",
        phone: "02-345-6789",
        mobile: "083-345-6789",
        email: "anucha@perfectsupply.co.th",
        line: "",
        method: "อีเมล",
        primary: true,
        active: true,
      },
    ],
    addresses: [
      {
        name: "สำนักงานใหญ่",
        type: "Registered Address",
        l1: "222/8 หมู่ 3 ถนนเทพารักษ์",
        l2: "",
        sub: "บางพลีใหญ่",
        dist: "บางพลี",
        prov: "สมุทรปราการ",
        zip: "10540",
        country: "ประเทศไทย",
        phone: "02-345-6789",
        contact: "คุณอนุชา วงศ์ดี",
        maps: "",
        lat: "",
        lng: "",
        primary: true,
        active: true,
      },
    ],
    sales: null,
    purchasing: {
      buyer: "ปิยนารถ เจริญทอง",
      supGroup: "วัสดุสิ้นเปลือง",
      currency: "THB",
      payTerm: "เครดิต 45 วัน",
      lead: "21 วัน",
      minValue: 20000,
      punit: "Carton",
      incoterm: "DDP",
      delivery: "ผู้ขายจัดส่ง",
      rating: "A - ดีมาก",
      preferred: true,
      wht: "หัก ณ ที่จ่าย 3%",
      warehouse: "WH-01 Samut Prakan",
    },
    credit: {
      payTerm: "เครดิต 45 วัน",
      limit: 0,
      days: 0,
      outstanding: 0,
      openSO: 0,
      openInv: 0,
      available: 0,
      status: "Not Applicable",
      holdReason: "",
      holdDate: "",
      approvedBy: "",
      approvalDate: "",
    },
    banks: [
      {
        scope: "ในประเทศ",
        bank: "ธนาคารกรุงเทพ",
        branch: "สาขาบางพลี",
        accName: "บริษัท เพอร์เฟค ซัพพลาย จำกัด",
        accNo: "234-5-67890-1",
        accType: "กระแสรายวัน",
        currency: "THB",
        swift: "BKKBTHBK",
        def: true,
        active: true,
      },
      /* The same supplier bills its imported line in USD, so the second
         account is a wire destination with the paperwork that needs. */
      {
        scope: "ต่างประเทศ",
        bank: "",
        branch: "",
        accName: "Perfect Supply (Singapore) Pte. Ltd.",
        accNo: "003-912345-8",
        accType: "",
        currency: "USD",
        swift: "DBSSSGSGXXX",
        bankName: "DBS Bank Ltd.",
        bankCountry: "สิงคโปร์",
        bankAddress: "12 Marina Boulevard, DBS Asia Central, Singapore 018982",
        iban: "",
        beneName: "Perfect Supply (Singapore) Pte. Ltd.",
        beneAddress: "8 Jurong Town Hall Road, Singapore 609434",
        clearingSystem: "ไม่มี",
        clearingCode: "",
        interSwift: "CHASUS33",
        interBank: "JPMorgan Chase Bank, N.A., New York",
        charges: "SHA — แบ่งกันจ่าย",
        purpose: "Payment for dental supplies",
        def: false,
        active: true,
      },
    ],
    docs: [
      {
        type: "Company Certificate",
        name: "หนังสือรับรอง Perfect.pdf",
        issue: "20/01/2567",
        expiry: "20/01/2569",
        status: "Expiring",
        by: "Pimpaka S.",
        date: "25/01/2567",
      },
    ],
    txn: {
      so: [],
      po: [
        {
          no: "PO-2569-0038",
          date: "05/07/2569",
          amount: 124000,
          status: "Received",
        },
      ],
      inv: [],
    },
    history: [
      {
        t: "Business Partner created",
        d: "สร้างข้อมูลคู่ค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "25/01/2567 11:00",
        kind: "",
      },
    ],
    created: "25/01/2567 11:00",
    createdBy: "Pimpaka S.",
    updated: "21/07/2569 15:30",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "BP000120",
    nameTh: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
    nameEn: "Dental Max Dealer Ltd., Part.",
    trade: "Dental Max",
    type: "Company",
    logo: "🏪",
    website: "",
    status: "Active",
    notes: "ตัวแทนจำหน่ายภาคเหนือ",
    roles: {
      customer: true,
      supplier: false,
      dealer: true,
      prospect: false,
      other: false,
    },
    cls: {
      custGroup: "ตัวแทนจำหน่าย",
      supGroup: "",
      industry: "ค้าส่ง",
      bizType: "ห้างหุ้นส่วน",
      custLevel: "Platinum",
      priceGroup: "Dealer",
      territory: "เหนือบน",
      channel: "Dealer Network",
    },
    tax: {
      entity: "ห้างหุ้นส่วนจำกัด",
      taxId: "0505560012349",
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: "ห้างหุ้นส่วนจำกัด เดนทัล แม็กซ์ ดีลเลอร์",
      vatReg: true,
      vatDate: "10/08/2561",
      wht: true,
      regNo: "0505560012349",
      country: "ประเทศไทย",
    },
    contacts: [
      {
        code: "CT001",
        prefix: "คุณ",
        first: "ณัฐพร",
        last: "มั่นคง",
        pos: "กรรมการผู้จัดการ",
        dept: "บริหาร",
        phone: "053-456-789",
        mobile: "084-456-7890",
        email: "nattaporn@dentalmax.co.th",
        line: "@dentalmax",
        method: "LINE",
        primary: true,
        active: true,
      },
    ],
    addresses: [
      {
        name: "สำนักงานเชียงใหม่",
        type: "Registered Address",
        l1: "156/7 ถนนนิมมานเหมินท์",
        l2: "",
        sub: "สุเทพ",
        dist: "เมืองเชียงใหม่",
        prov: "เชียงใหม่",
        zip: "50200",
        country: "ประเทศไทย",
        phone: "053-456-789",
        contact: "คุณณัฐพร มั่นคง",
        maps: "",
        lat: "",
        lng: "",
        primary: true,
        active: true,
      },
    ],
    sales: {
      rep: "SRE003 - ณัฐพล วงศ์ดี",
      team: "ทีมภาคเหนือ",
      territory: "เหนือบน",
      channel: "Dealer Network",
      custGroup: "ตัวแทนจำหน่าย",
      priceList: "Dealer 2569",
      discGroup: "Dealer 15%",
      payTerm: "เครดิต 60 วัน",
      creditLimit: 1000000,
      creditDays: 60,
      creditControl: "Over Limit",
      delivery: "ขนส่งเอกชน",
      minOrder: 50000,
      taxInvoice: true,
      poRequired: true,
      shipTo: "สำนักงานเชียงใหม่",
      billTo: "สำนักงานเชียงใหม่",
    },
    purchasing: null,
    credit: {
      payTerm: "เครดิต 60 วัน",
      limit: 1000000,
      days: 60,
      outstanding: 1124000,
      openSO: 186000,
      openInv: 1124000,
      available: -124000,
      status: "Over Limit",
      holdReason: "ยอดค้างชำระเกินวงเงิน",
      holdDate: "20/07/2569",
      approvedBy: "Pimpaka S.",
      approvalDate: "01/01/2569",
    },
    banks: [],
    docs: [],
    txn: {
      so: [
        {
          no: "SO-2569-0180",
          date: "16/07/2569",
          amount: 186000,
          status: "On Hold",
        },
      ],
      po: [],
      inv: [
        {
          no: "INV-2569-0295",
          date: "01/07/2569",
          amount: 1124000,
          status: "Overdue",
        },
      ],
    },
    history: [
      {
        t: "Credit changed",
        d: "สถานะเครดิต Near Limit → Over Limit",
        u: "System",
        when: "21/07/2569 06:00",
        kind: "warn",
      },
      {
        t: "Business Partner created",
        d: "สร้างข้อมูลคู่ค้าเข้าระบบ",
        u: "Somchai B.",
        when: "12/08/2561 10:30",
        kind: "",
      },
    ],
    created: "12/08/2561 10:30",
    createdBy: "Somchai B.",
    updated: "21/07/2569 06:00",
    updatedBy: "System",
  },
  {
    code: "BP000119",
    nameTh: "โรงพยาบาลสมานบุญ 1",
    nameEn: "Samanboon Hospital 1",
    trade: "",
    type: "Hospital",
    logo: "🏨",
    website: "",
    status: "Active",
    notes: "หน่วยงานรัฐ ต้องมี PO ทุกครั้ง",
    roles: {
      customer: true,
      supplier: false,
      dealer: false,
      prospect: false,
      other: false,
    },
    cls: {
      custGroup: "โรงพยาบาลรัฐ",
      supGroup: "",
      industry: "บริการทางการแพทย์",
      bizType: "หน่วยงานรัฐ",
      custLevel: "Gold",
      priceGroup: "Government",
      territory: "BKK2 นนทบุรี",
      channel: "Tender",
    },
    tax: {
      entity: "หน่วยงานราชการ",
      taxId: "0994000123451",
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: "โรงพยาบาลสมานบุญ 1",
      vatReg: false,
      vatDate: "",
      wht: true,
      regNo: "0994000123451",
      country: "ประเทศไทย",
    },
    contacts: [
      {
        code: "CT001",
        prefix: "คุณ",
        first: "จิตติมา",
        last: "แก้วใส",
        pos: "หัวหน้าฝ่ายพัสดุ",
        dept: "พัสดุ",
        phone: "02-567-8901",
        mobile: "085-567-8901",
        email: "jittima@samanboon.go.th",
        line: "",
        method: "อีเมล",
        primary: true,
        active: true,
      },
    ],
    addresses: [
      {
        name: "โรงพยาบาล",
        type: "Registered Address",
        l1: "99 ถนนพหลโยธิน",
        l2: "",
        sub: "จตุจักร",
        dist: "จตุจักร",
        prov: "กรุงเทพมหานคร",
        zip: "10900",
        country: "ประเทศไทย",
        phone: "02-567-8901",
        contact: "คุณจิตติมา แก้วใส",
        maps: "",
        lat: "",
        lng: "",
        primary: true,
        active: true,
      },
    ],
    sales: {
      rep: "SRE001 - สมชาย ใจดี",
      team: "ทีมราชการ",
      territory: "BKK2 นนทบุรี",
      channel: "Tender",
      custGroup: "โรงพยาบาลรัฐ",
      priceList: "Government 2569",
      discGroup: "",
      payTerm: "เครดิต 90 วัน",
      creditLimit: 2000000,
      creditDays: 90,
      creditControl: "Normal",
      delivery: "จัดส่งโดยบริษัท",
      minOrder: 0,
      taxInvoice: true,
      poRequired: true,
      shipTo: "โรงพยาบาล",
      billTo: "โรงพยาบาล",
    },
    purchasing: null,
    credit: {
      payTerm: "เครดิต 90 วัน",
      limit: 2000000,
      days: 90,
      outstanding: 420000,
      openSO: 0,
      openInv: 420000,
      available: 1580000,
      status: "Normal",
      holdReason: "",
      holdDate: "",
      approvedBy: "Pimpaka S.",
      approvalDate: "01/10/2568",
    },
    banks: [],
    docs: [],
    txn: {
      so: [],
      po: [],
      inv: [
        {
          no: "INV-2569-0260",
          date: "20/06/2569",
          amount: 420000,
          status: "Unpaid",
        },
      ],
    },
    history: [
      {
        t: "Business Partner created",
        d: "สร้างข้อมูลคู่ค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "05/10/2568 13:00",
        kind: "",
      },
    ],
    created: "05/10/2568 13:00",
    createdBy: "Pimpaka S.",
    updated: "20/07/2569 09:15",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "BP000118",
    nameTh: "ร้านทันตภัณฑ์ ก้าวหน้า",
    nameEn: "Kaona Dental Supply",
    trade: "ก้าวหน้า",
    type: "Individual",
    logo: "🛒",
    website: "",
    status: "Inactive",
    notes: "หยุดทำธุรกรรมตั้งแต่ปี 2568",
    roles: {
      customer: true,
      supplier: false,
      dealer: false,
      prospect: false,
      other: false,
    },
    cls: {
      custGroup: "ร้านค้าปลีก",
      supGroup: "",
      industry: "ค้าปลีก",
      bizType: "บุคคลธรรมดา",
      custLevel: "Bronze",
      priceGroup: "Retail",
      territory: "อีสานกลาง",
      channel: "Direct Sales",
    },
    tax: {
      entity: "บุคคลธรรมดา",
      taxId: "3101200456789",
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: "นายก้าวหน้า พัฒนา",
      vatReg: false,
      vatDate: "",
      wht: false,
      regNo: "",
      country: "ประเทศไทย",
    },
    contacts: [
      {
        code: "CT001",
        prefix: "นาย",
        first: "ก้าวหน้า",
        last: "พัฒนา",
        pos: "เจ้าของร้าน",
        dept: "",
        phone: "",
        mobile: "086-678-9012",
        email: "kaona@gmail.com",
        line: "@kaona",
        method: "LINE",
        primary: true,
        active: false,
      },
    ],
    addresses: [
      {
        name: "ร้าน",
        type: "Registered Address",
        l1: "77/3 ถนนมิตรภาพ",
        l2: "",
        sub: "ในเมือง",
        dist: "เมืองขอนแก่น",
        prov: "ขอนแก่น",
        zip: "40000",
        country: "ประเทศไทย",
        phone: "",
        contact: "นายก้าวหน้า พัฒนา",
        maps: "",
        lat: "",
        lng: "",
        primary: true,
        active: true,
      },
    ],
    sales: {
      rep: "SRE004 - ปิยนารถ เจริญทอง",
      team: "ทีมภาคอีสาน",
      territory: "อีสานกลาง",
      channel: "Direct Sales",
      custGroup: "ร้านค้าปลีก",
      priceList: "Retail 2569",
      discGroup: "",
      payTerm: "เงินสด",
      creditLimit: 0,
      creditDays: 0,
      creditControl: "Not Applicable",
      delivery: "ขนส่งเอกชน",
      minOrder: 2000,
      taxInvoice: false,
      poRequired: false,
      shipTo: "ร้าน",
      billTo: "ร้าน",
    },
    purchasing: null,
    credit: {
      payTerm: "เงินสด",
      limit: 0,
      days: 0,
      outstanding: 0,
      openSO: 0,
      openInv: 0,
      available: 0,
      status: "Not Applicable",
      holdReason: "",
      holdDate: "",
      approvedBy: "",
      approvalDate: "",
    },
    banks: [],
    docs: [],
    txn: {
      so: [],
      po: [],
      inv: [],
    },
    history: [
      {
        t: "Status changed",
        d: "Active → Inactive",
        u: "Pimpaka S.",
        when: "15/01/2569 10:00",
        kind: "warn",
      },
      {
        t: "Business Partner created",
        d: "สร้างข้อมูลคู่ค้าเข้าระบบ",
        u: "Somchai B.",
        when: "08/02/2566 14:20",
        kind: "",
      },
    ],
    created: "08/02/2566 14:20",
    createdBy: "Somchai B.",
    updated: "15/01/2569 10:00",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "BP000089",
    nameTh: "บริษัท เดนทัล สมายล์ จำกัด (สาขา 2)",
    nameEn: "Dental Smile Co., Ltd. (Branch 2)",
    trade: "Dental Smile",
    type: "Company",
    logo: "🦷",
    website: "www.dentalsmile.co.th",
    status: "On Hold",
    notes: "รอตรวจสอบว่าซ้ำกับ BP000123 หรือไม่",
    roles: {
      customer: true,
      supplier: false,
      dealer: false,
      prospect: false,
      other: false,
    },
    cls: {
      custGroup: "คลินิกทั่วไป",
      supGroup: "",
      industry: "บริการทางการแพทย์",
      bizType: "นิติบุคคล",
      custLevel: "Silver",
      priceGroup: "Retail",
      territory: "BKK3 สมุทรปราการ",
      channel: "Direct Sales",
    },
    tax: {
      entity: "บริษัทจำกัด",
      taxId: "0105560112347",
      branchType: "สาขา",
      branchNo: "00002",
      regName: "บริษัท เดนทัล สมายล์ จำกัด",
      vatReg: true,
      vatDate: "15/03/2560",
      wht: true,
      regNo: "0105560112347",
      country: "ประเทศไทย",
    },
    contacts: [
      {
        code: "CT001",
        prefix: "คุณ",
        first: "วราภรณ์",
        last: "ใจดี",
        pos: "ผู้จัดการจัดซื้อ",
        dept: "จัดซื้อ",
        phone: "02-123-4567",
        mobile: "081-123-4567",
        email: "waraporn@dentalsmile.co.th",
        line: "",
        method: "โทรศัพท์",
        primary: true,
        active: true,
      },
    ],
    addresses: [
      {
        name: "สาขา 2",
        type: "Registered Address",
        l1: "119/26 อาคารเดนทัลทาวเวอร์ ชั้น 9",
        l2: "",
        sub: "คลองเตย",
        dist: "คลองเตย",
        prov: "กรุงเทพมหานคร",
        zip: "10110",
        country: "ประเทศไทย",
        phone: "02-123-4567",
        contact: "คุณวราภรณ์ ใจดี",
        maps: "",
        lat: "",
        lng: "",
        primary: true,
        active: true,
      },
    ],
    sales: {
      rep: "SRE001 - สมชาย ใจดี",
      team: "ทีมกรุงเทพฯ",
      territory: "BKK3 สมุทรปราการ",
      channel: "Direct Sales",
      custGroup: "คลินิกทั่วไป",
      priceList: "Retail 2569",
      discGroup: "",
      payTerm: "เครดิต 30 วัน",
      creditLimit: 100000,
      creditDays: 30,
      creditControl: "Normal",
      delivery: "จัดส่งโดยบริษัท",
      minOrder: 5000,
      taxInvoice: true,
      poRequired: false,
      shipTo: "สาขา 2",
      billTo: "สาขา 2",
    },
    purchasing: null,
    credit: {
      payTerm: "เครดิต 30 วัน",
      limit: 100000,
      days: 30,
      outstanding: 0,
      openSO: 0,
      openInv: 0,
      available: 100000,
      status: "Normal",
      holdReason: "",
      holdDate: "",
      approvedBy: "",
      approvalDate: "",
    },
    banks: [],
    docs: [],
    txn: {
      so: [],
      po: [],
      inv: [],
    },
    history: [
      {
        t: "Business Partner created",
        d: "สร้างข้อมูลคู่ค้าเข้าระบบ",
        u: "Somchai B.",
        when: "11/11/2568 16:00",
        kind: "",
      },
    ],
    created: "11/11/2568 16:00",
    createdBy: "Somchai B.",
    updated: "11/11/2568 16:00",
    updatedBy: "Somchai B.",
  },
];
