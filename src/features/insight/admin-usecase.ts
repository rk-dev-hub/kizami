import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  InsightKind,
  InsightStatus,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { dateOnlyStr, dateOnlyUtc } from "@/lib/datetime";
import { ok, errWithDefault, type Result } from "@/lib/result";
import { fieldErrors } from "@/lib/zod";
import { getAdminActor, isErr, requireAdmin } from "@/features/auth/rbac";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { notify } from "@/features/notification/usecase";
import { shortDate } from "@/features/notification/request-result";
import {
  ADMIN_FACING,
  INSIGHT_KINDS,
  insightParamSchemas,
  mergeInsightSettings,
} from "./domain/settings";
import type { InsightFacts } from "./domain/types";

// ---------------------------------------------------------------- 一覧

export type AdminInsightRow = {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  kind: InsightKind;
  severity: "INFO" | "CAUTION" | "WARNING";
  status: InsightStatus;
  periodKey: string;
  facts: InsightFacts;
  detectedAt: Date;
  updatedAt: Date;
  ackNote: string | null;
  ackAt: Date | null;
  ackByName: string | null;
};

const SEVERITY_ORDER = { WARNING: 0, CAUTION: 1, INFO: 2 } as const;

export async function listAdminInsights(
  status: "ACTIVE" | "RESOLVED" = "ACTIVE",
): Promise<AdminInsightRow[]> {
  await requireAdmin();
  const rows = await prisma.insight.findMany({
    where: {
      kind: { in: [...ADMIN_FACING] },
      status:
        status === "ACTIVE" ? { in: ["OPEN", "ACKNOWLEDGED"] } : "RESOLVED",
      user: { status: "ACTIVE" },
    },
    include: {
      user: { select: { name: true, employeeCode: true } },
      ackBy: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: status === "ACTIVE" ? 500 : 100,
  });
  return rows
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      employeeCode: r.user.employeeCode,
      kind: r.kind,
      severity: r.severity,
      status: r.status,
      periodKey: r.periodKey,
      facts: r.facts as unknown as InsightFacts,
      detectedAt: r.detectedAt,
      updatedAt: r.updatedAt,
      ackNote: r.ackNote,
      ackAt: r.ackAt,
      ackByName: r.ackBy?.name ?? null,
    }))
    .sort((a, b) =>
      status === "ACTIVE"
        ? (a.status === "OPEN" ? 0 : 1) - (b.status === "OPEN" ? 0 : 1) ||
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          b.updatedAt.getTime() - a.updatedAt.getTime()
        : 0,
    );
}

export async function countOpenAdminInsights(): Promise<number> {
  return prisma.insight.count({
    where: {
      kind: { in: [...ADMIN_FACING] },
      status: "OPEN",
      user: { status: "ACTIVE" },
    },
  });
}

// ---------------------------------------------------------------- 対応済みにする

const ackSchema = z.object({
  insightId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export async function acknowledgeInsight(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;
  const parsed = ackSchema.safeParse(raw);
  if (!parsed.success)
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));

  const insight = await prisma.insight.findUnique({
    where: { id: parsed.data.insightId },
  });
  if (!insight) return errWithDefault("NOT_FOUND");
  if (insight.status !== "OPEN")
    return errWithDefault(
      "CONFLICT",
      "この兆しはすでに対応済みか解消されています。",
    );

  await prisma.$transaction(async (tx) => {
    await tx.insight.update({
      where: { id: insight.id },
      data: {
        status: "ACKNOWLEDGED",
        ackById: actor.id,
        ackAt: new Date(),
        ackNote: parsed.data.note || null,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "INSIGHT_ACK",
      targetType: "Insight",
      targetId: insight.id,
      subjectUserId: insight.userId,
      after: {
        kind: insight.kind,
        severity: insight.severity,
        periodKey: insight.periodKey,
      },
      comment: parsed.data.note || null,
    });
  });
  return ok(undefined);
}

// ---------------------------------------------------------------- 管理者からのメッセージ

export const messageSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(1, "件名を入力してください").max(60),
  body: z.string().trim().min(1, "本文を入力してください").max(1000),
  insightId: z.string().uuid().optional(),
});

async function sendMessageTx(
  tx: Prisma.TransactionClient,
  actorId: string,
  m: z.infer<typeof messageSchema>,
  context: string,
) {
  await notify(
    {
      userId: m.userId,
      kind: "ADMIN_MESSAGE",
      title: m.title,
      body: m.body,
      linkPath: "/notifications",
      senderId: actorId,
      dedupeKey: `admin-message:${randomUUID()}`,
    },
    tx,
  );
  await recordAudit(tx, {
    actorId,
    action: "MESSAGE_SEND",
    targetType: "Notification",
    subjectUserId: m.userId,
    after: {
      title: m.title,
      context,
      ...(m.insightId ? { insightId: m.insightId } : {}),
    },
  });
}

export async function sendAdminMessage(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success)
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  if (parsed.data.userId === actor.id)
    return errWithDefault("VALIDATION", "自分にはメッセージを送れません。");

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!target || target.status !== "ACTIVE") return errWithDefault("NOT_FOUND");

  await prisma.$transaction((tx) =>
    sendMessageTx(
      tx,
      actor.id,
      parsed.data,
      parsed.data.insightId ? "insight" : "direct",
    ),
  );
  return ok(undefined);
}

// ---------------------------------------------------------------- 締めアシスト

export type ClosingIssue = { date: string; note: string };
export type ClosingUserIssues = {
  userId: string;
  name: string;
  employeeCode: string;
  items: ClosingIssue[];
};

/** 締め期間内の、本人が対応すべき項目（打刻漏れ・未処理の申請）を人ごとにまとめる。 */
export async function getClosingIssues(periodStart: string): Promise<{
  periodStart: string;
  periodEnd: string;
  users: ClosingUserIssues[];
}> {
  await requireAdmin();
  const rule = await getDefaultWorkRule();
  const { startStr, endStr } = periodRangeFor(periodStart, rule.closingDay);
  const from = dateOnlyUtc(startStr);
  const to = dateOnlyUtc(endStr);

  const [summaries, corrections, leaves] = await Promise.all([
    prisma.dailySummary.findMany({
      where: { workDate: { gte: from, lte: to }, user: { status: "ACTIVE" } },
      include: { user: { select: { name: true, employeeCode: true } } },
      orderBy: { workDate: "asc" },
    }),
    prisma.correctionRequest.findMany({
      where: { status: "PENDING", targetDate: { gte: from, lte: to } },
      include: { user: { select: { name: true, employeeCode: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        startDate: { lte: to },
        endDate: { gte: from },
      },
      include: { user: { select: { name: true, employeeCode: true } } },
    }),
  ]);

  const byUser = new Map<string, ClosingUserIssues>();
  const add = (
    userId: string,
    u: { name: string; employeeCode: string },
    item: ClosingIssue,
  ) => {
    const cur = byUser.get(userId) ?? {
      userId,
      name: u.name,
      employeeCode: u.employeeCode,
      items: [],
    };
    cur.items.push(item);
    byUser.set(userId, cur);
  };

  // 修正申請が出ている日の打刻漏れは「申請の承認待ち」として扱う
  const pendingDays = new Set(
    corrections.map((c) => `${c.userId}|${dateOnlyStr(c.targetDate)}`),
  );
  for (const s of summaries) {
    const flags = Array.isArray(s.flags) ? (s.flags as string[]) : [];
    const date = dateOnlyStr(s.workDate);
    if (pendingDays.has(`${s.userId}|${date}`)) continue;
    if (flags.includes("MISSING_CLOCK_OUT"))
      add(s.userId, s.user, { date, note: "退勤の打刻がありません" });
    else if (flags.includes("MISSING_CLOCK_IN"))
      add(s.userId, s.user, { date, note: "出勤の打刻がありません" });
  }
  for (const c of corrections) {
    add(c.userId, c.user, {
      date: dateOnlyStr(c.targetDate),
      note: "打刻修正の申請が承認待ちです（管理者側で対応）",
    });
  }
  for (const l of leaves) {
    add(l.userId, l.user, {
      date: dateOnlyStr(l.startDate),
      note: "休暇の申請が承認待ちです（管理者側で対応）",
    });
  }
  const users = [...byUser.values()]
    .map((u) => ({
      ...u,
      items: u.items.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  return { periodStart: startStr, periodEnd: endStr, users };
}

/** 本人の対応が必要な項目だけ（承認待ちは管理者側の作業なので除く） */
export function employeeActionItems(items: ClosingIssue[]): ClosingIssue[] {
  return items.filter((i) => !i.note.includes("承認待ち"));
}

export function closingItemLabel(i: ClosingIssue): string {
  return `${shortDate(i.date)} ${i.note}`;
}

const closingSendSchema = z.object({
  messages: z
    .array(messageSchema.omit({ insightId: true }))
    .min(1)
    .max(200),
});

export async function sendClosingMessages(
  raw: unknown,
): Promise<Result<{ count: number }>> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;
  const parsed = closingSendSchema.safeParse(raw);
  if (!parsed.success)
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  const ids = [...new Set(parsed.data.messages.map((m) => m.userId))];
  const active = await prisma.user.count({
    where: { id: { in: ids }, status: "ACTIVE" },
  });
  if (active !== ids.length) return errWithDefault("NOT_FOUND");
  if (ids.includes(actor.id))
    return errWithDefault("VALIDATION", "自分にはメッセージを送れません。");

  await prisma.$transaction(async (tx) => {
    for (const m of parsed.data.messages)
      await sendMessageTx(tx, actor.id, m, "closing");
  });
  return ok({ count: parsed.data.messages.length });
}

// ---------------------------------------------------------------- 兆しの設定

export async function getInsightSettingsForAdmin() {
  await requireAdmin();
  const rows = await prisma.insightSetting.findMany();
  return mergeInsightSettings(rows);
}

const settingSchema = z.object({
  kind: z.enum(INSIGHT_KINDS as [InsightKind, ...InsightKind[]]),
  enabled: z.boolean(),
  params: z.record(z.string(), z.unknown()),
});

export async function updateInsightSetting(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;
  const parsed = settingSchema.safeParse(raw);
  if (!parsed.success) return errWithDefault("VALIDATION");
  const paramSchema = insightParamSchemas[parsed.data.kind];
  const params = paramSchema.safeParse(parsed.data.params);
  if (!params.success)
    return errWithDefault(
      "VALIDATION",
      "設定値が範囲外です。",
      fieldErrors(params.error),
    );

  const before = await prisma.insightSetting.findUnique({
    where: { kind: parsed.data.kind },
  });
  await prisma.$transaction(async (tx) => {
    await tx.insightSetting.upsert({
      where: { kind: parsed.data.kind },
      create: {
        kind: parsed.data.kind,
        enabled: parsed.data.enabled,
        params: params.data,
      },
      update: { enabled: parsed.data.enabled, params: params.data },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MASTER_CHANGE",
      targetType: "InsightSetting",
      targetId: parsed.data.kind,
      before: before
        ? {
            enabled: before.enabled,
            params: before.params as Prisma.InputJsonValue,
          }
        : null,
      after: { enabled: parsed.data.enabled, params: params.data },
    });
  });
  return ok(undefined);
}
