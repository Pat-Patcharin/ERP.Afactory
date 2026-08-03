/**
 * sheet-to-fixture.mjs — turn a customer workbook into text the repo can use.
 *
 *   node scripts/sheet-to-fixture.mjs tests/fixtures/BP_Master_Sample.csv
 *   node scripts/sheet-to-fixture.mjs tests/fixtures/BP_Master.xlsx "Sheet1"
 *
 * Writes <stem>.csv, <kebab>.json and <kebab>.fixture.ts beside the source.
 * The .fixture.ts is the file tests import and is meant to be committed —
 * git, a diff and a test runner can all read it; none of them can read .xlsx.
 *
 * .csv needs nothing installed. .xlsx needs the parser:  npm i -D xlsx
 * It is deliberately NOT a project dependency — the app never reads a
 * workbook at runtime, only this one-off generator does.
 *
 * Re-run whenever the workbook changes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const [, , srcPath, sheetArg] = process.argv;

if (!srcPath) {
  console.error("Usage: node scripts/sheet-to-fixture.mjs <workbook.xlsx|file.csv> [sheetName]");
  process.exit(1);
}

const ext = extname(srcPath).toLowerCase();

/* ============================================================
   Read — CSV natively, XLSX through the optional parser.
   ============================================================ */

let headers;
let rows;
let sheetName;

if (ext === ".csv") {
  ({ headers, rows } = readCsv(srcPath));
  sheetName = basename(srcPath, ext);
} else {
  ({ headers, rows, sheetName } = await readWorkbook(srcPath, sheetArg));
}

function readCsv(path) {
  /* Strip the BOM before parsing — it is for Excel, not for us, and left in
     place it silently becomes part of the first header name. */
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const grid = parseCsv(text);
  return shape(grid);
}

/** RFC 4180: quoted fields may contain commas, newlines and "" escapes. */
function parseCsv(text) {
  const grid = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      grid.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    grid.push(row);
  }
  return grid;
}

async function readWorkbook(path, wanted) {
  let XLSX;
  try {
    XLSX = await import("xlsx");
  } catch {
    console.error("Reading .xlsx needs the parser:  npm i -D xlsx");
    console.error("(or save the sheet as UTF-8 CSV and point this script at that)");
    process.exit(1);
  }

  const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  const name = wanted ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) {
    console.error(`Sheet "${name}" not found. Available: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }

  /* header:1 gives row-major arrays; raw:false keeps the leading zeros on
     postal codes, phone numbers and tax IDs instead of turning them into
     numbers — losing a leading zero on a phone number is a silent corruption. */
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  return { ...shape(grid), sheetName: name };
}

/** First row is the header; blank rows are dropped; every row is padded to width. */
function shape(grid) {
  if (!grid.length) {
    console.error("The sheet is empty.");
    process.exit(1);
  }
  const headers = grid[0].map((h) => String(h ?? "").trim());
  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => headers.map((_, i) => cell(r[i])));
  return { headers, rows };
}

function cell(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/* ============================================================
   Guard — catch a mis-decoded sheet before it reaches the repo.

   A UTF-8 file read as Latin-1 turns Thai into "à¸à¸¥à¸´". The damage is
   NOT reversible: the third byte of most Thai characters lands in the
   C1 control range, which most transports strip. By the time it looks
   wrong on screen the original is already gone — so refuse to write.
   ============================================================ */

const MOJIBAKE = /Ã.|Â.|à¸|à¹|â€|Ã¢/;

const suspect = [];
for (let r = 0; r < rows.length; r++) {
  for (let c = 0; c < headers.length; c++) {
    if (MOJIBAKE.test(rows[r][c])) {
      suspect.push(`row ${r + 2}, column "${headers[c]}": ${rows[r][c].slice(0, 40)}`);
    }
  }
}

if (suspect.length) {
  console.error(`Refusing to write — ${suspect.length} cell(s) look mis-decoded:\n`);
  for (const s of suspect.slice(0, 5)) console.error("  " + s);
  if (suspect.length > 5) console.error(`  …and ${suspect.length - 5} more`);
  console.error(
    "\nThe source is probably UTF-8 being read as Latin-1 (or was saved that way).",
  );
  console.error("Re-export the sheet as UTF-8 and run again. Repairing this later is not possible.");
  process.exit(1);
}

/* ============================================================
   Write
   ============================================================ */

const outDir = dirname(srcPath);
const stem = basename(srcPath, ext);
const kebab = stem.toLowerCase().replace(/[_\s]+/g, "-");

/* ---- CSV. BOM first so Excel on Windows opens Thai without mojibake. ---- */
const csvCell = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
writeFileSync(join(outDir, `${stem}.csv`), "﻿" + csv + "\r\n", "utf8");

/* ---- JSON ---- */
const records = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
writeFileSync(join(outDir, `${kebab}.json`), JSON.stringify(records, null, 2) + "\n", "utf8");

/* ---- TypeScript fixture ---- */
const q = (s) => JSON.stringify(s);
const constName = kebab.toUpperCase().replace(/-/g, "_");

const ts = `/**
 * Generated from ${basename(srcPath)} · sheet "${sheetName}" · ${rows.length} rows × ${headers.length} columns.
 * Do not edit by hand — run \`node scripts/sheet-to-fixture.mjs\` instead.
 */

export const ${constName}_HEADERS = [
${headers.map((h) => `  ${q(h)},`).join("\n")}
] as const;

export type ${pascal(kebab)}Header = (typeof ${constName}_HEADERS)[number];

/** Row-major cell values, aligned to the headers. Every cell is a string, as it is straight out of a sheet parse. */
export const ${constName}_ROWS: string[][] = [
${rows.map((r) => `  [${r.map(q).join(", ")}],`).join("\n")}
];

/** The same data keyed by header, for assertions that read better by name. */
export const ${constName}_RECORDS: Record<${pascal(kebab)}Header, string>[] = ${constName}_ROWS.map(
  (row) =>
    Object.fromEntries(${constName}_HEADERS.map((h, i) => [h, row[i]])) as Record<
      ${pascal(kebab)}Header,
      string
    >,
);

/** Tab-separated — exactly what the clipboard holds when the sheet is copied out of Excel. */
export const ${constName}_TSV: string = [
  ${constName}_HEADERS.join("\\t"),
  ...${constName}_ROWS.map((r) => r.join("\\t")),
].join("\\n");
`;

writeFileSync(join(outDir, `${kebab}.fixture.ts`), ts, "utf8");

function pascal(s) {
  return s.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
}

console.log(
  `${rows.length} rows · ${headers.length} columns → ${stem}.csv, ${kebab}.json, ${kebab}.fixture.ts`,
);
