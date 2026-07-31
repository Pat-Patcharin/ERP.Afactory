"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useUI } from "@/lib/store";
import {
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
  Input,
  Select,
} from "@/components/ui";

const WAREHOUSES = ["All", "WH-01 Samut Prakan", "WH-02 Bangkok", "WH-03 Service"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 border-b border-line pb-5 last:mb-0 last:border-b-0 last:pb-0">
      <p className="mb-3 text-[13px] font-semibold">{title}</p>
      {children}
    </div>
  );
}

function CheckRow({ label }: { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-2">
      <Checkbox />
      <span>{label}</span>
    </label>
  );
}

/**
 * Advanced filter panel. Kept as a prototype surface: the quick filters in the
 * toolbar already cover the daily cases, and these compound criteria need the
 * query API before they can do real work.
 */
export function FilterDrawer() {
  const open = useUI((s) => s.filterDrawerOpen);
  const setOpen = useUI((s) => s.setFilterDrawer);
  const toast = useUI((s) => s.toast);
  const [wh, setWh] = useState("All");

  return (
    <Drawer open={open} onClose={() => setOpen(false)} label="Advanced filters">
      <DrawerHead title="More Filters" onClose={() => setOpen(false)} />
      <DrawerBody>
        <Section title="Warehouse">
          <div className="flex flex-wrap gap-2">
            {WAREHOUSES.map((w) => (
              <button
                key={w}
                onClick={() => setWh(w)}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-[13px] transition-all duration-fast",
                  wh === w
                    ? "border-primary bg-primary-soft font-medium text-primary-active"
                    : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Selling Price (THB)">
          <div className="flex items-center gap-2">
            <Input type="number" placeholder="Min" />
            <span className="text-ink-2">—</span>
            <Input type="number" placeholder="Max" />
          </div>
        </Section>

        <Section title="Stock Level">
          <CheckRow label="Below reorder point" />
          <CheckRow label="Out of stock" />
          <CheckRow label="Overstock" />
        </Section>

        <Section title="Registration">
          <CheckRow label="Expiring within 90 days" />
          <CheckRow label="Expired" />
        </Section>

        <Section title="Main Supplier">
          <Select defaultValue="">
            <option value="">All suppliers</option>
            <option>Supplier A Co., Ltd.</option>
            <option>HDX WILL</option>
            <option>DGSHAPE</option>
            <option>Andaman Medical</option>
          </Select>
        </Section>

        <Section title="Created date">
          <div className="flex items-center gap-2">
            <Input type="date" />
            <span className="text-ink-2">—</span>
            <Input type="date" />
          </div>
        </Section>
      </DrawerBody>

      <DrawerFoot>
        <Button
          className="flex-1"
          onClick={() => {
            setWh("All");
            toast("ล้างตัวกรอง", "รีเซ็ตตัวกรองทั้งหมดแล้ว", "info");
          }}
        >
          Clear all
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => {
            setOpen(false);
            toast("ใช้ตัวกรองแล้ว", "แสดงผลตามเงื่อนไขที่เลือก");
          }}
        >
          Apply filters
        </Button>
      </DrawerFoot>
    </Drawer>
  );
}
