"use client";

import { useMemo, useState } from "react";
import { ACTIONS, MODULES, MODULE_GROUPS, ROLES, type Action } from "@/data/admin";
import {
  accessLabel,
  audit,
  moduleActions,
  roleActions,
  roleCanViewField,
  getFields,
  getScope,
} from "@/lib/domain/admin";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/types";
import { Badge, Button, Card, Select, Tabs } from "@/components/ui";
import { WsPageHeader, useGoPage } from "@/components/workspace/parts";

/* ============================================================
   PERMISSION MATRIX

   Modules down, roles across — the one screen where the whole
   access model is visible at once. Everything else in
   Administration edits a slice of what this shows.

   Three views because the model has three layers, and flattening
   them into one grid would hide the distinction that matters:
   a module you cannot open, versus a module you can open with a
   number blanked out, versus a module you can open where you see
   only your own records.
   ============================================================ */

const ACCESS_TONE: Record<string, BadgeTone> = {
  "Full Access": "success",
  Partial: "info",
  "Read Only": "neutral",
  "No Access": "danger",
};

const ACTION_LABEL: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  export: "Export",
  import: "Import",
  print: "Print",
};

type View = "summary" | "actions" | "fields";

export default function PermissionMatrixPage() {
  const toast = useUI((s) => s.toast);
  const go = useGoPage();
  const [view, setView] = useState<View>("summary");
  const [group, setGroup] = useState("All");
  const [action, setAction] = useState<Action>("view");

  const roles = ROLES;
  const modules = useMemo(
    () => (group === "All" ? MODULES : MODULES.filter((m) => m.group === group)),
    [group],
  );

  const fields = getFields();

  /* Read-only in this build: writing a grant needs the confirmation and
     audit trail that a real permission change deserves, and inventing one
     against mock data would teach the wrong habit. */
  const notEditable = () =>
    toast(
      "แก้ไขสิทธิ์",
      "การแก้สิทธิ์จากตารางนี้ต้องมีการยืนยันและบันทึก Audit — Future support",
      "info",
    );

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      <WsPageHeader
        title="Permission Matrix"
        subtitle="สิทธิ์ทุกโมดูลของทุกบทบาทในตารางเดียว — โมดูล × บทบาท"
        extraActions={[
          { label: "Role Management", icon: "shield", run: () => go("Role Management") },
          { label: "User Management", icon: "users", run: () => go("User Management") },
          { label: "Data Scope", icon: "lock", run: () => go("Data Scope") },
        ]}
      />

      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[200px] flex-1">
          <Tabs
            items={[
              { key: "summary", label: "Module Access" },
              { key: "actions", label: "By Action" },
              { key: "fields", label: "Field Permissions" },
            ]}
            active={view}
            onChange={(k) => setView(k as View)}
          />
        </div>

        {view !== "fields" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-cap font-medium text-ink-2">Module Group</span>
            <Select
              aria-label="Module Group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="w-[200px]"
            >
              <option value="All">All groups</option>
              {MODULE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </label>
        )}

        {view === "actions" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-cap font-medium text-ink-2">Action</span>
            <Select
              aria-label="Action"
              value={action}
              onChange={(e) => setAction(e.target.value as Action)}
              className="w-[160px]"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </Select>
          </label>
        )}

        <Button
          onClick={() => {
            audit("Export", "admin-permission", "ส่งออกตารางสิทธิ์");
            toast("ส่งออกตารางสิทธิ์", `${modules.length} โมดูล × ${roles.length} บทบาท`, "info");
          }}
        >
          <Icon name="upload" size={17} strokeWidth={2} />
          Export Matrix
        </Button>
      </Card>

      {/* ---------- The grid ---------- */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto" data-testid="permission-matrix">
          <table className="w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[220px] border-b border-line bg-surface px-4 py-3 text-left text-cap font-semibold tracking-[0.02em] text-ink-2">
                  {view === "fields" ? "Sensitive Field" : "Module"}
                </th>
                {roles.map((r) => (
                  <th
                    key={r.code}
                    className="whitespace-nowrap border-b border-line bg-surface px-3 py-3 text-center text-cap font-semibold tracking-[0.02em] text-ink-2"
                  >
                    <span className="flex flex-col items-center gap-0.5">
                      <span>{r.name}</span>
                      <span className="text-[10px] font-normal text-ink-3">
                        {getScope(r.scope)?.label ?? r.scope}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {view === "fields"
                ? fields.map((f) => (
                    <tr key={f.key} className="transition-colors duration-fast hover:bg-surface">
                      <td className="sticky left-0 z-10 border-b border-line bg-card px-4 py-3">
                        <span className="flex flex-col">
                          <span className="font-medium">{f.label}</span>
                          <span className="text-cap text-ink-3">{f.desc}</span>
                        </span>
                      </td>
                      {roles.map((r) => {
                        const on = roleCanViewField(r.code, f.key);
                        return (
                          <td key={r.code} className="border-b border-line px-3 py-3 text-center">
                            {on ? (
                              <span className="inline-flex items-center gap-1 text-cap font-medium text-success-text">
                                <Icon name="eye" size={14} />
                                Visible
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-cap text-ink-3">
                                <Icon name="circleSlash" size={14} />
                                Hidden
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                : modules.map((m) => (
                    <tr key={m.key} className="transition-colors duration-fast hover:bg-surface">
                      <td className="sticky left-0 z-10 border-b border-line bg-card px-4 py-3">
                        <span className="flex flex-col">
                          <span className="font-medium">{m.label}</span>
                          <span className="text-cap text-ink-3">{m.group}</span>
                        </span>
                      </td>

                      {roles.map((r) => {
                        const acts = roleActions(r.code, m.key);

                        if (view === "actions") {
                          const offered = moduleActions(m.key).includes(action);
                          const granted = acts.includes(action);
                          return (
                            <td
                              key={r.code}
                              className="border-b border-line px-3 py-3 text-center"
                            >
                              {!offered ? (
                                <span className="text-ink-3" title="โมดูลนี้ไม่มีการกระทำนี้">
                                  —
                                </span>
                              ) : granted ? (
                                <Icon
                                  name="checkCircle"
                                  size={17}
                                  className="mx-auto text-success"
                                />
                              ) : (
                                <Icon name="close" size={15} className="mx-auto text-ink-3" />
                              )}
                            </td>
                          );
                        }

                        const label = accessLabel(r.code, m.key);
                        return (
                          <td key={r.code} className="border-b border-line px-3 py-3 text-center">
                            <button
                              onClick={notEditable}
                              aria-label={`${m.label} · ${r.name}: ${label}`}
                              className={cn(
                                "rounded-pill px-2.5 py-1 text-[11px] font-semibold transition-opacity duration-fast hover:opacity-80",
                                label === "Full Access" && "bg-success-soft text-success-text",
                                label === "Partial" && "bg-info-soft text-info-text",
                                label === "Read Only" && "bg-neutral-soft text-neutral-text",
                                label === "No Access" && "bg-danger-soft text-danger-text",
                              )}
                            >
                              {label === "No Access" ? "—" : label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------- Legend ---------- */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <span className="text-cap font-semibold text-ink-2">Legend</span>
        {(["Full Access", "Partial", "Read Only", "No Access"] as const).map((l) => (
          <span key={l} className="inline-flex items-center gap-2">
            <Badge tone={ACCESS_TONE[l]}>{l}</Badge>
            <span className="text-cap text-ink-2">
              {l === "Full Access"
                ? "ทุกการกระทำที่โมดูลรองรับ"
                : l === "Partial"
                  ? "สร้างหรือแก้ไขได้บางส่วน"
                  : l === "Read Only"
                    ? "ดู ส่งออก พิมพ์ เท่านั้น"
                    : "เปิดโมดูลไม่ได้เลย"}
            </span>
          </span>
        ))}
      </Card>

      <Card className="px-5 py-3 text-cap text-ink-2">
        ฟิลด์ที่ขึ้นว่า Hidden จะไม่ถูก render ออกมาเลย ไม่ใช่แค่ปิดการแก้ไข —
        ผู้ใช้ที่ไม่มีสิทธิ์จะไม่เห็นแม้แต่ตำแหน่งที่ตัวเลขเคยอยู่
      </Card>
    </main>
  );
}
