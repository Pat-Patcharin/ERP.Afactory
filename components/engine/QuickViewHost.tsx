"use client";

import { useUI } from "@/lib/store";
import { getSchemas } from "@/schemas/registry";
import { DetailDrawer } from "./DetailDrawer";

/**
 * Mounted once in the shell. Any row, KPI card or linked record can raise the
 * Quick View for any entity through `ctx.quickView(entity, record)` without
 * knowing which drawer component to render.
 */
export function QuickViewHost() {
  const quickView = useUI((s) => s.quickView);
  const close = useUI((s) => s.closeQuickView);
  if (!quickView) return null;

  const schemas = getSchemas(quickView.entity);
  if (!schemas) return null;

  return (
    <DetailDrawer
      key={`${quickView.entity}:${quickView.record.code}`}
      schema={schemas.detail}
      record={quickView.record}
      open
      onClose={close}
    />
  );
}
