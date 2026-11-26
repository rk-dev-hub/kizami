"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  Loader2,
  Send,
  Check,
} from "lucide-react";
import type { InsightKind, InsightStatus } from "@/generated/prisma/client";
import { explainInsightAction } from "@/features/kizami/actions";
import {
  acknowledgeInsightAction,
  sendAdminMessageAction,
} from "@/features/insight/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MetricGauge } from "@/components/metric-gauge";
import { useToast } from "@/components/toast";
import { KizamiMark } from "@/components/kizami/mark";
import { cn } from "@/lib/utils";

export type InsightCardData = {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  kind: InsightKind;
  kindLabel: string;
  severity: "INFO" | "CAUTION" | "WARNING";
  status: InsightStatus;
  periodLabel: string;
  explanation: string;
  suggestedActions: string[];
  messageDraft: string;
  gauge: {
    label: string;
    value: number;
    forecast?: number;
    limit: number;
    unit: "minutes" | "days";
  } | null;
  ackNote: string | null;
  ackByName: string | null;
  attendanceHref: string;
};

const SEVERITY = {
  WARNING: { label: "警告", variant: "destructive", icon: AlertOctagon },
  CAUTION: { label: "注意", variant: "warning", icon: AlertTriangle },
  INFO: { label: "お知らせ", variant: "info", icon: Info },
} as const;

function fmt(unit: "minutes" | "days") {
  return (v: number) =>
    unit === "days"
      ? `${v} 日`
      : `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
}

/** 兆し 1 件: 指標・Kizami の説明・声かけの下書き・対応 */
export function InsightCard({
  data,
  aiEnabled,
  compact = false,
}: {
  data: InsightCardData;
  aiEnabled: boolean;
  compact?: boolean;
}) {
  const toast = useToast();
  const [explained, setExplained] = useState<{
    explanation: string;
    suggestedActions: string[];
    source: "ai" | "template";
  } | null>(null);
  const [draft, setDraft] = useState(data.messageDraft);
  const [showMessage, setShowMessage] = useState(false);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(data.status);
  const sev = SEVERITY[data.severity];
  const SevIcon = sev.icon;

  const explanation = explained?.explanation ?? data.explanation;
  const actions = explained?.suggestedActions ?? data.suggestedActions;

  function askKizami() {
    start(async () => {
      const r = await explainInsightAction(data.id);
      if (!r.ok) {
        toast(r.message, "error");
        return;
      }
      setExplained({
        explanation: r.explanation,
        suggestedActions: r.suggestedActions,
        source: r.source,
      });
      setDraft(r.messageDraft);
      if (r.source === "template")
        toast("今は Kizami が使えないため、定型文を表示しています", "error");
    });
  }

  return (
    <article
      className={cn(
        "bg-surface flex flex-col gap-3 rounded-xl border p-4",
        data.severity === "WARNING" &&
          status === "OPEN" &&
          "border-destructive/40",
      )}
      aria-label={`${data.userName} ${data.kindLabel}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant={sev.variant}>
          <SevIcon aria-hidden />
          {sev.label}
        </Badge>
        <h3 className="text-sm font-semibold">{data.kindLabel}</h3>
        <span className="text-muted-foreground text-xs">
          {data.periodLabel}
        </span>
        <span className="flex-1" />
        <Link href={data.attendanceHref} className="text-sm hover:underline">
          <span className="text-muted-foreground tabular mr-1 text-xs">
            {data.employeeCode}
          </span>
          {data.userName}
        </Link>
      </header>

      {data.gauge ? (
        <MetricGauge
          label={data.gauge.label}
          actual={data.gauge.value}
          forecast={data.gauge.forecast}
          limit={data.gauge.limit}
          format={fmt(data.gauge.unit)}
          tone={data.gauge.unit === "days" ? "primary" : "auto"}
        />
      ) : null}

      <div className="border-kizami-border bg-kizami text-kizami-foreground flex gap-2.5 rounded-lg border p-3 text-sm">
        <KizamiMark className="mt-0.5" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="leading-relaxed">{explanation}</p>
          {!compact && actions.length > 0 ? (
            <ul className="list-inside list-disc text-[13px] opacity-90">
              {actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          {aiEnabled && !explained && !compact ? (
            <button
              type="button"
              onClick={askKizami}
              disabled={pending}
              className="self-start text-xs font-medium underline-offset-2 hover:underline"
            >
              {pending ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> Kizami
                  が考えています…
                </span>
              ) : (
                "Kizami にくわしく説明してもらう"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {status === "ACKNOWLEDGED" ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Check className="text-success size-3.5" aria-hidden />
          対応済み{data.ackByName ? `（${data.ackByName}）` : ""}
          {data.ackNote ? `: ${data.ackNote}` : ""}
        </p>
      ) : null}

      {!compact && status !== "RESOLVED" ? (
        <>
          {showMessage ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`msg-${data.id}`} className="text-xs font-medium">
                {data.userName} さんへのメッセージ（送る前に編集できます）
              </label>
              <Textarea
                id={`msg-${data.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1000}
                rows={4}
              />
            </div>
          ) : null}
          <footer className="flex flex-wrap gap-2">
            {showMessage ? (
              <ConfirmDialog
                title={`${data.userName} さんにメッセージを送りますか?`}
                description="アプリの通知（設定によりメールも）で届きます。"
                confirmLabel="送る"
                onConfirm={async () => {
                  const r = await sendAdminMessageAction({
                    userId: data.userId,
                    title: `${data.kindLabel}について`,
                    body: draft,
                    insightId: data.id,
                  });
                  if (!r?.ok) {
                    toast(r?.message ?? "送れませんでした", "error");
                    return false;
                  }
                  toast("メッセージを送りました");
                  setShowMessage(false);
                }}
                trigger={(open) => (
                  <Button size="sm" onClick={open} disabled={!draft.trim()}>
                    <Send />
                    送る
                  </Button>
                )}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowMessage(true)}
              >
                <Send />
                声をかける
              </Button>
            )}
            {status === "OPEN" ? (
              <ConfirmDialog
                title="対応済みにしますか?"
                description="状況が変わって重要度が上がると、もう一度「未対応」に戻ります。"
                confirmLabel="対応済みにする"
                reasonLabel="対応メモ（任意）"
                reasonRequired={false}
                onConfirm={async (note) => {
                  const r = await acknowledgeInsightAction(data.id, note);
                  if (!r?.ok) {
                    toast(r?.message ?? "更新できませんでした", "error");
                    return false;
                  }
                  setStatus("ACKNOWLEDGED");
                  toast("対応済みにしました");
                }}
                trigger={(open) => (
                  <Button size="sm" variant="ghost" onClick={open}>
                    <Check />
                    対応済みにする
                  </Button>
                )}
              />
            ) : null}
          </footer>
        </>
      ) : null}
    </article>
  );
}
