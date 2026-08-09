/// <reference types="vite/client" />
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* ============================================================
   A NEW RECORD IS CHECKED AGAINST THE TYPE IT CLAIMS TO BE

   `as unknown as SoRow` does not bridge a gap. It switches the
   compiler off for the whole object — including every part that
   has nothing to do with the gap it was written for.

   The gap is real: the stores hold decorated rows (`SoRow`),
   and the fields the decorator adds are genuinely unknown at
   the moment the record is built. What the double cast then
   does is silence the other question too — whether the record
   itself is complete — and that question is the one that
   matters, because a missing field is data the customer never
   gets.

   Measured, not assumed. Taking the casts off found:

     purchase-request form   no headerDisc · freight · otherCharges
                             A1 declared all three required and
                             taught the document editor to write
                             them; this is the OTHER way a
                             purchase request is created and it
                             was never touched. Nothing said so
                             for the whole of A1.
     warehouse form          bins built by a function returning
                             `unknown[]`, so nothing checked that
                             a bin came out with a bin's fields

   And that is the shape of it: the cast hid nothing at twenty
   of the sites and something real at two, and there was no way
   to know which was which without taking it off.

   The pattern that replaces it, from A1:

     const fresh: SalesOrder = { ... };   ← checked, in full
     SALES_ORDERS.unshift(fresh as SoRow); ← only the decoration
                                             gap is asserted away
   ============================================================ */

/** `as unknown as XRow` / `as any as XRow`, in either spelling. */
const DOUBLE_CAST = /\bas\s+(?:unknown|any)\s+as\s+(\w*Row)\b/g;

/**
 * `GridRow` is a form-grid row, not a stored record — a loose bag the engine
 * hands to a column renderer. Casting to one asserts nothing about a record
 * and is not what this guard is about.
 */
const NOT_A_RECORD = new Set(["GridRow"]);

/**
 * Comments stripped before scanning.
 *
 * Without this the guard fires on the note A1 left in `quotation-draft.ts`
 * explaining what the cast used to say — a tripwire that trips on the
 * description of the thing it forbids trains people to ignore it.
 */
const code = (src: string) =>
  src
    /* Blanked, not deleted — a comment removed outright shifts every line
       number after it and the report then points at the wrong line, which is
       its own small trap. */
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, (_m, indent) => indent);

/** `STORE.unshift(fresh as XRow)` — a new record entering a store. */
const RECORD_WRITE = /\b[A-Z_]{2,}\.(?:unshift|push)\(\s*\w+\s+as\s+\w+Row\s*\)/g;

/**
 * Sites still allowed to write a record behind a double cast.
 *
 * Named one at a time with a reason and a count, the same way the era
 * tripwire names its four files. An allow-list with no numbers on it is a
 * hole; this one goes red if a second cast joins the first.
 */
const ALLOWED: Record<string, { casts: number; why: string }> = {
  "schemas/forms/business-partner.tsx": {
    casts: 1,
    why:
      "Its grid mappings spread loosely-typed rows — contacts, banks, docs, " +
      "addresses, images, supplierItems — so the record cannot be checked " +
      "without rewriting all six by hand. Runtime is fine today; the compiler " +
      "simply cannot see it. Rewriting them is its own piece of work with its " +
      "own way of going wrong (dropping a field nobody listed), and doing it " +
      "here would bury the rest of A1c.",
  },
};

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });

const FILES = [...walk("lib"), ...walk("schemas")];
const key = (f: string) => f.split("\\").join("/");

describe("records are built against their own type", () => {
  /*
     The canary, and it earns its place: this suite is a set of regexes over
     source text, and a regex that stops matching reports the same clean pass
     as a codebase with nothing wrong in it. N-9c was bitten by exactly that.
     If a refactor renames the stores or the row types, these two counts drop
     and the suite says so instead of going quietly green.
  */
  it("can still see the writes it is guarding", () => {
    const writes = FILES.flatMap((f) => [...code(readFileSync(f, "utf8")).matchAll(RECORD_WRITE)]);
    expect(
      writes.length,
      "the record-write pattern matched almost nothing — it has gone stale, " +
        "which is not the same as the codebase being clean",
    ).toBeGreaterThanOrEqual(20);
  });

  it("scans the whole of lib/ and schemas/", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it.each(FILES)("%s builds its records under a real type", (file) => {
    const src = code(readFileSync(file, "utf8"));
    const found = [...src.matchAll(DOUBLE_CAST)]
      .filter((m) => !NOT_A_RECORD.has(m[1]))
      .map((m) => `${key(file)}:${src.slice(0, m.index).split("\n").length}  ${m[0]}`);

    const allowed = ALLOWED[key(file)];
    if (allowed) {
      /* Counted, not waved through. Adding a second one here is a new
         decision and has to be argued for in the list above. */
      expect(
        found.length,
        `${key(file)} is allowed ${allowed.casts} — ${allowed.why}\n${found.join("\n")}`,
      ).toBe(allowed.casts);
      return;
    }

    expect(
      found,
      "Build the record under its own type, then cast only the decoration:\n" +
        "  const fresh: SalesOrder = { ... };\n" +
        "  SALES_ORDERS.unshift(fresh as SoRow);\n" +
        found.join("\n"),
    ).toEqual([]);
  });
});
