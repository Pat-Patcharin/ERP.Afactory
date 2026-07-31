"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { IconButton } from "./Button";

/**
 * Right-hand slide-over. Full screen on mobile — a 400px panel on a phone
 * would leave the record unreadable.
 */
export function Drawer({
  open,
  onClose,
  children,
  width = "default",
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: "default" | "detail";
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-drawer bg-[rgba(17,24,39,.32)] transition-opacity duration-base",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "fixed bottom-0 right-0 top-0 z-[61] flex max-w-[92vw] flex-col bg-card shadow-drawer",
          "transition-transform duration-slow ease-out max-md:w-full max-md:max-w-full",
          width === "detail" ? "w-[460px]" : "w-drawer",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {children}
      </aside>
    </>
  );
}

export function DrawerHead({
  title,
  onClose,
  children,
}: {
  title?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-shrink-0 items-center gap-3 border-b border-line p-5">
      {title && <h2 className="min-w-0 flex-1 text-h3 font-semibold">{title}</h2>}
      {children}
      <IconButton onClick={onClose} aria-label="Close">
        <Icon name="close" size={19} />
      </IconButton>
    </header>
  );
}

export function DrawerBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto p-5">{children}</div>;
}

export function DrawerFoot({ children }: { children: ReactNode }) {
  return (
    <footer className="flex flex-shrink-0 gap-2 border-t border-line px-5 py-4 max-md:flex-wrap">
      {children}
    </footer>
  );
}
