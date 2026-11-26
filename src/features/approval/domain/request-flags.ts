import { hmToMinutes } from "@/lib/datetime";
import { daysBetween } from "@/features/insight/domain/forecast";

// 承認の判断材料になる注意点を、決定的に抽出する（Kizami は言い換えだけを担当する）。

export type RequestFlag =
  | "NEAR_CLOSING"
  | "REPEATED_CORRECTION"
  | "LEAVE_BALANCE_SHORT"
  | "FAR_FROM_SCHEDULE"
  | "LATE_NIGHT_TIME"
  | "LATE_SUBMISSION";

export const requestFlagLabel: Record<RequestFlag, string> = {
  NEAR_CLOSING: "締め日が近い期間の申請です",
  REPEATED_CORRECTION: "同じ日への修正申請が以前にもあります",
  LEAVE_BALANCE_SHORT: "有給の残日数が足りません",
  FAR_FROM_SCHEDULE: "所定の始業・終業から 3 時間以上離れた時刻です",
  LATE_NIGHT_TIME: "深夜帯（22 時〜5 時）の時刻を含みます",
  LATE_SUBMISSION: "対象日から 14 日以上たってからの申請です",
};

export type RequestFlagInput = {
  today: string;
  submittedOn: string;
  targetDate: string;
  periodEnd: string;
  lines?: Array<{
    clockType: string | null;
    time: string | null;
    nextDay: boolean;
  }>;
  leave?: { type: string; days: number };
  schedule: { start: string; end: string } | null;
  previousCorrections: number;
  leaveBalance: number | null;
};

const FAR_MINUTES = 180;

export function extractRequestFlags(input: RequestFlagInput): RequestFlag[] {
  const flags: RequestFlag[] = [];
  const daysToClose = daysBetween(input.today, input.periodEnd);
  if (
    input.targetDate <= input.periodEnd &&
    daysToClose >= 0 &&
    daysToClose <= 3
  ) {
    flags.push("NEAR_CLOSING");
  }
  if (input.lines && input.previousCorrections > 0)
    flags.push("REPEATED_CORRECTION");
  if (
    input.leave?.type === "PAID" &&
    input.leaveBalance !== null &&
    input.leave.days > input.leaveBalance
  ) {
    flags.push("LEAVE_BALANCE_SHORT");
  }
  if (input.lines) {
    let far = false;
    let night = false;
    for (const l of input.lines) {
      if (!l.time) continue;
      const m = hmToMinutes(l.time) + (l.nextDay ? 24 * 60 : 0);
      if (l.nextDay || m >= 22 * 60 || m < 5 * 60) night = true;
      if (input.schedule) {
        const ref =
          l.clockType === "CLOCK_IN"
            ? hmToMinutes(input.schedule.start)
            : l.clockType === "CLOCK_OUT"
              ? hmToMinutes(input.schedule.end)
              : null;
        if (ref !== null && Math.abs(m - ref) >= FAR_MINUTES) far = true;
      }
    }
    if (far) flags.push("FAR_FROM_SCHEDULE");
    if (night) flags.push("LATE_NIGHT_TIME");
  }
  if (daysBetween(input.targetDate, input.submittedOn) >= 14)
    flags.push("LATE_SUBMISSION");
  return flags;
}
