import {
  ACTIONS,
  AUDIT_EVENTS,
  AUDIT_LOG,
  DEPARTMENTS,
  MODULES,
  MODULE_GROUPS,
  NUMBER_SERIES,
  RESET_CYCLES,
  ROLES,
  SCOPES,
  USERS,
  USER_STATUS,
  WORKFLOWS,
  YEAR_MODES,
  type AuditEntry,
  type RoleDef,
  type ScopeDef,
  type SeriesDef,
  type UserDef,
  type WorkflowDef,
} from "@/data/admin";
import {
  accessLabel,
  audit,
  effectiveScope,
  getRole,
  getScope,
  previewNumber,
  previewRun,
  rolePermissionRows,
  usersInRole,
  workflowGaps,
} from "@/lib/domain/admin";
import { DASH, fmt, money0 } from "@/lib/format";
import { Icon } from "@/lib/icons";
import type { BadgeTone, DetailSchema, EntitySchemas, ListSchema } from "@/lib/types";
import { Badge, CellSub } from "@/components/ui";

/* ============================================================
   ADMINISTRATION SCHEMAS

   Six entities driven by the same list/detail engine every other
   master uses. Administration gets no bespoke table, no bespoke
   drawer — if the engine is good enough for Purchase Orders it
   is good enough for Users, and one engine means one place to
   fix a bug.

   The four screens that genuinely are not lists (Workspace,
   Permission Matrix, Company Settings, Notifications) live under
   app/(erp)/admin/ instead.
   ============================================================ */

const STATUS_TONE: Record<string, BadgeTone> = {
  Active: "success",
  Suspended: "warning",
  Inactive: "neutral",
  Draft: "warning",
};

const ACCESS_TONE: Record<string, BadgeTone> = {
  "Full Access": "success",
  Partial: "info",
  "Read Only": "neutral",
  "No Access": "danger",
};

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

const tone = (map: Record<string, BadgeTone>, k: string): BadgeTone => map[k] ?? "neutral";

/* ============================================================
   1. USER MANAGEMENT
   ============================================================ */

export interface UserRow extends UserDef {
  name_: string;
  roleName: string;
  scopeLabel: string;
  moduleCount: number;
}

export const USER_ROWS = USERS as UserRow[];

export function decorateUsers() {
  for (const u of USER_ROWS) {
    const role = getRole(u.roleCode);
    u.name_ = u.name;
    u.roleName = role?.name ?? u.roleCode;
    u.scopeLabel = getScope(effectiveScope(u))?.label ?? effectiveScope(u);
    u.moduleCount = rolePermissionRows(u.roleCode).filter((r) => r.actions.length).length;
  }
}

decorateUsers();

const USER_LIST: ListSchema<UserRow> = {
  key: "admin-user",
  entity: "User",
  entityPlural: "Users",
  title: "User Management",
  subtitle: "ผู้ใช้งานระบบ บทบาท และขอบเขตข้อมูลที่แต่ละคนมองเห็น",
  crumb: "User Management",
  crumbParent: "Administration",
  primaryLabel: "Create User",
  searchPlaceholder: "ค้นหารหัสพนักงาน ชื่อผู้ใช้ ชื่อ อีเมล หรือแผนก...",
  emptyTitle: "ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข",

  source: () => USER_ROWS,
  searchFields: ["code", "username", "name", "email", "department", "roleName", "warehouse", "salesRep"],

  tabs: [
    { key: "all", label: "All" },
    { key: "active", label: "Active", test: (u) => u.status === "Active" },
    { key: "suspended", label: "Suspended", test: (u) => u.status === "Suspended" },
    { key: "inactive", label: "Inactive", test: (u) => u.status === "Inactive" },
  ],

  filters: [
    { id: "role", label: "Role", options: () => ROLES.map((r) => r.name), test: (u, v) => u.roleName === v },
    { id: "dept", label: "Department", options: () => [...DEPARTMENTS], test: (u, v) => u.department === v },
    { id: "status", label: "Status", options: () => [...USER_STATUS], test: (u, v) => u.status === v },
    {
      id: "scope",
      label: "Data Scope",
      advanced: true,
      options: () => SCOPES.map((s) => s.label),
      test: (u, v) => u.scopeLabel === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      advanced: true,
      options: () => [...new Set(USER_ROWS.map((u) => u.warehouse))].filter(Boolean),
      test: (u, v) => u.warehouse === v,
    },
  ],

  columns: [
    { key: "code", label: "Employee Code", sortable: true, cell: (u) => <span className="font-medium tnum">{u.code}</span> },
    {
      key: "name",
      label: "Full Name",
      sortable: true,
      cell: (u) => (
        <>
          {u.name}
          <CellSub>{u.username}</CellSub>
        </>
      ),
    },
    { key: "email", label: "Email", muted: true, cell: (u) => u.email },
    { key: "department", label: "Department", muted: true, cell: (u) => u.department },
    { key: "roleName", label: "Role", cell: (u) => <Badge tone="info">{u.roleName}</Badge> },
    { key: "scopeLabel", label: "Data Scope", muted: true, cell: (u) => u.scopeLabel },
    { key: "warehouse", label: "Warehouse", muted: true, defaultHidden: true, cell: (u) => u.warehouse || DASH },
    { key: "salesRep", label: "Sales Rep", muted: true, defaultHidden: true, cell: (u) => u.salesRep || DASH },
    { key: "moduleCount", label: "Modules", align: "right", defaultHidden: true, cell: (u) => u.moduleCount },
    { key: "status", label: "Status", cell: (u) => <Badge tone={tone(STATUS_TONE, u.status)}>{u.status}</Badge> },
    { key: "lastLogin", label: "Last Login", muted: true, sortable: true, cell: (u) => u.lastLogin || DASH },
  ],

  rowActions: (_u, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("admin-user", r.code) },
    {
      label: "Reset Password",
      icon: "lock",
      run: (r) => {
        audit("Update", "admin-user", `ส่งลิงก์ตั้งรหัสผ่านใหม่ให้ ${r.name}`, r.code);
        ctx.toast("ส่งลิงก์ตั้งรหัสผ่านแล้ว", `${r.email} — Future support`, "info");
      },
    },
    {
      label: "Impersonate",
      icon: "user",
      run: (r) =>
        ctx.toast("สวมสิทธิ์ผู้ใช้", `${r.name} — Future support`, "info"),
    },
    { sep: true },
    {
      label: "Suspend",
      icon: "circleSlash",
      disabled: _u.status !== "Active",
      disabledReason: "ผู้ใช้ยังไม่ได้เปิดใช้งานอยู่",
      run: (r) => {
        r.status = "Suspended";
        decorateUsers();
        audit("Update", "admin-user", `ระงับผู้ใช้ ${r.name}`, r.code);
        ctx.refresh();
        ctx.toast("ระงับผู้ใช้แล้ว", `${r.code} — ${r.name}`, "info");
      },
    },
    {
      label: "Activate",
      icon: "checkCircle",
      disabled: _u.status === "Active",
      disabledReason: "ผู้ใช้เปิดใช้งานอยู่แล้ว",
      run: (r) => {
        r.status = "Active";
        decorateUsers();
        audit("Update", "admin-user", `เปิดใช้งานผู้ใช้ ${r.name}`, r.code);
        ctx.refresh();
        ctx.toast("เปิดใช้งานผู้ใช้แล้ว", `${r.code} — ${r.name}`);
      },
    },
  ],
};

const USER_DETAIL: DetailSchema<UserRow> = {
  key: "admin-user",
  entityLabel: "User",
  identity: (u) => ({
    code: u.code,
    title: u.name,
    copyFields: [
      { label: "Username", value: u.username },
      { label: "Email", value: u.email },
    ],
    badges: [
      { text: u.status, tone: tone(STATUS_TONE, u.status) },
      { text: u.roleName, tone: "info" },
    ],
    tags: [u.department, u.scopeLabel].filter(Boolean),
  }),
  kpis: (u) => [
    { icon: "shield", label: "Role", value: u.roleName, sub: u.department, goTab: "access" },
    { icon: "lock", label: "Data Scope", value: u.scopeLabel, sub: "ขอบเขตข้อมูล", goTab: "access" },
    { icon: "grid", label: "Modules", value: String(u.moduleCount), sub: `จาก ${MODULES.length}`, goTab: "access" },
    { icon: "clock", label: "Last Login", value: u.lastLogin || DASH, wide: true, goTab: "activity" },
  ],
  tabs: [
    {
      key: "profile",
      label: "Profile",
      blocks: (u) => [
        {
          type: "fields",
          title: "User Information",
          cols: 2,
          items: [
            { label: "Employee Code", value: u.code },
            { label: "Username", value: u.username },
            { label: "Full Name", value: u.name },
            { label: "Email", value: u.email },
            { label: "Phone", value: u.phone || DASH },
            { label: "Department", value: u.department },
            { label: "Status", value: <Badge tone={tone(STATUS_TONE, u.status)}>{u.status}</Badge> },
            { label: "Last Login", value: u.lastLogin || DASH },
          ],
        },
        {
          type: "fields",
          title: "Assignment",
          cols: 2,
          items: [
            { label: "Warehouse", value: u.warehouse || DASH },
            { label: "Sales Representative", value: u.salesRep || DASH },
            { label: "Team", value: u.team || DASH },
            { label: "Created", value: `${u.created} · ${u.createdBy}`, muted: true },
          ],
        },
        u.note ? { type: "note", title: "Note", text: u.note } : null,
        {
          type: "planned",
          title: "Password",
          label: "Password Reset",
          message: "ตั้งรหัสผ่านใหม่และบังคับเปลี่ยนเมื่อเข้าใช้ครั้งถัดไป — รอระบบยืนยันตัวตนจริง",
        },
      ],
    },
    {
      key: "access",
      label: "Access",
      blocks: (u) => {
        const rows = rolePermissionRows(u.roleCode).filter((r) => r.actions.length);
        const scope = getScope(effectiveScope(u));
        return [
          {
            type: "fields",
            title: "Effective Access",
            cols: 2,
            items: [
              { label: "Role", value: <Badge tone="info">{u.roleName}</Badge> },
              { label: "Role Default Scope", value: getScope(getRole(u.roleCode)?.scope ?? "")?.label ?? DASH },
              { label: "User Scope Override", value: u.scope ? getScope(u.scope)?.label ?? u.scope : "ไม่กำหนด" },
              { label: "Effective Scope", value: <Badge tone="primary">{scope?.label ?? DASH}</Badge> },
              { label: "Scope Meaning", value: scope?.desc ?? DASH, span: true, muted: true },
            ],
          },
          {
            type: "table",
            title: `Modules Granted (${rows.length})`,
            rows,
            empty: "บทบาทนี้ยังไม่ได้รับสิทธิ์ในโมดูลใด",
            cols: [
              { key: "label", label: "Module" },
              { key: "group", label: "Group", muted: true },
              { key: "access", label: "Access", cell: (r) => <Badge tone={tone(ACCESS_TONE, r.access)}>{r.access}</Badge> },
              { key: "actions", label: "Actions", cell: (r) => r.actions.join(", ") },
            ],
          },
        ];
      },
    },
    {
      key: "activity",
      label: "Activity",
      blocks: (u) => {
        const rows = AUDIT_LOG.filter((l) => l.userCode === u.code);
        return [
          {
            type: "table",
            title: `Audit Trail (${rows.length})`,
            rows: rows.slice(0, 20),
            empty: "ยังไม่มีกิจกรรมของผู้ใช้รายนี้",
            cols: [
              { key: "when", label: "When", muted: true },
              { key: "event", label: "Event", cell: (l) => <Badge tone={tone(EVENT_TONE, l.event)}>{l.event}</Badge> },
              { key: "module", label: "Module", muted: true },
              { key: "ref", label: "Reference", cell: (l) => l.ref || DASH },
              { key: "detail", label: "Detail", muted: true },
            ],
          },
        ];
      },
    },
  ],
};

export const adminUserSchemas: EntitySchemas<UserRow> = { list: USER_LIST, detail: USER_DETAIL };

/* ============================================================
   2. ROLE MANAGEMENT
   ============================================================ */

export interface RoleRow extends RoleDef {
  userCount: number;
  moduleCount: number;
  actionCount: number;
  fieldCount: number;
  scopeLabel: string;
}

export const ROLE_ROWS = ROLES as RoleRow[];

export function decorateRoles() {
  for (const r of ROLE_ROWS) {
    const rows = rolePermissionRows(r.code);
    r.userCount = usersInRole(r.code).length;
    r.moduleCount = rows.filter((x) => x.actions.length).length;
    r.actionCount = rows.reduce((t, x) => t + x.actions.length, 0);
    r.fieldCount = r.all ? FIELD_COUNT : r.fields.length;
    r.scopeLabel = getScope(r.scope)?.label ?? r.scope;
  }
}

const FIELD_COUNT = 8;
decorateRoles();

const ROLE_LIST: ListSchema<RoleRow> = {
  key: "admin-role",
  entity: "Role",
  entityPlural: "Roles",
  title: "Role Management",
  subtitle: "บทบาทกำหนดเองได้ทั้งหมด — สร้างบทบาทใหม่ได้โดยไม่ต้องแก้โค้ด",
  crumb: "Role Management",
  crumbParent: "Administration",
  primaryLabel: "Create Role",
  searchPlaceholder: "ค้นหารหัสบทบาท ชื่อ หรือแผนก...",
  emptyTitle: "ไม่พบบทบาทที่ตรงกับเงื่อนไข",

  source: () => ROLE_ROWS,
  searchFields: ["code", "name", "desc", "department", "scopeLabel"],

  tabs: [
    { key: "all", label: "All" },
    { key: "system", label: "System", test: (r) => r.system },
    { key: "custom", label: "Custom", test: (r) => !r.system },
    { key: "inactive", label: "Inactive", test: (r) => r.status !== "Active" },
  ],

  filters: [
    { id: "dept", label: "Department", options: () => [...DEPARTMENTS], test: (r, v) => r.department === v },
    { id: "status", label: "Status", options: () => ["Active", "Inactive"], test: (r, v) => r.status === v },
    {
      id: "scope",
      label: "Data Scope",
      advanced: true,
      options: () => SCOPES.map((s) => s.label),
      test: (r, v) => r.scopeLabel === v,
    },
  ],

  columns: [
    { key: "code", label: "Role Code", sortable: true, cell: (r) => <span className="font-medium">{r.code}</span> },
    {
      key: "name",
      label: "Role Name",
      sortable: true,
      cell: (r) => (
        <>
          {r.name}
          <CellSub>{r.desc}</CellSub>
        </>
      ),
    },
    { key: "department", label: "Department", muted: true, cell: (r) => r.department },
    { key: "scopeLabel", label: "Default Scope", muted: true, cell: (r) => r.scopeLabel },
    { key: "userCount", label: "Users", align: "right", sortable: true, sortValue: (r) => r.userCount, cell: (r) => r.userCount },
    { key: "moduleCount", label: "Modules", align: "right", sortable: true, sortValue: (r) => r.moduleCount, cell: (r) => r.moduleCount },
    { key: "actionCount", label: "Grants", align: "right", defaultHidden: true, cell: (r) => r.actionCount },
    { key: "fieldCount", label: "Fields", align: "right", defaultHidden: true, cell: (r) => r.fieldCount },
    {
      key: "system",
      label: "Type",
      cell: (r) => <Badge tone={r.system ? "primary" : "neutral"}>{r.system ? "System" : "Custom"}</Badge>,
    },
    { key: "status", label: "Status", cell: (r) => <Badge tone={tone(STATUS_TONE, r.status)}>{r.status}</Badge> },
  ],

  rowActions: (role, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("admin-role", r.code) },
    {
      label: "Duplicate",
      icon: "copy",
      run: (r) => ctx.toast("ทำสำเนาบทบาท", `${r.name} — Future support`, "info"),
    },
    { sep: true },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      /* Two independent guards: a system role is structural, and a role in
         use would orphan its users. */
      disabled: role.system || role.userCount > 0,
      disabledReason: role.system
        ? "บทบาทของระบบลบไม่ได้"
        : `มีผู้ใช้ ${role.userCount} คนใช้บทบาทนี้อยู่`,
      run: (r) =>
        ctx.confirm({
          title: "Delete this role?",
          message: (
            <>
              <strong>{r.code}</strong> — {r.name} จะถูกลบถาวร
            </>
          ),
          confirmText: "Delete role",
          onConfirm: () => {
            const i = ROLE_ROWS.indexOf(r);
            if (i > -1) ROLE_ROWS.splice(i, 1);
            decorateRoles();
            audit("Delete", "admin-role", `ลบบทบาท ${r.name}`, r.code);
            ctx.refresh();
            ctx.toast("ลบบทบาทแล้ว", `${r.code} — ${r.name}`, "danger");
          },
        }),
    },
  ],
};

const ROLE_DETAIL: DetailSchema<RoleRow> = {
  key: "admin-role",
  entityLabel: "Role",
  identity: (r) => ({
    code: r.code,
    title: r.name,
    copyFields: [{ label: "Role code", value: r.code }],
    badges: [
      { text: r.status, tone: tone(STATUS_TONE, r.status) },
      { text: r.system ? "System" : "Custom", tone: r.system ? "primary" : "neutral" },
    ],
    tags: [r.department, r.scopeLabel],
  }),
  kpis: (r) => [
    { icon: "users", label: "Users", value: String(r.userCount), sub: "ผู้ใช้บทบาทนี้", goTab: "users" },
    { icon: "grid", label: "Modules", value: String(r.moduleCount), sub: `จาก ${MODULES.length}`, goTab: "modules" },
    { icon: "eye", label: "Fields", value: String(r.fieldCount), sub: "ฟิลด์ที่มองเห็น", goTab: "fields" },
    { icon: "lock", label: "Data Scope", value: r.scopeLabel, wide: true, goTab: "modules" },
  ],
  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (r) => [
        r.all && {
          type: "alert",
          tone: "warn",
          title: "บทบาทนี้เข้าถึงได้ทุกอย่าง",
          message: "Super Admin ข้ามการตรวจสิทธิ์ทั้งหมด — ควรมีผู้ใช้เท่าที่จำเป็น",
        },
        {
          type: "fields",
          title: "Role Information",
          cols: 2,
          items: [
            { label: "Role Code", value: r.code },
            { label: "Role Name", value: r.name },
            { label: "Department", value: r.department },
            { label: "Default Data Scope", value: <Badge tone="primary">{r.scopeLabel}</Badge> },
            { label: "Status", value: <Badge tone={tone(STATUS_TONE, r.status)}>{r.status}</Badge> },
            { label: "Type", value: r.system ? "System role" : "Custom role" },
            { label: "Description", value: r.desc, span: true },
            { label: "Created", value: `${r.created} · ${r.createdBy}`, muted: true, span: true },
          ],
        },
      ],
    },
    {
      key: "modules",
      label: "Module Permissions",
      blocks: (r) => {
        const rows = rolePermissionRows(r.code);
        const granted = rows.filter((x) => x.actions.length);
        return [
          {
            type: "cards",
            title: "Coverage",
            items: [
              { label: "Modules Granted", value: String(granted.length), tone: "accent" },
              { label: "No Access", value: String(rows.length - granted.length) },
              { label: "Total Grants", value: String(r.actionCount) },
              { label: "Data Scope", value: r.scopeLabel },
            ],
          },
          {
            type: "table",
            title: `Module Permissions (${rows.length})`,
            rows,
            empty: "ไม่มีโมดูล",
            cols: [
              { key: "label", label: "Module" },
              { key: "group", label: "Group", muted: true },
              { key: "access", label: "Access", cell: (x) => <Badge tone={tone(ACCESS_TONE, x.access)}>{x.access}</Badge> },
              ...ACTIONS.map((a) => ({
                key: a,
                label: a[0].toUpperCase() + a.slice(1),
                cell: (x: { actions: readonly string[] }) =>
                  x.actions.includes(a) ? (
                    <Icon name="check" size={15} className="text-success" />
                  ) : (
                    <span className="text-ink-3">—</span>
                  ),
              })),
            ],
          },
        ];
      },
    },
    {
      key: "fields",
      label: "Field Permissions",
      blocks: (r) => [
        {
          type: "note",
          text: "ฟิลด์ที่ไม่ได้รับสิทธิ์จะไม่ถูกแสดงผลเลย ไม่ใช่แค่ปิดการแก้ไข — ผู้ใช้จะไม่เห็นแม้แต่ช่องว่าง",
        },
        {
          type: "flags",
          title: "Sensitive Fields",
          cols: 2,
          items: FIELD_LABELS.map((f) => ({
            label: `${f.label} — ${f.desc}`,
            value: r.all || r.fields.includes(f.key),
          })),
        },
      ],
    },
    {
      key: "users",
      label: "Users",
      blocks: (r) => [
        {
          type: "table",
          title: `Users with this role (${r.userCount})`,
          rows: usersInRole(r.code),
          empty: "ยังไม่มีผู้ใช้ที่ได้รับบทบาทนี้",
          cols: [
            { key: "code", label: "Employee Code" },
            { key: "name", label: "Full Name" },
            { key: "department", label: "Department", muted: true },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (u) => u.warehouse || DASH },
            { key: "status", label: "Status", cell: (u) => <Badge tone={tone(STATUS_TONE, u.status)}>{u.status}</Badge> },
            { key: "lastLogin", label: "Last Login", muted: true },
          ],
        },
      ],
    },
  ],
};

/* Imported lazily to avoid a cycle with the framework's own re-exports. */
const FIELD_LABELS = [
  { key: "cost", label: "Cost", desc: "ราคาทุน" },
  { key: "margin", label: "Margin", desc: "กำไรขั้นต้น" },
  { key: "profit", label: "Profit", desc: "กำไรรวม" },
  { key: "supplierCost", label: "Supplier Cost", desc: "ราคาผู้ขาย" },
  { key: "inventoryValue", label: "Inventory Value", desc: "มูลค่าสต๊อก" },
  { key: "credit", label: "Credit", desc: "วงเงินลูกค้า" },
  { key: "bank", label: "Bank Account", desc: "เลขบัญชี" },
  { key: "salary", label: "Payroll", desc: "ค่าตอบแทน" },
];

export const adminRoleSchemas: EntitySchemas<RoleRow> = { list: ROLE_LIST, detail: ROLE_DETAIL };

/* ============================================================
   3. DATA SCOPE
   ============================================================ */

export interface ScopeRow extends ScopeDef {
  roleCount: number;
  userCount: number;
}

export const SCOPE_ROWS = SCOPES.map((s) => ({
  ...s,
  roleCount: ROLES.filter((r) => r.scope === s.code).length,
  userCount: USERS.filter((u) => effectiveScope(u) === s.code).length,
})) as ScopeRow[];

const SCOPE_LIST: ListSchema<ScopeRow> = {
  key: "admin-scope",
  entity: "Data Scope",
  entityPlural: "Data Scopes",
  title: "Data Scope",
  subtitle: "ขอบเขตข้อมูล — บทบาทเดียวกันเห็นข้อมูลต่างกันได้ตามขอบเขตที่กำหนด",
  crumb: "Data Scope",
  crumbParent: "Administration",
  primaryLabel: "Create Scope",
  hideCreate: true,
  searchPlaceholder: "ค้นหาขอบเขตข้อมูล...",

  source: () => SCOPE_ROWS,
  searchFields: ["code", "label", "desc"],
  tabs: [{ key: "all", label: "All" }],
  filters: [],

  columns: [
    { key: "code", label: "Scope Code", cell: (s) => <span className="font-medium">{s.code}</span> },
    { key: "label", label: "Scope", cell: (s) => s.label },
    { key: "desc", label: "Meaning", muted: true, cell: (s) => s.desc },
    {
      key: "rank",
      label: "Reach",
      sortable: true,
      cell: (s) => (
        <span className="inline-flex items-center gap-2">
          <span className="block h-[5px] w-16 overflow-hidden rounded-pill bg-line">
            <span className="block h-full rounded-pill bg-primary" style={{ width: `${(s.rank / 5) * 100}%` }} />
          </span>
          <span className="tnum text-cap text-ink-2">{s.rank}/5</span>
        </span>
      ),
    },
    { key: "roleCount", label: "Roles", align: "right", cell: (s) => s.roleCount },
    { key: "userCount", label: "Users", align: "right", cell: (s) => s.userCount },
  ],

  rowActions: (_s, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("admin-scope", r.code) },
  ],
};

const SCOPE_DETAIL: DetailSchema<ScopeRow> = {
  key: "admin-scope",
  entityLabel: "Data Scope",
  identity: (s) => ({
    code: s.code,
    title: s.label,
    badges: [{ text: `Reach ${s.rank}/5`, tone: s.rank >= 4 ? "warning" : "info" }],
    tags: [],
  }),
  kpis: (s) => [
    { icon: "shield", label: "Roles", value: String(s.roleCount), sub: "บทบาทที่ใช้ขอบเขตนี้" },
    { icon: "users", label: "Users", value: String(s.userCount), sub: "ผู้ใช้ที่อยู่ในขอบเขตนี้" },
    { icon: "lock", label: "Reach", value: `${s.rank}/5`, sub: "ยิ่งสูงยิ่งเห็นกว้าง", wide: true },
  ],
  tabs: [
    {
      key: "overview",
      label: "Overview",
      blocks: (s) => [
        { type: "fields", title: "Scope", cols: 2, items: [
          { label: "Code", value: s.code },
          { label: "Label", value: s.label },
          { label: "Meaning", value: s.desc, span: true },
        ] },
        {
          type: "table",
          title: "Roles using this scope",
          rows: ROLES.filter((r) => r.scope === s.code),
          empty: "ยังไม่มีบทบาทใดใช้ขอบเขตนี้",
          cols: [
            { key: "code", label: "Role Code" },
            { key: "name", label: "Role" },
            { key: "department", label: "Department", muted: true },
            { key: "status", label: "Status", cell: (r) => <Badge tone={tone(STATUS_TONE, r.status)}>{r.status}</Badge> },
          ],
        },
        {
          type: "table",
          title: "Users in this scope",
          rows: USERS.filter((u) => effectiveScope(u) === s.code),
          empty: "ยังไม่มีผู้ใช้",
          cols: [
            { key: "code", label: "Employee Code" },
            { key: "name", label: "Full Name" },
            { key: "department", label: "Department", muted: true },
            { key: "warehouse", label: "Warehouse", muted: true, cell: (u) => u.warehouse || DASH },
            { key: "salesRep", label: "Sales Rep", muted: true, cell: (u) => u.salesRep || DASH },
          ],
        },
      ],
    },
  ],
};

export const adminScopeSchemas: EntitySchemas<ScopeRow> = { list: SCOPE_LIST, detail: SCOPE_DETAIL };

/* ============================================================
   4. APPROVAL WORKFLOW
   ============================================================ */

export interface WorkflowRow extends WorkflowDef {
  stepCount: number;
  moduleLabel: string;
  maxThreshold: number;
  gapCount: number;
}

export const WORKFLOW_ROWS = WORKFLOWS as WorkflowRow[];

export function decorateWorkflows() {
  for (const w of WORKFLOW_ROWS) {
    w.stepCount = w.steps.length;
    w.moduleLabel = MODULES.find((m) => m.key === w.module)?.label ?? w.module;
    w.maxThreshold = w.steps.reduce((m, s) => Math.max(m, s.threshold), 0);
    w.gapCount = workflowGaps(w).length;
  }
}

decorateWorkflows();

const WORKFLOW_LIST: ListSchema<WorkflowRow> = {
  key: "admin-workflow",
  entity: "Approval Workflow",
  entityPlural: "Approval Workflows",
  title: "Approval Workflow",
  subtitle: "ลำดับการอนุมัติที่ตั้งค่าได้ ใช้ร่วมกันทุกโมดูล ไม่ได้ฝังไว้ในโค้ด",
  crumb: "Approval Workflow",
  crumbParent: "Administration",
  primaryLabel: "Create Workflow",
  searchPlaceholder: "ค้นหารหัส ชื่อ หรือโมดูล...",

  source: () => WORKFLOW_ROWS,
  searchFields: ["code", "name", "moduleLabel", "note"],

  tabs: [
    { key: "all", label: "All" },
    { key: "active", label: "Active", test: (w) => w.status === "Active" },
    { key: "draft", label: "Draft", test: (w) => w.status !== "Active" },
    { key: "gaps", label: "Missing Approver", test: (w) => w.gapCount > 0 },
  ],

  filters: [
    {
      id: "module",
      label: "Module",
      options: () => [...new Set(WORKFLOW_ROWS.map((w) => w.moduleLabel))],
      test: (w, v) => w.moduleLabel === v,
    },
    { id: "status", label: "Status", options: () => ["Active", "Draft"], test: (w, v) => w.status === v },
  ],

  columns: [
    { key: "code", label: "Workflow Code", sortable: true, cell: (w) => <span className="font-medium">{w.code}</span> },
    { key: "name", label: "Workflow", cell: (w) => (<>{w.name}<CellSub>{w.note || w.moduleLabel}</CellSub></>) },
    { key: "moduleLabel", label: "Module", muted: true, cell: (w) => w.moduleLabel },
    { key: "stepCount", label: "Steps", align: "right", sortable: true, sortValue: (w) => w.stepCount, cell: (w) => w.stepCount },
    {
      key: "maxThreshold",
      label: "Top Threshold",
      align: "right",
      cell: (w) => (w.maxThreshold ? money0(w.maxThreshold) : DASH),
    },
    {
      key: "gapCount",
      label: "Approvers",
      cell: (w) =>
        w.gapCount ? (
          <Badge tone="danger">ขาด {w.gapCount} ขั้น</Badge>
        ) : (
          <Badge tone="success">ครบ</Badge>
        ),
    },
    { key: "status", label: "Status", cell: (w) => <Badge tone={tone(STATUS_TONE, w.status)}>{w.status}</Badge> },
  ],

  rowActions: (wf, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("admin-workflow", r.code) },
    {
      label: wf.status === "Active" ? "Deactivate" : "Activate",
      icon: wf.status === "Active" ? "circleSlash" : "checkCircle",
      run: (r) => {
        r.status = r.status === "Active" ? "Draft" : "Active";
        decorateWorkflows();
        audit("Update", "admin-workflow", `เปลี่ยนสถานะเป็น ${r.status}`, r.code);
        ctx.refresh();
        ctx.toast("อัปเดต Workflow แล้ว", `${r.code} — ${r.status}`);
      },
    },
  ],
};

const WORKFLOW_DETAIL: DetailSchema<WorkflowRow> = {
  key: "admin-workflow",
  entityLabel: "Approval Workflow",
  identity: (w) => ({
    code: w.code,
    title: w.name,
    badges: [
      { text: w.status, tone: tone(STATUS_TONE, w.status) },
      { text: w.moduleLabel, tone: "info" },
    ],
    tags: [`${w.stepCount} ขั้น`],
  }),
  kpis: (w) => [
    { icon: "checkCircle", label: "Steps", value: String(w.stepCount), sub: "ขั้นการอนุมัติ" },
    { icon: "tag", label: "Top Threshold", value: w.maxThreshold ? money0(w.maxThreshold) : DASH, sub: "THB" },
    { icon: "clock", label: "Total SLA", value: String(w.steps.reduce((t, s) => t + s.slaHours, 0)), sub: "ชั่วโมง" },
    { icon: "users", label: "Coverage", value: w.gapCount ? `ขาด ${w.gapCount}` : "ครบ", wide: true },
  ],
  tabs: [
    {
      key: "steps",
      label: "Steps",
      blocks: (w) => {
        const gaps = workflowGaps(w);
        return [
          gaps.length > 0 && {
            type: "alert",
            tone: "danger",
            title: "มีขั้นที่ไม่มีผู้อนุมัติ",
            message: gaps.join(" · "),
          },
          {
            type: "fields",
            title: "Workflow",
            cols: 2,
            items: [
              { label: "Code", value: w.code },
              { label: "Module", value: w.moduleLabel },
              { label: "Amount Field", value: w.amountField },
              { label: "Status", value: <Badge tone={tone(STATUS_TONE, w.status)}>{w.status}</Badge> },
              { label: "Created", value: `${w.created} · ${w.createdBy}`, muted: true, span: true },
              w.note ? { label: "Note", value: w.note, span: true } : null,
            ],
          },
          {
            type: "table",
            title: `Approval Steps (${w.steps.length})`,
            rows: w.steps,
            empty: "ยังไม่มีขั้นการอนุมัติ",
            cols: [
              { key: "seq", label: "Step", align: "right" },
              { key: "name", label: "Step Name" },
              { key: "roleCode", label: "Approver Role", cell: (s) => <Badge tone="info">{getRole(s.roleCode)?.name ?? s.roleCode}</Badge> },
              {
                key: "threshold",
                label: "Applies When",
                align: "right",
                cell: (s) => (s.threshold ? `≥ ${money0(s.threshold)}` : "ทุกกรณี"),
              },
              { key: "mode", label: "Mode", muted: true },
              { key: "slaHours", label: "SLA", align: "right", cell: (s) => `${s.slaHours} ชม.` },
              {
                key: "approvers",
                label: "Active Approvers",
                cell: (s) => {
                  const names = USERS.filter((u) => u.roleCode === s.roleCode && u.status === "Active");
                  return names.length ? names.map((u) => u.name).join(", ") : (
                    <span className="font-semibold text-danger-text">ไม่มีผู้อนุมัติ</span>
                  );
                },
              },
            ],
          },
          {
            type: "note",
            title: "How thresholds work",
            text: "ขั้นที่มี Threshold จะถูกข้ามเมื่อมูลค่าเอกสารต่ำกว่าเกณฑ์ — เอกสารเล็กใช้ลายเซ็นเดียว เอกสารใหญ่ใช้หลายลำดับ จากการตั้งค่าชุดเดียวกัน",
          },
        ];
      },
    },
  ],
};

export const adminWorkflowSchemas: EntitySchemas<WorkflowRow> = {
  list: WORKFLOW_LIST,
  detail: WORKFLOW_DETAIL,
};

/* ============================================================
   5. NUMBER SERIES
   ============================================================ */

export interface SeriesRow extends SeriesDef {
  moduleLabel: string;
  preview: string;
}

export const SERIES_ROWS = NUMBER_SERIES as SeriesRow[];

export function decorateSeries() {
  for (const s of SERIES_ROWS) {
    s.moduleLabel = MODULES.find((m) => m.key === s.module)?.label ?? s.module;
    s.preview = previewNumber(s);
  }
}

decorateSeries();

const SERIES_LIST: ListSchema<SeriesRow> = {
  key: "admin-series",
  entity: "Number Series",
  entityPlural: "Number Series",
  title: "Number Series",
  subtitle: "รูปแบบเลขที่เอกสารของทุกโมดูล — คำนำหน้า ปี เดือน และเลขรัน",
  crumb: "Number Series",
  crumbParent: "Administration",
  primaryLabel: "Create Series",
  searchPlaceholder: "ค้นหารหัส คำนำหน้า หรือโมดูล...",

  source: () => SERIES_ROWS,
  searchFields: ["code", "prefix", "label", "moduleLabel", "lastIssued"],

  tabs: [
    { key: "all", label: "All" },
    { key: "active", label: "Active", test: (s) => s.status === "Active" },
    { key: "yearly", label: "Yearly Reset", test: (s) => s.resetCycle === "Yearly" },
  ],

  filters: [
    { id: "year", label: "Year Mode", options: () => [...YEAR_MODES], test: (s, v) => s.yearMode === v },
    { id: "reset", label: "Reset Cycle", options: () => [...RESET_CYCLES], test: (s, v) => s.resetCycle === v },
    { id: "status", label: "Status", options: () => ["Active", "Inactive"], test: (s, v) => s.status === v },
  ],

  columns: [
    { key: "code", label: "Series", sortable: true, cell: (s) => <span className="font-medium">{s.code}</span> },
    { key: "moduleLabel", label: "Module", cell: (s) => s.moduleLabel },
    { key: "prefix", label: "Prefix", cell: (s) => <span className="tnum">{s.prefix}</span> },
    { key: "yearMode", label: "Year", muted: true, cell: (s) => s.yearMode },
    { key: "useMonth", label: "Month", muted: true, cell: (s) => (s.useMonth ? "ใช้" : "ไม่ใช้") },
    { key: "padding", label: "Digits", align: "right", muted: true, cell: (s) => s.padding },
    { key: "next", label: "Next No.", align: "right", cell: (s) => <span className="tnum">{fmt(s.next)}</span> },
    {
      key: "preview",
      label: "Preview",
      cell: (s) => <span className="tnum font-semibold text-primary-active">{s.preview}</span>,
    },
    { key: "lastIssued", label: "Last Issued", muted: true, defaultHidden: true, cell: (s) => s.lastIssued || DASH },
    { key: "resetCycle", label: "Reset", muted: true, defaultHidden: true, cell: (s) => s.resetCycle },
    { key: "status", label: "Status", cell: (s) => <Badge tone={tone(STATUS_TONE, s.status)}>{s.status}</Badge> },
  ],

  rowActions: (_s, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("admin-series", r.code) },
    {
      label: "Copy Preview",
      icon: "copy",
      run: (r) => ctx.toast("เลขที่ถัดไป", r.preview, "info"),
    },
  ],
};

const SERIES_DETAIL: DetailSchema<SeriesRow> = {
  key: "admin-series",
  entityLabel: "Number Series",
  identity: (s) => ({
    code: s.code,
    title: `${s.label} — ${s.prefix}`,
    copyFields: [{ label: "Next number", value: s.preview }],
    badges: [{ text: s.status, tone: tone(STATUS_TONE, s.status) }],
    tags: [s.moduleLabel, s.yearMode === "None" ? "ไม่ใส่ปี" : `ปี ${s.yearMode}`],
  }),
  kpis: (s) => [
    { icon: "tag", label: "Next Number", value: s.preview, sub: "ตัวอย่าง" },
    { icon: "sort", label: "Running", value: fmt(s.next), sub: `${s.padding} หลัก` },
    { icon: "refresh", label: "Reset", value: s.resetCycle, sub: "รอบรีเซ็ต" },
    { icon: "file", label: "Last Issued", value: s.lastIssued || DASH, wide: true },
  ],
  tabs: [
    {
      key: "format",
      label: "Format",
      blocks: (s) => [
        {
          type: "fields",
          title: "Series Configuration",
          cols: 2,
          items: [
            { label: "Series Code", value: s.code },
            { label: "Module", value: s.moduleLabel },
            { label: "Prefix", value: s.prefix },
            { label: "Separator", value: s.separator || "ไม่มี" },
            { label: "Year Mode", value: s.yearMode },
            { label: "Include Month", value: s.useMonth ? "ใช้" : "ไม่ใช้" },
            { label: "Running Digits", value: String(s.padding) },
            { label: "Next Running Number", value: fmt(s.next) },
            { label: "Reset Cycle", value: s.resetCycle },
            { label: "Status", value: <Badge tone={tone(STATUS_TONE, s.status)}>{s.status}</Badge> },
            { label: "Last Updated", value: `${s.updated} · ${s.updatedBy}`, muted: true, span: true },
          ],
        },
        {
          type: "cards",
          title: "Preview",
          cols: 3,
          items: previewRun(s, 3).map((code, i) => ({
            label: i === 0 ? "เลขถัดไป" : `ถัดไป +${i}`,
            value: code,
            tone: i === 0 ? ("accent" as const) : undefined,
          })),
        },
        {
          type: "note",
          text: "โมดูลเรียก issueNumber() เพื่อขอเลขถัดไป ระบบจะเดินเลขให้อัตโนมัติ — ไม่มีโมดูลใดสร้างเลขที่เอกสารเอง",
        },
      ],
    },
  ],
};

export const adminSeriesSchemas: EntitySchemas<SeriesRow> = { list: SERIES_LIST, detail: SERIES_DETAIL };

/* ============================================================
   6. AUDIT LOG
   ============================================================ */

export interface AuditRow extends AuditEntry {
  moduleLabel: string;
}

export const AUDIT_ROWS = AUDIT_LOG as AuditRow[];

export function decorateAudit() {
  for (const l of AUDIT_ROWS) {
    l.moduleLabel = MODULES.find((m) => m.key === l.module)?.label ?? l.module;
  }
}

decorateAudit();

const AUDIT_LIST: ListSchema<AuditRow> = {
  key: "admin-audit",
  entity: "Audit Entry",
  entityPlural: "Audit Entries",
  title: "Audit Log",
  subtitle: "บันทึกทุกการเข้าใช้และทุกการเปลี่ยนแปลงในระบบ",
  crumb: "Audit Log",
  crumbParent: "Administration",
  primaryLabel: "",
  hideCreate: true,
  searchPlaceholder: "ค้นหาผู้ใช้ เอกสาร โมดูล หรือรายละเอียด...",
  emptyTitle: "ไม่พบรายการที่ตรงกับเงื่อนไข",

  source: () => AUDIT_ROWS,
  searchFields: ["code", "user", "userCode", "role", "moduleLabel", "ref", "detail", "ip"],

  tabs: [
    { key: "all", label: "All" },
    { key: "auth", label: "Sign-in", test: (l) => l.event.startsWith("Log") },
    { key: "changes", label: "Changes", test: (l) => ["Create", "Update", "Delete"].includes(l.event) },
    { key: "approval", label: "Approvals", test: (l) => ["Approve", "Reject"].includes(l.event) },
    { key: "failed", label: "Failed", test: (l) => l.result !== "Success" },
  ],

  filters: [
    { id: "event", label: "Event", options: () => [...AUDIT_EVENTS], test: (l, v) => l.event === v },
    { id: "user", label: "User", options: () => [...new Set(AUDIT_ROWS.map((l) => l.user))], test: (l, v) => l.user === v },
    {
      id: "module",
      label: "Module",
      advanced: true,
      options: () => [...new Set(AUDIT_ROWS.map((l) => l.moduleLabel))].filter((m) => m !== DASH),
      test: (l, v) => l.moduleLabel === v,
    },
    {
      id: "role",
      label: "Role",
      advanced: true,
      options: () => [...new Set(AUDIT_ROWS.map((l) => l.role))],
      test: (l, v) => l.role === v,
    },
    {
      id: "result",
      label: "Result",
      advanced: true,
      options: () => ["Success", "Failed"],
      test: (l, v) => l.result === v,
    },
  ],

  columns: [
    { key: "when", label: "When", sortable: true, cell: (l) => <span className="tnum">{l.when}</span> },
    { key: "event", label: "Event", cell: (l) => <Badge tone={tone(EVENT_TONE, l.event)}>{l.event}</Badge> },
    { key: "user", label: "User", cell: (l) => (<>{l.user}<CellSub>{l.role}</CellSub></>) },
    { key: "moduleLabel", label: "Module", muted: true, cell: (l) => l.moduleLabel },
    { key: "ref", label: "Reference", cell: (l) => (l.ref ? <span className="tnum">{l.ref}</span> : DASH) },
    { key: "detail", label: "Detail", muted: true, cell: (l) => l.detail },
    { key: "ip", label: "IP Address", muted: true, defaultHidden: true, cell: (l) => l.ip },
    {
      key: "result",
      label: "Result",
      cell: (l) => <Badge tone={l.result === "Success" ? "success" : "danger"}>{l.result}</Badge>,
    },
  ],

  rowActions: (_l, ctx) => [
    { label: "View", icon: "eye", run: (r) => ctx.openEntity("admin-audit", r.code) },
  ],
};

const AUDIT_DETAIL: DetailSchema<AuditRow> = {
  key: "admin-audit",
  entityLabel: "Audit Entry",
  identity: (l) => ({
    code: l.code,
    title: `${l.event} — ${l.user}`,
    badges: [
      { text: l.event, tone: tone(EVENT_TONE, l.event) },
      { text: l.result, tone: l.result === "Success" ? "success" : "danger" },
    ],
    tags: [l.moduleLabel, l.role],
  }),
  kpis: (l) => [
    { icon: "clock", label: "When", value: l.when, sub: "เวลาที่เกิดเหตุการณ์" },
    { icon: "user", label: "User", value: l.user, sub: l.role },
    { icon: "grid", label: "Module", value: l.moduleLabel, sub: l.ref || "ไม่มีเอกสารอ้างอิง" },
    { icon: "shield", label: "Result", value: l.result, wide: true },
  ],
  tabs: [
    {
      key: "detail",
      label: "Detail",
      blocks: (l) => [
        {
          type: "fields",
          title: "Audit Entry",
          cols: 2,
          items: [
            { label: "Log Code", value: l.code },
            { label: "Timestamp", value: l.when },
            { label: "Event", value: <Badge tone={tone(EVENT_TONE, l.event)}>{l.event}</Badge> },
            { label: "Result", value: <Badge tone={l.result === "Success" ? "success" : "danger"}>{l.result}</Badge> },
            { label: "User", value: `${l.user} (${l.userCode})` },
            { label: "Role", value: l.role },
            { label: "Module", value: l.moduleLabel },
            { label: "Reference", value: l.ref || DASH },
            { label: "IP Address", value: l.ip },
            { label: "Detail", value: l.detail, span: true },
          ],
        },
        {
          type: "note",
          text: "บันทึกการตรวจสอบแก้ไขไม่ได้ — ทุกรายการเขียนครั้งเดียวและเก็บไว้ตามนโยบายการเก็บข้อมูล",
        },
      ],
    },
  ],
};

export const adminAuditSchemas: EntitySchemas<AuditRow> = { list: AUDIT_LIST, detail: AUDIT_DETAIL };

/* Re-exported so tests and pages read one module. */
export { MODULE_GROUPS };
