import { periodRangeFor } from "@/features/aggregation/domain/period";
import { weekStartOf } from "@/features/aggregation/domain/week";
import { addDaysStr } from "@/lib/date-range";
import { diffMinutes } from "@/lib/datetime";
import {
  agreementYearOf,
  daysBetween,
  forecastPeriodOvertime,
  forecastYearOvertime,
  isCompleted,
} from "./forecast";
import type {
  DayRecord,
  DetectedInsight,
  InsightFacts,
  InsightInput,
} from "./types";
import type { InsightSeverity } from "@/generated/prisma/client";

// 1 人分の兆しを検知する純粋関数。

const MISSING_FLAGS = new Set([
  "MISSING_CLOCK_IN",
  "MISSING_CLOCK_OUT",
  "BREAK_MISMATCH",
]);

/** 法定の絶対上限（時間外＋休日労働、分）。設定にしない。 */
export const LEGAL_MONTHLY_CAP_MINUTES = 100 * 60;
export const LEGAL_AVERAGE_CAP_MINUTES = 80 * 60;

export function detectInsights(input: InsightInput): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  const s = input.settings;
  const push = (d: DetectedInsight | DetectedInsight[] | null) => {
    if (d === null) return;
    if (Array.isArray(d)) out.push(...d);
    else out.push(d);
  };
  if (s.MISSING_PUNCH.enabled) push(detectMissingPunch(input));
  if (s.FORGOT_CLOCK_OUT.enabled) push(detectForgotClockOut(input));
  if (s.MONTHLY_OVERTIME_PACE.enabled) push(detectMonthlyPace(input));
  if (s.YEARLY_OVERTIME_PACE.enabled) push(detectYearlyPace(input));
  if (s.LEGAL_CAP_RISK.enabled) push(detectLegalCap(input));
  if (s.CONSECUTIVE_WORKDAYS.enabled) push(detectConsecutive(input));
  if (s.SHORT_REST_INTERVAL.enabled) push(detectShortRest(input));
  if (s.LATE_NIGHT_STREAK.enabled) push(detectLateNight(input));
  if (s.BREAK_SHORTAGE_REPEAT.enabled) push(detectBreakShortage(input));
  if (s.PAID_LEAVE_OBLIGATION.enabled) push(detectLeaveObligation(input));
  if (s.PAID_LEAVE_EXPIRING.enabled) push(detectLeaveExpiring(input));
  if (s.WEEKLY_40H_NEAR.enabled) push(detectWeekly40h(input));
  return out;
}

function make(
  facts: Omit<InsightFacts, "severity" | "kind">,
  kind: InsightFacts["kind"],
  severity: InsightSeverity,
  periodKey: string,
): DetectedInsight {
  return { kind, severity, periodKey, facts: { kind, severity, ...facts } };
}

// ---------------------------------------------------------------- 打刻漏れ

export function detectMissingPunch(input: InsightInput): DetectedInsight[] {
  const { lookbackDays } = input.settings.MISSING_PUNCH;
  const from = addDaysStr(input.today, -lookbackDays);
  return input.days
    .filter(
      (d) =>
        d.date >= from &&
        d.date < input.today &&
        d.date !== input.openShift?.workDate &&
        (input.closedThrough === null || d.date > input.closedThrough) &&
        d.flags.some((f) => MISSING_FLAGS.has(f)),
    )
    .map((d) => {
      const missing = d.flags.filter((f) => MISSING_FLAGS.has(f));
      return make(
        {
          metrics: { date: d.date, missing: missing.join(",") },
          period: { label: d.date, from: d.date, to: d.date },
        },
        "MISSING_PUNCH",
        "CAUTION",
        d.date,
      );
    });
}

// ---------------------------------------------------------------- 退勤忘れ

export function detectForgotClockOut(
  input: InsightInput,
): DetectedInsight | null {
  const shift = input.openShift;
  if (!shift) return null;
  const overdue = diffMinutes(shift.expectedEnd, input.now);
  if (overdue < input.settings.FORGOT_CLOCK_OUT.graceMinutes) return null;
  return make(
    {
      metrics: {
        date: shift.workDate,
        expectedEnd: shift.expectedEnd.toISOString(),
        overdueMinutes: overdue,
      },
      period: {
        label: shift.workDate,
        from: shift.workDate,
        to: shift.workDate,
      },
    },
    "FORGOT_CLOCK_OUT",
    "CAUTION",
    shift.workDate,
  );
}

// ---------------------------------------------------------------- 残業ペース

function bySeverity(
  value: number,
  limit: number,
  cautionPct: number,
  warningPct: number,
): InsightSeverity | null {
  if (limit <= 0) return null;
  const pct = (value / limit) * 100;
  if (pct >= warningPct) return "WARNING";
  if (pct >= cautionPct) return "CAUTION";
  return null;
}

export function detectMonthlyPace(input: InsightInput): DetectedInsight | null {
  const cfg = input.settings.MONTHLY_OVERTIME_PACE;
  const f = forecastPeriodOvertime({
    days: input.days,
    today: input.today,
    closingDay: input.rule.closingDay,
    futureWorkdaysInPeriod: input.futureWorkdaysInPeriod,
    recentDays: cfg.recentDays,
  });
  const limit = input.rule.agreementMonthlyLimitMinutes;
  const severity = bySeverity(
    f.forecastMinutes,
    limit,
    cfg.cautionPct,
    cfg.warningPct,
  );
  if (!severity || f.forecastMinutes === 0) return null;
  return make(
    {
      metrics: {
        actualMinutes: f.actualMinutes,
        forecastMinutes: f.forecastMinutes,
        limitMinutes: limit,
        remainingWorkdays: f.remainingWorkdays,
        dailyAverageMinutes: f.dailyAverageMinutes ?? 0,
      },
      period: {
        label: `${f.periodStart}〜${f.periodEnd}`,
        from: f.periodStart,
        to: f.periodEnd,
      },
    },
    "MONTHLY_OVERTIME_PACE",
    severity,
    f.periodStart,
  );
}

export function detectYearlyPace(input: InsightInput): DetectedInsight | null {
  const cfg = input.settings.YEARLY_OVERTIME_PACE;
  const f = forecastYearOvertime({
    days: input.days,
    today: input.today,
    closingDay: input.rule.closingDay,
    startMonth: input.rule.agreementYearStartMonth,
  });
  const limit = input.rule.specialClauseEnabled
    ? input.rule.specialYearlyLimitMinutes
    : input.rule.agreementYearlyLimitMinutes;
  const severity = bySeverity(
    f.forecastMinutes,
    limit,
    cfg.cautionPct,
    cfg.warningPct,
  );
  if (!severity || f.forecastMinutes === 0) return null;
  return make(
    {
      metrics: {
        actualMinutes: f.actualMinutes,
        forecastMinutes: f.forecastMinutes,
        limitMinutes: limit,
        monthlyAverageMinutes: f.monthlyAverageMinutes ?? 0,
      },
      period: {
        label: `${f.yearStart}〜${f.yearEnd}`,
        from: f.yearStart,
        to: f.yearEnd,
      },
    },
    "YEARLY_OVERTIME_PACE",
    severity,
    `FY${f.yearStart}`,
  );
}

// ---------------------------------------------------------------- 法定上限

/** 締め期間ごとの「時間外＋休日労働」（分）。新しい順に count 期間ぶん。 */
export function overtimePlusHolidayByPeriod(
  days: DayRecord[],
  today: string,
  closingDay: number,
  count: number,
): Array<{ start: string; end: string; minutes: number }> {
  const out: Array<{ start: string; end: string; minutes: number }> = [];
  let cursor = today;
  for (let i = 0; i < count; i++) {
    const p = periodRangeFor(cursor, closingDay);
    const minutes = days
      .filter((d) => d.date >= p.startStr && d.date <= p.endStr)
      .reduce(
        (s, d) => s + d.overStatutoryOtMinutes + d.legalHolidayMinutes,
        0,
      );
    out.push({ start: p.startStr, end: p.endStr, minutes });
    cursor = addDaysStr(p.startStr, -1);
  }
  return out;
}

export function detectLegalCap(input: InsightInput): DetectedInsight | null {
  const cfg = input.settings.LEGAL_CAP_RISK;
  const periods = overtimePlusHolidayByPeriod(
    input.days,
    input.today,
    input.rule.closingDay,
    6,
  );
  const current = periods[0];
  let maxAvg = 0;
  let maxAvgMonths = 0;
  for (let n = 2; n <= 6; n++) {
    const slice = periods.slice(0, n);
    const avg = Math.round(slice.reduce((s, p) => s + p.minutes, 0) / n);
    if (avg > maxAvg) {
      maxAvg = avg;
      maxAvgMonths = n;
    }
  }
  if (current.minutes < cfg.monthlyMinutes && maxAvg < cfg.averageMinutes) {
    return null;
  }
  return make(
    {
      metrics: {
        monthMinutes: current.minutes,
        monthCapMinutes: LEGAL_MONTHLY_CAP_MINUTES,
        maxAverageMinutes: maxAvg,
        averageMonths: maxAvgMonths,
        averageCapMinutes: LEGAL_AVERAGE_CAP_MINUTES,
      },
      period: {
        label: `${current.start}〜${current.end}`,
        from: current.start,
        to: current.end,
      },
    },
    "LEGAL_CAP_RISK",
    "WARNING",
    current.start,
  );
}

// ---------------------------------------------------------------- 連続勤務・インターバル・深夜

function workedOn(d: DayRecord | undefined): boolean {
  return d !== undefined && (d.workedMinutes > 0 || d.firstIn !== null);
}

export function detectConsecutive(input: InsightInput): DetectedInsight | null {
  const cfg = input.settings.CONSECUTIVE_WORKDAYS;
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  // 今日まだ働いていなければ昨日から数える
  let cursor = workedOn(byDate.get(input.today))
    ? input.today
    : addDaysStr(input.today, -1);
  let count = 0;
  let start = cursor;
  while (workedOn(byDate.get(cursor)) && count < 400) {
    count++;
    start = cursor;
    cursor = addDaysStr(cursor, -1);
  }
  const severity: InsightSeverity | null =
    count >= cfg.warningDays
      ? "WARNING"
      : count >= cfg.cautionDays
        ? "CAUTION"
        : null;
  if (!severity) return null;
  const end = addDaysStr(start, count - 1);
  return make(
    {
      metrics: { days: count, startDate: start },
      period: { label: `${start}〜${end}`, from: start, to: end },
    },
    "CONSECUTIVE_WORKDAYS",
    severity,
    start,
  );
}

export function detectShortRest(input: InsightInput): DetectedInsight | null {
  const cfg = input.settings.SHORT_REST_INTERVAL;
  const from = addDaysStr(input.today, -cfg.windowDays);
  const worked = input.days.filter((d) => d.date >= from && d.firstIn !== null);
  const shortDays: Array<{ date: string; note: string }> = [];
  for (let i = 1; i < worked.length; i++) {
    const prevOut = worked[i - 1].lastOut;
    const nextIn = worked[i].firstIn;
    if (!prevOut || !nextIn) continue;
    const gap = diffMinutes(prevOut, nextIn);
    if (gap >= 0 && gap < cfg.intervalMinutes) {
      shortDays.push({ date: worked[i].date, note: `interval=${gap}` });
    }
  }
  if (shortDays.length < cfg.minCount) return null;
  const week = weekStartOf(input.today, input.rule.weekStartsOn);
  return make(
    {
      metrics: {
        count: shortDays.length,
        windowDays: cfg.windowDays,
        intervalMinutes: cfg.intervalMinutes,
        shortestMinutes: Math.min(
          ...shortDays.map((d) => Number(d.note.split("=")[1])),
        ),
      },
      period: { label: `${from}〜${input.today}`, from, to: input.today },
      recentDays: shortDays,
    },
    "SHORT_REST_INTERVAL",
    "CAUTION",
    `W${week}`,
  );
}

export function detectLateNight(input: InsightInput): DetectedInsight | null {
  const cfg = input.settings.LATE_NIGHT_STREAK;
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  let best: { start: string; end: string; count: number } | null = null;
  // 直近 14 日の中で、今日までに終わる最新の連続を探す
  let run = 0;
  let runStart = "";
  for (let i = 14; i >= 0; i--) {
    const date = addDaysStr(input.today, -i);
    const d = byDate.get(date);
    if (d && d.nightMinutes > 0) {
      if (run === 0) runStart = date;
      run++;
      if (run >= cfg.minDays) best = { start: runStart, end: date, count: run };
    } else {
      run = 0;
    }
  }
  if (!best) return null;
  // 連続が 3 日以上前に途切れているなら対象外
  if (daysBetween(best.end, input.today) > 2) return null;
  return make(
    {
      metrics: { days: best.count, startDate: best.start },
      period: {
        label: `${best.start}〜${best.end}`,
        from: best.start,
        to: best.end,
      },
      recentDays: Array.from({ length: best.count }, (_, i) => {
        const date = addDaysStr(best.start, i);
        return {
          date,
          note: `night=${byDate.get(date)?.nightMinutes ?? 0}`,
        };
      }),
    },
    "LATE_NIGHT_STREAK",
    "CAUTION",
    best.start,
  );
}

export function detectBreakShortage(
  input: InsightInput,
): DetectedInsight | null {
  const cfg = input.settings.BREAK_SHORTAGE_REPEAT;
  const from = addDaysStr(input.today, -cfg.windowDays);
  const hits = input.days.filter(
    (d) =>
      d.date >= from &&
      isCompleted(d, input.today) &&
      d.flags.includes("BREAK_SHORTAGE"),
  );
  if (hits.length < cfg.minCount) return null;
  const week = weekStartOf(input.today, input.rule.weekStartsOn);
  return make(
    {
      metrics: { count: hits.length, windowDays: cfg.windowDays },
      period: { label: `${from}〜${input.today}`, from, to: input.today },
      recentDays: hits.map((d) => ({ date: d.date, note: "BREAK_SHORTAGE" })),
    },
    "BREAK_SHORTAGE_REPEAT",
    "CAUTION",
    `W${week}`,
  );
}

// ---------------------------------------------------------------- 有給

/** 年 5 日の取得義務（労基法 39 条 7 項）。年 10 日以上付与された人が対象。 */
export function detectLeaveObligation(input: InsightInput): DetectedInsight[] {
  const cfg = input.settings.PAID_LEAVE_OBLIGATION;
  const out: DetectedInsight[] = [];
  for (const g of input.leaveGrants) {
    if (g.grantedDays < 10) continue;
    const deadline = addDaysStr(addYears(g.grantDate, 1), -1);
    if (input.today < g.grantDate || input.today > deadline) continue;
    const taken = input.paidLeaveDays
      .filter((d) => d.date >= g.grantDate && d.date <= deadline)
      .reduce((s, d) => s + d.days, 0);
    if (taken >= 5) continue;
    const daysLeft = daysBetween(input.today, deadline);
    const severity: InsightSeverity | null =
      daysLeft <= cfg.warningDaysLeft
        ? "WARNING"
        : daysLeft <= cfg.cautionDaysLeft
          ? "CAUTION"
          : null;
    if (!severity) continue;
    out.push(
      make(
        {
          metrics: {
            takenDays: taken,
            requiredDays: 5,
            shortageDays: 5 - taken,
            deadline,
            daysLeft,
          },
          period: {
            label: `${g.grantDate}〜${deadline}`,
            from: g.grantDate,
            to: deadline,
          },
        },
        "PAID_LEAVE_OBLIGATION",
        severity,
        g.grantDate,
      ),
    );
  }
  return out;
}

export function detectLeaveExpiring(input: InsightInput): DetectedInsight[] {
  const { withinDays } = input.settings.PAID_LEAVE_EXPIRING;
  const limit = addDaysStr(input.today, withinDays);
  const byExpiry = new Map<string, number>();
  for (const g of input.leaveGrants) {
    if (g.remainingDays <= 0) continue;
    if (g.expiryDate < input.today || g.expiryDate > limit) continue;
    byExpiry.set(
      g.expiryDate,
      (byExpiry.get(g.expiryDate) ?? 0) + g.remainingDays,
    );
  }
  return [...byExpiry.entries()].map(([expiry, days]) =>
    make(
      {
        metrics: {
          expiringDays: days,
          expiryDate: expiry,
          daysLeft: daysBetween(input.today, expiry),
        },
        period: { label: expiry, from: input.today, to: expiry },
      },
      "PAID_LEAVE_EXPIRING",
      "INFO",
      expiry,
    ),
  );
}

// ---------------------------------------------------------------- 週 40 時間

export const WEEKLY_LIMIT_MINUTES = 40 * 60;

export function detectWeekly40h(input: InsightInput): DetectedInsight | null {
  const { remainingMinutes } = input.settings.WEEKLY_40H_NEAR;
  const week = weekStartOf(input.today, input.rule.weekStartsOn);
  const weekEnd = addDaysStr(week, 6);
  const worked = input.days
    .filter(
      (d) =>
        d.date >= week &&
        d.date <= input.today &&
        d.dayType !== "LEGAL_HOLIDAY",
    )
    .reduce((s, d) => s + d.workedMinutes, 0);
  const remaining = WEEKLY_LIMIT_MINUTES - worked;
  if (remaining <= 0 || remaining > remainingMinutes) return null;
  return make(
    {
      metrics: {
        workedMinutes: worked,
        limitMinutes: WEEKLY_LIMIT_MINUTES,
        remainingMinutes: remaining,
      },
      period: { label: `${week}〜${weekEnd}`, from: week, to: weekEnd },
    },
    "WEEKLY_40H_NEAR",
    "INFO",
    `W${week}`,
  );
}

function addYears(dateStr: string, years: number): string {
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  // 2/29 付与は翌年 2/28 → 3/1 にずれないよう月末にクランプ
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export { agreementYearOf };
