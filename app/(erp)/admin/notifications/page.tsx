"use client";

import { useMemo, useState } from "react";
import { NOTIFICATIONS, ROLES } from "@/data/admin";
import { audit, getRole, notificationsForRole } from "@/lib/domain/admin";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Select, Switch } from "@/components/ui";
import { WsPageHeader, useGoPage } from "@/components/workspace/parts";

/* ============================================================
   NOTIFICATION SETTINGS

   Which events notify whom, on which channel.

   In-app toggles are live — they write to the same array the
   rest of the app reads, so switching one off takes effect
   immediately. Email is a placeholder: there is no mail
   transport, and a switch that silently sends nothing is worse
   than one that says so.
   ============================================================ */

export default function NotificationSettingsPage() {
  const toast = useUI((s) => s.toast);
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

  const activeInApp = NOTIFICATIONS.filter((n) => n.inApp).length;
  const activeEmail = NOTIFICATIONS.filter((n) => n.email).length;

  const toggleInApp = (code: string) => {
    const n = NOTIFICATIONS.find((x) => x.code === code);
    if (!n) return;
    n.inApp = !n.inApp;
    audit("Update", "admin-notification", `${n.inApp ? "เปิด" : "ปิด"} In-App: ${n.label}`, n.code);
    refresh();
    toast(
      n.inApp ? "เปิดการแจ้งเตือนแล้ว" : "ปิดการแจ้งเตือนแล้ว",
      `${n.label} — In-App`,
      n.inApp ? "success" : "info",
    );
  };

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      <WsPageHeader
        title="Notification Settings"
        subtitle="เหตุการณ์ไหนแจ้งเตือนใคร ผ่านช่องทางใด"
        onRefresh={refresh}
        extraActions={[
          { label: "Role Management", icon: "shield", run: () => go("Role Management") },
          { label: "Company Settings", icon: "company", run: () => go("Company Settings") },
          { label: "Audit Log", icon: "file", run: () => go("Audit Log") },
        ]}
      />

      <div
        data-testid="notification-summary"
        className="grid grid-cols-4 gap-4 max-[1100px]:grid-cols-2 max-md:grid-cols-1"
      >
        {[
          { label: "Notifications", value: NOTIFICATIONS.length, sub: "เหตุการณ์ทั้งหมด", tone: "info", icon: "bell" },
          { label: "In-App On", value: activeInApp, sub: "แจ้งเตือนในระบบ", tone: "success", icon: "checkCircle" },
          { label: "Email On", value: activeEmail, sub: "ต้องมีระบบส่งเมล", tone: "warning", icon: "mail" },
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
          <span className="text-cap font-medium text-ink-2">แสดงเฉพาะที่บทบาทนี้ได้รับ</span>
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

        <Button
          onClick={() =>
            toast("ทดสอบการแจ้งเตือน", "ส่งการแจ้งเตือนตัวอย่างให้ตนเอง — Future support", "info")
          }
        >
          <Icon name="send" size={16} strokeWidth={2} />
          Send Test
        </Button>
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
                    <Switch
                      checked={n.inApp}
                      onChange={() => toggleInApp(n.code)}
                      label={`In-App ${n.label}`}
                    />
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
                    <Badge tone={n.status === "Active" ? "success" : "neutral"}>{n.status}</Badge>
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
          สวิตช์ In-App ใช้งานได้จริงและมีผลทันที · ช่องอีเมลเป็นการตั้งค่าที่บันทึกไว้เท่านั้น
          เพราะยังไม่มีระบบส่งเมล — สวิตช์ที่กดได้แต่ไม่ส่งอะไรเลย แย่กว่าการบอกตรง ๆ
        </span>
      </Card>
    </main>
  );
}
