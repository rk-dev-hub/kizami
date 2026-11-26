"use server";

import { z } from "zod";
import { getActor, getAdminActor, isErr } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import { listPending } from "@/features/approval/usecase";
import { ADMIN_FACING } from "@/features/insight/domain/settings";
import {
  closingItemLabel,
  employeeActionItems,
  getClosingIssues,
} from "@/features/insight/admin-usecase";
import {
  answerQuestion,
  draftClosingMessage,
  draftFromText,
  explainInsight,
  summarizePending,
  type AnswerResponse,
  type DraftResponse,
  type RequestSummary,
  type Source,
} from "./tasks";
import type { InsightExplanation } from "@/features/insight/templates";

const UNAVAILABLE = "ログインし直してからお試しください。";

const draftInput = z.object({
  text: z.string().trim().min(1).max(400),
  previousQuestion: z.string().trim().max(200).optional(),
});

/** 話して申請: 文章から申請の下書きを作る（保存はしない。送信は従来のフォームから）。 */
export async function kizamiDraftAction(
  text: string,
  previousQuestion?: string,
): Promise<DraftResponse> {
  const actor = await getActor();
  if (isErr(actor)) return { ok: false, message: UNAVAILABLE };
  const parsed = draftInput.safeParse({ text, previousQuestion });
  if (!parsed.success) {
    return { ok: false, message: "400 字以内で入力してください。" };
  }
  return draftFromText(actor, parsed.data.text, parsed.data.previousQuestion);
}

/** 質問に答える: 本人の勤怠データだけを根拠に答える。 */
export async function kizamiAskAction(
  question: string,
): Promise<AnswerResponse> {
  const actor = await getActor();
  if (isErr(actor)) return { ok: false, message: UNAVAILABLE };
  const parsed = z.string().trim().min(1).max(300).safeParse(question);
  if (!parsed.success) {
    return { ok: false, message: "300 字以内で入力してください。" };
  }
  return answerQuestion(actor, parsed.data);
}

export type ExplainResponse =
  | ({ ok: true; source: Source } & InsightExplanation)
  | { ok: false; message: string };

/** 兆しの説明と、本人への声かけの下書き（管理者）。 */
export async function explainInsightAction(
  insightId: string,
): Promise<ExplainResponse> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: UNAVAILABLE };
  if (!z.string().uuid().safeParse(insightId).success) {
    return { ok: false, message: "兆しが見つかりません。" };
  }
  const insight = await prisma.insight.findUnique({
    where: { id: insightId },
    include: { user: { select: { name: true } } },
  });
  if (!insight || !ADMIN_FACING.has(insight.kind)) {
    return { ok: false, message: "兆しが見つかりません。" };
  }
  const r = await explainInsight(actor, insight, insight.user.name);
  return { ok: true, ...r };
}

export type SummaryResponse =
  ({ ok: true } & RequestSummary) | { ok: false; message: string };

/** 承認待ちの申請の要約と注意点（管理者）。 */
export async function summarizeRequestAction(
  kind: "CORRECTION" | "LEAVE" | "LEAVE_CANCELLATION",
  id: string,
): Promise<SummaryResponse> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: UNAVAILABLE };
  const items = await listPending();
  const item = items.find((i) => i.kind === kind && i.id === id);
  if (!item) return { ok: false, message: "申請が見つかりません。" };
  const r = await summarizePending(actor, item);
  return { ok: true, ...r };
}

export type ClosingDraft = {
  userId: string;
  name: string;
  items: string[];
  subject: string;
  body: string;
  source: Source;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** 締めアシスト: 本人の対応が必要な人ごとに確認メッセージを下書きする（送信はしない）。 */
export async function draftClosingMessagesAction(
  periodStart: string,
  deadline: string,
): Promise<
  { ok: true; drafts: ClosingDraft[] } | { ok: false; message: string }
> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: UNAVAILABLE };
  if (
    !isoDate.safeParse(periodStart).success ||
    !isoDate.safeParse(deadline).success
  ) {
    return { ok: false, message: "日付が正しくありません。" };
  }
  const issues = await getClosingIssues(periodStart);
  const targets = issues.users
    .filter((u) => u.userId !== actor.id)
    .map((u) => ({ ...u, items: employeeActionItems(u.items) }))
    .filter((u) => u.items.length > 0)
    .slice(0, 50);

  const drafts: ClosingDraft[] = [];
  // 同時に投げすぎないよう 4 件ずつ
  for (let i = 0; i < targets.length; i += 4) {
    const chunk = targets.slice(i, i + 4);
    const res = await Promise.all(
      chunk.map((t) =>
        draftClosingMessage(
          actor,
          {
            userId: t.userId,
            name: t.name,
            items: t.items.map((x) => ({ date: x.date, note: x.note })),
          },
          deadline,
        ),
      ),
    );
    chunk.forEach((t, j) =>
      drafts.push({
        userId: t.userId,
        name: t.name,
        items: t.items.map(closingItemLabel),
        ...res[j],
      }),
    );
  }
  return { ok: true, drafts };
}
