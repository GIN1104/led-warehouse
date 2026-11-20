/**
 * Meta в Spreadsheet: trips, people, hours, weekend, messages, trip_files.
 */

var SHEETS = {
  TRIPS: 'trips',
  PEOPLE: 'people',
  HOURS: 'hours',
  WEEKEND: 'weekend',
  MESSAGES: 'messages',
  FILES: 'trip_files'
};

function getMetaSs_() {
  ensureStorageReady_();
  return SpreadsheetApp.openById(getConfig().metaSpreadsheetId);
}

function ensureMetaSheets_(ss) {
  ensureSheet_(ss, SHEETS.TRIPS, [
    'id',
    'date',
    'time',
    'title',
    'place',
    'category',
    'schemes',
    'equipmentList',
    'sheetLinksJson',
    'assigneeEmails',
    'createdAt',
    'updatedAt'
  ]);
  ensureSheet_(ss, SHEETS.PEOPLE, ['email', 'name', 'telegramChatId', 'role', 'active']);
  ensureSheet_(ss, SHEETS.HOURS, ['id', 'email', 'date', 'hours', 'note', 'createdAt']);
  ensureSheet_(ss, SHEETS.WEEKEND, [
    'id',
    'email',
    'dateFrom',
    'dateTo',
    'status',
    'note',
    'createdAt'
  ]);
  ensureSheet_(ss, SHEETS.MESSAGES, ['id', 'text', 'createdAt', 'notifiedAt']);
  ensureSheet_(ss, SHEETS.FILES, [
    'tripId',
    'fileId',
    'name',
    'mimeType',
    'sizeBytes',
    'kind',
    'url',
    'createdAt',
    'notifiedAt'
  ]);
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function sheetRows_(name) {
  var sh = getMetaSs_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange('A2:' + columnLetter_(sh.getLastColumn()) + sh.getLastRow()).getValues();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return values
    .filter(function (row) {
      return String(row[0] || '').trim() !== '';
    })
    .map(function (row) {
      var obj = {};
      for (var i = 0; i < headers.length; i++) obj[headers[i]] = row[i];
      return obj;
    });
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function newId_(prefix) {
  return (
    prefix +
    '_' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 16)
  );
}

/** Spreadsheet часто отдаёт Date вместо 'YYYY-MM-DD'. */
function formatYmd_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    var y = v.getFullYear();
    var m = v.getMonth() + 1;
    var d = v.getDate();
    return (
      y +
      '-' +
      (m < 10 ? '0' : '') +
      m +
      '-' +
      (d < 10 ? '0' : '') +
      d
    );
  }
  var s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function parseYmdParts_(v) {
  var s = formatYmd_(v);
  var parts = s.split('-');
  if (parts.length < 2) return null;
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2] || 0) };
}

/** Sheets превращает '11:00' в Date (эпоха 1899). */
function formatHm_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    var h = v.getHours();
    var m = v.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  var s = String(v || '').trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    var hh = Number(m[1]);
    var mm = m[2];
    return (hh < 10 ? '0' : '') + hh + ':' + mm;
  }
  return s;
}

function seedDemoData_() {
  var ss = getMetaSs_();
  var people = ss.getSheetByName(SHEETS.PEOPLE);
  if (people.getLastRow() < 2) {
    people.appendRow([
      'starchenkogin@gmail.com',
      'Evgeny',
      '',
      'admin',
      true
    ]);
    people.appendRow([
      'ledvision2026.il@gmail.com',
      'Vision',
      '',
      'admin',
      true
    ]);
    people.appendRow(['crew1@example.com', 'Илья', '', 'worker', true]);
  }
  var trips = ss.getSheetByName(SHEETS.TRIPS);
  if (trips.getLastRow() < 2) {
    var now = Date.now();
    trips.appendRow([
      '6077020964374f30af488cf67d65f25e',
      '2026-11-17',
      '11:00',
      'Matnas Neve yosef',
      'Matnas Neve yosef',
      'screen',
      'ready',
      '',
      '[]',
      'starchenkogin@gmail.com',
      now,
      now
    ]);
    trips.appendRow([
      newId_('trip'),
      '2026-11-26',
      '05:00',
      'Terminal petah tikva',
      'Terminal petah tikva',
      'screen',
      'none',
      '',
      '[]',
      'crew1@example.com',
      now,
      now
    ]);
  }
}

function listTrips(month, year) {
  ensureStorageReady_();
  month = Number(month) || new Date().getMonth() + 1;
  year = Number(year) || new Date().getFullYear();
  var rows = sheetRows_(SHEETS.TRIPS);
  return rows
    .filter(function (t) {
      var parts = parseYmdParts_(t.date);
      return parts && parts.year === year && parts.month === month;
    })
    .map(normalizeTrip_)
    .sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time));
    });
}

function normalizeTrip_(t) {
  var links = [];
  try {
    links = JSON.parse(t.sheetLinksJson || '[]');
  } catch (e) {
    links = [];
  }
  return {
    id: String(t.id),
    date: formatYmd_(t.date),
    time: formatHm_(t.time),
    title: String(t.title || ''),
    place: String(t.place || ''),
    category: String(t.category || 'screen'),
    schemes: String(t.schemes || 'none'),
    equipmentList: String(t.equipmentList || ''),
    sheetLinks: links,
    assigneeEmails: String(t.assigneeEmails || ''),
    createdAt: Number(t.createdAt) || 0,
    updatedAt: Number(t.updatedAt) || 0
  };
}

function getTrip(tripId) {
  ensureStorageReady_();
  tripId = String(tripId || '').trim();
  var rows = sheetRows_(SHEETS.TRIPS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === tripId) return normalizeTrip_(rows[i]);
  }
  return null;
}

function createTrip(input) {
  ensureStorageReady_();
  input = input || {};
  var id = newId_('trip');
  var now = Date.now();
  var sh = getMetaSs_().getSheetByName(SHEETS.TRIPS);
  sh.appendRow([
    id,
    String(input.date || ''),
    String(input.time || ''),
    String(input.title || input.place || ''),
    String(input.place || ''),
    String(input.category || 'screen'),
    String(input.schemes || 'none'),
    String(input.equipmentList || ''),
    JSON.stringify(input.sheetLinks || []),
    String(input.assigneeEmails || ''),
    now,
    now
  ]);
  var trip = getTrip(id);
  notifyTripCreatedStub_(trip);
  return trip;
}

function updateTripMeta(tripId, patch) {
  ensureStorageReady_();
  var sh = getMetaSs_().getSheetByName(SHEETS.TRIPS);
  var last = sh.getLastRow();
  if (last < 2) throw new Error('trip not found');
  var values = sh.getRange('A2:L' + last).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) !== tripId) continue;
    var row = i + 2;
    if (patch.equipmentList != null) sh.getRange(row, 8).setValue(patch.equipmentList);
    if (patch.sheetLinks != null) {
      sh.getRange(row, 9).setValue(JSON.stringify(patch.sheetLinks));
    }
    if (patch.schemes != null) sh.getRange(row, 7).setValue(patch.schemes);
    sh.getRange(row, 12).setValue(Date.now());
    return getTrip(tripId);
  }
  throw new Error('trip not found: ' + tripId);
}

function listPeople() {
  ensureStorageReady_();
  return sheetRows_(SHEETS.PEOPLE).map(function (p) {
    return {
      email: String(p.email || ''),
      name: String(p.name || ''),
      telegramChatId: String(p.telegramChatId || ''),
      role: String(p.role || 'worker'),
      active: p.active !== false && String(p.active) !== 'false'
    };
  });
}

function listHours(month, year) {
  ensureStorageReady_();
  month = Number(month) || new Date().getMonth() + 1;
  year = Number(year) || new Date().getFullYear();
  return sheetRows_(SHEETS.HOURS)
    .filter(function (h) {
      var parts = parseYmdParts_(h.date);
      return parts && parts.year === year && parts.month === month;
    })
    .map(function (h) {
      return {
        id: String(h.id),
        email: String(h.email || ''),
        date: formatYmd_(h.date),
        hours: Number(h.hours) || 0,
        note: String(h.note || '')
      };
    });
}

function addHours(input) {
  ensureStorageReady_();
  var id = newId_('hrs');
  getMetaSs_()
    .getSheetByName(SHEETS.HOURS)
    .appendRow([
      id,
      String(input.email || ''),
      String(input.date || ''),
      Number(input.hours) || 0,
      String(input.note || ''),
      Date.now()
    ]);
  return { id: id };
}

function listWeekendRequests() {
  ensureStorageReady_();
  return sheetRows_(SHEETS.WEEKEND).map(function (r) {
    return {
      id: String(r.id),
      email: String(r.email || ''),
      dateFrom: String(r.dateFrom || ''),
      dateTo: String(r.dateTo || ''),
      status: String(r.status || 'pending'),
      note: String(r.note || '')
    };
  });
}

function createWeekendRequest(input) {
  ensureStorageReady_();
  var id = newId_('wk');
  getMetaSs_()
    .getSheetByName(SHEETS.WEEKEND)
    .appendRow([
      id,
      String(input.email || ''),
      String(input.dateFrom || ''),
      String(input.dateTo || ''),
      'pending',
      String(input.note || ''),
      Date.now()
    ]);
  return { id: id, status: 'pending' };
}

function sendTeamMessage(text) {
  ensureStorageReady_();
  text = String(text || '').trim();
  if (!text) throw new Error('Пустое сообщение');
  var id = newId_('msg');
  var now = Date.now();
  getMetaSs_().getSheetByName(SHEETS.MESSAGES).appendRow([id, text, now, now]);
  notifyTeamBroadcastStub_(text);
  return { id: id, notified: true, stub: !getConfig().telegramBotToken };
}

function listTripFilesMeta(tripId) {
  ensureStorageReady_();
  return sheetRows_(SHEETS.FILES)
    .filter(function (f) {
      return String(f.tripId) === String(tripId);
    })
    .map(function (f) {
      return {
        id: String(f.fileId),
        name: String(f.name || ''),
        mimeType: String(f.mimeType || ''),
        sizeBytes: Number(f.sizeBytes) || 0,
        kind: String(f.kind || 'other'),
        url: String(f.url || ''),
        createdAt: Number(f.createdAt) || 0,
        notifiedAt: f.notifiedAt ? Number(f.notifiedAt) : null
      };
    });
}

function appendTripFileMeta(tripId, fileMeta) {
  getMetaSs_()
    .getSheetByName(SHEETS.FILES)
    .appendRow([
      tripId,
      fileMeta.id,
      fileMeta.name,
      fileMeta.mimeType,
      fileMeta.sizeBytes,
      fileMeta.kind,
      fileMeta.url,
      fileMeta.createdAt,
      fileMeta.notifiedAt || ''
    ]);
}

function markFileNotified_(tripId, fileId, when) {
  var sh = getMetaSs_().getSheetByName(SHEETS.FILES);
  var last = sh.getLastRow();
  if (last < 2) return;
  var values = sh.getRange('A2:I' + last).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === tripId && String(values[i][1]) === fileId) {
      sh.getRange(i + 2, 9).setValue(when);
      return;
    }
  }
}

function removeTripFileMeta(tripId, fileId) {
  var sh = getMetaSs_().getSheetByName(SHEETS.FILES);
  var last = sh.getLastRow();
  if (last < 2) return;
  var values = sh.getRange('A2:B' + last).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === tripId && String(values[i][1]) === fileId) {
      sh.deleteRow(i + 2);
    }
  }
}
