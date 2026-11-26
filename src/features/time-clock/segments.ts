import type { ClockType } from "@/generated/prisma/client";

// 打刻から 1 日の勤務・休憩の区間を作る（純粋関数）。画面のタイムラインと、
// 勤務中の「今日の実働」の見込みに使う。分は勤務日 0 時（JST）からの経過分。

export type Ev = { type: ClockType; at: string };
export type Seg = {
  kind: "work" | "break";
  from: number;
  to: number;
  open: boolean;
};

const DAY = 24 * 60;

function toMin(businessDate: string, iso: string): number {
  const base = Date.parse(`${businessDate}T00:00:00+09:00`);
  return (Date.parse(iso) - base) / 60_000;
}

export function buildSegments(
  businessDate: string,
  events: Ev[],
  nowIso: string,
): Seg[] {
  const segs: Seg[] = [];
  let cur: { kind: "work" | "break"; from: number } | null = null;
  for (const e of events) {
    const m = toMin(businessDate, e.at);
    if (e.type === "CLOCK_IN") cur = { kind: "work", from: m };
    else if (e.type === "BREAK_START" && cur) {
      segs.push({ kind: cur.kind, from: cur.from, to: m, open: false });
      cur = { kind: "break", from: m };
    } else if (e.type === "BREAK_END" && cur) {
      segs.push({ kind: cur.kind, from: cur.from, to: m, open: false });
      cur = { kind: "work", from: m };
    } else if (e.type === "CLOCK_OUT" && cur) {
      segs.push({ kind: cur.kind, from: cur.from, to: m, open: false });
      cur = null;
    }
  }
  if (cur) {
    const now = toMin(businessDate, nowIso);
    segs.push({
      kind: cur.kind,
      from: cur.from,
      to: Math.max(cur.from, now),
      open: true,
    });
  }
  return segs.filter((s) => s.to > s.from);
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function overlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/** 法定労働時間（1 日 8 時間） */
const DAILY_STATUTORY_MINUTES = 8 * 60;

export type LiveTotals = {
  workedMinutes: number;
  breakMinutes: number;
  overStatutoryOtMinutes: number;
  nightMinutes: number;
};

/**
 * 勤務中の「いまの時点」の集計（見込み）。退勤後に確定する日次集計と同じ考え方で、
 * 実働・休憩・1 日 8 時間を超えた分・深夜帯の勤務を分単位で数える。
 */
export function liveTotals(
  businessDate: string,
  events: Ev[],
  nowIso: string,
  night: { start: string; end: string },
): LiveTotals {
  const segs = buildSegments(businessDate, events, nowIso);
  const ns = hmToMin(night.start);
  const ne = hmToMin(night.end);
  // 深夜帯: 前日からの続き（0 時〜終了）と、当日の開始〜翌日の終了
  const nightRanges: Array<[number, number]> =
    ns > ne
      ? [
          [0, ne],
          [ns, DAY + ne],
          [DAY + ns, 2 * DAY + ne],
        ]
      : [
          [ns, ne],
          [DAY + ns, DAY + ne],
        ];
  let worked = 0;
  let brk = 0;
  let nightMin = 0;
  for (const s of segs) {
    const len = s.to - s.from;
    if (s.kind === "work") {
      worked += len;
      for (const [a, b] of nightRanges) nightMin += overlap(s.from, s.to, a, b);
    } else {
      brk += len;
    }
  }
  const w = Math.floor(worked);
  return {
    workedMinutes: w,
    breakMinutes: Math.floor(brk),
    overStatutoryOtMinutes: Math.max(0, w - DAILY_STATUTORY_MINUTES),
    nightMinutes: Math.floor(nightMin),
  };
}
