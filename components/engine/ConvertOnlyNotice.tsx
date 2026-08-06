"use client";

import type { ConvertOnly } from "@/lib/types";
import { Icon } from "@/lib/icons";
import { Button, Card } from "@/components/ui";
import { useCrumbCode } from "@/components/layout/Topbar";
import { useActionCtx } from "./useActionCtx";

/**
 * What /m/{entity}/new answers with for a document that only exists as a
 * conversion. The URL still resolves — a bookmark from before the rule, or a
 * link somebody pasted, lands here rather than on a 404 — and the page says
 * which document produces this one and offers the way there.
 */
export function ConvertOnlyNotice({
  entity,
  label,
  rule,
}: {
  entity: string;
  label: string;
  rule: ConvertOnly;
}) {
  const ctx = useActionCtx();
  useCrumbCode("New");

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
        <h1 className="text-h2 font-semibold">Create {label}</h1>
      </header>

      <main className="px-6 py-12 max-md:px-4">
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <div className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-btn bg-warning-soft text-warning-text">
            <Icon name="lock" size={24} />
          </div>
          <h2 className="mb-2 text-h3 font-semibold">เอกสารนี้สร้างขึ้นเองไม่ได้</h2>
          <p className="mb-6 text-ink-2">
            {label} เกิดจากการแปลง{rule.from}เท่านั้น
            <br />
            เปิด{rule.from}ที่ต้องการ แล้วสั่งแปลงจากเอกสารนั้น ระบบจะออกเลขที่และดึงรายการมาให้
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => ctx.goto(`/m/${entity}`)}>กลับไปหน้ารายการ</Button>
            <Button variant="primary" onClick={() => ctx.goto(rule.goto)}>
              {rule.gotoLabel}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
