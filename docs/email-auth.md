# Авторизация по email (LED Warehouse)

Связано: [architecture-plan.md](./architecture-plan.md), сайт [Pages](https://GIN1104.github.io/led-warehouse/).

---

## Вердикт UX

**Заявка → одобрение → allowlist (бессрочно или временно).**

1. `/login`: email → если уже допущен и срок не истёк → сразу сессия; иначе `access_request` pending.
2. Админы allowlist на `/access-requests`: Одобрить / Отклонить / Отозвать / ручное добавление; при approve/add — срок (**бессрочно** / **7** / **30** дней, дефолт UI **30**).
3. После approve повторно не спрашиваем, пока не revoke и пока не истёк `expires_at`.

OTP mock (BFF `/api/v1/auth/otp` + Resend) — запасной путь в Docker; основной UX — заявка/allowlist.

---

## Политика allowlist

| Email | Правило |
|-------|---------|
| `starchenkogin@gmail.com` | **Permanent**: всегда разрешён, с любого устройства, **revoke запрещён** (hardcoded) |
| `ledvision2026.il@gmail.com` | В allowlist **по умолчанию** (seed migrate), **можно отозвать**, без expiry |
| `nika123.z@mail.ru` | **Временный** seed: **30 дней** с первого migrate на устройстве; **не админ** (только вход); revoke разрешён |
| Все остальные | Заявка pending → approve/reject; срок 7/30 дней или бессрочно до revoke |

**Кто управляет** (approve / reject / revoke / ручное добавление): только  
`starchenkogin@gmail.com` и `ledvision2026.il@gmail.com`.  
Остальные approved-пользователи (в т.ч. временные) входят в приложение, но не меняют доступ.

**Срок:** колонка `allowed_emails.expires_at` (NULL = бессрочно). Дефолт временного доступа — **30 дней** (`DEFAULT_TEMP_ACCESS_DAYS`). Истёкший email не входит, пока админ не перевыпустит доступ.

Seed `alexey@led.local` / `dmitry@led.local` остаются в People для демо «кто работает», но **не** дают вход без approve.

---

## Что не ломаем

| Интеграция | Как остаётся |
|------------|--------------|
| Excel mapper / HE glossary | После логина, без cookie session |
| Google Calendar GIS | Токен `led-warehouse:google-*`; logout email не трогает |
| Mapper HTTP / ledger | Без cookie |

---

## Модель

- `access_requests`: email, status (`pending`|`approved`|`rejected`), created_at, decided_by?, decided_at?
- `allowed_emails`: email PK, approved_at, approved_by, revoked_at (NULL = не отозван), **expires_at** (NULL = бессрочно)
- Permanent owner **не обязан** быть строкой в таблице — проверка hardcoded
- Активен: `revoked_at IS NULL` и (`expires_at IS NULL` или `expires_at > now`)

---

## Ключи браузера

| Ключ | Назначение |
|------|------------|
| `led-warehouse:email-auth` | Сессия входа |
| `lw_user` | Кто работает |
| `led-warehouse:google-*` | Calendar OAuth |
| IndexedDB / SQLite | заявки + allowlist |

---

## Pages vs shared

| Среда | Заявки |
|-------|--------|
| **GitHub Pages** | IndexedDB **этого** браузера — заявка не видна админу на другом устройстве |
| **`NEXT_PUBLIC_SHARED=1` (Docker/Turso)** | Общий ledger — заявки шарятся |
| **`NEXT_PUBLIC_ACCESS_API_BASE`** | Клиент (в т.ч. Pages) шлёт заявки на ваш shared host (`/api/v1/access-requests`) |

На `/access-requests` — баннер, если shared/API выключены.  
Сервер: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_IDS` → notify админам при новой заявке.  
**Ручной add email** закрывает pending того же адреса (`approved`).

API: `GET/POST /api/v1/access-requests`, `POST /api/v1/access-requests/decide` `{ action: approve\|reject\|add }`.

## Безопасность MVP

На Pages данные в локальной БД браузера — gate для демо. Permanent owner гарантирует вход владельца с любого устройства при свежей БД. Для команды нужен shared backend.

