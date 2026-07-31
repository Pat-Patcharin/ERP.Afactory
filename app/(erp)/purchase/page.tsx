"use client";

import { WS_DATA } from "@/data/workspace";
import { PO_TONE, PR_TONE, PRIORITY_TONE, tone } from "@/lib/badges";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, LinkButton, Sparkline, Thumb } from "@/components/ui";
import {
  ActionPill,
  WsAttention,
  WsBrief,
  WsKpiCards,
  WsQuickActions,
  WsRow,
  WsTable,
  WsTableCard,
  WsTd,
  WsTh,
  useGoPage,
} from "@/components/workspace/parts";

const DELIVERY_TONE = {
  Expected: "info",
  Partial: "warning",
  Late: "danger",
  Received: "success",
} as const;

/**
 * PURCHASE WORKSPACE — the command center for the purchasing department.
 *
 * Not a dashboard. Every section answers "what needs my attention right now?"
 * and links straight into the document that resolves it.
 */
export default function PurchaseWorkspacePage() {
  const d = WS_DATA;
  const go = useGoPage();

  return (
    <main className="flex max-w-[1760px] flex-col gap-5 p-6 max-md:gap-4 max-md:p-4">
      {/* Top zone: brief + KPIs on the left, Quick Actions as a right rail */}
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 max-[1280px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-5">
          <WsBrief
            greeting={`Good Morning, ${d.user}.`}
            lastUpdated={d.lastUpdated}
            lines={[
              <>
                วันนี้ต้องอนุมัติ <strong className="font-semibold text-ink">{d.brief.pendingApproval} รายการ</strong>
              </>,
              <>
                มี PO ค้างส่ง <strong className="font-semibold text-ink">{d.brief.overduePO} รายการ</strong>
              </>,
              <>
                สินค้า <strong className="font-semibold text-ink">{d.brief.belowRop} รายการ</strong> ต่ำกว่า ROP
              </>,
              <>
                คาดว่าจะมีสินค้าเข้า{" "}
                <strong className="font-semibold text-ink">{d.brief.deliveriesToday} รายการ</strong>
              </>,
            ]}
          />
          <WsKpiCards kpis={d.kpis.map((k) => ({ ...k, value: String(k.value) }))} />
        </div>

        <div className="min-w-0">
          <WsQuickActions actions={d.quickActions} />
        </div>
      </div>

      {/* Need Attention sits narrower than Today's Deliveries */}
      <div className="grid grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start gap-5 max-[1280px]:grid-cols-1">
        <WsAttention items={d.attention} cols={2} />

        <WsTableCard title="Today's Deliveries" viewAll="Goods Receipt">
          <WsTable
            head={
              <>
                <WsTh>ETA</WsTh>
                <WsTh>Supplier</WsTh>
                <WsTh>PO Number</WsTh>
                <WsTh>Warehouse</WsTh>
                <WsTh align="right">Items</WsTh>
                <WsTh>Status</WsTh>
              </>
            }
          >
            {d.deliveries.map((r) => (
              <WsRow key={r.po} goto="Goods Receipt">
                <WsTd className="tnum">{r.eta}</WsTd>
                <WsTd>{r.supplier}</WsTd>
                <WsTd>
                  <LinkButton onClick={() => go("Purchase Order")}>{r.po}</LinkButton>
                </WsTd>
                <WsTd muted>{r.wh}</WsTd>
                <WsTd align="right">{r.items}</WsTd>
                <WsTd>
                  <Badge
                    tone={
                      DELIVERY_TONE[r.status as keyof typeof DELIVERY_TONE] ?? "neutral"
                    }
                  >
                    {r.status}
                  </Badge>
                </WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>
      </div>

      {/* Recent documents */}
      <div className="grid grid-cols-2 items-start gap-5 max-[1280px]:grid-cols-1">
        <WsTableCard title="Recent Purchase Requests" viewAll="Purchase Request">
          <WsTable
            head={
              <>
                <WsTh>PR Number</WsTh>
                <WsTh>Department</WsTh>
                <WsTh>Requester</WsTh>
                <WsTh>Priority</WsTh>
                <WsTh>Request Date</WsTh>
                <WsTh>Status</WsTh>
                <WsTh align="right">Amount</WsTh>
              </>
            }
          >
            {d.requests.map((r) => (
              <WsRow key={r.no} goto="Purchase Request">
                <WsTd>
                  <LinkButton onClick={() => go("Purchase Request")}>{r.no}</LinkButton>
                </WsTd>
                <WsTd muted>{r.dept}</WsTd>
                <WsTd>{r.requester}</WsTd>
                <WsTd>
                  <Badge tone={tone(PRIORITY_TONE, r.priority)}>{r.priority}</Badge>
                </WsTd>
                <WsTd muted className="tnum">
                  {r.date}
                </WsTd>
                <WsTd>
                  <Badge tone={tone(PR_TONE, r.status)}>{r.status}</Badge>
                </WsTd>
                <WsTd align="right">{money(r.amount)}</WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>

        <WsTableCard title="Recent Purchase Orders" viewAll="Purchase Order">
          <WsTable
            head={
              <>
                <WsTh>PO Number</WsTh>
                <WsTh>Supplier</WsTh>
                <WsTh>Order Date</WsTh>
                <WsTh>ETA</WsTh>
                <WsTh>Status</WsTh>
                <WsTh align="right">Amount</WsTh>
              </>
            }
          >
            {d.orders.map((r) => (
              <WsRow key={r.no} goto="Purchase Order">
                <WsTd>
                  <LinkButton onClick={() => go("Purchase Order")}>{r.no}</LinkButton>
                </WsTd>
                <WsTd>{r.supplier}</WsTd>
                <WsTd muted className="tnum">
                  {r.date}
                </WsTd>
                <WsTd muted className="tnum">
                  {r.eta}
                </WsTd>
                <WsTd>
                  <Badge tone={tone(PO_TONE, r.status)}>{r.status}</Badge>
                </WsTd>
                <WsTd align="right">{money(r.amount)}</WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>
      </div>

      {/* Supplier performance + stock insight */}
      <div className="grid grid-cols-2 items-start gap-5 max-[1280px]:grid-cols-1">
        <WsTableCard title="Supplier Performance (Top 5)" viewAll="Reports">
          <WsTable
            head={
              <>
                <WsTh>Supplier</WsTh>
                <WsTh align="right">On-Time Delivery</WsTh>
                <WsTh align="right">Avg. Lead Time</WsTh>
                <WsTh align="right">Quality Rate</WsTh>
                <WsTh align="right">Open Orders</WsTh>
                <WsTh align="right">Trend</WsTh>
              </>
            }
          >
            {d.suppliers.map((s) => (
              <WsRow key={s.name} goto="Business Partner">
                <WsTd>
                  <span className="inline-flex items-center gap-2">
                    <Thumb size={26}>{s.icon}</Thumb>
                    {s.name}
                  </span>
                </WsTd>
                <WsTd align="right">
                  <span
                    className={cn(
                      "font-semibold",
                      s.otd >= 95
                        ? "text-success-text"
                        : s.otd >= 92
                          ? "text-warning-text"
                          : "text-danger-text",
                    )}
                  >
                    {s.otd}%
                  </span>
                </WsTd>
                <WsTd align="right" muted>
                  {s.lead.toFixed(1)}
                </WsTd>
                <WsTd align="right" muted>
                  {s.quality.toFixed(1)}%
                </WsTd>
                <WsTd align="right">{s.open}</WsTd>
                <WsTd align="right">
                  <Sparkline points={s.trend} />
                </WsTd>
              </WsRow>
            ))}
          </WsTable>
        </WsTableCard>

        <WsTableCard title="Stock Insight (Below ROP)" viewAll="Product">
          <WsTable
            head={
              <>
                <WsTh>Product Code</WsTh>
                <WsTh>Product Name</WsTh>
                <WsTh align="right">Current</WsTh>
                <WsTh align="right">On Order</WsTh>
                <WsTh align="right">Back Order</WsTh>
                <WsTh align="right">Available</WsTh>
                <WsTh align="right">ROP</WsTh>
                <WsTh align="center">Action</WsTh>
              </>
            }
          >
            {d.stock.map((r) => {
              // Available already accounts for inbound POs and committed demand,
              // which is why a row can sit below zero.
              const available = r.current + r.onOrder - r.backOrder;
              const action =
                available < 0 ? "Urgent" : available - r.rop < 0 ? "High" : "Normal";
              return (
                <WsRow key={r.code} goto="Product">
                  <WsTd className="font-medium tnum">{r.code}</WsTd>
                  <WsTd>{r.name}</WsTd>
                  <WsTd
                    align="right"
                    className={cn(r.current < r.rop && "font-semibold text-warning-text")}
                  >
                    {r.current}
                  </WsTd>
                  <WsTd align="right" muted>
                    {r.onOrder}
                  </WsTd>
                  <WsTd
                    align="right"
                    className={cn(
                      r.backOrder > 0 ? "font-semibold text-warning-text" : "text-ink-2",
                    )}
                  >
                    {r.backOrder}
                  </WsTd>
                  <WsTd
                    align="right"
                    className={cn(
                      available < 0
                        ? "font-bold text-danger-text"
                        : available < r.rop
                          ? "font-semibold text-warning-text"
                          : "font-semibold text-success-text",
                    )}
                  >
                    {available}
                  </WsTd>
                  <WsTd align="right" muted>
                    {r.rop}
                  </WsTd>
                  <WsTd align="center">
                    <ActionPill action={action} />
                  </WsTd>
                </WsRow>
              );
            })}
          </WsTable>
        </WsTableCard>
      </div>
    </main>
  );
}
