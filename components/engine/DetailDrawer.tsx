"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/lib/icons";
import { useUI } from "@/lib/store";
import type { DetailSchema, RecordBase } from "@/lib/types";
import {
  Badge,
  Button,
  Drawer,
  DrawerFoot,
  IconButton,
  Tabs,
} from "@/components/ui";
import { BlockRenderer } from "./BlockRenderer";
import { useActionCtx } from "./useActionCtx";
import { copyValue } from "./copy";

/**
 * Quick View — the fast path. Check a record without leaving the list, then
 * escalate to the full detail page when the answer needs more room.
 *
 * Rendered from the same schema as the full page, so the two can never drift.
 */
export function DetailDrawer<T extends RecordBase>({
  schema,
  record,
  open,
  onClose,
}: {
  schema: DetailSchema<T>;
  record: T;
  open: boolean;
  onClose: () => void;
}) {
  const ctx = useActionCtx();
  const toast = useUI((s) => s.toast);
  const [fav, setFav] = useState(false);

  const id = useMemo(() => schema.identity(record), [schema, record]);
  const tabs = useMemo(
    () => schema.tabs.filter((t) => !t.when || t.when(record)),
    [schema, record],
  );
  const [tab, setTab] = useState(tabs[0]?.key ?? "");
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];

  const copy = id.copyFields ?? [];

  return (
    <Drawer open={open} onClose={onClose} width="detail" label={id.title}>
      {/* ---------- Identity header ---------- */}
      <header className="flex-shrink-0 border-b border-line p-5">
        <div className="mb-4 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {copy[0] && (
              <button
                onClick={() => copyValue(copy[0], toast)}
                title={`Copy ${copy[0].label}`}
                className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-ink-2 transition-colors duration-fast hover:bg-neutral-soft hover:text-ink"
              >
                <span className="text-[13px] font-semibold tracking-[0.02em] tnum">
                  {id.code}
                </span>
                <Icon name="copy" size={13} strokeWidth={1.9} />
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
          <IconButton onClick={onClose} aria-label="Close">
            <Icon name="close" size={19} />
          </IconButton>
        </div>

        <div className="flex gap-4">
          <div className="grid h-[76px] w-[76px] flex-shrink-0 place-items-center rounded-btn border border-line bg-surface text-[32px]">
            {id.image}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="text-h3 font-semibold leading-[1.35]">{id.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {id.badges.map((b) => (
                <Badge key={b.text} tone={b.tone}>
                  {b.text}
                </Badge>
              ))}
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
      </header>

      <Tabs
        variant="drawer"
        items={tabs.map((t) => ({ key: t.key, label: t.label }))}
        active={active?.key ?? ""}
        onChange={setTab}
        className="flex-shrink-0"
      />

      <div key={active?.key} className="flex-1 animate-paneIn overflow-y-auto p-5">
        {active && <BlockRenderer blocks={active.blocks(record, ctx)} scale="drawer" />}
      </div>

      <DrawerFoot>
        <Button variant="ghost" onClick={onClose} className="max-md:flex-1">
          Close
        </Button>
        <Button
          onClick={() => {
            onClose();
            ctx.goto(`/m/${schema.key}/${encodeURIComponent(record.code)}/edit`);
          }}
          className="max-md:flex-1"
        >
          Edit
        </Button>
        <Button
          variant="primary"
          className="flex-1 max-md:order-first max-md:w-full max-md:flex-none"
          onClick={() => {
            onClose();
            ctx.goto(`/m/${schema.key}/${encodeURIComponent(record.code)}`);
          }}
        >
          Open full detail
        </Button>
      </DrawerFoot>
    </Drawer>
  );
}
