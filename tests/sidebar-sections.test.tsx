import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { useUI } from "@/lib/store";
import { resetCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   FOLDING THE SIDEBAR SECTIONS

   Nine sections and sixty destinations is a long scroll for
   somebody who opens four of them. Each labelled section folds
   down to its heading, the choice survives a reload, and the two
   things that must not break when it does are:

     · the icon rail, where there is no heading to fold into
     · knowing which page is open when its section is shut

   The route is mocked to /purchase throughout — see setup.ts —
   so "Purchase" is the section holding the current page.
   ============================================================ */

beforeEach(() => {
  window.localStorage.clear();
  useUI.setState({ navCollapsed: [], sidebarCollapsed: false });
  resetCurrentUser();
});

const heading = (label: string) => screen.getByRole("button", { name: new RegExp(label, "i") });

describe("Sidebar — หุบเป็นรายหมวด", () => {
  it("หุบหมวดแล้วเหลือแต่หัวข้อ", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Business Partner/ })).toBeInTheDocument();

    await user.click(heading("Master Data"));

    expect(screen.queryByRole("link", { name: /Business Partner/ })).toBeNull();
    /* The heading stays — that is the whole point, it is how you get back. */
    expect(heading("Master Data")).toBeInTheDocument();
  });

  it("หุบหมวดหนึ่งไม่กระทบหมวดอื่น", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(heading("Master Data"));

    expect(screen.queryByRole("link", { name: /Business Partner/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Purchase Order/ })).toBeInTheDocument();
  });

  it("กดหัวข้อซ้ำเพื่อเปิดกลับ", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(heading("Master Data"));
    await user.click(heading("Master Data"));

    expect(screen.getByRole("link", { name: /Business Partner/ })).toBeInTheDocument();
  });

  it("บอกสถานะเปิด/หุบให้เครื่องอ่านหน้าจอด้วย", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    expect(heading("Master Data")).toHaveAttribute("aria-expanded", "true");

    await user.click(heading("Master Data"));

    expect(heading("Master Data")).toHaveAttribute("aria-expanded", "false");
  });

  it("จำไว้ข้ามการโหลดหน้าใหม่", async () => {
    const user = userEvent.setup();
    const first = render(<Sidebar />);
    await user.click(heading("Master Data"));
    first.unmount();

    /* A fresh page: the store starts empty and the sidebar reads the stored
       preference back on mount. */
    useUI.setState({ navCollapsed: [] });
    render(<Sidebar />);

    expect(screen.queryByRole("link", { name: /Business Partner/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Purchase Order/ })).toBeInTheDocument();
  });

  it("ชี้ว่าหน้าที่เปิดอยู่ซ่อนอยู่ในหมวดไหน", async () => {
    const user = userEvent.setup();
    const { container } = render(<Sidebar />);

    /* Purchase holds the current route, so folding it must leave a mark. */
    await user.click(heading("Purchase"));
    expect(heading("Purchase").querySelector(".bg-primary")).not.toBeNull();

    /* A section with nothing active in it gets no mark. */
    await user.click(heading("Finance"));
    expect(heading("Finance").querySelector(".bg-primary")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("ไม่ซ่อนอะไรตอนย่อ Sidebar เป็นแถบไอคอน", () => {
    /* A section folded away earlier, and the sidebar now down to icons. There
       is no heading to fold into once the words are gone, so hiding the items
       too would leave an icon rail with nothing on it. */
    window.localStorage.setItem("afactory:nav:collapsed", JSON.stringify(["Master Data"]));
    useUI.setState({ sidebarCollapsed: true });

    render(<Sidebar />);

    expect(useUI.getState().navCollapsed).toContain("Master Data");
    expect(screen.getByTitle("Business Partner")).toBeInTheDocument();
  });
});
