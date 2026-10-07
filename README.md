# LED Warehouse (учёт складского LED-оборудования)

Система учёта для компании проката LED-экранов: склад по количеству, заказы проката, soft-резервы с сигналом внешней аренды, далее — scan-события, mapper, hours/trips.

Репозиторий: [`GIN1104/led-warehouse`](https://github.com/GIN1104/led-warehouse) (public, под GitHub Pages).

## Текущий статус

**Фаза 1 в коде и публикуется как статический сайт на GitHub Pages.** Веб-клиент на Next.js: номенклатура, локации, остатки по количеству, заказы проката с мягким резервом, сигналы нехватки и внешняя аренда, ручной скан.

База живёт в браузере (SQLite через sql.js, файл в IndexedDB). У каждого посетителя своя копия демо-данных; сервер склада и общий контур PostgreSQL появятся позже. Роли склада и менеджера переключаются в интерфейсе и запоминаются в `localStorage`.

Документы:

- [`docs/architecture-plan.md`](docs/architecture-plan.md) — архитектура, стек, API-границы, модель данных, roadmap (включая секцию «Решения MVP»)
- [`docs/mvp-decisions.md`](docs/mvp-decisions.md) — краткая фиксация пяти решений заказчика (2026-10-07)

## Решение по доставке

**Старт: Progressive Web App (Next.js + TypeScript)** — единый веб-клиент для склада (планшеты/телефоны) и менеджеров (десктоп).

## Scope MVP (фаза 1)

- Справочник номенклатуры и остатки **по количеству** (включая кабели/расходники)
- Локации склада без mapper
- Заказы проката с soft-резервами; при дефиците — alert + **«арендовать снаружи»** (`ExternalHire`)
- Ручной ввод движений + абстракция Scan Events (вендор рамки неизвестен)
- Роли: склад + менеджер; greenfield (без импорта Excel)

## Как будет развиваться

| Фаза | Содержание |
|------|------------|
| 0 | Research, архитектура, решения MVP (сейчас) |
| 1 | MVP: qty-склад + заказы проката, soft-резервы, ExternalHire |
| 2 | Рамка/гейт через generic adapter, Web Push, календарь занятости |
| 3 | Серийники (точечно), mapper, trips/hours |
| 4 | MDM, этикетки, при необходимости native |

## GitHub Pages

Сайт: [https://GIN1104.github.io/led-warehouse/](https://GIN1104.github.io/led-warehouse/)

Публикация идёт из GitHub Actions (`.github/workflows/pages.yml`): `npm test`, статическая сборка Next.js (`output: "export"`, `basePath` `/led-warehouse`) и деплой каталога `out/`. Источник Pages должен быть **GitHub Actions** (Settings → Pages → Build and deployment → Source).

На Pages нет сервера: вебхук рамки `ScanEvent` туда не принимается. Ручной скан пишет в базу этого браузера. Чтобы сбросить демо, очистите данные сайта в браузере (IndexedDB `led-warehouse`).

## Локальный запуск

```bash
npm install
npm test
npm run dev
```

Откройте http://localhost:3000. В боковой панели две роли: Мария (менеджер, заказы и аренда) и Алексей (склад, движения и скан). При первом открытии база наполняется демо-данными, включая нехватку кабинетов P2.5.

Сборка как на Pages:

```bash
NEXT_PUBLIC_BASE_PATH=/led-warehouse npm run build
```

Каталог `out/` нужно отдавать с префиксом `/led-warehouse/`.

## Клонирование (Windows / WSL)

```bash
gh repo clone GIN1104/led-warehouse
```
