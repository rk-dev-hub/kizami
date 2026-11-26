import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionHolder, fakeSession, deleteKizamiRows } from "./helpers";
import { prisma } from "@/lib/prisma";
import { addDaysStr } from "@/lib/date-range";
import { dateOnlyUtc, jstDateStr, jstDateTimeUtc } from "@/lib/datetime";
import { recomputeDay } from "@/features/attendance/usecase";
import { getScheduledDays } from "@/features/calendar/usecase";
import {
  approveCorrection,
  submitCorrection,
} from "@/features/correction/usecase";
import { refreshInsightsForUser } from "@/features/insight/usecase";
import {
  acknowledgeInsight,
  listAdminInsights,
  sendAdminMessage,
  sendClosingMessages,
} from "@/features/insight/admin-usecase";
import { markRead } from "@/features/notification/usecase";

const EMP = "kizami-it-emp@example.test";
const ADM = "kizami-it-adm@example.test";
let empId = "";
let admId = "";
let day = "";

async function reset() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMP, ADM] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  await prisma.correctionRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.timeClockEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.dailySummary.deleteMany({ where: { userId: { in: ids } } });
  await prisma.monthlyAggregate.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { subjectUserId: { in: ids } }] },
  });
  await deleteKizamiRows(prisma, ids);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const pattern = await prisma.workPattern.findFirstOrThrow({
    where: { isDefault: true },
  });
  await reset();
  const base = {
    passwordHash: "x",
    hireDate: dateOnlyUtc("2024-04-01"),
    workPatternId: pattern.id,
    mustChangePassword: false,
  };
  empId = (
    await prisma.user.create({
      data: {
        ...base,
        employeeCode: "ITK-E",
        email: EMP,
        name: "兆し 太郎",
        role: "EMPLOYEE",
      },
    })
  ).id;
  admId = (
    await prisma.user.create({
      data: {
        ...base,
        employeeCode: "ITK-A",
        email: ADM,
        name: "管理 花子",
        role: "ADMIN",
      },
    })
  ).id;

  // 直近の平日に、出勤だけ打刻した日を作る
  const today = jstDateStr(new Date());
  const days = await getScheduledDays(
    empId,
    addDaysStr(today, -7),
    addDaysStr(today, -1),
  );
  day = days.filter((d) => d.isWorkday).at(-1)!.date;
  await prisma.timeClockEvent.create({
    data: {
      userId: empId,
      type: "CLOCK_IN",
      occurredAt: jstDateTimeUtc(day, "09:00"),
      businessDate: dateOnlyUtc(day),
      source: "SELF",
      createdById: empId,
    },
  });
  await recomputeDay(empId, day);
});

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("兆しの検知と解消", () => {
  it("打刻漏れを兆しとして検知する", async () => {
    const r = await refreshInsightsForUser(empId);
    const missing = r.raised.find((i) => i.kind === "MISSING_PUNCH");
    expect(missing).toBeDefined();
    expect(missing?.periodKey).toContain(day);
  });

  it("同じ条件で再検知しても重複しない", async () => {
    const r = await refreshInsightsForUser(empId);
    expect(r.raised.filter((i) => i.kind === "MISSING_PUNCH")).toHaveLength(0);
    expect(
      await prisma.insight.count({
        where: { userId: empId, kind: "MISSING_PUNCH" },
      }),
    ).toBe(1);
  });

  it("修正申請が承認されると、本人に結果が届き、兆しが解消する", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    expect(
      (
        await submitCorrection({
          targetDate: day,
          reason: "退勤の押し忘れ",
          lines: [{ op: "ADD", clockType: "CLOCK_OUT", time: "18:00" }],
        })
      ).ok,
    ).toBe(true);
    const req = await prisma.correctionRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    expect((await approveCorrection({ requestId: req.id })).ok).toBe(true);

    const n = await prisma.notification.findMany({
      where: { userId: empId, kind: "REQUEST_RESULT" },
    });
    expect(n).toHaveLength(1);
    expect(n[0].linkPath).toMatch(/^\/requests/);

    const insight = await prisma.insight.findFirstOrThrow({
      where: { userId: empId, kind: "MISSING_PUNCH" },
    });
    expect(insight.status).toBe("RESOLVED");
  });
});

describe("管理者の対応", () => {
  let insightId = "";

  beforeAll(async () => {
    insightId = (
      await prisma.insight.create({
        data: {
          userId: empId,
          kind: "MONTHLY_OVERTIME_PACE",
          periodKey: "it-test",
          severity: "CAUTION",
          facts: {
            kind: "MONTHLY_OVERTIME_PACE",
            severity: "CAUTION",
            metrics: {
              actualMinutes: 1800,
              forecastMinutes: 2500,
              limitMinutes: 2700,
            },
            period: { label: "今月", from: day, to: day },
          },
        },
      })
    ).id;
  });

  it("従業員は兆しを対応済みにできない", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await acknowledgeInsight({ insightId });
    expect(r.ok).toBe(false);
  });

  it("管理者が対応済みにすると、監査ログが残り、2 回目は競合になる", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const rows = await listAdminInsights("ACTIVE");
    expect(rows.some((r) => r.id === insightId)).toBe(true);

    expect((await acknowledgeInsight({ insightId, note: "面談済み" })).ok).toBe(
      true,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { action: "INSIGHT_ACK", targetId: insightId },
    });
    expect(audit?.actorId).toBe(admId);

    const again = await acknowledgeInsight({ insightId });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("CONFLICT");
  });

  it("本人にメッセージを送れる。自分宛てと従業員からの送信は拒否する", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const ok = await sendAdminMessage({
      userId: empId,
      title: "残業について",
      body: "少し話せますか",
      insightId,
    });
    expect(ok.ok).toBe(true);
    const self = await sendAdminMessage({
      userId: admId,
      title: "x",
      body: "y",
    });
    expect(self.ok).toBe(false);

    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const byEmp = await sendAdminMessage({
      userId: admId,
      title: "x",
      body: "y",
    });
    expect(byEmp.ok).toBe(false);

    const msgs = await prisma.notification.findMany({
      where: { userId: empId, kind: "ADMIN_MESSAGE" },
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].senderId).toBe(admId);
  });

  it("締めアシストの依頼をまとめて送れる", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await sendClosingMessages({
      messages: [
        {
          userId: empId,
          title: "締め前のお願い",
          body: "打刻の確認をお願いします",
        },
      ],
    });
    expect(r.ok && r.value.count).toBe(1);
  });

  it("既読にできるのは自分の通知だけ", async () => {
    const mine = await prisma.notification.findMany({
      where: { userId: empId },
      select: { id: true },
    });
    await markRead(
      admId,
      mine.map((m) => m.id),
    );
    expect(
      await prisma.notification.count({
        where: { userId: empId, readAt: null },
      }),
    ).toBe(mine.length);
    await markRead(empId, "all");
    expect(
      await prisma.notification.count({
        where: { userId: empId, readAt: null },
      }),
    ).toBe(0);
  });
});
