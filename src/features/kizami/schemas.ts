import { z } from "zod";

// Kizami の構造化出力のスキーマ。API に渡し、受け取った後にも同じスキーマで検証する。
// 文字数の上限はモデルへの指示で伝え、表示時に clip() で切り詰める（上限超えで捨てない）。

export const dailyNotesSchema = z.object({
  notes: z.array(z.object({ insightId: z.string(), text: z.string() })),
});

export const explainInsightSchema = z.object({
  explanation: z.string(),
  suggestedActions: z.array(z.string()),
  messageDraft: z.string(),
});

export const summarizeRequestSchema = z.object({
  summary: z.string(),
  cautions: z.array(z.string()),
});

export const closingMessageSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

const clockType = z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hm = z.string().regex(/^\d{2}:\d{2}$/);

export const draftFromTextSchema = z.object({
  result: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("CORRECTION"),
      workDate: isoDate,
      lines: z.array(
        z.object({
          op: z.enum(["ADD", "UPDATE", "DELETE"]),
          clockType,
          time: hm,
          nextDay: z.boolean(),
        }),
      ),
      reason: z.string(),
    }),
    z.object({
      kind: z.literal("LEAVE"),
      leaveType: z.enum(["PAID", "ABSENCE", "SPECIAL_UNPAID"]),
      dayPart: z.enum(["FULL", "AM", "PM"]),
      startDate: isoDate,
      endDate: isoDate,
      reason: z.string(),
    }),
    z.object({
      kind: z.literal("CLARIFY"),
      question: z.string(),
      choices: z.array(z.string()),
    }),
    z.object({
      kind: z.literal("UNSUPPORTED"),
      message: z.string(),
    }),
  ]),
});
export type DraftFromText = z.infer<typeof draftFromTextSchema>["result"];

export const answerQuestionSchema = z.object({
  answer: z.string(),
  basis: z.array(z.string()),
  outOfScope: z.boolean(),
});

export const weeklyDigestSchema = z.object({
  summary: z.string(),
});

/** 表示用に文字数を切り詰める（サロゲートペアを壊さない）。 */
export function clip(text: string, max: number): string {
  const chars = Array.from(text.trim());
  return chars.length <= max
    ? chars.join("")
    : `${chars.slice(0, max - 1).join("")}…`;
}
