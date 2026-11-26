import { describe, expect, it } from "vitest";
import {
  draftHref,
  readCorrectionPrefill,
  readLeavePrefill,
} from "@/features/kizami/draft-link";

function paramsOf(href: string) {
  const q = new URL(href, "http://localhost").searchParams;
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(q.keys())) {
    const all = q.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

describe("Kizami の下書きリンク", () => {
  it("打刻修正の下書きをフォームの初期値に戻せる", () => {
    const href = draftHref({
      kind: "CORRECTION",
      workDate: "2026-11-24",
      lines: [
        { op: "ADD", clockType: "CLOCK_OUT", time: "19:00", nextDay: false },
        { op: "ADD", clockType: "CLOCK_OUT", time: "01:30", nextDay: true },
      ],
      reason: "退勤の押し忘れ",
    });
    expect(href.startsWith("/requests?")).toBe(true);
    const p = readCorrectionPrefill(paramsOf(href));
    expect(p).toEqual({
      date: "2026-11-24",
      lines: [
        { op: "ADD", clockType: "CLOCK_OUT", time: "19:00", nextDay: false },
        { op: "ADD", clockType: "CLOCK_OUT", time: "01:30", nextDay: true },
      ],
      reason: "退勤の押し忘れ",
      fromKizami: true,
    });
  });

  it("休暇の下書きをフォームの初期値に戻せる", () => {
    const href = draftHref({
      kind: "LEAVE",
      leaveType: "PAID",
      dayPart: "AM",
      startDate: "2026-12-01",
      endDate: "2026-12-01",
      reason: "通院",
    });
    expect(readLeavePrefill(paramsOf(href))).toEqual({
      type: "PAID",
      part: "AM",
      start: "2026-12-01",
      end: "2026-12-01",
      reason: "通院",
      fromKizami: true,
    });
  });

  it("形式に合わない値は無視する", () => {
    const p = readCorrectionPrefill({
      date: "2026/11/24",
      line: [
        "ADD.CLOCK_OUT.19:00.0",
        "DROP.TABLE.00:00.0",
        "ADD.CLOCK_IN.9:00.0",
      ],
      reason: "x".repeat(500),
    });
    expect(p.date).toBeNull();
    expect(p.lines).toHaveLength(1);
    expect(p.reason).toHaveLength(200);
    expect(p.fromKizami).toBe(false);

    const l = readLeavePrefill({ type: "BONUS", part: "NIGHT", start: "x" });
    expect(l).toMatchObject({ type: null, part: null, start: null, end: null });
  });

  it("明細は 6 行までしか読まない", () => {
    const line = Array.from({ length: 10 }, () => "ADD.BREAK_START.12:00.0");
    expect(readCorrectionPrefill({ line }).lines).toHaveLength(6);
  });
});
