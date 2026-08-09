import { printActions } from "@/lib/print/actions";
import { can } from "@/lib/domain/admin";
import {
  SALES_ORDERS,
  creditCheck,
  getCustomer,
  soCloseBlocked,
  soLinkedDocs,
  type SoRow,
} from "@/lib/domain/outbound";
import { tierNotices } from "@/lib/domain/price-tier";
import { displayName, docDiscTotal, docSubtotal, docTaxTotal, lineNet, pctOf } from "@/lib/domain/lines";
import { SO_STATUS } from "@/data/sales-orders";
import { PICK_TONE, PRIORITY_TONE, SO_TONE, DO_TONE, PACK_TONE, tone } from "@/lib/badges";
import { DASH, fmt, money0 } from "@/lib/format";
import {
  soApproveCredit,
  soCancel,
  soClose,
  soConfirm,
  soCreateInvoice,
  soCreatePick,
  soDelete,
} from "@/lib/workflows-outbound";
import type { DetailSchema, EntitySchemas, ListSchema, RowAction } from "@/lib/types";
import { Badge, CellMedia, CellSub, Thumb, UtilBar } from "@/components/ui";
import { SO_FORM } from "./forms/sales-order";

/* ============================================================
   SALES ORDER — the confirmed commitment.
   Draft → Confirmed → Picking → Partially Delivered → Completed
         → On Hold (credit)
   ============================================================ */

export const SO_LIST: ListSchema<SoRow> = {
  key: "sales-order",
  entity: "Sales Order",
  entityPlural: "Sales Orders",
  title: "Sales Orders",
  subtitle: "ใบสั่งขายที่ยืนยันกับลูกค้าแล้ว ติดตามการจัดของและการส่งมอบ",
  crumb: "Sales Order",
  primaryLabel: "",
  searchPlaceholder: "ค้นหาเลขที่ SO ลูกค้า พนักงานขาย หรือเลข PO ลูกค้า...",
  emptyTitle: "ไม่พบใบสั่งขายที่ตรงกับเงื่อนไข",
  hideImportExport: true,
  /* The document that binds the company. It carries an approved price and a
     customer's yes, and neither of those can be typed into a blank page. */
  convertOnly: {
    from: "ใบเสนอราคาที่ลูกค้าตอบรับ หรือคำขอขายที่อนุมัติแล้ว",
    goto: "/m/sales-request",
    gotoLabel: "ไปที่คำขอขาย",
  },

  source: () => SALES_ORDERS,
  searchFields: ["code", "customer", "salesRep", "customerPo", "srRef", "remark"],

  tabs: [
    { key: "all", label: "All" },
    { key: "confirmed", label: "Confirmed", test: (s) => s.status === "Confirmed" },
    { key: "hold", label: "On Hold", test: (s) => s.status === "On Hold" },
    { key: "picking", label: "Picking", test: (s) => s.status === "Picking" },
    { key: "partial", label: "Partially Delivered", test: (s) => s.status === "Partially Delivered" },
    { key: "overdue", label: "Overdue", test: (s) => s.isOverdue },
    { key: "completed", label: "Completed", test: (s) => s.status === "Completed" },
  ],

  filters: [
    {
      id: "customer",
      label: "Customer",
      options: () => [...new Set(SALES_ORDERS.map((s) => s.customer))],
      test: (s, v) => s.customer === v,
    },
    {
      id: "salesRep",
      label: "Sales Rep",
      options: () => [...new Set(SALES_ORDERS.map((s) => s.salesRep))],
      test: (s, v) => s.salesRep === v,
    },
    {
      id: "warehouse",
      label: "Warehouse",
      options: () => [...new Set(SALES_ORDERS.map((s) => s.warehouse))],
      test: (s, v) => s.warehouse === v,
    },
    { id: "status", label: "Status", options: () => [...SO_STATUS], test: (s, v) => s.status === v },
  ],

  columns: [
    {
      key: "code",
      label: "SO Number",
      sortable: true,
      cell: (s) => (
        <CellMedia>
          <Thumb>{s.icon}</Thumb>
          <span className="font-medium">{s.code}</span>
        </CellMedia>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      cell: (s) => (
        <>
          {s.customer}
          <CellSub>{s.customerPo || s.customerCode}</CellSub>
        </>
      ),
    },
    { key: "salesRep", label: "Sales Rep", muted: true, cell: (s) => s.salesRep.split(" - ")[1] ?? s.salesRep },
    { key: "orderDate", label: "Order Date", muted: true, sortable: true, cell: (s) => s.orderDate },
    {
      key: "deliveryDate",
      label: "Delivery Date",
      sortable: true,
      cell: (s) =>
        s.isOverdue ? (
          <span className="font-semibold text-danger">{s.deliveryDate}</span>
        ) : (
          s.deliveryDate
        ),
    },
    { key: "warehouse", label: "Warehouse", muted: true, cell: (s) => s.warehouse },
    {
      key: "total",
      label: "Total Amount",
      align: "right",
      sortable: true,
      cell: (s) => (
        <>
          {money0(s.total)}
          <CellSub>{s.currency}</CellSub>
        </>
      ),
    },
    {
      key: "deliverPct",
      label: "Delivered %",
      align: "right",
      sortable: true,
      sortValue: (s) => s.deliverPct,
      cell: (s) => (
        <UtilBar
          pct={s.deliverPct}
          tone={s.deliverPct >= 100 ? "full" : s.deliverPct > 0 ? "mid" : undefined}
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (s) =>
        s.isOverdue && s.status !== "On Hold" ? (
          <Badge tone="danger">Overdue</Badge>
        ) : (
          <Badge tone={tone(SO_TONE, s.status)}>{s.status}</Badge>
        ),
    },
  ],

  rowActions: (so, ctx) => {
    const acts: RowAction<SoRow>[] = [
      { label: "View", icon: "eye", run: (r) => ctx.openEntity("sales-order", r.code) },
      { label: "Open Full Detail", icon: "external", run: (r) => ctx.goto(`/m/sales-order/${r.code}`) },
    ];

    if (["Draft", "On Hold", "Confirmed"].includes(so.status))
      acts.push({ label: "Edit", icon: "edit", run: (r) => ctx.goto(`/m/sales-order/${r.code}/edit`) });

    acts.push({ sep: true });

    /* Confirming, releasing credit and opening a pick all move stock or
       money. They belong to the approver, not to whoever typed the order. */
    const mayRun = can("sales-order", "approve");

    if (so.status === "Draft" && mayRun)
      acts.push({ label: "Confirm Order", icon: "checkCircle", run: (r) => soConfirm(r, ctx) });

    if (so.status === "On Hold" && mayRun)
      acts.push({ label: "Approve Credit", icon: "shield", run: (r) => soApproveCredit(r, ctx) });

    if (["Confirmed", "Picking", "Partially Delivered"].includes(so.status) && so.outstandingQty > 0 && mayRun)
      acts.push({ label: "Create Picking", icon: "picking", run: (r) => soCreatePick(r, ctx) });

    /* Offered only once nothing is outstanding — the rule is that an order
       closes when the goods are with the customer, so a button that appears
       earlier and then refuses would just be a button that lies. */
    if (["Picking", "Partially Delivered", "Confirmed"].includes(so.status) && so.outstandingQty === 0 && mayRun)
      acts.push({ label: "Close Order", icon: "checkCircle", run: (r) => soClose(r, ctx) });

    if (so.srRef)
      acts.push({
        label: `ดู ${so.srRef}`,
        icon: "salesRequest",
        run: () => ctx.openEntity("sales-request", so.srRef),
      });

    acts.push({
      label: "Print Order",
      icon: "printer",
      run: (r) => ctx.toast("พิมพ์ใบสั่งขาย", `${r.code} — Future support`, "info"),
    });

    acts.push({ sep: true });
    if (so.status === "Draft")
      acts.push({ label: "Delete", icon: "trash", danger: true, run: (r) => soDelete(r, ctx) });
    else if (!["Cancelled", "Completed"].includes(so.status))
      acts.push({ label: "Cancel Order", icon: "circleSlash", danger: true, run: (r) => soCancel(r, ctx) });

    return acts;
  },
};

export const SO_DETAIL: DetailSchema<SoRow> = {
  key: "sales-order",
  entityLabel: "Sales Order",

  identity: (so) => ({
    image: so.icon,
    code: so.code,
    title: so.customer,
    copyFields: [
      { label: "SO number", value: so.code },
      { label: "Total", value: `${money0(so.total)} ${so.currency}` },
    ],
    badges: [
      { text: so.status, tone: tone(SO_TONE, so.status) },
      ...(so.isOverdue ? ([{ text: "Overdue", tone: "danger" }] as const) : []),
      ...(!so.creditApproved ? ([{ text: "Credit Hold", tone: "danger" }] as const) : []),
      { text: so.priority, tone: tone(PRIORITY_TONE, so.priority) },
      /* Billing that changed on the way down belongs on the header, not
         buried in history — it moves the money. */
      ...(so.billTypeDrift
        ? ([{ text: `${so.billType} ≠ ${so.billTypeDrift.code}`, tone: "warning" }] as const)
        : []),
    ],
    tags: [so.customerCode, so.warehouse, so.channel].filter(Boolean),
  }),

  kpis: (so) => [
    { icon: "tag", label: "Order Value", value: money0(so.total), sub: so.currency, goTab: "items" },
    { icon: "box", label: "Ordered Qty", value: fmt(so.orderedQty), sub: "หน่วย", goTab: "items" },
    { icon: "picking", label: "Picked", value: `${so.pickPct}%`, sub: `${fmt(so.pickedQty)} หน่วย`, goTab: "fulfilment" },
    {
      icon: "truck",
      label: "Delivered",
      value: `${so.deliverPct}%`,
      sub: `คงเหลือ ${fmt(so.outstandingQty)} หน่วย`,
      wide: true,
      goTab: "fulfilment",
    },
  ],

  tabs: [
    {
      key: "overview",
      label: "Overview",
      aside: (so) => {
        const credit = creditCheck(`${so.customerCode} - ${so.customer}`, so.total);
        return {
          rows: [
            { icon: "partner", label: "Customer", value: so.customer },
            { icon: "user", label: "Sales Rep", value: so.salesRep.split(" - ")[1] ?? so.salesRep },
            { icon: "warehouse", label: "Warehouse", value: so.warehouse },
            { icon: "calendar", label: "Delivery Date", value: so.deliveryDate },
            { icon: "tag", label: "Payment Term", value: so.payTerm },
            {
              icon: "pricing",
              label: "Bill Type",
              /* Says what changed and what it changed from, in one line, on
                 the page a salesperson already has open. */
              value: so.billTypeDrift ? (
                <span className="font-semibold text-warning-text">
                  {so.billType} — ต่างจาก{so.billTypeDrift.label} {so.billTypeDrift.code} ที่เป็น{" "}
                  {so.billTypeDrift.billType}
                </span>
              ) : (
                so.billType
              ),
            },
            {
              icon: "shield",
              label: "Credit Status",
              value: (
                <Badge tone={so.creditApproved ? "success" : "danger"}>
                  {so.creditApproved ? "Approved" : "On Hold"}
                </Badge>
              ),
            },
            {
              icon: "pricing",
              label: "Credit Available",
              value: credit.cashOnly ? "เงินสด" : money0(credit.available),
              muted: credit.cashOnly,
            },
          ],
        };
      },
      blocks: (so) => {
        const credit = creditCheck(`${so.customerCode} - ${so.customer}`, so.total);
        const bp = getCustomer(`${so.customerCode} - ${so.customer}`);

        return [
          so.status === "On Hold" && {
            type: "alert",
            tone: "danger",
            title: "ใบสั่งขายถูกระงับด้วยเหตุผลด้านเครดิต",
            message: `${so.creditNote} — ต้องได้รับอนุมัติจากฝ่ายบัญชีก่อนจึงจะจัดของได้`,
          },
          /* Which price tier this customer is on, and anything odd about how
             it was decided — the same notice the editors show, because this
             is where the order that used those prices is read back. */
          ...(bp ? tierNotices(bp) : []).map(
            (n) =>
              ({
                type: "alert",
                tone: n.tone,
                title: n.title,
                message: n.message,
              }) as const,
          ),
          so.isOverdue && {
            type: "alert",
            tone: "warn",
            title: "เลยกำหนดส่งมอบแล้ว",
            message: `กำหนดส่ง ${so.deliveryDate} — ยังส่งมอบไม่ครบ คงเหลือ ${fmt(so.outstandingQty)} หน่วย`,
          },
          {
            type: "fields",
            title: "Customer Information",
            cols: 2,
            items: [
              { label: "Customer", value: so.customer },
              { label: "Customer Code", value: so.customerCode },
              { label: "Tax ID", value: bp?.tax?.taxId || DASH },
              { label: "Customer PO", value: so.customerPo || DASH },
              { label: "Sales Channel", value: so.channel },
              { label: "Sales Rep", value: so.salesRep },
              { label: "Ship To", value: so.shipTo || DASH, span: true },
            ],
          },
          {
            type: "fields",
            title: "Order Information",
            cols: 2,
            items: [
              { label: "SO Number", value: so.code },
              { label: "Status", value: <Badge tone={tone(SO_TONE, so.status)}>{so.status}</Badge> },
              { label: "Order Date", value: so.orderDate },
              {
                label: "Delivery Date",
                value: so.isOverdue ? (
                  <span className="font-semibold text-danger">{so.deliveryDate}</span>
                ) : (
                  so.deliveryDate
                ),
              },
              { label: "Warehouse", value: so.warehouse },
              { label: "Currency", value: so.currency },
              { label: "Payment Term", value: so.payTerm },
              { label: "Incoterm", value: so.incoterm },
              /* Two separate sources, and an order has at most one: the
                 request route fills srRef, the direct route quotationRef.
                 This row used to label srRef "Source Quotation", which read
                 as a quotation number and never was one. */
              so.srRef
                ? { label: "Source Sales Request", value: <Badge tone="info">{so.srRef}</Badge> }
                : null,
              so.quotationRef
                ? { label: "Source Quotation", value: <Badge tone="info">{so.quotationRef}</Badge> }
                : null,
            ],
          },
          {
            type: "fields",
            title: "Credit Position",
            cols: 2,
            items: [
              { label: "Credit Limit", value: credit.cashOnly ? "เงินสดเท่านั้น" : money0(credit.limit) },
              { label: "Outstanding Balance", value: money0(credit.outstanding) },
              { label: "Available Credit", value: money0(credit.available) },
              {
                label: "หลังรวมใบสั่งขายนี้",
                value: (
                  <span className={credit.withinLimit ? "" : "font-semibold text-danger"}>
                    {money0(credit.projected)}
                  </span>
                ),
              },
              { label: "Credit Note", value: so.creditNote || DASH, span: true },
            ],
          },
          { type: "note", title: "Remark", text: so.remark || DASH },
          {
            type: "fields",
            title: "System Information",
            cols: 2,
            items: [
              { label: "Created By", value: so.createdBy, muted: true },
              { label: "Created Date", value: so.created, muted: true },
              { label: "Last Updated By", value: so.updatedBy, muted: true },
              { label: "Last Updated", value: so.updated, muted: true },
            ],
          },
        ];
      },
    },

    {
      key: "items",
      label: "Items",
      blocks: (so) => [
        {
          type: "table",
          title: `Order Items (${so.itemCount})`,
          rows: (so.items ?? []).map((it) => ({
            ...it,
            net: lineNet(it),
            outstanding: Math.max(0, Number(it.qty) - Number(it.delivered)),
            pct: pctOf(Number(it.delivered), Number(it.qty)),
          })),
          empty: "ไม่มีรายการสินค้า",
          cols: [
            { key: "code", label: "Product Code", cell: (r) => <span className="tnum">{r.code}</span> },
            {
              key: "name",
              label: "Product Name",
              /* Always the salesperson's wording on screen, whatever showOnBill says:
                 the people handling the order need to see what the customer was told. */
              cell: (it) => displayName(it),
            },
            { key: "qty", label: "Ordered", align: "right", cell: (r) => fmt(r.qty) },
            { key: "picked", label: "Picked", align: "right", muted: true, cell: (r) => fmt(r.picked) },
            { key: "delivered", label: "Delivered", align: "right", cell: (r) => fmt(r.delivered) },
            {
              key: "outstanding",
              label: "Outstanding",
              align: "right",
              cell: (r) => (
                <span className={r.outstanding > 0 ? "font-semibold text-warning-text" : ""}>
                  {fmt(r.outstanding)}
                </span>
              ),
            },
            { key: "unit", label: "UOM", muted: true },
            { key: "price", label: "Unit Price", align: "right", cell: (r) => money0(r.price) },
            { key: "disc", label: "Disc %", align: "right", cell: (r) => (r.disc ? `${r.disc}%` : DASH) },
            {
              key: "net",
              label: "Net Amount",
              align: "right",
              cell: (r) => <span className="font-medium">{money0(r.net)}</span>,
            },
            {
              key: "pct",
              label: "Delivered %",
              align: "right",
              cell: (r) => (
                <UtilBar pct={r.pct} tone={r.pct >= 100 ? "full" : r.pct > 0 ? "mid" : undefined} />
              ),
            },
          ],
        },
        {
          type: "cards",
          title: "Totals",
          items: [
            { label: "Subtotal", value: money0(docSubtotal(so)), unit: so.currency },
            { label: "Discount", value: money0(docDiscTotal(so)), unit: so.currency },
            { label: "Tax", value: money0(docTaxTotal(so)), unit: so.currency },
            { label: "Grand Total", value: money0(so.total), unit: so.currency, tone: "accent" },
          ],
        },
      ],
    },

    {
      key: "fulfilment",
      label: "Fulfilment",
      blocks: (so, ctx) => {
        const linked = soLinkedDocs(so.code);
        const closeBlocked = soCloseBlocked(so);
        return [
          /* Why the order is still open, on the tab that shows the shipping.
             Only while it is genuinely in flight — saying "ยังปิดไม่ได้" on a
             cancelled order, or on one already closed, is noise. */
          Boolean(closeBlocked) &&
            ["Confirmed", "Picking", "Partially Delivered", "On Hold"].includes(so.status) && {
              type: "alert",
              tone: "info",
              title: "ยังปิดใบสั่งขายไม่ได้",
              message: closeBlocked,
            },
          {
            type: "cards",
            title: "Fulfilment Progress",
            cols: 4,
            items: [
              { label: "Ordered", value: fmt(so.orderedQty), unit: "หน่วย" },
              { label: "Picked", value: fmt(so.pickedQty), unit: "หน่วย", tone: "accent" },
              { label: "Delivered", value: fmt(so.deliveredQty), unit: "หน่วย", tone: "accent" },
              {
                label: "Outstanding",
                value: fmt(so.outstandingQty),
                unit: "หน่วย",
                tone: so.outstandingQty > 0 ? "warn" : undefined,
              },
            ],
          },
          {
            type: "table",
            title: `Picking Tasks (${linked.picks.length})`,
            rows: linked.picks,
            empty: "ยังไม่มีใบหยิบสินค้า — สร้างได้จากเมนู Create Picking",
            cols: [
              {
                key: "code",
                label: "Pick No.",
                cell: (r) => (
                  <button
                    onClick={() => ctx.openEntity("picking", r.code)}
                    className="font-medium text-info hover:underline tnum"
                  >
                    {r.code}
                  </button>
                ),
              },
              { key: "assignedTo", label: "Assigned To", muted: true, cell: (r) => r.assignedTo || DASH },
              { key: "orderedQty", label: "Ordered", align: "right", cell: (r) => fmt(r.orderedQty) },
              { key: "pickedQty", label: "Picked", align: "right", cell: (r) => fmt(r.pickedQty) },
              { key: "status", label: "Status", cell: (r) => <Badge tone={tone(PICK_TONE, r.status)}>{r.status}</Badge> },
            ],
          },
          {
            type: "table",
            title: `Packing Tasks (${linked.packs.length})`,
            rows: linked.packs,
            empty: "ยังไม่มีงานแพ็ค",
            cols: [
              {
                key: "code",
                label: "Pack No.",
                cell: (r) => (
                  <button
                    onClick={() => ctx.openEntity("packing", r.code)}
                    className="font-medium text-info hover:underline tnum"
                  >
                    {r.code}
                  </button>
                ),
              },
              { key: "packer", label: "Packer", muted: true, cell: (r) => r.packer || DASH },
              { key: "boxCount", label: "Boxes", align: "right", cell: (r) => fmt(r.boxCount) },
              { key: "packedQty", label: "Packed", align: "right", cell: (r) => fmt(r.packedQty) },
              { key: "status", label: "Status", cell: (r) => <Badge tone={tone(PACK_TONE, r.status)}>{r.status}</Badge> },
            ],
          },
          {
            type: "table",
            title: `Delivery Orders (${linked.deliveries.length})`,
            rows: linked.deliveries,
            empty: "ยังไม่มีใบส่งของ",
            cols: [
              {
                key: "code",
                label: "DO No.",
                cell: (r) => (
                  <button
                    onClick={() => ctx.openEntity("delivery-order", r.code)}
                    className="font-medium text-info hover:underline tnum"
                  >
                    {r.code}
                  </button>
                ),
              },
              { key: "carrier", label: "Carrier", muted: true },
              { key: "deliveryDate", label: "Delivery Date", muted: true },
              { key: "totalQty", label: "Qty", align: "right", cell: (r) => fmt(r.totalQty) },
              { key: "status", label: "Status", cell: (r) => <Badge tone={tone(DO_TONE, r.status)}>{r.status}</Badge> },
            ],
          },
        ];
      },
    },

    {
      key: "history",
      label: "History",
      blocks: (so) => [
        {
          type: "timeline",
          title: "Activity",
          items: (so.history ?? []).map((h) => ({
            title: h.t,
            detail: h.d,
            user: h.u,
            when: h.when,
            kind: h.kind,
          })),
        },
      ],
    },
  ],

  actions: (so, ctx) => {
    const acts: RowAction<SoRow>[] = [];
    const mayRun = can("sales-order", "approve");
    if (so.status === "Draft" && mayRun)
      acts.push({ label: "Confirm Order", icon: "checkCircle", run: () => soConfirm(so, ctx) });
    if (so.status === "On Hold" && mayRun)
      acts.push({ label: "Approve Credit", icon: "shield", run: () => soApproveCredit(so, ctx) });
    if (["Confirmed", "Picking", "Partially Delivered"].includes(so.status) && so.outstandingQty > 0 && mayRun)
      acts.push({ label: "Create Picking", icon: "picking", run: () => soCreatePick(so, ctx) });
    if (["Confirmed", "Picking", "Partially Delivered", "Completed"].includes(so.status))
      acts.push({ label: "Create Invoice", icon: "invoice", run: () => soCreateInvoice(so, ctx) });
    if (["Picking", "Partially Delivered", "Confirmed"].includes(so.status) && so.outstandingQty === 0 && mayRun)
      acts.push({ label: "Close Order", icon: "checkCircle", run: () => soClose(so, ctx) });
    acts.push({
      label: "Print Order",
      icon: "printer",
      run: () => ctx.toast("พิมพ์ใบสั่งขาย", `${so.code} — Future support`, "info"),
    });
    if (!["Cancelled", "Completed"].includes(so.status)) {
      acts.push({ sep: true });
      acts.push({ label: "Cancel Order", icon: "circleSlash", danger: true, run: () => soCancel(so, ctx) });
    }
    /* Print Preview and every copy type this role may produce — built from
       lib/print config, so a new copy type reaches all ten modules at once. */
    acts.push(...printActions("sales-order", so, ctx));
    return acts;
  },
};

export const soSchemas: EntitySchemas<SoRow> = {
  list: SO_LIST,
  detail: SO_DETAIL,
  form: SO_FORM,
};
