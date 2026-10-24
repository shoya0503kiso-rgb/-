# FT紹介動画メーカー（9High福山）

ポーカー大会の **ファイナルテーブル（FT）進出者紹介動画** を作るツールです。
`players.json` と素材ファイルを差し替えるだけで、毎大会の動画を mp4 で書き出せます。

- 縦型 1080×1920（インスタ・TikTok）と横型 1920×1080 の両方に対応
- 黒×金のカジノ風デザイン、日本語は極太の「Dela Gothic One」、英字は「Cinzel」、数字は「Oswald」

## 動画の流れ

| パート | 長さ | 内容 |
|---|---|---|
| オープニング | 5秒 | 「◯◯ PRESENTS / FINAL TABLE」、大会名・サブタイトル・日付・人数 |
| 1人ずつの紹介 | 動画5秒＋4秒 | 本人動画 → フラッシュ/グリッチ → キャラ画像がズームイン（揺れ・光）→ 肩書き・席番号・名前・持ち点（0からカウントアップ） |
| チップリーダー入場 | 3.5秒 | スポットライト、「LADIES AND GENTLEMEN」「最後に登場するのは…」→「CHIP LEADER」ドーン |
| チップリーダー紹介 | 動画5秒＋5.5秒 | 王冠・衝撃波・チップが弾け飛ぶ特別演出 |
| エンディング | 8秒 | 全員の画像つき持ち点ランキング、「GOOD LUCK!」 |

- 紹介順は **持ち点の少ない順**。最後がチップリーダー（同点は席番号の小さい順）
- 全体の長さは人数で自動的に変わります（9人で約1分39秒）
- BGMは全体にループで流れ、本人動画の間は自動で音量を下げます

---

## はじめての準備（1回だけ）

1. [Node.js](https://nodejs.org/ja)（LTS版）をインストール
2. ターミナルでこのフォルダに移動してインストール

```bash
cd ft-video
npm install
```

> 書き出し（render）のとき、初回だけ Remotion が描画用の Chrome を自動でダウンロードします。

## プレビュー

```bash
npm start
```

ブラウザで Remotion Studio が開きます。左の一覧で **FT-Vertical（縦型）** / **FT-Horizontal（横型）** を選ぶと再生できます。
`players.json` を保存すると、プレビューにすぐ反映されます。

## mp4 に書き出す

```bash
npm run render:vertical     # 縦型 → out/ft-vertical.mp4
npm run render:horizontal   # 横型 → out/ft-horizontal.mp4
npm run render:all          # 両方
```

書き出しの前に、素材の不足や `players.json` の書き間違いを自動チェックします（`npm run check` で単体実行も可）。

### 大会当日：作り置きして速く書き出す

書き出しで一番時間がかかるのは本人動画のパートです。本人動画のパートは持ち点に関係ないので、**持ち点が決まる前に作り置き**しておけます。

1. 残っている全員分（FT前で多めでもOK）の名前・キャッチコピー・動画を `players.json` と `assets/` に入れる。持ち点は仮の数字でOK
2. `npm run prerender` … 全員分の本人動画パートを作り置き（横型は `npm run prerender:horizontal`）
3. 飛んだ人を `players.json` から消していく（作り置きはそのまま使えます）
4. FTメンバーが決まったら、持ち点・席番号を入れて `npm run fast`（横型は `npm run fast:horizontal`）

`npm run fast` は、オープニング・キャラ紹介・チップリーダー入場・エンディングだけを書き出し、作り置きとつなげて BGM を乗せます → `out/ft-vertical.mp4`。
作り置きは `out/cache/` に保存され、名前・動画・大会名・プログラムが変わったパートだけ作り直します。

> `npm run render:vertical` との違いは書き出し方だけで、見た目は同じです。

---

## 実際の素材を入れる手順（毎大会これだけ）

### 1. 素材ファイルを置く

```
ft-video/
├─ players.json          ← 2. で書き換える
└─ assets/
   ├─ videos/  player1.mp4, player2.mp4, …   本人の動画（約5秒）
   ├─ images/  player1.png, player2.png, …   キャラ画像（持ち点なしの素の画像）
   └─ bgm/     bgm.mp3                        BGM（任意）
```

- ファイル名は自由です（日本語名でもOK）。`players.json` に書いた名前と **拡張子・大文字小文字まで完全一致** させてください
- 前回大会のダミー/素材は削除してOK（`players.json` から参照されていないファイルは使われません）

**本人動画のコツ**
- 縦長（スマホで縦撮り）が一番きれいに収まります。横長の動画でも、余白はぼかした映像で自動的に埋まります
- 5秒以上あればOK。頭から5秒だけ使います（短いと最後のコマで止まります。チェック時に警告が出ます）
- 形式は mp4（H.264）がおすすめ。iPhone の .mov もたいてい使えますが、エラーが出たら mp4 に変換してください
- 動画の音声も流れます。いらない場合は `settings.videoVolume` を `0` に

**キャラ画像のコツ**
- 縦長（3:4 くらい。ChatGPT なら 1024×1536 の縦長）がおすすめ。枠に合わせて上寄せでトリミングされます
- 画像がない人は `image` を書かなければ、本人動画の1コマを自動で切り出して使います（`assets/images/_auto/`）
- 正方形でも使えますが、左右が少し切れます
- png / jpg / webp が使えます

### 2. players.json を書き換える

```json
{
  "tournament": {
    "store": "9High福山",
    "title": "9High CHAMPIONSHIP",
    "subtitle": "MAIN EVENT",
    "date": "2026.10.24"
  },
  "settings": {
    "videoSeconds": 5,
    "bgm": "bgm/bgm.mp3",
    "bgmVolume": 0.6,
    "bgmVolumeDuringVideo": 0.2,
    "videoVolume": 1
  },
  "players": [
    { "name": "ダイスケ", "title": "9High福山の主", "seat": 9, "chips": 342000, "video": "player9.mp4", "image": "player9.png" },
    { "name": "TAKUMI", "title": "冷静沈着のブラフマスター", "seat": 2, "chips": 96500, "video": "player2.mp4", "image": "player2.png" }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `tournament.store` | 店名（オープニングとエンディングに表示） |
| `tournament.title` | 大会名（英字が映えます） |
| `tournament.subtitle` | サブタイトル（任意。不要なら行ごと削除） |
| `tournament.date` | 日付（書いた文字がそのまま出ます） |
| `players[].name` | 表示名。長い名前は自動で文字が小さくなります |
| `players[].title` | 肩書き・キャッチコピー（任意） |
| `players[].seat` | 席番号（任意） |
| `players[].chips` | 持ち点。**数字だけ**（`125000`。カンマや `""` は付けない）。表示は自動で `125,000` |
| `players[].video` / `image` | `assets/videos/`・`assets/images/` 内のファイル名（`image` は省略可） |
| `players[].videoSeconds` | この人だけ動画の秒数を変えたいとき（任意） |
| `settings.videoSeconds` | 本人動画を流す秒数（既定 5） |
| `settings.bgm` | `assets/` からのBGMのパス。BGMなしは `null` |
| `settings.bgmVolume` | BGMの音量（0〜1） |
| `settings.bgmVolumeDuringVideo` | 本人動画中のBGM音量（動画の声を聞かせたいとき下げる） |
| `settings.videoVolume` | 本人動画の音量（0で消音） |
| `settings.transition` | 切り替え演出：`"auto"`（既定。フラッシュとグリッチを交互、チップリーダーは両方）/ `"flash"` / `"glitch"` / `"both"` |

- **players の並び順は自由**です。紹介順は持ち点から自動で決まります
- 人数は何人でもOK（6〜10人程度を想定してレイアウトしています）
- JSON は最後の項目の後ろに `,` を付けるとエラーになります。`npm run check` で場所を教えてくれます

### 3. プレビューで確認 → 書き出し

```bash
npm start                  # 確認
npm run render:vertical    # 書き出し → out/ft-vertical.mp4
```

---

## ダミー素材について

最初から入っている `assets/videos/player*.mp4`・`assets/images/player*.png`・`assets/bgm/dummy-bgm.mp3` は動作確認用のダミーです。
`npm run dummy` で `players.json` に合わせて作り直せます（ffmpeg が必要。既にあるファイルは上書きしません。`npm run dummy -- --force` で上書き）。

## カスタマイズしたいとき

| やりたいこと | 場所 |
|---|---|
| 各パートの長さ | `src/timeline.ts` の `OPENING_FRAMES` など（30 = 1秒） |
| 色・フォント | `src/theme.ts` |
| オープニング / 1人分 / チップリーダー入場 / エンディング | `src/scenes/` の `Opening.tsx` / `PlayerVideo.tsx`・`PlayerReveal.tsx` / `LeaderIntro.tsx` / `Ending.tsx` |
| 書き出し画質 | `remotion.config.ts`（`setCrf` は小さいほど高画質・大きいファイル） |

## 困ったとき

- **「見つかりません」と出る** … ファイル名の打ち間違い、拡張子（`.PNG` と `.png`、`.mov` と `.mp4`）を確認
- **プレビューで画像が古いまま** … ブラウザを再読み込み
- **Chrome のダウンロードに失敗する（社内ネットなど）** … インストール済みの Chrome を使う：
  `npx remotion render FT-Vertical out/ft-vertical.mp4 --browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`

## フォントのライセンス

`assets/fonts/` の Dela Gothic One・Cinzel・Oswald は SIL Open Font License 1.1 です（同フォルダの `OFL-*.txt`）。動画への使用・商用利用ともに可能です。
