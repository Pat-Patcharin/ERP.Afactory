/* eslint-disable */
/**
 * Workspace datasets. Every figure answers "what needs my attention right
 * now?" rather than describing the past.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface PurchaseWorkspaceData {
  user: string;
  lastUpdated: string;
  brief: {
    pendingApproval: number;
    overduePO: number;
    belowRop: number;
    deliveriesToday: number;
  };
  kpis: {
    key: string;
    icon: string;
    value: number;
    title: string;
    desc: string;
    link: string;
    goto: string;
    tone: string;
  }[];
  quickActions: {
    label: string;
    goto: string;
    icon: string;
    accent?: boolean;
  }[];
  attention: {
    key: string;
    icon: string;
    value: number;
    unit: string;
    title: string;
    link: string;
    goto: string;
    tone: string;
  }[];
  deliveries: {
    eta: string;
    supplier: string;
    po: string;
    wh: string;
    items: number;
    status: string;
  }[];
  requests: {
    no: string;
    dept: string;
    requester: string;
    priority: string;
    date: string;
    status: string;
    amount: number;
  }[];
  orders: {
    no: string;
    supplier: string;
    date: string;
    eta: string;
    status: string;
    amount: number;
  }[];
  suppliers: {
    name: string;
    icon: string;
    otd: number;
    lead: number;
    quality: number;
    open: number;
    trend: number[];
  }[];
  stock: {
    code: string;
    name: string;
    current: number;
    onOrder: number;
    backOrder: number;
    rop: number;
  }[];
}

export interface OutboundWorkspaceData {
  user: string;
  lastUpdated: string;
  brief: {
    waitingApproval: number;
    shipToday: number;
    overdue: number;
    backOrder: number;
  };
  kpis: {
    icon: string;
    value: string;
    unit?: string;
    title: string;
    desc: string;
    link: string;
    goto: string;
    tone: string;
    money?: boolean;
    bar?: number;
    sub?: string;
  }[];
  quickActions: {
    label: string;
    icon: string;
    goto: string;
    accent?: boolean;
  }[];
  tasks: {
    tag: string;
    code: string;
    label: string;
    tone: string;
    goto: string;
    badge: string;
  }[];
  pipeline: {
    stage: string;
    count: number;
    goto: string;
  }[];
  shipments: {
    do: string;
    customer: string;
    carrier: string;
    time: string;
    status: string;
    priority: string;
  }[];
  backorders: {
    code: string;
    product: string;
    customer: string;
    qty: number;
    eta: string;
    buyer: string;
  }[];
  recent: {
    Quotation: {
      no: string;
      party: string;
      date: string;
      amount: number;
      status: string;
    }[];
    "Sales Request": {
      no: string;
      party: string;
      date: string;
      amount: number;
      status: string;
    }[];
    "Sales Order": {
      no: string;
      party: string;
      date: string;
      amount: number;
      status: string;
    }[];
    Delivery: {
      no: string;
      party: string;
      date: string;
      amount: number;
      status: string;
    }[];
    Invoice: {
      no: string;
      party: string;
      date: string;
      amount: number;
      status: string;
    }[];
    Return: {
      no: string;
      party: string;
      date: string;
      amount: number;
      status: string;
    }[];
  };
  insights: {
    tone: string;
    icon: string;
    text: string;
    goto: string;
  }[];
}

export const WS_DATA: PurchaseWorkspaceData = {
  user: "Pim",
  lastUpdated: "09:30 AM",
  brief: {
    pendingApproval: 12,
    overduePO: 3,
    belowRop: 8,
    deliveriesToday: 5,
  },
  kpis: [
    {
      key: "pending",
      icon: "file",
      value: 12,
      title: "Pending Approval",
      desc: "Need manager approval",
      link: "View Approval Center",
      goto: "Approval Center",
      tone: "warning",
    },
    {
      key: "waitingPo",
      icon: "cart",
      value: 8,
      title: "Waiting Purchase Order",
      desc: "Approved PR waiting PO",
      link: "View Purchase Request",
      goto: "Purchase Request",
      tone: "info",
    },
    {
      key: "receiving",
      icon: "truck",
      value: 5,
      title: "Receiving Today",
      desc: "Expected to receive today",
      link: "View Today's Deliveries",
      goto: "Goods Receipt",
      tone: "success",
    },
    {
      key: "overdue",
      icon: "clock",
      value: 3,
      title: "Overdue PO",
      desc: "Late delivery",
      link: "View Overdue PO",
      goto: "Purchase Order",
      tone: "danger",
    },
  ],
  quickActions: [
    {
      label: "New Purchase Request",
      goto: "Purchase Request",
      icon: "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6\"/><path d=\"M12 11v6M9 14h6\"/>",
      accent: true,
    },
    {
      label: "Create Purchase Order",
      goto: "Purchase Order",
      icon: "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6\"/><path d=\"m9 15 2 2 4-4\"/>",
    },
    {
      label: "Goods Receipt",
      goto: "Goods Receipt",
      icon: "<path d=\"M12 3 3 7.5v9L12 21l9-4.5v-9z\"/><path d=\"m8 5.2 8 4.3v4\"/><path d=\"M3 7.5 12 12l9-4.5\"/>",
    },
    {
      label: "Supplier Master",
      goto: "Business Partner",
      icon: "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.9\"/><path d=\"M16 3.1a4 4 0 0 1 0 7.8\"/>",
    },
    {
      label: "Stock Inquiry",
      goto: "Stock Balance",
      icon: "<path d=\"M3 3v18h18\"/><path d=\"m7 14 3-3 3 3 5-6\"/>",
    },
  ],
  attention: [
    {
      key: "critical",
      icon: "alert",
      value: 8,
      unit: "Items",
      title: "Critical Stock",
      link: "View Items",
      goto: "Stock Balance",
      tone: "danger",
    },
    {
      key: "rop",
      value: 21,
      unit: "Items",
      icon: "<path d=\"M12 5v14M5 12l7 7 7-7\"/>",
      title: "Below Reorder Point",
      link: "View Items",
      goto: "Stock Balance",
      tone: "warning",
    },
    {
      key: "delay",
      value: 5,
      unit: "Orders",
      icon: "<path d=\"M2 9h13v8H2z\"/><path d=\"M15 11h4l3 3v3h-7z\"/><circle cx=\"6\" cy=\"18\" r=\"2\"/><circle cx=\"18\" cy=\"18\" r=\"2\"/>",
      title: "Supplier Delay",
      link: "View Orders",
      goto: "Purchase Order",
      tone: "warning",
    },
    {
      key: "approval",
      value: 12,
      unit: "Documents",
      icon: "file",
      title: "Pending Approval",
      link: "View All",
      goto: "Approval Center",
      tone: "info",
    },
  ],
  deliveries: [
    {
      eta: "10:30 AM",
      supplier: "DentCare Co., Ltd.",
      po: "PO2506-0287",
      wh: "WH-BKK",
      items: 12,
      status: "Expected",
    },
    {
      eta: "11:00 AM",
      supplier: "Siam Medical Supply",
      po: "PO2506-0291",
      wh: "WH-BKK",
      items: 8,
      status: "Expected",
    },
    {
      eta: "02:00 PM",
      supplier: "BKK Dental Lab",
      po: "PO2506-0289",
      wh: "WH-CNX",
      items: 5,
      status: "Partial",
    },
    {
      eta: "03:30 PM",
      supplier: "Advanced Dental Co.",
      po: "PO2506-0285",
      wh: "WH-BKK",
      items: 20,
      status: "Expected",
    },
    {
      eta: "04:30 PM",
      supplier: "Dental Innovation",
      po: "PO2506-0288",
      wh: "WH-BKK",
      items: 7,
      status: "Late",
    },
  ],
  requests: [
    {
      no: "PR2506-0124",
      dept: "Operation",
      requester: "Nattapong K.",
      priority: "Critical",
      date: "26/07/2025",
      status: "Pending Approval",
      amount: 125450,
    },
    {
      no: "PR2506-0123",
      dept: "Sales",
      requester: "Patcharin T.",
      priority: "High",
      date: "26/07/2025",
      status: "Approved",
      amount: 85230,
    },
    {
      no: "PR2506-0122",
      dept: "Production",
      requester: "Wichai P.",
      priority: "Normal",
      date: "25/07/2025",
      status: "Waiting PO",
      amount: 42100,
    },
    {
      no: "PR2506-0121",
      dept: "Marketing",
      requester: "Supaporn S.",
      priority: "High",
      date: "25/07/2025",
      status: "Approved",
      amount: 68900,
    },
    {
      no: "PR2506-0120",
      dept: "IT",
      requester: "Tanawat R.",
      priority: "Normal",
      date: "24/07/2025",
      status: "Rejected",
      amount: 12400,
    },
  ],
  orders: [
    {
      no: "PO2506-0289",
      supplier: "BKK Dental Lab",
      date: "25/07/2025",
      eta: "26/07/2025",
      status: "Partial",
      amount: 52600,
    },
    {
      no: "PO2506-0288",
      supplier: "Dental Innovation",
      date: "24/07/2025",
      eta: "27/07/2025",
      status: "Open",
      amount: 37800,
    },
    {
      no: "PO2506-0287",
      supplier: "DentCare Co., Ltd.",
      date: "24/07/2025",
      eta: "26/07/2025",
      status: "Open",
      amount: 125450,
    },
    {
      no: "PO2506-0286",
      supplier: "Siam Medical Supply",
      date: "23/07/2025",
      eta: "28/07/2025",
      status: "Open",
      amount: 85230,
    },
    {
      no: "PO2506-0285",
      supplier: "Advanced Dental Co.",
      date: "23/07/2025",
      eta: "27/07/2025",
      status: "Overdue",
      amount: 96500,
    },
  ],
  suppliers: [
    {
      name: "DentCare Co., Ltd.",
      icon: "🦷",
      otd: 98,
      lead: 4.2,
      quality: 99.1,
      open: 2,
      trend: [92, 94, 93, 96, 95, 97, 98],
    },
    {
      name: "Siam Medical Supply",
      icon: "💊",
      otd: 95,
      lead: 5.1,
      quality: 97.8,
      open: 3,
      trend: [90, 91, 93, 92, 94, 94, 95],
    },
    {
      name: "BKK Dental Lab",
      icon: "🔬",
      otd: 93,
      lead: 6.3,
      quality: 98.3,
      open: 1,
      trend: [88, 89, 90, 91, 92, 92, 93],
    },
    {
      name: "Advanced Dental Co.",
      icon: "🏥",
      otd: 90,
      lead: 7.2,
      quality: 96.5,
      open: 4,
      trend: [95, 93, 92, 90, 91, 90, 90],
    },
    {
      name: "Dental Innovation",
      icon: "⚙️",
      otd: 88,
      lead: 8.4,
      quality: 95.2,
      open: 2,
      trend: [94, 92, 91, 90, 89, 89, 88],
    },
  ],
  stock: [
    {
      code: "A-TH003",
      name: "Composite A3 Shade",
      current: 5,
      onOrder: 0,
      backOrder: 12,
      rop: 20,
    },
    {
      code: "CEM-001",
      name: "Cement Universal",
      current: 8,
      onOrder: 10,
      backOrder: 15,
      rop: 25,
    },
    {
      code: "BOND-01",
      name: "Bonding Agent 5ml",
      current: 12,
      onOrder: 5,
      backOrder: 10,
      rop: 20,
    },
    {
      code: "ETCH-01",
      name: "Etching Gel 37%",
      current: 15,
      onOrder: 10,
      backOrder: 5,
      rop: 15,
    },
    {
      code: "IMP-01",
      name: "Impression Material",
      current: 30,
      onOrder: 20,
      backOrder: 5,
      rop: 20,
    },
  ],
};

export const OB_DATA: OutboundWorkspaceData = {
  user: "Anucha",
  lastUpdated: "09:30 AM",
  brief: {
    waitingApproval: 6,
    shipToday: 4,
    overdue: 1,
    backOrder: 8,
  },
  kpis: [
    {
      icon: "cart",
      value: "1,250,000",
      unit: "THB",
      title: "Today's Sales",
      desc: "▲ 12% vs. last week",
      link: "View Sales Orders",
      goto: "Sales Order",
      tone: "success",
      money: true,
    },
    {
      icon: "file",
      value: "12,480,000",
      unit: "THB",
      title: "MTD Sales",
      desc: "▲ 8% vs. last month",
      link: "View report",
      goto: "Reports",
      tone: "info",
      money: true,
    },
    {
      icon: "shield",
      value: "78",
      unit: "%",
      title: "Target Achievement",
      desc: "Target 16,000,000 THB",
      link: "View target",
      goto: "Reports",
      tone: "info",
      bar: 78,
    },
    {
      icon: "file",
      value: "12",
      title: "Outstanding Quotation",
      desc: "5 overdue",
      link: "View Quotations",
      goto: "Quotation",
      tone: "warning",
      sub: "5 Overdue",
    },
    {
      icon: "file",
      value: "7",
      title: "Waiting Sales Request",
      desc: "2 overdue",
      link: "View Sales Requests",
      goto: "Sales Request",
      tone: "info",
      sub: "2 Overdue",
    },
    {
      icon: "file",
      value: "6",
      title: "Waiting SO Approval",
      desc: "3 overdue",
      link: "Approve now",
      goto: "Sales Order",
      tone: "warning",
      sub: "3 Overdue",
    },
    {
      icon: "box",
      value: "5",
      title: "Waiting Picking",
      desc: "2 overdue",
      link: "Open picking",
      goto: "Picking",
      tone: "warning",
      sub: "2 Overdue",
    },
    {
      icon: "truck",
      value: "4",
      title: "Waiting Shipment",
      desc: "1 overdue",
      link: "View shipments",
      goto: "Delivery Order",
      tone: "info",
      sub: "1 Overdue",
    },
    {
      icon: "box",
      value: "8",
      title: "Back Order",
      desc: "4 high priority",
      link: "Review back orders",
      goto: "Sales Order",
      tone: "danger",
      sub: "4 High Priority",
    },
    {
      icon: "alert",
      value: "3",
      title: "Return Request",
      desc: "1 overdue",
      link: "View returns",
      goto: "Return",
      tone: "warning",
      sub: "1 Overdue",
    },
  ],
  quickActions: [
    {
      label: "Create Quotation",
      icon: "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6M12 11v6M9 14h6\"/>",
      goto: "Quotation",
      accent: true,
    },
    {
      label: "Create Sales Request",
      icon: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v10M9.5 9.5h5M9.5 14.5h5\"/>",
      goto: "Sales Request",
    },
    {
      label: "Create Sales Order",
      icon: "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6M8 13h8M8 17h5\"/>",
      goto: "Sales Order",
    },
    {
      label: "Create Customer",
      icon: "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M19 8v6M22 11h-6\"/>",
      goto: "Business Partner",
    },
    {
      label: "Create Product",
      icon: "<path d=\"m21 16-9 5-9-5V8l9-5 9 5z\"/><path d=\"M12 12.2V21\"/>",
      goto: "Product",
    },
  ],
  tasks: [
    {
      tag: "SO",
      code: "SO240015",
      label: "Waiting Approval",
      tone: "warning",
      goto: "Sales Order",
      badge: "3",
    },
    {
      tag: "SO",
      code: "SO240012",
      label: "Waiting Picking",
      tone: "info",
      goto: "Picking",
      badge: "2",
    },
    {
      tag: "QT",
      code: "QT240088",
      label: "Quotation follow-up",
      tone: "neutral",
      goto: "Quotation",
      badge: "1",
    },
    {
      tag: "CU",
      code: "Bright Dental",
      label: "Customer waiting response",
      tone: "neutral",
      goto: "Business Partner",
      badge: "",
    },
    {
      tag: "DO",
      code: "DO240031",
      label: "Shipment today",
      tone: "success",
      goto: "Delivery Order",
      badge: "",
    },
  ],
  pipeline: [
    {
      stage: "Quotation",
      count: 12,
      goto: "Quotation",
    },
    {
      stage: "Sales Request",
      count: 7,
      goto: "Sales Request",
    },
    {
      stage: "Sales Order",
      count: 18,
      goto: "Sales Order",
    },
    {
      stage: "Picking",
      count: 5,
      goto: "Picking",
    },
    {
      stage: "Shipment",
      count: 4,
      goto: "Delivery Order",
    },
    {
      stage: "Delivered",
      count: 31,
      goto: "Delivery Order",
    },
  ],
  shipments: [
    {
      do: "DO240031",
      customer: "Bright Dental Clinic",
      carrier: "Kerry Express",
      time: "10:30",
      status: "Picking",
      priority: "High",
    },
    {
      do: "DO240032",
      customer: "Smile Gallery",
      carrier: "Flash",
      time: "11:00",
      status: "Ready",
      priority: "Normal",
    },
    {
      do: "DO240033",
      customer: "ABC Dental Co., Ltd.",
      carrier: "Own Fleet",
      time: "13:30",
      status: "Shipped",
      priority: "High",
    },
    {
      do: "DO240034",
      customer: "Chiang Mai Ram Hospital",
      carrier: "Kerry Express",
      time: "15:00",
      status: "Delayed",
      priority: "Critical",
    },
  ],
  backorders: [
    {
      code: "AB-AC001",
      product: "Composite A3",
      customer: "Bright Dental Clinic",
      qty: 120,
      eta: "02/08/2026",
      buyer: "Pat T.",
    },
    {
      code: "AT-HP001",
      product: "Dental Handpiece",
      customer: "Smile Gallery",
      qty: 10,
      eta: "05/08/2026",
      buyer: "Narin C.",
    },
    {
      code: "AA-TH003-WL",
      product: "A-FLEX PU40 White",
      customer: "ABC Dental",
      qty: 300,
      eta: "30/07/2026",
      buyer: "Pat T.",
    },
    {
      code: "AT-SL001",
      product: "Scaler Tip",
      customer: "Thantakit Clinic",
      qty: 200,
      eta: "08/08/2026",
      buyer: "Somchai S.",
    },
  ],
  recent: {
    Quotation: [
      {
        no: "QT240088",
        party: "Bright Dental Clinic",
        date: "28/07/2026",
        amount: 125000,
        status: "Sent",
      },
      {
        no: "QT240087",
        party: "Smile Gallery",
        date: "27/07/2026",
        amount: 86500,
        status: "Draft",
      },
      {
        no: "QT240086",
        party: "ABC Dental Co., Ltd.",
        date: "26/07/2026",
        amount: 210300,
        status: "Accepted",
      },
    ],
    "Sales Request": [
      {
        no: "SR240041",
        party: "Chiang Mai Ram Hospital",
        date: "28/07/2026",
        amount: 180000,
        status: "Pending",
      },
      {
        no: "SR240040",
        party: "Bright Dental Clinic",
        date: "27/07/2026",
        amount: 98500,
        status: "Approved",
      },
    ],
    "Sales Order": [
      {
        no: "SO240015",
        party: "Bright Dental Clinic",
        date: "28/07/2026",
        amount: 125000,
        status: "Pending Approval",
      },
      {
        no: "SO240014",
        party: "Smile Gallery",
        date: "27/07/2026",
        amount: 75300,
        status: "Picking",
      },
      {
        no: "SO240013",
        party: "ABC Dental Co., Ltd.",
        date: "26/07/2026",
        amount: 210300,
        status: "Completed",
      },
    ],
    Delivery: [
      {
        no: "DO240031",
        party: "Bright Dental Clinic",
        date: "29/07/2026",
        amount: 125000,
        status: "Picking",
      },
      {
        no: "DO240030",
        party: "Thantakit Clinic",
        date: "28/07/2026",
        amount: 55000,
        status: "Shipped",
      },
    ],
    Invoice: [
      {
        no: "INV240120",
        party: "ABC Dental Co., Ltd.",
        date: "26/07/2026",
        amount: 210300,
        status: "Paid",
      },
      {
        no: "INV240119",
        party: "Smile Gallery",
        date: "25/07/2026",
        amount: 75300,
        status: "Overdue",
      },
    ],
    Return: [
      {
        no: "RT240005",
        party: "Chiang Mai Ram Hospital",
        date: "24/07/2026",
        amount: 12000,
        status: "Pending",
      },
      {
        no: "RT240004",
        party: "Bright Dental Clinic",
        date: "22/07/2026",
        amount: 8500,
        status: "Approved",
      },
    ],
  },
  insights: [
    {
      tone: "danger",
      icon: "<path d=\"M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z\"/><path d=\"M12 9v4M12 17h.01\"/>",
      text: "Composite A3 stock is critically low — 8 back orders waiting",
      goto: "Product",
    },
    {
      tone: "success",
      icon: "<path d=\"M3 3v18h18\"/><path d=\"m7 15 4-4 3 3 5-6\"/>",
      text: "Today's shipment volume increased 24% vs. yesterday",
      goto: "Delivery Order",
    },
    {
      tone: "warning",
      icon: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v4l3 2\"/>",
      text: "Three Sales Orders are waiting approval past SLA",
      goto: "Sales Order",
    },
    {
      tone: "warning",
      icon: "<path d=\"M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11h2\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/>",
      text: "One customer has overdue delivery — DO240034 delayed",
      goto: "Delivery Order",
    },
  ],
};
