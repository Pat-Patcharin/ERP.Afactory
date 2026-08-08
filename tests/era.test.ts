/// <reference types="vite/client" />
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildPrintJob, PRINT_CONFIGS, PRINT_DOC_TYPES, recordPreview, recordPrint } from "@/lib/print";
import { SALES_INVOICES } from "@/data/sales-invoices";
import { audit, issueNumber } from "@/lib/domain/admin";
import { stamp, today } from "@/lib/format";

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

describe("no action writes a Buddhist year into a record", () => {
  /*
     The blind spot in the test above, and the reason this one exists.

     The file scan reads `data/` at rest. It proves what was committed. It
     cannot see a value the application writes while it runs — and that is
     exactly where the worst instance was hiding: `audit()` formatted its own
     Buddhist timestamp and pushed it onto AUDIT_LOG on every single action.
     The committed file stayed clean, the file scan stayed green, and the
     records drifted the moment anybody used the app.

     A file scan and a runtime scan are different tests, not two ways of
     writing one. Anything that only ever exists in memory is invisible to
     the first and caught only by the second.

     Why the audit log in particular is worth a test of its own: it is what
     somebody reads to put events in order, and it sits beside the documents
     it points at. `LOG-000042 · 08/08/2569` next to `QT2506-0001 ·
     22/06/2026` cannot be sequenced against each other at all — the log
     stops being evidence.
  */

  /* Every record store in the application, not a list somebody maintains —
     a list would go stale the first time a module was added. */
  const stores = import.meta.glob("../data/*.ts", { eager: true }) as Record<
    string,
    Record<string, unknown>
  >;

  /** Walk everything reachable, collecting dd/mm/yyyy with their location. */
  function allDates(): { where: string; text: string; year: number }[] {
    const out: { where: string; text: string; year: number }[] = [];
    const seen = new WeakSet<object>();

    const visit = (node: unknown, where: string, depth: number) => {
      if (depth > 12 || node == null) return;
      if (typeof node === "string") {
        for (const m of node.matchAll(DMY)) {
          const d = Number(m[1]);
          const mo = Number(m[2]);
          if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
          out.push({ where, text: m[0], year: Number(m[3]) });
        }
        return;
      }
      if (typeof node !== "object") return;
      if (seen.has(node as object)) return;
      seen.add(node as object);
      if (Array.isArray(node)) {
        node.forEach((v, i) => visit(v, `${where}[${i}]`, depth + 1));
        return;
      }
      for (const [k, v] of Object.entries(node)) visit(v, `${where}.${k}`, depth + 1);
    };

    for (const [file, mod] of Object.entries(stores)) {
      for (const [name, value] of Object.entries(mod)) {
        if (typeof value === "function") continue;
        visit(value, `${file.replace("../", "")}:${name}`, 0);
      }
    }
    return out;
  }

  const buddhist = () => allDates().filter((d) => isBE(d.year));
  const report = (list: ReturnType<typeof allDates>) =>
    list.map((d) => `  ${d.where} = ${d.text}`).join("\n");

  it("the walk actually reaches the records", () => {
    /*
       Without this the whole block would pass against a walk that visits
       nothing, which is how a guard ends up green for the wrong reason.
       The committed data holds hundreds of dates; if this number collapses,
       the scan broke, not the data.
    */
    expect(allDates().length).toBeGreaterThan(400);
  });

  it("the shared helpers produce Gregorian years", () => {
    /* Everything below writes through these two. If they were Buddhist,
       every assertion after this would be testing the wrong thing. */
    expect(isBE(Number(stamp().split("/")[2].slice(0, 4)))).toBe(false);
    expect(isBE(Number(today().split("/")[2]))).toBe(false);
  });

  it("the records start clean", () => {
    const found = buddhist();
    expect(found, `before any action:\n${report(found)}`).toEqual([]);
  });

  it("stays clean after actions that write to records", () => {
    /* `audit()` is the one that was wrong; the print recorders and the
       number series are included because they are the other paths that
       write a stamp without a form in front of them. */
    audit("Era test", "quotation", "ตรวจว่าบันทึกการใช้งานเป็น ค.ศ.", "QT2506-0001");
    audit("Era test", "sales-order", "เรียกซ้ำเพื่อให้มีมากกว่าหนึ่งแถว", "SO2506-0001");
    issueNumber("quotation");

    const job = buildPrintJob("quotation", "QT2506-0001");
    expect(job).not.toBeNull();
    recordPreview(job!.config, "QT2506-0001");
    recordPrint(job!.config, "QT2506-0001", "ORIGINAL", job!.totalPages);

    const found = buddhist();
    expect(found, `written while the app was running:\n${report(found)}`).toEqual([]);
  });
});

describe("the screen does not convert to the Buddhist era", () => {
  /*
     The decision, in one sentence: screens are Gregorian, paper is Buddhist,
     no exceptions. `docs/DATE-ERA.md` carries the reasoning; the short version
     is that <input type="date"> only speaks Gregorian, so a Buddhist list
     beside a Gregorian editor would put two eras on one SCREEN — the same
     fault D5 just chased off the paper, moved rather than fixed.

     This test exists because that decision is only cheap to hold while it is
     total. Converting one screen "just here" is how it gets lost: each site
     looks harmless, and the person adding the fortieth one has no way to know
     a decision was ever made. So the rule is enforced where it can be seen,
     rather than remembered.

     What this does NOT cover, said plainly so nobody reads more safety into
     it than it has: three places in `lib/domain/` still convert to BE and
     feed the screen — the audit-log timestamp and two yearly rollups. They
     are outside this scan because removing them changes an existing test's
     expectation, which is a decision, not a cleanup. BACKLOG N-9.
  */
  const dirs = ["schemas", "components", "app"];

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  /* `components/print` renders the sheet, but it renders a PrintJob that
     `buildPrintJob` has already converted — the conversion lives in
     lib/print, and no component is entitled to do its own. */
  const files = dirs.flatMap(walk);

  /* `beYear` / `toBuddhistText` by name, and a bare 543 in any arithmetic. */
  const BE_CONVERSION = /\b(beYear|toBuddhistText)\s*\(|[+\-]\s*543\b|\b543\s*[+\-]/;

  it("scans a real set of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)("%s does not convert years for display", (file) => {
    const src = readFileSync(file, "utf8");
    const hits = src
      .split("\n")
      .map((line, i) => ({ line, no: i + 1 }))
      .filter(({ line }) => BE_CONVERSION.test(line));

    expect(
      hits,
      `screens are Gregorian — see docs/DATE-ERA.md:\n${hits
        .map((h) => `  ${file}:${h.no}  ${h.line.trim()}`)
        .join("\n")}`,
    ).toEqual([]);
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
