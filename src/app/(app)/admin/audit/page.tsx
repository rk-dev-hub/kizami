import Link from "next/link";
import type { AiFeature, AiOutcome } from "@/generated/prisma/client";
import { requireAdmin } from "@/features/auth/rbac";
import {
  listAiUsageLogs,
  listAuditLogs,
} from "@/features/admin/master-usecase";
import { buildAuditDiffLines } from "@/features/admin/audit-diff";
import { stringParam } from "@/lib/params";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { LinkTabs } from "@/components/tabs";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "監査ログ — Kizami" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  CLOCK_EDIT: "打刻編集",
  APPROVE: "承認",
  REJECT: "却下",
  CLOSE: "締め",
  REOPEN: "再オープン",
  USER_CREATE: "ユーザー作成",
  USER_DISABLE: "ユーザー無効化",
  PASSWORD_RESET: "パスワード",
  MASTER_CHANGE: "マスタ変更",
  LEAVE_GRANT: "有給付与・調整",
  MESSAGE_SEND: "メッセージ送信",
  INSIGHT_ACK: "兆しの対応",
};

const FEATURE_LABEL: Record<AiFeature, string> = {
  DAILY_NOTES: "気づきのひとこと",
  DRAFT_FROM_TEXT: "話して申請",
  ANSWER_QUESTION: "質問に答える",
  SUMMARIZE_REQUEST: "承認の要約",
  EXPLAIN_INSIGHT: "兆しの説明",
  CLOSING_MESSAGE: "締めアシスト",
  WEEKLY_DIGEST: "週次ダイジェスト",
};

const OUTCOME: Record<AiOutcome, { label: string; variant: BadgeVariant }> = {
  OK: { label: "成功", variant: "success" },
  FALLBACK_NO_KEY: { label: "キー未設定", variant: "default" },
  RATE_LIMITED: { label: "回数上限", variant: "warning" },
  TIMEOUT: { label: "タイムアウト", variant: "warning" },
  API_ERROR: { label: "API エラー", variant: "destructive" },
  REFUSAL: { label: "応答拒否", variant: "warning" },
  INVALID_OUTPUT: { label: "出力が不正", variant: "warning" },
};

const jst = (d: Date) => d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

export default async function AuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = stringParam(sp.tab) === "ai" ? "ai" : "audit";
  const tabs = [
    { key: "audit", label: "操作の履歴", href: "/admin/audit" },
    { key: "ai", label: "AI 利用ログ", href: "/admin/audit?tab=ai" },
  ];

  if (tab === "ai") {
    const { logs, last30 } = await listAiUsageLogs(200);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title="監査ログ"
          description="Kizami が Claude API を呼び出した記録です。入力や出力の内容は保存していません。"
        />
        <LinkTabs tabs={tabs} current={tab} />
        <dl className="bg-surface [&>div]:bg-surface grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4 [&>div]:px-4 [&>div]:py-3">
          <div>
            <dt className="text-muted-foreground text-xs">
              直近 30 日の呼び出し
            </dt>
            <dd className="tabular text-lg font-semibold">{last30.calls}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">成功</dt>
            <dd className="tabular text-lg font-semibold">{last30.ok}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">入力トークン</dt>
            <dd className="tabular text-lg font-semibold">
              {last30.inputTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">出力トークン</dt>
            <dd className="tabular text-lg font-semibold">
              {last30.outputTokens.toLocaleString()}
            </dd>
          </div>
        </dl>
        {logs.length === 0 ? (
          <EmptyState title="まだ記録はありません">
            .env に ANTHROPIC_API_KEY を設定すると、Kizami が AI
            を使った記録がここに残ります。
          </EmptyState>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">日時</th>
                  <th className="py-2 pr-3 font-medium">利用者</th>
                  <th className="py-2 pr-3 font-medium">機能</th>
                  <th className="py-2 pr-3 font-medium">結果</th>
                  <th className="py-2 pr-3 text-right font-medium">入力</th>
                  <th className="py-2 pr-3 text-right font-medium">出力</th>
                  <th className="py-2 pr-4 text-right font-medium">応答</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="tabular px-4 py-1.5 whitespace-nowrap">
                      {jst(l.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3">
                      {l.user
                        ? `${l.user.employeeCode} ${l.user.name}`
                        : "システム"}
                    </td>
                    <td className="py-1.5 pr-3">{FEATURE_LABEL[l.feature]}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={OUTCOME[l.outcome].variant}>
                        {OUTCOME[l.outcome].label}
                      </Badge>
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right">
                      {l.inputTokens ?? "—"}
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right">
                      {l.outputTokens ?? "—"}
                    </td>
                    <td className="tabular py-1.5 pr-4 text-right">
                      {l.latencyMs != null
                        ? `${(l.latencyMs / 1000).toFixed(1)} 秒`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    );
  }

  const action = stringParam(sp.action);
  const logs = await listAuditLogs({ action, limit: 200 });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="監査ログ"
        description="打刻の編集・承認・締め・マスタ変更などの操作の履歴（新しい順に最大 200 件）。"
      />
      <LinkTabs tabs={tabs} current={tab} />

      <div
        className="flex flex-wrap gap-1.5 text-xs"
        role="navigation"
        aria-label="操作の種類で絞り込む"
      >
        {[undefined, ...Object.keys(ACTION_LABEL)].map((a) => (
          <Link
            key={a ?? "all"}
            href={a ? `/admin/audit?action=${a}` : "/admin/audit"}
            aria-current={action === a ? "true" : undefined}
            className={cn(
              "rounded-full border px-2.5 py-1",
              action === a
                ? "border-primary bg-primary-soft text-primary-soft-foreground"
                : "hover:bg-surface-2",
            )}
          >
            {a ? ACTION_LABEL[a] : "すべて"}
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <EmptyState title="該当する操作の履歴はありません" />
      ) : (
        <ul className="bg-surface divide-y rounded-xl border">
          {logs.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:gap-4"
            >
              <span className="text-muted-foreground tabular w-40 shrink-0 text-xs sm:pt-0.5">
                {jst(l.createdAt)}
              </span>
              <div className="min-w-0 flex-1">
                <p>
                  <Badge variant="outline" className="mr-2">
                    {ACTION_LABEL[l.action] ?? l.action}
                  </Badge>
                  {l.actor.name}
                  {l.subjectUser ? (
                    <span className="text-muted-foreground">
                      {" "}
                      → {l.subjectUser.name}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {l.targetType}
                  </span>
                </p>
                {l.comment ? (
                  <p className="text-muted-foreground mt-0.5">{l.comment}</p>
                ) : null}
                {l.before || l.after ? (
                  <details className="mt-1 text-xs">
                    <summary className="text-muted-foreground">
                      変更の内容
                    </summary>
                    <ul className="mt-1 list-inside list-disc space-y-0.5">
                      {buildAuditDiffLines(l.before, l.after).map((d) => (
                        <li
                          key={d.key}
                          className={cn(
                            d.kind === "added" && "text-success",
                            d.kind === "removed" && "text-destructive",
                          )}
                        >
                          {d.text}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
