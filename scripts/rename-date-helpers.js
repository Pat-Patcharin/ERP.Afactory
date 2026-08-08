/*
 * D4 follow-up — rename the two date-format helpers to say what they do.
 *
 *   toDisplayDate  →  isoToDmy      2026-06-22 → 22/06/2026
 *   toInputDate    →  dmyToIso      22/06/2026 → 2026-06-22
 *
 * The old names describe a PURPOSE ("for display", "for the input"), and the
 * purpose was never true: 73 of toDisplayDate's call sites write the result
 * into a record. That misreading is what made "convert to BE inside
 * toDisplayDate" look like a one-line change when it would have put Buddhist
 * years back into data/. The new names describe the TRANSFORMATION, which
 * cannot be wrong about intent because it makes no claim about intent.
 *
 * Assertions, because a rename that half-lands is worse than no rename:
 *   · the new names must not already exist anywhere
 *   · every old occurrence must be replaced — zero left afterwards
 *   · the per-file totals before and after must match exactly
 *
 * Run with --write; without it, nothing is touched.
 */
const fs = require("fs");
const path = require("path");

const RENAMES = [
  { from: "toDisplayDate", to: "isoToDmy" },
  { from: "toInputDate", to: "dmyToIso" },
];

const SKIP = new Set(["node_modules", ".next", ".git", "dist"]);
const EXT = /\.(ts|tsx|md)$/;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return EXT.test(e.name) ? [full] : [];
  });
}

const count = (src, word) => (src.match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length;

const files = walk(".");
const write = process.argv[2] === "--write";

/* --- guard: the destination names must be free --- */
for (const { to } of RENAMES) {
  const taken = files.filter((f) => count(fs.readFileSync(f, "utf8"), to) > 0);
  if (taken.length) {
    console.error(`FAILED: "${to}" already exists in ${taken.length} file(s):`);
    taken.forEach((f) => console.error("  " + f));
    process.exit(1);
  }
}

const before = {};
const touched = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  let out = src;
  let n = 0;

  for (const { from, to } of RENAMES) {
    const c = count(src, from);
    if (!c) continue;
    before[from] = (before[from] ?? 0) + c;
    n += c;
    out = out.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }

  if (!n) continue;
  touched.push({ file, n });

  /* --- guard: nothing of the old names survives in this file --- */
  for (const { from } of RENAMES) {
    if (count(out, from) !== 0) {
      console.error(`FAILED: ${file} still contains "${from}" after replacement`);
      process.exit(1);
    }
  }

  /* --- guard: the count moved across, it did not evaporate --- */
  const moved = RENAMES.reduce((t, { from, to }) => t + count(out, to) - count(src, to), 0);
  if (moved !== n) {
    console.error(`FAILED: ${file} expected ${n} replacements, counted ${moved}`);
    process.exit(1);
  }

  if (write) fs.writeFileSync(file, out, "utf8");
}

const total = touched.reduce((t, f) => t + f.n, 0);
console.log(`${touched.length} files · ${total} references`);
for (const { from, to } of RENAMES) console.log(`  ${from} → ${to}  ${before[from] ?? 0}`);
console.log(`\n${write ? "WROTE" : "DRY RUN"} — every occurrence accounted for.`);
