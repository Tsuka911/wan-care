# わんケアアプリ 仕様メモ

> 目的：このメモはコードを読めばわかる詳細（フィールド名や関数の引数など）は省き、
> **「過去に踏んだ罠」「触ってはいけないもの」「コードを読んでもわからない決定の理由」** に絞って書く。

---

## プロジェクト概要
- 犬の健康管理WebアプリをiPhone・MacのホームスクリーンのPWAとして使用
- 単一ファイル構成：`index.html` にHTML/CSS/JSをすべて入れる
- バックエンドは `wan-care-script.gs`（Google Apps Script）+ Google Sheets（データ保存）

## 触ってはいけないもの・基本ルール
- **このフォルダ（wan-care-deploy）が作業・デプロイ用**。`Cowork_test/Wancare` はバックアップ専用、編集しない
- GASのエンドポイントURLは `index.html` 内の `GAS_URL` 変数に記載。**公開しない**
- 絵文字は使わない。アイコンはすべてSVG（`cs(type, size)` 関数で生成）

---

## 過去に踏んだ罠と対処（再発防止メモ）

### iOS Safari の制約
- **`no-cors` POSTが届かない問題**：iOS Safariだと `mode:'no-cors'` のPOSTがGASに届かないことがある
  - 重要な処理は **GETリクエスト方式に変更**（`?action=update_next&...` でGAS `doGet` 経由）
  - GAS側の `doGet` に `update_next` アクションを実装済み（getRecords → deleteRecord → addRecord）
- **`input[type="date"]` の値はYYYY-MM-DD形式のみ**：スラッシュ区切りだとデートピッカーが空になる
  - `normalizeDate()` で必ず正規化してからinputにセット
- **font-size:16px未満で自動ズームされる**：入力欄は最低16pxにする

### 起動時の表示タイムラグ
- Sheets同期は数秒かかるため、`DOMContentLoaded` で **localStorageキャッシュから先に描画する**
- ホーム画面の新しいビジュアルカードを追加したら、起動時の描画リストにも追加すること：
  `updateHomeStats` / `renderUpcoming` / `renderWeightLine` / `renderWalkSummary` / `renderMemoryCard`
- Sheets取得完了後は `renderPage(activePage)` で自動的に再描画される

### UI挿入位置の罠
- 「もうすぐの予定」の `.remind-item` は `display:flex` の横並び
- フォームを `appendChild` で**内側**に入れると右端からはみ出す
- → `card.insertAdjacentElement('afterend', form)` でカード**外側・直後**に挿入する

### 誤タップ防止
- 「実施済み」ボタンは押すと記録フォームに飛ぶ動作（ボタン押下だけでは予定が消えない）
- 「もうすぐの予定」のカレンダーボタンはトグル動作（再押下で閉じる）
- 記録なしで予定だけ取り消すには「予定だけキャンセル」ボタン → 自前の確認ダイアログを経由

### Sheets同期の特殊事項
- `walk`（散歩）だけGET/POSTの特殊処理（`action=add_walk` / `action=delete_walk`）
- 他は `syncToSheets(key, data, 'add'|'delete')` のdelete→addセットで同期
- `mode:'no-cors'` のためレスポンスは確認できない
- 編集・実施済み・日付変更はすべてdelete→addの組み合わせ

---

## 設計上の決定（コードを読んでもわからない意図）

### 記録種別のキー命名（マイグレーション中）
- `vaccine`（ワクチン）と `medicine`（投薬）は**旧キー**。新規記録はすべて `meds` に保存
- 既存データは引き続き表示されるよう `CAT_CFG` に残してある
- next（次回予定）のデフォルト：ワクチン+1年、投薬+1ヶ月

### カラー方針の例外（重要）
- カテゴリカラー：health=オレンジ / daily=緑 / travel=青 / other=紫 / symptom=ピンク
- `other`（その他ケア）は `cat:'daily'` だが**カラーは紫**。`colorMap`/`bgMap` では `_type` で個別指定が必要
- `symptom` は `cat:'health'` だが**カラーはピンク**。同様に `_type` で個別指定が必要

### 統合された機能
- メニューの「ワクチン」「投薬」ボタンは「お薬」1枠に統合。新規記録は `meds` キーに保存
- フォームで「種類」（ワクチン or 投薬）を選ぶと対応フィールドが表示切り替え

---

## ホーム画面の主要セクション（場所の地図）

統計ピル：`updateHomeStats()`（最新体重 / 連続日数 / 前回通院）
- 散歩ピルの値は `streak2+'日'`、ラベルは「連続」（「日」を重ねない）

縦並び順（上から下）：
1. もうすぐの予定：`renderUpcoming()` → `id="upcomingCard"`
2. 散歩サマリー（東海道の旅含む）：`renderWalkSummary()` → `id="walkSummaryCard"`
3. 体重折れ線グラフ：`renderWeightLine()` → `id="weightLineCard"`
4. 思い出振り返り：`renderMemoryCard()` → `id="memoryCard"`
5. 直近の記録：`#recentList`（`updateHomeStats` 内で更新）

これらはすべて以下の3パターンで呼ぶ必要がある：
- `renderPage('home')` 内
- 記録追加・削除後
- 起動時（`DOMContentLoaded`）

## 東海道五十三次マイルストーン（散歩サマリー内）
- `TOKAIDO_MILESTONES` 定数（`renderWalkSummary` 直前に定義）が宿場リスト（日本橋〜三条大橋・全55エントリ）
- 池鯉鮒宿（km:383）は地元として `hometown:true` で金色バッジ特別演出
- 浮世絵風カラー（藍色 `#2a5f8f` / 朱色 `#c0392b` / 和紙 `#f5ede0`）

## 「もうすぐの予定」リマインダー
- 対象種別は `REMIND_CHECKS` 配列で定義（hospital / vaccine / medicine / trim / filter / symptom / meds）
- 30日以内の next 日付を持つレコードを抽出して表示

### 既存予定カードのボタン
- カレンダー＋ペン → `editNextDate()`（トグル動作で日付編集）
- チェックマーク → `markDone()`：**記録フォームを開く**動作
  - グローバル変数 `pendingDoneRef = {key, id}` で「実施済み経由」を識別
  - 日付は元の next を初期値にセット（今日ではない）。meds は kind も引き継ぐ
  - フォーム下部に `#skipDoneBtn`（予定だけキャンセル）が出現。通常記録のときは display:none
  - フォームで保存すると `addRecord()` 末尾で元の next を空に → `update_next` で同期
  - `closeAddSheet()` で `pendingDoneRef` と `#skipDoneBtn` を必ずリセットすること（次の通常記録に引きずらないため）

### 新規予定の追加
- カード右上「＋ 新規」ボタン → `openNewUpcoming()` で軽量モーダル `#upcomingSheet` を開く
- 入力は「種別 / 予定日 / メモ」のみ
- 種別の選択肢は新規方針に合わせ、旧キー `vaccine`/`medicine` は除外（代わりに「お薬（ワクチン）」「お薬（投薬）」を `meds` の kind 付きで出す）
- `saveNewUpcoming()` で `date` と `next` を同じ予定日にセット + **`isPlanOnly: true`** を付けて DB に追加 → `syncToSheets`

### 「予定だけ」レコード（`isPlanOnly: true`）の扱い
- 新規予定 (`saveNewUpcoming`) で追加されたレコードは `isPlanOnly: true` が付き、**実績ではない**扱い
- 以下のビューから除外される：直近の記録（`updateHomeStats` 内）／前回通院ピル（`statHospital`）／記録タブ（`getAllRecords`）／カテゴリ別記録一覧（`renderRecords`）
- 「もうすぐの予定」（`renderUpcoming` / `getUpcomingReminders`）にだけ表示される
- 実施済みボタンから記録フォーム経由で保存した「実績レコード」は別IDで新規追加されるので `isPlanOnly` が付かず、通常通り全ビューに出る
- 元の予定レコードは `next` を空にされて「もうすぐの予定」から消え、`isPlanOnly: true` のまま残るので他ビューにも引き続き出ない
- 直近の記録などをフィルタするときは `.filter(r=>!r.isPlanOnly)` を必ず付けること（新しいビューを追加するときも忘れずに）

### Sheets 側の「予定のみ」カラム
- 対象シート（通院・ワクチン・投薬・トリミング・フィルター・症状・お薬）の末尾に「予定のみ」カラムを追加
- `wan-care-script.gs` の `SHEET_MAP` で定義。GAS の `getOrCreateSheet` がヘッダー不足を検知すれば自動補完するので、既存シートを手で編集する必要はない
- 値は `'TRUE'` / `''`（空）の文字列。`planOnlyIn()` / `planOnlyOut()` ヘルパーで boolean と相互変換

### 自前確認ダイアログ
- `customConfirm(msg, onOk)` / `closeConfirmDialog(ok)` / `#confirmDialog`
- ブラウザの `confirm()` はボタン文字を変更できないため自作（「もどる」「OK」表記が出せる）
- 現状は「予定だけキャンセル」からのみ使用。今後 confirm を置き換える際にも流用可
