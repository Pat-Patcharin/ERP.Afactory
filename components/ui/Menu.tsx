"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import type { RowAction } from "@/lib/types";

/**
 * Dropdown anchored to its trigger. Closes on outside click and on Escape so
 * a stray menu never blocks the row underneath it.
 */
export function Menu({
  trigger,
  children,
  align = "right",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 min-w-[190px] rounded-btn border border-line bg-card p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  danger,
  disabled,
  title,
  onClick,
  children,
}: {
  icon?: Parameters<typeof Icon>[0]["name"];
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-[13px]",
        "transition-colors duration-fast hover:bg-neutral-soft",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        danger && "text-danger",
      )}
    >
      {icon && (
        <Icon
          name={icon}
          size={16}
          className={danger ? "text-danger" : "text-ink-2"}
        />
      )}
      {children}
    </button>
  );
}

export function MenuSep() {
  return <div className="my-1 h-px bg-line" />;
}

/** Renders a schema's RowAction list, including separators and disabled reasons. */
export function ActionMenuItems<T>({
  actions,
  record,
  close,
}: {
  actions: RowAction<T>[];
  record: T;
  close: () => void;
}) {
  return (
    <>
      {actions.map((a, i) =>
        a.sep ? (
          <MenuSep key={`sep-${i}`} />
        ) : (
          <MenuItem
            key={a.label ?? i}
            icon={a.icon}
            danger={a.danger}
            disabled={a.disabled}
            title={a.disabled ? a.disabledReason : undefined}
            onClick={() => {
              close();
              a.run?.(record);
            }}
          >
            {a.label}
          </MenuItem>
        ),
      )}
    </>
  );
}
