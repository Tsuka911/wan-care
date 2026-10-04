# わんケアアプリ 仕様メモ

> 目的：このメモはコードを読めばわかる詳細（フィールド名や関数の引数など）は省き、
> **「過去に踏んだ罠」「触ってはいけないもの」「コードを読んでもわからない決定の理由」** に絞って書く。

---

## プロジェクト概要
- 犬の健康管理WebアプリをiPhone・MacのホームスクリーンのPWAとして使用
- 単一ファイル構成：`index.html` にHTML/CSS/JSをすべて入れる
- バックエンドは `wan-care-script.gs`（Google Apps Script）+ Google Sheets（データ保存）

## Notion移行（進行中・2026-10-04 開始）

データの保存先を Google Sheets + GAS から **Notion に移す作業中**。まだアプリ側のコードは未着手で、Notion側の受け皿だけができた状態。

### なぜ移すか（調査済みの事実）
- **ブラウザから Notion API を直接呼べる**（CORS対応済み）。実際に `localhost` から `api.notion.com` を叩いて確認済み。GASのような中継役は不要
- これにより **`no-cors` の「送りっぱなしで結果が読めない」制約が消える**。`walkUnsynced` キューや `update_next` のGET裏技といった既存の回避策が不要になる
- 無料ワークスペースの1,000ブロック上限は**2人以上のワークスペースだけ**。ここは1人なので無制限（確認済み）
- レート制限は 180 req/分（平均3/秒）。散歩は半年で132件＝年間約260件ペースなので当面問題なし
- スプレッドシート側でグラフ・集計は使っていないので、Sheetsを捨てても失うものはない

### Notion側の構成（作成済み）
親ページ「わんケア」 `3efe0031-42e0-818d-8e83-c21723746bcd`（プライベート。**コネクションはこのページにだけ接続する**）

| データベース | data source ID | 状態 |
|---|---|---|
| わんケア記録 | `f128631f-c051-4251-86f3-4d4d826c4870` | 41件 移行済み・検証済み |
| わんケア散歩 | `a4e5d8d5-d9a1-4041-98da-363be64643d5` | **空。アプリから投入予定** |
| わんケア旅行 | `e5df7a10-a9d6-4099-be13-3cfceb8a149c` | 3件 移行済み |

- 「わんケア記録」は通院/お薬/体重/トリミング/給水フィルター/その他ケア/症状を**1つにまとめ、`種別` セレクトで区別**する
- 各レコードは `記録ID`（テキスト型）にアプリの `record.id` を入れて対応づける。**数値型にしていないのは、13桁がカンマ区切りで表示されて見づらいため**
- 旅行の `出発日`/`帰宅日` は Notion の日付範囲 `期間` 1つにまとめた

### 認証方式（決定事項）
- **内部コネクション**（旧称インテグレーション）を使う。**パーソナルアクセストークン（PAT）は使わない**
  - PATは本人として動くのでワークスペース全体が見えてしまう。GitHub Pages で公開するアプリに持たせるには危険
  - 内部コネクションは「わんケア」ページに手動で接続したぶんだけに権限が限られる
- トークンは **`index.html` に書かない**。設定画面で入力し localStorage に保存（GASのURLと同じ方式）

### 散歩129件をまだ入れていない理由（重要）
手で書き写すと文字の取り違えが起きる（実際に移行作業中「肛門腺絞り」を1文字間違えた）。散歩はアプリの localStorage に全件あるので、**同期コードを書いたあとアプリ自身から一括送信させる**。そのほうが正確で、書き込み経路のテストも兼ねられる。

### 移行時に直すと決めたデータの問題
- **散歩に重複3件**（同じIDが2行ずつ：2026-07-09 / 2026-08-04 / 2026-09-01）。`no-cors` で再送された結果。IDで重複排除する
- **コース名の打ち間違い「いつもよ」が2件**（2026-06-06 / 2026-06-14）→「いつもの」に直す。直さないと「特別コース」フィルターに引っかかる
- 旧「投薬記録」6件は `meds`（お薬・kind=投薬）に統合済み。旧「ワクチン」シートは0件なので破棄

### 進め方（残り）
1. 設定画面に「Notionトークン」「保存先の切り替え（Sheets / Notion）」を追加
2. アプリから散歩129件を投入
3. しばらくNotionで運用し、問題なければGAS関連コードを削除

## 触ってはいけないもの・基本ルール
- **このフォルダ（wan-care-deploy）が唯一の作業・デプロイ用フォルダ**。以前あった別フォルダ（`Cowork_test/Wancare` バックアップ）は作業フォルダの取り違え整理時に削除済み。今はこのフォルダだけが正。他にコピーを作らない
- GASのエンドポイントURL（Apps Script Web アプリのURL）は **`index.html` にハードコードしない**。設定画面で入力し、各端末の localStorage（`settings.webAppUrl`）に保存する方式。`getWebAppUrl()` で取得する
  - この設計のおかげで `index.html` を GitHub Pages で公開してもURLは漏れない。実URLをコードに直書きしないこと（漏洩防止）
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

統計ピル：`updateHomeStats()`（最新体重 / 連続日数 / 今日の日没）
- 散歩ピルの値は `streak2+'日'`、ラベルは「連続」（「日」を重ねない）
- 3つ目のピル（旧「前回通院」`statHospital`）は「今日の日没」`statSunset` に差し替え済み
  - 散歩に行くタイミングの参考用。`updateHomeStats()` 末尾から `updateSunsetPill()` を呼ぶ
  - 地域は設定画面の「日没を表示する地域」（`set-sunset-city` → `settings.sunsetCity`、既定 `nagoya`）。座標は `SUNSET_CITIES` 定数（主要都市プリセット）
  - 日没は無料の `api.sunrise-sunset.org`（APIキー不要・CORS対応、`no-cors` 不要）から取得。返り値はUTCなので `new Date()` で端末TZ（JST）へ自動変換して表示
  - `sunsetCache`（`{date, cityId, sunset}`）に当日分をキャッシュ。同日・同都市ならAPIを呼ばない。取得失敗してもアプリは壊さず `--` のまま

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

### 散歩の「コース」欄
- ほぼ毎回同じコースを歩くため、入力は「いつもの」／「その他」の2択トグル（`setWalkCourseMode()` / `isWalkCourseOther()`）。**既定は「いつもの」**、「その他」を選んだときだけ自由入力欄 `#walk-course-input-wrap` が出る
- 「いつもの」を選ぶと `record.course` に定数 `USUAL_COURSE`（= 文字列 `'いつもの'`）が入る。専用フラグを持たせず文字列で保存しているので、Sheets 側も既存の「コース」列のままで変更不要
- 編集時は `course === 'いつもの'` なら「いつもの」、それ以外（空文字含む）は「その他」モードで復元する。旧データの空コースを勝手に「いつもの」に書き換えないための判定
- モードのリセットは `openAddSheet()` と保存後の `clearForm` 直後の2か所。散歩フォームに新しい開き方を足すときはリセット漏れに注意

### 「特別コース」フィルター（記録タブ）
- 記録タブのフィルターチップに「特別コース」を追加。コースが「いつもの」でも空欄でもない散歩＝特別なおでかけだけを絞り込む
- 判定は `isSpecialCourse(course)`。**空文字の旧データは対象外**（「いつもの」に書き換えない方針と同じ理由）
- 特別コースの散歩は、本文に混ぜずに場所ピン付きタグ（`pinSvg()`）でコース名を表示する。タイムライン（`renderTimeline`）と記録カード（`renderRecordItem`）の両方

## 東海道五十三次マイルストーン（散歩サマリー内）
- `TOKAIDO_MILESTONES` 定数（`renderWalkSummary` 直前に定義）が宿場リスト（日本橋〜三条大橋・全55エントリ）
- 池鯉鮒宿（km:383）は地元として `hometown:true` で金色バッジ特別演出
- 浮世絵風カラー（藍色 `#2a5f8f` / 朱色 `#c0392b` / 和紙 `#f5ede0`）

## 「もうすぐの予定」リマインダー
- 対象種別は `REMIND_CHECKS` 配列で定義（hospital / vaccine / medicine / trim / filter / symptom / meds）
- 30日先までの next 日付を持つレコードを抽出して表示

### 過ぎた予定（やり忘れ防止）
- **`next` が過ぎていても、空でない限り＝未実施なので表示し続ける**（`getUpcomingReminders` は未来側の上限だけチェックし、過去側は制限しない）
- 雨などで開かない日が続いても見逃さないための仕様。何日前までという下限は意図的に設けていない
- `daysLeft` が負のものに `overdue:true` を付け、並び順は `daysLeft` 昇順なので遅れているものが自動的に一番上に来る
- 見た目は種別カラーではなく赤系（`.remind-days.overdue` + インラインの赤枠）で「○日 / 遅れ」の2行表示。ラベル幅が52pxしかないのでフォントを小さくして2行にしている
- 通知本文（`sendUpcomingNotifications`）も「○日遅れ」表記に対応。通知済みフラグは日付ごとなので、実施するまで毎日1回リマインドされる

### 既存予定カードのボタン
- カレンダー＋ペン → `editNextDate()`（トグル動作で日付編集）
- チェックマーク → `markDone()`：**記録フォームを開く**動作
  - グローバル変数 `pendingDoneRef = {key, id}` で「実施済み経由」を識別
  - **日付の初期値は「今日」**（`localDateStr()`）。予定日より早くても遅くても、アプリを開いて押した日が実施日になるのが自然なため。違う日なら手で直す。meds は kind も引き継ぐ
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
- 以下のビューから除外される：直近の記録（`updateHomeStats` 内）／記録タブ（`getAllRecords`）／カテゴリ別記録一覧（`renderRecords`）
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

## 入力候補チップ（前回入力の記憶）
- テキスト入力欄の下に出る履歴チップ。`saveSuggestion()` で localStorage に保存し、`renderChips(inputId, storageKey, chipClass)` で描画（最大10件・新しい順）
- **新しい欄に候補を付けるときは3か所セットで追加する**（どれか忘れると動かない）
  1. HTML：入力欄に `onfocus`/`oninput` で `renderChips(...)` を付け、直後に `<div class="suggestion-chips" id="chips-<入力欄のid>">` を置く（id は必ず `chips-` + 入力欄id）
  2. `addRecord()` の該当ブロックに `saveSuggestion('<storageKey>', record.<項目>)`
  3. `SUGGEST_SOURCES` に `{storageKey, dbKey, field}` を追加
- `SUGGEST_SOURCES` / `seedSuggestions()` は**過去の記録から候補を自動で補充する**仕組み。機能追加より前に保存したデータでも初回からチップが出る。起動時と Sheets 同期完了後に呼ぶ
- 候補が付いている欄：病院名（通院・ワクチン・お薬）／受診内容／サロン名／給水機の種類／フィルターの種類／薬の名前／投与量／ケアの種類／症状の概要／部位・様子
- チップの色はカテゴリカラーに合わせたクラス（`hospital` `salon` `health` `travel` `violet` `symptom`）。給水フィルターは `CAT_CFG` が青なので `travel` を使う
- `clearForm()` は入力欄と一緒に `chips-<id>` の中身も消す（保存後に古い候補が残らないように）

## 買い物リスト（消耗品）
- ホームのボタン `#shoppingOpenBtn` → `openShoppingSheet()` で下から出るボトムシート `#shoppingSheet` を開く
- **このアプリで唯一 Sheets 同期しない機能。データは localStorage のみ**（`DB.get/set` で `shoppingList`＝買うもの / `shoppingCandidates`＝候補）。健康記録とは性質が違う買い物メモなので同期不要と判断。今後も指示がない限り Sheets 連携は追加しない
- 候補の初期値は `SHOPPING_DEFAULTS` 定数。`initShoppingCandidates()` が初回だけ localStorage に流し込む
- 自由入力で追加したものは候補にも自動登録。「買った」(`completeShoppingItem`) はリストから消すだけで候補には残す
- **起動時の描画リスト（`updateHomeStats` 等）には追加不要**。ホームにあるのは静的なボタンだけで、中身はシートを開いた時に `renderShopping()` が描画する。ビジュアルカード系（もうすぐの予定・体重グラフ等）の起動時描画ルールとは別物
