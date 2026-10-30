# シフト管理くん

ポーカー店舗向けの「勤怠打刻・月次勤怠・異常チェック・LINE連携・シフト希望回収・自動シフト作成・確定通知」を一元管理する Web アプリ。

- 店舗 iPad で **2タップ打刻**（名前 → 出勤/休憩/退勤）
- 月次勤怠・社労士提出データ（CSV / Excel / 印刷PDF）
- 要確認勤怠の自動検出（退勤漏れ・退勤のみ・長時間・営業時間外・日跨ぎの異常・休憩不足・**休日の休憩チェック**）
- LINE 公式アカウント「シフト管理くん」：提出依頼・リマインド・確定通知・自分のシフト/勤務時間/給与目安の確認
- 希望 × 店舗の月次条件 × 必要人数から **シフト案を自動作成** → 店長が確認・修正 → 公開
- 給与目安・勤怠分析、AI補助（店長の文章から月次条件の案。任意）
- GitHub Actions で型チェック・Lint・テスト・ビルド・E2E を自動実行

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
| [07 店長向けマニュアル](docs/07-manual-manager.md) | 毎日・毎月の操作手順 |
| [08 スタッフ向けマニュアル](docs/08-manual-staff.md) | 打刻・LINE の使い方（そのまま配布できます） |

## ミニゲーム「ディーラークエスト」

`/dealer-quest` でログインなしに遊べるスワイプゲーム（本体は `public/dealer-quest.html`）。ランキングは `/api/dealer-quest/scores`（公開API）経由で `DealerQuestScore` テーブルに保存します。登録は全体で1万人まで、同じ接続元からの新規登録は1時間20人までです。

不適切な名前や記録を消すときは、Neon の SQL Editor で実行します。

```sql
SELECT "playerId", name, tables FROM "DealerQuestScore" ORDER BY tables DESC LIMIT 50;
DELETE FROM "DealerQuestScore" WHERE "playerId" = '（消したい行のplayerId）';
```

## ローカルで動かす

Node.js 20 以上。

```bash
npm install
cp .env.example .env          # SESSION_SECRET は32文字以上のランダム文字列に変更
npx prisma db push            # SQLite（prisma/dev.db）を作成
SEED_DEMO=1 npm run db:seed   # 管理者 admin / admin1234 とデモ用スタッフ・シフト枠
npm run dev                   # http://localhost:3000
```

1. `http://localhost:3000/login` で管理者ログイン。初期パスワードのままだと、最初にパスワード変更画面が開きます
2. 店舗の iPad で同じ URL を開き、管理者ログイン → 「設定 → 打刻端末 → この端末を登録」。以後その iPad は打刻専用（管理者ログインは自動で解除）
3. LINE 未設定のときは通知が **モック送信**（送らずに「LINE」画面の通知履歴に記録）になるので、LINE なしで全機能を試せます

## テスト

```bash
npm test            # ユニット・サービステスト（Vitest、prisma/test.db を使用）
npm run typecheck
npm run lint
npm run build && npm run e2e   # 画面のE2Eテスト（Playwright、prisma/e2e.db を使用）
```

## 本番環境（推奨構成：Vercel + PostgreSQL）

リポジトリの `prisma/schema.prisma` は **SQLite のままコミット**します。ビルド時（`npm run build`）に `scripts/use-postgres.mjs` が `DATABASE_URL` を見て自動で PostgreSQL 用に切り替え、`prisma generate` も実行します。

1. PostgreSQL を用意（Neon 推奨）。Neon の **Connect** で「Connection pooling: ON」の接続文字列をコピー（そのまま貼ればOK。`pgbouncer=true&connection_limit=1` の付加と、直接接続URLの作成はアプリが自動で行います）
2. Vercel にリポジトリを接続し、環境変数を設定

   | 変数 | 内容 |
   |---|---|
   | `DATABASE_URL` | Neon でコピーしたプール経由の接続文字列（`psql '...'` の形でも可） |
   | `DIRECT_URL` | 任意。Neon 以外で直接接続URLが別の場合のみ |
   | `SESSION_SECRET` | 32文字以上のランダム文字列（例：`openssl rand -base64 48`）。`.env.example` の値のままだと起動しません |
   | `CRON_SECRET` | 定期実行の認証用ランダム文字列（Vercel Cron が自動で `Authorization: Bearer` に付けます） |
   | `APP_BASE_URL` | 公開URL（例 `https://shift.example.com`）。未設定だと LINE のリンクを作れずエラーになります |
   | `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API（docs/04-line.md）。未設定ならモック送信 |
   | `SETUP_TOKEN` | 初回の管理者作成用のキー（16文字以上）。作成後は削除してもかまいません |
   | `ANTHROPIC_API_KEY` | 任意。設定すると「月次条件」画面の AI補助（文章から条件案）が使えます |

3. 環境変数 `SETUP_TOKEN` に16文字以上のランダムな文字列を設定（最初の管理者を作るときのキー）
4. デプロイ（Vercel の Build Command は既定の `npm run build` のままでOK）。ビルド時に `scripts/db-sync.mjs` が本番DBのテーブルを自動で作成・更新します（データが消える変更は止まります）
5. `https://<本番ドメイン>/setup` を開き、`SETUP_TOKEN` の値を入れて最初の管理者を作成（管理者が1人でもいると、この画面は使えません）
6. 定期実行：`vercel.json` の設定で毎日 10:00（JST）に `/api/cron/daily` が呼ばれます。Vercel 以外では外部の cron から `Authorization: Bearer <CRON_SECRET>` 付きで同じ URL を呼んでください
7. LINE Developers で Webhook URL を `https://<本番ドメイン>/api/line/webhook` に設定し、リッチメニューを登録

   ```bash
   LINE_CHANNEL_ACCESS_TOKEN=xxxx node scripts/setup-line-richmenu.mjs
   ```

8. 店舗の iPad の Safari で `https://<本番ドメイン>/kiosk` を開き「ホーム画面に追加」→ **ホーム画面のアイコンから開いて**「打刻端末として登録する」から登録（iOS ではホーム画面のアプリと Safari でログイン情報が共有されないことがあるため、アプリ側で登録します）

### 管理者の復旧（管理者が1人で、パスワードを忘れたとき）

本番DBに対して、別のIDで管理者を作り、その管理者でログインして元のアカウントに「仮パスワード再発行」をします。

```bash
export DATABASE_URL="<直接接続>" DIRECT_URL="<直接接続>"
node scripts/use-postgres.mjs
SEED_ADMIN_LOGIN=recovery SEED_ADMIN_PASSWORD='<一時的な強いパスワード>' npm run db:seed
node scripts/use-postgres.mjs --sqlite
```

作業が終わったら、`recovery` は管理者一覧から停止してください。

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
