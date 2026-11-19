# Выезды · LED команда — полный клон peer

Полный shell peer Apps Script «Выезды команды» (не Rental Workspace): табы, лог, карточка, `view=files`, Telegram/PDF stubs.

**Контракт deep-link:** `tripId` (GAS) ↔ `orderId` (склад).  
`…/exec` · `…/exec?trip=<id>` · `…/exec?trip=<id>&view=files`

Узкий standalone только Files: [`../trip-files/`](../trip-files/). Этот проект — полный продукт.

---

## Live deploy (ledvision2026.il@gmail.com)

| | |
|--|--|
| **Exec base** | `https://script.google.com/macros/s/AKfycbwLRTdpiyIsTcpKTQOfhIUAcueqbv5I_uM1ajXQ64MUL0uTkQjQYYCJbA3USXfbY4xh/exec` |
| **Пример files** | […/exec?trip=6077020964374f30af488cf67d65f25e&view=files](https://script.google.com/macros/s/AKfycbwLRTdpiyIsTcpKTQOfhIUAcueqbv5I_uM1ajXQ64MUL0uTkQjQYYCJbA3USXfbY4xh/exec?trip=6077020964374f30af488cf67d65f25e&view=files) |
| **Доступ** | Web App **Anyone anonymous** (`ANYONE_ANONYMOUS`), execute as deployer |
| **Аккаунт** | `ledvision2026.il@gmail.com` |
| **Drive** | папка `LED Trips (ledvision2026)` + Spreadsheet `LED Trips Meta` |

### Склад

```bash
# полный клон (предпочтительно для trip+files)
NEXT_PUBLIC_LED_TRIPS_GAS_EXEC_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
# узкий Files-only (fallback)
NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL=…
```

Хелпер `tripFilesGasHref` сначала смотрит `LED_TRIPS`, затем `TRIP_FILES`, иначе склад `/files/?orderId=`.

---

## Табы (как peer)

| Таб | Поведение |
|-----|-----------|
| Новый выезд | дата/время/место/категория/схемы/сотрудники → Spreadsheet + Telegram stub |
| Лог работ | месяц/год/сотрудник · карточки Экран/Сцена/оба · PDF stub месяца |
| Часы работы | ввод часов + таблица |
| Заявки на выходные | период + статус |
| Сообщение команде | broadcast stub |
| Настройки | люди/роли; секреты только Script Properties |

Карточка выезда → **Файлы и ссылки** (overlay `view=files`, лимиты 10 / 8 МБ / 10 МБ).

---

## Файлы

| Файл | Роль |
|------|------|
| `Code.gs` | `doGet`, bootstrap, API, `saveAndSendTripFiles` |
| `Config.gs` | Script Properties, `setupLedTripsStorage` |
| `DataStore.gs` | Spreadsheet meta (trips/people/hours/weekend/files) |
| `DriveStore.gs` | `{root}/trips/{tripId}/` |
| `Notify.gs` | Telegram/PDF/webhook stubs |
| `Index.html` | SPA shell |
| `appsscript.json` | ANYONE_ANONYMOUS |

---

## Deploy: clasp

```bash
cd appscript/led-trips
npx @google/clasp login   # уже есть ~/.clasprc.json → ledvision2026
cp .clasp.json.example .clasp.json
npx @google/clasp create --title "LED Trips" --type webapp --rootDir .
npx @google/clasp push -f
# в редакторе: Run → setupLedTripsStorage (OAuth Drive+Sheets)
npx @google/clasp deploy-web-app -d "led-trips anyone anonymous" -l 1
# или Deployments в UI → Web app → Anyone
```

`.clasp.json` в `.gitignore` — не коммитить scriptId.

---

## Карта peer

См. store: `docs/peer-apps-script-full.md` + `media/peer-full-*.png`.  
На Try Live (2026-11-19) `starchenkogin` на peer `/exec` стабильно получает Drive «unable to open» (как раньше у trip-files при `ANYONE` + multi-account); полная оболочка и лог/files сняты 2026-11-17 под admin.
