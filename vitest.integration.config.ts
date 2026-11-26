import { defineConfig } from "vitest/config";

// DB を使う結合テスト。docker compose の PostgreSQL が必要。
// pnpm test:integration で実行（通常の pnpm test には含めない）。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
