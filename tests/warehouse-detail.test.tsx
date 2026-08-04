import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FullDetail } from "@/components/engine/FullDetail";
import { WAREHOUSES, getWarehouse } from "@/lib/domain/warehouse";
import { movementRows, warehouseReceipts } from "@/lib/domain/movement";
import { warehouseSchemas } from "@/schemas/warehouse";
import { WAREHOUSE_FORM } from "@/schemas/forms/warehouse";
import type { ActionCtx } from "@/lib/types";

/* ============================================================
   WAREHOUSE DETAIL regression suite.

   The page was trimmed to what a user reads about a warehouse.
   Everything that configures how it behaves belongs to the edit
   form, and the tests below are what keeps the two from drifting
   back into each other.
   ============================================================ */

const { detail } = warehouseSchemas;
const MAIN = "WH-BKK";
const wh = (code: string) => getWarehouse(code)!;

const makeCtx = (over: Partial<ActionCtx> = {}): ActionCtx => ({
  goto: () => {},
  openEntity: () => {},
  toast: () => {},
  confirm: () => {},
  formModal: () => {},
  refresh: () => {},
  quickView: () => {},
  panel: () => {},
  ...over,
});

/** Every block title a tab renders, flattened through grids. */
const titlesOf = (blocks: unknown[]): string[] =>
  blocks.filter(Boolean).flatMap((b) => {
    const block = b as { type?: string; title?: string; items?: unknown[] };
    if (block.type === "grid") return titlesOf(block.items ?? []);
    return block.title ? [block.title] : [];
  });

/** Every field label a tab renders. */
const labelsOf = (blocks: unknown[]): string[] =>
  blocks.filter(Boolean).flatMap((b) => {
    const block = b as { type?: string; items?: { label?: string }[] };
    return block.type === "fields" || block.type === "cards" || block.type === "flags"
      ? (block.items ?? []).filter(Boolean).map((i) => i.label ?? "")
      : [];
  });

const overview = () => detail.tabs[0].blocks(wh(MAIN), makeCtx());

describe("Warehouse detail — header", () => {
  it("carries no KPI strip", () => {
    /* Total SKU, Utilization, Bin Locations and Manager each have a home
       further down the page; repeating them cost the header its job. */
    expect(detail.kpis(wh(MAIN))).toEqual([]);
  });

  it("still identifies the warehouse", () => {
    const id = detail.identity(wh(MAIN));
    expect(id.code).toBe(MAIN);
    expect(id.title).toBeTruthy();
    expect(id.badges.length).toBeGreaterThan(0);
  });
});

describe("Warehouse detail — tabs", () => {
  it("drops the tabs that moved or belong to maintenance", () => {
    const keys = detail.tabs.map((t) => t.key);
    expect(keys).toEqual([
      "overview",
      "locations",
      "inventory",
      "documents",
      "history",
    ]);
    for (const gone of ["config", "address", "rules"]) {
      expect(keys, gone).not.toContain(gone);
    }
  });

  it("keeps the configuration switches on the form, not on the page", () => {
    /* They decide how the warehouse behaves, so they are edited, not read. */
    const paths = WAREHOUSE_FORM.steps
      .flatMap((s) => s.blocks(WAREHOUSE_FORM.blank()))
      .filter(Boolean)
      .flatMap((b) => (b && "fields" in b ? b.fields : [b]))
      .filter(Boolean)
      .map((f) => (f as { path?: string }).path);

    for (const p of ["config.purchase", "config.sales", "config.valuation"]) {
      expect(paths, p).toContain(p);
    }
  });
});

describe("Warehouse detail — overview", () => {
  it("gathers general information, address and storage conditions", () => {
    expect(titlesOf(overview())).toEqual([
      "General Information",
      "Description",
      "Address",
      "Storage Conditions",
    ]);
  });

  it("drops the manager, the email and the system information", () => {
    const labels = labelsOf(overview());
    for (const gone of [
      "Warehouse Manager",
      "Email",
      "Created Date",
      "Created By",
      "Last Updated",
      "Updated By",
    ]) {
      expect(labels, gone).not.toContain(gone);
    }
    /* The phone belongs to the warehouse, not to a person, so it stays. */
    expect(labels).toContain("Phone");
  });

  it("keeps the storage conditions and leaves capacity behind", () => {
    const labels = labelsOf(overview());
    for (const kept of [
      "Temperature",
      "Humidity Control",
      "Hazardous Storage",
      "Controlled Substance",
      "Secure Storage",
    ]) {
      expect(labels, kept).toContain(kept);
    }
    for (const gone of ["Maximum Capacity", "Current Capacity", "Utilization", "Capacity Unit"]) {
      expect(labels, gone).not.toContain(gone);
    }
  });

  it("shows the full address it used to hide behind a tab", () => {
    const labels = labelsOf(overview());
    for (const l of ["Address", "Subdistrict", "District", "Province", "Postal Code", "Country"]) {
      expect(labels, l).toContain(l);
    }
  });
});

describe("Warehouse detail — receiving history", () => {
  it("reads what arrived from the same ledger Stock Card shows", () => {
    const rows = warehouseReceipts(MAIN);
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(m.warehouse).toBe(MAIN);
      expect(m.qtyIn).toBeGreaterThan(0);
      /* Same objects, not a copy that could drift. */
      expect(movementRows()).toContain(m);
    }
  });

  it("counts only what came in, never what went out", () => {
    const outbound = movementRows().filter((m) => m.warehouse === MAIN && m.qtyIn === 0);
    expect(outbound.length).toBeGreaterThan(0);
    for (const m of outbound) expect(warehouseReceipts(MAIN)).not.toContain(m);
  });

  it("keeps each warehouse to its own receipts", () => {
    for (const w of WAREHOUSES.slice(0, 4)) {
      for (const m of warehouseReceipts(w.code)) expect(m.warehouse).toBe(w.code);
    }
  });

  it("replaces the record log with the goods that arrived", () => {
    const tab = detail.tabs.find((t) => t.key === "history")!;
    expect(tab.label).toBe("Receiving History");

    const blocks = tab.blocks(wh(MAIN), makeCtx());
    expect(titlesOf(blocks)[0]).toBe("Goods Received");
    /* No timeline of who edited the record. */
    expect(blocks.filter(Boolean).some((b) => b && b.type === "timeline")).toBe(false);

    const table = blocks.filter(Boolean).find((b) => b && b.type === "table") as {
      rows: unknown[];
      cols: { key: string }[];
    };
    expect(table.rows.length).toBeGreaterThan(0);
    for (const k of ["when", "type", "sourceDoc", "product", "lot", "serial", "qtyIn"]) {
      expect(table.cols.map((c) => c.key), k).toContain(k);
    }
  });

  it("totals the quantity that came in", () => {
    const blocks = detail.tabs.find((t) => t.key === "history")!.blocks(wh(MAIN), makeCtx());
    const cards = blocks.filter(Boolean).find((b) => b && b.type === "cards") as {
      items: { label: string; value: string }[];
    };
    const receipts = warehouseReceipts(MAIN);
    expect(cards.items.find((i) => i.label === "Receipts")!.value).toBe(
      receipts.length.toLocaleString(),
    );
  });
});

describe("Warehouse detail — page", () => {
  it("renders without the removed tabs", () => {
    render(<FullDetail schema={detail} record={wh(MAIN)} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Receiving History" })).toBeInTheDocument();
    for (const gone of ["Configuration", "Address", "Storage Rules"]) {
      expect(screen.queryByRole("tab", { name: gone }), gone).toBeNull();
    }
  });

  it("opens on an overview that already answers where and what", () => {
    render(<FullDetail schema={detail} record={wh(MAIN)} />);
    expect(screen.getByText("General Information")).toBeInTheDocument();
    /* Twice over: the card heading and the street-address row inside it. */
    expect(screen.getAllByText("Address").length).toBeGreaterThan(0);
    expect(screen.getByText("Storage Conditions")).toBeInTheDocument();
    expect(screen.queryByText("System Information")).toBeNull();
  });
});
