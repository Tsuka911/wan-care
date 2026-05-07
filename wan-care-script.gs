// ============================================================
// わんケアアプリ - Google Apps Script バックエンド
// 使い方：スプレッドシートを開く → 拡張機能 → Apps Script
// このコードを貼り付けて「ウェブアプリとしてデプロイ」してください
// ============================================================

// 日付値を "yyyy-mm-dd" 文字列に統一（Date型・文字列どちらでも対応）
function toDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val);
  // すでに yyyy-mm-dd 形式ならそのまま返す
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

// 各シートの定義（シート名と列の対応）
const SHEET_MAP = {
  hospital: {
    name: '通院記録',
    headers: ['ID', '日付', '病院名', '受診内容', '診断・処置', '費用', '次回予定', 'メモ'],
    toRow: (r) => [r.id, r.date, r.name, r.reason, r.result, r.cost, r.next, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), name: row[2], reason: row[3], result: row[4], cost: row[5], next: toDateStr(row[6]), memo: row[7] })
  },
  vaccine: {
    name: 'ワクチン',
    headers: ['ID', '接種日', '種類', '次回予定', '病院名', 'メモ'],
    toRow: (r) => [r.id, r.date, r.type, r.next, r.hospital, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), type: row[2], next: toDateStr(row[3]), hospital: row[4], memo: row[5] })
  },
  medicine: {
    name: '投薬記録',
    headers: ['ID', '投薬日', '薬の名前', '種類', '投与量', '次回', 'メモ'],
    toRow: (r) => [r.id, r.date, r.name, r.type, r.dose, r.next, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), name: row[2], type: row[3], dose: row[4], next: toDateStr(row[5]), memo: row[6] })
  },
  weight: {
    name: '体重記録',
    headers: ['ID', '計測日', '体重(kg)', 'メモ'],
    toRow: (r) => [r.id, r.date, r.value, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), value: row[2], memo: row[3] })
  },
  walk: {
    name: '散歩記録',
    headers: ['ID', '日付', '時間(分)', '距離(km)', 'コース', '天気', 'メモ'],
    toRow: (r) => [r.id, r.date, r.time, r.dist, r.course, r.weather, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), time: row[2], dist: row[3], course: row[4], weather: row[5], memo: row[6] })
  },
  trim: {
    name: 'トリミング',
    headers: ['ID', '日付', 'サロン名', 'メニュー', '費用', '次回', 'メモ'],
    toRow: (r) => [r.id, r.date, r.salon, r.menu, r.cost, r.next, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), salon: row[2], menu: row[3], cost: row[4], next: toDateStr(row[5]), memo: row[6] })
  },
  filter: {
    name: 'フィルター交換',
    headers: ['ID', '交換日', '給水機', 'フィルター種類', '次回交換日', 'メモ'],
    toRow: (r) => [r.id, r.date, r.machine, r.filterType, r.next, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), machine: row[2], filterType: row[3], next: toDateStr(row[4]), memo: row[5] })
  },
  other: {
    name: 'その他ケア',
    headers: ['ID', '日付', '種類', 'メモ'],
    toRow: (r) => [r.id, r.date, r.type, r.memo],
    fromRow: (row) => ({ id: row[0], date: toDateStr(row[1]), type: row[2], memo: row[3] })
  },
  trip: {
    name: '旅行記録',
    headers: ['ID', '出発日', '帰宅日', '行き先', '旅行タイトル', '宿泊施設', '評価', 'メモ', '写真1', '写真2', '写真3'],
    toRow: (r) => [r.id, r.start, r.end, r.dest, r.title, r.hotel, r.hotelRating, r.memo, r.photo1, r.photo2, r.photo3],
    fromRow: (row) => ({ id: row[0], start: toDateStr(row[1]), end: toDateStr(row[2]), dest: row[3], title: row[4], hotel: row[5], hotelRating: row[6], memo: row[7], photo1: row[8], photo2: row[9], photo3: row[10], date: toDateStr(row[1]) })
  }
};

// シートを取得（なければ作成）
function getOrCreateSheet(type) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = SHEET_MAP[type];
  if (!config) return null;

  let sheet = ss.getSheetByName(config.name);
  if (!sheet) {
    sheet = ss.insertSheet(config.name);
    sheet.appendRow(config.headers);
    // ヘッダー行のスタイルを設定
    const headerRange = sheet.getRange(1, 1, 1, config.headers.length);
    headerRange.setBackground('#4a90d9');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 全レコードを取得
function getRecords(type) {
  const sheet = getOrCreateSheet(type);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // ヘッダーのみ

  const config = SHEET_MAP[type];
  return data.slice(1)
    .filter(row => row[0] !== '' && row[0] !== null) // IDが空の行をスキップ
    .map(row => config.fromRow(row));
}

// レコードを追加
function addRecord(type, record) {
  const sheet = getOrCreateSheet(type);
  if (!sheet) return false;

  const config = SHEET_MAP[type];
  sheet.appendRow(config.toRow(record));
  return true;
}

// レコードを削除（IDで検索して行ごと削除）
function deleteRecord(type, id) {
  const sheet = getOrCreateSheet(type);
  if (!sheet) return false;

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// ========== Web アプリのエントリポイント ==========

// GETリクエスト：全データを返す
function doGet(e) {
  try {
    const result = {};
    Object.keys(SHEET_MAP).forEach(type => {
      result[type] = getRecords(type);
    });

    // プロフィール情報を追加
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const profileSheet = ss.getSheetByName('プロフィール');
    if (profileSheet && profileSheet.getLastRow() > 1) {
      const row = profileSheet.getRange(2, 1, 1, 4).getValues()[0];
      result.profile = { name: row[0], breed: row[1], birth: toDateStr(row[2]), gender: row[3] };
    }

    const output = ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', data: result }))
      .setMimeType(ContentService.MimeType.JSON);
    return output;

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// POSTリクエスト：追加・削除
function doPost(e) {
  try {
    const action = e.parameter.action;
    const type   = e.parameter.type;

    if (action === 'add') {
      const record = JSON.parse(e.parameter.data);
      if (!record.id) record.id = Date.now();
      // 散歩記録は同日重複を防ぐ（ショートカットから1件ずつ送る場合も対応）
      if (type === 'walk') {
        const existing = getRecords('walk');
        const existingDates = new Set(existing.map(r => toDateStr(r.date)));
        if (existingDates.has(toDateStr(record.date))) {
          return ContentService
            .createTextOutput(JSON.stringify({ status: 'ok', action: 'add', skipped: true }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      addRecord(type, record);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', action: 'add' }))
        .setMimeType(ContentService.MimeType.JSON);

    } else if (action === 'delete') {
      const id = e.parameter.id;
      deleteRecord(type, id);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', action: 'delete' }))
        .setMimeType(ContentService.MimeType.JSON);

    } else if (action === 'batch_add') {
      // ショートカットからの一括取込（複数レコードをまとめて追加）
      const records = JSON.parse(e.parameter.records);
      let added = 0;
      let skipped = 0;

      // 重複チェック用：既存レコードの日付セットを取得
      const existing = getRecords(type);
      const existingDates = new Set(existing.map(r => toDateStr(r.date)));

      records.forEach(record => {
        const recDate = toDateStr(record.date);
        if (existingDates.has(recDate)) {
          skipped++; // 同日のデータは重複追加しない
        } else {
          addRecord(type, record);
          existingDates.add(recDate);
          added++;
        }
      });

      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', action: 'batch_add', added, skipped }))
        .setMimeType(ContentService.MimeType.JSON);

    } else if (action === 'save_profile') {
      // プロフィール情報を保存（常に1行だけ上書き）
      const profile = JSON.parse(e.parameter.data);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('プロフィール');
      if (!sheet) {
        sheet = ss.insertSheet('プロフィール');
        sheet.appendRow(['名前', '犬種', '生年月日', '性別']);
        const h = sheet.getRange(1, 1, 1, 4);
        h.setBackground('#4a90d9');
        h.setFontColor('#ffffff');
        h.setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
      // データ行をクリアして書き直す
      if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
      sheet.appendRow([profile.name || '', profile.breed || '', profile.birth || '', profile.gender || '']);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', action: 'save_profile' }))
        .setMimeType(ContentService.MimeType.JSON);

    } else {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: '不明なアクション: ' + action }))
        .setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ========== テスト用（スクリプトエディタから実行して動作確認) ==========
function testSetup() {
  Object.keys(SHEET_MAP).forEach(type => {
    getOrCreateSheet(type);
    Logger.log('✅ シート作成OK: ' + SHEET_MAP[type].name);
  });
  Logger.log('セットアップ完了！全シートが作成されました。');
}
