/**
 * Файлы trip: {root}/trips/{tripId}/…
 */

function getRootFolder_() {
  ensureStorageReady_();
  var id = getConfig().driveRootFolderId;
  if (!id) throw new Error('DRIVE_ROOT_FOLDER_ID не задан');
  return DriveApp.getFolderById(id);
}

function getOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getTripFolder_(tripId) {
  var root = getRootFolder_();
  var trips = getOrCreateSubfolder_(root, 'trips');
  return getOrCreateSubfolder_(trips, tripId);
}

function inferFileKind_(name, mimeType) {
  var lower = String(name || '').toLowerCase();
  var mime = String(mimeType || '');
  if (mime.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp)$/.test(lower)) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/.test(lower)) return 'pdf';
  if (mime.indexOf('sheet') >= 0 || /\.(xlsx?|csv)$/.test(lower)) return 'sheet';
  return 'other';
}

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
  var meta = {
    id: file.getId(),
    name: file.getName(),
    mimeType: mime,
    sizeBytes: size || bytes.length,
    kind: inferFileKind_(name, mime),
    url: file.getUrl(),
    createdAt: now,
    notifiedAt: null
  };
  appendTripFileMeta(tripId, meta);
  return meta;
}

function trashTripFile(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {}
}
