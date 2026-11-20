/**
 * Конфиг «Выезды · LED команда» (клон peer).
 * Секреты — только Script Properties.
 */

var LIMITS = {
  MAX_FILES: 10,
  MAX_BYTES_EACH: 8 * 1024 * 1024,
  MAX_BYTES_BATCH: 10 * 1024 * 1024,
  MAX_SHEET_LINKS: 10
};

var PROP = {
  DRIVE_ROOT_FOLDER_ID: 'DRIVE_ROOT_FOLDER_ID',
  META_SPREADSHEET_ID: 'META_SPREADSHEET_ID',
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  TELEGRAM_ADMIN_CHAT_IDS: 'TELEGRAM_ADMIN_CHAT_IDS',
  WEBHOOK_CALLBACK_URL: 'WEBHOOK_CALLBACK_URL',
  WEBHOOK_SECRET: 'WEBHOOK_SECRET',
  WAREHOUSE_BASE_URL: 'WAREHOUSE_BASE_URL',
  DRIVE_ROOT_FOLDER_NAME: 'DRIVE_ROOT_FOLDER_NAME',
  ADMIN_EMAILS: 'ADMIN_EMAILS'
};

var DEFAULT_DRIVE_ROOT_NAME = 'LED Trips (ledvision2026)';
var DEFAULT_ADMINS = 'starchenkogin@gmail.com,ledvision2026.il@gmail.com';

function getProps_() {
  return PropertiesService.getScriptProperties();
}

function getConfig() {
  var p = getProps_();
  return {
    driveRootFolderId: String(p.getProperty(PROP.DRIVE_ROOT_FOLDER_ID) || ''),
    metaSpreadsheetId: String(p.getProperty(PROP.META_SPREADSHEET_ID) || ''),
    telegramBotToken: String(p.getProperty(PROP.TELEGRAM_BOT_TOKEN) || ''),
    telegramAdminChatIds: String(p.getProperty(PROP.TELEGRAM_ADMIN_CHAT_IDS) || ''),
    webhookCallbackUrl: String(p.getProperty(PROP.WEBHOOK_CALLBACK_URL) || ''),
    webhookSecret: String(p.getProperty(PROP.WEBHOOK_SECRET) || ''),
    warehouseBaseUrl: String(p.getProperty(PROP.WAREHOUSE_BASE_URL) || ''),
    driveRootFolderName: String(
      p.getProperty(PROP.DRIVE_ROOT_FOLDER_NAME) || DEFAULT_DRIVE_ROOT_NAME
    ),
    adminEmails: String(p.getProperty(PROP.ADMIN_EMAILS) || DEFAULT_ADMINS)
  };
}

function getPublicConfig() {
  var c = getConfig();
  return {
    limits: LIMITS,
    hasDriveRoot: Boolean(c.driveRootFolderId),
    hasMetaSheet: Boolean(c.metaSpreadsheetId),
    hasTelegram: Boolean(c.telegramBotToken),
    hasWebhook: Boolean(c.webhookCallbackUrl),
    warehouseBaseUrl: c.warehouseBaseUrl,
    deepLinkContract: {
      tripParam: 'trip',
      viewParam: 'view',
      warehouseOrderParam: 'orderId',
      note: 'tripId ↔ orderId'
    }
  };
}

/** Одноразово: Drive + Spreadsheet meta + seed. */
function setupLedTripsStorage() {
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
    var ss = SpreadsheetApp.create('LED Trips Meta');
    sheetId = ss.getId();
    p.setProperty(PROP.META_SPREADSHEET_ID, sheetId);
    ensureMetaSheets_(ss);
    var root = DriveApp.getFolderById(rootId);
    var file = DriveApp.getFileById(sheetId);
    root.addFile(file);
    try {
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {}
    seedDemoData_();
  } else {
    ensureMetaSheets_(SpreadsheetApp.openById(sheetId));
  }
  if (!p.getProperty(PROP.ADMIN_EMAILS)) {
    p.setProperty(PROP.ADMIN_EMAILS, DEFAULT_ADMINS);
  }
  return {
    driveRootFolderId: rootId,
    metaSpreadsheetId: sheetId,
    driveUrl: 'https://drive.google.com/drive/folders/' + rootId,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit'
  };
}

function ensureStorageReady_() {
  var c = getConfig();
  if (!c.driveRootFolderId || !c.metaSpreadsheetId) {
    setupLedTripsStorage();
  }
}
