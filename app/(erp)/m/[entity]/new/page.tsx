"use client";

import { notFound, useParams, useSearchParams } from "next/navigation";
import { getSchemas } from "@/schemas/registry";
import { MasterForm } from "@/components/engine/MasterForm";
import { ConvertOnlyNotice } from "@/components/engine/ConvertOnlyNotice";
import { FormPlaceholder } from "@/components/engine/FormPlaceholder";

/** Create route: /m/{entity}/new */
export default function EntityCreatePage() {
  const { entity } = useParams<{ entity: string }>();
  const params = useSearchParams();
  const schemas = getSchemas(entity);
  if (!schemas) notFound();

  /**
   * Fields the caller already decided, as `?path=value`. This is how a
   * conversion hands over: the delivery order knows which document is being
   * billed, so the invoice opens with that source already chosen rather than
   * asking the user to find it again in a list of hundreds.
   */
  const seed = Object.fromEntries(params.entries());

  /* A document that only exists as a conversion refuses the blank page —
     including this URL typed by hand. What it does not refuse is the handover
     from its own source document. See ConvertOnly in lib/types. */
  const rule = schemas.list.convertOnly;
  if (rule && !rule.allowSeeded?.(seed))
    return <ConvertOnlyNotice entity={entity} label={schemas.list.entity} rule={rule} />;

  /* A document with its own editor is edited as the document. */
  if (schemas.editor) return schemas.editor({});

  /* An entity registered without a form schema degrades to a named
     placeholder rather than a broken screen. */
  if (!schemas.form) {
    return <FormPlaceholder entity={entity} label={schemas.list.entity} mode="create" />;
  }

  return <MasterForm schema={schemas.form} seed={Object.keys(seed).length ? seed : undefined} />;
}
