"use client";

import { useEffect, useState } from "react";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

function jstParts(d: Date) {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return {
    hh: String(j.getUTCHours()).padStart(2, "0"),
    mm: String(j.getUTCMinutes()).padStart(2, "0"),
    ss: String(j.getUTCSeconds()).padStart(2, "0"),
    date: `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日（${WD[j.getUTCDay()]}）`,
  };
}

/** 大きな現在時刻（JST）。表示だけで、打刻にはサーバの時刻を使う。 */
export function ClockFace({
  initialIso,
  dayLabel,
}: {
  initialIso: string;
  dayLabel: string;
}) {
  const [now, setNow] = useState(() => new Date(initialIso));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const p = jstParts(now);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-sm">
        {p.date}
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        {dayLabel}
      </p>
      <p
        className="tabular font-mono leading-none font-medium tracking-tight"
        aria-live="off"
      >
        <time
          dateTime={now.toISOString()}
          className="brand-text text-5xl sm:text-6xl"
        >
          {p.hh}:{p.mm}
        </time>
        <span className="text-muted-foreground ml-1.5 text-xl sm:text-2xl">
          {p.ss}
        </span>
      </p>
    </div>
  );
}
