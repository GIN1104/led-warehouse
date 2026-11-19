/**
 * Выезды · LED команда — полный клон peer Apps Script.
 * URL: …/exec  |  …/exec?trip=<id>&view=files
 */

function doGet(e) {
  e = e || { parameter: {} };
  var params = e.parameter || {};
  var template = HtmlService.createTemplateFromFile('Index');
  template.initialTripId = String(params.trip || params.orderId || '').trim();
  template.initialView = String(params.view || '').trim().toLowerCase();
  return template
    .evaluate()
    .setTitle('Выезды · LED команда')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Bootstrap для SPA. */
function getAppBootstrap(tripId, view) {
  ensureStorageReady_();
  var now = new Date();
  var month = now.getMonth() + 1;
  var year = now.getFullYear();
  var trip = tripId ? getTrip(tripId) : null;
  var files = tripId ? listTripFilesMeta(tripId) : [];
  return {
    config: getPublicConfig(),
    people: listPeople(),
    trips: listTrips(month, year),
    hours: listHours(month, year),
    weekend: listWeekendRequests(),
    month: month,
    year: year,
    trip: trip,
    files: files,
    tripId: tripId || '',
    view: view || '',
    warehouseBackUrl: warehouseFilesDeepLink_(tripId || '')
  };
}

function warehouseFilesDeepLink_(tripId) {
  var base = getConfig().warehouseBaseUrl.replace(/\/$/, '');
  if (!base || !tripId) return '';
  return base + '/files/?orderId=' + encodeURIComponent(tripId);
}

function apiListTrips(month, year) {
  return { trips: listTrips(month, year), month: Number(month), year: Number(year) };
}

function apiGetTrip(tripId) {
  var trip = getTrip(tripId);
  if (!trip) throw new Error('Выезд не найден');
  return {
    trip: trip,
    files: listTripFilesMeta(tripId),
    warehouseBackUrl: warehouseFilesDeepLink_(tripId)
  };
}

function apiCreateTrip(input) {
  return { trip: createTrip(input) };
}

function apiListHours(month, year) {
  return { hours: listHours(month, year) };
}

function apiAddHours(input) {
  return addHours(input);
}

function apiListWeekend() {
  return { weekend: listWeekendRequests() };
}

function apiCreateWeekend(input) {
  return createWeekendRequest(input);
}

function apiSendTeamMessage(text) {
  return sendTeamMessage(text);
}

function apiBuildMonthPdf(month, year) {
  return buildMonthPdfStub(month, year);
}

function parseSheetLinks_(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
}

function validateSheetLinks_(links) {
  if (links.length > LIMITS.MAX_SHEET_LINKS) {
    throw new Error('Не больше ' + LIMITS.MAX_SHEET_LINKS + ' ссылок');
  }
  for (var i = 0; i < links.length; i++) {
    if (!/^https?:\/\//i.test(links[i])) {
      throw new Error('Ссылка должна начинаться с http(s): ' + links[i]);
    }
  }
}

function validateNewFiles_(existingCount, newFiles) {
  if (existingCount + newFiles.length > LIMITS.MAX_FILES) {
    throw new Error('Не больше ' + LIMITS.MAX_FILES + ' файлов на работу');
  }
  var batch = 0;
  for (var i = 0; i < newFiles.length; i++) {
    var size = Number(newFiles[i].size) || 0;
    if (size > LIMITS.MAX_BYTES_EACH) {
      throw new Error('Файл «' + newFiles[i].name + '» больше 8 МБ');
    }
    batch += size;
  }
  if (batch > LIMITS.MAX_BYTES_BATCH) {
    throw new Error('Новые файлы вместе больше 10 МБ');
  }
}

/**
 * Save&Send files (peer view=files).
 */
function saveAndSendTripFiles(tripId, input) {
  tripId = String(tripId || '').trim();
  if (!tripId) throw new Error('tripId обязателен');
  if (!getTrip(tripId)) throw new Error('Выезд не найден');
  input = input || {};

  var currentFiles = listTripFilesMeta(tripId);
  var sheetLinks = parseSheetLinks_(input.sheetLinksText);
  validateSheetLinks_(sheetLinks);

  var remove = {};
  (input.removeFileIds || []).forEach(function (id) {
    remove[id] = true;
  });

  var kept = [];
  currentFiles.forEach(function (f) {
    if (remove[f.id]) {
      trashTripFile(f.id);
      removeTripFileMeta(tripId, f.id);
    } else {
      kept.push(f);
    }
  });

  var incoming = input.newFiles || [];
  validateNewFiles_(kept.length, incoming);
  var added = [];
  for (var i = 0; i < incoming.length; i++) {
    added.push(uploadTripFile(tripId, incoming[i]));
  }

  var prevLinks = {};
  var trip = getTrip(tripId);
  (trip.sheetLinks || []).forEach(function (l) {
    prevLinks[l] = true;
  });
  var addedLinks = sheetLinks.filter(function (l) {
    return !prevLinks[l];
  });

  updateTripMeta(tripId, {
    equipmentList: String(input.equipmentList || ''),
    sheetLinks: sheetLinks,
    schemes: sheetLinks.length || kept.length + added.length ? 'ready' : trip.schemes
  });

  var notify = input.notifyStaff !== false;
  var notifiedFileIds = [];
  var now = Date.now();
  var files = kept.concat(added).map(function (f) {
    if (notify && !f.notifiedAt) {
      notifiedFileIds.push(f.id);
      markFileNotified_(tripId, f.id, now);
      f.notifiedAt = now;
    }
    return f;
  });

  if (notify) {
    notifyNewFilesStub_(tripId, notifiedFileIds, addedLinks);
  }

  var webhook = notifyWarehouseWebhook({
    event: 'trip-files.saveAndSend',
    tripId: tripId,
    equipmentList: String(input.equipmentList || ''),
    files: files,
    sheetLinks: sheetLinks,
    notifiedFileIds: notifiedFileIds,
    notifiedLinks: addedLinks,
    updatedAt: Date.now()
  });

  return {
    bundle: {
      tripId: tripId,
      orderId: tripId,
      equipmentList: String(input.equipmentList || ''),
      files: files,
      sheetLinks: sheetLinks
    },
    notifiedFileIds: notifiedFileIds,
    notifiedLinks: addedLinks,
    webhook: webhook,
    trip: getTrip(tripId)
  };
}

/** One-shot: выдать editor starchenkogin (обход Drive unable-to-open при authuser). */
function shareWithEvgenyOnce() {
  var file = DriveApp.getFileById(ScriptApp.getScriptId());
  file.addEditor('starchenkogin@gmail.com');
  return {
    id: file.getId(),
    editors: file.getEditors().map(function (u) { return u.getEmail(); })
  };
}
