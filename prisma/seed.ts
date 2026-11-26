/**
 * 開発用シードデータ。 pnpm db:seed
 *
 * - 就業規則（標準）と勤務パターン（標準 9-18）
 * - 内蔵祝日データ（data/holidays.json、2020 年以降）
 * - 初期管理者（.env の INITIAL_ADMIN_*）と架空の従業員 4 名
 * - 従業員への有給付与
 * - 直近数営業日のサンプル打刻（2 名分）
 *
 * すべて upsert で冪等。公開リポジトリのため人物データはすべて架空。
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { recomputeDay } from "@/features/attendance/usecase";
import { recomputeUserRange } from "@/features/aggregation/usecase";
import { refreshInsightsForUser } from "@/features/insight/usecase";
import { addDaysStr, eachDateStr } from "@/lib/date-range";
import { jstDateStr, jstWeekday } from "@/lib/datetime";

const prisma = createPrismaClient();

const ADMIN_EMAIL = (
  process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com"
).toLowerCase();
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe123!";
const EMPLOYEE_PASSWORD = "Password123!";

/** JST の壁時計時刻から Date を作る。 */
function jst(dateISO: string, hhmm: string): Date {
  return new Date(`${dateISO}T${hhmm}:00+09:00`);
}

/** 対象日から遡って営業日（月〜金）を n 日ぶん集める。'YYYY-MM-DD' で返す。 */
function recentBusinessDays(n: number, from = new Date()): string[] {
  const out: string[] = [];
  const cur = new Date(from);
  while (out.length < n) {
    cur.setDate(cur.getDate() - 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      out.push(cur.toISOString().slice(0, 10));
    }
  }
  return out.reverse();
}

async function seedWorkRuleAndPattern() {
  const existing = await prisma.workRule.findFirst({
    where: { isDefault: true },
  });
  const workRule =
    existing ??
    (await prisma.workRule.create({ data: { name: "標準", isDefault: true } }));

  let pattern = await prisma.workPattern.findFirst({
    where: { workRuleId: workRule.id, isDefault: true },
  });
  if (!pattern) {
    pattern = await prisma.workPattern.create({
      data: { workRuleId: workRule.id, name: "標準 9-18", isDefault: true },
    });
  }

  for (let weekday = 0; weekday < 7; weekday++) {
    const isWorkday = weekday >= 1 && weekday <= 5;
    await prisma.workPatternDay.upsert({
      where: { workPatternId_weekday: { workPatternId: pattern.id, weekday } },
      update: {},
      create: {
        workPatternId: pattern.id,
        weekday,
        isWorkday,
        startTime: "09:00",
        endTime: "18:00",
        breakMinutes: 60,
        prescribedMinutes: isWorkday ? 480 : 0,
      },
    });
  }

  return { workRule, pattern };
}

async function seedHolidays() {
  const raw = await readFile(
    resolve(process.cwd(), "data/holidays.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as {
    holidays: { date: string; name: string }[];
  };
  const target = parsed.holidays.filter((h) => h.date >= "2020-01-01");

  for (const h of target) {
    const date = new Date(`${h.date}T00:00:00Z`);
    await prisma.holiday.upsert({
      where: { date },
      update: { name: h.name, source: "BUILTIN" },
      create: { date, name: h.name, source: "BUILTIN" },
    });
  }
  return target.length;
}

async function seedUsers(patternId: string) {
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const empHash = await hashPassword(EMPLOYEE_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    // update にも passwordHash / mustChangePassword を含める。
    // 開発中にログインでパスワードを変更しても、再 seed で既知の認証情報へ戻せるようにする。
    update: {
      role: "ADMIN",
      status: "ACTIVE",
      workPatternId: patternId,
      passwordHash: adminHash,
      mustChangePassword: true,
    },
    create: {
      employeeCode: "ADM001",
      email: ADMIN_EMAIL,
      name: "管理者",
      passwordHash: adminHash,
      role: "ADMIN",
      hireDate: new Date("2023-04-01T00:00:00Z"),
      workPatternId: patternId,
      mustChangePassword: true,
    },
  });

  const employeeSpecs = [
    {
      code: "EMP001",
      email: "yamada@example.com",
      name: "山田 太郎",
      hire: "2023-04-01",
    },
    {
      code: "EMP002",
      email: "sato@example.com",
      name: "佐藤 花子",
      hire: "2024-04-01",
    },
    {
      code: "EMP003",
      email: "suzuki@example.com",
      name: "鈴木 一郎",
      hire: "2024-10-01",
    },
    {
      code: "EMP004",
      email: "tanaka@example.com",
      name: "田中 みなみ",
      hire: "2025-04-01",
    },
  ];

  const employees = [];
  for (const spec of employeeSpecs) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: {
        status: "ACTIVE",
        workPatternId: patternId,
        passwordHash: empHash,
        mustChangePassword: true,
      },
      create: {
        employeeCode: spec.code,
        email: spec.email,
        name: spec.name,
        passwordHash: empHash,
        role: "EMPLOYEE",
        hireDate: new Date(`${spec.hire}T00:00:00Z`),
        workPatternId: patternId,
        mustChangePassword: true,
      },
    });
    employees.push(user);
  }

  return { admin, employees };
}

async function seedLeaveGrants(
  admin: { id: string },
  employees: { id: string; hireDate: Date }[],
) {
  for (const emp of employees) {
    const already = await prisma.leaveGrant.findFirst({
      where: { userId: emp.id },
    });
    if (already) continue;

    const grantDate = new Date(emp.hireDate);
    grantDate.setMonth(grantDate.getMonth() + 6);
    const expiryDate = new Date(grantDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);

    const grant = await prisma.leaveGrant.create({
      data: {
        userId: emp.id,
        grantedDays: "10.0",
        grantDate,
        expiryDate,
        reason: "入社 6 か月経過による法定付与（初回）",
        createdById: admin.id,
      },
    });
    await prisma.leaveLedger.create({
      data: {
        userId: emp.id,
        kind: "GRANT",
        days: "10.0",
        effectiveDate: grantDate,
        grantId: grant.id,
        note: "seed",
      },
    });
  }
}

async function seedSampleClockEvents(employees: { id: string }[]) {
  const targets = employees.slice(0, 2);
  const days = recentBusinessDays(3);
  const touched: { userId: string; day: string }[] = [];

  for (const emp of targets) {
    for (const day of days) {
      const businessDate = new Date(`${day}T00:00:00Z`);
      const existing = await prisma.timeClockEvent.findFirst({
        where: { userId: emp.id, businessDate },
      });
      if (!existing) {
        const rows: Prisma.TimeClockEventCreateManyInput[] = (
          [
            ["CLOCK_IN", "09:00"],
            ["BREAK_START", "12:00"],
            ["BREAK_END", "13:00"],
            ["CLOCK_OUT", "18:00"],
          ] as const
        ).map(([type, at]) => ({
          userId: emp.id,
          type,
          occurredAt: jst(day, at),
          businessDate,
          source: "SELF",
          createdById: emp.id,
        }));
        await prisma.timeClockEvent.createMany({ data: rows });
      }
      touched.push({ userId: emp.id, day });
    }
  }

  for (const t of touched) {
    await recomputeDay(t.userId, t.day, prisma);
  }
  return touched.length;
}

/**
 * Kizami の「兆し」を体験するためのデモ従業員（架空）。既に打刻があれば何もしない。
 * - 高橋: 残業が多く、深夜の退勤と短い勤務間インターバルが続く
 * - 伊藤: 昨日の退勤が未打刻。有給の取得が少なく、失効が近い付与もある
 * - 渡辺: 休日も出勤して連続勤務が続く
 */
async function seedDemoScenarios(admin: { id: string }, patternId: string) {
  const empHash = await hashPassword(EMPLOYEE_PASSWORD);
  const specs = [
    {
      code: "EMP005",
      email: "takahashi@example.com",
      name: "高橋 健",
      hire: "2022-04-01",
    },
    {
      code: "EMP006",
      email: "ito@example.com",
      name: "伊藤 さくら",
      hire: "2023-10-01",
    },
    {
      code: "EMP007",
      email: "watanabe@example.com",
      name: "渡辺 翔",
      hire: "2024-04-01",
    },
  ];
  const users = [];
  for (const spec of specs) {
    users.push(
      await prisma.user.upsert({
        where: { email: spec.email },
        update: {
          status: "ACTIVE",
          workPatternId: patternId,
          passwordHash: empHash,
          mustChangePassword: true,
        },
        create: {
          employeeCode: spec.code,
          email: spec.email,
          name: spec.name,
          passwordHash: empHash,
          role: "EMPLOYEE",
          hireDate: new Date(`${spec.hire}T00:00:00Z`),
          workPatternId: patternId,
          mustChangePassword: true,
        },
      }),
    );
  }
  const [takahashi, ito, watanabe] = users;
  const today = jstDateStr(new Date());
  const from = addDaysStr(today, -45);
  const yesterday = addDaysStr(today, -1);
  const isWeekday = (d: string) => ![0, 6].includes(jstWeekday(d));

  type Punch = [Prisma.TimeClockEventCreateManyInput["type"], string, number?];
  async function punches(userId: string, day: string, list: Punch[]) {
    const businessDate = new Date(`${day}T00:00:00Z`);
    await prisma.timeClockEvent.createMany({
      data: list.map(([type, at, plusDays]) => ({
        userId,
        type,
        occurredAt: jst(plusDays ? addDaysStr(day, plusDays) : day, at),
        businessDate,
        source: "SELF" as const,
        createdById: userId,
      })),
    });
  }
  const hasEvents = async (userId: string) =>
    (await prisma.timeClockEvent.count({ where: { userId } })) > 0;

  // 高橋: 平日 9:00〜21:30。直近 4 日は休日も出勤し、深夜まで働いて翌朝早く出勤している
  if (!(await hasEvents(takahashi.id))) {
    const recentFrom = addDaysStr(today, -4);
    for (const d of eachDateStr(from, yesterday).filter(
      (x) => isWeekday(x) || x >= recentFrom,
    )) {
      const recent = d >= recentFrom;
      await punches(takahashi.id, d, [
        ["CLOCK_IN", recent ? "08:30" : "09:00"],
        ["BREAK_START", "12:00"],
        ["BREAK_END", "13:00"],
        recent ? ["CLOCK_OUT", "23:30"] : ["CLOCK_OUT", "21:30"],
      ]);
    }
  }

  // 伊藤: 平日の定時勤務。昨日（平日なら）は退勤の打刻なし
  if (!(await hasEvents(ito.id))) {
    for (const d of eachDateStr(from, yesterday).filter(isWeekday)) {
      const forgot =
        d === eachDateStr(from, yesterday).filter(isWeekday).at(-1);
      await punches(
        ito.id,
        d,
        forgot
          ? [
              ["CLOCK_IN", "09:00"],
              ["BREAK_START", "12:00"],
              ["BREAK_END", "13:00"],
            ]
          : [
              ["CLOCK_IN", "09:00"],
              ["BREAK_START", "12:00"],
              ["BREAK_END", "13:00"],
              ["CLOCK_OUT", "18:00"],
            ],
      );
    }
    // 有給: 約 11 か月前に 10 日付与（取得 1 日）＋ 失効が近い古い付与の残り 2 日
    const recentGrant = addDaysStr(today, -330);
    const oldGrant = addDaysStr(today, -2 * 365 + 20);
    for (const g of [
      { grantDate: oldGrant, days: "11.0", remaining: 2 },
      { grantDate: recentGrant, days: "10.0", remaining: 9 },
    ]) {
      const grant = await prisma.leaveGrant.create({
        data: {
          userId: ito.id,
          grantedDays: g.days,
          grantDate: new Date(`${g.grantDate}T00:00:00Z`),
          expiryDate: new Date(
            `${addDaysStr(addDaysStr(g.grantDate, 2 * 365), -1)}T00:00:00Z`,
          ),
          reason: "法定付与",
          createdById: admin.id,
        },
      });
      await prisma.leaveLedger.create({
        data: {
          userId: ito.id,
          kind: "GRANT",
          days: g.days,
          effectiveDate: grant.grantDate,
          grantId: grant.id,
          note: "seed",
        },
      });
      const consumed = Number(g.days) - g.remaining;
      if (consumed > 0) {
        await prisma.leaveLedger.create({
          data: {
            userId: ito.id,
            kind: "CONSUME",
            days: (-consumed).toFixed(1),
            effectiveDate: grant.grantDate,
            grantId: grant.id,
            note: "seed",
          },
        });
      }
    }
    const takenDay = eachDateStr(
      addDaysStr(today, -200),
      addDaysStr(today, -190),
    ).find(isWeekday)!;
    await prisma.leaveRequest.create({
      data: {
        userId: ito.id,
        type: "PAID",
        startDate: new Date(`${takenDay}T00:00:00Z`),
        endDate: new Date(`${takenDay}T00:00:00Z`),
        reason: "私用のため",
        status: "APPROVED",
        approverId: admin.id,
        decidedAt: new Date(),
      },
    });
  }

  // 渡辺: 直近 8 日間は休日も含めて毎日勤務
  if (!(await hasEvents(watanabe.id))) {
    for (const d of eachDateStr(from, yesterday)) {
      const streak = d >= addDaysStr(today, -8);
      if (!streak && !isWeekday(d)) continue;
      await punches(watanabe.id, d, [
        ["CLOCK_IN", "09:00"],
        ["BREAK_START", "12:00"],
        ["BREAK_END", "13:00"],
        ["CLOCK_OUT", streak ? "19:00" : "18:00"],
      ]);
    }
  }

  for (const u of users) {
    await recomputeUserRange(u.id, from, yesterday, prisma);
    await refreshInsightsForUser(u.id, new Date(), prisma);
  }
  return users.length;
}

async function main() {
  console.log("seed 開始");
  const { pattern } = await seedWorkRuleAndPattern();
  console.log("  就業規則・勤務パターン OK");

  const holidayCount = await seedHolidays();
  console.log(`  祝日 ${holidayCount} 件 OK`);

  const { admin, employees } = await seedUsers(pattern.id);
  console.log(
    `  ユーザー ${employees.length + 1} 名 OK（管理者: ${ADMIN_EMAIL}）`,
  );

  await seedLeaveGrants(admin, employees);
  console.log("  有給付与 OK");

  const clockDays = await seedSampleClockEvents(employees);
  console.log(`  サンプル打刻 ${clockDays} 日ぶん OK`);

  const demo = await seedDemoScenarios(admin, pattern.id);
  console.log(`  Kizami のデモ従業員 ${demo} 名 OK`);

  console.log("seed 完了");
  console.log(`  管理者ログイン: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(
    `  従業員ログイン: yamada@example.com ほか / ${EMPLOYEE_PASSWORD}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
