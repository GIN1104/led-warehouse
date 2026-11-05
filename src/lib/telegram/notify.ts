import { apiUrl, sharedLedger } from "@/lib/api";
import { newId, type Sql } from "@/lib/db/sql";
import { getTelegramBotToken } from "@/lib/telegram/config";
import { listUsers, type UserRow } from "@/lib/services/queries";

export type TelegramNotifyKind = "access_request" | "shortage" | "check_in";
export type TelegramOutboxMode = "sent" | "mock" | "skipped";

export type TelegramOutboxRow = {
  id: string;
  kind: TelegramNotifyKind;
  chatId: string | null;
  username: string | null;
  payload: string;
  mode: TelegramOutboxMode;
  createdAt: number;
  error: string | null;
};

type OutboxDbRow = {
  id: string;
  kind: TelegramNotifyKind;
  chat_id: string | null;
  username: string | null;
  payload: string;
  mode: TelegramOutboxMode;
  created_at: number;
  error: string | null;
};

function mapOutbox(row: OutboxDbRow): TelegramOutboxRow {
  return {
    id: row.id,
    kind: row.kind,
    chatId: row.chat_id,
    username: row.username,
    payload: row.payload,
    mode: row.mode,
    createdAt: row.created_at,
    error: row.error,
  };
}

/** Менеджеры/админы с привязанным chatId — получатели служебных уведомлений. */
export function listTelegramNotifyRecipients(db: Sql): UserRow[] {
  return listUsers(db).filter(
    (user) => (user.role === "manager" || user.role === "admin") && Boolean(user.telegramChatId),
  );
}

export function listTelegramOutbox(db: Sql, limit = 40): TelegramOutboxRow[] {
  return db
    .all<OutboxDbRow>(
      `SELECT id, kind, chat_id, username, payload, mode, created_at, error
       FROM telegram_outbox ORDER BY created_at DESC LIMIT ?`,
      [limit],
    )
    .map(mapOutbox);
}

function insertOutbox(
  db: Sql,
  input: {
    kind: TelegramNotifyKind;
    chatId: string | null;
    username: string | null;
    payload: string;
    mode: TelegramOutboxMode;
    error?: string | null;
    now?: number;
  },
): TelegramOutboxRow {
  const id = `tg_${newId().replace(/-/g, "").slice(0, 12)}`;
  const createdAt = input.now ?? Date.now();
  db.run(
    `INSERT INTO telegram_outbox (id, kind, chat_id, username, payload, mode, created_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.kind, input.chatId, input.username, input.payload, input.mode, createdAt, input.error ?? null],
  );
  return {
    id,
    kind: input.kind,
    chatId: input.chatId,
    username: input.username,
    payload: input.payload,
    mode: input.mode,
    createdAt,
    error: input.error ?? null,
  };
}

function updateOutboxMode(db: Sql, id: string, mode: TelegramOutboxMode, error: string | null = null): void {
  db.run(`UPDATE telegram_outbox SET mode = ?, error = ? WHERE id = ?`, [mode, error, id]);
}

/**
 * Ставит уведомление менеджерам с Telegram в outbox.
 * Без получателей — одна запись mode=skipped (аудит). Без токена/API — mode=mock.
 */
export function notifyManagersTelegram(
  db: Sql,
  input: { kind: TelegramNotifyKind; text: string; now?: number },
): TelegramOutboxRow[] {
  const text = input.text.trim();
  if (!text) return [];
  const recipients = listTelegramNotifyRecipients(db);
  if (recipients.length === 0) {
    return [
      insertOutbox(db, {
        kind: input.kind,
        chatId: null,
        username: null,
        payload: text,
        mode: "skipped",
        now: input.now,
      }),
    ];
  }
  return recipients.map((user) =>
    insertOutbox(db, {
      kind: input.kind,
      chatId: user.telegramChatId,
      username: user.telegramUsername,
      payload: text,
      mode: "mock",
      now: input.now,
    }),
  );
}

export function notifyAccessRequestTelegram(db: Sql, requestEmail: string, now = Date.now()): TelegramOutboxRow[] {
  return notifyManagersTelegram(db, {
    kind: "access_request",
    text: `LED Warehouse: заявка на доступ от ${requestEmail}`,
    now,
  });
}

export function notifyShortageTelegram(db: Sql, message: string, now = Date.now()): TelegramOutboxRow[] {
  return notifyManagersTelegram(db, {
    kind: "shortage",
    text: `LED Warehouse: ${message}`,
    now,
  });
}

/** Прямая отправка через Bot API (сервер / тесты). Без токена — mock. */
export async function sendTelegramMessage(opts: {
  chatId: string;
  text: string;
  token?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ mode: "sent" | "mock"; error?: string }> {
  const token = (opts.token ?? getTelegramBotToken()).trim();
  if (!token) return { mode: "mock" };
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: opts.chatId, text: opts.text }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { mode: "mock", error: `Telegram ${response.status}: ${body.slice(0, 200)}` };
    }
    return { mode: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "network";
    return { mode: "mock", error: message };
  }
}

/**
 * Пытается доставить mock-записи через BFF (Docker + TELEGRAM_BOT_TOKEN).
 * На Pages API нет — записи остаются mock (демо не ломается).
 */
export async function flushTelegramOutbox(
  db: Sql,
  opts?: { fetchImpl?: typeof fetch },
): Promise<{ attempted: number; sent: number }> {
  const pending = listTelegramOutbox(db, 100).filter((row) => row.mode === "mock" && row.chatId);
  if (pending.length === 0) return { attempted: 0, sent: 0 };
  if (!sharedLedger) return { attempted: 0, sent: 0 };

  const fetchImpl = opts?.fetchImpl ?? fetch;
  let sent = 0;
  for (const row of pending) {
    if (!row.chatId) continue;
    try {
      const response = await fetchImpl(apiUrl("/api/v1/telegram/notify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: row.chatId, text: row.payload, outboxId: row.id }),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { mode?: string; error?: string };
      if (data.mode === "sent") {
        updateOutboxMode(db, row.id, "sent", null);
        sent += 1;
      } else if (data.error) {
        updateOutboxMode(db, row.id, "mock", data.error);
      }
    } catch {
      // Pages / offline — оставляем mock
    }
  }
  return { attempted: pending.length, sent };
}

/** Тестовая отправка в свой chatId с /me. */
export async function sendTestTelegram(
  db: Sql,
  user: UserRow,
  opts?: { fetchImpl?: typeof fetch },
): Promise<TelegramOutboxRow> {
  if (!user.telegramChatId) {
    return insertOutbox(db, {
      kind: "access_request",
      chatId: null,
      username: user.telegramUsername,
      payload: "Тест Telegram: сначала укажите chatId",
      mode: "skipped",
      error: "no_chat_id",
    });
  }
  const row = insertOutbox(db, {
    kind: "access_request",
    chatId: user.telegramChatId,
    username: user.telegramUsername,
    payload: `LED Warehouse: тест уведомления для ${user.name}`,
    mode: "mock",
  });
  if (sharedLedger) {
    await flushTelegramOutbox(db, opts);
    const refreshed = listTelegramOutbox(db, 1)[0];
    return refreshed?.id === row.id ? refreshed : row;
  }
  return row;
}
