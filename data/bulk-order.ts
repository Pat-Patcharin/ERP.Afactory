/**
 * A deliberately large order — the multi-page print fixture.
 *
 * Every other mock document fits on one printed page, which means the
 * pagination rules (first-page capacity, continuation pages, totals only on
 * the final page, filler rows) would never actually run against real data.
 * This catalogue is shared by SO2506-0009 and DO2507-0006 so the same order
 * can be printed as a priced sales order, an operational delivery order and
 * a delivery / tax invoice.
 *
 * It carries on purpose:
 *   · 38 items — more than any single page holds
 *   · multi-line descriptions (`note`, split on " | " when printed)
 *   · lot numbers on consumables, serial numbers on equipment
 *   · eight different units of measure
 */

export interface BulkItem {
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  disc: number;
  tax: number;
  lot: string;
  serial: string;
  note: string;
  box: string;
}

const L = (n: number) => `LOT-2506-${String(n).padStart(3, "0")}`;

export const BULK_ORDER_ITEMS: BulkItem[] = [
  { code: "AA-TH003-WL", name: "A-FLEX PU40 Polyurethane Sealant (White)", unit: "Tube", qty: 240, price: 185, disc: 5, tax: 7, lot: L(1), serial: "", note: "หลอด 600 ml. บรรจุ 20 หลอด/กล่อง | อายุการเก็บ 12 เดือน", box: "BOX-01" },
  { code: "AA-TH003-GR", name: "A-FLEX PU40 Polyurethane Sealant (Grey)", unit: "Tube", qty: 180, price: 185, disc: 5, tax: 7, lot: L(2), serial: "", note: "หลอด 600 ml. บรรจุ 20 หลอด/กล่อง", box: "BOX-01" },
  { code: "AA-TH003-BK", name: "A-FLEX PU40 Polyurethane Sealant (Black)", unit: "Tube", qty: 120, price: 185, disc: 5, tax: 7, lot: L(3), serial: "", note: "หลอด 600 ml.", box: "BOX-01" },
  { code: "AA-TH003-BG", name: "A-FLEX PU40 Polyurethane Sealant (Beige)", unit: "Tube", qty: 96, price: 189, disc: 0, tax: 7, lot: L(4), serial: "", note: "สีสั่งผลิตพิเศษ ไม่รับคืน", box: "BOX-01" },
  { code: "AA-TH050-WL", name: "A-FLEX PU50 Hi-Modulus Sealant (White)", unit: "Tube", qty: 144, price: 235, disc: 3, tax: 7, lot: L(5), serial: "", note: "สำหรับงานรอยต่อโครงสร้าง | ทนแรงดึงสูง", box: "BOX-02" },
  { code: "AA-TH050-GR", name: "A-FLEX PU50 Hi-Modulus Sealant (Grey)", unit: "Tube", qty: 144, price: 235, disc: 3, tax: 7, lot: L(6), serial: "", note: "", box: "BOX-02" },
  { code: "AB-AC001", name: "A-ACRYLIC 100% Sealant (White)", unit: "Tube", qty: 200, price: 92, disc: 8, tax: 7, lot: L(7), serial: "", note: "ทาสีทับได้ ภายในอาคาร", box: "BOX-02" },
  { code: "AB-AC002", name: "A-ACRYLIC Paintable Filler (White)", unit: "Tube", qty: 160, price: 88, disc: 8, tax: 7, lot: L(8), serial: "", note: "", box: "BOX-02" },
  { code: "AB-AC010", name: "A-ACRYLIC Wall Repair Compound", unit: "Pail", qty: 12, price: 1450, disc: 0, tax: 7, lot: L(9), serial: "", note: "ถัง 20 กก. | ยกด้วยความระมัดระวัง", box: "PALLET-01" },
  { code: "AT-SL001", name: "A-SILICONE 300 Neutral Cure (Clear)", unit: "Tube", qty: 300, price: 128, disc: 10, tax: 7, lot: L(10), serial: "", note: "ไม่กัดกระจกและอลูมิเนียม", box: "BOX-03" },
  { code: "AT-SL002", name: "A-SILICONE 300 Neutral Cure (White)", unit: "Tube", qty: 240, price: 128, disc: 10, tax: 7, lot: L(11), serial: "", note: "", box: "BOX-03" },
  { code: "AT-SL003", name: "A-SILICONE 300 Neutral Cure (Black)", unit: "Tube", qty: 120, price: 132, disc: 10, tax: 7, lot: L(12), serial: "", note: "", box: "BOX-03" },
  { code: "AT-SL100", name: "A-SILICONE Sanitary Anti-Fungus (White)", unit: "Tube", qty: 180, price: 156, disc: 5, tax: 7, lot: L(13), serial: "", note: "สำหรับห้องน้ำและครัว | มีสารป้องกันเชื้อรา", box: "BOX-03" },
  { code: "AT-SL200", name: "A-SILICONE Structural Glazing (Black)", unit: "Tube", qty: 90, price: 320, disc: 0, tax: 7, lot: L(14), serial: "", note: "ผ่านการทดสอบ ASTM C1184", box: "BOX-04" },
  { code: "AH-MS001", name: "A-BOND MS Polymer Adhesive (White)", unit: "Tube", qty: 150, price: 268, disc: 5, tax: 7, lot: L(15), serial: "", note: "ยึดเกาะได้โดยไม่ต้องใช้ไพรเมอร์", box: "BOX-04" },
  { code: "AH-MS002", name: "A-BOND MS Polymer Adhesive (Grey)", unit: "Tube", qty: 150, price: 268, disc: 5, tax: 7, lot: L(16), serial: "", note: "", box: "BOX-04" },
  { code: "AH-EP010", name: "A-BOND Epoxy Anchor A+B 400 ml.", unit: "Set", qty: 60, price: 890, disc: 0, tax: 7, lot: L(17), serial: "", note: "ชุด A+B พร้อมหัวผสมสถิต 2 หัว | เก็บที่อุณหภูมิไม่เกิน 30°C", box: "BOX-05" },
  { code: "AH-EP020", name: "A-BOND Epoxy Anchor A+B 585 ml.", unit: "Set", qty: 40, price: 1180, disc: 0, tax: 7, lot: L(18), serial: "", note: "ชุด A+B พร้อมหัวผสมสถิต 2 หัว", box: "BOX-05" },
  { code: "AH-CA005", name: "A-BOND Instant CA Adhesive 50 g.", unit: "Pcs", qty: 240, price: 145, disc: 12, tax: 7, lot: L(19), serial: "", note: "", box: "BOX-05" },
  { code: "AP-PR001", name: "A-PRIME Universal Primer 1 L.", unit: "Can", qty: 36, price: 720, disc: 0, tax: 7, lot: L(20), serial: "", note: "วัตถุไวไฟ ขนส่งตามข้อกำหนด | ห้ามวางใกล้ความร้อน", box: "PALLET-01" },
  { code: "AP-PR002", name: "A-PRIME Concrete Primer 4 L.", unit: "Can", qty: 18, price: 2380, disc: 0, tax: 7, lot: L(21), serial: "", note: "วัตถุไวไฟ ขนส่งตามข้อกำหนด", box: "PALLET-01" },
  { code: "AP-CL001", name: "A-CLEAN Surface Cleaner 1 L.", unit: "Can", qty: 48, price: 385, disc: 5, tax: 7, lot: L(22), serial: "", note: "", box: "PALLET-01" },
  { code: "AF-BR020", name: "A-FOAM Backer Rod 20 mm. x 50 m.", unit: "Roll", qty: 60, price: 420, disc: 0, tax: 7, lot: L(23), serial: "", note: "โฟมรองหลังรอยต่อ | ขนาดใหญ่ กินพื้นที่ขนส่ง", box: "PALLET-02" },
  { code: "AF-BR030", name: "A-FOAM Backer Rod 30 mm. x 30 m.", unit: "Roll", qty: 40, price: 480, disc: 0, tax: 7, lot: L(24), serial: "", note: "", box: "PALLET-02" },
  { code: "AF-PU750", name: "A-FOAM PU Gun Foam 750 ml.", unit: "Can", qty: 72, price: 265, disc: 8, tax: 7, lot: L(25), serial: "", note: "กระป๋องแรงดัน ห้ามเจาะหรือเผา", box: "BOX-06" },
  { code: "AT-MT024", name: "A-TAPE Masking Tape 24 mm. x 20 m.", unit: "Roll", qty: 240, price: 38, disc: 15, tax: 7, lot: L(26), serial: "", note: "", box: "BOX-06" },
  { code: "AT-MT048", name: "A-TAPE Masking Tape 48 mm. x 20 m.", unit: "Roll", qty: 120, price: 68, disc: 15, tax: 7, lot: L(27), serial: "", note: "", box: "BOX-06" },
  { code: "AT-DS050", name: "A-TAPE Double Sided Foam 50 mm. x 10 m.", unit: "Roll", qty: 60, price: 245, disc: 10, tax: 7, lot: L(28), serial: "", note: "", box: "BOX-06" },
  { code: "AG-MN400", name: "A-GUN Manual Caulking Gun 400 ml.", unit: "Pcs", qty: 24, price: 680, disc: 0, tax: 7, lot: "", serial: "SN-MN400-24011", note: "รับประกัน 12 เดือน", box: "BOX-07" },
  { code: "AG-MN600", name: "A-GUN Manual Caulking Gun 600 ml.", unit: "Pcs", qty: 18, price: 850, disc: 0, tax: 7, lot: "", serial: "SN-MN600-24027", note: "รับประกัน 12 เดือน", box: "BOX-07" },
  { code: "AG-PN600", name: "A-GUN Pneumatic Sealant Gun 600 ml.", unit: "Pcs", qty: 6, price: 4850, disc: 0, tax: 7, lot: "", serial: "SN-PN600-24003", note: "ต้องใช้ลม 6 บาร์ | มีคู่มือและใบรับประกันในกล่อง", box: "BOX-07" },
  { code: "AG-BT600", name: "A-GUN Cordless Battery Gun 600 ml.", unit: "Set", qty: 4, price: 12800, disc: 0, tax: 7, lot: "", serial: "SN-BT600-24001", note: "ชุดพร้อมแบตเตอรี่ 2 ก้อนและแท่นชาร์จ | ตรวจสอบซีเรียลก่อนส่งมอบ", box: "BOX-07" },
  { code: "AG-NZ001", name: "A-GUN Replacement Nozzle (Pack 50)", unit: "Pack", qty: 30, price: 320, disc: 10, tax: 7, lot: L(29), serial: "", note: "", box: "BOX-08" },
  { code: "AG-SP001", name: "A-TOOL Sealant Smoothing Spatula Set", unit: "Set", qty: 36, price: 180, disc: 10, tax: 7, lot: "", serial: "", note: "ชุด 5 ชิ้น", box: "BOX-08" },
  { code: "AS-GL001", name: "A-SAFE Nitrile Gloves (Box 100)", unit: "Box", qty: 48, price: 240, disc: 5, tax: 7, lot: L(30), serial: "", note: "", box: "BOX-08" },
  { code: "AS-MK001", name: "A-SAFE Dust Mask N95 (Box 20)", unit: "Box", qty: 24, price: 380, disc: 5, tax: 7, lot: L(31), serial: "", note: "", box: "BOX-08" },
  { code: "AD-CT001", name: "A-PACK Carton Box 600x400x300 mm.", unit: "Carton", qty: 100, price: 42, disc: 0, tax: 7, lot: "", serial: "", note: "บรรจุภัณฑ์สำหรับลูกค้าใช้แพ็คต่อ", box: "PALLET-02" },
  { code: "AD-CT002", name: "A-PACK Carton Divider Insert", unit: "Carton", qty: 100, price: 18, disc: 0, tax: 7, lot: "", serial: "", note: "", box: "PALLET-02" },
];
