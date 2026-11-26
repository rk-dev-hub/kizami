import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

// 通知メールの送信。ローカルでは docker compose の Mailpit（http://localhost:8025）で受信を確認する。

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport(env.SMTP_URL);
  return transporter;
}

/** メール内リンクの絶対 URL。パスはアプリ内の相対パスのみ受け付ける。 */
export function appUrl(path: string): string {
  const safe = isAppPath(path) ? path : "/";
  return new URL(safe, env.APP_URL).toString();
}

/** "/" で始まり、"//"（プロトコル相対 URL）や "\\" を含まないパスか。 */
export function isAppPath(path: string): boolean {
  return /^\/(?![/\\])[^\s\\]*$/.test(path);
}

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  await getTransporter().sendMail({
    from: env.MAIL_FROM,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
}
