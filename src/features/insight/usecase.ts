import type {
  Insight,
  InsightSeverity,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dateOnlyStr,
  dateOnlyUtc,
  jstDateStr,
  jstDateTimeUtc,
} from "@/lib/datetime";
import { addDaysStr, eachDateStr } from "@/lib/date-range";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { getScheduledDays } from "@/features/calendar/usecase";
import { deriveState } from "@/features/time-clock/domain/state-machine";
import { detectInsights } from "./domain/detect";
import { agreementYearOf } from "./domain/forecast";
import { mergeInsightSettings } from "./domain/settings";
import type {
  DayRecord,
  DetectedInsight,
  InsightInput,
  LeaveGrantInfo,
  PaidLeaveDay,
} from "./domain/types";

type Db = Prisma.TransactionClient | typeof prisma;

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  INFO: 0,
  CAUTION: 1,
  WARNING: 2,
};

/** 所定終業がない日（休日出勤など）に「退勤忘れ」とみなす基準: 出勤から 9 時間。 */
const OFFDAY_EXPECTED_MINUTES = 9 * 60;
const STALE_SHIFT_MS = 12 * 3600_000;

/** 1 人分の検知入力を DB から組み立てる。 */
export async function buildInsightInput(
  userId: string,
  now: Date,
  db: Db = prisma,
): Promise<InsightInput> {
  const today = jstDateStr(now);
  const rule = await getDefaultWorkRule(db);
  const settingRows = await db.insightSetting.findMany();
  const settings = mergeInsightSettings(settingRows);

  const year = agreementYearOf(today, rule.agreementYearStartMonth);
  // 協定年度の開始と、6 締め期間ぶん（約 190 日前）の早いほうから読む
  const sixPeriodsAgo = addDaysStr(today, -200);
  const from = year.start < sixPeriodsAgo ? year.start : sixPeriodsAgo;
  const period = periodRangeFor(today, rule.closingDay);

  const [summaries, scheduledFuture, lastEvent, grants, paidLeaves, closed] =
    await Promise.all([
      db.dailySummary.findMany({
        where: {
          userId,
          workDate: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(today) },
        },
        orderBy: { workDate: "asc" },
      }),
      getScheduledDays(userId, today, period.endStr, db),
      db.timeClockEvent.findFirst({
        where: { userId, canceled: false },
        orderBy: { occurredAt: "desc" },
        select: { businessDate: true },
      }),
      db.leaveGrant.findMany({
        where: { userId },
        include: { ledgers: true },
      }),
      db.leaveRequest.findMany({
        where: {
          userId,
          kind: "TAKE",
          type: "PAID",
          status: { in: ["APPROVED", "PENDING"] },
          endDate: { gte: dateOnlyUtc(addDaysStr(today, -400)) },
        },
      }),
      db.closingPeriod.findFirst({
        where: { status: "CLOSED" },
        orderBy: { periodEnd: "desc" },
        select: { periodEnd: true },
      }),
    ]);

  const days: DayRecord[] = summaries.map((s) => ({
    date: dateOnlyStr(s.workDate),
    dayType: s.dayType,
    scheduledWorkday: s.dayType === "WORKDAY" && s.prescribedMinutes > 0,
    workedMinutes: s.workedMinutes,
    overStatutoryOtMinutes: s.overStatutoryOtMinutes,
    legalHolidayMinutes: s.legalHolidayMinutes,
    nightMinutes: s.nightMinutes,
    firstIn: s.firstIn,
    lastOut: s.lastOut,
    flags: Array.isArray(s.flags) ? (s.flags as string[]) : [],
  }));

  // 全日休暇の日は残りの労働日から除く
  const fullLeaveDates = new Set<string>();
  for (const l of paidLeaves) {
    if (l.status !== "APPROVED" || l.dayPart !== "FULL") continue;
    for (const d of eachDateStr(
      dateOnlyStr(l.startDate),
      dateOnlyStr(l.endDate),
    )) {
      fullLeaveDates.add(d);
    }
  }
  const futureWorkdaysInPeriod = scheduledFuture
    .filter((d) => d.isWorkday && !fullLeaveDates.has(d.date))
    .map((d) => d.date);

  // 勤務中の勤務（最新の打刻日の状態が勤務中/休憩中）
  let openShift: InsightInput["openShift"] = null;
  if (lastEvent) {
    const workDate = dateOnlyStr(lastEvent.businessDate);
    const events = await db.timeClockEvent.findMany({
      where: { userId, businessDate: lastEvent.businessDate, canceled: false },
      orderBy: { occurredAt: "asc" },
    });
    const state = deriveState(events);
    if (state === "WORKING" || state === "ON_BREAK") {
      const [sched] = await getScheduledDays(userId, workDate, workDate, db);
      const firstIn = events.find((e) => e.type === "CLOCK_IN")?.occurredAt;
      const expectedEnd = sched?.endTime
        ? jstDateTimeUtc(workDate, sched.endTime)
        : firstIn
          ? new Date(firstIn.getTime() + OFFDAY_EXPECTED_MINUTES * 60_000)
          : null;
      // 予定の終業から半日以上たった勤務は「退勤忘れ」ではなく「打刻漏れ」として扱う
      if (
        expectedEnd &&
        now.getTime() - expectedEnd.getTime() < STALE_SHIFT_MS
      ) {
        openShift = { workDate, expectedEnd };
      }
    }
  }

  const leaveGrants: LeaveGrantInfo[] = grants.map((g) => ({
    grantDate: dateOnlyStr(g.grantDate),
    expiryDate: dateOnlyStr(g.expiryDate),
    grantedDays: Number(g.grantedDays),
    remainingDays:
      Number(g.grantedDays) +
      g.ledgers
        .filter((l) => l.kind !== "GRANT")
        .reduce((s, l) => s + Number(l.days), 0),
  }));

  // 有給の取得日（休日は数えない）
  const paidLeaveDays: PaidLeaveDay[] = [];
  for (const l of paidLeaves) {
    const startStr = dateOnlyStr(l.startDate);
    const endStr = dateOnlyStr(l.endDate);
    const sched = await getScheduledDays(userId, startStr, endStr, db);
    for (const d of sched) {
      if (!d.isWorkday) continue;
      paidLeaveDays.push({
        date: d.date,
        days: l.dayPart === "FULL" ? 1 : 0.5,
      });
    }
  }

  return {
    now,
    today,
    rule: {
      closingDay: rule.closingDay,
      weekStartsOn: rule.weekStartsOn,
      agreementMonthlyLimitMinutes: rule.agreementMonthlyLimitMinutes,
      agreementYearlyLimitMinutes: rule.agreementYearlyLimitMinutes,
      specialClauseEnabled: rule.specialClauseEnabled,
      specialYearlyLimitMinutes: rule.specialYearlyLimitMinutes,
      agreementYearStartMonth: rule.agreementYearStartMonth,
    },
    days,
    futureWorkdaysInPeriod,
    openShift,
    leaveGrants,
    paidLeaveDays,
    closedThrough: closed ? dateOnlyStr(closed.periodEnd) : null,
    settings,
  };
}

export type RefreshResult = {
  /** 新しく出た、または重要度が上がった兆し */
  raised: Insight[];
  /** 今回の検知で残っている兆し（未対応・対応済み） */
  active: Insight[];
};

/**
 * 1 人分の兆しを検知して保存する。
 * - 同じ (userId, kind, periodKey) は更新する。対応済みでも重要度が上がったら未対応に戻す。
 * - 条件を満たさなくなった未対応・対応済みの兆しは解消にする。
 */
export async function refreshInsightsForUser(
  userId: string,
  now: Date = new Date(),
  db: Db = prisma,
): Promise<RefreshResult> {
  const input = await buildInsightInput(userId, now, db);
  const detected = detectInsights(input);
  return saveDetected(userId, detected, now, db);
}

export async function saveDetected(
  userId: string,
  detected: DetectedInsight[],
  now: Date,
  db: Db = prisma,
): Promise<RefreshResult> {
  const existing = await db.insight.findMany({
    where: { userId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
  });
  const raised: Insight[] = [];
  const active: Insight[] = [];
  const seen = new Set<string>();

  for (const d of detected) {
    const key = `${d.kind}|${d.periodKey}`;
    seen.add(key);
    const prev = await db.insight.findUnique({
      where: {
        userId_kind_periodKey: { userId, kind: d.kind, periodKey: d.periodKey },
      },
    });
    const facts = d.facts as unknown as Prisma.InputJsonValue;
    if (!prev) {
      const created = await db.insight.create({
        data: {
          userId,
          kind: d.kind,
          periodKey: d.periodKey,
          severity: d.severity,
          facts,
        },
      });
      raised.push(created);
      active.push(created);
      continue;
    }
    const escalated = SEVERITY_RANK[d.severity] > SEVERITY_RANK[prev.severity];
    // 解消済みの兆しが再び条件を満たしたら、未対応として出し直す
    const reopened = prev.status === "RESOLVED";
    const status = escalated || reopened ? "OPEN" : prev.status;
    const updated = await db.insight.update({
      where: { id: prev.id },
      data: {
        severity: d.severity,
        facts,
        status,
        resolvedAt: null,
        ...(escalated || reopened
          ? { ackAt: null, ackById: null, ackNote: null }
          : {}),
      },
    });
    if (escalated || reopened) raised.push(updated);
    active.push(updated);
  }

  const stale = existing.filter((e) => !seen.has(`${e.kind}|${e.periodKey}`));
  if (stale.length > 0) {
    await db.insight.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: "RESOLVED", resolvedAt: now },
    });
  }
  return { raised, active };
}

/** 有効な全ユーザーの兆しを更新する（ワーカー用）。 */
export async function refreshAllInsights(
  now: Date = new Date(),
): Promise<Array<{ userId: string } & RefreshResult>> {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  const out: Array<{ userId: string } & RefreshResult> = [];
  for (const u of users) {
    out.push({ userId: u.id, ...(await refreshInsightsForUser(u.id, now)) });
  }
  return out;
}
