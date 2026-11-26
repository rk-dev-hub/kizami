import { requireAdmin } from "@/features/auth/rbac";
import { formatDateJa, formatDateSlash } from "@/lib/date-range";
import { listPeriods, getClosingPrecheck } from "@/features/closing/usecase";
import {
  employeeActionItems,
  getClosingIssues,
  listAdminInsights,
} from "@/features/insight/admin-usecase";
import { isKizamiAiEnabled } from "@/features/kizami/client";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { KizamiHeading } from "@/components/kizami/note";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { CloseButton, ReopenButton, RecomputeForm } from "./close-form";
import { ClosingAssist } from "./closing-assist";

export const metadata = { title: "月次締め — Kizami" };
export const dynamic = "force-dynamic";

export default async function ClosingPage() {
  await requireAdmin();
  const periods = await listPeriods(6);
  // 直近のオープン中の期間を対象にする
  const target = periods.find((p) => p.status === "OPEN") ?? periods[0];
  const [precheck, issues, insights] = await Promise.all([
    getClosingPrecheck(target.periodStart),
    getClosingIssues(target.periodStart),
    listAdminInsights("ACTIVE"),
  ]);
  const assistTargets = issues.users.filter(
    (u) => employeeActionItems(u.items).length > 0,
  );
  const missingDays = precheck.usersMissingClock.reduce(
    (s, u) => s + u.days,
    0,
  );
  const warnings = insights.filter(
    (i) => i.severity === "WARNING" && i.status === "OPEN",
  ).length;

  const checks = [
    {
      label: "承認待ちの打刻修正",
      count: precheck.pendingCorrections,
      href: "/approvals",
    },
    {
      label: "承認待ちの休暇",
      count: precheck.pendingLeaves,
      href: "/approvals",
    },
    { label: "打刻漏れ", count: missingDays, href: "#assist" },
    {
      label: "未対応の警告の兆し",
      count: warnings,
      href: "/admin/insights?severity=WARNING",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="月次締め"
        description="締め日で区切った期間を確定します。締めた後の変更には再オープンが必要です。"
      />

      <Card>
        <CardHeader>
          <CardTitle>
            締め前のチェック（{formatDateJa(precheck.periodStart)}〜
            {formatDateJa(precheck.periodEnd)}）
          </CardTitle>
          <CardDescription>
            すべて 0 件になってから締めるのがおすすめです。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {checks.map((c) => (
              <li key={c.label}>
                <Link
                  href={c.href}
                  className="hover:bg-surface-2 flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-5 place-items-center rounded-full border text-[11px]",
                      c.count === 0
                        ? "bg-success border-success text-[var(--surface)]"
                        : "border-warning text-warning",
                    )}
                  >
                    {c.count === 0 ? "✓" : "!"}
                  </span>
                  <span className="flex-1">{c.label}</span>
                  <span
                    className={cn(
                      "tabular font-medium",
                      c.count > 0 && "text-warning",
                    )}
                  >
                    {c.count} 件
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <RecomputeForm
            defaultFrom={precheck.periodStart}
            defaultTo={precheck.periodEnd}
          />
        </CardContent>
      </Card>

      <Card id="assist">
        <CardHeader>
          <KizamiHeading hint="本人に確認してほしいことを、まとめて伝えます">
            締めアシスト
          </KizamiHeading>
        </CardHeader>
        <CardContent>
          <ClosingAssist
            periodStart={precheck.periodStart}
            defaultDeadline={precheck.periodEnd}
            targetCount={assistTargets.length}
            aiEnabled={isKizamiAiEnabled()}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>期間</CardTitle>
        </CardHeader>
        <ul className="divide-y border-t">
          {periods.map((p) => (
            <li
              key={p.periodStart}
              data-period-start={p.periodStart}
              className="flex flex-wrap items-center gap-3 px-5 py-3"
            >
              <span className="tabular w-48 text-sm">
                {formatDateSlash(p.periodStart)}〜{formatDateSlash(p.periodEnd)}
              </span>
              <Badge variant={p.status === "CLOSED" ? "success" : "outline"}>
                {p.status === "CLOSED" ? "締め済み" : "オープン"}
              </Badge>
              <span className="text-muted-foreground flex-1 text-xs">
                {p.closedAt
                  ? `${new Date(p.closedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} に締め`
                  : ""}
              </span>
              {p.status === "OPEN" ? (
                <CloseButton
                  periodStart={p.periodStart}
                  periodEnd={p.periodEnd}
                />
              ) : (
                <ReopenButton periodStart={p.periodStart} />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
