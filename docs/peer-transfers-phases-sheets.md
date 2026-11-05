# Перемещения, фазы заказа, Sheets mirror

Связано: [production-shared-db.md](./production-shared-db.md), peer review в store docs.

## Shared DB vs Sheets

- **Pages** = IndexedDB demo.  
- **Production** = Docker SQLite / Turso (H4).  
- **Optional** `SHEETS_MIRROR_WEBHOOK_URL` — one-way JSON snapshot (`POST /api/v1/sheets/mirror`). Sheets **не** БД.

## `/transfers`

planned → in_transit (qty out) → received (qty in). Site locations `kind=site`. Roles with `transfer.write`: warehouse, driver, logistics, manager, admin.

## Order phases

`mount_date` / `show_start` / `show_end` / `demount_date` / `phase` on `rental_orders`.

## Roles

`driver` (Водитель); warehouse label default **Кладовщик**.
