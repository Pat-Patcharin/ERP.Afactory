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

/* ============================================================
   THE SHELL MUST NOT LEARN THE SELL SIDE

   `EditableDraft` is the whole contract between the shared
   document editor and the documents that use it. It carries four
   fields, and every one is something this editor genuinely
   touches.

   It used to extend `PartyFields` and `TermFields`, which meant
   the editor knew about customers, ship-to addresses and VAT —
   none of which a purchase request has. The cause was not the
   type: the editor was intercepting those patches itself, so it
   had to know them. Moving the interception to `sellSidePatch()`
   is what let the type shrink.

   This test is the tripwire on the repair. Widening the contract
   again is how a shared component quietly becomes a sell-side
   component with a general-sounding name.
   ============================================================ */

describe("Shared document editor — the contract stays narrow", () => {
  const hook = read("components/document/useDocumentEditor.ts");

  it("asks a draft for four fields and no more", () => {
    const block = hook.slice(
      hook.indexOf("export interface EditableDraft"),
      hook.indexOf("}", hook.indexOf("export interface EditableDraft")),
    );
    const fields = [...block.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields.sort()).toEqual(["code", "items", "mode", "status"]);
    expect(block, "it must not inherit the sell-side blocks").not.toMatch(/extends/);
  });

  it("names no sell-side field anywhere in the shared editor", () => {
    /* The fields that walked back in last time. A purchase request has none
       of them, so their presence here means the shell is deciding something
       a document should decide. */
    for (const field of ["customerPick", "shipAddressPick", "billType", "taxId"]) {
      expect(hook, `the shared editor must not know '${field}'`).not.toContain(field);
    }
  });

  it("leaves the sell-side patch handling in the sell-side module", () => {
    const doc = read("lib/domain/doc-draft.ts");
    expect(doc).toContain("export function sellSidePatch");
    for (const field of ["customerPick", "shipAddressPick", "billType"]) {
      expect(doc, `${field} belongs here, not in the editor`).toContain(field);
    }
  });
});

/* ============================================================
   THE TWO BUTTON VOCABULARIES

   `variant="primary"` is the application's action and must stay
   on the brand. `variant="doc"` is the document's and follows
   the family. Adding the second must not have moved the first.
   ============================================================ */

describe("Button — the brand variant is untouched by the document one", () => {
  const button = read("components/ui/Button.tsx");

  it("keeps primary on the brand tokens", () => {
    const line = button.split("\n").find((l) => l.trim().startsWith("primary:")) ?? "";
    const body = line + button.split("\n")[button.split("\n").indexOf(line) + 1];
    expect(body).toContain("bg-primary");
    expect(body, "the application button must not follow the paper").not.toContain("doc-accent");
  });

  it("gives doc the same states primary has, so only the hue differs", () => {
    const doc = button.split("\n").find((l) => l.trim().startsWith("doc:")) ?? "";
    for (const state of ["bg-doc-accent", "hover:bg-doc-accent-hover", "active:bg-doc-accent-active"]) {
      expect(doc, `doc variant needs ${state}`).toContain(state);
    }
  });

  it("uses the document variant only for the document's own action", () => {
    /* The print overlay and the import dialog are application chrome sitting
       over the paper, not part of it. They stay on the brand. */
    const shell = read("components/document/DocumentEditorShell.tsx");
    expect(shell.match(/variant="doc"/g) ?? []).toHaveLength(2);
    expect(shell.match(/variant="primary"/g) ?? []).toHaveLength(2);
  });
});

describe("DocHeader — the verify mark is opt-out, never opt-in", () => {
  const parts = read("components/document/parts.tsx");

  it("defaults to showing it, so every existing document is unchanged", () => {
    expect(parts).toContain("showVerifyCode = true");
  });

  it("puts it behind the flag rather than deleting it", () => {
    expect(parts).toContain("{showVerifyCode && (");
    expect(parts, "the QR itself must survive for sales documents").toContain("QRPlaceholder");
  });
});

describe("Inbound panels — not the sell-side ones wearing new labels", () => {
  const parts = read("components/document/parts.tsx");

  it("gives the requester and destination their own field types", () => {
    expect(parts).toContain("export interface RequesterFields");
    expect(parts).toContain("export interface DestinationFields");
  });

  it("keeps them off PartyFields", () => {
    /* A requester is not a customer: nobody is billed, no credit is checked,
       no tax ID applies. Sharing the type would tie a purchase request to
       every future change made for the sell side. */
    const block = parts.slice(
      parts.indexOf("export interface RequesterFields"),
      parts.indexOf("/* ---------- Metadata ---------- */"),
    );
    expect(block).not.toContain("PartyFields");
    for (const field of ["customerPick", "taxId", "billAddress", "shipAddressPick"]) {
      expect(block, `an inbound panel must not carry '${field}'`).not.toContain(field);
    }
  });
});
