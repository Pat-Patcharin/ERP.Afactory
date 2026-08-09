import raw from "@/data/thai-geography.json";

/* ============================================================
   THAI ADMINISTRATIVE DIVISIONS — จังหวัด › อำเภอ › ตำบล

   The address form used to ask for อำเภอ and ตำบล as free text
   everywhere outside Bangkok, because the only district list in
   the repo was the fifty เขต that the sales area master needs to
   resolve a Bangkok address. Fifty of nine hundred and twenty-
   eight, and no tambon at all.

   Writing the rest by hand was not an option and is worth saying
   plainly: an invented amphoe reads exactly like a real one, and
   the cost of getting it wrong is a lorry at the wrong address.
   So the list is a retrieved dataset, not a remembered one —
   `data/thai-geography.json`, with its origin recorded in the
   file.

   Checked against what this repo already believed before being
   used, and the two agree exactly:

     77  provinces      identical to THAI_PROVINCES
     50  BKK districts  identical to the sales area master's
    928  districts
   7436  subdistricts   every one carrying a postal code

   That the province and district strings match to the character
   is what makes the cascade safe: `resolveSalesArea()` matches on
   those same strings, so an address filled from these dropdowns
   still resolves to a sales area.
   ============================================================ */

interface Subdistrict {
  /** [ชื่อตำบล, รหัสไปรษณีย์] — a tuple, to keep 7,436 rows small. */
  0: string;
  1: string;
}

interface RawDistrict {
  name: string;
  subdistricts: [string, string][];
}

interface RawProvince {
  name: string;
  districts: RawDistrict[];
}

interface RawFile {
  schema_version: number;
  source: string;
  retrieved: string;
  counts: { provinces: number; districts: number; subdistricts: number };
  provinces: RawProvince[];
}

const FILE = raw as RawFile;

/** Where the data came from and when — shown wherever it is worth citing. */
export const THAI_GEOGRAPHY_META = {
  source: FILE.source,
  retrieved: FILE.retrieved,
  counts: FILE.counts,
};

const BY_PROVINCE = new Map<string, RawProvince>(FILE.provinces.map((p) => [p.name, p]));

/** Every province, in the file's order. Same 77 as `THAI_PROVINCES`. */
export const geographyProvinces = (): string[] => FILE.provinces.map((p) => p.name);

/**
 * The อำเภอ (or เขต, in Bangkok) of one province.
 *
 * An unknown or blank province gives an empty list rather than everything:
 * an address with no province chosen has no district to offer, and offering
 * all 928 would invite a district that does not belong to the province the
 * user picks next.
 */
export function districtsOf(province: string): string[] {
  const p = BY_PROVINCE.get(String(province ?? "").trim());
  return p ? p.districts.map((d) => d.name) : [];
}

/** The ตำบล (or แขวง) of one district within one province. */
export function subdistrictsOf(province: string, district: string): string[] {
  const p = BY_PROVINCE.get(String(province ?? "").trim());
  const d = p?.districts.find((x) => x.name === String(district ?? "").trim());
  return d ? d.subdistricts.map(([name]) => name) : [];
}

/**
 * The postal code for one ตำบล. Empty when the address is not resolved down
 * to a subdistrict — most Thai postal codes cover several tambon, so there is
 * no honest answer from a district alone.
 */
export function postalCodeOf(province: string, district: string, subdistrict: string): string {
  const p = BY_PROVINCE.get(String(province ?? "").trim());
  const d = p?.districts.find((x) => x.name === String(district ?? "").trim());
  const s = d?.subdistricts.find(([name]) => name === String(subdistrict ?? "").trim());
  return s ? s[1] : "";
}

export type { Subdistrict };
