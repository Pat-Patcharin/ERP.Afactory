"use client";

import { ADMIN_PLACEHOLDERS, COMPANY, NUMBER_SERIES } from "@/data/admin";
import { adminSnapshot, audit, previewNumber } from "@/lib/domain/admin";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import { Badge, Button, Card } from "@/components/ui";
import { WsPageHeader, useGoPage } from "@/components/workspace/parts";

/* ============================================================
   COMPANY SETTINGS

   Company identity, fiscal and localisation defaults, and the
   system-level settings that have no module of their own yet.

   Read-only in this build. Every value here is stamped onto
   printed documents and tax filings, so an edit form needs
   validation and an approval trail rather than a text box —
   the fields are shown, the write path is named as pending.
   ============================================================ */

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0">
      <span className="text-cap text-ink-2">{label}</span>
      <span className="text-body font-medium">{value}</span>
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </div>
  );
}

function Section({
  title,
  desc,
  children,
  testId,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card className="flex flex-col overflow-hidden p-0" data-testid={testId}>
      <div className="flex flex-col border-b border-line px-5 py-4">
        <h2 className="text-h3 font-semibold tracking-[-0.01em]">{title}</h2>
        {desc && <span className="mt-0.5 text-cap text-ink-2">{desc}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-6 px-5 py-1 max-md:grid-cols-1">{children}</div>
    </Card>
  );
}

export default function CompanySettingsPage() {
  const toast = useUI((s) => s.toast);
  const go = useGoPage();
  const snap = adminSnapshot();
  const p = ADMIN_PLACEHOLDERS;

  const soon = (what: string) =>
    toast(what, "แก้ไขการตั้งค่าระดับบริษัทต้องมีการยืนยันและบันทึก Audit — Future support", "info");

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      <WsPageHeader
        title="Company Settings"
        subtitle="ข้อมูลบริษัท ปีบัญชี ภาษี และค่าตั้งต้นของทั้งระบบ"
        extraActions={[
          { label: "Number Series", icon: "tag", run: () => go("Number Series") },
          { label: "Notification Settings", icon: "bell", run: () => go("Notification Settings") },
          { label: "Audit Log", icon: "file", run: () => go("Audit Log") },
        ]}
      />

      <Card className="flex flex-wrap items-center gap-4 border-primary-border bg-gradient-to-r from-primary-soft to-card px-5 py-4">
        <span className="grid h-[46px] w-[46px] flex-shrink-0 place-items-center rounded-btn border border-primary-border bg-card text-2xl">
          {COMPANY.logo}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-h3 font-semibold tracking-[-0.01em]">{COMPANY.nameTh}</span>
          <span className="text-cap text-ink-2">
            {COMPANY.nameEn} · เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · {COMPANY.branch}
          </span>
        </span>
        <Button onClick={() => soon("แก้ไขข้อมูลบริษัท")}>
          <Icon name="edit" size={16} strokeWidth={2} />
          Edit
        </Button>
      </Card>

      <div className="grid grid-cols-2 items-start gap-5 max-[1100px]:grid-cols-1">
        <Section title="Company Profile" desc="ข้อมูลที่ปรากฏบนเอกสารทุกฉบับ" testId="company-profile">
          <Row label="ชื่อบริษัท (ไทย)" value={COMPANY.nameTh} />
          <Row label="Company Name (EN)" value={COMPANY.nameEn} />
          <Row label="เลขประจำตัวผู้เสียภาษี" value={<span className="tnum">{COMPANY.taxId}</span>} />
          <Row label="สาขา" value={`${COMPANY.branch} (${COMPANY.branchNo})`} />
          <Row label="โทรศัพท์" value={<span className="tnum">{COMPANY.phone}</span>} />
          <Row label="อีเมล" value={COMPANY.email} />
          <Row label="เว็บไซต์" value={COMPANY.website} />
          <Row label="ที่อยู่" value={COMPANY.address} />
        </Section>

        <Section title="Fiscal & Tax" desc="ปีบัญชี สกุลเงิน และอัตราภาษี" testId="company-fiscal">
          <Row label="เริ่มปีบัญชี" value={COMPANY.fiscalYearStart} />
          <Row label="สกุลเงินหลัก" value={COMPANY.baseCurrency} />
          <Row label="อัตราภาษีมูลค่าเพิ่ม" value={`${COMPANY.vatRate}%`} />
          <Row label="อัตราหัก ณ ที่จ่าย" value={`${COMPANY.whtRate}%`} hint="ค่าตั้งต้น ปรับได้รายคู่ค้า" />
          <Row label="ทศนิยม" value={`${COMPANY.decimals} ตำแหน่ง`} />
          <Row label="เขตเวลา" value={COMPANY.timezone} />
          <Row label="รูปแบบวันที่" value={COMPANY.dateFormat} />
          <Row label="ปีที่ใช้แสดงผล" value={COMPANY.yearEra} />
        </Section>

        <Section title="System" desc="ค่าความปลอดภัยและการสำรองข้อมูล" testId="company-system">
          <Row label="นโยบายรหัสผ่าน" value={p.passwordPolicy} />
          <Row label="หมดเวลาเซสชัน" value={`${p.sessionTimeoutMinutes} นาที`} />
          <Row
            label="ยืนยันตัวตนสองชั้น"
            value={
              <Badge tone={p.twoFactor ? "success" : "neutral"}>
                {p.twoFactor ? "เปิดใช้งาน" : "ยังไม่เปิดใช้งาน"}
              </Badge>
            }
            hint="Future support"
          />
          <Row label="ภาษา" value={COMPANY.language} />
          <Row label="สำรองข้อมูลล่าสุด" value={`${p.backups.last} · ${p.backups.size}`} hint={`เก็บย้อนหลัง ${p.backups.retention}`} />
          <Row
            label="API Keys"
            value={<Badge tone="neutral">{p.apiKeys} คีย์</Badge>}
            hint="ระบบเชื่อมต่อภายนอก — Future support"
          />
        </Section>

        <Section title="System Summary" desc="สรุปการตั้งค่าปัจจุบัน" testId="company-summary">
          <Row label="ผู้ใช้ทั้งหมด" value={`${snap.users} คน (ใช้งาน ${snap.activeUsers})`} />
          <Row label="บทบาท" value={`${snap.roles} บทบาท (กำหนดเอง ${snap.customRoles})`} />
          <Row label="โมดูลที่กำหนดสิทธิ์ได้" value={`${snap.modules} โมดูล`} />
          <Row label="สิทธิ์ที่ให้ไว้ทั้งหมด" value={`${snap.permissionGrants} สิทธิ์`} />
          <Row label="Workflow อนุมัติ" value={`${snap.activeWorkflows} เปิดใช้งาน จาก ${snap.workflows}`} />
          <Row label="ชุดเลขที่เอกสาร" value={`${snap.series} ชุด`} />
        </Section>
      </div>

      {/* Document numbering is a company-level setting, so a summary belongs here. */}
      <Card className="overflow-hidden p-0" data-testid="company-series">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-h3 font-semibold tracking-[-0.01em]">Document Numbering</h2>
          <Button onClick={() => go("Number Series")}>
            <Icon name="arrowRight" size={16} strokeWidth={2} />
            Manage Number Series
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-px bg-line max-[1100px]:grid-cols-2 max-md:grid-cols-1">
          {NUMBER_SERIES.map((s) => (
            <div key={s.code} className="flex flex-col gap-0.5 bg-card px-5 py-3">
              <span className="text-cap text-ink-2">{s.label}</span>
              <span className="tnum text-body font-semibold text-primary-active">
                {previewNumber(s)}
              </span>
              <span className="text-[11px] text-ink-3">
                {s.yearMode === "None" ? "ไม่ใส่ปี" : `ปี ${s.yearMode}`} ·{" "}
                {s.useMonth ? "มีเดือน" : "ไม่มีเดือน"} · {s.padding} หลัก
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Icon name="info" size={17} className="text-info" />
        <span className="min-w-0 flex-1 text-cap text-ink-2">
          หน้านี้แสดงผลอย่างเดียวในเวอร์ชันนี้ — ค่าทั้งหมดถูกพิมพ์ลงบนเอกสารภาษี
          การแก้ไขจึงต้องผ่านการยืนยันและบันทึก Audit ก่อนเปิดใช้งานจริง
        </span>
        <Button
          onClick={() => {
            audit("Export", "admin-company", "ส่งออกการตั้งค่าบริษัท");
            soon("ส่งออกการตั้งค่า");
          }}
        >
          <Icon name="upload" size={16} strokeWidth={2} />
          Export Settings
        </Button>
      </Card>
    </main>
  );
}
