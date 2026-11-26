import type { NotificationKind, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, isAppPath, sendMail } from "./mailer";

type Db = Prisma.TransactionClient | typeof prisma;

export const notificationKindLabel: Record<NotificationKind, string> = {
  FORGOT_CLOCK_OUT: "退勤忘れの確認",
  MISSING_PUNCH: "打刻漏れのお知らせ",
  REQUEST_RESULT: "申請の結果",
  ADMIN_MESSAGE: "管理者からのメッセージ",
  INSIGHT_ALERT: "働き方の兆し（管理者向け）",
  PENDING_APPROVALS: "承認待ちのお知らせ（管理者向け）",
  WEEKLY_DIGEST: "週次ダイジェスト（管理者向け）",
};

export type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  linkPath?: string | null;
  senderId?: string | null;
  /** 同じキーの通知は 1 回だけ作る */
  dedupeKey: string;
};

/**
 * アプリ内通知を作る（同じ dedupeKey は作らない）。作成したときだけ true。
 * メールは sendPendingEmails でまとめて送る（トランザクションの外で送るため）。
 */
export async function notify(
  input: NotifyInput,
  db: Db = prisma,
): Promise<boolean> {
  const linkPath =
    input.linkPath && isAppPath(input.linkPath) ? input.linkPath : null;
  const res = await db.notification.createMany({
    data: [
      {
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 120),
        body: input.body.slice(0, 2000),
        linkPath,
        senderId: input.senderId ?? null,
        dedupeKey: input.dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
  return res.count > 0;
}

/** 未送信の通知メールを送る。受け取りをオフにしている種類・無効ユーザーは送らずに送信済みにする。 */
export async function sendPendingEmails(limit = 100): Promise<number> {
  const pending = await prisma.notification.findMany({
    where: { emailedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      user: { select: { email: true, status: true, notificationPrefs: true } },
    },
  });
  let sent = 0;
  for (const n of pending) {
    const pref = n.user.notificationPrefs.find((p) => p.kind === n.kind);
    const wants = n.user.status === "ACTIVE" && (pref?.email ?? true);
    if (wants) {
      try {
        await sendMail({
          to: n.user.email,
          subject: `[Kizami] ${n.title}`,
          text: `${n.body}\n\n${appUrl(n.linkPath ?? "/notifications")}\n\n※ このメールは Kizami から自動で送信しています。`,
        });
        sent++;
      } catch {
        // 送信に失敗したら次回に再送する
        console.error("[notification] メール送信に失敗しました");
        continue;
      }
    }
    await prisma.notification.update({
      where: { id: n.id },
      data: { emailedAt: new Date() },
    });
  }
  return sent;
}

export async function listNotifications(userId: string, take = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: { sender: { select: { name: true } } },
  });
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(
  userId: string,
  ids: string[] | "all",
): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids === "all" ? {} : { id: { in: ids } }),
    },
    data: { readAt: new Date() },
  });
}

export async function getPreferences(
  userId: string,
): Promise<Record<NotificationKind, boolean>> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
  });
  const out = Object.fromEntries(
    (Object.keys(notificationKindLabel) as NotificationKind[]).map((k) => [
      k,
      true,
    ]),
  ) as Record<NotificationKind, boolean>;
  for (const r of rows) out[r.kind] = r.email;
  return out;
}

export async function setPreference(
  userId: string,
  kind: NotificationKind,
  email: boolean,
) {
  await prisma.notificationPreference.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, kind, email },
    update: { email },
  });
}
