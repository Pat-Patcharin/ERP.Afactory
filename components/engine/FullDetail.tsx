"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { esc } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import type { DetailSchema, RecordBase } from "@/lib/types";
import {
  ActionMenuItems,
  Badge,
  Button,
  IconButton,
  Menu,
  Tabs,
} from "@/components/ui";
import { useCrumbCode } from "@/components/layout/Topbar";
import { BlockRenderer } from "./BlockRenderer";
import { useActionCtx } from "./useActionCtx";
import { copyValue } from "./copy";

/**
 * Read-only record profile at page scale. Same schema as the drawer — the
 * difference is presentation: sections become cards, the KPI strip appears,
 * and Overview may carry a right-hand summary rail.
 *
 * Editing lives on a separate page; nothing here mutates.
 */
export function FullDetail<T extends RecordBase>({
  schema,
  record,
}: {
  schema: DetailSchema<T>;
  record: T;
}) {
  const ctx = useActionCtx();
  const toast = useUI((s) => s.toast);
  const [fav, setFav] = useState(false);

  const id = useMemo(() => schema.identity(record), [schema, record]);
  const kpis = useMemo(() => schema.kpis(record), [schema, record]);
  const tabs = useMemo(
    () => schema.tabs.filter((t) => !t.when || t.when(record)),
    [schema, record],
  );
  const [tab, setTab] = useState(tabs[0]?.key ?? "");
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const aside = active?.aside?.(record, ctx);

  useCrumbCode(record.code);

  const copy = id.copyFields ?? [];
  const extraActions = schema.actions?.(record, ctx) ?? [];

  return (
    <div>
      {/* ---------- Header: identity + actions + KPIs + tabs ---------- */}
      <header className="border-b border-line bg-card px-6 pt-5 max-md:px-4 max-md:pt-4">
        <div className="mb-4 flex items-center gap-1">
          <IconButton
            onClick={() => ctx.goto(`/m/${schema.key}`)}
            aria-label={`Back to ${schema.entityLabel} list`}
          >
            <Icon name="arrowLeft" size={19} />
          </IconButton>
          <button
            onClick={() => ctx.goto(`/m/${schema.key}`)}
            className="rounded-sm px-2 py-1 font-medium text-ink-2 transition-colors duration-fast hover:bg-neutral-soft hover:text-ink"
          >
            Back to {schema.entityLabel} List
          </button>
        </div>

        <div className="mb-5 flex flex-wrap items-start gap-5">
          <div className="flex min-w-[280px] flex-1 gap-5 max-md:min-w-0 max-md:gap-3">
            <div className="grid h-24 w-24 flex-shrink-0 place-items-center rounded-card border border-line bg-surface text-[42px] max-[820px]:h-[72px] max-[820px]:w-[72px] max-[820px]:rounded-btn max-[820px]:text-[32px]">
              {id.image}
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <div className="-ml-1.5 flex flex-wrap items-center gap-2">
                {copy[0] && (
                  <button
                    onClick={() => copyValue(copy[0], toast)}
                    title={`Copy ${copy[0].label}`}
                    className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-ink-2 transition-colors duration-fast hover:bg-neutral-soft hover:text-ink"
                  >
                    <span className="text-h2 font-semibold tracking-[-0.015em] text-ink tnum max-md:text-h3">
                      {id.code}
                    </span>
                    <Icon name="copy" size={16} strokeWidth={1.9} />
                  </button>
                )}
                {copy[1] && (
                  <button
                    onClick={() => copyValue(copy[1], toast)}
                    title={`Copy ${copy[1].label}`}
                    className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-cap text-ink-2 transition-colors duration-fast hover:bg-neutral-soft hover:text-ink"
                  >
                    <Icon name="barcode" size={13} strokeWidth={1.9} />
                    {copy[1].label}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-h3 font-medium leading-[1.3] tracking-[-0.01em] text-ink-2 max-md:text-body">
                  {id.title}
                </h1>
                <span className="flex flex-wrap items-center gap-2">
                  {id.badges.map((b) => (
                    <Badge key={b.text} tone={b.tone}>
                      {b.text}
                    </Badge>
                  ))}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {id.tags.filter(Boolean).map((t) => (
                  <span
                    key={t}
                    className="whitespace-nowrap rounded-sm border border-line bg-surface px-2 py-0.5 text-cap text-ink-2"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2 max-[900px]:ml-0 max-[900px]:w-full">
            <IconButton
              onClick={() => {
                setFav((f) => !f);
                toast(
                  fav ? "นำออกจากรายการโปรด" : "เพิ่มในรายการโปรด",
                  id.code,
                  "success",
                );
              }}
              aria-pressed={fav}
              aria-label="Add to favourites"
              className={cn(fav && "text-warning")}
            >
              <Icon name="star" size={19} fill={fav ? "currentColor" : "none"} />
            </IconButton>

            <Menu
              trigger={({ toggle }) => (
                <Button size="sm" onClick={toggle}>
                  More Actions
                  <Icon name="chevronDown" size={15} strokeWidth={2} />
                </Button>
              )}
            >
              {(close) => (
                <ActionMenuItems
                  actions={
                    extraActions.length
                      ? extraActions
                      : [
                          {
                            label: "Print",
                            icon: "printer",
                            run: () =>
                              toast("พิมพ์เอกสาร", `${record.code} — Future support`, "info"),
                          },
                          {
                            label: "Export",
                            icon: "upload",
                            run: () =>
                              toast("ส่งออกข้อมูล", `${record.code} — Future support`, "info"),
                          },
                        ]
                  }
                  record={record}
                  close={close}
                />
              )}
            </Menu>

            <Button
              variant="primary"
              size="sm"
              className="max-[900px]:ml-auto"
              onClick={() =>
                ctx.goto(`/m/${schema.key}/${encodeURIComponent(record.code)}/edit`)
              }
            >
              <Icon name="edit" size={16} strokeWidth={2} />
              Edit {schema.entityLabel}
            </Button>
          </div>
        </div>

        {/* Compact, clickable summary cards — each jumps to its related tab */}
        {kpis.length > 0 && (
          <div className="mb-5 grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-md:gap-2">
            {kpis.map((k) => (
              <button
                key={k.label}
                onClick={() => k.goTab && setTab(k.goTab)}
                title={k.goTab ? `ไปที่แท็บ ${k.goTab}` : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-btn border border-line bg-surface p-4 text-left",
                  "transition-colors duration-fast max-md:p-3",
                  k.goTab && "hover:border-line-strong hover:bg-card",
                )}
              >
                <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[9px] border border-line bg-card text-ink-2 max-md:hidden">
                  <Icon name={k.icon} size={17} />
                </span>
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="whitespace-nowrap text-cap text-ink-2">{k.label}</span>
                  <span
                    title={k.value}
                    className={cn(
                      "truncate leading-tight tracking-[-0.02em] tnum",
                      k.wide ? "text-body font-medium tracking-normal" : "text-lg font-semibold",
                    )}
                  >
                    {esc(k.value)}
                  </span>
                  {k.sub && <span className="text-cap text-ink-3">{k.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        <Tabs
          items={tabs.map((t) => ({ key: t.key, label: t.label }))}
          active={active?.key ?? ""}
          onChange={setTab}
          className="-mx-6 border-b-0 px-6 max-md:-mx-4 max-md:px-4"
        />
      </header>

      {/* ---------- Body ---------- */}
      <main className="max-w-[1440px] px-6 pb-12 pt-8 max-md:px-4 max-md:pb-10 max-md:pt-5">
        <section key={active?.key} className="animate-paneIn">
          {aside ? (
            <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 max-[1240px]:grid-cols-1">
              <div className="min-w-0">
                {active && <BlockRenderer blocks={active.blocks(record, ctx)} />}
              </div>
              <aside className="flex flex-col gap-4 max-[1240px]:flex-row max-[1240px]:flex-wrap max-md:flex-col">
                {aside.top}
                <div className="flex-1 rounded-card border border-line bg-card px-5 py-4 shadow-xs max-[1240px]:min-w-[260px]">
                  {aside.rows.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 border-b border-line py-[9px] last:border-b-0"
                    >
                      <Icon name={r.icon} size={15} className="flex-shrink-0 text-ink-3" />
                      <span className="whitespace-nowrap text-cap text-ink-2">{r.label}</span>
                      <span
                        className={cn(
                          "ml-auto text-right text-[13px] font-medium tnum",
                          r.muted && "font-normal text-ink-3",
                        )}
                      >
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>
                {aside.bottom}
              </aside>
            </div>
          ) : (
            active && <BlockRenderer blocks={active.blocks(record, ctx)} />
          )}
        </section>
      </main>
    </div>
  );
}
