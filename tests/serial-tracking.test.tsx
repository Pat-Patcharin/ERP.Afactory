import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import {
  LIFECYCLE_STATUSES,
  PHYSICAL_STATUSES,
  SERIAL_CORRECTIONS,
  SERIAL_CUSTOMERS,
  SERIAL_EXCEPTIONS,
  SERIAL_INSTALLS,
  SERIAL_MODELS,
  SERIAL_SUPPLIERS,
  SERVICE_JOBS,
  SUPPLIER_CLAIMS,
  WARRANTY_EXPIRING_DAYS,
  type SerialException,
} from "@/data/serials";
import { ADJUSTMENTS, type Adjustment } from "@/data/adjustments";
import { decorateAdjustments } from "@/lib/domain/adjustment";
import { invalidateMovements } from "@/lib/domain/movement";
import { STOCK_SERIALS } from "@/lib/domain/stock";
import {
  addMonths,
  canSeeCost,
  findSerial,
  getSerial,
  invalidateSerials,
  replacementValid,
  serialClaims,
  serialCorrections,
  serialCustomers,
  serialDocs,
  serialExceptions,
  serialInbound,
  serialInstall,
  serialLocationHistory,
  serialMovements,
  serialOutbound,
  serialReturns,
  serialRole,
  serialRows,
  serialService,
  serialSummary,
  serialTimeline,
  serialsNamed,
  setSerialRole,
  statusIssues,
  warrantyStatusOf,
  warrantyWatch,
  type SerialRow,
} from "@/lib/domain/serial";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { serialTrackingSchemas } from "@/schemas/serial-tracking";

const { list, detail } = serialTrackingSchemas;

const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );

const EXC_SEED = JSON.parse(JSON.stringify(SERIAL_EXCEPTIONS)) as SerialException[];
const ADJ_SEED = JSON.parse(JSON.stringify(ADJUSTMENTS)) as Adjustment[];

const restore = () => {
  SERIAL_EXCEPTIONS.length = 0;
  SERIAL_EXCEPTIONS.push(...(JSON.parse(JSON.stringify(EXC_SEED)) as SerialException[]));
  ADJUSTMENTS.length = 0;
  ADJUSTMENTS.push(...(JSON.parse(JSON.stringify(ADJ_SEED)) as Adjustment[]));
  decorateAdjustments();
  invalidateMovements();
  invalidateSerials();
  setSerialRole("Admin");
};

function stubCtx() {
  const calls = {
    toasts: [] as { title: string; tone?: string }[],
    confirmed: false,
    modal: null as null | { onConfirm?: () => boolean | void },
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
      formModal: (o: { onConfirm?: () => boolean | void }) => {
        calls.modal = o;
      },
      refresh: () => {},
      quickView: () => {},
    } as never,
  };
}

const action = (rec: SerialRow, ctx: never, label: string) =>
  detail.actions!(rec, ctx).find((a) => a.label === label)!;

beforeEach(() => {
  window.localStorage.clear();
  restore();
});

afterEach(() => setSerialRole("Admin"));

/* ============================================================
   SERIAL TRACKING regression suite.
   ============================================================ */

describe("Serial Tracking — serial master", () => {
  it("builds at least the eighty serials the module was specified with", () => {
    expect(serialRows().length).toBeGreaterThanOrEqual(80);
  });

  it("covers at least twelve serial-controlled products", () => {
    expect(new Set(serialRows().map((r) => r.product)).size).toBeGreaterThanOrEqual(12);
    expect(SERIAL_MODELS).toHaveLength(12);
  });

  it("keys a serial by product and serial number together", () => {
    for (const r of serialRows()) expect(r.code).toBe(`${r.product}|${r.serial}`);
    const keys = serialRows().map((r) => r.code);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries every serial Stock Inquiry lists, at the same place", () => {
    for (const s of STOCK_SERIALS) {
      const row = findSerial(s.product, s.serial);
      expect(row, `${s.product}/${s.serial}`).not.toBeNull();
      /* A serial on a shelf has to agree with Stock Inquiry about which shelf. */
      if (row!.warehouse) {
        expect(row!.warehouse).toBe(s.warehouse);
        expect(row!.location).toBe(s.location);
      }
    }
  });

  it("resolves every serial an operational record names", () => {
    const named = [
      ...SERIAL_INSTALLS.map((x) => x.serial),
      ...SERVICE_JOBS.map((x) => x.serial),
      ...SUPPLIER_CLAIMS.map((x) => x.serial),
      ...SERIAL_CORRECTIONS.flatMap((x) => [x.wrongSerial, x.correctSerial]),
      ...SERIAL_EXCEPTIONS.map((x) => x.serial),
    ];
    for (const s of named) expect(serialsNamed(s).length, s).toBeGreaterThan(0);
  });

  it("covers every situation the spec lists", () => {
    const rows = serialRows();
    for (const state of [
      "Available",
      "Reserved",
      "Shipped",
      "Delivered",
      "Installed",
      "Returned",
      "Under Repair",
      "Replaced",
      "Scrapped",
      "Corrected",
      "Lost",
      "Blocked",
    ]) {
      expect(rows.some((r) => r.lifecycle === state), state).toBe(true);
    }
    expect(rows.some((r) => r.conflict)).toBe(true);
    expect(rows.some((r) => r.duplicate)).toBe(true);
  });

  it("mocks the supporting records the spec asks for", () => {
    expect(SERIAL_SUPPLIERS.length).toBeGreaterThanOrEqual(15);
    expect(SERIAL_CUSTOMERS.length).toBeGreaterThanOrEqual(15);
    expect(SERIAL_INSTALLS.length).toBeGreaterThanOrEqual(10);
    expect(SERVICE_JOBS.length).toBeGreaterThanOrEqual(10);
    expect(SERIAL_CORRECTIONS.length).toBeGreaterThanOrEqual(4);
    expect(SERIAL_EXCEPTIONS.length).toBeGreaterThanOrEqual(5);
    expect(SUPPLIER_CLAIMS.length).toBeGreaterThanOrEqual(4);
  });
});

describe("Serial Tracking — lifecycle and stock status", () => {
  it("keeps lifecycle and physical status as separate fields", () => {
    const rec = serialRows().find((r) => r.lifecycle === "Installed")!;
    expect(rec.lifecycle).toBe("Installed");
    expect(rec.physical).toBe("Sold / Customer Possession");
    expect(list.filters.some((f) => f.id === "lifecycle")).toBe(true);
    expect(list.filters.some((f) => f.id === "physical")).toBe(true);
  });

  it("uses only the declared vocabularies", () => {
    for (const r of serialRows()) {
      expect(LIFECYCLE_STATUSES, r.serial).toContain(r.lifecycle);
      expect(PHYSICAL_STATUSES, r.serial).toContain(r.physical);
    }
  });

  it("never leaves a picked, shipped or sold serial Available", () => {
    for (const r of serialRows()) {
      if (["Picked", "Packed", "Shipped", "Delivered", "Installed", "In Use"].includes(r.lifecycle)) {
        expect(r.physical, r.serial).not.toBe("Available");
      }
    }
  });

  it("keeps a reserved serial on hand but not available", () => {
    const rec = serialRows().find((r) => r.lifecycle === "Reserved")!;
    expect(rec.physical).toBe("Reserved");
    expect(rec.ownerType).toBe("A-Factory Warehouse");
    expect(rec.warehouse).toBeTruthy();
  });

  it("holds a returned serial before it can be available again", () => {
    for (const r of serialRows()) {
      if (r.lifecycle === "Returned" || r.lifecycle === "Return Hold") {
        expect(["Return Hold", "QC Hold"], r.serial).toContain(r.physical);
      }
    }
  });

  it("never puts a serial in a warehouse and at a customer at once", () => {
    const conflicts = serialRows().filter((r) => r.warehouse && r.ownerType === "Customer");
    /* Exactly the one seeded fault, and it is reported rather than hidden. */
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflict).toBe(true);
    expect(statusIssues(conflicts[0]).map((i) => i.title)).toContain("Serial Ownership Conflict");
  });

  it("keeps a scrapped serial out of stock", () => {
    for (const r of serialRows().filter((x) => x.lifecycle === "Scrapped")) {
      expect(r.physical).toBe("Scrap Hold");
      expect(r.ownerType).toBe("Scrapped / Closed");
    }
  });

  it("counts each serial as exactly one unit through its movements", () => {
    const rec = serialRows().find((r) => serialMovements(r).length > 2)!;
    for (const m of serialMovements(rec)) {
      expect(m.qtyIn + m.qtyOut).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(m.balanceAfter);
    }
  });

  it("summarises the states the KPI cards read", () => {
    const s = serialSummary();
    expect(s.total).toBe(serialRows().length);
    expect(s.available).toBe(serialRows().filter((r) => r.physical === "Available").length);
    expect(s.underRepair).toBe(serialRows().filter((r) => r.lifecycle === "Under Repair").length);
  });
});

describe("Serial Tracking — warranty", () => {
  const inDays = (n: number) => {
    const d = new Date(Date.now() + n * 86_400_000);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  it("classifies every warranty band", () => {
    expect(warrantyStatusOf("", "")).toBe("Not Started");
    expect(warrantyStatusOf(inDays(-400), inDays(-10))).toBe("Expired");
    expect(warrantyStatusOf(inDays(-100), inDays(20))).toBe("Expiring Soon");
    expect(warrantyStatusOf(inDays(-100), inDays(400))).toBe("Active");
    expect(warrantyStatusOf(inDays(-100), inDays(400), { claimOpen: true })).toBe("Under Claim");
    expect(warrantyStatusOf(inDays(-100), inDays(400), { void: true })).toBe("Void");
    expect(warrantyStatusOf(inDays(-100), inDays(400), { suspended: true })).toBe("Suspended");
  });

  it("treats anything inside sixty days as expiring soon", () => {
    expect(WARRANTY_EXPIRING_DAYS).toBe(60);
    expect(warrantyStatusOf(inDays(-10), inDays(WARRANTY_EXPIRING_DAYS - 1))).toBe("Expiring Soon");
    expect(warrantyStatusOf(inDays(-10), inDays(WARRANTY_EXPIRING_DAYS + 5))).toBe("Active");
  });

  it("counts the warranty from delivery or installation", () => {
    const installed = serialRows().find((r) => r.installDate && r.warrantyStart)!;
    expect(installed.warrantyStart).toBe(installed.installDate);
    expect(installed.warrantyBasis).toBe("Installation Date");

    const delivered = serialRows().find(
      (r) => r.deliveryDate && !r.installDate && r.warrantyStart,
    )!;
    expect(delivered.warrantyStart).toBe(delivered.deliveryDate);
    expect(delivered.warrantyBasis).toBe("Delivery Date");
  });

  it("adds whole months without rolling past the month end", () => {
    expect(addMonths("31/01/2026", 1)).toBe("28/02/2026");
    expect(addMonths("15/06/2026", 24)).toBe("15/06/2028");
    expect(addMonths("", 12)).toBe("");
  });

  it("never starts a warranty for a serial still on the shelf", () => {
    for (const r of serialRows().filter((x) => x.physical === "Available" && !x.deliveryDate)) {
      expect(r.warrantyStatus, r.serial).toBe("Not Started");
    }
  });

  it("watches expiring and expired warranties, soonest first", () => {
    const watch = warrantyWatch();
    expect(watch.length).toBeGreaterThan(0);
    for (const w of watch) {
      expect(["Expiring Soon", "Expired"]).toContain(w.warrantyStatus);
    }
    for (let i = 1; i < watch.length; i++) {
      expect(watch[i].warrantyDays ?? 0).toBeGreaterThanOrEqual(watch[i - 1].warrantyDays ?? 0);
    }
  });
});

describe("Serial Tracking — traceability", () => {
  const traced = () => serialRows().find((r) => r.serial === "GT1-TH-000128")!;

  it("traces backward to supplier, purchase order, receipt and QC", () => {
    const chain = serialInbound(traced());
    expect(chain.map((s) => s.stage)).toEqual([
      "Supplier",
      "Purchase Order",
      "Goods Receipt",
      "QC Inspection",
      "Put Away",
      "Available Serial",
    ]);
    for (const s of chain) {
      if (!s.entity) continue;
      const rows = getSchemas(s.entity)!.list.source();
      expect(rows.some((x) => x.code === s.doc), `${s.entity}/${s.doc}`).toBe(true);
    }
  });

  it("traces forward to picking, shipment and customer", () => {
    const chain = serialOutbound(traced());
    expect(chain.map((s) => s.stage)).toContain("Sales Order Reservation");
    expect(chain.map((s) => s.stage)).toContain("Shipment");
    expect(chain.map((s) => s.stage)).toContain("Customer Delivery");
    for (const s of chain) {
      if (!s.entity) continue;
      const rows = getSchemas(s.entity)!.list.source();
      expect(rows.some((x) => x.code === s.doc), `${s.entity}/${s.doc}`).toBe(true);
    }
  });

  it("shows nothing outbound for a serial that never left the shelf", () => {
    const shelf = serialRows().find((r) => r.lifecycle === "Available" && !r.customerCode)!;
    expect(serialOutbound(shelf)).toHaveLength(0);
  });

  it("records the location history every unit passes through", () => {
    const history = serialLocationHistory(traced());
    const events = history.map((h) => h.event);
    expect(events).toContain("Received");
    expect(events).toContain("Put Away");
    expect(events).toContain("Shipped");
    for (const h of history) expect(h.when).toBeTruthy();
  });

  it("derives movement history from the same events", () => {
    const rec = traced();
    expect(serialMovements(rec)).toHaveLength(serialLocationHistory(rec).length);
    const shipped = serialMovements(rec).find((m) => m.type === "Shipped")!;
    expect(shipped.qtyOut).toBe(1);
    expect(shipped.balanceAfter).toBe(0);
  });

  it("names the customer that received the unit", () => {
    const rows = serialCustomers(traced());
    expect(rows[0].customer).toBe("KCMH Hospital");
    expect(rows[0].status).toBe("Delivered");
    expect(rows[0].shipRef).toBe("SHP-2026-000031");
  });

  it("gives a replacement unit the history of the one it replaced", () => {
    const replacement = serialRows().find((r) => r.serial === "DCH-TH-000029")!;
    expect(replacement.replacementOf).toBe("DCH-TH-000016");
    const rows = serialCustomers(replacement);
    expect(rows).toHaveLength(2);
    expect(rows[1].status).toBe("Replaced");
  });

  it("links a returned serial to its replacement in both directions", () => {
    const returned = serialRows().find((r) => r.serial === "DCH-TH-000016")!;
    expect(returned.replacedBy).toBe("DCH-TH-000029");
    expect(returned.lifecycle).toBe("Replaced");
    expect(replacementValid(returned)).toBe(true);
  });

  it("refuses a replacement chain that folds back on itself", () => {
    const rec = serialRows().find((r) => r.serial === "DCH-TH-000029")!;
    const original = { ...rec, replacedBy: "DCH-TH-000016" } as SerialRow;
    /* DCH-TH-000016 already points at 000029, so this closes a loop. */
    expect(replacementValid(original)).toBe(false);
  });

  it("traces returns back to a real sales return", () => {
    const rec = serialRows().find((r) => serialReturns(r).length > 0)!;
    for (const x of serialReturns(rec)) {
      const rows = getSchemas("sales-return")!.list.source();
      expect(rows.some((r) => r.code === x.code), x.code).toBe(true);
    }
  });

  it("keeps the original serial when one is corrected", () => {
    const corrected = serialRows().find((r) => r.serial === "IOC-TH-000112")!;
    expect(corrected.lifecycle).toBe("Corrected");
    expect(corrected.correctedTo).toBe("IOC-TH-000121");
    /* Both numbers still resolve; the history is never overwritten. */
    expect(serialsNamed("IOC-TH-000112").length).toBeGreaterThan(0);
    expect(serialsNamed("IOC-TH-000121").length).toBeGreaterThan(0);
    const correction = serialCorrections(corrected)[0];
    expect(correction.wrongSerial).toBe("IOC-TH-000112");
    expect(correction.correctSerial).toBe("IOC-TH-000121");
    expect(correction.code).toMatch(/^ADJ-/);
  });

  it("carries the installation and service placeholders", () => {
    const installed = serialRows().find((r) => r.installRef)!;
    expect(serialInstall(installed)).not.toBeNull();
    expect(installed.installStatus).toBeTruthy();

    const serviced = serialRows().find((r) => r.serviceCount > 0)!;
    expect(serialService(serviced).length).toBeGreaterThan(0);
    expect(serialService(serviced)[0].technician).toBeTruthy();
  });

  it("carries the supplier claim placeholder", () => {
    const claimed = serialRows().find((r) => r.claimCount > 0)!;
    const claims = serialClaims(claimed);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims[0].supplierCode).toMatch(/^SUP-/);
  });

  it("builds a document relationship from the documents that exist", () => {
    const docs = serialDocs(traced());
    expect(docs.length).toBeGreaterThan(4);
    for (const d of docs) {
      if (!d.entity) continue;
      const rows = getSchemas(d.entity)!.list.source();
      expect(rows.some((x) => x.code === d.name), `${d.entity}/${d.name}`).toBe(true);
    }
  });

  it("orders the lifecycle timeline oldest first", () => {
    const events = serialTimeline(traced());
    expect(events.map((e) => e.title)).toContain("Serial Created");
    expect(events.map((e) => e.title)).toContain("Delivered");
    expect(events.map((e) => e.title)).toContain("Warranty Started");
  });
});

describe("Serial Tracking — exceptions", () => {
  const conflicted = () => serialRows().find((r) => r.conflict)!;
  const clean = () => serialRows().find((r) => statusIssues(r).length === 0 && !serialExceptions(r).length)!;

  it("detects the duplicate serial the mock data seeds", () => {
    const dupe = serialRows().find((r) => r.duplicate)!;
    expect(dupe.serial).toBe("HPC-TH-000204");
    expect(statusIssues(dupe).map((i) => i.title)).toContain("Duplicate Serial");
    expect(SERIAL_EXCEPTIONS.some((e) => e.type === "Duplicate Serial")).toBe(true);
  });

  it("detects the missing serial the mock data seeds", () => {
    const lost = serialRows().find((r) => r.lifecycle === "Lost")!;
    expect(statusIssues(lost).map((i) => i.title)).toContain("Missing Serial");
    expect(SERIAL_EXCEPTIONS.some((e) => e.type === "Missing Serial")).toBe(true);
  });

  it("requires type, severity and description to open an investigation", () => {
    const { ctx, calls } = stubCtx();
    const rec = clean();
    const before = SERIAL_EXCEPTIONS.length;

    action(rec, ctx, "เริ่มการสอบสวน").run!(rec);
    expect(calls.modal).not.toBeNull();
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(SERIAL_EXCEPTIONS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("refuses a second investigation for the same serial", () => {
    const { ctx, calls } = stubCtx();
    const rec = conflicted();
    action(rec, ctx, "เริ่มการสอบสวน").run!(rec);
    expect(calls.modal).toBeNull();
    expect(calls.toasts.at(-1)!.title).toMatch(/มีเรื่องสอบสวนอยู่แล้ว/);
  });

  it("refuses a stock adjustment before an investigation exists", () => {
    const { ctx, calls } = stubCtx();
    const rec = clean();
    const before = ADJUSTMENTS.length;

    const a = action(rec, ctx, "ตั้งใบปรับปรุงสต๊อก");
    expect(a.disabled).toBe(true);
    a.run!(rec);
    expect(ADJUSTMENTS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("hands a wrong serial to Stock Adjustment as a Serial Correction", () => {
    const { ctx, calls } = stubCtx();
    const rec = conflicted();
    const before = ADJUSTMENTS.length;

    action(rec, ctx, "ตั้งใบปรับปรุงสต๊อก").run!(rec);
    expect(calls.confirmed).toBe(true);
    expect(ADJUSTMENTS.length).toBe(before + 1);

    const adj = ADJUSTMENTS[0];
    expect(adj.type).toBe("Serial Correction");
    expect(adj.reason).toBe("Wrong Serial");
    expect(adj.status).toBe("Draft");
    expect(adj.refDoc).toBe(serialExceptions(rec)[0].code);
    expect(adj.items[0].action).toBe("Correct Serial");
    expect(adj.items[0].qty).toBe(1);
    expect(adj.items[0].serials).toEqual([rec.serial]);
    expect(calls.goto.at(-1)).toBe(`/m/stock-adjustment/${adj.code}`);
  });

  it("hands a missing serial over as a write-off instead", () => {
    const { ctx } = stubCtx();
    const lost = serialRows().find(
      (r) => r.lifecycle === "Lost" && serialExceptions(r).some((e) => e.type === "Missing Serial"),
    )!;
    action(lost, ctx, "ตั้งใบปรับปรุงสต๊อก").run!(lost);

    const adj = ADJUSTMENTS[0];
    expect(adj.type).toBe("Negative Adjustment");
    expect(adj.reason).toBe("Lost Stock");
    expect(adj.items[0].action).toBe("Decrease Quantity");
  });

  it("never creates a second adjustment for the same exception", () => {
    const { ctx, calls } = stubCtx();
    const rec = conflicted();
    action(rec, ctx, "ตั้งใบปรับปรุงสต๊อก").run!(rec);
    const after = ADJUSTMENTS.length;

    invalidateSerials();
    const again = getSerial(rec.code)!;
    action(again, ctx, "ตั้งใบปรับปรุงสต๊อก").run!(again);
    expect(ADJUSTMENTS.length).toBe(after);
    expect(calls.toasts.at(-1)!.title).toMatch(/ตั้งใบปรับปรุงไปแล้ว/);
  });

  it("escalates and closes an exception without touching the serial", () => {
    const { ctx } = stubCtx();
    const rec = conflicted();
    const exception = serialExceptions(rec)[0];

    action(rec, ctx, "ยกระดับเรื่อง").run!(rec);
    expect(exception.status).toBe("Escalated");

    action(rec, ctx, "ปิดเรื่องสอบสวน").run!(rec);
    expect(exception.status).not.toBe("Closed");

    const stub = stubCtx();
    action(rec, stub.ctx, "ปิดเรื่องสอบสวน").run!(rec);
    expect(stub.calls.modal!.onConfirm!()).toBe(false);
  });

  it("never changes a serial or a stock position from the module itself", () => {
    const { ctx } = stubCtx();
    const before = serialRows().map((r) => `${r.code}:${r.lifecycle}:${r.location}`).join("|");
    const rec = conflicted();
    for (const label of ["ยกระดับเรื่อง", "ขอตรวจสอบข้อมูลหลัก", "บันทึกการติดตั้ง", "เปิดใบแจ้งซ่อม"]) {
      action(rec, ctx, label).run!(rec);
    }
    invalidateSerials();
    expect(serialRows().map((r) => `${r.code}:${r.lifecycle}:${r.location}`).join("|")).toBe(before);
  });
});

describe("Serial Tracking — read-only", () => {
  it("offers no create, edit or delete", () => {
    expect(list.hideCreate).toBe(true);
    expect(getSchemas("serial-tracking")!.form).toBeUndefined();

    const rec = serialRows()[0];
    const labels = [
      ...list.rowActions(rec, {} as never).map((a) => a.label ?? ""),
      ...(detail.actions?.(rec, {} as never) ?? []).map((a) => a.label ?? ""),
    ];
    for (const l of labels) {
      expect(l.toLowerCase()).not.toMatch(/edit serial|delete|แก้ไขหมายเลข|ลบ|เปลี่ยนคลัง|เปลี่ยนลูกค้า/);
    }
  });

  it("renders no create button on the list", () => {
    renderList();
    expect(screen.queryByRole("button", { name: /สร้าง|Create|New/ })).not.toBeInTheDocument();
  });
});

describe("Serial Tracking — list", () => {
  it("renders the title and subtitle", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Serial Tracking" })).toBeInTheDocument();
    expect(screen.getByText(/Trace serialized inventory/)).toBeInTheDocument();
  });

  it("renders all twelve KPI cards", () => {
    renderList();
    for (const label of [
      "Total Serials",
      "Available",
      "Reserved",
      "In Transit",
      "Delivered",
      "Installed",
      "Return Hold",
      "Under Repair",
      "Warranty Active",
      "Warranty Expiring",
      "Blocked",
      "Scrapped",
    ]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("declares the columns and quick filters the spec lists", () => {
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Serial Number",
      "Product Code",
      "Product Name",
      "Brand",
      "Category",
      "Lifecycle Status",
      "Physical Stock Status",
      "Current Warehouse",
      "Current Location",
      "Current Customer",
      "Supplier",
      "Received Date",
      "Goods Receipt",
      "QC Result",
      "Sales Order",
      "Shipment",
      "Delivery Date",
      "Installation Date",
      "Warranty Start",
      "Warranty End",
      "Warranty Status",
      "Return Number",
      "Service Job",
      "Replacement Serial",
      "Last Movement",
      "Updated At",
    ]) {
      expect(labels, label).toContain(label);
    }
    expect(list.tabs).toHaveLength(14);
  });

  it("exposes the advanced filters the spec lists", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of [
      "lifecycle",
      "physical",
      "product",
      "cat",
      "brand",
      "supplier",
      "manufacturer",
      "warehouse",
      "zone",
      "rack",
      "shelf",
      "bin",
      "received",
      "delivered",
      "installed",
      "warrantyStatus",
      "warrantyEnd",
      "customer",
      "salesRep",
      "repairOnly",
      "returnedOnly",
      "correctedOnly",
      "exceptionOnly",
      "myWarehouse",
      "myCustomers",
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("searches by serial number", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), "GT1-TH-000128");
    expect(screen.getByText(/^1 serials$/)).toBeInTheDocument();
  });

  it("searches by product, customer, supplier and shipment", () => {
    for (const f of ["product", "productName", "customer", "supplier", "shipRef", "serviceJob"]) {
      expect(list.searchFields).toContain(f);
    }
    const rec = serialRows().find((r) => r.customer && r.shipRef)!;
    const matches = (needle: string) =>
      serialRows().filter((r) =>
        list.searchFields
          .map((f) => String((r as unknown as Record<string, unknown>)[f] ?? ""))
          .join(" ")
          .toLowerCase()
          .includes(needle.toLowerCase()),
      );
    expect(matches(rec.customer).length).toBeGreaterThan(0);
    expect(matches(rec.supplier).length).toBeGreaterThan(0);
    expect(matches(rec.shipRef).length).toBeGreaterThan(0);
  });

  it("filters by lifecycle status", async () => {
    const user = userEvent.setup();
    renderList();
    const expected = serialRows().filter((r) => r.lifecycle === "Available").length;
    await user.selectOptions(screen.getByLabelText("Lifecycle Status"), "Available");
    expect(screen.getByText(new RegExp(`^${expected} serials$`))).toBeInTheDocument();
  });

  it("filters by physical stock status, warehouse and warranty", () => {
    const byPhysical = list.filters.find((f) => f.id === "physical")!;
    expect(
      serialRows().filter((r) => byPhysical.test(r, "Available")).every((r) => r.physical === "Available"),
    ).toBe(true);

    const wh = serialRows().find((r) => r.warehouse)!.warehouse;
    const byWh = list.filters.find((f) => f.id === "warehouse")!;
    expect(serialRows().filter((r) => byWh.test(r, wh)).every((r) => r.warehouse === wh)).toBe(true);

    const byWarranty = list.filters.find((f) => f.id === "warrantyStatus")!;
    const active = serialRows().filter((r) => byWarranty.test(r, "Active"));
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((r) => r.warrantyStatus === "Active")).toBe(true);
  });

  it("shows the exception review and warranty watch panels", () => {
    renderList();
    expect(screen.getByText("Serial Exception Review")).toBeInTheDocument();
    expect(screen.getByText("Warranty Watch")).toBeInTheDocument();
  });
});

describe("Serial Tracking — drawer and detail", () => {
  it("declares the seventeen tabs the spec asks for", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "status",
      "location",
      "movement",
      "inbound",
      "outbound",
      "customer",
      "installation",
      "warranty",
      "service",
      "returns",
      "claim",
      "corrections",
      "exceptions",
      "docs",
      "timeline",
      "audit",
    ]);
  });

  it("heads the serial with both statuses, the owner and the warranty", () => {
    const rec = serialRows().find((r) => r.serial === "GT1-TH-000128")!;
    const id = detail.identity(rec);
    expect(id.code).toBe(rec.serial);
    const badges = id.badges.map((b) => b.text);
    expect(badges).toContain(rec.lifecycle);
    expect(badges).toContain(rec.physical);
    expect(badges).toContain(rec.warrantyStatus);
    expect(badges).toContain(rec.ownerType);
    expect(detail.kpis(rec).map((k) => k.label)).toContain("Warranty Days Left");
  });

  it("opens when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), "GT1-TH-000128");
    await user.click(screen.getAllByText("GT1-TH-000128")[0]);

    const drawer = await screen.findByRole("dialog", { name: /Portable X-Ray GT1/ });
    expect(within(drawer).getByRole("tab", { name: "Current Status" })).toBeInTheDocument();
  });

  it("opens the full traceability page", () => {
    const rec = serialRows().find((r) => r.serial === "GT1-TH-000128")!;
    render(<FullDetail schema={detail} record={rec} />);
    expect(screen.getAllByText(rec.serial).length).toBeGreaterThan(0);
    for (const tab of ["Inbound Trace", "Outbound Trace", "Warranty", "Service / Repair", "Exceptions"]) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument();
    }
  });

  it("shows the ownership conflict on the current status tab", () => {
    const rec = serialRows().find((r) => r.conflict)!;
    render(<FullDetail schema={detail} record={rec} />);
    expect(screen.getAllByText("Serial Ownership Conflict").length).toBeGreaterThan(0);
  });

  it("navigates into the source goods receipt and shipment", () => {
    const { ctx, calls } = stubCtx();
    const rec = serialRows().find((r) => r.grRef && r.shipRef)!;
    list.rowActions(rec, ctx).find((a) => a.icon === "goodsReceipt")!.run!(rec);
    expect(calls.entities.at(-1)).toBe(`goods-receipt/${rec.grRef}`);
    list.rowActions(rec, ctx).find((a) => a.icon === "truck")!.run!(rec);
    expect(calls.entities.at(-1)).toBe(`shipment/${rec.shipRef}`);
  });
});

describe("Serial Tracking — roles, export and responsive", () => {
  it("hides cost from the roles that must not see it", () => {
    expect(serialRole()).toBe("Admin");
    expect(canSeeCost()).toBe(true);

    setSerialRole("Sales User");
    expect(canSeeCost()).toBe(false);

    const rec = serialRows()[0];
    const blocks = detail.tabs[0].blocks(rec, {} as never).filter(Boolean);
    expect(blocks.some((b) => b && b.type === "restricted")).toBe(true);
    expect(list.columns.find((c) => c.key === "unitCost")!.cell(rec)).toBe("—");
  });

  it("shows cost again for a role that may see it", () => {
    setSerialRole("Finance User");
    expect(canSeeCost()).toBe(true);
    const rec = serialRows()[0];
    const blocks = detail.tabs[0].blocks(rec, {} as never).filter(Boolean);
    expect(blocks.some((b) => b && b.type === "restricted")).toBe(false);
  });

  it("offers Excel, CSV, print and a scan placeholder", () => {
    const { ctx, calls } = stubCtx();
    const labels = list.secondaryActions!(ctx).map((a) => a.label);
    expect(labels).toContain("Export Excel");
    expect(labels).toContain("Export CSV");
    expect(labels).toContain("Print");
    expect(labels).toContain("Scan Serial");

    list.secondaryActions!(ctx).find((a) => a.label === "Scan Serial")!.run();
    expect(calls.toasts.at(-1)!.title).toMatch(/สแกนหมายเลขเครื่อง/);
  });

  it("exports a single serial without writing a file", () => {
    const { ctx, calls } = stubCtx();
    const rec = serialRows()[0];
    list.rowActions(rec, ctx).find((a) => a.label === "ส่งออกการสอบกลับ")!.run!(rec);
    expect(calls.toasts.at(-1)!.title).toMatch(/ส่งออก/);
  });

  it("offers the bulk actions the spec lists", () => {
    const { ctx } = stubCtx();
    const rows = serialRows().slice(0, 3);
    const labels = list.bulkActions!(rows, ctx).map((a) => a.label);
    expect(labels.some((l) => l.startsWith("ส่งออกที่เลือก"))).toBe(true);
    expect(labels.some((l) => l.startsWith("พิมพ์การสอบกลับ"))).toBe(true);
    expect(labels.some((l) => l.startsWith("เพิ่มเข้าการสอบสวน"))).toBe(true);
    expect(labels.some((l) => l.startsWith("เปรียบเทียบหมายเลขที่เลือก"))).toBe(true);
  });

  it("scrolls the wide table rather than the page", () => {
    const { container } = renderList();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("opens with a readable column subset and a locked identity column", () => {
    const visible = list.columns.filter((c) => !c.defaultHidden);
    expect(visible.length).toBeLessThan(list.columns.length);
    expect(list.columns.find((c) => c.key === "serial")?.locked).toBe(true);
    expect(list.columns.find((c) => c.key === "unitCost")?.defaultHidden).toBe(true);
  });
});

describe("Serial Tracking — navigation", () => {
  it("is registered read-only in the entity registry", () => {
    expect(REGISTRY["serial-tracking"]).toBeDefined();
    expect(getSchemas("serial-tracking")!.form).toBeUndefined();
  });

  it("is reachable from the Inventory sidebar group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    const item = group.items.find((i) => i.label === "Serial Tracking")!;
    expect(item.href).toBe("/m/serial-tracking");
    expect(item.soon).toBeUndefined();
    expect(pageHref("Serial Tracking")).toBe("/m/serial-tracking");
  });

  it("leaves the phases after Inventory as coming soon", () => {
    /* Inventory is complete; Finance and the rest are the next phase. */
    for (const label of ["Finance", "Service", "Reports"]) {
      const group = NAV.find((g) => g.label === label);
      expect(group, label).toBeDefined();
      expect(group!.items.every((i) => i.soon), label).toBe(true);
    }
  });

  it("keeps the other Inventory modules untouched", () => {
    expect(pageHref("Inventory Workspace")).toBe("/inventory");
    expect(pageHref("Stock Inquiry")).toBe("/m/stock-inquiry");
    expect(pageHref("Stock Card")).toBe("/m/stock-card");
    expect(pageHref("Stock Transfer")).toBe("/m/stock-transfer");
    expect(pageHref("Stock Adjustment")).toBe("/m/stock-adjustment");
    expect(pageHref("Cycle Count")).toBe("/m/cycle-count");
    expect(pageHref("Lot Tracking")).toBe("/m/lot-tracking");
  });

  it("resolves a serial by product and serial number", () => {
    const rec = serialRows()[0];
    expect(findSerial(rec.product, rec.serial)?.code).toBe(rec.code);
    expect(getSerial(rec.code)?.serial).toBe(rec.serial);
  });
});
