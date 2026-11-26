import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { jstDateStr } from "@/lib/datetime";
import { addDaysStr } from "@/lib/date-range";
import { periodRangeFor } from "@/features/aggregation/domain/period";

const btn =
  "border-border-strong bg-surface hover:bg-surface-2 inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm";

function periodLabel(endStr: string): string {
  return `${Number(endStr.split("-")[1])}月`;
}

/** 勤怠・勤務表で共用する締め期間の切り替え。 */
export function PeriodNav({
  basePath,
  startStr,
  endStr,
  closingDay,
  extraParams = "",
}: {
  basePath: string;
  startStr: string;
  endStr: string;
  closingDay: number;
  extraParams?: string;
}) {
  const prevRef = addDaysStr(startStr, -1);
  const nextRef = addDaysStr(endStr, 1);
  const prevPeriod = periodRangeFor(prevRef, closingDay);
  const nextPeriod = periodRangeFor(nextRef, closingDay);
  const today = jstDateStr(new Date());
  const isCurrent = periodRangeFor(today, closingDay).startStr === startStr;

  return (
    <nav aria-label="期間の切り替え" className="flex gap-1.5">
      <Link
        href={`${basePath}?ref=${prevRef}${extraParams}`}
        className={btn}
        aria-label={`前の期間（${periodLabel(prevPeriod.endStr)}）`}
      >
        <ChevronLeft className="size-4" aria-hidden />
        {periodLabel(prevPeriod.endStr)}
      </Link>
      {!isCurrent ? (
        <Link href={`${basePath}?ref=${today}${extraParams}`} className={btn}>
          今月
        </Link>
      ) : null}
      <Link
        href={`${basePath}?ref=${nextRef}${extraParams}`}
        className={btn}
        aria-label={`次の期間（${periodLabel(nextPeriod.endStr)}）`}
      >
        {periodLabel(nextPeriod.endStr)}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </nav>
  );
}
