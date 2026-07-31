import {
  BP_ROLE_DEFS,
  BUSINESS_PARTNERS as RAW,
  type BpRoleDef,
  type BusinessPartner,
} from "@/data/partners";
import { DASH } from "@/lib/format";

export interface BpRow extends BusinessPartner {
  /** Generic aliases the shared engines read. */
  name: string;
  icon: string;
  roleList: BpRoleDef[];
  roleNames: string;
  contactName: string;
  phone: string;
  email: string;
  province: string;
  salesRep: string;
  payTerm: string;
  creditStatus: string;
  taxId: string;
  /** A partner with any transaction must never be hard-deleted. */
  txnCount: number;
}

export const BUSINESS_PARTNERS = RAW as BpRow[];

export const bpRoleList = (bp: BusinessPartner) =>
  BP_ROLE_DEFS.filter((r) => bp.roles?.[r.key as keyof typeof bp.roles]);

export const bpPrimaryContact = (bp: BusinessPartner) =>
  bp.contacts?.find((c) => c.primary) ?? bp.contacts?.[0] ?? null;

export const bpPrimaryAddress = (bp: BusinessPartner) =>
  bp.addresses?.find((a) => a.primary) ?? bp.addresses?.[0] ?? null;

export function decorateBPs() {
  for (const bp of BUSINESS_PARTNERS) {
    const c = bpPrimaryContact(bp);
    const a = bpPrimaryAddress(bp);

    bp.name = bp.nameTh || bp.nameEn;
    bp.icon = bp.logo;
    bp.roleList = bpRoleList(bp);
    bp.roleNames = bp.roleList.map((r) => r.label).join(", ") || DASH;
    bp.contactName = c ? `${c.prefix}${c.first} ${c.last}` : DASH;
    bp.phone = c ? c.mobile || c.phone || DASH : DASH;
    bp.email = c ? c.email : DASH;
    bp.province = a ? a.prov : DASH;
    bp.salesRep = bp.sales ? bp.sales.rep : DASH;
    bp.payTerm = bp.sales?.payTerm ?? bp.purchasing?.payTerm ?? DASH;
    bp.creditStatus = bp.credit ? bp.credit.status : "Not Applicable";
    bp.taxId = bp.tax ? bp.tax.taxId : "";
    bp.txnCount =
      (bp.txn?.so?.length ?? 0) + (bp.txn?.po?.length ?? 0) + (bp.txn?.inv?.length ?? 0);
  }
}

decorateBPs();

export const getBP = (code: string) =>
  BUSINESS_PARTNERS.find((b) => b.code === code) ?? null;

/** Next code in the BP000001 sequence — role is never encoded in the code. */
export function nextBPCode(): string {
  const n = BUSINESS_PARTNERS.reduce(
    (m, b) => Math.max(m, parseInt(b.code.replace(/\D/g, ""), 10) || 0),
    0,
  );
  return `BP${String(n + 1).padStart(6, "0")}`;
}

/* ---------- Validation ---------- */

/** Thai Tax ID: 13 digits where the last is a mod-11 check digit. */
export function validThaiTaxId(id: string): boolean {
  const s = String(id ?? "").replace(/\D/g, "");
  if (s.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(s[i], 10) * (13 - i);
  return ((11 - (sum % 11)) % 10) === parseInt(s[12], 10);
}

export const validEmail = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const validPhone = (v: string) => !v || /^[0-9()+\-\s]{6,20}$/.test(v);
export const validZip = (v: string) => !v || /^\d{5}$/.test(v);
