# シフト管理くん

ポーカー店舗向けの「勤怠打刻・月次勤怠・異常チェック・LINE連携・シフト希望回収・自動シフト作成・確定通知」を一元管理する Web アプリ。

- 店舗 iPad で **2タップ打刻**（名前 → 出勤/休憩/退勤）
- 月次勤怠・社労士提出データ（CSV / Excel / 印刷PDF）
- 要確認勤怠の自動検出（退勤漏れ・退勤のみ・長時間・営業時間外・日跨ぎの異常・休憩不足・**休日の休憩チェック**）
- LINE 公式アカウント「シフト管理くん」：提出依頼・リマインド・確定通知・自分のシフト/勤務時間/給与目安の確認
- 希望 × 店舗の月次条件 × 必要人数から **シフト案を自動作成** → 店長が確認・修正 → 公開

## ドキュメント

| | |
|---|---|
| [00 暫定仕様一覧（店長確認待ち）](docs/00-provisional-specs.md) | **最初に読んでください**。決まっていなかった仕様と、その暫定値 |
| [01 要件整理](docs/01-requirements.md) | 機能一覧・不足仕様の洗い出し |
| [02 DB設計](docs/02-database.md) | テーブル構成と設計方針 |
| [03 画面一覧・遷移](docs/03-screens.md) | |
| [04 LINE連携設計](docs/04-line.md) | LINE 側の準備手順もここ |
| [05 自動シフト生成ロジック](docs/05-shift-generation.md) | 絶対条件・希望条件・アルゴリズム |
| [06 実装計画](docs/06-plan.md) | Phase 1〜4 と進捗 |

## ローカルで動かす

Node.js 20 以上。

```bash
npm install
cp .env.example .env          # SESSION_SECRET は32文字以上のランダム文字列に変更
npx prisma db push            # SQLite（prisma/dev.db）を作成
SEED_DEMO=1 npm run db:seed   # 管理者 admin / admin1234 とデモ用スタッフ・シフト枠
npm run dev                   # http://localhost:3000
```

1. `http://localhost:3000/login` で管理者ログイン（**初期パスワードは必ず変更**：`SEED_ADMIN_PASSWORD=... npm run db:seed` で作成時に指定）
2. 店舗の iPad で同じ URL を開き、管理者ログイン → 「設定 → 打刻端末 → この端末を登録」。以後その iPad は打刻専用（管理者ログインは自動で解除）
3. LINE 未設定のときは通知が **モック送信**（送らずに「LINE」画面の通知履歴に記録）になるので、LINE なしで全機能を試せます

## テスト

```bash
npm test            # ユニット・サービステスト（Vitest、prisma/test.db を使用）
npm run typecheck
npm run lint
npx next build && npm run e2e   # 画面のE2Eテスト（Playwright、prisma/e2e.db を使用）
```

## 本番環境（推奨構成：Vercel + PostgreSQL）

1. PostgreSQL を用意（Neon / Supabase など）
2. `node scripts/use-postgres.mjs` で `prisma/schema.prisma` の provider を `postgresql` に切り替えてコミット
3. 環境変数を設定

   | 変数 | 内容 |
   |---|---|
   | `DATABASE_URL` | PostgreSQL の接続文字列 |
   | `SESSION_SECRET` | 32文字以上のランダム文字列（管理者セッション・本人専用リンクの署名） |
   | `CRON_SECRET` | 定期実行の認証用ランダム文字列 |
   | `APP_BASE_URL` | 公開URL（例 `https://shift.example.com`。LINE で送るリンクに使用） |
   | `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API（docs/04-line.md） |

4. `npx prisma db push` でテーブル作成、`npm run db:seed` で管理者作成
5. 定期実行：`vercel.json` の設定で毎日 10:00（JST）に `/api/cron/daily` が呼ばれます（`Authorization: Bearer CRON_SECRET`）。Vercel 以外では外部の cron から同じ URL を叩いてください
6. LINE Developers で Webhook URL を `https://<本番ドメイン>/api/line/webhook` に設定

## 毎月の運用

| 日 | 自動 | 店長の操作 |
|---|---|---|
| 13日 | 翌月の受付開始・LINEで提出依頼 | — |
| 16日 | 未提出者にリマインド | ダッシュボードで提出率を確認 |
| 17日 23:59 | 締切 → 受付終了 | 未提出者は「代理入力」も可 |
| 18〜19日 | — | 「② 月次条件」を入力（前月コピー可）→「③ 作成・公開」で自動作成 → 確認・修正 |
| 20日 | — | 「確定して公開・通知」→ 全員に LINE |
| 月末 | — | 要確認勤怠を確認 → 「出力」から社労士へ Excel/CSV |

日付はすべて「設定」で変更できます。

## 構成

```
src/lib/          純粋ロジック（時刻・勤務時間・異常判定・シフト生成・給与目安）※DB非依存
src/server/       サービス層（DB・業務処理）。画面・LINE・cron はここだけを呼ぶ
src/server/line/  LINE 連携（Webhook・送信アダプタ・コマンド）※勤怠/シフトとは疎結合
src/app/          画面（/kiosk 打刻、/admin 管理、/s・/me 本人用）と API
prisma/           DBスキーマ・初期データ
tests/            unit / service / e2e
```
