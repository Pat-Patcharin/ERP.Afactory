"use client";

import { notFound, useParams } from "next/navigation";
import { ListView } from "@/components/engine/ListView";
import { getSchemas } from "@/schemas/registry";

/**
 * Generic master list route. One file serves every registered entity —
 * /m/product, /m/warehouse, /m/purchase-order all land here.
 */
export default function EntityListPage() {
  const { entity } = useParams<{ entity: string }>();
  const schemas = getSchemas(entity);
  if (!schemas) notFound();

  // Keyed by entity so switching masters resets filters, sort and paging
  // rather than carrying a Product search across to Warehouse.
  return <ListView key={entity} schema={schemas.list} />;
}
