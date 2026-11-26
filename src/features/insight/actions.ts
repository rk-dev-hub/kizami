"use server";

import { revalidatePath } from "next/cache";
import {
  acknowledgeInsight,
  sendAdminMessage,
  sendClosingMessages,
  updateInsightSetting,
} from "./admin-usecase";
import type { Result } from "@/lib/result";

export type ActionState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
} | null;

function toState(r: Result<unknown>, okMessage?: string): ActionState {
  if (!r.ok)
    return { ok: false, message: r.error.message, fields: r.error.fields };
  return { ok: true, message: okMessage };
}

export async function acknowledgeInsightAction(
  insightId: string,
  note?: string,
): Promise<ActionState> {
  const r = await acknowledgeInsight({ insightId, note: note || undefined });
  revalidatePath("/admin");
  revalidatePath("/admin/insights");
  return toState(r, "対応済みにしました。");
}

export async function sendAdminMessageAction(input: {
  userId: string;
  title: string;
  body: string;
  insightId?: string;
}): Promise<ActionState> {
  const r = await sendAdminMessage(input);
  return toState(r, "メッセージを送りました。");
}

export async function sendClosingMessagesAction(
  messages: Array<{ userId: string; title: string; body: string }>,
): Promise<ActionState> {
  const r = await sendClosingMessages({ messages });
  if (!r.ok) return toState(r);
  return { ok: true, message: `${r.value.count} 人にメッセージを送りました。` };
}

export async function updateInsightSettingAction(input: {
  kind: string;
  enabled: boolean;
  params: Record<string, unknown>;
}): Promise<ActionState> {
  const r = await updateInsightSetting(input);
  revalidatePath("/admin/insights");
  return toState(r, "設定を保存しました。次回の検知から反映されます。");
}
