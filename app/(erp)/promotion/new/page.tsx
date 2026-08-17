"use client";

import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { PROMOTION_KINDS, type PromotionKind } from "@/lib/domain/promotion";

/* ============================================================
   WHICH KIND OF PROMOTION

   The first question, asked before any field is. The four kinds
   ask for different data and calculate differently — see
   lib/domain/promotion.ts — so picking one is not a preference
   that can be changed later on the same form.

   Three of the four are shown and cannot be opened. That is the
   point of showing them: a chooser with one card teaches nothing,
   and a card that opens an empty page teaches the wrong thing.
   ============================================================ */

export default function PromotionKindPage() {
  return (
    <main className="px-6 py-8 max-md:px-4">
      <header className="mb-6">
        <h1 className="text-h2 font-semibold">โปรโมชั่นใหม่</h1>
        <p className="mt-1 text-ink-2">
          เลือกประเภทก่อน — แต่ละประเภทถามข้อมูลคนละชุด และคิดคนละแบบ
        </p>
      </header>

      <div
        data-testid="promotion-kinds"
        className="grid grid-cols-2 gap-4 max-md:grid-cols-1"
      >
        {PROMOTION_KINDS.map((kind) => (
          <KindCard key={kind.key} kind={kind} />
        ))}
      </div>
    </main>
  );
}

/** The card face. Identical whether the card can be opened or not. */
const FACE = "flex w-full flex-col items-start p-5 text-left";

function KindCard({ kind }: { kind: PromotionKind }) {
  const testId = `promotion-kind-${kind.key}`;

  /**
   * A kind that is not open is a DISABLED BUTTON, not a link that thinks
   * better of it.
   *
   * There is no href, so there is nothing to follow with a keyboard, nothing
   * to middle-click into a tab and nothing for a crawler to walk into. It
   * announces itself as unavailable rather than looking ordinary and failing
   * on contact — which is what a link to a "coming soon" page does.
   */
  if (kind.href === null) {
    return (
      <Card data-testid={testId} className="opacity-60">
        <button type="button" disabled className={cn(FACE, "cursor-not-allowed")}>
          <KindFace kind={kind} />
        </button>
      </Card>
    );
  }

  return (
    <Card
      data-testid={testId}
      className="transition-colors duration-fast hover:border-primary"
    >
      <Link href={kind.href} className={cn(FACE, "rounded-card")}>
        <KindFace kind={kind} />
      </Link>
    </Card>
  );
}

function KindFace({ kind }: { kind: PromotionKind }) {
  const closed = kind.href === null;

  return (
    <>
      <div className="flex w-full items-center gap-3">
        <span
          className={cn(
            "grid h-10 w-10 flex-shrink-0 place-items-center rounded-btn",
            /* Brand orange, not a document accent. A promotion is master
               data like Product and Business Partner — it is never printed
               and never sent, so it is not paper and takes no doc family. */
            closed ? "bg-neutral-soft text-ink-3" : "bg-primary-soft text-primary",
          )}
        >
          <Icon name={kind.icon} size={20} />
        </span>
        <span className="text-[15px] font-semibold">{kind.label}</span>
        {closed && (
          <Badge tone="neutral" className="ml-auto">
            ยังไม่เปิดใช้
          </Badge>
        )}
      </div>

      <p className={cn("mt-3", closed ? "text-ink-3" : "text-ink-2")}>{kind.desc}</p>
      <p className="mt-2 text-cap text-ink-3">
        ตัวอย่าง — <span>{kind.example}</span>
      </p>
    </>
  );
}
