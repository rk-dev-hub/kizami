import type { DayType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc, jstDateStr } from "@/lib/datetime";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { getScheduledDays } from "@/features/calendar/usecase";
import { weekDatesOf } from "@/features/aggregation/domain/week";

export const WEEKLY_LIMIT_MINUTES = 40 * 60;

export type HomeContext = {
  today: string;
  dayType: DayType;
  holidayName: string | null;
  schedule: { start: string; end: string } | null;
  night: { start: string; end: string };
  week: { from: string; to: string; workedMinutes: number };
};

/** 打刻画面の周辺情報（日区分・所定・今週の実働）。 */
export async function getHomeContext(
  userId: string,
  now = new Date(),
): Promise<HomeContext> {
  const today = jstDateStr(now);
  const rule = await getDefaultWorkRule();
  const week = weekDatesOf(today, rule.weekStartsOn);
  const [[sched], holiday, weekRows] = await Promise.all([
    getScheduledDays(userId, today, today),
    prisma.holiday.findUnique({
      where: { date: dateOnlyUtc(today) },
      select: { name: true },
    }),
    prisma.dailySummary.findMany({
      where: {
        userId,
        workDate: { gte: dateOnlyUtc(week[0]), lte: dateOnlyUtc(week[6]) },
      },
      select: { workedMinutes: true },
    }),
  ]);
  return {
    today,
    dayType: sched.dayType,
    holidayName: holiday?.name ?? null,
    schedule:
      sched.isWorkday && sched.startTime && sched.endTime
        ? { start: sched.startTime, end: sched.endTime }
        : null,
    night: { start: rule.nightStart, end: rule.nightEnd },
    week: {
      from: week[0],
      to: week[6],
      workedMinutes: weekRows.reduce((s, r) => s + r.workedMinutes, 0),
    },
  };
}
