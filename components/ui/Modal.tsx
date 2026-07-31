"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { Button, IconButton } from "./Button";
import { useUI } from "@/lib/store";

export function Modal({
  open,
  onClose,
  children,
  width = "default",
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: "default" | "wide";
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-modal grid place-items-center bg-[rgba(17,24,39,.32)] p-6 max-md:p-4"
    >
      <div
        className={cn(
          "w-full rounded-card bg-card shadow-lg",
          width === "wide" ? "max-w-[720px]" : "max-w-[480px]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   Global modal hosts — mounted once in the shell, driven by the
   store so any schema callback can raise a dialog without props.
   ============================================================ */

export function ConfirmModalHost() {
  const opts = useUI((s) => s.confirmOpts);
  const close = useUI((s) => s.closeConfirm);
  if (!opts) return null;

  const danger = opts.tone !== "primary";

  return (
    <Modal open onClose={close} label={opts.title}>
      <div className="flex items-start gap-3 px-5 pb-3 pt-5">
        <div
          className={cn(
            "grid h-10 w-10 flex-shrink-0 place-items-center rounded-btn",
            danger ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
          )}
        >
          <Icon name="alert" size={20} strokeWidth={2} />
        </div>
        <h2 className="pt-1.5 text-h3 font-semibold">{opts.title}</h2>
      </div>
      <div className="px-5 pb-5 text-ink-2">{opts.message}</div>
      <div className="flex justify-end gap-3 border-t border-line px-5 py-4">
        <Button onClick={close}>{opts.cancelText ?? "Cancel"}</Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={() => {
            close();
            opts.onConfirm();
          }}
        >
          {opts.confirmText ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Schema-driven dialog reused by lot/serial entry, PO pickers and bin
 * selection. `onConfirm` returning false keeps it open so validation can
 * report a problem in place.
 */
export function FormModalHost() {
  const opts = useUI((s) => s.formModalOpts);
  const close = useUI((s) => s.closeFormModal);
  if (!opts) return null;

  return (
    <Modal open onClose={close} width={opts.width ?? "wide"} label={opts.title}>
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="text-h3 font-semibold">{opts.title}</h2>
        <IconButton onClick={close} aria-label="Close">
          <Icon name="close" size={19} />
        </IconButton>
      </div>
      <div className="max-h-[62vh] overflow-y-auto px-5 pb-5">
        {opts.body({ close })}
      </div>
      <div className="flex justify-end gap-3 border-t border-line px-5 py-4">
        {opts.cancelText !== "" && (
          <Button onClick={close}>{opts.cancelText ?? "Cancel"}</Button>
        )}
        <Button
          variant="primary"
          onClick={() => {
            if (opts.onConfirm?.() === false) return;
            close();
          }}
        >
          {opts.confirmText ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}
