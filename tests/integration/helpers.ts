import { vi } from "vitest";
import type { Role, UserStatus } from "@/generated/prisma/client";

/**
 * RBAC が読む Auth.js の `auth()` を差し替えるためのモック。
 * 各テストの先頭で vi.mock("@/lib/auth", ...) と併用する。
 */
export function fakeSession(user: {
  id: string;
  name?: string;
  email?: string;
  role: Role;
  status?: UserStatus;
  mustChangePassword?: boolean;
}) {
  return {
    user: {
      id: user.id,
      name: user.name ?? "テスト",
      email: user.email ?? "test@example.com",
      role: user.role,
      status: user.status ?? "ACTIVE",
      mustChangePassword: user.mustChangePassword ?? false,
    },
  };
}

/** 現在セッションを切り替える可変ホルダ。 */
export const sessionHolder: { current: ReturnType<typeof fakeSession> | null } =
  { current: null };

vi.mock("@/lib/auth", () => ({
  auth: async () => sessionHolder.current,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

// next/cache の revalidatePath はテスト環境では no-op
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

/** 兆し・通知など、ユーザーに紐づく Kizami の行を消す（テストの後始末用）。 */
export async function deleteKizamiRows(
  db: typeof import("@/lib/prisma").prisma,
  ids: string[],
) {
  await db.notification.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { senderId: { in: ids } }] },
  });
  await db.notificationPreference.deleteMany({
    where: { userId: { in: ids } },
  });
  await db.insight.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { ackById: { in: ids } }] },
  });
  await db.aiUsageLog.deleteMany({ where: { userId: { in: ids } } });
}
