import { describe, expect, it } from "vitest";
import type { InsightKind } from "@/generated/prisma/client";
import {
  adminExplanationTemplate,
  employeeNoteTemplate,
  insightGauge,
  insightKindLabel,
} from "@/features/insight/templates";
import type { InsightFacts } from "@/features/insight/domain/types";

const metrics = {
  date: "2026-11-24",
  missing: "MISSING_CLOCK_OUT",
  overdueMinutes: 150,
  actualMinutes: 1800,
  forecastMinutes: 2700,
  limitMinutes: 2700,
  monthMinutes: 4800,
  monthCapMinutes: 6000,
  averageMonths: 3,
  maxAverageMinutes: 4500,
  startDate: "2026-11-10",
  days: 8,
  windowDays: 14,
  intervalMinutes: 660,
  count: 3,
  shortestMinutes: 540,
  takenDays: 2,
  requiredDays: 5,
  shortageDays: 3,
  deadline: "2027-03-31",
  daysLeft: 126,
  expiringDays: 4,
  expiryDate: "2027-01-15",
  workedMinutes: 2280,
  remainingMinutes: 120,
};

const kinds = Object.keys(insightKindLabel) as InsightKind[];

function factsOf(kind: InsightKind): InsightFacts {
  return {
    kind,
    severity: "CAUTION",
    metrics,
    period: { label: "今月", from: "2026-11-01", to: "2026-11-30" },
  };
}

const broken = /undefined|NaN|Invalid|\$\{/;

describe("AI を使わないときの文面", () => {
  it.each(kinds)("%s の文面に欠けた値がない", (kind) => {
    const f = factsOf(kind);
    const note = employeeNoteTemplate(f);
    const ex = adminExplanationTemplate(f, "高橋");
    expect(note).not.toMatch(broken);
    expect(ex.explanation).not.toMatch(broken);
    expect(ex.messageDraft).not.toMatch(broken);
    expect(ex.messageDraft.startsWith("高橋さん")).toBe(true);
    expect(ex.suggestedActions.length).toBeGreaterThan(0);
  });

  it("打刻漏れの文面に日付と打刻の種類が入る", () => {
    expect(employeeNoteTemplate(factsOf("MISSING_PUNCH"))).toContain("退勤");
  });

  it("ゲージは上限のある兆しだけに出る", () => {
    expect(insightGauge(factsOf("MONTHLY_OVERTIME_PACE"))).toMatchObject({
      value: 1800,
      forecast: 2700,
      limit: 2700,
    });
    expect(insightGauge(factsOf("CONSECUTIVE_WORKDAYS"))).toBeNull();
  });
});
