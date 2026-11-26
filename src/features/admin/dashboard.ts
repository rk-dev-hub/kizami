import { prisma } from "@/lib/prisma";
import { dateOnlyUtc, jstDateStr } from "@/lib/datetime";
import { addDaysStr } from "@/lib/date-range";
import { requireAdmin } from "@/features/auth/rbac";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { deriveState } from "@/features/time-clock/domain/state-machine";
import { daysBetween } from "@/features/insight/domain/forecast";
import { countPending } from "@/features/approval/usecase";
import { listAdminInsights } from "@/features/insight/admin-usecase";
import { getClosingIssues } from "@/features/insight/admin-usecase";

export type AdminDashboard = {
  today: string;
  presence: {
    working: number;
    onBreak: number;
    done: number;
    notIn: number;
    total: number;
  };
  pendingApprovals: number;
  insights: {
    warning: number;
    caution: number;
    info: number;
    top: Awaited<ReturnType<typeof listAdminInsights>>;
  };
  closing: {
    periodStart: string;
    periodEnd: string;
    daysLeft: number;
    missingPunchUsers: number;
    missingPunchDays: number;
    pendingInPeriod: number;
  };
};

export async function getAdminDashboard(
  now = new Date(),
): Promise<AdminDashboard> {
  await requireAdmin();
  const today = jstDateStr(now);
  const rule = await getDefaultWorkRule();
  const period = periodRangeFor(today, rule.closingDay);

  // 前日からの勤務（日をまたいだ勤務）も含めるため、前日と今日の打刻を読む
  const [users, events, pendingApprovals, insights, closing] =
    await Promise.all([
      prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      }),
      prisma.timeClockEvent.findMany({
        where: {
          canceled: false,
          businessDate: {
            gte: dateOnlyUtc(addDaysStr(today, -1)),
            lte: dateOnlyUtc(today),
          },
        },
        orderBy: { occurredAt: "asc" },
        select: {
          userId: true,
          type: true,
          businessDate: true,
          occurredAt: true,
        },
      }),
      countPending(),
      listAdminInsights("ACTIVE"),
      getClosingIssues(period.startStr),
    ]);

  const byUserDate = new Map<string, typeof events>();
  for (const e of events) {
    const k = `${e.userId}|${e.businessDate.toISOString().slice(0, 10)}`;
    byUserDate.set(k, [...(byUserDate.get(k) ?? []), e]);
  }
  const yesterday = addDaysStr(today, -1);
  const presence = {
    working: 0,
    onBreak: 0,
    done: 0,
    notIn: 0,
    total: users.length,
  };
  for (const u of users) {
    const prev = deriveState(byUserDate.get(`${u.id}|${yesterday}`) ?? []);
    const cur = deriveState(byUserDate.get(`${u.id}|${today}`) ?? []);
    // 前日からの勤務が続いていれば、そちらを優先する
    const state = prev === "WORKING" || prev === "ON_BREAK" ? prev : cur;
    if (state === "WORKING") presence.working++;
    else if (state === "ON_BREAK") presence.onBreak++;
    else if (state === "DONE") presence.done++;
    else presence.notIn++;
  }

  const open = insights.filter((i) => i.status === "OPEN");
  const missingUsers = closing.users.filter((u) =>
    u.items.some((i) => !i.note.includes("承認待ち")),
  );
  return {
    today,
    presence,
    pendingApprovals,
    insights: {
      warning: open.filter((i) => i.severity === "WARNING").length,
      caution: open.filter((i) => i.severity === "CAUTION").length,
      info: open.filter((i) => i.severity === "INFO").length,
      top: insights.slice(0, 5),
    },
    closing: {
      periodStart: period.startStr,
      periodEnd: period.endStr,
      daysLeft: daysBetween(today, period.endStr),
      missingPunchUsers: missingUsers.length,
      missingPunchDays: missingUsers.reduce(
        (s, u) =>
          s + u.items.filter((i) => !i.note.includes("承認待ち")).length,
        0,
      ),
      pendingInPeriod: closing.users.reduce(
        (s, u) => s + u.items.filter((i) => i.note.includes("承認待ち")).length,
        0,
      ),
    },
  };
}
