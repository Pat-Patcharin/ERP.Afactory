import type { ToastTone } from "@/lib/types";

type Toast = (title: string, message?: string, tone?: ToastTone) => void;

/**
 * Clipboard helper shared by the drawer and the full detail page.
 * The browser refuses clipboard access on insecure origins, so the failure
 * path has to say something useful rather than silently doing nothing.
 */
export function copyValue(
  field: { label: string; value: string } | undefined,
  toast: Toast,
) {
  if (!field) return;
  navigator.clipboard
    ?.writeText(field.value)
    .then(() => toast("คัดลอกแล้ว", `${field.label}: ${field.value}`, "success"))
    .catch(() =>
      toast(
        "คัดลอกไม่สำเร็จ",
        "เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด",
        "danger",
      ),
    );
}
