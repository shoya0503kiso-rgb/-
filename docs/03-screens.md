# 03. 画面一覧・画面遷移

## 画面一覧

| パス | 画面 | 利用者 | 端末 | Phase |
|------|------|--------|------|-------|
| `/kiosk` | 打刻画面 | 従業員 | 店舗iPad | 1 |
| `/kiosk/setup` | 打刻端末の登録 | 管理者 | 店舗iPad | 1 |
| `/login` | 管理者ログイン | 管理者 | PC/スマホ | 1 |
| `/admin` | ダッシュボード（今日の出勤者・未打刻・要確認・提出率・期限） | 管理者 | PC/スマホ | 1〜3 |
| `/admin/employees` | 従業員一覧・追加 | 管理者 | PC/スマホ | 1 |
| `/admin/employees/[id]` | 従業員編集（固定プロフィール・PIN・LINE連携コード） | 管理者 | PC/スマホ | 1/2 |
| `/admin/attendance` | 月次勤怠一覧（スタッフ・月を選択、月合計） | 管理者 | PC/スマホ | 1 |
| `/admin/attendance/[sessionId]` | 勤怠の修正・修正履歴・確認済み | 管理者 | PC/スマホ | 1 |
| `/admin/attendance/new` | 勤怠の手動追加 | 管理者 | PC/スマホ | 1 |
| `/admin/anomalies` | 要確認勤怠一覧 | 管理者 | PC/スマホ | 1 |
| `/admin/export` | 社労士提出データ出力（CSV/Excel/印刷） | 管理者 | PC | 1 |
| `/admin/export/print` | 印刷用（PDF保存用）ページ | 管理者 | PC | 1 |
| `/admin/settings` | 店舗設定（営業時間・閾値・休日・店休日・打刻端末） | 管理者 | PC/スマホ | 1 |
| `/admin/line` | LINE連携状況・通知履歴 | 管理者 | PC/スマホ | 2 |
| `/admin/shifts` | シフト期間一覧（月ごとの状態） | 管理者 | PC/スマホ | 2 |
| `/admin/shifts/[ym]` | シフト期間詳細：提出状況・月次条件・生成・編集・公開 | 管理者 | PC | 2/3 |
| `/admin/shifts/settings` | シフト枠・必要人数 | 管理者 | PC | 3 |
| `/s/[token]` | シフト希望提出（LINEのリンクから開く） | 従業員 | スマホ | 2 |
| `/me/[token]` | 自分の確定シフト・勤務時間（・給与目安） | 従業員 | スマホ | 2/4 |

## 画面遷移

```
[店舗iPad]
 /kiosk/setup ──(管理者ログイン後に端末登録)──▶ /kiosk
 /kiosk: 名前をタップ ─▶ 状態に応じたボタンだけ表示（出勤 / 休憩開始・退勤 / 休憩終了）
         ─▶ 押す ─▶ 「○○さん 出勤 21:03」大きく表示 ─▶ 4秒後に自動で名前一覧へ戻る
         （PIN設定スタッフのみ、ボタンの前にPIN入力）

[管理者]
 /login ─▶ /admin（ダッシュボード）
   ├─ 要確認勤怠 ○件 ─▶ /admin/anomalies ─▶ /admin/attendance/[id]（修正 or 確認済み）
   ├─ 今日の出勤者 / 未打刻 ─▶ /admin/attendance/[id]
   ├─ シフト未提出者・提出率 ─▶ /admin/shifts/[ym]
   ├─ 従業員 ─▶ /admin/employees ─▶ /admin/employees/[id]
   ├─ 月次勤怠 ─▶ /admin/attendance ─▶ /admin/attendance/[id]
   ├─ 出力 ─▶ /admin/export ─▶ CSV / Excel ダウンロード / 印刷ページ
   ├─ シフト ─▶ /admin/shifts ─▶ /admin/shifts/[ym]
   │     タブ: 提出状況 → 月次条件 → 自動生成 → 編集 → 公開
   └─ 設定 ─▶ /admin/settings, /admin/shifts/settings, /admin/line

[従業員スマホ（LINE）]
 LINEトーク「シフト提出」 or 13日の通知 ─▶ /s/[token] ─▶ 日ごとに ○/× ─▶ 提出
 LINEトーク「シフト確認」「勤務時間」 ─▶ トーク内に返信 ＋ /me/[token] へのリンク
```

## UI方針
- **打刻画面**：ボタンは最小 88px、名前は大きく、状態（勤務中/休憩中）を色で表示。操作は2タップ。
- **管理画面**：スマホでは表を横スクロール、主要操作はページ上部。要確認は赤バッジ。
- 日本語表示、時刻は24時間表記。日跨ぎの時刻は「翌03:00」と表記。
