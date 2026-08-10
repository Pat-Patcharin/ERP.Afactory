import { WAREHOUSES as RAW, type Warehouse } from "@/data/warehouses";

export interface WarehouseRow extends Warehouse {
  util: number;
  /** Bins are what Put Away and Picking need to know exist. */
  binCount: number;
  fullAddr: string;
  /** A warehouse holding stock must never be hard-deleted. */
  hasStock: boolean;
}

/* ---------- Generic nested-structure helpers ---------- */

interface Node {
  code?: string;
  name?: string;
  children?: Node[];
  [k: string]: unknown;
}

/** Count nodes at a given depth — Zone / Rack / Shelf / Bin totals. */
export function countLevel(nodes: Node[] | undefined, depth: number, cur = 0): number {
  if (!nodes) return 0;
  if (cur === depth) return nodes.length;
  return nodes.reduce((n, x) => n + countLevel(x.children, depth, cur + 1), 0);
}

export const WAREHOUSES = RAW as WarehouseRow[];

export function decorateWarehouses() {
  for (const w of WAREHOUSES) {
    w.util = w.rules.maxCap ? Math.round((w.rules.curCap / w.rules.maxCap) * 100) : 0;
    w.binCount = countLevel(w.locations as Node[], 3);
    w.fullAddr = [w.addr.line, w.addr.sub, w.addr.dist, w.addr.prov, w.addr.zip]
      .filter(Boolean)
      .join(" ");
    w.hasStock = w.inv.qty > 0;
  }
}

decorateWarehouses();

export const getWarehouse = (code: string) =>
  WAREHOUSES.find((w) => w.code === code) ?? null;

export interface BinRow {
  zone: string;
  rack: string;
  shelf: string;
  bin: string;
  name: string;
  binType: string;
  cap: number;
  capUnit: string;
  temp: string;
  pick: boolean;
  putaway: boolean;
  status: string;
  /** Full location path — the barcode / RFID label key. */
  path: string;
  whCode: string;
  whName: string;
}

/**
 * Flatten the tree into bin rows — the shape future WMS features (picking,
 * put-away, cycle count) will consume.
 */
export function flattenBins(w: WarehouseRow): BinRow[] {
  const out: BinRow[] = [];
  for (const z of (w.locations ?? []) as Node[]) {
    for (const r of z.children ?? []) {
      for (const sh of r.children ?? []) {
        for (const b of sh.children ?? []) {
          out.push({
            zone: String(z.code),
            rack: String(r.code),
            shelf: String(sh.code),
            bin: String(b.code),
            name: String(b.name ?? ""),
            binType: String(b.binType ?? "—"),
            cap: Number(b.cap ?? 0),
            capUnit: String(b.capUnit ?? "—"),
            temp: String(b.temp ?? "—"),
            pick: Boolean(b.pick),
            putaway: Boolean(b.putaway),
            status: String(b.status ?? "Active"),
            path: `${w.code}/${z.code}/${r.code}/${sh.code}/${b.code}`,
            whCode: w.code,
            whName: w.name,
          });
        }
      }
    }
  }
  return out;
}

/* No `whTreeNodes`. The warehouse page no longer renders the location tree,
   and the tree that is stored is consumed as flat bin rows everywhere else. */
