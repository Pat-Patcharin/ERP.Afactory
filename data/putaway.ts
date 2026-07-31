/* eslint-disable */
/**
 * Put Away — final inbound step. Moves goods from the receiving dock or
 * QC Hold into final storage bins, then makes inventory available.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export type BinUsageMap = Record<string, number>;

export interface PutAwayTask {
  code: string;
  grRef: string;
  qcRef: string;
  warehouse: string;
  priority: string;
  status: string;
  assignedTo: string;
  createdFrom: string;
  items: {
    line: number;
    code: string;
    name: string;
    lot: string;
    serial: string;
    qty: number;
    unit: string;
    curLoc: string;
    suggestBin: string;
    destBin: string;
    status: string;
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

export const PA_STATUS = ["Waiting", "Assigned", "In Progress", "Completed", "Cancelled"] as const;

export const PA_PRIORITY = ["Low", "Medium", "High", "Critical"] as const;

export const PA_STAFF = ["Somchai B.", "Warin S.", "Nattapong K.", "Anan P."] as const;

export const PA_BIN_USAGE: BinUsageMap = {
  "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01": 20,
  "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A02": 95,
  "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A03": 60,
  "WH-BKK/ZONE-A/RACK-01/SHELF-02/BIN-A04": 40,
};

export const PUTAWAY_TASKS: PutAwayTask[] = [
  {
    code: "PA25060015",
    grRef: "GR25060002",
    qcRef: "",
    warehouse: "WH02 Raw Material Warehouse",
    priority: "High",
    status: "Waiting",
    assignedTo: "",
    createdFrom: "GR",
    items: [
      {
        line: 1,
        code: "AA-TH003-WL",
        name: "A-FLEX PU40 (White)",
        lot: "LOT-AFX-2506",
        serial: "",
        qty: 300,
        unit: "Syringe",
        curLoc: "Receiving Dock",
        suggestBin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01",
        destBin: "",
        status: "Waiting",
      },
      {
        line: 2,
        code: "ETCH-01",
        name: "Etching Gel 37%",
        lot: "LOT-ETCH-2506",
        serial: "",
        qty: 200,
        unit: "Syringe",
        curLoc: "Receiving Dock",
        suggestBin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A03",
        destBin: "",
        status: "Waiting",
      },
    ],
    history: [
      {
        t: "Task created",
        d: "สร้างจาก GR25060002 (QC Not Required)",
        u: "System",
        when: "15/06/2025 16:05",
        kind: "",
      },
    ],
    created: "15/06/2025 16:05",
    createdBy: "System",
    updated: "15/06/2025 16:05",
    updatedBy: "System",
  },
  {
    code: "PA25060014",
    grRef: "GR25060005",
    qcRef: "QC25060029",
    warehouse: "WH01 Main Warehouse",
    priority: "Medium",
    status: "Assigned",
    assignedTo: "Somchai B.",
    createdFrom: "QC",
    items: [
      {
        line: 1,
        code: "AA-TH003-GR",
        name: "A-FLEX PU40 (Grey)",
        lot: "LOT-AFXG-2506",
        serial: "",
        qty: 160,
        unit: "Syringe",
        curLoc: "WH-QC Quality Hold",
        suggestBin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01",
        destBin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01",
        status: "Assigned",
      },
    ],
    history: [
      {
        t: "Assigned",
        d: "มอบหมายให้ Somchai B.",
        u: "Warin S.",
        when: "11/06/2025 10:00",
        kind: "info",
      },
      {
        t: "Task created",
        d: "สร้างจาก QC25060029 (Passed)",
        u: "System",
        when: "11/06/2025 09:35",
        kind: "",
      },
    ],
    created: "11/06/2025 09:35",
    createdBy: "System",
    updated: "11/06/2025 10:00",
    updatedBy: "Warin S.",
  },
  {
    code: "PA25060013",
    grRef: "GR25060038",
    qcRef: "QC25060028",
    warehouse: "WH02 Raw Material Warehouse",
    priority: "Medium",
    status: "In Progress",
    assignedTo: "Warin S.",
    createdFrom: "QC",
    items: [
      {
        line: 1,
        code: "AT-HP001",
        name: "Dental Handpiece",
        lot: "",
        serial: "SN-HP2405001",
        qty: 10,
        unit: "PCS",
        curLoc: "WH-QC Quality Hold",
        suggestBin: "WH-BKK/ZONE-A/RACK-02/SHELF-01/BIN-B01",
        destBin: "WH-BKK/ZONE-A/RACK-02/SHELF-01/BIN-B01",
        status: "In Progress",
      },
    ],
    history: [
      {
        t: "Started",
        d: "เริ่มจัดเก็บ",
        u: "Warin S.",
        when: "10/06/2025 15:10",
        kind: "primary",
      },
      {
        t: "Assigned",
        d: "มอบหมายให้ Warin S.",
        u: "Warin S.",
        when: "10/06/2025 15:05",
        kind: "info",
      },
      {
        t: "Task created",
        d: "สร้างจาก QC25060028 (Passed)",
        u: "System",
        when: "10/06/2025 15:00",
        kind: "",
      },
    ],
    created: "10/06/2025 15:00",
    createdBy: "System",
    updated: "10/06/2025 15:10",
    updatedBy: "Warin S.",
  },
  {
    code: "PA25060012",
    grRef: "GR25060037",
    qcRef: "QC25060029",
    warehouse: "WH02 Raw Material Warehouse",
    priority: "Low",
    status: "Completed",
    assignedTo: "Somchai B.",
    createdFrom: "QC",
    items: [
      {
        line: 1,
        code: "AT-MD001",
        name: "Endodontic File 25mm",
        lot: "LOT-F240201",
        serial: "",
        qty: 120,
        unit: "PCS",
        curLoc: "WH-QC Quality Hold",
        suggestBin: "WH-BKK/ZONE-A/RACK-01/SHELF-02/BIN-A04",
        destBin: "WH-BKK/ZONE-A/RACK-01/SHELF-02/BIN-A04",
        status: "Completed",
      },
    ],
    history: [
      {
        t: "Put Away confirmed",
        d: "จัดเก็บ 120 หน่วย เข้า BIN-A04 · สต็อกพร้อมใช้งาน",
        u: "Somchai B.",
        when: "11/06/2025 14:00",
        kind: "primary",
      },
      {
        t: "Task created",
        d: "สร้างจาก QC25060029",
        u: "System",
        when: "11/06/2025 13:35",
        kind: "",
      },
    ],
    created: "11/06/2025 13:35",
    createdBy: "System",
    updated: "11/06/2025 14:00",
    updatedBy: "Somchai B.",
  },
  {
    code: "PA25060011",
    grRef: "GR25060030",
    qcRef: "",
    warehouse: "WH01 Main Warehouse",
    priority: "Critical",
    status: "Waiting",
    assignedTo: "",
    createdFrom: "GR",
    items: [
      {
        line: 1,
        code: "BOND-01",
        name: "Bonding Agent 5ml",
        lot: "LOT-B240302",
        serial: "",
        qty: 50,
        unit: "Bottle",
        curLoc: "Receiving Dock",
        suggestBin: "WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A02",
        destBin: "",
        status: "Waiting",
      },
    ],
    history: [
      {
        t: "Task created",
        d: "สร้างจาก GR25060030",
        u: "System",
        when: "13/06/2025 09:00",
        kind: "",
      },
    ],
    created: "13/06/2025 09:00",
    createdBy: "System",
    updated: "13/06/2025 09:00",
    updatedBy: "System",
  },
];
