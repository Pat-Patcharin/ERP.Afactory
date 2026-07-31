import { SALES_REPRESENTATIVES as RAW, type SalesRep } from "@/data/sales-reps";
import { initials } from "@/lib/format";

export interface SalesRepRow extends SalesRep {
  name: string;
  fullName: string;
  avatar: string;
  icon: string;
  totalOutstanding: number;
}

export const SALES_REPRESENTATIVES = RAW as SalesRepRow[];

export function decorateSRs() {
  for (const r of SALES_REPRESENTATIVES) {
    r.name = `${r.first} ${r.last}`;
    r.fullName = `${r.title}${r.first} ${r.last}`;
    r.avatar = initials(`${r.first} ${r.last}`);
    r.icon = "👤";
    r.totalOutstanding = (r.customers ?? []).reduce(
      (s, c) => s + (Number(c.outstanding) || 0),
      0,
    );
  }
}

decorateSRs();

export const getSalesRep = (code: string) =>
  SALES_REPRESENTATIVES.find((r) => r.code === code) ?? null;

export function nextSRCode(): string {
  const n = SALES_REPRESENTATIVES.reduce(
    (m, r) => Math.max(m, parseInt(String(r.code).replace(/\D/g, ""), 10) || 0),
    0,
  );
  return `SALE${String(n + 1).padStart(3, "0")}`;
}
