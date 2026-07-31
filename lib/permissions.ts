/**
 * Mock permission state. Flip a flag to false and every screen that reads it
 * hides or masks the value — cost figures, credit limits, bank accounts.
 * Wire this to the real session once auth lands.
 */
export const PERMISSIONS = {
  /** Product cost figures (last purchase price, moving average). */
  canViewCost: true,
  /** Business Partner credit limits and balances. */
  canViewCredit: true,
  /** Unmasked bank account numbers. */
  canViewBank: true,
  /** Manual Business Partner code entry. */
  canSetBPCode: false,
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function checkPermission(key: string): boolean {
  return PERMISSIONS[key as PermissionKey] === true;
}

/** Mask all but the last four digits of an account number. */
export const maskAccount = (n: string): string =>
  checkPermission("canViewBank") ? n : n.replace(/\d(?=\d{4})/g, "•");
