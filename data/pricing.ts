/* eslint-disable */
/**
 * Product Pricing — the actual selling price of each product under each
 * price list. One product, many price lines.
 *
 * AUTO-GENERATED from the original prototype dataset. Mutating these arrays
 * is how the prototype persists changes; swap for API calls when ready.
 */

export type PricingMap = Record<string, {
  id: string;
  priceList: string;
  /**
   * The sales unit this price is quoted for — part of the line's identity,
   * not a label on it.
   *
   * A Box is not twelve times a Tube: selling by the box is where the volume
   * discount lives, and a model that prices only the stock unit has to
   * multiply it back out and lose that. One line per (list × product × unit).
   */
  unit: string;
  type: string;
  currency: string;
  cost: number;
  price: number;
  minPrice: number;
  maxDisc: number;
  eff: string;
  exp: string;
  status: string;
  note: string;
  /** Volume ladder for THIS unit. Leave `max` null for the top step. */
  qtyBreaks: { min: number; max: number | null; price: number }[];
}[]>;

export const PRICING: PricingMap = {
  "CMP-A3": [
    {
      id: "PP-0001",
      priceList: "PL-STD-2026",

      unit: "Syringe",
      type: "Standard",
      currency: "THB",
      cost: 7200,
      price: 12000,
      minPrice: 11000,
      maxDisc: 8,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "",

      qtyBreaks: [],
    },
    {
      id: "PP-0002",
      priceList: "PL-DEALER-2026",

      unit: "Syringe",
      type: "Dealer",
      currency: "THB",
      cost: 7200,
      price: 10500,
      minPrice: 9800,
      maxDisc: 12,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "ราคาตัวแทน",

      qtyBreaks: [],
    },
    {
      id: "PP-0003",
      priceList: "PL-GOV-2026",

      unit: "Syringe",
      type: "Government",
      currency: "THB",
      cost: 7200,
      price: 10200,
      minPrice: 10000,
      maxDisc: 0,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "",

      qtyBreaks: [],
    },
    {
      id: "PP-0004",
      priceList: "PL-PROMO-SEP",

      unit: "Syringe",
      type: "Promotion",
      currency: "THB",
      cost: 7200,
      price: 9990,
      minPrice: 9500,
      maxDisc: 5,
      eff: "01/09/2026",
      exp: "30/09/2026",
      status: "Scheduled",
      note: "โปรกันยายน",

      qtyBreaks: [],
    },
    {
      id: "PP-0005",
      priceList: "CONTRACT-TU",

      unit: "Syringe",
      type: "Contract",
      currency: "THB",
      cost: 7200,
      price: 9700,
      minPrice: 9700,
      maxDisc: 0,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "สัญญา รพ.ธรรมศาสตร์",

      qtyBreaks: [],
    },
  ],
  "CMP-A5": [
    {
      id: "PP-0006",
      priceList: "PL-STD-2026",

      unit: "Syringe",
      type: "Standard",
      currency: "THB",
      cost: 11400,
      price: 18000,
      minPrice: 16500,
      maxDisc: 8,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "",

      qtyBreaks: [],
    },
    {
      id: "PP-0007",
      priceList: "PL-DEALER-2026",

      unit: "Syringe",
      type: "Dealer",
      currency: "THB",
      cost: 11400,
      price: 16500,
      minPrice: 15500,
      maxDisc: 12,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "",

      qtyBreaks: [],
    },
    {
      id: "PP-0008",
      priceList: "PL-GOV-2026",

      unit: "Syringe",
      type: "Government",
      currency: "THB",
      cost: 11400,
      price: 15900,
      minPrice: 15500,
      maxDisc: 0,
      eff: "01/01/2026",
      exp: "31/12/2026",
      status: "Active",
      note: "",

      qtyBreaks: [],
    },
  ],
};
