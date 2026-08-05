/* eslint-disable */
/**
 * Sales Representative master. Used by Business Partner, Sales Order
 * and CRM.
 *
 * PHASE SCOPE — master data only. No sales actuals live here: KPI,
 * commission, visit plan and activity history were removed on purpose.
 * Targets and authority limits stay because they are configuration the
 * sales manager sets up, not figures posted from transactions.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

import { SALES_AREA_CODES } from "./sales-areas";

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
  /** Sales area code from the territory master — "BKK1", "N-UP", … */
  area: string;
  /** Base province. Must be one the area owns; the form enforces it. */
  province: string;
  custGroup: string;
  channel: string;
  monthlyTarget: number;
  quarterTarget: number;
  annualTarget: number;
  custCount: number;
  discountLimit: number;
  approvalLimit: number;
  whAccess: string;
  prodCat: string;
  customers: {
    code: string;
    name: string;
    prov: string;
    group: string;
    status: string;
  }[];
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const SR_STATUS = ["Active", "Inactive", "On Leave", "Resigned"] as const;

export const SR_TEAMS = ["Sales 1", "Sales 2", "Sales 3", "Sales 4"] as const;

/**
 * Areas come from the territory master, so a rep can only be assigned to an
 * area that actually exists on the map. The old seven-value list ("Bangkok",
 * "Central", …) was coarser than the sheet the business works from, and the
 * rep's separate `region` field duplicated what the area's group already
 * says — both were dropped in favour of this.
 */
export const SR_AREAS = SALES_AREA_CODES;

export const SR_DEPARTMENTS = ["Sales", "Key Account", "Dealer", "Government", "Export"] as const;

export const SR_MANAGERS = ["Patcharin T.", "Narin C.", "Somchai S."] as const;

export const SR_CHANNELS = ["Direct", "Dealer", "Online", "Government", "Export"] as const;

export const SR_CUST_GROUPS = ["Dental Clinic", "Hospital", "Dealer", "University", "Government"] as const;

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
    area: "BKK1",
    province: "กรุงเทพมหานคร",
    custGroup: "Dental Clinic",
    channel: "Direct",
    monthlyTarget: 500000,
    quarterTarget: 1500000,
    annualTarget: 6000000,
    custCount: 128,
    discountLimit: 15,
    approvalLimit: 200000,
    whAccess: "WH01, WH02",
    prodCat: "ทุกหมวด",
    customers: [
      {
        code: "C010001",
        name: "ABC Dental Clinic",
        prov: "กรุงเทพมหานคร",
        group: "Dental Clinic",
        status: "Active",
      },
      {
        code: "C010002",
        name: "Dental Plus Co., Ltd.",
        prov: "กรุงเทพมหานคร",
        group: "Dealer",
        status: "Active",
      },
      {
        code: "C010003",
        name: "Smile Gallery Clinic",
        prov: "กรุงเทพมหานคร",
        group: "Dental Clinic",
        status: "Active",
      },
      {
        code: "C010004",
        name: "Bangpakok Dental",
        prov: "กรุงเทพมหานคร",
        group: "Hospital",
        status: "Active",
      },
      {
        code: "C010005",
        name: "Thantakit Clinic",
        prov: "นนทบุรี",
        group: "Dental Clinic",
        status: "Active",
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
    area: "BKK2",
    province: "นนทบุรี",
    custGroup: "Dental Clinic",
    channel: "Direct",
    monthlyTarget: 400000,
    quarterTarget: 1200000,
    annualTarget: 4800000,
    custCount: 96,
    discountLimit: 10,
    approvalLimit: 100000,
    whAccess: "WH01",
    prodCat: "Consumables",
    customers: [
      {
        code: "C010010",
        name: "Central Dental Care",
        prov: "นนทบุรี",
        group: "Dental Clinic",
        status: "Active",
      },
      {
        code: "C010011",
        name: "Pathum Dental",
        prov: "ปทุมธานี",
        group: "Dental Clinic",
        status: "Active",
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
    area: "N-UP",
    province: "เชียงใหม่",
    custGroup: "Hospital",
    channel: "Direct",
    monthlyTarget: 600000,
    quarterTarget: 1800000,
    annualTarget: 7200000,
    custCount: 74,
    discountLimit: 20,
    approvalLimit: 300000,
    whAccess: "WH01, WH02",
    prodCat: "ทุกหมวด",
    customers: [
      {
        code: "C010020",
        name: "Chiang Mai Ram Hospital",
        prov: "เชียงใหม่",
        group: "Hospital",
        status: "Active",
      },
      {
        code: "C010021",
        name: "Lanna Dental",
        prov: "เชียงใหม่",
        group: "Dental Clinic",
        status: "Active",
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
    area: "NE-MID",
    province: "ขอนแก่น",
    custGroup: "Dental Clinic",
    channel: "Dealer",
    monthlyTarget: 350000,
    quarterTarget: 1050000,
    annualTarget: 4200000,
    custCount: 88,
    discountLimit: 10,
    approvalLimit: 80000,
    whAccess: "WH01",
    prodCat: "Consumables",
    customers: [
      {
        code: "C010030",
        name: "Khon Kaen Dental",
        prov: "ขอนแก่น",
        group: "Dental Clinic",
        status: "Active",
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
    area: "S-LOW",
    province: "ภูเก็ต",
    custGroup: "Dealer",
    channel: "Dealer",
    monthlyTarget: 450000,
    quarterTarget: 1350000,
    annualTarget: 5400000,
    custCount: 52,
    discountLimit: 12,
    approvalLimit: 120000,
    whAccess: "WH01",
    prodCat: "ทุกหมวด",
    customers: [
      {
        code: "C010040",
        name: "Phuket Dental Supply",
        prov: "ภูเก็ต",
        group: "Dealer",
        status: "Active",
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
    area: "EAST",
    province: "ชลบุรี",
    custGroup: "Dental Clinic",
    channel: "Direct",
    monthlyTarget: 400000,
    quarterTarget: 1200000,
    annualTarget: 4800000,
    custCount: 79,
    discountLimit: 10,
    approvalLimit: 100000,
    whAccess: "WH01",
    prodCat: "ทุกหมวด",
    customers: [
      {
        code: "C010050",
        name: "Chonburi Dental",
        prov: "ชลบุรี",
        group: "Dental Clinic",
        status: "Active",
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
    area: "C-LOW",
    province: "ราชบุรี",
    custGroup: "Dental Clinic",
    channel: "Direct",
    monthlyTarget: 350000,
    quarterTarget: 1050000,
    annualTarget: 4200000,
    custCount: 45,
    discountLimit: 8,
    approvalLimit: 60000,
    whAccess: "WH01",
    prodCat: "Consumables",
    customers: [
      {
        code: "C010060",
        name: "Ratchaburi Dental",
        prov: "ราชบุรี",
        group: "Dental Clinic",
        status: "Inactive",
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
    area: "BKK3",
    province: "กรุงเทพมหานคร",
    custGroup: "Dental Clinic",
    channel: "Direct",
    monthlyTarget: 300000,
    quarterTarget: 900000,
    annualTarget: 3600000,
    custCount: 38,
    discountLimit: 8,
    approvalLimit: 50000,
    whAccess: "WH01",
    prodCat: "Consumables",
    customers: [
      {
        code: "C010070",
        name: "Sukhumvit Dental",
        prov: "กรุงเทพมหานคร",
        group: "Dental Clinic",
        status: "Active",
      },
    ],
    created: "01/08/2022 09:00",
    createdBy: "HR",
    updated: "17/06/2025 14:00",
    updatedBy: "Patcharin T.",
  },
];
