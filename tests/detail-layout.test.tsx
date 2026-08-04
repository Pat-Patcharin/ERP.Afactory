import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FullDetail } from "@/components/engine/FullDetail";
import { PanelHost } from "@/components/engine/PanelHost";
import { useUI } from "@/lib/store";
import type { DetailSchema, RecordBase } from "@/lib/types";
import { REGISTRY } from "@/schemas/registry";
import { bpSchemas } from "@/schemas/business-partner";
import { getBP } from "@/lib/domain/partner";

/* ============================================================
   ENTERPRISE DETAIL LAYOUT regression suite.

   These test the LAYOUT, not Business Partner. Product,
   Warehouse, Sales Rep and every master added later render
   through this same engine, so what is asserted here is what
   they all inherit — and what a future schema must not have to
   re-implement.
   ============================================================ */

interface Demo extends RecordBase {
  code: string;
  name: string;
}

const demo: Demo = { code: "DEMO-001", name: "Demo Record" };

/** A minimal schema, so a failure points at the engine and not at a module. */
const schema: DetailSchema<Demo> = {
  key: "demo",
  entityLabel: "Demo",
  identity: (r) => ({
    code: r.code,
    title: r.name,
    copyFields: [{ label: "Code", value: r.code }],
    badges: [{ text: "Active", tone: "success" }],
    tags: ["Tag A", "Tag B"],
  }),
  kpis: () => [
    { icon: "tag", label: "First KPI", value: "1,000", sub: "THB" },
    { icon: "cart", label: "Second KPI", value: "2,000", sub: "THB", goTab: "second" },
  ],
  tabs: [
    {
      key: "first",
      label: "First",
      aside: (_r, ctx) => ({
        title: "Summary",
        rows: [{ icon: "tag", label: "Row Label", value: "Row Value" }],
        links: [
          {
            label: "Open Panel",
            icon: "mapPin",
            sub: "3 items",
            run: () =>
              ctx.panel({
                title: "Panel Title",
                subtitle: "Panel Subtitle",
                blocks: [{ type: "note", text: "Panel body content" }],
              }),
          },
        ],
      }),
      blocks: () => [
        {
          type: "grid",
          cols: 3,
          items: [
            { type: "fields", title: "Card One", cols: 1, items: [{ label: "A", value: "1" }] },
            { type: "fields", title: "Card Two", cols: 1, items: [{ label: "B", value: "2" }] },
            { type: "fields", title: "Card Three", cols: 1, items: [{ label: "C", value: "3" }] },
          ],
        },
      ],
    },
    { key: "second", label: "Second", blocks: () => [{ type: "note", text: "Second tab body" }] },
    {
      key: "gated",
      label: "Gated",
      when: () => false,
      blocks: () => [{ type: "note", text: "never shown" }],
    },
  ],
};

const renderDemo = () =>
  render(
    <>
      <FullDetail schema={schema} record={demo} />
      <PanelHost />
    </>,
  );

describe("Detail layout — sticky structure", () => {
  it("pins the KPI strip and the tab rail below the topbar", () => {
    renderDemo();
    const sticky = screen.getByTestId("detail-sticky");

    expect(sticky.className).toContain("sticky");
    expect(sticky.className).toContain("top-topbar");
    /* Both live inside the pinned band. */
    expect(within(sticky).getByTestId("detail-kpis")).toBeInTheDocument();
    expect(within(sticky).getByRole("tablist")).toBeInTheDocument();
  });

  it("lets the identity header scroll away", () => {
    /* It is read once; pinning it would cost a third of the viewport. */
    renderDemo();
    expect(screen.getByTestId("detail-header").className).not.toContain("sticky");
  });

  it("pins the summary rail while the body scrolls", () => {
    renderDemo();
    const aside = screen.getByTestId("detail-aside");
    expect(aside.className).toContain("sticky");
    /* Static again once the split collapses — a sticky full-width block
       would cover the content it sits above. */
    expect(aside.className).toContain("max-[1240px]:static");
  });

  it("splits 70/30 on desktop and stacks below 1240px", () => {
    renderDemo();
    const split = screen.getByTestId("detail-split");
    expect(split.className).toContain("grid-cols-[minmax(0,1fr)_320px]");
    expect(split.className).toContain("max-[1240px]:grid-cols-1");
  });

  it("steps the KPI strip down to two columns on a narrow screen", () => {
    renderDemo();
    expect(screen.getByTestId("detail-kpis").className).toContain("max-[1100px]:grid-cols-2");
  });
});

describe("Detail layout — tabs", () => {
  it("renders only the tabs whose condition passes", () => {
    renderDemo();
    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getByRole("tab", { name: "First" })).toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: "Second" })).toBeInTheDocument();
    /* `when: () => false` removes the tab, it does not disable it. */
    expect(within(tablist).queryByRole("tab", { name: "Gated" })).toBeNull();
  });

  it("switches the body when a tab is clicked", async () => {
    const user = userEvent.setup();
    renderDemo();

    expect(screen.getByText("Card One")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Second" }));

    expect(screen.getByText("Second tab body")).toBeInTheDocument();
    expect(screen.queryByText("Card One")).toBeNull();
  });

  it("jumps to the tab a KPI card names", async () => {
    const user = userEvent.setup();
    renderDemo();

    await user.click(screen.getByText("Second KPI"));
    expect(screen.getByText("Second tab body")).toBeInTheDocument();
  });
});

describe("Detail layout — card grid", () => {
  it("lays three cards across on a wide screen", () => {
    renderDemo();
    /* Overview-first depends on this: three stacked sections would not
       read in one screenful, three columns do. */
    for (const t of ["Card One", "Card Two", "Card Three"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    const grid = screen.getByText("Card One").closest(".grid")!;
    expect(grid.className).toContain("grid-cols-3");
    expect(grid.className).toContain("max-[1400px]:grid-cols-2");
    expect(grid.className).toContain("max-[900px]:grid-cols-1");
  });
});

describe("Detail layout — summary rail", () => {
  it("renders the rail title, rows and quick links", () => {
    renderDemo();
    const aside = screen.getByTestId("detail-aside");

    expect(within(aside).getByText("Summary")).toBeInTheDocument();
    expect(within(aside).getByText("Row Label")).toBeInTheDocument();
    expect(within(aside).getByText("Row Value")).toBeInTheDocument();

    const links = screen.getByTestId("detail-quick-links");
    expect(within(links).getByText("Open Panel")).toBeInTheDocument();
    expect(within(links).getByText("3 items")).toBeInTheDocument();
  });
});

describe("Detail layout — panel drawer", () => {
  it("stays closed until something opens it", () => {
    renderDemo();
    expect(screen.queryByText("Panel body content")).toBeNull();
  });

  it("opens a panel of blocks from a quick link", async () => {
    const user = userEvent.setup();
    renderDemo();

    await user.click(screen.getByText("Open Panel"));

    expect(screen.getByText("Panel Title")).toBeInTheDocument();
    expect(screen.getByText("Panel Subtitle")).toBeInTheDocument();
    expect(screen.getByText("Panel body content")).toBeInTheDocument();
  });

  it("closes again, leaving no residue in the store", async () => {
    const user = userEvent.setup();
    renderDemo();

    await user.click(screen.getByText("Open Panel"));
    expect(useUI.getState().panelOpts).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(useUI.getState().panelOpts).toBeNull();
  });
});

describe("Detail layout — reusable by every master", () => {
  it("drives every registered entity through the same engine", () => {
    /* If a master needed its own detail page, this framework would have
       failed. Every schema in the registry renders here. */
    for (const [key, schemas] of Object.entries(REGISTRY)) {
      expect(schemas.detail, key).toBeDefined();
      expect(typeof schemas.detail.identity, key).toBe("function");
      expect(typeof schemas.detail.kpis, key).toBe("function");
      expect(Array.isArray(schemas.detail.tabs), key).toBe(true);
      expect(schemas.detail.tabs.length, key).toBeGreaterThan(0);
    }
  });

  it("renders a real master through the same layout as the demo", () => {
    /* Business Partner is the first adopter, not a special case. */
    render(<FullDetail schema={bpSchemas.detail} record={getBP("BP000123")!} />);
    expect(screen.getByTestId("detail-sticky")).toBeInTheDocument();
  });

  it("gives a schema without an aside the full page width", () => {
    /* The rail is optional. Business Partner dropped it so its cards could
       run edge to edge, and the layout must not leave a gap where it was. */
    render(<FullDetail schema={bpSchemas.detail} record={getBP("BP000123")!} />);
    expect(screen.queryByTestId("detail-aside")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-quick-links")).not.toBeInTheDocument();
  });

  it("keeps the record image off the list and on the detail page", () => {
    /* A thumbnail is decorative at list scale and costs a column of width
       users scan past; the detail header is where it identifies the record. */
    for (const key of ["product", "business-partner"]) {
      const schemas = REGISTRY[key];
      const code = schemas.list.columns.find((c) => c.key === "code")!;
      const rec = schemas.list.source()[0];

      const { container, unmount } = render(<>{code.cell(rec)}</>);
      expect(container.querySelector("img"), `${key} list thumbnail`).toBeNull();
      expect(container.textContent, key).toBe(rec.code);
      unmount();

      /* The detail identity still carries it. */
      expect(schemas.detail.identity(rec).image, `${key} detail image`).toBeTruthy();
    }
  });

  it("keeps every tab key unique within a schema", () => {
    for (const [key, schemas] of Object.entries(REGISTRY)) {
      const keys = schemas.detail.tabs.map((t) => t.key);
      expect(new Set(keys).size, key).toBe(keys.length);
    }
  });
});
