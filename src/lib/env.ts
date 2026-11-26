import { z } from "zod";

/**
 * 環境変数を起動時に検証する。未設定・不正値は明確なエラーで即座に落とす。
 * サーバー専用。クライアントから import しないこと。
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // PostgreSQL 接続文字列。公開リポジトリではダミー。各自の環境に差し替える。
  DATABASE_URL: z.string().url().startsWith("postgres"),

  // Auth.js セッション署名鍵。`openssl rand -base64 32` で生成した値に差し替える。
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET は 32 文字以上にしてください"),
  AUTH_URL: z.string().url().default("http://localhost:3000"),

  // 表示・集計のタイムゾーン。基本は固定。
  APP_TIMEZONE: z.string().default("Asia/Tokyo"),

  // seed が作成する初期管理者。
  INITIAL_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).default("ChangeMe123!"),

  // CSV 既定エンコーディング。
  CSV_ENCODING: z.enum(["utf8", "utf8-bom", "shift_jis"]).default("utf8-bom"),

  // メール内リンクの基点と、通知メールの送信先（ローカルは Mailpit）。
  APP_URL: z.string().url().default("http://localhost:3000"),
  SMTP_URL: z
    .string()
    .regex(
      /^smtps?:\/\//,
      "SMTP_URL は smtp:// または smtps:// で始めてください",
    )
    .default("smtp://localhost:1025"),
  MAIL_FROM: z.string().min(3).default("Kizami <no-reply@example.com>"),

  // AI アシスタント Kizami。キーが空なら AI を呼ばず、テンプレート文で動く。
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined)),
  KIZAMI_AI_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  KIZAMI_RATE_LIMIT_EMPLOYEE: z.coerce.number().int().min(0).default(30),
  KIZAMI_RATE_LIMIT_ADMIN: z.coerce.number().int().min(0).default(100),
  // 週次ダイジェストの要約に AI を使うか（定期処理での課金を避けるため既定はオフ）。
  KIZAMI_AI_DIGEST: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  // E2E テスト用: AI の代わりに決まった応答を返す。本番では使わない。
  KIZAMI_FAKE: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `環境変数の検証に失敗しました。.env を確認してください:\n${issues}`,
  );
}

export const env = parsed.data;
export type Env = typeof env;
