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

    /* Identity is the first section and Finance the second to last — under the
       old wizard only one of these could be in the document at a time. */
    expect(within(section("identity")).getByPlaceholderText("Dental Smile")).toBeInTheDocument();
    expect(within(section("finance")).getByText("Credit Limit")).toBeInTheDocument();
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
