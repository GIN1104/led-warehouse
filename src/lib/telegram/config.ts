/** Серверный токен бота. На Pages / в браузере всегда пусто — только mock/outbox. */
export function getTelegramBotToken(env: Record<string, string | undefined> = process.env): string {
  return (env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

export function hasTelegramBotToken(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(getTelegramBotToken(env));
}

/**
 * Chat id админов для access-request notify (сервер).
 * `TELEGRAM_ADMIN_CHAT_IDS=111,222` — даже если в users ещё нет telegram_chat_id.
 */
export function getTelegramAdminChatIds(env: Record<string, string | undefined> = process.env): string[] {
  const raw = (env.TELEGRAM_ADMIN_CHAT_IDS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => /^-?\d{5,20}$/.test(part));
}
