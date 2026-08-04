import raw from "@/data/pricelist_master.json";
import type { PriceListFile, PriceListItem, PriceStatus } from "./pricing-master";

/* ============================================================
   PRICE LIST REPOSITORY — the only place the master file is read.

   Everything above this line goes through the functions below, so
   swapping the bundled JSON for an API route later is a change to
   this file and nowhere else. No UI module imports the JSON.

   The file is generated, never hand-edited: `gp_*`, `price_dealer`
   and `price_last` are computed, so editing one cell would leave the
   row inconsistent. The repository is therefore read-only by design
   — it exposes no writer.
   ============================================================ */

/** The parsed master file, exactly as generated. */
const FILE = raw as unknown as PriceListFile;

/** Schema version, generation date, source list and record count. */
export const priceListMeta = () => ({
  schemaVersion: FILE.schema_version,
  generatedAt: FILE.generated_at,
  currency: FILE.currency,
  vatIncluded: FILE.vat_included,
  vatRate: FILE.vat_rate,
  source: FILE.source,
  recordCount: FILE.record_count,
  statusCounts: FILE.status_counts,
});

/** The pricing thresholds the file was generated with. */
export const priceListConfig = () => FILE.pricing_config;

/**
 * Every row in the master file, in file order. Callers must treat the
 * array as read-only — it is the parsed module, not a copy.
 */
export const loadPriceListItems = (): readonly PriceListItem[] => FILE.items;

/** Rows carrying one status, for the counts the header reports. */
export const itemsByStatus = (status: PriceStatus): readonly PriceListItem[] =>
  FILE.items.filter((i) => i.status === status);

/**
 * Rows sharing a product code. A code is not unique in this file — five are
 * used twice — so this returns a list rather than one row.
 */
export const itemsByProductCode = (code: string): readonly PriceListItem[] =>
  FILE.items.filter((i) => i.product_code === code);

/** Product codes used by more than one row. */
export function duplicateProductCodes(): string[] {
  const seen = new Map<string, number>();
  for (const i of FILE.items) {
    if (!i.product_code) continue;
    seen.set(i.product_code, (seen.get(i.product_code) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([code]) => code).sort();
}

export type { PriceListFile, PriceListItem, PriceStatus };
