"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import {
  draftClosingMessagesAction,
  type ClosingDraft,
} from "@/features/kizami/actions";
import { sendClosingMessagesAction } from "@/features/insight/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { KizamiMark } from "@/components/kizami/mark";

type Row = ClosingDraft & { checked: boolean };

/** 締めアシスト: 打刻漏れのある人ごとに確認メッセージを下書きし、選んだ人に送る */
export function ClosingAssist({
  periodStart,
  defaultDeadline,
  targetCount,
  aiEnabled,
}: {
  periodStart: string;
  defaultDeadline: string;
  targetCount: number;
  aiEnabled: boolean;
}) {
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const selected = rows?.filter((r) => r.checked) ?? [];
  const patch = (userId: string, p: Partial<Row>) =>
    setRows(
      (rs) =>
        rs?.map((r) => (r.userId === userId ? { ...r, ...p } : r)) ?? null,
    );

  if (targetCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        本人に確認が必要な打刻漏れはありません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">対応の期限</span>
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="h-9 w-40"
          />
        </label>
        <Button
          variant="kizami"
          disabled={pending || !deadline}
          onClick={() =>
            start(async () => {
              const r = await draftClosingMessagesAction(periodStart, deadline);
              if (!r.ok) {
                toast(r.message, "error");
                return;
              }
              setRows(r.drafts.map((d) => ({ ...d, checked: true })));
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <KizamiMark />}
          {rows
            ? "下書きを作り直す"
            : `${targetCount} 人分の確認メッセージを下書き`}
        </Button>
        {!aiEnabled ? (
          <span className="text-muted-foreground text-xs">
            AI 機能が未設定のため、定型文で下書きします。
          </span>
        ) : null}
      </div>

      {rows ? (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li
                key={r.userId}
                className="bg-surface flex flex-col gap-2 rounded-lg border p-3"
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={r.checked}
                    onChange={(e) =>
                      patch(r.userId, { checked: e.target.checked })
                    }
                  />
                  {r.name} さん
                  <span className="text-muted-foreground text-xs font-normal">
                    （{r.items.length} 件）
                  </span>
                </label>
                <ul className="text-muted-foreground tabular ml-6 text-xs">
                  {r.items.map((i) => (
                    <li key={i}>・{i}</li>
                  ))}
                </ul>
                <div className="ml-6 flex flex-col gap-2">
                  <Input
                    aria-label={`${r.name} さんへの件名`}
                    value={r.subject}
                    maxLength={60}
                    onChange={(e) =>
                      patch(r.userId, { subject: e.target.value })
                    }
                    className="h-9"
                  />
                  <Textarea
                    aria-label={`${r.name} さんへの本文`}
                    value={r.body}
                    maxLength={1000}
                    rows={4}
                    onChange={(e) => patch(r.userId, { body: e.target.value })}
                  />
                </div>
              </li>
            ))}
          </ul>
          <ConfirmDialog
            title={`${selected.length} 人にメッセージを送りますか?`}
            description={
              <ul className="list-inside list-disc">
                {selected.map((r) => (
                  <li key={r.userId}>{r.name} さん</li>
                ))}
              </ul>
            }
            confirmLabel="送る"
            onConfirm={async () => {
              const r = await sendClosingMessagesAction(
                selected.map((s) => ({
                  userId: s.userId,
                  title: s.subject,
                  body: s.body,
                })),
              );
              if (!r?.ok) {
                toast(r?.message ?? "送れませんでした", "error");
                return false;
              }
              toast(r.message ?? "送りました");
              setRows(null);
            }}
            trigger={(open) => (
              <Button
                onClick={open}
                disabled={selected.length === 0}
                className="self-start"
              >
                <Send />
                選んだ {selected.length} 人に送る
              </Button>
            )}
          />
        </>
      ) : null}
    </div>
  );
}
