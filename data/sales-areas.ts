/**
 * Sales Area master — the canonical territory map every module reads.
 *
 * A sales area owns whole provinces, except inside Bangkok where the split
 * is by district (เขต): all four BKK areas share the province
 * "กรุงเทพมหานคร", so a Bangkok address only resolves to an area once the
 * district is known. That is why `resolveSalesArea()` takes a district.
 *
 * Source: the sales territory sheet (เขตที่รับผิดชอบ / พื้นที่รับผิดชอบ).
 * Two corrections were applied to it, both confirmed by the business:
 *   - ชัยนาท and อุทัยธานี appeared under both เหนือล่าง and กลาง-บน;
 *     they belong to กลาง-บน only.
 *   - สุพรรณบุรี was missing from every area; it belongs to กลาง-บน.
 * The result is a clean partition: each of the 77 provinces and each of the
 * 50 Bangkok districts belongs to exactly one area. `UNCOVERED_PROVINCES`
 * and `SHARED_PROVINCES` below re-derive that claim at load time, so a bad
 * edit to this file shows up as a non-empty array rather than silently.
 */

export type SalesAreaGroupKey = "BKK" | "UPC_N_NE" | "UPC_C_E_S";

export interface SalesAreaGroup {
  key: SalesAreaGroupKey;
  /** Full label, as the sheet words it. */
  name: string;
  /** Chip-sized label for tables and filters. */
  short: string;
}

/**
 * The two orange rows in the sheet are not areas — they are the upcountry
 * supervisor groupings that the areas below them roll up into.
 */
export const SALES_AREA_GROUPS: SalesAreaGroup[] = [
  { key: "BKK", name: "กรุงเทพฯ และปริมณฑล", short: "BKK" },
  { key: "UPC_N_NE", name: "ตจว — เหนือบน-ล่าง, อีสานบน-ล่าง", short: "ตจว เหนือ-อีสาน" },
  { key: "UPC_C_E_S", name: "ตจว — ตะวันออก, กลาง, ใต้บน-ล่าง", short: "ตจว กลาง-ออก-ใต้" },
];

export interface SalesArea {
  /** Stable key used by every other record. Never re-use a retired code. */
  code: string;
  /** Area name on its own — "ฝั่งธน", "เหนือบน". */
  label: string;
  /** Display name — "BKK1 ฝั่งธน". */
  name: string;
  group: SalesAreaGroupKey;
  /** Bangkok districts owned by this area. Empty for upcountry areas. */
  districts: string[];
  /** Whole provinces owned by this area. */
  provinces: string[];
}

/* Ordered by code within each group. The source sheet interleaves BKK3 at the
   bottom; grouping them together reads better in a filter dropdown. */
export const SALES_AREAS: SalesArea[] = [
  {
    code: "BKK1",
    label: "ฝั่งธน",
    name: "BKK1 ฝั่งธน",
    group: "BKK",
    districts: [
      "ทวีวัฒนา",
      "ภาษีเจริญ",
      "บางกอกน้อย",
      "บางกอกใหญ่",
      "คลองสาน",
      "ธนบุรี",
      "หนองแขม",
      "บางแค",
      "บางบอน",
      "บางขุนเทียน",
      "จอมทอง",
      "ทุ่งครุ",
      "ตลิ่งชัน",
      "ราษฎร์บูรณะ",
      "บางรัก",
      "สาทร",
      "บางคอแหลม",
      "ยานนาวา",
      "พระนคร",
      "สัมพันธวงศ์",
      "ป้อมปราบศัตรูพ่าย",
    ],
    provinces: [],
  },
  {
    code: "BKK2",
    label: "นนทบุรี",
    name: "BKK2 นนทบุรี",
    group: "BKK",
    districts: [
      "บางซื่อ",
      "จตุจักร",
      "ลาดพร้าว",
      "ดุสิต",
      "พญาไท",
      "บางพลัด",
      "ราชเทวี",
      "ห้วยขวาง",
    ],
    provinces: ["นนทบุรี"],
  },
  {
    code: "BKK3",
    label: "สมุทรปราการ",
    name: "BKK3 สมุทรปราการ",
    group: "BKK",
    districts: [
      "ดินแดง",
      "ปทุมวัน",
      "วัฒนา",
      "คลองเตย",
      "สวนหลวง",
      "พระโขนง",
      "บางนา",
      "ประเวศ",
    ],
    provinces: ["สมุทรปราการ"],
  },
  {
    code: "BKK4",
    label: "ปทุมธานี",
    name: "BKK4 ปทุมธานี",
    group: "BKK",
    districts: [
      "บางเขน",
      "หลักสี่",
      "ดอนเมือง",
      "สายไหม",
      "วังทองหลาง",
      "บางกะปิ",
      "สะพานสูง",
      "บึงกุ่ม",
      "คันนายาว",
      "ลาดกระบัง",
      "มีนบุรี",
      "หนองจอก",
      "คลองสามวา",
    ],
    provinces: ["ปทุมธานี"],
  },

  {
    code: "N-UP",
    label: "เหนือบน",
    name: "เหนือบน",
    group: "UPC_N_NE",
    districts: [],
    provinces: ["เชียงใหม่", "เชียงราย", "พะเยา", "แม่ฮ่องสอน", "ลำพูน", "ลำปาง", "แพร่", "น่าน"],
  },
  {
    code: "N-LOW",
    label: "เหนือล่าง",
    name: "เหนือล่าง",
    group: "UPC_N_NE",
    districts: [],
    /* ชัยนาท and อุทัยธานี were listed here too; they sit in C-UP. */
    provinces: [
      "อุตรดิตถ์",
      "สุโขทัย",
      "ตาก",
      "พิษณุโลก",
      "กำแพงเพชร",
      "พิจิตร",
      "เพชรบูรณ์",
      "นครสวรรค์",
    ],
  },
  {
    code: "NE-UP",
    label: "อีสานบน",
    name: "อีสานบน",
    group: "UPC_N_NE",
    districts: [],
    provinces: [
      "เลย",
      "หนองคาย",
      "บึงกาฬ",
      "หนองบัวลำภู",
      "อุดรธานี",
      "สกลนคร",
      "นครพนม",
      "มุกดาหาร",
    ],
  },
  {
    code: "NE-MID",
    label: "อีสานกลาง",
    name: "อีสานกลาง",
    group: "UPC_N_NE",
    districts: [],
    provinces: ["ชัยภูมิ", "ขอนแก่น", "กาฬสินธุ์", "มหาสารคาม", "ร้อยเอ็ด", "ยโสธร", "อำนาจเจริญ"],
  },
  {
    code: "NE-LOW",
    label: "อีสานล่าง",
    name: "อีสานล่าง",
    group: "UPC_N_NE",
    districts: [],
    provinces: ["นครราชสีมา", "บุรีรัมย์", "สุรินทร์", "ศรีสะเกษ", "อุบลราชธานี"],
  },

  {
    code: "C-UP",
    label: "กลาง-บน",
    name: "กลาง-บน",
    group: "UPC_C_E_S",
    districts: [],
    /* สุพรรณบุรี was absent from the source sheet and was added here. */
    provinces: [
      "ลพบุรี",
      "สระบุรี",
      "สิงห์บุรี",
      "อ่างทอง",
      "พระนครศรีอยุธยา",
      "นครนายก",
      "ชัยนาท",
      "อุทัยธานี",
      "สุพรรณบุรี",
    ],
  },
  {
    code: "C-LOW",
    label: "กลาง-ล่าง",
    name: "กลาง-ล่าง",
    group: "UPC_C_E_S",
    districts: [],
    provinces: ["เพชรบุรี", "สมุทรสาคร", "สมุทรสงคราม", "ราชบุรี", "นครปฐม", "กาญจนบุรี"],
  },
  {
    code: "EAST",
    label: "ตะวันออก",
    name: "ตะวันออก",
    group: "UPC_C_E_S",
    districts: [],
    provinces: ["ชลบุรี", "ระยอง", "จันทบุรี", "ตราด", "ฉะเชิงเทรา", "ปราจีนบุรี", "สระแก้ว"],
  },
  {
    code: "S-UP",
    label: "ใต้บน",
    name: "ใต้บน",
    group: "UPC_C_E_S",
    districts: [],
    provinces: ["ระนอง", "ชุมพร", "สุราษฎร์ธานี", "นครศรีธรรมราช", "พัทลุง", "ประจวบคีรีขันธ์"],
  },
  {
    code: "S-LOW",
    label: "ใต้ล่าง",
    name: "ใต้ล่าง",
    group: "UPC_C_E_S",
    districts: [],
    provinces: ["พังงา", "ภูเก็ต", "กระบี่", "ตรัง", "สตูล", "สงขลา", "ปัตตานี", "ยะลา", "นราธิวาส"],
  },
];

/** Bangkok is split by district, so it is not listed on any area's provinces. */
export const BANGKOK = "กรุงเทพมหานคร";

const thSort = (a: string, b: string) => a.localeCompare(b, "th");

export const SALES_AREA_CODES = SALES_AREAS.map((a) => a.code);
export const SALES_AREA_NAMES = SALES_AREAS.map((a) => a.name);

export const SALES_AREA_BY_CODE: Record<string, SalesArea> = Object.fromEntries(
  SALES_AREAS.map((a) => [a.code, a]),
);

export const salesArea = (code: string): SalesArea | null =>
  SALES_AREA_BY_CODE[code] ?? null;

export const salesAreaName = (code: string): string =>
  SALES_AREA_BY_CODE[code]?.name ?? code;

export const salesAreaGroup = (code: string): SalesAreaGroup | null =>
  SALES_AREA_GROUPS.find((g) => g.key === SALES_AREA_BY_CODE[code]?.group) ?? null;

/** Bangkok's 50 districts, sorted for pickers. */
export const BKK_DISTRICTS: string[] = SALES_AREAS.flatMap((a) => a.districts).sort(thSort);

/**
 * Every province a rep or a partner can be based in — the 76 upcountry ones
 * the areas own, plus Bangkok itself.
 */
export const PROVINCES: string[] = [
  BANGKOK,
  ...SALES_AREAS.flatMap((a) => a.provinces),
].sort(thSort);

/** province → the codes of every area claiming it. One entry each, by design. */
export const AREAS_BY_PROVINCE: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const a of SALES_AREAS) for (const p of a.provinces) (m[p] ??= []).push(a.code);
  /* Bangkok belongs to all four BKK areas — the district decides which. */
  m[BANGKOK] = SALES_AREAS.filter((a) => a.districts.length).map((a) => a.code);
  return m;
})();

/** Bangkok district → area code. */
export const AREA_BY_DISTRICT: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const a of SALES_AREAS) for (const d of a.districts) m[d] = a.code;
  return m;
})();

/**
 * The area that owns an address. A Bangkok address needs its district; give
 * it one and the district wins, since all four BKK areas share the province.
 * Returns null when the address falls outside the map — an unmapped province,
 * or Bangkok with no district recorded.
 */
export function resolveSalesArea(province: string, district?: string): SalesArea | null {
  const p = (province ?? "").trim();
  const d = (district ?? "").trim();
  /* The district only disambiguates inside Bangkok. Upcountry amphoe names
     can collide with a Bangkok district, so they must never be looked up
     against the district map. */
  if (p === BANGKOK || !p) {
    return d ? SALES_AREA_BY_CODE[AREA_BY_DISTRICT[d]] ?? null : null;
  }
  const codes = AREAS_BY_PROVINCE[p] ?? [];
  return codes.length === 1 ? SALES_AREA_BY_CODE[codes[0]] : null;
}

/**
 * True when the address sits inside the area. A Bangkok address with no
 * district recorded counts as inside any BKK area — it cannot be ruled out,
 * and flagging it would cry wolf on every half-filled address.
 */
export function inSalesArea(code: string, province: string, district?: string): boolean {
  const a = SALES_AREA_BY_CODE[code];
  if (!a) return false;
  const p = (province ?? "").trim();
  const d = (district ?? "").trim();
  if (p === BANGKOK || !p) {
    if (d && AREA_BY_DISTRICT[d]) return AREA_BY_DISTRICT[d] === code;
    return a.districts.length > 0;
  }
  return a.provinces.includes(p);
}

/** Provinces a rep in this area can be based in, for narrowing a picker. */
export function provincesOfArea(code: string): string[] {
  const a = SALES_AREA_BY_CODE[code];
  if (!a) return PROVINCES;
  return a.districts.length ? [BANGKOK, ...a.provinces] : [...a.provinces];
}

/** How much ground an area covers — used on the rep detail and in tooltips. */
export function areaCoverage(code: string): string {
  const a = SALES_AREA_BY_CODE[code];
  if (!a) return "";
  const parts: string[] = [];
  if (a.districts.length) parts.push(`${a.districts.length} เขต กทม.`);
  if (a.provinces.length) parts.push(`${a.provinces.length} จังหวัด`);
  return parts.join(" · ");
}

/* ---------- Integrity, re-derived rather than asserted ---------- */

/** All 77 provinces, so a gap in the area map is detectable. */
export const THAI_PROVINCES: string[] = [
  "กระบี่", "กรุงเทพมหานคร", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น",
  "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร",
  "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก",
  "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี",
  "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์",
  "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง",
  "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต",
  "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด",
  "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน",
  "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ",
  "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย",
  "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง",
  "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี",
];

/** Provinces no area claims. Expected to be empty. */
export const UNCOVERED_PROVINCES: string[] = THAI_PROVINCES.filter(
  (p) => p !== BANGKOK && !AREAS_BY_PROVINCE[p]?.length,
);

/** Provinces claimed by more than one area. Expected to be empty. */
export const SHARED_PROVINCES: string[] = Object.entries(AREAS_BY_PROVINCE)
  .filter(([p, codes]) => p !== BANGKOK && codes.length > 1)
  .map(([p]) => p);
