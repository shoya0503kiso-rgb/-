# 02. DB設計

正本は [`prisma/schema.prisma`](../prisma/schema.prisma)。ここでは設計の考え方をまとめる。

## 全体構成

```
[管理・設定]  AdminUser, StoreSetting, CalendarDay, KioskDevice
[従業員]      Employee（固定プロフィール）
[勤怠]        WorkSession ─< BreakPeriod
              WorkSession ─< AttendanceRevision（修正履歴）
              WorkSession ─< AnomalyAck（確認済み）
              PunchLog（打刻の生ログ）
[LINE]        LineAccount, LineLinkCode, Notification（送信キュー）
[シフト]      ShiftPattern ─< StaffingRule / StaffingOverride（必要人数）
              ShiftPeriod ─< ShiftRequestSubmission ─< ShiftRequestDay（希望）
              MonthlyCondition, PairConstraint（月次条件）
              ShiftPeriod ─< ShiftAssignment（案/確定）, ShiftGenerationRun, ShiftPublication
```

## 設計上のポイント

### 1. 固定プロフィールと月次条件の分離（要件11）
- `Employee` … 名前・雇用区分・時給・基本の最大/最低日数など恒常的な情報
- `MonthlyCondition`（`yearMonth` + `employeeId` で一意）… その月だけの優先度・多め/少なめ・最大/最低日数・店長メモ
- `PairConstraint` … その月の相性条件
- 翌月は前月の条件をコピーして編集できる（初期値は `Employee.baseMaxDays / baseMinDays`）。

### 2. 勤怠は「勤務単位」で持つ（日跨ぎ対応・要件17）
- `WorkSession` が1回の勤務。出勤〜退勤が日付を跨いでも1レコード。
- 帰属日 `businessDate` は出勤時刻と「日付切替時刻」（既定06:00）から決める（P-04）。
- 時刻はすべて UTC の `DateTime` で保存し、表示・判定時に日本時間へ変換する。
- 実働・休憩合計は保存せず、毎回計算する（修正時の不整合を防ぐ）。

### 3. 履歴を残す（要件17）
- `PunchLog` … iPadからの打刻をそのまま記録。拒否された打刻（二重出勤など）も残す。改変しない。
- `AttendanceRevision` … 管理者修正のたびに修正前後のスナップショット（JSON）・修正者・理由を保存。
- 勤怠の削除は `deletedAt` による論理削除。

### 4. 異常は保存せず計算する
- 要確認勤怠は勤怠データとルールから毎回判定（ルールや閾値を変えると即反映）。
- 「確認済み」は `AnomalyAck` に (勤怠, 異常コード, 勤怠のversion) で保存。勤怠が修正されると version が上がり、再判定される（P-14）。

### 5. LINE連携は疎結合（要件17）
- 勤怠・シフトのテーブルは LINE を一切参照しない。LINE の情報は `LineAccount` に分離。
- 業務処理は `Notification`（アウトボックス）に「誰に・何を」を積むだけ。送信はディスパッチャが行い、LINE未設定時はモック送信（記録のみ）。
- `dedupeKey` で同じ通知の二重送信を防ぐ（定期実行が2回動いても安全）。

### 6. PostgreSQL への移行
- `enum` と `Json` 型は使わず `String` で保持しているため、`provider` を `postgresql` に変えるだけで移行できる。
