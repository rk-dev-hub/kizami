#!/bin/sh
# docker compose up 用の起動スクリプト。マイグレーションのあと、DB が空なら体験用データを入れてから起動する。
set -e

# AUTH_SECRET はセッションの署名鍵。固定のダミー値を使わないよう、未設定なら起動ごとに生成する
if [ -z "${AUTH_SECRET:-}" ]; then
  AUTH_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
  export AUTH_SECRET
fi

if [ "${1:-}" = "worker" ]; then
  exec pnpm worker
fi

pnpm prisma migrate deploy

# seed は既存ユーザーのパスワードを初期値に戻すため、DB が空のときだけ流す
if pnpm exec tsx scripts/db-is-empty.ts; then
  echo "体験用データを投入します"
  pnpm db:seed
fi

exec pnpm start
