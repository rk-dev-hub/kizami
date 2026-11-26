import { z } from "zod";
import type { DraftFromText } from "./schemas";

// Kizami の下書きを申請フォームに渡すための URL（クエリ）の組み立てと読み取り。
// 下書きは保存しない。フォームで本人が確認してから送信する。

type Correction = Extract<DraftFromText, { kind: "CORRECTION" }>;
type Leave = Extract<DraftFromText, { kind: "LEAVE" }>;

export function draftHref(draft: Correction | Leave): string {
  const q = new URLSearchParams();
  q.set("from", "kizami");
  if (draft.kind === "CORRECTION") {
    q.set("tab", "correction");
    q.set("date", draft.workDate);
    for (const l of draft.lines) {
      q.append("line", `${l.op}.${l.clockType}.${l.time}.${l.nextDay ? 1 : 0}`);
    }
    q.set("reason", draft.reason);
  } else {
    q.set("tab", "leave");
    q.set("type", draft.leaveType);
    q.set("part", draft.dayPart);
    q.set("start", draft.startDate);
    q.set("end", draft.endDate);
    q.set("reason", draft.reason);
  }
  return `/requests?${q.toString()}`;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lineRe =
  /^(ADD|UPDATE|DELETE)\.(CLOCK_IN|CLOCK_OUT|BREAK_START|BREAK_END)\.(\d{2}:\d{2})\.([01])$/;

export type CorrectionPrefill = {
  date: string | null;
  lines: Array<{
    op: "ADD" | "UPDATE" | "DELETE";
    clockType: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
    time: string;
    nextDay: boolean;
  }>;
  reason: string;
  fromKizami: boolean;
};

export type LeavePrefill = {
  type: "PAID" | "ABSENCE" | "SPECIAL_UNPAID" | null;
  part: "FULL" | "AM" | "PM" | null;
  start: string | null;
  end: string | null;
  reason: string;
  fromKizami: boolean;
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v : v ? [v] : [];

/** クエリからフォームの初期値を読む。形式に合わないものは無視する。 */
export function readCorrectionPrefill(sp: Params): CorrectionPrefill {
  const date = isoDate.safeParse(one(sp.date));
  const lines = many(sp.line)
    .slice(0, 6)
    .map((s) => lineRe.exec(s))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      op: m[1] as CorrectionPrefill["lines"][number]["op"],
      clockType: m[2] as CorrectionPrefill["lines"][number]["clockType"],
      time: m[3],
      nextDay: m[4] === "1",
    }));
  return {
    date: date.success ? date.data : null,
    lines,
    reason: (one(sp.reason) ?? "").slice(0, 200),
    fromKizami: one(sp.from) === "kizami",
  };
}

export function readLeavePrefill(sp: Params): LeavePrefill {
  const type = z
    .enum(["PAID", "ABSENCE", "SPECIAL_UNPAID"])
    .safeParse(one(sp.type));
  const part = z.enum(["FULL", "AM", "PM"]).safeParse(one(sp.part));
  const start = isoDate.safeParse(one(sp.start));
  const end = isoDate.safeParse(one(sp.end));
  return {
    type: type.success ? type.data : null,
    part: part.success ? part.data : null,
    start: start.success ? start.data : null,
    end: end.success ? end.data : null,
    reason: (one(sp.reason) ?? "").slice(0, 200),
    fromKizami: one(sp.from) === "kizami",
  };
}
