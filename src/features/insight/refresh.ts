import { refreshInsightsForUser } from "./usecase";

/**
 * 打刻・承認のあとに兆しを更新する。失敗しても元の操作は成功のまま返したいので、
 * エラーは記録だけして握りつぶす（次のワーカー実行で追いつく）。
 */
export async function refreshInsightsQuietly(userId: string): Promise<void> {
  try {
    await refreshInsightsForUser(userId);
  } catch {
    console.error("[insight] 兆しの更新に失敗しました");
  }
}
