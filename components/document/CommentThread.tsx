"use client";

import { useMemo, useState } from "react";
import { actingUserName, getUsers } from "@/lib/domain/admin";
import { stamp } from "@/lib/format";
import { DocLabel } from "@/components/document/parts";
import { Badge, Button, CellInput } from "@/components/ui";

/* ============================================================
   THE CONVERSATION UNDER A DOCUMENT

   A question about line 2 belongs beside line 2, asked of the
   person who typed it. Without this it is asked on the phone, and
   the answer — "he said take the 50 off" — exists nowhere the
   next person to open the document can read it.

   ONE THREAD, THREE DOCUMENTS. The quotation, the sales request
   and the purchase request all needed it, so it is a component
   rather than three copies that would drift apart the first time
   one of them gained a feature.

   MOCK. The thread is component state and a reload empties it.
   That is deliberate and it is said on the page, not only here: a
   thread that looks real and forgets what you wrote is worse than
   no thread at all. When it is built, this file is the shape to
   build behind — the props already say who may be tagged.
   ============================================================ */

interface Comment {
  id: number;
  author: string;
  at: string;
  text: string;
  mentions: string[];
}

export interface CommentThreadProps {
  /** The document this hangs under — used in the placeholder text. */
  docCode: string;
  /**
   * Who the document has touched: its author, its approvers, whoever last
   * changed it. A mention list of the whole staff directory is a list nobody
   * reads, so the caller says who is actually involved.
   */
  people: string[];
  /**
   * Departments whose desks this document crosses, added to the list above.
   * The people involved so far are not always the people who need asking.
   */
  departments?: string[];
}

export function CommentThread({ docCode, people, departments = [] }: CommentThreadProps) {
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [seq, setSeq] = useState(0);

  const taggable = useMemo(() => {
    const named = new Set(people.filter(Boolean));
    return getUsers()
      .filter((u) => u.status === "Active")
      .filter((u) => named.has(u.name) || departments.includes(u.department))
      .map((u) => u.name);
  }, [people, departments]);

  const mentioned = taggable.filter((name) => text.includes(`@${name}`));

  const post = () => {
    const body = text.trim();
    if (!body) return;
    setItems((prev) => [
      ...prev,
      { id: seq, author: actingUserName(), at: stamp(), text: body, mentions: mentioned },
    ]);
    setSeq((n) => n + 1);
    setText("");
  };

  return (
    <section
      data-testid="doc-comments"
      className="mx-auto mt-4 max-w-[1100px] rounded-card border border-line bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <DocLabel en="Comments" th="พูดคุยเกี่ยวกับเอกสารนี้" />
        <Badge tone="neutral">Mock — ยังไม่ได้เก็บข้อมูล</Badge>
      </div>

      <ol className="mt-3 flex flex-col gap-3">
        {items.length === 0 && (
          <li className="text-cap text-ink-3">
            ยังไม่มีความเห็น — พิมพ์ด้านล่าง แท็กคนที่เกี่ยวข้องด้วย @ชื่อ
          </li>
        )}
        {items.map((c) => (
          <li key={c.id} className="flex gap-3">
            <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary-soft text-cap font-bold text-primary">
              {c.author.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-semibold">{c.author}</span>
                <span className="text-cap text-ink-3">{c.at}</span>
              </div>
              <p className="whitespace-pre-wrap text-[13px]">{c.text}</p>
              {c.mentions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.mentions.map((m) => (
                    <Badge key={m} tone="info">
                      @{m}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-cap text-ink-3">แท็ก:</span>
          {taggable.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${name} `)}
              className="rounded-pill border border-line px-2 py-0.5 text-cap text-ink-2 hover:border-primary hover:text-primary"
            >
              @{name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <CellInput
            aria-label="เขียนความเห็น"
            value={text}
            placeholder={`ตอบกลับเกี่ยวกับ ${docCode} — แท็กด้วย @ชื่อ`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                post();
              }
            }}
            className="h-10 flex-1"
          />
          <Button variant="primary" onClick={post}>
            ส่ง
          </Button>
        </div>
      </div>
    </section>
  );
}
