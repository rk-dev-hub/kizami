import type {
  ClockType,
  LeaveDayPart,
  LeaveType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dateOnlyStr,
  jstDateStr,
  jstMinutesOfDay,
  minutesToHm,
} from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";
import { requireAdmin } from "@/features/auth/rbac";
import { dayPartLabel, leaveTypeLabel } from "@/features/approval/labels";
import { clockTypeLabel } from "@/features/time-clock/labels";

export {
  dayPartLabel,
  leaveTypeLabel,
  statusLabel,
} from "@/features/approval/labels";

export type PendingItem = {
  kind: "CORRECTION" | "LEAVE" | "LEAVE_CANCELLATION";
  id: string;
  requesterId: string;
  requesterName: string;
  requesterCode: string;
  createdAt: Date;
  targetLabel: string; // 対象日 or 期間
  reason: string;
  detail: string; // 明細サマリ
  /** 対象日（期間の開始日）'YYYY-MM-DD' */
  targetDate: string;
  /** 打刻修正の明細（JST 'HH:mm'、翌日なら nextDay） */
  lines?: Array<{
    op: "ADD" | "UPDATE" | "DELETE";
    clockType: ClockType | null;
    time: string | null;
    nextDay: boolean;
    /** 変更・削除の対象になっている打刻の、今の時刻（JST 'HH:mm'） */
    before?: string | null;
  }>;
  /** 対象日の今の打刻（打刻修正のみ。変更前の確認用） */
  dayEvents?: Array<{ clockType: ClockType; time: string }>;
  /** 休暇の内容 */
  leave?: {
    type: LeaveType;
    dayPart: LeaveDayPart;
    startDate: string;
    endDate: string;
  };
};

/** ADMIN の承認待ち一覧（打刻修正 + 休暇 + 休暇取消）。作成が新しい順。 */
export async function listPending(): Promise<PendingItem[]> {
  await requireAdmin(); // 他ユーザーの申請を集約するため二重ガード
  const [corrections, leaves] = await Promise.all([
    prisma.correctionRequest.findMany({
      where: { status: "PENDING" },
      include: {
        lines: true,
        user: { select: { id: true, name: true, employeeCode: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: {
        user: { select: { id: true, name: true, employeeCode: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const items: PendingItem[] = [];
  const hmJst = (d: Date) =>
    new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16);

  // 打刻修正の対象日の、今の打刻（変更前）
  const dayEvents = corrections.length
    ? await prisma.timeClockEvent.findMany({
        where: {
          canceled: false,
          OR: corrections.map((c) => ({
            userId: c.userId,
            businessDate: c.targetDate,
          })),
        },
        orderBy: { occurredAt: "asc" },
        select: {
          id: true,
          userId: true,
          businessDate: true,
          type: true,
          occurredAt: true,
        },
      })
    : [];

  for (const c of corrections) {
    const events = dayEvents.filter(
      (e) =>
        e.userId === c.userId &&
        e.businessDate.getTime() === c.targetDate.getTime(),
    );
    items.push({
      kind: "CORRECTION",
      id: c.id,
      requesterId: c.user.id,
      requesterName: c.user.name,
      requesterCode: c.user.employeeCode,
      createdAt: c.createdAt,
      targetLabel: formatDateSlash(dateOnlyStr(c.targetDate)),
      reason: c.reason,
      targetDate: dateOnlyStr(c.targetDate),
      lines: c.lines.map((l) => {
        const t = l.occurredAt;
        const mins = t ? jstMinutesOfDay(t) : null;
        return {
          op: l.op,
          clockType: l.clockType,
          time: mins === null ? null : minutesToHm(mins).padStart(5, "0"),
          nextDay: t ? jstDateStr(t) > dateOnlyStr(c.targetDate) : false,
          before: l.targetEventId
            ? (() => {
                const ev = events.find((e) => e.id === l.targetEventId);
                return ev ? hmJst(ev.occurredAt) : null;
              })()
            : null,
        };
      }),
      dayEvents: events.map((e) => ({
        clockType: e.type,
        time: hmJst(e.occurredAt),
      })),
      detail: c.lines
        .map((l) => {
          const t = l.occurredAt
            ? new Date(l.occurredAt.getTime() + 9 * 3600_000)
                .toISOString()
                .slice(11, 16)
            : "";
          const type = l.clockType ? clockTypeLabel[l.clockType] : "";
          return `${opLabel(l.op)} ${type} ${t}`.trim();
        })
        .join(" / "),
    });
  }

  for (const l of leaves) {
    const period =
      dateOnlyStr(l.startDate) === dateOnlyStr(l.endDate)
        ? formatDateSlash(dateOnlyStr(l.startDate))
        : `${formatDateSlash(dateOnlyStr(l.startDate))}〜${formatDateSlash(dateOnlyStr(l.endDate))}`;
    items.push({
      kind: l.kind === "CANCELLATION" ? "LEAVE_CANCELLATION" : "LEAVE",
      id: l.id,
      requesterId: l.user.id,
      requesterName: l.user.name,
      requesterCode: l.user.employeeCode,
      createdAt: l.createdAt,
      targetLabel: period,
      reason: l.reason,
      targetDate: dateOnlyStr(l.startDate),
      leave: {
        type: l.type,
        dayPart: l.dayPart,
        startDate: dateOnlyStr(l.startDate),
        endDate: dateOnlyStr(l.endDate),
      },
      detail: `${leaveTypeLabel(l.type)} ${dayPartLabel(l.dayPart)}`,
    });
  }

  return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function countPending(): Promise<number> {
  await requireAdmin();
  const [c, l] = await Promise.all([
    prisma.correctionRequest.count({ where: { status: "PENDING" } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
  ]);
  return c + l;
}

function opLabel(op: string): string {
  return op === "ADD" ? "追加" : op === "UPDATE" ? "変更" : "削除";
}
