# Kizami

打刻忘れに気づき、管理者の手間を減らす AI 勤怠管理システムです。
出退勤の打刻、打刻修正・休暇の申請と承認、労働基準法に沿った労働時間の集計、月次の締めと CSV / PDF 出力ができます。

アプリの中の AI アシスタント「Kizami」が、次のことを手伝います。

- **気づきのひとこと** … 打刻漏れや有給の失効などを、本人のホーム画面で知らせる
- **話して申請** … 「昨日の退勤を押し忘れた、19 時に帰った」と書くと、申請の下書きを作る
- **質問に答える** … 「有給はあと何日？」など、自分の勤怠について答える
- **兆しレポート** … 残業ペース・連続勤務・休息不足などを検知し、管理者向けに説明と声かけ文を作る
- **承認の要約** … 申請の内容と前後の打刻を一目でわかるようにまとめる
- **締めアシスト** … 締め前に未対応の打刻漏れ・申請を洗い出し、本人への依頼文を作る

兆しの検知や集計は AI を使わずに計算しています。AI は文章を作る部分だけに使います。

## 起動

Docker が必要です。

```bash
git clone https://github.com/rk-dev-hub/kizami.git
cd kizami
docker compose up
```

初回はビルドと体験用データの投入に数分かかります。起動したら http://localhost:3000 を開いてください。

| ロール | メールアドレス                                                      | パスワード   |
| ------ | ------------------------------------------------------------------- | ------------ |
| 管理者 | admin@example.com                                                   | ChangeMe123! |
| 従業員 | takahashi@example.com / ito@example.com / watanabe@example.com ほか | Password123! |

- 初回ログイン時にパスワードの変更を求められます。
- 高橋・伊藤・渡辺には、Kizami が気づきを出すような勤務データが入っています。
- 通知メールは外部に送信されず、http://localhost:8025 の受信箱で確認できます。
- 停止は `Ctrl+C`、データごと消す場合は `docker compose down -v` です。

## AI 機能を使う

AI 機能を使うには Claude API の API キーが必要です。[Claude Console](https://platform.claude.com/) で発行し、`.env` に設定してから起動し直してください。

```bash
cp .env.example .env
# .env の ANTHROPIC_API_KEY に発行したキーを書く
docker compose up
```

API キーを設定しない場合も、すべての機能はテンプレートの文面で動きます。
API の利用料金は発行したアカウントに請求されます。1 人あたり 1 時間の利用回数に上限を設けており、`.env` の `KIZAMI_RATE_LIMIT_*` で変更できます。

## 開発

Node.js 24 と pnpm 10 を使います。

```bash
cp .env.example .env
# .env の AUTH_SECRET に `openssl rand -base64 32` で作った値を書く
docker compose up -d db mailpit
pnpm install
pnpm db:deploy && pnpm db:seed
pnpm dev
```

| コマンド                | 内容                                   |
| ----------------------- | -------------------------------------- |
| `pnpm verify`           | 型チェック・lint・単体テスト           |
| `pnpm test:integration` | DB を使う結合テスト                    |
| `pnpm test:e2e`         | E2E テスト（Playwright）               |
| `pnpm worker`           | 通知・兆しの検知・メール送信の定期処理 |

## 技術スタック

Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / Auth.js v5 / PostgreSQL 16 / Prisma 7 / Claude API / Vitest / Playwright
