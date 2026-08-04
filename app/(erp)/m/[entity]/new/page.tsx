"use client";

import { notFound, useParams } from "next/navigation";
import { getSchemas } from "@/schemas/registry";
import { MasterForm } from "@/components/engine/MasterForm";
import { FormPlaceholder } from "@/components/engine/FormPlaceholder";

/** Create route: /m/{entity}/new */
export default function EntityCreatePage() {
  const { entity } = useParams<{ entity: string }>();
  const schemas = getSchemas(entity);
  if (!schemas) notFound();

  /* A document with its own editor is edited as the document. */
  if (schemas.editor) return schemas.editor({});

  /* An entity registered without a form schema degrades to a named
     placeholder rather than a broken screen. */
  if (!schemas.form) {
    return <FormPlaceholder entity={entity} label={schemas.list.entity} mode="create" />;
  }

  return <MasterForm schema={schemas.form} />;
}
