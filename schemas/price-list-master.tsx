import { fmt, money, money0, DASH } from "@/lib/format";
import type { Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import {
  PRICE_SOURCE_TONE,
  PRICE_STATUS_TEXT,
  PRICE_STATUS_TONE,
  PRICING_CONFIG,
  TIER_LABEL,
  flaggedRows,
  gpTone,
  priceListMeta,
  priceMasterByProduct,
  priceMasterRows,
  priceMasterSummary,
  type PriceMasterRow,
  type PriceViolation,
} from "@/lib/domain/price-master";
import { getProduct } from "@/lib/domain/product";
import { Badge, Thumb } from "@/components/ui";

/* ============================================================
   PRICE LIST MASTER — the catalogue price of every SKU.

   Read-only on purpose. `gp_*`, `price_dealer` and `price_last` are
   generated from cost and the private price, so editing one cell
   would leave the row inconsistent with the rest of it; the file is
   regenerated from source instead. The screen therefore offers no
   create, no edit and no delete — only ways to look and to leave for
   the module that owns what you found.

   Two things it deliberately does NOT do:
     · recompute GP — the stored decimal is shown as it is, because
       GP is measured on the ex-VAT price and dividing by 1.07 first
       is the one mistake the spec calls a bug outright;
     · treat `catalog_net_price` as a price — it is the "เฉลี่ยเพียง"
       figure from the catalogue, quoted after a free-goods promotion
       and never billed.
   ============================================================ */

const uniq = (v: (string | null | undefined)[]) =>
  [...new Set(v.filter((x): x is string => Boolean(x)))].sort();

const yesNo = () => ["Yes"];

const num = (v: number | null) => (v === null ? DASH : money(v));

/** A price cell: the figure, with its GP underneath where there is one. */
const tierCell = (value: number | null, gp: number | null) =>
  value === null ? (
    <span className="text-ink-3">{DASH}</span>
  ) : (
    <span className="flex flex-col items-end">
      <span className="font-medium">{money(value)}</span>
      {gp !== null && (
        <span className="text-cap text-ink-3">GP {(gp * 100).toFixed(1)}%</span>
      )}
    </span>
  );

const gpCell = (gp: number | null) =>
  gp === null ? (
    <span className="text-ink-3">{DASH}</span>
  ) : (
    <Badge tone={gpTone(gp)}>{(gp * 100).toFixed(1)}%</Badge>
  );

/* ---------- List ---------- */

const list: ListSchema<PriceMasterRow> = {
  key: "price-list-master",
  entity: "Price",
  entityPlural: "prices",
  title: "Price List Master",
  subtitle:
    "ราคาตั้งต่อ SKU สี่ชั้น — ราชการ · เอกชน · Dealer · Last price — พร้อม GP และสถานะข้อมูลของแต่ละรายการ",
  crumb: "Price List Master",
  crumbParent: "Master Data",
  primaryLabel: "",
  searchPlaceholder: "ค้นหารหัสสินค้า ชื่อ แบรนด์ กลุ่ม ผู้ขาย หรือโปรโมชั่น...",
  emptyTitle: "ไม่พบรายการราคาที่ตรงกับเงื่อนไข",

  /* The file is generated. A row is corrected at source, never here. */
  hideCreate: true,
  hideImportExport: true,

  source: priceMasterRows,

  searchFields: [
    "product_code",
    "product_name",
    "brand",
    "product_group",
    "unit",
    "vendor",
    "promo_catalog",
    "promo_legacy",
    "source_sheet",
    "catalog_page",
    "notes",
    "code",
  ],

  tabs: [
    { key: "all", label: "ทั้งหมด" },
    { key: "ok", label: "พร้อมขาย", test: (r) => r.status === "OK" },
    { key: "cost", label: "รอต้นทุน", test: (r) => r.status === "PENDING_COST" },
    { key: "review", label: "ต้องทบทวน", test: (r) => r.status === "REVIEW" },
    { key: "noprice", label: "ไม่มีราคา", test: (r) => r.status === "NO_PRICE" },
    { key: "codeissue", label: "ปัญหารหัส", test: (r) => r.missingCode || r.duplicateCode },
    { key: "orderbad", label: "ลำดับราคาผิด", test: (r) => !r.tierOrderOk },
    { key: "promo", label: "มีโปรโมชั่น", test: (r) => r.hasPromo },
  ],

  filters: [
    {
      id: "status",
      label: "Status",
      options: () => ["OK", "PENDING_COST", "REVIEW", "NO_PRICE"],
      test: (r, v) => r.status === v,
    },
    {
      id: "source",
      label: "Price Source",
      options: () => ["CATALOG_SPECIAL", "CATALOG_LIST", "PRICELIST_LEGACY"],
      test: (r, v) => r.price_source === v,
    },
    {
      id: "brand",
      label: "Brand",
      options: () => uniq(priceMasterRows().map((r) => r.brand)),
      test: (r, v) => r.brand === v,
    },
    {
      id: "group",
      label: "Product Group",
      options: () => uniq(priceMasterRows().map((r) => r.product_group)),
      test: (r, v) => r.product_group === v,
    },
    {
      id: "vendor",
      label: "Vendor",
      options: () => uniq(priceMasterRows().map((r) => r.vendor)),
      test: (r, v) => r.vendor === v,
    },
    {
      id: "unit",
      label: "Unit",
      options: () => uniq(priceMasterRows().map((r) => r.unit)),
      test: (r, v) => r.unit === v,
    },
    {
      id: "sheet",
      label: "Source Sheet",
      options: () => uniq(priceMasterRows().map((r) => r.source_sheet)),
      test: (r, v) => r.source_sheet === v,
    },
    {
      id: "gpband",
      label: "GP Band (เอกชน)",
      options: () => ["≥ 48%", "40 – 48%", "< 40%", "ไม่มีต้นทุน"],
      test: (r, v) => {
        const gp = r.gp_private;
        if (v === "ไม่มีต้นทุน") return gp === null;
        if (gp === null) return false;
        if (v === "≥ 48%") return gp >= PRICING_CONFIG.dealerGpMin;
        if (v === "40 – 48%") return gp >= PRICING_CONFIG.lastPriceGpMin && gp < PRICING_CONFIG.dealerGpMin;
        return gp < PRICING_CONFIG.lastPriceGpMin;
      },
    },
    { id: "promo", label: "มีโปรโมชั่น", options: yesNo, test: (r) => r.hasPromo },
    { id: "nocode", label: "ไม่มีรหัสสินค้า", options: yesNo, test: (r) => r.missingCode },
    { id: "dupcode", label: "รหัสซ้ำ", options: yesNo, test: (r) => r.duplicateCode },
    { id: "orderbad", label: "ลำดับราคาผิด", options: yesNo, test: (r) => !r.tierOrderOk },
    { id: "flagged", label: "มีข้อสังเกต", options: yesNo, test: (r) => r.violations.length > 0 },
  ],

  columns: [
    { key: "icon", label: "", cell: (r) => <Thumb size={30}>{r.icon}</Thumb> },
    {
      key: "product_code",
      label: "Product Code",
      sortable: true,
      locked: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold">
            {r.product_code || <span className="text-danger">ไม่มีรหัส</span>}
          </span>
          {r.duplicateCode && <span className="text-cap font-medium text-danger">รหัสซ้ำ</span>}
        </span>
      ),
    },
    {
      key: "product_name",
      label: "Product Name",
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.product_name}</span>
          <span className="text-cap text-ink-3">{r.brand || DASH}</span>
        </span>
      ),
    },
    { key: "product_group", label: "Group", muted: true, defaultHidden: true, cell: (r) => r.product_group || DASH },
    { key: "unit", label: "Unit", muted: true, cell: (r) => r.unit || DASH },
    {
      key: "cost_thb",
      label: "Cost",
      align: "right",
      sortable: true,
      muted: true,
      cell: (r) => num(r.cost_thb),
    },

    /* ---- The four tiers, highest to lowest, in the order the spec fixes ---- */
    {
      key: "price_government",
      label: "ราคาราชการ",
      align: "right",
      sortable: true,
      cell: (r) => tierCell(r.price_government, null),
    },
    {
      key: "price_private",
      label: "ราคาเอกชน",
      align: "right",
      sortable: true,
      cell: (r) => tierCell(r.price_private, r.gp_private),
    },
    {
      key: "price_dealer",
      label: "ราคา Dealer",
      align: "right",
      sortable: true,
      cell: (r) => tierCell(r.price_dealer, r.gp_dealer),
    },
    {
      key: "price_last",
      label: "Last Price",
      align: "right",
      sortable: true,
      cell: (r) => tierCell(r.price_last, r.gp_last),
    },

    /* ---- GP on its own, so a band can be scanned down the column ---- */
    {
      key: "gp_private",
      label: "GP เอกชน",
      align: "right",
      sortable: true,
      sortValue: (r) => r.gp_private ?? -1,
      cell: (r) => gpCell(r.gp_private),
    },
    {
      key: "gp_dealer",
      label: "GP Dealer",
      align: "right",
      sortable: true,
      sortValue: (r) => r.gp_dealer ?? -1,
      cell: (r) => gpCell(r.gp_dealer),
    },
    {
      key: "gp_last",
      label: "GP Last",
      align: "right",
      defaultHidden: true,
      sortValue: (r) => r.gp_last ?? -1,
      cell: (r) => gpCell(r.gp_last),
    },

    {
      key: "status",
      label: "Status",
      sortable: true,
      cell: (r) => <Badge tone={PRICE_STATUS_TONE[r.status]}>{r.status}</Badge>,
    },
    {
      key: "price_source",
      label: "Price Source",
      defaultHidden: true,
      cell: (r) => <Badge tone={PRICE_SOURCE_TONE[r.price_source]}>{r.price_source}</Badge>,
    },
    { key: "vendor", label: "Vendor", muted: true, defaultHidden: true, cell: (r) => r.vendor || DASH },
    {
      key: "promo_catalog",
      label: "Promotion",
      muted: true,
      defaultHidden: true,
      cell: (r) => r.promo_catalog || r.promo_legacy || DASH,
    },
    {
      key: "catalog_list_price",
      label: "Catalog List",
      align: "right",
      muted: true,
      defaultHidden: true,
      cell: (r) => num(r.catalog_list_price),
    },
    { key: "catalog_page", label: "Catalog Page", muted: true, defaultHidden: true, cell: (r) => r.catalog_page || DASH },
    { key: "source_sheet", label: "Source Sheet", muted: true, defaultHidden: true, cell: (r) => r.source_sheet || DASH },
    { key: "code", label: "Row Key", muted: true, defaultHidden: true, cell: (r) => r.code },
  ],

  secondaryActions: (ctx) => [
    {
      label: "Export Excel",
      icon: "upload",
      run: () =>
        ctx.toast("ส่งออก Excel", `เตรียมไฟล์ ${fmt(priceMasterRows().length)} รายการ — Future support`, "info"),
    },
    {
      label: "Export CSV",
      icon: "download",
      run: () => ctx.toast("ส่งออก CSV", "เตรียมไฟล์ตามคอลัมน์ที่แสดงอยู่ — Future support", "info"),
    },
    { label: "Print", icon: "printer", run: () => ctx.toast("พิมพ์รายการราคา", "Future support", "info") },
    {
      label: "Data Quality",
      icon: "alert",
      run: () => {
        const s = priceMasterSummary();
        ctx.toast(
          "คุณภาพข้อมูล",
          `รอต้นทุน ${s.pendingCost} · ทบทวน ${s.review} · ไม่มีราคา ${s.noPrice} · ไม่มีรหัส ${s.missingCode} · รหัสซ้ำ ${s.duplicateCode}`,
          "warning",
        );
      },
    },
    {
      label: "About This File",
      icon: "info",
      run: () => {
        const m = priceListMeta();
        ctx.toast(
          `Schema ${m.schemaVersion} · ${m.recordCount} รายการ`,
          `สร้างเมื่อ ${m.generatedAt} · ${m.currency} · ราคาก่อน VAT ทั้งหมด — ไฟล์นี้ generate มา ห้ามแก้ด้วยมือ`,
          "info",
        );
      },
    },
  ],

  hero: () => {
    const s = priceMasterSummary();
    return {
      kpis: [
        { icon: "tag", label: "Total SKU", value: fmt(s.total), sub: `schema ${s.schemaVersion}` },
        { icon: "checkCircle", label: "พร้อมขาย", value: fmt(s.ok), tone: "ok", goTab: "ok" },
        { icon: "alert", label: "รอต้นทุน", value: fmt(s.pendingCost), tone: "warn", goTab: "cost" },
        { icon: "eye", label: "ต้องทบทวน", value: fmt(s.review), tone: "warn", goTab: "review" },
        { icon: "circleSlash", label: "ไม่มีราคา", value: fmt(s.noPrice), goTab: "noprice" },
        {
          icon: "barcode",
          label: "ปัญหารหัส",
          value: fmt(s.missingCode + s.duplicateCode),
          sub: `ไม่มีรหัส ${s.missingCode} · ซ้ำ ${s.duplicateCode}`,
          tone: "warn",
          goTab: "codeissue",
        },
      ],
    };
  },

  panels: (rows) => {
    const flagged = flaggedRows();
    const inView = rows.filter((r) => r.status === "PENDING_COST").length;

    return [
      inView > 0 && {
        type: "alert",
        tone: "danger",
        title: `มี ${fmt(inView)} รายการที่ยังไม่มีต้นทุน`,
        message:
          "คำนวณราคา Dealer และ Last price ไม่ได้ — ต้องบล็อกการขายจนกว่าจะเติมต้นทุนเข้ามา",
      },
      flagged.length > 0 && {
        type: "table",
        title: `ข้อสังเกตจากตัวตรวจ (${flagged.length})`,
        rows: flagged.slice(0, 20) as PriceMasterRow[],
        cols: [
          { key: "product_code", label: "Product Code", cell: (r) => r.product_code || "ไม่มีรหัส" },
          { key: "product_name", label: "Product Name", muted: true, cell: (r) => r.product_name },
          {
            key: "status",
            label: "Status",
            cell: (r: PriceMasterRow) => (
              <Badge tone={PRICE_STATUS_TONE[r.status]}>{r.status}</Badge>
            ),
          },
          {
            key: "issue",
            label: "ข้อสังเกต",
            cell: (r) =>
              [
                ...r.violations.map((v: PriceViolation) => `${v.rule} ${v.message}`),
                r.duplicateCode ? "รหัสซ้ำกับรายการอื่น" : "",
                !r.tierOrderOk ? "ลำดับราคาผิด" : "" ,
              ]
                .filter(Boolean)
                .join(" · "),
          },
        ],
      },
    ];
  },

  rowActions: (rec, ctx) => [
    {
      label: "เปิดรายละเอียดราคา",
      icon: "eye",
      run: () => ctx.goto(`/m/price-list-master/${rec.code}`),
    },
    {
      label: "เปิดทะเบียนสินค้า",
      icon: "product",
      disabled: !rec.product_code || !getProduct(rec.product_code),
      disabledReason: "รหัสนี้ยังไม่มีในทะเบียนสินค้า",
      run: () => ctx.openEntity("product", rec.product_code),
    },
    { label: "เปิด Product Pricing", icon: "pricing", run: () => ctx.goto("/pricing") },
    { sep: true },
    {
      label: "คัดลอกรหัสสินค้า",
      icon: "copy",
      disabled: !rec.product_code,
      run: () => ctx.toast("คัดลอกรหัสสินค้าแล้ว", rec.product_code, "success"),
    },
  ],
};

/* ---------- Detail ---------- */

const detail: DetailSchema<PriceMasterRow> = {
  key: "price-list-master",
  entityLabel: "Price",

  identity: (r) => ({
    image: <Thumb size={44}>{r.icon}</Thumb>,
    code: r.product_code || r.code,
    title: r.product_name,
    copyFields: [
      ...(r.product_code ? [{ label: "Product Code", value: r.product_code }] : []),
      { label: "Row Key", value: r.code },
    ],
    badges: [
      { text: r.status, tone: PRICE_STATUS_TONE[r.status] },
      { text: r.price_source, tone: PRICE_SOURCE_TONE[r.price_source] },
      ...(r.missingCode ? [{ text: "ไม่มีรหัสสินค้า", tone: "danger" as const }] : []),
      ...(r.duplicateCode ? [{ text: "รหัสซ้ำ", tone: "danger" as const }] : []),
    ],
    tags: [r.brand, r.product_group, r.unit].filter((x): x is string => Boolean(x)),
  }),

  kpis: (r) => [
    {
      icon: "pricing",
      label: TIER_LABEL.private,
      value: r.price_private === null ? DASH : money(r.price_private),
      sub: r.gp_private === null ? "ไม่มีต้นทุน" : `GP ${(r.gp_private * 100).toFixed(1)}%`,
    },
    {
      icon: "tag",
      label: TIER_LABEL.dealer,
      value: r.price_dealer === null ? DASH : money(r.price_dealer),
      sub: r.gp_dealer === null ? DASH : `GP ${(r.gp_dealer * 100).toFixed(1)}%`,
    },
    {
      icon: "shield",
      label: TIER_LABEL.last,
      value: r.price_last === null ? DASH : money(r.price_last),
      sub: "ต่ำกว่านี้ต้องขออนุมัติ",
    },
    { icon: "cart", label: "Cost", value: r.cost_thb === null ? DASH : money(r.cost_thb), sub: "ก่อน VAT" },
  ],

  actions: (rec, ctx) => [
    {
      label: "เปิดทะเบียนสินค้า",
      icon: "product",
      disabled: !rec.product_code || !getProduct(rec.product_code),
      disabledReason: "รหัสนี้ยังไม่มีในทะเบียนสินค้า",
      run: () => ctx.openEntity("product", rec.product_code),
    },
    { label: "เปิด Product Pricing", icon: "pricing", run: () => ctx.goto("/pricing") },
    {
      label: "ส่งออกรายการนี้",
      icon: "upload",
      run: () => ctx.toast("ส่งออกรายการราคา", `${rec.product_name} — Future support`, "info"),
    },
    { label: "พิมพ์", icon: "printer", run: () => ctx.toast("พิมพ์รายการราคา", "Future support", "info") },
  ],

  tabs: [
    /* ---------- 1. Price tiers ---------- */
    {
      key: "tiers",
      label: "Price Tiers",
      blocks: (r): Block[] => [
        r.status === "PENDING_COST" && {
          type: "alert",
          tone: "danger",
          title: "ยังไม่มีต้นทุน — ห้ามขาย",
          message: PRICE_STATUS_TEXT.PENDING_COST,
        },
        r.status === "REVIEW" && {
          type: "alert",
          tone: "warn",
          title: "ต้องทบทวนราคา",
          message: PRICE_STATUS_TEXT.REVIEW,
        },
        !r.tierOrderOk && {
          type: "alert",
          tone: "danger",
          title: "ลำดับราคาผิด",
          message: "ต้องเป็น ราคาราชการ ≥ ราคาเอกชน ≥ ราคา Dealer ≥ Last price เสมอ",
        },
        {
          type: "cards",
          title: "ราคา 4 ชั้น (ก่อน VAT ทุกช่อง)",
          cols: 4,
          items: [
            {
              label: TIER_LABEL.government,
              value: r.price_government === null ? DASH : money0(r.price_government),
              unit: "THB",
              sub: "เอกชน × 1.10",
            },
            {
              label: TIER_LABEL.private,
              value: r.price_private === null ? DASH : money0(r.price_private),
              unit: "THB",
              tone: "accent",
              sub: r.gp_private === null ? "" : `GP ${(r.gp_private * 100).toFixed(1)}%`,
            },
            {
              label: TIER_LABEL.dealer,
              value: r.price_dealer === null ? DASH : money0(r.price_dealer),
              unit: "THB",
              sub: r.gp_dealer === null ? "" : `GP ${(r.gp_dealer * 100).toFixed(1)}%`,
            },
            {
              label: TIER_LABEL.last,
              value: r.price_last === null ? DASH : money0(r.price_last),
              unit: "THB",
              tone: "warn",
              sub: r.gp_last === null ? "" : `GP ${(r.gp_last * 100).toFixed(1)}%`,
            },
          ],
        },
        {
          type: "fields",
          title: "ใครใช้ราคาไหน",
          cols: 2,
          items: [
            { label: TIER_LABEL.government, value: "หน่วยงานราชการ · e-bidding" },
            { label: TIER_LABEL.private, value: "คลินิก · โรงพยาบาลเอกชน" },
            { label: TIER_LABEL.dealer, value: "ตัวแทนจำหน่ายช่วง (GP ขั้นต่ำ 48%)" },
            { label: TIER_LABEL.last, value: "เพดานล่างของทุกดีล (GP ขั้นต่ำ 40%)" },
            {
              label: "ลำดับราคา",
              value: r.tierOrderOk ? "ถูกต้องตามเกณฑ์" : "ผิดลำดับ",
              span: true,
            },
          ],
        },
      ],
    },

    /* ---------- 2. Cost and margin ---------- */
    {
      key: "margin",
      label: "Cost & Margin",
      blocks: (r): Block[] => [
        {
          type: "fields",
          title: "ต้นทุนและกำไรขั้นต้น",
          cols: 2,
          items: [
            { label: "ต้นทุนต่อหน่วย (ก่อน VAT)", value: r.cost_thb === null ? DASH : money(r.cost_thb) },
            { label: "หน่วย", value: r.unit || DASH },
            {
              label: "GP ราคาเอกชน",
              value: r.gp_private === null ? DASH : `${(r.gp_private * 100).toFixed(2)}%`,
            },
            {
              label: "GP ราคา Dealer",
              value: r.gp_dealer === null ? DASH : `${(r.gp_dealer * 100).toFixed(2)}%`,
            },
            {
              label: "GP Last price",
              value: r.gp_last === null ? DASH : `${(r.gp_last * 100).toFixed(2)}%`,
            },
            {
              label: "เกณฑ์ที่ใช้",
              value: `Dealer ≥ ${PRICING_CONFIG.dealerGpMin * 100}% · Last ≥ ${PRICING_CONFIG.lastPriceGpMin * 100}%`,
            },
          ],
        },
        {
          type: "note",
          title: "ฐานการคำนวณ GP",
          text: "GP = (ราคา − ต้นทุน) ÷ ราคา คำนวณจากราคาก่อน VAT โดยตรง ไม่มีการหาร 1.07 ก่อน — ค่าที่แสดงคือค่าที่บันทึกมากับไฟล์ ไม่ได้คำนวณใหม่ในหน้านี้",
        },
      ],
    },

    /* ---------- 3. Validation ---------- */
    {
      key: "validation",
      label: "Validation",
      blocks: (r): Block[] => [
        r.violations.length === 0 && r.tierOrderOk && !r.duplicateCode && !r.missingCode
          ? {
              type: "alert",
              tone: "success",
              title: "ผ่านการตรวจทุกข้อ",
              message: "ราคาเรียงลำดับถูกต้อง มีต้นทุน และ GP อยู่ในเกณฑ์",
            }
          : {
              type: "alert",
              tone: "warn",
              title: "มีข้อสังเกต",
              message: "ดูรายละเอียดในตารางด้านล่าง — ระดับ WARN ไม่บล็อกการขาย แต่ต้องมีคนดู",
            },
        {
          type: "table",
          title: "ผลการตรวจ",
          rows: r.violations,
          empty: "ไม่มีข้อผิดพลาดจากตัวตรวจ",
          cols: [
            { key: "rule", label: "Rule", cell: (v) => <span className="font-semibold">{v.rule}</span> },
            {
              key: "severity",
              label: "Severity",
              cell: (v) => (
                <Badge tone={v.severity === "BLOCK" ? "danger" : v.severity === "ERROR" ? "danger" : "warning"}>
                  {v.severity}
                </Badge>
              ),
            },
            { key: "message", label: "รายละเอียด", cell: (v) => v.message },
          ],
        },
        {
          type: "flags",
          title: "สถานะข้อมูลของแถวนี้",
          cols: 2,
          items: [
            { label: "มีรหัสสินค้า", value: !r.missingCode },
            { label: "รหัสไม่ซ้ำกับรายการอื่น", value: !r.duplicateCode },
            { label: "ลำดับราคาถูกต้อง", value: r.tierOrderOk },
            { label: "มีต้นทุน", value: r.cost_thb !== null && r.cost_thb > 0 },
            { label: "พร้อมขาย", value: r.sellable },
          ],
        },
        r.duplicateCode && {
          type: "table",
          title: `รายการที่ใช้รหัส ${r.product_code} เหมือนกัน`,
          rows: priceMasterByProduct(r.product_code),
          cols: [
            { key: "code", label: "Row Key", cell: (x) => x.code },
            { key: "product_name", label: "Product Name", cell: (x) => x.product_name },
            { key: "brand", label: "Brand", muted: true, cell: (x) => x.brand || DASH },
            {
              key: "price_private",
              label: "ราคาเอกชน",
              align: "right",
              cell: (x) => num(x.price_private),
            },
            { key: "source_sheet", label: "Source Sheet", muted: true, cell: (x) => x.source_sheet },
          ],
        },
        {
          type: "note",
          title: "สถานะปัจจุบัน",
          text: PRICE_STATUS_TEXT[r.status],
        },
      ],
    },

    /* ---------- 4. Catalog and source ---------- */
    {
      key: "catalog",
      label: "Catalog & Source",
      blocks: (r): Block[] => [
        {
          type: "fields",
          title: "ที่มาของราคา",
          cols: 2,
          items: [
            { label: "Price Source", value: r.price_source },
            { label: "Catalog Page", value: r.catalog_page || DASH },
            { label: "Source Sheet", value: r.source_sheet || DASH },
            { label: "Vendor", value: r.vendor || DASH },
            { label: "Brand", value: r.brand || DASH },
            { label: "Product Group", value: r.product_group || DASH },
            {
              label: "ราคาปกติในแคตตาล็อก",
              value: num(r.catalog_list_price),
              muted: true,
            },
            {
              label: "อนุมัติเมื่อขายต่ำกว่า",
              value: r.approval_required_below,
              muted: true,
            },
          ],
        },
        {
          type: "note",
          title: "ไฟล์ต้นทาง",
          text: `${priceListMeta().source.join(" · ")} — schema ${priceListMeta().schemaVersion} สร้างเมื่อ ${priceListMeta().generatedAt}`,
        },
      ],
    },

    /* ---------- 5. Promotion ---------- */
    {
      key: "promo",
      label: "Promotion",
      blocks: (r): Block[] => [
        Boolean(r.catalog_net_price) && {
          type: "alert",
          tone: "warn",
          title: "ราคาสุทธิเมื่อครบโปรฯ ไม่ใช่ราคาตั้ง",
          message: `${money(r.catalog_net_price!)} คือตัวเลข "เฉลี่ยเพียง" ในแคตตาล็อก — ยังออกบิลที่ราคาเต็มแล้วแถมของ ห้ามนำมาตั้งเป็นราคาขาย`,
        },
        {
          type: "fields",
          title: "โปรโมชั่น",
          cols: 2,
          items: [
            { label: "โปรฯ ในแคตตาล็อก", value: r.promo_catalog || DASH, span: true },
            { label: "โปรฯ เดิมใน Pricelist", value: r.promo_legacy || DASH, span: true },
            { label: "ซื้อขั้นต่ำ", value: r.promo_min_qty === null ? DASH : fmt(r.promo_min_qty) },
            { label: "แถม", value: r.promo_free_qty === null ? DASH : fmt(r.promo_free_qty) },
            { label: "ราคาสุทธิเมื่อครบโปรฯ", value: num(r.catalog_net_price), muted: true },
            { label: "ราคาปกติในแคตตาล็อก", value: num(r.catalog_list_price), muted: true },
          ],
        },
        r.promo_catalog && r.promo_legacy && r.promo_catalog !== r.promo_legacy
          ? {
              type: "alert",
              tone: "info",
              title: "โปรฯ แคตตาล็อกกับของเดิมไม่ตรงกัน",
              message: "ยังไม่ได้ข้อสรุปว่าจะใช้อันไหน — ดู §5 ในเอกสารกติกาการตั้งราคา",
            }
          : null,
        {
          type: "planned",
          title: "Promotion Engine",
          label: "10 กลไก · stacking rule",
          message:
            "โปรโมชั่นทำงานหลังเลือกราคาตั้งแล้ว ห้ามเขียนทับราคาตั้ง — กติกาการซ้อนโปรฯ ยังไม่ได้กำหนด ต้องบังคับ PR-01/PR-02 หลังคำนวณโปรฯ ครบทุกชั้น",
        },
      ],
    },

    /* ---------- 6. Record ---------- */
    {
      key: "record",
      label: "Record",
      blocks: (r): Block[] => [
        {
          type: "fields",
          title: "ข้อมูลแถว",
          cols: 2,
          items: [
            { label: "Row Key", value: r.code },
            { label: "ลำดับในไฟล์", value: fmt(r.seq) },
            { label: "Product Code", value: r.product_code || "ไม่มีรหัส" },
            { label: "Product Name", value: r.product_name },
            { label: "Notes", value: r.notes || DASH, span: true },
          ],
        },
        {
          type: "note",
          title: "ไฟล์นี้แก้ด้วยมือไม่ได้",
          text: "gp_*, price_dealer และ price_last เป็นค่าที่คำนวณมาจากต้นทุนและราคาเอกชน แก้ช่องเดียวจะทำให้ทั้งแถวไม่สอดคล้องกัน ถ้าราคาต้นทางเปลี่ยนให้ generate ไฟล์ใหม่ทั้งไฟล์",
        },
      ],
    },
  ],
};

export const priceListMasterSchemas: EntitySchemas<PriceMasterRow> = { list, detail };
