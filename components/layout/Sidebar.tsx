"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { NAV } from "@/lib/nav";
import { useUI } from "@/lib/store";

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const mobileOpen = useUI((s) => s.mobileNavOpen);
  const setMobileNav = useUI((s) => s.setMobileNav);

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
          {NAV.map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label && !collapsed && (
                <div className="whitespace-nowrap px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-label">
                  {group.label}
                </div>
              )}
              {group.label && collapsed && <div className="h-4" />}

              {group.items.map((item) => {
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
          ))}
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
