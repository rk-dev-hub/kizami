import type { InsightKind } from "@/generated/prisma/client";
import { formatDateJa } from "@/lib/date-range";
import { minutesToHm } from "@/lib/datetime";
import type { InsightFacts } from "./domain/types";

// AI を使わない（API キー未設定・障害時）ときの文面。Kizami の出力と同じ形で返す。

export const insightKindLabel: Record<InsightKind, string> = {
  MISSING_PUNCH: "打刻漏れ",
  FORGOT_CLOCK_OUT: "退勤忘れの疑い",
  MONTHLY_OVERTIME_PACE: "月の残業ペース超過",
  YEARLY_OVERTIME_PACE: "年の残業ペース超過",
  LEGAL_CAP_RISK: "法定上限への接近",
  CONSECUTIVE_WORKDAYS: "連続勤務",
  SHORT_REST_INTERVAL: "勤務間インターバル不足",
  LATE_NIGHT_STREAK: "深夜勤務の連続",
  BREAK_SHORTAGE_REPEAT: "休憩不足の繰り返し",
  PAID_LEAVE_OBLIGATION: "有給 5 日取得義務",
  PAID_LEAVE_EXPIRING: "有給の失効",
  WEEKLY_40H_NEAR: "週 40 時間への接近",
};

const MISSING_LABEL: Record<string, string> = {
  MISSING_CLOCK_IN: "出勤",
  MISSING_CLOCK_OUT: "退勤",
  BREAK_MISMATCH: "休憩",
};

const n = (v: number | string | undefined) => Number(v ?? 0);
const s = (v: number | string | undefined) => String(v ?? "");
const hm = (v: number | string | undefined) => minutesToHm(n(v));
const date = (v: number | string | undefined) => formatDateJa(s(v));

function missingText(facts: InsightFacts): string {
  return s(facts.metrics.missing)
    .split(",")
    .map((m) => MISSING_LABEL[m] ?? "打刻")
    .join("・");
}

/** 本人向けのひとこと（60 字程度）。 */
export function employeeNoteTemplate(facts: InsightFacts): string {
  const m = facts.metrics;
  switch (facts.kind) {
    case "MISSING_PUNCH":
      return `${date(m.date)} の${missingText(facts)}の打刻が抜けています。修正申請をお願いします。`;
    case "FORGOT_CLOCK_OUT":
      return `まだ勤務中になっています。退勤を押し忘れていませんか?`;
    case "PAID_LEAVE_OBLIGATION":
      return `年 5 日の有給取得まで、あと ${m.shortageDays} 日です（期限 ${date(m.deadline)}）。`;
    case "PAID_LEAVE_EXPIRING":
      return `有給 ${m.expiringDays} 日が ${date(m.expiryDate)} に失効します。`;
    case "WEEKLY_40H_NEAR":
      return `今週はあと ${hm(m.remainingMinutes)} で週 40 時間に届きます。`;
    default:
      return `${insightKindLabel[facts.kind]}があります。`;
  }
}

export type InsightExplanation = {
  explanation: string;
  suggestedActions: string[];
  messageDraft: string;
};

/** 管理者向けの説明・対応案・本人への声かけ文。name は表示用の氏名（AI には渡さない）。 */
export function adminExplanationTemplate(
  facts: InsightFacts,
  name: string,
): InsightExplanation {
  const m = facts.metrics;
  const greet = `${name}さん、お疲れさまです。`;
  switch (facts.kind) {
    case "MISSING_PUNCH":
      return {
        explanation: `${date(m.date)} の${missingText(facts)}の打刻がありません。`,
        suggestedActions: [
          "本人に打刻修正申請を依頼する",
          "必要なら代理打刻で補正する",
        ],
        messageDraft: `${greet}${date(m.date)} の${missingText(facts)}の打刻が抜けているようです。お手数ですが、打刻修正申請をお願いします。`,
      };
    case "FORGOT_CLOCK_OUT":
      return {
        explanation: `所定の終業時刻から ${hm(m.overdueMinutes)} 経っても勤務中のままです。`,
        suggestedActions: ["退勤の押し忘れか本人に確認する"],
        messageDraft: `${greet}まだ勤務中の表示になっています。退勤の押し忘れでしたら、修正申請をお願いします。`,
      };
    case "MONTHLY_OVERTIME_PACE":
      return {
        explanation: `今月の法定外残業は現在 ${hm(m.actualMinutes)}。このペースだと月末に ${hm(m.forecastMinutes)} の見込みで、36 協定の月上限 ${hm(m.limitMinutes)} に対して ${Math.round((n(m.forecastMinutes) / n(m.limitMinutes)) * 100)}% です。`,
        suggestedActions: [
          "業務量と締め切りを本人と確認する",
          "残りの期間の残業を調整する",
        ],
        messageDraft: `${greet}今月は残業が多めのペースになっています。業務量や締め切りで困っていることがあれば、遠慮なく相談してください。`,
      };
    case "YEARLY_OVERTIME_PACE":
      return {
        explanation: `今年度の法定外残業は ${hm(m.actualMinutes)}。直近のペースだと年度末に ${hm(m.forecastMinutes)} の見込みで、年上限 ${hm(m.limitMinutes)} に近づいています。`,
        suggestedActions: [
          "年間の業務計画を見直す",
          "繁忙期の人員配置を検討する",
        ],
        messageDraft: `${greet}今年度は残業が積み上がってきています。今後の業務の進め方について、一度話をさせてください。`,
      };
    case "LEGAL_CAP_RISK":
      return {
        explanation: `今月の時間外＋休日労働は ${hm(m.monthMinutes)}、${m.averageMonths} か月平均は ${hm(m.maxAverageMinutes)} です。法定の上限（月 100 時間未満・平均 80 時間以内）に近づいています。`,
        suggestedActions: [
          "今月の残業をすぐに止める",
          "業務を分担する",
          "産業医面談を検討する",
        ],
        messageDraft: `${greet}労働時間がかなり長くなっています。体調は大丈夫でしょうか。業務の分担を一緒に考えたいので、時間をもらえますか。`,
      };
    case "CONSECUTIVE_WORKDAYS":
      return {
        explanation: `${date(m.startDate)} から休みなく ${m.days} 日連続で勤務しています。`,
        suggestedActions: ["休日を確保する", "振替休日を設定する"],
        messageDraft: `${greet}${m.days} 日連続で勤務が続いています。近いうちに休みを取れるよう調整しましょう。`,
      };
    case "SHORT_REST_INTERVAL":
      return {
        explanation: `直近 ${m.windowDays} 日で、退勤から次の出勤まで ${hm(m.intervalMinutes)} 未満の日が ${m.count} 回ありました（最短 ${hm(m.shortestMinutes)}）。`,
        suggestedActions: ["始業時刻を遅らせる", "夜遅い業務を分担する"],
        messageDraft: `${greet}退勤から次の出勤までの時間が短い日が続いています。翌日の始業を遅らせるなど、休息を取れるようにしましょう。`,
      };
    case "LATE_NIGHT_STREAK":
      return {
        explanation: `${date(m.startDate)} から ${m.days} 日連続で深夜（22 時以降）の勤務があります。`,
        suggestedActions: [
          "深夜にかかる業務を見直す",
          "シフトや担当を調整する",
        ],
        messageDraft: `${greet}深夜までの勤務が続いています。無理をしていないか心配です。業務の調整について相談させてください。`,
      };
    case "BREAK_SHORTAGE_REPEAT":
      return {
        explanation: `直近 ${m.windowDays} 日で、法定の休憩時間に足りない日が ${m.count} 回ありました。`,
        suggestedActions: [
          "休憩を取れる時間帯を決める",
          "休憩の打刻を徹底する",
        ],
        messageDraft: `${greet}休憩が十分に取れていない日があるようです。休憩はしっかり取ってください。打刻漏れの場合は修正申請をお願いします。`,
      };
    case "PAID_LEAVE_OBLIGATION":
      return {
        explanation: `年 5 日の有給取得義務に対して取得（予定を含む）は ${m.takenDays} 日です。期限 ${date(m.deadline)} まで残り ${m.daysLeft} 日です。`,
        suggestedActions: ["取得日を本人と決める", "必要なら時季指定する"],
        messageDraft: `${greet}有給休暇の取得が ${m.takenDays} 日で、${date(m.deadline)} までにあと ${m.shortageDays} 日取得する必要があります。取りやすい日を教えてください。`,
      };
    case "PAID_LEAVE_EXPIRING":
      return {
        explanation: `有給 ${m.expiringDays} 日が ${date(m.expiryDate)} に失効します。`,
        suggestedActions: ["失効前の取得を勧める"],
        messageDraft: `${greet}有給 ${m.expiringDays} 日が ${date(m.expiryDate)} に失効します。よければ早めに取得してください。`,
      };
    case "WEEKLY_40H_NEAR":
      return {
        explanation: `今週の労働時間は ${hm(m.workedMinutes)} で、週 40 時間まで残り ${hm(m.remainingMinutes)} です。`,
        suggestedActions: ["今週の残りの予定を確認する"],
        messageDraft: `${greet}今週は週 40 時間に近づいています。残りの予定を確認してください。`,
      };
  }
}

/** 兆しの指標を「実績 / 予測 / 上限」のゲージ表示用にまとめる。 */
export function insightGauge(facts: InsightFacts): {
  label: string;
  value: number;
  forecast?: number;
  limit: number;
  unit: "minutes" | "days";
} | null {
  const m = facts.metrics;
  switch (facts.kind) {
    case "MONTHLY_OVERTIME_PACE":
    case "YEARLY_OVERTIME_PACE":
      return {
        label: "法定外残業",
        value: n(m.actualMinutes),
        forecast: n(m.forecastMinutes),
        limit: n(m.limitMinutes),
        unit: "minutes",
      };
    case "LEGAL_CAP_RISK":
      return {
        label: "時間外＋休日労働",
        value: n(m.monthMinutes),
        limit: n(m.monthCapMinutes),
        unit: "minutes",
      };
    case "PAID_LEAVE_OBLIGATION":
      return {
        label: "有給の取得",
        value: n(m.takenDays),
        limit: n(m.requiredDays),
        unit: "days",
      };
    case "WEEKLY_40H_NEAR":
      return {
        label: "今週の労働",
        value: n(m.workedMinutes),
        limit: n(m.limitMinutes),
        unit: "minutes",
      };
    default:
      return null;
  }
}
