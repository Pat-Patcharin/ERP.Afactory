"use client";

import { notFound, useParams } from "next/navigation";
import { FullDetail } from "@/components/engine/FullDetail";
import { findRecord, getSchemas } from "@/schemas/registry";
import { Button, Empty } from "@/components/ui";
import { useActionCtx } from "@/components/engine/useActionCtx";

/** Generic record profile route: /m/{entity}/{code} */
export default function EntityDetailPage() {
  const { entity, code } = useParams<{ entity: string; code: string }>();
  const ctx = useActionCtx();

  const schemas = getSchemas(entity);
  if (!schemas) notFound();

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

  /* A document renders as the document. Everything else gets the tabbed
     profile, which is still the right shape for a master record. */
  if (schemas.document) return <div key={record.code}>{schemas.document({ record })}</div>;

  return <FullDetail key={record.code} schema={schemas.detail} record={record} />;
}
