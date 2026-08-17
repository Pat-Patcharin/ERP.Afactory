import {
  BUDGET_BASIS_TH,
  PROMOTION_SCOPE_TH,
  PROMOTION_STATUSES,
  PROMOTION_STATUS_TH,
  PROMOTIONS,
  approvePromotion,
  budgetUsedPct,
  mayApprovePromotion,
  mayEditPromotion,
  pausePromotion,
  promotionApprovalLevel,
  promotionFloorBreaches,
  promotionPrintName,
  resumePromotion,
  type PromotionRow,
} from "@/lib/domain/promotion";
import { PROMOTION_KINDS } from "@/lib/domain/promotion";
import { bestLadder } from "@/lib/domain/promotion-ladder";
import { PROMO_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money, money0 } from "@/lib/format";
import type { ActionCtx, Block, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellSub, Textarea } from "@/components/ui";

/* ============================================================
   PROMOTION — แคมเปญที่คนตั้งเอง

   ไม่ใช่ `promo_min_qty` ในราคากลาง ตัวนั้นเป็นเงื่อนไขของผู้ผลิตที่ติดมา
   กับ SKU และเป็นข้อมูลอ้างอิงล้วน ๆ ไม่ได้ต่อเข้าเครื่องคิดราคา —
   ดู BACKLOG PM-1 ตัวนี้คือแคมเปญที่มีช่วงเวลา มีงบ และมีคนอนุมัติ

   ฟอร์มยังเป็น stub ในขั้นนี้ — ไม่มีคีย์ `form` ทางสร้าง/แก้จึงตกไปที่
   FormPlaceholder ซึ่งบอกชื่อโมดูลแทนที่จะพัง
   ============================================================ */

const kindLabel = (row: PromotionRow) =>
  PROMOTION_KINDS.find((k) => k.key === row.kind)?.label ?? row.kind;

/** ขั้นบันไดย่อเป็นบรรทัดเดียว — "3 แถม 1 · 10 แถม 4" */
const tierText = (row: PromotionRow) =>
  row.tiers.length
    ? row.tiers
        .slice()
        .sort((a, b) => a.buy - b.buy)
        .map((t) => `${fmt(t.buy)} แถม ${fmt(t.free)}`)
        .join(" · ")
    : DASH;

/** เรียกครั้งเดียวแล้วส่งต่อ — ทุกด่านคืนเหตุผลมาให้ toast ใช้เป็นข้อความ */
const runGuard = (
  ctx: ActionCtx,
  result: { ok: boolean; reason: string },
  okTitle: string,
  code: string,
) => {
  if (result.ok) {
    ctx.refresh();
    ctx.toast(okTitle, code, "success");
  } else {
    /* หน้าจอที่ค้างอยู่กดปุ่มที่ไม่ควรมีได้ — ด่านอยู่ที่ฟังก์ชัน ปุ่มแค่สะท้อนมัน */
    ctx.refresh();
    ctx.toast("ทำรายการไม่ได้", result.reason, "danger");
  }
};

export const PROMO_LIST: ListSchema<PromotionRow> = {
  key: "promotion",
  entity: "Promotion",
  entityPlural: "Promotions",
  title: "Promotion",
  subtitle:
    "แคมเปญที่ตั้งเอง มีช่วงเวลา มีงบ และมีคนอนุมัติ — เงื่อนไขซื้อ-แถมที่ติดมากับ SKU จากแคตตาล็อกผู้ผลิตเป็นคนละเรื่อง และเป็นข้อมูลอ้างอิงเท่านั้น",
  crumb: "Promotion",
  primaryLabel: "New Promotion",
  searchPlaceholder: "ค้นหารหัสโปร ชื่อ หรือเหตุผลที่สร้าง...",
  emptyTitle: "ไม่พบโปรโมชั่นที่ตรงกับเงื่อนไข",

  source: () => PROMOTIONS,
  searchFields: ["code", "name", "printName", "reason", "owner"],

  /* เลือกประเภทก่อนเสมอ — สี่ประเภทถามข้อมูลคนละชุดและคิดคนละแบบ
     จึงไม่มีทาง "สร้างเปล่า" ที่ข้ามคำถามนั้นไป */
  onCreate: (ctx) => ctx.goto("/promotion/new"),

  tabs: [
    { key: "all", label: "All" },
    { key: "pending", label: "รออนุมัติ", test: (p) => p.status === "Pending Approval" },
    { key: "active", label: "ใช้งานอยู่", test: (p) => p.status === "Active" },
    { key: "paused", label: "หยุดชั่วคราว", test: (p) => p.status === "Paused" },
    { key: "draft", label: "ร่าง", test: (p) => p.status === "Draft" },
    { key: "ended", label: "สิ้นสุด", test: (p) => p.status === "Ended" },
  ],

  filters: [
    {
      id: "status",
      label: "สถานะ",
      options: () => [...PROMOTION_STATUSES],
      test: (p, v) => p.status === v,
    },
    {
      id: "reason",
      label: "เหตุผลที่สร้าง",
      options: () => [...new Set(PROMOTIONS.map((p) => p.reason).filter(Boolean))],
      test: (p, v) => p.reason === v,
    },
    {
      id: "owner",
      label: "เจ้าของโปร",
      options: () => [...new Set(PROMOTIONS.map((p) => p.owner).filter(Boolean))],
      test: (p, v) => p.owner === v,
    },
    {
      id: "floor",
      label: "ราคาเฉลี่ยหลุดขั้นต่ำ",
      options: () => ["หลุด", "ไม่หลุด"],
      test: (p, v) => (promotionFloorBreaches(p).length > 0) === (v === "หลุด"),
    },
  ],

  columns: [
    { key: "code", label: "รหัสโปร", sortable: true, cell: (p) => <span className="font-medium tnum">{p.code}</span> },
    {
      key: "name",
      label: "ชื่อโปร",
      cell: (p) => (
        <>
          {p.name}
          {/* ชื่อภายในกับชื่อที่ลูกค้าเห็นมักไม่เหมือนกัน — แสดงตัวที่พิมพ์ออกไป
              เมื่อมันต่างจากชื่อภายใน */}
          {promotionPrintName(p) !== p.name && (
            <CellSub>พิมพ์ว่า “{promotionPrintName(p)}”</CellSub>
          )}
        </>
      ),
    },
    { key: "kind", label: "ประเภท", cell: (p) => kindLabel(p) },
    { key: "tiers", label: "ขั้นบันได", cell: (p) => <span className="tnum">{tierText(p)}</span> },
    { key: "scope", label: "ขอบเขต", muted: true, cell: (p) => PROMOTION_SCOPE_TH[p.scope] },
    { key: "from", label: "เริ่ม", sortable: true, muted: true, cell: (p) => p.from || DASH },
    { key: "to", label: "สิ้นสุด", muted: true, cell: (p) => p.to || "ไม่มีกำหนด" },
    {
      key: "budget",
      label: "งบที่ใช้ไป",
      align: "right",
      cell: (p) => {
        const pct = budgetUsedPct(p);
        if (pct === null) return <span className="text-ink-3">ไม่จำกัด</span>;
        return (
          <span className={pct >= p.budgetWarnAt ? "font-semibold text-warning-text tnum" : "tnum"}>
            {money0(p.budgetUsed)} / {money0(p.budget!)} ({pct}%)
          </span>
        );
      },
    },
    {
      key: "level",
      label: "ระดับอนุมัติ",
      cell: (p) =>
        promotionApprovalLevel(p) === "manager" ? (
          <Badge tone="warning">ผู้จัดการ</Badge>
        ) : (
          <Badge tone="neutral">แอดมิน</Badge>
        ),
    },
    {
      key: "status",
      label: "สถานะ",
      cell: (p) => (
        <Badge tone={tone(PROMO_TONE, p.status)}>{PROMOTION_STATUS_TH[p.status]}</Badge>
      ),
    },
  ],

  quickActions: (p, ctx) =>
    p.status === "Pending Approval"
      ? [
          {
            label: "อนุมัติ",
            icon: "checkCircle",
            run: (r: PromotionRow) =>
              runGuard(ctx, approvePromotion(r), "อนุมัติโปรแล้ว", r.code),
          },
        ]
      : [],

  rowActions: (p, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("promotion", r.code) },
    {
      label: "Edit",
      icon: "edit",
      run: (r) => {
        /* ด่านเดียวกับที่ฟังก์ชันเขียนใช้ ปุ่มจึงบอกเหตุผลเดียวกับที่การเขียน
           จะปฏิเสธ แทนที่จะพาไปหน้าที่กดบันทึกแล้วเด้งกลับ */
        const guard = mayEditPromotion(r);
        if (!guard.ok) {
          ctx.toast("แก้ไม่ได้", guard.reason, "danger");
          return;
        }
        ctx.goto(`/m/promotion/${r.code}/edit`);
      },
    },
    { sep: true },
    ...(p.status === "Pending Approval"
      ? ([
          {
            label: "อนุมัติ",
            icon: "checkCircle",
            run: (r: PromotionRow) =>
              runGuard(ctx, approvePromotion(r), "อนุมัติโปรแล้ว", r.code),
          },
        ] as const)
      : []),
    ...(p.status === "Active"
      ? ([
          {
            label: "หยุดชั่วคราว",
            icon: "circleSlash",
            run: (r: PromotionRow) => {
              let reason = "";
              ctx.formModal({
                title: "หยุดโปรชั่วคราว",
                body: () => (
                  <div className="flex flex-col gap-3">
                    <p className="text-body text-ink-2">
                      {r.code} — {r.name}
                    </p>
                    <label className="flex flex-col gap-1">
                      <span className="text-cap font-medium text-ink-2">เหตุผลที่หยุด</span>
                      <Textarea
                        aria-label="เหตุผลที่หยุด"
                        rows={3}
                        placeholder="เช่น ของแถมไปชนกับโปรของผู้ผลิต ขอพักตรวจสอบ"
                        onChange={(e) => (reason = e.target.value)}
                      />
                    </label>
                  </div>
                ),
                confirmText: "หยุดโปร",
                onConfirm: () => {
                  const res = pausePromotion(r, reason);
                  runGuard(ctx, res, "หยุดโปรแล้ว", r.code);
                  /* ปฏิเสธแล้วกล่องต้องค้างไว้ ไม่ใช่ปิดลงเหมือนทำสำเร็จ */
                  return res.ok;
                },
              });
            },
          },
        ] as const)
      : []),
    ...(p.status === "Paused"
      ? ([
          {
            label: "เปิดกลับมาใช้",
            icon: "refresh",
            run: (r: PromotionRow) =>
              runGuard(ctx, resumePromotion(r), "เปิดโปรกลับแล้ว", r.code),
          },
        ] as const)
      : []),
  ],

  hideImportExport: true,
};

export const PROMO_DETAIL: DetailSchema<PromotionRow> = {
  key: "promotion",
  entityLabel: "Promotion",

  identity: (p) => ({
    image: "🎁",
    code: p.code,
    title: p.name,
    copyFields: [
      { label: "รหัสโปร", value: p.code },
      { label: "ชื่อที่พิมพ์บนเอกสาร", value: promotionPrintName(p) },
    ],
    badges: [
      { text: PROMOTION_STATUS_TH[p.status], tone: tone(PROMO_TONE, p.status) },
      { text: kindLabel(p), tone: "info" },
    ],
    tags: [PROMOTION_SCOPE_TH[p.scope], p.reason || "ยังไม่ระบุเหตุผล", p.owner],
  }),

  kpis: (p) => [
    { icon: "promotion", label: "ขั้นบันได", value: String(p.tiers.length), sub: "ขั้น", goTab: "tiers" },
    {
      icon: "pricing",
      label: "งบที่ใช้ไป",
      value: p.budget ? `${budgetUsedPct(p)}%` : "ไม่จำกัด",
      sub: p.budget ? `${money0(p.budgetUsed)} / ${money0(p.budget)}` : BUDGET_BASIS_TH[p.budgetBasis],
      goTab: "budget",
    },
    {
      icon: "shield",
      label: "ระดับอนุมัติ",
      value: promotionApprovalLevel(p) === "manager" ? "ผู้จัดการ" : "แอดมิน",
      sub: p.approvedBy ? `อนุมัติโดย ${p.approvedBy}` : "ยังไม่อนุมัติ",
      goTab: "overview",
    },
    { icon: "clock", label: "ช่วงเวลา", value: p.from || DASH, sub: p.to || "ไม่มีกำหนดสิ้นสุด", wide: true, goTab: "overview" },
  ],

  tabs: [
    {
      key: "overview",
      label: "ภาพรวม",
      blocks: (p): Block[] => [
        /* §6g — โปรที่หยุดไว้และเงื่อนไขถูกแก้ ต้องบอกตรงนี้ ไม่ใช่ให้ไปเจอ
           ตอนกดเปิดกลับแล้วถูกปฏิเสธ */
        p.status === "Paused" && p.dirtySinceApproval
          ? {
              type: "alert",
              tone: "warn",
              title: "เงื่อนไขถูกแก้ระหว่างหยุด — ต้องขออนุมัติใหม่",
              message:
                "เปิดกลับมาใช้ทันทีไม่ได้ เพราะนี่ไม่ใช่โปรตัวเดิมที่ถูกอนุมัติไปแล้ว กดเปิดกลับจะส่งไปเข้าคิวอนุมัติแทน",
            }
          : null,
        p.status === "Paused" && !p.dirtySinceApproval
          ? {
              type: "alert",
              tone: "info",
              title: "หยุดชั่วคราวอยู่",
              message: `${p.pausedReason} — หยุดโดย ${p.pausedBy} เมื่อ ${p.pausedAt} · เปิดกลับได้เลยโดยไม่ต้องขออนุมัติซ้ำ เพราะเงื่อนไขไม่ได้ถูกแก้`,
            }
          : null,
        {
          type: "fields",
          title: "ข้อมูลระบุตัวโปร",
          cols: 2,
          items: [
            { label: "รหัสโปรโมชัน", value: p.code },
            { label: "ชื่อภายใน", value: p.name },
            { label: "ชื่อที่พิมพ์บนเอกสาร", value: promotionPrintName(p) },
            { label: "ประเภท", value: kindLabel(p) },
            { label: "วันเริ่ม", value: p.from || DASH },
            { label: "วันสิ้นสุด", value: p.to || "ไม่มีกำหนด" },
            { label: "ลำดับความสำคัญ", value: fmt(p.priority) },
            {
              label: "เหตุผลที่สร้างโปร",
              value: p.reason || <span className="text-danger">ยังไม่ได้ระบุ</span>,
            },
            { label: "เจ้าของโปร", value: p.owner },
          ],
        },
        {
          type: "fields",
          title: "ใช้กับอะไร",
          cols: 2,
          items: [
            { label: "ขอบเขต", value: PROMOTION_SCOPE_TH[p.scope] },
            { label: "สินค้า", value: p.items.length ? p.items.join(", ") : DASH, span: true },
            { label: "ตารางราคาที่ใช้ได้", value: p.priceLists.length ? p.priceLists.join(", ") : "ทุกตาราง" },
            { label: "ยอดขั้นต่ำ", value: p.minOrder === null ? "ไม่กำหนด" : `${money0(p.minOrder)} (${p.minOrderBasis})` },
            {
              label: "เฉพาะล็อตใกล้หมดอายุ",
              value: p.nearExpiryOnly ? `เหลืออายุไม่เกิน ${fmt(p.nearExpiryDays ?? 0)} วัน` : "ปิด",
            },
          ],
        },
        {
          type: "fields",
          title: "ใช้กับใคร",
          cols: 2,
          items: [
            { label: "กลุ่มลูกค้า", value: p.customerGroups.length ? p.customerGroups.join(", ") : "ทุกกลุ่ม" },
            { label: "ลูกค้าเจาะจง", value: p.customers.length ? p.customers.join(", ") : "ไม่จำกัด" },
            { label: "เขตการขาย", value: p.areas.length ? p.areas.join(", ") : "ทุกเขต" },
            { label: "ช่องทางการขาย", value: p.channels.length ? p.channels.join(", ") : "ทุกช่องทาง" },
            { label: "คู่ค้าสถานะ Draft ใช้ได้", value: p.allowDraftPartner ? "เปิด" : "ปิด" },
          ],
        },
        {
          type: "fields",
          title: "ข้อจำกัดและผลกระทบ",
          cols: 2,
          items: [
            { label: "จำนวนครั้งต่อลูกค้า", value: p.usePerCustomer === null ? "ไม่จำกัด" : fmt(p.usePerCustomer) },
            { label: "จำนวนครั้งรวมทั้งโปร", value: p.useTotal === null ? "ไม่จำกัด" : fmt(p.useTotal) },
            { label: "ซ้ำกับโปรอื่น", value: p.stackWithPromo ? "ให้ซ้ำ" : "ไม่ให้ซ้ำ" },
            { label: "ซ้ำกับส่วนลดประจำของลูกค้า", value: p.stackWithCustomerDiscount ? "เปิด" : "ปิด" },
            { label: "บันทึกเลขที่การใช้", value: p.recordUsage ? "เปิด" : "ปิด" },
            { label: "ต้องอนุมัติก่อนเปิดใช้", value: p.needsApproval ? "เปิด" : "ปิด" },
            {
              label: "ฐานคิดค่าคอมมิชชัน",
              value: p.commissionBase || <span className="text-danger">ยังไม่ได้เลือก</span>,
              span: true,
            },
          ],
        },
        {
          type: "fields",
          title: "ร่องรอย",
          cols: 2,
          items: [
            { label: "สร้างโดย", value: p.createdBy, muted: true },
            { label: "วันที่สร้าง", value: p.created, muted: true },
            { label: "อนุมัติโดย", value: p.approvedBy || DASH, muted: true },
            { label: "วันที่อนุมัติ", value: p.approvedAt || DASH, muted: true },
          ],
        },
      ],
    },

    {
      key: "tiers",
      label: "ขั้นบันไดและของแถม",
      blocks: (p): Block[] => {
        const breaches = promotionFloorBreaches(p);
        return [
          breaches.length
            ? {
                type: "alert",
                tone: "danger",
                title: `มี ${breaches.length} ขั้นที่ทำให้ราคาเฉลี่ยต่ำกว่าราคาขั้นต่ำ`,
                message:
                  "โปรนี้ต้องให้ผู้จัดการฝ่ายขายอนุมัติเท่านั้น และทุกใบที่ใช้โปรนี้จะถูกส่งขออนุมัติราคาตามกฎเดิม — เตือนตั้งแต่ตอนตั้งโปร ไม่ใช่ให้เซลล์ไปเจอตอนถูกตีกลับ",
              }
            : null,
          {
            type: "table",
            title: "ขั้นบันได",
            empty: "ยังไม่ได้ตั้งขั้นบันได",
            rows: p.tiers.slice().sort((a, b) => a.buy - b.buy),
            cols: [
              { key: "buy", label: "ซื้อ (จ่ายจริง)", align: "right", cell: (t) => fmt(t.buy) },
              { key: "free", label: "แถม", align: "right", cell: (t) => fmt(t.free) },
              { key: "total", label: "รวมที่ได้รับ", align: "right", cell: (t) => fmt(t.buy + t.free) },
            ],
          },
          /* ตัวอย่างจากตัวคำนวณจริง ไม่ใช่ตัวเลขที่พิมพ์ไว้ — หน้ารายละเอียด
             อ่านคำตอบจาก bestLadder ตัวเดียวกับที่ตัวลองคำนวณจะใช้ */
          p.tiers.length
            ? {
                type: "table",
                title: "ตัวอย่างผลลัพธ์",
                rows: [6, 9, 13, 20, 30].map((qty) => {
                  const r = bestLadder(p.tiers, qty);
                  return {
                    qty,
                    free: r.free,
                    unmatched: r.unmatched,
                    uses: r.uses.map((u) => `${u.tier.buy}/${u.tier.free} × ${u.times}`).join(" + ") || DASH,
                  };
                }),
                cols: [
                  { key: "qty", label: "จ่าย", align: "right", cell: (r) => fmt(r.qty) },
                  { key: "free", label: "แถม", align: "right", cell: (r) => fmt(r.free) },
                  { key: "uses", label: "ใช้ขั้น", cell: (r) => r.uses },
                  {
                    key: "unmatched",
                    label: "เศษที่ทิ้ง",
                    align: "right",
                    cell: (r) => (r.unmatched ? <span className="text-ink-3">{fmt(r.unmatched)}</span> : DASH),
                  },
                ],
              }
            : null,
          breaches.length
            ? {
                type: "table",
                title: "ขั้นที่หลุดราคาขั้นต่ำ",
                rows: breaches,
                cols: [
                  { key: "code", label: "สินค้า", cell: (b) => b.code },
                  { key: "tier", label: "ขั้น", cell: (b) => `${fmt(b.tier.buy)} แถม ${fmt(b.tier.free)}` },
                  {
                    key: "average",
                    label: "ราคาเฉลี่ย",
                    align: "right",
                    cell: (b) => <span className="font-semibold text-danger-text tnum">{money(b.average)}</span>,
                  },
                  { key: "floor", label: "ราคาขั้นต่ำ", align: "right", cell: (b) => <span className="tnum">{money(b.floor)}</span> },
                ],
              }
            : null,
        ];
      },
    },

    {
      key: "budget",
      label: "งบประมาณและคลัง",
      blocks: (p): Block[] => [
        p.budgetBasis === ""
          ? {
              type: "alert",
              tone: "warn",
              title: "ยังไม่ได้เลือกว่างบคิดจากอะไร",
              message:
                "งบก้อนเดียวกันคิดจากต้นทุนกับคิดจากราคาขาย ต่างกันเป็นเท่าตัว — ต้องเลือกก่อนเปิดใช้โปร",
            }
          : null,
        {
          type: "fields",
          title: "งบประมาณ",
          cols: 2,
          items: [
            { label: "วงเงิน", value: p.budget === null ? "ไม่จำกัด" : money0(p.budget) },
            { label: "คิดจากอะไร", value: BUDGET_BASIS_TH[p.budgetBasis] },
            { label: "ใช้ไปแล้ว", value: money0(p.budgetUsed), muted: true },
            {
              label: "คงเหลือ",
              value: p.budget === null ? DASH : money0(Math.max(0, p.budget - p.budgetUsed)),
            },
            { label: "ถึงเพดานแล้วทำยังไง", value: p.budgetOver === "stop" ? "หยุดอัตโนมัติ" : "เตือนแต่ใช้ต่อได้" },
            { label: "เตือนเมื่อใช้ถึง", value: `${fmt(p.budgetWarnAt)}%` },
          ],
        },
        {
          type: "fields",
          title: "คลังที่หักของแถม",
          cols: 2,
          items: [
            {
              label: "คลัง",
              value: p.freeGoodsWarehouse || <span className="text-danger">ยังไม่ได้ระบุ</span>,
            },
          ],
        },
        p.freeGoodsWarehouse
          ? null
          : {
              type: "alert",
              tone: "warn",
              title: "ยังไม่ได้ระบุคลังที่หักของแถม",
              message:
                "ถ้าไม่ระบุ ของแถมจะไปกินสต๊อกที่ตั้งใจขาย แล้วเซลล์อีกคนจะเจอของหมดโดยไม่รู้สาเหตุ",
            },
      ],
    },
  ],

  actions: (p, ctx) => [
    {
      label: "ดูว่าใครอนุมัติได้",
      icon: "shield",
      run: (r: PromotionRow) => {
        const guard = mayApprovePromotion(r);
        ctx.toast(
          guard.ok ? "คุณอนุมัติโปรนี้ได้" : "คุณอนุมัติโปรนี้ไม่ได้",
          guard.ok ? `${r.code} รออนุมัติจากคุณอยู่` : guard.reason,
          guard.ok ? "success" : "info",
        );
      },
    },
  ],
};

export const promotionSchemas: EntitySchemas<PromotionRow> = {
  list: PROMO_LIST,
  detail: PROMO_DETAIL,
};
