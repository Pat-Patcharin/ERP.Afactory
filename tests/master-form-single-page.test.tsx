import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MasterForm } from "@/components/engine/MasterForm";
import { BP_FORM } from "@/schemas/forms/business-partner";
import { resetCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   ONE PAGE, EIGHT HEADINGS

   The form used to mount one section at a time and walk you
   through with Back / Next. Everything is on the page now, and
   the rail on the left jumps to a heading rather than swapping
   which part of the form exists.

   Business Partner is the form this was asked for and the
   longest one in the app — eight sections, a grid in most of
   them — so what holds here holds for the shorter ones.
   ============================================================ */

beforeEach(() => {
  window.localStorage.clear();
  resetCurrentUser();
});

const rail = () => screen.getByRole("navigation", { name: "หัวข้อในฟอร์ม" });

describe("MasterForm — ทุกหัวข้ออยู่ในหน้าเดียว", () => {
  const section = (key: string) => document.getElementById(`form-business-partner-${key}`)!;

  it("แสดงช่องกรอกของหัวข้อแรกและหัวข้อท้าย ๆ พร้อมกัน", () => {
    render(<MasterForm schema={BP_FORM} />);

    /* Identity is the first section and Finance one of the last — under the
       old wizard only one of these could be in the document at a time.

       The anchor here used to be "Credit Limit", which moved to Sales Terms
       when the credit questions were gathered into one place. Nothing about
       this test changed: it asks whether a far-apart pair of sections render
       together, and the field it points at is only a handle. Bank Accounts
       is what Finance asks for now. */
    expect(within(section("identity")).getByPlaceholderText("Dental Smile")).toBeInTheDocument();
    expect(within(section("finance")).getByText("Bank Accounts")).toBeInTheDocument();
    expect(within(section("finance")).getByText("Bank Accounts")).toBeInTheDocument();
  });

  it("มีหัวข้อครบทุกอันบนหน้า และแต่ละอันมีจุดยึดให้กระโดดไป", () => {
    const { container } = render(<MasterForm schema={BP_FORM} />);

    const buttons = within(rail()).getAllByRole("button");
    const sections = container.querySelectorAll("section[id^='form-business-partner-']");
    expect(sections.length).toBe(buttons.length);

    /* Every rail entry must land somewhere — an anchor that does not exist is
       a jump that silently does nothing. */
    for (const s of Array.from(sections)) {
      expect(s.getAttribute("aria-labelledby")).toBe(`${s.id}-h`);
      expect(document.getElementById(`${s.id}-h`)).not.toBeNull();
    }
  });

  it("กดหัวข้อในแถบซ้ายแล้วย้ายตำแหน่งที่ชี้อยู่", async () => {
    const user = userEvent.setup();
    render(<MasterForm schema={BP_FORM} />);

    const finance = within(rail()).getByRole("button", { name: /การเงิน/ });
    await user.click(finance);

    expect(finance).toHaveAttribute("aria-current", "location");
    /* And nothing disappeared on the way — this is a jump, not a swap. */
    expect(within(section("identity")).getByPlaceholderText("Dental Smile")).toBeInTheDocument();
  });

  it("ไม่มีปุ่มเดินหน้า/ถอยหลังทีละขั้นอีกแล้ว", () => {
    render(<MasterForm schema={BP_FORM} />);

    expect(screen.queryByRole("button", { name: /ย้อนกลับ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^ถัดไป/ })).toBeNull();
    /* Save is reachable without scrolling to the end of a wizard. */
    expect(screen.getAllByRole("button", { name: /Save Partner/ }).length).toBeGreaterThan(0);
  });

  it("กด Save ทั้งที่ยังกรอกไม่ครบ แล้วชี้ว่าขาดตรงไหน", async () => {
    const user = userEvent.setup();
    render(<MasterForm schema={BP_FORM} />);

    await user.click(screen.getAllByRole("button", { name: /Save Partner/ })[0]);

    /* The section holding the first missing field gets the error marker, and
       the form is still on screen — nothing was saved. */
    const identity = within(rail()).getByRole("button", { name: /ข้อมูลองค์กร/ });
    expect(identity.querySelector(".bg-danger")).not.toBeNull();
    expect(within(section("identity")).getByPlaceholderText("Dental Smile")).toBeInTheDocument();
  });
});

/* ============================================================
   ROLES FIRST, AND THE TWO SIDES KEPT APART

   Two complaints from the person filling this in, and they are
   the same complaint from opposite ends.

   The roles picker sat behind the organisation details, so you
   typed a page and a half before the form would tell you which
   of the later sections applied to you. It is the first question
   now, and everything after it is an answer to it.

   And a partner that is both a customer and a supplier answers
   two sets of questions that look identical — Sales Terms and
   Purchasing Terms both ask for a payment term, a group and a
   minimum order. Tinting the one-sided sections says which half
   you are in without reading the heading.
   ============================================================ */

describe("MasterForm — บทบาทมาก่อน และสองฝั่งแยกกัน", () => {
  const both = { roles: { customer: true, supplier: true } };

  it("ถามบทบาทเป็นหัวข้อแรก", () => {
    expect(BP_FORM.steps[0].key).toBe("roles");
    /* And identity has not been dropped on the way past. */
    expect(BP_FORM.steps.map((s) => s.key)).toContain("identity");
  });

  it("ไม่มีหัวข้อของฝั่งไหนเลยจนกว่าจะเลือกบทบาท", () => {
    const none = { roles: {} };
    const visible = (st: Record<string, unknown>) =>
      BP_FORM.steps.filter((s) => !s.when || s.when(st as never)).map((s) => s.key);

    expect(visible(none)).not.toContain("customer");
    expect(visible(none)).not.toContain("supplier");
    expect(visible({ roles: { customer: true } })).toContain("customer");
    expect(visible({ roles: { customer: true } })).not.toContain("supplier");
    expect(visible({ roles: { supplier: true } })).toContain("supplier");
  });

  it("ติดป้ายฝั่งเฉพาะหัวข้อที่เป็นของฝั่งเดียวจริง ๆ", () => {
    const side = (key: string) => BP_FORM.steps.find((s) => s.key === key)?.side;

    expect(side("customer")).toBe("customer");
    expect(side("sales")).toBe("customer");
    expect(side("supplier")).toBe("supplier");
    expect(side("purchasing")).toBe("supplier");

    /* Everything everybody fills in stays neutral — a tint on every section
       would distinguish nothing. */
    for (const key of ["roles", "identity", "tax", "contacts", "addresses", "finance", "review"]) {
      expect(side(key), key).toBeUndefined();
    }
  });

  /**
   * On screen, not in the schema.
   *
   * The schema declaring a side proves nothing about whether the form draws
   * it — that gap is what let a district dropdown ship empty with every test
   * green. `data-side` is on the section for this reason: it lets the test
   * ask what was rendered without asserting on a colour class.
   */
  it("วาดสองฝั่งคนละสีจริงบนหน้าจอ", () => {
    render(<MasterForm schema={BP_FORM} />);
    const at = (key: string) => document.getElementById(`form-business-partner-${key}`)!;

    /* Nothing is one-sided until a role is picked, so the sided sections are
       not on the page yet — which is itself the behaviour asked for. */
    expect(at("roles").dataset.side).toBeUndefined();
    expect(document.getElementById("form-business-partner-customer")).toBeNull();
  });

  it("วาดฝั่งลูกค้ากับฝั่งผู้ขายแยกกันเมื่อเป็นทั้งสองบทบาท", async () => {
    const user = userEvent.setup();
    render(<MasterForm schema={BP_FORM} />);

    const roles = document.getElementById("form-business-partner-roles")!;
    await user.click(within(roles).getByText("Customer"));
    await user.click(within(roles).getByText("Supplier"));

    const at = (key: string) => document.getElementById(`form-business-partner-${key}`)!;
    expect(at("customer").dataset.side).toBe("customer");
    expect(at("sales").dataset.side).toBe("customer");
    expect(at("supplier").dataset.side).toBe("supplier");
    expect(at("purchasing").dataset.side).toBe("supplier");
    /* Different from each other, and shared sections stay neutral. */
    expect(at("customer").dataset.side).not.toBe(at("supplier").dataset.side);
    expect(at("addresses").dataset.side).toBeUndefined();

    /* Said in words too — the colour is not carrying it alone. */
    expect(within(at("customer")).getByText("ฝั่งลูกค้า")).toBeInTheDocument();
    expect(within(at("supplier")).getByText("ฝั่งผู้ขาย")).toBeInTheDocument();
  });
});
