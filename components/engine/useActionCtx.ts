"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/lib/store";
import type { ActionCtx } from "@/lib/types";

/**
 * Assembles the context handed to every schema callback. Schemas stay pure
 * data — they never import the router or the store directly, which is what
 * lets the same schema drive the list, the drawer and the full detail page.
 */
export function useActionCtx(): ActionCtx {
  const router = useRouter();
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const formModal = useUI((s) => s.formModal);
  const refresh = useUI((s) => s.refresh);
  const openQuickView = useUI((s) => s.openQuickView);

  return useMemo<ActionCtx>(
    () => ({
      goto: (href) => router.push(href),
      openEntity: (entity, code) =>
        router.push(
          code ? `/m/${entity}/${encodeURIComponent(code)}` : `/m/${entity}`,
        ),
      toast,
      confirm,
      formModal,
      refresh,
      quickView: openQuickView,
    }),
    [router, toast, confirm, formModal, refresh, openQuickView],
  );
}
