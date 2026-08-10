/* eslint-disable */
/**
 * Shared dropdown option sets for the Product form.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export interface ProductOptions {
  category: string[];
  brand: string[];
  series: string[];
  unit: string[];
  unitType: string[];
  status: string[];
  country: string[];
  storage: string[];
  devClass: string[];
  yesno: string[];
  warehouse: string[];
  supplier: string[];
  currency: string[];
  vat: string[];
  regType: string[];
  regStatus: string[];
  warrantyUnit: string[];
  startEvent: string[];
  docType: string[];
}

export const OPT: ProductOptions = {
  category: ["Sealant", "Acrylic", "Silicone", "Accessory", "Instrument"],
  brand: ["A-FLEX", "A-ACRYLIC", "A-SILICONE", "A-FACTORY", "VinciSmile"],
  series: ["PU40", "PU50", "AC100", "SL300", "GL-L", "MD-3P", "BR-D12"],
  unit: ["Tube", "Box", "Carton", "Set", "Piece", "Pack"],
  unitType: ["Base Unit", "Sales Unit", "Purchase Unit"],
  status: ["Draft", "Active", "Inactive"],
  country: ["ประเทศไทย", "ญี่ปุ่น", "เกาหลีใต้", "จีน", "เยอรมนี", "มาเลเซีย", "สหรัฐอเมริกา"],
  storage: ["อุณหภูมิห้อง (15–30°C)", "แช่เย็น (2–8°C)", "หลีกเลี่ยงแสงแดด", "ที่แห้ง"],
  devClass: ["Class I", "Class II", "Class III", "ไม่จัดเป็นเครื่องมือแพทย์"],
  yesno: ["Yes", "No"],
  warehouse: ["WH-01 Samut Prakan", "WH-02 Bangkok", "WH-03 Service"],
  supplier: [
    "Supplier A Co., Ltd.",
    "HDX WILL Co., Ltd.",
    "Andaman Medical",
    "DGSHAPE",
    "Shandong Huge Dental",
  ],
  currency: ["THB", "USD", "EUR", "CNY"],
  /**
   * How a PRODUCT's catalogue price is quoted — whether the number in the
   * product master already includes tax.
   *
   * NOT the same axis as `BILL_TYPES` in data/partners.ts, which says what
   * kind of bill a customer gets ("VAT" / "Non VAT"). Never compare a value
   * from this list with a `billType`: they answer different questions, the
   * spelling differs on purpose, and a match would be meaningless even if the
   * strings happened to line up.
   */
  vat: ["VAT 7% (exclusive)", "VAT 7% (inclusive)", "Non-VAT"],
  regType: ["Thai FDA", "ISO 13485", "CE Marking", "มอก."],
  regStatus: ["Active", "Pending", "Expiring", "Expired"],
  warrantyUnit: ["เดือน", "ปี", "วัน"],
  startEvent: ["Goods Receipt Date", "Delivery Date", "Installation Date"],
  docType: [
    "Product Image",
    "Product Catalogue",
    "Datasheet",
    "Thai FDA Certificate",
    "Warranty Document",
    "User Manual",
    "Other Attachment",
  ],
};
