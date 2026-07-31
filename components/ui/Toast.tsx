"use client";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/lib/icons";
import { useUI } from "@/lib/store";
import type { ToastTone } from "@/lib/types";

const TONE: Record<ToastTone, { border: string; icon: string; name: IconName }> = {
  success: {
    border: "border-l-success",
    icon: "text-success",
    name: "checkCircle",
  },
  info: { border: "border-l-info", icon: "text-info", name: "info" },
  warning: { border: "border-l-warning", icon: "text-warning", name: "alert" },
  danger: { border: "border-l-danger", icon: "text-danger", name: "xCircle" },
};

export function ToastHost() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);

  return (
    <div className="fixed bottom-6 right-6 z-toast flex flex-col gap-3 max-md:inset-x-4 max-md:bottom-4">
      {toasts.map((t) => {
        const tone = TONE[t.tone];
        return (
          <div
            key={t.id}
            className={cn(
              "flex min-w-[300px] max-w-[400px] animate-toastIn items-start gap-3",
              "rounded-btn border border-line border-l-[3px] bg-card p-4 shadow-lg",
              "max-md:min-w-0 max-md:max-w-none",
              tone.border,
            )}
          >
            <Icon
              name={tone.name}
              size={19}
              strokeWidth={2}
              className={cn("flex-shrink-0", tone.icon)}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{t.title}</p>
              {t.message && (
                <p className="mt-0.5 text-[13px] text-ink-2">{t.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-ink-3 transition-colors hover:text-ink"
            >
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
