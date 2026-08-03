import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import {
  ADJUSTMENTS,
  REASON_CODES,
  findReason,
  nextAdjustmentCode,
  reasonsFor,
  type Adjustment,
} from "@/data/adjustments";
import { MOVEMENT_TYPE_MAP } from "@/data/movements";
import { PRODUCTS } from "@/lib/domain/product";
import { STOCK_POSITIONS } from "@/lib/domain/stock";
import { invalidateMovements, movementRows } from "@/lib/domain/movement";
import {
  adjustmentRows,
  adjustmentSummary,
  approvalTriggers,
  blockingIssues,
  decorateAdjustments,
  eligibleQty,
  evidenceRequired,
  lineMovementTypes,
  rawAdjustment,
  stockImpact,
} from "@/lib/domain/adjustment";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { stockAdjustmentSchemas } from "@/schemas/stock-adjustment";
import { stockAdjustmentForm } from "@/schemas/forms/stock-adjustment";
import { routerPush } from "./setup";

const { list, detail } = stockAdjustmentSchemas;

const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );

const SEED = JSON.parse(JSON.stringify(ADJUSTMENTS)) as Adjustment[];

const restore = () => {
  ADJUSTMENTS.length = 0;
  ADJUSTMENTS.push(...(JSON.parse(JSON.stringify(SEED)) as Adjustment[]));
  decorateAdjustments();
  invalidateMovements();
};

const row = (code: string) => adjustmentRows().find((r) => r.code === code)!;

/** A context that records what a workflow asked for and auto-confirms. */
function stubCtx() {
  const calls = {
    toasts: [] as { title: string; tone?: string }[],
    confirmed: false,
    modal: null as null | { onConfirm?: () => boolean | void },
    goto: [] as string[],
  };
  return {
    calls,
    ctx: {
      goto: (h: string) => calls.goto.push(h),
      openEntity: () => {},
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

beforeEach(() => {
  window.localStorage.clear();
  restore();
});

/* ============================================================
   STOCK ADJUSTMENT regression suite.
   ============================================================ */

describe("Stock Adjustment — mock data", () => {
  it("ships at least the twenty documents the module was specified with", () => {
    expect(ADJUSTMENTS.length).toBeGreaterThanOrEqual(20);
  });

  it("never references a product or warehouse that does not exist", () => {
    const products = new Set(PRODUCTS.map((p) => p.code));
    const warehouses = new Set(STOCK_POSITIONS.map((r) => r.warehouse));
    for (const a of ADJUSTMENTS) {
      expect(warehouses.has(a.warehouse), a.warehouse).toBe(true);
      for (const l of a.items) expect(products.has(l.code), l.code).toBe(true);
    }
  });

  it("covers every kind of adjustment the spec lists", () => {
    const rows = adjustmentRows();
    expect(rows.some((r) => r.qtyIn > 0)).toBe(true);
    expect(rows.some((r) => r.qtyOut > 0)).toBe(true);
    expect(rows.some((r) => r.statusQty > 0)).toBe(true);
    expect(rows.some((r) => r.items.some((l) => l.action === "Correct Location"))).toBe(true);
    expect(rows.some((r) => r.items.some((l) => l.action === "Correct Lot"))).toBe(true);
    expect(rows.some((r) => r.items.some((l) => l.action === "Correct Serial"))).toBe(true);
    expect(rows.some((r) => r.refType === "Cycle Count")).toBe(true);
    expect(rows.some((r) => r.refType === "Sales Return")).toBe(true);
    expect(rows.some((r) => r.reversalOf)).toBe(true);
    expect(rows.some((r) => r.reversedBy)).toBe(true);
    expect(rows.some((r) => r.evidence.length > 0)).toBe(true);
  });

  it("issues the next number in the ADJ series", () => {
    expect(nextAdjustmentCode()).toMatch(/^ADJ-2026-\d{6}$/);
    expect(ADJUSTMENTS.some((a) => a.code === nextAdjustmentCode())).toBe(false);
  });
});

describe("Stock Adjustment — reason codes", () => {
  it("carries the control metadata the spec asks for", () => {
    expect(REASON_CODES.length).toBeGreaterThanOrEqual(30);
    for (const r of REASON_CODES) {
      expect(["Positive", "Negative", "Status", "Correction"]).toContain(r.group);
      expect(typeof r.approvalRequired).toBe("boolean");
      expect(typeof r.evidenceRequired).toBe("boolean");
      expect(r.roles.length).toBeGreaterThan(0);
      expect(r.valueThreshold).toBeGreaterThan(0);
      expect(typeof r.negativeAllowed).toBe("boolean");
      expect(r.defaultTo).toBeTruthy();
    }
  });

  it("groups reasons into positive, negative, status and correction", () => {
    for (const g of ["Positive", "Negative", "Status", "Correction"] as const) {
      expect(reasonsFor(g).length).toBeGreaterThan(0);
    }
  });

  it("restricts the status path a status reason may take", () => {
    const qcRelease = findReason("QC Release", "Status")!;
    expect(qcRelease.fromStatus).toContain("QC Hold");
    expect(qcRelease.toStatus).toContain("Available");
    expect(qcRelease.approvalRequired).toBe(true);
  });

  it("forces evidence for damage, loss, expiry, scrap and theft", () => {
    for (const code of ["Damaged", "Lost Stock", "Expired", "Scrap", "Theft"]) {
      expect(findReason(code, "Negative")!.evidenceRequired, code).toBe(true);
    }
  });
});

describe("Stock Adjustment — adjustment principles", () => {
  it("changes on hand for a quantity adjustment", () => {
    const positive = adjustmentRows().find((r) => r.qtyIn > 0 && r.statusQty === 0)!;
    const impact = stockImpact(positive)[0];
    expect(impact.onHandAfter).toBe(impact.onHandBefore + positive.qtyIn);
    expect(impact.availableAfter).toBe(impact.availableBefore + positive.qtyIn);

    const negative = adjustmentRows().find(
      (r) => r.qtyOut > 0 && r.statusQty === 0 && r.items[0].statusFrom === "Available",
    )!;
    const negImpact = stockImpact(negative)[0];
    expect(negImpact.onHandAfter).toBe(negImpact.onHandBefore - negative.qtyOut);
  });

  it("leaves total on hand unchanged for a status adjustment", () => {
    const statusAdj = adjustmentRows().filter((r) => r.statusQty > 0 && r.netQty === 0);
    expect(statusAdj.length).toBeGreaterThan(0);
    for (const r of statusAdj) {
      for (const x of stockImpact(r)) {
        expect(x.onHandAfter, r.code).toBe(x.onHandBefore);
      }
    }
  });

  it("moves quantity between the two statuses it names", () => {
    /* Available 90 → 85, Damaged 10 → 15, On Hand 100 unchanged. */
    const rec = adjustmentRows().find(
      (r) =>
        r.items[0].action === "Change Stock Status" &&
        r.items[0].statusFrom === "Available" &&
        r.items[0].statusTo === "Damaged",
    )!;
    const x = stockImpact(rec)[0];
    const qty = rec.items[0].qty;
    expect(x.availableAfter).toBe(x.availableBefore - qty);
    expect(x.damagedAfter).toBe(x.damagedBefore + qty);
    expect(x.onHandAfter).toBe(x.onHandBefore);
  });

  it("leaves quantity unchanged for a location or tracking correction", () => {
    const corrections = adjustmentRows().filter(
      (r) => r.correctionQty > 0 && r.qtyIn === 0 && r.qtyOut === 0,
    );
    expect(corrections.length).toBeGreaterThan(0);
    for (const r of corrections) {
      expect(r.netQty, r.code).toBe(0);
      for (const x of stockImpact(r)) expect(x.onHandAfter, r.code).toBe(x.onHandBefore);
    }
  });
});

describe("Stock Adjustment — validation", () => {
  const draft = (over: Partial<Adjustment> = {}): Adjustment => ({
    ...(JSON.parse(JSON.stringify(SEED[1])) as Adjustment),
    status: "Draft",
    ...over,
  });

  it("passes a well-formed draft", () => {
    expect(blockingIssues(draft())).toHaveLength(0);
  });

  it("refuses a zero quantity", () => {
    const a = draft();
    a.items[0].qty = 0;
    expect(blockingIssues(a).some((i) => i.message.includes("มากกว่า 0"))).toBe(true);
  });

  it("prevents a decrease larger than the eligible stock", () => {
    const a = draft();
    a.items[0].action = "Decrease Quantity";
    a.items[0].qty = 999_999;
    expect(blockingIssues(a).some((i) => i.message.includes("เกินยอด"))).toBe(true);
  });

  it("prevents reducing reserved stock", () => {
    const a = draft();
    a.items[0].action = "Decrease Quantity";
    a.items[0].statusFrom = "Reserved";
    a.items[0].qty = 1;
    expect(blockingIssues(a).some((i) => i.message.includes("จองไว้"))).toBe(true);
  });

  it("refuses an invalid status path and an identical status", () => {
    const same = draft();
    same.items[0].action = "Change Stock Status";
    same.items[0].statusFrom = "Available";
    same.items[0].statusTo = "Available";
    expect(blockingIssues(same).some((i) => i.message.includes("ต้องต่างกัน"))).toBe(true);

    const invalid = draft();
    invalid.items[0].action = "Change Stock Status";
    invalid.items[0].statusFrom = "Return Hold";
    invalid.items[0].statusTo = "Blocked";
    expect(blockingIssues(invalid).some((i) => i.message.includes("ไม่ได้รับอนุญาต"))).toBe(true);
  });

  it("refuses a cross-warehouse location correction", () => {
    const a = draft();
    a.items[0].action = "Correct Location";
    a.items[0].locFrom = "WH-BKK/A-01-A01";
    a.items[0].locTo = "WH-CNX/C-01-C01";
    expect(blockingIssues(a).some((i) => i.message.includes("Stock Transfer"))).toBe(true);
  });

  it("refuses a lot correction without both lots", () => {
    const a = draft();
    a.items[0].action = "Correct Lot";
    a.items[0].lot = "LOT-26001";
    a.items[0].lotTo = "";
    expect(blockingIssues(a).some((i) => i.message.includes("Lot"))).toBe(true);
  });

  it("refuses a serial correction into a serial that already exists", () => {
    const existing = STOCK_POSITIONS.find((r) => r.serial)!.serial;
    const a = draft();
    a.items[0].action = "Correct Serial";
    a.items[0].serials = ["SN-DOES-NOT-EXIST"];
    a.items[0].serialsTo = [existing];
    expect(blockingIssues(a).some((i) => i.message.includes("มีอยู่ในระบบแล้ว"))).toBe(true);
  });

  it("refuses duplicate serials in one correction", () => {
    const a = draft();
    a.items[0].action = "Correct Serial";
    a.items[0].serials = ["SN-A"];
    a.items[0].serialsTo = ["SN-A"];
    expect(blockingIssues(a).some((i) => i.message.includes("ซ้ำ"))).toBe(true);
  });

  it("requires evidence when the reason demands it", () => {
    const a = draft({ reason: "Damaged", reasonGroup: "Negative", evidence: [] });
    expect(evidenceRequired(a)).toBe(true);
    expect(blockingIssues(a).some((i) => i.field === "evidence")).toBe(true);
  });

  it("requires a reason, a warehouse and at least one line", () => {
    expect(blockingIssues(draft({ reason: "" })).some((i) => i.field === "reason")).toBe(true);
    expect(blockingIssues(draft({ warehouse: "" })).some((i) => i.field === "warehouse")).toBe(true);
    expect(blockingIssues(draft({ items: [] })).some((i) => i.field === "items")).toBe(true);
  });
});

describe("Stock Adjustment — approval", () => {
  it("requires approval for negatives, restricted release and large quantities", () => {
    const base = JSON.parse(JSON.stringify(SEED[1])) as Adjustment;

    const negative = JSON.parse(JSON.stringify(base)) as Adjustment;
    negative.items[0].action = "Decrease Quantity";
    expect(approvalTriggers(negative).some((r) => r.includes("ปรับลด"))).toBe(true);

    const release = JSON.parse(JSON.stringify(base)) as Adjustment;
    release.items[0].action = "Change Stock Status";
    release.items[0].statusFrom = "QC Hold";
    release.items[0].statusTo = "Available";
    expect(approvalTriggers(release).some((r) => r.includes("กันไว้"))).toBe(true);

    const big = JSON.parse(JSON.stringify(base)) as Adjustment;
    big.items[0].qty = 500;
    expect(approvalTriggers(big).some((r) => r.includes("เกินเกณฑ์"))).toBe(true);
  });

  it("submits a draft into pending approval", () => {
    const { ctx, calls } = stubCtx();
    /* A draft that actually passes validation — the module must ship one. */
    const rec = adjustmentRows().find(
      (r) => r.status === "Draft" && r.canSubmit && blockingIssues(rawAdjustment(r.code)!).length === 0,
    )!;
    expect(rec, "a submittable draft must exist").toBeDefined();
    detail.actions!(rec, ctx).find((a) => a.label === "ส่งขออนุมัติ")!.run!(rec);
    expect(calls.confirmed).toBe(true);
    expect(["Pending Approval", "Ready to Post"]).toContain(row(rec.code).status);
  });

  it("approves a pending adjustment", () => {
    const { ctx } = stubCtx();
    const rec = adjustmentRows().find((r) => r.status === "Pending Approval")!;
    detail.actions!(rec, ctx).find((a) => a.label === "อนุมัติ")!.run!(rec);
    expect(row(rec.code).status).toBe("Approved");
    expect(row(rec.code).approvedBy).toBe("Admin");
  });

  it("refuses to reject without a reason", () => {
    const { ctx, calls } = stubCtx();
    const rec = adjustmentRows().find((r) => r.status === "Pending Approval")!;
    detail.actions!(rec, ctx).find((a) => a.label === "ไม่อนุมัติ")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
    expect(row(rec.code).status).toBe("Pending Approval");
  });
});

describe("Stock Adjustment — posting", () => {
  it("refuses to post without approval when approval is required", () => {
    const { ctx, calls } = stubCtx();
    const rec = adjustmentRows().find(
      (r) => r.status === "Pending Approval" && r.needsApproval,
    )!;
    detail.actions!(rec, ctx).find((a) => a.label === "บันทึกเข้าสต๊อก")!.run!(rec);
    expect(row(rec.code).status).toBe("Pending Approval");
    expect(calls.modal).toBeNull();
  });

  it("refuses to post the same document twice", () => {
    const { ctx, calls } = stubCtx();
    const rec = adjustmentRows().find((r) => r.status === "Posted")!;
    detail.actions!(rec, ctx).find((a) => a.label === "บันทึกเข้าสต๊อก")!.run!(rec);
    expect(calls.toasts.at(-1)!.title).toMatch(/บันทึกไปแล้ว/);
    expect(calls.modal).toBeNull();
  });

  it("requires the confirmation checklist before it commits", () => {
    const { ctx, calls } = stubCtx();
    const rec = adjustmentRows().find((r) => r.canPost && r.status !== "Posted")!;
    detail.actions!(rec, ctx).find((a) => a.label === "บันทึกเข้าสต๊อก")!.run!(rec);

    expect(calls.modal).not.toBeNull();
    /* Nothing ticked yet — the modal must stay open. */
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(row(rec.code).status).not.toBe("Posted");
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("never offers posting while evidence is missing", () => {
    for (const r of adjustmentRows()) {
      if (r.needsEvidence && !r.evidenceComplete && r.status !== "Posted") {
        const { ctx, calls } = stubCtx();
        detail.actions!(r, ctx).find((a) => a.label === "บันทึกเข้าสต๊อก")!.run!(r);
        expect(row(r.code).status, r.code).not.toBe("Posted");
        expect(calls.modal, r.code).toBeNull();
      }
    }
  });
});

describe("Stock Adjustment — stock movement integration", () => {
  it("maps every line action to a declared movement type", () => {
    for (const a of ADJUSTMENTS) {
      for (const l of a.items) {
        for (const t of lineMovementTypes(l, a.reason)) {
          expect(MOVEMENT_TYPE_MAP.get(t), t).toBeDefined();
        }
      }
    }
  });

  it("creates a positive movement for an increase", () => {
    const rec = adjustmentRows().find(
      (r) => r.status === "Posted" && r.qtyIn > 0 && r.reason === "Found Stock",
    )!;
    const moves = movementRows().filter((m) => m.sourceDoc === rec.code);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((m) => m.type === "Positive Adjustment" && m.qtyIn > 0)).toBe(true);
  });

  it("creates a negative movement for a decrease", () => {
    const rec = adjustmentRows().find(
      (r) => r.status === "Posted" && r.qtyOut > 0 && r.reason === "Expired",
    )!;
    const moves = movementRows().filter((m) => m.sourceDoc === rec.code);
    expect(moves.some((m) => m.qtyOut > 0)).toBe(true);
  });

  it("creates a status movement with no quantity change", () => {
    const rec = adjustmentRows().find(
      (r) => r.status === "Posted" && r.statusQty > 0 && r.items[0].statusFrom === "QC Hold",
    )!;
    const moves = movementRows().filter((m) => m.sourceDoc === rec.code);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.qtyIn).toBe(0);
      expect(m.qtyOut).toBe(0);
      expect(m.balanceAfter).toBe(m.balanceBefore);
      expect(m.statusBefore).not.toBe(m.statusAfter);
    }
  });

  it("creates a linked out and in pair for a location correction", () => {
    const rec = adjustmentRows().find(
      (r) => r.status === "Posted" && r.items[0].action === "Correct Location",
    )!;
    const moves = movementRows().filter((m) => m.sourceDoc === rec.code);
    expect(moves.some((m) => m.type === "Location Correction Out")).toBe(true);
    expect(moves.some((m) => m.type === "Location Correction In")).toBe(true);
    for (const m of moves) expect(m.balanceAfter).toBe(m.balanceBefore);
  });

  it("declares lot and serial correction pairs", () => {
    const lotLine = { action: "Correct Lot" } as never;
    expect(lineMovementTypes(lotLine)).toEqual(["Lot Correction Out", "Lot Correction In"]);
    const serialLine = { action: "Correct Serial" } as never;
    expect(lineMovementTypes(serialLine)).toEqual([
      "Serial Correction Out",
      "Serial Correction In",
    ]);
  });

  it("points every adjustment movement back at the module", () => {
    const moves = movementRows().filter((m) => m.sourceModule === "stock-adjustment");
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(REGISTRY["stock-adjustment"]).toBeDefined();
      expect(ADJUSTMENTS.some((a) => a.code === m.sourceDoc), m.sourceDoc).toBe(true);
    }
  });

  it("lets Stock Card open the adjustment that caused a movement", () => {
    const m = movementRows().find((x) => x.sourceModule === "stock-adjustment")!;
    const action = getSchemas("stock-card")!.list.rowActions(m, {
      goto: routerPush,
      openEntity: (e: string, c?: string) => routerPush(`/m/${e}/${c}`),
      toast: () => {},
    } as never).find((a) => a.icon === "file")!;

    expect(action.disabled).toBeFalsy();
    action.run!(m);
    expect(routerPush).toHaveBeenCalledWith(`/m/stock-adjustment/${m.sourceDoc}`);
  });

  it("keeps the ledger reconciled with adjustments in it", () => {
    for (const m of movementRows()) {
      expect(m.balanceAfter, m.code).toBe(m.balanceBefore + m.qtyIn - m.qtyOut);
      expect(m.availAfter + m.resAfter + m.qcAfter + m.retAfter, m.code).toBe(m.balanceAfter);
    }
  });
});

describe("Stock Adjustment — cancellation and reversal", () => {
  it("refuses to cancel without a reason and keeps the document", () => {
    const { ctx, calls } = stubCtx();
    const rec = adjustmentRows().find((r) => r.status === "Draft")!;
    const before = ADJUSTMENTS.length;

    detail.actions!(rec, ctx).find((a) => a.label === "ยกเลิก")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(ADJUSTMENTS.length).toBe(before);
    expect(row(rec.code).status).toBe("Draft");
  });

  it("never offers cancel once a document has posted", () => {
    for (const r of adjustmentRows()) {
      if (r.status === "Posted") expect(r.canCancel, r.code).toBe(false);
    }
  });

  it("requires a reason to reverse", () => {
    const { ctx, calls } = stubCtx();
    const rec = adjustmentRows().find((r) => r.canReverse)!;
    const before = ADJUSTMENTS.length;

    detail.actions!(rec, ctx).find((a) => a.label === "กลับรายการ")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(ADJUSTMENTS.length).toBe(before);
  });

  it("links reversal and original in both directions in the seeded data", () => {
    const reversal = adjustmentRows().find((r) => r.reversalOf)!;
    const original = adjustmentRows().find((r) => r.code === reversal.reversalOf)!;
    expect(original.reversedBy).toBe(reversal.code);
    expect(original.status).toBe("Reversed");
    /* The reversal undoes the original's direction. */
    expect(original.qtyIn > 0 ? reversal.qtyOut : reversal.qtyIn).toBeGreaterThan(0);
  });
});

describe("Stock Adjustment — edit rules", () => {
  it("allows editing only before approval", () => {
    for (const r of adjustmentRows()) {
      const guard = stockAdjustmentForm.editGuard!(r);
      if (["Draft", "Rejected", "Revision Requested", "Pending Approval"].includes(r.status)) {
        expect(guard, r.code).toBeNull();
      } else {
        expect(guard, r.code).not.toBeNull();
      }
    }
  });

  it("locks a posted adjustment", () => {
    const rec = adjustmentRows().find((r) => r.status === "Posted")!;
    expect(rec.isReadOnly).toBe(true);
    expect(stockAdjustmentForm.editGuard!(rec)).toMatch(/แก้ไขไม่ได้/);
    expect(list.rowActions(rec, {} as never).find((a) => a.label === "แก้ไข")!.disabled).toBe(true);
  });

  it("offers no delete action anywhere", () => {
    const rec = adjustmentRows()[0];
    const labels = [
      ...list.rowActions(rec, {} as never).map((a) => a.label ?? ""),
      ...(detail.actions?.(rec, {} as never) ?? []).map((a) => a.label ?? ""),
    ];
    for (const l of labels) expect(l.toLowerCase()).not.toMatch(/delete|ลบ/);
  });
});

describe("Stock Adjustment — list", () => {
  it("renders the title and subtitle", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Stock Adjustment" })).toBeInTheDocument();
    expect(screen.getByText(/Create controlled inventory corrections/)).toBeInTheDocument();
  });

  it("renders all ten KPI cards", () => {
    renderList();
    for (const label of [
      "Total Adjustments",
      "Draft",
      "Pending Approval",
      "Approved",
      "Posted Today",
      "Positive Adjustments",
      "Negative Adjustments",
      "Status Adjustments",
      "Reversed",
      "Total Value Impact",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("declares the columns and quick filters the spec lists", () => {
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Adjustment Number",
      "Adjustment Date",
      "Adjustment Type",
      "Reason",
      "Warehouse",
      "Location",
      "Items",
      "Quantity In",
      "Quantity Out",
      "Status Changes",
      "Value Impact",
      "Approval Status",
      "Adjustment Status",
      "Reference Document",
      "Requested By",
      "Posted By",
      "Updated At",
    ]) {
      expect(labels, label).toContain(label);
    }
    expect(list.tabs).toHaveLength(11);
  });

  it("exposes the advanced filters the spec lists", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of [
      "status",
      "type",
      "reason",
      "date",
      "warehouse",
      "zone",
      "rack",
      "bin",
      "product",
      "cat",
      "lot",
      "serial",
      "statusFrom",
      "statusTo",
      "positive",
      "negative",
      "value",
      "cycleCount",
      "returnRelated",
      "mine",
      "myWarehouse",
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("searches by adjustment number and reason", async () => {
    const user = userEvent.setup();
    renderList();
    const code = adjustmentRows()[0].code;
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), code);
    expect(screen.getByText(/^1 adjustments$/)).toBeInTheDocument();
  });

  it("filters by adjustment type", async () => {
    const user = userEvent.setup();
    renderList();
    const expected = adjustmentRows().filter((r) => r.type === "Positive Adjustment").length;
    await user.selectOptions(screen.getByLabelText("Adjustment Type"), "Positive Adjustment");
    expect(screen.getByText(new RegExp(`^${expected} adjustments$`))).toBeInTheDocument();
  });

  it("counts the summary the KPI cards read", () => {
    const s = adjustmentSummary();
    expect(s.total).toBe(adjustmentRows().length);
    expect(s.positive).toBe(adjustmentRows().filter((r) => r.qtyIn > 0).length);
  });
});

describe("Stock Adjustment — drawer and detail", () => {
  it("declares the tabs the spec asks for", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "items",
      "impact",
      "approval",
      "evidence",
      "exceptions",
      "movement",
      "docs",
      "timeline",
      "audit",
    ]);
  });

  it("heads the document with type, status and net impact", () => {
    const rec = adjustmentRows()[0];
    const id = detail.identity(rec);
    expect(id.code).toBe(rec.code);
    expect(id.badges.map((b) => b.text)).toContain(rec.status);
    expect(detail.kpis(rec).map((k) => k.label)).toEqual([
      "Quantity In",
      "Quantity Out",
      "Net Impact",
      "Status Qty",
      "Value Impact",
    ]);
  });

  it("opens when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    const rec = adjustmentRows()[0];
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), rec.code);
    await user.click(screen.getAllByText(rec.code)[0]);

    const drawer = await screen.findByRole("dialog", { name: new RegExp(rec.reason) });
    expect(within(drawer).getByRole("tab", { name: "Stock Impact" })).toBeInTheDocument();
  });

  it("opens the full detail page with the impact preview", () => {
    const rec = adjustmentRows().find((r) => r.statusQty > 0)!;
    render(<FullDetail schema={detail} record={rec} />);
    expect(screen.getAllByText(rec.code).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Stock Impact" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
  });
});

describe("Stock Adjustment — create form", () => {
  it("opens on a blank draft with a fresh number", () => {
    const s = stockAdjustmentForm.blank();
    expect(String(s.code)).toMatch(/^ADJ-2026-\d{6}$/);
    expect(s.reasonGroup).toBe("Positive");
    expect(s.items).toEqual([]);
  });

  it("declares the sections the spec lists", () => {
    const keys = stockAdjustmentForm.steps.map((s) => s.key);
    for (const k of [
      "info",
      "warehouse",
      "items",
      "lotserial",
      "evidence",
      "approval",
      "impact",
      "review",
    ]) {
      expect(keys, k).toContain(k);
    }
  });

  it("swaps the reason list and the line action when the group changes", () => {
    const state: Record<string, unknown> = {
      reasonGroup: "Negative",
      reason: "",
      type: "",
      items: [{ code: "X", action: "Increase Quantity" }],
    };
    stockAdjustmentForm.onChange!("reasonGroup", state);
    expect(state.type).toBe("Negative Adjustment");
    expect(reasonsFor("Negative").some((r) => r.code === state.reason)).toBe(true);
    expect((state.items as { action: string }[])[0].action).toBe("Decrease Quantity");
  });

  it("clamps a decrease to the eligible quantity", () => {
    const product = STOCK_POSITIONS[0].product;
    const state = {
      warehouse: "WH-BKK Bangkok Main Warehouse",
      reason: "Lost Stock",
      reasonGroup: "Negative",
      items: [{ code: product, action: "Decrease Quantity", qty: 999_999, eligible: 0 }],
    };
    stockAdjustmentForm.onGridChange!("items.0.qty", state);
    const r = (state.items as { qty: number; eligible: number }[])[0];
    expect(r.qty).toBe(r.eligible);
    expect(r.qty).toBeLessThan(999_999);
  });

  it("enforces the business rules inline", () => {
    const rules = stockAdjustmentForm.rules!;
    expect(
      rules
        .find((r) => r.label.includes("สถานะต้นทางและปลายทาง"))!
        .test({ items: [{ code: "X", action: "Change Stock Status", statusFrom: "A", statusTo: "A" }] }),
    ).toBe(false);
    expect(
      rules
        .find((r) => r.label.includes("เส้นทางสถานะ"))!
        .test({
          items: [
            { code: "X", action: "Change Stock Status", statusFrom: "Return Hold", statusTo: "Blocked" },
          ],
        }),
    ).toBe(false);
    expect(
      rules.find((r) => r.label.includes("Stock Transfer"))!.test({
        items: [
          { code: "X", action: "Correct Location", locFrom: "WH-BKK/A", locTo: "WH-CNX/C" },
        ],
      }),
    ).toBe(false);
    expect(
      rules.find((r) => r.label.includes("Serial"))!.test({
        items: [{ code: "X", action: "Correct Serial", serials: "A, B", serialsTo: "C" }],
      }),
    ).toBe(false);
  });

  it("saves a valid draft into the document list", () => {
    const { ctx, calls } = stubCtx();
    const before = ADJUSTMENTS.length;
    const product = PRODUCTS[0];

    stockAdjustmentForm.save(
      {
        code: nextAdjustmentCode(),
        adjDate: "01/08/2026",
        type: "Positive Adjustment",
        reasonGroup: "Positive",
        reason: "Found Stock",
        priority: "Normal",
        requestedBy: "Admin",
        description: "ทดสอบการบันทึก",
        refType: "Manual Request",
        warehouse: "WH-BKK Bangkok Main Warehouse",
        bin: "A01",
        items: [
          {
            code: product.code,
            name: product.name,
            unit: product.unit,
            action: "Increase Quantity",
            qty: 2,
            statusFrom: "Available",
            statusTo: "Available",
            unitCost: 80,
          },
        ],
      },
      ctx,
    );

    expect(ADJUSTMENTS.length).toBe(before + 1);
    expect(calls.toasts.at(-1)!.title).toMatch(/สร้างใบปรับปรุงแล้ว/);
  });

  it("refuses to save a document that breaks a rule", () => {
    const { ctx, calls } = stubCtx();
    const before = ADJUSTMENTS.length;

    stockAdjustmentForm.save(
      {
        code: nextAdjustmentCode(),
        adjDate: "01/08/2026",
        type: "Negative Adjustment",
        reasonGroup: "Negative",
        reason: "Damaged",
        requestedBy: "Admin",
        description: "ไม่มีหลักฐาน",
        warehouse: "WH-BKK Bangkok Main Warehouse",
        items: [
          {
            code: PRODUCTS[0].code,
            action: "Decrease Quantity",
            qty: 1,
            statusFrom: "Available",
          },
        ],
      },
      ctx,
    );

    /* Damaged demands evidence, and there is none. */
    expect(ADJUSTMENTS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });
});

describe("Stock Adjustment — navigation", () => {
  it("is registered with a form so create and edit routes work", () => {
    expect(REGISTRY["stock-adjustment"]).toBeDefined();
    expect(getSchemas("stock-adjustment")!.form).toBeDefined();
  });

  it("is reachable from the Inventory sidebar group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    const item = group.items.find((i) => i.label === "Stock Adjustment")!;
    expect(item.href).toBe("/m/stock-adjustment");
    expect(item.soon).toBeUndefined();
    expect(pageHref("Stock Adjustment")).toBe("/m/stock-adjustment");
  });

  it("leaves the phases after Inventory as coming soon", () => {
    /* Inventory is complete; Finance and the rest are the next phase. */
    for (const label of ["Finance", "Service", "Reports", "Settings"]) {
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
  });
});

describe("Stock Adjustment — responsive", () => {
  it("scrolls the wide table rather than the page", () => {
    const { container } = renderList();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("opens with a readable column subset and a locked identity column", () => {
    const visible = list.columns.filter((c) => !c.defaultHidden);
    expect(visible.length).toBeLessThan(list.columns.length);
    expect(list.columns.find((c) => c.key === "code")?.locked).toBe(true);
  });

  it("keeps the eligible quantity reachable per stock status", () => {
    const p = STOCK_POSITIONS[0];
    expect(eligibleQty(p.product, p.warehouse, "Available")).toBeGreaterThanOrEqual(0);
    expect(eligibleQty(p.product, p.warehouse, "QC Hold")).toBeGreaterThanOrEqual(0);
  });
});
