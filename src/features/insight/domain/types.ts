import type {
  DayType,
  InsightKind,
  InsightSeverity,
} from "@/generated/prisma/client";

// 兆しの検知は AI に依存しない純粋関数で行う。

/** 検知に使う 1 日分の記録（DailySummary ＋ 所定の情報）。 */
export type DayRecord = {
  /** 'YYYY-MM-DD'（勤務日） */
  date: string;
  dayType: DayType;
  /** 勤務パターン・カレンダー上の所定労働日か */
  scheduledWorkday: boolean;
  workedMinutes: number;
  overStatutoryOtMinutes: number;
  legalHolidayMinutes: number;
  nightMinutes: number;
  firstIn: Date | null;
  lastOut: Date | null;
  flags: string[];
};

/** 有給の付与 1 件（台帳から計算した未消化残つき）。 */
export type LeaveGrantInfo = {
  grantDate: string;
  expiryDate: string;
  grantedDays: number;
  remainingDays: number;
};

/** 有給の取得（承認済み・申請中）1 日分。 */
export type PaidLeaveDay = { date: string; days: number };

export type InsightRule = {
  closingDay: number;
  weekStartsOn: number;
  agreementMonthlyLimitMinutes: number;
  agreementYearlyLimitMinutes: number;
  specialClauseEnabled: boolean;
  specialYearlyLimitMinutes: number;
  agreementYearStartMonth: number;
};

export type InsightInput = {
  /** 基準日時（JST の今日は today） */
  now: Date;
  today: string;
  rule: InsightRule;
  /** 協定年度の開始（最大 13 か月前）から今日までの日次記録（昇順・欠けた日は記録なし） */
  days: DayRecord[];
  /** 今日以降、今の締め期間の終わりまでの所定労働日（今日を含む） */
  futureWorkdaysInPeriod: string[];
  /** 勤務中（退勤前）の勤務。所定終業がない日は null */
  openShift: { workDate: string; expectedEnd: Date } | null;
  leaveGrants: LeaveGrantInfo[];
  paidLeaveDays: PaidLeaveDay[];
  /** この日付以前は締め済み（打刻漏れの対象外） */
  closedThrough: string | null;
  settings: InsightSettings;
};

export type InsightFacts = {
  kind: InsightKind;
  severity: InsightSeverity;
  /** 数値・日付など。AI とテンプレートに渡す（氏名は入れない） */
  metrics: Record<string, number | string>;
  period: { label: string; from: string; to: string };
  recentDays?: Array<{ date: string; note: string }>;
};

export type DetectedInsight = {
  kind: InsightKind;
  severity: InsightSeverity;
  periodKey: string;
  facts: InsightFacts;
};

/** 兆しの種類ごとの設定（閾値）。 */
export type InsightSettings = {
  [K in InsightKind]: { enabled: boolean } & InsightParams[K];
};

export type InsightParams = {
  MISSING_PUNCH: { lookbackDays: number };
  FORGOT_CLOCK_OUT: { graceMinutes: number };
  MONTHLY_OVERTIME_PACE: {
    cautionPct: number;
    warningPct: number;
    recentDays: number;
  };
  YEARLY_OVERTIME_PACE: { cautionPct: number; warningPct: number };
  LEGAL_CAP_RISK: { monthlyMinutes: number; averageMinutes: number };
  CONSECUTIVE_WORKDAYS: { cautionDays: number; warningDays: number };
  SHORT_REST_INTERVAL: {
    intervalMinutes: number;
    windowDays: number;
    minCount: number;
  };
  LATE_NIGHT_STREAK: { minDays: number };
  BREAK_SHORTAGE_REPEAT: { windowDays: number; minCount: number };
  PAID_LEAVE_OBLIGATION: { cautionDaysLeft: number; warningDaysLeft: number };
  PAID_LEAVE_EXPIRING: { withinDays: number };
  WEEKLY_40H_NEAR: { remainingMinutes: number };
};
