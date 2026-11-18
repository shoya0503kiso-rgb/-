# 9High福山 カジノ体験型 貸し切り忘年会 予約ページ

SNS から来たお客さんがスマホで予約するページと、スタッフ用の管理画面です。仕様は「bounenkai-yoyaku-spec.md」（しょうやとの壁打ちでまとめたもの）。
**まだ決まっていない項目は [docs/provisional.md](docs/provisional.md) にまとめてあります。最初に読んでください。**

## 画面

| URL | 内容 |
|---|---|
| `/` | 予約ページ（プランと料金 → ①日程 ②人数・ご利用の種類 ③プラン ④延長・オードブル ⑤お客様情報 → 確認画面 → 完了）。下に合計金額の目安が常に出る |
| `/admin` | 予約一覧（日付順）・前日確認済みチェック・人数変更（金額を計算し直す）・キャンセル・メモ |
| `/admin/notifications` | LINE 通知・確認メールの送信履歴（未設定の間はここに残るだけ） |
| `/admin/staff` | スタッフアカウント・パスワード変更 |

## 予約枠のルール（`src/lib/booking.ts`）

- スタートは 17:00〜22:00（30分刻み・仮）。2時間制、0:00閉店
- 1日最大2組。前の組の終わり（延長込み）から30分あけて次の組
- 延長は、閉店と後ろの組のスタート30分前までに収まる分だけ選べる
- 同時に申し込まれても枠を超えないよう、日ごとのロック行（`DayLock`）で直列にして、サーバー側でもう一度判定する

## 通知

- **LINE**：LINE公式アカウントの Messaging API（プッシュメッセージ）。LINE Notify は 2025年3月で終了しているので使っていません
  - LINE Developers でチャネルを作り、**チャネルアクセストークン（長期）** を `LINE_CHANNEL_ACCESS_TOKEN` に
  - 通知を受け取る人（しょうや）の **ユーザーID**（`U` から始まる33文字。LINE Developers のチャネル基本設定「あなたのユーザーID」）を `LINE_NOTIFY_TO` に。受け取る人はその公式アカウントを友だち追加しておく
- **確認メール**：Resend（仮）。`RESEND_API_KEY` と `MAIL_FROM`（Resend で認証したドメインのアドレス）
- どちらも未設定なら送らずに「通知履歴」に残すだけなので、設定前でも全機能を試せます

## ローカルで動かす

```bash
cd bounenkai
npm install
cp .env.example .env            # SESSION_SECRET を32文字以上のランダムな文字列に変更
npx prisma db push              # SQLite（prisma/dev.db）を作成
SEED_DEMO=1 npm run db:seed     # スタッフ admin / admin1234 とデモ用の予約
npm run dev                     # http://localhost:3000
```

## テスト

```bash
npm run typecheck && npm run lint && npm test
```

料金（仕様書の計算例）・延長の上限・1日2組・受付日・同時申し込み・キャンセルで枠が空くことなどを確認しています。

## 本番（Vercel）

シフト管理くん・もちもちアプリと同じ手順です。

1. Vercel で新しいプロジェクトを作り、このリポジトリを選んで **Root Directory を `bounenkai`** にする
2. Neon で新しいデータベースを作り、接続文字列を `DATABASE_URL` に（ビルド時に自動でテーブルを作ります）
3. 環境変数：`SESSION_SECRET`（32文字以上のランダム）・`SETUP_TOKEN`（16文字以上）・`APP_BASE_URL`・LINE / メールの設定
4. デプロイ後 `/setup` を開き、`SETUP_TOKEN` を入れて最初のスタッフ（店長）を作る
5. 公開前のチェック：`src/lib/config.ts` の `STORE`（電話番号・住所）を埋める（確認メールと完了画面の連絡先になる）。`RESEND_API_KEY`・`MAIL_FROM`・LINE の設定を入れたら、テスト予約を1件入れて「通知履歴」が「送信済み」になることを確認する（メールが送れなかったときは、完了画面に「確認メールをお送りできませんでした」と出ます）
