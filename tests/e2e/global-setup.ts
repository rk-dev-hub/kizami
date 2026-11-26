import { execSync } from "node:child_process";

/**
 * E2E 実行前に DB を初期状態へ戻す（全テーブルを空にして seed を流す）。
 * seed 直後の従業員はパスワード変更が必要な状態で、そのフローもテストする。
 */
export default async function globalSetup() {
  execSync("pnpm exec tsx tests/e2e/reset-db.ts", { stdio: "inherit" });
  execSync("pnpm db:seed", { stdio: "inherit" });
}
