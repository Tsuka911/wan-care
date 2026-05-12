# わんケアアプリ 仕様メモ

## プロジェクト概要
犬の健康管理WebアプリをiPhone・MacのホームスクリーンのPWAとして使用。
Google Sheetsをデータベースとして使い、Google Apps Script（GAS）でAPI化している。

## ファイル構成
- `index.html` — アプリ本体（HTML + CSS + JavaScript をすべて1ファイルにまとめている）
- `wan-care-script.gs` — Google Apps Script（バックエンド）
- `wancare-icon-*.png` — アイコン画像

## データの流れ
1. ユーザーがアプリで記録を追加・削除
2. `localStorage`（DB オブジェクト）にリアルタイム保存
3. `syncToSheets()` でGASのエンドポイントにPOST → Google Sheetsに書き込み
4. アプリ起動時に `loadFromSheets()` でGoogle SheetsからJSON取得 → localStorageに同期

## 記録の種類と「次回予定（next）」フィールド

| 種別キー | シート名 | nextフィールド | デフォルト次回 |
|---|---|---|---|
| hospital | 通院記録 | next（次回予定） | なし（手入力） |
| vaccine | ワクチン | next（次回予定） | +1年 ※旧キー。新規記録はmeds |
| medicine | 投薬記録 | next（次回） | +1ヶ月 ※旧キー。新規記録はmeds |
| meds | お薬記録 | next（次回予定日） | ワクチン:+1年 / 投薬:+1ヶ月 |
| trim | トリミング | next（次回） | +1ヶ月 |
| filter | フィルター交換 | next（次回交換日） | +1ヶ月 |
| symptom | 症状記録 | next（受診予定日） | なし（手入力） |
| weight | 体重記録 | なし | — |
| walk | 散歩記録 | なし | — |
| other | その他ケア | なし | — |
| trip | 旅行記録 | なし | — |

## ホーム画面「もうすぐの予定」
- `REMIND_CHECKS` 配列で対象種別を定義（hospital / vaccine / medicine / trim / filter / symptom / meds）
- `getUpcomingReminders(30)` で30日以内の next 日付を持つレコードを抽出
- `renderUpcoming()` で表示。各カードに2つのSVGアイコンボタンあり：
  - カレンダー＋ペンアイコン → `editNextDate()` で日付をインライン編集
  - チェックマークアイコン → `markDone()` で next をクリア（実施済み扱い）

## 編集機能の対応状況
- **全種別** フル編集対応（`editRecord(key, id)` + Google Sheets同期）
- **nextフィールドの日付変更** は全種別で対応（`editNextDate()` / `confirmNextDate()`）
- 編集フロー：`editRecord()` でフォームに値をセット → `addRecord()` 内の `if(currentEditId)` ブロックで保存
- walk編集のみ特殊（GASのGETリクエスト方式）、それ以外は `syncToSheets` の delete→add で同期

## Google Sheets同期
- `syncToSheets(key, data, 'add'|'delete')` でPOST
- walk だけ GET/POST の特殊処理あり（`action=add_walk` / `action=delete_walk`）
- `mode: 'no-cors'` を使用しているためレスポンスは確認できない
- 編集・済ボタン・日付変更はすべて delete→add のセットで同期

## ホーム画面のビジュアルカード（追加済み）
- **体重折れ線グラフ**（`renderWeightLine()`）: 体重2件以上で表示。`id="weightLineCard"`
- **散歩サマリー**（`renderWalkSummary()`）: 東海道の旅セクション＋3マスグリッド（通算回数・通算時間・通算距離）。`id="walkSummaryCard"`
- **思い出振り返り**（`renderMemoryCard()`）: 1年前±3日の記録をピックアップ。`id="memoryCard"`
- これらは `renderPage('home')` 内と、記録追加・削除後に呼び出す必要がある

## 東海道五十三次マイルストーン（散歩サマリー内）
- `TOKAIDO_MILESTONES` 定数（`renderWalkSummary` 直前に定義）：日本橋（0km）〜三条大橋（540km）の全55エントリ
- 各エントリは `{km, name, pref, msg, hometown?}` を持つ
- 通算距離をもとに現在の宿場・次の宿場・進捗率を計算して `id="tokaidoSection"` に描画
- 進捗バー（藍色 `#2a5f8f`）＋旗マーカー（棒：藍色 / 旗：朱色 `#c0392b`）で現在地表示
- 宿場到達時は朱色バッジ＋都府県タグ（`.tokaido-pref`）＋一言コメントを表示
- **池鯉鮒宿**（愛知県・km:383）のみ `hometown:true` を設定し、金色バッジ（`.tokaido-badge-hometown`）で特別演出
- 和紙風ベージュ背景（`#f5ede0`）で浮世絵ムードを演出

## ホーム画面上部の統計ピル
- 3つのピル：最新体重 / **連続日数**（`id="statWalks"`） / 前回通院
- 連続日数は `updateHomeStats()` 内で計算（今日に記録がなければ昨日から遡るロジック）
- ラベルは「日連続」

## 「もうすぐの予定」日付編集（iOS対応済み）
- カレンダーアイコン → `editNextDate(key, id, currentDate)` で日付入力フォームを表示
- **フォームの挿入位置**：`card.insertAdjacentElement('afterend', form)` でカードの直後に挿入
  - `.remind-item` が `display:flex` の横並びなので、`appendChild` するとフォームがはみ出す
- **自動保存**：`input[type="date"]` の `onchange` で `confirmNextDate()` を呼び出す（確定ボタンなし）
  - iOSではデートピッカーを閉じた瞬間に `onchange` が発火して保存される
- **日付の正規化**：`normalizeDate(currentDate)` で必ず `YYYY-MM-DD` 形式にしてからinputにセット
  - スラッシュ区切り（`YYYY/MM/DD`）のままだとiOSのデートピッカーが空になる
- **Sheets同期**：POSTリクエスト（`no-cors`）はiOSで届かないことがあるため、GETリクエスト方式を採用
  - `?action=update_next&type=...&id=...&next=...` でGASに送信
  - GAS側の `doGet` に `update_next` アクションを実装（`getRecords` → `deleteRecord` → `addRecord`）

## 記録タイムライン（記録タブ）
- `renderTimeline()` で全種別を統一表示。`getAllRecords()` で全種別をまとめて日付降順ソート
- **旅行（trip）のみ** `.travel-card` スタイル（青グラデーションヘッダー）で差し込み表示
- 全種別に編集（鉛筆SVG）・削除（✕）ボタンあり

## カレンダー
- 旅行は `start〜end` の全日程にドットを表示（`renderCalendar` と `renderCalDayRecords` の両方で範囲判定）
- 詳細タップ時も旅行は `.travel-card` スタイルで表示

## 症状記録（symptom）
- 愛犬の様子がおかしいときに記録し、獣医への説明メモとして使う
- フィールド：日付・症状名（必須）・程度・部位・詳しい経過・現在の状態・受診予定日・メモ
- 「現在の状態」は様子見中 / 病院受診済 / 回復の3択。タイムラインでカラーバッジ表示
- 受診予定日（next）を入れると「もうすぐの予定」にリマインダー表示

## お薬記録（meds）― ワクチン・投薬の統合キー
- メニューの「ワクチン」「投薬」ボタンを「お薬」1枠に統合。新規記録はすべて `meds` キーに保存
- 既存の `vaccine` / `medicine` データはCAT_CFGに残してあり、タイムライン・リマインダーで引き続き表示される
- フォームで「種類」（ワクチン or 投薬）を選ぶと対応フィールドが表示切り替え
  - ワクチン：ワクチン種類セレクト + 病院名
  - 投薬：薬の名前 + 薬の種類セレクト + 投与量
- 次回予定日はワクチン選択で+1年、投薬選択で+1ヶ月を自動設定（`onMedsKindChange()` / `onMedsDateChange()`）
- medsフィールド：`{id, date, kind, vacType, hospital, name, medType, dose, next, memo}`

## アイコンとカラーの方針
- すべてのアイコンはSVG（絵文字は使わない）
- `cs(type, size)` 関数で種別アイコンSVGを生成
- カテゴリカラー：health=#e07b54（オレンジ）/ daily=#6ab89a（緑）/ travel=#5b9bd5（青）/ other=#9b8ed5（紫）/ symptom=#d95f75（ピンク）
- `other`（その他ケア）は `cat:'daily'` だがカラーは紫。`colorMap` や `bgMap` では `_type` で個別指定が必要
- `symptom` は `cat:'health'` だがカラーはピンク（#d95f75）。同様に `_type` で個別指定が必要

## 注意事項
- **このフォルダ（wan-care-deploy）が作業・デプロイ用**
- `Cowork_test/Wancare` はバックアップ専用フォルダ。編集しないこと
- GASのエンドポイントURLは `index.html` 内の `GAS_URL` 変数に記載
- APIキーや認証情報は含まれていないが、GAS_URLは公開しないよう注意
