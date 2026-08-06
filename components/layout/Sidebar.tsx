"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { NAV, readCollapsedGroups, type NavItem } from "@/lib/nav";
import { useUI } from "@/lib/store";
import { MODULES, canAny } from "@/lib/domain/admin";

/**
 * Nav entry → the module that governs it, matched on the route both already
 * carry. A destination with no module behind it — the placeholder pages —
 * is nobody's to forbid, so it stays.
 */
const MODULE_BY_HREF = new Map(
  MODULES.filter((m) => m.href).map((m) => [m.href as string, m.key]),
);

const mayOpen = (item: NavItem) => {
  const key = MODULE_BY_HREF.get(item.href.split("?")[0]);
  return !key || canAny(key);
};

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const mobileOpen = useUI((s) => s.mobileNavOpen);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const navCollapsed = useUI((s) => s.navCollapsed);
  const toggleGroup = useUI((s) => s.toggleNavGroup);
  const hydrateNavGroups = useUI((s) => s.hydrateNavGroups);
  /* Repaint when the acting account changes — the menu is different for a
     sales rep than for an administrator. */
  useUI((s) => s.revision);

  /* After mount, not during render: the server has no localStorage, so
     reading it any earlier would paint a different tree than it sent. */
  useEffect(() => {
    hydrateNavGroups(readCollapsedGroups());
  }, [hydrateNavGroups]);

  const isActive = (href: string) => {
    const base = href.split("?")[0];
    if (base === "/dashboard") return pathname === "/dashboard";
    return pathname === base || pathname.startsWith(base + "/");
  };

  return (
    <>
      {/* Backdrop so it reads as an overlay on mobile, and tapping dismisses */}
      <div
        onClick={() => setMobileNav(false)}
        className={cn(
          "fixed inset-0 z-[65] bg-[rgba(17,24,39,.32)] transition-opacity duration-base lg:hidden",
          mobileOpen ? "visible opacity-100" : "invisible opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar",
          "transition-[width,transform] duration-base ease-out",
          collapsed ? "w-sidebar-collapsed" : "w-sidebar",
          "max-lg:z-[70] max-lg:w-sidebar",
          mobileOpen ? "max-lg:translate-x-0 max-lg:shadow-lg" : "max-lg:-translate-x-full",
        )}
      >
        <div className="flex h-topbar flex-shrink-0 items-center gap-3 px-5">
          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[9px] bg-primary text-base font-bold text-white">
            A
          </div>
          {!collapsed && (
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-white">
              A-Factory ERP
            </span>
          )}
        </div>

        <nav className="scrollbar-sidebar flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {NAV.map((group) => ({ ...group, items: group.items.filter(mayOpen) }))
            .filter((group) => group.items.length > 0)
            .map((group, gi) => {
              /* Folding is a labelled-section affair, and only while the
                 sidebar shows words: in the icon rail there is no heading to
                 fold into, so hiding the items would hide the whole menu. */
              const foldable = Boolean(group.label) && !collapsed;
              const folded = foldable && navCollapsed.includes(group.label!);
              const hasActive = group.items.some((it) => isActive(it.href));

              return (
                <div key={group.label ?? gi}>
                  {group.label && !collapsed && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label!)}
                      aria-expanded={!folded}
                      title={folded ? `เปิด ${group.label}` : `หุบ ${group.label}`}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-btn px-3 pb-2 pt-5",
                        "whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em]",
                        "text-sidebar-label transition-colors duration-fast hover:text-[#e5e7eb]",
                      )}
                    >
                      <Icon
                        name="chevronDown"
                        size={13}
                        className={cn(
                          "flex-shrink-0 transition-transform duration-fast",
                          folded && "-rotate-90",
                        )}
                      />
                      <span>{group.label}</span>
                      {/* Where you are, when the section it lives in is shut.
                          Without it a folded sidebar loses the one thing it
                          was showing you — which page is open. */}
                      {folded && hasActive && (
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  )}
                  {group.label && collapsed && <div className="h-4" />}

                  {!folded &&
                    group.items.map((item) => {
                      const on = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileNav(false)}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-btn px-3 py-[9px] font-medium",
                            "whitespace-nowrap transition-colors duration-fast",
                            collapsed && "justify-center px-[9px]",
                            on
                              ? "bg-primary text-white shadow-sm"
                              : "text-sidebar-text hover:bg-sidebar-hover hover:text-[#e5e7eb]",
                          )}
                        >
                          <Icon name={item.icon} size={18} />
                          {!collapsed && <span>{item.label}</span>}
                        </Link>
                      );
                    })}
                </div>
              );
            })}
        </nav>

        <div className="border-t border-[#1f2937] p-3">
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex w-full items-center gap-3 rounded-btn px-3 py-[9px] font-medium",
              "text-sidebar-text transition-colors duration-fast hover:bg-sidebar-hover hover:text-[#e5e7eb]",
              collapsed && "justify-center px-[9px]",
            )}
          >
            <Icon
              name="collapse"
              size={18}
              className={cn("transition-transform duration-base", collapsed && "rotate-180")}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
