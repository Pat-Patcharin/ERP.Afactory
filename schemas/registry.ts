import type { EntitySchemas, RecordBase } from "@/lib/types";
import { productSchemas } from "./product";
import { bpSchemas } from "./business-partner";
import { warehouseSchemas } from "./warehouse";
import { salesRepSchemas } from "./sales-rep";
import { priceListSchemas } from "./price-list";
import { prSchemas } from "./purchase-request";
import { poSchemas } from "./purchase-order";
import { grSchemas } from "./goods-receipt";
import { qcSchemas } from "./qc-inspection";
import { paSchemas } from "./put-away";
import { qtSchemas } from "./quotation";
import { srSchemas } from "./sales-request";
import { soSchemas } from "./sales-order";
import { pickSchemas } from "./picking";
import { packSchemas } from "./packing";
import { doSchemas } from "./delivery-order";
import { invSchemas } from "./sales-invoice";
import { shpSchemas } from "./shipment";
import { rtnSchemas } from "./sales-return";
import { cnSchemas } from "./credit-note";
import { stockInquirySchemas } from "./stock-inquiry";
import { stockCardSchemas } from "./stock-card";
import { productStockCardSchemas } from "./product-stock-card";
import { stockTransferSchemas } from "./stock-transfer";
import { stockTransferForm } from "./forms/stock-transfer";
import { stockAdjustmentSchemas } from "./stock-adjustment";
import { stockAdjustmentForm } from "./forms/stock-adjustment";
import { cycleCountSchemas } from "./cycle-count";
import { cycleCountForm } from "./forms/cycle-count";
import { lotTrackingSchemas } from "./lot-tracking";
import { serialTrackingSchemas } from "./serial-tracking";
import { scanHistorySchemas } from "./scan-history";
import { priceListMasterSchemas } from "./price-list-master";
import {
  adminAuditSchemas,
  adminRoleSchemas,
  adminScopeSchemas,
  adminSeriesSchemas,
  adminUserSchemas,
  adminWorkflowSchemas,
} from "./administration";

/**
 * Entity registry — the single place that maps a URL segment to its schemas.
 * Adding a master means writing one schema file and one line here; the list,
 * detail, drawer and form routes all pick it up automatically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const REGISTRY: Record<string, EntitySchemas<any>> = {
  /* Master data */
  product: productSchemas,
  "business-partner": bpSchemas,
  warehouse: warehouseSchemas,
  "sales-rep": salesRepSchemas,
  "price-list": priceListSchemas,
  /* Catalogue price per SKU. Read-only: the file is generated. */
  "price-list-master": priceListMasterSchemas,

  /* Purchase-to-stock documents */
  "purchase-request": prSchemas,
  "purchase-order": poSchemas,
  "goods-receipt": grSchemas,
  "qc-inspection": qcSchemas,
  "put-away": paSchemas,

  /* Order-to-delivery documents */
  quotation: qtSchemas,
  "sales-request": srSchemas,
  "sales-order": soSchemas,
  picking: pickSchemas,
  packing: packSchemas,
  "delivery-order": doSchemas,
  "sales-invoice": invSchemas,
  shipment: shpSchemas,
  "sales-return": rtnSchemas,
  "credit-note": cnSchemas,

  /* Inventory */
  "stock-inquiry": stockInquirySchemas,
  "stock-card": stockCardSchemas,
  "product-stock-card": productStockCardSchemas,
  "stock-transfer": { ...stockTransferSchemas, form: stockTransferForm },
  "stock-adjustment": { ...stockAdjustmentSchemas, form: stockAdjustmentForm },
  "cycle-count": { ...cycleCountSchemas, form: cycleCountForm },
  "lot-tracking": lotTrackingSchemas,
  "serial-tracking": serialTrackingSchemas,
  "scan-history": scanHistorySchemas,

  /* Administration — same engine, no bespoke tables. */
  "admin-user": adminUserSchemas,
  "admin-role": adminRoleSchemas,
  "admin-scope": adminScopeSchemas,
  "admin-workflow": adminWorkflowSchemas,
  "admin-series": adminSeriesSchemas,
  "admin-audit": adminAuditSchemas,
};

export const ENTITY_KEYS = Object.keys(REGISTRY);

export const getSchemas = (entity: string) => REGISTRY[entity] ?? null;

/** Resolve a record straight from its list source — no separate index needed. */
export function findRecord(entity: string, code: string): RecordBase | null {
  const s = getSchemas(entity);
  if (!s) return null;
  const wanted = decodeURIComponent(code);
  return s.list.source().find((r: RecordBase) => r.code === wanted) ?? null;
}
