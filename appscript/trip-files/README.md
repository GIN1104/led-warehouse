# Trip Files — Google Apps Script (standalone)

Отдельное Web App «Файлы и ссылки к работе» (peer `view=files`): свой `/exec` URL, хранение в Drive + meta в Spreadsheet, позже стык со складом LED Warehouse.

**Контракт deep-link:** `tripId` (GAS) ↔ `orderId` (склад).  
Пример URL: `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?trip=<id>&view=files`

Складской маршрут `/files/?orderId=` **не ломаем** — это запасной мост; основной продукт Files — этот GAS.

---

## Live deploy (ledvision2026.il@gmail.com)

| | |
|--|--|
| **Exec base** | `https://script.google.com/macros/s/AKfycbxJpOOtsCZgRIHjesbWZtrOxkm4ctibx6L65TNHEmTT-dAlXQ6X5MecKyr1p6RU96Nm/exec` |
| **Пример** | […/exec?trip=test-deploy-1&view=files](https://script.google.com/macros/s/AKfycbxJpOOtsCZgRIHjesbWZtrOxkm4ctibx6L65TNHEmTT-dAlXQ6X5MecKyr1p6RU96Nm/exec?trip=test-deploy-1&view=files) |
| **Редактор** | `https://script.google.com/home/projects/<scriptId>/edit` (scriptId в локальном `.clasp.json`, не в git) |
| **Аккаунт** | `ledvision2026.il@gmail.com` |
| **Drive** | папка `LED Trip Files (ledvision2026)` создаётся при первом `getTripFilesBundle` / `setupTripFilesStorage` |

### Склад: `NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL`

В Pages Variables / `.env.local` (без query, без секретов в чат):

```bash
NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL=https://script.google.com/macros/s/AKfycbxJpOOtsCZgRIHjesbWZtrOxkm4ctibx6L65TNHEmTT-dAlXQ6X5MecKyr1p6RU96Nm/exec
```

Хелпер `tripFilesGasHref(orderId)` → `{exec}?trip={orderId}&view=files`.  
По умолчанию без env склад остаётся на `/files/?orderId=` (mock).

---

## Что внутри

| Файл | Роль |
|------|------|
| `Code.gs` | `doGet`, `getTripFilesBundle`, `saveAndSendTripFiles` |
| `Config.gs` | лимиты 10 / 8 МБ / 10 МБ, Script Properties, `setupTripFilesStorage` |
| `MetaStore.gs` | meta по `tripId` в Spreadsheet |
| `DriveStore.gs` | файлы в `{root}/trips/{tripId}/` |
| `Integration.gs` | stub webhook → LED Warehouse API; deep-link Back |
| `Index.html` | HtmlService UI (как peer) |
| `appsscript.json` | манифест Web App |
| `.clasp.json.example` | шаблон для clasp |

---

## Лимиты (как peer)

- ≤ **10** файлов на работу  
- каждый ≤ **8 МБ**  
- новые вместе ≤ **10 МБ**  
- ≤ **10** ссылок Sheets (одна на строку)  
- «Сохранить и отправить» = persist + notify **только новых** файлов/ссылок (удаления без notify)

---

## Deploy: clasp (предпочтительно)

Нужен Google-аккаунт с доступом к Drive целевой папки (**ledvision2026** или аккаунт, который шарит папку на ledvision2026).

```bash
cd appscript/trip-files
npm i -g @google/clasp   # или npx @google/clasp
clasp login              # браузер OAuth — в Cloud Agent: Try Live
cp .clasp.json.example .clasp.json
clasp create --title "LED Trip Files" --type webapp --rootDir .
# scriptId попадёт в .clasp.json — файл в .gitignore, не коммитить
clasp push
```

В редакторе [script.google.com](https://script.google.com):

1. **Run → `setupTripFilesStorage`** (разрешить OAuth Drive + Spreadsheets).  
   В логе/результате — `driveRootFolderId`, `metaSpreadsheetId`, ссылки.  
2. **Deploy → New deployment → Web app**  
   - Execute as: **Me**  
   - Who has access: **Anyone** (или ограничить org)  
3. Скопировать **Web app URL** → добавить `?trip=<id>&view=files`.

Повторный деплой исходников:

```bash
clasp push
# затем Deploy → Manage deployments → Edit → New version
```

---

## Deploy: вручную (без clasp)

1. [script.google.com](https://script.google.com) → **New project** → имя `LED Trip Files`.  
2. Включить файлы как в таблице выше (тип `.gs` / HTML).  
3. Project Settings → скопировать Script ID в локальный `.clasp.json` при желании.  
4. `setupTripFilesStorage` → Deploy Web app (как выше).

---

## Drive: папка и ledvision2026

После `setupTripFilesStorage`:

1. Открыть `driveUrl` из результата setup.  
2. **Поделиться** → добавить **`ledvision2026`** / `ledvision2026.il@gmail.com` как **Редактор**.  
3. (Опционально) деплоить скрипт из-под ledvision2026 — тогда Execute as Me = этот аккаунт.  
4. ID папки уже в Script Property `DRIVE_ROOT_FOLDER_ID` — **не** вставлять секреты в чат/git.

Структура:

```
LED Trip Files (ledvision2026)/
  LED Trip Files Meta   ← spreadsheet meta
  trips/
    {tripId}/
      схема.png
      …
```

---

## Script Properties (опционально)

| Ключ | Назначение |
|------|------------|
| `DRIVE_ROOT_FOLDER_ID` | корень Drive (ставит setup) |
| `META_SPREADSHEET_ID` | таблица meta (ставит setup) |
| `WEBHOOK_CALLBACK_URL` | POST JSON на LED Warehouse API после save |
| `WEBHOOK_SECRET` | заголовок `X-Trip-Files-Secret` |
| `WAREHOUSE_BASE_URL` | напр. `https://gin1104.github.io/led-warehouse` — кнопка «Назад» → `/files/?orderId=` |
| `DRIVE_ROOT_FOLDER_NAME` | имя папки при первом setup |

Секреты только в Script Properties / Cursor Secrets — **не в репозитории и не в чате**.

---

## Интеграция со складом (stubs)

1. **Deep link склад → GAS:**  
   `{GAS_EXEC}?trip={orderId}&view=files`  
   Хелпер в репо: `src/lib/trip-files-gas.ts` + env `NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL`.

2. **Back из GAS → склад:**  
   Script Property `WAREHOUSE_BASE_URL` → `/files/?orderId={tripId}`.

3. **Webhook:** после save POST на `WEBHOOK_CALLBACK_URL` (см. `Integration.gs`). Пока склад не слушает — оставить пустым.

4. **Складской mock `/files`:** без изменений поведения; позже `orderFilesApi` можно направить на remote/GAS.

---

## Локальная проверка без Google

Исходники готовы к paste/push. Live `/exec` требует аккаунт Google (OAuth clasp или ручной deploy). В Cloud Agent: **Try Live** для `clasp login`, если деплой делает агент.
