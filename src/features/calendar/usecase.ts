import type { DayType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc, jstWeekday } from "@/lib/datetime";
import { eachDateStr } from "@/lib/date-range";
import { resolveDayType } from "@/features/calendar/domain/day-type";
import { getDefaultWorkRule } from "@/features/attendance/usecase";

type Db = Prisma.TransactionClient | typeof prisma;

export type ScheduledDay = {
  date: string;
  dayType: DayType;
  /** 日区分が平日で、勤務パターン上も勤務日 */
  isWorkday: boolean;
  /** 所定の始業・終業（勤務日のみ） */
  startTime?: string;
  endTime?: string;
};

/** ユーザーの期間内の所定（日区分・勤務日・始業終業）を返す。 */
export async function getScheduledDays(
  userId: string,
  fromStr: string,
  toStr: string,
  db: Db = prisma,
): Promise<ScheduledDay[]> {
  if (fromStr > toStr) return [];
  const rule = await getDefaultWorkRule(db);
  const from = dateOnlyUtc(fromStr);
  const to = dateOnlyUtc(toStr);
  const [user, holidays, overrides] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { workPattern: { include: { days: true } } },
    }),
    db.holiday.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true },
    }),
    db.calendarDay.findMany({
      where: { workRuleId: rule.id, date: { gte: from, lte: to } },
    }),
  ]);
  const holidaySet = new Set(holidays.map((h) => dateOnlyStr(h.date)));
  const overrideByDate = new Map(
    overrides.map((o) => [dateOnlyStr(o.date), o]),
  );
  return eachDateStr(fromStr, toStr).map((date) => {
    const weekday = jstWeekday(date);
    const ov = overrideByDate.get(date);
    const { dayType } = resolveDayType({
      weekday,
      legalHolidayWeekday: rule.legalHolidayWeekday,
      prescribedHolidayWeekdays: rule.prescribedHolidayWeekdays,
      isHolidayDate: holidaySet.has(date),
      override: ov ? { dayType: ov.dayType, isHoliday: ov.isHoliday } : null,
    });
    const pd = user.workPattern.days.find((x) => x.weekday === weekday);
    const isWorkday = dayType === "WORKDAY" && (pd?.isWorkday ?? false);
    return {
      date,
      dayType,
      isWorkday,
      startTime: isWorkday ? pd?.startTime : undefined,
      endTime: isWorkday ? pd?.endTime : undefined,
    };
  });
}
