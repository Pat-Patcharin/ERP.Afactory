/* eslint-disable */
/**
 * Sales Representative master. Used by Business Partner, Sales Order,
 * CRM, Commission and the Sales dashboard.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export type TeamColorMap = Record<string, string>;

export interface SalesRep {
  code: string;
  empId: string;
  title: string;
  first: string;
  last: string;
  nick: string;
  gender: string;
  birth: string;
  dept: string;
  position: string;
  team: string;
  manager: string;
  status: string;
  hireDate: string;
  resignDate: string;
  mobile: string;
  office: string;
  email: string;
  line: string;
  area: string;
  province: string;
  region: string;
  custGroup: string;
  channel: string;
  commGroup: string;
  monthlyTarget: number;
  quarterTarget: number;
  annualTarget: number;
  monthlySales: number;
  achievement: number;
  custCount: number;
  openQuo: number;
  openOrd: number;
  collection: number;
  overdue: number;
  discountLimit: number;
  approvalLimit: number;
  whAccess: string;
  prodCat: string;
  trend: number[];
  bonus: number;
  commission: number;
  customers: {
    code: string;
    name: string;
    prov: string;
    group: string;
    lastVisit: string;
    outstanding: number;
    status: string;
  }[];
  visits: {
    date: string;
    cust: string;
    prov: string;
    purpose: string;
    status: string;
    result: string;
  }[];
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

export const SR_STATUS = ["Active", "Inactive", "On Leave", "Resigned"] as const;

export const SR_TEAMS = ["Sales 1", "Sales 2", "Sales 3", "Sales 4"] as const;

export const SR_AREAS = ["Bangkok", "Central", "North", "Northeast", "South", "East", "West"] as const;

export const SR_REGIONS = ["ภาคกลาง", "ภาคเหนือ", "ภาคอีสาน", "ภาคใต้", "ภาคตะวันออก", "ภาคตะวันตก"] as const;

export const SR_DEPARTMENTS = ["Sales", "Key Account", "Dealer", "Government", "Export"] as const;

export const SR_MANAGERS = ["Patcharin T.", "Narin C.", "Somchai S."] as const;

export const SR_CHANNELS = ["Direct", "Dealer", "Online", "Government", "Export"] as const;

export const SR_CUST_GROUPS = ["Dental Clinic", "Hospital", "Dealer", "University", "Government"] as const;

export const SR_COMM_GROUPS = ["Standard 3%", "Senior 4%", "Key Account 5%", "Dealer 2%"] as const;

export const SR_TITLES = ["นาย", "นาง", "นางสาว"] as const;

export const SR_TEAM_COLOR: TeamColorMap = {
  "Sales 1": "#F97316",
  "Sales 2": "#3B82F6",
  "Sales 3": "#22C55E",
  "Sales 4": "#8B5CF6",
};

export const SALES_REPRESENTATIVES: SalesRep[] = [
  {
    code: "SALE001",
    empId: "EMP0001",
    title: "นางสาว",
    first: "Patcharin",
    last: "Thiengkaew",
    nick: "Pat",
    gender: "หญิง",
    birth: "12/03/1990",
    dept: "Sales",
    position: "Senior Sales Executive",
    team: "Sales 1",
    manager: "Narin C.",
    status: "Active",
    hireDate: "01/06/2016",
    resignDate: "",
    mobile: "081-234-5678",
    office: "02-123-4567",
    email: "patcharin.t@afactory.co.th",
    line: "pat_afactory",
    area: "Bangkok",
    province: "Bangkok",
    region: "ภาคกลาง",
    custGroup: "Dental Clinic",
    channel: "Direct",
    commGroup: "Key Account 5%",
    monthlyTarget: 500000,
    quarterTarget: 1500000,
    annualTarget: 6000000,
    monthlySales: 480000,
    achievement: 96,
    custCount: 128,
    openQuo: 12,
    openOrd: 8,
    collection: 320500,
    overdue: 3,
    discountLimit: 15,
    approvalLimit: 200000,
    whAccess: "WH01, WH02",
    prodCat: "ทุกหมวด",
    trend: [320, 360, 340, 400, 380, 420, 450, 430, 480, 460, 500, 480],
    bonus: 25000,
    commission: 24000,
    customers: [
      {
        code: "C010001",
        name: "ABC Dental Clinic",
        prov: "Bangkok",
        group: "Dental Clinic",
        lastVisit: "20/06/2025",
        outstanding: 120000,
        status: "Active",
      },
      {
        code: "C010002",
        name: "Dental Plus Co., Ltd.",
        prov: "Bangkok",
        group: "Dealer",
        lastVisit: "18/06/2025",
        outstanding: 98500,
        status: "Active",
      },
      {
        code: "C010003",
        name: "Smile Gallery Clinic",
        prov: "Bangkok",
        group: "Dental Clinic",
        lastVisit: "02/04/2025",
        outstanding: 75300,
        status: "Active",
      },
      {
        code: "C010004",
        name: "Bangpakok Dental",
        prov: "Bangkok",
        group: "Hospital",
        lastVisit: "15/06/2025",
        outstanding: 68200,
        status: "Active",
      },
      {
        code: "C010005",
        name: "Thantakit Clinic",
        prov: "Nonthaburi",
        group: "Dental Clinic",
        lastVisit: "10/03/2025",
        outstanding: 55000,
        status: "Active",
      },
    ],
    visits: [
      {
        date: "25/06/2025",
        cust: "ABC Dental Clinic",
        prov: "Bangkok",
        purpose: "นำเสนอสินค้าใหม่",
        status: "Planned",
        result: "",
      },
      {
        date: "20/06/2025",
        cust: "Dental Plus Co., Ltd.",
        prov: "Bangkok",
        purpose: "ติดตามใบเสนอราคา",
        status: "Completed",
        result: "ปิดการขาย 98,500",
      },
    ],
    history: [
      {
        t: "Assigned Customer",
        d: "มอบหมาย Thantakit Clinic",
        u: "Narin C.",
        when: "01/06/2025 10:00",
        kind: "info",
      },
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "01/06/2016 09:00",
        kind: "",
      },
    ],
    created: "01/06/2016 09:00",
    createdBy: "HR",
    updated: "20/06/2025 14:00",
    updatedBy: "Narin C.",
  },
  {
    code: "SALE002",
    empId: "EMP0002",
    title: "นาย",
    first: "Somchai",
    last: "Srisuk",
    nick: "Chai",
    gender: "ชาย",
    birth: "05/08/1988",
    dept: "Sales",
    position: "Sales Executive",
    team: "Sales 1",
    manager: "Narin C.",
    status: "Active",
    hireDate: "15/03/2017",
    resignDate: "",
    mobile: "082-345-6789",
    office: "02-123-4568",
    email: "somchai.s@afactory.co.th",
    line: "chai_sale",
    area: "Central",
    province: "Nonthaburi",
    region: "ภาคกลาง",
    custGroup: "Dental Clinic",
    channel: "Direct",
    commGroup: "Standard 3%",
    monthlyTarget: 400000,
    quarterTarget: 1200000,
    annualTarget: 4800000,
    monthlySales: 336000,
    achievement: 84,
    custCount: 96,
    openQuo: 7,
    openOrd: 5,
    collection: 210000,
    overdue: 1,
    discountLimit: 10,
    approvalLimit: 100000,
    whAccess: "WH01",
    prodCat: "Consumables",
    trend: [280, 300, 290, 320, 310, 300, 330, 340, 320, 350, 330, 336],
    bonus: 8000,
    commission: 10080,
    customers: [
      {
        code: "C010010",
        name: "Central Dental Care",
        prov: "Nonthaburi",
        group: "Dental Clinic",
        lastVisit: "12/06/2025",
        outstanding: 45000,
        status: "Active",
      },
      {
        code: "C010011",
        name: "Pathum Dental",
        prov: "Pathum Thani",
        group: "Dental Clinic",
        lastVisit: "05/05/2025",
        outstanding: 32000,
        status: "Active",
      },
    ],
    visits: [
      {
        date: "22/06/2025",
        cust: "Central Dental Care",
        prov: "Nonthaburi",
        purpose: "ส่งสินค้า",
        status: "Planned",
        result: "",
      },
    ],
    history: [
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "15/03/2017 09:00",
        kind: "",
      },
    ],
    created: "15/03/2017 09:00",
    createdBy: "HR",
    updated: "12/06/2025 11:00",
    updatedBy: "Narin C.",
  },
  {
    code: "SALE003",
    empId: "EMP0003",
    title: "นาย",
    first: "Narin",
    last: "Chaiyawat",
    nick: "Narin",
    gender: "ชาย",
    birth: "20/11/1985",
    dept: "Key Account",
    position: "Sales Supervisor",
    team: "Sales 2",
    manager: "Patcharin T.",
    status: "Active",
    hireDate: "01/02/2015",
    resignDate: "",
    mobile: "083-456-7890",
    office: "02-123-4569",
    email: "narin.c@afactory.co.th",
    line: "narin_ka",
    area: "North",
    province: "Chiang Mai",
    region: "ภาคเหนือ",
    custGroup: "Hospital",
    channel: "Direct",
    commGroup: "Senior 4%",
    monthlyTarget: 600000,
    quarterTarget: 1800000,
    annualTarget: 7200000,
    monthlySales: 612000,
    achievement: 102,
    custCount: 74,
    openQuo: 9,
    openOrd: 11,
    collection: 410000,
    overdue: 0,
    discountLimit: 20,
    approvalLimit: 300000,
    whAccess: "WH01, WH02",
    prodCat: "ทุกหมวด",
    trend: [480, 500, 520, 510, 540, 560, 550, 580, 600, 590, 610, 612],
    bonus: 35000,
    commission: 24480,
    customers: [
      {
        code: "C010020",
        name: "Chiang Mai Ram Hospital",
        prov: "Chiang Mai",
        group: "Hospital",
        lastVisit: "19/06/2025",
        outstanding: 180000,
        status: "Active",
      },
      {
        code: "C010021",
        name: "Lanna Dental",
        prov: "Chiang Mai",
        group: "Dental Clinic",
        lastVisit: "14/06/2025",
        outstanding: 62000,
        status: "Active",
      },
    ],
    visits: [
      {
        date: "26/06/2025",
        cust: "Chiang Mai Ram Hospital",
        prov: "Chiang Mai",
        purpose: "ทบทวนสัญญา",
        status: "Planned",
        result: "",
      },
    ],
    history: [
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "01/02/2015 09:00",
        kind: "",
      },
    ],
    created: "01/02/2015 09:00",
    createdBy: "HR",
    updated: "19/06/2025 16:00",
    updatedBy: "Patcharin T.",
  },
  {
    code: "SALE004",
    empId: "EMP0004",
    title: "นางสาว",
    first: "Supavita",
    last: "Yothapun",
    nick: "Vita",
    gender: "หญิง",
    birth: "14/07/1992",
    dept: "Sales",
    position: "Sales Executive",
    team: "Sales 2",
    manager: "Patcharin T.",
    status: "Active",
    hireDate: "10/09/2018",
    resignDate: "",
    mobile: "084-567-8901",
    office: "02-123-4570",
    email: "supavita.y@afactory.co.th",
    line: "vita_sale",
    area: "Northeast",
    province: "Khon Kaen",
    region: "ภาคอีสาน",
    custGroup: "Dental Clinic",
    channel: "Dealer",
    commGroup: "Standard 3%",
    monthlyTarget: 350000,
    quarterTarget: 1050000,
    annualTarget: 4200000,
    monthlySales: 273000,
    achievement: 78,
    custCount: 88,
    openQuo: 6,
    openOrd: 4,
    collection: 150000,
    overdue: 2,
    discountLimit: 10,
    approvalLimit: 80000,
    whAccess: "WH01",
    prodCat: "Consumables",
    trend: [240, 260, 250, 270, 280, 260, 290, 280, 270, 290, 280, 273],
    bonus: 5000,
    commission: 8190,
    customers: [
      {
        code: "C010030",
        name: "Khon Kaen Dental",
        prov: "Khon Kaen",
        group: "Dental Clinic",
        lastVisit: "03/04/2025",
        outstanding: 38000,
        status: "Active",
      },
    ],
    visits: [
      {
        date: "24/06/2025",
        cust: "Khon Kaen Dental",
        prov: "Khon Kaen",
        purpose: "ติดตามหนี้",
        status: "Planned",
        result: "",
      },
    ],
    history: [
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "10/09/2018 09:00",
        kind: "",
      },
    ],
    created: "10/09/2018 09:00",
    createdBy: "HR",
    updated: "03/04/2025 10:00",
    updatedBy: "Patcharin T.",
  },
  {
    code: "SALE005",
    empId: "EMP0005",
    title: "นาย",
    first: "Nattapong",
    last: "Sae-Lim",
    nick: "Top",
    gender: "ชาย",
    birth: "28/02/1991",
    dept: "Dealer",
    position: "Sales Executive",
    team: "Sales 3",
    manager: "Somchai S.",
    status: "On Leave",
    hireDate: "05/05/2019",
    resignDate: "",
    mobile: "085-678-9012",
    office: "02-123-4571",
    email: "nattapong.s@afactory.co.th",
    line: "top_dealer",
    area: "South",
    province: "Phuket",
    region: "ภาคใต้",
    custGroup: "Dealer",
    channel: "Dealer",
    commGroup: "Dealer 2%",
    monthlyTarget: 450000,
    quarterTarget: 1350000,
    annualTarget: 5400000,
    monthlySales: 0,
    achievement: 0,
    custCount: 52,
    openQuo: 3,
    openOrd: 2,
    collection: 0,
    overdue: 0,
    discountLimit: 12,
    approvalLimit: 120000,
    whAccess: "WH01",
    prodCat: "ทุกหมวด",
    trend: [360, 380, 370, 390, 400, 380, 410, 0, 0, 0, 0, 0],
    bonus: 0,
    commission: 0,
    customers: [
      {
        code: "C010040",
        name: "Phuket Dental Supply",
        prov: "Phuket",
        group: "Dealer",
        lastVisit: "01/03/2025",
        outstanding: 0,
        status: "Active",
      },
    ],
    visits: [],
    history: [
      {
        t: "Status Changed",
        d: "เปลี่ยนเป็น On Leave (ลาคลอด)",
        u: "HR",
        when: "01/05/2025 09:00",
        kind: "warn",
      },
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "05/05/2019 09:00",
        kind: "",
      },
    ],
    created: "05/05/2019 09:00",
    createdBy: "HR",
    updated: "01/05/2025 09:00",
    updatedBy: "HR",
  },
  {
    code: "SALE006",
    empId: "EMP0006",
    title: "นาย",
    first: "Wasin",
    last: "Rattanakorn",
    nick: "Win",
    gender: "ชาย",
    birth: "09/09/1993",
    dept: "Sales",
    position: "Sales Executive",
    team: "Sales 3",
    manager: "Somchai S.",
    status: "Active",
    hireDate: "20/01/2020",
    resignDate: "",
    mobile: "086-789-0123",
    office: "02-123-4572",
    email: "wasin.r@afactory.co.th",
    line: "win_sale",
    area: "East",
    province: "Chonburi",
    region: "ภาคตะวันออก",
    custGroup: "Dental Clinic",
    channel: "Direct",
    commGroup: "Standard 3%",
    monthlyTarget: 400000,
    quarterTarget: 1200000,
    annualTarget: 4800000,
    monthlySales: 364000,
    achievement: 91,
    custCount: 79,
    openQuo: 8,
    openOrd: 6,
    collection: 190000,
    overdue: 1,
    discountLimit: 10,
    approvalLimit: 100000,
    whAccess: "WH01",
    prodCat: "ทุกหมวด",
    trend: [300, 320, 330, 340, 350, 360, 340, 360, 350, 370, 360, 364],
    bonus: 10000,
    commission: 10920,
    customers: [
      {
        code: "C010050",
        name: "Chonburi Dental",
        prov: "Chonburi",
        group: "Dental Clinic",
        lastVisit: "16/06/2025",
        outstanding: 42000,
        status: "Active",
      },
    ],
    visits: [
      {
        date: "23/06/2025",
        cust: "Chonburi Dental",
        prov: "Chonburi",
        purpose: "นำเสนอสินค้า",
        status: "Planned",
        result: "",
      },
    ],
    history: [
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "20/01/2020 09:00",
        kind: "",
      },
    ],
    created: "20/01/2020 09:00",
    createdBy: "HR",
    updated: "16/06/2025 15:00",
    updatedBy: "Somchai S.",
  },
  {
    code: "SALE007",
    empId: "EMP0007",
    title: "นางสาว",
    first: "Kanyarat",
    last: "Promtam",
    nick: "Karn",
    gender: "หญิง",
    birth: "03/12/1994",
    dept: "Sales",
    position: "Sales Executive",
    team: "Sales 4",
    manager: "Narin C.",
    status: "Inactive",
    hireDate: "11/11/2021",
    resignDate: "",
    mobile: "087-890-1234",
    office: "02-123-4573",
    email: "kanyarat.p@afactory.co.th",
    line: "karn_sale",
    area: "West",
    province: "Ratchaburi",
    region: "ภาคตะวันตก",
    custGroup: "Dental Clinic",
    channel: "Direct",
    commGroup: "Standard 3%",
    monthlyTarget: 350000,
    quarterTarget: 1050000,
    annualTarget: 4200000,
    monthlySales: 0,
    achievement: 0,
    custCount: 45,
    openQuo: 2,
    openOrd: 1,
    collection: 0,
    overdue: 0,
    discountLimit: 8,
    approvalLimit: 60000,
    whAccess: "WH01",
    prodCat: "Consumables",
    trend: [220, 240, 230, 250, 240, 230, 0, 0, 0, 0, 0, 0],
    bonus: 0,
    commission: 0,
    customers: [
      {
        code: "C010060",
        name: "Ratchaburi Dental",
        prov: "Ratchaburi",
        group: "Dental Clinic",
        lastVisit: "20/02/2025",
        outstanding: 15000,
        status: "Inactive",
      },
    ],
    visits: [],
    history: [
      {
        t: "Status Changed",
        d: "เปลี่ยนเป็น Inactive",
        u: "HR",
        when: "01/06/2025 09:00",
        kind: "warn",
      },
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "11/11/2021 09:00",
        kind: "",
      },
    ],
    created: "11/11/2021 09:00",
    createdBy: "HR",
    updated: "01/06/2025 09:00",
    updatedBy: "HR",
  },
  {
    code: "SALE008",
    empId: "EMP0008",
    title: "นาย",
    first: "Teerapat",
    last: "Khamdee",
    nick: "Tee",
    gender: "ชาย",
    birth: "17/06/1995",
    dept: "Sales",
    position: "Junior Sales Executive",
    team: "Sales 4",
    manager: "Patcharin T.",
    status: "Active",
    hireDate: "01/08/2022",
    resignDate: "",
    mobile: "088-901-2345",
    office: "02-123-4574",
    email: "teerapat.k@afactory.co.th",
    line: "tee_sale",
    area: "Bangkok",
    province: "Bangkok",
    region: "ภาคกลาง",
    custGroup: "Dental Clinic",
    channel: "Direct",
    commGroup: "Standard 3%",
    monthlyTarget: 300000,
    quarterTarget: 900000,
    annualTarget: 3600000,
    monthlySales: 219000,
    achievement: 73,
    custCount: 38,
    openQuo: 5,
    openOrd: 3,
    collection: 95000,
    overdue: 0,
    discountLimit: 8,
    approvalLimit: 50000,
    whAccess: "WH01",
    prodCat: "Consumables",
    trend: [150, 170, 180, 190, 200, 210, 200, 210, 205, 215, 210, 219],
    bonus: 3000,
    commission: 6570,
    customers: [
      {
        code: "C010070",
        name: "Sukhumvit Dental",
        prov: "Bangkok",
        group: "Dental Clinic",
        lastVisit: "17/06/2025",
        outstanding: 28000,
        status: "Active",
      },
    ],
    visits: [
      {
        date: "25/06/2025",
        cust: "Sukhumvit Dental",
        prov: "Bangkok",
        purpose: "นำเสนอสินค้า",
        status: "Planned",
        result: "",
      },
    ],
    history: [
      {
        t: "Created",
        d: "เพิ่มพนักงานขายเข้าระบบ",
        u: "HR",
        when: "01/08/2022 09:00",
        kind: "",
      },
    ],
    created: "01/08/2022 09:00",
    createdBy: "HR",
    updated: "17/06/2025 14:00",
    updatedBy: "Patcharin T.",
  },
];
