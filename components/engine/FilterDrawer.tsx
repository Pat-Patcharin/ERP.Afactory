"use client";

import { useUI } from "@/lib/store";
import type { ListFilter, RecordBase } from "@/lib/types";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
  FieldShell,
  Select,
} from "@/components/ui";

/* ============================================================
   MORE FILTERS

   Schema-driven, like every other engine here: a list declares
   which of its filters are `advanced`, and those render in this
   drawer instead of on the toolbar. Same `test` function either
   way — the drawer decides where a control lives, never what it
   means.

   (This replaced a hardcoded panel of warehouse / price / stock
   controls that filtered nothing. Controls that look real and do
   nothing are worse than no controls.)

   Values apply as they change rather than on an Apply click. The
   table is visible behind the drawer, so the effect is immediate;
   an Apply button would only add a step that can be forgotten.
   ============================================================ */

export function FilterDrawer<T extends RecordBase>({
  filters,
  values,
  onChange,
  onClear,
}: {
  /** The advanced subset — the toolbar renders the rest. */
  filters: ListFilter<T>[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onClear: () => void;
}) {
  const open = useUI((s) => s.filterDrawerOpen);
  const setOpen = useUI((s) => s.setFilterDrawer);

  const active = filters.filter((f) => values[f.id]).length;

  return (
    <Drawer open={open} onClose={() => setOpen(false)} label="Advanced filters">
      <DrawerHead title="More Filters" onClose={() => setOpen(false)} />

      <DrawerBody>
        {filters.length === 0 ? (
          <p className="py-8 text-center text-ink-2">
            รายการนี้ไม่มีตัวกรองเพิ่มเติม — ตัวกรองทั้งหมดอยู่บนแถบด้านบนแล้ว
          </p>
        ) : (
          <div data-testid="filter-drawer-fields" className="flex flex-col gap-4">
            {filters.map((f) => (
              <FieldShell key={f.id} label={f.label}>
                <Select
                  aria-label={f.label}
                  value={values[f.id] ?? ""}
                  onChange={(e) => onChange(f.id, e.target.value)}
                >
                  <option value="">All</option>
                  {f.options().map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </FieldShell>
            ))}
          </div>
        )}
      </DrawerBody>

      <DrawerFoot>
        <Button className="flex-1" disabled={active === 0} onClick={onClear}>
          Clear {active > 0 ? `(${active})` : "all"}
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>
          Done
        </Button>
      </DrawerFoot>
    </Drawer>
  );
}
