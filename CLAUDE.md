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
| vaccine | ワクチン | next（次回予定） | +1年 |
| medicine | 投薬記録 | next（次回） | +1ヶ月 |
| trim | トリミング | next（次回） | +1ヶ月 |
| filter | フィルター交換 | next（次回交換日） | +1ヶ月 |
| weight | 体重記録 | なし | — |
| walk | 散歩記録 | なし | — |
| other | その他ケア | なし | — |
| trip | 旅行記録 | なし | — |

## ホーム画面「もうすぐの予定」
- `REMIND_CHECKS` 配列で対象種別を定義（hospital / vaccine / medicine / trim / filter）
- `getUpcomingReminders(30)` で30日以内の next 日付を持つレコードを抽出
- `renderUpcoming()` で表示。各カードに2つのSVGアイコンボタンあり：
  - カレンダー＋ペンアイコン → `editNextDate()` で日付をインライン編集
  - チェックマークアイコン → `markDone()` で next をクリア（実施済み扱い）

## 編集機能の対応状況
- **walk（散歩）のみ** フル編集対応（`editRecord()` + Google Sheets同期）
- **nextフィールドの日付変更** は全種別で対応（`editNextDate()` / `confirmNextDate()`）
- その他の種別はレコードの追加・削除のみ（編集不可）

## Google Sheets同期
- `syncToSheets(key, data, 'add'|'delete')` でPOST
- walk だけ GET/POST の特殊処理あり（`action=add_walk` / `action=delete_walk`）
- `mode: 'no-cors'` を使用しているためレスポンスは確認できない

## 注意事項
- **このフォルダ（wan-care-deploy）が作業・デプロイ用**
- `Cowork_test/Wancare` はバックアップ専用フォルダ。編集しないこと
- GASのエンドポイントURLは `index.html` 内の `GAS_URL` 変数に記載
- APIキーや認証情報は含まれていないが、GAS_URLは公開しないよう注意
