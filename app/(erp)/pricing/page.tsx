"use client";

import { useMemo, useState } from "react";
import {
  PRICING,
  PRICE_TYPE_TO_LEVEL,
  ensurePricing,
  marginPct,
  markupPct,
  pricingProducts,
  winningLine,
  type PriceLine,
} from "@/lib/domain/pricing";
import { PRICE_LISTS } from "@/data/price-lists";
import { daysUntil, money, money0 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import type { BadgeTone } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  IconButton,
  SearchInput,
  Select,
} from "@/components/ui";
import { PriorityLadder } from "@/components/pricing/PriorityLadder";
import { PriceEditor, PriceSimulator } from "@/components/pricing/PriceEditor";

const LINE_TONE: Record<string, BadgeTone> = {
  Standard: "neutral",
  Dealer: "info",
  Government: "info",
  Clinic: "info",
  "Chain Clinic": "info",
  Promotion: "warning",
  Contract: "success",
  Customer: "info",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  Active: "success",
  Draft: "neutral",
  Expired: "danger",
  Scheduled: "info",
};

/**
 * PRODUCT PRICING — the pricing-engine companion to Price List Master.
 *
 * Price List Master defines the POLICY (scope, priority, rules); this screen
 * holds the ACTUAL selling price of each product under each list. One product
 * can carry unlimited price lines, and the priority engine decides which wins.
 */
export default function ProductPricingPage() {
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const formModal = useUI((s) => s.formModal);
  const revision = useUI((s) => s.revision);
  const refresh = useUI((s) => s.refresh);

  const [selected, setSelected] = useState("CMP-A3");
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("");

  const products = useMemo(() => {
    const q = query.toLowerCase();
    return pricingProducts().filter((p) => {
      const okQ =
        !q ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.cat ?? "").toLowerCase().includes(q);
      const okF = !listFilter || (PRICING[p.code] ?? []).some((l) => l.priceList === listFilter);
      return okQ && okF;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, listFilter, revision]);

  const product = products.find((p) => p.code === selected) ?? products[0];
  const lines = product ? ensurePricing(product.code) : [];
  const win = winningLine(lines);

  /* ---------- KPI strip ---------- */
  const kpi = useMemo(() => {
    let withPrices = 0,
      active = 0,
      promos = 0,
      expired = 0,
      marginSum = 0,
      markupSum = 0,
      n = 0;
    for (const p of pricingProducts()) {
      const ls = PRICING[p.code] ?? [];
      if (ls.length) withPrices++;
      for (const l of ls) {
        if (l.status === "Active") active++;
        if (l.type === "Promotion") promos++;
        if (l.status === "Expired") expired++;
        marginSum += marginPct(l.cost, l.price);
        markupSum += markupPct(l.cost, l.price);
        n++;
      }
    }
    return {
      products: withPrices,
      active,
      promos,
      expired,
      avgMargin: n ? Math.round((marginSum / n) * 10) / 10 : 0,
      avgMarkup: n ? Math.round((markupSum / n) * 10) / 10 : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  const openEditor = (line?: PriceLine) => {
    if (!product) return;
    formModal({
      title: `${line ? "Edit Price" : "Add Price"} — ${product.code}`,
      confirmText: line ? "Save Price" : "Add Price",
      body: () => <PriceEditor productCode={product.code} line={line} />,
      onConfirm: () => {
        const form = document.getElementById("pe-form") as HTMLFormElement | null;
        if (!form) return false;
        const data = new FormData(form);
        const price = Number(data.get("price"));
        const minPrice = Number(data.get("minPrice"));
        if (!(price > 0)) {
          toast("ราคาไม่ถูกต้อง", "Selling Price ต้องมากกว่า 0", "danger");
          return false;
        }
        if (price < minPrice) {
          toast(
            "ต่ำกว่าราคาขั้นต่ำ",
            `ราคา ${money0(price)} < ขั้นต่ำ ${money0(minPrice)}`,
            "danger",
          );
          return false;
        }

        const patch = {
          priceList: String(data.get("priceList")),
          type: String(data.get("type")),
          cost: Number(data.get("cost")),
          price,
          minPrice,
          maxDisc: Number(data.get("maxDisc")),
          currency: String(data.get("currency")),
          status: String(data.get("status")),
          note: String(data.get("note") ?? ""),
        };

        if (line) Object.assign(line, patch);
        else
          (PRICING[product.code] ??= []).push({
            id: `PP-${product.code}-${Date.now()}`,
            eff: new Date().toLocaleDateString("en-GB"),
            exp: "",
            ...patch,
          });

        refresh();
        toast(
          line ? "บันทึกราคาแล้ว" : "เพิ่มราคาแล้ว",
          `${patch.priceList} · ฿${money0(price)}`,
          "success",
        );
      },
    });
  };

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      {/* ---------- Head ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold tracking-[-0.02em]">Product Pricing</h1>
          <p className="mt-0.5 text-ink-2">
            จัดการราคาขายของสินค้าทุกตัวในทุก Price List — รองรับหลายระดับราคาไม่จำกัด
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              toast("Import Excel", "พรีวิว + ตรวจสอบ + rollback — Future support", "info")
            }
          >
            <Icon name="download" size={16} strokeWidth={2} />
            Import Excel
          </Button>
          <Button
            size="sm"
            onClick={() => toast("Export", "ส่งออก Excel/CSV — Future support", "info")}
          >
            <Icon name="upload" size={16} strokeWidth={2} />
            Export
          </Button>
          <Button
            size="sm"
            onClick={() =>
              formModal({
                title: "Price Simulator",
                confirmText: "Close",
                cancelText: "",
                width: "default",
                body: () => <PriceSimulator />,
              })
            }
          >
            <Icon name="sliders" size={16} strokeWidth={2} />
            Price Simulator
          </Button>
          <Button variant="primary" size="sm" onClick={() => openEditor()}>
            <Icon name="plus" size={16} strokeWidth={2} />
            Add Price
          </Button>
        </div>
      </div>

      {/* ---------- KPI strip ---------- */}
      <div className="grid grid-cols-6 gap-3 max-[1400px]:grid-cols-3 max-md:grid-cols-2">
        {[
          { label: "Products", value: money0(kpi.products), sub: "มีราคากำหนด", tone: "primary", icon: "product" },
          { label: "Active Prices", value: money0(kpi.active), sub: "ใช้งานอยู่", tone: "ok", icon: "checkCircle" },
          { label: "Promotions", value: money0(kpi.promos), sub: "โปรโมชัน", tone: "warn", icon: "promotion" },
          { label: "Expired Prices", value: money0(kpi.expired), sub: "หมดอายุ", tone: kpi.expired ? "warn" : "", icon: "clock" },
          { label: "Avg Margin", value: `${kpi.avgMargin}%`, sub: "กำไรขั้นต้นเฉลี่ย", tone: "ok", icon: "trend" },
          { label: "Avg Markup", value: `${kpi.avgMarkup}%`, sub: "บวกเพิ่มเฉลี่ย", tone: "", icon: "pricing" },
        ].map((k) => (
          <div
            key={k.label}
            className={cn(
              "relative flex flex-col gap-0.5 rounded-card border border-line bg-card px-4 py-3",
              k.tone === "primary" && "border-t-2 border-t-primary",
              k.tone === "warn" && "border-t-2 border-t-warning",
              k.tone === "ok" && "border-t-2 border-t-success",
            )}
          >
            <span className="absolute right-3 top-3 text-ink-3">
              <Icon name={k.icon as never} size={15} />
            </span>
            <span className="text-2xl font-bold leading-[1.1] tracking-[-0.02em] tnum">
              {k.value}
            </span>
            <span className="text-xs font-semibold">{k.label}</span>
            <span className="text-[11px] text-ink-3">{k.sub}</span>
          </div>
        ))}
      </div>

      {/* ---------- 3 columns: products · matrix · summary ---------- */}
      <div className="grid grid-cols-[280px_1fr_320px] items-start gap-4 max-[1400px]:grid-cols-[240px_1fr_280px] max-[1100px]:grid-cols-1">
        {/* Left: product list */}
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="text-sm font-bold">Products</span>
            <span className="text-cap text-ink-2">{products.length}</span>
          </div>
          <div className="px-3 pb-2 pt-3">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหารหัส ชื่อ แบรนด์ หมวด..."
              className="h-9 text-[13px]"
            />
          </div>
          <div className="px-3 pb-3">
            <Select
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              className="h-9 text-[13px]"
            >
              <option value="">ทุก Price List</option>
              {PRICE_LISTS.map((pl) => (
                <option key={pl.code} value={pl.code}>
                  {pl.code}
                </option>
              ))}
            </Select>
          </div>
          <div className="max-h-[560px] overflow-y-auto px-2 pb-2">
            {products.length === 0 ? (
              <p className="p-6 text-center text-[13px] text-ink-3">ไม่พบสินค้า</p>
            ) : (
              products.map((p) => {
                const count = (PRICING[p.code] ?? []).length;
                return (
                  <button
                    key={p.code}
                    onClick={() => setSelected(p.code)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left transition-colors duration-fast",
                      p.code === product?.code ? "bg-primary-soft" : "hover:bg-surface",
                    )}
                  >
                    <span className="flex-shrink-0 text-xl">{p.icon}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-semibold">{p.name}</span>
                      <span className="text-[11px] text-ink-3">
                        {p.code} · {p.brand ?? "—"}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-[11px] font-semibold text-primary">
                      {count ? `${count} ราคา` : <span className="text-ink-3">—</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Center: pricing matrix */}
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <span className="text-sm font-bold">
                Pricing Matrix — {product?.name ?? "—"}
              </span>
              <span className="block text-[11px] text-ink-3">{product?.code}</span>
            </div>
            <Button variant="primary" size="sm" onClick={() => openEditor()}>
              <Icon name="plus" size={15} strokeWidth={2} />
              Add Price
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {[
                    "Price List", "Type", "Base Cost", "Markup %", "Margin %",
                    "Selling Price", "Min Price", "Max Disc", "Effective", "Status", "",
                  ].map((h, i) => (
                    <th
                      key={h + i}
                      className={cn(
                        "whitespace-nowrap border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-ink-3",
                        [2, 3, 4, 5, 6, 7].includes(i) ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-[13px] text-ink-3">
                      ยังไม่มีราคาสำหรับสินค้านี้ — กด Add Price
                    </td>
                  </tr>
                ) : (
                  lines.map((l) => {
                    const isWin = win?.id === l.id;
                    const below = l.price < l.minPrice;
                    const expSoon = daysUntil(l.exp);
                    return (
                      <tr
                        key={l.id}
                        className={cn(
                          "border-b border-line last:border-b-0",
                          isWin && "bg-success-soft",
                        )}
                      >
                        <td className="px-3 py-3 font-medium">{l.priceList}</td>
                        <td className="px-3 py-3">
                          <Badge tone={LINE_TONE[l.type] ?? "neutral"}>{l.type}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right tnum">{money0(l.cost)}</td>
                        <td className="px-3 py-3 text-right tnum">
                          {markupPct(l.cost, l.price)}%
                        </td>
                        <td
                          className={cn(
                            "px-3 py-3 text-right tnum",
                            marginPct(l.cost, l.price) < 15 && "font-bold text-danger-text",
                          )}
                        >
                          {marginPct(l.cost, l.price)}%
                        </td>
                        <td
                          className={cn(
                            "px-3 py-3 text-right font-semibold tnum",
                            below && "text-danger-text",
                          )}
                        >
                          {money0(l.price)}
                        </td>
                        <td className="px-3 py-3 text-right text-ink-2 tnum">
                          {money0(l.minPrice)}
                        </td>
                        <td className="px-3 py-3 text-right text-ink-2 tnum">{l.maxDisc}%</td>
                        <td className="px-3 py-3 text-ink-2">
                          {l.eff}
                          {l.exp && (
                            <span
                              className={cn(
                                "mt-px block text-[11px]",
                                expSoon !== null && expSoon <= 7
                                  ? "font-semibold text-warning-text"
                                  : "text-ink-3",
                              )}
                            >
                              ถึง {l.exp}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={STATUS_TONE[l.status] ?? "neutral"}>{l.status}</Badge>
                          {isWin && (
                            <span className="ml-1.5 rounded-pill bg-card px-1.5 py-px text-[10px] font-bold text-success-text">
                              ใช้จริง
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="flex justify-end gap-0.5">
                            <IconButton size="sm" title="แก้ไข" onClick={() => openEditor(l)}>
                              <Icon name="edit" size={15} />
                            </IconButton>
                            <IconButton
                              size="sm"
                              title="ทำสำเนา"
                              onClick={() => {
                                (PRICING[product!.code] ??= []).push({
                                  ...l,
                                  id: `PP-${Date.now()}`,
                                  status: "Draft",
                                  note: `${l.note} (copy)`.trim(),
                                });
                                refresh();
                                toast("ทำสำเนาราคาแล้ว", l.priceList, "info");
                              }}
                            >
                              <Icon name="copy" size={15} />
                            </IconButton>
                            <IconButton
                              size="sm"
                              title="ลบ"
                              className="hover:bg-danger-soft hover:text-danger-text"
                              onClick={() =>
                                confirm({
                                  title: "Delete this price?",
                                  message: `ราคา ${l.priceList} จะถูกลบออกจากสินค้า ${product!.code}`,
                                  confirmText: "Delete",
                                  onConfirm: () => {
                                    PRICING[product!.code] = (PRICING[product!.code] ?? []).filter(
                                      (x) => x.id !== l.id,
                                    );
                                    refresh();
                                    toast("ลบราคาแล้ว", l.priceList, "danger");
                                  },
                                })
                              }
                            >
                              <Icon name="trash" size={15} />
                            </IconButton>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Right: summary + priority engine + insights */}
        <Card className="overflow-hidden p-0">
          {product && (
            <>
              <div className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[32px]">{product.icon}</span>
                  <div>
                    <p className="text-[15px] font-bold">{product.name}</p>
                    <p className="text-xs text-ink-3">{product.code}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Category", product.cat ?? "—"],
                    ["Default Cost", `฿${money0(lines[0]?.cost ?? 0)}`],
                    [
                      "Standard Price",
                      `฿${money0(lines.find((l) => l.type === "Standard")?.price ?? 0)}`,
                    ],
                    [
                      "Avg Margin",
                      `${
                        lines.length
                          ? Math.round(
                              (lines.reduce((s, l) => s + marginPct(l.cost, l.price), 0) /
                                lines.length) *
                                10,
                            ) / 10
                          : 0
                      }%`,
                    ],
                    ["Lowest", `฿${money0(Math.min(...(lines.map((l) => l.price) ?? [0]), 0) || 0)}`],
                    ["Price Lines", String(lines.length)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-col gap-px rounded-sm bg-surface px-3 py-2"
                    >
                      <span className="text-cap text-ink-2">{label}</span>
                      <b className="text-[13px] tnum">{value}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-line p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
                  <Icon name="sort" size={15} />
                  Price Priority Engine
                </p>
                <p className="mb-3 text-[11px] text-ink-2">
                  ราคาที่ระบบจะใช้จริงเมื่อออกใบเสนอราคา — ไล่จากบนลงล่าง
                </p>
                <PriorityLadder
                  activeKey={win ? PRICE_TYPE_TO_LEVEL[win.type] : "Standard Price"}
                />
                {win && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-btn bg-success-soft px-3 py-2 text-xs text-success-text">
                    <Icon name="checkCircle" size={14} />
                    ราคาที่ใช้จริง:{" "}
                    <b>
                      {win.priceList} · ฿{money(win.price)}
                    </b>
                  </div>
                )}
              </div>

              <div className="border-t border-line p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
                  <Icon name="bulb" size={15} />
                  Pricing Insights
                  <span className="ml-auto rounded-pill bg-primary-soft px-1.5 py-px text-[9px] font-bold text-primary">
                    AI
                  </span>
                </p>
                <div className="flex flex-col gap-2">
                  {buildInsights(lines).map((i, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-start gap-1.5 rounded-btn px-3 py-2 text-xs leading-snug",
                        i.tone === "warn"
                          ? "bg-warning-soft text-warning-text"
                          : "bg-surface text-ink-2",
                      )}
                    >
                      <Icon
                        name={i.tone === "warn" ? "alert" : "checkCircle"}
                        size={14}
                        className="mt-px flex-shrink-0"
                      />
                      <span>{i.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

/** Rules that flag a price line worth a human look. */
function buildInsights(lines: PriceLine[]) {
  const out: { tone: "warn" | "ok"; text: string }[] = [];
  for (const l of lines) {
    if (l.price < l.minPrice)
      out.push({
        tone: "warn",
        text: `${l.priceList}: ราคาต่ำกว่าราคาขั้นต่ำ (${money0(l.price)} < ${money0(l.minPrice)})`,
      });
    const m = marginPct(l.cost, l.price);
    if (m < 15 && l.type !== "Contract")
      out.push({ tone: "warn", text: `${l.priceList}: margin ${m}% ต่ำกว่าเกณฑ์ 15%` });
    const d = daysUntil(l.exp);
    if (d !== null && d >= 0 && d <= 7)
      out.push({ tone: "warn", text: `${l.priceList} หมดอายุใน ${d} วัน` });
  }
  if (!lines.some((l) => l.type === "Government"))
    out.push({ tone: "ok", text: "ยังไม่มีราคาราชการ — พิจารณาเพิ่มถ้าขายภาครัฐ" });
  if (!out.length) out.push({ tone: "ok", text: "ราคาทุกระดับอยู่ในเกณฑ์ปกติ" });
  return out.slice(0, 6);
}
