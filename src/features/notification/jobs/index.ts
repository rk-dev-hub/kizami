import { prisma } from "@/lib/prisma";
import { addDaysStr, formatDateJa } from "@/lib/date-range";
import { jstDateStr, jstDateTimeUtc, jstWeekday } from "@/lib/datetime";
import { env } from "@/lib/env";
import { deriveState } from "@/features/time-clock/domain/state-machine";
import {
  refreshAllInsights,
  refreshInsightsForUser,
} from "@/features/insight/usecase";
import { ADMIN_FACING } from "@/features/insight/domain/settings";
import type { InsightFacts } from "@/features/insight/domain/types";
import {
  employeeNoteTemplate,
  insightKindLabel,
} from "@/features/insight/templates";
import { summarizeWeeklyDigest } from "@/features/kizami/tasks";
import { notify, sendPendingEmails } from "../usecase";

// ワーカー（pnpm worker）が 5 分ごとに呼ぶ定期処理。各ジョブは JobRun で実行済みかを判定し、
// 通知は dedupeKey で重複を防ぐ。

type Job = {
  name: string;
  /** 実行する時刻（JST 'HH:mm'）。null なら毎回。 */
  at: string | null;
  /** 曜日の指定（0=日）。null なら毎日。 */
  weekday?: number | null;
  run: (now: Date) => Promise<void>;
};

async function activeAdmins() {
  return prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
}

/** 勤務中のまま所定終業＋猶予を過ぎた人に通知する。 */
export async function forgotClockOutJob(now: Date): Promise<void> {
  const since = new Date(now.getTime() - 36 * 3600_000);
  const recent = await prisma.timeClockEvent.findMany({
    where: {
      type: "CLOCK_IN",
      canceled: false,
      occurredAt: { gte: since },
      user: { status: "ACTIVE" },
    },
    select: { userId: true, businessDate: true },
    distinct: ["userId"],
    orderBy: { occurredAt: "desc" },
  });
  for (const r of recent) {
    const events = await prisma.timeClockEvent.findMany({
      where: {
        userId: r.userId,
        businessDate: r.businessDate,
        canceled: false,
      },
      orderBy: { occurredAt: "asc" },
    });
    const state = deriveState(events);
    if (state !== "WORKING" && state !== "ON_BREAK") continue;
    const { active } = await refreshInsightsForUser(r.userId, now);
    const hit = active.find((i) => i.kind === "FORGOT_CLOCK_OUT");
    if (!hit) continue;
    await notify({
      userId: r.userId,
      kind: "FORGOT_CLOCK_OUT",
      title: "退勤を忘れていませんか?",
      body: employeeNoteTemplate(hit.facts as unknown as InsightFacts),
      linkPath: "/",
      dedupeKey: `FORGOT_CLOCK_OUT:${r.userId}:${hit.periodKey}`,
    });
  }
}

/** 全員の兆しを更新し、新しい警告を管理者に知らせる。 */
export async function detectInsightsJob(now: Date): Promise<void> {
  const results = await refreshAllInsights(now);
  const admins = await activeAdmins();
  const warnings = results.flatMap((r) =>
    r.raised.filter(
      (i) => i.severity === "WARNING" && ADMIN_FACING.has(i.kind),
    ),
  );
  if (warnings.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: warnings.map((w) => w.userId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  for (const w of warnings) {
    for (const a of admins) {
      await notify({
        userId: a.id,
        kind: "INSIGHT_ALERT",
        title: `${nameOf.get(w.userId) ?? ""}さん: ${insightKindLabel[w.kind]}`,
        body: "警告レベルの兆しを検知しました。兆しレポートで内容と対応案を確認してください。",
        linkPath: `/admin/insights?status=OPEN`,
        dedupeKey: `INSIGHT:${w.id}:${w.severity}:${a.id}`,
      });
    }
  }
}

/** 朝のお知らせ: 本人には前日の打刻漏れ、管理者には承認待ちの件数。 */
export async function morningDigestJob(now: Date): Promise<void> {
  const today = jstDateStr(now);
  const yesterday = addDaysStr(today, -1);
  const missing = await prisma.insight.findMany({
    where: {
      kind: "MISSING_PUNCH",
      periodKey: yesterday,
      status: "OPEN",
      user: { status: "ACTIVE" },
    },
  });
  for (const m of missing) {
    await notify({
      userId: m.userId,
      kind: "MISSING_PUNCH",
      title: `${formatDateJa(yesterday)} の打刻漏れ`,
      body: employeeNoteTemplate(m.facts as unknown as InsightFacts),
      linkPath: `/requests?tab=correction&date=${yesterday}`,
      dedupeKey: `MISSING_PUNCH:${m.userId}:${yesterday}`,
    });
  }
  const [c, l] = await Promise.all([
    prisma.correctionRequest.count({ where: { status: "PENDING" } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
  ]);
  const pending = c + l;
  if (pending === 0) return;
  for (const a of await activeAdmins()) {
    await notify({
      userId: a.id,
      kind: "PENDING_APPROVALS",
      title: `承認待ちが ${pending} 件あります`,
      body: `打刻修正 ${c} 件・休暇 ${l} 件が承認待ちです。`,
      linkPath: "/approvals",
      dedupeKey: `PENDING_APPROVALS:${a.id}:${today}`,
    });
  }
}

/** 週次ダイジェスト（管理者）。AI の要約は KIZAMI_AI_DIGEST=1 のときだけ。 */
export async function weeklyDigestJob(now: Date): Promise<void> {
  const today = jstDateStr(now);
  const open = await prisma.insight.findMany({
    where: {
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      kind: { in: [...ADMIN_FACING] },
    },
    include: { user: { select: { id: true } } },
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
  });
  if (open.length === 0) return;
  const counts = { WARNING: 0, CAUTION: 0, INFO: 0 };
  for (const i of open) counts[i.severity]++;
  let body = `未対応の兆し: 警告 ${counts.WARNING} 件・注意 ${counts.CAUTION} 件・情報 ${counts.INFO} 件。`;
  if (env.KIZAMI_AI_DIGEST) {
    const alias = new Map<string, string>();
    for (const i of open) {
      if (!alias.has(i.userId))
        alias.set(
          i.userId,
          `従業員${String.fromCharCode(65 + (alias.size % 26))}${alias.size >= 26 ? alias.size : ""}`,
        );
    }
    const summary = await summarizeWeeklyDigest(
      open.map((i) => ({
        alias: alias.get(i.userId)!,
        kind: i.kind,
        severity: i.severity,
      })),
    );
    if (summary) body += `\n\nKizami のまとめ: ${summary}`;
  }
  for (const a of await activeAdmins()) {
    await notify({
      userId: a.id,
      kind: "WEEKLY_DIGEST",
      title: "今週の兆しのまとめ",
      body,
      linkPath: "/admin/insights",
      dedupeKey: `WEEKLY_DIGEST:${a.id}:${today}`,
    });
  }
}

export const JOBS: Job[] = [
  { name: "forgot-clock-out", at: null, run: forgotClockOutJob },
  { name: "detect-insights", at: "06:00", run: detectInsightsJob },
  { name: "morning-digest", at: "08:00", run: morningDigestJob },
  {
    name: "weekly-admin-digest",
    at: "08:30",
    weekday: 1,
    run: weeklyDigestJob,
  },
  {
    name: "send-emails",
    at: null,
    run: async () => void (await sendPendingEmails()),
  },
];

/** 今の時刻で実行すべきか（今日の実行時刻を過ぎていて、今日まだ実行していない）。 */
export function isDue(job: Job, now: Date, lastRunAt: Date | null): boolean {
  if (job.at === null) return true;
  const today = jstDateStr(now);
  if (
    job.weekday !== undefined &&
    job.weekday !== null &&
    jstWeekday(today) !== job.weekday
  ) {
    return false;
  }
  const scheduled = jstDateTimeUtc(today, job.at);
  if (now < scheduled) return false;
  return lastRunAt === null || lastRunAt < scheduled;
}

/** 実行時刻を迎えたジョブを順に実行する。1 つが失敗しても他は続ける。 */
export async function runDueJobs(now: Date = new Date()): Promise<string[]> {
  const ran: string[] = [];
  for (const job of JOBS) {
    const last = await prisma.jobRun.findUnique({ where: { name: job.name } });
    if (!isDue(job, now, last?.lastRunAt ?? null)) continue;
    try {
      await job.run(now);
      await prisma.jobRun.upsert({
        where: { name: job.name },
        create: { name: job.name, lastRunAt: now, lastStatus: "OK" },
        update: { lastRunAt: now, lastStatus: "OK", lastError: null },
      });
      ran.push(job.name);
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 500) : "unknown";
      console.error(`[worker] ${job.name} failed: ${message}`);
      await prisma.jobRun.upsert({
        where: { name: job.name },
        create: {
          name: job.name,
          lastRunAt: now,
          lastStatus: "ERROR",
          lastError: message,
        },
        update: { lastRunAt: now, lastStatus: "ERROR", lastError: message },
      });
    }
  }
  return ran;
}
