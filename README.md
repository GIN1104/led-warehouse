# LED Warehouse (учёт складского LED-оборудования)

Система учёта для компании проката LED-экранов: склад по количеству, заказы проката, soft-резервы с сигналом внешней аренды, далее — scan-события, mapper, hours/trips.

Репозиторий: [`GIN1104/led-warehouse`](https://github.com/GIN1104/led-warehouse) (public, под GitHub Pages).

## Текущий статус

**Фаза 1 в коде.** Веб-клиент на Next.js: номенклатура, локации, остатки по количеству, заказы проката с мягким резервом, сигналы нехватки, внешняя аренда, ручной скан и приём заказа из mapper.

Интерфейс на русском, английском и иврите (иврит справа налево). Демо-роли — Алексей (склад) и Дмитрий (менеджер).

**Общий учёт** — один файл SQLite на сервере. Его видят все браузеры, которые открыли этот сервер. На GitHub Pages сервера нет, поэтому там у каждого браузера своя копия в IndexedDB. Общий файл живёт в Docker: каталог `data` монтируется в контейнер, и его можно скопировать на другой компьютер вместе с проектом.

Документы:

- [`docs/architecture-plan.md`](docs/architecture-plan.md) — архитектура, стек, API-границы, модель данных, roadmap (включая секцию «Решения MVP»)
- [`docs/mvp-decisions.md`](docs/mvp-decisions.md) — краткая фиксация пяти решений заказчика (2026-10-07)

## Решение по доставке

**Старт: Progressive Web App (Next.js + TypeScript)** — единый веб-клиент для склада (планшеты/телефоны) и менеджеров (десктоп).

## Scope MVP (фаза 1)

- Справочник номенклатуры и остатки **по количеству** (включая кабели/расходники)
- Локации склада без карты зала
- Заказы проката с soft-резервами; при дефиците — alert + **«арендовать снаружи»** (`ExternalHire`)
- Ручной ввод движений + абстракция Scan Events (вендор рамки неизвестен)
- Приём заказа из mapper (Excel или JSON) в ту же бронь
- Роли: склад + менеджер; greenfield

## Как будет развиваться

| Фаза | Содержание |
|------|------------|
| 0 | Research, архитектура, решения MVP (сейчас) |
| 1 | MVP: qty-склад + заказы проката, soft-резервы, ExternalHire |
| 2 | Рамка/гейт через generic adapter, Web Push, календарь занятости |
| 3 | Серийники (точечно), mapper, trips/hours |
| 4 | MDM, этикетки, при необходимости native |

## Где общий учёт

В `npm run dev` и в Docker база одна: `data/warehouse.sqlite` (в контейнере путь `/data/warehouse.sqlite`). Браузер держит копию и записывает её обратно; mapper и рамка пишут в тот же файл. Если файл изменился с другого места, экран подхватывает свежую копию.

GitHub Pages эту базу не хостит. Там остаётся демо «только этот браузер».

Docker стоит завести сразу, если учёт должен переезжать с компьютера на компьютер: образ собирает окружение, а переносится каталог `data`.

```bash
docker compose up --build
```

Откройте http://localhost:3000. На другом компьютере скопируйте проект вместе с `data/` и снова выполните `docker compose up`.

## GitHub Pages

Сайт: [https://GIN1104.github.io/led-warehouse/](https://GIN1104.github.io/led-warehouse/)

Публикация идёт из GitHub Actions (`.github/workflows/pages.yml`): тесты и статическая сборка `npm run build:pages`. Источник Pages — **GitHub Actions**. Это личная копия в браузере, не общий склад.

## Google Calendar (Pages)

Календарь: [https://GIN1104.github.io/led-warehouse/calendar/](https://GIN1104.github.io/led-warehouse/calendar/)

1. В [Google Cloud Console](https://console.cloud.google.com/) у Web Client ID должны быть:
   - **Authorized JavaScript origins:** `http://localhost:3000`, `https://gin1104.github.io`
   - **Authorized redirect URIs:** `http://localhost:3000/`, `http://localhost:3000/calendar/`, `https://gin1104.github.io/led-warehouse/`, `https://gin1104.github.io/led-warehouse/calendar/`
2. Откройте календарь под аккаунтом **`ledvision2026.il@gmail.com`** (тестовый пользователь OAuth).
3. Нажмите **Подключить Google** → разрешите доступ к Calendar.
4. Client Secret и пароль Google **не нужны**. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` вшивается в Pages через GitHub Actions.

Локально: скопируйте `.env.example` → `.env.local` и `npm run dev` (порт 3000 совпадает с origin в Console).


## Локальный запуск

```bash
npm install
npm test
npm run dev
```

Откройте http://localhost:3000. Это уже общий учёт на этом компьютере: файл `data/warehouse.sqlite`. В боковой панели Алексей (склад) и Дмитрий (менеджер). Язык переключается там же. При первом запуске база наполняется демо-данными, включая нехватку кабинетов P2.5.

## Заказ из mapper

Кнопка «Отправить заказ» в mapper вызывает общий сервер:

`POST /api/v1/integrations/mapper/orders`

Тело — JSON:

```json
{
  "externalId": "mapper-42",
  "customerName": "Тест проката",
  "startDate": "2026-10-08",
  "endDate": "2026-10-10",
  "lines": [{ "code": "CAB-P39", "qty": 30 }]
}
```

Либо файл CSV/Excel (лист с заголовком `code,qty,customer,start,end,external_id`). Пример: `examples/mapper-order.csv`. Повтор того же `externalId` бронь не удваивает. Неизвестный код SKU заказ не создаёт.

Строки считаются как мягкая бронь. Если своего парка не хватает, появляется нехватка и внешняя аренда.

Выход со склада — скан с направлением `out` (ручной или рамка):

`POST /api/v1/integrations/scan/events`

```json
{ "eventId": "gate-1", "source": "gate", "code": "CAB-P39", "direction": "out", "qty": 4, "meta": { "externalId": "mapper-42" } }
```

Остаток уменьшается, а у заказа растёт «вышло со склада». Если задан `SCAN_WEBHOOK_SECRET`, заголовок `X-Signature` должен быть `sha256=<hmac тела>`. Для Excel-загрузки с секретом — заголовок `X-Ledger-Secret`.

## Клонирование (Windows / WSL)

```bash
gh repo clone GIN1104/led-warehouse
```
