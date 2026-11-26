import Link from "next/link";
import { PencilLine } from "lucide-react";
import { formatDateJa } from "@/lib/date-range";
import { jstDateStr } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { Minutes } from "@/components/minutes";
import { dayTypeLabel } from "@/features/calendar/labels";
import {
  displayFlagLabel,
  flagBadgeClass,
  FIXABLE_FLAGS,
} from "@/features/attendance/flag-labels";
import type { PeriodRow } from "@/features/attendance/period-view";

export function jstHm(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60_000);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 今日はまだ勤務の途中で退勤していなくて当然なので、当日ぶんの
 * MISSING_CLOCK_OUT は「打刻漏れ」として出さない（過去日はそのまま表示）。
 */
export function displayFlags(dateStr: string, flags: string[]): string[] {
  if (dateStr !== jstDateStr(new Date())) return flags;
  return flags.filter((f) => f !== "MISSING_CLOCK_OUT");
}

export function rowFlags(r: PeriodRow): string[] {
  return displayFlags(r.date, (r.summary?.flags as string[] | undefined) ?? []);
}

export function periodTotals(rows: PeriodRow[]) {
  return rows.reduce(
    (acc, { summary: s }) => ({
      days: acc.days + (s && s.workedMinutes > 0 ? 1 : 0),
      worked: acc.worked + (s?.workedMinutes ?? 0),
      brk: acc.brk + (s?.breakMinutes ?? 0),
      within: acc.within + (s?.withinStatutoryOtMinutes ?? 0),
      over: acc.over + (s?.overStatutoryOtMinutes ?? 0),
      night: acc.night + (s?.nightMinutes ?? 0),
      legal: acc.legal + (s?.legalHolidayMinutes ?? 0),
      late: acc.late + (s?.lateMinutes ?? 0),
      early: acc.early + (s?.earlyLeaveMinutes ?? 0),
    }),
    {
      days: 0,
      worked: 0,
      brk: 0,
      within: 0,
      over: 0,
      night: 0,
      legal: 0,
      late: 0,
      early: 0,
    },
  );
}

function FlagChips({ flags }: { flags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className={cn(
            "rounded px-1.5 py-px text-[11px] whitespace-nowrap",
            flagBadgeClass(f),
          )}
        >
          {displayFlagLabel(f)}
        </span>
      ))}
    </div>
  );
}

function FixLink({ date }: { date: string }) {
  return (
    <Link
      href={`/requests?tab=correction&date=${date}`}
      className="text-primary inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap hover:underline"
    >
      <PencilLine className="size-3.5" aria-hidden />
      この日を修正
    </Link>
  );
}

const dayRowClass = {
  WORKDAY: "",
  PRESCRIBED_HOLIDAY: "bg-daytype-prescribed-holiday",
  LEGAL_HOLIDAY: "bg-daytype-legal-holiday",
} as const;

/**
 * 締め期間の日別明細（勤怠・勤務表で共用）。
 * PC は表、スマホは 1 日 1 行のカード。canFix のとき、直せるフラグがある日に修正リンクを出す。
 */
export function AttendanceTable({
  rows,
  canFix = false,
}: {
  rows: PeriodRow[];
  canFix?: boolean;
}) {
  const t = periodTotals(rows);
  return (
    <>
      {/* スマホ */}
      <ul className="divide-y md:hidden">
        {rows.map((r) => {
          const s = r.summary;
          const flags = rowFlags(r);
          const fixable = canFix && flags.some((f) => FIXABLE_FLAGS.has(f));
          return (
            <li
              key={r.date}
              className={cn(
                "flex flex-col gap-1 px-4 py-2.5",
                dayRowClass[r.dayType],
              )}
            >
              <div className="flex items-center gap-3">
                <span className="tabular w-20 text-sm font-medium">
                  {formatDateJa(r.date)}
                </span>
                {r.dayType !== "WORKDAY" ? (
                  <span className="text-muted-foreground text-xs">
                    {dayTypeLabel[r.dayType]}
                  </span>
                ) : null}
                <span className="tabular text-muted-foreground flex-1 text-right text-sm">
                  {s?.firstIn ? jstHm(s.firstIn) : "—"} 〜{" "}
                  {s?.lastOut ? jstHm(s.lastOut) : "—"}
                </span>
                <span className="w-12 text-right text-sm font-medium">
                  <Minutes value={s?.workedMinutes} />
                </span>
              </div>
              {flags.length > 0 || fixable ? (
                <div className="flex items-center justify-between gap-2">
                  <FlagChips flags={flags} />
                  {fixable ? <FixLink date={r.date} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* PC */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="px-4 py-2 font-medium">日付</th>
              <th className="py-2 pr-3 font-medium">出勤</th>
              <th className="py-2 pr-3 font-medium">退勤</th>
              <th className="py-2 pr-3 text-right font-medium">休憩</th>
              <th className="py-2 pr-3 text-right font-medium">実働</th>
              <th className="py-2 pr-3 text-right font-medium">法定内残業</th>
              <th className="py-2 pr-3 text-right font-medium">法定外残業</th>
              <th className="py-2 pr-3 text-right font-medium">深夜</th>
              <th className="py-2 pr-3 text-right font-medium">法定休日</th>
              <th className="py-2 pr-3 text-right font-medium">遅刻</th>
              <th className="py-2 pr-3 text-right font-medium">早退</th>
              <th className="py-2 pr-4 font-medium">気になる点</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.summary;
              const flags = rowFlags(r);
              const fixable = canFix && flags.some((f) => FIXABLE_FLAGS.has(f));
              return (
                <tr
                  key={r.date}
                  className={cn(
                    "border-b last:border-0",
                    dayRowClass[r.dayType],
                  )}
                >
                  <td className="tabular px-4 py-1.5 whitespace-nowrap">
                    {formatDateJa(r.date)}
                    {r.dayType !== "WORKDAY" ? (
                      <span className="text-muted-foreground ml-1.5 text-[11px]">
                        {dayTypeLabel[r.dayType]}
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular py-1.5 pr-3">
                    {s?.firstIn ? jstHm(s.firstIn) : "—"}
                  </td>
                  <td className="tabular py-1.5 pr-3">
                    {s?.lastOut ? jstHm(s.lastOut) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Minutes value={s?.breakMinutes} />
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium">
                    <Minutes value={s?.workedMinutes} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Minutes value={s?.withinStatutoryOtMinutes} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Minutes value={s?.overStatutoryOtMinutes} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Minutes value={s?.nightMinutes} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Minutes value={s?.legalHolidayMinutes} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Minutes value={s?.lateMinutes} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <Minutes value={s?.earlyLeaveMinutes} />
                  </td>
                  <td className="py-1.5 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <FlagChips flags={flags} />
                      {fixable ? <FixLink date={r.date} /> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-4 py-2" colSpan={3}>
                合計
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.brk} dashOnZero={false} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.worked} dashOnZero={false} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.within} dashOnZero={false} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.over} dashOnZero={false} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.night} dashOnZero={false} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.legal} dashOnZero={false} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.late} dashOnZero={false} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Minutes value={t.early} dashOnZero={false} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

/** 月のカレンダー表示。各日の実働と、休日・気になる点をアイコンで出す。 */
export function AttendanceCalendar({
  rows,
  canFix = false,
}: {
  rows: PeriodRow[];
  canFix?: boolean;
}) {
  if (rows.length === 0) return null;
  const first = new Date(`${rows[0].date}T00:00:00Z`).getUTCDay();
  const today = jstDateStr(new Date());
  const cells: Array<PeriodRow | null> = [...Array(first).fill(null), ...rows];
  return (
    <div className="p-2 sm:p-4">
      <div className="text-muted-foreground grid grid-cols-7 pb-1 text-center text-[11px]">
        {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((r, i) => {
          if (!r) return <div key={`e${i}`} />;
          const s = r.summary;
          const flags = rowFlags(r);
          const problem = flags.some((f) => FIXABLE_FLAGS.has(f));
          const caution = !problem && flags.length > 0;
          const d = Number(r.date.slice(8));
          const content = (
            <>
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "tabular text-xs",
                    r.date === today &&
                      "bg-primary text-primary-foreground rounded px-1",
                  )}
                >
                  {d === 1 || i === first
                    ? `${Number(r.date.slice(5, 7))}/${d}`
                    : d}
                </span>
                {problem ? (
                  <span
                    className="bg-destructive size-1.5 rounded-full"
                    aria-label="打刻に不備"
                  />
                ) : caution ? (
                  <span
                    className="bg-warning size-1.5 rounded-full"
                    aria-label="注意"
                  />
                ) : null}
              </span>
              <span className="tabular mt-auto text-right text-[13px] font-medium sm:text-sm">
                {s && s.workedMinutes > 0 ? (
                  <Minutes value={s.workedMinutes} />
                ) : (
                  <span className="text-muted-foreground/60 text-xs">
                    {r.dayType !== "WORKDAY" ? "休" : ""}
                  </span>
                )}
              </span>
            </>
          );
          const cls = cn(
            "flex min-h-16 flex-col rounded-md border p-1.5",
            dayRowClass[r.dayType],
            problem && "border-destructive/50",
          );
          return canFix && problem ? (
            <Link
              key={r.date}
              href={`/requests?tab=correction&date=${r.date}`}
              className={cn(cls, "hover:bg-surface-2")}
              title={`${flags.map(displayFlagLabel).join("・")}（クリックで修正）`}
            >
              {content}
            </Link>
          ) : (
            <div
              key={r.date}
              className={cls}
              title={flags.map(displayFlagLabel).join("・") || undefined}
            >
              {content}
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-3 flex flex-wrap gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-destructive size-1.5 rounded-full" aria-hidden />{" "}
          打刻に不備
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-warning size-1.5 rounded-full" aria-hidden />{" "}
          注意（残業・休日出勤など）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="bg-daytype-prescribed-holiday size-3 rounded-sm border"
            aria-hidden
          />{" "}
          休日
        </span>
      </p>
    </div>
  );
}
