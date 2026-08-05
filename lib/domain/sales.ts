import { SALES_REPRESENTATIVES as RAW, type SalesRep } from "@/data/sales-reps";
import {
  SALES_AREAS,
  SALES_AREA_GROUPS,
  areaCoverage,
  inSalesArea,
  salesArea,
  type SalesArea,
} from "@/data/sales-areas";
import { DASH, initials } from "@/lib/format";

export interface SalesRepRow extends SalesRep {
  name: string;
  fullName: string;
  avatar: string;
  icon: string;
  /** Area display name — "BKK1 ฝั่งธน". Falls back to the raw code. */
  areaName: string;
  /** Group the area rolls up into — BKK / ตจว เหนือ-อีสาน / ตจว กลาง-ออก-ใต้. */
  areaGroup: string;
  /** "21 เขต กทม. · 1 จังหวัด" — how much ground the area covers. */
  areaCoverage: string;
  /**
   * False when the rep's base province is not one their area owns. Kept as a
   * flag rather than a hard error so an existing record still loads and shows
   * the problem instead of disappearing.
   */
  areaMatchesProvince: boolean;
}

export const SALES_REPRESENTATIVES = RAW as SalesRepRow[];

export function decorateSRs() {
  for (const r of SALES_REPRESENTATIVES) {
    r.name = `${r.first} ${r.last}`;
    r.fullName = `${r.title}${r.first} ${r.last}`;
    r.avatar = initials(`${r.first} ${r.last}`);
    r.icon = "👤";

    const area = salesArea(r.area);
    r.areaName = area?.name ?? r.area ?? DASH;
    r.areaGroup =
      SALES_AREA_GROUPS.find((g) => g.key === area?.group)?.short ?? DASH;
    r.areaCoverage = areaCoverage(r.area);
    r.areaMatchesProvince = Boolean(area) && inSalesArea(r.area, r.province);
  }
}

decorateSRs();

export const getSalesRep = (code: string) =>
  SALES_REPRESENTATIVES.find((r) => r.code === code) ?? null;

export function nextSRCode(): string {
  const n = SALES_REPRESENTATIVES.reduce(
    (m, r) => Math.max(m, parseInt(String(r.code).replace(/\D/g, ""), 10) || 0),
    0,
  );
  return `SALE${String(n + 1).padStart(3, "0")}`;
}

/* ---------- Territory coverage ---------- */

export interface AreaCoverageRow {
  area: SalesArea;
  groupName: string;
  reps: SalesRepRow[];
  activeReps: SalesRepRow[];
  customers: number;
}

/**
 * Every area with the reps who work it. Areas with no rep stay in the list
 * with an empty array — an uncovered territory is the thing worth seeing,
 * so it must not be filtered away.
 */
export function areaCoverageRows(): AreaCoverageRow[] {
  return SALES_AREAS.map((area) => {
    const reps = SALES_REPRESENTATIVES.filter((r) => r.area === area.code);
    return {
      area,
      groupName: SALES_AREA_GROUPS.find((g) => g.key === area.group)?.short ?? DASH,
      reps,
      activeReps: reps.filter((r) => r.status === "Active"),
      customers: reps.reduce((s, r) => s + (Number(r.custCount) || 0), 0),
    };
  });
}

/** Areas with no active rep — the gap the sales manager needs to fill. */
export const uncoveredAreas = () =>
  areaCoverageRows().filter((c) => c.activeReps.length === 0);
