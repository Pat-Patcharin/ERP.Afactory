import type { ReactNode } from "react";
import "../print.css";
import { ToastHost, ConfirmModalHost } from "@/components/ui";

/**
 * Print shell — deliberately outside the (erp) group.
 *
 * No sidebar, no topbar, no breadcrumb. The spec requires that the printed
 * sheet carry no application chrome, and the surest way to guarantee that is
 * for the chrome never to be mounted, rather than to hide it in a stylesheet
 * and hope no browser ignores the rule.
 *
 * Toast and Confirm still mount: pre-print validation reports through the ERP
 * modal, and both are marked no-print.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastHost />
      <ConfirmModalHost />
    </>
  );
}
