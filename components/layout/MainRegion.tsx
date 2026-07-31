"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useUI } from "@/lib/store";

/**
 * The main column offsets by the sidebar width. Split out as a client
 * component so the shell layout itself can stay a server component.
 */
export function MainRegion({ children }: { children: ReactNode }) {
  const collapsed = useUI((s) => s.sidebarCollapsed);

  return (
    <div
      className={cn(
        "min-w-0 flex-1 transition-[margin-left] duration-base ease-out max-lg:ml-0",
        collapsed ? "ml-sidebar-collapsed" : "ml-sidebar",
      )}
    >
      {children}
    </div>
  );
}
