# A-Factory ERP

ระบบ ERP สำหรับโรงงาน — Next.js 14 (App Router) + TypeScript + Tailwind CSS

ครอบคลุมงาน Master Data, จัดซื้อ (Purchase-to-Stock) และ Workspace สำหรับงานประจำวัน

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด http://localhost:3000 (จะเด้งไปที่ Dashboard — ERP Command Center)

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | รัน dev server |
| `npm run build` | build production |
| `npm start` | รัน production build |
| `npm run typecheck` | ตรวจ TypeScript ทั้งโปรเจกต์ |

## สถาปัตยกรรม

ระบบขับเคลื่อนด้วย **schema** ทั้งหมด — schema บอกว่า *จะแสดงอะไร* ส่วน engine เป็นคนตัดสินว่า *แสดงอย่างไร*

การเพิ่มโมดูลใหม่ = เขียน schema 1 ไฟล์ + ลงทะเบียน 1 บรรทัดใน `schemas/registry.ts`
ไม่ต้องเขียน markup ใหม่ ไม่ต้องเขียน CSS ใหม่ ไม่ต้องแตะ engine

```
app/
  (erp)/              app shell (sidebar + topbar + overlay hosts)
    dashboard/        Dashboard — ERP Command Center
    m/[entity]/       list · detail · new · edit — 4 ไฟล์ครอบทุกโมดูล
    purchase/         Purchase Workspace
    outbound/         Outbound Workspace
    inventory/        Inventory Workspace
    pricing/          Product Pricing Workspace

components/
  ui/                 primitives (Badge, Button, Table, Chart, Drawer, Modal, Toast, ...)
  engine/             ListView · BlockRenderer · DetailDrawer · FullDetail
  workspace/          ชิ้นส่วนที่ workspace ใช้ร่วมกัน
  dashboard/          ชิ้นส่วนเฉพาะของ Dashboard (task list · alert list · overview · doc tabs)

schemas/              1 ไฟล์ต่อ entity → { list, detail }
lib/
  types.ts            สัญญาของ schema ทั้งหมด
  domain/             derived fields + business logic แยกตามโมดูล
  workflows.ts        การเปลี่ยนสถานะเอกสาร (PR → PO → GR → QC → Put Away)
  badges.ts           แผนที่ สถานะ → สี
data/                 ชุดข้อมูลตัวอย่าง (mock) พร้อม type
```

### Design system

Design token อยู่ที่ `app/globals.css` เป็น CSS custom properties แล้ว map เข้า Tailwind
ผ่าน `tailwind.config.ts` — component จึงใช้ `bg-card`, `text-ink-2`, `rounded-card`
แทนการฮาร์ดโค้ดค่าสี ทำให้อยู่ใน design system โดยอัตโนมัติ

## โมดูล

**Master Data** — Product · Category · Business Partner · Warehouse · Sales Representative · Price List

**Purchase-to-Stock** — Purchase Request · Purchase Order · Goods Receipt · QC Inspection · Put Away

**Workspaces** — Purchase · Outbound · Product Pricing

### กฎทางธุรกิจที่ระบบบังคับใช้

- สินค้าที่ต้องผ่าน QC จะถูกรับเข้า **QC Hold** และยังไม่นับเป็นสต๊อกพร้อมขายจนกว่า QC จะผ่าน
- Business Partner ที่มีธุรกรรมอ้างอิงอยู่ **ลบไม่ได้** (ใช้ Deactivate แทน)
- หมวดหมู่ที่มีสินค้าใช้งานอยู่ หรือมีหมวดย่อย **ลบไม่ได้**
- คลังที่ยังมีสินค้าคงเหลือ **ลบไม่ได้**
- ราคาถูกเลือกตามลำดับ: Contract → Promotion → Customer → Customer Group → Price List → Standard

## สถานะการพัฒนา

| ส่วน | สถานะ |
| --- | --- |
| List · Quick View · Full Detail ทุกโมดูล | ✅ ใช้งานได้ |
| Workflow เปลี่ยนสถานะเอกสาร | ✅ ใช้งานได้ |
| Workspace ทั้ง 3 หน้า | ✅ ใช้งานได้ |
| ฟอร์ม Create / Edit (MasterForm engine) | 🚧 อยู่ระหว่างพัฒนา |
| เชื่อมต่อ API จริง | 🚧 ยังไม่เริ่ม — ปัจจุบันอ่าน/เขียนกับ `data/` ในหน่วยความจำ |

## Environment variables

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าจริง — `.env.local` ถูก gitignore ไว้แล้ว
