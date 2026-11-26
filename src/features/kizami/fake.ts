import type { AiFeature } from "@/generated/prisma/client";

// E2E テスト用のフェイク応答（KIZAMI_FAKE=1）。実際の API は呼ばない。
// 入力から決まった形の出力を作るだけで、言語理解はしない。

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord {
  return typeof v === "object" && v !== null ? (v as AnyRecord) : {};
}

export function fakeKizamiResponse(
  feature: AiFeature,
  data: unknown,
  userText?: string,
): unknown {
  const d = asRecord(data);
  switch (feature) {
    case "DAILY_NOTES": {
      const items = Array.isArray(d.items) ? d.items.map(asRecord) : [];
      return {
        notes: items.map((i) => ({
          insightId: String(i.id),
          text: `[Kizami] ${String(i.kindLabel ?? "")}があります。`,
        })),
      };
    }
    case "EXPLAIN_INSIGHT":
      return {
        explanation: `[Kizami] ${String(d.kindLabel ?? "兆し")}を検知しました。`,
        suggestedActions: ["本人と状況を確認する"],
        messageDraft:
          "{name}さん、お疲れさまです。最近の勤務について少しお話しできますか。",
      };
    case "SUMMARIZE_REQUEST": {
      const flags = Array.isArray(d.flags) ? d.flags.map(String) : [];
      return { summary: "[Kizami] 申請の要約", cautions: flags };
    }
    case "CLOSING_MESSAGE":
      return {
        subject: "[Kizami] 勤怠の確認のお願い",
        body: "{name}さん、お疲れさまです。締め前の確認をお願いします。",
      };
    case "ANSWER_QUESTION":
      return {
        answer: "[Kizami] 有給の残日数は画面の値をご確認ください。",
        basis: ["有給の残日数"],
        outOfScope: false,
      };
    case "WEEKLY_DIGEST":
      return { summary: "[Kizami] 今週の兆しのまとめ" };
    case "DRAFT_FROM_TEXT": {
      const today = String(d.today ?? "2026-01-01");
      const yesterday = addDays(today, -1);
      const text = userText ?? "";
      const time = /(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/.exec(text);
      if (/休/.test(text)) {
        const part = /午後/.test(text)
          ? "PM"
          : /午前/.test(text)
            ? "AM"
            : "FULL";
        const date = /明日/.test(text) ? addDays(today, 1) : today;
        return {
          result: {
            kind: "LEAVE",
            leaveType: "PAID",
            dayPart: part,
            startDate: date,
            endDate: date,
            reason: "私用のため",
          },
        };
      }
      if (time) {
        const hh = time[1].padStart(2, "0");
        const mm = (time[2] ?? "0").padStart(2, "0");
        return {
          result: {
            kind: "CORRECTION",
            workDate: yesterday,
            lines: [
              {
                op: "ADD",
                clockType: "CLOCK_OUT",
                time: `${hh}:${mm}`,
                nextDay: false,
              },
            ],
            reason: "退勤の打刻漏れ",
          },
        };
      }
      return {
        result: {
          kind: "CLARIFY",
          question: "いつの、どの打刻についての申請ですか?",
          choices: [],
        },
      };
    }
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
