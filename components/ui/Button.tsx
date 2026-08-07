"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "doc";
type Size = "md" | "sm";

/**
 * `primary` is the APPLICATION's action and is always the brand orange.
 * `doc` is the DOCUMENT's action and follows `data-doc-family`, so the same
 * button reads orange on a quotation and teal on a purchase request without
 * either page knowing a colour.
 *
 * They are separate entries rather than one that switches, because most
 * primary buttons in this app are not on a document at all — Save on a master
 * record, Confirm in a dialog — and those must not change with whatever paper
 * happens to be open behind them.
 */
const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-xs hover:bg-primary-hover active:bg-primary-active",
  doc: "bg-doc-accent text-white shadow-xs hover:bg-doc-accent-hover active:bg-doc-accent-active",
  secondary:
    "bg-card text-ink border-line hover:bg-surface hover:border-line-strong",
  ghost: "bg-transparent text-ink-2 hover:bg-neutral-soft hover:text-ink",
  danger: "bg-danger text-white hover:bg-[#dc2626]",
};

const SIZE: Record<Size, string> = {
  md: "h-10 px-4 text-body",
  sm: "h-[34px] px-3 text-[13px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Square icon-only button — drops the horizontal padding. */
  iconOnly?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      iconOnly,
      block,
      className,
      type = "button",
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn border border-transparent font-medium",
        "transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        iconOnly && (size === "sm" ? "w-[34px] px-0" : "w-10 px-0"),
        block && "w-full",
        className,
      )}
      {...rest}
    />
  ),
);
Button.displayName = "Button";

/** 36px borderless square used in the topbar, table rows and drawer headers. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "md", type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "relative grid place-items-center rounded-btn text-ink-2",
        "transition-colors duration-fast hover:bg-neutral-soft hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-[30px] w-[30px]" : "h-9 w-9 max-md:h-10 max-md:w-10",
        className,
      )}
      {...rest}
    />
  ),
);
IconButton.displayName = "IconButton";

/** Inline text link inside a table cell or alert. */
export function LinkButton({
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "text-left font-medium text-info hover:underline",
        className,
      )}
      {...rest}
    />
  );
}
