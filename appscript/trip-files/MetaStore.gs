/**
 * Метаданные по tripId в Google Spreadsheet.
 * Колонки: tripId | equipmentList | filesJson | sheetLinksJson | updatedAt
 */

var META_SHEET_NAME = 'trips';

/**
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getMetaSheet_() {
  var c = getConfig();
  if (!c.metaSpreadsheetId) {
    throw new Error(
      'META_SPREADSHEET_ID не задан. Запустите setupTripFilesStorage() в редакторе.'
    );
  }
  var ss = SpreadsheetApp.openById(c.metaSpreadsheetId);
  var sh = ss.getSheetByName(META_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(META_SHEET_NAME);
    sh.getRange(1, 1, 1, 5).setValues([
      ['tripId', 'equipmentList', 'filesJson', 'sheetLinksJson', 'updatedAt']
    ]);
  }
  return sh;
}

/**
 * @param {string} tripId
 * @returns {{ row: number, equipmentList: string, files: Array, sheetLinks: Array.<string>, updatedAt: number }|null}
 */
function findTripRow_(tripId) {
  var sh = getMetaSheet_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  // A1: надёжнее, чем 4-arg getRange (numRows vs lastRow путаница)
  var values = sh.getRange('A2:E' + last).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === tripId) {
      var files = [];
      var links = [];
      try {
        files = JSON.parse(values[i][2] || '[]');
      } catch (e1) {
        files = [];
      }
      try {
        links = JSON.parse(values[i][3] || '[]');
      } catch (e2) {
        links = [];
      }
      return {
        row: i + 2,
        equipmentList: String(values[i][1] || ''),
        files: files,
        sheetLinks: links,
        updatedAt: Number(values[i][4]) || 0
      };
    }
  }
  return null;
}

/**
 * @param {string} tripId
 * @returns {{ tripId: string, equipmentList: string, files: Array, sheetLinks: Array.<string>, updatedAt: number }}
 */
function loadTripMeta(tripId) {
  var found = findTripRow_(tripId);
  if (!found) {
    return {
      tripId: tripId,
      equipmentList: '',
      files: [],
      sheetLinks: [],
      updatedAt: 0
    };
  }
  return {
    tripId: tripId,
    equipmentList: found.equipmentList,
    files: found.files,
    sheetLinks: found.sheetLinks,
    updatedAt: found.updatedAt
  };
}

/**
 * @param {string} tripId
 * @param {{ equipmentList: string, files: Array, sheetLinks: Array.<string> }} data
 */
function saveTripMeta(tripId, data) {
  var sh = getMetaSheet_();
  var now = Date.now();
  var rowData = [
    tripId,
    data.equipmentList || '',
    JSON.stringify(data.files || []),
    JSON.stringify(data.sheetLinks || []),
    now
  ];
  var found = findTripRow_(tripId);
  if (found) {
    sh.getRange(found.row, 1, 1, 5).setValues([rowData]);
  } else {
    sh.appendRow(rowData);
  }
  return now;
}
