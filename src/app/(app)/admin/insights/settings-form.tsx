"use client";

import { useState, useTransition } from "react";
import type { InsightKind } from "@/generated/prisma/client";
import type { InsightSettings } from "@/features/insight/domain/types";
import { updateInsightSettingAction } from "@/features/insight/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";

const PARAM_LABEL: Record<string, { label: string; unit: string }> = {
  lookbackDays: { label: "さかのぼる日数", unit: "日" },
  graceMinutes: { label: "予定の終業からの猶予", unit: "分" },
  cautionPct: { label: "注意（上限に対する予測の割合）", unit: "%" },
  warningPct: { label: "警告（上限に対する予測の割合）", unit: "%" },
  recentDays: { label: "ペースを見る直近の勤務日数", unit: "日" },
  monthlyMinutes: { label: "月の時間外＋休日労働", unit: "分" },
  averageMinutes: { label: "2〜6 か月平均", unit: "分" },
  cautionDays: { label: "注意（連続日数）", unit: "日" },
  warningDays: { label: "警告（連続日数）", unit: "日" },
  intervalMinutes: { label: "勤務間インターバル", unit: "分" },
  windowDays: { label: "見る期間", unit: "日" },
  minCount: { label: "回数", unit: "回" },
  minDays: { label: "連続日数", unit: "日" },
  cautionDaysLeft: { label: "注意（期限までの日数）", unit: "日" },
  warningDaysLeft: { label: "警告（期限までの日数）", unit: "日" },
  withinDays: { label: "失効までの日数", unit: "日" },
  remainingMinutes: { label: "40 時間までの残り", unit: "分" },
};

function Row({
  kind,
  label,
  value,
}: {
  kind: InsightKind;
  label: string;
  value: InsightSettings[InsightKind];
}) {
  const { enabled: initialEnabled, ...initialParams } = value as unknown as {
    enabled: boolean;
  } & Record<string, number>;
  const [enabled, setEnabled] = useState(initialEnabled);
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initialParams).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
      <label className="flex w-56 shrink-0 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4"
        />
        {label}
      </label>
      <div className="flex flex-1 flex-wrap gap-3">
        {Object.keys(params).map((k) => (
          <label key={k} className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {PARAM_LABEL[k]?.label ?? k}
            </span>
            <span className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="numeric"
                className="h-9 w-24"
                value={params[k]}
                disabled={!enabled}
                onChange={(e) =>
                  setParams((p) => ({ ...p, [k]: e.target.value }))
                }
              />
              <span className="text-muted-foreground">
                {PARAM_LABEL[k]?.unit}
              </span>
            </span>
          </label>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await updateInsightSettingAction({
              kind,
              enabled,
              params: Object.fromEntries(
                Object.entries(params).map(([k, v]) => [k, Number(v)]),
              ),
            });
            toast(
              r?.message ?? (r?.ok ? "保存しました" : "保存できませんでした"),
              r?.ok ? "success" : "error",
            );
          })
        }
      >
        保存
      </Button>
    </li>
  );
}

export function InsightSettingsForm({
  settings,
  labels,
}: {
  settings: InsightSettings;
  labels: Record<InsightKind, string>;
}) {
  return (
    <ul className="bg-surface divide-y rounded-xl border">
      {(Object.keys(settings) as InsightKind[]).map((k) => (
        <Row key={k} kind={k} label={labels[k]} value={settings[k]} />
      ))}
    </ul>
  );
}
