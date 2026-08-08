"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/lib/icons";
import { findNav } from "@/lib/nav";
import { useUI } from "@/lib/store";
import {
  currentUser,
  demoAccounts,
  getRole,
  restoreAccount,
  switchAccount,
} from "@/lib/domain/admin";
import { markAllRead, markRead, myNotifications, unreadCount } from "@/lib/domain/notify";
import type { NotifyKind } from "@/data/notifications";
import { DotBadge, IconButton, Menu, MenuItem, MenuSep } from "@/components/ui";

/** What each kind looks like at a glance — an approval reads differently
 *  from a refusal, and the icon is the first thing seen. */
const NOTIFY_ICON: Record<NotifyKind, IconName> = {
  approval_request: "clock",
  escalated: "alert",
  approved: "checkCircle",
  rejected: "xCircle",
  revision_requested: "edit",
  converted: "salesOrder",
};

/** พ ส → PS, สุภาวิตา โยธะพันธ์ → สย. Two letters, whatever the script. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");

export function Topbar() {
  const pathname = usePathname();
  const setMobileNav = useUI((s) => s.setMobileNav);
  const toast = useUI((s) => s.toast);
  const crumbCode = useUI((s) => s.crumbCode);
  const refresh = useUI((s) => s.refresh);
  /* Subscribing to the revision is what repaints the identity after a switch. */
  useUI((s) => s.revision);
  const searchRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const nav = findNav(pathname);
  const me = currentUser();
  const myRole = getRole(me.roleCode);
  const accounts = demoAccounts();
  /* Read on every paint, and the paint is driven by the store revision — the
     same counter a workflow bumps when it sends one. */
  const inbox = myNotifications();
  const unread = unreadCount();

  /* The remembered account is applied after mount, never during render: the
     server has no localStorage, and disagreeing with it here would be a
     hydration mismatch. */
  useEffect(() => {
    restoreAccount();
    refresh();
  }, [refresh]);

  /* Ctrl/Cmd+K focuses global search from anywhere in the app. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-topbar items-center gap-4 border-b border-line bg-card px-6 max-md:px-4">
      <IconButton
        onClick={() => setMobileNav(true)}
        aria-label="Toggle menu"
        className="lg:hidden"
      >
        <Icon name="menu" size={19} />
      </IconButton>

      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-2 overflow-hidden text-body max-lg:text-cap"
      >
        {nav?.group && (
          <>
            <span className="truncate text-ink-2">{nav.group}</span>
            <Icon name="chevronRight" size={15} className="flex-shrink-0 text-ink-3" />
          </>
        )}
        <span className="truncate font-medium">{nav?.label ?? "Dashboard"}</span>
        {crumbCode && (
          <>
            <Icon name="chevronRight" size={15} className="flex-shrink-0 text-ink-3" />
            <span className="truncate font-medium tnum">{crumbCode}</span>
          </>
        )}
      </nav>

      <div className="relative mx-auto flex max-w-[420px] flex-1 items-center max-md:hidden">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 text-ink-3"
        />
        <input
          ref={searchRef}
          type="search"
          placeholder="ค้นหารหัสสินค้า ชื่อ หรือบาร์โค้ด..."
          className="h-[38px] w-full rounded-input border border-line bg-surface pl-9 pr-[62px] text-body
                     transition-[border-color,box-shadow,background] duration-fast placeholder:text-ink-3
                     focus:border-primary focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/[.12]"
        />
        <span className="pointer-events-none absolute right-2 rounded-sm border border-line bg-card px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
          Ctrl + K
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/*
          วันที่บนหน้าจอเป็น ค.ศ. และคนไทยจะไม่คิดแบบนั้นเองถ้าไม่บอก

          อ่าน 08/08/2026 แล้วสมมติว่าเป็น พ.ศ. คือปฏิกิริยาปกติ ซึ่งนำไปสู่
          "เอกสารนี้ลงวันที่อีกห้าร้อยปีข้างหน้า" หรือ "ระบบเพี้ยน" อย่างใด
          อย่างหนึ่ง ป้ายนี้ตอบก่อนที่คำถามจะเกิด

          ที่เดียวพอ — อยู่บนแถบบนซึ่งติดอยู่ทุกหน้า จึงครอบคลุมทั้งหน้ารายการ
          หน้ารายละเอียด และฟอร์ม โดยไม่ต้องไปแตะจุดแสดงผลทีละจุด
          เหตุผลเต็มอยู่ที่ docs/DATE-ERA.md
        */}
        <span
          title="วันที่บนหน้าจอทั้งหมดเป็นคริสต์ศักราช · เอกสารที่พิมพ์ออกไปเป็นพุทธศักราช"
          className="cursor-help rounded-sm border border-line px-2 py-1 text-[11px] font-medium
                     leading-none text-ink-3 max-md:hidden"
        >
          วันที่ · ค.ศ.
        </span>
        <Menu
          align="right"
          className="w-[340px] max-md:w-[280px]"
          trigger={({ toggle }) => (
            <IconButton aria-label="Notifications" onClick={toggle}>
              <Icon name="bell" size={19} />
              {unread > 0 && <DotBadge>{unread}</DotBadge>}
            </IconButton>
          )}
        >
          {(close) => (
            <>
              <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  การแจ้งเตือน
                </p>
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      markAllRead();
                      refresh();
                    }}
                    className="ml-auto text-[11px] font-medium text-info hover:underline"
                  >
                    อ่านทั้งหมด
                  </button>
                )}
              </div>

              {inbox.length === 0 ? (
                <p className="px-3 py-4 text-center text-[13px] text-ink-3">
                  ยังไม่มีการแจ้งเตือน
                </p>
              ) : (
                inbox.slice(0, 8).map((n) => (
                  <MenuItem
                    key={n.id}
                    icon={NOTIFY_ICON[n.kind] ?? "bell"}
                    onClick={() => {
                      close();
                      markRead(n.id);
                      refresh();
                      router.push(n.href);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className={n.readAt ? "truncate" : "truncate font-semibold"}>
                        {n.title}
                      </span>
                      <span className="truncate text-cap text-ink-2">{n.body}</span>
                      <span className="text-cap text-ink-3">
                        {n.createdBy} · {n.createdAt}
                      </span>
                    </span>
                  </MenuItem>
                ))
              )}
            </>
          )}
        </Menu>

        <Menu
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="flex items-center gap-3 rounded-btn py-1 pl-1 pr-2 transition-colors duration-fast hover:bg-neutral-soft"
            >
              <span
                className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-pill bg-gradient-to-br from-[#F97316] to-[#FB923C] text-[13px] font-semibold text-white"
                data-testid="session-initials"
              >
                {initials(me.name)}
              </span>
              <span className="text-left leading-tight max-md:hidden">
                <span className="block text-[13px] font-semibold" data-testid="session-name">
                  {me.name}
                </span>
                <span className="block text-cap text-ink-2" data-testid="session-role">
                  {myRole?.name ?? me.roleCode}
                </span>
              </span>
              <Icon name="chevronDown" size={15} className="text-ink-2" strokeWidth={2} />
            </button>
          )}
        >
          {(close) => (
            <>
              {/* ============================================================
                  DEMO TOOL — DELETE WHEN REAL AUTHENTICATION LANDS

                  Four chairs one order passes through, switchable from a
                  menu, because that is the only way to show a three-person
                  approval flow to one person sitting at one screen.

                  It is not impersonation and must never become it: there is
                  no check on who may switch, because in a demo there is only
                  ever one person. The day a login exists, this block and
                  DEMO_ACCOUNTS both go — an account is what you signed in
                  as, not something you pick.

                  Switching writes the session and bumps the store revision;
                  the sidebar, every list and the dashboard all subscribe to
                  it, so the whole page re-answers `can()` on the next paint.
                  ============================================================ */}
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                สลับบัญชี
              </p>
              {accounts.map((a) => {
                const active = a.code === me.code;
                const role = getRole(a.user.roleCode)?.name ?? a.user.roleCode;
                return (
                  <MenuItem
                    key={a.code}
                    icon={active ? "checkCircle" : "user"}
                    onClick={() => {
                      close();
                      if (active) return;
                      switchAccount(a.code);
                      refresh();
                      toast(`สลับเป็น ${a.user.name}`, `${role} — ${a.purpose}`, "info");
                    }}
                  >
                    <span className="flex flex-col">
                      <span className={active ? "font-semibold" : undefined}>{a.user.name}</span>
                      <span className="text-cap text-ink-2">{role}</span>
                    </span>
                  </MenuItem>
                );
              })}
              <MenuSep />
              <MenuItem
                icon="user"
                onClick={() => {
                  close();
                  toast("My profile", "หน้าโปรไฟล์ — Future support", "info");
                }}
              >
                My profile
              </MenuItem>
              <MenuItem
                icon="settings"
                onClick={() => {
                  close();
                  toast("Preferences", "ตั้งค่าผู้ใช้ — Future support", "info");
                }}
              >
                Preferences
              </MenuItem>
              <MenuSep />
              <MenuItem
                icon="external"
                danger
                onClick={() => {
                  close();
                  toast("Sign out", "ออกจากระบบ — Future support", "info");
                }}
              >
                Sign out
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}

/** Small helper so pages can publish the trailing breadcrumb segment. */
export function useCrumbCode(code: string | null) {
  const setCrumbCode = useUI((s) => s.setCrumbCode);
  useEffect(() => {
    setCrumbCode(code);
    return () => setCrumbCode(null);
  }, [code, setCrumbCode]);
}
