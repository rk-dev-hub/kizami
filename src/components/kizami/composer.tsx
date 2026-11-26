"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, CornerDownLeft, Loader2 } from "lucide-react";
import { kizamiAskAction, kizamiDraftAction } from "@/features/kizami/actions";
import type { AnswerResponse, DraftResponse } from "@/features/kizami/tasks";
import { draftHref } from "@/features/kizami/draft-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { KizamiMark } from "./mark";

type Mode = "draft" | "ask";

const PLACEHOLDER: Record<Mode, string> = {
  draft: "例: 昨日の退勤を押し忘れた。19時に帰りました",
  ask: "例: 有給はあと何日残っていますか?",
};

const CLOCK_LABEL = {
  CLOCK_IN: "出勤",
  CLOCK_OUT: "退勤",
  BREAK_START: "休憩開始",
  BREAK_END: "休憩終了",
} as const;
const OP_LABEL = { ADD: "追加", UPDATE: "変更", DELETE: "削除" } as const;
const LEAVE_LABEL = {
  PAID: "有給休暇",
  ABSENCE: "欠勤",
  SPECIAL_UNPAID: "特別休暇",
} as const;
const PART_LABEL = { FULL: "全日", AM: "午前休", PM: "午後休" } as const;

/** Kizami に話しかける欄。申請の下書きか、自分の勤怠への質問。 */
export function KizamiComposer({
  defaultMode = "draft",
  modes = ["draft", "ask"],
}: {
  defaultMode?: Mode;
  modes?: Mode[];
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [text, setText] = useState("");
  const [prevQuestion, setPrevQuestion] = useState<string | undefined>();
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [pending, start] = useTransition();

  function send(input: string, previousQuestion?: string) {
    const t = input.trim();
    if (!t) return;
    start(async () => {
      if (mode === "draft") {
        setAnswer(null);
        const r = await kizamiDraftAction(t, previousQuestion);
        setDraft(r);
        setPrevQuestion(
          r.ok && r.draft.kind === "CLARIFY" ? r.draft.question : undefined,
        );
      } else {
        setDraft(null);
        setAnswer(await kizamiAskAction(t));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {modes.length > 1 ? (
        <div
          role="radiogroup"
          aria-label="Kizami に頼むこと"
          className="flex gap-1.5"
        >
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                setMode(m);
                setDraft(null);
                setAnswer(null);
                setPrevQuestion(undefined);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                mode === m
                  ? "border-kizami-border bg-kizami text-kizami-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "draft" ? "申請を下書き" : "質問する"}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text, prevQuestion);
        }}
      >
        <label className="sr-only" htmlFor="kizami-input">
          Kizami への入力
        </label>
        <textarea
          id="kizami-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send(text, prevQuestion);
            }
          }}
          rows={1}
          maxLength={mode === "draft" ? 400 : 300}
          placeholder={prevQuestion ? "答えを入力…" : PLACEHOLDER[mode]}
          className="border-input bg-surface placeholder:text-muted-foreground/80 focus-visible:border-ring field-sizing-content min-h-10 flex-1 resize-none rounded-lg border px-3 py-2 text-sm"
        />
        <Button
          type="submit"
          variant="kizami"
          size="icon"
          disabled={pending || !text.trim()}
          aria-label="送る"
        >
          {pending ? <Loader2 className="animate-spin" /> : <CornerDownLeft />}
        </Button>
      </form>

      <div aria-live="polite">
        {draft ? (
          <DraftResult r={draft} onChoice={(c) => send(c, prevQuestion)} />
        ) : null}
        {answer ? <AnswerResult r={answer} /> : null}
      </div>
    </div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-kizami-border bg-kizami text-kizami-foreground animate-slide-in flex gap-2.5 rounded-lg border p-3 text-sm">
      <KizamiMark className="mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DraftResult({
  r,
  onChoice,
}: {
  r: DraftResponse;
  onChoice: (c: string) => void;
}) {
  if (!r.ok) return <Bubble>{r.message}</Bubble>;
  const d = r.draft;
  if (d.kind === "CLARIFY") {
    return (
      <Bubble>
        <p>{d.question}</p>
        {d.choices.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.choices.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChoice(c)}
                className="bg-surface hover:bg-surface-2 text-foreground rounded-md border px-2.5 py-1 text-xs"
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </Bubble>
    );
  }
  if (d.kind === "UNSUPPORTED") return <Bubble>{d.message}</Bubble>;
  return (
    <Bubble>
      <p className="mb-2">
        下書きを作りました。フォームで内容を確認してから送信してください。
      </p>
      <div className="bg-surface text-foreground rounded-md border p-3">
        {d.kind === "CORRECTION" ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">種類</dt>
            <dd>打刻修正</dd>
            <dt className="text-muted-foreground">対象日</dt>
            <dd className="tabular">{d.workDate}</dd>
            <dt className="text-muted-foreground">内容</dt>
            <dd>
              <ul>
                {d.lines.map((l, i) => (
                  <li key={i} className="tabular">
                    {CLOCK_LABEL[l.clockType]} {l.time}
                    {l.nextDay ? "（翌日）" : ""} を{OP_LABEL[l.op]}
                  </li>
                ))}
              </ul>
            </dd>
            <dt className="text-muted-foreground">理由</dt>
            <dd>{d.reason}</dd>
          </dl>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">種類</dt>
            <dd>
              {LEAVE_LABEL[d.leaveType]}（{PART_LABEL[d.dayPart]}）
            </dd>
            <dt className="text-muted-foreground">期間</dt>
            <dd className="tabular">
              {d.startDate === d.endDate
                ? d.startDate
                : `${d.startDate} 〜 ${d.endDate}`}
            </dd>
            <dt className="text-muted-foreground">理由</dt>
            <dd>{d.reason}</dd>
          </dl>
        )}
        <Link
          href={draftHref(d)}
          className="text-primary mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          フォームで確認する <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Bubble>
  );
}

function AnswerResult({ r }: { r: AnswerResponse }) {
  if (!r.ok) return <Bubble>{r.message}</Bubble>;
  return (
    <Bubble>
      <p className="whitespace-pre-wrap">{r.answer}</p>
      {r.basis.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs opacity-75">根拠:</span>
          {r.basis.map((b) => (
            <Badge key={b} variant="outline" className="bg-surface">
              {b}
            </Badge>
          ))}
        </div>
      ) : null}
    </Bubble>
  );
}
