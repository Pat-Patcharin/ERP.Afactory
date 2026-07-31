"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";

const CONTROL =
  "w-full rounded-input border border-line bg-card px-3 text-body text-ink " +
  "transition-[border-color,box-shadow] duration-fast placeholder:text-ink-3 " +
  "focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/[.12] " +
  "read-only:bg-surface read-only:text-ink-2 disabled:bg-surface disabled:text-ink-3";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(CONTROL, "h-10", className)} {...rest} />
  ),
);
Input.displayName = "Input";

/** 34px variant used inside editable grids where rows must stay compact. */
export const CellInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(CONTROL, "h-[34px] px-2 text-[13px]", className)}
    {...rest}
  />
));
CellInput.displayName = "CellInput";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...rest }, ref) => (
  <select
    ref={ref}
    className={cn(CONTROL, "select-chevron h-10 cursor-pointer pr-[34px]", className)}
    {...rest}
  />
));
Select.displayName = "Select";

export const CellSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...rest }, ref) => (
  <select
    ref={ref}
    className={cn(
      CONTROL,
      "select-chevron h-[34px] cursor-pointer px-2 pr-7 text-[13px]",
      "[background-position:right_8px_center]",
      className,
    )}
    {...rest}
  />
));
CellSelect.displayName = "CellSelect";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...rest }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(CONTROL, "resize-y py-3 leading-normal", className)}
    {...rest}
  />
));
Textarea.displayName = "Textarea";

/** Input with a leading magnifier — list toolbar and lookup pickers. */
export function SearchInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative flex items-center">
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3 text-ink-3"
      />
      <input
        type="search"
        className={cn(CONTROL, "h-10 pl-9", className)}
        {...rest}
      />
    </div>
  );
}

/** forwardRef so the list header can drive the indeterminate DOM property. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input ref={ref} type="checkbox" className={cn("check", className)} {...rest} />
));
Checkbox.displayName = "Checkbox";

export function Radio({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="radio" className={cn("radio", className)} {...rest} />;
}

/** Reads as Yes / No rather than an unlabelled toggle. */
export function Switch({
  checked,
  onChange,
  label,
  onText = "Yes",
  offText = "No",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  onText?: string;
  offText?: string;
}) {
  return (
    <div className="flex h-10 items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[23px] w-10 flex-shrink-0 rounded-pill transition-colors duration-fast",
          checked ? "bg-primary" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute left-[2.5px] top-[2.5px] h-[18px] w-[18px] rounded-full bg-white shadow-sm",
            "transition-transform duration-fast ease-out",
            checked && "translate-x-[17px]",
          )}
        />
      </button>
      <span className="text-[13px] text-ink-2">{checked ? onText : offText}</span>
    </div>
  );
}

/** Label + control + hint wrapper used by every form field. */
export function FieldShell({
  label,
  required,
  hint,
  span,
  valid,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  span?: boolean;
  /** Draws the green tick that marks a satisfied required field. */
  valid?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-1.5",
        span && "col-span-full",
        valid && "field-valid",
      )}
    >
      <label className="text-cap font-medium text-ink-2">
        {label}
        {required && <span className="font-semibold text-danger"> *</span>}
      </label>
      {children}
      {hint && <span className="text-cap text-ink-3">{hint}</span>}
    </div>
  );
}
