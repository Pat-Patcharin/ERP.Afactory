import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BarcodeLookupPage from "@/app/(erp)/barcode/page";
import { ListView } from "@/components/engine/ListView";
import { ConfirmModalHost, FormModalHost } from "@/components/ui";
import {
  CODE_ALIASES,
  GS1_AIS,
  GS1_EXAMPLES,
  INVALID_CODES,
  PACK_LEVELS,
  SCAN_LOG,
  UNKNOWN_CODES,
} from "@/data/barcodes";
import {
  barcodeSummary,
  checkDigit,
  documents,
  findDocument,
  findLocation,
  findPackage,
  findProductBarcode,
  locations,
  logScan,
  packageBarcode,
  packages,
  parseGS1,
  partialSearch,
  productBarcodes,
  recentScans,
  recognize,
  removeScan,
  scanHistory,
  type Match,
} from "@/lib/domain/barcode";
import { STOCK_POSITIONS } from "@/lib/domain/stock";
import { setSerialRole } from "@/lib/domain/serial";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { resultView, helpExamples } from "@/schemas/barcode-lookup";
import { scanHistorySchemas } from "@/schemas/scan-history";

const pushed: string[] = [];

const renderPage = () =>
  render(
    <>
      <BarcodeLookupPage />
      <FormModalHost />
      <ConfirmModalHost />
    </>,
  );

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (h: string) => pushed.push(h),
    replace: (h: string) => pushed.push(h),
    back: () => {},
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/barcode",
}));

const LOG_SEED = JSON.parse(JSON.stringify(scanHistory()));

const restore = () => {
  SCAN_LOG.length = 0;
  scanHistory();
  pushed.length = 0;
  setSerialRole("Admin");
};

function stubCtx() {
  const calls = {
    toasts: [] as { title: string; tone?: string }[],
    confirmed: false,
    modal: null as null | { title: string; onConfirm?: () => boolean | void },
    goto: [] as string[],
    entities: [] as string[],
  };
  return {
    calls,
    ctx: {
      goto: (h: string) => calls.goto.push(h),
      openEntity: (e: string, c?: string) => calls.entities.push(`${e}/${c ?? ""}`),
      toast: (title: string, _m?: string, tone?: string) => calls.toasts.push({ title, tone }),
      confirm: (o: { onConfirm: () => void }) => {
        calls.confirmed = true;
        o.onConfirm();
      },
      formModal: (o: { title: string; onConfirm?: () => boolean | void }) => {
        calls.modal = o;
      },
      refresh: () => {},
      quickView: () => {},
    } as never,
  };
}

const only = (code: string): Match => {
  const rec = recognize(code);
  expect(rec.outcome, `${code} → ${rec.outcome}`).toBe("Found");
  return rec.matches[0];
};

beforeEach(() => {
  window.localStorage.clear();
  restore();
});

afterEach(() => setSerialRole("Admin"));

/* ============================================================
   BARCODE LOOKUP regression suite.
   ============================================================ */

describe("Barcode Lookup — catalogue", () => {
  it("mocks the lookup data the spec asks for", () => {
    const s = barcodeSummary();
    expect(s.productBarcodes).toBeGreaterThanOrEqual(100);
    expect(s.lots).toBeGreaterThanOrEqual(30);
    expect(s.serials).toBeGreaterThanOrEqual(80);
    expect(s.locations).toBeGreaterThanOrEqual(20);
    expect(s.packages).toBeGreaterThanOrEqual(20);
    expect(s.documents).toBeGreaterThanOrEqual(60);
    expect(s.scans).toBeGreaterThanOrEqual(30);
    expect(UNKNOWN_CODES.length).toBeGreaterThanOrEqual(10);
    expect(INVALID_CODES.length).toBeGreaterThanOrEqual(10);
    expect(GS1_EXAMPLES.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps the barcode the product master prints", () => {
    for (const b of productBarcodes().filter((x) => x.primary)) {
      const hit = findProductBarcode(b.barcode);
      expect(hit?.product, b.barcode).toBe(b.product);
    }
  });

  it("gives every packing level its own GTIN", () => {
    const levels = productBarcodes().filter((b) => b.product === "AA-TH003-WL");
    expect(levels).toHaveLength(PACK_LEVELS.length);
    expect(new Set(levels.map((l) => l.barcode)).size).toBe(PACK_LEVELS.length);
    /* Only the Each level is the code on the master. */
    expect(levels.filter((l) => l.primary)).toHaveLength(1);
  });

  it("computes a GS1 check digit", () => {
    expect(checkDigit("123456789012")).toBe(8);
    expect(checkDigit("885123400013")).toBe(5);
  });

  it("builds the package label code the spec shows", () => {
    expect(packageBarcode("SHP-2026-000031", "PKG-01")).toBe("PKG-SHP-260031-01");
    expect(packages().some((p) => p.barcode === "PKG-SHP-260031-01")).toBe(true);
  });

  it("lists every location stock stands in", () => {
    for (const p of STOCK_POSITIONS.slice(0, 40)) {
      const key = `${p.warehouse}/${p.zone}/${p.rack}/${p.shelf}/${p.bin}`;
      expect(findLocation(key), key).not.toBeNull();
    }
  });

  it("indexes documents from every module that issues them", () => {
    const types = new Set(documents().map((d) => d.type));
    for (const t of [
      "Purchase Order",
      "Goods Receipt",
      "QC Inspection",
      "Sales Order",
      "Sales Invoice",
      "Shipment",
      "Sales Return",
      "Credit Note",
      "Stock Transfer",
      "Stock Adjustment",
      "Cycle Count",
    ]) {
      expect(types, t).toContain(t);
    }
  });
});

describe("Barcode Lookup — recognition", () => {
  it("recognises a product barcode", () => {
    const rec = recognize("8851234000131");
    expect(rec.codeType).toBe("Product Barcode");
    expect(rec.symbology).toBe("EAN-13");
    expect(rec.outcome).toBe("Found");
    expect(rec.matches[0].kind).toBe("product");
    expect(rec.matches[0].key).toBe("AA-TH003-WL");
  });

  it("recognises a product code", () => {
    const rec = recognize("AA-TH004-BK");
    expect(rec.codeType).toBe("Product Code");
    expect(rec.matches[0].kind).toBe("product");
  });

  it("recognises a lot number", () => {
    const rec = recognize("LOT-26001");
    expect(rec.codeType).toBe("Lot Number");
    expect(rec.matches[0].kind).toBe("lot");
  });

  it("recognises a serial number", () => {
    const rec = recognize("GT1-TH-000128");
    expect(rec.codeType).toBe("Serial Number");
    expect(rec.matches[0].kind).toBe("serial");
  });

  it("recognises a location code in both label forms", () => {
    const slash = recognize("WH-BKK/ZONE-A/RACK-01/SHELF-01/BIN-A01");
    const hyphen = recognize("WH-BKK-ZONE-A-RACK-01-SHELF-01-BIN-A01");
    expect(slash.codeType).toBe("Location Code");
    expect(slash.matches[0].kind).toBe("location");
    expect(hyphen.matches[0].key).toBe(slash.matches[0].key);
  });

  it("recognises a package number and a tracking number", () => {
    const pkg = recognize("PKG-SHP-260031-01");
    expect(pkg.codeType).toBe("Package Number");
    expect(pkg.matches[0].kind).toBe("package");

    const tracked = packages().find((p) => p.tracking)!;
    const track = recognize(tracked.tracking);
    expect(track.codeType).toBe("Shipment Tracking");
    expect(track.matches[0].kind).toBe("package");
  });

  it("routes a document number by its prefix", () => {
    const cases: [string, string][] = [
      ["PO2506124", "purchase-order"],
      ["GR25060001", "goods-receipt"],
      ["QC25060032", "qc-inspection"],
      ["SO2506-0001", "sales-order"],
      ["INV-2026-000021", "sales-invoice"],
      ["SHP-2026-000031", "shipment"],
      ["RTN-2026-000026", "sales-return"],
      ["CN-2026-000026", "credit-note"],
      ["TRF-2026-000021", "stock-transfer"],
      ["ADJ-2026-000021", "stock-adjustment"],
      ["CNT-2026-000021", "cycle-count"],
    ];
    for (const [code, entity] of cases) {
      const rec = recognize(code);
      expect(rec.codeType, code).toBe("Document Number");
      expect(rec.outcome, code).toBe("Found");
      expect(findDocument(code)!.entity, code).toBe(entity);
    }
  });

  it("trims and upper-cases before searching", () => {
    expect(recognize("  aa-th003-wl  ").matches[0].key).toBe("AA-TH003-WL");
  });

  it("resolves a legacy alias to what it actually is", () => {
    const rec = recognize("AFX-40W");
    expect(rec.outcome).toBe("Found");
    expect(rec.matches[0].key).toBe("AA-TH003-WL");
    expect(rec.matches[0].via).toMatch(/Legacy alias/);
    expect(CODE_ALIASES.some((a) => a.code === "AFX-40W")).toBe(true);
  });

  it("reports what an unmatched code looked like", () => {
    const rec = recognize("9999999999999");
    expect(rec.outcome).toBe("Not Found");
    expect(rec.codeType).toBe("Product Barcode");
    expect(rec.matches).toHaveLength(0);
  });

  it("never rejects a real product over its mock check digit", () => {
    const rec = recognize("8851234000131");
    expect(rec.checkDigitOk).toBe(false);
    expect(rec.outcome).toBe("Found");
  });

  it("falls back to a partial search when nothing matched exactly", () => {
    const hits = partialSearch("AA-TH003");
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every((h) => h.via === "Partial match")).toBe(true);
  });
});

describe("Barcode Lookup — GS1", () => {
  it("parses the application identifiers the spec lists", () => {
    const p = parseGS1("(01)08851234000131(10)LOT-26001(17)280630(21)GT1-TH-000128");
    expect(p.ok).toBe(true);
    expect(p.fields.map((f) => f.ai)).toEqual(["01", "10", "17", "21"]);
    expect(p.fields.find((f) => f.ai === "17")!.display).toBe("30/06/2028");
    expect(GS1_AIS.map((a) => a.ai)).toEqual(["01", "10", "17", "21", "30", "37"]);
  });

  it("looks the parsed payload up in every module it names", () => {
    const rec = recognize("(01)08851234000131(10)LOT-26001(17)280630(21)GT1-TH-000128");
    expect(rec.codeType).toBe("GS1 Composite Code");
    expect(rec.outcome).toBe("Multiple Matches");
    expect(rec.matches.map((m) => m.kind).sort()).toEqual(["lot", "product", "serial"]);
  });

  it("rejects an impossible expiry date", () => {
    const rec = recognize("(01)0885123400013(17)261399");
    expect(rec.outcome).toBe("Invalid");
    expect(rec.issue).toMatch(/13/);
    expect(rec.suggestion).toBeTruthy();
  });

  it("rejects an application identifier it does not support", () => {
    const p = parseGS1("(99)1234567890");
    expect(p.ok).toBe(false);
    expect(p.issues[0]).toMatch(/99/);
  });

  it("rejects an AI with no value", () => {
    expect(parseGS1("(10)").ok).toBe(false);
  });

  it("resolves every seeded GS1 example", () => {
    for (const ex of GS1_EXAMPLES) {
      const rec = recognize(ex.code);
      expect(rec.codeType, ex.code).toBe("GS1 Composite Code");
      expect(rec.outcome, ex.code).not.toBe("Invalid");
    }
  });
});

describe("Barcode Lookup — invalid and multiple", () => {
  it("reports every declared malformed code as invalid", () => {
    for (const bad of INVALID_CODES) {
      const rec = recognize(bad.code);
      expect(rec.outcome, bad.code).toBe("Invalid");
      expect(rec.issue, bad.code).toBeTruthy();
      expect(rec.suggestion, bad.code).toBeTruthy();
    }
  });

  it("rejects corrupted scan characters", () => {
    const rec = recognize("885123#00013!");
    expect(rec.outcome).toBe("Invalid");
    expect(rec.issue).toMatch(/อักขระ/);
  });

  it("offers a choice when a code matches more than one entity", () => {
    const rec = recognize("LOT-26010");
    expect(rec.outcome).toBe("Multiple Matches");
    expect(rec.matches.length).toBeGreaterThan(1);
    expect(new Set(rec.matches.map((m) => m.key)).size).toBe(rec.matches.length);
  });

  it("offers a choice when one code is both a location and a product", () => {
    const rec = recognize("A01-01-05");
    expect(rec.outcome).toBe("Multiple Matches");
    expect(rec.matches.map((m) => m.kind).sort()).toEqual(["location", "product"]);
    for (const m of rec.matches) expect(m.via).toMatch(/Legacy alias/);
  });

  it("offers a choice when a package number repeats across shipments", () => {
    const rec = recognize("PKG-01");
    expect(rec.outcome).toBe("Multiple Matches");
    expect(rec.matches.length).toBeGreaterThan(5);
    expect(rec.matches.every((m) => m.kind === "package")).toBe(true);
  });
});

describe("Barcode Lookup — result views", () => {
  it("builds a product result with the tabs the spec lists", () => {
    const { ctx } = stubCtx();
    const v = resultView(only("8851234000131"), ctx);
    expect(v.kind).toBe("product");
    expect(v.tabs.map((t) => t.label)).toEqual([
      "Overview",
      "By Warehouse",
      "By Location",
      "Lots",
      "Serials",
      "Reservations",
      "Incoming",
      "Recent Movement",
    ]);
    expect(v.summary).toMatchObject({ type: "cards" });
  });

  it("navigates a product result into the modules that own it", () => {
    const { ctx, calls } = stubCtx();
    const v = resultView(only("AA-TH003-WL"), ctx);
    const run = (label: string) => v.actions.find((a) => a.label === label)!.run();

    run("Open Product Master");
    expect(calls.entities.at(-1)).toBe("product/AA-TH003-WL");
    run("Open Stock Inquiry");
    expect(calls.goto.at(-1)).toBe("/m/stock-inquiry");
    run("Open Stock Card");
    expect(calls.goto.at(-1)).toBe("/m/product-stock-card/AA-TH003-WL");
    run("View Lot Tracking");
    expect(calls.goto.at(-1)).toBe("/m/lot-tracking");
    run("View Serial Tracking");
    expect(calls.goto.at(-1)).toBe("/m/serial-tracking");
    run("Copy Product Code");
    expect(calls.toasts.at(-1)!.title).toMatch(/คัดลอก/);
  });

  it("builds a lot result with the inventory breakdown", () => {
    const { ctx, calls } = stubCtx();
    const v = resultView(only("LOT-26001"), ctx);
    expect(v.kind).toBe("lot");
    expect(v.code).toBe("LOT-26001");
    const cards = v.summary as { items: { label: string }[] };
    for (const label of ["Available", "Reserved", "QC Hold", "Return Hold", "Expired", "Recall Hold"]) {
      expect(cards.items.map((i) => i.label), label).toContain(label);
    }
    v.actions.find((a) => a.label === "Open Lot Tracking")!.run();
    expect(calls.goto.at(-1)).toMatch(/^\/m\/lot-tracking\//);
    v.actions.find((a) => a.label === "Start Recall Review")!.run();
    expect(calls.toasts.at(-1)!.title).toMatch(/เรียกคืน/);
  });

  it("builds a serial result with current state and traceability", () => {
    const { ctx, calls } = stubCtx();
    const v = resultView(only("GT1-TH-000128"), ctx);
    expect(v.kind).toBe("serial");
    expect(v.badges.map((b) => b.text)).toContain("Delivered");
    expect(v.tabs.map((t) => t.key)).toEqual(["state", "trace"]);

    v.actions.find((a) => a.label === "Open Serial Tracking")!.run();
    expect(calls.goto.at(-1)).toMatch(/^\/m\/serial-tracking\//);
    v.actions.find((a) => a.label === "Open Shipment")!.run();
    expect(calls.entities.at(-1)).toBe("shipment/SHP-2026-000031");
  });

  it("warns on a serial with a conflict, a block or no assignment", () => {
    const { ctx } = stubCtx();
    const conflicted = resultView(only("ACL-TH-000073"), ctx);
    const blocks = conflicted.tabs[0].blocks.filter(Boolean);
    expect(
      blocks.some((b) => b && b.type === "alert" && b.title === "Serial Ownership Conflict"),
    ).toBe(true);

    const scrapped = recognize("USC-TH-000067").matches[0];
    const view = resultView(scrapped, ctx);
    expect(view.tabs[0].blocks.filter(Boolean).some((b) => b && b.type === "alert")).toBe(true);
  });

  it("builds a location result from the stock standing there", () => {
    const { ctx, calls } = stubCtx();
    const key = locations().find((l) => l.warehouse === "WH-BKK")!.key;
    const v = resultView(only(key), ctx);
    expect(v.kind).toBe("location");
    expect(v.subtitle).toBe(key);

    v.actions.find((a) => a.label === "Create Stock Transfer")!.run();
    expect(calls.toasts.at(-1)!.title).toMatch(/ใบโอนย้าย/);
    v.actions.find((a) => a.label === "Start Spot Count")!.run();
    expect(calls.toasts.at(-1)!.title).toMatch(/นับเฉพาะจุด/);
  });

  it("builds a package result with its items", () => {
    const { ctx, calls } = stubCtx();
    const v = resultView(only("PKG-SHP-260031-01"), ctx);
    expect(v.kind).toBe("package");
    const pkg = findPackage("SHP-2026-000031|PKG-01")!;
    expect(v.title).toContain(pkg.shipment);

    v.actions.find((a) => a.label === "Open Shipment")!.run();
    expect(calls.entities.at(-1)).toBe("shipment/SHP-2026-000031");
    v.actions.find((a) => a.label === "View Tracking")!.run();
    expect(calls.toasts.at(-1)!.title).toMatch(/ติดตามพัสดุ/);
  });

  it("builds a document result and opens the owning module", () => {
    const { ctx, calls } = stubCtx();
    const v = resultView(only("INV-2026-000021"), ctx);
    expect(v.kind).toBe("document");
    expect(v.title).toBe("Sales Invoice");

    v.actions.find((a) => a.label === "Open Document")!.run();
    expect(calls.entities.at(-1)).toBe("sales-invoice/INV-2026-000021");
  });

  it("offers a label preview for every result type", () => {
    const { ctx, calls } = stubCtx();
    for (const code of [
      "8851234000131",
      "LOT-26001",
      "GT1-TH-000128",
      "PKG-SHP-260031-01",
      "INV-2026-000021",
    ]) {
      const v = resultView(only(code), ctx);
      expect(v.label.code, code).toBeTruthy();
      expect(v.label.rows.length, code).toBeGreaterThan(3);
    }
    const loc = resultView(only(locations()[0].key), ctx);
    loc.actions.find((a) => a.label === "Print Location Label")!.run();
    expect(calls.modal!.title).toMatch(/ตัวอย่างป้าย/);
  });

  it("offers no action that changes stock", () => {
    const { ctx } = stubCtx();
    for (const code of [
      "8851234000131",
      "LOT-26001",
      "GT1-TH-000128",
      "PKG-SHP-260031-01",
      "INV-2026-000021",
      locations()[0].key,
    ]) {
      for (const a of resultView(only(code), ctx).actions) {
        expect(a.label.toLowerCase(), a.label).not.toMatch(
          /edit|delete|adjust quantity|change status|move stock/,
        );
      }
    }
  });
});

describe("Barcode Lookup — restricted data", () => {
  it("hides cost from a role that must not see it", () => {
    const { ctx } = stubCtx();
    const costField = () => {
      const v = resultView(only("8851234000131"), ctx);
      const fields = v.tabs[0].blocks[0] as { items: { label: string; value: unknown }[] };
      return fields.items.find((i) => i.label === "Average Cost")!.value;
    };
    expect(costField()).not.toBe("Restricted");
    setSerialRole("Sales User");
    expect(costField()).toBe("Restricted");
  });

  it("hides a document amount from the same role", () => {
    const { ctx } = stubCtx();
    const amount = () => {
      const v = resultView(only("INV-2026-000021"), ctx);
      const cards = v.summary as { items: { label: string; value: unknown }[] };
      return cards.items.find((i) => i.label === "Amount")!.value;
    };
    expect(amount()).not.toBe("Restricted");
    setSerialRole("Warehouse User");
    expect(amount()).toBe("Restricted");
  });
});

describe("Barcode Lookup — scan log", () => {
  it("seeds a scan history covering every outcome", () => {
    const rows = scanHistory();
    expect(rows.length).toBeGreaterThanOrEqual(30);
    for (const o of ["Found", "Multiple Matches", "Not Found", "Invalid"]) {
      expect(rows.some((r) => r.outcome === o), o).toBe(true);
    }
    expect(rows[0].code).toMatch(/^SCN-/);
  });

  it("records a scan without changing anything else", () => {
    const before = STOCK_POSITIONS.map((p) => `${p.code}:${p.onHand}`).join("|");
    const count = scanHistory().length;
    const rec = recognize("GT1-TH-000128");

    logScan(rec, { source: "USB Scanner", warehouse: "WH-BKK", user: "Admin", when: "02/08/2026 10:00" });
    expect(scanHistory().length).toBe(count + 1);
    expect(scanHistory()[0].scanned).toBe("GT1-TH-000128");
    expect(scanHistory()[0].outcome).toBe("Found");
    expect(STOCK_POSITIONS.map((p) => `${p.code}:${p.onHand}`).join("|")).toBe(before);
  });

  it("keeps only the last twenty in recent scans", () => {
    expect(recentScans(20)).toHaveLength(20);
    expect(recentScans(20)[0].code).toBe(scanHistory()[0].code);
  });

  it("removes a scan from history", () => {
    const id = scanHistory()[0].code;
    const count = scanHistory().length;
    removeScan(id);
    expect(scanHistory().length).toBe(count - 1);
    expect(scanHistory().some((s) => s.code === id)).toBe(false);
  });

  it("declares the Scan History list the spec asks for", () => {
    const { list } = scanHistorySchemas;
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Scan ID",
      "Scanned Code",
      "Code Type",
      "Result Entity",
      "Result Code",
      "Result Name",
      "Result Status",
      "Scan Source",
      "Warehouse Context",
      "User",
      "Date and Time",
      "Outcome",
    ]) {
      expect(labels, label).toContain(label);
    }
    const ids = list.filters.map((f) => f.id);
    for (const id of ["when", "user", "warehouse", "source", "codeType", "outcome", "entity", "mine"]) {
      expect(ids, id).toContain(id);
    }
    expect(list.hideCreate).toBe(true);
  });

  it("renders the Scan History list", () => {
    render(<ListView schema={scanHistorySchemas.list} />);
    expect(screen.getByRole("heading", { level: 1, name: "Scan History" })).toBeInTheDocument();
    expect(screen.getAllByText("Total Scans").length).toBeGreaterThan(0);
  });

  it("rescans a row from history", () => {
    const { ctx, calls } = stubCtx();
    const rec = scanHistory().find((r) => r.outcome === "Found")!;
    scanHistorySchemas.list.rowActions(rec, ctx).find((a) => a.label === "สแกนซ้ำ")!.run!(rec);
    expect(calls.goto.at(-1)).toBe(`/barcode?code=${encodeURIComponent(rec.scanned)}`);
  });
});

describe("Barcode Lookup — landing page", () => {
  it("renders the title, subtitle and scan panel", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Barcode Lookup" })).toBeInTheDocument();
    expect(screen.getByText(/Scan or enter a code to identify/)).toBeInTheDocument();
    expect(screen.getByLabelText("Scan Input")).toBeInTheDocument();
  });

  it("focuses the scan input on arrival", () => {
    renderPage();
    expect(document.activeElement).toBe(screen.getByLabelText("Scan Input"));
  });

  it("looks a code up when Enter is pressed", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Scan Input"), "GT1-TH-000128{Enter}");

    const result = await screen.findByTestId("bc-result");
    expect(within(result).getAllByText("GT1-TH-000128").length).toBeGreaterThan(0);
    expect(within(result).getAllByText("Portable X-Ray GT1").length).toBeGreaterThan(0);
  });

  it("looks a code up from the Scan button", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Scan Input"), "8851234000131");
    await user.click(screen.getByRole("button", { name: /^Scan$/ }));

    const result = await screen.findByTestId("bc-result");
    expect(within(result).getAllByText("A-FLEX PU40 (White)").length).toBeGreaterThan(0);
    expect(within(result).getAllByText("Product").length).toBeGreaterThan(0);
  });

  it("clears the input and the result", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText("Scan Input");
    await user.type(input, "LOT-26001{Enter}");
    expect(await screen.findByTestId("bc-result")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Clear$/ }));
    expect(input).toHaveValue("");
    expect(screen.queryByTestId("bc-result")).not.toBeInTheDocument();
  });

  it("clears with the Escape key", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText("Scan Input");
    await user.type(input, "LOT-26001{Enter}");
    await user.type(input, "{Escape}");
    expect(input).toHaveValue("");
  });

  it("announces the recognised type after a scan", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Scan Input"), "LOT-26001{Enter}");

    const panel = await screen.findByTestId("bc-recognition");
    expect(panel).toHaveAttribute("aria-live", "polite");
    expect(within(panel).getByText("Found")).toBeInTheDocument();
    expect(within(panel).getByText("Lot Number")).toBeInTheDocument();
  });

  it("offers the choice when a code matches several entities", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Scan Input"), "A01-01-05{Enter}");

    const multi = await screen.findByTestId("bc-multi");
    expect(within(multi).getByText(/ตรงกับ 2 รายการ/)).toBeInTheDocument();
    expect(within(multi).getByText("Location")).toBeInTheDocument();
    expect(within(multi).getByText("Product")).toBeInTheDocument();

    await user.click(within(multi).getByText("AA-TH003-WL"));
    expect(await screen.findByTestId("bc-result")).toBeInTheDocument();
  });

  it("shows the not-found state with recovery actions", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Scan Input"), "9999999999999{Enter}");

    const panel = await screen.findByTestId("bc-not-found");
    expect(within(panel).getByText("Code Not Found")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Report Unknown Barcode" })).toBeInTheDocument();
    /* An unknown code must never offer to create master data. */
    expect(within(panel).queryByRole("button", { name: /Create Product|Create Serial/ })).toBeNull();
  });

  it("shows the invalid state with the validation issue", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(
      screen.getByLabelText("Scan Input"),
      "(01)0885123400013(17)261399{Enter}",
    );

    const panel = await screen.findByTestId("bc-invalid");
    expect(within(panel).getByText("Invalid Code")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Use Raw Search" })).toBeInTheDocument();
  });

  it("shows the GS1 parsing placeholder", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(
      screen.getByLabelText("Scan Input"),
      "(01)08859000010013(21)GT1-TH-000128{Enter}",
    );

    const multi = await screen.findByTestId("bc-multi");
    await user.click(within(multi).getAllByText("GT1-TH-000128")[0]);
    expect(await screen.findByText("GS1 Parsing — Phase 1 Placeholder")).toBeInTheDocument();
    expect(screen.getAllByText("Phase 1 GS1 Parsing Placeholder").length).toBeGreaterThan(0);
  });

  it("logs every scan into Recent Scans", async () => {
    const user = userEvent.setup();
    renderPage();
    const before = scanHistory().length;
    await user.type(screen.getByLabelText("Scan Input"), "AA-TH004-BK{Enter}");

    await screen.findByTestId("bc-result");
    expect(scanHistory().length).toBe(before + 1);
    const recent = screen.getByTestId("bc-recent");
    expect(within(recent).getAllByText("AA-TH004-BK").length).toBeGreaterThan(0);
  });

  it("runs an example with one click", async () => {
    const user = userEvent.setup();
    renderPage();
    const help = screen.getByTestId("bc-help");
    await user.click(within(help).getByText(helpExamples()[1].code));
    expect(await screen.findByTestId("bc-result")).toBeInTheDocument();
  });

  it("offers the mock scanner with its modes and toggles", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /More Actions/ }));
    await user.click(screen.getByText("Start Mock Scanner"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Scanner Mode")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Warehouse Context")).toBeInTheDocument();
    expect(within(dialog).getByText("Continuous Scan")).toBeInTheDocument();
  });

  it("keeps scanning in continuous mode", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /More Actions/ }));
    await user.click(screen.getByText("Start Mock Scanner"));

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Scanner Scan Input");
    await user.type(input, "LOT-26001{Enter}");

    /* The modal stays open, the input clears, the result is listed. */
    expect(input).toHaveValue("");
    expect(within(dialog).getByText("ผลการสแกนในรอบนี้")).toBeInTheDocument();
    expect(within(dialog).getAllByText("LOT-26001").length).toBeGreaterThan(0);
  });

  it("renders the mobile scanner placeholder", () => {
    renderPage();
    const mobile = screen.getByTestId("bc-mobile-scanner");
    expect(within(mobile).getByText("Camera Scanner — Phase 2")).toBeInTheDocument();
    /* Hidden on desktop, shown on a phone. */
    expect(mobile.className).toContain("md:hidden");
  });

  it("lists the supported code types and document prefixes", () => {
    renderPage();
    expect(screen.getByText("Supported Code Types")).toBeInTheDocument();
    expect(screen.getAllByText("EAN-13").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GS1-128").length).toBeGreaterThan(0);
    expect(screen.getByText("Document Prefixes")).toBeInTheDocument();
  });

  it("documents the keyboard shortcuts", () => {
    renderPage();
    expect(screen.getByText(/Ctrl \+ K = Focus scan input/)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl \+ Shift \+ H = Scan/)).toBeInTheDocument();
  });
});

describe("Barcode Lookup — navigation", () => {
  it("is reachable from the Inventory sidebar group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    const item = group.items.find((i) => i.label === "Barcode Lookup")!;
    expect(item.href).toBe("/barcode");
    expect(item.soon).toBeUndefined();
    expect(pageHref("Barcode Lookup")).toBe("/barcode");
  });

  it("registers Scan History as a read-only route", () => {
    expect(REGISTRY["scan-history"]).toBeDefined();
    expect(getSchemas("scan-history")!.form).toBeUndefined();
  });

  it("completes the Inventory group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    expect(group.items.every((i) => !i.soon)).toBe(true);
    expect(group.items.map((i) => i.label)).toEqual([
      "Inventory Workspace",
      "Stock Inquiry",
      "Stock Card",
      "Stock Transfer",
      "Stock Adjustment",
      "Cycle Count",
      "Lot Tracking",
      "Serial Tracking",
      "Barcode Lookup",
    ]);
  });

  it("keeps the other Inventory modules untouched", () => {
    expect(pageHref("Inventory Workspace")).toBe("/inventory");
    expect(pageHref("Stock Inquiry")).toBe("/m/stock-inquiry");
    expect(pageHref("Stock Card")).toBe("/m/stock-card");
    expect(pageHref("Stock Transfer")).toBe("/m/stock-transfer");
    expect(pageHref("Stock Adjustment")).toBe("/m/stock-adjustment");
    expect(pageHref("Cycle Count")).toBe("/m/cycle-count");
    expect(pageHref("Lot Tracking")).toBe("/m/lot-tracking");
    expect(pageHref("Serial Tracking")).toBe("/m/serial-tracking");
  });

  it("keeps the seeded log stable across the suite", () => {
    expect(LOG_SEED.length).toBeGreaterThanOrEqual(30);
  });
});
