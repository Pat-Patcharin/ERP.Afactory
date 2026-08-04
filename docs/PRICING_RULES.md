# A-Factory ERP — Pricing Rules (Price List Master Data)

**Schema version:** 1.0.0 · **Generated:** 2026-08-04 · **Currency:** THB · **Records:** 807

Source of truth for prices: **AFACTORY_Catalog_01.pdf (TDA Big Deals, มีผลถึง 30 ก.ย. 2569)**
Fallback เมื่อไม่มีในแคตตาล็อก: `Pricelist.xlsx`. ต้นทุนจาก `Products.xlsx` sheet `Cost Update`.

---

## 0. กติกาเหล็ก 3 ข้อ

1. **ราคาทุกช่องเป็นราคาก่อน VAT** — ไม่มีช่องไหนรวม VAT
2. **ห้ามหัก VAT ออกจากราคาก่อนคำนวณ GP** — GP คำนวณจากราคาที่เสนอโดยตรง
   ✅ `GP% = (price − cost) / price`
   ❌ `GP% = (price/1.07 − cost) / (price/1.07)` ← ห้ามใช้เด็ดขาด
3. **ห้ามขายต่ำกว่า `price_last`** โดยไม่มีการอนุมัติ

---

## 1. ระดับราคา 4 ชั้น

| ฟิลด์ | ชื่อไทย | ใช้กับใคร | ที่มา |
|---|---|---|---|
| `price_private` | ราคาขายเอกชน | คลินิก / โรงพยาบาลเอกชน | ราคาแคตตาล็อก |
| `price_government` | ราคาขายราชการ | หน่วยงานราชการ, e-bidding | `price_private × 1.10` |
| `price_dealer` | ราคา Dealer | ตัวแทนจำหน่ายช่วง | GP ≥ 48% |
| `price_last` | Last price (ราคาต่ำสุด) | เพดานล่างของทุกดีล | GP ≥ 40% |

**ลำดับที่ต้องเป็นจริงเสมอ:**
```
price_government  ≥  price_private  ≥  price_dealer  ≥  price_last
```
ราคาราชการ *สูงกว่า* ราคาเอกชนโดยตั้งใจ (บวก 10% ครอบคลุมต้นทุนเอกสาร ค้ำประกัน และรอบเก็บเงินที่ยาวกว่า) — ไม่ใช่ความผิดพลาด

---

## 2. สูตรคำนวณ

### 2.1 `price_private` — ราคาขายเอกชน

เรียงลำดับความสำคัญ:

1. **ราคาพิเศษแบบลดตรงในแคตตาล็อก** (ไม่มีเงื่อนไขจำนวน) → ใช้ราคานั้น
   ตัวอย่าง: M8+ "จากปกติ 399,000 พิเศษ 349,000" → `price_private = 349,000`
2. **ราคาปกติในแคตตาล็อก** เมื่อไม่มีราคาพิเศษ
3. **ราคาคลินิกเดิมใน Pricelist.xlsx** เมื่อไม่มีในแคตตาล็อก

> ⚠️ **ตัวเลข "เฉลี่ยเพียง" ในแคตตาล็อกไม่ใช่ราคาขาย**
> TrusFIL 850 ซื้อ 1 แถม 1 "เฉลี่ยเพียง 425" → ยังออกบิลที่ **850** ต่อหลอด แล้วแถมของอีก 1 หลอด
> ตัวเลข 425 เก็บไว้ในฟิลด์ `catalog_net_price` เพื่อใช้ตรวจสอบเท่านั้น ห้ามนำไปเป็นราคาตั้ง

### 2.2 `price_government` — ราคาขายราชการ

```
price_government = MAX( round_nearest(price_private × 1.10), price_private )
```

### 2.3 `price_dealer` — ราคา Dealer

ต้องทำสองอย่างพร้อมกัน: **รักษา GP ขั้นต่ำ 48%** และ **ไม่ลดราคาเกินความจำเป็นสำหรับสินค้าที่กำไรดีอยู่แล้ว**

```
dealer_gp_floor = ceil_round( cost / (1 − 0.48) )     ← ราคาที่ทำให้ GP = 48%
dealer_disc_cap = ceil_round( price_private × (1 − 0.30) )  ← ลดได้มากสุด 30%
price_dealer    = MAX( dealer_gp_floor, dealer_disc_cap )
```

การใช้ `MAX` ทำให้:
- สินค้า GP ต่ำ → `dealer_gp_floor` ชนะ ราคาไม่หลุด 48%
- สินค้า GP สูง → `dealer_disc_cap` ชนะ ไม่ต้องลดราคาลงไปถึง 48% ทั้งที่ไม่จำเป็น

**ตัวอย่างสินค้า GP สูง:** Contra Angle Latch — ทุน 665 เอกชน 3,800
`dealer_gp_floor = 1,280` แต่ `dealer_disc_cap = 2,700` → **Dealer = 2,700 (GP 75.4%)**
ถ้าใช้แค่ floor จะได้ 1,280 ซึ่งลดเกินจำเป็นไป 1,420 บาทต่อชิ้น

**ตัวอย่างสินค้า GP กลาง:** Venton M3 — ทุน 42,000 เอกชน 89,000
`dealer_gp_floor = 80,800` ชนะ `dealer_disc_cap = 62,300` → **Dealer = 80,800 (GP 48.0%)**

`dealer_gp_target = 0.50` ใช้เป็นเป้าหมายในการตั้งราคาใหม่ ส่วน 0.48 คือเพดานล่างที่ระบบบังคับ

### 2.4 `price_last` — Last price

```
price_last = ceil_round( cost / (1 − 0.40) )
if price_last > price_dealer:  price_last = price_dealer
```

ราคาต่ำสุดที่ขายได้โดยไม่ต้องขออนุมัติ **GP ต้องไม่ต่ำกว่า 40% เสมอ**

### 2.5 การปัดเศษ

| ช่วงราคา | ปัดที่ |
|---|---|
| < 1,000 | 10 |
| 1,000 – 99,999 | 100 |
| ≥ 100,000 | 1,000 |

- `price_government` ปัด **ใกล้ที่สุด** (nearest)
- `price_dealer`, `price_last` ปัด **ขึ้นเสมอ** (ceil) เพราะเป็นเพดานล่าง — ปัดลงจะทำให้ GP หลุดเกณฑ์

---

## 3. Validation Rules (ต้อง implement ใน ERP)

| Rule ID | เงื่อนไข | ระดับ | ข้อความ |
|---|---|---|---|
| `PR-01` | `quoted_price < price_last` | **BLOCK** | ต้องขออนุมัติก่อน — ต่ำกว่า Last price |
| `PR-02` | `(quoted − cost)/quoted < 0.40` | **BLOCK** | GP ต่ำกว่า 40% |
| `PR-03` | `price_government < price_private` | ERROR | ลำดับราคาผิด |
| `PR-04` | `price_dealer > price_private` | ERROR | ราคา Dealer สูงกว่าราคาเอกชน |
| `PR-05` | `price_last > price_dealer` | ERROR | Last price สูงกว่าราคา Dealer |
| `PR-06` | `cost_thb` ว่าง หรือ = 0 | WARN | คำนวณ Dealer/Last ไม่ได้ — `status = PENDING_COST` |
| `PR-07` | GP ของ `price_private` < 40% | WARN | ราคาตั้งเองยังไม่ถึงเกณฑ์ — `status = REVIEW` |
| `PR-08` | ราคาถูกคำนวณโดยหาร 1.07 ที่ใดก็ตาม | **BLOCK** | ห้ามหัก VAT ออกจากฐาน GP |

**Approval workflow เมื่อ PR-01 หรือ PR-02 ทำงาน:**
`SR/SO` → `status = PENDING_PRICE_APPROVAL` → ผู้อนุมัติ = MD หรือ GM → บันทึก `approved_by`, `approved_at`, `approval_reason`, `approved_price` ลง audit log ทุกครั้ง

---

## 4. โครงสร้างฟิลด์

| ฟิลด์ | ชนิด | หมายเหตุ |
|---|---|---|
| `product_code` | string | รหัส A-Factory เช่น `F-DC001-01` — อาจว่างได้ 51 แถว (ดู §5) |
| `product_name` | string | |
| `product_group` | string \| null | |
| `brand` | string \| null | |
| `unit` | string \| null | ด้าม / กล่อง / แพ็ค / ชุด |
| `vendor` | string \| null | |
| `cost_thb` | number \| null | ต้นทุนต่อหน่วย ก่อน VAT |
| `price_private` | number \| null | |
| `price_government` | number \| null | |
| `price_dealer` | number \| null | null เมื่อ `status = PENDING_COST` |
| `price_last` | number \| null | null เมื่อ `status = PENDING_COST` |
| `gp_private` / `gp_dealer` / `gp_last` | number \| null | เก็บเป็นทศนิยม `0.4808` = 48.08% |
| `price_source` | enum | `CATALOG_SPECIAL` \| `CATALOG_LIST` \| `PRICELIST_LEGACY` |
| `catalog_list_price` | number \| null | ราคาปกติในแคตตาล็อก ใช้ตอนโปรฯ หมดอายุ |
| `catalog_net_price` | number \| null | ราคาสุทธิเมื่อครบเงื่อนไขโปรฯ — **ห้ามใช้เป็นราคาตั้ง** |
| `promo_catalog` | string | ข้อความโปรฯ จากแคตตาล็อก |
| `promo_legacy` | string | ข้อความโปรฯ เดิมใน Pricelist.xlsx เก็บไว้เทียบ |
| `promo_min_qty` / `promo_free_qty` | number \| null | ชั้นโปรฯ แรกที่ parse ได้ |
| `catalog_page` | string | อ้างอิงหน้าแคตตาล็อก |
| `source_sheet` | string | ชีตต้นทางใน Pricelist.xlsx |
| `approval_required_below` | string | คงที่ = `price_last` |
| `status` | enum | `OK` \| `PENDING_COST` \| `REVIEW` \| `NO_PRICE` |
| `notes` | string | |

---

## 5. สถานะข้อมูล ณ วันที่ generate

| Status | จำนวน | ความหมาย |
|---|---|---|
| `OK` | 727 | ครบทั้ง 4 ชั้นราคา ใช้งานได้ |
| `PENDING_COST` | 56 | ไม่มีต้นทุน คำนวณ Dealer/Last ไม่ได้ — **ต้องบล็อกการขายจนกว่าจะเติมต้นทุน** |
| `REVIEW` | 16 | ต้นทุนสูงจนราคาเอกชนทำ GP 48% ไม่ได้ ต้องทบทวนราคาหรือต้นทุน |
| `NO_PRICE` | 8 | ไม่มีราคาตั้ง |

**ข้อจำกัดที่ต้องรู้:**

- **51 แถวไม่มี `product_code`** — ทั้งหมดมาจากชีต `Orthodontic-Wire&Orther` ซึ่งต้นทางมีแต่ชื่อกับราคา ต้องออกรหัสก่อน import
- **5 รหัสซ้ำ** — `H-RC005-01` (TopCEM RMGI vs UltraCore คนละสินค้า), `R-SC001-01` (2 ราคา), `H-AD001-01`, `H-AD002-01`, `H-AD003-01` (ซ้ำข้ามชีต)
- **34 รายการในแคตตาล็อกยังไม่มีในไฟล์นี้** — Getidy autoclave, ES-20, RAY100X, X-View, AlgiDent, TempFIT, PERFIT Monophase ฯลฯ
- **Scaler tips 126 SKU** — แคตตาล็อกลงแค่ "เริ่มต้น 315" จึงคงราคาเดิมไว้ แต่ใส่โปรฯ ตามแคตตาล็อก (5 FREE 1 / 10 FREE 3 / 30 FREE 12) ซึ่ง**ขัดกับของเดิม** (5 Free 2 / 10 Free 6 / 30 Free 20) — ยังไม่ได้ข้อสรุป

---

## 6. โปรโมชั่น

โปรโมชั่นเป็นชั้นที่ทำงาน **หลัง** จากเลือกราคาตั้งแล้ว ห้ามเขียนทับราคาตั้ง
รายละเอียดครบทั้ง 10 กลไก (BUY_X_FREE_Y, TIER_FIXED_PRICE, BUNDLE_KIT, ORDER_SPEND_LADDER, SPEND_GIFT_BY_BRAND ฯลฯ) อยู่ในไฟล์ `AFactory_Promotion_Master_v1.xlsx`

**ต้องกำหนดก่อนเปิดใช้:** stacking rule — โปรฯ ระดับ SKU + ส่วนลดท้ายบิล + ของแถมตามแบรนด์ ซ้อนกันได้แค่ไหน
หน้าปกแคตตาล็อกโฆษณา "ลดสูงสุด 80%" แต่ส่วนลดเดี่ยวสูงสุดที่พบคือ 65% → ถ้าปล่อยให้ stack ได้อิสระ ราคาจะหลุด `price_last` ได้ ต้องบังคับ `PR-01`/`PR-02` หลังคำนวณโปรฯ ทุกชั้นเสร็จแล้ว
