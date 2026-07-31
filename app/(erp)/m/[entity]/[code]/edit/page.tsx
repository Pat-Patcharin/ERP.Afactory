"use client";

import { notFound, useParams } from "next/navigation";
import { findRecord, getSchemas } from "@/schemas/registry";
import { MasterForm } from "@/components/engine/MasterForm";
import { FormPlaceholder } from "@/components/engine/FormPlaceholder";
import { Button, Empty } from "@/components/ui";
import { useActionCtx } from "@/components/engine/useActionCtx";

/** Edit route: /m/{entity}/{code}/edit */
export default function EntityEditPage() {
  const { entity, code } = useParams<{ entity: string; code: string }>();
  const ctx = useActionCtx();

  const schemas = getSchemas(entity);
  if (!schemas) notFound();

  if (!schemas.form) {
    return (
      <FormPlaceholder
        entity={entity}
        label={schemas.list.entity}
        mode="edit"
        code={decodeURIComponent(code)}
      />
    );
  }

  const record = findRecord(entity, code);

  if (!record) {
    return (
      <main className="px-6 py-16">
        <Empty
          heading={`ไม่พบ ${schemas.detail.entityLabel}`}
          message={`ไม่พบรหัส ${decodeURIComponent(code)} ในระบบ`}
          icon="search"
          action={
            <Button variant="primary" onClick={() => ctx.goto(`/m/${entity}`)}>
              กลับไปหน้ารายการ
            </Button>
          }
        />
      </main>
    );
  }

  return <MasterForm key={record.code} schema={schemas.form} record={record} />;
}
