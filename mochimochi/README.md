# もちもちアプリ（アミューズメントバーもちもち 会員アプリ）

お客さんは **LINE からマイページを開く**（LIFF）会員アプリ。店側は **管理画面** から操作します。アプリ内通貨は「もちもちポイント」。

> **公式LINE はまだ作っていません。** 作るまでは「ニックネームだけの仮登録」でアプリ全体を使えます。
> 公式LINE・LIFF を作ったら環境変数を2つ入れるだけで LINE ログインに切り替わります（[LINE 連携の手順](#公式line-を作ったら)）。
>
> **ロゴ・イラストはお店の正式なもの** を入れています（`public/brand/`）。店名・ポイント名・ロゴ・「もち」の音声は管理画面「設定 → 見た目」からいつでも変えられます（コードの変更は不要）。

## ロゴ・イラスト（public/brand/）

| ファイル | 使っている場所 |
|---|---|
| `logo-mark.png` / `logo-mark.webp` | 画面上部のアイコン・ブラウザのアイコン（管理画面でロゴをアップロードするとそちらが優先）・スタンプ |
| `logo-full.webp` | 登録画面・店内タブレットのQR表示・スタッフログイン |
| `tiger-chip.webp` | マイページのポイントカード・チェックイン完了・QR表示 |
| `tiger-shake.webp` | 登録画面・もちもち連打・累計「もち」 |
| `tiger-pink.webp` | デイリーゲームの見出し |
| `tiger-darts.webp` / `poker-table.webp` / `submarine.webp` | ランキング（ダーツ／ポーカー／サブマリン） |

イラストを入れ替えるときは、同じ名前のファイルを置き換えてデプロイしてください（透過 WebP 推奨）。

## 機能

| お客さん | 管理画面（スタッフ） |
|---|---|
| マイページ（ポイント・ランク・スタンプ・各ランキングの順位・累計「もち」） | 会員一覧・検索・ポイント手動付与／減算（理由と担当者を履歴に残す）・引き継ぎコード発行 |
| 来店チェックイン（店内タブレットの日替わりQRを読み取り。1日1回。位置情報チェックは任意） | 来店QR（日替わり自動）・タブレット用の全画面表示（スタッフのログイン不要） |
| デイリーゲーム（じゃんけん／チンチロ。1日1回） | ダーツ・ポーカーの結果入力 → 順位に応じてポイント自動付与 |
| もちもち連打（タップで「もち」。超低確率で当たり） | サブマリン杯数の ＋1／−1 |
| ランキング（ダーツ・ポーカー：月間／通算、サブマリン：月間・毎月リセット） | イベントカレンダー・ポイント倍率デー（◯倍・来店◯ptデー） |
| イベントカレンダー（倍率デーも表示） | 設定（ロゴ・店名・ポイント量・ゲーム確率・ランク・順位ポイント） |
| ポイント交換（枠だけ・仮置き）・ポイント履歴 | 交換チケットの処理・交換メニュー編集・スタッフアカウント |

画面一覧とDB設計は [docs/design.md](docs/design.md)、仮で決めた値は [docs/provisional.md](docs/provisional.md)。

## 構成

Next.js 15（App Router）+ Prisma + PostgreSQL（本番は Neon）+ Vercel。
指示書の推奨は Supabase でしたが、**シフト管理くんと同じ Neon + Vercel** にしています（すでに運用中の手順・アカウントをそのまま使え、認証は LINE ログインと自前のスタッフログインなので Supabase Auth が不要なため）。DB は普通の PostgreSQL なので、Supabase の DB に向けることもできます。

## ローカルで動かす

```bash
cd mochimochi
npm install
cp .env.example .env            # SESSION_SECRET を32文字以上のランダムな文字列に変更
npx prisma db push              # SQLite（prisma/dev.db）を作成
SEED_DEMO=1 npm run db:seed     # スタッフ admin / admin1234 とデモ用の会員・結果
npm run dev                     # http://localhost:3000
```

- お客さん画面：`http://localhost:3000/` → ニックネームで仮登録
- 管理画面：`http://localhost:3000/admin`（初回はパスワード変更画面が開きます）
- チェックイン：管理画面「来店QR」に出ているURLを開く（スマホならQRを読み取る）

## テスト

```bash
npm test          # ロジック・サービスのテスト（Vitest）
npm run typecheck
npm run lint
```

## 本番（Vercel + Neon）

シフト管理くんと同じリポジトリに入っているので、**Vercel で新しいプロジェクトを作り、Root Directory を `mochimochi` にします。**

1. Neon で新しいデータベース（またはプロジェクト）を作り、「Connection pooling: ON」の接続文字列をコピー
2. Vercel → Add New → Project → このリポジトリ → **Root Directory: `mochimochi`**
3. 環境変数

   | 変数 | 内容 |
   |---|---|
   | `DATABASE_URL` | Neon の接続文字列（そのまま貼ればOK） |
   | `SESSION_SECRET` | 32文字以上のランダム文字列（`openssl rand -base64 48`）。**チェックインQRの元にもなるので漏らさない** |
   | `APP_BASE_URL` | 公開URL（例 `https://mochimochi.vercel.app`）。QRの読み取り先になります |
   | `SETUP_TOKEN` | 最初のスタッフを作るときのキー（16文字以上） |
   | `NEXT_PUBLIC_LIFF_ID` / `LINE_LOGIN_CHANNEL_ID` | 公式LINE を作ってから（下記） |

4. デプロイ（ビルド時にテーブルが自動で作られます）
5. `https://<URL>/setup` で最初のスタッフ（店長）を作成
6. 管理画面「設定 → 見た目」でロゴ・店名を差し替え
7. 店内タブレットで管理画面「来店QR」の「タブレットに表示する」URLを開き、ホーム画面に追加

## 公式LINE を作ったら

1. [LINE Developers](https://developers.line.biz/) でプロバイダーを作り、**LINE ログインチャネル** を作成（公式アカウントとリンク）
2. そのチャネルで **LIFF アプリ** を追加
   - エンドポイントURL：`https://<本番URL>/`（末尾スラッシュまで。サブパスは付けない）
   - サイズ：Full ／ Scope：`openid` と `profile`
3. Vercel の環境変数に追加して再デプロイ
   - `NEXT_PUBLIC_LIFF_ID` … LIFF ID（`1234567890-AbCdEfGh` の形）
   - `LINE_LOGIN_CHANNEL_ID` … LINE ログインチャネルの Channel ID（数字）
4. 公式LINE のリッチメニューに `https://liff.line.me/<LIFF ID>` を置く（→ マイページが開く）

切り替わると：
- LINE から開いたお客さんは自動でログイン（LINE の表示名で会員登録）
- 来店QRは LINE アプリ内で開くURL（`https://liff.line.me/<LIFF ID>/checkin?c=…`）に自動で変わります
- 仮登録していたお客さんは、**LINE アプリから開くと自動で、ブラウザで開くと画面上部の「LINE と連携する」ボタンから、その会員に LINE が紐付きポイントを引き継ぎます**（仮登録したのと同じスマホ・同じブラウザに残っているログイン情報を使います。LINE アプリ内のブラウザはスマホのブラウザとログイン情報が別のことが多いので、その場合は管理画面で「引き継ぎコード」を発行して入れてもらってください）
- 全員の移行が済んだら「設定 → 会員登録」の仮登録をオフに

## 運用の注意

- 来店QRはその営業日のあいだ同じです。QRの写真やURLが出回ると、位置情報チェックがオフの間は店外からでもチェックインできてしまいます。気になる場合は「設定 → 位置情報チェック」をオンにするか、管理画面「来店QR」で「今日のQRを作り直す」を押してください
