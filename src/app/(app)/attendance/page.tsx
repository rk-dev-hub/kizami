import { prisma } from "@/lib/prisma";
import { requireUser } from "@/features/auth/rbac";
import { jstDateStr } from "@/lib/datetime";
import { formatDateJa } from "@/lib/date-range";
import { dateParam, stringParam, uuidParam } from "@/lib/params";
import { getPeriodView } from "@/features/attendance/period-view";
import {
  AttendanceCalendar,
  AttendanceTable,
  periodTotals,
  rowFlags,
} from "@/features/attendance/attendance-table";
import { FIXABLE_FLAGS } from "@/features/attendance/flag-labels";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PeriodNav } from "@/components/period-nav";
import { UserPicker } from "@/components/user-picker";
import { Minutes } from "@/components/minutes";
import { LinkTabs } from "@/components/tabs";

export const metadata = { title: "勤怠 — Kizami" };
export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: PageProps<"/attendance">) {
  const me = await requireUser();
  const sp = await searchParams;
  const ref = dateParam(sp.ref, jstDateStr(new Date()));
  const view_ = stringParam(sp.view) === "calendar" ? "calendar" : "list";
  const isAdmin = me.role === "ADMIN";
  const requested = isAdmin ? uuidParam(sp.user) : null;
  const targetId = requested ?? me.id;

  const [view, users, target] = await Promise.all([
    getPeriodView(targetId, ref),
    isAdmin
      ? prisma.user.findMany({
          orderBy: { employeeCode: "asc" },
          select: { id: true, name: true, employeeCode: true },
        })
      : Promise.resolve([]),
    prisma.user.findUnique({ where: { id: targetId }, select: { name: true } }),
  ]);
  const isSelf = targetId === me.id;
  const t = periodTotals(view.rows);
  const fixCount = view.rows.filter((r) =>
    rowFlags(r).some((f) => FIXABLE_FLAGS.has(f)),
  ).length;
  const extra = `${requested ? `&user=${requested}` : ""}${view_ === "calendar" ? "&view=calendar" : ""}`;
  const q = (v: string) =>
    `/attendance?ref=${ref}${requested ? `&user=${requested}` : ""}${v === "calendar" ? "&view=calendar" : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="勤怠"
        description={`${formatDateJa(view.startStr)} 〜 ${formatDateJa(view.endStr)}${isSelf ? "" : `・${target?.name ?? ""}`}`}
        actions={
          <>
            {isAdmin ? (
              <UserPicker
                users={users}
                current={targetId}
                basePath="/attendance"
              />
            ) : null}
            <PeriodNav
              basePath="/attendance"
              startStr={view.startStr}
              endStr={view.endStr}
              closingDay={view.closingDay}
              extraParams={extra}
            />
          </>
        }
      />

      <dl className="bg-surface [&>div]:bg-surface grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-5 [&>div]:px-4 [&>div]:py-3">
        <Total
          label="出勤日数"
          value={<span className="tabular">{t.days} 日</span>}
        />
        <Total
          label="実働"
          value={<Minutes value={t.worked} dashOnZero={false} />}
        />
        <Total
          label="法定外残業"
          value={<Minutes value={t.over} dashOnZero={false} />}
        />
        <Total
          label="深夜"
          value={<Minutes value={t.night} dashOnZero={false} />}
        />
        <Total
          label="打刻の不備"
          value={
            <span
              className={fixCount > 0 ? "text-destructive tabular" : "tabular"}
            >
              {fixCount} 日
            </span>
          }
        />
      </dl>

      <Card className="overflow-hidden">
        <LinkTabs
          className="px-3"
          current={view_}
          tabs={[
            { key: "list", label: "リスト", href: q("list") },
            { key: "calendar", label: "カレンダー", href: q("calendar") },
          ]}
        />
        {view_ === "calendar" ? (
          <AttendanceCalendar rows={view.rows} canFix={isSelf} />
        ) : (
          <AttendanceTable rows={view.rows} canFix={isSelf} />
        )}
      </Card>
      {isSelf && fixCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          打刻に不備がある日は「この日を修正」から打刻修正を申請できます。
        </p>
      ) : null}
    </div>
  );
}

function Total({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}
