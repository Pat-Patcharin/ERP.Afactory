import { fmt, money0, stamp } from "./format";
import type { ActionCtx } from "./types";
import {
  DELIVERY_ORDERS,
  PACKING_TASKS,
  PICKING_TASKS,
  QUOTATIONS,
  SALES_ORDERS,
  SALES_REQUESTS,
  creditCheck,
  decorateOutbound,
  getPack,
  getPick,
  getSO,
  nextDOCode,
  nextPackCode,
  nextPickCode,
  nextSOCode,
  nextSalesRequestCode,
  soLinkedDocs,
  type DoRow,
  type PackRow,
  type PickRow,
  type QtRow,
  type SoRow,
  type SrRow,
} from "./domain/outbound";

/* ============================================================
   OUTBOUND WORKFLOWS

     Sales Request → Sales Order → Picking → Packing → Delivery

   Each step both advances its own document and updates the one
   upstream, so a status never has to be kept in sync by hand.
   Kept out of the schemas so the chain reads as one story.
   ============================================================ */

const USER = "Pimpaka S.";

/** Every document in this module records history the same way. */
function log(
  doc: { history?: { t: string; d: string; u: string; when: string; kind: string }[] },
  t: string,
  d: string,
  kind = "primary",
  u = USER,
) {
  (doc.history ??= []).unshift({ t, d, u, when: stamp(), kind });
}

function commit(ctx: ActionCtx, title: string, message: string, tone: "success" | "info" | "danger" | "warning" = "success") {
  decorateOutbound();
  ctx.refresh();
  ctx.toast(title, message, tone);
}

/* ============================================================
   QUOTATION — optional price offer. Nothing here touches stock
   or commits the company to anything.
   ============================================================ */

export function qtSend(qt: QtRow, ctx: ActionCtx) {
  qt.status = "Sent";
  qt.updated = stamp();
  qt.updatedBy = USER;
  log(qt, "Sent to customer", "ส่งใบเสนอราคาให้ลูกค้าแล้ว", "info");
  commit(ctx, "ส่งใบเสนอราคาแล้ว", `${qt.code} — รอลูกค้าตอบกลับ`);
}

export function qtAccept(qt: QtRow, ctx: ActionCtx) {
  qt.status = "Accepted";
  qt.updated = stamp();
  qt.updatedBy = USER;
  log(qt, "Accepted by customer", "ลูกค้ายืนยันราคาแล้ว พร้อมเปิดคำขอขาย");
  commit(ctx, "ลูกค้ายอมรับแล้ว", `${qt.code} — พร้อมแปลงเป็นคำขอขาย`);
}

export function qtReject(qt: QtRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Reject this quotation?",
    message: `${qt.code} จะถูกปิดเป็น Rejected — เหตุผลที่บันทึกไว้จะใช้ทำรายงาน win/loss ต่อไป`,
    confirmText: "Reject quotation",
    onConfirm: () => {
      qt.status = "Rejected";
      if (!qt.rejectReason) qt.rejectReason = "อื่น ๆ";
      qt.updated = stamp();
      qt.updatedBy = USER;
      log(qt, "Rejected by customer", `เหตุผล: ${qt.rejectReason}`, "warn");
      commit(ctx, "ปิดใบเสนอราคาแล้ว", `${qt.code} — ${qt.rejectReason}`, "danger");
    },
  });
}

/**
 * Accepted quotation → a Sales Request. The quote decided the price; the
 * request is what goes through internal approval.
 */
export function qtConvert(qt: QtRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Convert to Sales Request?",
    message: (
      <>
        สร้างคำขอขายจาก <strong>{qt.code}</strong> — ระบบจะออกเลข SR ให้อัตโนมัติ
        <br />
        มูลค่า {money0(qt.amount)} บาท · คำขอขายยังไม่จองสต๊อก
      </>
    ),
    confirmText: "Convert to Sales Request",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const srCode = nextSalesRequestCode();

      SALES_REQUESTS.unshift({
        code: srCode,
        customer: qt.customer,
        customerCode: qt.customerCode,
        salesRep: qt.salesRep,
        requestDate: now.split(" ")[0],
        requiredDate: qt.validUntil,
        status: "Draft",
        priority: "Normal",
        warehouse: "",
        currency: qt.currency,
        payTerm: qt.payTerm,
        priceList: qt.priceList,
        channel: qt.channel,
        customerRef: qt.customerRef,
        quotationRef: qt.code,
        note: `สร้างจากใบเสนอราคา ${qt.code}`,
        items: (qt.items ?? []).map((it) => ({ ...it })),
        approvedBy: "",
        approvedDate: "",
        rejectReason: "",
        soRef: "",
        history: [
          {
            t: `Created from ${qt.code}`,
            d: "สร้างคำขอขายจากใบเสนอราคาที่ลูกค้าตอบรับ",
            u: USER,
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER,
        updated: now,
        updatedBy: USER,
      } as unknown as SrRow);

      qt.status = "Converted";
      qt.srRef = srCode;
      qt.updated = now;
      qt.updatedBy = USER;
      log(qt, "Converted to Sales Request", `สร้าง ${srCode} จากใบเสนอราคานี้`);

      commit(ctx, "แปลงเป็นคำขอขายแล้ว", `${qt.code} → ${srCode}`);
      ctx.goto(`/m/sales-request/${encodeURIComponent(srCode)}`);
    },
  });
}

export function qtCancel(qt: QtRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this quotation?",
    message: `${qt.code} จะถูกยกเลิก`,
    confirmText: "Cancel quotation",
    onConfirm: () => {
      qt.status = "Cancelled";
      qt.updated = stamp();
      log(qt, "Cancelled", "ยกเลิกใบเสนอราคา", "warn");
      commit(ctx, "ยกเลิกใบเสนอราคาแล้ว", qt.code, "info");
    },
  });
}

export function qtDelete(qt: QtRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this quotation?",
    message: `${qt.code} จะถูกลบถาวร การกระทำนี้ย้อนกลับไม่ได้`,
    confirmText: "Delete quotation",
    onConfirm: () => {
      const i = QUOTATIONS.indexOf(qt);
      if (i > -1) QUOTATIONS.splice(i, 1);
      commit(ctx, "ลบใบเสนอราคาแล้ว", qt.code, "danger");
    },
  });
}

/* ============================================================
   SALES REQUEST — internal approval, then conversion.
   Approving a request does NOT reserve stock.
   ============================================================ */

export function srSubmit(sr: SrRow, ctx: ActionCtx) {
  if (!(sr.items ?? []).length) {
    ctx.toast("ยังไม่มีรายการสินค้า", "เพิ่มรายการอย่างน้อย 1 บรรทัดก่อนส่งขออนุมัติ", "warning");
    return;
  }
  sr.status = "Submitted";
  sr.updated = stamp();
  sr.updatedBy = USER;
  log(sr, "Submitted for approval", "ส่งขออนุมัติภายใน", "info");
  commit(ctx, "ส่งขออนุมัติแล้ว", `${sr.code} — รอผู้จัดการฝ่ายขายอนุมัติ`);
}

/** Internal approval. Credit is checked here so the order does not stall later. */
export function srApprove(sr: SrRow, ctx: ActionCtx) {
  const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);

  ctx.confirm({
    title: "Approve this sales request?",
    message: (
      <>
        อนุมัติ <strong>{sr.code}</strong> — {sr.customer}
        <br />
        มูลค่า {money0(sr.amount)} บาท
        {!credit.withinLimit && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ลูกค้าเกินวงเงินเครดิต {money0(credit.overBy)} บาท — อนุมัติได้
              แต่ใบสั่งขายจะถูกตั้งเป็น On Hold
            </span>
          </>
        )}
        <br />
        <span className="text-ink-2">การอนุมัติคำขอขายยังไม่จองสต๊อก</span>
      </>
    ),
    confirmText: "Approve request",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      sr.status = "Approved";
      sr.approvedBy = USER;
      sr.approvedDate = now;
      sr.rejectReason = "";
      sr.updated = now;
      sr.updatedBy = USER;
      log(
        sr,
        "Approved",
        credit.withinLimit
          ? `อนุมัติภายในโดย ${USER} — เครดิตอยู่ในวงเงิน`
          : `อนุมัติภายในโดย ${USER} — เกินวงเงิน ${money0(credit.overBy)} บาท`,
      );
      commit(ctx, "อนุมัติคำขอขายแล้ว", `${sr.code} — พร้อมแปลงเป็นใบสั่งขาย`);
    },
  });
}

export function srReject(sr: SrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Reject this sales request?",
    message: `${sr.code} จะถูกปิดเป็น Rejected — บันทึกเหตุผลไว้ให้พนักงานขายติดตามกับลูกค้า`,
    confirmText: "Reject request",
    onConfirm: () => {
      sr.status = "Rejected";
      if (!sr.rejectReason) sr.rejectReason = "อื่น ๆ";
      sr.approvedBy = USER;
      sr.approvedDate = "";
      sr.updated = stamp();
      sr.updatedBy = USER;
      log(sr, "Rejected", `ไม่อนุมัติ: ${sr.rejectReason}`, "warn");
      commit(ctx, "ไม่อนุมัติคำขอขาย", `${sr.code} — ${sr.rejectReason}`, "danger");
    },
  });
}

/** Send an approved request back for edits. */
export function srReopen(sr: SrRow, ctx: ActionCtx) {
  sr.status = "Draft";
  sr.approvedBy = "";
  sr.approvedDate = "";
  sr.rejectReason = "";
  sr.updated = stamp();
  sr.updatedBy = USER;
  log(sr, "Reopened", "ส่งกลับเป็นร่างเพื่อแก้ไข", "info");
  commit(ctx, "ส่งกลับเป็นร่างแล้ว", `${sr.code} — แก้ไขได้อีกครั้ง`, "info");
}

/** Approved request → a real Sales Order carrying the same priced lines. */
export function srConvert(sr: SrRow, ctx: ActionCtx) {
  if (sr.status !== "Approved") {
    ctx.toast(
      "ต้องอนุมัติก่อน",
      `${sr.code} อยู่ในสถานะ ${sr.status} — อนุมัติคำขอขายก่อนจึงจะแปลงเป็นใบสั่งขายได้`,
      "warning",
    );
    return;
  }

  const credit = creditCheck(`${sr.customerCode} - ${sr.customer}`, sr.amount);

  ctx.confirm({
    title: "Convert to Sales Order?",
    message: (
      <>
        สร้างใบสั่งขายจาก <strong>{sr.code}</strong> — ระบบจะออกเลข SO ให้อัตโนมัติ
        <br />
        มูลค่า {money0(sr.amount)} บาท
        {!credit.withinLimit && (
          <>
            <br />
            <span className="font-semibold text-danger-text">
              เกินวงเงินเครดิต {money0(credit.overBy)} บาท — ใบสั่งขายจะถูกตั้งเป็น On Hold
            </span>
          </>
        )}
        <br />
        <span className="text-ink-2">
          สต๊อกจะถูกจองเมื่อยืนยันใบสั่งขาย ไม่ใช่ตอนนี้
        </span>
      </>
    ),
    confirmText: "Convert to SO",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const soCode = nextSOCode();

      SALES_ORDERS.unshift({
        code: soCode,
        customer: sr.customer,
        customerCode: sr.customerCode,
        salesRep: sr.salesRep,
        orderDate: now.split(" ")[0],
        deliveryDate: sr.requiredDate,
        warehouse: sr.warehouse,
        currency: sr.currency,
        fx: 1,
        payTerm: sr.payTerm,
        incoterm: "DAP",
        shipTo: "",
        status: credit.withinLimit ? "Confirmed" : "On Hold",
        priority: sr.priority,
        channel: sr.channel,
        srRef: sr.code,
        customerPo: sr.customerRef,
        remark: `สร้างจากใบเสนอราคา ${sr.code}`,
        creditApproved: credit.withinLimit,
        creditNote: credit.withinLimit
          ? "อยู่ในวงเงิน"
          : `เกินวงเงิน ${money0(credit.overBy)} บาท`,
        items: (sr.items ?? []).map((it) => ({
          code: it.code,
          name: it.name,
          unit: it.unit,
          qty: it.qty,
          price: it.price,
          disc: it.disc,
          tax: it.tax,
          picked: 0,
          delivered: 0,
          note: it.note,
        })),
        history: [
          {
            t: `Created from ${sr.code}`,
            d: "แปลงจากใบเสนอราคา",
            u: USER,
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER,
        updated: now,
        updatedBy: USER,
      } as unknown as SoRow);

      sr.status = "Converted";
      sr.soRef = soCode;
      sr.updated = now;
      sr.updatedBy = USER;
      log(sr, "Converted to Sales Order", `สร้าง ${soCode} จากใบเสนอราคานี้`);

      commit(
        ctx,
        "แปลงเป็นใบสั่งขายแล้ว",
        credit.withinLimit
          ? `${sr.code} → ${soCode}`
          : `${sr.code} → ${soCode} (On Hold — รออนุมัติเครดิต)`,
        credit.withinLimit ? "success" : "warning",
      );
      ctx.goto(`/m/sales-order/${encodeURIComponent(soCode)}`);
    },
  });
}

export function srCancel(sr: SrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this sales request?",
    message: `${sr.code} จะถูกยกเลิก`,
    confirmText: "Cancel request",
    onConfirm: () => {
      sr.status = "Cancelled";
      sr.updated = stamp();
      log(sr, "Cancelled", "ยกเลิกคำขอขาย", "warn");
      commit(ctx, "ยกเลิกคำขอขายแล้ว", sr.code, "info");
    },
  });
}

export function srDelete(sr: SrRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this sales request?",
    message: `${sr.code} จะถูกลบถาวร การกระทำนี้ย้อนกลับไม่ได้`,
    confirmText: "Delete request",
    onConfirm: () => {
      const i = SALES_REQUESTS.indexOf(sr);
      if (i > -1) SALES_REQUESTS.splice(i, 1);
      commit(ctx, "ลบคำขอขายแล้ว", sr.code, "danger");
    },
  });
}

/* ============================================================
   SALES ORDER
   ============================================================ */

export function soConfirm(so: SoRow, ctx: ActionCtx) {
  const credit = creditCheck(`${so.customerCode} - ${so.customer}`, so.total);

  if (!credit.withinLimit && !so.creditApproved) {
    ctx.confirm({
      title: "เกินวงเงินเครดิต",
      message: (
        <>
          {so.customer} มีวงเงินคงเหลือ <strong>{money0(credit.available)}</strong> บาท
          <br />
          ใบสั่งขายนี้มูลค่า {money0(so.total)} บาท — เกินไป{" "}
          <strong>{money0(credit.overBy)}</strong> บาท
          <br />
          ยืนยันเพื่อตั้งเป็น On Hold รอฝ่ายบัญชีอนุมัติ
        </>
      ),
      confirmText: "ตั้งเป็น On Hold",
      onConfirm: () => {
        so.status = "On Hold";
        so.creditApproved = false;
        so.creditNote = `เกินวงเงิน ${money0(credit.overBy)} บาท`;
        so.updated = stamp();
        log(so, "Put on credit hold", "ยอดรวมเกินวงเงินเครดิตคงเหลือ", "warn");
        commit(ctx, "ตั้งเป็น On Hold", `${so.code} — รออนุมัติเครดิต`, "warning");
      },
    });
    return;
  }

  so.status = "Confirmed";
  so.updated = stamp();
  so.updatedBy = USER;
  log(so, "Confirmed", "ยืนยันคำสั่งขาย พร้อมจัดของ");
  commit(ctx, "ยืนยันใบสั่งขายแล้ว", `${so.code} — พร้อมสร้างใบหยิบสินค้า`);
}

/** Sales admin overriding a credit hold. */
export function soApproveCredit(so: SoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Approve credit for this order?",
    message: (
      <>
        อนุมัติเครดิตให้ <strong>{so.customer}</strong> สำหรับ {so.code}
        <br />
        มูลค่า {money0(so.total)} บาท — ใบสั่งขายจะเปลี่ยนเป็น Confirmed
      </>
    ),
    confirmText: "Approve credit",
    tone: "primary",
    onConfirm: () => {
      so.creditApproved = true;
      so.creditNote = `อนุมัติพิเศษโดย ${USER}`;
      so.status = "Confirmed";
      so.updated = stamp();
      so.updatedBy = USER;
      log(so, "Credit approved", `อนุมัติเครดิตพิเศษโดย ${USER}`);
      commit(ctx, "อนุมัติเครดิตแล้ว", `${so.code} — พร้อมจัดของ`);
    },
  });
}

/** Confirmed order → a picking task the warehouse can act on. */
export function soCreatePick(so: SoRow, ctx: ActionCtx) {
  const existing = PICKING_TASKS.find(
    (t) => t.soRef === so.code && !["Completed", "Cancelled"].includes(t.status),
  );
  if (existing) {
    ctx.toast("มีใบหยิบสินค้าอยู่แล้ว", `${so.code} → ${existing.code}`, "warning");
    ctx.goto(`/m/picking/${encodeURIComponent(existing.code)}`);
    return;
  }

  ctx.confirm({
    title: "Create picking task?",
    message: `สร้างใบหยิบสินค้าจาก ${so.code} — ${so.itemCount} รายการ ${fmt(so.orderedQty)} หน่วย`,
    confirmText: "Create Picking",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextPickCode();

      PICKING_TASKS.unshift({
        code,
        soRef: so.code,
        customer: so.customer,
        customerCode: so.customerCode,
        warehouse: so.warehouse,
        assignedTo: "",
        priority: so.priority,
        status: "Waiting",
        pickDate: "",
        dueDate: so.deliveryDate,
        strategy: "FEFO (หมดอายุก่อน หยิบก่อน)",
        remark: `สร้างจากใบสั่งขาย ${so.code}`,
        items: (so.items ?? []).map((it, i) => ({
          line: i + 1,
          code: it.code,
          name: it.name,
          unit: it.unit,
          lot: "",
          ordered: Math.max(0, Number(it.qty) - Number(it.picked)),
          picked: 0,
          bin: "",
          status: "Pending",
          note: "",
        })),
        packRef: "",
        history: [
          {
            t: `Created from ${so.code}`,
            d: "สร้างใบหยิบสินค้าจากใบสั่งขาย",
            u: USER,
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER,
        updated: now,
        updatedBy: USER,
      } as unknown as PickRow);

      so.status = "Picking";
      so.updated = now;
      log(so, "Picking started", `สร้างใบหยิบสินค้า ${code}`, "info");

      commit(ctx, "สร้างใบหยิบสินค้าแล้ว", `${so.code} → ${code}`);
      ctx.goto(`/m/picking/${encodeURIComponent(code)}`);
    },
  });
}

export function soCancel(so: SoRow, ctx: ActionCtx) {
  const linked = soLinkedDocs(so.code);
  const openDocs = [
    ...linked.picks.filter((t) => t.status !== "Cancelled"),
    ...linked.packs.filter((t) => t.status !== "Cancelled"),
    ...linked.deliveries.filter((d) => d.status !== "Cancelled"),
  ];

  ctx.confirm({
    title: "Cancel this sales order?",
    message: (
      <>
        {so.code} จะถูกยกเลิก
        {openDocs.length > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              มีเอกสารปลายทางที่ยังเปิดอยู่ {openDocs.length} ใบ —
              ต้องยกเลิกเอกสารเหล่านั้นเองแยกต่างหาก
            </span>
          </>
        )}
      </>
    ),
    confirmText: "Cancel SO",
    onConfirm: () => {
      so.status = "Cancelled";
      so.updated = stamp();
      log(so, "Cancelled", "ยกเลิกใบสั่งขาย", "warn");
      commit(ctx, "ยกเลิกใบสั่งขายแล้ว", so.code, "info");
    },
  });
}

export function soDelete(so: SoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this sales order?",
    message: `${so.code} จะถูกลบถาวร`,
    confirmText: "Delete SO",
    onConfirm: () => {
      const i = SALES_ORDERS.indexOf(so);
      if (i > -1) SALES_ORDERS.splice(i, 1);
      commit(ctx, "ลบใบสั่งขายแล้ว", so.code, "danger");
    },
  });
}

/* ============================================================
   PICKING
   ============================================================ */

export function pickAssign(task: PickRow, staff: string, ctx: ActionCtx) {
  task.assignedTo = staff;
  task.status = "Assigned";
  task.updated = stamp();
  log(task, "Assigned", `มอบหมายให้ ${staff}`, "info");
  commit(ctx, "มอบหมายงานแล้ว", `${task.code} → ${staff}`);
}

export function pickStart(task: PickRow, ctx: ActionCtx) {
  task.status = "In Progress";
  task.pickDate = stamp().split(" ")[0];
  task.updated = stamp();
  log(task, "In progress", "เริ่มหยิบสินค้า", "info");
  commit(ctx, "เริ่มหยิบสินค้า", task.code, "info");
}

/**
 * Completing a pick writes the picked quantities back onto the sales order,
 * which is what lets the order show real progress rather than a guess.
 */
export function pickComplete(task: PickRow, ctx: ActionCtx) {
  const short = task.orderedQty - task.pickedQty;

  ctx.confirm({
    title: "Complete picking?",
    message: (
      <>
        หยิบได้ <strong>{fmt(task.pickedQty)}</strong> จาก {fmt(task.orderedQty)} หน่วย
        {short > 0 && (
          <>
            <br />
            <span className="font-semibold text-warning-text">
              ขาดอีก {fmt(short)} หน่วย — ใบสั่งขายจะยังไม่ปิด
            </span>
          </>
        )}
      </>
    ),
    confirmText: "Complete Picking",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      (task.items ?? []).forEach((it) => {
        it.status = Number(it.picked) >= Number(it.ordered) ? "Picked" : "Short";
      });
      task.status = "Completed";
      task.updated = now;
      log(
        task,
        "Completed",
        `หยิบ ${fmt(task.pickedQty)} หน่วย ส่งต่อฝ่ายแพ็ค`,
        short > 0 ? "warn" : "primary",
      );

      const so = getSO(task.soRef);
      if (so) {
        for (const line of so.items ?? []) {
          const picked = (task.items ?? [])
            .filter((it) => it.code === line.code)
            .reduce((s, it) => s + Number(it.picked), 0);
          line.picked = Math.min(Number(line.qty), Number(line.picked) + picked);
        }
        so.updated = now;
        log(so, "Picking completed", `${task.code} หยิบครบ ${fmt(task.pickedQty)} หน่วย`, "info");
      }

      commit(
        ctx,
        "ปิดงานหยิบสินค้าแล้ว",
        short > 0 ? `${task.code} — หยิบไม่ครบ ${fmt(short)} หน่วย` : `${task.code} — พร้อมแพ็ค`,
        short > 0 ? "warning" : "success",
      );
    },
  });
}

/** Completed pick → a packing task. */
export function pickCreatePack(task: PickRow, ctx: ActionCtx) {
  if (task.packRef) {
    ctx.toast("มีงานแพ็คอยู่แล้ว", `${task.code} → ${task.packRef}`, "warning");
    ctx.goto(`/m/packing/${encodeURIComponent(task.packRef)}`);
    return;
  }

  ctx.confirm({
    title: "Create packing task?",
    message: `สร้างงานแพ็คจาก ${task.code} — ${fmt(task.pickedQty)} หน่วย`,
    confirmText: "Create Packing",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextPackCode();

      PACKING_TASKS.unshift({
        code,
        pickRef: task.code,
        soRef: task.soRef,
        customer: task.customer,
        customerCode: task.customerCode,
        warehouse: task.warehouse,
        packer: "",
        status: "Waiting",
        packDate: "",
        dueDate: task.dueDate,
        priority: task.priority,
        handling: "ปกติ",
        remark: `สร้างจากใบหยิบสินค้า ${task.code}`,
        items: (task.items ?? [])
          .filter((it) => Number(it.picked) > 0)
          .map((it, i) => ({
            line: i + 1,
            code: it.code,
            name: it.name,
            unit: it.unit,
            qty: Number(it.picked),
            packedQty: 0,
            box: "",
            note: "",
          })),
        packages: [],
        doRef: "",
        history: [
          {
            t: `Created from ${task.code}`,
            d: "สร้างงานแพ็คจากใบหยิบสินค้า",
            u: USER,
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER,
        updated: now,
        updatedBy: USER,
      } as unknown as PackRow);

      task.packRef = code;
      task.updated = now;

      commit(ctx, "สร้างงานแพ็คแล้ว", `${task.code} → ${code}`);
      ctx.goto(`/m/packing/${encodeURIComponent(code)}`);
    },
  });
}

export function pickCancel(task: PickRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this picking task?",
    message: `${task.code} จะถูกยกเลิก`,
    confirmText: "Cancel Picking",
    onConfirm: () => {
      task.status = "Cancelled";
      task.updated = stamp();
      log(task, "Cancelled", "ยกเลิกงานหยิบสินค้า", "warn");
      commit(ctx, "ยกเลิกงานหยิบสินค้าแล้ว", task.code, "info");
    },
  });
}

/* ============================================================
   PACKING
   ============================================================ */

export function packStart(task: PackRow, ctx: ActionCtx) {
  task.status = "In Progress";
  task.packDate = stamp().split(" ")[0];
  task.updated = stamp();
  log(task, "In progress", "เริ่มแพ็คสินค้า", "info");
  commit(ctx, "เริ่มแพ็คสินค้า", task.code, "info");
}

export function packComplete(task: PackRow, ctx: ActionCtx) {
  if (!task.packages?.length) {
    ctx.toast("ยังไม่มีกล่อง", "เพิ่มกล่องอย่างน้อย 1 ใบก่อนปิดงานแพ็ค", "warning");
    return;
  }

  ctx.confirm({
    title: "Complete packing?",
    message: `แพ็ค ${fmt(task.packedQty)} หน่วย เป็น ${task.boxCount} กล่อง น้ำหนักรวม ${task.totalWeight} กก.`,
    confirmText: "Complete Packing",
    tone: "primary",
    onConfirm: () => {
      task.status = "Completed";
      task.updated = stamp();
      log(task, "Completed", `แพ็คครบ ${fmt(task.packedQty)} หน่วย เป็น ${task.boxCount} กล่อง`);
      commit(ctx, "ปิดงานแพ็คแล้ว", `${task.code} — พร้อมออกใบส่งของ`);
    },
  });
}

/** Completed pack → the delivery order that actually ships. */
export function packCreateDelivery(task: PackRow, ctx: ActionCtx) {
  if (task.doRef) {
    ctx.toast("มีใบส่งของอยู่แล้ว", `${task.code} → ${task.doRef}`, "warning");
    ctx.goto(`/m/delivery-order/${encodeURIComponent(task.doRef)}`);
    return;
  }

  ctx.confirm({
    title: "Create delivery order?",
    message: `ออกใบส่งของจาก ${task.code} — ${task.boxCount} กล่อง ${fmt(task.packedQty)} หน่วย`,
    confirmText: "Create Delivery Order",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      const code = nextDOCode();
      const so = getSO(task.soRef);

      DELIVERY_ORDERS.unshift({
        code,
        soRef: task.soRef,
        packRef: task.code,
        customer: task.customer,
        customerCode: task.customerCode,
        shipTo: so?.shipTo ?? "",
        contact: "",
        phone: "",
        warehouse: task.warehouse,
        carrier: "A-Factory Fleet",
        service: "Standard",
        driver: "",
        vehicle: "",
        trackingNo: "",
        deliveryDate: so?.deliveryDate ?? task.dueDate,
        deliveryTime: "09:00 - 11:00",
        status: "Draft",
        priority: task.priority,
        packages: task.boxCount,
        weight: task.totalWeight,
        codAmount: 0,
        receivedBy: "",
        receivedDate: "",
        failReason: "",
        remark: `สร้างจากงานแพ็ค ${task.code}`,
        items: (task.items ?? []).map((it, i) => ({
          line: i + 1,
          code: it.code,
          name: it.name,
          unit: it.unit,
          qty: Number(it.packedQty) || Number(it.qty),
          delivered: 0,
          box: it.box,
          note: "",
        })),
        history: [
          {
            t: `Created from ${task.code}`,
            d: "สร้างใบส่งของจากงานแพ็ค",
            u: USER,
            when: now,
            kind: "primary",
          },
        ],
        created: now,
        createdBy: USER,
        updated: now,
        updatedBy: USER,
      } as unknown as DoRow);

      task.doRef = code;
      task.updated = now;

      commit(ctx, "ออกใบส่งของแล้ว", `${task.code} → ${code}`);
      ctx.goto(`/m/delivery-order/${encodeURIComponent(code)}`);
    },
  });
}

export function packCancel(task: PackRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this packing task?",
    message: `${task.code} จะถูกยกเลิก`,
    confirmText: "Cancel Packing",
    onConfirm: () => {
      task.status = "Cancelled";
      task.updated = stamp();
      log(task, "Cancelled", "ยกเลิกงานแพ็ค", "warn");
      commit(ctx, "ยกเลิกงานแพ็คแล้ว", task.code, "info");
    },
  });
}

/* ============================================================
   DELIVERY ORDER
   ============================================================ */

export function doReady(d: DoRow, ctx: ActionCtx) {
  d.status = "Ready";
  d.updated = stamp();
  log(d, "Ready to ship", "จัดของขึ้นรถเรียบร้อย", "info");
  commit(ctx, "พร้อมส่ง", `${d.code} — รอออกจากคลัง`);
}

export function doShip(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Ship this delivery?",
    message: `${d.code} — ${d.packages} กล่อง น้ำหนัก ${d.weight} กก. โดย ${d.carrier}`,
    confirmText: "Ship now",
    tone: "primary",
    onConfirm: () => {
      d.status = "Shipped";
      d.updated = stamp();
      log(d, "Shipped", `ออกจากคลังโดย ${d.carrier}`, "info");
      commit(ctx, "ส่งของออกแล้ว", `${d.code} — อยู่ระหว่างจัดส่ง`);
    },
  });
}

/**
 * Confirming receipt is the moment the sale is fulfilled: quantities post
 * back to the sales order, which closes when nothing is outstanding.
 */
export function doConfirmDelivery(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Confirm delivery?",
    message: (
      <>
        ยืนยันว่าลูกค้ารับของแล้ว <strong>{fmt(d.totalQty)}</strong> หน่วย
        <br />
        จำนวนที่ส่งมอบจะถูกบันทึกกลับเข้าใบสั่งขาย {d.soRef}
      </>
    ),
    confirmText: "Confirm delivery",
    tone: "primary",
    onConfirm: () => {
      const now = stamp();
      (d.items ?? []).forEach((it) => {
        if (!Number(it.delivered)) it.delivered = Number(it.qty);
      });
      d.status = "Delivered";
      d.receivedDate = now;
      if (!d.receivedBy) d.receivedBy = d.contact || d.customer;
      d.updated = now;
      log(d, "Delivered", `ผู้รับ: ${d.receivedBy}`);

      const so = getSO(d.soRef);
      if (so) {
        for (const line of so.items ?? []) {
          const shipped = (d.items ?? [])
            .filter((it) => it.code === line.code)
            .reduce((s, it) => s + Number(it.delivered), 0);
          line.delivered = Math.min(Number(line.qty), Number(line.delivered) + shipped);
        }
        const outstanding = (so.items ?? []).reduce(
          (t, it) => t + Math.max(0, Number(it.qty) - Number(it.delivered)),
          0,
        );
        so.status = outstanding === 0 ? "Completed" : "Partially Delivered";
        so.updated = now;
        log(
          so,
          outstanding === 0 ? "Completed" : "Partially delivered",
          outstanding === 0
            ? "ส่งมอบครบถ้วน ปิดใบสั่งขาย"
            : `ส่งมอบบางส่วน คงเหลือ ${fmt(outstanding)} หน่วย`,
          outstanding === 0 ? "primary" : "info",
        );
      }

      commit(ctx, "ยืนยันการส่งมอบแล้ว", `${d.code} — บันทึกกลับเข้า ${d.soRef}`);
    },
  });
}

export function doFail(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Mark delivery as failed?",
    message: `${d.code} ส่งไม่สำเร็จ — บันทึกเหตุผลไว้ในประวัติเพื่อนัดส่งใหม่`,
    confirmText: "Mark as failed",
    onConfirm: () => {
      d.status = "Failed";
      if (!d.failReason) d.failReason = "ไม่มีผู้รับ";
      d.updated = stamp();
      log(d, "Delivery failed", `เหตุผล: ${d.failReason}`, "warn");
      commit(ctx, "บันทึกส่งไม่สำเร็จ", `${d.code} — ${d.failReason}`, "danger");
    },
  });
}

export function doCancel(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Cancel this delivery order?",
    message: `${d.code} จะถูกยกเลิก`,
    confirmText: "Cancel DO",
    onConfirm: () => {
      d.status = "Cancelled";
      d.updated = stamp();
      log(d, "Cancelled", "ยกเลิกใบส่งของ", "warn");
      commit(ctx, "ยกเลิกใบส่งของแล้ว", d.code, "info");
    },
  });
}

export function doDelete(d: DoRow, ctx: ActionCtx) {
  ctx.confirm({
    title: "Delete this delivery order?",
    message: `${d.code} จะถูกลบถาวร`,
    confirmText: "Delete DO",
    onConfirm: () => {
      const i = DELIVERY_ORDERS.indexOf(d);
      if (i > -1) DELIVERY_ORDERS.splice(i, 1);
      commit(ctx, "ลบใบส่งของแล้ว", d.code, "danger");
    },
  });
}

export { getPack, getPick };
