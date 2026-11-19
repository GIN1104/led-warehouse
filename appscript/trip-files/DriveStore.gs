/**
 * Файлы trip в Google Drive: {root}/trips/{tripId}/…
 * Аккаунт деплоя должен иметь доступ; папку шарить с ledvision2026.
 */

/**
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getRootFolder_() {
  var c = getConfig();
  if (!c.driveRootFolderId) {
    throw new Error(
      'DRIVE_ROOT_FOLDER_ID не задан. Запустите setupTripFilesStorage() в редакторе.'
    );
  }
  return DriveApp.getFolderById(c.driveRootFolderId);
}

/**
 * @param {GoogleAppsScript.Drive.Folder} parent
 * @param {string} name
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

/**
 * @param {string} tripId
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getTripFolder_(tripId) {
  var root = getRootFolder_();
  var trips = getOrCreateSubfolder_(root, 'trips');
  return getOrCreateSubfolder_(trips, tripId);
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @returns {string} image|pdf|sheet|other
 */
function inferFileKind_(name, mimeType) {
  var lower = String(name || '').toLowerCase();
  var mime = String(mimeType || '');
  if (mime.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp)$/.test(lower)) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/.test(lower)) return 'pdf';
  if (mime.indexOf('sheet') >= 0 || /\.(xlsx?|csv)$/.test(lower)) return 'sheet';
  return 'other';
}

/**
 * @param {string} tripId
 * @param {{ name: string, mimeType: string, dataBase64: string, size: number }} filePayload
 * @returns {{ id: string, name: string, mimeType: string, sizeBytes: number, kind: string, url: string, createdAt: number, notifiedAt: (number|null) }}
 */
function uploadTripFile(tripId, filePayload) {
  var name = filePayload.name || 'file';
  var mime = filePayload.mimeType || 'application/octet-stream';
  var size = Number(filePayload.size) || 0;
  var bytes = Utilities.base64Decode(filePayload.dataBase64);
  var blob = Utilities.newBlob(bytes, mime, name);
  var folder = getTripFolder_(tripId);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var now = Date.now();
  return {
    id: file.getId(),
    name: file.getName(),
    mimeType: mime,
    sizeBytes: size || bytes.length,
    kind: inferFileKind_(name, mime),
    url: file.getUrl(),
    createdAt: now,
    notifiedAt: null
  };
}

/**
 * @param {string} fileId
 */
function trashTripFile(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // файл уже удалён — ок
  }
}
