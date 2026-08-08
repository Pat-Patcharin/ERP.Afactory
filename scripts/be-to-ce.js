/*
 * D3 — rewrite Buddhist-era dates in data/ into the Gregorian era.
 *
 * The pattern is deliberately narrow: dd/mm/yyyy with a year in 2400–2600,
 * and both day and month must be plausible. That excludes:
 *
 *   QT2506-0001   no slashes
 *   PL-STD-2026   no slashes, and 2026 is not in range anyway
 *   "2569"        a bare year with no dd/mm in front
 *   45/13/2569    impossible day or month — left alone and REPORTED
 *
 * Every file is counted before and after, and the totals are checked against
 * the survey figure. A silent mismatch is the failure mode this guards.
 */
const fs = require("fs");
const path = require("path");

const EXPECTED = {
  "admin.ts": 78,
  "quotations.ts": 74,
  "sales-requests.ts": 63,
  "partners.ts": 61,
  "sales-orders.ts": 41,
  "warehouses.ts": 38,
  "delivery-orders.ts": 37,
  "partner-profiles.ts": 29,
  "picking.ts": 27,
  "packing.ts": 17,
  "products.ts": 14,
  "notifications.ts": 2,
};
const EXPECTED_TOTAL = Object.values(EXPECTED).reduce((a, b) => a + b, 0);

/* dd/mm/yyyy where yyyy is 2400–2600. Day and month validated in the callback. */
const DATE = /\b(\d{2})\/(\d{2})\/(2[4-6]\d{2})\b/g;

const apply = (write) => {
  const files = fs.readdirSync("data").filter((f) => f.endsWith(".ts"));
  const counts = {};
  const skipped = [];
  let total = 0;

  for (const name of files) {
    const p = path.join("data", name);
    const src = fs.readFileSync(p, "utf8");
    let n = 0;

    const out = src.replace(DATE, (whole, dd, mm, yyyy) => {
      const d = Number(dd);
      const m = Number(mm);
      if (d < 1 || d > 31 || m < 1 || m > 12) {
        skipped.push(`${name}: ${whole} (impossible day/month)`);
        return whole;
      }
      n++;
      return `${dd}/${mm}/${Number(yyyy) - 543}`;
    });

    if (n) {
      counts[name] = n;
      total += n;
      if (write) fs.writeFileSync(p, out, "utf8");
    }
  }
  return { counts, total, skipped };
};

const mode = process.argv[2];
const { counts, total, skipped } = apply(mode === "--write");

console.log("file".padEnd(24) + "found".padStart(7) + "expected".padStart(10) + "   ok?");
const names = new Set([...Object.keys(counts), ...Object.keys(EXPECTED)]);
let mismatch = 0;
for (const n of [...names].sort()) {
  const got = counts[n] ?? 0;
  const exp = EXPECTED[n] ?? 0;
  const ok = got === exp;
  if (!ok) mismatch++;
  console.log(n.padEnd(24) + String(got).padStart(7) + String(exp).padStart(10) + (ok ? "   ok" : "   ** MISMATCH **"));
}
console.log("-".repeat(48));
console.log("TOTAL".padEnd(24) + String(total).padStart(7) + String(EXPECTED_TOTAL).padStart(10));

if (skipped.length) {
  console.log(`\nSKIPPED (not rewritten): ${skipped.length}`);
  skipped.forEach((s) => console.log("  " + s));
}

if (mismatch) {
  console.error(`\nFAILED: ${mismatch} file(s) differ from the surveyed counts.`);
  process.exit(1);
}
if (total !== EXPECTED_TOTAL) {
  console.error(`\nFAILED: total ${total} != surveyed ${EXPECTED_TOTAL}`);
  process.exit(1);
}
console.log(`\n${mode === "--write" ? "WROTE" : "DRY RUN"} — all counts match the survey.`);
