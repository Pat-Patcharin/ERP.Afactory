import {
  ACTIONS,
  AUDIT_LOG,
  FIELDS,
  FIELD_KEYS,
  MODULES,
  NOTIFICATIONS,
  NUMBER_SERIES,
  ROLES,
  SCOPES,
  USERS,
  WORKFLOWS,
  type Action,
  type AuditEntry,
  type ModuleDef,
  type RoleDef,
  type SeriesDef,
  type UserDef,
  type WorkflowDef,
} from "@/data/admin";
import { DASH, beYear, stamp } from "@/lib/format";

/* ============================================================
   ADMINISTRATION FRAMEWORK

   Three layers answer every access question in the ERP:

     1. MODULE   — may this role open Purchase Order, and do what?
     2. FIELD    — may it see cost, margin, credit?
     3. SCOPE    — which records, out of all of them?

   A module never names a role. It asks `can("sales-order",
   "approve")` or `canViewField("margin")` and the answer comes
   from configuration. That is the whole point: adding "Regional
   Sales Manager" is a data change, not a code change.

   Layer 2 is a RENDER decision, not a disable decision. A field
   the role cannot see is never put on the page — a disabled
   input still tells you the number exists and roughly where.
   ============================================================ */

/* ---------- Session ---------- */

let currentUserCode = "EMP001";

export const getUsers = () => USERS;

export const getUser = (code: string): UserDef | null =>
  USERS.find((u) => u.code === code) ?? null;

export const currentUser = (): UserDef => getUser(currentUserCode) ?? USERS[0];

/**
 * Switch the acting user. This is how the Permission Matrix previews a role
 * and how impersonation will work once auth lands — every `can()` call in the
 * app answers differently from the next line onward, with no other wiring.
 */
export function setCurrentUser(code: string): boolean {
  if (!getUser(code)) return false;
  currentUserCode = code;
  return true;
}

export const resetCurrentUser = () => {
  currentUserCode = "EMP001";
  clearStoredAccount();
};

/**
 * Whoever is acting right now, by name.
 *
 * Every document stamp — created by, approved by, updated by — goes through
 * here rather than through a constant. A prototype that stamps one name on
 * work two different people did is not showing you an approval flow, it is
 * showing you a screenshot of one.
 */
export const actingUserName = (): string => currentUser().name;

/* ---------- Demo accounts ---------- */

export interface DemoAccount {
  code: string;
  /** What this account is for, in the words of the person using the demo. */
  purpose: string;
  initials: string;
}

/**
 * The accounts the demo is driven from, in the order the work moves.
 *
 * Backoffice raises the request and cannot approve it. The general manager
 * signs what is within the limit and refers what is over it; the managing
 * director signs that. The warehouse receives what arrives, and cannot close
 * an order short. The super admin is here because the demo needs a chair that
 * reaches Administration, not because the flow needs one.
 *
 * The five sales chairs that used to sit beside these were the same five jobs
 * a second time — two super admins, two warehouse people — and the switcher
 * asked which of two identical answers you wanted. The USERS behind them stay:
 * they created half the seeded documents, and a person who is deleted takes
 * the history stamped with their name with them. What went is the menu entry.
 *
 * DEMO ONLY. When real authentication lands, this list and the account
 * switcher in the topbar both go: an account is what you logged in as, not
 * something you pick from a menu.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    code: "EMP014",
    purpose: "เปิดใบขอซื้อ — อนุมัติเองไม่ได้",
    initials: "PM",
  },
  {
    code: "EMP015",
    purpose: "อนุมัติใบขอซื้อในวงเงิน ออกใบสั่งซื้อ และแยกใบสั่งซื้อทีละรายการได้",
    initials: "PW",
  },
  {
    code: "EMP016",
    purpose: "อนุมัติใบขอซื้อที่เกินวงเงิน — ด่านที่ผู้จัดการทั่วไปผ่านเองไม่ได้",
    initials: "MX",
  },
  {
    code: "EMP018",
    purpose: "รับของเข้าคลัง ตรวจ QC และจัดเก็บ",
    initials: "KI",
  },
  /* The sell side, in the order that work moves too: the rep raises the
     quotation and the customer behind it; the sales admin signs both. */
  {
    code: "EMP020",
    purpose: "เปิดใบเสนอราคาและเพิ่มลูกค้าใหม่ — อนุมัติเองไม่ได้",
    initials: "NY",
  },
  {
    code: "EMP019",
    purpose: "อนุมัติใบเสนอราคาราคาปกติ และยืนยันลูกค้าใหม่",
    initials: "MN",
  },
  {
    code: "EMP017",
    purpose: "ดูแลระบบ สิทธิ์ และการตั้งค่าทั้งหมด",
    initials: "AC",
  },
];

export const demoAccounts = () =>
  DEMO_ACCOUNTS.map((a) => ({ ...a, user: getUser(a.code)! })).filter((a) => a.user);

/* ---------- Session persistence ---------- */

/* A reload that silently puts you back in the administrator's chair would
   undo the thing being demonstrated, so the choice outlives the page. It is
   read on mount rather than at module load: the server has no localStorage,
   and reading it during render would make the first client paint disagree
   with the server's. */
const STORE_KEY = "afactory.session.user";

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    /* Storage can be denied outright (private mode, blocked cookies). The
       session still works, it just does not survive a reload. */
    return null;
  }
};

function clearStoredAccount() {
  store()?.removeItem(STORE_KEY);
}

/** Switch account and remember it. Returns false for an unknown user. */
export function switchAccount(code: string): boolean {
  if (!setCurrentUser(code)) return false;
  store()?.setItem(STORE_KEY, code);
  return true;
}

/**
 * Re-apply the remembered account. Call once from a mount effect; returns the
 * code actually in force so the caller knows whether anything changed.
 */
export function restoreAccount(): string {
  const saved = store()?.getItem(STORE_KEY);
  if (saved && saved !== currentUserCode) setCurrentUser(saved);
  return currentUser().code;
}

export const getRoles = () => ROLES;

export const getRole = (code: string): RoleDef | null =>
  ROLES.find((r) => r.code === code) ?? null;

export const currentRole = (): RoleDef | null => getRole(currentUser().roleCode);

/* ---------- Layer 1: module permission ---------- */

export const getModule = (key: string): ModuleDef | null =>
  MODULES.find((m) => m.key === key) ?? null;

/** Actions a module actually offers — a read-only screen has no `approve`. */
export const moduleActions = (key: string): Action[] =>
  (getModule(key)?.actions ?? [...ACTIONS]) as Action[];

/** What a role may do in a module. Empty array = No Access. */
export function roleActions(roleCode: string, moduleKey: string): Action[] {
  const role = getRole(roleCode);
  if (!role || role.status !== "Active") return [];
  if (role.all) return moduleActions(moduleKey);
  const granted = role.perms[moduleKey] ?? [];
  /* Intersect with what the module offers, so a stale grant cannot invent
     an approve button on a screen that has nothing to approve. */
  const offered = moduleActions(moduleKey);
  return granted.filter((a) => offered.includes(a));
}

/** The question every module asks. */
export function can(moduleKey: string, action: Action = "view"): boolean {
  const user = currentUser();
  if (user.status !== "Active") return false;
  return roleActions(user.roleCode, moduleKey).includes(action);
}

export const canAny = (moduleKey: string) => roleActions(currentUser().roleCode, moduleKey).length > 0;

/** Module keys the current user may open at all — drives nav filtering. */
export function visibleModules(): string[] {
  return MODULES.filter((m) => can(m.key, "view")).map((m) => m.key);
}

/** How a role's access to one module reads in the matrix. */
export function accessLabel(roleCode: string, moduleKey: string): string {
  const acts = roleActions(roleCode, moduleKey);
  if (!acts.length) return "No Access";
  const offered = moduleActions(moduleKey);
  if (acts.length === offered.length) return "Full Access";
  if (acts.length === 1 && acts[0] === "view") return "Read Only";
  if (!acts.includes("create") && !acts.includes("edit") && !acts.includes("delete")) {
    return "Read Only";
  }
  return "Partial";
}

/* ---------- Layer 2: field permission ---------- */

export const getFields = () => FIELDS;

export function roleCanViewField(roleCode: string, fieldKey: string): boolean {
  const role = getRole(roleCode);
  if (!role || role.status !== "Active") return false;
  if (role.all) return true;
  return role.fields.includes(fieldKey);
}

/**
 * Whether the CURRENT user may see a sensitive field.
 *
 * Schemas call this to decide whether to build the block at all. The
 * negative case must not render a placeholder that implies a hidden number —
 * omit the row.
 */
export function canViewField(fieldKey: string): boolean {
  const user = currentUser();
  if (user.status !== "Active") return false;
  return roleCanViewField(user.roleCode, fieldKey);
}

/** Filter a list of field keys down to what may be rendered. */
export const visibleFields = (keys: string[]) => keys.filter((k) => canViewField(k));

/* ---------- Layer 3: data scope ---------- */

export const getScopes = () => SCOPES;

export const getScope = (code: string) => SCOPES.find((s) => s.code === code) ?? null;

/** The scope actually in force: the user's override, else the role default. */
export function effectiveScope(user: UserDef = currentUser()): string {
  return user.scope || getRole(user.roleCode)?.scope || "own";
}

export interface ScopeContext {
  scope: string;
  user: UserDef;
  /** Sales rep label this user owns, for ownCustomers. */
  salesRep: string;
  /** Warehouse code this user owns, for ownWarehouse. */
  warehouse: string;
  department: string;
  team: string;
}

export function scopeContext(user: UserDef = currentUser()): ScopeContext {
  return {
    scope: effectiveScope(user),
    user,
    salesRep: user.salesRep,
    warehouse: user.warehouse,
    department: user.department,
    team: user.team,
  };
}

/**
 * How a record is matched against a scope. A module supplies whichever of
 * these its records carry; anything it omits simply is not tested, so a
 * module can adopt scoping one field at a time.
 */
export interface ScopeFields {
  /** Who created or is assigned the record. */
  owner?: string;
  /** The sales rep the record belongs to. */
  salesRep?: string;
  /** Warehouse code or label. */
  warehouse?: string;
  department?: string;
  team?: string;
}

/**
 * Does this record fall inside the scope?
 *
 * `company` sees everything. Anything narrower tests only the dimension it
 * names — an unscoped record (no owner, no rep) is visible, because hiding
 * records a module has not yet classified would silently break it.
 */
export function inScope(fields: ScopeFields, ctx: ScopeContext = scopeContext()): boolean {
  const eq = (a: string | undefined, b: string) =>
    !a || !b || String(a).toLowerCase().includes(String(b).toLowerCase());

  switch (ctx.scope) {
    case "company":
      return true;
    case "department":
      return eq(fields.department, ctx.department);
    case "ownTeam":
      return eq(fields.team, ctx.team) || eq(fields.salesRep, ctx.salesRep);
    case "ownWarehouse":
      return eq(fields.warehouse, ctx.warehouse);
    case "ownCustomers":
      return eq(fields.salesRep, ctx.salesRep);
    case "own":
      return eq(fields.owner, ctx.user.name) || eq(fields.owner, ctx.user.username);
    default:
      return true;
  }
}

/** Narrow a list to what the current scope allows. */
export function applyScope<T>(rows: T[], pick: (row: T) => ScopeFields): T[] {
  const ctx = scopeContext();
  if (ctx.scope === "company") return rows;
  return rows.filter((r) => inScope(pick(r), ctx));
}

/* ---------- Approval workflow ---------- */

export const getWorkflows = () => WORKFLOWS;

export const getWorkflow = (code: string) => WORKFLOWS.find((w) => w.code === code) ?? null;

/** The active workflow governing a module, if any. */
export const workflowFor = (moduleKey: string): WorkflowDef | null =>
  WORKFLOWS.find((w) => w.module === moduleKey && w.status === "Active") ?? null;

export interface ApprovalStepPlan {
  seq: number;
  name: string;
  roleCode: string;
  roleName: string;
  mode: string;
  slaHours: number;
  /** Why this step is in the plan — the threshold it cleared. */
  threshold: number;
  approvers: string[];
}

/**
 * The steps a document of this value must actually pass.
 *
 * Steps whose threshold the document does not reach are dropped, so a small
 * purchase request needs one signature and a large one needs three — from
 * the same configuration, with no branch in the calling module.
 */
export function approvalPlan(moduleKey: string, amount: number): ApprovalStepPlan[] {
  const wf = workflowFor(moduleKey);
  if (!wf) return [];

  return wf.steps
    .filter((s) => amount >= s.threshold)
    .sort((a, b) => a.seq - b.seq)
    .map((s) => ({
      seq: s.seq,
      name: s.name,
      roleCode: s.roleCode,
      roleName: getRole(s.roleCode)?.name ?? s.roleCode,
      mode: s.mode,
      slaHours: s.slaHours,
      threshold: s.threshold,
      approvers: USERS.filter((u) => u.roleCode === s.roleCode && u.status === "Active").map(
        (u) => u.name,
      ),
    }));
}

/** Does a document of this value need approval at all? */
export const needsApproval = (moduleKey: string, amount: number) =>
  approvalPlan(moduleKey, amount).length > 0;

/** May the current user sign this step? */
export function canApproveStep(step: ApprovalStepPlan): boolean {
  const user = currentUser();
  if (user.status !== "Active") return false;
  const role = getRole(user.roleCode);
  if (role?.all) return true;
  return user.roleCode === step.roleCode;
}

/** The next step waiting on a signature, given how many are already signed. */
export function nextApprovalStep(
  moduleKey: string,
  amount: number,
  approvedSeqs: number[] = [],
): ApprovalStepPlan | null {
  return approvalPlan(moduleKey, amount).find((s) => !approvedSeqs.includes(s.seq)) ?? null;
}

/** Workflow steps with no active user in the approving role — a dead end. */
export function workflowGaps(wf: WorkflowDef): string[] {
  return wf.steps
    .filter(
      (s) => !USERS.some((u) => u.roleCode === s.roleCode && u.status === "Active"),
    )
    .map((s) => `${s.name} (${getRole(s.roleCode)?.name ?? s.roleCode}) ไม่มีผู้ใช้ที่ใช้งานอยู่`);
}

/* ---------- Number series ---------- */

export const getSeries = () => NUMBER_SERIES;

export const getSeriesFor = (moduleKey: string): SeriesDef | null =>
  NUMBER_SERIES.find((s) => s.module === moduleKey && s.status === "Active") ?? null;

/**
 * Year segment for a series, in the era and width it declares.
 *
 * Width is configured rather than inferred: PR2506-0124 and INV-2026-000025
 * are both AD, and only the series knows which one wants two digits. Getting
 * this wrong regenerates numbers that collide with issued documents.
 */
function yearPart(s: SeriesDef, at: Date): string {
  if (s.yearMode === "None") return "";
  /* A deliberate choice, not a workaround: the series config says which era
     its numbers carry. Routed through the shared helper so the offset lives
     in one place. */
  const y = s.yearMode === "BE" ? beYear(at.getFullYear()) : at.getFullYear();
  return s.yearDigits === 2 ? String(y).slice(-2) : String(y);
}

/**
 * Render the next document number without consuming it. Used by the preview
 * on the Number Series screen and by any module about to create a document.
 */
export function previewNumber(series: SeriesDef, at = new Date(), next = series.next): string {
  const y = yearPart(series, at);
  const m = series.useMonth ? String(at.getMonth() + 1).padStart(2, "0") : "";
  const running = String(next).padStart(series.padding, "0");
  const dated = `${y}${m}`;

  /* Two shapes in real use: PR2506-0124 glues the prefix to the date, while
     INV-2026-000025 separates all three. `separatorAfterPrefix` picks. */
  const segments = series.separatorAfterPrefix
    ? [series.prefix, dated, running]
    : [series.prefix + dated, running];

  return segments.filter(Boolean).join(series.separator);
}

/** Consume a number: returns it and advances the counter. */
export function issueNumber(moduleKey: string, at = new Date()): string | null {
  const s = getSeriesFor(moduleKey);
  if (!s) return null;
  const code = previewNumber(s, at);
  s.next += 1;
  s.lastIssued = code;
  return code;
}

/** The next few numbers, for the preview panel. */
export const previewRun = (series: SeriesDef, count = 3, at = new Date()) =>
  Array.from({ length: count }, (_, i) => previewNumber(series, at, series.next + i));

/* ---------- Audit log ---------- */

export const getAuditLog = () => AUDIT_LOG;

let auditSeq = AUDIT_LOG.reduce(
  (m, l) => Math.max(m, parseInt(l.code.replace(/\D/g, ""), 10) || 0),
  0,
);

/**
 * Record an action. Every module will call this rather than keeping its own
 * history, so "who exported the price list" has one answer in one place.
 */
export function audit(
  event: string,
  moduleKey: string,
  detail: string,
  ref = "",
  result = "Success",
): AuditEntry {
  const user = currentUser();

  /*
     `stamp()`, like every other module — not a Buddhist year built by hand.

     This line used to format its own BE timestamp, with a comment saying the
     difference was "one D4 settles for the whole app". D4 settled the rule
     and did not come back for this line, which is the trouble with a comment
     that defers: nobody is ever assigned to check that the later step
     happened. It survived until a test went looking.

     Getting it wrong here is worse than getting it wrong on a screen. The
     audit log is what an investigator reads to put events in order, and it
     sits beside the documents it refers to — `LOG-000042 · 08/08/2569`
     against `QT2506-0001 · 22/06/2026` cannot be sequenced at all. It also
     wrote into a record on every action, so the D5 tripwire, which reads
     files at rest, could never see it.
  */
  const entry: AuditEntry = {
    code: `LOG-${String(++auditSeq).padStart(6, "0")}`,
    when: stamp(),
    event,
    user: user.name,
    userCode: user.code,
    role: getRole(user.roleCode)?.name ?? user.roleCode,
    module: moduleKey || DASH,
    ref,
    detail,
    ip: "10.0.0.1",
    result,
  };
  AUDIT_LOG.unshift(entry);
  return entry;
}

/* ---------- Notifications ---------- */

export const getNotifications = () => NOTIFICATIONS;

/** Notifications a role actually receives. */
export const notificationsForRole = (roleCode: string) =>
  NOTIFICATIONS.filter(
    (n) => n.status === "Active" && (n.roles.length === 0 || n.roles.includes(roleCode)),
  );

/* ---------- Rollups for the Administration Workspace ---------- */

export interface AdminSnapshot {
  users: number;
  activeUsers: number;
  suspendedUsers: number;
  roles: number;
  activeRoles: number;
  customRoles: number;
  permissionGrants: number;
  modules: number;
  workflows: number;
  activeWorkflows: number;
  approvalSteps: number;
  series: number;
  notifications: number;
  auditEntries: number;
  failedLogins: number;
  /** Workflow steps with nobody able to sign them. */
  workflowGaps: number;
  /** Active roles that can open nothing at all. */
  emptyRoles: number;
}

export function adminSnapshot(): AdminSnapshot {
  const activeRoles = ROLES.filter((r) => r.status === "Active");

  let grants = 0;
  for (const r of ROLES) {
    if (r.all) {
      grants += MODULES.reduce((t, m) => t + moduleActions(m.key).length, 0);
      continue;
    }
    grants += Object.values(r.perms).reduce((t, a) => t + a.length, 0);
  }

  return {
    users: USERS.length,
    activeUsers: USERS.filter((u) => u.status === "Active").length,
    suspendedUsers: USERS.filter((u) => u.status === "Suspended").length,
    roles: ROLES.length,
    activeRoles: activeRoles.length,
    customRoles: ROLES.filter((r) => !r.system).length,
    permissionGrants: grants,
    modules: MODULES.length,
    workflows: WORKFLOWS.length,
    activeWorkflows: WORKFLOWS.filter((w) => w.status === "Active").length,
    approvalSteps: WORKFLOWS.reduce((t, w) => t + w.steps.length, 0),
    series: NUMBER_SERIES.length,
    notifications: NOTIFICATIONS.filter((n) => n.status === "Active").length,
    auditEntries: AUDIT_LOG.length,
    failedLogins: AUDIT_LOG.filter((l) => l.event === "Login Failed").length,
    workflowGaps: WORKFLOWS.filter((w) => workflowGaps(w).length > 0).length,
    emptyRoles: activeRoles.filter(
      (r) => !r.all && Object.values(r.perms).every((a) => a.length === 0),
    ).length,
  };
}

/** Configuration problems worth surfacing on the workspace. */
export interface AdminIssue {
  key: string;
  title: string;
  detail: string;
  tone: string;
  goto: string;
}

export function adminIssues(): AdminIssue[] {
  const out: AdminIssue[] = [];

  const suspended = USERS.filter((u) => u.status === "Suspended");
  if (suspended.length) {
    out.push({
      key: "suspended",
      title: "ผู้ใช้ถูกระงับ",
      detail: suspended.map((u) => u.name).join(", "),
      tone: "warning",
      goto: "User Management",
    });
  }

  const failed = AUDIT_LOG.filter((l) => l.event === "Login Failed");
  if (failed.length) {
    out.push({
      key: "failedLogin",
      title: "เข้าสู่ระบบไม่สำเร็จ",
      detail: `${failed.length} ครั้ง — ล่าสุด ${failed[0].user}`,
      tone: "danger",
      goto: "Audit Log",
    });
  }

  for (const wf of WORKFLOWS) {
    const gaps = workflowGaps(wf);
    if (gaps.length) {
      out.push({
        key: `gap-${wf.code}`,
        title: `${wf.name} ไม่มีผู้อนุมัติ`,
        detail: gaps.join(" · "),
        tone: "danger",
        goto: "Approval Workflow",
      });
    }
  }

  const draft = WORKFLOWS.filter((w) => w.status !== "Active");
  if (draft.length) {
    out.push({
      key: "draftWf",
      title: "Workflow ที่ยังไม่เปิดใช้",
      detail: draft.map((w) => w.name).join(", "),
      tone: "info",
      goto: "Approval Workflow",
    });
  }

  /* Modules no active role can reach — usually a configuration oversight. */
  const unreachable = MODULES.filter(
    (m) => !ROLES.some((r) => r.status === "Active" && roleActions(r.code, m.key).includes("view")),
  );
  if (unreachable.length) {
    out.push({
      key: "unreachable",
      title: "โมดูลที่ไม่มีบทบาทใดเข้าถึงได้",
      detail: unreachable.map((m) => m.label).join(", "),
      tone: "warning",
      goto: "Permission Matrix",
    });
  }

  return out;
}

/** Everything a role grants, flattened — powers the role detail page. */
export interface RolePermissionRow {
  module: string;
  label: string;
  group: string;
  actions: Action[];
  access: string;
}

export function rolePermissionRows(roleCode: string): RolePermissionRow[] {
  return MODULES.map((m) => ({
    module: m.key,
    label: m.label,
    group: m.group,
    actions: roleActions(roleCode, m.key),
    access: accessLabel(roleCode, m.key),
  }));
}

/** Users carrying a role — a role in use must not be deleted casually. */
export const usersInRole = (roleCode: string) => USERS.filter((u) => u.roleCode === roleCode);

export { ACTIONS, FIELD_KEYS, MODULES, SCOPES };
