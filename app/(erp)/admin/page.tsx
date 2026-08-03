"use client";

import { useMemo } from "react";
import { AUDIT_LOG, MODULES, NOTIFICATIONS, ROLES, USERS } from "@/data/admin";
import {
  adminIssues,
  adminSnapshot,
  currentUser,
  effectiveScope,
  getRole,
  getScope,
  rolePermissionRows,
  workflowGaps,
} from "@/lib/domain/admin";
import { WORKFLOWS } from "@/data/admin";
import { fmt } from "@/lib/format";
import { useUI } from "@/lib/store";
import type { BadgeTone } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import {
  WsAlertGrid,
  WsBrief,
  WsPageHeader,
  WsQuickActions,
  WsRow,
  WsTable,
  WsTableCard,
  WsTd,
  WsTh,
  WsTrendKpiCards,
  useGoPage,
} from "@/components/workspace/parts";

/* ============================================================
   ADMINISTRATION WORKSPACE

   The same command-center shape the Purchase, Outbound and
   Inventory workspaces use — assembled from the shared parts so
   Administration reads as part of the ERP rather than a settings
   screen bolted on.

   What it reports is configuration health, not business volume:
   who can sign what, which module nobody can reach, which
   workflow has no approver left in it.
   ============================================================ */

const EVENT_TONE: Record<string, BadgeTone> = {
  Login: "info",
  Logout: "neutral",
  "Login Failed": "danger",
  Create: "success",
  Update: "info",
  Delete: "danger",
  Approve: "success",
  Reject: "danger",
  Print: "neutral",
  Import: "warning",
  Export: "warning",
  "Permission Change": "primary",
};

const QUICK_ACTIONS = [
  { label: "User Management", desc: "เพิ่มผู้ใช้และกำหนดบทบาท", icon: "users", goto: "User Management", accent: true },
  { label: "Role Management", desc: "สร้างและแก้ไขบทบาท", icon: "shield", goto: "Role Management" },
  { label: "Permission Matrix", desc: "สิทธิ์ทุกโมดูลในตารางเดียว", icon: "grid", goto: "Permission Matrix", accent: true },
  { label: "Data Scope", desc: "ขอบเขตข้อมูลของแต่ละบทบาท", icon: "lock", goto: "Data Scope" },
  { label: "Approval Workflow", desc: "ลำดับการอนุมัติแต่ละโมดูล", icon: "checkCircle", goto: "Approval Workflow" },
  { label: "Number Series", desc: "รูปแบบเลขที่เอกสาร", icon: "tag", goto: "Number Series" },
  { label: "Company Settings", desc: "ข้อมูลบริษัทและภาษี", icon: "company", goto: "Company Settings" },
  { label: "Audit Log", desc: "ทุกการเปลี่ยนแปลงในระบบ", icon: "file", goto: "Audit Log" },
];

export default function AdministrationWorkspacePage() {
  const revision = useUI((s) => s.revision);
  const refresh = useUI((s) => s.refresh);
  const go = useGoPage();

  const snap = useMemo(() => adminSnapshot(), [revision]);
  const issues = useMemo(() => adminIssues(), [revision]);
  const me = currentUser();
  const myRole = getRole(me.roleCode);

  const kpis = useMemo(
    () => [
      { key: "users", icon: "users", value: String(snap.users), unit: "คน", title: "Users", desc: `ใช้งานอยู่ ${snap.activeUsers} คน`, delta: 0, points: [], goto: "User Management", tone: "info" },
      { key: "active", icon: "checkCircle", value: String(snap.activeUsers), unit: "คน", title: "Active Users", desc: `ระงับ ${snap.suspendedUsers} คน`, delta: 0, points: [], goto: "User Management", tone: "success" },
      { key: "roles", icon: "shield", value: String(snap.roles), unit: "บทบาท", title: "Roles", desc: `กำหนดเอง ${snap.customRoles} บทบาท`, delta: 0, points: [], goto: "Role Management", tone: "info" },
      { key: "grants", icon: "grid", value: fmt(snap.permissionGrants), unit: "สิทธิ์", title: "Permissions", desc: `ครอบคลุม ${snap.modules} โมดูล`, delta: 0, points: [], goto: "Permission Matrix", tone: "primary" },
      { key: "workflow", icon: "workspace", value: String(snap.approvalSteps), unit: "ขั้น", title: "Pending Approval Setup", desc: `${snap.activeWorkflows} workflow เปิดใช้งาน`, delta: 0, points: [], goto: "Approval Workflow", tone: "warning" },
      { key: "failed", icon: "alert", value: String(snap.failedLogins), unit: "ครั้ง", title: "Failed Login", desc: "เข้าสู่ระบบไม่สำเร็จ", delta: 0, points: [], goto: "Audit Log", tone: "danger" },
      { key: "series", icon: "tag", value: String(snap.series), unit: "ชุด", title: "Number Series", desc: "รูปแบบเลขที่เอกสาร", delta: 0, points: [], goto: "Number Series", tone: "info" },
      { key: "audit", icon: "file", value: fmt(snap.auditEntries), unit: "รายการ", title: "Audit Entries", desc: "บันทึกการใช้งานทั้งหมด", delta: 0, points: [], goto: "Audit Log", tone: "success" },
    ],
    [snap],
  );

  const alerts = useMemo(
    () =>
      issues.map((i) => ({
        key: i.key,
        icon: i.tone === "danger" ? "alert" : i.tone === "warning" ? "clock" : "info",
        count: 1,
        unit: "เรื่อง",
        title: i.title,
        priority: i.tone === "danger" ? "Critical" : i.tone === "warning" ? "High" : "Medium",
        warehouse: i.detail,
        action: "ตรวจสอบ",
        goto: i.goto,
        tone: i.tone,
      })),
    [issues],
  );

  const recent = AUDIT_LOG.slice(0, 10);

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      <WsPageHeader
        title="Administration Workspace"
        subtitle="ศูนย์ตั้งค่าระบบ — ผู้ใช้ บทบาท สิทธิ์ ขอบเขตข้อมูล และการอนุมัติ"
        onRefresh={refresh}
        extraActions={[
          { label: "Permission Matrix", icon: "grid", run: () => go("Permission Matrix") },
          { label: "Company Settings", icon: "company", run: () => go("Company Settings") },
          { label: "Notification Settings", icon: "bell", run: () => go("Notification Settings") },
          { label: "Audit Log", icon: "file", run: () => go("Audit Log") },
        ]}
      />

      <WsBrief
        greeting={`Signed in as ${me.name}`}
        lastUpdated={me.lastLogin.split(" ")[1] ?? "—"}
        icon="settings"
        lines={[
          <>
            บทบาท <strong className="font-semibold text-ink">{myRole?.name ?? me.roleCode}</strong>
          </>,
          <>
            ขอบเขตข้อมูล{" "}
            <strong className="font-semibold text-ink">
              {getScope(effectiveScope(me))?.label ?? "—"}
            </strong>
          </>,
          <>
            เข้าถึงได้{" "}
            <strong className="font-semibold text-ink">
              {rolePermissionRows(me.roleCode).filter((r) => r.actions.length).length} โมดูล
            </strong>
          </>,
          <>
            ต้องตรวจสอบ <strong className="font-semibold text-ink">{issues.length} เรื่อง</strong>
          </>,
        ]}
      />

      <WsTrendKpiCards kpis={kpis} cols={4} deltaLabel="การตั้งค่าปัจจุบัน" testId="admin-kpi-grid" />

      <div className="grid grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-start gap-5 max-[1280px]:grid-cols-1">
        <WsQuickActions actions={QUICK_ACTIONS} cols={2} title="Administration" />

        <div className="flex min-w-0 flex-col gap-5">
          {alerts.length > 0 && (
            <section data-testid="admin-issues" className="flex flex-col gap-3">
              <h2 className="text-h3 font-semibold tracking-[-0.01em]">Configuration Alerts</h2>
              <WsAlertGrid alerts={alerts} />
            </section>
          )}

          <WsTableCard title="Recent Activities" viewAll="Audit Log">
            <WsTable
              head={
                <>
                  <WsTh>When</WsTh>
                  <WsTh>Event</WsTh>
                  <WsTh>User</WsTh>
                  <WsTh className="max-md:hidden">Module</WsTh>
                  <WsTh className="max-md:hidden">Detail</WsTh>
                </>
              }
            >
              {recent.map((l) => (
                <WsRow key={l.code} goto="Audit Log">
                  <WsTd className="tnum" muted>
                    {l.when}
                  </WsTd>
                  <WsTd>
                    <Badge tone={EVENT_TONE[l.event] ?? "neutral"}>{l.event}</Badge>
                  </WsTd>
                  <WsTd>
                    <span className="flex flex-col">
                      <span>{l.user}</span>
                      <span className="text-cap text-ink-3">{l.role}</span>
                    </span>
                  </WsTd>
                  <WsTd muted className="max-md:hidden">
                    {MODULES.find((m) => m.key === l.module)?.label ?? l.module}
                  </WsTd>
                  <WsTd muted className="max-md:hidden">
                    {l.detail}
                  </WsTd>
                </WsRow>
              ))}
            </WsTable>
          </WsTableCard>
        </div>
      </div>

      {/* ---------- Configuration coverage ---------- */}
      <div
        data-testid="admin-summary-band"
        className="grid grid-cols-3 items-start gap-5 max-[1280px]:grid-cols-1"
      >
        <WsTableCard title="Roles" viewAll="Role Management">
          <WsTable
            head={
              <>
                <WsTh>Role</WsTh>
                <WsTh align="right">Users</WsTh>
                <WsTh align="right">Modules</WsTh>
                <WsTh>Scope</WsTh>
              </>
            }
          >
            {ROLES.map((r) => (
              <WsRow key={r.code} goto="Role Management">
                <WsTd>
                  <span className="flex flex-col">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-cap text-ink-3">{r.department}</span>
                  </span>
                </WsTd>
                <WsTd align="right">{USERS.filter((u) => u.roleCode === r.code).length}</WsTd>
                <WsTd align="right">
                  {rolePermissionRows(r.code).filter((x) => x.actions.length).length}
                </WsTd>
                <WsTd muted>{getScope(r.scope)?.label ?? r.scope}</WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>

        <WsTableCard title="Approval Workflows" viewAll="Approval Workflow">
          <WsTable
            head={
              <>
                <WsTh>Workflow</WsTh>
                <WsTh align="right">Steps</WsTh>
                <WsTh>Status</WsTh>
              </>
            }
          >
            {WORKFLOWS.map((w) => {
              const gaps = workflowGaps(w);
              return (
                <WsRow key={w.code} goto="Approval Workflow">
                  <WsTd>
                    <span className="flex flex-col">
                      <span className="font-medium">{w.name}</span>
                      <span className="text-cap text-ink-3">
                        {MODULES.find((m) => m.key === w.module)?.label ?? w.module}
                      </span>
                    </span>
                  </WsTd>
                  <WsTd align="right">{w.steps.length}</WsTd>
                  <WsTd>
                    {gaps.length ? (
                      <Badge tone="danger">ขาดผู้อนุมัติ</Badge>
                    ) : (
                      <Badge tone={w.status === "Active" ? "success" : "warning"}>{w.status}</Badge>
                    )}
                  </WsTd>
                </WsRow>
              );
            })}
          </WsTable>
        </WsTableCard>

        <WsTableCard title="Notifications" viewAll="Notification Settings">
          <WsTable
            head={
              <>
                <WsTh>Notification</WsTh>
                <WsTh className="max-md:hidden">Group</WsTh>
                <WsTh align="center">In-App</WsTh>
                <WsTh align="center">Email</WsTh>
              </>
            }
          >
            {NOTIFICATIONS.map((n) => (
              <WsRow key={n.code} goto="Notification Settings">
                <WsTd>{n.label}</WsTd>
                <WsTd muted className="max-md:hidden">
                  {n.group}
                </WsTd>
                <WsTd align="center">
                  <Badge tone={n.inApp ? "success" : "neutral"}>{n.inApp ? "On" : "Off"}</Badge>
                </WsTd>
                <WsTd align="center">
                  <Badge tone={n.email ? "success" : "neutral"}>{n.email ? "On" : "Off"}</Badge>
                </WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>
      </div>

      <Card className="px-5 py-3 text-cap text-ink-2">
        สิทธิ์ทั้งหมดมาจากการตั้งค่าใน Administration ไม่มีโมดูลใดฝังชื่อบทบาทไว้ในโค้ด —
        การเพิ่มบทบาทใหม่จึงเป็นการแก้ข้อมูล ไม่ใช่การแก้โปรแกรม
      </Card>
    </main>
  );
}
