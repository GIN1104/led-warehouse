# Render Free — временный API host

Мост, пока не поднят Oracle Always Free VM. Cold start / sleep **допустимы**.

| | |
|--|--|
| Blueprint | [`render.yaml`](../../render.yaml) в корне repo |
| Образ | тот же [`Dockerfile`](../../Dockerfile), что Fly/Oracle |
| Health | `GET /api/v1/health/` |
| CORS Pages | `https://gin1104.github.io` (код) |
| БД | Turso `ledvision` (`TURSO_*` в Render Environment) |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS` (опционально) |

**Полный RU runbook (клики, Pages Variable, откат на Oracle):** Project store  
`docs/render-free-api.md` (координатор / Context).

Кратко в repo: [`docs/render-free-api.md`](../../docs/render-free-api.md).

## Секреты (не в git)

В Render Dashboard → Environment (или prompt Blueprint `sync: false`):

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `TELEGRAM_BOT_TOKEN` (опционально)
- `TELEGRAM_ADMIN_CHAT_IDS` (опционально)

## Проверка

```bash
curl -fsS "https://<service>.onrender.com/api/v1/health/"
# → ok, shared, tursoConfigured: true
```

**Не** меняйте GitHub Variable `NEXT_PUBLIC_ACCESS_API_BASE`, пока Евгений не подтвердит, что URL жив.

## Backup: Zeabur Free

Если Render потребует карту или заблокирует Free — Zeabur Free (тоже sleep, без карты). См. runbook.
