import { describe, expect, it } from "vitest";
import { liveTotals } from "@/features/time-clock/segments";
import { formatRangeJa } from "@/lib/date-range";

const night = { start: "22:00", end: "05:00" };
const at = (d: string, t: string) =>
  new Date(`${d}T${t}:00+09:00`).toISOString();

describe("勤務中の今日の集計（見込み）", () => {
  it("出勤から今までの実働と休憩を数える", () => {
    const r = liveTotals(
      "2026-11-25",
      [
        { type: "CLOCK_IN", at: at("2026-11-25", "09:00") },
        { type: "BREAK_START", at: at("2026-11-25", "12:00") },
        { type: "BREAK_END", at: at("2026-11-25", "13:00") },
      ],
      at("2026-11-25", "16:30"),
      night,
    );
    expect(r).toEqual({
      workedMinutes: 390,
      breakMinutes: 60,
      overStatutoryOtMinutes: 0,
      nightMinutes: 0,
    });
  });

  it("8 時間を超えた分と、深夜帯（日をまたぐ分も）を数える", () => {
    const r = liveTotals(
      "2026-11-25",
      [{ type: "CLOCK_IN", at: at("2026-11-25", "15:00") }],
      at("2026-11-26", "01:00"),
      night,
    );
    expect(r.workedMinutes).toBe(600);
    expect(r.overStatutoryOtMinutes).toBe(120);
    expect(r.nightMinutes).toBe(180);
  });

  it("休憩中は休憩が伸び、実働は止まる", () => {
    const r = liveTotals(
      "2026-11-25",
      [
        { type: "CLOCK_IN", at: at("2026-11-25", "09:00") },
        { type: "BREAK_START", at: at("2026-11-25", "12:00") },
      ],
      at("2026-11-25", "12:45"),
      night,
    );
    expect(r.workedMinutes).toBe(180);
    expect(r.breakMinutes).toBe(45);
  });
});

describe("期間の表示", () => {
  it("同じ年なら年を付けない", () => {
    expect(formatRangeJa("2026-11-01", "2026-11-30")).toBe(
      "11/1(日)〜11/30(月)",
    );
  });
  it("年をまたぐときは年を付ける", () => {
    expect(formatRangeJa("2025-12-30", "2026-12-29")).toBe(
      "2025/12/30(火)〜2026/12/29(火)",
    );
  });
  it("1 日だけなら日付 1 つ", () => {
    expect(formatRangeJa("2026-11-25", "2026-11-25")).toBe("11/25(水)");
  });
});
