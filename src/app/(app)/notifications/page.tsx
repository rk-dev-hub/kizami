import Link from "next/link";
import { BellOff } from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import {
  listNotifications,
  notificationKindLabel,
} from "@/features/notification/usecase";
import { isAppPath } from "@/features/notification/mailer";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MarkAllReadButton, MarkReadOnOpen } from "./mark-read";

export const metadata = { title: "通知 — Kizami" };
export const dynamic = "force-dynamic";

function when(d: Date): string {
  const j = new Date(d.getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${p(j.getUTCHours())}:${p(j.getUTCMinutes())}`;
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).map((n) => n.id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="通知"
        description="申請の結果、管理者からのメッセージ、打刻のお知らせなど。"
        actions={unread.length > 0 ? <MarkAllReadButton /> : null}
      />
      {items.length === 0 ? (
        <EmptyState icon={BellOff} title="通知はありません">
          申請の結果や管理者からのメッセージが届くと、ここに表示されます。
        </EmptyState>
      ) : (
        <ul className="bg-surface divide-y rounded-xl border">
          {items.map((n) => {
            const isUnread = !n.readAt;
            const href =
              n.linkPath && isAppPath(n.linkPath) ? n.linkPath : null;
            return (
              <li
                key={n.id}
                className={cn(
                  "flex gap-3 px-4 py-3",
                  isUnread && "bg-primary-soft/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    isUnread ? "bg-primary" : "bg-transparent",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        n.kind === "ADMIN_MESSAGE" ? "primary" : "default"
                      }
                    >
                      {notificationKindLabel[n.kind]}
                    </Badge>
                    <span className="text-muted-foreground tabular text-xs">
                      {when(n.createdAt)}
                    </span>
                    {n.sender ? (
                      <span className="text-muted-foreground text-xs">
                        {n.sender.name} さんから
                      </span>
                    ) : null}
                    {isUnread ? <span className="sr-only">未読</span> : null}
                  </div>
                  <p className={cn("mt-1 text-sm", isUnread && "font-medium")}>
                    {n.title}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-wrap">
                    {n.body}
                  </p>
                  {href ? (
                    <Link
                      href={href}
                      className="text-primary mt-1 inline-block text-sm hover:underline"
                    >
                      開く
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <MarkReadOnOpen ids={unread} />
    </div>
  );
}
