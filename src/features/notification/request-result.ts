import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "./usecase";

type Db = Prisma.TransactionClient | typeof prisma;

export type RequestResultInput = {
  userId: string;
  requestKind: "CORRECTION" | "LEAVE" | "LEAVE_CANCELLATION";
  requestId: string;
  approved: boolean;
  /** 例「11/24 の打刻修正」 */
  subject: string;
  comment?: string | null;
  actorId: string;
};

const KIND_LABEL: Record<RequestResultInput["requestKind"], string> = {
  CORRECTION: "打刻修正",
  LEAVE: "休暇",
  LEAVE_CANCELLATION: "休暇の取消",
};

/** 申請の承認・却下を本人に知らせる（承認・却下のトランザクション内で呼ぶ）。 */
export async function notifyRequestResult(
  input: RequestResultInput,
  db: Db = prisma,
): Promise<void> {
  const result = input.approved ? "承認されました" : "却下されました";
  const lines = [
    `${input.subject}の${KIND_LABEL[input.requestKind]}申請が${result}。`,
  ];
  if (input.comment) lines.push(`コメント: ${input.comment}`);
  await notify(
    {
      userId: input.userId,
      kind: "REQUEST_RESULT",
      title: `${KIND_LABEL[input.requestKind]}申請が${result}`,
      body: lines.join("\n"),
      linkPath: `/requests?tab=${input.requestKind === "CORRECTION" ? "correction" : "leave"}`,
      senderId: input.actorId,
      dedupeKey: `request-result:${input.requestId}`,
    },
    db,
  );
}

/** "2026-11-24" → "11/24" */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function rangeLabel(start: string, end: string): string {
  return start === end
    ? shortDate(start)
    : `${shortDate(start)}〜${shortDate(end)}`;
}
