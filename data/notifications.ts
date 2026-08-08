/**
 * The notification inbox — one record per thing that happened.
 *
 * Not to be confused with `NOTIFICATIONS` in data/admin.ts, which is the
 * SETTINGS table behind Administration → Notification Settings: which kinds of
 * event are switched on, and whether they also go out by email. That answers
 * "should we tell anyone". This file is what was actually told to whom.
 *
 * Mock dataset; mutating this array is how the prototype persists changes.
 */

export const NOTIFY_KINDS = [
  "approval_request",
  "approved",
  "rejected",
  "revision_requested",
  "converted",
  "escalated",
] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export interface NotifyItem {
  id: string;
  /**
   * The role this is addressed to, or "" when it is addressed to a person.
   *
   * A role-addressed item reaches everyone holding that role — "somebody with
   * this authority needs to look at this" — and is how approval requests
   * travel. Who those roles are is worked out from the permission matrix at
   * the moment of sending; see `notify.ts`.
   */
  toRole: string;
  /**
   * The person, by the name documents stamp on themselves.
   *
   * Names rather than user codes because that is what a document carries:
   * `createdBy` is `actingUserName()`, and an approval result has to find the
   * author of the paperwork. A seeded document whose author is not a user of
   * this system therefore reaches nobody, which is the honest outcome.
   */
  toUser?: string;
  kind: NotifyKind;
  docType: string;
  docCode: string;
  title: string;
  body: string;
  createdAt: string;
  /** Who caused it — used to keep people from being told their own news. */
  createdBy: string;
  readAt?: string;
  /** Where clicking it goes. */
  href: string;
}

/**
 * Seeded so the bell is not empty on a first look. Authored as if they came
 * from somebody else, because an item you caused is never shown back to you.
 */
export const NOTIFY_ITEMS: NotifyItem[] = [
  {
    id: "NF-000001",
    toRole: "SALES_ADMIN",
    kind: "approval_request",
    docType: "sales-request",
    docCode: "SR2506-0002",
    title: "คำขอขาย SR2506-0002 รออนุมัติ",
    body: "โรงพยาบาลสมานบุญ 1 — ยอดสูง ต้องตรวจเครดิตก่อนอนุมัติ",
    createdAt: "26/06/2026 16:30",
    createdBy: "Narin C.",
    href: "/m/sales-request/SR2506-0002",
  },
  {
    id: "NF-000002",
    toRole: "",
    toUser: "สุภาวิตา โยธะพันธ์",
    kind: "approved",
    docType: "quotation",
    docCode: "QT2507-0007",
    title: "QT2507-0007 อนุมัติแล้ว",
    body: "อนุมัติภายในโดย สมชาย ใจดี — ส่งให้ลูกค้าได้",
    createdAt: "01/07/2026 08:40",
    createdBy: "สมชาย ใจดี",
    href: "/m/quotation/QT2507-0007",
  },
];
