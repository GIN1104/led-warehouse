/**
 * Telegram / warehouse stubs (peer: бот шлёт личные сообщения и broadcast).
 */

function telegramEnabled_() {
  return Boolean(getConfig().telegramBotToken);
}

function notifyTripCreatedStub_(trip) {
  if (!trip) return;
  Logger.log('[led-trips] notify new trip %s %s %s', trip.id, trip.date, trip.place);
  if (!telegramEnabled_()) return;
  // TODO: UrlFetchApp → api.telegram.org/bot…/sendMessage per assignee
}

function notifyTeamBroadcastStub_(text) {
  Logger.log('[led-trips] broadcast: %s', String(text).slice(0, 120));
  if (!telegramEnabled_()) return;
}

function notifyNewFilesStub_(tripId, fileIds, links) {
  Logger.log(
    '[led-trips] files notify trip=%s files=%s links=%s',
    tripId,
    (fileIds || []).join(','),
    (links || []).join(',')
  );
  if (!telegramEnabled_()) return;
}

function notifyWarehouseWebhook(payload) {
  var c = getConfig();
  if (!c.webhookCallbackUrl) return { ok: true, skipped: true };
  var headers = { 'Content-Type': 'application/json' };
  if (c.webhookSecret) headers['X-Trip-Files-Secret'] = c.webhookSecret;
  try {
    var body = Object.assign({}, payload, { orderId: payload.tripId });
    var resp = UrlFetchApp.fetch(c.webhookCallbackUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    return { ok: code >= 200 && code < 300, status: code };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/** Stub PDF месяца — peer «Сохранить месяц в PDF». */
function buildMonthPdfStub(month, year) {
  var trips = listTrips(month, year);
  var lines = [
    'Выезды · LED команда',
    'Месяц: ' + month + '/' + year,
    'Работ: ' + trips.length,
    ''
  ];
  trips.forEach(function (t) {
    lines.push(t.date + ' ' + t.time + ' · ' + t.title + ' · ' + t.place);
  });
  var blob = Utilities.newBlob(lines.join('\n'), 'text/plain', 'trips-' + year + '-' + month + '.txt');
  // Настоящий PDF — later (HtmlService PDF / Drive export). Сейчас текстовый stub в Drive root.
  var root = getRootFolder_();
  var file = root.createFile(blob);
  return { ok: true, stub: true, url: file.getUrl(), name: file.getName(), count: trips.length };
}
