/**
 * E2E の前に DB を空にする（マイグレーション履歴は残す）。global-setup から呼ぶ。
 */
import "dotenv/config";
import { createPrismaClient } from "@/lib/prisma";

const prisma = createPrismaClient();
const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
if (tables.length > 0) {
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
await prisma.$disconnect();
