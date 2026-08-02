import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import {
  COUNTS,
  COUNT_METHODS,
  COUNT_TOLERANCE,
  COUNT_TYPES,
  nextCountCode,
  type CntLine,
  type Count,
} from "@/data/counts";
import { ADJUSTMENTS, type Adjustment } from "@/data/adjustments";
import { PRODUCTS } from "@/lib/domain/product";
import { STOCK_POSITIONS } from "@/lib/domain/stock";
import { invalidateMovements } from "@/lib/domain/movement";
import { decorateAdjustments } from "@/lib/domain/adjustment";
import {
  accuracy,
  adjustableLines,
  approvalIssues,
  blockingIssues,
  countRows,
  countSummary,
  countedQty,
  decorateCounts,
  isCounted,
  needsRecount,
  packageTotal,
  rawCount,
  submitIssues,
  systemQtyVisible,
  varianceLines,
  variancePct,
  varianceQty,
  varianceType,
  withinTolerance,
} from "@/lib/domain/count";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { cycleCountSchemas } from "@/schemas/cycle-count";
import { cycleCountForm } from "@/schemas/forms/cycle-count";

const { list, detail } = cycleCountSchemas;

const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );

const COUNT_SEED = JSON.parse(JSON.stringify(COUNTS)) as Count[];
const ADJ_SEED = JSON.parse(JSON.stringify(ADJUSTMENTS)) as Adjustment[];

const restore = () => {
  COUNTS.length = 0;
  COUNTS.push(...(JSON.parse(JSON.stringify(COUNT_SEED)) as Count[]));
  ADJUSTMENTS.length = 0;
  ADJUSTMENTS.push(...(JSON.parse(JSON.stringify(ADJ_SEED)) as Adjustment[]));
  decorateCounts();
  decorateAdjustments();
  invalidateMovements();
};

const row = (code: string) => countRows().find((c) => c.code === code)!;

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

const line = (over: Partial<CntLine> = {}): CntLine =>
  ({
    line: 1,
    code: "AA-TH003-WL",
    name: "A-FLEX PU40 (White)",
    barcode: "8851234000131",
    unit: "Tube",
    cat: "Sealant",
    brand: "A-FLEX",
    abc: "A",
    warehouse: "WH-BKK",
    zone: "A",
    rack: "01",
    shelf: "01",
    bin: "A01",
    stockStatus: "Available",
    lot: "",
    mfg: "",
    exp: "",
    serialRequired: false,
    systemQty: 100,
    unitCost: 82,
    firstCount: null,
    recount: null,
    finalCount: null,
    packages: 0,
    unitsPerPackage: 0,
    looseUnits: 0,
    serials: [],
    counter: "",
    countTime: "",
    rootCause: "",
    reviewStatus: "Pending",
    excluded: false,
    excludeReason: "",
    note: "",
    ...over,
  }) as CntLine;

beforeEach(() => {
  window.localStorage.clear();
  restore();
});

/* ============================================================
   CYCLE COUNT regression suite.
   ============================================================ */

describe("Cycle Count — mock data", () => {
  it("ships at least the twenty documents the module was specified with", () => {
    expect(COUNTS.length).toBeGreaterThanOrEqual(20);
  });

  it("never references a product or warehouse that does not exist", () => {
    const products = new Set(PRODUCTS.map((p) => p.code));
    const warehouses = new Set(STOCK_POSITIONS.map((r) => r.warehouse));
    for (const c of COUNTS) {
      expect(warehouses.has(c.warehouse), c.warehouse).toBe(true);
      for (const l of c.lines) expect(products.has(l.code), l.code).toBe(true);
    }
  });

  it("covers every count situation the spec lists", () => {
    const rows = countRows();
    expect(rows.some((r) => r.blind)).toBe(true);
    expect(rows.some((r) => !r.blind)).toBe(true);
    expect(rows.some((r) => r.type === "Full Physical Count")).toBe(true);
    expect(rows.some((r) => r.type === "Cycle Count")).toBe(true);
    expect(rows.some((r) => r.type === "Spot Count")).toBe(true);
    expect(rows.some((r) => r.type === "Serial Verification")).toBe(true);
    expect(rows.some((r) => r.type === "Lot Verification")).toBe(true);
    expect(rows.some((r) => r.acc.remainingLines > 0 && r.acc.countedLines > 0)).toBe(true);
    expect(rows.some((r) => r.acc.positiveVariance > 0)).toBe(true);
    expect(rows.some((r) => r.acc.negativeVariance < 0)).toBe(true);
    expect(rows.some((r) => r.acc.varianceLines === 0 && r.acc.countedLines > 0)).toBe(true);
    expect(rows.some((r) => r.openRecountLines > 0)).toBe(true);
    expect(rows.some((r) => r.round > 1)).toBe(true);
    expect(rows.some((r) => r.movementWarnings > 0)).toBe(true);
    expect(rows.some((r) => r.adjustmentRef)).toBe(true);
    expect(rows.some((r) => r.serialCount > 0)).toBe(true);
    expect(rows.some((r) => r.lotCount > 0)).toBe(true);
  });

  it("issues the next number in the CNT series", () => {
    expect(nextCountCode()).toMatch(/^CNT-2026-\d{6}$/);
    expect(COUNTS.some((c) => c.code === nextCountCode())).toBe(false);
  });
});

describe("Cycle Count — variance calculation", () => {
  it("computes variance as counted minus system", () => {
    expect(varianceQty(line({ systemQty: 100, finalCount: 96 }))).toBe(-4);
    expect(varianceQty(line({ systemQty: 100, finalCount: 105 }))).toBe(5);
    expect(varianceQty(line({ systemQty: 100, finalCount: 100 }))).toBe(0);
  });

  it("computes variance percentage against the system quantity", () => {
    expect(variancePct(line({ systemQty: 100, finalCount: 96 }))).toBe(-4);
    expect(variancePct(line({ systemQty: 200, finalCount: 210 }))).toBe(5);
  });

  it("classifies a zero system quantity as unexpected stock", () => {
    const l = line({ systemQty: 0, finalCount: 14 });
    expect(variancePct(l)).toBeNull();
    expect(varianceType(l)).toBe("Unexpected Stock");
  });

  it("classifies a zero count against stock as missing stock", () => {
    expect(varianceType(line({ systemQty: 60, finalCount: 0 }))).toBe("Missing Stock");
  });

  it("classifies positive, negative and matching lines", () => {
    expect(varianceType(line({ systemQty: 10, finalCount: 12 }))).toBe("Positive Variance");
    expect(varianceType(line({ systemQty: 10, finalCount: 8 }))).toBe("Negative Variance");
    expect(varianceType(line({ systemQty: 10, finalCount: 10 }))).toBe("No Variance");
  });

  it("classifies a serial problem as a serial mismatch", () => {
    const l = line({
      systemQty: 3,
      finalCount: 2,
      serials: [
        { serial: "SN-1", expected: true, scanned: true, result: "Found and Matched", note: "" },
        { serial: "SN-2", expected: true, scanned: false, result: "Missing", note: "" },
      ],
    });
    expect(varianceType(l)).toBe("Serial Mismatch");
  });

  it("adds up package quantities", () => {
    expect(packageTotal({ packages: 5, unitsPerPackage: 12, looseUnits: 3 })).toBe(63);
    expect(packageTotal({ packages: 0, unitsPerPackage: 0, looseUnits: 7 })).toBe(7);
  });
});

describe("Cycle Count — tolerance and recount", () => {
  it("accepts a variance inside the quantity tolerance", () => {
    expect(withinTolerance(line({ systemQty: 100, finalCount: 101 }))).toBe(true);
    expect(needsRecount(line({ systemQty: 100, finalCount: 101 }))).toBe(false);
  });

  it("accepts a variance inside the percentage tolerance", () => {
    /* 2 of 200 is 1%, inside the ±2% rule even though it exceeds ±1 unit. */
    expect(withinTolerance(line({ systemQty: 200, finalCount: 202 }))).toBe(true);
  });

  it("requires a recount outside the tolerance", () => {
    const l = line({ systemQty: 100, finalCount: 80 });
    expect(withinTolerance(l)).toBe(false);
    expect(needsRecount(l)).toBe(true);
  });

  it("always requires a recount for serial mismatch, unexpected and missing stock", () => {
    expect(
      needsRecount(
        line({
          systemQty: 3,
          finalCount: 3,
          serials: [{ serial: "SN-1", expected: true, scanned: false, result: "Missing", note: "" }],
        }),
      ),
    ).toBe(true);
    expect(needsRecount(line({ systemQty: 0, finalCount: 5 }))).toBe(true);
    expect(needsRecount(line({ systemQty: 20, finalCount: 0 }))).toBe(true);
  });

  it("requires a recount for a high-value variance", () => {
    const qty = Math.ceil(COUNT_TOLERANCE.highValue / 610) + 1;
    expect(needsRecount(line({ code: "AT-BR002", unitCost: 610, systemQty: 100, finalCount: 100 - qty }))).toBe(
      true,
    );
  });

  it("stops asking once the line has been recounted", () => {
    expect(needsRecount(line({ systemQty: 100, firstCount: 80, recount: 99, finalCount: 99 }))).toBe(
      false,
    );
  });
});

describe("Cycle Count — blind count", () => {
  it("hides the system quantity until the count is submitted", () => {
    const blind = { method: "Blind Count", status: "In Progress" } as Count;
    expect(systemQtyVisible(blind)).toBe(false);
    expect(systemQtyVisible({ ...blind, status: "Count Submitted" })).toBe(true);
    expect(systemQtyVisible({ ...blind, status: "Variance Review" })).toBe(true);
  });

  it("always shows the system quantity for a non-blind count", () => {
    expect(
      systemQtyVisible({ method: "Non-Blind Count", status: "In Progress" } as Count),
    ).toBe(true);
  });

  it("drops the system, variance and result columns from a blind count sheet", () => {
    const blind = countRows().find((r) => r.blind && !r.systemVisible)!;
    const blocks = detail.tabs.find((t) => t.key === "sheet")!.blocks(blind, {} as never);
    const table = blocks.find((b) => b && (b as { type: string }).type === "table") as {
      cols: { label: string }[];
    };
    const labels = table.cols.map((c) => c.label);
    expect(labels).not.toContain("System Qty");
    expect(labels).not.toContain("Variance Qty");
    expect(labels).not.toContain("Count Result");
    expect(labels).toContain("Final Count");
  });

  it("reveals those columns once the count is submitted", () => {
    const revealed = countRows().find((r) => r.blind && r.systemVisible)!;
    const blocks = detail.tabs.find((t) => t.key === "sheet")!.blocks(revealed, {} as never);
    const table = blocks.find((b) => b && (b as { type: string }).type === "table") as {
      cols: { label: string }[];
    };
    const labels = table.cols.map((c) => c.label);
    expect(labels).toContain("System Qty");
    expect(labels).toContain("Variance Qty");
  });

  it("hides the variance tab while the count is still blind", () => {
    const blind = countRows().find((r) => r.blind && !r.systemVisible)!;
    const shown = detail.tabs.filter((t) => !t.when || t.when(blind)).map((t) => t.key);
    expect(shown).not.toContain("variance");
  });
});

describe("Cycle Count — accuracy", () => {
  it("computes line accuracy from matching lines", () => {
    const c = {
      lines: [
        line({ line: 1, systemQty: 10, finalCount: 10 }),
        line({ line: 2, systemQty: 10, finalCount: 10 }),
        line({ line: 3, systemQty: 10, finalCount: 8 }),
        line({ line: 4, systemQty: 10, finalCount: null }),
      ],
    } as Count;
    const a = accuracy(c);
    expect(a.totalLines).toBe(4);
    expect(a.countedLines).toBe(3);
    expect(a.matchingLines).toBe(2);
    expect(a.lineAccuracy).toBe(66.7);
    expect(a.completion).toBe(75);
  });

  it("computes quantity accuracy from the absolute variance", () => {
    const c = {
      lines: [
        line({ line: 1, systemQty: 100, finalCount: 96 }),
        line({ line: 2, systemQty: 100, finalCount: 100 }),
      ],
    } as Count;
    /* 4 of 200 is 2% off, so 98% accurate. */
    expect(accuracy(c).qtyAccuracy).toBe(98);
  });

  it("handles a zero system quantity safely", () => {
    const matched = accuracy({ lines: [line({ systemQty: 0, finalCount: 0 })] } as Count);
    expect(matched.qtyAccuracy).toBe(100);
    const unexpected = accuracy({ lines: [line({ systemQty: 0, finalCount: 5 })] } as Count);
    expect(unexpected.qtyAccuracy).toBe(0);
    expect(Number.isFinite(unexpected.qtyAccuracy)).toBe(true);
  });

  it("splits positive and negative variance", () => {
    const c = {
      lines: [
        line({ line: 1, systemQty: 10, finalCount: 15 }),
        line({ line: 2, systemQty: 10, finalCount: 6 }),
      ],
    } as Count;
    const a = accuracy(c);
    expect(a.positiveVariance).toBe(5);
    expect(a.negativeVariance).toBe(-4);
    expect(a.netVariance).toBe(1);
  });
});

describe("Cycle Count — validation", () => {
  const draft = (over: Partial<Count> = {}): Count => ({
    ...(JSON.parse(JSON.stringify(COUNT_SEED[0])) as Count),
    status: "Draft",
    ...over,
  });

  it("passes a well-formed plan", () => {
    expect(blockingIssues(draft())).toHaveLength(0);
  });

  it("refuses a negative counted quantity", () => {
    const c = draft();
    c.lines[0].finalCount = -1;
    expect(blockingIssues(c).some((i) => i.message.includes("ติดลบ"))).toBe(true);
  });

  it("refuses a duplicate count line", () => {
    const c = draft();
    c.lines.push({ ...c.lines[0], line: 99 });
    expect(blockingIssues(c).some((i) => i.message.includes("ซ้ำ"))).toBe(true);
  });

  it("requires a serial per counted unit and refuses duplicates", () => {
    const c = draft();
    c.lines[0].serialRequired = true;
    c.lines[0].finalCount = 2;
    c.lines[0].serials = [
      { serial: "SN-1", expected: true, scanned: true, result: "Found and Matched", note: "" },
    ];
    expect(blockingIssues(c).some((i) => i.message.includes("Serial ที่สแกน"))).toBe(true);

    c.lines[0].serials = [
      { serial: "SN-1", expected: true, scanned: true, result: "Found and Matched", note: "" },
      { serial: "SN-1", expected: true, scanned: true, result: "Duplicate Scan", note: "" },
    ];
    expect(blockingIssues(c).some((i) => i.message.includes("มี Serial ซ้ำ"))).toBe(true);
  });

  it("requires the header fields the spec lists", () => {
    expect(blockingIssues(draft({ warehouse: "" })).some((i) => i.field === "warehouse")).toBe(true);
    expect(blockingIssues(draft({ supervisor: "" })).some((i) => i.field === "supervisor")).toBe(true);
    expect(blockingIssues(draft({ lines: [] })).some((i) => i.field === "lines")).toBe(true);
  });

  it("refuses submission while lines remain uncounted", () => {
    const c = draft({ status: "In Progress" });
    expect(submitIssues(c).some((i) => i.message.includes("ยังนับไม่ครบ"))).toBe(true);
  });

  it("refuses approval while a recount line is open", () => {
    const c = draft();
    c.lines[0].firstCount = 10;
    c.lines[0].finalCount = 10;
    c.lines[0].systemQty = 100;
    expect(approvalIssues(c).some((i) => i.message.includes("นับซ้ำ"))).toBe(true);
  });

  it("refuses approval without a root cause on a variance line", () => {
    const c = draft();
    c.lines = [line({ systemQty: 100, firstCount: 99, recount: 99, finalCount: 99 })];
    expect(approvalIssues(c).some((i) => i.message.includes("สาเหตุ"))).toBe(true);
  });

  it("refuses approval when the counter approved their own count", () => {
    const c = draft({ counter: "Warin S.", approvedBy: "Warin S." });
    c.lines = [line({ systemQty: 10, finalCount: 10 })];
    expect(approvalIssues(c).some((i) => i.message.includes("ตัวเอง"))).toBe(true);
  });
});

describe("Cycle Count — workflow", () => {
  it("assigns a counter and refuses a counter who is also the supervisor", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.canAssign)!;
    detail.actions!(rec, ctx).find((a) => a.label === "มอบหมายผู้ตรวจนับ")!.run!(rec);
    expect(calls.modal).not.toBeNull();
    /* Nothing picked yet. */
    expect(calls.modal!.onConfirm!()).toBe(false);
  });

  it("stores a snapshot when the count starts", () => {
    const { ctx } = stubCtx();
    const rec = countRows().find((r) => r.canStart)!;
    const before = rec.snapshotAt;
    detail.actions!(rec, ctx).find((a) => a.label === "เริ่มตรวจนับ")!.run!(rec);

    const after = row(rec.code);
    expect(after.status).toBe("In Progress");
    expect(after.snapshotAt).not.toBe(before);
    expect(after.history[0].t).toMatch(/Count started|Snapshot taken/);
  });

  it("records count entries without overwriting a first count", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.status === "In Progress")!;
    detail.actions!(rec, ctx).find((a) => a.label === "บันทึกผลนับ")!.run!(rec);
    expect(calls.modal).not.toBeNull();
    calls.modal!.onConfirm!();

    const after = row(rec.code);
    expect(after.acc.countedLines).toBeGreaterThan(0);
  });

  it("marks remaining lines as not found", () => {
    const { ctx } = stubCtx();
    const rec = countRows().find((r) => r.acc.remainingLines > 0 && r.canEnterCounts)!;
    detail.actions!(rec, ctx).find((a) => a.label === "ระบุว่าไม่พบสินค้า")!.run!(rec);
    expect(row(rec.code).acc.remainingLines).toBe(0);
  });

  it("submits a fully counted plan into variance review", () => {
    const { ctx } = stubCtx();
    const target = countRows().find((r) => r.status === "In Progress")!;
    const c = rawCount(target.code)!;
    for (const l of c.lines) {
      if (!isCounted(l)) {
        l.firstCount = l.systemQty;
        l.finalCount = l.systemQty;
      }
    }
    decorateCounts();

    const rec = row(target.code);
    expect(rec.canSubmit).toBe(true);
    detail.actions!(rec, ctx).find((a) => a.label === "ส่งผลนับ")!.run!(rec);
    expect(["Variance Review", "Completed", "Count Submitted"]).toContain(row(rec.code).status);
  });

  it("requires a reason to request a recount", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.canRecount && r.acc.varianceLines > 0)!;
    detail.actions!(rec, ctx).find((a) => a.label === "ขอให้นับซ้ำ")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("keeps the first count when a recount is entered", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.status === "Recount Required")!;
    const firsts = rec.lines.map((l) => l.firstCount);

    detail.actions!(rec, ctx).find((a) => a.label === "บันทึกผลนับ")!.run!(rec);
    calls.modal!.onConfirm!();

    const after = row(rec.code);
    after.lines.forEach((l, i) => expect(l.firstCount).toBe(firsts[i]));
    expect(after.lines.some((l) => l.recount !== null)).toBe(true);
    expect(after.round).toBe(2);
  });

  it("blocks approval while a recount line is open", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.openRecountLines > 0 && r.canReject)!;
    expect(rec.canApprove).toBe(false);
    detail.actions!(rec, ctx).find((a) => a.label === "อนุมัติ")!.run!(rec);
    expect(row(rec.code).approvalStatus).not.toBe("Approved");
    expect(calls.confirmed).toBe(false);
  });

  it("requires a reason to reject", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.canReject)!;
    detail.actions!(rec, ctx).find((a) => a.label === "ไม่อนุมัติ")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(row(rec.code).status).toBe(rec.status);
  });

  it("logs the decision taken about a movement during the count", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.movementWarnings > 0)!;
    detail.actions!(rec, ctx).find((a) => a.label === "การเคลื่อนไหวระหว่างนับ")!.run!(rec);
    expect(calls.modal).not.toBeNull();
    /* No decision picked yet. */
    expect(calls.modal!.onConfirm!()).toBe(false);
  });

  it("requires a reason to cancel and keeps the document", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.status === "Draft")!;
    const before = COUNTS.length;
    detail.actions!(rec, ctx).find((a) => a.label === "ยกเลิกแผน")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(COUNTS.length).toBe(before);
    expect(row(rec.code).status).toBe("Draft");
  });

  it("refuses to reopen a count that already produced an adjustment", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.adjustmentRef)!;
    const c = rawCount(rec.code)!;
    c.status = "Variance Review";
    decorateCounts();

    detail.actions!(row(rec.code), ctx).find((a) => a.label === "เปิดการนับใหม่")!.run!(row(rec.code));
    expect(calls.modal).toBeNull();
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });
});

describe("Cycle Count — Stock Adjustment handoff", () => {
  /** Bring a count to the point where the handoff is allowed. */
  const readyToHandoff = () => {
    const rec = countRows().find((r) => r.acc.varianceLines > 0 && !r.adjustmentRef)!;
    const c = rawCount(rec.code)!;
    for (const l of c.lines) {
      if (!isCounted(l)) {
        l.firstCount = l.systemQty;
        l.finalCount = l.systemQty;
      }
      if (varianceQty(l) !== 0) {
        l.recount = countedQty(l);
        l.finalCount = countedQty(l);
        l.rootCause = l.rootCause || "Counting Error";
      }
    }
    c.status = "Approved";
    c.approvalStatus = "Approved";
    c.approvedBy = "Patcharin T.";
    decorateCounts();
    return row(c.code);
  };

  it("creates a Stock Adjustment draft from approved variance lines", () => {
    const { ctx, calls } = stubCtx();
    const rec = readyToHandoff();
    const before = ADJUSTMENTS.length;

    detail.actions!(rec, ctx).find((a) => a.label === "สร้างใบปรับปรุงสต๊อก")!.run!(rec);
    expect(calls.confirmed).toBe(true);
    expect(ADJUSTMENTS.length).toBe(before + 1);

    const adj = ADJUSTMENTS[0];
    expect(adj.refType).toBe("Cycle Count");
    expect(adj.refDoc).toBe(rec.code);
    expect(adj.status).toBe("Draft");
    expect(adj.reason).toMatch(/Cycle Count (Gain|Loss)/);
    expect(row(rec.code).adjustmentRef).toBe(adj.code);
    expect(row(rec.code).status).toBe("Adjustment Created");
  });

  it("maps a positive variance to an increase and a negative one to a decrease", () => {
    const { ctx } = stubCtx();
    const rec = readyToHandoff();
    detail.actions!(rec, ctx).find((a) => a.label === "สร้างใบปรับปรุงสต๊อก")!.run!(rec);

    const adj = ADJUSTMENTS[0];
    const expected = adjustableLines(rec);
    expect(adj.items.length).toBe(expected.length);
    expected.forEach((v, i) => {
      expect(adj.items[i].action).toBe(
        v.variance > 0 ? "Increase Quantity" : "Decrease Quantity",
      );
      expect(adj.items[i].qty).toBe(Math.abs(v.variance));
      expect(adj.items[i].code).toBe(v.line.code);
    });
  });

  it("carries the count evidence and the counted figures onto the adjustment", () => {
    const { ctx } = stubCtx();
    const rec = readyToHandoff();
    detail.actions!(rec, ctx).find((a) => a.label === "สร้างใบปรับปรุงสต๊อก")!.run!(rec);

    const adj = ADJUSTMENTS[0];
    expect(adj.evidence.length).toBe(rec.evidence.length);
    expect(adj.items[0].note).toMatch(/นับได้ .* ระบบ .* ส่วนต่าง/);
  });

  it("never creates a second adjustment for the same count", () => {
    const { ctx, calls } = stubCtx();
    const rec = readyToHandoff();
    detail.actions!(rec, ctx).find((a) => a.label === "สร้างใบปรับปรุงสต๊อก")!.run!(rec);
    const after = ADJUSTMENTS.length;

    const again = row(rec.code);
    detail.actions!(again, ctx).find((a) => a.label === "สร้างใบปรับปรุงสต๊อก")!.run!(again);
    expect(ADJUSTMENTS.length).toBe(after);
    expect(calls.toasts.at(-1)!.title).toMatch(/สร้างใบปรับปรุงไปแล้ว/);
  });

  it("refuses the handoff before approval", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.status === "Variance Review")!;
    const before = ADJUSTMENTS.length;

    /* The action is disabled, and calling it anyway is still refused. */
    const action = detail.actions!(rec, ctx).find((a) => a.label === "สร้างใบปรับปรุงสต๊อก")!;
    expect(action.disabled).toBe(true);
    action.run!(rec);
    expect(ADJUSTMENTS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });

  it("never changes stock from the count itself", () => {
    const { ctx } = stubCtx();
    const rec = readyToHandoff();
    const before = STOCK_POSITIONS.map((p) => `${p.code}:${p.onHand}`).join("|");

    detail.actions!(rec, ctx).find((a) => a.label === "สร้างใบปรับปรุงสต๊อก")!.run!(rec);
    /* The adjustment is a draft — nothing is posted, so no balance moves. */
    expect(STOCK_POSITIONS.map((p) => `${p.code}:${p.onHand}`).join("|")).toBe(before);
    expect(ADJUSTMENTS[0].status).toBe("Draft");
  });

  it("links the seeded counts and adjustments in both directions", () => {
    const linked = countRows().filter((r) => r.adjustmentRef);
    expect(linked.length).toBeGreaterThan(0);
    for (const c of linked) {
      expect(ADJUSTMENTS.some((a) => a.code === c.adjustmentRef), c.adjustmentRef).toBe(true);
    }
    for (const a of ADJUSTMENTS.filter((x) => x.refType === "Cycle Count" && x.refDoc)) {
      expect(COUNTS.some((c) => c.code === a.refDoc), a.refDoc).toBe(true);
    }
  });
});

describe("Cycle Count — list", () => {
  it("renders the title and subtitle", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Cycle Count" })).toBeInTheDocument();
    expect(screen.getByText(/Plan, execute, review, and approve/)).toBeInTheDocument();
  });

  it("renders all ten KPI cards", () => {
    renderList();
    for (const label of [
      "Total Count Plans",
      "Planned",
      "In Progress",
      "Submitted",
      "Variance Review",
      "Recount Required",
      "Adjustment Pending",
      "Completed Today",
      "Count Accuracy",
      "Total Variance Value",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("declares the columns and quick filters the spec lists", () => {
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Count Number",
      "Count Date",
      "Count Type",
      "Count Method",
      "Warehouse",
      "Count Scope",
      "Locations",
      "Products",
      "Counted Lines",
      "Variance Lines",
      "Recount Lines",
      "Count Accuracy",
      "Assigned Counter",
      "Supervisor",
      "Adjustment Status",
      "Count Status",
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
      "method",
      "date",
      "warehouse",
      "zone",
      "rack",
      "bin",
      "product",
      "cat",
      "brand",
      "abc",
      "counter",
      "supervisor",
      "variance",
      "recountOnly",
      "highValue",
      "serialMismatch",
      "lotMismatch",
      "adjPending",
      "mine",
      "myWarehouse",
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("searches by count number", async () => {
    const user = userEvent.setup();
    renderList();
    const code = countRows()[0].code;
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), code);
    expect(screen.getByText(/^1 count plans$/)).toBeInTheDocument();
  });

  it("filters by count method", async () => {
    const user = userEvent.setup();
    renderList();
    const expected = countRows().filter((r) => r.method === "Blind Count").length;
    await user.selectOptions(screen.getByLabelText("Count Method"), "Blind Count");
    expect(screen.getByText(new RegExp(`^${expected} count plans$`))).toBeInTheDocument();
  });

  it("counts the summary the KPI cards read", () => {
    const s = countSummary();
    expect(s.total).toBe(countRows().length);
    expect(s.inProgress).toBe(countRows().filter((r) => r.status === "In Progress").length);
  });
});

describe("Cycle Count — drawer and detail", () => {
  it("declares the tabs the spec asks for", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "scope",
      "sheet",
      "variance",
      "recount",
      "approval",
      "adjustment",
      "exceptions",
      "serial",
      "accuracy",
      "docs",
      "timeline",
      "audit",
    ]);
  });

  it("heads the count with type, status and accuracy", () => {
    const rec = countRows()[0];
    const id = detail.identity(rec);
    expect(id.code).toBe(rec.code);
    expect(id.badges.map((b) => b.text)).toContain(rec.status);
    expect(detail.kpis(rec).map((k) => k.label)).toContain("Accuracy");
  });

  it("opens when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    const rec = countRows()[0];
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), rec.code);
    await user.click(screen.getAllByText(rec.code)[0]);

    const drawer = await screen.findByRole("dialog", { name: new RegExp(rec.type) });
    expect(within(drawer).getByRole("tab", { name: "Count Sheet" })).toBeInTheDocument();
  });

  it("opens the full detail page", () => {
    const rec = countRows().find((r) => r.acc.varianceLines > 0 && r.systemVisible)!;
    render(<FullDetail schema={detail} record={rec} />);
    expect(screen.getAllByText(rec.code).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Variance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stock Adjustment" })).toBeInTheDocument();
  });
});

describe("Cycle Count — create form", () => {
  it("opens on a blank plan with a fresh number", () => {
    const s = cycleCountForm.blank();
    expect(String(s.code)).toMatch(/^CNT-2026-\d{6}$/);
    expect(s.method).toBe("Blind Count");
    expect(s.lines).toEqual([]);
  });

  it("declares the sections the spec lists", () => {
    const keys = cycleCountForm.steps.map((s) => s.key);
    for (const k of [
      "info",
      "scope",
      "lines",
      "method",
      "assignment",
      "control",
      "notes",
      "review",
    ]) {
      expect(keys, k).toContain(k);
    }
  });

  it("pairs a verification type with its method", () => {
    const state: Record<string, unknown> = { type: "Serial Verification", method: "Blind Count" };
    cycleCountForm.onChange!("type", state);
    expect(state.method).toBe("Serial Verification");
  });

  it("enforces the plan rules inline", () => {
    const rules = cycleCountForm.rules!;
    expect(
      rules.find((r) => r.label.includes("ผู้ตรวจสอบต้องเป็นคนละคน"))!.test({
        counter: "Warin S.",
        supervisor: "Warin S.",
      }),
    ).toBe(false);
    expect(
      rules.find((r) => r.label.includes("ยอดระบบต้องไม่ติดลบ"))!.test({
        lines: [{ code: "X", systemQty: -1 }],
      }),
    ).toBe(false);
    expect(
      rules.find((r) => r.label.includes("ห้ามมีรายการซ้ำ"))!.test({
        lines: [
          { code: "X", zone: "A", rack: "01", bin: "A01", lot: "", stockStatus: "Available" },
          { code: "X", zone: "A", rack: "01", bin: "A01", lot: "", stockStatus: "Available" },
        ],
      }),
    ).toBe(false);
  });

  it("flags a duplicate count line", () => {
    const hits = cycleCountForm.findDuplicates!({
      lines: [
        { code: "AA-TH003-WL", zone: "A", rack: "01", bin: "A01", lot: "", stockStatus: "Available", name: "A" },
        { code: "AA-TH003-WL", zone: "A", rack: "01", bin: "A01", lot: "", stockStatus: "Available", name: "A" },
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].why).toMatch(/ซ้ำ/);
  });

  it("saves a valid plan into the document list", () => {
    const { ctx, calls } = stubCtx();
    const before = COUNTS.length;

    cycleCountForm.save(
      {
        code: nextCountCode(),
        countDate: "01/08/2026",
        type: "Cycle Count",
        method: "Blind Count",
        scope: "Selected Products",
        priority: "Normal",
        requestedBy: "Admin",
        description: "ทดสอบการบันทึกแผน",
        scheduledStart: "01/08/2026 08:00",
        warehouse: "WH-BKK Bangkok Main Warehouse",
        zone: "A",
        bin: "A01",
        statusScope: "Available",
        supervisor: "Patcharin T.",
        counter: "Warin S.",
        lines: [
          {
            code: PRODUCTS[0].code,
            name: PRODUCTS[0].name,
            unit: PRODUCTS[0].unit,
            zone: "A",
            rack: "01",
            bin: "A01",
            stockStatus: "Available",
            systemQty: 10,
            unitCost: 82,
          },
        ],
      },
      ctx,
    );

    expect(COUNTS.length).toBe(before + 1);
    expect(calls.toasts.at(-1)!.title).toMatch(/สร้างแผนตรวจนับแล้ว/);
  });

  it("refuses to save a plan without lines", () => {
    const { ctx, calls } = stubCtx();
    const before = COUNTS.length;

    cycleCountForm.save(
      {
        code: nextCountCode(),
        countDate: "01/08/2026",
        type: "Cycle Count",
        method: "Blind Count",
        scope: "Selected Products",
        requestedBy: "Admin",
        description: "ไม่มีรายการ",
        scheduledStart: "01/08/2026 08:00",
        warehouse: "WH-BKK Bangkok Main Warehouse",
        supervisor: "Patcharin T.",
        lines: [],
      },
      ctx,
    );

    expect(COUNTS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });
});

describe("Cycle Count — edit rules", () => {
  it("allows editing only before counting starts", () => {
    for (const r of countRows()) {
      const guard = cycleCountForm.editGuard!(r);
      if (["Draft", "Planned", "Revision Requested", "Assigned"].includes(r.status)) {
        expect(guard, r.code).toBeNull();
      } else {
        expect(guard, r.code).not.toBeNull();
      }
    }
  });

  it("locks a submitted count", () => {
    const rec = countRows().find((r) => r.status === "Variance Review")!;
    expect(rec.isReadOnly).toBe(true);
    expect(cycleCountForm.editGuard!(rec)).toMatch(/แก้ไขไม่ได้/);
  });

  it("offers no delete action anywhere", () => {
    const rec = countRows()[0];
    const labels = [
      ...list.rowActions(rec, {} as never).map((a) => a.label ?? ""),
      ...(detail.actions?.(rec, {} as never) ?? []).map((a) => a.label ?? ""),
    ];
    for (const l of labels) expect(l.toLowerCase()).not.toMatch(/delete|ลบ/);
  });
});

describe("Cycle Count — navigation", () => {
  it("is registered with a form so create and edit routes work", () => {
    expect(REGISTRY["cycle-count"]).toBeDefined();
    expect(getSchemas("cycle-count")!.form).toBeDefined();
  });

  it("is reachable from the Inventory sidebar group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    const item = group.items.find((i) => i.label === "Cycle Count")!;
    expect(item.href).toBe("/m/cycle-count");
    expect(item.soon).toBeUndefined();
    expect(pageHref("Cycle Count")).toBe("/m/cycle-count");
  });

  it("leaves the modules this round must not build as coming soon", () => {
    for (const label of ["Serial Tracking", "Barcode Lookup"]) {
      expect(pageHref(label)).toBe(`/soon?m=${encodeURIComponent(label)}`);
    }
  });

  it("keeps the other Inventory modules untouched", () => {
    expect(pageHref("Inventory Workspace")).toBe("/inventory");
    expect(pageHref("Stock Inquiry")).toBe("/m/stock-inquiry");
    expect(pageHref("Stock Card")).toBe("/m/stock-card");
    expect(pageHref("Stock Transfer")).toBe("/m/stock-transfer");
    expect(pageHref("Stock Adjustment")).toBe("/m/stock-adjustment");
  });
});

describe("Cycle Count — print and responsive", () => {
  it("says a blind count sheet hides the system quantity", () => {
    const { ctx, calls } = stubCtx();
    const rec = countRows().find((r) => r.blind && !r.systemVisible)!;
    detail.actions!(rec, ctx).find((a) => a.label === "พิมพ์ใบนับ")!.run!(rec);
    expect(calls.toasts.at(-1)!.title).toMatch(/ปิดตา/);
  });

  it("scrolls the wide table rather than the page", () => {
    const { container } = renderList();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("opens with a readable column subset and a locked identity column", () => {
    const visible = list.columns.filter((c) => !c.defaultHidden);
    expect(visible.length).toBeLessThan(list.columns.length);
    expect(list.columns.find((c) => c.key === "code")?.locked).toBe(true);
  });

  it("supports every declared count type and method", () => {
    expect(COUNT_TYPES.length).toBeGreaterThanOrEqual(7);
    expect(COUNT_METHODS.length).toBeGreaterThanOrEqual(8);
  });

  it("reports variance lines that feed the handoff", () => {
    const rec = countRows().find((r) => r.acc.varianceLines > 0)!;
    const v = varianceLines(rec);
    expect(v.length).toBe(rec.acc.varianceLines);
    for (const x of v) expect(x.variance).not.toBe(0);
  });
});
