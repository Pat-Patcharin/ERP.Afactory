"use client";

import { Icon } from "@/lib/icons";
import { Button, Card } from "@/components/ui";
import { useCrumbCode } from "@/components/layout/Topbar";
import { useActionCtx } from "./useActionCtx";

/**
 * Create / Edit routes exist and are wired, but the MasterForm engine (section
 * rail, validation, completion progress, autosave, review step) is the next
 * phase. Naming that explicitly beats a 404 — and beats a half-built form that
 * silently drops what the user typed.
 */
export function FormPlaceholder({
  entity,
  label,
  mode,
  code,
}: {
  entity: string;
  label: string;
  mode: "create" | "edit";
  code?: string;
}) {
  const ctx = useActionCtx();
  useCrumbCode(mode === "edit" ? (code ?? null) : "New");

  const title = mode === "create" ? `Create ${label}` : `Edit ${label}`;

  return (
    <div>
      <header className="border-b border-line bg-card px-6 py-4 max-md:px-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => ctx.goto(`/m/${entity}`)}
            className="inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium text-ink-2 transition-colors hover:bg-neutral-soft hover:text-ink"
          >
            <Icon name="arrowLeft" size={16} />
            Back to {label} List
          </button>
        </div>
        <h1 className="text-h2 font-semibold">{title}</h1>
      </header>

      <main className="px-6 py-12 max-md:px-4">
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <div className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-btn bg-primary-soft text-primary">
            <Icon name="edit" size={24} />
          </div>
          <h2 className="mb-2 text-h3 font-semibold">{title} — อยู่ระหว่างพัฒนา</h2>
          <p className="mb-6 text-ink-2">
            หน้าอ่านข้อมูล (List · Quick View · Full Detail) พร้อมใช้งานครบแล้ว
            <br />
            ส่วนฟอร์มสร้าง/แก้ไข พร้อม validation และ progress panel จะมาใน Phase ถัดไป
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => ctx.goto(`/m/${entity}`)}>กลับไปหน้ารายการ</Button>
            {code && (
              <Button
                variant="primary"
                onClick={() => ctx.goto(`/m/${entity}/${encodeURIComponent(code)}`)}
              >
                ดูรายละเอียด {code}
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
