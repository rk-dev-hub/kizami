"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  submitLeaveAction,
  type LeaveFormState,
} from "@/features/leave/actions";
import type { LeavePrefill } from "@/features/kizami/draft-link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { MetricGaugeClient } from "@/components/metric-gauge-client";
import { KizamiNote } from "@/components/kizami/note";
import { useToast } from "@/components/toast";
import { formatDateJa } from "@/lib/date-range";

function dayCount(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  return (
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  );
}

export function LeaveForm({
  balance,
  granted,
  expiring,
  prefill,
}: {
  balance: number;
  /** 有効な付与日数の合計（ゲージの最大） */
  granted: number;
  expiring: { date: string; days: number } | null;
  prefill?: LeavePrefill;
}) {
  const [state, action, pending] = useActionState<LeaveFormState, FormData>(
    submitLeaveAction,
    null,
  );
  const router = useRouter();
  const toast = useToast();

  const [type, setType] = useState<string>(prefill?.type ?? "PAID");
  const [single, setSingle] = useState(
    !prefill?.start || prefill.start === prefill.end,
  );
  const [start, setStart] = useState(prefill?.start ?? "");
  const [end, setEnd] = useState(prefill?.end ?? "");
  const [part, setPart] = useState<string>(prefill?.part ?? "FULL");
  const [reason, setReason] = useState(prefill?.reason ?? "");

  useEffect(() => {
    if (state?.ok) {
      toast(
        state.warning
          ? `${state.message}`
          : (state.message ?? "休暇を申請しました"),
      );
      router.push("/requests?tab=status");
    }
  }, [state, router, toast]);

  const requested = single
    ? part === "FULL"
      ? start
        ? 1
        : 0
      : start
        ? 0.5
        : 0
    : dayCount(start, end);
  const after = balance - (type === "PAID" ? requested : 0);

  return (
    <form action={action} className="flex flex-col gap-4">
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

      <div className="bg-surface-2 flex flex-col gap-2 rounded-lg p-3">
        <MetricGaugeClient
          label="有給の残日数"
          actual={Math.max(balance, 0)}
          limit={Math.max(granted, balance, 1)}
          unit="日"
        />
        <p className="text-muted-foreground text-xs">
          {type === "PAID" && requested > 0 ? (
            <>
              申請後の残り（目安）:{" "}
              <span
                className={
                  after < 0
                    ? "text-destructive font-medium"
                    : "text-foreground font-medium"
                }
              >
                {after} 日
              </span>
              {!single
                ? "（休日は数えないため、実際はこれより多く残ります）"
                : ""}
            </>
          ) : (
            "有給の申請では、承認されたときに残日数から差し引きます。"
          )}
        </p>
        {expiring ? (
          <p className="text-warning text-xs">
            {formatDateJa(expiring.date)} に {expiring.days}{" "}
            日分が失効します。早めの取得をおすすめします。
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="種別" htmlFor="type">
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="PAID">有給休暇</option>
            <option value="ABSENCE">欠勤</option>
            <option value="SPECIAL_UNPAID">特別休暇（無給）</option>
          </Select>
        </Field>

        <Field label="日数" htmlFor="range-mode">
          <Select
            id="range-mode"
            value={single ? "single" : "range"}
            onChange={(e) => setSingle(e.target.value === "single")}
          >
            <option value="single">1 日・半日</option>
            <option value="range">複数日</option>
          </Select>
        </Field>

        <Field
          label={single ? "取得日" : "開始日"}
          htmlFor="startDate"
          error={state?.fields?.startDate}
        >
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>

        {single ? (
          <Field label="全日・半日" htmlFor="dayPart">
            <Select
              id="dayPart"
              name="dayPart"
              value={part}
              onChange={(e) => setPart(e.target.value)}
            >
              <option value="FULL">全日</option>
              <option value="AM">午前半休</option>
              <option value="PM">午後半休</option>
            </Select>
          </Field>
        ) : (
          <Field
            label="終了日"
            htmlFor="endDate"
            error={state?.fields?.endDate}
          >
            <Input
              id="endDate"
              name="endDate"
              type="date"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        )}
      </div>

      <Field label="理由" htmlFor="reason" error={state?.fields?.reason}>
        <Input
          id="reason"
          name="reason"
          required
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "申請中…" : "休暇を申請"}
        </Button>
      </div>
    </form>
  );
}
