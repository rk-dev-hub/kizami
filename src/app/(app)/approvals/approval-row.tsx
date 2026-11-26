"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { approveAction, rejectAction } from "@/features/approval/actions";
import type { PendingItem } from "@/features/approval/usecase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

const KIND_LABEL: Record<PendingItem["kind"], string> = {
  CORRECTION: "打刻修正",
  LEAVE: "休暇",
  LEAVE_CANCELLATION: "休暇の取消",
};
const CLOCK: Record<string, string> = {
  CLOCK_IN: "出勤",
  CLOCK_OUT: "退勤",
  BREAK_START: "休憩開始",
  BREAK_END: "休憩終了",
};
const LEAVE: Record<string, string> = {
  PAID: "有給休暇",
  ABSENCE: "欠勤",
  SPECIAL_UNPAID: "特別休暇",
};
const PART: Record<string, string> = {
  FULL: "全日",
  AM: "午前休",
  PM: "午後休",
};

function when(iso: Date): string {
  const j = new Date(iso.getTime() + 9 * 3600_000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}

/** 承認待ちの申請 1 件（変更前 → 変更後、Kizami の要約、承認・却下） */
export function ApprovalCard({
  item,
  summary,
}: {
  item: PendingItem;
  summary: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [approving, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const rejectKind = item.kind === "CORRECTION" ? "CORRECTION" : "LEAVE";

  return (
    <article
      className="bg-surface animate-fade-in flex flex-col gap-3 rounded-xl border p-4"
      data-testid="approval-row"
      data-kind={item.kind}
      data-requester={item.requesterCode}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">{KIND_LABEL[item.kind]}</Badge>
        <span className="text-sm font-medium">
          <span className="text-muted-foreground tabular mr-1 text-xs">
            {item.requesterCode}
          </span>
          {item.requesterName}
        </span>
        <span className="tabular text-sm">{item.targetLabel}</span>
        <span className="flex-1" />
        <span className="text-muted-foreground tabular text-xs">
          申請 {when(item.createdAt)}
        </span>
      </header>

      {item.lines ? (
        <div className="grid gap-2 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-start">
          <div className="bg-surface-2 rounded-lg px-3 py-2">
            <p className="text-muted-foreground mb-1 text-xs">いまの打刻</p>
            {item.dayEvents && item.dayEvents.length > 0 ? (
              <ul className="tabular flex flex-wrap gap-x-3">
                {item.dayEvents.map((e, i) => (
                  <li key={i}>
                    {CLOCK[e.clockType]} {e.time}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">打刻なし</p>
            )}
          </div>
          <ArrowRight
            className="text-muted-foreground hidden size-4 self-center sm:block"
            aria-hidden
          />
          <div className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground mb-1 text-xs">申請された修正</p>
            <ul className="tabular flex flex-col gap-0.5">
              {item.lines.map((l, i) => (
                <li key={i}>
                  {l.op === "ADD" ? (
                    <>
                      <span className="text-success text-xs">追加</span>{" "}
                      {CLOCK[l.clockType ?? ""]} {l.time}
                      {l.nextDay ? "（翌日）" : ""}
                    </>
                  ) : l.op === "UPDATE" ? (
                    <>
                      <span className="text-primary text-xs">変更</span>{" "}
                      {CLOCK[l.clockType ?? ""]} {l.before ?? "?"} → {l.time}
                      {l.nextDay ? "（翌日）" : ""}
                    </>
                  ) : (
                    <>
                      <span className="text-destructive text-xs">削除</span>{" "}
                      {CLOCK[l.clockType ?? ""] ?? "打刻"} {l.before ?? ""}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : item.leave ? (
        <p className="text-sm">
          {LEAVE[item.leave.type]}（{PART[item.leave.dayPart]}）
        </p>
      ) : (
        <p className="text-sm">{item.detail}</p>
      )}

      <p className="text-sm">
        <span className="text-muted-foreground text-xs">理由: </span>
        {item.reason}
      </p>

      {summary}

      <footer className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={approving}
          onClick={() =>
            start(async () => {
              const r = await approveAction(item.kind, item.id);
              if (!r?.ok) {
                toast(r?.message ?? "承認できませんでした", "error");
                router.refresh();
                return;
              }
              setGone(true);
              toast(
                `${item.requesterName} さんの${KIND_LABEL[item.kind]}を承認しました`,
              );
              router.refresh();
            })
          }
        >
          <Check />
          {approving ? "承認中…" : "承認"}
        </Button>
        <ConfirmDialog
          title="申請を却下しますか?"
          description={`${item.requesterName} さんに却下の理由とともに通知します。`}
          confirmLabel="却下する"
          destructive
          reasonLabel="却下の理由（必須）"
          onConfirm={async (comment) => {
            const fd = new FormData();
            fd.set("kind", rejectKind);
            fd.set("id", item.id);
            fd.set("comment", comment);
            const r = await rejectAction(null, fd);
            if (!r?.ok) {
              toast(r?.message ?? "却下できませんでした", "error");
              router.refresh();
              return false;
            }
            setGone(true);
            toast("却下しました");
            router.refresh();
          }}
          trigger={(open) => (
            <Button size="sm" variant="outline" onClick={open}>
              <X />
              却下
            </Button>
          )}
        />
      </footer>
    </article>
  );
}
