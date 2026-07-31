"use client";

import { notFound, useParams } from "next/navigation";
import { getSchemas } from "@/schemas/registry";
import { FormPlaceholder } from "@/components/engine/FormPlaceholder";

/** Edit route: /m/{entity}/{code}/edit */
export default function EntityEditPage() {
  const { entity, code } = useParams<{ entity: string; code: string }>();
  const schemas = getSchemas(entity);
  if (!schemas) notFound();

  return (
    <FormPlaceholder
      entity={entity}
      label={schemas.list.entity}
      mode="edit"
      code={decodeURIComponent(code)}
    />
  );
}
