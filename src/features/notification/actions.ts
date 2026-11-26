"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { NotificationKind } from "@/generated/prisma/client";
import { getActor, isErr } from "@/features/auth/rbac";
import { markRead, notificationKindLabel, setPreference } from "./usecase";

const ADMIN_ONLY: NotificationKind[] = [
  "INSIGHT_ALERT",
  "PENDING_APPROVALS",
  "WEEKLY_DIGEST",
];

export async function markNotificationsReadAction(
  ids: string[] | "all",
): Promise<{ ok: boolean }> {
  const actor = await getActor();
  if (isErr(actor)) return { ok: false };
  if (ids !== "all") {
    const parsed = z.array(z.string().uuid()).max(200).safeParse(ids);
    if (!parsed.success) return { ok: false };
    ids = parsed.data;
  }
  // 自分の通知だけを既読にする（userId で絞る）
  await markRead(actor.id, ids);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setNotificationPreferenceAction(
  kind: string,
  email: boolean,
): Promise<{ ok: boolean }> {
  const actor = await getActor();
  if (isErr(actor)) return { ok: false };
  if (!(kind in notificationKindLabel)) return { ok: false };
  const k = kind as NotificationKind;
  if (ADMIN_ONLY.includes(k) && actor.role !== "ADMIN") return { ok: false };
  await setPreference(actor.id, k, Boolean(email));
  revalidatePath("/settings");
  return { ok: true };
}
