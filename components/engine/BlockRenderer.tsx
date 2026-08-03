"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { esc } from "@/lib/format";
import { Icon, type IconName } from "@/lib/icons";
import { Badge, Empty, SectionTitle } from "@/components/ui";
import type {
  AuditEvent,
  Block,
  MetricCard,
  RenderableBlock,
  TreeNode,
} from "@/lib/types";

/**
 * Renders the block list a detail tab returns. Adding a Customer or Supplier
 * detail screen means writing a schema — never touching this file.
 *
 * `scale` decides presentation: in the drawer sections stay flat and tight,
 * at page scale each section becomes its own card.
 */
export function BlockRenderer({
  blocks,
  scale = "page",
}: {
  blocks: Block[];
  scale?: "page" | "drawer";
}) {
  return (
    <>
      {(blocks.filter(Boolean) as RenderableBlock[]).map((b, i) => (
        <BlockView key={i} block={b} scale={scale} />
      ))}
    </>
  );
}

/** Section wrapper — adds the uppercase eyebrow and, at page scale, the card. */
function Section({
  title,
  scale,
  children,
  bare,
}: {
  title?: string;
  scale: "page" | "drawer";
  children: ReactNode;
  /** Alerts keep their own colour — never wrap them in a white card. */
  bare?: boolean;
}) {
  if (bare) return <div className="mb-4 last:mb-0">{children}</div>;
  return (
    <div
      className={cn(
        scale === "page"
          ? "mb-4 rounded-card border border-line bg-card px-6 py-5 shadow-xs last:mb-0 max-md:rounded-btn max-md:p-4"
          : "mb-6 last:mb-0",
      )}
    >
      {title && <SectionTitle>{title}</SectionTitle>}
      {children}
    </div>
  );
}

function BlockView({
  block: b,
  scale,
}: {
  block: RenderableBlock;
  scale: "page" | "drawer";
}) {
  switch (b.type) {
    /* ---------- Label / value rows ---------- */
    case "fields": {
      const items = b.items.filter(Boolean) as { label: string; value: ReactNode; span?: boolean; muted?: boolean }[];
      return (
        <Section title={b.title} scale={scale}>
          <div
            className={cn(
              "flex flex-col",
              b.cols === 2 && scale === "page" && "grid grid-cols-2 gap-x-8 max-[820px]:grid-cols-1",
            )}
          >
            {items.map((f, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-baseline gap-4 border-b border-line py-[9px] last:border-b-0",
                  f.span && "col-span-full",
                )}
              >
                <span className="flex-shrink-0 text-[13px] text-ink-2">{f.label}</span>
                <span
                  className={cn(
                    "ml-auto text-right text-[13px] font-medium tnum",
                    f.muted && "font-normal text-ink-3",
                  )}
                >
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        </Section>
      );
    }

    /* ---------- Metric cards ---------- */
    case "cards": {
      const items = b.items.filter(Boolean) as MetricCard[];
      return (
        <Section title={b.title} scale={scale}>
          <div
            className={cn(
              "grid gap-3",
              scale === "drawer"
                ? "grid-cols-2"
                : b.cols === 3
                  ? "grid-cols-3 max-[1100px]:grid-cols-2"
                  : b.cols === 2
                    ? "grid-cols-2"
                    : "grid-cols-4 max-[1100px]:grid-cols-2",
            )}
          >
            {items.map((c, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-btn border p-4",
                  c.tone === "accent"
                    ? "border-primary-border bg-primary-soft"
                    : c.tone === "warn"
                      ? "border-[#FDE68A] bg-warning-soft"
                      : c.tone === "locked"
                        ? "border-dashed border-line bg-neutral-soft"
                        : "border-line bg-surface",
                )}
              >
                <p className="mb-1 text-cap text-ink-2">{c.label}</p>
                <p
                  className={cn(
                    "text-xl font-semibold leading-tight tracking-[-0.02em] tnum",
                    c.tone === "accent" && "text-primary-active",
                    c.tone === "warn" && "text-warning-text",
                    c.tone === "locked" && "tracking-[0.1em] text-ink-3",
                  )}
                >
                  {c.value}
                  {c.unit && (
                    <span className="ml-[3px] text-cap font-normal text-ink-2">{c.unit}</span>
                  )}
                </p>
                {c.sub && <p className="mt-0.5 text-cap text-ink-3">{c.sub}</p>}
              </div>
            ))}
          </div>
        </Section>
      );
    }

    /* ---------- Compact table ---------- */
    case "table":
      return (
        <Section title={b.title} scale={scale}>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full text-cap">
              <thead>
                <tr>
                  {b.cols.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap border-b border-line px-2 py-2 font-semibold text-ink-2",
                        c.align === "right" ? "text-right tnum" : "text-left",
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={b.cols.length}
                      className="py-5 text-center text-ink-3"
                    >
                      {b.empty ?? "ไม่มีข้อมูล"}
                    </td>
                  </tr>
                ) : (
                  b.rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-line last:border-b-0">
                      {b.cols.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-2 py-[9px] align-middle",
                            c.align === "right" && "text-right tnum",
                            c.muted && "text-ink-2",
                          )}
                        >
                          {c.cell
                            ? c.cell(r)
                            : esc((r as Record<string, unknown>)[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>
      );

    /* ---------- Linked record cards ---------- */
    case "entity":
      return (
        <Section title={b.title} scale={scale}>
          {b.items.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-ink-2">
              {b.empty ?? "ไม่มีข้อมูล"}
            </p>
          ) : (
            b.items.map((e, i) => (
              <button
                key={i}
                onClick={e.onClick}
                className="mb-2 flex w-full items-center gap-3 rounded-btn border border-line p-3 text-left transition-colors duration-fast last:mb-0 hover:border-line-strong hover:bg-surface"
              >
                <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[9px] bg-neutral-soft text-xs font-semibold text-neutral-text">
                  {e.avatar ?? e.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{e.name}</span>
                  {e.sub && <span className="block text-cap text-ink-2">{e.sub}</span>}
                </span>
                {e.end}
                <Icon name="chevronRight" size={15} className="flex-shrink-0 text-ink-3" />
              </button>
            ))
          )}
        </Section>
      );

    /* ---------- Attachments ---------- */
    case "docs":
      return (
        <Section title={b.title} scale={scale}>
          {b.items.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-ink-2">
              {b.empty ?? "ยังไม่มีเอกสารแนบ"}
            </p>
          ) : (
            b.items.map((d, i) => (
              <button
                key={i}
                onClick={d.onClick}
                className="mb-2 flex w-full items-center gap-3 rounded-btn border border-line p-3 text-left transition-colors duration-fast last:mb-0 hover:border-line-strong hover:bg-surface"
              >
                <Icon name="file" size={17} className="text-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{d.name}</span>
                  <span className="block text-cap text-ink-2">{d.meta}</span>
                </span>
                <Icon name="download" size={15} className="flex-shrink-0 text-ink-3" />
              </button>
            ))
          )}
        </Section>
      );

    /* ---------- Chronological events, newest first ---------- */
    case "timeline":
      return (
        <Section title={b.title} scale={scale}>
          <div className="relative pl-6">
            <span className="absolute bottom-1.5 left-1.5 top-1.5 w-[1.5px] bg-line" />
            {b.items.map((e, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <span
                  className={cn(
                    "absolute -left-[22px] top-[5px] h-[9px] w-[9px] rounded-full border-2",
                    e.kind === "primary"
                      ? "border-primary bg-primary"
                      : e.kind === "info"
                        ? "border-info bg-info"
                        : e.kind === "warn"
                          ? "border-warning bg-warning"
                          : "border-line-strong bg-card",
                  )}
                />
                <p className="mb-0.5 text-[13px] font-medium">{e.title}</p>
                {e.detail && (
                  <p className="text-cap leading-relaxed text-ink-2">{e.detail}</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-cap text-ink-3">
                  {e.user}
                  {e.user && e.when && (
                    <i className="inline-block h-[3px] w-[3px] rounded-full bg-ink-3" />
                  )}
                  {e.when}
                </p>
              </div>
            ))}
          </div>
        </Section>
      );

    /* ---------- Callout ---------- */
    case "alert": {
      const tone = {
        warn: {
          box: "bg-warning-soft border-[#FDE68A]",
          icon: "text-warning",
          text: "text-warning-text",
        },
        danger: {
          box: "bg-danger-soft border-[#FECACA]",
          icon: "text-danger",
          text: "text-danger-text",
        },
        info: {
          box: "bg-info-soft border-[#BFDBFE]",
          icon: "text-info",
          text: "text-info-text",
        },
        success: {
          box: "bg-success-soft border-[#BBF7D0]",
          icon: "text-success",
          text: "text-success-text",
        },
      }[b.tone];
      return (
        <Section scale={scale} bare>
          <div className={cn("flex gap-3 rounded-btn border p-4", tone.box)}>
            <span className={cn("flex-shrink-0", tone.icon)}>
              <Icon
                name={b.tone === "success" ? "checkCircle" : b.tone === "info" ? "info" : "alert"}
                size={18}
                strokeWidth={2}
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cn("mb-0.5 text-[13px] font-semibold", tone.text)}>
                {b.title}
              </span>
              <span className={cn("text-cap leading-relaxed", tone.text)}>{b.message}</span>
            </span>
          </div>
        </Section>
      );
    }

    /* ---------- Boolean rows ---------- */
    case "flags":
      return (
        <Section title={b.title} scale={scale}>
          <div
            className={cn(
              "flex flex-col",
              b.cols === 2 && scale === "page" && "grid grid-cols-2 gap-x-8 max-[820px]:grid-cols-1",
            )}
          >
            {b.items.map((f, i) => (
              <div
                key={i}
                className="flex items-baseline gap-4 border-b border-line py-[9px] last:border-b-0"
              >
                <span className="text-[13px] text-ink-2">{f.label}</span>
                <span className="ml-auto text-right text-[13px] font-medium">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      f.value ? "text-success-text" : "text-ink-3",
                    )}
                  >
                    <Icon name={f.value ? "check" : "close"} size={14} strokeWidth={2.2} />
                    {f.value ? "Yes" : "No"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Section>
      );

    /* ---------- Not-yet-built feature. Must never look active. ---------- */
    case "planned":
      return (
        <Section title={b.title} scale={scale}>
          <div className="flex items-center gap-3 rounded-btn border border-dashed border-line-strong bg-surface p-4 text-[13px] text-ink-2">
            <Icon name="clock" size={16} className="flex-shrink-0 text-ink-3" />
            <span>
              <strong className="font-semibold text-ink-2">{b.label}</strong> —{" "}
              {b.message ?? "Planned for future phase"}
            </span>
          </div>
        </Section>
      );

    case "restricted":
      return (
        <Section title={b.title} scale={scale}>
          <div className="flex items-center gap-3 rounded-btn border border-dashed border-line-strong bg-surface p-4 text-[13px] text-ink-2">
            <Icon name="lock" size={16} className="flex-shrink-0 text-ink-3" />
            <span>Restricted by permission</span>
          </div>
        </Section>
      );

    /* ---------- Audit trail with expandable before/after ---------- */
    case "audit":
      return (
        <Section title={b.title} scale={scale}>
          <div className="relative pl-6">
            <span className="absolute bottom-1.5 left-1.5 top-1.5 w-[1.5px] bg-line" />
            {b.items.map((e, i) => (
              <AuditRow key={i} event={e} />
            ))}
          </div>
        </Section>
      );

    case "empty":
      return (
        <Section title={b.title} scale={scale}>
          <Empty heading={b.heading} message={b.message} icon={b.icon ?? "file"} />
        </Section>
      );

    case "tree":
      return (
        <Section title={b.title} scale={scale}>
          {b.nodes.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-ink-2">
              {b.empty ?? "ยังไม่มีโครงสร้าง"}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {b.nodes.map((n, i) => (
                <TreeRow key={i} node={n} depth={0} />
              ))}
            </ul>
          )}
        </Section>
      );

    case "note":
      return (
        <Section title={b.title} scale={scale}>
          <div className="text-[13px] leading-relaxed text-ink-2">{b.text}</div>
        </Section>
      );

    case "node":
      return (
        <Section title={b.title} scale={scale}>
          {b.node}
        </Section>
      );

    case "grid":
      return (
        <div
          className={cn(
            "mb-4 grid gap-4 last:mb-0 max-[900px]:grid-cols-1",
            b.cols === 3
              ? "grid-cols-3 max-[1400px]:grid-cols-2"
              : "grid-cols-2",
          )}
        >
          {b.items.filter(Boolean).map((inner, i) => (
            <div key={i}>
              <BlockRenderer blocks={[inner]} scale={scale} />
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}

/* ---------- Expandable audit row ---------- */
function AuditRow({ event: e }: { event: AuditEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative pb-3">
      <span
        className={cn(
          "absolute -left-[22px] top-[5px] h-[9px] w-[9px] rounded-full border-2",
          e.kind === "primary"
            ? "border-primary bg-primary"
            : e.kind === "info"
              ? "border-info bg-info"
              : e.kind === "warn"
                ? "border-warning bg-warning"
                : "border-line-strong bg-card",
        )}
      />
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-sm py-0.5 text-left transition-opacity hover:opacity-70 max-md:py-2"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-medium">{e.event}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-cap text-ink-3">
            {e.user}
            <i className="inline-block h-[3px] w-[3px] rounded-full bg-ink-3" />
            {e.when}
          </span>
        </span>
        <Icon
          name="chevronDown"
          size={15}
          className={cn(
            "mt-0.5 flex-shrink-0 text-ink-3 transition-transform duration-base",
            open && "rotate-180",
          )}
        />
      </button>
      <div className="collapse-grid" data-open={open}>
        <div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-btn border border-line bg-surface p-3 text-cap">
            <span className="mb-1 w-full font-semibold text-ink-2">{e.field}</span>
            <span className="rounded-sm bg-danger-soft px-2 py-[3px] text-danger-text line-through">
              {esc(e.from)}
            </span>
            <Icon name="arrowRight" size={14} className="text-ink-3" />
            <span className="rounded-sm bg-success-soft px-2 py-[3px] font-medium text-success-text">
              {esc(e.to)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Read-only hierarchy tree ---------- */
function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const kids = node.children ?? [];
  const [open, setOpen] = useState(depth < 2);

  return (
    <li className="relative">
      <div
        className="flex items-center gap-2 rounded-sm py-1.5 pr-2 transition-colors duration-fast hover:bg-surface"
        style={{ paddingLeft: depth * 22 + 8 }}
      >
        <button
          onClick={() => kids.length && setOpen((o) => !o)}
          className={cn(
            "grid h-[18px] w-[18px] flex-shrink-0 place-items-center text-ink-3",
            !kids.length && "cursor-default",
          )}
          aria-label={kids.length ? (open ? "ยุบ" : "ขยาย") : undefined}
        >
          {kids.length ? (
            <Icon
              name="chevronRight"
              size={14}
              className={cn("transition-transform duration-fast", open && "rotate-90")}
            />
          ) : (
            <span className="h-[5px] w-[5px] rounded-full bg-line-strong" />
          )}
        </button>
        <Icon
          name={(node.icon as IconName) ?? "box"}
          size={15}
          className="flex-shrink-0 text-ink-3"
        />
        <span className="text-[13px] font-medium tnum">{node.label}</span>
        {node.sub && <span className="text-cap text-ink-2">{node.sub}</span>}
        {node.badge && <Badge tone={node.badgeTone ?? "neutral"}>{node.badge}</Badge>}
        {node.meta && <span className="ml-auto text-cap text-ink-3 tnum">{node.meta}</span>}
      </div>
      {kids.length > 0 && open && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {kids.map((c, i) => (
            <TreeRow key={i} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
