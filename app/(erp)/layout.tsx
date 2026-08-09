import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MainRegion } from "@/components/layout/MainRegion";
import { ConfirmModalHost, FormModalHost, ToastHost } from "@/components/ui";
import { PanelHost } from "@/components/engine/PanelHost";

/**
 * App shell. The sidebar is fixed, the main region offsets by its width, and
 * the overlay hosts (toast, confirm, form modal) mount once here so any schema
 * callback can raise them without prop-drilling.
 *
 * `QuickViewHost` was one of them. Clicking a row opens the record itself now,
 * so nothing raises a quick view and the host would render nothing for ever.
 * The component and its store slice are still in the tree, unmounted — see
 * the backlog: removing them touches nine test harnesses and is its own tidy.
 */
export default function ErpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MainRegion>
        <Topbar />
        {children}
      </MainRegion>

      <ToastHost />
      <ConfirmModalHost />
      <FormModalHost />
      <PanelHost />
    </div>
  );
}
