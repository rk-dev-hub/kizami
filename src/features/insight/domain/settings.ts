import { z } from "zod";
import type { InsightKind } from "@/generated/prisma/client";
import type { InsightSettings } from "./types";

// 兆しの検知の既定値。管理画面（兆しレポート › 検知の設定）で変更できる。

const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const insightParamSchemas = {
  MISSING_PUNCH: z.object({ lookbackDays: int(1, 62) }),
  FORGOT_CLOCK_OUT: z.object({ graceMinutes: int(30, 720) }),
  MONTHLY_OVERTIME_PACE: z.object({
    cautionPct: int(10, 200),
    warningPct: int(10, 300),
    recentDays: int(3, 30),
  }),
  YEARLY_OVERTIME_PACE: z.object({
    cautionPct: int(10, 200),
    warningPct: int(10, 300),
  }),
  LEGAL_CAP_RISK: z.object({
    monthlyMinutes: int(60, 6000),
    averageMinutes: int(60, 4800),
  }),
  CONSECUTIVE_WORKDAYS: z.object({
    cautionDays: int(2, 30),
    warningDays: int(2, 60),
  }),
  SHORT_REST_INTERVAL: z.object({
    intervalMinutes: int(60, 1440),
    windowDays: int(1, 62),
    minCount: int(1, 31),
  }),
  LATE_NIGHT_STREAK: z.object({ minDays: int(2, 31) }),
  BREAK_SHORTAGE_REPEAT: z.object({
    windowDays: int(1, 62),
    minCount: int(1, 31),
  }),
  PAID_LEAVE_OBLIGATION: z.object({
    cautionDaysLeft: int(1, 365),
    warningDaysLeft: int(1, 365),
  }),
  PAID_LEAVE_EXPIRING: z.object({ withinDays: int(1, 365) }),
  WEEKLY_40H_NEAR: z.object({ remainingMinutes: int(30, 2400) }),
} satisfies Record<InsightKind, z.ZodType>;

export const DEFAULT_INSIGHT_SETTINGS: InsightSettings = {
  MISSING_PUNCH: { enabled: true, lookbackDays: 31 },
  FORGOT_CLOCK_OUT: { enabled: true, graceMinutes: 180 },
  MONTHLY_OVERTIME_PACE: {
    enabled: true,
    cautionPct: 80,
    warningPct: 100,
    recentDays: 10,
  },
  YEARLY_OVERTIME_PACE: { enabled: true, cautionPct: 80, warningPct: 100 },
  LEGAL_CAP_RISK: { enabled: true, monthlyMinutes: 4800, averageMinutes: 4500 },
  CONSECUTIVE_WORKDAYS: { enabled: true, cautionDays: 6, warningDays: 12 },
  SHORT_REST_INTERVAL: {
    enabled: true,
    intervalMinutes: 660,
    windowDays: 14,
    minCount: 3,
  },
  LATE_NIGHT_STREAK: { enabled: true, minDays: 3 },
  BREAK_SHORTAGE_REPEAT: { enabled: true, windowDays: 14, minCount: 3 },
  PAID_LEAVE_OBLIGATION: {
    enabled: true,
    cautionDaysLeft: 92,
    warningDaysLeft: 31,
  },
  PAID_LEAVE_EXPIRING: { enabled: true, withinDays: 30 },
  WEEKLY_40H_NEAR: { enabled: true, remainingMinutes: 360 },
};

export const INSIGHT_KINDS = Object.keys(
  DEFAULT_INSIGHT_SETTINGS,
) as InsightKind[];

/** DB の InsightSetting 行（params は未検証の JSON）を既定値にマージする。不正な値は既定値に戻す。 */
export function mergeInsightSettings(
  rows: Array<{ kind: InsightKind; enabled: boolean; params: unknown }>,
): InsightSettings {
  const merged = structuredClone(DEFAULT_INSIGHT_SETTINGS);
  for (const row of rows) {
    const schema = insightParamSchemas[row.kind];
    if (!schema) continue;
    const base = merged[row.kind] as Record<string, unknown>;
    const candidate = { ...base, ...(isObject(row.params) ? row.params : {}) };
    delete candidate.enabled;
    const parsed = schema.safeParse(candidate);
    Object.assign(base, parsed.success ? parsed.data : {}, {
      enabled: row.enabled,
    });
  }
  return merged;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 本人に見せる兆し */
export const EMPLOYEE_FACING: ReadonlySet<InsightKind> = new Set([
  "MISSING_PUNCH",
  "FORGOT_CLOCK_OUT",
  "PAID_LEAVE_OBLIGATION",
  "PAID_LEAVE_EXPIRING",
  "WEEKLY_40H_NEAR",
]);

/** 管理者に見せる兆し */
export const ADMIN_FACING: ReadonlySet<InsightKind> = new Set([
  "MISSING_PUNCH",
  "MONTHLY_OVERTIME_PACE",
  "YEARLY_OVERTIME_PACE",
  "LEGAL_CAP_RISK",
  "CONSECUTIVE_WORKDAYS",
  "SHORT_REST_INTERVAL",
  "LATE_NIGHT_STREAK",
  "BREAK_SHORTAGE_REPEAT",
  "PAID_LEAVE_OBLIGATION",
]);
