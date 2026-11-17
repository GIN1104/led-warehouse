# Бэкап Turso/SQLite → Google Drive

Daily / on-demand dump общего ledger (файл на Fly + sync Turso) в папку Google Drive. **Restore UI** видит только `starchenkogin@gmail.com` (permanent owner). `ledvision2026.il@gmail.com` кнопку не видит.

**Cloudflare R2 не используем** (нужна банковская карта — отказ).

## Target

| Target | Когда пишет | Auth |
|--------|-------------|------|
| **Google Drive** | service account + folder id | JSON SA на сервере |
| **mock** | secrets нет | локально `data/backups-mock/drive/` |

## Почему не GIS browser token

В проекте уже есть GIS OAuth для **Calendar** (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) и stub Excel→Drive. Токен живёт в памяти вкладки и не подходит для Fly cron.

Для серверного бэкапа: **Google Cloud service account** + папка Drive, расшаренная на email SA. Scope: `https://www.googleapis.com/auth/drive`.

## Secrets (значения не в git)

### Google Drive (Fly / Cursor Secrets)

1. Google Cloud Console → Service Account → JSON key
2. На Drive аккаунта проекта создайте папку например `LED Warehouse / Backups`
3. Share папку на `client_email` service account (Editor)
4. Скопируйте folder id из URL (`…/folders/<ID>`)

```bash
fly secrets set \
  GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",…}' \
  GOOGLE_DRIVE_BACKUP_FOLDER_ID='…' \
  -a led-warehouse-api
```

### Cron без owner email

```bash
fly secrets set BACKUP_CRON_SECRET='длинная-случайная-строка' -a led-warehouse-api
```

## Имена и retention

- Файл: `YYYY-MM-DDTHH-mm-ledvision.dump` (UTC)
- Храним **14 дней** + **по одному dump на месяц** старше окна

## API (только Fly / Node host)

List/download/restore требуют `X-Actor-Email: starchenkogin@gmail.com`. Create также принимает `Authorization: Bearer $BACKUP_CRON_SECRET`.

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/v1/backups/` | список dump на Drive |
| POST | `/api/v1/backups/` | on-demand backup |
| GET | `/api/v1/backups/download/?key=` | скачать dump |
| POST | `/api/v1/backups/restore/` | `{ key, confirm: "CONFIRM" }` |

Restore: download → проверка SQLite header → `forceReplaceLedger` (bump revision) → push в Turso.

## UI

`/me` → блок «Бэкап и восстановление» **только** для owner:

- одна кнопка «Восстановить из Google Drive»

Список dump → выбор → ввод `CONFIRM` → restore.

## Scripts

```bat
REM Windows
scripts\backup-to-drive.cmd
```

```powershell
$env:BACKUP_API_URL = "https://led-warehouse-api.fly.dev"
$env:BACKUP_CRON_SECRET = "…"
.\scripts\backup-to-drive.ps1
```

```bash
# Fly cron / machine schedule (пример)
BACKUP_API_URL=http://127.0.0.1:8080 BACKUP_CRON_SECRET=… node scripts/backup-to-drive.mjs
```

## Ручной restore

1. Owner скачивает dump (`download` или из Drive UI)
2. Свежий бэкап текущего состояния
3. UI restore с `CONFIRM`

Health: `GET /api/v1/health/` → `{ backups: { drive } }` без утечки секретов.
