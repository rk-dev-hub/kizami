import Link from "next/link";
import { ArrowRight, ClipboardCheck, Lock, Sparkles } from "lucide-react";
import { requireAdmin } from "@/features/auth/rbac";
import { getAdminDashboard } from "@/features/admin/dashboard";
import { toCardData } from "@/features/insight/card-data";
import { isKizamiAiEnabled } from "@/features/kizami/client";
import { formatDateJa } from "@/lib/date-range";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { InsightCard } from "@/components/insight/insight-card";
import { KizamiHeading } from "@/components/kizami/note";
import { cn } from "@/lib/utils";

export const metadata = { title: "管理ダッシュボード — Kizami" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const d = await getAdminDashboard();
  const ai = isKizamiAiEnabled();
  const checks = [
    {
      label: "承認待ちの申請を処理する",
      done: d.closing.pendingInPeriod === 0,
      count: d.closing.pendingInPeriod,
    },
    {
      label: "打刻漏れを本人に直してもらう",
      done: d.closing.missingPunchDays === 0,
      count: d.closing.missingPunchDays,
    },
    {
      label: "警告の兆しを確認する",
      done: d.insights.warning === 0,
      count: d.insights.warning,
    },
  ];
  const doneCount = checks.filter((c) => c.done).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="管理ダッシュボード"
        description={`${formatDateJa(d.today)} の状況`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="勤務中"
          value={d.presence.working}
          sub={`休憩中 ${d.presence.onBreak}・退勤済 ${d.presence.done}`}
        />
        <Stat
          label="未出勤"
          value={d.presence.notIn}
          sub={`在籍 ${d.presence.total} 人`}
        />
        <Stat
          label="承認待ち"
          value={d.pendingApprovals}
          href="/approvals"
          icon={ClipboardCheck}
          highlight={d.pendingApprovals > 0}
        />
        <Stat
          label="未対応の兆し"
          value={d.insights.warning + d.insights.caution + d.insights.info}
          sub={`警告 ${d.insights.warning}・注意 ${d.insights.caution}・お知らせ ${d.insights.info}`}
          href="/admin/insights"
          icon={Sparkles}
          highlight={d.insights.warning > 0}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          className="flex min-w-0 flex-col gap-3"
          aria-labelledby="top-insights"
        >
          <div className="flex items-center justify-between" id="top-insights">
            <KizamiHeading>Kizami が見つけた兆し</KizamiHeading>
            <Link
              href="/admin/insights"
              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
            >
              すべて見る <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {d.insights.top.length === 0 ? (
            <EmptyState icon={Sparkles} title="いま気になる兆しはありません">
              働きすぎや打刻漏れの兆しが見つかると、ここに重要度の高い順に表示します。
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              {d.insights.top.map((r) => (
                <InsightCard
                  key={r.id}
                  data={toCardData(r)}
                  aiEnabled={ai}
                  compact
                />
              ))}
            </div>
          )}
        </section>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4" aria-hidden />
              次の締め
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">
              <span className="tabular text-2xl font-semibold">
                {Math.max(d.closing.daysLeft, 0)}
              </span>
              <span className="text-muted-foreground ml-1">
                日後（{formatDateJa(d.closing.periodEnd)}）
              </span>
            </p>
            <div>
              <p className="text-muted-foreground mb-2 text-xs">
                締め前のチェック {doneCount}/{checks.length}
              </p>
              <ul className="flex flex-col gap-1.5">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-4 place-items-center rounded-full border text-[10px]",
                        c.done
                          ? "bg-success border-success text-[var(--surface)]"
                          : "border-border-strong",
                      )}
                    >
                      {c.done ? "✓" : ""}
                    </span>
                    <span
                      className={cn(
                        "flex-1",
                        c.done && "text-muted-foreground line-through",
                      )}
                    >
                      {c.label}
                    </span>
                    {!c.done ? (
                      <span className="tabular text-muted-foreground text-xs">
                        {c.count} 件
                      </span>
                    ) : null}
                    <span className="sr-only">
                      {c.done ? "完了" : "未完了"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/admin/closing"
              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
            >
              月次締めへ <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  href,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number;
  sub?: string;
  href?: string;
  icon?: typeof Sparkles;
  highlight?: boolean;
}) {
  const body = (
    <>
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </span>
      <span
        className={cn(
          "tabular mt-1 text-2xl font-semibold",
          highlight && "text-primary",
        )}
      >
        {value}
      </span>
      {sub ? (
        <span className="text-muted-foreground mt-0.5 text-xs">{sub}</span>
      ) : null}
    </>
  );
  const cls = "bg-surface flex flex-col rounded-xl border px-4 py-3";
  return href ? (
    <Link
      href={href}
      className={cn(cls, "hover:border-border-strong transition-colors")}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
