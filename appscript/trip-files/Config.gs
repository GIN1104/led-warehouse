/**
 * Конфиг и лимиты standalone Files (peer view=files).
 * Секреты / ID — только Script Properties (не в git, не в чат).
 */

var LIMITS = {
  MAX_FILES: 10,
  MAX_BYTES_EACH: 8 * 1024 * 1024,
  MAX_BYTES_BATCH: 10 * 1024 * 1024,
  MAX_SHEET_LINKS: 10
};

/** Ключи Script Properties. */
var PROP = {
  DRIVE_ROOT_FOLDER_ID: 'DRIVE_ROOT_FOLDER_ID',
  META_SPREADSHEET_ID: 'META_SPREADSHEET_ID',
  /** Опционально: POST JSON на LED Warehouse API после saveAndSend. */
  WEBHOOK_CALLBACK_URL: 'WEBHOOK_CALLBACK_URL',
  /** Опционально: shared secret в заголовке X-Trip-Files-Secret. */
  WEBHOOK_SECRET: 'WEBHOOK_SECRET',
  /**
   * База deep-link склада, напр. https://gin1104.github.io/led-warehouse
   * Back → {base}/files/?orderId={tripId}
   */
  WAREHOUSE_BASE_URL: 'WAREHOUSE_BASE_URL',
  /** Имя корня Drive, если DRIVE_ROOT_FOLDER_ID ещё не задан (создаётся при setup). */
  DRIVE_ROOT_FOLDER_NAME: 'DRIVE_ROOT_FOLDER_NAME'
};

var DEFAULT_DRIVE_ROOT_NAME = 'LED Trip Files (ledvision2026)';

function getProps_() {
  return PropertiesService.getScriptProperties();
}

/**
 * @returns {{
 *   driveRootFolderId: string,
 *   metaSpreadsheetId: string,
 *   webhookCallbackUrl: string,
 *   webhookSecret: string,
 *   warehouseBaseUrl: string,
 *   driveRootFolderName: string
 * }}
 */
function getConfig() {
  var p = getProps_();
  return {
    driveRootFolderId: String(p.getProperty(PROP.DRIVE_ROOT_FOLDER_ID) || ''),
    metaSpreadsheetId: String(p.getProperty(PROP.META_SPREADSHEET_ID) || ''),
    webhookCallbackUrl: String(p.getProperty(PROP.WEBHOOK_CALLBACK_URL) || ''),
    webhookSecret: String(p.getProperty(PROP.WEBHOOK_SECRET) || ''),
    warehouseBaseUrl: String(p.getProperty(PROP.WAREHOUSE_BASE_URL) || ''),
    driveRootFolderName: String(
      p.getProperty(PROP.DRIVE_ROOT_FOLDER_NAME) || DEFAULT_DRIVE_ROOT_NAME
    )
  };
}

/**
 * Публичный снимок для UI (без секретов).
 * @returns {Object}
 */
function getPublicConfig() {
  var c = getConfig();
  return {
    limits: LIMITS,
    hasDriveRoot: Boolean(c.driveRootFolderId),
    hasMetaSheet: Boolean(c.metaSpreadsheetId),
    hasWebhook: Boolean(c.webhookCallbackUrl),
    warehouseBaseUrl: c.warehouseBaseUrl,
    /** Контракт: tripId в GAS == orderId в складе. */
    deepLinkContract: {
      tripParam: 'trip',
      viewParam: 'view',
      viewValue: 'files',
      warehouseOrderParam: 'orderId',
      note: 'tripId ↔ orderId (один и тот же string id)'
    }
  };
}

/**
 * Одноразовая инициализация: папка Drive + таблица meta.
 * Запускать из редактора: Run → setupTripFilesStorage.
 * Затем Share папку аккаунту ledvision2026 (Editor).
 */
function setupTripFilesStorage() {
  var p = getProps_();
  var c = getConfig();
  var rootId = c.driveRootFolderId;
  if (!rootId) {
    var folder = DriveApp.createFolder(c.driveRootFolderName);
    rootId = folder.getId();
    p.setProperty(PROP.DRIVE_ROOT_FOLDER_ID, rootId);
  }
  var sheetId = c.metaSpreadsheetId;
  if (!sheetId) {
    var ss = SpreadsheetApp.create('LED Trip Files Meta');
    sheetId = ss.getId();
    p.setProperty(PROP.META_SPREADSHEET_ID, sheetId);
    var sh = ss.getSheets()[0];
    sh.setName('trips');
    sh.getRange(1, 1, 1, 5).setValues([
      ['tripId', 'equipmentList', 'filesJson', 'sheetLinksJson', 'updatedAt']
    ]);
    // Переместить таблицу в корневую папку Files
    var root = DriveApp.getFolderById(rootId);
    var file = DriveApp.getFileById(sheetId);
    root.addFile(file);
    try {
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {
      // ignore: файл мог уже быть не в My Drive root
    }
  }
  return {
    driveRootFolderId: rootId,
    metaSpreadsheetId: sheetId,
    driveUrl: 'https://drive.google.com/drive/folders/' + rootId,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit',
    shareHint:
      'Откройте папку → Поделиться → добавьте ledvision2026 (или ledvision2026.il@gmail.com) как Редактор'
  };
}
