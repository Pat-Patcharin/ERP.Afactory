import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUSINESS_PARTNERS as RAW_BP } from "@/data/partners";
import { BUSINESS_PARTNERS, decorateBPs } from "@/lib/domain/partner";
import { createDraftCustomer, validateDraftCustomer } from "@/lib/domain/draft-customer";
import { shipToOptions } from "@/lib/domain/outbound";
import { QuotationEditor } from "@/components/quotation/QuotationEditor";
import { resetCurrentUser, setCurrentUser } from "@/lib/domain/admin";

/* ============================================================
   A NEW CUSTOMER ARRIVES WITH BOTH ADDRESSES

   The rep raises one mid-quotation and carries on. It used to
   ask for a billing address and nothing else, so the first
   document that had to ship anything found no delivery address
   on the partner and somebody went back to ask days later.

   The two are the same often enough that asking twice would be
   its own annoyance, so the tick is on by default and the second
   block only appears when it is off.
   ============================================================ */

const SNAP = JSON.stringify(RAW_BP);
const REP = "EMP020";

beforeEach(() => {
  BUSINESS_PARTNERS.length = 0;
  BUSINESS_PARTNERS.push(...(JSON.parse(SNAP) as never[]));
  decorateBPs();
  setCurrentUser(REP);
});

afterEach(resetCurrentUser);

describe("ที่อยู่ของลูกค้าใหม่", () => {
  it("ติ๊ก Same as Bill To — ที่อยู่เดียว ใช้ทั้งออกบิลและจัดส่ง", () => {
    const res = createDraftCustomer({
      nameTh: "บริษัท ทดสอบ จำกัด",
      addressLine: "1 ถนนสุขุมวิท",
      district: "คลองเตย",
      province: "กรุงเทพมหานคร",
      postcode: "10110",
      shipSameAsBill: true,
    });

    const bp = BUSINESS_PARTNERS.find((b) => b.code === res.code)!;
    expect(bp.addresses).toHaveLength(1);
    /* One address flagged both, which is what the partner master already
       expected of a customer who bills and ships to the same place. */
    expect(bp.addresses[0].billingPrimary).toBe(true);
    expect(bp.addresses[0].deliveryPrimary).toBe(true);
    expect(shipToOptions(`${bp.code} - ${bp.nameTh}`).length).toBeGreaterThan(0);
  });

  it("ไม่ติ๊ก — เก็บสองที่อยู่ และที่อยู่จัดส่งเป็นตัวที่ใช้ส่งของ", () => {
    const res = createDraftCustomer({
      nameTh: "บริษัท สองที่อยู่ จำกัด",
      addressLine: "1 สำนักงานใหญ่",
      province: "กรุงเทพมหานคร",
      shipSameAsBill: false,
      shipAddressLine: "99 โรงงานบางพลี",
      shipProvince: "สมุทรปราการ",
      shipContactName: "คุณสมชาย",
      shipPhone: "081-000-0000",
    });

    const bp = BUSINESS_PARTNERS.find((b) => b.code === res.code)!;
    expect(bp.addresses).toHaveLength(2);

    const bill = bp.addresses.find((a) => a.billingPrimary)!;
    const ship = bp.addresses.find((a) => a.deliveryPrimary)!;
    expect(bill.l1).toContain("สำนักงานใหญ่");
    expect(ship.l1).toContain("โรงงานบางพลี");
    expect(ship.contact).toBe("คุณสมชาย");
    /* And the delivery address is the one a document offers for Ship To. */
    expect(shipToOptions(`${bp.code} - ${bp.nameTh}`).join(" ")).toContain("โรงงานบางพลี");
  });

  it("ผู้รับที่ปลายทางว่างไว้ได้ — ใช้ผู้ติดต่อหลักแทน", () => {
    /* A delivery address with nobody to ring is a driver standing outside a
       locked gate. */
    const res = createDraftCustomer({
      nameTh: "บริษัท ไม่ระบุผู้รับ จำกัด",
      contactName: "คุณเอ",
      phone: "02-111-1111",
      addressLine: "1 สำนักงาน",
      shipSameAsBill: false,
      shipAddressLine: "9 คลังสินค้า",
    });

    const bp = BUSINESS_PARTNERS.find((b) => b.code === res.code)!;
    const ship = bp.addresses.find((a) => a.deliveryPrimary)!;
    expect(ship.contact).toBe("คุณเอ");
    expect(ship.phone).toBe("02-111-1111");
  });

  it("ไม่ติ๊กแล้วปล่อยว่าง คือยังไม่ได้ตอบ", () => {
    const issues = validateDraftCustomer({
      nameTh: "บริษัท ว่าง จำกัด",
      shipSameAsBill: false,
    });
    expect(issues.join(" ")).toMatch(/ที่อยู่จัดส่ง/);
  });
});

describe("ป็อปอัพลูกค้าใหม่", () => {
  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    render(<QuotationEditor />);
    await user.click(screen.getByRole("button", { name: /ลูกค้าใหม่/ }));
    return within(screen.getByRole("dialog", { name: "ลูกค้าใหม่" }));
  }

  it("ถามทั้งที่อยู่ออกบิลและที่อยู่จัดส่งในหน้าต่างเดียว", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(dialog.getByText("Bill To")).toBeInTheDocument();
    expect(dialog.getByText("Ship To")).toBeInTheDocument();
    expect(
      dialog.getByLabelText("ที่อยู่จัดส่งเหมือนที่อยู่ออกบิล"),
    ).toBeInTheDocument();
  });

  it("ติ๊กอยู่เป็นค่าเริ่มต้น ช่องที่อยู่จัดส่งจึงยังไม่โผล่", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(dialog.queryByLabelText("ที่อยู่จัดส่ง")).not.toBeInTheDocument();
    expect(dialog.getByText("ส่งของตามที่อยู่ออกบิลด้านบน")).toBeInTheDocument();
  });

  it("เอาติ๊กออกแล้วช่องที่อยู่จัดส่งโผล่มาให้กรอก", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(dialog.getByLabelText("ที่อยู่จัดส่งเหมือนที่อยู่ออกบิล"));
    expect(dialog.getByLabelText("ที่อยู่จัดส่ง")).toBeInTheDocument();
    expect(dialog.getByLabelText("ผู้รับของ")).toBeInTheDocument();
    expect(dialog.getByLabelText("เบอร์โทรผู้รับ")).toBeInTheDocument();
  });
});
