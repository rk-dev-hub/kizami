import type { Insight, InsightKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dateOnlyStr,
  dateOnlyUtc,
  jstDateStr,
  jstWeekday,
} from "@/lib/datetime";
import { addDaysStr } from "@/lib/date-range";
import type { SessionUser } from "@/features/auth/rbac";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { weekStartOf } from "@/features/aggregation/domain/week";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { getScheduledDays } from "@/features/calendar/usecase";
import { getLeaveBalance } from "@/features/leave/usecase";
import type { PendingItem } from "@/features/approval/usecase";
import {
  extractRequestFlags,
  requestFlagLabel,
  type RequestFlag,
} from "@/features/approval/domain/request-flags";
import { EMPLOYEE_FACING } from "@/features/insight/domain/settings";
import type { InsightFacts } from "@/features/insight/domain/types";
import {
  adminExplanationTemplate,
  employeeNoteTemplate,
  insightKindLabel,
  type InsightExplanation,
} from "@/features/insight/templates";
import { callKizami, isKizamiAiEnabled } from "./client";
import {
  ANSWER_QUESTION_PROMPT,
  CLOSING_MESSAGE_PROMPT,
  DAILY_NOTES_PROMPT,
  DRAFT_FROM_TEXT_PROMPT,
  EXPLAIN_INSIGHT_PROMPT,
  SUMMARIZE_REQUEST_PROMPT,
  WEEKLY_DIGEST_PROMPT,
} from "./prompts";
import {
  answerQuestionSchema,
  clip,
  closingMessageSchema,
  dailyNotesSchema,
  draftFromTextSchema,
  explainInsightSchema,
  summarizeRequestSchema,
  weeklyDigestSchema,
  type DraftFromText,
} from "./schemas";

export type Source = "ai" | "template";

const DAY = 24 * 60 * 60;
const SEVERITY_ORDER = { WARNING: 0, CAUTION: 1, INFO: 2 } as const;

function actorOf(u: SessionUser) {
  return { id: u.id, role: u.role } as const;
}

function factsOf(insight: Insight): InsightFacts {
  return insight.facts as unknown as InsightFacts;
}

/** AI の出力にある {name} を表示名に置き換え、それ以外の波括弧の差し込みは消す。 */
export function fillName(text: string, name: string): string {
  return text.replaceAll("{name}", name).replaceAll(/\{[a-z_]+\}/gi, "");
}

// ---------------------------------------------------------------- 気づきのひとこと（従業員）

export type EmployeeNote = {
  insightId: string;
  kind: InsightKind;
  text: string;
  action: { label: string; href: string } | null;
  source: Source;
};

function noteAction(facts: InsightFacts): EmployeeNote["action"] {
  switch (facts.kind) {
    case "MISSING_PUNCH":
      return {
        label: "修正する",
        href: `/requests?tab=correction&date=${facts.metrics.date}`,
      };
    case "PAID_LEAVE_OBLIGATION":
    case "PAID_LEAVE_EXPIRING":
      return { label: "休暇を申請する", href: "/requests?tab=leave" };
    case "WEEKLY_40H_NEAR":
      return { label: "勤怠を見る", href: "/attendance" };
    default:
      return null;
  }
}

/** 本人向けの未対応の兆しを、最大 3 件のひとことにする。 */
export async function getEmployeeNotes(
  user: SessionUser,
): Promise<EmployeeNote[]> {
  const insights = await prisma.insight.findMany({
    where: {
      userId: user.id,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      kind: { in: [...EMPLOYEE_FACING] },
    },
  });
  const top = insights
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.periodKey.localeCompare(a.periodKey),
    )
    .slice(0, 3);
  if (top.length === 0) return [];

  const base = top.map((i) => ({
    insightId: i.id,
    kind: i.kind,
    text: employeeNoteTemplate(factsOf(i)),
    action: noteAction(factsOf(i)),
    source: "template" as Source,
  }));

  const res = await callKizami({
    feature: "DAILY_NOTES",
    user: actorOf(user),
    system: DAILY_NOTES_PROMPT,
    data: {
      today: jstDateStr(new Date()),
      items: top.map((i) => ({
        id: i.id,
        kindLabel: insightKindLabel[i.kind],
        ...factsOf(i),
      })),
    },
    schema: dailyNotesSchema,
    effort: "low",
    maxTokens: 2000,
    cacheTtlSeconds: DAY,
  });
  if (!res.ok) return base;
  const byId = new Map(res.data.notes.map((n) => [n.insightId, n.text]));
  return base.map((b) => {
    const text = byId.get(b.insightId);
    return text ? { ...b, text: clip(text, 80), source: "ai" } : b;
  });
}

// ---------------------------------------------------------------- 兆しの説明（管理者）

export async function explainInsight(
  admin: SessionUser,
  insight: Insight,
  displayName: string,
): Promise<InsightExplanation & { source: Source }> {
  const facts = factsOf(insight);
  const fallback = {
    ...adminExplanationTemplate(facts, displayName),
    source: "template" as const,
  };
  const res = await callKizami({
    feature: "EXPLAIN_INSIGHT",
    user: actorOf(admin),
    system: EXPLAIN_INSIGHT_PROMPT,
    data: {
      kindLabel: insightKindLabel[insight.kind],
      subject: "対象者",
      ...facts,
    },
    schema: explainInsightSchema,
    effort: "low",
    maxTokens: 3000,
    cacheTtlSeconds: 7 * DAY,
  });
  if (!res.ok) return fallback;
  return {
    explanation: clip(res.data.explanation, 160),
    suggestedActions: res.data.suggestedActions
      .slice(0, 3)
      .map((a) => clip(a, 40)),
    messageDraft: clip(fillName(res.data.messageDraft, displayName), 260),
    source: "ai",
  };
}

// ---------------------------------------------------------------- 承認の要約（管理者）

export type RequestSummary = {
  summary: string;
  cautions: string[];
  flags: RequestFlag[];
  source: Source;
};

async function flagsForPending(item: PendingItem): Promise<RequestFlag[]> {
  const rule = await getDefaultWorkRule();
  const today = jstDateStr(new Date());
  const period = periodRangeFor(item.targetDate, rule.closingDay);
  const [sched] = await getScheduledDays(
    item.requesterId,
    item.targetDate,
    item.targetDate,
  );
  const previousCorrections = item.lines
    ? await prisma.correctionRequest.count({
        where: {
          userId: item.requesterId,
          targetDate: dateOnlyUtc(item.targetDate),
          id: { not: item.id },
          status: { in: ["APPROVED", "PENDING", "REJECTED"] },
        },
      })
    : 0;
  let leave: { type: string; days: number } | undefined;
  let leaveBalance: number | null = null;
  if (item.leave && item.kind === "LEAVE") {
    const days = await getScheduledDays(
      item.requesterId,
      item.leave.startDate,
      item.leave.endDate,
    );
    const workdays = days.filter((d) => d.isWorkday).length;
    leave = {
      type: item.leave.type,
      days: item.leave.dayPart === "FULL" ? workdays : workdays > 0 ? 0.5 : 0,
    };
    leaveBalance = await getLeaveBalance(item.requesterId, today);
  }
  return extractRequestFlags({
    today,
    submittedOn: jstDateStr(item.createdAt),
    targetDate: item.targetDate,
    periodEnd: period.endStr,
    lines: item.lines,
    leave,
    schedule:
      sched?.startTime && sched.endTime
        ? { start: sched.startTime, end: sched.endTime }
        : null,
    previousCorrections,
    leaveBalance,
  });
}

export async function summarizePending(
  admin: SessionUser,
  item: PendingItem,
): Promise<RequestSummary> {
  const flags = await flagsForPending(item);
  const kindLabel =
    item.kind === "CORRECTION"
      ? "打刻修正"
      : item.kind === "LEAVE"
        ? "休暇"
        : "休暇の取消";
  const fallback: RequestSummary = {
    summary: `${item.targetLabel} の${kindLabel}（${item.detail}）`,
    cautions: flags.map((f) => requestFlagLabel[f]),
    flags,
    source: "template",
  };
  const res = await callKizami({
    feature: "SUMMARIZE_REQUEST",
    user: actorOf(admin),
    system: SUMMARIZE_REQUEST_PROMPT,
    data: {
      request: {
        kind: kindLabel,
        target: item.targetLabel,
        detail: item.detail,
        lines: item.lines,
        leave: item.leave,
        reason: item.reason,
      },
      flags: flags.map((f) => requestFlagLabel[f]),
    },
    schema: summarizeRequestSchema,
    effort: "low",
    maxTokens: 2000,
    cacheTtlSeconds: 30 * DAY,
  });
  if (!res.ok) return fallback;
  return {
    summary: clip(res.data.summary, 70),
    // 注意点はコードの抽出と同じ件数に限る（AI が新しい注意点を足しても捨てる）
    cautions:
      res.data.cautions.length === flags.length
        ? res.data.cautions.map((c) => clip(c, 50))
        : fallback.cautions,
    flags,
    source: "ai",
  };
}

// ---------------------------------------------------------------- 締めアシストの確認メッセージ（管理者）

export type ClosingTarget = {
  userId: string;
  name: string;
  items: Array<{ date: string; note: string }>;
};

export async function draftClosingMessage(
  admin: SessionUser,
  target: ClosingTarget,
  deadline: string,
): Promise<{ subject: string; body: string; source: Source }> {
  const lines = target.items.map((i) => `・${i.date} ${i.note}`).join("\n");
  const fallback = {
    subject: "勤怠の確認のお願い",
    body: `${target.name}さん、お疲れさまです。月次締めの前に、次の勤怠の確認をお願いします。\n${lines}\n${deadline} までに打刻修正の申請などで対応してください。`,
    source: "template" as const,
  };
  const res = await callKizami({
    feature: "CLOSING_MESSAGE",
    user: actorOf(admin),
    system: CLOSING_MESSAGE_PROMPT,
    data: { items: target.items, deadline },
    schema: closingMessageSchema,
    effort: "low",
    maxTokens: 2000,
    cacheTtlSeconds: DAY,
  });
  if (!res.ok) return fallback;
  return {
    subject: clip(res.data.subject, 40),
    body: clip(fillName(res.data.body, target.name), 400),
    source: "ai",
  };
}

// ---------------------------------------------------------------- 話して申請（従業員）

export type DraftResponse =
  { ok: true; draft: DraftFromText } | { ok: false; message: string };

export async function draftFromText(
  user: SessionUser,
  text: string,
  previousQuestion?: string,
): Promise<DraftResponse> {
  if (!isKizamiAiEnabled()) {
    return {
      ok: false,
      message:
        "Kizami の AI 機能は設定されていません。フォームから入力してください。",
    };
  }
  const today = jstDateStr(new Date());
  const [pattern, events] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { workPattern: { select: { days: true } } },
    }),
    prisma.timeClockEvent.findMany({
      where: {
        userId: user.id,
        canceled: false,
        businessDate: { gte: dateOnlyUtc(addDaysStr(today, -14)) },
      },
      orderBy: { occurredAt: "asc" },
      select: { type: true, occurredAt: true, businessDate: true },
    }),
  ]);
  const balance = await getLeaveBalance(user.id, today);
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const recent = new Map<string, string[]>();
  for (const e of events) {
    const d = dateOnlyStr(e.businessDate);
    const t = new Date(e.occurredAt.getTime() + 9 * 3600_000)
      .toISOString()
      .slice(11, 16);
    recent.set(d, [...(recent.get(d) ?? []), `${e.type}@${t}`]);
  }
  const res = await callKizami({
    feature: "DRAFT_FROM_TEXT",
    user: actorOf(user),
    system: DRAFT_FROM_TEXT_PROMPT,
    data: {
      today,
      todayWeekday: WD[jstWeekday(today)],
      workPattern: pattern.workPattern.days
        .filter((d) => d.isWorkday)
        .map((d) => ({
          weekday: WD[d.weekday],
          start: d.startTime,
          end: d.endTime,
        })),
      recentPunches: [...recent.entries()].map(([date, punches]) => ({
        date,
        punches,
      })),
      paidLeaveBalanceDays: balance,
      previousQuestion: previousQuestion ?? null,
    },
    userText: text,
    schema: draftFromTextSchema,
    effort: "medium",
    maxTokens: 4000,
  });
  if (!res.ok) {
    return {
      ok: false,
      message:
        res.reason === "RATE_LIMITED"
          ? "Kizami の利用回数の上限に達しました。しばらくしてからお試しください。"
          : "今は Kizami が使えません。フォームから入力してください。",
    };
  }
  const draft = res.data.result;
  // 日付は今日から前後 62 日以内に限る
  const inRange = (d: string) =>
    d >= addDaysStr(today, -62) && d <= addDaysStr(today, 62);
  if (
    draft.kind === "CORRECTION" &&
    (!inRange(draft.workDate) || draft.lines.length === 0)
  ) {
    return {
      ok: false,
      message:
        "日付をうまく読み取れませんでした。フォームから入力してください。",
    };
  }
  if (
    draft.kind === "LEAVE" &&
    (!inRange(draft.startDate) ||
      !inRange(draft.endDate) ||
      draft.startDate > draft.endDate)
  ) {
    return {
      ok: false,
      message:
        "日付をうまく読み取れませんでした。フォームから入力してください。",
    };
  }
  if (draft.kind === "CORRECTION")
    return {
      ok: true,
      draft: {
        ...draft,
        reason: clip(draft.reason, 60),
        lines: draft.lines.slice(0, 6),
      },
    };
  if (draft.kind === "LEAVE") {
    const single = draft.dayPart !== "FULL";
    return {
      ok: true,
      draft: {
        ...draft,
        endDate: single ? draft.startDate : draft.endDate,
        reason: clip(draft.reason, 60),
      },
    };
  }
  if (draft.kind === "CLARIFY")
    return {
      ok: true,
      draft: {
        ...draft,
        question: clip(draft.question, 80),
        choices: draft.choices.slice(0, 4).map((c) => clip(c, 30)),
      },
    };
  return { ok: true, draft: { ...draft, message: clip(draft.message, 80) } };
}

// ---------------------------------------------------------------- 質問に答える（従業員）

export type AnswerResponse =
  | { ok: true; answer: string; basis: string[]; outOfScope: boolean }
  | { ok: false; message: string };

export async function answerQuestion(
  user: SessionUser,
  question: string,
): Promise<AnswerResponse> {
  if (!isKizamiAiEnabled()) {
    return { ok: false, message: "Kizami の AI 機能は設定されていません。" };
  }
  const rule = await getDefaultWorkRule();
  const today = jstDateStr(new Date());
  const period = periodRangeFor(today, rule.closingDay);
  const week = weekStartOf(today, rule.weekStartsOn);
  const [summaries, me, grants, pendingCorrections, pendingLeaves] =
    await Promise.all([
      prisma.dailySummary.findMany({
        where: {
          userId: user.id,
          workDate: {
            gte: dateOnlyUtc(period.startStr < week ? period.startStr : week),
            lte: dateOnlyUtc(today),
          },
        },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { workPattern: { select: { name: true, days: true } } },
      }),
      prisma.leaveGrant.findMany({
        where: { userId: user.id },
        include: { ledgers: true },
      }),
      prisma.correctionRequest.count({
        where: { userId: user.id, status: "PENDING" },
      }),
      prisma.leaveRequest.count({
        where: { userId: user.id, status: "PENDING" },
      }),
    ]);
  const inPeriod = summaries.filter(
    (s) => dateOnlyStr(s.workDate) >= period.startStr,
  );
  const inWeek = summaries.filter(
    (s) => dateOnlyStr(s.workDate) >= week && s.dayType !== "LEGAL_HOLIDAY",
  );
  const sum = (
    rows: typeof summaries,
    k:
      | "workedMinutes"
      | "overStatutoryOtMinutes"
      | "withinStatutoryOtMinutes"
      | "nightMinutes"
      | "legalHolidayMinutes"
      | "breakMinutes",
  ) => rows.reduce((s, r) => s + r[k], 0);
  const balance = await getLeaveBalance(user.id, today);
  const WD = ["日", "月", "火", "水", "木", "金", "土"];

  const res = await callKizami({
    feature: "ANSWER_QUESTION",
    user: actorOf(user),
    system: ANSWER_QUESTION_PROMPT,
    data: {
      today,
      今期の集計: {
        期間: `${period.startStr}〜${period.endStr}`,
        出勤日数: inPeriod.filter((s) => s.workedMinutes > 0).length,
        労働時間_分: sum(inPeriod, "workedMinutes"),
        法定内残業_分: sum(inPeriod, "withinStatutoryOtMinutes"),
        法定外残業_分: sum(inPeriod, "overStatutoryOtMinutes"),
        深夜労働_分: sum(inPeriod, "nightMinutes"),
        法定休日労働_分: sum(inPeriod, "legalHolidayMinutes"),
      },
      今週: {
        開始日: week,
        労働時間_分: sum(inWeek, "workedMinutes"),
        週の上限_分: 2400,
      },
      有給: {
        残日数: balance,
        付与: grants.map((g) => ({
          付与日: dateOnlyStr(g.grantDate),
          失効日: dateOnlyStr(g.expiryDate),
          付与日数: Number(g.grantedDays),
          残り:
            Number(g.grantedDays) +
            g.ledgers
              .filter((l) => l.kind !== "GRANT")
              .reduce((s, l) => s + Number(l.days), 0),
        })),
      },
      申請中: { 打刻修正: pendingCorrections, 休暇: pendingLeaves },
      就業規則: {
        締め日: rule.closingDay === 31 ? "月末" : `${rule.closingDay}日`,
        所定労働_分: rule.standardDailyMinutes,
        深夜時間帯: `${rule.nightStart}〜${rule.nightEnd}`,
        割増率: {
          時間外: rule.overtimeRatePct,
          月60時間超: rule.over60hRatePct,
          深夜: rule.nightRatePct,
          法定休日: rule.legalHolidayRatePct,
        },
        半休: "午前休は所定の前半、午後休は所定の後半を休む",
        法定休日の曜日: WD[rule.legalHolidayWeekday],
      },
      勤務パターン: {
        名前: me.workPattern.name,
        曜日別: me.workPattern.days
          .filter((d) => d.isWorkday)
          .map(
            (d) =>
              `${WD[d.weekday]} ${d.startTime}〜${d.endTime} 休憩${d.breakMinutes}分`,
          ),
      },
    },
    userText: question,
    schema: answerQuestionSchema,
    effort: "medium",
    maxTokens: 4000,
  });
  if (!res.ok) {
    return {
      ok: false,
      message:
        res.reason === "RATE_LIMITED"
          ? "Kizami の利用回数の上限に達しました。しばらくしてからお試しください。"
          : "今は Kizami が使えません。時間をおいてお試しください。",
    };
  }
  return {
    ok: true,
    answer: clip(res.data.answer, 500),
    basis: res.data.basis.slice(0, 5).map((b) => clip(b, 30)),
    outOfScope: res.data.outOfScope,
  };
}

// ---------------------------------------------------------------- 週次ダイジェスト（ワーカー、既定オフ）

export async function summarizeWeeklyDigest(
  rows: Array<{ alias: string; kind: InsightKind; severity: string }>,
): Promise<string | null> {
  const res = await callKizami({
    feature: "WEEKLY_DIGEST",
    user: null,
    system: WEEKLY_DIGEST_PROMPT,
    data: {
      items: rows.map((r) => ({ ...r, kindLabel: insightKindLabel[r.kind] })),
    },
    schema: weeklyDigestSchema,
    effort: "low",
    maxTokens: 2000,
  });
  return res.ok ? clip(res.data.summary, 260) : null;
}
