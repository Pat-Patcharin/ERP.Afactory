"use client";

import { notFound, useParams } from "next/navigation";
import { getSchemas } from "@/schemas/registry";
import { FormPlaceholder } from "@/components/engine/FormPlaceholder";

/** Create route: /m/{entity}/new */
export default function EntityCreatePage() {
  const { entity } = useParams<{ entity: string }>();
  const schemas = getSchemas(entity);
  if (!schemas) notFound();

  return <FormPlaceholder entity={entity} label={schemas.list.entity} mode="create" />;
}
