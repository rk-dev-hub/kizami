import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/features/insight/usecase", () => ({}));
vi.mock("@/features/kizami/tasks", () => ({}));
vi.mock("@/features/notification/usecase", () => ({}));

import { isDue, JOBS } from "@/features/notification/jobs";

const job = (name: string) => JOBS.find((j) => j.name === name)!;
// JST の日時を UTC の Date にする
const jst = (s: string) => new Date(`${s}+09:00`);

describe("定期処理の実行判定", () => {
  it("時刻指定のないジョブは毎回動く", () => {
    expect(
      isDue(job("send-emails"), jst("2026-11-25T03:00:00"), new Date()),
    ).toBe(true);
  });

  it("実行時刻の前は動かず、過ぎたら 1 日 1 回だけ動く", () => {
    const j = job("detect-insights"); // 06:00
    expect(isDue(j, jst("2026-11-25T05:59:00"), null)).toBe(false);
    expect(isDue(j, jst("2026-11-25T06:01:00"), null)).toBe(true);
    expect(
      isDue(j, jst("2026-11-25T09:00:00"), jst("2026-11-25T06:01:00")),
    ).toBe(false);
    // 前日に動いていれば今日も動く
    expect(
      isDue(j, jst("2026-11-25T06:05:00"), jst("2026-11-24T06:01:00")),
    ).toBe(true);
  });

  it("週次ダイジェストは月曜だけ", () => {
    const j = job("weekly-admin-digest"); // 月曜 08:30
    expect(isDue(j, jst("2026-11-23T09:00:00"), null)).toBe(true); // 月
    expect(isDue(j, jst("2026-11-25T09:00:00"), null)).toBe(false); // 水
  });
});
