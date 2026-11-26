import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import { countPending } from "@/features/approval/usecase";
import { countOpenAdminInsights } from "@/features/insight/admin-usecase";
import { countUnread } from "@/features/notification/usecase";
import { BottomTabNav, SideNav } from "@/components/app-nav";
import { UserMenu } from "@/components/user-menu";
import { ToastProvider } from "@/components/toast";
import { KizamiLogo } from "@/components/kizami/mark";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/first-password");

  const isAdmin = user.role === "ADMIN";
  const [approvals, insights, unread] = await Promise.all([
    isAdmin ? countPending() : 0,
    isAdmin ? countOpenAdminInsights() : 0,
    countUnread(user.id),
  ]);
  const badges = { approvals, insights, unread };

  return (
    <ToastProvider>
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        本文へ移動
      </a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-(image:--sidebar-bg) backdrop-blur-xl lg:flex">
          <div className="px-4 py-4">
            <Link href="/" aria-label="Kizami ホーム">
              <KizamiLogo className="text-base" />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 pb-4">
            <SideNav role={user.role} badges={badges} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-background/60 sticky top-0 z-20 border-b backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 lg:px-8">
              <Link href="/" className="lg:hidden" aria-label="Kizami ホーム">
                <KizamiLogo className="text-[15px]" />
              </Link>
              <div className="flex-1" />
              <Link
                href="/notifications"
                className="hover:bg-surface-2 relative rounded-lg p-2"
                aria-label={unread > 0 ? `通知（未読 ${unread} 件）` : "通知"}
              >
                <Bell className="size-[18px]" aria-hidden />
                {unread > 0 ? (
                  <span className="brand-fill ring-background absolute top-1.5 right-1.5 size-2 rounded-full ring-2" />
                ) : null}
              </Link>
              <UserMenu name={user.name} isAdmin={isAdmin} />
            </div>
          </header>
          <main
            id="main"
            className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-12"
          >
            {children}
          </main>
        </div>
      </div>
      <BottomTabNav role={user.role} badges={badges} />
    </ToastProvider>
  );
}
