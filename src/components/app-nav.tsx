"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  Bell,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  FileText,
  Gauge,
  Gift,
  LayoutGrid,
  Lock,
  type LucideIcon,
  ScrollText,
  Send,
  Settings,
  Sparkles,
  Table2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type Badges = { approvals: number; insights: number; unread: number };
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: keyof Badges;
};

const MAIN: NavItem[] = [
  { href: "/", label: "打刻", icon: Clock3 },
  { href: "/attendance", label: "勤怠", icon: Table2 },
  { href: "/requests", label: "申請", icon: Send },
  { href: "/reports", label: "勤務表", icon: FileText },
  { href: "/notifications", label: "通知", icon: Bell, badge: "unread" },
];

const ADMIN: NavItem[] = [
  { href: "/admin", label: "ダッシュボード", icon: Gauge },
  {
    href: "/approvals",
    label: "承認待ち",
    icon: ClipboardCheck,
    badge: "approvals",
  },
  {
    href: "/admin/insights",
    label: "兆しレポート",
    icon: Sparkles,
    badge: "insights",
  },
  { href: "/admin/closing", label: "月次締め", icon: Lock },
  { href: "/admin/users", label: "ユーザー", icon: Users },
  { href: "/admin/work-rules", label: "就業規則・36 協定", icon: Wrench },
  { href: "/admin/patterns", label: "勤務パターン", icon: CalendarRange },
  { href: "/admin/calendar", label: "休日カレンダー", icon: CalendarDays },
  { href: "/admin/leave-grants", label: "有給付与", icon: Gift },
  { href: "/admin/audit", label: "監査ログ", icon: ScrollText },
];

const SETTINGS: NavItem = { href: "/settings", label: "設定", icon: Settings };

function isActive(pathname: string, href: string) {
  if (href === "/" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  badges,
  onNavigate,
}: {
  item: NavItem;
  badges: Badges;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const count = item.badge ? badges[item.badge] : 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "brand-soft-fill text-primary-soft-foreground font-medium shadow-[inset_3px_0_0_var(--brand-1)]"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 ? (
        <span
          className="brand-fill tabular min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5"
          aria-label={`${count} 件`}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function NavSections({
  role,
  badges,
  onNavigate,
}: {
  role: Role;
  badges: Badges;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-0.5">
        {MAIN.map((i) => (
          <li key={i.href}>
            <NavLink item={i} badges={badges} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      {role === "ADMIN" ? (
        <div>
          <p className="text-muted-foreground mb-1.5 px-2.5 text-[11px] font-medium tracking-wider">
            管理
          </p>
          <ul className="flex flex-col gap-0.5">
            {ADMIN.map((i) => (
              <li key={i.href}>
                <NavLink item={i} badges={badges} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul>
        <li>
          <NavLink item={SETTINGS} badges={badges} onNavigate={onNavigate} />
        </li>
      </ul>
    </div>
  );
}

/** PC: 左のサイドナビ */
export function SideNav({ role, badges }: { role: Role; badges: Badges }) {
  return (
    <nav aria-label="メインメニュー">
      <NavSections role={role} badges={badges} />
    </nav>
  );
}

const TABS: NavItem[] = [MAIN[0], MAIN[1], MAIN[2], MAIN[4]];

/** スマホ: 下部タブ（打刻 / 勤怠 / 申請 / 通知 / その他） */
export function BottomTabNav({ role, badges }: { role: Role; badges: Badges }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  useEffect(() => close(), [pathname]);

  const otherCount = role === "ADMIN" ? badges.approvals + badges.insights : 0;
  const tabActive = TABS.some((t) => isActive(pathname, t.href));

  return (
    <>
      <nav
        aria-label="メインメニュー"
        className="bg-surface/80 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            const count = t.badge ? badges[t.badge] : 0;
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 py-2 text-[11px]",
                    active
                      ? "text-primary font-medium [&_svg]:text-[var(--brand-2)]"
                      : "text-muted-foreground",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="brand-fill absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full"
                    />
                  ) : null}
                  <Icon className="size-5" aria-hidden />
                  {t.label}
                  {count > 0 ? (
                    <span className="brand-fill absolute top-1 left-1/2 ml-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4">
                      {count > 99 ? "99+" : count}
                      <span className="sr-only"> 件</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => dialog.current?.showModal()}
              className={cn(
                "relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px]",
                !tabActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground",
              )}
            >
              <LayoutGrid className="size-5" aria-hidden />
              その他
              {otherCount > 0 ? (
                <span className="bg-primary absolute top-1.5 left-1/2 ml-2 size-2 rounded-full">
                  <span className="sr-only">未処理あり</span>
                </span>
              ) : null}
            </button>
          </li>
        </ul>
      </nav>
      <dialog
        ref={dialog}
        aria-label="メニュー"
        className="bg-surface text-foreground mt-auto mb-0 max-h-[85vh] w-full max-w-none rounded-t-2xl border-t p-0 backdrop:bg-black/40 lg:hidden"
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-sm font-medium">メニュー</span>
          <button
            type="button"
            onClick={close}
            className="rounded p-1"
            aria-label="閉じる"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-3 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <NavSections role={role} badges={badges} onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}
