import { formatRangeJa } from "@/lib/date-range";
import {
  adminExplanationTemplate,
  insightGauge,
  insightKindLabel,
} from "./templates";
import type { AdminInsightRow } from "./admin-usecase";
import type { InsightCardData } from "@/components/insight/insight-card";

function periodLabel(row: AdminInsightRow): string {
  const p = row.facts.period;
  if (!p) return "";
  return formatRangeJa(p.from, p.to);
}

/** 一覧のカードに渡すデータ（説明は定型文。AI の説明は画面からその場で頼む）。 */
export function toCardData(row: AdminInsightRow): InsightCardData {
  const t = adminExplanationTemplate(row.facts, row.userName);
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    employeeCode: row.employeeCode,
    kind: row.kind,
    kindLabel: insightKindLabel[row.kind],
    severity: row.severity,
    status: row.status,
    periodLabel: periodLabel(row),
    explanation: t.explanation,
    suggestedActions: t.suggestedActions,
    messageDraft: t.messageDraft,
    gauge: insightGauge(row.facts),
    ackNote: row.ackNote,
    ackByName: row.ackByName,
    attendanceHref: `/attendance?user=${row.userId}`,
  };
}
