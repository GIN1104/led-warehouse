/**
 * Standalone Files Web App (peer view=files).
 * URL: …/exec?trip=<tripId>&view=files
 *
 * tripId ↔ orderId склада (deep-link контракт).
 */

/**
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  e = e || { parameter: {} };
  var params = e.parameter || {};
  var tripId = String(params.trip || params.orderId || '').trim();
  var view = String(params.view || 'files').trim().toLowerCase();

  if (!tripId) {
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">' +
        '<h1>Нужен параметр trip</h1>' +
        '<p>Откройте <code>?trip=&lt;id&gt;&amp;view=files</code></p>' +
        '</body></html>'
    ).setTitle('Files · LED');
  }

  if (view && view !== 'files') {
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">' +
        '<h1>Неизвестный view</h1>' +
        '<p>Поддерживается только <code>view=files</code>.</p>' +
        '</body></html>'
    ).setTitle('Files · LED');
  }

  var template = HtmlService.createTemplateFromFile('Index');
  template.tripId = tripId;
  template.view = 'files';
  return template
    .evaluate()
    .setTitle('Файлы и ссылки · LED')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Подключение частичных HTML (если понадобятся).
 * @param {string} filename
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Бандл для UI.
 * @param {string} tripId
 * @returns {Object}
 */
function getTripFilesBundle(tripId) {
  tripId = String(tripId || '').trim();
  if (!tripId) throw new Error('tripId обязателен');
  var meta = loadTripMeta(tripId);
  return {
    tripId: tripId,
    orderId: tripId,
    equipmentList: meta.equipmentList,
    files: meta.files || [],
    sheetLinks: meta.sheetLinks || [],
    updatedAt: meta.updatedAt,
    config: getPublicConfig(),
    warehouseBackUrl: warehouseFilesDeepLink(tripId)
  };
}

/**
 * Парсинг ссылок Sheets (одна на строку).
 * @param {string} text
 * @returns {string[]}
 */
function parseSheetLinks_(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);
}

/**
 * @param {string[]} links
 */
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

/**
 * @param {number} existingCount
 * @param {Array.<{name:string,size:number}>} newFiles
 */
function validateNewFiles_(existingCount, newFiles) {
  if (existingCount + newFiles.length > LIMITS.MAX_FILES) {
    throw new Error('Не больше ' + LIMITS.MAX_FILES + ' файлов на работу');
  }
  var batch = 0;
  for (var i = 0; i < newFiles.length; i++) {
    var f = newFiles[i];
    var size = Number(f.size) || 0;
    if (size > LIMITS.MAX_BYTES_EACH) {
      throw new Error('Файл «' + f.name + '» больше 8 МБ');
    }
    batch += size;
  }
  if (batch > LIMITS.MAX_BYTES_BATCH) {
    throw new Error('Новые файлы вместе больше 10 МБ');
  }
}

/**
 * Сохранить + отправить (notify только новые файлы/ссылки).
 *
 * @param {string} tripId
 * @param {{
 *   equipmentList: string,
 *   sheetLinksText: string,
 *   newFiles?: Array.<{name:string,mimeType:string,dataBase64:string,size:number}>,
 *   removeFileIds?: string[],
 *   notifyStaff?: boolean
 * }} input
 * @returns {Object}
 */
function saveAndSendTripFiles(tripId, input) {
  tripId = String(tripId || '').trim();
  if (!tripId) throw new Error('tripId обязателен');
  input = input || {};

  var current = loadTripMeta(tripId);
  var sheetLinks = parseSheetLinks_(input.sheetLinksText);
  validateSheetLinks_(sheetLinks);

  var remove = {};
  var removeIds = input.removeFileIds || [];
  for (var r = 0; r < removeIds.length; r++) {
    remove[removeIds[r]] = true;
  }

  var kept = [];
  for (var i = 0; i < (current.files || []).length; i++) {
    var file = current.files[i];
    if (remove[file.id]) {
      trashTripFile(file.id);
    } else {
      kept.push(file);
    }
  }

  var incoming = input.newFiles || [];
  validateNewFiles_(kept.length, incoming);

  var added = [];
  for (var n = 0; n < incoming.length; n++) {
    added.push(uploadTripFile(tripId, incoming[n]));
  }

  var prevLinks = {};
  for (var p = 0; p < (current.sheetLinks || []).length; p++) {
    prevLinks[current.sheetLinks[p]] = true;
  }
  var nextLinks = {};
  for (var q = 0; q < sheetLinks.length; q++) {
    nextLinks[sheetLinks[q]] = true;
  }

  var addedOrReplacedLinks = [];
  for (var s = 0; s < sheetLinks.length; s++) {
    if (!prevLinks[sheetLinks[s]]) addedOrReplacedLinks.push(sheetLinks[s]);
  }
  var removedLinkSilent = false;
  for (var key in prevLinks) {
    if (prevLinks.hasOwnProperty(key) && !nextLinks[key]) {
      removedLinkSilent = true;
      break;
    }
  }

  var notify = input.notifyStaff !== false;
  var notifiedFileIds = [];
  var notifiedLinks = [];
  var now = Date.now();

  var files = kept.concat(added).map(function (f) {
    var copy = {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      kind: f.kind,
      url: f.url || null,
      createdAt: f.createdAt || now,
      notifiedAt: f.notifiedAt || null
    };
    if (notify && !copy.notifiedAt) {
      notifiedFileIds.push(copy.id);
      copy.notifiedAt = now;
    }
    return copy;
  });

  if (notify) {
    notifiedLinks = addedOrReplacedLinks.slice();
  }

  var updatedAt = saveTripMeta(tripId, {
    equipmentList: String(input.equipmentList || ''),
    files: files,
    sheetLinks: sheetLinks
  });

  notifyStaffStub_(tripId, notifiedFileIds, notifiedLinks);

  var webhook = notifyWarehouseWebhook({
    event: 'trip-files.saveAndSend',
    tripId: tripId,
    orderId: tripId,
    equipmentList: String(input.equipmentList || ''),
    files: files,
    sheetLinks: sheetLinks,
    notifiedFileIds: notifiedFileIds,
    notifiedLinks: notifiedLinks,
    removedLinkSilent: removedLinkSilent,
    updatedAt: updatedAt
  });

  return {
    bundle: {
      tripId: tripId,
      orderId: tripId,
      equipmentList: String(input.equipmentList || ''),
      files: files,
      sheetLinks: sheetLinks,
      updatedAt: updatedAt
    },
    notifiedFileIds: notifiedFileIds,
    notifiedLinks: notifiedLinks,
    removedLinkSilent: removedLinkSilent,
    webhook: webhook,
    warehouseBackUrl: warehouseFilesDeepLink(tripId)
  };
}
