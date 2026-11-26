import { Suspense } from "react";
import { requireUser } from "@/features/auth/rbac";
import { getTodayState } from "@/features/time-clock/usecase";
import {
  getHomeContext,
  WEEKLY_LIMIT_MINUTES,
} from "@/features/time-clock/home";
import { clockTypeLabel } from "@/features/time-clock/labels";
import { dayTypeLabel } from "@/features/calendar/labels";
import { displayFlagLabel } from "@/features/attendance/flag-labels";
import { isKizamiAiEnabled } from "@/features/kizami/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/empty-state";
import { Minutes, JstTime } from "@/components/minutes";
import { MetricGauge } from "@/components/metric-gauge";
import { ClockFace } from "@/components/clock/clock-face";
import { ClockActions } from "@/components/clock/clock-actions";
import { DayTimeline } from "@/components/clock/day-timeline";
import { KizamiHeading } from "@/components/kizami/note";
import { KizamiComposer } from "@/components/kizami/composer";
import { formatDateJa } from "@/lib/date-range";
import { minutesToHm } from "@/lib/datetime";
import { liveTotals } from "@/features/time-clock/segments";
import { KizamiNotes } from "./kizami-notes";

export const metadata = { title: "打刻 — Kizami" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const now = new Date();
  const [today, ctx] = await Promise.all([
    getTodayState(user.id),
    getHomeContext(user.id, now),
  ]);
  const crossDay = today.businessDate !== ctx.today;
  const dayLabel = ctx.holidayName ?? dayTypeLabel[ctx.dayType];
  const s = today.summary;
  // 勤務中は日次集計がまだ確定していないため、打刻から「いまの時点」の値を出す
  const working = today.state === "WORKING" || today.state === "ON_BREAK";
  const live = working
    ? liveTotals(today.businessDate, today.events, now.toISOString(), ctx.night)
    : null;
  const todayTotals = live ?? {
    workedMinutes: s?.workedMinutes ?? 0,
    breakMinutes: s?.breakMinutes ?? 0,
    overStatutoryOtMinutes: s?.overStatutoryOtMinutes ?? 0,
    nightMinutes: s?.nightMinutes ?? 0,
  };
  const inThisWeek =
    today.businessDate >= ctx.week.from && today.businessDate <= ctx.week.to;
  const weekWorked =
    ctx.week.workedMinutes +
    (live && inThisWeek
      ? Math.max(0, live.workedMinutes - (s?.workedMinutes ?? 0))
      : 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <h1 className="sr-only">打刻</h1>
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="clock-hero">
          <CardContent className="flex flex-col gap-6 pt-5">
            <ClockFace initialIso={now.toISOString()} dayLabel={dayLabel} />
            <ClockActions
              state={today.state}
              allowed={today.allowed}
              crossDayFrom={crossDay ? formatDateJa(today.businessDate) : null}
            />
            <div className="tick-rule" aria-hidden />
            <DayTimeline
              businessDate={today.businessDate}
              events={today.events}
              schedule={crossDay ? null : ctx.schedule}
              night={ctx.night}
              initialNowIso={now.toISOString()}
            />
            {today.events.length > 0 ? (
              <ol
                className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
                aria-label="今日の打刻"
              >
                {today.events.map((e, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">
                      {clockTypeLabel[e.type]}
                    </span>
                    <JstTime iso={e.at} />
                  </li>
                ))}
              </ol>
            ) : null}
          </CardContent>
        </Card>

        <section aria-labelledby="kizami-notes" className="flex flex-col gap-3">
          <div id="kizami-notes">
            <KizamiHeading>Kizami の気づき</KizamiHeading>
          </div>
          <Suspense
            fallback={
              <div className="flex flex-col gap-2">
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            }
          >
            <KizamiNotes user={user} />
          </Suspense>
        </section>

        {isKizamiAiEnabled() ? (
          <Card>
            <CardHeader>
              <KizamiHeading hint="打刻の修正や休暇を文章で頼めます">
                Kizami に話しかける
              </KizamiHeading>
            </CardHeader>
            <CardContent>
              <KizamiComposer />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <aside className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>今日</CardTitle>
            {live ? (
              <p className="text-muted-foreground text-xs">
                勤務中のため、いまの時点の見込みです（退勤時に確定）
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat label="実働" value={todayTotals.workedMinutes} />
              <Stat label="休憩" value={todayTotals.breakMinutes} />
              <Stat
                label="法定外残業"
                value={todayTotals.overStatutoryOtMinutes}
              />
              <Stat label="深夜" value={todayTotals.nightMinutes} />
            </dl>
            {s?.flags.length ? (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {s.flags.map((f) => (
                  <li key={f}>
                    <Badge variant="warning">{displayFlagLabel(f)}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>今週</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <MetricGauge
              label="週 40 時間まで"
              actual={weekWorked}
              limit={WEEKLY_LIMIT_MINUTES}
              format={minutesToHm}
            />
            <p className="text-muted-foreground text-xs">
              {formatDateJa(ctx.week.from)}〜{formatDateJa(ctx.week.to)}
              {weekWorked < WEEKLY_LIMIT_MINUTES
                ? `・残り ${minutesToHm(WEEKLY_LIMIT_MINUTES - weekWorked)}`
                : "・40 時間を超えています"}
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">
        <Minutes value={value} dashOnZero={false} />
      </dd>
    </div>
  );
}
