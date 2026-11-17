# Бэкап Turso/SQLite → Google Drive

Daily / on-demand dump общего ledger в папку **Google Drive аккаунта LED Vision** (`ledvision2026.il@gmail.com` / тот Google-аккаунт, которым пользуетесь для LED Vision). **Не** personal Drive starchenkogin, если это другой аккаунт.

**Restore UI** видит только `starchenkogin@gmail.com` (permanent owner). `ledvision2026.il@gmail.com` кнопку restore не видит.

**Cloudflare R2 не используем** (нужна банковская карта — отказ).

## Target

| Target | Когда пишет | Auth |
|--------|-------------|------|
| **Google Drive (live)** | на API заданы оба secrets | service account JSON + folder id |
| **mock** | secrets нет (локальный dev / забыли env на Render) | `data/backups-mock/drive/` на диске процесса |

Проверка без утечки секретов: `GET /api/v1/health/` → `{ backups: { drive: true|false } }`.  
Сейчас на https://led-warehouse-api.onrender.com должно стать `drive: true` после шагов ниже.

## Почему не GIS browser token

В проекте уже есть GIS OAuth для **Calendar** (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) и stub Excel→Drive. Токен живёт в памяти вкладки и не подходит для server cron.

Для серверного бэкапа: **Google Cloud service account** + папка Drive, **расшаренная** на email SA. Scope: `https://www.googleapis.com/auth/drive`.

## Evgeny: клики в Google (без секретов в чат)

1. Войти в Google под **ledvision2026** (LED Vision), не под личным аккаунтом, если они разные.
2. [Google Cloud Console](https://console.cloud.google.com/) → проект LED Vision (или создать) → **IAM & Admin → Service Accounts** → Create service account → Create key → **JSON**.  
   Файл JSON храните в менеджере паролей / Render Environment / Cursor Secrets — **не** в чат и не в git.
3. Google Drive (тот же аккаунт) → создать папку например `LED Warehouse / Backups`.
4. На папке: **Share** → вставить `client_email` из JSON (вид `…@….iam.gserviceaccount.com`) → роль **Editor** → Send/Share.  
   Без этого шага API получит 403 даже с верным JSON.
5. Открыть папку → скопировать **folder id** из URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`.

Имена env (значения не сюда):

| Env | Что |
|-----|-----|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | весь JSON ключа SA одной строкой |
| `GOOGLE_DRIVE_BACKUP_FOLDER_ID` | id папки из URL |
| `BACKUP_CRON_SECRET` | длинная случайная строка для cron/script create |

Те же имена уже есть в **Cursor Secrets** окружения Project — скопируйте значения в Render (или заново из JSON-файла), **не** просите агента вставить их в чат.

## Secrets на Render (текущий API host)

Dashboard → сервис **`led-warehouse-api`** → **Environment** → Add:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_DRIVE_BACKUP_FOLDER_ID`
- `BACKUP_CRON_SECRET` (опционально, для `scripts/backup-to-drive`)

Blueprint [`render.yaml`](../render.yaml) объявляет эти ключи как `sync: false`. После Save Render перезапустит сервис.

Проверка:

```bash
curl -fsS "https://led-warehouse-api.onrender.com/api/v1/health/"
# ожидаем: "backups":{"drive":true}
```

На `/me` (owner) badge: **Google Drive настроено**, сообщение после бэкапа — «Бэкап записан на Google Drive.» без «или mock».

### Fly / Oracle (когда снова основной host)

```bash
fly secrets set \
  GOOGLE_SERVICE_ACCOUNT_JSON='…' \
  GOOGLE_DRIVE_BACKUP_FOLDER_ID='…' \
  BACKUP_CRON_SECRET='…' \
  -a led-warehouse-api
```

Те же имена env на Oracle VM / Docker.

## Имена и retention

- Файл: `YYYY-MM-DDTHH-mm-ledvision.dump` (UTC)
- Храним **14 дней** + **по одному dump на месяц** старше окна

## API (только Node host / shared API)

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

- live: «Бэкап записан на Google Drive.»
- mock (dev / нет secrets): «Бэкап записан локально (mock)…»

## Scripts

```bat
REM Windows
scripts\backup-to-drive.cmd
```

```powershell
$env:BACKUP_API_URL = "https://led-warehouse-api.onrender.com"
$env:BACKUP_CRON_SECRET = "…"
.\scripts\backup-to-drive.ps1
```

```bash
BACKUP_API_URL=https://led-warehouse-api.onrender.com BACKUP_CRON_SECRET=… node scripts/backup-to-drive.mjs
```

## Ручной restore

1. Owner скачивает dump (`download` или из Drive UI папки ledvision2026)
2. Свежий бэкап текущего состояния
3. UI restore с `CONFIRM`
