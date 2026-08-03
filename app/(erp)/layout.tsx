import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MainRegion } from "@/components/layout/MainRegion";
import { ConfirmModalHost, FormModalHost, ToastHost } from "@/components/ui";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import { PanelHost } from "@/components/engine/PanelHost";

/**
 * App shell. The sidebar is fixed, the main region offsets by its width, and
 * the overlay hosts (toast, confirm, form modal, quick view) mount once here
 * so any schema callback can raise them without prop-drilling.
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
      <QuickViewHost />
      <PanelHost />
    </div>
  );
}
