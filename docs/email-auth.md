# Авторизация по email (LED Warehouse)

Связано: [architecture-plan.md](./architecture-plan.md), сайт [Pages](https://GIN1104.github.io/led-warehouse/).

---

## Вердикт UX

**Заявка → одобрение → постоянный allowlist.**

1. `/login`: email → если уже допущен → сразу сессия; иначе `access_request` pending.
2. Админы allowlist на `/access-requests`: Одобрить / Отклонить / Отозвать / ручное добавление.
3. После approve повторно не спрашиваем, пока не revoke.

OTP mock (BFF `/api/v1/auth/otp` + Resend) — запасной путь в Docker; основной UX — заявка/allowlist.

---

## Политика allowlist

| Email | Правило |
|-------|---------|
| `starchenkogin@gmail.com` | **Permanent**: всегда разрешён, с любого устройства, **revoke запрещён** (hardcoded) |
| `ledvision2026.il@gmail.com` | В allowlist **по умолчанию** (seed migrate), **можно отозвать** |
| Все остальные | Заявка pending → approve/reject; после approve — постоянный допуск до revoke |

**Кто управляет** (approve / reject / revoke / ручное добавление): только  
`starchenkogin@gmail.com` и `ledvision2026.il@gmail.com`.  
Остальные approved-пользователи входят в приложение, но не меняют доступ.

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
- `allowed_emails`: email PK, approved_at, approved_by, revoked_at (NULL = активен)
- Permanent owner **не обязан** быть строкой в таблице — проверка hardcoded

---

## Ключи браузера

| Ключ | Назначение |
|------|------------|
| `led-warehouse:email-auth` | Сессия входа |
| `lw_user` | Кто работает |
| `led-warehouse:google-*` | Calendar OAuth |
| IndexedDB / SQLite | заявки + allowlist |

---

## Безопасность MVP

На Pages данные в локальной БД браузера — gate для команды. Permanent owner гарантирует вход владельца с любого устройства при свежей БД.
