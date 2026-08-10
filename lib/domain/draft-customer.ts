import type { BusinessPartner } from "@/data/partners";
import { BUSINESS_PARTNERS, decorateBPs, nextBPCode, type BpRow } from "./partner";
import { actingUserName } from "./admin";
import { notify, rolesWhoMay } from "./notify";
import { stamp } from "@/lib/format";

/* ============================================================
   A CUSTOMER THE SALESPERSON RAISED

   The rep is in front of somebody who wants a quotation and is
   not in the system. Sending them away to have a partner record
   created first is how quotations get written against "ลูกค้าใหม่
   (รอเปิดรหัส)" and reconciled by hand a week later.

   So they type the handful of things a quotation actually needs
   and carry on. What they have NOT done is add a customer to the
   master file: the record lands as a DRAFT, which quotes fine and
   cannot open a sales order, and the sales admin's desk gets the
   job of checking the name and the tax ID.

   Only a customer. A rep raising a supplier would be raising a
   party the company pays, which is nothing to do with the sale in
   front of them — `roles.supplier` is false and there is no field
   on the form that could make it true.
   ============================================================ */

const str = (v: unknown) => String(v ?? "").trim();

/** What a quotation needs to be written and later billed. Nothing else. */
export interface DraftCustomerInput {
  /** Legal name — what the tax invoice will carry. */
  nameTh: string;
  /** Trading name, when the shop sign says something else. */
  trade?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  /** Billing address, as one line plus the parts a document needs. */
  addressLine?: string;
  district?: string;
  province?: string;
  postcode?: string;
  contactName?: string;
}

export interface DraftCustomerResult {
  code: string;
  name: string;
}

/** Enough to raise one. The rest is the sales admin's to fill in. */
export function validateDraftCustomer(input: DraftCustomerInput): string[] {
  const out: string[] = [];
  if (!str(input.nameTh)) out.push("ระบุชื่อลูกค้า");
  /* A tax ID that is present must be the right shape; an absent one is a
     question for the sales admin rather than a reason to refuse the sale. */
  const tax = str(input.taxId);
  if (tax && !/^\d{13}$/.test(tax.replace(/\D/g, "")))
    out.push("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
  return out;
}

/**
 * Create the draft, and tell whoever may confirm it.
 *
 * The notification is addressed to the ROLE that holds `approve` on the
 * partner master, read at the moment of sending — nobody is named here, so a
 * deployment that moves that authority moves the message with it.
 */
export function createDraftCustomer(
  input: DraftCustomerInput,
  { user = actingUserName() }: { user?: string } = {},
): DraftCustomerResult {
  const now = stamp();
  const code = nextBPCode();
  const name = str(input.nameTh);
  const address = {
    name: "ที่อยู่ออกบิล",
    type: "Billing",
    l1: str(input.addressLine),
    l2: "",
    sub: "",
    dist: str(input.district),
    prov: str(input.province),
    zip: str(input.postcode),
    country: "ประเทศไทย",
    phone: str(input.phone),
    contact: str(input.contactName),
    maps: "",
    primary: true,
    billingPrimary: true,
    shippingPrimary: true,
  };

  const fresh = {
    code,
    nameTh: name,
    nameEn: "",
    trade: str(input.trade) || name,
    type: "นิติบุคคล",
    logo: "",
    website: "",
    /* DRAFT is the whole point: quotable today, not orderable until somebody
       has checked it. See blockedForDraftPartner. */
    status: "Draft",
    notes: `เปิดโดย ${user} ระหว่างทำใบเสนอราคา — รอฝ่ายขายยืนยัน`,
    since: now.split(" ")[0],
    billType: str(input.taxId) ? "VAT" : "Non VAT",
    creditTerm: "No Credit",
    /* Customer only. A rep raising a supplier would be raising a party the
       company pays, which is nothing to do with the sale in front of them. */
    roles: { customer: true, supplier: false, dealer: false, prospect: false, other: false },
    cls: {},
    tax: {
      entity: "นิติบุคคล",
      taxId: str(input.taxId),
      branchType: "สำนักงานใหญ่",
      branchNo: "00000",
      regName: name,
      vatReg: Boolean(str(input.taxId)),
      vatDate: "",
      wht: false,
      regNo: "",
      country: "ประเทศไทย",
    },
    contacts: str(input.contactName)
      ? [
          {
            code: "CT001",
            prefix: "",
            first: str(input.contactName),
            last: "",
            pos: "",
            dept: "",
            phone: str(input.phone),
            mobile: str(input.phone),
            email: str(input.email),
            line: "",
            method: "Phone",
            primary: true,
          },
        ]
      : [],
    addresses: [address],
    sales: {},
    purchasing: null,
    banks: [],
    customer: {},
    supplier: null,
    supplierItems: [],
    docs: [],
    images: [],
    txn: { so: [], po: [], inv: [] },
    credit: {
      payTerm: "เงินสด",
      limit: 0,
      days: 0,
      outstanding: 0,
      openSO: 0,
      openInv: 0,
      available: 0,
      /* No limit until somebody grants one — a draft partner has no credit
         history to grant it against. */
      status: "Normal",
      holdReason: "",
      holdDate: "",
      approvedBy: "",
      approvalDate: "",
    },
    created: now,
    createdBy: user,
    updated: now,
    updatedBy: user,
    history: [
      {
        t: "Customer requested",
        d: `${user} เปิดลูกค้าใหม่ระหว่างทำใบเสนอราคา — รอยืนยัน`,
        u: user,
        when: now,
        kind: "warn",
      },
    ],
  } as unknown as BusinessPartner;

  BUSINESS_PARTNERS.push(fresh as BpRow);
  decorateBPs();

  notify({
    kind: "approval_request",
    docType: "business-partner",
    docCode: code,
    title: `ลูกค้าใหม่ ${name} รอยืนยัน`,
    body: `${user} เปิดไว้ระหว่างทำใบเสนอราคา — ยืนยันแล้วจึงเปิดใบสั่งขายให้ลูกค้ารายนี้ได้`,
    toRoles: rolesWhoMay("business-partner", "approve"),
  });

  return { code, name };
}

/** Customers waiting for somebody to check them — the sales admin's queue. */
export const draftCustomers = () =>
  BUSINESS_PARTNERS.filter((b) => b.status === "Draft" && b.roles?.customer);
