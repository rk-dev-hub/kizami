"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { buildSegments, type Ev } from "@/features/time-clock/segments";

const DAY = 24 * 60;

function hm(m: number) {
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
}

/**
 * 0〜24 時の目盛りに、勤務（藍）・休憩（淡色）・深夜帯（網掛け）を表示する。
 * 日をまたぐ勤務は 24 時より先まで目盛りを伸ばす。
 */
export function DayTimeline({
  businessDate,
  events,
  schedule,
  night,
  initialNowIso,
}: {
  businessDate: string;
  events: Ev[];
  schedule: { start: string; end: string } | null;
  night: { start: string; end: string };
  initialNowIso: string;
}) {
  const [nowIso, setNowIso] = useState(initialNowIso);
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);

  const segs = buildSegments(businessDate, events, nowIso);
  const end = Math.max(
    DAY,
    Math.ceil(Math.max(0, ...segs.map((s) => s.to)) / 60) * 60,
  );
  const x = (m: number) => `${(Math.min(Math.max(m, 0), end) / end) * 100}%`;
  const w = (a: number, b: number) =>
    `${((Math.min(b, end) - Math.max(a, 0)) / end) * 100}%`;

  const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const ns = toM(night.start);
  const ne = toM(night.end);
  const nightBands: Array<[number, number]> = [];
  for (let base = -DAY; base < end; base += DAY) {
    if (ns > ne) nightBands.push([base + ns, base + DAY + ne]);
    else nightBands.push([base + ns, base + ne]);
  }

  const hours = Array.from({ length: end / 60 + 1 }, (_, i) => i);
  const crossDay = end > DAY;
  const worked = segs
    .filter((s) => s.kind === "work")
    .reduce((a, s) => a + s.to - s.from, 0);
  const label =
    segs.length === 0
      ? "まだ打刻がありません"
      : `勤務 ${segs
          .filter((s) => s.kind === "work")
          .map((s) => `${hm(s.from)}〜${s.open ? "勤務中" : hm(s.to)}`)
          .join("、")}`;

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative h-10" role="img" aria-label={label}>
        {/* 深夜帯 */}
        {nightBands.map(([a, b], i) =>
          b > 0 && a < end ? (
            <div
              key={i}
              className="absolute inset-y-0 opacity-60"
              style={{
                left: x(a),
                width: w(a, b),
                backgroundImage:
                  "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 5px)",
              }}
            />
          ) : null,
        )}
        {/* 所定 */}
        {schedule ? (
          <div
            className="border-primary/40 absolute top-1 bottom-1 rounded-md border border-dashed"
            style={{
              left: x(toM(schedule.start)),
              width: w(toM(schedule.start), toM(schedule.end)),
            }}
            title={`所定 ${schedule.start}〜${schedule.end}`}
          />
        ) : null}
        {/* 勤務・休憩 */}
        {segs.map((s, i) => (
          <div
            key={i}
            className={cn(
              "absolute top-2.5 bottom-2.5 rounded",
              s.kind === "work" ? "bg-primary brand-fill" : "bg-border-strong",
              s.open && "animate-pulse",
            )}
            style={{ left: x(s.from), width: w(s.from, s.to), minWidth: 2 }}
          />
        ))}
      </div>
      {/* 目盛り */}
      <div className="relative h-5 border-t" aria-hidden>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${((h * 60) / end) * 100}%` }}
          >
            <span
              className={cn(
                "bg-border-strong w-px",
                h % 6 === 0 ? "h-2" : "h-1",
              )}
            />
            {h % 6 === 0 ? (
              <span className="text-muted-foreground tabular text-[10px]">
                {h}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <figcaption className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="bg-primary brand-fill inline-block h-2 w-4 rounded-sm"
            aria-hidden
          />
          勤務 <span className="tabular">{hm(worked)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="bg-border-strong inline-block h-2 w-4 rounded-sm"
            aria-hidden
          />
          休憩
        </span>
        {schedule ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="border-primary/50 inline-block h-2 w-4 rounded-sm border border-dashed"
              aria-hidden
            />
            所定{" "}
            <span className="tabular">
              {schedule.start}〜{schedule.end}
            </span>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-4 rounded-sm border"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, var(--border-strong) 0 1px, transparent 1px 4px)",
            }}
            aria-hidden
          />
          深夜帯
        </span>
        {crossDay ? <span>日をまたぐ勤務です</span> : null}
      </figcaption>
    </figure>
  );
}
