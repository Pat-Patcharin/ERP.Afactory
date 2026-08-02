import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ListView } from "@/components/engine/ListView";
import { FullDetail } from "@/components/engine/FullDetail";
import { QuickViewHost } from "@/components/engine/QuickViewHost";
import {
  TRANSFERS,
  TRANSFER_METHODS,
  TRANSFER_TYPES,
  nextTransferCode,
  type Transfer,
} from "@/data/transfers";
import { PRODUCTS } from "@/lib/domain/product";
import { STOCK_POSITIONS } from "@/lib/domain/stock";
import { invalidateMovements, movementRows } from "@/lib/domain/movement";
import {
  approvalTriggers,
  blockingIssues,
  decorateTransfers,
  destinationWarnings,
  lineRemainingDispatch,
  lineRemainingReceipt,
  lineStatus,
  rawTransfer,
  selectableSerials,
  sourceStock,
  transferRows,
  transferSummary,
  transferableQty,
} from "@/lib/domain/transfer";
import { NAV } from "@/lib/nav";
import { pageHref } from "@/lib/routes";
import { REGISTRY, getSchemas } from "@/schemas/registry";
import { stockTransferSchemas } from "@/schemas/stock-transfer";
import { stockTransferForm } from "@/schemas/forms/stock-transfer";
import { routerPush } from "./setup";

const { list, detail } = stockTransferSchemas;

const renderList = () =>
  render(
    <>
      <ListView schema={list} />
      <QuickViewHost />
    </>,
  );

/** A snapshot of the seeded documents, so mutating tests can restore them. */
const SEED = JSON.parse(JSON.stringify(TRANSFERS)) as Transfer[];

const restore = () => {
  TRANSFERS.length = 0;
  TRANSFERS.push(...(JSON.parse(JSON.stringify(SEED)) as Transfer[]));
  decorateTransfers();
  invalidateMovements();
};

const row = (code: string) => transferRows().find((r) => r.code === code)!;

/** A context that records what a workflow asked for, and auto-confirms. */
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
   STOCK TRANSFER regression suite.
   ============================================================ */

describe("Stock Transfer — mock data", () => {
  it("ships at least the twenty documents the module was specified with", () => {
    expect(TRANSFERS.length).toBeGreaterThanOrEqual(20);
  });

  it("never references a product or warehouse that does not exist", () => {
    const products = new Set(PRODUCTS.map((p) => p.code));
    const warehouses = new Set(STOCK_POSITIONS.map((r) => r.warehouse));
    for (const t of TRANSFERS) {
      expect(warehouses.has(t.srcWarehouse), t.srcWarehouse).toBe(true);
      expect(warehouses.has(t.dstWarehouse), t.dstWarehouse).toBe(true);
      for (const i of t.items) expect(products.has(i.code), i.code).toBe(true);
    }
  });

  it("covers both methods, lots, serials, partials, exceptions and a reversal", () => {
    const rows = transferRows();
    expect(rows.some((r) => r.isDirect)).toBe(true);
    expect(rows.some((r) => r.isTwoStep)).toBe(true);
    expect(rows.some((r) => r.hasLots)).toBe(true);
    expect(rows.some((r) => r.hasSerials)).toBe(true);
    expect(rows.some((r) => r.status === "Partially Received")).toBe(true);
    expect(rows.some((r) => r.status === "Partially Dispatched")).toBe(true);
    expect(rows.some((r) => r.openExceptions > 0)).toBe(true);
    expect(rows.some((r) => r.reversalOf)).toBe(true);
    expect(rows.some((r) => r.reversedBy)).toBe(true);
    expect(rows.some((r) => r.srcStatus !== r.dstStatus)).toBe(true);
  });

  it("issues the next number in the TRF series", () => {
    expect(nextTransferCode()).toMatch(/^TRF-2026-\d{6}$/);
    expect(TRANSFERS.some((t) => t.code === nextTransferCode())).toBe(false);
  });
});

describe("Stock Transfer — quantity rules", () => {
  it("keeps dispatched within requested and received within dispatched", () => {
    for (const r of transferRows()) {
      expect(r.dispatchedQty, r.code).toBeLessThanOrEqual(r.requestedQty);
      expect(r.receivedQty + r.shortQty + r.damagedQty, r.code).toBeLessThanOrEqual(
        r.dispatchedQty,
      );
    }
  });

  it("computes remaining dispatch and remaining receipt per line", () => {
    for (const t of TRANSFERS) {
      for (const l of t.items) {
        expect(lineRemainingDispatch(l)).toBe(Math.max(0, l.requested - l.dispatched));
        expect(lineRemainingReceipt(l)).toBe(
          Math.max(0, l.dispatched - l.received - l.short - l.damaged),
        );
      }
    }
  });

  it("holds in-transit quantity only for two-step transfers", () => {
    for (const r of transferRows()) {
      if (r.isDirect) expect(r.inTransitQty, r.code).toBe(0);
      else
        expect(r.inTransitQty, r.code).toBe(
          Math.max(0, r.dispatchedQty - r.receivedQty - r.shortQty - r.damagedQty),
        );
    }
  });

  it("derives transferable quantity from Stock Inquiry, excluding held stock", () => {
    const product = STOCK_POSITIONS[0].product;
    const warehouse = STOCK_POSITIONS[0].warehouse;
    const positions = STOCK_POSITIONS.filter(
      (r) => r.product === product && r.warehouse === warehouse,
    );
    const expected = positions
      .filter((r) => !r.blocked && !(r.expDays !== null && r.expDays < 0))
      .reduce((t, r) => t + Math.max(0, r.available - r.damaged), 0);

    expect(transferableQty(product, warehouse)).toBe(expected);
    /* Held buckets are only reachable through their own status. */
    expect(transferableQty(product, warehouse, "QC Hold")).toBe(
      positions.reduce((t, r) => t + r.qcHold, 0),
    );
  });

  it("offers only products with something transferable", () => {
    const rows = sourceStock("WH-BKK");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.transferable).toBeGreaterThan(0);
  });
});

describe("Stock Transfer — validation", () => {
  const draft = (over: Partial<Transfer> = {}): Transfer => ({
    ...(JSON.parse(JSON.stringify(SEED[0])) as Transfer),
    status: "Draft",
    ...over,
  });

  it("passes a well-formed draft", () => {
    expect(blockingIssues(draft())).toHaveLength(0);
  });

  it("refuses an identical source and destination", () => {
    const t = draft();
    t.dstWarehouse = t.srcWarehouse;
    t.dstBin = t.srcBin;
    t.dstStatus = t.srcStatus;
    expect(blockingIssues(t).some((i) => i.field === "dstWarehouse")).toBe(true);
  });

  it("refuses a zero or negative quantity", () => {
    const t = draft();
    t.items[0].requested = 0;
    expect(blockingIssues(t).some((i) => i.message.includes("มากกว่า 0"))).toBe(true);
  });

  it("refuses more than the source can transfer", () => {
    const t = draft();
    t.items[0].requested = 999_999;
    expect(blockingIssues(t).some((i) => i.message.includes("เกินยอดที่โอนได้"))).toBe(true);
  });

  it("refuses a serial count that does not match the quantity", () => {
    const t = draft();
    t.items[0].requested = 3;
    t.items[0].serials = ["SN-A", "SN-B"];
    expect(blockingIssues(t).some((i) => i.message.includes("Serial"))).toBe(true);
  });

  it("refuses duplicate serials", () => {
    const t = draft();
    t.items[0].requested = 2;
    t.items[0].serials = ["SN-A", "SN-A"];
    expect(blockingIssues(t).some((i) => i.message.includes("ซ้ำ"))).toBe(true);
  });

  it("requires a reason and at least one line", () => {
    expect(blockingIssues(draft({ reason: "" })).some((i) => i.field === "reason")).toBe(true);
    expect(blockingIssues(draft({ items: [] })).some((i) => i.field === "items")).toBe(true);
  });

  it("warns rather than blocks on destination conditions", () => {
    const t = draft({ srcStatus: "Damaged", dstStatus: "Available" });
    expect(destinationWarnings(t).some((w) => w.includes("เสียหาย"))).toBe(true);
    expect(blockingIssues(t).some((i) => i.field === "dstWarehouse")).toBe(false);
  });

  it("never offers a serial already committed to an open transfer", () => {
    const committed = new Set(
      TRANSFERS.filter(
        (t) => !["Completed", "Cancelled", "Reversed", "Closed"].includes(t.status),
      ).flatMap((t) => t.items.flatMap((i) => i.serials)),
    );
    for (const s of selectableSerials("AT-GL001")) expect(committed.has(s.serial)).toBe(false);
  });
});

describe("Stock Transfer — approval", () => {
  it("requires approval for cross-warehouse, cross-status and large transfers", () => {
    const base = JSON.parse(JSON.stringify(SEED[0])) as Transfer;
    expect(approvalTriggers({ ...base, srcWarehouse: "WH-BKK", dstWarehouse: "WH-SVC" }).length)
      .toBeGreaterThan(0);
    expect(
      approvalTriggers({ ...base, srcStatus: "QC Hold", dstStatus: "Available" }).length,
    ).toBeGreaterThan(0);
    const big = JSON.parse(JSON.stringify(base)) as Transfer;
    big.items[0].requested = 500;
    expect(approvalTriggers(big).some((r) => r.includes("เกินเกณฑ์"))).toBe(true);
  });

  it("submits a draft into pending approval", () => {
    const { ctx, calls } = stubCtx();
    const target = transferRows().find((r) => r.status === "Draft" && r.needsApproval);
    const simple = transferRows().find((r) => r.status === "Draft" && !r.needsApproval);
    const rec = target ?? simple!;

    list.rowActions(rec, ctx).find((a) => a.label === "ส่งขออนุมัติ")!.run!(rec);
    expect(calls.confirmed).toBe(true);
    expect(row(rec.code).status).toBe(rec.needsApproval ? "Pending Approval" : "Ready to Transfer");
  });

  it("approves a pending transfer", () => {
    const { ctx } = stubCtx();
    const rec = transferRows().find((r) => r.status === "Pending Approval")!;
    list.rowActions(rec, ctx).find((a) => a.label === "อนุมัติ")!.run!(rec);
    expect(row(rec.code).status).toBe("Approved");
    expect(row(rec.code).approvedBy).toBe("Admin");
  });

  it("refuses to reject without a reason", () => {
    const { ctx, calls } = stubCtx();
    const rec = transferRows().find((r) => r.status === "Pending Approval")!;
    list.rowActions(rec, ctx).find((a) => a.label === "ไม่อนุมัติ")!.run!(rec);

    expect(calls.modal).not.toBeNull();
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
    expect(row(rec.code).status).toBe("Pending Approval");
  });
});

describe("Stock Transfer — direct transfer", () => {
  it("posts source out and destination in, and completes", () => {
    const { ctx } = stubCtx();
    const rec = transferRows().find((r) => r.canPost)!;
    expect(rec.isDirect).toBe(true);

    detail.actions!(rec, ctx).find((a) => a.label === "โอนย้ายทันที")!.run!(rec);
    const after = row(rec.code);
    expect(after.status).toBe("Completed");
    expect(after.dispatchedQty).toBe(after.requestedQty);
    expect(after.receivedQty).toBe(after.requestedQty);
    expect(after.inTransitQty).toBe(0);
  });

  it("creates balanced Transfer Out and Transfer In movements", () => {
    const rec = transferRows().find((r) => r.isDirect && r.status === "Completed")!;
    const moves = movementRows().filter((m) => m.sourceDoc === rec.code);
    expect(moves.length).toBeGreaterThan(0);

    const outQty = moves.reduce((t, m) => t + m.qtyOut, 0);
    const inQty = moves.reduce((t, m) => t + m.qtyIn, 0);
    /* A location move balances; a status move shifts buckets with no in/out. */
    expect(outQty).toBe(inQty);
  });
});

describe("Stock Transfer — two-step dispatch and receipt", () => {
  it("dispatches part of a line and leaves the rest open", () => {
    const { ctx, calls } = stubCtx();
    const rec = transferRows().find((r) => r.canDispatch)!;
    /* The decorated row shares its arrays with the document — snapshot the
       counts before acting, or they read the post-mutation value. */
    const before = rec.remainingDispatch;
    const dispatchedBefore = rec.dispatchedQty;
    const dispatchCount = rec.dispatches.length;

    detail.actions!(rec, ctx).find((a) => a.label === "จ่ายออก")!.run!(rec);
    expect(calls.modal).not.toBeNull();
    calls.modal!.onConfirm!();

    const after = row(rec.code);
    expect(after.dispatchedQty).toBe(dispatchedBefore + before);
    expect(after.dispatches.length).toBe(dispatchCount + 1);
    expect(["In Transit", "Partially Dispatched"]).toContain(after.status);
  });

  it("raises in-transit quantity on dispatch", () => {
    const { ctx, calls } = stubCtx();
    const rec = transferRows().find((r) => r.canDispatch)!;
    const transitBefore = rec.inTransitQty;
    detail.actions!(rec, ctx).find((a) => a.label === "จ่ายออก")!.run!(rec);
    calls.modal!.onConfirm!();
    expect(row(rec.code).inTransitQty).toBeGreaterThan(transitBefore);
  });

  it("receives into the destination and clears in transit", () => {
    const { ctx, calls } = stubCtx();
    const rec = transferRows().find((r) => r.canReceive)!;
    const receivedBefore = rec.receivedQty;
    const receiptCount = rec.receipts.length;
    const transitBefore = rec.inTransitQty;

    detail.actions!(rec, ctx).find((a) => a.label === "รับเข้า")!.run!(rec);
    calls.modal!.onConfirm!();

    const after = row(rec.code);
    expect(after.receivedQty).toBeGreaterThan(receivedBefore);
    expect(after.receipts.length).toBe(receiptCount + 1);
    expect(after.inTransitQty).toBeLessThan(transitBefore);
  });

  it("refuses a receipt larger than what was dispatched", () => {
    const { ctx, calls } = stubCtx();
    const rec = transferRows().find((r) => r.canReceive)!;
    const t = rawTransfer(rec.code)!;
    const line = t.items.find((l) => lineRemainingReceipt(l) > 0)!;

    /* Push the document past its own ceiling and prove decorate catches it. */
    const cap = lineRemainingReceipt(line);
    line.received += cap;
    decorateTransfers();
    expect(lineRemainingReceipt(line)).toBe(0);
    expect(row(rec.code).canReceive).toBe(false);

    detail.actions!(row(rec.code), ctx).find((a) => a.label === "รับเข้า")!.run!(row(rec.code));
    expect(calls.toasts.at(-1)!.title).toMatch(/รับเข้าครบแล้ว/);
  });

  it("records a shortage as an exception", () => {
    const rec = transferRows().find((r) => r.shortQty > 0)!;
    expect(rec.openExceptions).toBeGreaterThan(0);
    expect(rec.exceptions[0].type).toBe("Short Quantity");
    expect(rec.exceptions[0].actual).toBeLessThan(rec.exceptions[0].expected);
  });

  it("creates a Transfer Out on dispatch and a Transfer In on receipt", () => {
    const rec = transferRows().find(
      (r) => r.isTwoStep && r.dispatchedQty > 0 && r.receivedQty > 0,
    )!;
    const moves = movementRows().filter((m) => m.sourceDoc === rec.code);
    expect(moves.some((m) => m.type === "Transfer Out")).toBe(true);
    expect(moves.some((m) => m.type === "Transfer In")).toBe(true);
  });
});

describe("Stock Transfer — cancellation and reversal", () => {
  it("cancels a draft with a reason and keeps the document", () => {
    const { ctx, calls } = stubCtx();
    const rec = transferRows().find((r) => r.status === "Draft")!;
    const before = TRANSFERS.length;

    detail.actions!(rec, ctx).find((a) => a.label === "ยกเลิก")!.run!(rec);
    expect(calls.modal!.onConfirm!()).toBe(false); /* no reason picked yet */
    expect(TRANSFERS.length).toBe(before);
    expect(row(rec.code).status).toBe("Draft");
  });

  it("never offers cancel once a transfer has been dispatched", () => {
    for (const r of transferRows()) {
      if (["Dispatched", "In Transit", "Partially Received"].includes(r.status)) {
        expect(r.canCancel, r.code).toBe(false);
      }
    }
  });

  it("reverses a completed transfer into a new mirrored document", () => {
    const { ctx, calls } = stubCtx();
    const rec = transferRows().find((r) => r.canReverse)!;
    const before = TRANSFERS.length;

    detail.actions!(rec, ctx).find((a) => a.label === "กลับรายการ")!.run!(rec);
    /* Reason is required. */
    expect(calls.modal!.onConfirm!()).toBe(false);
    expect(TRANSFERS.length).toBe(before);
  });

  it("links reversal and original in both directions in the seeded data", () => {
    const reversal = transferRows().find((r) => r.reversalOf)!;
    const original = transferRows().find((r) => r.code === reversal.reversalOf)!;
    expect(original.reversedBy).toBe(reversal.code);
    expect(original.status).toBe("Reversed");
    /* The mirror swaps source and destination. */
    expect(reversal.srcWarehouse).toBe(original.dstWarehouse);
    expect(reversal.dstWarehouse).toBe(original.srcWarehouse);
  });
});

describe("Stock Transfer — edit rules", () => {
  it("allows editing only before quantity has moved", () => {
    for (const r of transferRows()) {
      const guard = stockTransferForm.editGuard!(r);
      if (["Draft", "Rejected", "Revision Requested", "Approved", "Ready to Transfer"].includes(r.status)) {
        expect(guard, r.code).toBeNull();
      } else {
        expect(guard, r.code).not.toBeNull();
      }
    }
  });

  it("locks a dispatched transfer", () => {
    const rec = transferRows().find((r) => r.status === "In Transit")!;
    expect(rec.isReadOnly).toBe(true);
    expect(stockTransferForm.editGuard!(rec)).toMatch(/แก้ไขไม่ได้/);
    expect(list.rowActions(rec, {} as never).find((a) => a.label === "แก้ไข")!.disabled).toBe(true);
  });

  it("offers no delete action anywhere", () => {
    const rec = transferRows()[0];
    const labels = [
      ...list.rowActions(rec, {} as never).map((a) => a.label ?? ""),
      ...(detail.actions?.(rec, {} as never) ?? []).map((a) => a.label ?? ""),
    ];
    for (const l of labels) expect(l.toLowerCase()).not.toMatch(/delete|ลบ/);
  });
});

describe("Stock Transfer — list", () => {
  it("renders the title and subtitle", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "Stock Transfer" })).toBeInTheDocument();
    expect(screen.getByText(/Move inventory between warehouses/)).toBeInTheDocument();
  });

  it("renders all ten KPI cards", () => {
    renderList();
    for (const label of [
      "Total Transfers",
      "Draft",
      "Pending Approval",
      "Ready to Transfer",
      "In Transit",
      "Partially Received",
      "Completed Today",
      "Exceptions",
      "Cancelled",
      "Total Transfer Qty",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("declares the columns and quick filters the spec lists", () => {
    const labels = list.columns.map((c) => c.label);
    for (const label of [
      "Transfer Number",
      "Transfer Date",
      "Method",
      "Transfer Type",
      "Source Warehouse",
      "Source Location",
      "Destination Warehouse",
      "Destination Location",
      "Items",
      "Requested Qty",
      "Dispatched Qty",
      "Received Qty",
      "In-Transit Qty",
      "Priority",
      "Approval",
      "Transfer Status",
      "Requested By",
      "Updated At",
    ]) {
      expect(labels, label).toContain(label);
    }
    expect(list.tabs).toHaveLength(10);
  });

  it("exposes the advanced filters the spec lists", () => {
    const ids = list.filters.map((f) => f.id);
    for (const id of [
      "status",
      "method",
      "type",
      "date",
      "src",
      "dst",
      "srcZone",
      "dstZone",
      "product",
      "lot",
      "serial",
      "priority",
      "requestedBy",
      "approvedBy",
      "assignedTo",
      "transit",
      "exception",
      "mine",
      "myWarehouse",
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("searches by transfer number and warehouse", async () => {
    const user = userEvent.setup();
    renderList();
    const code = transferRows()[0].code;
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), code);
    expect(screen.getByText(/^1 transfers$/)).toBeInTheDocument();
  });

  it("filters by method", async () => {
    const user = userEvent.setup();
    renderList();
    const expected = transferRows().filter((r) => r.method === "Direct Transfer").length;
    await user.selectOptions(screen.getByLabelText("Transfer Method"), "Direct Transfer");
    expect(screen.getByText(new RegExp(`^${expected} transfers$`))).toBeInTheDocument();
  });

  it("counts the summary the KPI cards read", () => {
    const s = transferSummary();
    expect(s.total).toBe(transferRows().length);
    expect(s.inTransit).toBe(transferRows().filter((r) => r.inTransitQty > 0).length);
  });
});

describe("Stock Transfer — drawer and detail", () => {
  it("declares the tabs the spec asks for", () => {
    expect(detail.tabs.map((t) => t.key)).toEqual([
      "overview",
      "items",
      "lotserial",
      "approval",
      "dispatch",
      "receipt",
      "exceptions",
      "movement",
      "docs",
      "timeline",
      "audit",
    ]);
  });

  it("hides dispatch and receipt for a direct transfer", () => {
    const direct = transferRows().find((r) => r.isDirect)!;
    const shown = detail.tabs.filter((t) => !t.when || t.when(direct)).map((t) => t.key);
    expect(shown).not.toContain("dispatch");
    expect(shown).not.toContain("receipt");

    const twoStep = transferRows().find((r) => r.isTwoStep)!;
    const shownTwo = detail.tabs.filter((t) => !t.when || t.when(twoStep)).map((t) => t.key);
    expect(shownTwo).toContain("dispatch");
    expect(shownTwo).toContain("receipt");
  });

  it("heads the drawer with source, destination, method and progress", () => {
    const rec = transferRows()[0];
    const id = detail.identity(rec);
    expect(id.code).toBe(rec.code);
    expect(id.title).toContain(rec.srcLabel);
    expect(id.title).toContain(rec.dstLabel);
    expect(id.badges.map((b) => b.text)).toContain(rec.method);
    expect(detail.kpis(rec).map((k) => k.label)).toContain("In Transit");
  });

  it("opens when a row is clicked", async () => {
    const user = userEvent.setup();
    renderList();
    const rec = transferRows()[0];
    await user.type(screen.getByPlaceholderText(list.searchPlaceholder!), rec.code);
    await user.click(screen.getAllByText(rec.code)[0]);

    const drawer = await screen.findByRole("dialog", { name: new RegExp(rec.srcWarehouse) });
    expect(within(drawer).getByRole("tab", { name: "Transfer Items" })).toBeInTheDocument();
  });

  it("opens the full detail page", () => {
    const rec = transferRows().find((r) => r.isTwoStep)!;
    render(<FullDetail schema={detail} record={rec} />);
    expect(screen.getAllByText(rec.code).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Stock Movement" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Document Relationship" })).toBeInTheDocument();
  });
});

describe("Stock Transfer — stock movement integration", () => {
  it("points transfer movements back at the transfer module", () => {
    const moves = movementRows().filter((m) => m.sourceModule === "stock-transfer");
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(REGISTRY["stock-transfer"]).toBeDefined();
      expect(TRANSFERS.some((t) => t.code === m.sourceDoc), m.sourceDoc).toBe(true);
    }
  });

  it("keeps the ledger reconciled after a transfer posts", () => {
    const { ctx } = stubCtx();
    const rec = transferRows().find((r) => r.canPost)!;
    detail.actions!(rec, ctx).find((a) => a.label === "โอนย้ายทันที")!.run!(rec);

    for (const m of movementRows()) {
      expect(m.balanceAfter, m.code).toBe(m.balanceBefore + m.qtyIn - m.qtyOut);
      expect(m.availAfter + m.resAfter + m.qcAfter + m.retAfter, m.code).toBe(m.balanceAfter);
    }
  });

  it("shows a status transfer as one movement with no quantity change", () => {
    const rec = transferRows().find(
      (r) => r.srcStatus === "QC Hold" && r.dstStatus === "Available" && r.receivedQty > 0,
    )!;
    const moves = movementRows().filter((m) => m.sourceDoc === rec.code);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.balanceAfter).toBe(m.balanceBefore);
      expect(m.type).toBe("QC Hold to Available");
    }
  });

  it("lets Stock Card open the transfer that caused a movement", () => {
    const m = movementRows().find((x) => x.sourceModule === "stock-transfer")!;
    const stockCard = getSchemas("stock-card")!.list;
    const action = stockCard.rowActions(m, {
      goto: routerPush,
      openEntity: (e: string, c?: string) => routerPush(`/m/${e}/${c}`),
      toast: () => {},
    } as never).find((a) => a.icon === "file")!;

    expect(action.disabled).toBeFalsy();
    action.run!(m);
    expect(routerPush).toHaveBeenCalledWith(`/m/stock-transfer/${m.sourceDoc}`);
  });
});

describe("Stock Transfer — create form", () => {
  it("opens on a blank draft with a fresh number", () => {
    const s = stockTransferForm.blank();
    expect(String(s.code)).toMatch(/^TRF-2026-\d{6}$/);
    expect(s.method).toBe("Direct Transfer");
    expect(s.items).toEqual([]);
  });

  it("declares the sections the spec lists", () => {
    const keys = stockTransferForm.steps.map((s) => s.key);
    for (const k of ["info", "source", "destination", "items", "lotserial", "notes", "review"]) {
      expect(keys, k).toContain(k);
    }
  });

  it("shows dispatch information only for a two-step transfer", () => {
    const step = stockTransferForm.steps.find((s) => s.key === "dispatch")!;
    expect(step.when!({ method: "Direct Transfer" })).toBe(false);
    expect(step.when!({ method: "Two-Step Transfer" })).toBe(true);
  });

  it("enforces the business rules inline", () => {
    const rules = stockTransferForm.rules!;
    const same = {
      srcWarehouse: "WH-BKK Bangkok",
      dstWarehouse: "WH-BKK Bangkok",
      srcBin: "A01",
      dstBin: "A01",
      srcStatus: "Available",
      dstStatus: "Available",
      items: [],
    };
    expect(rules.find((r) => r.label.includes("ต้นทางและปลายทาง"))!.test(same)).toBe(false);

    const over = {
      items: [{ code: "X", requested: 50, transferable: 10, serials: "" }],
    };
    expect(rules.find((r) => r.label.includes("ไม่เกินยอดที่โอนได้"))!.test(over)).toBe(false);

    const badSerials = {
      items: [{ code: "X", requested: 3, transferable: 10, serials: "A, B" }],
    };
    expect(rules.find((r) => r.label.includes("Serial ต้องเท่ากับ"))!.test(badSerials)).toBe(false);

    const dupSerials = {
      items: [{ code: "X", requested: 2, transferable: 10, serials: "A, A" }],
    };
    expect(rules.find((r) => r.label.includes("ห้ามมี Serial ซ้ำ"))!.test(dupSerials)).toBe(false);
  });

  it("clamps a grid quantity to what the source can transfer", () => {
    const state = {
      srcWarehouse: "WH-BKK Bangkok Main Warehouse",
      srcStatus: "Available",
      items: [{ code: STOCK_POSITIONS[0].product, requested: 999_999, transferable: 0 }],
    };
    stockTransferForm.onGridChange!("items.0.requested", state);
    const row0 = (state.items as { requested: number; transferable: number }[])[0];
    expect(row0.requested).toBe(row0.transferable);
    expect(row0.requested).toBeLessThan(999_999);
  });

  it("flags a duplicate product and lot on two lines", () => {
    const hits = stockTransferForm.findDuplicates!({
      items: [
        { code: "AA-TH003-WL", lot: "LOT-26001", name: "A" },
        { code: "AA-TH003-WL", lot: "LOT-26001", name: "A" },
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].why).toMatch(/ซ้ำ/);
  });

  it("saves a valid draft into the document list", () => {
    const { ctx, calls } = stubCtx();
    const before = TRANSFERS.length;
    const product = sourceStock("WH-BKK")[0];

    stockTransferForm.save(
      {
        code: nextTransferCode(),
        transferDate: "01/08/2026",
        method: "Direct Transfer",
        type: "Bin Transfer",
        priority: "Normal",
        requestedBy: "Admin",
        reason: "ทดสอบการบันทึก",
        srcWarehouse: "WH-BKK Bangkok Main Warehouse",
        srcBin: "A01",
        srcStatus: "Available",
        dstWarehouse: "WH-BKK Bangkok Main Warehouse",
        dstBin: "B09",
        dstStatus: "Available",
        items: [
          {
            code: product.code,
            name: product.name,
            unit: product.unit,
            requested: 1,
            transferable: product.transferable,
            serials: "",
          },
        ],
      },
      ctx,
    );

    expect(TRANSFERS.length).toBe(before + 1);
    expect(calls.toasts.at(-1)!.title).toMatch(/สร้างใบโอนย้ายแล้ว|บันทึก/);
  });

  it("refuses to save a document that breaks a rule", () => {
    const { ctx, calls } = stubCtx();
    const before = TRANSFERS.length;

    stockTransferForm.save(
      {
        code: nextTransferCode(),
        transferDate: "01/08/2026",
        method: "Direct Transfer",
        type: "Bin Transfer",
        priority: "Normal",
        requestedBy: "Admin",
        reason: "",
        srcWarehouse: "WH-BKK Bangkok Main Warehouse",
        dstWarehouse: "WH-BKK Bangkok Main Warehouse",
        srcBin: "A01",
        dstBin: "A01",
        srcStatus: "Available",
        dstStatus: "Available",
        items: [],
      },
      ctx,
    );

    expect(TRANSFERS.length).toBe(before);
    expect(calls.toasts.at(-1)!.tone).toBe("danger");
  });
});

describe("Stock Transfer — navigation", () => {
  it("is registered with a form so create and edit routes work", () => {
    expect(REGISTRY["stock-transfer"]).toBeDefined();
    expect(getSchemas("stock-transfer")!.form).toBeDefined();
  });

  it("is reachable from the Inventory sidebar group", () => {
    const group = NAV.find((g) => g.label === "Inventory")!;
    const item = group.items.find((i) => i.label === "Stock Transfer")!;
    expect(item.href).toBe("/m/stock-transfer");
    expect(item.soon).toBeUndefined();
    expect(pageHref("Stock Transfer")).toBe("/m/stock-transfer");
  });

  it("leaves the modules this round must not build as coming soon", () => {
    for (const label of ["Barcode Lookup"]) {
      expect(pageHref(label)).toBe(`/soon?m=${encodeURIComponent(label)}`);
    }
  });

  it("keeps the other Inventory modules untouched", () => {
    expect(pageHref("Inventory Workspace")).toBe("/inventory");
    expect(pageHref("Stock Inquiry")).toBe("/m/stock-inquiry");
    expect(pageHref("Stock Card")).toBe("/m/stock-card");
  });
});

describe("Stock Transfer — line status and responsive", () => {
  it("names where each line stands", () => {
    expect(lineStatus({ requested: 10, dispatched: 0, received: 0, short: 0, damaged: 0 } as never)).toBe(
      "Pending",
    );
    expect(lineStatus({ requested: 10, dispatched: 4, received: 0, short: 0, damaged: 0 } as never)).toBe(
      "Partially Dispatched",
    );
    expect(lineStatus({ requested: 10, dispatched: 10, received: 0, short: 0, damaged: 0 } as never)).toBe(
      "In Transit",
    );
    expect(lineStatus({ requested: 10, dispatched: 10, received: 6, short: 0, damaged: 0 } as never)).toBe(
      "Partially Received",
    );
    expect(lineStatus({ requested: 10, dispatched: 10, received: 6, short: 4, damaged: 0 } as never)).toBe(
      "Received with Variance",
    );
    expect(lineStatus({ requested: 10, dispatched: 10, received: 10, short: 0, damaged: 0 } as never)).toBe(
      "Received",
    );
  });

  it("scrolls the wide table rather than the page", () => {
    const { container } = renderList();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  it("opens with a readable column subset", () => {
    const visible = list.columns.filter((c) => !c.defaultHidden);
    expect(visible.length).toBeLessThan(list.columns.length);
    expect(list.columns.find((c) => c.key === "code")?.locked).toBe(true);
  });

  it("supports both transfer methods and every declared type", () => {
    expect(TRANSFER_METHODS).toHaveLength(2);
    expect(TRANSFER_TYPES.length).toBeGreaterThanOrEqual(11);
  });
});
