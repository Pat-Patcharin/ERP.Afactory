import { describe, expect, it } from "vitest";

import { BP_FORM } from "@/schemas/forms/business-partner";
import { BUSINESS_PARTNERS } from "@/data/partners";
import { formStatus } from "@/lib/form";
import type { FormState } from "@/lib/types";

/* ============================================================
   A CONTACT NOBODY CAN REACH

   Two rules, and both exist because the form used to collect a
   preference instead of an address:

     · a contact with no telephone at all. The old rule checked
       the SHAPE of a mobile number and passed an empty one, so a
       partner could be approved with a name, an email and no way
       to ring anybody.

     · a contact who names LINE as the way to reach them and then
       does not say which LINE account. Worse than leaving it
       blank: the form looks answered.

   The second one had a cause worth recording. `line` has been on
   the contact record since the beginning and BOTH the contacts
   table and the detail panel print it as "Line ID" — but no
   input for it existed anywhere. Eight seeded contacts carry a
   value that nobody using the application could have typed. The
   rule could not have been written before the field was, and
   nothing pointed at the gap because the screen showed the
   value quite happily.

   Every test below asserts a REFUSAL. A rule proven only by the
   cases it lets through is not proven at all — this project has
   shipped several of those.
   ============================================================ */

/** A partner far enough along that only the contacts step can fail it. */
function partnerWith(contacts: Record<string, unknown>[]): FormState {
  const seed = BUSINESS_PARTNERS.find((b) => (b.contacts ?? []).length > 0)!;
  return {
    ...BP_FORM.toState!(seed as never),
    contacts: contacts.map((c) => ({ ...c })),
  } as FormState;
}

const contactsStep = (state: FormState) => formStatus(BP_FORM, state).steps.contacts;

const REACHABLE = {
  first: "แมว",
  last: "หมา",
  mobile: "081-234-5678",
  method: "โทรศัพท์",
  line: "",
  primary: true,
  active: true,
};

describe("every contact must have a telephone", () => {
  it("refuses a contact with neither a mobile nor a landline", () => {
    const status = contactsStep(partnerWith([{ ...REACHABLE, mobile: "" }]));
    expect(status.broken).toContain(
      "ผู้ติดต่อทุกคนต้องมีเบอร์โทรอย่างน้อย 1 เบอร์ (มือถือ หรือ โทรศัพท์)",
    );
  });

  it("accepts an office line with no mobile", () => {
    /* The rule asks for a telephone, not for that particular one. Somebody
       who left only a switchboard number is reachable. */
    const status = contactsStep(
      partnerWith([{ ...REACHABLE, mobile: "", phone: "02-123-4567" }]),
    );
    expect(status.broken).not.toContain(
      "ผู้ติดต่อทุกคนต้องมีเบอร์โทรอย่างน้อย 1 เบอร์ (มือถือ หรือ โทรศัพท์)",
    );
  });

  it("refuses the second contact when only the first has a number", () => {
    /* `.every`, not `.some` — one reachable person does not make the rest of
       the list reachable. */
    const status = contactsStep(
      partnerWith([REACHABLE, { first: "หนู", mobile: "", primary: false, active: true }]),
    );
    expect(status.broken).toContain(
      "ผู้ติดต่อทุกคนต้องมีเบอร์โทรอย่างน้อย 1 เบอร์ (มือถือ หรือ โทรศัพท์)",
    );
  });

  it("ignores a blank row that is not a person yet", () => {
    /* Pressing "add contact" must not immediately report a missing phone
       number for a row with nothing in it. */
    const status = contactsStep(partnerWith([REACHABLE, { first: "", mobile: "" }]));
    expect(status.broken).not.toContain(
      "ผู้ติดต่อทุกคนต้องมีเบอร์โทรอย่างน้อย 1 เบอร์ (มือถือ หรือ โทรศัพท์)",
    );
  });
});

describe("choosing LINE means saying which LINE", () => {
  const LABEL = "ผู้ติดต่อที่เลือกช่องทางหลักเป็น LINE ต้องระบุ LINE ID";

  it("refuses LINE as the primary channel with no LINE ID", () => {
    const status = contactsStep(partnerWith([{ ...REACHABLE, method: "LINE", line: "" }]));
    expect(status.broken).toContain(LABEL);
  });

  it("accepts it once the ID is given", () => {
    const status = contactsStep(
      partnerWith([{ ...REACHABLE, method: "LINE", line: "@dentalsmile" }]),
    );
    expect(status.broken).not.toContain(LABEL);
  });

  it("leaves a contact alone who keeps a LINE ID but prefers the phone", () => {
    /* The seeded @waraporn case. A LINE ID beside a preferred telephone is
       not an incomplete record, and this is why the column is shown for
       every row rather than only when LINE is chosen — a conditional column
       would put that value on the screen and out of editing reach. */
    const status = contactsStep(
      partnerWith([{ ...REACHABLE, method: "โทรศัพท์", line: "@waraporn" }]),
    );
    expect(status.broken).not.toContain(LABEL);
  });
});

describe("the LINE ID is editable at all", () => {
  it("has a column in the contacts grid", () => {
    /* The gap that made the rule above impossible to write: the value was
       stored and printed, with no input anywhere. */
    const grid = BP_FORM.steps
      .find((s) => s.key === "contacts")!
      .blocks({} as FormState)
      .find((b) => b && b.type === "grid");
    expect(grid, "the contacts step must still have a grid").toBeTruthy();
    expect((grid as { cols: { key: string }[] }).cols.map((c) => c.key)).toContain("line");
  });
});

describe("the seeded partners can actually reach these rules", () => {
  it("has at least one contact whose channel is LINE", () => {
    /* A rule that no data can arrive at is a rule that refuses nobody. Both
       branches need to be reachable from the seed, not only in theory. */
    const line = BUSINESS_PARTNERS.flatMap((b) => b.contacts ?? []).filter(
      (c) => c.method === "LINE",
    );
    expect(line.length).toBeGreaterThan(0);
    /* And every one of them names an account, so the seed is not itself
       breaking the rule it is here to exercise. */
    expect(line.every((c) => String(c.line ?? "").trim())).toBe(true);
  });

  it("has no seeded contact without a telephone", () => {
    const unreachable = BUSINESS_PARTNERS.flatMap((b) =>
      (b.contacts ?? [])
        .filter((c) => String(c.first ?? "").trim())
        .filter((c) => !String(c.mobile ?? "").trim() && !String(c.phone ?? "").trim())
        .map((c) => `${b.code} · ${c.first} ${c.last}`),
    );
    expect(unreachable, `contacts with no phone:\n${unreachable.join("\n")}`).toEqual([]);
  });
});
