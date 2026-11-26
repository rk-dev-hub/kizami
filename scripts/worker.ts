/**
 * 定期処理のワーカー。 pnpm worker
 * 5 分ごとに、退勤忘れの通知・兆しの検知・朝のお知らせ・週次ダイジェスト・メール送信を行う。
 * --once を付けると 1 回だけ実行して終了する。
 */
import "dotenv/config";
import { runDueJobs } from "@/features/notification/jobs";
import { prisma } from "@/lib/prisma";

const INTERVAL_MS = 5 * 60 * 1000;
const once = process.argv.includes("--once");

async function tick() {
  const ran = await runDueJobs(new Date());
  if (ran.length > 0)
    console.log(`[worker] ${new Date().toISOString()} ran: ${ran.join(", ")}`);
}

if (once) {
  await tick();
  await prisma.$disconnect();
} else {
  console.log("[worker] started");
  await tick();
  const timer = setInterval(() => {
    tick().catch((e) =>
      console.error("[worker] tick failed", e instanceof Error ? e.message : e),
    );
  }, INTERVAL_MS);
  const stop = async () => {
    clearInterval(timer);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
