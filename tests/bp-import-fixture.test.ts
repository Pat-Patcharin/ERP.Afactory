import { describe, expect, it } from "vitest";
import {
  BP_MASTER_SAMPLE_HEADERS,
  BP_MASTER_SAMPLE_RECORDS,
  BP_MASTER_SAMPLE_ROWS,
  BP_MASTER_SAMPLE_TSV,
} from "./fixtures/bp-master-sample.fixture";

/* ============================================================
   BP MASTER import fixture.

   This is the test bed the Import Framework will be built against,
   so the test's job is the opposite of the usual one: it asserts
   that the DEFECTS are still there. A fixture that quietly gets
   cleaned up stops proving anything — every case below is a real
   shape customer spreadsheets arrive in, and each one is something
   the importer has to detect rather than choke on.

   Rows are numbered as Excel numbers them: row 1 is the header,
   so data row n is BP_MASTER_SAMPLE_ROWS[n - 2].
   ============================================================ */

const rec = (excelRow: number) => BP_MASTER_SAMPLE_RECORDS[excelRow - 2];

/** Bangkok districts that appear in the Province column. */
const BKK_DISTRICTS = new Set([
  "มีนบุรี",
  "หนองบอน",
  "บางเขน",
  "สะพานสูง",
  "สวนหลวง",
  "จตุจักร",
  "ห้วยขวาง",
  "ภาษีเจริญ",
  "ราษฎร์บูรณะ",
  "ลาดพร้าว",
  "ประเวศ",
  "บางแค",
  "หลักสี่",
  "วัฒนา",
]);

describe("BP import fixture — shape", () => {
  it("carries 30 rows across 32 columns", () => {
    expect(BP_MASTER_SAMPLE_HEADERS).toHaveLength(32);
    expect(BP_MASTER_SAMPLE_ROWS).toHaveLength(30);
    for (const row of BP_MASTER_SAMPLE_ROWS) {
      expect(row).toHaveLength(BP_MASTER_SAMPLE_HEADERS.length);
    }
  });

  it("uses the customer's own column names, not ERP field names", () => {
    /* The whole point of the framework: these headers are what the customer
       types, and none of them is required to change. */
    for (const h of [
      "BP Code",
      "Legacy Customer ID",
      "BP Name",
      "BP Role",
      "Mobile 1",
      "Phone 1",
      "Tax ID",
      "Billing Address",
      "Sales Rep Code",
      "Postal Code",
    ]) {
      expect(BP_MASTER_SAMPLE_HEADERS).toContain(h);
    }
  });

  it("keeps Thai text intact — no mojibake survived the round trip", () => {
    const flat = BP_MASTER_SAMPLE_ROWS.flat().join("");
    /* The signature of UTF-8 read as Latin-1. Unrepairable once it happens,
       so it is asserted here as well as guarded in the generator. */
    expect(flat).not.toMatch(/à¸|à¹|Ã.|â€/);
    expect(rec(2)["BP Name"]).toContain("คลินิก");
  });

  it("exposes the sheet as TSV, the way a clipboard paste arrives", () => {
    const lines = BP_MASTER_SAMPLE_TSV.split("\n");
    expect(lines).toHaveLength(31);
    expect(lines[0].split("\t")).toHaveLength(32);
  });
});

describe("BP import fixture — identifiers", () => {
  it("gives every row a unique BP Code and legacy ID", () => {
    const codes = BP_MASTER_SAMPLE_RECORDS.map((r) => r["BP Code"]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes[0]).toBe("BP010001");
    expect(codes.at(-1)).toBe("BP010030");

    const legacy = BP_MASTER_SAMPLE_RECORDS.map((r) => r["Legacy Customer ID"]);
    expect(new Set(legacy).size).toBe(legacy.length);
  });

  it("keeps the leading zero on the one Tax ID present", () => {
    /* A 13-digit Thai tax ID starting with 0. Read as a number it becomes
       115561008152 and is silently wrong — the reason the generator forces
       raw:false. Everything else has no tax ID at all, which is a warning,
       not an error. */
    const withTax = BP_MASTER_SAMPLE_RECORDS.filter((r) => r["Tax ID"].trim());
    expect(withTax).toHaveLength(1);
    expect(withTax[0]["Tax ID"]).toBe("0115561008152");
    expect(withTax[0]["Tax ID"]).toHaveLength(13);
  });

  it("keeps postal codes as text, leading zeros and all", () => {
    for (const r of BP_MASTER_SAMPLE_RECORDS) {
      expect(r["Postal Code"]).toMatch(/^\d{5}$/);
    }
  });
});

describe("BP import fixture — defects the importer must catch", () => {
  it("puts a Bangkok district in the Province column on most rows", () => {
    /* Province is a district name, and District repeats it. An importer that
       trusts Province would create 14 provinces that do not exist. */
    const wrong = BP_MASTER_SAMPLE_RECORDS.filter((r) => BKK_DISTRICTS.has(r.Province));
    expect(wrong.length).toBeGreaterThanOrEqual(24);
    expect(rec(3).District).toBe("มีนบุรี");
    expect(rec(3).Province).toBe("มีนบุรี");
  });

  it("still has genuine provinces on the up-country rows", () => {
    expect(rec(2).Province).toBe("พิจิตร");
    expect(rec(4).Province).toBe("ชลบุรี");
    expect(rec(12).Province).toBe("สมุทรปราการ");
  });

  it("repeats one legal entity under two BP Codes", () => {
    /* Same name, both flagged head office, different address and phone.
       Duplicate detection by BP Code passes; by Company Name it does not. */
    expect(rec(14)["BP Name"]).toBe(rec(15)["BP Name"]);
    expect(rec(14)["BP Name"]).toContain("(สำนักงานใหญ่)");
    expect(rec(14)["BP Code"]).not.toBe(rec(15)["BP Code"]);
  });

  it("packs two phone numbers into a single cell", () => {
    expect(rec(7)["Mobile 2"]).toBe("0972366677 0830765688");
    expect(rec(25)["Phone 1"]).toBe("024555212 024132824");
    for (const raw of [rec(7)["Mobile 2"], rec(25)["Phone 1"]]) {
      expect(raw.trim().split(/\s+/)).toHaveLength(2);
    }
  });

  it("misspells a province inside a free-text address", () => {
    /* The Province column says สมุทรปราการ; the delivery address says
       สมุทราปราการ. Address text is never a reliable source. */
    expect(rec(14)["Delivery Address 1"]).toContain("สมุทราปราการ");
    expect(rec(14).Province).toBe("สมุทรปราการ");
  });

  it("runs the postal code straight onto the province with no space", () => {
    const glued = BP_MASTER_SAMPLE_RECORDS.filter((r) =>
      /กรุงเทพมหานคร\d{5}/.test(r["Billing Address"]),
    );
    expect(glued.length).toBeGreaterThanOrEqual(10);
  });

  it("leaves cells holding nothing but a space", () => {
    /* Not empty, not a value. A trim-less importer stores " ". */
    expect(rec(11)["Delivery Address 4"]).toBe(" ");
    expect(rec(18)["Phone 1"]).toBe(" ");
  });

  it("leaves trailing spaces on names that must be trimmed before matching", () => {
    expect(rec(22)["Mobile 1"]).toBe("0837004447 ");
    expect(rec(31)["BP Name"].endsWith(" ")).toBe(true);
    expect(rec(17)["Contact Person 1"].endsWith(" ")).toBe(true);
  });

  it("uses a placeholder dash where a sales rep code belongs", () => {
    expect(rec(2)["Sales Rep Code"]).toBe("-");
  });

  it("mixes a named sales rep with coded ones", () => {
    /* "Center" is not a SaleNNN code — it needs the synonym dictionary,
       not a lookup failure. */
    const reps = BP_MASTER_SAMPLE_RECORDS.map((r) => r["Sales Rep Code"]);
    expect(reps.filter((r) => r === "Center")).toHaveLength(4);
    expect(reps.filter((r) => /^Sale\d{3}$/.test(r)).length).toBeGreaterThan(20);
  });

  it("has one row carrying almost nothing but its identity", () => {
    /* Required fields present, everything optional blank — must import as a
       warning, never as an error. */
    const r = rec(4);
    expect(r["BP Code"]).toBe("BP010003");
    expect(r["BP Name"]).not.toHaveLength(0);
    for (const f of ["Contact Person 1", "Mobile 1", "Phone 1", "Billing Address"]) {
      expect(r[f as keyof typeof r]).toBe("");
    }
  });

  it("leaves whole columns empty across every row", () => {
    const empty = BP_MASTER_SAMPLE_HEADERS.filter((h) =>
      BP_MASTER_SAMPLE_RECORDS.every((r) => r[h].trim() === ""),
    );
    /* Nothing in the sheet fills these — the importer should offer to ignore
       them rather than report 30 missing values each. */
    for (const h of [
      "Contact Person 3",
      "Phone 2",
      "Mobile 3",
      "Phone 3",
      "Email",
      "Delivery Address 3",
      "Customer Size",
      "Credit Term",
      "Payment Method",
      "Remark",
    ]) {
      expect(empty, `${h} is empty throughout`).toContain(h);
    }
  });
});

describe("BP import fixture — values the importer can rely on", () => {
  it("dates every row in ISO form", () => {
    for (const r of BP_MASTER_SAMPLE_RECORDS) {
      expect(r["Start Date"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("marks every row Active and every role Customer", () => {
    for (const r of BP_MASTER_SAMPLE_RECORDS) {
      expect(r.Status).toBe("Active");
      expect(r["BP Role"]).toBe("Customer");
    }
  });

  it("holds a reachable phone number on all but two rows", () => {
    const reachable = BP_MASTER_SAMPLE_RECORDS.filter((r) =>
      [r["Mobile 1"], r["Phone 1"], r["Mobile 2"]].some((v) => /\d{9}/.test(v)),
    );
    expect(reachable).toHaveLength(29);
  });
});
