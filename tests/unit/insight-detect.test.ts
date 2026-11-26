import { describe, expect, it } from "vitest";
import {
  detectBreakShortage,
  detectConsecutive,
  detectForgotClockOut,
  detectInsights,
  detectLateNight,
  detectLeaveExpiring,
  detectLeaveObligation,
  detectLegalCap,
  detectMissingPunch,
  detectMonthlyPace,
  detectShortRest,
  detectWeekly40h,
  detectYearlyPace,
} from "@/features/insight/domain/detect";
import {
  agreementYearOf,
  forecastPeriodOvertime,
} from "@/features/insight/domain/forecast";
import {
  DEFAULT_INSIGHT_SETTINGS,
  mergeInsightSettings,
} from "@/features/insight/domain/settings";
import type { DayRecord, InsightInput } from "@/features/insight/domain/types";
import { addDaysStr, eachDateStr } from "@/lib/date-range";
import { jstDateTimeUtc, jstWeekday } from "@/lib/datetime";

const TODAY = "2026-11-18"; // 水曜

function day(date: string, over: Partial<DayRecord> = {}): DayRecord {
  const wd = jstWeekday(date);
  const scheduled = wd !== 0 && wd !== 6;
  return {
    date,
    dayType:
      wd === 0 ? "LEGAL_HOLIDAY" : wd === 6 ? "PRESCRIBED_HOLIDAY" : "WORKDAY",
    scheduledWorkday: scheduled,
    workedMinutes: scheduled ? 480 : 0,
    overStatutoryOtMinutes: 0,
    legalHolidayMinutes: 0,
    nightMinutes: 0,
    firstIn: scheduled ? jstDateTimeUtc(date, "09:00") : null,
    lastOut: scheduled ? jstDateTimeUtc(date, "18:00") : null,
    flags: [],
    ...over,
  };
}

/** from〜to の標準的な勤務（平日 9-18）。 */
function standardDays(
  from: string,
  to: string,
  over?: (d: DayRecord) => Partial<DayRecord>,
): DayRecord[] {
  return eachDateStr(from, to).map((date) => {
    const base = day(date);
    return over ? { ...base, ...over(base) } : base;
  });
}

function input(over: Partial<InsightInput> = {}): InsightInput {
  return {
    now: jstDateTimeUtc(TODAY, "12:00"),
    today: TODAY,
    rule: {
      closingDay: 31,
      weekStartsOn: 1,
      agreementMonthlyLimitMinutes: 2700,
      agreementYearlyLimitMinutes: 21600,
      specialClauseEnabled: false,
      specialYearlyLimitMinutes: 43200,
      agreementYearStartMonth: 4,
    },
    days: standardDays("2026-10-01", addDaysStr(TODAY, -1)),
    futureWorkdaysInPeriod: eachDateStr(TODAY, "2026-11-30").filter(
      (d) => ![0, 6].includes(jstWeekday(d)),
    ),
    openShift: null,
    leaveGrants: [],
    paidLeaveDays: [],
    closedThrough: null,
    settings: structuredClone(DEFAULT_INSIGHT_SETTINGS),
    ...over,
  };
}

describe("標準的な勤務では兆しが出ない", () => {
  it("何も検知しない", () => {
    expect(detectInsights(input())).toEqual([]);
  });
});

describe("打刻漏れ", () => {
  it("過去日の退勤漏れを検知し、今日・勤務中・締め済みは除く", () => {
    const days = standardDays("2026-11-01", TODAY, (d) =>
      ["2026-11-10", "2026-11-17", TODAY, "2026-11-02"].includes(d.date)
        ? { flags: ["MISSING_CLOCK_OUT"], lastOut: null }
        : {},
    );
    const res = detectMissingPunch(
      input({
        days,
        openShift: {
          workDate: "2026-11-17",
          expectedEnd: jstDateTimeUtc("2026-11-17", "18:00"),
        },
        closedThrough: "2026-11-05",
      }),
    );
    expect(res.map((r) => r.periodKey)).toEqual(["2026-11-10"]);
    expect(res[0].facts.metrics.missing).toBe("MISSING_CLOCK_OUT");
  });

  it("参照期間より古い日は対象外", () => {
    const days = [day("2026-10-01", { flags: ["MISSING_CLOCK_IN"] })];
    expect(detectMissingPunch(input({ days }))).toEqual([]);
  });
});

describe("退勤忘れ", () => {
  const shift = {
    workDate: TODAY,
    expectedEnd: jstDateTimeUtc(TODAY, "18:00"),
  };
  it("所定終業＋3 時間ちょうどで検知", () => {
    const r = detectForgotClockOut(
      input({ openShift: shift, now: jstDateTimeUtc(TODAY, "21:00") }),
    );
    expect(r?.severity).toBe("CAUTION");
    expect(r?.facts.metrics.overdueMinutes).toBe(180);
  });
  it("3 時間未満なら検知しない・勤務中でなければ検知しない", () => {
    expect(
      detectForgotClockOut(
        input({ openShift: shift, now: jstDateTimeUtc(TODAY, "20:59") }),
      ),
    ).toBeNull();
    expect(
      detectForgotClockOut(input({ now: jstDateTimeUtc(TODAY, "23:00") })),
    ).toBeNull();
  });
});

describe("月の残業ペース", () => {
  it("予測式: 実績 + 残りの所定労働日 × 直近平均", () => {
    // 11 月の平日に毎日 2 時間の法定外残業（11/2〜11/17 の平日 = 12 日）
    const days = standardDays("2026-10-01", addDaysStr(TODAY, -1), (d) =>
      d.scheduledWorkday && d.date >= "2026-11-01"
        ? { overStatutoryOtMinutes: 120 }
        : {},
    );
    const f = forecastPeriodOvertime({
      days,
      today: TODAY,
      closingDay: 31,
      futureWorkdaysInPeriod: input().futureWorkdaysInPeriod,
      recentDays: 10,
    });
    expect(f.actualMinutes).toBe(12 * 120);
    // 今日（未確定）＋ 11/19〜11/30 の平日 8 日
    expect(f.remainingWorkdays).toBe(9);
    expect(f.dailyAverageMinutes).toBe(120);
    expect(f.forecastMinutes).toBe(21 * 120);
  });

  it("80% 以上で注意、100% 以上で警告", () => {
    const mk = (ot: number) =>
      standardDays("2026-10-01", addDaysStr(TODAY, -1), (d) =>
        d.scheduledWorkday && d.date >= "2026-11-01"
          ? { overStatutoryOtMinutes: ot }
          : {},
      );
    // 予測 = 21 日 × ot。2700×0.8=2160 → ot=103 で 2163、2700 → ot=129 で 2709
    expect(detectMonthlyPace(input({ days: mk(102) }))).toBeNull();
    expect(detectMonthlyPace(input({ days: mk(103) }))?.severity).toBe(
      "CAUTION",
    );
    expect(detectMonthlyPace(input({ days: mk(128) }))?.severity).toBe(
      "CAUTION",
    );
    expect(detectMonthlyPace(input({ days: mk(129) }))?.severity).toBe(
      "WARNING",
    );
  });

  it("直近の勤務が 3 日未満なら実績だけで判定する", () => {
    const days = [day("2026-11-17", { overStatutoryOtMinutes: 2200 })];
    const r = detectMonthlyPace(input({ days }));
    expect(r?.facts.metrics.forecastMinutes).toBe(2200);
    expect(r?.severity).toBe("CAUTION");
  });
});

describe("年の残業ペース", () => {
  it("協定年度は起算月の 1 日から 1 年", () => {
    expect(agreementYearOf("2026-11-18", 4)).toEqual({
      start: "2026-04-01",
      end: "2027-03-31",
    });
    expect(agreementYearOf("2026-03-31", 4)).toEqual({
      start: "2025-04-01",
      end: "2026-03-31",
    });
    expect(agreementYearOf("2026-01-01", 1)).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("直近 3 期間の月平均で年末を予測する", () => {
    // 4/1〜11/17 の平日に毎日 1.5 時間 → 月約 33 時間ペースで年 400 時間弱 → 360 時間超え
    const days = standardDays("2026-04-01", addDaysStr(TODAY, -1), (d) =>
      d.scheduledWorkday ? { overStatutoryOtMinutes: 90 } : {},
    );
    const r = detectYearlyPace(input({ days }));
    expect(r?.severity).toBe("WARNING");
    expect(r?.periodKey).toBe("FY2026-04-01");
  });

  it("特別条項ありなら特別条項の年上限で判定する", () => {
    const days = standardDays("2026-04-01", addDaysStr(TODAY, -1), (d) =>
      d.scheduledWorkday ? { overStatutoryOtMinutes: 90 } : {},
    );
    const r = detectYearlyPace(
      input({ days, rule: { ...input().rule, specialClauseEnabled: true } }),
    );
    expect(r).toBeNull();
  });
});

describe("法定上限への接近", () => {
  it("今月の時間外＋休日労働が 80 時間以上で警告", () => {
    const days = [
      day("2026-11-10", { overStatutoryOtMinutes: 4000 }),
      day("2026-11-15", { legalHolidayMinutes: 800 }),
    ];
    const r = detectLegalCap(input({ days }));
    expect(r?.severity).toBe("WARNING");
    expect(r?.facts.metrics.monthMinutes).toBe(4800);
  });

  it("2〜6 か月平均が 75 時間以上で警告", () => {
    const days = [
      day("2026-10-10", { overStatutoryOtMinutes: 4600 }),
      day("2026-11-10", { overStatutoryOtMinutes: 4400 }),
    ];
    const r = detectLegalCap(input({ days }));
    expect(r?.facts.metrics.maxAverageMinutes).toBe(4500);
    expect(r?.facts.metrics.averageMonths).toBe(2);
  });

  it("どちらも下回れば検知しない", () => {
    const days = [
      day("2026-10-10", { overStatutoryOtMinutes: 4400 }),
      day("2026-11-10", { overStatutoryOtMinutes: 4400 }),
    ];
    expect(detectLegalCap(input({ days }))).toBeNull();
  });
});

describe("連続勤務", () => {
  it("休日なしで 6 日なら注意、12 日なら警告", () => {
    const work = (from: string) =>
      eachDateStr(from, addDaysStr(TODAY, -1)).map((d) =>
        day(d, { workedMinutes: 480, firstIn: jstDateTimeUtc(d, "09:00") }),
      );
    expect(
      detectConsecutive(input({ days: work(addDaysStr(TODAY, -5)) })),
    ).toBeNull();
    expect(
      detectConsecutive(input({ days: work(addDaysStr(TODAY, -6)) }))?.severity,
    ).toBe("CAUTION");
    const w = detectConsecutive(input({ days: work(addDaysStr(TODAY, -12)) }));
    expect(w?.severity).toBe("WARNING");
    expect(w?.facts.metrics.days).toBe(12);
  });
});

describe("勤務間インターバル", () => {
  it("11 時間未満が 14 日で 3 回以上なら注意", () => {
    const late = (d: string) => ({ lastOut: jstDateTimeUtc(d, "23:30") });
    const days = standardDays("2026-11-09", addDaysStr(TODAY, -1), (d) =>
      ["2026-11-09", "2026-11-10", "2026-11-11"].includes(d.date)
        ? late(d.date)
        : {},
    );
    const r = detectShortRest(input({ days }));
    expect(r?.facts.metrics.count).toBe(3);
    expect(r?.facts.metrics.shortestMinutes).toBe(570);
    expect(r?.periodKey).toBe("W2026-11-16");
  });
  it("2 回なら検知しない", () => {
    const days = standardDays("2026-11-09", addDaysStr(TODAY, -1), (d) =>
      ["2026-11-09", "2026-11-10"].includes(d.date)
        ? { lastOut: jstDateTimeUtc(d.date, "23:30") }
        : {},
    );
    expect(detectShortRest(input({ days }))).toBeNull();
  });
});

describe("深夜勤務の連続", () => {
  it("3 日連続で検知、途切れて 3 日以上たてば対象外", () => {
    const nights = (dates: string[]) =>
      standardDays("2026-11-01", addDaysStr(TODAY, -1), (d) =>
        dates.includes(d.date) ? { nightMinutes: 60 } : {},
      );
    expect(
      detectLateNight(
        input({ days: nights(["2026-11-15", "2026-11-16", "2026-11-17"]) }),
      )?.facts.metrics.days,
    ).toBe(3);
    expect(
      detectLateNight(input({ days: nights(["2026-11-16", "2026-11-17"]) })),
    ).toBeNull();
    expect(
      detectLateNight(
        input({ days: nights(["2026-11-10", "2026-11-11", "2026-11-12"]) }),
      ),
    ).toBeNull();
  });
});

describe("休憩不足の繰り返し", () => {
  it("14 日で 3 回以上", () => {
    const days = standardDays("2026-11-01", addDaysStr(TODAY, -1), (d) =>
      ["2026-11-05", "2026-11-12", "2026-11-13"].includes(d.date)
        ? { flags: ["BREAK_SHORTAGE"] }
        : {},
    );
    expect(detectBreakShortage(input({ days }))?.facts.metrics.count).toBe(3);
  });
});

describe("有給 5 日取得義務", () => {
  const grant = {
    grantDate: "2026-01-01",
    expiryDate: "2027-12-31",
    grantedDays: 10,
    remainingDays: 8,
  };
  it("期限まで 3 か月以内で取得 5 日未満なら注意、1 か月以内なら警告", () => {
    const taken = [
      { date: "2026-05-01", days: 1 },
      { date: "2026-06-01", days: 1 },
    ];
    const caution = detectLeaveObligation(
      input({ leaveGrants: [grant], paidLeaveDays: taken }),
    );
    expect(caution[0].severity).toBe("CAUTION");
    expect(caution[0].facts.metrics.shortageDays).toBe(3);
    const warn = detectLeaveObligation(
      input({
        today: "2026-12-10",
        leaveGrants: [grant],
        paidLeaveDays: taken,
      }),
    );
    expect(warn[0].severity).toBe("WARNING");
  });
  it("10 日未満の付与・取得済み・期限外は対象外", () => {
    expect(
      detectLeaveObligation(
        input({ leaveGrants: [{ ...grant, grantedDays: 7 }] }),
      ),
    ).toEqual([]);
    expect(
      detectLeaveObligation(
        input({
          leaveGrants: [grant],
          paidLeaveDays: [{ date: "2026-03-01", days: 5 }],
        }),
      ),
    ).toEqual([]);
    expect(
      detectLeaveObligation(
        input({ leaveGrants: [{ ...grant, grantDate: "2025-01-01" }] }),
      ),
    ).toEqual([]);
  });
  it("申請中の予定も取得見込みに含める（呼び出し側で渡す）", () => {
    const planned = [1, 2, 3, 4, 5].map((i) => ({
      date: `2026-12-0${i}`,
      days: 1,
    }));
    expect(
      detectLeaveObligation(
        input({ leaveGrants: [grant], paidLeaveDays: planned }),
      ),
    ).toEqual([]);
  });
});

describe("有給の失効", () => {
  it("30 日以内に失効する残日数を失効日ごとにまとめる", () => {
    const r = detectLeaveExpiring(
      input({
        leaveGrants: [
          {
            grantDate: "2024-12-01",
            expiryDate: "2026-11-30",
            grantedDays: 10,
            remainingDays: 2,
          },
          {
            grantDate: "2024-12-01",
            expiryDate: "2026-11-30",
            grantedDays: 3,
            remainingDays: 1,
          },
          {
            grantDate: "2025-12-01",
            expiryDate: "2027-11-30",
            grantedDays: 11,
            remainingDays: 11,
          },
          {
            grantDate: "2024-10-01",
            expiryDate: "2026-12-20",
            grantedDays: 10,
            remainingDays: 0,
          },
        ],
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].facts.metrics).toMatchObject({ expiringDays: 3, daysLeft: 12 });
  });
});

describe("週 40 時間への接近", () => {
  it("残り 6 時間以内で情報、超えていれば出さない、法定休日は数えない", () => {
    const week = (minutes: number[]) =>
      minutes.map((m, i) =>
        day(addDaysStr("2026-11-16", i), { workedMinutes: m }),
      );
    // 月火水 = 600+600+600 = 1800 → 残り 600
    expect(detectWeekly40h(input({ days: week([600, 600, 600]) }))).toBeNull();
    // 月火水 = 700×3 = 2100 → 残り 300
    expect(
      detectWeekly40h(input({ days: week([700, 700, 700]) }))?.facts.metrics
        .remainingMinutes,
    ).toBe(300);
    expect(detectWeekly40h(input({ days: week([900, 900, 900]) }))).toBeNull();
  });
});

describe("設定", () => {
  it("無効にした兆しは検知しない", () => {
    const settings = structuredClone(DEFAULT_INSIGHT_SETTINGS);
    settings.MISSING_PUNCH.enabled = false;
    const days = [day("2026-11-17", { flags: ["MISSING_CLOCK_OUT"] })];
    expect(
      detectInsights(input({ days, settings })).some(
        (d) => d.kind === "MISSING_PUNCH",
      ),
    ).toBe(false);
  });
  it("DB の設定をマージし、不正な値は既定値に戻す", () => {
    const merged = mergeInsightSettings([
      {
        kind: "CONSECUTIVE_WORKDAYS",
        enabled: true,
        params: { cautionDays: 5 },
      },
      { kind: "LATE_NIGHT_STREAK", enabled: false, params: { minDays: "x" } },
      { kind: "MISSING_PUNCH", enabled: true, params: null },
    ]);
    expect(merged.CONSECUTIVE_WORKDAYS).toEqual({
      enabled: true,
      cautionDays: 5,
      warningDays: 12,
    });
    expect(merged.LATE_NIGHT_STREAK).toEqual({ enabled: false, minDays: 3 });
    expect(merged.MISSING_PUNCH.lookbackDays).toBe(31);
  });
});

describe("今日の勤務が確定していれば残り日数から除く", () => {
  it("退勤済みの今日は実績側に入る", () => {
    const days = [
      ...standardDays("2026-11-02", addDaysStr(TODAY, -1)),
      day(TODAY, { overStatutoryOtMinutes: 60 }),
    ];
    const f = forecastPeriodOvertime({
      days,
      today: TODAY,
      closingDay: 31,
      futureWorkdaysInPeriod: eachDateStr(TODAY, "2026-11-30").filter(
        (d) => ![0, 6].includes(jstWeekday(d)),
      ),
      recentDays: 10,
    });
    expect(f.remainingWorkdays).toBe(8);
    expect(f.actualMinutes).toBe(60);
  });
});
