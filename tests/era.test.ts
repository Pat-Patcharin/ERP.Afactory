import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildPrintJob, PRINT_CONFIGS, PRINT_DOC_TYPES } from "@/lib/print";
import { SALES_INVOICES } from "@/data/sales-invoices";

/* ============================================================
   ONE ERA, AND IT IS THE GREGORIAN ONE

   The rule the application now runs on:

     records hold ค.ศ. — always, everywhere
     พ.ศ. is a costume put on at the moment of display

   It is worth saying why, because "we are a Thai company, store
   Thai years" is the intuitive answer and it is the wrong one:

     · every date calculation subtracts one date from another,
       and that only works if both sit on the same axis
     · <input type="date"> speaks ISO ค.ศ. and nothing else
     · a real database stores ค.ศ.; the day this prototype gets
       one, mixed data becomes a migration instead of a decision

   Before D3 the sample data was in พ.ศ. and the code was in
   ค.ศ., and the seam showed: `daysUntil("02/08/2569")` returned
   198,321 — five hundred and forty-three years of runway — so
   no quotation could ever expire and the Expired status, fully
   written, fired on nothing. Zero of seven documents. That is
   this project's recurring failure in its purest form: a rule
   written out completely that refuses nobody.

   Two tests here, one for each half of the rule.
   ============================================================ */

/* dd/mm/yyyy. The year is captured; the era is decided below. */
const DMY = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;

/**
 * Above 2400 is Buddhist, at or below is Gregorian.
 *
 * The boundary is arbitrary but safe by a wide margin in both directions: no
 * business document in this system is dated before 1900, and 2400 BE is 1857.
 */
const isBE = (y: number) => y > 2400;

describe("data holds Gregorian years", () => {
  /*
     A grep test, for the same reason the doc-token tests are grep tests: no
     amount of rendering can demonstrate that a file does NOT contain
     something. Rendering shows what a component did with one record; this
     shows that none of the eight hundred records is carrying the old era.

     The pattern is deliberately narrow — dd/mm/yyyy with both a day and a
     month, and the year restricted to the plausible Buddhist band. Everything
     below is in `data/` today and must keep passing:

       QT2506-0001 · SR2507-0009 · PA25060004    no slashes
       PL-STD-2026 · CC-PLAN-2601 · DC-A-2601    reference codes
       SO-2569-0184 · RJV-2569-0881              our own old numbering
       HOSP-PO-2569-0771                         a CUSTOMER's PO number,
                                                 in the customer's own era —
                                                 not ours to rewrite
       สัญญาสาขา-2569.pdf                        an attachment's filename
       ผ.1234/2567                               a licence number: one slash
       "Retail 2569" · "Standard 2568"           price-list names
       2666.67                                   a price

     Forty such tokens survive in `data/` on purpose. If this test ever fails
     on one of them the answer is to leave the data alone and narrow the
     pattern — the failure would mean the pattern got greedy, not that a
     reference number needs converting.
  */
  const files = readdirSync("data")
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join("data", f));

  it("scans every file in data/, so nothing new can slip in unwatched", () => {
    /* Without this the suite would pass just as happily against an empty
       directory, and a rename of `data/` would silently disarm the guard. */
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)("%s carries no Buddhist-era date", (file) => {
    const src = readFileSync(file, "utf8");
    const found: string[] = [];

    for (const m of src.matchAll(DMY)) {
      const [whole, dd, mm, yyyy] = m;
      const d = Number(dd);
      const mo = Number(mm);
      if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
      if (isBE(Number(yyyy))) {
        const line = src.slice(0, m.index).split("\n").length;
        found.push(`${file}:${line}  ${whole}`);
      }
    }

    expect(found, `Buddhist-era dates must not be stored:\n${found.join("\n")}`).toEqual([]);
  });
});

describe("a printed sheet carries one era", () => {
  /*
     The other half. Records being Gregorian is not the promise made to the
     customer — the promise is that the piece of paper they are handed does
     not date itself twice.

     This walks the finished job rather than the fields the print engine
     happens to normalise. That distinction is the whole value of the test: it
     checks the outcome, so it still holds if someone adds a date to the
     signature block, the approval stamp or a party address — places the
     current normalisation does not reach.
  */
  const SAMPLE: Record<string, string> = {
    "purchase-request": "PR2506-0124",
    quotation: "QT2506-0001",
    "sales-request": "SR2506-0001",
    "sales-order": "SO2506-0001",
    picking: "PK2506-0001",
    packing: "PACK2506-0001",
    "delivery-order": "DO2507-0002",
    "sales-invoice": SALES_INVOICES[0].code,
    shipment: "SHP-2026-000031",
    "sales-return": "RTN-2026-000021",
    "credit-note": "CN-2026-000021",
  };

  /** Every dd/mm/yyyy anywhere in the job, with a path saying where it was. */
  function datesIn(node: unknown, path = ""): { path: string; text: string; year: number }[] {
    if (typeof node === "string") {
      return [...node.matchAll(DMY)]
        .filter((m) => {
          const d = Number(m[1]);
          const mo = Number(m[2]);
          return d >= 1 && d <= 31 && mo >= 1 && mo <= 12;
        })
        .map((m) => ({ path, text: m[0], year: Number(m[3]) }));
    }
    if (Array.isArray(node)) return node.flatMap((v, i) => datesIn(v, `${path}[${i}]`));
    if (node && typeof node === "object") {
      return Object.entries(node).flatMap(([k, v]) => datesIn(v, path ? `${path}.${k}` : k));
    }
    return [];
  }

  const types = PRINT_DOC_TYPES.filter((t) => SAMPLE[PRINT_CONFIGS[t].entity]);

  it("covers every printable document type", () => {
    expect(types.length).toBe(PRINT_DOC_TYPES.length);
  });

  it.each(types)("%s prints in a single era", (type) => {
    const job = buildPrintJob(type, SAMPLE[PRINT_CONFIGS[type].entity]);
    expect(job, type).not.toBeNull();

    /* `config` is excluded: it is the static template, shared by every
       document of this type, and any date in it is prose in a standing
       remark rather than something this sheet is asserting. */
    const { config: _config, ...printed } = job!;
    const dates = datesIn(printed);
    expect(dates.length, `${type} shows no dates at all — the walk found nothing`).toBeGreaterThan(0);

    const buddhist = dates.filter((d) => isBE(d.year));
    const gregorian = dates.filter((d) => !isBE(d.year));

    const show = (list: typeof dates) => list.map((d) => `  ${d.path} = ${d.text}`).join("\n");
    expect(
      buddhist.length === 0 || gregorian.length === 0,
      `${type} mixes two eras on one sheet:\nBuddhist:\n${show(buddhist)}\nGregorian:\n${show(gregorian)}`,
    ).toBe(true);
  });
});
