/* eslint-disable */
/**
 * Category master — hierarchical lookup data. The same shape works for
 * Brand, Series, Country and Currency.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface Category {
  code: string;
  nameTh: string;
  nameEn: string;
  parent: string | null;
  sort: number;
  desc: string;
  status: string;
  created: string;
  createdBy: string;
  updated: string;
  updatedBy: string;
}

export const CATEGORIES: Category[] = [
  {
    code: "CAT-001",
    nameTh: "เครื่องมือทันตกรรม",
    nameEn: "Dental Equipment",
    parent: null,
    sort: 1,
    desc: "หมวดหลักสำหรับเครื่องมือและอุปกรณ์ทันตกรรมทั้งหมด",
    status: "Active",
    created: "12/03/2024 09:00",
    createdBy: "Pimpaka S.",
    updated: "08/07/2026 14:22",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "CAT-002",
    nameTh: "รักษารากฟัน",
    nameEn: "Endodontic",
    parent: "CAT-001",
    sort: 1,
    desc: "อุปกรณ์สำหรับงานรักษารากฟัน",
    status: "Active",
    created: "12/03/2024 09:05",
    createdBy: "Pimpaka S.",
    updated: "21/05/2026 10:05",
    updatedBy: "Somchai B.",
  },
  {
    code: "CAT-003",
    nameTh: "ไฟล์รักษาราก",
    nameEn: "Files",
    parent: "CAT-002",
    sort: 1,
    desc: "ไฟล์และรีมเมอร์สำหรับขยายคลองรากฟัน",
    status: "Active",
    created: "12/03/2024 09:10",
    createdBy: "Somchai B.",
    updated: "03/02/2026 16:48",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "CAT-010",
    nameTh: "วัสดุอุดฟัน",
    nameEn: "Sealant",
    parent: "CAT-001",
    sort: 2,
    desc: "วัสดุเคลือบร่องฟันและวัสดุอุด",
    status: "Active",
    created: "15/03/2024 11:20",
    createdBy: "Pimpaka S.",
    updated: "08/07/2026 14:22",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "CAT-011",
    nameTh: "อะคริลิก",
    nameEn: "Acrylic",
    parent: "CAT-001",
    sort: 3,
    desc: "อะคริลิกสำหรับงานฟันปลอม",
    status: "Active",
    created: "05/08/2024 15:20",
    createdBy: "Somchai B.",
    updated: "01/04/2026 08:30",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "CAT-012",
    nameTh: "ซิลิโคน",
    nameEn: "Silicone",
    parent: "CAT-001",
    sort: 4,
    desc: "ซิลิโคนพิมพ์ปากทุกชนิด",
    status: "Inactive",
    created: "18/11/2023 10:00",
    createdBy: "Pimpaka S.",
    updated: "01/03/2026 17:45",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "CAT-020",
    nameTh: "อุปกรณ์สิ้นเปลือง",
    nameEn: "Accessory",
    parent: null,
    sort: 2,
    desc: "ของใช้สิ้นเปลืองในคลินิก",
    status: "Active",
    created: "09/01/2024 08:15",
    createdBy: "Somchai B.",
    updated: "15/07/2026 16:00",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "CAT-021",
    nameTh: "ถุงมือและหน้ากาก",
    nameEn: "PPE",
    parent: "CAT-020",
    sort: 1,
    desc: "อุปกรณ์ป้องกันส่วนบุคคล",
    status: "Active",
    created: "09/01/2024 08:20",
    createdBy: "Somchai B.",
    updated: "02/05/2026 10:30",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "CAT-030",
    nameTh: "เครื่องมือช่างทันตกรรม",
    nameEn: "Instrument",
    parent: "CAT-001",
    sort: 5,
    desc: "หัวกรอ ด้ามกรอ และเครื่องมือช่าง",
    status: "Draft",
    created: "22/02/2025 14:00",
    createdBy: "Pimpaka S.",
    updated: "30/06/2026 09:15",
    updatedBy: "System",
  },
  {
    code: "CAT-040",
    nameTh: "จัดฟันใส",
    nameEn: "Clear Aligner",
    parent: null,
    sort: 3,
    desc: "ผลิตภัณฑ์จัดฟันใสและอุปกรณ์เกี่ยวข้อง",
    status: "Draft",
    created: "10/06/2026 09:00",
    createdBy: "Pimpaka S.",
    updated: "10/06/2026 09:00",
    updatedBy: "Pimpaka S.",
  },
];
