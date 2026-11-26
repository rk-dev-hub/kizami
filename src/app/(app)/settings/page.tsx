import { cookies } from "next/headers";
import { requireUser } from "@/features/auth/rbac";
import {
  getPreferences,
  notificationKindLabel,
} from "@/features/notification/usecase";
import type { NotificationKind } from "@/generated/prisma/client";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChangePasswordForm } from "@/app/(auth)/first-password/change-password-form";
import { NotificationPrefs } from "./notification-prefs";

export const metadata = { title: "設定 — Kizami" };
export const dynamic = "force-dynamic";

const EMPLOYEE_KINDS: NotificationKind[] = [
  "FORGOT_CLOCK_OUT",
  "MISSING_PUNCH",
  "REQUEST_RESULT",
  "ADMIN_MESSAGE",
];
const ADMIN_KINDS: NotificationKind[] = [
  "INSIGHT_ALERT",
  "PENDING_APPROVALS",
  "WEEKLY_DIGEST",
];

export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, jar] = await Promise.all([getPreferences(user.id), cookies()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const kinds =
    user.role === "ADMIN"
      ? [...EMPLOYEE_KINDS, ...ADMIN_KINDS]
      : EMPLOYEE_KINDS;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title="設定" />
      <Card>
        <CardHeader>
          <CardTitle>表示</CardTitle>
          <CardDescription>
            画面の明るさ。「システム」は端末の設定に合わせます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle initial={theme} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>通知メール</CardTitle>
          <CardDescription>
            アプリ内の通知は常に届きます。メールでも受け取るものを選んでください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPrefs
            items={kinds.map((k) => ({
              kind: k,
              label: notificationKindLabel[k],
              email: prefs[k],
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>パスワード</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm from="settings" />
        </CardContent>
      </Card>
    </div>
  );
}
