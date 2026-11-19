/**
 * Хуки стыка со складом LED Warehouse (фаза 2).
 * Складской /files не ломаем — только опциональный callback + deep-link контракт.
 *
 * Контракт:
 *   GAS:   {execUrl}?trip={id}&view=files
 *   Склад: {WAREHOUSE_BASE_URL}/files/?orderId={id}
 *   tripId === orderId (один string id работы/заказа)
 */

/**
 * Deep-link URL склада для Back / Close (если задан WAREHOUSE_BASE_URL).
 * @param {string} tripId
 * @returns {string}
 */
function warehouseFilesDeepLink(tripId) {
  var base = getConfig().warehouseBaseUrl.replace(/\/$/, '');
  if (!base || !tripId) return '';
  return base + '/files/?orderId=' + encodeURIComponent(tripId);
}

/**
 * Stub: уведомить LED Warehouse API о saveAndSend.
 * Если WEBHOOK_CALLBACK_URL пуст — no-op (успех).
 *
 * Ожидаемый payload (черновик API):
 * {
 *   event: "trip-files.saveAndSend",
 *   tripId: string,          // == orderId
 *   orderId: string,         // дубль для склада
 *   equipmentList: string,
 *   files: [...],
 *   sheetLinks: [...],
 *   notifiedFileIds: string[],
 *   notifiedLinks: string[],
 *   updatedAt: number
 * }
 *
 * @param {Object} payload
 * @returns {{ ok: boolean, skipped?: boolean, status?: number, error?: string }}
 */
function notifyWarehouseWebhook(payload) {
  var c = getConfig();
  var url = c.webhookCallbackUrl;
  if (!url) {
    return { ok: true, skipped: true };
  }
  var headers = {
    'Content-Type': 'application/json'
  };
  if (c.webhookSecret) {
    headers['X-Trip-Files-Secret'] = c.webhookSecret;
  }
  try {
    var body = Object.assign({}, payload, {
      tripId: payload.tripId,
      orderId: payload.tripId
    });
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      return { ok: true, status: code };
    }
    return {
      ok: false,
      status: code,
      error: 'Webhook HTTP ' + code + ': ' + String(resp.getContentText()).slice(0, 200)
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Заглушка Telegram notify (peer: бот шлёт только новые файлы/ссылки).
 * Пока логируем; позже — тот же бот @LedVision2026Bot или через складской webhook.
 *
 * @param {string} tripId
 * @param {string[]} notifiedFileIds
 * @param {string[]} notifiedLinks
 */
function notifyStaffStub_(tripId, notifiedFileIds, notifiedLinks) {
  if (!notifiedFileIds.length && !notifiedLinks.length) return;
  Logger.log(
    '[trip-files] notify stub trip=%s files=%s links=%s',
    tripId,
    notifiedFileIds.join(','),
    notifiedLinks.join(',')
  );
}
