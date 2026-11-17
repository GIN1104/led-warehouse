# Бэкап Turso/SQLite → Cloudflare R2 + Google Drive

Daily / on-demand dump общего ledger (файл на Fly + sync Turso) в object storage. **Restore UI** видит только `starchenkogin@gmail.com` (permanent owner). `ledvision2026.il@gmail.com` кнопку не видит.

## Targets

| Target | Когда пишет | Auth |
|--------|-------------|------|
| **Cloudflare R2** | secrets R2 заданы | S3 API keys |
| **Google Drive** | service account + folder id | JSON SA на сервере |
| **mock** | secrets нет | локально `data/backups-mock/{r2,drive}/` |

Один on-demand/cron job пишет **во все настроенные** targets (или оба mock).

## Почему не GIS browser token для Drive

В проекте уже есть GIS OAuth для **Calendar** (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) и stub Excel→Drive. Токен живёт в памяти вкладки и не подходит для Fly cron.

Для серверного бэкапа: **Google Cloud service account** + папка Drive, расшаренная на email SA. Scope: `https://www.googleapis.com/auth/drive`.

## Secrets (значения не в git)

### Cloudflare R2 (Fly / Cursor Secrets)

Evgeny создаёт bucket в [Cloudflare R2](https://dash.cloudflare.com/) сам (агент аккаунт CF создать не может):

1. R2 → Create bucket (имя по умолчанию `ledvision-backups`)
2. Manage R2 API Tokens → Create API token (Object Read & Write на bucket)
3. Account ID из правой панели R2 overview

```bash
fly secrets set \
  R2_ACCOUNT_ID='…' \
  R2_ACCESS_KEY_ID='…' \
  R2_SECRET_ACCESS_KEY='…' \
  R2_BUCKET='ledvision-backups' \
  -a led-warehouse-api
# опционально: R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

### Google Drive

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

Все list/download/restore требуют `X-Actor-Email: starchenkogin@gmail.com` (как и access-decide). Create также принимает `Authorization: Bearer $BACKUP_CRON_SECRET`.

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/v1/backups/?target=r2\|drive\|all` | список |
| POST | `/api/v1/backups/` | on-demand backup |
| GET | `/api/v1/backups/download/?target=&key=` | скачать dump |
| POST | `/api/v1/backups/restore/` | `{ target, key, confirm: "CONFIRM" }` |

Restore: download → проверка SQLite header → `forceReplaceLedger` (bump revision) → push в Turso.

## UI

`/me` → блок «Бэкап и восстановление» **только** для owner:

- «Восстановить из Google Drive»
- «Восстановить из Cloudflare»

Список dump → выбор → ввод `CONFIRM` → restore.

## Scripts

```bat
REM Windows
scripts\backup-to-r2.cmd
```

```powershell
$env:BACKUP_API_URL = "https://led-warehouse-api.fly.dev"
$env:BACKUP_CRON_SECRET = "…"
.\scripts\backup-to-r2.ps1
```

```bash
# Fly cron / machine schedule (пример)
BACKUP_API_URL=http://127.0.0.1:8080 BACKUP_CRON_SECRET=… node scripts/backup-to-r2.mjs
```

## Ручной restore (если UI/API недоступны)

1. Owner скачивает dump (`download` или из R2/Drive консоли)
2. Остановить запись / сделать свежий бэкап текущего состояния
3. Через UI restore с `CONFIRM` **или** положить файл как новый ledger и bump revision (агентский API предпочтительнее)

Health: `GET /api/v1/health/` → `{ backups: { r2, drive } }` без утечки секретов.
