# A-Factory ERP — Price List Master Data

บริบทสำหรับ Claude ใน VS Code / Claude Code

---

## ไฟล์ในชุดนี้

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `data/pricelist_master.csv` | ข้อมูลราคา 807 รายการ (UTF-8 **with BOM**) — ใช้เมื่ออยาก grep/diff |
| `data/pricelist_master.json` | เหมือนกัน แต่มี metadata + pricing config — **ใช้ไฟล์นี้เป็นหลักในโค้ด** |
| `docs/PRICING_RULES.md` | สเปกกติกาการตั้งราคาทั้งหมด — **อ่านก่อนแตะโค้ดราคา** |
| `src/lib/pricing.ts` | TypeScript types + ฟังก์ชันคำนวณและ validate พร้อมใช้ |
| `CLAUDE.md` | ไฟล์นี้ |

โปรเจกต์: A-Factory ERP — Next.js 14 / TypeScript / Tailwind CSS

---

## กติกาเหล็ก 3 ข้อ — ห้ามละเมิด

1. **ราคาทุกช่องเป็นราคาก่อน VAT** ไม่มีช่องไหนรวม VAT
2. **ห้ามหาร 1.07 ก่อนคำนวณ GP** — `GP = (price − cost) / price` เท่านั้น
   ถ้าเห็นโค้ดที่มี `/1.07` หรือ `/ (1 + VAT_RATE)` ในเส้นทางคำนวณ GP ให้แจ้งทันที นั่นคือบั๊ก
3. **ห้ามขายต่ำกว่า `price_last`** โดยไม่ผ่าน approval workflow

---

## ราคา 4 ชั้น

```
price_government  ≥  price_private  ≥  price_dealer  ≥  price_last
   (เอกชน × 1.1)      (แคตตาล็อก)      (GP ≥ 48%)      (GP ≥ 40%)
```

**ราคาราชการสูงกว่าราคาเอกชนโดยตั้งใจ** — ไม่ใช่บั๊ก อย่า "แก้" ให้กลับด้าน

**ราคา Dealer ใช้ `MAX` ของสองเงื่อนไข** ไม่ใช่แค่ GP floor:
```ts
price_dealer = MAX(
  ceilRound(cost / (1 - 0.48)),        // เพดานล่าง GP 48%
  ceilRound(price_private * (1 - 0.30)) // ลดได้มากสุด 30%
)
```
เจตนา: สินค้าที่กำไรดีอยู่แล้วไม่ต้องลดราคาลงไปถึง 48% ทั้งที่ไม่จำเป็น
เช่น Contra Angle ทุน 665 เอกชน 3,800 → Dealer = 2,700 (GP 75%) ไม่ใช่ 1,280

---

## กับดักที่พลาดกันบ่อย

**`catalog_net_price` ไม่ใช่ราคาขาย**
แคตตาล็อกเขียน "TrusFIL 850 ซื้อ 1 แถม 1 เฉลี่ยเพียง 425" — ยังออกบิลที่ **850** แล้วแถมของอีก 1 ชิ้น
ถ้าเอา 425 ไปเป็นราคาตั้ง จะขาย 425 แล้วยังแถมอีก = ขาดทุนซ้อน
ฟิลด์นี้มีไว้ตรวจสอบว่าคำนวณโปรฯ ถูกเท่านั้น

**ต้องเช็ค `status` ก่อนขายเสมอ**
- `PENDING_COST` (56 รายการ) → ไม่มีต้นทุน คำนวณ Dealer/Last ไม่ได้ → **บล็อกการขาย**
- `REVIEW` (16 รายการ) → ต้นทุนสูงจนทำ GP 48% ไม่ได้ → ต้องให้คนตัดสิน
- `NO_PRICE` (8 รายการ) → ไม่มีราคาตั้ง
- `OK` (727 รายการ) → ใช้ได้

**`product_code` ว่างได้** — 51 แถวจากชีต `Orthodontic-Wire&Orther` ต้นทางไม่มีคอลัมน์รหัส
อย่าใช้ `product_code` เป็น primary key ตรง ๆ จนกว่าจะเคลียร์

**มี 5 รหัสซ้ำ** — `H-RC005-01` ร้ายแรงที่สุด เพราะผูกกับสินค้าคนละตัว (TopCEM RMGI vs UltraCore)
ถ้าเจอ duplicate key error ตอน import นี่คือสาเหตุ

---

## งานที่ต่อได้ทันที

1. **BP Master ↔ Price tier** — ผูก `partner_type` กับ `PriceTier`
   customer เอกชน → `private` · customer ราชการ → `government` · dealer → `dealer`
   (BP Master ใช้ canonical key `BP0xxxxx` และ pattern shared-core + extension table `bp_customer` / `bp_supplier`)

2. **Import ผ่าน Generic Import Framework** — pipeline 6 ขั้น Source → Map → Normalize → Validate → Preview → Commit
   - ขั้น Validate ใช้ `validateItem()` จาก `pricing.ts`
   - ตาม pattern เดิม: import ทุกแถวแล้ว flag error ไม่ drop แถวทิ้ง
   - อ่าน CSV ด้วย SheetJS ต้องใช้ `{ header: 1, raw: false }` ไม่งั้นเลข 0 นำหน้าหาย

3. **Price approval workflow ใน SR/SO**
   เรียก `checkQuotedPrice()` **หลังจาก** คำนวณส่วนลดและโปรโมชั่นครบทุกชั้นแล้ว ไม่ใช่ตอนกรอกราคาต่อบรรทัด
   ถ้า `requiresApproval` → `status = PENDING_PRICE_APPROVAL` → ผู้อนุมัติ MD/GM → เขียน audit log (`approved_by`, `approved_at`, `approval_reason`, `approved_price`)

4. **Promotion engine** — 10 กลไก อยู่ในไฟล์ `AFactory_Promotion_Master_v1.xlsx` แยกต่างหาก
   โปรฯ ทำงาน**หลัง**เลือกราคาตั้ง ห้ามเขียนทับราคาตั้ง
   ยังไม่ได้กำหนด stacking rule — ต้องถามก่อนเขียนโค้ดส่วนนี้

---

## เรื่องที่ยังไม่มีข้อสรุป — ถามก่อนตัดสินใจเอง

- **Stacking rule ของโปรโมชั่น** ปกแคตตาล็อกโฆษณา "ลดสูงสุด 80%" แต่ส่วนลดเดี่ยวสูงสุดที่มีจริงคือ 65% ถ้าปล่อยให้ซ้อนอิสระราคาจะหลุด `price_last`
- **Scaler tips 126 SKU** โปรฯ ในแคตตาล็อก (5 FREE 1 / 10 FREE 3 / 30 FREE 12) ขัดกับของเดิม (5 Free 2 / 10 Free 6 / 30 Free 20) ต่างกันเกือบเท่าตัว
- **สินค้าในแคตตาล็อก 34 รายการยังไม่มีรหัส** — Getidy autoclave, ES-20, RAY100X, X-View, AlgiDent, TempFIT, PERFIT Monophase ฯลฯ
- **โปรโมชั่นหมดอายุ 30 ก.ย. 2569** หลังจากนั้นต้องสลับไปใช้ `catalog_list_price` — ยังไม่ได้ออกแบบกลไกสลับ

---

## เมื่อ regenerate ข้อมูลใหม่

ไฟล์นี้สร้างจาก `AFACTORY_Catalog_01.pdf` + `Pricelist.xlsx` + `Products.xlsx`
ถ้าราคาต้นทางเปลี่ยน ให้ generate ใหม่ทั้งไฟล์ **อย่าแก้ `pricelist_master.json` ด้วยมือ** เพราะ `gp_*` และ `price_dealer` / `price_last` เป็นค่าที่คำนวณมา แก้ช่องเดียวจะทำให้ไม่สอดคล้องกัน
