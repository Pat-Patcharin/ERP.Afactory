"use client";

import { useState } from "react";
import { PRICE_LISTS } from "@/data/price-lists";
import {
  grossProfit,
  marginPct,
  markupPct,
  netWithVat,
  vatAmount,
  type PriceLine,
} from "@/lib/domain/pricing";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FieldShell, Input, Select } from "@/components/ui";

const TYPES = [
  "Standard", "Clinic", "Dealer", "Government",
  "Chain Clinic", "Promotion", "Contract", "Customer",
];
const STATUSES = ["Draft", "Active", "Scheduled", "Expired"];

/**
 * Price line editor with a live calculator. Reading margin and profit as you
 * type is the whole point — a price entered blind is how a product ends up
 * sold below cost.
 */
export function PriceEditor({
  productCode,
  line,
}: {
  productCode: string;
  line?: PriceLine;
}) {
  const [cost, setCost] = useState(line?.cost ?? 0);
  const [price, setPrice] = useState(line?.price ?? 0);
  const [minPrice, setMinPrice] = useState(line?.minPrice ?? 0);

  const mk = markupPct(cost, price);
  const mg = marginPct(cost, price);
  const gp = grossProfit(cost, price);
  const below = price > 0 && price < minPrice;

  return (
    <form id="pe-form" onSubmit={(e) => e.preventDefault()}>
      <p className="mb-3 text-cap text-ink-2">สินค้า {productCode}</p>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <FieldShell label="Price List">
          <Select name="priceList" defaultValue={line?.priceList ?? PRICE_LISTS[0]?.code}>
            {PRICE_LISTS.map((pl) => (
              <option key={pl.code} value={pl.code}>
                {pl.code} — {pl.name}
              </option>
            ))}
            <option value="CONTRACT-TU">CONTRACT-TU — สัญญาเฉพาะ</option>
          </Select>
        </FieldShell>

        <FieldShell label="Price Type">
          <Select name="type" defaultValue={line?.type ?? "Standard"}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FieldShell>

        <FieldShell label="Base Cost (฿)">
          <Input
            name="cost"
            type="number"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
          />
        </FieldShell>

        <FieldShell label="Selling Price (฿)">
          <Input
            name="price"
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </FieldShell>

        <FieldShell label="Minimum Price (฿)">
          <Input
            name="minPrice"
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(Number(e.target.value))}
          />
        </FieldShell>

        <FieldShell label="Maximum Discount (%)">
          <Input name="maxDisc" type="number" defaultValue={line?.maxDisc ?? 8} />
        </FieldShell>

        <FieldShell label="Currency">
          <Select name="currency" defaultValue={line?.currency ?? "THB"}>
            <option>THB</option>
            <option>USD</option>
          </Select>
        </FieldShell>

        <FieldShell label="Status">
          <Select name="status" defaultValue={line?.status ?? "Draft"}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FieldShell>

        <FieldShell label="Notes" span>
          <Input name="note" defaultValue={line?.note ?? ""} placeholder="หมายเหตุ..." />
        </FieldShell>
      </div>

      <div className="mt-4 rounded-btn bg-surface p-3">
        <p className="mb-2 text-xs font-bold">Price Calculator</p>
        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-2">
          {[
            ["Markup", `${mk}%`, false],
            ["Margin", `${mg}%`, mg < 15],
            ["Gross Profit", `฿${money(gp)}`, gp < 0],
            ["VAT 7%", `฿${money(vatAmount(price))}`, false],
            ["Net + VAT", `฿${money(netWithVat(price))}`, false],
            ["Min Price", below ? "ต่ำกว่าขั้นต่ำ!" : "ผ่าน", below],
          ].map(([label, value, warn]) => (
            <div
              key={label as string}
              className="flex flex-col gap-px rounded-sm border border-line bg-card p-2"
            >
              <span className="text-[10px] text-ink-3">{label as string}</span>
              <b className={cn("text-[13px] tnum", warn && "text-danger-text")}>
                {value as string}
              </b>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}

/**
 * What-if calculator. Give it a cost plus either a markup or a target margin
 * and it works the price back the other way.
 */
export function PriceSimulator() {
  const [cost, setCost] = useState(7200);
  const [markup, setMarkup] = useState(66);
  const [margin, setMargin] = useState(0);
  const [disc, setDisc] = useState(0);

  const price = margin > 0 && margin < 100 ? cost / (1 - margin / 100) : cost * (1 + markup / 100);
  const net = price * (1 - disc / 100);
  const profit = net - cost;
  const gm = net > 0 ? (profit / net) * 100 : 0;

  return (
    <div>
      <p className="mb-3 text-cap text-ink-2">
        คำนวณราคาขายจากต้นทุน + markup / margin / ส่วนลด → จำนวนจริงที่ได้
      </p>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <FieldShell label="Cost (฿)">
          <Input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
        </FieldShell>
        <FieldShell label="Markup (%)">
          <Input type="number" value={markup} onChange={(e) => setMarkup(Number(e.target.value))} />
        </FieldShell>
        <FieldShell label="Target Margin (%)" hint="ใส่ค่านี้แล้วจะใช้แทน Markup">
          <Input type="number" value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
        </FieldShell>
        <FieldShell label="Discount (%)">
          <Input type="number" value={disc} onChange={(e) => setDisc(Number(e.target.value))} />
        </FieldShell>
      </div>

      <div className="mt-4 rounded-btn bg-surface p-3">
        <p className="mb-2 text-xs font-bold">Simulation Result</p>
        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-2">
          {[
            ["Recommended Price", `฿${money(price)}`, false],
            ["After Discount", `฿${money(net)}`, false],
            ["Profit", `฿${money(profit)}`, profit < 0],
            ["Gross Margin", `${Math.round(gm * 10) / 10}%`, gm < 15],
            ["VAT 7%", `฿${money(netWithVat(net) - net)}`, false],
            ["Net + VAT", `฿${money(netWithVat(net))}`, false],
          ].map(([label, value, warn]) => (
            <div
              key={label as string}
              className="flex flex-col gap-px rounded-sm border border-line bg-card p-2"
            >
              <span className="text-[10px] text-ink-3">{label as string}</span>
              <b className={cn("text-[13px] tnum", warn && "text-danger-text")}>
                {value as string}
              </b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
