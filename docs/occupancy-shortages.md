# Занятость парка (H1) и нехватки (H3)

Страницы:

- [`/occupancy`](https://GIN1104.github.io/led-warehouse/occupancy/) — таймлайн soft-резервов по SKU  
- [`/shortages`](https://GIN1104.github.io/led-warehouse/shortages/) — дашборд нехваток + lifecycle ExternalHire  

## H1 — timeline занятости

- Берёт confirmed-заказы и остаток `stock_balances`.
- По каждому дню периода (по умолчанию 14 дней): кто занял qty раньше (`created_at`), сколько свободно, сколько shortage.
- Ячейка красная = нехватка в этот день; клик — список заказов на день.
- Не подменяет `/calendar` (там события/Google/задания); это SKU-centric Gantt.

Сервис: `src/lib/services/occupancy.ts` (`listSkuOccupancy`).

## H3 — shortages + ExternalHire

- Строки `rental_lines.qty_shortage > 0` + статус `external_hires` (`needed` → `ordered` → `received` → `closed`).
- Карточки счётчиков и кнопки смены статуса hire (право `hire.write`).
- **Альтернативы:** другие SKU той же `product_families` с `availableToday > 0` (без новой схемы).

Сервис: `src/lib/services/shortages.ts`. Очередь hire по-прежнему на [`/external-hires`](https://GIN1104.github.io/led-warehouse/external-hires/).

## Связанное

- Soft allocation: `src/lib/domain/allocation.ts`  
- Shared DB для команды: [`production-shared-db.md`](./production-shared-db.md)  
- Оборудование / kits: [`equipment-inventory-workflow.md`](./equipment-inventory-workflow.md)  
