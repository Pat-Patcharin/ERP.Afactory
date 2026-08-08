/* eslint-disable */
/**
 * Warehouse master — WMS-ready. Bin-level flags (pick/putaway) are stored
 * now so future WMS features read them without a migration.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface WhLevel {
  label: string;
  codePh: string;
  namePh: string;
}

export interface Warehouse {
  code: string;
  name: string;
  nameTh: string;
  type: string;
  icon: string;
  status: string;
  desc: string;
  manager: string;
  phone: string;
  email: string;
  config: {
    purchase: boolean;
    sales: boolean;
    transfer: boolean;
    production: boolean;
    returns: boolean;
    negative: boolean;
    isDefault: boolean;
    valuation: string;
    costing: string;
  };
  addr: {
    line: string;
    sub: string;
    dist: string;
    prov: string;
    zip: string;
    country: string;
    maps: string;
    lat: string;
    lng: string;
  };
  rules: {
    temp: string;
    humidity: boolean;
    hazardous: boolean;
    controlled: boolean;
    secure: string;
    maxCap: number;
    curCap: number;
    capUnit: string;
    remarks: string;
  };
  inv: {
    sku: number;
    qty: number;
    value: number;
    reserved: number;
    available: number;
    pendingIn: number;
    pendingOut: number;
  };
  locations: {
    code: string;
    name: string;
    children: {
      code: string;
      name: string;
      children: {
        code: string;
        name: string;
        children: {
          code: string;
          name: string;
          binType: string;
          cap: number;
          capUnit: string;
          temp: string;
          pick: boolean;
          putaway: boolean;
          status: string;
        }[];
      }[];
    }[];
  }[];
  docs: {
    type: string;
    name: string;
    issue: string;
    expiry: string;
    status: string;
    by: string;
    date: string;
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

export const WH_TYPES = [
  "Main Warehouse",
  "Branch Warehouse",
  "Transit",
  "Returns",
  "Quarantine",
  "Cold Storage",
  "Service",
  "Consignment",
  "Manufacturing",
  "Other",
] as const;

export const WH_TEMPS = ["Ambient", "Cold (2–8 °C)", "Frozen (−18 °C)", "Controlled"] as const;

export const WH_VALUATION = ["Moving Average", "FIFO", "LIFO", "Standard Cost", "Specific Identification"] as const;

export const WH_COSTING = ["FIFO", "LIFO", "Weighted Average", "Standard"] as const;

export const WH_SECURITY = ["ทั่วไป", "จำกัดการเข้าถึง", "ควบคุมพิเศษ"] as const;

export const WH_CAP_UNIT = ["m²", "m³", "Pallet", "Qty", "Rack"] as const;

export const WH_LEVELS: WhLevel[] = [
  {
    label: "Zone",
    codePh: "ZONE-A",
    namePh: "ชื่อโซน",
  },
  {
    label: "Rack",
    codePh: "RACK-01",
    namePh: "ชื่อแร็ค",
  },
  {
    label: "Shelf",
    codePh: "SHELF-01",
    namePh: "ชื่อชั้น",
  },
  {
    label: "Bin",
    codePh: "BIN-A01",
    namePh: "ชื่อช่องเก็บ",
  },
];

export const WAREHOUSES: Warehouse[] = [
  {
    code: "WH-BKK",
    name: "Bangkok Main Warehouse",
    nameTh: "คลังสินค้าหลัก กรุงเทพฯ",
    type: "Main Warehouse",
    icon: "🏭",
    status: "Active",
    desc: "คลังสินค้าหลักของบริษัท รองรับการรับเข้าและจ่ายออกทุกประเภท",
    manager: "สมชาย วงศ์ดี",
    phone: "02-123-4567",
    email: "somchai.w@afactory.co.th",
    config: {
      purchase: true,
      sales: true,
      transfer: true,
      production: false,
      returns: true,
      negative: false,
      isDefault: true,
      valuation: "Moving Average",
      costing: "FIFO",
    },
    addr: {
      line: "123 ถนนสุขุมวิท",
      sub: "แขวงบางนาเหนือ",
      dist: "เขตบางนา",
      prov: "กรุงเทพมหานคร",
      zip: "10260",
      country: "ประเทศไทย",
      maps: "https://maps.google.com/?q=13.6654,100.6331",
      lat: "13.6654",
      lng: "100.6331",
    },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: false,
      secure: "ทั่วไป",
      maxCap: 5000,
      curCap: 3250,
      capUnit: "m²",
      remarks: "พื้นที่จัดเก็บมาตรฐาน",
    },
    inv: {
      sku: 2456,
      qty: 128560,
      value: 15780250,
      reserved: 18450,
      available: 95420,
      pendingIn: 14320,
      pendingOut: 8710,
    },
    locations: [
      {
        code: "ZONE-A",
        name: "Zone A",
        children: [
          {
            code: "RACK-01",
            name: "Rack 01",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-A01",
                    name: "Bin A01",
                    binType: "Pick Face",
                    cap: 100,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: false,
                    putaway: true,
                    status: "Active",
                  },
                  {
                    code: "BIN-A02",
                    name: "Bin A02",
                    binType: "Pick Face",
                    cap: 100,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: true,
                    putaway: true,
                    status: "Active",
                  },
                  {
                    code: "BIN-A03",
                    name: "Bin A03",
                    binType: "Bulk",
                    cap: 250,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: true,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
              {
                code: "SHELF-02",
                name: "Shelf 02",
                children: [
                  {
                    code: "BIN-A04",
                    name: "Bin A04",
                    binType: "Bulk",
                    cap: 250,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: true,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
          {
            code: "RACK-02",
            name: "Rack 02",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-B01",
                    name: "Bin B01",
                    binType: "Pick Face",
                    cap: 100,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: true,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        code: "ZONE-B",
        name: "Zone B",
        children: [
          {
            code: "RACK-01",
            name: "Rack 01",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-C01",
                    name: "Bin C01",
                    binType: "Bulk",
                    cap: 500,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: false,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    docs: [
      {
        type: "Warehouse License",
        name: "ใบอนุญาตคลังสินค้า.pdf",
        issue: "01/01/2024",
        expiry: "31/12/2026",
        status: "Active",
        by: "Pimpaka S.",
        date: "05/01/2024",
      },
      {
        type: "Safety Certificate",
        name: "ใบรับรองความปลอดภัย.pdf",
        issue: "15/03/2024",
        expiry: "15/09/2026",
        status: "Active",
        by: "Somchai B.",
        date: "20/03/2024",
      },
      {
        type: "Layout Drawing",
        name: "ผังคลัง WH-BKK.pdf",
        issue: "01/01/2024",
        expiry: "—",
        status: "Active",
        by: "Pimpaka S.",
        date: "05/01/2024",
      },
    ],
    history: [
      {
        t: "Configuration changed",
        d: "เปิดใช้งาน Allow Returns",
        u: "Pimpaka S.",
        when: "22/07/2026 10:15",
        kind: "primary",
      },
      {
        t: "Manager changed",
        d: "ผู้จัดการคลัง สมหญิง → สมชาย วงศ์ดี",
        u: "Pimpaka S.",
        when: "01/06/2026 09:00",
        kind: "info",
      },
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "05/01/2024 08:30",
        kind: "",
      },
    ],
    created: "05/01/2024 08:30",
    createdBy: "Pimpaka S.",
    updated: "22/07/2026 10:15",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "WH-BKK-COLD",
    name: "Bangkok Cold Storage",
    nameTh: "ห้องเย็น กรุงเทพฯ",
    type: "Cold Storage",
    icon: "❄️",
    status: "Active",
    desc: "ห้องเย็นสำหรับวัสดุที่ต้องควบคุมอุณหภูมิ",
    manager: "ณัฐวุฒิ ใจดี",
    phone: "02-123-4568",
    email: "nattawut.j@afactory.co.th",
    config: {
      purchase: true,
      sales: true,
      transfer: true,
      production: false,
      returns: false,
      negative: false,
      isDefault: false,
      valuation: "FIFO",
      costing: "FIFO",
    },
    addr: {
      line: "123 ถนนสุขุมวิท (อาคาร B)",
      sub: "แขวงบางนาเหนือ",
      dist: "เขตบางนา",
      prov: "กรุงเทพมหานคร",
      zip: "10260",
      country: "ประเทศไทย",
      maps: "",
      lat: "13.6654",
      lng: "100.6335",
    },
    rules: {
      temp: "Cold (2–8 °C)",
      humidity: true,
      hazardous: false,
      controlled: true,
      secure: "จำกัดการเข้าถึง",
      maxCap: 1000,
      curCap: 400,
      capUnit: "m²",
      remarks: "ต้องบันทึกอุณหภูมิทุก 4 ชั่วโมง",
    },
    inv: {
      sku: 184,
      qty: 8420,
      value: 2450000,
      reserved: 640,
      available: 7780,
      pendingIn: 1200,
      pendingOut: 340,
    },
    locations: [
      {
        code: "ZONE-C",
        name: "Cold Zone",
        children: [
          {
            code: "RACK-01",
            name: "Rack 01",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-CD01",
                    name: "Bin CD01",
                    binType: "Pick Face",
                    cap: 50,
                    capUnit: "Qty",
                    temp: "Cold (2–8 °C)",
                    pick: true,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    docs: [
      {
        type: "Safety Certificate",
        name: "ใบรับรองห้องเย็น.pdf",
        issue: "01/02/2024",
        expiry: "30/09/2026",
        status: "Active",
        by: "Pimpaka S.",
        date: "05/02/2024",
      },
    ],
    history: [
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "05/02/2024 09:00",
        kind: "",
      },
    ],
    created: "05/02/2024 09:00",
    createdBy: "Pimpaka S.",
    updated: "21/07/2026 14:00",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "WH-CNX",
    name: "Chiangmai Branch",
    nameTh: "คลังสาขาเชียงใหม่",
    type: "Branch Warehouse",
    icon: "🏢",
    status: "Active",
    desc: "คลังสาขาภาคเหนือ รองรับการกระจายสินค้าในพื้นที่",
    manager: "อารีย์ แก้วดี",
    phone: "053-456-789",
    email: "aree.k@afactory.co.th",
    config: {
      purchase: true,
      sales: true,
      transfer: true,
      production: false,
      returns: true,
      negative: false,
      isDefault: false,
      valuation: "Moving Average",
      costing: "FIFO",
    },
    addr: {
      line: "156/7 ถนนนิมมานเหมินท์",
      sub: "ตำบลสุเทพ",
      dist: "อำเภอเมืองเชียงใหม่",
      prov: "เชียงใหม่",
      zip: "50200",
      country: "ประเทศไทย",
      maps: "",
      lat: "18.7961",
      lng: "98.9797",
    },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: false,
      secure: "ทั่วไป",
      maxCap: 800,
      curCap: 240,
      capUnit: "m²",
      remarks: "",
    },
    inv: {
      sku: 642,
      qty: 24800,
      value: 3120000,
      reserved: 2100,
      available: 22700,
      pendingIn: 3400,
      pendingOut: 1250,
    },
    locations: [
      {
        code: "ZONE-A",
        name: "Zone A",
        children: [
          {
            code: "RACK-01",
            name: "Rack 01",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-N01",
                    name: "Bin N01",
                    binType: "Pick Face",
                    cap: 100,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: true,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    docs: [],
    history: [
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "12/03/2024 10:00",
        kind: "",
      },
    ],
    created: "12/03/2024 10:00",
    createdBy: "Somchai B.",
    updated: "20/07/2026 11:30",
    updatedBy: "Somchai B.",
  },
  {
    code: "WH-RET",
    name: "Returns Warehouse",
    nameTh: "คลังสินค้ารับคืน",
    type: "Returns",
    icon: "↩️",
    status: "Active",
    desc: "พักสินค้ารับคืนจากลูกค้าก่อนตรวจสอบ",
    manager: "ปิยดา ดีใจ",
    phone: "02-123-4570",
    email: "piyada.d@afactory.co.th",
    config: {
      purchase: false,
      sales: false,
      transfer: true,
      production: false,
      returns: true,
      negative: false,
      isDefault: false,
      valuation: "Moving Average",
      costing: "FIFO",
    },
    addr: {
      line: "123 ถนนสุขุมวิท (อาคาร C)",
      sub: "แขวงบางนาเหนือ",
      dist: "เขตบางนา",
      prov: "กรุงเทพมหานคร",
      zip: "10260",
      country: "ประเทศไทย",
      maps: "",
      lat: "",
      lng: "",
    },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: false,
      secure: "ทั่วไป",
      maxCap: 500,
      curCap: 75,
      capUnit: "m²",
      remarks: "ตรวจสอบสภาพก่อนย้ายเข้าคลังหลัก",
    },
    inv: {
      sku: 96,
      qty: 1240,
      value: 186000,
      reserved: 0,
      available: 1240,
      pendingIn: 180,
      pendingOut: 0,
    },
    locations: [
      {
        code: "ZONE-R",
        name: "Returns Zone",
        children: [
          {
            code: "RACK-01",
            name: "Rack 01",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-R01",
                    name: "Bin R01",
                    binType: "Quarantine",
                    cap: 200,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: false,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    docs: [],
    history: [
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "01/04/2024 13:00",
        kind: "",
      },
    ],
    created: "01/04/2024 13:00",
    createdBy: "Pimpaka S.",
    updated: "19/07/2026 09:20",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "WH-QTY",
    name: "Quarantine Warehouse",
    nameTh: "คลังกักกันสินค้า",
    type: "Quarantine",
    icon: "🚧",
    status: "Active",
    desc: "กักกันสินค้ารอผลตรวจ QC",
    manager: "วรินทร์ สุขใจ",
    phone: "02-123-4571",
    email: "warin.s@afactory.co.th",
    config: {
      purchase: true,
      sales: false,
      transfer: true,
      production: false,
      returns: false,
      negative: false,
      isDefault: false,
      valuation: "Moving Average",
      costing: "FIFO",
    },
    addr: {
      line: "123 ถนนสุขุมวิท (อาคาร D)",
      sub: "แขวงบางนาเหนือ",
      dist: "เขตบางนา",
      prov: "กรุงเทพมหานคร",
      zip: "10260",
      country: "ประเทศไทย",
      maps: "",
      lat: "",
      lng: "",
    },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: true,
      secure: "ควบคุมพิเศษ",
      maxCap: 300,
      curCap: 30,
      capUnit: "m²",
      remarks: "ห้ามจ่ายออกจนกว่าจะผ่าน QC",
    },
    inv: {
      sku: 42,
      qty: 680,
      value: 94000,
      reserved: 0,
      available: 0,
      pendingIn: 680,
      pendingOut: 0,
    },
    locations: [
      {
        code: "ZONE-Q",
        name: "Quarantine Zone",
        children: [
          {
            code: "RACK-01",
            name: "Rack 01",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-Q01",
                    name: "Bin Q01",
                    binType: "Quarantine",
                    cap: 150,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: false,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    docs: [],
    history: [
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "01/04/2024 13:30",
        kind: "",
      },
    ],
    created: "01/04/2024 13:30",
    createdBy: "Somchai B.",
    updated: "18/07/2026 15:45",
    updatedBy: "Somchai B.",
  },
  {
    code: "WH-TRN",
    name: "Transit Warehouse",
    nameTh: "คลังสินค้าระหว่างทาง",
    type: "Transit",
    icon: "🚚",
    status: "Active",
    desc: "สินค้าระหว่างการขนย้ายระหว่างคลัง",
    manager: "กิตติพงศ์ ใจดี",
    phone: "02-123-4572",
    email: "kittipong.j@afactory.co.th",
    config: {
      purchase: false,
      sales: false,
      transfer: true,
      production: false,
      returns: false,
      negative: true,
      isDefault: false,
      valuation: "Moving Average",
      costing: "FIFO",
    },
    addr: {
      line: "123 ถนนสุขุมวิท",
      sub: "แขวงบางนาเหนือ",
      dist: "เขตบางนา",
      prov: "กรุงเทพมหานคร",
      zip: "10260",
      country: "ประเทศไทย",
      maps: "",
      lat: "",
      lng: "",
    },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: false,
      secure: "ทั่วไป",
      maxCap: 600,
      curCap: 150,
      capUnit: "m²",
      remarks: "คลังเสมือน ไม่มีพื้นที่จริง",
    },
    inv: {
      sku: 58,
      qty: 2140,
      value: 312000,
      reserved: 2140,
      available: 0,
      pendingIn: 0,
      pendingOut: 2140,
    },
    locations: [],
    docs: [],
    history: [
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Pimpaka S.",
        when: "10/05/2024 11:00",
        kind: "",
      },
    ],
    created: "10/05/2024 11:00",
    createdBy: "Pimpaka S.",
    updated: "17/07/2026 16:10",
    updatedBy: "Pimpaka S.",
  },
  {
    code: "WH-SVC",
    name: "Service Warehouse",
    nameTh: "คลังอะไหล่บริการ",
    type: "Service",
    icon: "🔧",
    status: "Active",
    desc: "อะไหล่สำหรับงานซ่อมและบริการหลังการขาย",
    manager: "ธนากร มั่นคง",
    phone: "02-123-4573",
    email: "thanakorn.m@afactory.co.th",
    config: {
      purchase: true,
      sales: true,
      transfer: true,
      production: false,
      returns: true,
      negative: false,
      isDefault: false,
      valuation: "FIFO",
      costing: "FIFO",
    },
    addr: {
      line: "123 ถนนสุขุมวิท (อาคาร E)",
      sub: "แขวงบางนาเหนือ",
      dist: "เขตบางนา",
      prov: "กรุงเทพมหานคร",
      zip: "10260",
      country: "ประเทศไทย",
      maps: "",
      lat: "",
      lng: "",
    },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: false,
      secure: "ทั่วไป",
      maxCap: 400,
      curCap: 180,
      capUnit: "m²",
      remarks: "",
    },
    inv: {
      sku: 812,
      qty: 9600,
      value: 4280000,
      reserved: 820,
      available: 8780,
      pendingIn: 640,
      pendingOut: 410,
    },
    locations: [
      {
        code: "ZONE-S",
        name: "Service Zone",
        children: [
          {
            code: "RACK-01",
            name: "Rack 01",
            children: [
              {
                code: "SHELF-01",
                name: "Shelf 01",
                children: [
                  {
                    code: "BIN-S01",
                    name: "Bin S01",
                    binType: "Pick Face",
                    cap: 80,
                    capUnit: "Qty",
                    temp: "Ambient",
                    pick: true,
                    putaway: true,
                    status: "Active",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    docs: [],
    history: [
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "20/06/2024 09:30",
        kind: "",
      },
    ],
    created: "20/06/2024 09:30",
    createdBy: "Somchai B.",
    updated: "16/07/2026 10:00",
    updatedBy: "Somchai B.",
  },
  {
    code: "WH-OLD",
    name: "Old Rangsit Warehouse",
    nameTh: "คลังรังสิต (ปิดใช้งาน)",
    type: "Branch Warehouse",
    icon: "📦",
    status: "Inactive",
    desc: "ปิดใช้งานหลังย้ายสินค้าไปคลังหลัก",
    manager: "—",
    phone: "",
    email: "",
    config: {
      purchase: false,
      sales: false,
      transfer: false,
      production: false,
      returns: false,
      negative: false,
      isDefault: false,
      valuation: "Moving Average",
      costing: "FIFO",
    },
    addr: {
      line: "99/9 ถนนพหลโยธิน",
      sub: "ตำบลคลองหนึ่ง",
      dist: "อำเภอคลองหลวง",
      prov: "ปทุมธานี",
      zip: "12120",
      country: "ประเทศไทย",
      maps: "",
      lat: "",
      lng: "",
    },
    rules: {
      temp: "Ambient",
      humidity: false,
      hazardous: false,
      controlled: false,
      secure: "ทั่วไป",
      maxCap: 1200,
      curCap: 0,
      capUnit: "m²",
      remarks: "ไม่มีสินค้าคงเหลือ",
    },
    inv: {
      sku: 0,
      qty: 0,
      value: 0,
      reserved: 0,
      available: 0,
      pendingIn: 0,
      pendingOut: 0,
    },
    locations: [],
    docs: [],
    history: [
      {
        t: "Status changed",
        d: "Active → Inactive",
        u: "Pimpaka S.",
        when: "15/01/2026 10:00",
        kind: "warn",
      },
      {
        t: "Warehouse created",
        d: "สร้างคลังสินค้าเข้าระบบ",
        u: "Somchai B.",
        when: "08/02/2023 14:20",
        kind: "",
      },
    ],
    created: "08/02/2023 14:20",
    createdBy: "Somchai B.",
    updated: "15/01/2026 10:00",
    updatedBy: "Pimpaka S.",
  },
];
