# LED-склад vs Rentman и аналоги (AV / LED rental)

Краткий сравнительный обзор для приоритезации улучшений MVP. Источники: публичные сайты/доки вендоров (окт. 2026), [led-warehouse](https://github.com/GIN1104/led-warehouse), [Pages](https://GIN1104.github.io/led-warehouse/), docs MVP в этом store. Демо-аккаунты Rentman/Current не открывались — оценка по заявленным возможностям.

---

## 1. Позиционирование

| Продукт | Для кого | Суть |
|---------|----------|------|
| **[LED-склад](https://GIN1104.github.io/led-warehouse/)** | Внутренний LED-прокат (RU/HE) | Qty-склад + заказы + soft-нехватка → внешняя аренда; Excel/mapper; Calendar/Drive; роли; комплекты |
| **[Rentman](https://rentman.io/)** | AV / event / production | Проект: оборудование + crew + транспорт; timeline доступности; packing; QR/RFID; quotes/invoices; subrentals |
| **[Booqable](https://booqable.com/)** | Малый/онлайн-прокат (широко) | Заказы, availability, online booking, quotes/contracts/invoices; проще warehouse depth |
| **[Current RMS](https://www.current-rms.com/)** | AV / event / party rental | Inventory + barcodes/flight cases + proposals + labor calendar; Xero/QB |
| **[HireTrack NX](https://www.hiretracknx.com/)** | Pro AV / lighting / sound | Глубокий warehouse book: Prep → Dispatch → Return → Check-in; subhire; job book |

**Вывод по нише:** ближайшие ориентиры для LED-склада — **Rentman** и **Current RMS** (операции склада + прокат). Booqable — скорее e-commerce проката. HireTrack — эталон «тяжёлого» warehouse flow.

Наш MVP **не** конкурирует с полным ERP проката (цены, счета, crew). Сила — узкий контур «склад qty + заказ + ивритский Excel + внешняя аренда» под свой процесс.

---

## 2. Матрица возможностей (релевантные к нашему scope)

Легенда: ✅ есть · ◐ частично / заготовка · ❌ нет или вне продукта · ~ близко по смыслу

| Возможность | LED-склад | Rentman | Booqable | Current RMS | HireTrack |
|-------------|-----------|---------|----------|-------------|-----------|
| Qty-учёт (кабели/bulk) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Soft overbook + сигнал внешней аренды | ✅ ExternalHire | ✅ subrental / alternatives | ◐ overbook (Scale) | ✅ sub-rentals | ✅ subhire |
| Timeline / календарь занятости SKU | ◐ Calendar Google + даты заказов; **нет** Gantt парка | ✅ timeline | ✅ availability | ✅ availability screens | ✅ |
| Статусы: reserved / out / repair | ✅ + история | ✅ + custom | ✅ downtime | ✅ | ✅ multi-step |
| Комплекты / kits nested | ✅ иерархия в `/stock` | ✅ physical/virtual + accessories | ✅ bundles | ✅ containers/cases | ✅ packages |
| Packing list / prep→dispatch→return | ❌ (есть checked_out) | ✅ digital packing + scan | ◐ check-in/out | ✅ barcodes / cases | ✅ полный book |
| QR / barcode / scan | ◐ Scan Events API; UI ручной | ✅ QR/RFID app | ◐ add-on | ✅ barcodes | ✅ barcode/RFID |
| Импорт Excel под локальный mapper (HE/RU) | ✅ glossary + auto-SKU | ✅ import (общий) | ✅ | ✅ | ✅ |
| Quotes / invoices / e-sign | ❌ | ✅ | ✅ | ✅ | ✅ |
| Crew / транспорт | ❌ | ✅ | ❌ | ✅ labor calendar | ✅ |
| Роли view/edit склада | ✅ | ✅ | ✅ permissions | ✅ | ✅ |
| Мультисклад | ❌ (локации в плане) | ✅ | ◐ Scale | ✅ | ✅ |
| Серийники | ❌ (фаза 3) | ✅ | ◐ unique items | ✅ | ✅ |
| Онлайн-бронь клиентом | ❌ | ◐ plugin | ✅ ядро | ❌ | ❌ |
| Shared multi-user БД | ◐ Docker/SQLite/Turso; Pages = per-browser | ✅ cloud | ✅ cloud | ✅ cloud | ✅ |

---

## 3. Где мы уже сильнее / уникальны

1. **Mapper Excel HE→RU** с glossary, авто-`code`, иерархией групп — у вендоров есть import, но не наш bilingual event-list flow.
2. **Soft warning → ExternalHire** уже в доменной модели MVP — концептуально рядом с Rentman subrental / HireTrack subhire.
3. **Вложенные комплекты в сводке склада** (Laptop → №N → HDMI×2) без тяжёлого project UI.
4. **Частичный ремонт** (`needs_repair` / `in_repair`) + история статусов на qty-строках.
5. **Google Calendar + Drive имена `ДД-ММ-ГГГГ`** под операционный календарь команды.
6. **Approve email-доступа** без SaaS-биллинга; полный контроль данных.

---

## 4. Главные пробелы относительно Rentman / Current / HireTrack

| Пробел | Почему больно в LED-прокате |
|--------|------------------------------|
| Нет **timeline занятости по SKU** на пересечении заказов | Менеджер не видит «кабинеты P2.5 на 12–15» одним взглядом |
| Нет **packing / комплектация рейса** | Склад работает «вышло qty», а не чеклистом под событие |
| ExternalHire есть в модели, но **слабый operational UX** (альтернативы, статусы needed→ordered→received) | Rentman Shortage module закрывает это явно |
| Scan Events — API, **нет быстрой складской выдачи** (камера/HID/этикетка) | Пик выезда = ручной клик |
| Нет **PDF packing / лист на склад** | Crew и водители живут в мессенджерах |
| Quotes/invoices | Ок отложить, если продажи вне системы; иначе конкуренты закрывают цикл |
| Production path: **общий сервер**, не Pages-демо | Без Docker/Turso команда не видит один склад |

---

## 5. Предложения улучшить LED-склад

Приоритет относительно **нашего** MVP (склад + заказы), не «догнать весь Rentman».

### High

| # | Улучшение | Зачем | Ориентир |
|---|-----------|-------|----------|
| H1 | **Календарь / timeline занятости парка по SKU** (пересечение резервов, цвет shortage) | Закрыть главный gap vs Rentman/Current без crew/finance | Rentman equipment timeline; наша фаза 2 |
| H2 | **Packing list заказа**: чеклист qty по строкам → отметка «собрано / вышло»; печать/PDF | Ежедневный складской ритуал AV | Rentman packing; HireTrack Prep |
| H3 | **Дашборд нехваток + lifecycle ExternalHire** (needed → ordered → received → closed) + опционально «альтернативный SKU» | Soft warning должен заканчиваться действием, не только алертом | Rentman shortages / subrental |
| H4 | **Production shared DB по умолчанию** (Docker compose + Turso/инструкция «один склад для команды») | Pages остаётся демо; иначе сравнение с cloud SaaS бессмысленно | Current/Rentman cloud |

### Med

| # | Улучшение | Зачем | Ориентир |
|---|-----------|-------|----------|
| M1 | **Складской scan UX**: камера QR / HID → ScanEvent out/in, привязка к заказу | Ускорить checkout без ожидания рамки | Rentman/Current scan |
| M2 | **Accessories / auto-add к kit** (HDMI×2 при Laptop) при создании заказа из шаблона | Меньше забытых кабелей; у нас nested есть в stock, мало в order flow | Rentman accessories |
| M3 | **Возврат / check-in** как явный шаг (не только reverse qty) + флаг повреждения → repair | Замыкает цикл как у HireTrack Return/Check-in | HireTrack / Current |
| M4 | **Буфер между заказами** (N часов/сутки на ремонт/переупаковку) в availability | Меньше ложных «свободно завтра утром» | Booqable buffer / Rentman planning |
| M5 | **PDF packing slip + лист внешней аренды** (без полного invoicing) | Достаточно для склада/логистики | Rentman docs без биллинга |

### Low

| # | Улучшение | Зачем | Ориентир |
|---|-----------|-------|----------|
| L1 | Серийники точечно (дорогие кабинеты/контроллеры) | Фаза 3 плана; не блокирует qty MVP | Rentman serial |
| L2 | Quotes / клиентский portal | Только если продажи должны жить в системе | Booqable / Current |
| L3 | Crew / транспорт scheduling | Вне текущего scope; Google Calendar уже закрывает «когда выезд» | Rentman crew |
| L4 | Мультисклад / transfer | Когда появится второй объект | Rentman multi-warehouse |
| L5 | Учёт / Xero-QB | Не наш фокус | Current / Booqable |
| L6 | RFID / рамка | Уже заложено Scan Events; ждать железо | Rentman RFID |

---

## 6. Рекомендуемый фокус на ближайший срез

Не копировать Rentman целиком. Дожать операционный контур, где мы уже на полпути:

1. **H1 timeline занятости** поверх существующих заказов и soft-резервов.  
2. **H2 packing checklist** на карточке заказа.  
3. **H3 ExternalHire как рабочий модуль**, не только сигнал.  
4. **H4 один общий склад** для команды (Docker/Turso).  
5. Затем **M1 scan UX** и **M3 check-in**.

Quotes, crew, RFID, serial — сознательно позже, если пользователь не скажет иное.

---

## Решения 2026-10-28

Зафиксировано пользователем по этому отчёту.

### Делать

| ID | Что | Статус |
|----|-----|--------|
| **H1** | Timeline / календарь занятости парка по SKU | ✅ сделано (`/occupancy`) |
| **H3** | Дашборд нехваток + lifecycle ExternalHire | ✅ сделано (`/shortages`) |
| **H4** | Production shared DB (Docker/Turso); Pages = демо | ✅ docs + Docker/Turso path |

### H2 Packing — уточнение, не «сразу в код»

**Не то же самое**, что Excel из mapper → Drive.

| Поток | Роль сейчас |
|-------|-------------|
| **Mapper Excel → заказ** | Вход: список оборудования события (HE/RU) → строки заказа / `reserved`. Drive хранит исходник (`ДД-ММ-ГГГГ…`). См. [excel-sku-hierarchy](./excel-sku-hierarchy.md), [google-calendar-integration](./google-calendar-integration.md) |
| **H2 Packing (в отчёте)** | Складской чеклист по **уже созданному** заказу: собрано / вышло / PDF — как у Rentman packing, не замена Excel |

**Можно объединить / улучшить:** один источник строк заказа (импорт Excel) → тот же список = packing checklist на карточке заказа; опционально экспорт packing/PDF или обновлённого Excel обратно в Drive с тем же именованием. Отдельный «второй Excel только для packing» не нужен.

**Статус H2 / PDF:** PDF packing **не делаем** (список до выезда меняется). Чеклист kit-аксессуаров в заказе — через **M2** (`order_accessories`), не PDF.

### Сделано следом (окт 2026)

| ID | Что | Статус |
|----|-----|--------|
| **M2** | Auto-add kit accessories + чеклист/снятие в заказе | ✅ |
| **M3** | Check-in / возврат + флаг повреждения → repair | ✅ |
| Кабинеты | м² / кубики / кейсы (8 и 6) | ✅ |

### Отложить

| ID | Что | Статус |
|----|-----|--------|
| **M1** | Складской scan UX (камера QR / HID) | **отложить** |
| **PDF packing** | PDF slip | **не делать** |

---

## 7. Вопросы пользователю (если нужно уточнить приоритеты)

1. Нужны ли в системе **коммерческие документы** (quote / договор / счёт), или продажи остаются вне LED-склада?  
2. Склад в пик выезда работает по **чеклисту комплектации под заказ** или достаточно текущего «qty вышло»?  
3. Есть ли доступ к **демо Rentman или Current RMS** для сверки UX packing/timeline — или достаточно публичных материалов (как в этом отчёте)?

---

## Источники

- [Rentman](https://rentman.io/), [AV industry](https://rentman.io/industries/av-rental-and-production), [tracking](https://rentman.io/solutions/rental-equipment-tracking-software), [combinations](https://support.rentman.io/hc/en-us/articles/360013703140-Create-Equipment-Combinations)
- [Booqable](https://booqable.com/), [vs Rentman](https://booqable.com/comparisons/booqable-vs-rentman/)
- [Current RMS](https://www.current-rms.com/)
- [HireTrack NX features](https://www.hiretracknx.com/product-introduction/hiretrack-nx/hiretrack-nx-features/)
- Store: `mvp-decisions`, `equipment-inventory-workflow`, `people-roles-stock-edit`, `email-auth`, `google-calendar-integration`, `excel-sku-hierarchy`, `architecture-plan`
