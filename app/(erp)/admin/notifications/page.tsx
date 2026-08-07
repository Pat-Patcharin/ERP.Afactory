"use client";

import { useMemo, useState } from "react";
import { NOTIFICATIONS, ROLES } from "@/data/admin";
import { getRole, notificationsForRole } from "@/lib/domain/admin";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge, Card, Select } from "@/components/ui";
import { WsPageHeader, useGoPage } from "@/components/workspace/parts";

/* ============================================================
   NOTIFICATION SETTINGS — READ ONLY, DELIBERATELY

   This page is a picture of an intended configuration. Nothing
   on it is connected to the code that actually sends, so every
   control has been taken off it.

   The In-App column used to be a live switch. It was live only
   in the sense that it flipped `NOTIFICATIONS[].inApp` — and
   `lib/domain/notify.ts`, the one function that sends anything,
   never reads that flag. Turning a notification "off" here left
   it arriving exactly as before; the audit log then recorded
   that an administrator had switched it off. A control that
   files a false record of its own effect is worse than no
   control, so it is gone rather than disabled in place.

   Two further gaps to close before any of this is switched on:

   - The `roles` column here is a hand-written list, while
     `notify.ts` works recipients out from the permission matrix
     at the moment of sending (its rule 1). The two disagree
     already, and this one is the copy that is wrong.
   - Only the approval events have a sender at all. The rest —
     stock, expiry, QC, credit, invoice, shipment, login — are
     rows describing something no code emits.

   See docs/BACKLOG.md item N-1. Do not re-add a control here
   until switching it off provably stops a notification.
   ============================================================ */

export default function NotificationSettingsPage() {
  const refresh = useUI((s) => s.refresh);
  const revision = useUI((s) => s.revision);
  const go = useGoPage();
  const [roleFilter, setRoleFilter] = useState("All");

  const groups = useMemo(() => [...new Set(NOTIFICATIONS.map((n) => n.group))], []);

  const rows = useMemo(() => {
    void revision;
    if (roleFilter === "All") return NOTIFICATIONS;
    const role = ROLES.find((r) => r.name === roleFilter);
    return role ? notificationsForRole(role.code) : NOTIFICATIONS;
  }, [roleFilter, revision]);

  const plannedInApp = NOTIFICATIONS.filter((n) => n.inApp).length;
  const plannedEmail = NOTIFICATIONS.filter((n) => n.email).length;

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      <WsPageHeader
        title="Notification Settings"
        subtitle="แบบร่างการตั้งค่า — ยังไม่ได้ต่อเข้ากับตัวส่งจริง"
        onRefresh={refresh}
        extraActions={[
          { label: "Role Management", icon: "shield", run: () => go("Role Management") },
          { label: "Company Settings", icon: "company", run: () => go("Company Settings") },
          { label: "Audit Log", icon: "file", run: () => go("Audit Log") },
        ]}
      />

      <Card
        data-testid="notification-not-wired"
        className="flex gap-3 border-warning-border bg-warning-soft px-5 py-4"
      >
        <Icon name="alert" size={18} className="mt-0.5 flex-shrink-0 text-warning-text" />
        <span className="flex min-w-0 flex-col gap-1 text-cap text-ink-2">
          <span className="text-body font-semibold text-warning-text">
            หน้านี้อ่านได้อย่างเดียว — ปรับอะไรตรงนี้ยังไม่มีผลกับการแจ้งเตือนจริง
          </span>
          <span>
            ตัวส่งจริงอยู่ที่ <code>lib/domain/notify.ts</code> ซึ่งยิงจาก workflow
            และหาผู้รับจากตารางสิทธิ์ตอนที่ส่ง — ไม่ได้อ่านค่าในหน้านี้เลยสักช่อง
            สวิตช์ In-App จึงถูกถอดออก ไม่ใช่แค่ปิดไว้
            เพราะของเดิมกดแล้วเขียน Audit Log ว่าปิดสำเร็จ ทั้งที่การแจ้งเตือนยังส่งเหมือนเดิม
          </span>
          <span>
            ตอนนี้มีตัวส่งจริงเฉพาะกลุ่ม Approval เท่านั้น (คำขออนุมัติ / ผลการอนุมัติ)
            แถวที่เหลือเป็นความตั้งใจที่ยังไม่มีโค้ดยิง · คอลัมน์ Recipients
            ก็เป็นรายชื่อที่พิมพ์ไว้ ไม่ตรงกับผู้รับจริงที่คำนวณจากสิทธิ์
          </span>
        </span>
      </Card>

      <div
        data-testid="notification-summary"
        className="grid grid-cols-4 gap-4 max-[1100px]:grid-cols-2 max-md:grid-cols-1"
      >
        {[
          { label: "Notifications", value: NOTIFICATIONS.length, sub: "เหตุการณ์ที่ร่างไว้", tone: "info", icon: "bell" },
          { label: "In-App (ร่าง)", value: plannedInApp, sub: "ยังไม่มีผลกับตัวส่ง", tone: "warning", icon: "bell" },
          { label: "Email (ร่าง)", value: plannedEmail, sub: "ยังไม่มีระบบส่งเมล", tone: "warning", icon: "mail" },
          { label: "Groups", value: groups.length, sub: groups.join(" · "), tone: "info", icon: "layers" },
        ].map((c) => (
          <Card key={c.label} className="flex items-center gap-3 p-5">
            <span
              className={cn(
                "grid h-10 w-10 flex-shrink-0 place-items-center rounded-btn",
                c.tone === "success" && "bg-success-soft text-success-text",
                c.tone === "warning" && "bg-warning-soft text-warning-text",
                c.tone === "info" && "bg-info-soft text-info-text",
              )}
            >
              <Icon name={c.icon as "bell"} size={20} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-cap text-ink-2">{c.label}</span>
              <span className="tnum text-[24px] font-bold leading-none tracking-[-0.02em]">
                {c.value}
              </span>
              <span className="truncate text-[11px] text-ink-3">{c.sub}</span>
            </span>
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-end justify-between gap-3 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-cap font-medium text-ink-2">
            แถวนี้ตั้งใจให้บทบาทไหนได้รับ
          </span>
          <Select
            aria-label="Role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-[240px]"
          >
            <option value="All">ทุกบทบาท</option>
            {ROLES.map((r) => (
              <option key={r.code} value={r.name}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>

        {/* The filter reads; it changes nothing. No action belongs on this page
            while the settings are disconnected — a "Send Test" button that
            toasts "future support" is the same false-comfort as the switch. */}
        <span className="flex items-center gap-2 text-cap text-ink-3">
          <Icon name="info" size={15} />
          ตัวกรองนี้ใช้ดูอย่างเดียว ไม่เปลี่ยนค่าอะไร
        </span>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="notification-table">
            <thead>
              <tr>
                {["Notification", "Group", "Recipients", "Threshold", "In-App", "Email", "Status"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "whitespace-nowrap border-b border-line bg-surface px-4 py-3 text-cap font-semibold tracking-[0.02em] text-ink-2",
                        i >= 4 ? "text-center" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.code} className="transition-colors duration-fast hover:bg-surface">
                  <td className="border-b border-line px-4 py-3">
                    <span className="flex flex-col">
                      <span className="font-medium">{n.label}</span>
                      <span className="text-cap text-ink-3">{n.desc}</span>
                    </span>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <Badge tone="neutral">{n.group}</Badge>
                  </td>
                  <td className="border-b border-line px-4 py-3 text-cap text-ink-2">
                    {n.roles.length
                      ? n.roles.map((c) => getRole(c)?.name ?? c).join(", ")
                      : "ผู้เกี่ยวข้องกับเอกสาร"}
                  </td>
                  <td className="border-b border-line px-4 py-3 text-cap text-ink-2">
                    {n.threshold ? `${n.threshold} ${n.unit}` : "ทันทีที่เกิดเหตุการณ์"}
                  </td>
                  <td className="border-b border-line px-4 py-3 text-center">
                    {/* Static, like Email below. See the note at the top of the
                        file: nothing in the send path reads this flag. */}
                    <span
                      title="ค่าที่ร่างไว้ — ตัวส่งจริงไม่ได้อ่านช่องนี้"
                      className="inline-flex items-center gap-1 text-cap text-ink-3"
                    >
                      <Icon name="bell" size={14} />
                      {n.inApp ? "ตั้งไว้" : "ปิด"}
                    </span>
                  </td>
                  <td className="border-b border-line px-4 py-3 text-center">
                    {/* Deliberately static: no mail transport exists. */}
                    <span
                      title="ต้องตั้งค่าระบบส่งอีเมลก่อน"
                      className="inline-flex items-center gap-1 text-cap text-ink-3"
                    >
                      <Icon name="mail" size={14} />
                      {n.email ? "ตั้งไว้" : "ปิด"}
                    </span>
                  </td>
                  <td className="border-b border-line px-4 py-3 text-center">
                    <Badge tone="neutral">{n.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Icon name="info" size={17} className="text-info" />
        <span className="min-w-0 flex-1 text-cap text-ink-2">
          อยากรู้ว่าตอนนี้ระบบแจ้งเตือนใครจริง ๆ ให้ดูที่กระดิ่งบนแถบบน
          ซึ่งอ่านจากรายการที่ workflow ยิงไว้จริง — ไม่ใช่ตารางนี้
          · ตารางนี้จะกลับมากดได้เมื่อค่าที่ตั้งตรงนี้ถูกอ่านตอนส่งจริง
        </span>
      </Card>
    </main>
  );
}
