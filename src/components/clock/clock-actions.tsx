"use client";

import { useState, useTransition } from "react";
import { Check, Coffee, LogIn, LogOut, Play } from "lucide-react";
import type { ClockType } from "@/generated/prisma/client";
import { punchAction } from "@/features/time-clock/actions";
import { clockStateLabel, clockTypeLabel } from "@/features/time-clock/labels";
import type { ClockState } from "@/features/time-clock/domain/state-machine";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { useToast } from "@/components/toast";

const ICON = {
  CLOCK_IN: LogIn,
  CLOCK_OUT: LogOut,
  BREAK_START: Coffee,
  BREAK_END: Play,
} as const;
const STATE_VARIANT: Record<ClockState, BadgeVariant> = {
  OUT: "default",
  WORKING: "success",
  ON_BREAK: "warning",
  DONE: "primary",
};

/** 状態に応じて押せるボタンだけを出す。時刻はサーバが決める。 */
export function ClockActions({
  state,
  allowed,
  crossDayFrom,
}: {
  state: ClockState;
  allowed: ClockType[];
  crossDayFrom: string | null;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<ClockType | null>(null);
  const toast = useToast();

  function onPunch(type: ClockType) {
    start(async () => {
      const res = await punchAction(type);
      if (!res.ok) {
        toast(res.message ?? "打刻できませんでした", "error");
        return;
      }
      setDone(type);
      toast(`${clockTypeLabel[type]}を記録しました`);
      setTimeout(() => setDone(null), 1500);
    });
  }

  // 主要な操作（出勤・退勤）を大きく、休憩は控えめに
  const primary = allowed.filter((t) => t === "CLOCK_IN" || t === "CLOCK_OUT");
  const secondary = allowed.filter(
    (t) => t === "BREAK_START" || t === "BREAK_END",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATE_VARIANT[state]} className="text-[13px]">
          <span
            aria-hidden
            className={
              state === "WORKING"
                ? "bg-success size-1.5 rounded-full"
                : state === "ON_BREAK"
                  ? "bg-warning size-1.5 rounded-full"
                  : "bg-muted-foreground size-1.5 rounded-full"
            }
          />
          {clockStateLabel[state]}
        </Badge>
        {crossDayFrom ? (
          <span className="text-muted-foreground text-xs">
            {crossDayFrom} からの勤務が続いています
          </span>
        ) : null}
        {done ? (
          <span
            className="animate-pop text-success inline-flex items-center gap-1 text-sm"
            aria-hidden
          >
            <Check className="size-4" />
          </span>
        ) : null}
      </div>

      {allowed.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {primary.map((t) => {
            const Icon = ICON[t];
            return (
              <Button
                key={t}
                size="xl"
                variant={t === "CLOCK_OUT" ? "outline" : "default"}
                className="min-w-40 flex-1 sm:flex-none [&_svg]:size-5"
                disabled={pending}
                onClick={() => onPunch(t)}
              >
                <Icon aria-hidden />
                {clockTypeLabel[t]}
              </Button>
            );
          })}
          {secondary.map((t) => {
            const Icon = ICON[t];
            return (
              <Button
                key={t}
                size="xl"
                variant="secondary"
                className="min-w-32 flex-1 sm:flex-none [&_svg]:size-5"
                disabled={pending}
                onClick={() => onPunch(t)}
              >
                <Icon aria-hidden />
                {clockTypeLabel[t]}
              </Button>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          今日の勤務は終わりました。おつかれさまでした。直したい打刻があれば「申請」から修正できます。
        </p>
      )}
    </div>
  );
}
