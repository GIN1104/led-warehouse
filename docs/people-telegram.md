# Личные кабинеты и Telegram

Связано: [email-auth.md](./email-auth.md), сайт [Pages](https://GIN1104.github.io/led-warehouse/me/).

## Кабинет

- `/me` — профиль текущего сотрудника: роль, email, телефон, Telegram username/chatId, журнал уведомлений.
- `/people` — справочник команды; менеджер/склад правят контакты и привязку Telegram у всех.

## Уведомления

| kind | Когда |
|------|--------|
| `access_request` | Новая заявка на доступ |
| `shortage` | Первый open-alert нехватки по заказу |
| `check_in` | Зарезервирован в схеме (ещё не wired) |

Получатели: пользователи с ролью `manager` или `admin` и заполненным `telegram_chat_id`. Без получателей — запись `skipped` в `telegram_outbox`.

## `TELEGRAM_BOT_TOKEN`

Только на сервере (Docker / `npm run dev`), **не** в GitHub Pages и не в `NEXT_PUBLIC_*`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
NEXT_PUBLIC_SHARED=1
```

- С токеном: `POST /api/v1/telegram/notify` → Bot API `sendMessage`, outbox mode `sent`.
- Без токена / на Pages: UI + outbox mode `mock` (демо не ломается).
- Access request multi-device: `NEXT_PUBLIC_SHARED=1` или `NEXT_PUBLIC_ACCESS_API_BASE` + `TELEGRAM_ADMIN_CHAT_IDS` (см. [email-auth.md](./email-auth.md)).

Токен — от [@BotFather](https://t.me/BotFather). Chat id — после `/start` боту (`getUpdates` или @userinfobot), сохранить на `/me` или в `TELEGRAM_ADMIN_CHAT_IDS`.
