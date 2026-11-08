# Личные кабинеты и Telegram

Связано: [email-auth.md](./email-auth.md), сайт [Pages](https://GIN1104.github.io/led-warehouse/me/).

## Кабинет `/me` — как привязать Telegram

1. Откройте бота (созданного у [@BotFather](https://t.me/BotFather)) и отправьте `/start`.
2. Узнайте числовой **chat id** (`getUpdates` у Bot API или бот вроде @userinfobot).
3. В приложении откройте **Кабинет** (`/me`): сохраните `@username` и **chatId**.
4. Нажмите **Тест Telegram** — в журнале должна появиться запись (`mock` без токена на сервере, `sent` если `TELEGRAM_BOT_TOKEN` задан).

То же можно задать менеджеру в `/people` (право people.write).

## Уведомления

| kind | Когда |
|------|--------|
| `access_request` | Новая заявка на доступ |
| `shortage` | Первый open-alert нехватки по заказу |
| `transfer` | Перемещение отправлено / принято / отменено |
| `order_phase` | Смена фазы заказа (planning → mount → show → …) |
| `check_in` | Зарезервирован в схеме (ещё не wired) |

Получатели:

- пользователи с ролью `manager` или `admin` и заполненным `telegram_chat_id` (из `/me`);
- плюс chat id из `TELEGRAM_ADMIN_CHAT_IDS` на сервере (даже если в `/me` ещё пусто).

Без получателей — запись `skipped` в `telegram_outbox`.

## Fly / Docker — что задать на сервере

Только на API-хосте (например `led-warehouse-api.fly.dev`), **не** в GitHub Pages и не в `NEXT_PUBLIC_*`:

```bash
# Fly secrets (пример)
fly secrets set TELEGRAM_BOT_TOKEN=123456:ABC-DEF... TELEGRAM_ADMIN_CHAT_IDS=123456789 -a led-warehouse-api

# или .env.local / Docker
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_CHAT_IDS=123456789,987654321
NEXT_PUBLIC_SHARED=1
```

Проверка:

- `GET /api/v1/telegram/notify` → `{ configured: true }`
- действие (заявка / отправка перемещения / смена фазы) → запись в журнале `/me` и сообщение в Telegram при живом токене

Без токена / на Pages: UI + outbox mode `mock` (демо не ломается).

Access request multi-device: `NEXT_PUBLIC_SHARED=1` или `NEXT_PUBLIC_ACCESS_API_BASE=https://led-warehouse-api.fly.dev` + токен/admin chat ids (см. [email-auth.md](./email-auth.md)).
