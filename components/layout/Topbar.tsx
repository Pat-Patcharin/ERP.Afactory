"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { findNav } from "@/lib/nav";
import { useUI } from "@/lib/store";
import {
  currentUser,
  demoAccounts,
  getRole,
  restoreAccount,
  switchAccount,
} from "@/lib/domain/admin";
import { DotBadge, IconButton, Menu, MenuItem, MenuSep } from "@/components/ui";

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

  const nav = findNav(pathname);
  const me = currentUser();
  const myRole = getRole(me.roleCode);
  const accounts = demoAccounts();

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
        <IconButton
          aria-label="Notifications"
          onClick={() => toast("การแจ้งเตือน", "ศูนย์แจ้งเตือน — Future support", "info")}
        >
          <Icon name="bell" size={19} />
          <DotBadge>8</DotBadge>
        </IconButton>

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
              {/* Switching account is the whole point of having two, so it
                  sits above the profile links rather than under them. */}
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
