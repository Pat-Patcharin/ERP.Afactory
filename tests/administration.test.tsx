import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import AdministrationWorkspacePage from "@/app/(erp)/admin/page";
import PermissionMatrixPage from "@/app/(erp)/admin/permissions/page";
import CompanySettingsPage from "@/app/(erp)/admin/company/page";
import NotificationSettingsPage from "@/app/(erp)/admin/notifications/page";
import {
  ACTIONS,
  AUDIT_LOG,
  COMPANY,
  FIELD_KEYS,
  MODULES,
  NOTIFICATIONS,
  NUMBER_SERIES,
  ROLES,
  SCOPES,
  USERS,
  WORKFLOWS,
} from "@/data/admin";
import {
  accessLabel,
  adminIssues,
  adminSnapshot,
  applyScope,
  approvalPlan,
  audit,
  can,
  canApproveStep,
  canViewField,
  currentUser,
  effectiveScope,
  getRole,
  inScope,
  issueNumber,
  moduleActions,
  needsApproval,
  nextApprovalStep,
  previewNumber,
  previewRun,
  resetCurrentUser,
  roleActions,
  roleCanViewField,
  rolePermissionRows,
  scopeContext,
  setCurrentUser,
  usersInRole,
  visibleModules,
  workflowFor,
  workflowGaps,
} from "@/lib/domain/admin";
import { checkPermission, maskAccount } from "@/lib/permissions";
import { NAV, NAV_INDEX } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { getSchemas } from "@/schemas/registry";
import {
  adminAuditSchemas,
  adminRoleSchemas,
  adminScopeSchemas,
  adminSeriesSchemas,
  adminUserSchemas,
  adminWorkflowSchemas,
} from "@/schemas/administration";

/* ============================================================
   ADMINISTRATION FRAMEWORK regression suite.

   The point of the module is that NO business module names a
   role. So most of what follows switches the acting user and
   checks that the rest of the ERP answers differently — that is
   the property worth protecting, far more than any one screen.
   ============================================================ */

/* Every test that changes the session must put it back. */
afterEach(resetCurrentUser);

const asRole = (roleCode: string) => {
  const u = USERS.find((x) => x.roleCode === roleCode && x.status === "Active");
  expect(u, `an active user exists for ${roleCode}`).toBeDefined();
  setCurrentUser(u!.code);
  return u!;
};

/* ============================================================
   Layer 1 — module permission
   ============================================================ */

describe("Administration — module permission", () => {
  it("gives Super Admin every action on every module", () => {
    for (const m of MODULES) {
      expect(roleActions("SUPER_ADMIN", m.key), m.key).toEqual(moduleActions(m.key));
    }
  });

  it("never grants an action a module does not offer", () => {
    /* A read-only screen has nothing to approve; a stale grant must not
       invent a button. */
    for (const r of ROLES) {
      for (const m of MODULES) {
        const offered = moduleActions(m.key);
        for (const a of roleActions(r.code, m.key)) {
          expect(offered, `${r.code} · ${m.key} · ${a}`).toContain(a);
        }
      }
    }
  });

  it("denies everything to a role that is not active", () => {
    expect(getRole("EXTERNAL_AUDITOR")!.status).toBe("Inactive");
    for (const m of MODULES) {
      expect(roleActions("EXTERNAL_AUDITOR", m.key), m.key).toEqual([]);
    }
  });

  it("answers can() from the acting user's role", () => {
    asRole("SALES_REP");
    expect(can("sales-order", "view")).toBe(true);
    expect(can("sales-order", "create")).toBe(true);
    /* A rep sells; a rep does not buy. */
    expect(can("purchase-order", "view")).toBe(false);
    expect(can("purchase-order", "create")).toBe(false);

    asRole("PURCHASE_MANAGER");
    expect(can("purchase-order", "approve")).toBe(true);
    expect(can("sales-order", "view")).toBe(false);
  });

  it("denies a suspended user everything, whatever their role says", () => {
    const suspended = USERS.find((u) => u.status === "Suspended")!;
    expect(roleActions(suspended.roleCode, "sales-order").length).toBeGreaterThan(0);

    setCurrentUser(suspended.code);
    expect(can("sales-order", "view")).toBe(false);
    expect(canViewField("credit")).toBe(false);
  });

  it("hides modules rather than disabling them", () => {
    asRole("SALES_REP");
    const visible = visibleModules();
    expect(visible).toContain("sales-order");
    expect(visible).not.toContain("purchase-order");
    expect(visible).not.toContain("admin-role");

    asRole("SUPER_ADMIN");
    expect(visibleModules()).toHaveLength(MODULES.length);
  });

  it("summarises access the way the matrix prints it", () => {
    expect(accessLabel("SUPER_ADMIN", "sales-order")).toBe("Full Access");
    expect(accessLabel("SALES_REP", "purchase-order")).toBe("No Access");
    expect(accessLabel("SALES_REP", "product")).toBe("Read Only");
  });
});

/* ============================================================
   Layer 2 — field permission
   ============================================================ */

describe("Administration — field permission", () => {
  it("shows every sensitive field to Super Admin", () => {
    asRole("SUPER_ADMIN");
    for (const f of FIELD_KEYS) expect(canViewField(f), f).toBe(true);
  });

  it("hides cost, margin and profit from a Sales Representative", () => {
    asRole("SALES_REP");
    for (const f of ["cost", "margin", "profit", "supplierCost", "inventoryValue"]) {
      expect(canViewField(f), f).toBe(false);
    }
  });

  it("gives each manager only the figures their job needs", () => {
    expect(roleCanViewField("PURCHASE_MANAGER", "cost")).toBe(true);
    expect(roleCanViewField("PURCHASE_MANAGER", "margin")).toBe(false);

    expect(roleCanViewField("SALES_MANAGER", "margin")).toBe(true);
    expect(roleCanViewField("SALES_MANAGER", "cost")).toBe(false);

    expect(roleCanViewField("FINANCE_MANAGER", "profit")).toBe(true);
    expect(roleCanViewField("WAREHOUSE_STAFF", "inventoryValue")).toBe(false);
  });
});

/* ============================================================
   The bridge — existing modules keep working
   ============================================================ */

describe("Administration — legacy permission bridge", () => {
  it("keeps the four legacy keys answering for Super Admin", () => {
    asRole("SUPER_ADMIN");
    expect(checkPermission("canViewCost")).toBe(true);
    expect(checkPermission("canViewCredit")).toBe(true);
    expect(checkPermission("canViewBank")).toBe(true);
    expect(checkPermission("canSetBPCode")).toBe(true);
  });

  it("changes what existing modules render when the role changes", () => {
    /* Nothing in schemas/product.tsx or business-partner.tsx was edited —
       the answer moved underneath them. */
    asRole("SALES_REP");
    expect(checkPermission("canViewCost")).toBe(false);
    expect(checkPermission("canViewCredit")).toBe(false);
    expect(checkPermission("canSetBPCode")).toBe(false);

    asRole("FINANCE_MANAGER");
    expect(checkPermission("canViewCredit")).toBe(true);
    expect(checkPermission("canViewBank")).toBe(true);
  });

  it("masks a bank account for a role that cannot see one", () => {
    asRole("SUPER_ADMIN");
    expect(maskAccount("1234567890")).toBe("1234567890");

    asRole("SALES_REP");
    expect(maskAccount("1234567890")).toBe("••••••7890");
  });

  it("denies an unknown permission key rather than granting it", () => {
    asRole("SUPER_ADMIN");
    expect(checkPermission("canDoAnythingTypo")).toBe(false);
  });
});

/* ============================================================
   Layer 3 — data scope
   ============================================================ */

describe("Administration — data scope", () => {
  it("prefers the user override over the role default", () => {
    const rep = USERS.find((u) => u.roleCode === "SALES_REP" && u.status === "Active")!;
    expect(effectiveScope(rep)).toBe("ownCustomers");
    expect(effectiveScope(USERS.find((u) => u.roleCode === "FINANCE_MANAGER")!)).toBe("company");
  });

  it("lets company scope see everything", () => {
    asRole("FINANCE_MANAGER");
    const ctx = scopeContext();
    expect(ctx.scope).toBe("company");
    expect(inScope({ salesRep: "someone else", warehouse: "WH-XYZ" }, ctx)).toBe(true);
  });

  it("limits a sales rep to their own customers", () => {
    const rep = asRole("SALES_REP");
    const rows = [
      { code: "A", salesRep: rep.salesRep },
      { code: "B", salesRep: "SRE099 - คนอื่น" },
    ];
    const seen = applyScope(rows, (r) => ({ salesRep: r.salesRep }));
    expect(seen.map((r) => r.code)).toEqual(["A"]);
  });

  it("limits a warehouse user to their own warehouse", () => {
    const user = asRole("WAREHOUSE_STAFF");
    const rows = [
      { code: "A", warehouse: user.warehouse },
      { code: "B", warehouse: "WH-OTHER" },
    ];
    expect(applyScope(rows, (r) => ({ warehouse: r.warehouse })).map((r) => r.code)).toEqual(["A"]);
  });

  it("limits department scope to the user's department", () => {
    asRole("PURCHASE_STAFF");
    const rows = [
      { code: "A", department: "Purchasing" },
      { code: "B", department: "Sales" },
    ];
    expect(applyScope(rows, (r) => ({ department: r.department })).map((r) => r.code)).toEqual(["A"]);
  });

  it("does not hide records a module has not classified yet", () => {
    /* Adoption has to be incremental: a row carrying none of the scope
       fields stays visible rather than vanishing from an unmigrated list. */
    asRole("SALES_REP");
    const rows = [{ code: "A" }, { code: "B" }];
    expect(applyScope(rows, () => ({})).map((r) => r.code)).toEqual(["A", "B"]);
  });

  it("ranks scopes from narrowest to widest", () => {
    const own = SCOPES.find((s) => s.code === "own")!;
    const company = SCOPES.find((s) => s.code === "company")!;
    expect(own.rank).toBeLessThan(company.rank);
  });
});

/* ============================================================
   Approval workflow
   ============================================================ */

describe("Administration — approval workflow", () => {
  it("finds the active workflow for a module", () => {
    expect(workflowFor("purchase-request")?.code).toBe("WF-PR-001");
    /* A draft workflow does not govern anything. */
    expect(workflowFor("cycle-count")).toBeNull();
    expect(workflowFor("not-a-module")).toBeNull();
  });

  it("scales the number of signatures to the document value", () => {
    const small = approvalPlan("purchase-order", 50_000);
    const medium = approvalPlan("purchase-order", 250_000);
    const large = approvalPlan("purchase-order", 900_000);

    expect(small.map((s) => s.roleCode)).toEqual(["PURCHASE_MANAGER"]);
    expect(medium.map((s) => s.roleCode)).toEqual(["PURCHASE_MANAGER", "FINANCE_MANAGER"]);
    expect(large.map((s) => s.roleCode)).toEqual([
      "PURCHASE_MANAGER",
      "FINANCE_MANAGER",
      "MANAGEMENT",
    ]);
  });

  it("returns steps in sequence and names a real role", () => {
    for (const wf of WORKFLOWS) {
      const plan = approvalPlan(wf.module, Number.MAX_SAFE_INTEGER);
      expect(plan.map((s) => s.seq)).toEqual([...plan.map((s) => s.seq)].sort((a, b) => a - b));
      for (const s of plan) expect(getRole(s.roleCode), s.roleCode).not.toBeNull();
    }
  });

  it("needs no approval below the only threshold", () => {
    /* Stock transfers under 100 units skip approval entirely. */
    expect(needsApproval("stock-transfer", 50)).toBe(false);
    expect(needsApproval("stock-transfer", 150)).toBe(true);
  });

  it("walks to the next unsigned step", () => {
    const first = nextApprovalStep("purchase-order", 900_000, []);
    expect(first!.roleCode).toBe("PURCHASE_MANAGER");

    const second = nextApprovalStep("purchase-order", 900_000, [1]);
    expect(second!.roleCode).toBe("FINANCE_MANAGER");

    expect(nextApprovalStep("purchase-order", 900_000, [1, 2, 3])).toBeNull();
  });

  it("lets only the named role sign a step, and Super Admin always", () => {
    const step = approvalPlan("purchase-request", 10)[0];

    asRole("PURCHASE_MANAGER");
    expect(canApproveStep(step)).toBe(true);

    asRole("SALES_REP");
    expect(canApproveStep(step)).toBe(false);

    asRole("SUPER_ADMIN");
    expect(canApproveStep(step)).toBe(true);
  });

  it("reports a workflow step with no active approver", () => {
    const wf = WORKFLOWS.find((w) => w.code === "WF-PR-001")!;
    expect(workflowGaps(wf)).toEqual([]);

    const orphan = {
      ...wf,
      steps: [{ seq: 1, name: "ตรวจสอบภายนอก", roleCode: "EXTERNAL_AUDITOR", threshold: 0, mode: "Any approver", slaHours: 24 }],
    };
    expect(workflowGaps(orphan)).toHaveLength(1);
  });
});

/* ============================================================
   Number series
   ============================================================ */

describe("Administration — number series", () => {
  it("renders a preview in the era the series declares", () => {
    /* PR/SO stamp a two-digit AD year; INV stamps four. */
    const at2025 = new Date(2025, 5, 15);
    const at = new Date(2026, 5, 15);
    const pr = NUMBER_SERIES.find((s) => s.code === "NS-PR")!;
    expect(previewNumber({ ...pr, next: 125 }, at2025)).toBe("PR2506-0125");

    const inv = NUMBER_SERIES.find((s) => s.code === "NS-INV")!;
    expect(previewNumber({ ...inv, next: 26 }, at)).toBe("INV-2026-000026");

    const bp = NUMBER_SERIES.find((s) => s.code === "NS-BP")!;
    expect(previewNumber({ ...bp, next: 124 }, at)).toBe("BP000124");
  });

  it("regenerates the number each module already issued", () => {
    /* The formatter has to reproduce history, not just look plausible. */
    const at = new Date(2025, 5, 15);
    const pr = NUMBER_SERIES.find((s) => s.code === "NS-PR")!;
    expect(previewNumber({ ...pr, next: 124 }, at)).toBe(pr.lastIssued);
  });

  it("generates the same SHAPE as the number each series already issued", () => {
    /* The invariant that matters: a formatter that produces PR6906-0125 or
       INV2026-000026 would collide with issued documents. Comparing the
       digit-masked template catches an era, width or separator mistake on
       every series at once, without pinning a date per series. */
    const shape = (v: string) => v.replace(/\d/g, "#");

    for (const s of NUMBER_SERIES) {
      if (!s.lastIssued) continue;
      expect(shape(previewNumber(s)), `${s.code} · ${s.lastIssued}`).toBe(shape(s.lastIssued));
    }
  });

  it("previews a run without consuming anything", () => {
    const s = NUMBER_SERIES.find((x) => x.code === "NS-SO")!;
    const before = s.next;
    const run = previewRun(s, 3, new Date(2026, 5, 15));
    expect(run).toHaveLength(3);
    expect(new Set(run).size).toBe(3);
    expect(s.next).toBe(before);
  });

  it("advances the counter when a number is issued", () => {
    const s = NUMBER_SERIES.find((x) => x.code === "NS-CNT")!;
    const before = s.next;
    const issued = issueNumber("cycle-count", new Date(2026, 5, 15));

    expect(issued).toBeTruthy();
    expect(s.next).toBe(before + 1);
    expect(s.lastIssued).toBe(issued);

    /* Put it back so later tests see the seeded state. */
    s.next = before;
  });

  it("returns nothing for a module with no series", () => {
    expect(issueNumber("not-a-module")).toBeNull();
  });

  it("covers every document series the spec names", () => {
    const prefixes = NUMBER_SERIES.map((s) => s.prefix);
    for (const p of ["PR", "PO", "GR", "SO", "INV", "SHP", "RTN", "CN", "TRF", "ADJ"]) {
      expect(prefixes, p).toContain(p);
    }
  });
});

/* ============================================================
   Audit log
   ============================================================ */

describe("Administration — audit log", () => {
  it("records who did what, under the acting user's identity", () => {
    const user = asRole("PURCHASE_MANAGER");
    const before = AUDIT_LOG.length;

    const entry = audit("Approve", "purchase-order", "อนุมัติทดสอบ", "PO-TEST");

    expect(AUDIT_LOG).toHaveLength(before + 1);
    expect(AUDIT_LOG[0]).toBe(entry);
    expect(entry.user).toBe(user.name);
    expect(entry.role).toBe(getRole(user.roleCode)!.name);
    expect(entry.ref).toBe("PO-TEST");
    expect(entry.code).toMatch(/^LOG-\d{6}$/);

    AUDIT_LOG.shift();
  });

  it("tracks every event type the spec lists", () => {
    const events = new Set(AUDIT_LOG.map((l) => l.event));
    for (const e of ["Login", "Logout", "Create", "Update", "Approve", "Reject", "Print", "Import", "Export"]) {
      expect(events, e).toContain(e);
    }
  });

  it("keeps failed sign-ins distinguishable from successful ones", () => {
    const failed = AUDIT_LOG.filter((l) => l.event === "Login Failed");
    expect(failed.length).toBeGreaterThan(0);
    for (const f of failed) expect(f.result).toBe("Failed");
  });
});

/* ============================================================
   Rollups
   ============================================================ */

describe("Administration — workspace rollups", () => {
  it("counts users, roles and grants consistently", () => {
    const s = adminSnapshot();
    expect(s.users).toBe(USERS.length);
    expect(s.activeUsers).toBe(USERS.filter((u) => u.status === "Active").length);
    expect(s.roles).toBe(ROLES.length);
    expect(s.modules).toBe(MODULES.length);
    expect(s.permissionGrants).toBeGreaterThan(0);
    expect(s.activeUsers).toBeLessThanOrEqual(s.users);
  });

  it("surfaces the suspended user and the failed sign-ins", () => {
    const keys = adminIssues().map((i) => i.key);
    expect(keys).toContain("suspended");
    expect(keys).toContain("failedLogin");
  });

  it("points every issue at a page that resolves it", () => {
    for (const i of adminIssues()) {
      const href = pageHref(i.goto);
      expect(href.startsWith("/"), i.goto).toBe(true);
      expect(href.startsWith("/soon"), i.goto).toBe(false);
    }
  });

  it("lists the modules a role reaches and the users carrying it", () => {
    const rows = rolePermissionRows("SALES_REP").filter((r) => r.actions.length);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.module)).toContain("sales-order");
    expect(usersInRole("SALES_REP").length).toBeGreaterThan(0);
  });
});

/* ============================================================
   Screens
   ============================================================ */

describe("Administration — sidebar and routing", () => {
  it("registers the Administration group with the ten screens the spec lists", () => {
    const group = NAV.find((g) => g.label === "Administration")!;
    expect(group).toBeDefined();
    expect(group.items.map((i) => i.label)).toEqual([
      "Administration Workspace",
      "User Management",
      "Role Management",
      "Permission Matrix",
      "Data Scope",
      "Approval Workflow",
      "Number Series",
      "Company Settings",
      "Notification Settings",
      "Audit Log",
    ]);
    /* Built, not placeholders. */
    for (const item of group.items) expect(item.soon, item.label).toBeUndefined();
  });

  it("resolves every Administration destination to a real route", () => {
    for (const item of NAV.find((g) => g.label === "Administration")!.items) {
      expect(pageHref(item.label)).toBe(item.href);
      expect(item.href.startsWith("/soon")).toBe(false);
    }
  });

  it("registers the six list-driven entities", () => {
    for (const key of [
      "admin-user",
      "admin-role",
      "admin-scope",
      "admin-workflow",
      "admin-series",
      "admin-audit",
    ]) {
      expect(getSchemas(key), key).not.toBeNull();
    }
  });

  it("leaves the earlier phases untouched", () => {
    for (const label of ["Finance", "Service", "Reports"]) {
      const group = NAV.find((g) => g.label === label)!;
      expect(group, label).toBeDefined();
      for (const item of group.items) expect(item.soon, item.label).toBe(true);
    }
    /* The Phase 1 routes still resolve exactly as before. */
    expect(pageHref("Business Partner")).toBe("/m/business-partner");
    expect(pageHref("Sales Order")).toBe("/m/sales-order");
    expect(NAV_INDEX.find((n) => n.label === "Dashboard")!.href).toBe("/dashboard");
  });
});

describe("Administration — user and role screens", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderList = (schema: any) =>
    render(
      <>
        <ListView schema={schema} />
        <QuickViewHost />
      </>,
    );

  it("renders User Management with every field the spec lists", () => {
    renderList(adminUserSchemas.list);
    expect(screen.getByRole("heading", { name: "User Management" })).toBeInTheDocument();

    const labels = adminUserSchemas.list.columns.map((c) => c.label);
    for (const l of ["Employee Code", "Full Name", "Email", "Department", "Role", "Data Scope", "Warehouse", "Sales Rep", "Status", "Last Login"]) {
      expect(labels, l).toContain(l);
    }
  });

  it("renders Role Management and marks system roles undeletable", () => {
    renderList(adminRoleSchemas.list);
    expect(screen.getByRole("heading", { name: "Role Management" })).toBeInTheDocument();

    const ctx = {
      goto: () => {}, openEntity: () => {}, toast: () => {}, confirm: () => {},
      formModal: () => {}, refresh: () => {}, quickView: () => {}, panel: () => {},
    };
    const superAdmin = adminRoleSchemas.list.source().find((r) => r.code === "SUPER_ADMIN")!;
    const del = adminRoleSchemas.list.rowActions(superAdmin, ctx).find((a) => a.label === "Delete")!;
    expect(del.disabled).toBe(true);
    expect(del.disabledReason).toContain("ระบบ");
  });

  it("refuses to delete a role that still has users", () => {
    const ctx = {
      goto: () => {}, openEntity: () => {}, toast: () => {}, confirm: () => {},
      formModal: () => {}, refresh: () => {}, quickView: () => {}, panel: () => {},
    };
    const inUse = adminRoleSchemas.list.source().find((r) => !r.system && r.userCount > 0)!;
    const del = adminRoleSchemas.list.rowActions(inUse, ctx).find((a) => a.label === "Delete")!;
    expect(del.disabled).toBe(true);
    expect(del.disabledReason).toContain(String(inUse.userCount));
  });

  it("lets a custom role with no users be deleted", () => {
    const ctx = {
      goto: () => {}, openEntity: () => {}, toast: () => {}, confirm: () => {},
      formModal: () => {}, refresh: () => {}, quickView: () => {}, panel: () => {},
    };
    const free = adminRoleSchemas.list.source().find((r) => !r.system && r.userCount === 0);
    if (!free) return;
    const del = adminRoleSchemas.list.rowActions(free, ctx).find((a) => a.label === "Delete")!;
    expect(del.disabled).toBe(false);
  });

  it("builds every tab of every administration detail page", () => {
    const ctx = {
      goto: () => {}, openEntity: () => {}, toast: () => {}, confirm: () => {},
      formModal: () => {}, refresh: () => {}, quickView: () => {}, panel: () => {},
    };
    const pairs = [
      adminUserSchemas, adminRoleSchemas, adminScopeSchemas,
      adminWorkflowSchemas, adminSeriesSchemas, adminAuditSchemas,
    ];
    for (const s of pairs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = s.list.source()[0] as any;
      expect(rec, s.list.key).toBeDefined();
      for (const tab of s.detail.tabs) {
        if (tab.when && !tab.when(rec)) continue;
        expect(() => tab.blocks(rec, ctx), `${s.list.key} · ${tab.key}`).not.toThrow();
      }
    }
  });

  it("renders the role detail with its module and field permissions", () => {
    const role = adminRoleSchemas.list.source().find((r) => r.code === "SALES_REP")!;
    render(<FullDetail schema={adminRoleSchemas.detail} record={role} />);
    expect(screen.getByRole("heading", { level: 1, name: /Sales Representative/ })).toBeInTheDocument();
  });
});

describe("Administration — workspace page", () => {
  it("renders the cards the spec lists", () => {
    render(<AdministrationWorkspacePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Administration Workspace" })).toBeInTheDocument();

    const grid = screen.getByTestId("admin-kpi-grid");
    for (const title of ["Users", "Active Users", "Roles", "Permissions", "Pending Approval Setup", "Failed Login"]) {
      expect(within(grid).getByText(title), title).toBeInTheDocument();
    }
  });

  it("shows recent activities and configuration alerts", () => {
    render(<AdministrationWorkspacePage />);
    expect(screen.getByRole("heading", { name: "Recent Activities" })).toBeInTheDocument();
    expect(screen.getByTestId("admin-issues")).toBeInTheDocument();
  });

  it("stacks its grids on small screens", () => {
    render(<AdministrationWorkspacePage />);
    expect(screen.getByTestId("admin-kpi-grid").className).toContain("max-md:grid-cols-1");
    expect(screen.getByTestId("admin-summary-band").className).toContain("max-[1280px]:grid-cols-1");
  });
});

describe("Administration — permission matrix page", () => {
  it("renders modules down and roles across", () => {
    render(<PermissionMatrixPage />);
    const table = screen.getByTestId("permission-matrix");

    for (const r of ROLES) {
      expect(within(table).getByText(r.name), r.name).toBeInTheDocument();
    }
    expect(within(table).getByText("Sales Order")).toBeInTheDocument();
  });

  it("switches to the per-action view", async () => {
    const user = userEvent.setup();
    render(<PermissionMatrixPage />);

    await user.click(screen.getByRole("tab", { name: "By Action" }));
    expect(screen.getByLabelText("Action")).toBeInTheDocument();
    expect(within(screen.getByTestId("permission-matrix")).getByText("Sales Order")).toBeInTheDocument();
  });

  it("switches to the field view and reports hidden fields", async () => {
    const user = userEvent.setup();
    render(<PermissionMatrixPage />);

    await user.click(screen.getByRole("tab", { name: "Field Permissions" }));
    const table = screen.getByTestId("permission-matrix");
    expect(within(table).getByText("Cost")).toBeInTheDocument();
    expect(within(table).getAllByText("Hidden").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Visible").length).toBeGreaterThan(0);
  });

  it("narrows to one module group", async () => {
    const user = userEvent.setup();
    render(<PermissionMatrixPage />);

    await user.selectOptions(screen.getByLabelText("Module Group"), "Inventory");
    const table = screen.getByTestId("permission-matrix");
    expect(within(table).getByText("Stock Transfer")).toBeInTheDocument();
    expect(within(table).queryByText("Sales Order")).toBeNull();
  });

  it("keeps the matrix scrollable rather than wrapping", () => {
    render(<PermissionMatrixPage />);
    expect(screen.getByTestId("permission-matrix").className).toContain("overflow-x-auto");
  });

  it("covers every action the spec lists", () => {
    expect([...ACTIONS]).toEqual([
      "view", "create", "edit", "delete", "approve", "export", "import", "print",
    ]);
  });
});

describe("Administration — company and notification settings", () => {
  it("renders the company profile and fiscal defaults", () => {
    render(<CompanySettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Company Settings" })).toBeInTheDocument();
    expect(screen.getAllByText(COMPANY.nameTh).length).toBeGreaterThan(0);
    expect(screen.getByTestId("company-profile")).toBeInTheDocument();
    expect(screen.getByTestId("company-fiscal")).toBeInTheDocument();
    expect(screen.getByTestId("company-series")).toBeInTheDocument();
  });

  it("renders every notification the spec lists", () => {
    render(<NotificationSettingsPage />);
    const table = screen.getByTestId("notification-table");
    for (const label of ["Approval Request", "Low Stock", "Near Expiry", "Failed Login"]) {
      expect(within(table).getByText(label), label).toBeInTheDocument();
    }
  });

  it("toggles an in-app notification and writes an audit entry", async () => {
    const user = userEvent.setup();
    const target = NOTIFICATIONS.find((n) => n.code === "NT-LOWSTOCK")!;
    const before = target.inApp;
    const logBefore = AUDIT_LOG.length;

    render(<NotificationSettingsPage />);
    await user.click(screen.getByLabelText(`In-App ${target.label}`));

    expect(target.inApp).toBe(!before);
    expect(AUDIT_LOG.length).toBe(logBefore + 1);
    expect(AUDIT_LOG[0].module).toBe("admin-notification");

    target.inApp = before;
    AUDIT_LOG.shift();
  });

  it("filters notifications down to one role", async () => {
    const user = userEvent.setup();
    render(<NotificationSettingsPage />);

    await user.selectOptions(screen.getByLabelText("Role"), "Super Admin");
    const table = screen.getByTestId("notification-table");
    expect(within(table).getByText("Failed Login")).toBeInTheDocument();
    /* Low Stock goes to purchasing and warehouse, not the administrator. */
    expect(within(table).queryByText("Low Stock")).toBeNull();
  });
});

/* ============================================================
   The property the whole module exists for
   ============================================================ */

describe("Administration — no module hardcodes a role", () => {
  it("keeps role names out of the business modules", async () => {
    /* A grep is the honest test here: the framework is only worth having
       if nothing outside it needs to know a role by name. */
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const roleNames = ROLES.map((r) => r.code);
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        /* Administration itself is allowed to name roles. */
        if (p.includes("admin") || p.includes("administration")) continue;
        const src = readFileSync(p, "utf8");
        for (const code of roleNames) {
          if (src.includes(`"${code}"`)) offenders.push(`${p} → ${code}`);
        }
      }
    };

    walk("schemas");
    walk("components");
    expect(offenders).toEqual([]);
  });

  it("resolves the same question differently for two users, with no code change", () => {
    const question = () => ({
      cost: checkPermission("canViewCost"),
      purchase: can("purchase-order", "view"),
      approve: can("purchase-order", "approve"),
    });

    asRole("SALES_REP");
    expect(question()).toEqual({ cost: false, purchase: false, approve: false });

    asRole("PURCHASE_MANAGER");
    expect(question()).toEqual({ cost: true, purchase: true, approve: true });

    asRole("SUPER_ADMIN");
    expect(question()).toEqual({ cost: true, purchase: true, approve: true });
  });

  it("restores the default session between tests", () => {
    expect(currentUser().roleCode).toBe("SUPER_ADMIN");
  });
});
