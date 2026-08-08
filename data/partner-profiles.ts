/**
 * BP Master — the dimensions the A-Factory schema added.
 *
 * Kept out of data/partners.ts on purpose. That file is generated from the
 * original prototype dataset and is regenerated wholesale; this one is
 * hand-maintained and only carries what genuinely had no home before.
 *
 * Nothing here duplicates a figure a partner already owns. Credit limit,
 * credit used, sales rep, price list, currency, lead time and the preferred
 * flag all live on the existing `credit` / `sales` / `purchasing` blocks and
 * are merged in by lib/domain/partner.ts — a second copy of a number is a
 * second version of the truth.
 */

import type { BpImage, BpSupplierItem, BusinessPartner } from "./partners";

type Attachment = BusinessPartner["docs"][number];

/** The customer dimensions that are new. Credit and ownership come from `sales`. */
export interface CustomerSeed {
  /** Government | Private */
  custType: string;
  /** Clinic | Hospital | University | Company | Factory | Dealer | Individual */
  bizType: string;
  /** 0% … 25% | Custom */
  benefit: string;
  /** The figure behind `benefit` — the only source of truth when it is Custom. */
  benefitPct: number;
  /** S | M | L */
  size: string;
  /** Low | Medium | High */
  risk: string;
  /** Cash | Transfer | Cheque | Credit Card */
  payMethod: string;
  creditHold?: boolean;
  holdReason?: string;
}

/** The supplier dimensions that are new. Currency and lead come from `purchasing`. */
export interface SupplierSeed {
  /** Manufacturer | Importer | Distributor */
  supType: string;
  /** Preferred | Approved | Watch | Suspended */
  status: string;
  payMethod: string;
}

export const CUSTOMER_SEED: Record<string, CustomerSeed> = {
  BP000123: {
    custType: "Private",
    bizType: "Clinic",
    benefit: "10%",
    benefitPct: 10,
    size: "M",
    risk: "Low",
    payMethod: "Transfer",
  },
  BP000122: {
    custType: "Private",
    bizType: "Clinic",
    benefit: "5%",
    benefitPct: 5,
    size: "S",
    risk: "Medium",
    payMethod: "Transfer",
  },
  BP000120: {
    custType: "Private",
    bizType: "Dealer",
    benefit: "20%",
    benefitPct: 20,
    size: "L",
    risk: "High",
    payMethod: "Cheque",
    creditHold: true,
    holdReason: "ยอดค้างชำระเกินวงเงินที่อนุมัติ",
  },
  BP000119: {
    custType: "Government",
    bizType: "Hospital",
    benefit: "Custom",
    /* Tender pricing — the level is negotiated per contract, not off the ladder. */
    benefitPct: 12.5,
    size: "L",
    risk: "Low",
    payMethod: "Transfer",
  },
  BP000118: {
    custType: "Private",
    bizType: "Individual",
    benefit: "0%",
    benefitPct: 0,
    size: "S",
    risk: "Medium",
    payMethod: "Cash",
  },
  BP000089: {
    custType: "Government",
    bizType: "University",
    benefit: "15%",
    benefitPct: 15,
    size: "M",
    risk: "Low",
    payMethod: "Transfer",
  },
};

export const SUPPLIER_SEED: Record<string, SupplierSeed> = {
  BP000123: { supType: "Distributor", status: "Approved", payMethod: "Transfer" },
  BP000121: { supType: "Manufacturer", status: "Preferred", payMethod: "Transfer" },
};

/**
 * Supplier Items — what each supplier quotes, at what price, from when.
 * Product codes are real entries in the product master, so the child table
 * resolves against something rather than dangling.
 */
export const SUPPLIER_ITEMS: Record<string, BpSupplierItem[]> = {
  BP000121: [
    {
      product: "AA-TH003-WL",
      productName: "Composite Resin A2 Syringe",
      sku: "DNT-CR-A2-4G",
      supName: "Composite Resin Shade A2 4g",
      moq: 24,
      lead: 14,
      currency: "THB",
      price: 420,
      preferred: true,
      status: "Active",
      effective: "01/01/2026",
      expiry: "31/12/2026",
    },
    {
      product: "AA-TH003-GR",
      productName: "Composite Resin A3 Syringe",
      sku: "DNT-CR-A3-4G",
      supName: "Composite Resin Shade A3 4g",
      moq: 24,
      lead: 14,
      currency: "THB",
      price: 420,
      preferred: true,
      status: "Active",
      effective: "01/01/2026",
      expiry: "31/12/2026",
    },
    {
      product: "AT-SL001",
      productName: "Dental Sealant Kit",
      sku: "DNT-SEAL-KIT",
      supName: "Pit & Fissure Sealant Kit",
      moq: 6,
      lead: 21,
      currency: "THB",
      price: 1850,
      preferred: false,
      status: "Active",
      effective: "01/03/2026",
      expiry: "",
    },
    {
      /* Superseded by the 2569 price list — kept so the tab shows an expired row. */
      product: "AT-GL001",
      productName: "Glass Ionomer Cement",
      sku: "DNT-GIC-STD",
      supName: "Glass Ionomer Cement Standard",
      moq: 12,
      lead: 30,
      currency: "THB",
      price: 980,
      preferred: false,
      status: "Expired",
      effective: "01/01/2025",
      expiry: "31/12/2025",
    },
  ],
  BP000123: [
    {
      product: "AB-AC001",
      productName: "Disposable Saliva Ejector",
      sku: "DS-SE-100",
      supName: "Saliva Ejector 100/pack",
      moq: 50,
      lead: 7,
      currency: "THB",
      price: 145,
      preferred: true,
      status: "Active",
      effective: "01/02/2026",
      expiry: "",
    },
    {
      product: "AT-BR002",
      productName: "Prophy Brush Cup",
      sku: "DS-PB-CUP",
      supName: "Prophy Brush Cup Soft",
      moq: 100,
      lead: 10,
      currency: "THB",
      price: 12,
      preferred: false,
      status: "Inactive",
      effective: "01/02/2026",
      expiry: "",
    },
  ],
};

/**
 * Attachments for the two partners that have none. Five of the seven already
 * carry their own documents, so this fills a gap rather than imposing a
 * default — a seed that overwrote real data would be a bug, not a fixture.
 * One expiry sits inside the 90-day window on purpose: the expiry banner is
 * a real feature and needs a record that triggers it.
 */
export const ATTACHMENT_SEED: Record<string, Attachment[]> = {
  /* Exactly the four partners that carry NO attachments at all — BP000123,
     BP000122 and BP000121 have their own and must not be overwritten. The
     seed fills a gap; it does not impose a default. */
  BP000119: [
    {
      type: "Contract",
      name: "สัญญาจัดซื้อจัดจ้าง-รพ.pdf",
      issue: "01/10/2025",
      /* Inside the 90-day window — exercises the upcoming-expiry banner. */
      expiry: "30/09/2026",
      status: "Active",
      by: "คุณปิยนารถ",
      date: "01/10/2025",
      remark: "สัญญาประจำปีงบประมาณ",
      kind: "pdf",
    },
  ],
  BP000120: [
    {
      type: "Agreement",
      name: "สัญญาตัวแทนจำหน่าย-2568.pdf",
      issue: "01/01/2025",
      /* Already lapsed — the banner must report overdue, not just upcoming. */
      expiry: "31/12/2025",
      status: "Expired",
      by: "คุณสมชาย",
      date: "01/01/2025",
      remark: "หมดอายุแล้ว รอเซ็นฉบับใหม่",
      kind: "pdf",
    },
  ],
  BP000118: [
    {
      type: "Business License",
      name: "ทะเบียนพาณิชย์.pdf",
      issue: "12/05/2023",
      expiry: "",
      status: "Active",
      by: "คุณสมชาย",
      date: "12/05/2023",
      remark: "ร้านค้าบุคคลธรรมดา ไม่มีวันหมดอายุ",
      kind: "pdf",
    },
    {
      type: "Company Profile",
      name: "แนะนำร้าน.docx",
      issue: "01/08/2025",
      expiry: "",
      status: "Active",
      by: "คุณสมชาย",
      date: "01/08/2025",
      remark: "",
      kind: "word",
    },
  ],
  BP000089: [
    {
      type: "Agreement",
      name: "สัญญาสาขา-2569.pdf",
      issue: "01/01/2026",
      /* Inside the 90-day window on purpose — exercises the expiry banner. */
      expiry: "15/10/2026",
      status: "Active",
      by: "คุณพิมพกา",
      date: "01/01/2026",
      remark: "สัญญาสาขา ต่ออายุรายปี",
      kind: "pdf",
    },
    {
      type: "Tax Certificate",
      name: "ภพ20-สาขา2.pdf",
      issue: "10/02/2026",
      expiry: "",
      status: "Active",
      by: "คุณพิมพกา",
      date: "10/02/2026",
      remark: "",
      kind: "pdf",
    },
  ],
};

/**
 * Partner galleries. The prototype carries an emoji where a deployment
 * carries a URL — every consumer treats `src` as opaque, so swapping in
 * real uploads changes this file and nothing else.
 */
export const PARTNER_IMAGES: Record<string, BpImage[]> = {
  BP000123: [
    {
      id: "IMG001",
      name: "หน้าร้านสาขาสุขุมวิท",
      src: "🏥",
      kind: "Storefront",
      by: "คุณพิมพกา",
      date: "12/03/2026",
      cover: true,
      remark: "ถ่ายหลังปรับปรุงหน้าร้าน",
    },
    {
      id: "IMG002",
      name: "ป้ายหน้าคลินิก",
      src: "🪧",
      kind: "Storefront",
      by: "คุณพิมพกา",
      date: "12/03/2026",
      cover: false,
      remark: "",
    },
    {
      id: "IMG003",
      name: "ห้องตรวจ 1",
      src: "🦷",
      kind: "Other",
      by: "คุณสมชาย",
      date: "20/03/2026",
      cover: false,
      remark: "ใช้ประกอบการเสนอเครื่องมือ",
    },
  ],
  BP000121: [
    {
      id: "IMG001",
      name: "โรงงานผลิต",
      src: "🏭",
      kind: "Storefront",
      by: "คุณณัฐพล",
      date: "05/02/2026",
      cover: true,
      remark: "ตรวจโรงงานประจำปี",
    },
  ],
  BP000119: [
    {
      id: "IMG001",
      name: "อาคารผู้ป่วยนอก",
      src: "🏛️",
      kind: "Storefront",
      by: "คุณปิยนารถ",
      date: "18/01/2026",
      cover: true,
      remark: "",
    },
  ],
};
