/* ============================================================
   AMOUNT IN WORDS — Thai baht text.

   Required on a Thai tax document, and it is not a lookup table:
   the language has three rules a naive digit-by-digit render
   gets wrong.

     · the units digit is "เอ็ด", not "หนึ่ง", when it follows a
       ten — 21 is ยี่สิบเอ็ด
     · the tens digit 2 is "ยี่", not "สอง" — 20 is ยี่สิบ
     · the tens digit 1 is bare — 10 is สิบ, not หนึ่งสิบ

   Numbers group in millions, so 12,345,678 reads as
   สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปด.
   ============================================================ */

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Reads a group of at most six digits. */
function readGroup(n: number): string {
  if (n === 0) return "";
  const s = String(n);
  let out = "";

  for (let i = 0; i < s.length; i++) {
    const digit = Number(s[i]);
    const place = s.length - i - 1;
    if (digit === 0) continue;

    if (place === 0 && digit === 1 && s.length > 1) {
      out += "เอ็ด";
    } else if (place === 1 && digit === 1) {
      out += "สิบ";
    } else if (place === 1 && digit === 2) {
      out += "ยี่สิบ";
    } else {
      out += DIGITS[digit] + PLACES[place];
    }
  }
  return out;
}

/** Whole number to Thai text, grouping in millions. */
export function thaiNumberText(n: number): string {
  const whole = Math.floor(Math.abs(n));
  if (whole === 0) return DIGITS[0];

  /* Split into six-digit groups from the right; each group is followed by
     one more "ล้าน" than the group to its right. */
  const groups: number[] = [];
  let rest = whole;
  while (rest > 0) {
    groups.push(rest % 1_000_000);
    rest = Math.floor(rest / 1_000_000);
  }

  let out = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const text = readGroup(groups[i]);
    if (text) out += text + "ล้าน".repeat(i);
  }
  return out;
}

/**
 * Baht text as it must appear on a Thai tax invoice.
 *
 *   4280      → สี่พันสองร้อยแปดสิบบาทถ้วน
 *   34609.15  → สามหมื่นสี่พันหกร้อยเก้าบาทสิบห้าสตางค์
 *
 * Satang is rounded to two places first, and a carry from that rounding
 * moves into the baht — 0.999 is one baht, not zero baht ninety-nine.
 */
export function bahtText(amount: number): string {
  const negative = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(cents / 100);
  const satang = cents % 100;

  const sign = negative ? "ลบ" : "";
  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";

  const bahtPart = baht > 0 ? `${thaiNumberText(baht)}บาท` : "";
  const satangPart = satang > 0 ? `${thaiNumberText(satang)}สตางค์` : "ถ้วน";

  return `${sign}${bahtPart}${baht === 0 ? "" : ""}${satangPart}`;
}

/** English fallback, for a document printed in another currency. */
export function englishAmountText(amount: number, currency = "THB"): string {
  return `${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}
