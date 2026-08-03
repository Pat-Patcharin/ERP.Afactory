import { canViewField, currentUser, getRole } from "@/lib/domain/admin";

/* ============================================================
   PERMISSION BRIDGE

   The four keys below were the whole permission system before
   the Administration module existed, and roughly a dozen schema
   files call `checkPermission("canViewCost")` today.

   Rather than rewrite those call sites, each legacy key is
   mapped onto a field permission the Administration framework
   owns. The schemas are unchanged; the ANSWER now comes from
   the acting user's role. Switch the session to a Sales Rep and
   every cost figure in the app disappears, without touching a
   single module.

   New code should call the framework directly — `canViewField`
   for a value, `can(module, action)` for a screen. This file
   exists so the old call sites keep working, not as the API to
   build on.
   ============================================================ */

/** Legacy key → the field permission that now decides it. */
const LEGACY_FIELD: Record<string, string> = {
  canViewCost: "cost",
  canViewCredit: "credit",
  canViewBank: "bank",
};

/**
 * Keys that are not field visibility but a capability. Manual code entry is
 * a Super Admin habit — everyone else takes the number series.
 */
const LEGACY_CAPABILITY: Record<string, (roleCode: string) => boolean> = {
  canSetBPCode: (roleCode) => Boolean(getRole(roleCode)?.all),
};

export type PermissionKey = keyof typeof LEGACY_FIELD | "canSetBPCode";

export function checkPermission(key: string): boolean {
  const field = LEGACY_FIELD[key];
  if (field) return canViewField(field);

  const capability = LEGACY_CAPABILITY[key];
  if (capability) return capability(currentUser().roleCode);

  /* An unknown key denies rather than grants — a typo must not open a door. */
  return false;
}

/** Mask all but the last four digits of an account number. */
export const maskAccount = (n: string): string =>
  checkPermission("canViewBank") ? n : n.replace(/\d(?=\d{4})/g, "•");

/**
 * The legacy shape, kept as a live view rather than a constant so anything
 * still reading it follows the session instead of a frozen snapshot.
 */
export const PERMISSIONS = {
  get canViewCost() {
    return checkPermission("canViewCost");
  },
  get canViewCredit() {
    return checkPermission("canViewCredit");
  },
  get canViewBank() {
    return checkPermission("canViewBank");
  },
  get canSetBPCode() {
    return checkPermission("canSetBPCode");
  },
};
