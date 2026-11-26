import { periodRangeFor } from "@/features/aggregation/domain/period";
import { addDaysStr } from "@/lib/date-range";
import type { DayRecord } from "./types";

// 残業の予測式。すべて分単位の整数。

/** その日の勤務が確定しているか（過去日、または今日で退勤済み）。 */
export function isCompleted(day: DayRecord, today: string): boolean {
  return day.date < today || (day.date === today && day.lastOut !== null);
}

/** 直近 n 件の完了した所定労働日の 1 日平均（法定外残業）。件数が minDays 未満なら null。 */
export function recentDailyOvertimeAverage(
  days: DayRecord[],
  today: string,
  n: number,
  minDays = 3,
): number | null {
  const recent = days
    .filter((d) => d.scheduledWorkday && isCompleted(d, today))
    .slice(-n);
  if (recent.length < minDays) return null;
  const sum = recent.reduce((s, d) => s + d.overStatutoryOtMinutes, 0);
  return sum / recent.length;
}

/**
 * 月末（締め期間末）の法定外残業の予測。
 * = 期間の実績 ＋ 残りの所定労働日数 × 直近の 1 日平均。
 * futureWorkdaysInPeriod は今日以降の所定労働日。今日の勤務が確定していれば今日は除く。
 */
export function forecastPeriodOvertime(params: {
  days: DayRecord[];
  today: string;
  closingDay: number;
  futureWorkdaysInPeriod: string[];
  recentDays: number;
}): {
  periodStart: string;
  periodEnd: string;
  actualMinutes: number;
  forecastMinutes: number;
  remainingWorkdays: number;
  dailyAverageMinutes: number | null;
} {
  const { startStr, endStr } = periodRangeFor(params.today, params.closingDay);
  const inPeriod = params.days.filter(
    (d) => d.date >= startStr && d.date <= endStr,
  );
  const actualMinutes = inPeriod.reduce(
    (s, d) => s + d.overStatutoryOtMinutes,
    0,
  );
  const todayRecord = inPeriod.find((d) => d.date === params.today);
  const todayDone =
    todayRecord !== undefined && isCompleted(todayRecord, params.today);
  const remainingWorkdays = params.futureWorkdaysInPeriod.filter(
    (d) =>
      d <= endStr && (d > params.today || (d === params.today && !todayDone)),
  ).length;
  const avg = recentDailyOvertimeAverage(
    params.days,
    params.today,
    params.recentDays,
  );
  const forecastMinutes =
    avg === null
      ? actualMinutes
      : Math.round(actualMinutes + remainingWorkdays * avg);
  return {
    periodStart: startStr,
    periodEnd: endStr,
    actualMinutes,
    forecastMinutes,
    remainingWorkdays,
    dailyAverageMinutes: avg === null ? null : Math.round(avg),
  };
}

/** 協定年度（起算月の 1 日から 1 年間）。 */
export function agreementYearOf(
  today: string,
  startMonth: number,
): { start: string; end: string } {
  const [y, m] = today.split("-").map((x) => Number.parseInt(x, 10));
  const startYear = m >= startMonth ? y : y - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const nextStart = `${startYear + 1}-${String(startMonth).padStart(2, "0")}-01`;
  return { start, end: addDaysStr(nextStart, -1) };
}

/**
 * 年の法定外残業の予測。
 * = 協定年度の実績 ＋ 残りの月数 × 直近 3 締め期間（完了分）の月平均。
 */
export function forecastYearOvertime(params: {
  days: DayRecord[];
  today: string;
  closingDay: number;
  startMonth: number;
}): {
  yearStart: string;
  yearEnd: string;
  actualMinutes: number;
  forecastMinutes: number;
  monthlyAverageMinutes: number | null;
} {
  const { start, end } = agreementYearOf(params.today, params.startMonth);
  const actualMinutes = params.days
    .filter((d) => d.date >= start && d.date <= params.today)
    .reduce((s, d) => s + d.overStatutoryOtMinutes, 0);

  // 直近 3 つの完了した締め期間
  const current = periodRangeFor(params.today, params.closingDay);
  const periods: Array<{ start: string; end: string }> = [];
  let cursor = addDaysStr(current.startStr, -1);
  for (let i = 0; i < 3; i++) {
    const p = periodRangeFor(cursor, params.closingDay);
    if (p.endStr < start) break;
    periods.push({ start: p.startStr, end: p.endStr });
    cursor = addDaysStr(p.startStr, -1);
  }
  const monthlyTotals = periods.map((p) =>
    params.days
      .filter((d) => d.date >= p.start && d.date <= p.end)
      .reduce((s, d) => s + d.overStatutoryOtMinutes, 0),
  );
  const monthlyAverage =
    monthlyTotals.length === 0
      ? null
      : monthlyTotals.reduce((s, x) => s + x, 0) / monthlyTotals.length;

  const remainingDays = Math.max(0, daysBetween(params.today, end));
  const remainingMonths = remainingDays / 30.44;
  const forecastMinutes =
    monthlyAverage === null
      ? actualMinutes
      : Math.round(actualMinutes + remainingMonths * monthlyAverage);
  return {
    yearStart: start,
    yearEnd: end,
    actualMinutes,
    forecastMinutes,
    monthlyAverageMinutes:
      monthlyAverage === null ? null : Math.round(monthlyAverage),
  };
}

/** a から b までの日数（b − a）。 */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}
