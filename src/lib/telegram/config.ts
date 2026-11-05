/** Серверный токен бота. На Pages / в браузере всегда пусто — только mock/outbox. */
export function getTelegramBotToken(env: Record<string, string | undefined> = process.env): string {
  return (env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

export function hasTelegramBotToken(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(getTelegramBotToken(env));
}
