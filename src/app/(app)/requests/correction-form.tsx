"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ClockType } from "@/generated/prisma/client";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CorrectionPrefill } from "@/features/kizami/draft-link";
import { useToast } from "@/components/toast";
import { KizamiNote } from "@/components/kizami/note";
import {
  submitCorrectionAction,
  listEventsForDateAction,
  type CorrectionFormState,
} from "@/features/correction/actions";
import type { CorrectableEvent } from "@/features/correction/usecase";
import type { CorrectionLineForm } from "@/features/correction/schema";
import { clockTypeLabel } from "@/features/time-clock/labels";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

type Line = CorrectionLineForm & { _k: number };

const CLOCK_TYPES: ClockType[] = [
  "CLOCK_IN",
  "CLOCK_OUT",
  "BREAK_START",
  "BREAK_END",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let seq = 0;

export function CorrectionForm({ prefill }: { prefill?: CorrectionPrefill }) {
  const [state, action, pending] = useActionState<
    CorrectionFormState,
    FormData
  >(submitCorrectionAction, null);
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "打刻修正を申請しました");
      router.push("/requests?tab=status");
    }
  }, [state, router, toast]);

  // 対象勤務日・理由は制御コンポーネントにする。
  // action プロパティに渡した関数が完了すると React が <form> をネイティブと同様に
  // リセットしてしまうため、非制御のままだとバリデーションエラー時に入力内容が消える。
  const [targetDate, setTargetDate] = useState(prefill?.date ?? "");
  const [reason, setReason] = useState(prefill?.reason ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    prefill && prefill.lines.length > 0
      ? prefill.lines.map((l) => ({
          _k: seq++,
          op: l.op,
          clockType: l.clockType,
          time: l.nextDay ? `+1 ${l.time}` : l.time,
        }))
      : [{ _k: seq++, op: "ADD", clockType: "CLOCK_OUT", time: "" }],
  );

  const [fetchedFor, setFetchedFor] = useState("");
  const [events, setEvents] = useState<CorrectableEvent[]>([]);
  const [, startEventsFetch] = useTransition();
  const latestRequestedDate = useRef("");
  // 対象勤務日と異なる日の一覧を出さない（日付未確定・変更直後の古い結果）よう、
  // 実際に取得できた日付が一致するときだけ events を使う。
  const eventsForRender = fetchedFor === targetDate ? events : [];

  useEffect(() => {
    if (!DATE_RE.test(targetDate)) return;
    const requested = targetDate;
    latestRequestedDate.current = requested;
    startEventsFetch(async () => {
      const list = await listEventsForDateAction(requested);
      if (latestRequestedDate.current === requested) {
        setEvents(list);
        setFetchedFor(requested);
        // 下書きの「変更・削除」は対象の打刻が未選択なので、同じ種別の打刻を当てはめる
        setLines((xs) => {
          const used = new Set<string>();
          return xs.map((x) => {
            if (x.op === "ADD" || x.targetEventId) return x;
            const hit = list.find(
              (ev) => ev.clockType === x.clockType && !used.has(ev.id),
            );
            if (!hit) return x;
            used.add(hit.id);
            return { ...x, targetEventId: hit.id };
          });
        });
      }
    });
  }, [targetDate]);

  const patch = (k: number, p: Partial<Line>) =>
    setLines((xs) => xs.map((x) => (x._k === k ? { ...x, ...p } : x)));
  const remove = (k: number) => setLines((xs) => xs.filter((x) => x._k !== k));
  const add = () =>
    setLines((xs) => [
      ...xs,
      { _k: seq++, op: "ADD", clockType: "CLOCK_IN", time: "" },
    ]);

  const payload = JSON.stringify(
    lines.map(({ _k, ...l }) => {
      void _k;
      return {
        op: l.op,
        clockType: l.clockType || null,
        time: l.time || null,
        targetEventId: l.targetEventId || null,
      };
    }),
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lines" value={payload} />

      {prefill?.fromKizami ? (
        <KizamiNote>
          Kizami が下書きを入れました。内容を確認してから申請してください。
        </KizamiNote>
      ) : null}

      {state && !state.ok && state.message ? (
        <p
          className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <Field
        label="対象勤務日"
        htmlFor="targetDate"
        error={state?.fields?.targetDate}
      >
        <Input
          id="targetDate"
          name="targetDate"
          type="date"
          required
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="max-w-48"
        />
      </Field>

      {fetchedFor === targetDate && targetDate ? (
        <div className="bg-surface-2 rounded-lg px-3 py-2 text-sm">
          <span className="text-muted-foreground text-xs">この日の打刻: </span>
          {events.length === 0 ? (
            <span className="text-muted-foreground">ありません</span>
          ) : (
            events.map((ev) => (
              <span key={ev.id} className="tabular mr-3 whitespace-nowrap">
                {clockTypeLabel[ev.clockType]} {ev.timeLabel}
              </span>
            ))
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">修正内容</span>
        {lines.map((l) => {
          const usedByOtherLines = new Set(
            lines
              .filter((x) => x._k !== l._k)
              .map((x) => x.targetEventId)
              .filter((id): id is string => Boolean(id)),
          );
          const eventChoices = eventsForRender.filter(
            (ev) => ev.id === l.targetEventId || !usedByOtherLines.has(ev.id),
          );

          return (
            <div
              key={l._k}
              className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
            >
              <label className="flex flex-col gap-1 text-xs">
                操作
                <Select
                  value={l.op}
                  onChange={(e) =>
                    patch(l._k, { op: e.target.value as Line["op"] })
                  }
                  className="w-28"
                >
                  <option value="ADD">追加</option>
                  <option value="UPDATE">時刻変更</option>
                  <option value="DELETE">削除</option>
                </Select>
              </label>

              {l.op === "UPDATE" || l.op === "DELETE" ? (
                <label className="flex flex-col gap-1 text-xs">
                  対象の打刻
                  <Select
                    required
                    value={l.targetEventId ?? ""}
                    onChange={(e) =>
                      patch(l._k, { targetEventId: e.target.value })
                    }
                    className="w-40"
                  >
                    <option value="">選択してください</option>
                    {eventChoices.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.timeLabel} {clockTypeLabel[ev.clockType]}
                      </option>
                    ))}
                  </Select>
                  {fetchedFor === targetDate && eventChoices.length === 0 ? (
                    <span className="text-muted-foreground text-[11px]">
                      対象日に変更・削除できる打刻がありません
                    </span>
                  ) : null}
                </label>
              ) : null}

              {l.op !== "DELETE" ? (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    種別
                    <Select
                      value={l.clockType ?? ""}
                      onChange={(e) =>
                        patch(l._k, {
                          clockType: e.target.value as ClockType,
                        })
                      }
                      className="w-28"
                    >
                      {CLOCK_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {clockTypeLabel[t]}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    時刻
                    <Input
                      type="time"
                      value={(l.time ?? "").replace("+1 ", "")}
                      onChange={(e) => patch(l._k, { time: e.target.value })}
                      className="w-32"
                    />
                  </label>
                  <span className="flex items-center gap-1 text-xs">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={(l.time ?? "").startsWith("+1 ")}
                        onChange={(e) => {
                          const base = (l.time ?? "").replace("+1 ", "");
                          patch(l._k, {
                            time: e.target.checked ? `+1 ${base}` : base,
                          });
                        }}
                      />
                      翌日
                    </label>
                    <span
                      tabIndex={0}
                      className="text-muted-foreground cursor-help"
                      title="対象勤務日の翌日（日付をまたぐ勤務）の時刻を指定する場合にチェックします。例: 対象勤務日を9/1にし、9/2の午前2時に退勤した場合の退勤時刻修正など"
                    >
                      <HelpCircle className="size-3.5" />
                    </span>
                  </span>
                </>
              ) : null}

              {lines.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(l._k)}
                  aria-label="この行を削除"
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          );
        })}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus />
            行を追加
          </Button>
        </div>
      </div>

      <Field label="理由" htmlFor="c-reason" error={state?.fields?.reason}>
        <Input
          id="c-reason"
          name="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "申請中…" : "打刻修正を申請"}
        </Button>
      </div>
    </form>
  );
}
