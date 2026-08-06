import { NOTIFY_ITEMS, type NotifyItem, type NotifyKind } from "@/data/notifications";
import type { Action } from "@/data/admin";
import { actingUserName, currentUser, getRoles, roleActions } from "./admin";
import { stamp } from "@/lib/format";

/* ============================================================
   NOTIFICATIONS — who is told, and who is not

   Three rules, and the second two are what make the bell worth
   looking at rather than something people switch off.

   1. WHO IS TOLD IS COMPUTED, NEVER LISTED.

      An approval request goes to whoever may approve that module,
      read from the permission matrix at the moment of sending. No
      role is named here. Adding a role that can approve sales
      requests means it starts receiving them, with no edit to this
      file — the same property the task box has.

   2. NOBODY IS TOLD THEIR OWN NEWS.

      An approver who approves does not need telling that it was
      approved. Enforced when the inbox is read rather than when
      the item is written, so the record of what happened stays
      complete: the item still exists, addressed to the role, and
      the OTHER people holding that role still see it.

   3. IT IS SENT FROM THE WORKFLOW, NOT FROM THE BUTTON.

      Same reason the permission guards sit on the mutation: there
      are several buttons per transition and exactly one function.
      A notification wired to a button is a notification that does
      not fire when the transition happens any other way.
   ============================================================ */

let seq = NOTIFY_ITEMS.length;

const nextId = () => `NF-${String(++seq).padStart(6, "0")}`;

/** Active roles whose permissions let them perform this action. */
export function rolesWhoMay(moduleKey: string, action: Action): string[] {
  return getRoles()
    .filter((r) => r.status === "Active" && roleActions(r.code, moduleKey).includes(action))
    .map((r) => r.code);
}

export interface NotifyInput {
  kind: NotifyKind;
  docType: string;
  docCode: string;
  title: string;
  body: string;
  /** Role codes to address. Usually the output of `rolesWhoMay`. */
  toRoles?: string[];
  /** A person, by the name their documents stamp. */
  toUser?: string;
}

/**
 * Record what happened. One item per addressee, so an inbox is a plain filter
 * rather than a set intersection — and so marking one as read cannot
 * accidentally mark it read for somebody else.
 */
export function notify(input: NotifyInput): NotifyItem[] {
  const now = stamp();
  const by = actingUserName();
  const href = `/m/${input.docType}/${encodeURIComponent(input.docCode)}`;

  const made: NotifyItem[] = [];
  const base = {
    kind: input.kind,
    docType: input.docType,
    docCode: input.docCode,
    title: input.title,
    body: input.body,
    createdAt: now,
    createdBy: by,
    href,
  };

  for (const role of input.toRoles ?? []) {
    made.push({ id: nextId(), toRole: role, ...base });
  }
  /* An item addressed to the person who caused it is never written at all —
     unlike the role case, there is no second reader it could be for. */
  if (input.toUser && input.toUser !== by) {
    made.push({ id: nextId(), toRole: "", toUser: input.toUser, ...base });
  }

  NOTIFY_ITEMS.unshift(...made);
  return made;
}

/* ---------- Reading ---------- */

/**
 * What the acting user is being told, newest first.
 *
 * Items this person caused are filtered out here rather than at the point of
 * sending — see rule 2 above.
 */
export function myNotifications(): NotifyItem[] {
  const me = currentUser();
  const myName = me.name;
  return NOTIFY_ITEMS.filter(
    (n) =>
      n.createdBy !== myName &&
      (n.toUser ? n.toUser === myName : n.toRole === me.roleCode),
  );
}

export const unreadNotifications = () => myNotifications().filter((n) => !n.readAt);

export const unreadCount = () => unreadNotifications().length;

export function markRead(id: string): boolean {
  const item = NOTIFY_ITEMS.find((n) => n.id === id);
  /* Only the recipient may mark it read, and only once — a second call must
     not move the timestamp of when it was actually seen. */
  if (!item || item.readAt) return false;
  if (!myNotifications().some((n) => n.id === item.id)) return false;
  item.readAt = stamp();
  return true;
}

export function markAllRead(): number {
  const mine = unreadNotifications();
  const now = stamp();
  for (const n of mine) n.readAt = now;
  return mine.length;
}

export { NOTIFY_ITEMS };
export type { NotifyItem, NotifyKind };
