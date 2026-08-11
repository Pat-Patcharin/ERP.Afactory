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

  /* ------------------------------------------------------------
     WHERE THE GOODS GO, ASKED WHILE THE CUSTOMER IS STILL THERE

     A new customer used to be raised with a billing address and
     nothing else, so the first document that had to ship anything
     found no delivery address on the partner and the salesperson
     went back to ask — usually days later, usually by phone.

     The two are the same address often enough that asking twice
     would be its own annoyance, so `shipSameAsBill` is the
     default and the second block only appears when it is
     unticked. Ticked, the billing address is written as the
     shipping one too, which is what the partner master already
     expected: one address flagged both `billingPrimary` and
     `deliveryPrimary`.
     ------------------------------------------------------------ */
  /** Default. Untick to give the goods somewhere else to go. */
  shipSameAsBill?: boolean;
  shipAddressLine?: string;
  shipDistrict?: string;
  shipProvince?: string;
  shipPostcode?: string;
  shipContactName?: string;
  shipPhone?: string;
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
  /* Unticking "same as bill to" is a statement that the goods go somewhere
     else. Leaving it blank afterwards means neither address is right. */
  if (input.shipSameAsBill === false && !str(input.shipAddressLine))
    out.push("ระบุที่อยู่จัดส่ง หรือติ๊ก Same as Bill To");
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
  /* One address when the two are the same, two when they are not — see the
     note on `shipSameAsBill`. The billing one is always primary; it only
     stops being the shipping one when a separate delivery address exists. */
  const shipApart = input.shipSameAsBill === false && Boolean(str(input.shipAddressLine));

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
    /* Live from the moment it is typed. It was missing, and `shipToOptions`
       filters on it — so a customer the rep had just raised offered nothing
       in the Ship To picker on the very next document. */
    active: true,
    primary: true,
    billingPrimary: true,
    deliveryPrimary: !shipApart,
  };

  const shipAddress = {
    name: "ที่อยู่จัดส่ง",
    type: "Shipping",
    l1: str(input.shipAddressLine),
    l2: "",
    sub: "",
    dist: str(input.shipDistrict),
    prov: str(input.shipProvince),
    zip: str(input.shipPostcode),
    country: "ประเทศไทย",
    /* Falls back to the billing contact: a delivery address with nobody to
       ring is a driver standing outside a locked gate. */
    phone: str(input.shipPhone) || str(input.phone),
    contact: str(input.shipContactName) || str(input.contactName),
    maps: "",
    active: true,
    primary: false,
    billingPrimary: false,
    deliveryPrimary: true,
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
    addresses: shipApart ? [address, shipAddress] : [address],
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
