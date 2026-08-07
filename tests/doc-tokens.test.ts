import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* ============================================================
   THE LINE BETWEEN THE COMPANY AND THE PAPER

   Two colour vocabularies, and the whole design rests on not
   mixing them:

     primary      the APPLICATION — sidebar, logo, top bar.
                  The company. Orange on every screen.
     doc-accent   the PAPER — the rule under a document header,
                  its number, its table band, its totals bar.
                  Follows `data-doc-family`.

   Get them the wrong way round and a recoloured module stops
   looking like a different job and starts looking like a
   different product.

   These are grep tests for the same reason the "no module
   hardcodes a role" test is: the property is about which files
   may mention which token, and no amount of rendering can show
   that a file does NOT reference something.
   ============================================================ */

const read = (p: string) => readFileSync(p, "utf8");

const tsxUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxUnder(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};

describe("Document accent — the application chrome never uses it", () => {
  it("keeps doc-* out of the sidebar, the top bar and the shell", () => {
    /* The refusal this file exists for. If somebody recolours the sidebar
       through the document token, the brand stops being constant and the
       whole point of splitting the two vocabularies is gone. */
    for (const file of tsxUnder("components/layout")) {
      expect(read(file), `${file} must not use a document token`).not.toMatch(
        /\bdoc-(accent|head)/,
      );
    }
  });

  it("keeps the company name on the brand colour, not the document's", () => {
    /* The company name sits inside the document header, so it is the one
       place the two vocabularies are inches apart. A purchase request is
       issued by the same firm as a quotation; its name must not change
       colour with the paper. */
    const parts = read("components/document/parts.tsx");
    const nameBlock = parts.slice(
      parts.indexOf("export function DocHeader"),
      parts.indexOf("COMPANY.nameTh"),
    );
    expect(nameBlock).toContain("text-primary");
    expect(nameBlock, "the name must not follow the document accent").not.toContain(
      "text-doc-accent",
    );
  });
});

describe("Document accent — the paper does use it", () => {
  const parts = read("components/document/parts.tsx");

  it("colours the rule, the number, the totals bar and the table band", () => {
    for (const cls of [
      "border-doc-accent", // rule under the document header
      "text-doc-accent", // document number
      "bg-doc-accent", // grand total bar
      "bg-doc-head", // item table band
    ]) {
      expect(parts, `${cls} must survive in the shared document parts`).toContain(cls);
    }
  });

  it("leaves no hard-coded hex on the parts the family is meant to recolour", () => {
    /* `#2f3542` was the table band before it became a token. A hex here
       cannot follow `data-doc-family`, so it would silently opt that element
       out of every future family. */
    expect(parts).not.toContain("#2f3542");
  });
});

describe("Document families — the tokens resolve", () => {
  const css = read("app/globals.css");

  it("defaults every document token to the brand, so an unmarked document is unchanged", () => {
    for (const token of [
      "--c-doc-accent: var(--c-primary)",
      "--c-doc-accent-hover: var(--c-primary-hover)",
      "--c-doc-accent-soft: var(--c-primary-soft)",
      "--c-doc-accent-border: var(--c-primary-border)",
    ]) {
      expect(css, `:root must default ${token}`).toContain(token);
    }
  });

  it("gives the inbound family a tone of its own, not a copy of the default", () => {
    const block = css.slice(
      css.indexOf('[data-doc-family="inbound"]'),
      css.indexOf("}", css.indexOf('[data-doc-family="inbound"]')),
    );
    expect(block, "the family block must exist").toBeTruthy();
    expect(block).toContain("--c-doc-accent: #0f766e");
    expect(block).toContain("--c-doc-head: #134e4a");
    /* A family that merely restates the defaults changes nothing and would
       be the "rule that refuses nobody" shape all over again. */
    expect(block, "it must not just point back at the brand").not.toContain(
      "--c-doc-accent: var(--c-primary)",
    );
  });
});

/* ============================================================
   AND THE ARITHMETIC BEHIND THE CHOICE

   The tone was picked on measured contrast, so the measurement
   belongs in the suite rather than in a commit message nobody
   re-reads. These fail if somebody nudges the hex.
   ============================================================ */

const luminance = (hex: string): number => {
  const s = hex.replace("#", "");
  const channel = (i: number) => {
    const v = parseInt(s.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("Document accent — contrast", () => {
  const WHITE = "#ffffff";

  it("clears WCAG AA on white, which the brand orange does not", () => {
    expect(contrast("#0f766e", WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#134e4a", WHITE)).toBeGreaterThanOrEqual(4.5);

    /* Recorded, not asserted as desirable: the brand orange fails both the
       4.5:1 body floor and the 3:1 large-text floor, on documents that reach
       customers. See BACKLOG N-6. If this ever starts passing, the sales
       side has been fixed and that entry can close. */
    expect(contrast("#f97316", WHITE)).toBeLessThan(3);
  });

  it("checks the muted ink that sits on the soft background", () => {
    expect(contrast("#6b7280", "#f0fdfa")).toBeGreaterThanOrEqual(4.5);
  });
});
