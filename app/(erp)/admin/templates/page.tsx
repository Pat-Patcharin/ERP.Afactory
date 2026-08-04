"use client";

import { useMemo, useState } from "react";
import { COMPANY, COMPANY_BANKS } from "@/data/admin";
import {
  COPY_TYPES,
  PRINT_CONFIGS,
  PRINT_DOC_TYPES,
  SIGNATURE_LABELS,
  COLUMN_LABELS,
} from "@/lib/print";
import type { PrintDocType } from "@/lib/print/types";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Select } from "@/components/ui";
import { WsPageHeader, useGoPage } from "@/components/workspace/parts";

/* ============================================================
   DOCUMENT TEMPLATES

   The print configuration, made visible. Every value on this
   screen is read live from lib/print/config.ts — the same object
   the engine paginates and renders with — so what is shown here
   is what will come out of the printer.

   Read-only in this build. A template drives tax documents, and
   an edit form for it needs versioning and an approval trail
   before it can be trusted; a visual template designer is
   explicitly out of Phase 1.
   ============================================================ */

const TEMPLATE_VERSION = "1.0";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-2 last:border-b-0">
      <span className="w-[190px] flex-shrink-0 text-cap text-ink-2">{label}</span>
      <span className="min-w-0 flex-1 text-[13px]">{value}</span>
    </div>
  );
}

const YesNo = ({ on }: { on: boolean }) => (
  <Badge tone={on ? "success" : "neutral"}>{on ? "Enabled" : "Disabled"}</Badge>
);

export default function DocumentTemplatesPage() {
  const toast = useUI((s) => s.toast);
  const go = useGoPage();
  const [selected, setSelected] = useState<PrintDocType>("delivery-order");

  const config = PRINT_CONFIGS[selected];
  const bank = useMemo(
    () => COMPANY_BANKS.find((b) => b.isDefault) ?? COMPANY_BANKS[0],
    [],
  );

  const soon = () =>
    toast(
      "แก้ไขเทมเพลต",
      "เทมเพลตควบคุมเอกสารภาษี การแก้ไขต้องมีเวอร์ชันและการอนุมัติ — Future support",
      "info",
    );

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      <WsPageHeader
        title="Document Templates"
        subtitle="รูปแบบเอกสารสำหรับพิมพ์ — คอลัมน์ จำนวนบรรทัดต่อหน้า ช่องลงนาม และประเภทสำเนา"
        extraActions={[
          { label: "Company Settings", icon: "company", run: () => go("Company Settings") },
          { label: "Number Series", icon: "tag", run: () => go("Number Series") },
          { label: "Audit Log", icon: "file", run: () => go("Audit Log") },
        ]}
      />

      <Card className="flex flex-wrap items-end justify-between gap-3 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-cap font-medium text-ink-2">Document Type</span>
          <Select
            aria-label="Document Type"
            value={selected}
            onChange={(e) => setSelected(e.target.value as PrintDocType)}
            className="w-[300px] max-md:w-full"
          >
            {PRINT_DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRINT_CONFIGS[t].titleEN} — {PRINT_CONFIGS[t].titleTH}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">Template v{TEMPLATE_VERSION}</Badge>
          <Badge tone="success">Active</Badge>
          <Button onClick={soon}>
            <Icon name="edit" size={16} strokeWidth={2} />
            Edit Template
          </Button>
        </div>
      </Card>

      <div
        data-testid="template-detail"
        className="grid grid-cols-2 items-start gap-5 max-[1100px]:grid-cols-1"
      >
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Template</h2>
          </div>
          <div className="px-5 py-1">
            <Row label="Template Name" value={`${config.titleEN} — Standard A4`} />
            <Row label="Document Type" value={config.documentType} />
            <Row label="Source Module" value={config.entity} />
            <Row label="Template Version" value={TEMPLATE_VERSION} />
            <Row label="Title (EN)" value={config.titleEN} />
            <Row label="Title (TH)" value={config.titleTH} />
            <Row
              label="Company Logo"
              value={
                COMPANY.logoUrl ? (
                  COMPANY.logoUrl
                ) : (
                  <span className="text-ink-2">
                    ยังไม่ได้ตั้งไฟล์โลโก้ — ใช้ตราสัญลักษณ์เวกเตอร์ในระบบ (ตั้งได้ที่ Company Settings)
                  </span>
                )
              }
            />
            <Row label="Letterhead Footer" value={`${COMPANY.tagline} · ${COMPANY.website}`} />
            <Row label="Paper" value="A4 Portrait · 210 × 297 mm · margin 8 mm" />
            <Row label="Status" value={<Badge tone="success">Active</Badge>} />
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Page Capacity</h2>
          </div>
          <div className="px-5 py-1">
            <Row label="First Page Rows" value={`${config.firstPageRows} row units`} />
            <Row label="Continuation Page Rows" value={`${config.continuationPageRows} row units`} />
            <Row label="Last Page Rows" value={`${config.lastPageRows} row units`} />
            <Row
              label="Row Unit"
              value={
                <span className="text-ink-2">
                  1 บรรทัดต่อรายการ + 1 บรรทัดต่อคำอธิบายเพิ่มเติม — รายการหนึ่งไม่ถูกตัดข้ามหน้า
                </span>
              }
            />
            <Row label="QR Code" value={<YesNo on={config.showQRCode} />} />
            <Row label="Barcode" value={<YesNo on={config.showBarcode} />} />
            <Row label="Signatures on First Page" value={<YesNo on={Boolean(config.signaturesOnFirstPage)} />} />
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Visibility</h2>
          </div>
          <div className="px-5 py-1">
            <Row label="Price" value={<YesNo on={config.showPrice} />} />
            <Row label="Discount" value={<YesNo on={config.showDiscount} />} />
            <Row label="Tax / VAT" value={<YesNo on={config.showTax} />} />
            <Row label="Totals" value={<YesNo on={config.showTotals} />} />
            <Row label="Amount in Words" value={<YesNo on={config.showAmountInWords} />} />
            <Row label="Payment Information" value={<YesNo on={config.showPayment} />} />
            <Row label="Customer Tax ID" value={<YesNo on={config.showCustomerTaxId} />} />
            <Row label="Ship To Panel" value={<YesNo on={config.showShipTo} />} />
            <Row label="Lot / Serial" value={<YesNo on={config.showLot || config.showSerial} />} />
            <Row label="Warehouse / Location" value={<YesNo on={config.showWarehouse || config.showLocation} />} />
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Item Columns</h2>
          </div>
          <div className="flex flex-wrap gap-2 p-5">
            {config.itemColumns.map((c) => (
              <span
                key={c}
                className="rounded-pill border border-line bg-surface px-2.5 py-1 text-cap"
              >
                {COLUMN_LABELS[c]?.en ?? c}
              </span>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Signature Roles</h2>
          </div>
          <div className="flex flex-wrap gap-2 p-5">
            {config.signatureRoles.map((r) => (
              <span
                key={r}
                className="rounded-pill border border-line bg-surface px-2.5 py-1 text-cap"
              >
                {SIGNATURE_LABELS[r]?.en ?? r}
                <span className="ml-1 text-ink-3">{SIGNATURE_LABELS[r]?.th ?? ""}</span>
              </span>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Copy Types</h2>
          </div>
          <div className="flex flex-wrap gap-2 p-5">
            {config.supportedCopyTypes.map((c) => {
              const def = COPY_TYPES[c];
              return (
                <span
                  key={c}
                  className={cn(
                    "rounded-pill border px-2.5 py-1 text-cap",
                    def.hidePrice
                      ? "border-warning/40 bg-warning-soft text-warning-text"
                      : "border-line bg-surface",
                  )}
                  title={def.hidePrice ? "ไม่แสดงราคา" : undefined}
                >
                  {def.labelEN}
                  <span className="ml-1 text-ink-3">{def.audience}</span>
                </span>
              );
            })}
          </div>
        </Card>

        <Card className="overflow-hidden p-0 max-[1100px]:col-span-1">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Default Remarks</h2>
          </div>
          <div className="px-5 py-4">
            {config.remarks.length ? (
              <ol className="list-decimal pl-5 text-[13px] text-ink-2">
                {config.remarks.map((r, i) => (
                  <li key={i} className="mb-1">
                    {r}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-ink-3">เอกสารนี้ไม่มีหมายเหตุตั้งต้น</p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-h3 font-semibold tracking-[-0.01em]">Default Bank Account</h2>
          </div>
          <div className="px-5 py-1">
            {bank ? (
              <>
                <Row label="Bank" value={`${bank.bank} ${bank.branch}`} />
                <Row label="Account No." value={<span className="tnum">{bank.accountNo}</span>} />
                <Row label="Account Name" value={bank.accountName} />
                <Row label="Currency" value={bank.currency} />
                <Row
                  label="Source"
                  value={
                    <span className="text-ink-2">
                      Company Settings — ไม่ได้ฝังไว้ในเทมเพลต
                    </span>
                  }
                />
              </>
            ) : (
              <p className="py-4 text-ink-3">ยังไม่ได้ตั้งบัญชีธนาคารหลัก</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Icon name="info" size={17} className="text-info" />
        <span className="min-w-0 flex-1 text-cap text-ink-2">
          หน้านี้แสดงผลอย่างเดียว — ค่าทั้งหมดอ่านสดจากการตั้งค่าเดียวกับที่เครื่องพิมพ์ใช้จริง
          การแก้ไขเทมเพลตของเอกสารภาษีต้องมีเวอร์ชันและการอนุมัติก่อนเปิดใช้
        </span>
      </Card>
    </main>
  );
}
